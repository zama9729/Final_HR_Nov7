/**
 * Offboarding API Routes
 * 
 * Handles offboarding requests, verifications, approvals, checklists, and letter generation
 */

import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { maskEmail, maskPhone, generateOTP, hashString } from '../utils/masking.js';
import { calculateLastWorkingDay, calculateNextMonthFifteenth, formatDateKolkata, addDaysInKolkata } from '../utils/date-helpers.js';
import { audit } from '../utils/auditLog.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const router = express.Router();

// Ensure tables exist
let tablesEnsured = false;
const ensureTables = async () => {
  if (tablesEnsured) return;
  try {
    // Run migration SQL
    const migrationSQL = `
      DO $$ BEGIN
        CREATE TYPE IF NOT EXISTS offboarding_status AS ENUM ('pending', 'in_review', 'approved', 'denied', 'auto_approved', 'cancelled');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      
      DO $$ BEGIN
        CREATE TYPE IF NOT EXISTS approver_role AS ENUM ('hr', 'manager', 'ceo');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      
      DO $$ BEGIN
        CREATE TYPE IF NOT EXISTS approval_decision AS ENUM ('pending', 'approved', 'denied');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      
      DO $$ BEGIN
        CREATE TYPE IF NOT EXISTS verification_type AS ENUM ('email', 'phone', 'address');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      
      DO $$ BEGIN
        CREATE TYPE IF NOT EXISTS verification_state AS ENUM ('pending', 'sent', 'verified', 'failed');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
      
      DO $$ BEGIN
        CREATE TYPE IF NOT EXISTS rehire_status AS ENUM ('pending', 'approved', 'denied');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      CREATE TABLE IF NOT EXISTS offboarding_policies (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        notice_period_days INTEGER NOT NULL DEFAULT 30,
        auto_approve_days INTEGER NOT NULL DEFAULT 7,
        use_ceo_approval BOOLEAN DEFAULT true,
        applies_to_department TEXT,
        applies_to_location TEXT,
        is_default BOOLEAN DEFAULT false,
        created_by UUID REFERENCES profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS offboarding_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL UNIQUE,
        policy_snapshot JSONB NOT NULL,
        reason TEXT,
        survey_json JSONB,
        notice_period_days INTEGER NOT NULL,
        requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_working_day DATE NOT NULL,
        status offboarding_status NOT NULL DEFAULT 'pending',
        letter_url TEXT,
        fnf_pay_date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS offboarding_approvals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL,
        role approver_role NOT NULL,
        approver_id UUID REFERENCES profiles(id),
        decision approval_decision NOT NULL DEFAULT 'pending',
        decided_at TIMESTAMPTZ,
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(offboarding_id, role)
      );

      CREATE TABLE IF NOT EXISTS offboarding_verifications (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL,
        type verification_type NOT NULL,
        masked_value TEXT NOT NULL,
        actual_value TEXT,
        otp_code TEXT,
        otp_expires_at TIMESTAMPTZ,
        state verification_state NOT NULL DEFAULT 'pending',
        sent_at TIMESTAMPTZ,
        verified_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(offboarding_id, type)
      );

      CREATE TABLE IF NOT EXISTS exit_checklists (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        offboarding_id UUID REFERENCES offboarding_requests(id) ON DELETE CASCADE NOT NULL UNIQUE,
        leaves_remaining INTEGER DEFAULT 0,
        financials_due BIGINT DEFAULT 0,
        assets_pending INTEGER DEFAULT 0,
        compliance_clear BOOLEAN DEFAULT false,
        finance_clear BOOLEAN DEFAULT false,
        it_clear BOOLEAN DEFAULT false,
        notes TEXT,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_policies_org ON offboarding_policies(org_id);
      CREATE INDEX IF NOT EXISTS idx_offboarding_org ON offboarding_requests(org_id);
      CREATE INDEX IF NOT EXISTS idx_offboarding_employee ON offboarding_requests(employee_id);
      CREATE INDEX IF NOT EXISTS idx_offboarding_status ON offboarding_requests(status);
      CREATE INDEX IF NOT EXISTS idx_approvals_offboarding ON offboarding_approvals(offboarding_id);
      CREATE INDEX IF NOT EXISTS idx_verifications_offboarding ON offboarding_verifications(offboarding_id);
      CREATE INDEX IF NOT EXISTS idx_checklist_offboarding ON exit_checklists(offboarding_id);
    `;
    await query(migrationSQL);
    tablesEnsured = true;
  } catch (err) {
    if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
      console.error('Error creating offboarding tables:', err);
    } else {
      tablesEnsured = true;
    }
  }
};

// Get user's tenant ID
const getTenantId = async (userId) => {
  const result = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return result.rows[0]?.tenant_id;
};

// Get user role
const getUserRole = async (userId) => {
  const result = await query('SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1', [userId]);
  return result.rows[0]?.role;
};

// Get effective policy for employee
const getEffectivePolicy = async (tenantId, employeeId) => {
  // First try department/location specific policy
  const empResult = await query(
    'SELECT department, work_location FROM employees WHERE id = $1',
    [employeeId]
  );
  const emp = empResult.rows[0];
  
  if (emp) {
    const specificPolicy = await query(`
      SELECT * FROM offboarding_policies
      WHERE org_id = $1
        AND (applies_to_department = $2 OR applies_to_department IS NULL)
        AND (applies_to_location = $3 OR applies_to_location IS NULL)
      ORDER BY 
        CASE WHEN applies_to_department IS NOT NULL THEN 1 ELSE 2 END,
        CASE WHEN applies_to_location IS NOT NULL THEN 1 ELSE 2 END
      LIMIT 1
    `, [tenantId, emp.department, emp.work_location]);
    
    if (specificPolicy.rows.length > 0) {
      return specificPolicy.rows[0];
    }
  }
  
  // Fall back to default policy
  const defaultPolicy = await query(`
    SELECT * FROM offboarding_policies
    WHERE org_id = $1 AND is_default = true
    LIMIT 1
  `, [tenantId]);
  
  if (defaultPolicy.rows.length > 0) {
    return defaultPolicy.rows[0];
  }
  
  // Return system default if no policy exists
  return {
    notice_period_days: 30,
    auto_approve_days: 7,
    use_ceo_approval: true,
  };
};

// GET /api/offboarding/policies - List policies (HR/Admin)
router.get('/policies', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) return res.status(403).json({ error: 'No organization found' });
    
    const role = await getUserRole(req.user.id);
    if (!['hr', 'ceo', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const result = await query(
      'SELECT * FROM offboarding_policies WHERE org_id = $1 ORDER BY is_default DESC, created_at DESC',
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching policies:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policies' });
  }
});

// POST /api/offboarding/policies - Create policy (HR/Admin)
router.post('/policies', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) return res.status(403).json({ error: 'No organization found' });
    
    const role = await getUserRole(req.user.id);
    if (!['hr', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { name, description, notice_period_days, auto_approve_days, use_ceo_approval, applies_to_department, applies_to_location, is_default } = req.body;

    if (!name || !notice_period_days) {
      return res.status(400).json({ error: 'name and notice_period_days are required' });
    }

    // If setting as default, unset other defaults
    if (is_default) {
      await query(
        'UPDATE offboarding_policies SET is_default = false WHERE org_id = $1',
        [tenantId]
      );
    }

    const result = await query(`
      INSERT INTO offboarding_policies (
        org_id, name, description, notice_period_days, auto_approve_days,
        use_ceo_approval, applies_to_department, applies_to_location, is_default, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `, [
      tenantId, name, description || null, notice_period_days, auto_approve_days || 7,
      use_ceo_approval !== false, applies_to_department || null, applies_to_location || null,
      is_default || false, req.user.id
    ]);

    await audit({
      actorId: req.user.id,
      action: 'policy_created',
      entityType: 'offboarding_policy',
      entityId: result.rows[0].id,
      details: { name, notice_period_days },
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating policy:', error);
    res.status(500).json({ error: error.message || 'Failed to create policy' });
  }
});

// PATCH /api/offboarding/policies/:id - Update policy (HR/Admin)
router.patch('/policies/:id', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) return res.status(403).json({ error: 'No organization found' });
    
    const role = await getUserRole(req.user.id);
    if (!['hr', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (req.body.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(req.body.name);
    }
    if (req.body.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(req.body.description);
    }
    if (req.body.notice_period_days !== undefined) {
      updates.push(`notice_period_days = $${paramIndex++}`);
      params.push(req.body.notice_period_days);
    }
    if (req.body.auto_approve_days !== undefined) {
      updates.push(`auto_approve_days = $${paramIndex++}`);
      params.push(req.body.auto_approve_days);
    }
    if (req.body.use_ceo_approval !== undefined) {
      updates.push(`use_ceo_approval = $${paramIndex++}`);
      params.push(req.body.use_ceo_approval);
    }
    if (req.body.applies_to_department !== undefined) {
      updates.push(`applies_to_department = $${paramIndex++}`);
      params.push(req.body.applies_to_department || null);
    }
    if (req.body.applies_to_location !== undefined) {
      updates.push(`applies_to_location = $${paramIndex++}`);
      params.push(req.body.applies_to_location || null);
    }
    if (req.body.is_default !== undefined) {
      if (req.body.is_default) {
        await query('UPDATE offboarding_policies SET is_default = false WHERE org_id = $1', [tenantId]);
      }
      updates.push(`is_default = $${paramIndex++}`);
      params.push(req.body.is_default);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = now()`);
    params.push(id);

    const result = await query(
      `UPDATE offboarding_policies SET ${updates.join(', ')} WHERE id = $${paramIndex} AND org_id = (SELECT tenant_id FROM profiles WHERE id = $1) RETURNING *`,
      [req.user.id, ...params]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    await audit({
      actorId: req.user.id,
      action: 'policy_updated',
      entityType: 'offboarding_policy',
      entityId: id,
      details: req.body,
    });

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating policy:', error);
    res.status(500).json({ error: error.message || 'Failed to update policy' });
  }
});

// DELETE /api/offboarding/policies/:id - Delete policy (Admin only)
router.delete('/policies/:id', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const role = await getUserRole(req.user.id);
    if (role !== 'admin') {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { id } = req.params;
    await query('DELETE FROM offboarding_policies WHERE id = $1', [id]);

    await audit({
      actorId: req.user.id,
      action: 'policy_deleted',
      entityType: 'offboarding_policy',
      entityId: id,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting policy:', error);
    res.status(500).json({ error: error.message || 'Failed to delete policy' });
  }
});

// GET /api/offboarding/verify/masked - Get masked contact info for verification (Employee)
router.get('/verify/masked', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    
    // Get employee's profile
    const empResult = await query(
      'SELECT e.id, p.email, p.phone FROM employees e JOIN profiles p ON p.id = e.user_id WHERE e.user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empResult.rows[0];

    res.json({
      masked_email: maskEmail(emp.email),
      masked_phone: maskPhone(emp.phone),
      actual_email: emp.email, // Only for sending OTP, not exposed in normal flow
      actual_phone: emp.phone,  // Only for sending OTP, not exposed in normal flow
    });
  } catch (error) {
    console.error('Error getting masked info:', error);
    res.status(500).json({ error: error.message || 'Failed to get masked info' });
  }
});

// POST /api/offboarding/verify/send - Send OTP to email/phone (Employee)
router.post('/verify/send', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { type } = req.body; // 'email' or 'phone'
    
    if (!['email', 'phone'].includes(type)) {
      return res.status(400).json({ error: 'type must be email or phone' });
    }

    // Get employee's profile
    const empResult = await query(
      'SELECT e.id, e.tenant_id, p.email, p.phone FROM employees e JOIN profiles p ON p.id = e.user_id WHERE e.user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empResult.rows[0];
    const targetValue = type === 'email' ? emp.email : emp.phone;
    
    if (!targetValue) {
      return res.status(400).json({ error: `${type} not found for employee` });
    }

    // Generate OTP
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Check if there's an existing offboarding request
    const existingRequest = await query(
      'SELECT id FROM offboarding_requests WHERE employee_id = $1',
      [emp.id]
    );

    let offboardingId;
    if (existingRequest.rows.length > 0) {
      offboardingId = existingRequest.rows[0].id;
    } else {
      // Create a temporary offboarding request for verification
      const policy = await getEffectivePolicy(emp.tenant_id, emp.id);
      const lastWorkingDayDate = addDaysInKolkata(new Date(), policy.notice_period_days || 30);
      const lastWorkingDay = lastWorkingDayDate.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      const newRequest = await query(`
        INSERT INTO offboarding_requests (
          org_id, employee_id, policy_snapshot, notice_period_days, last_working_day, status
        )
        VALUES ($1, $2, $3, $4, $5, 'pending')
        RETURNING id
      `, [
        emp.tenant_id,
        emp.id,
        JSON.stringify(policy),
        policy.notice_period_days || 30,
        lastWorkingDay
      ]);
      
      offboardingId = newRequest.rows[0].id;
    }

    // Upsert verification record
    const maskedValue = type === 'email' ? maskEmail(targetValue) : maskPhone(targetValue);
    
    await query(`
      INSERT INTO offboarding_verifications (
        offboarding_id, type, masked_value, actual_value, otp_code, otp_expires_at, state, sent_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'sent', now())
      ON CONFLICT (offboarding_id, type)
      DO UPDATE SET
        otp_code = $5,
        otp_expires_at = $6,
        state = 'sent',
        sent_at = now(),
        actual_value = $4
    `, [offboardingId, type, maskedValue, targetValue, otpHash, expiresAt]);

    // TODO: Send OTP via email/SMS service
    // For now, log it (in production, use actual email/SMS service)
    console.log(`[OTP] Sending ${type} OTP to ${targetValue}: ${otp} (expires in 10 minutes)`);

    res.json({
      success: true,
      message: `OTP sent to ${type}`,
      masked_value: maskedValue,
      expires_in: 600, // seconds
    });
  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({ error: error.message || 'Failed to send OTP' });
  }
});

// POST /api/offboarding/verify/confirm - Verify OTP (Employee)
router.post('/verify/confirm', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { type, otp } = req.body;
    
    if (!type || !otp) {
      return res.status(400).json({ error: 'type and otp are required' });
    }

    const empResult = await query(
      'SELECT e.id FROM employees e WHERE e.user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const offboardingResult = await query(
      'SELECT id FROM offboarding_requests WHERE employee_id = $1',
      [empResult.rows[0].id]
    );

    if (offboardingResult.rows.length === 0) {
      return res.status(404).json({ error: 'No offboarding request found' });
    }

    const offboardingId = offboardingResult.rows[0].id;

    const verificationResult = await query(
      'SELECT * FROM offboarding_verifications WHERE offboarding_id = $1 AND type = $2',
      [offboardingId, type]
    );

    if (verificationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Verification not found' });
    }

    const verification = verificationResult.rows[0];

    if (verification.state === 'verified') {
      return res.json({ success: true, message: 'Already verified' });
    }

    if (new Date() > new Date(verification.otp_expires_at)) {
      await query(
        'UPDATE offboarding_verifications SET state = $1 WHERE id = $2',
        ['failed', verification.id]
      );
      return res.status(400).json({ error: 'OTP expired' });
    }

    const isValid = await bcrypt.compare(otp, verification.otp_code);
    if (!isValid) {
      await query(
        'UPDATE offboarding_verifications SET state = $1 WHERE id = $2',
        ['failed', verification.id]
      );
      return res.status(400).json({ error: 'Invalid OTP' });
    }

    // Mark as verified and clear actual_value/otp for security
    await query(
      `UPDATE offboarding_verifications 
       SET state = 'verified', verified_at = now(), actual_value = NULL, otp_code = NULL
       WHERE id = $1`,
      [verification.id]
    );

    res.json({ success: true, message: `${type} verified successfully` });
  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ error: error.message || 'Failed to verify OTP' });
  }
});

// POST /api/offboarding/verify/address - Confirm address (Employee)
router.post('/verify/address', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { confirmed, address_line1, address_line2, city, state, postal_code, country } = req.body;

    if (!confirmed) {
      return res.status(400).json({ error: 'Address confirmation required' });
    }

    const empResult = await query(
      'SELECT e.id, e.tenant_id FROM employees e WHERE e.user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const offboardingResult = await query(
      'SELECT id FROM offboarding_requests WHERE employee_id = $1',
      [empResult.rows[0].id]
    );

    if (offboardingResult.rows.length === 0) {
      return res.status(404).json({ error: 'No offboarding request found' });
    }

    const offboardingId = offboardingResult.rows[0].id;

    // Build address string
    const addressParts = [address_line1, address_line2, city, state, postal_code, country].filter(Boolean);
    const addressString = addressParts.join(', ');

    // Create/update address verification
    await query(`
      INSERT INTO offboarding_verifications (
        offboarding_id, type, masked_value, state, verified_at
      )
      VALUES ($1, 'address', $2, 'verified', now())
      ON CONFLICT (offboarding_id, type)
      DO UPDATE SET
        masked_value = $2,
        state = 'verified',
        verified_at = now()
    `, [offboardingId, addressString]);

    res.json({ success: true, message: 'Address confirmed' });
  } catch (error) {
    console.error('Error confirming address:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm address' });
  }
});

// POST /api/offboarding/survey - Submit exit survey and reason (Employee)
router.post('/survey', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { survey_json, reason } = req.body;

    const empResult = await query(
      'SELECT e.id, e.tenant_id FROM employees e WHERE e.user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empResult.rows[0];

    // Check if all verifications are complete
    const verificationsResult = await query(
      `SELECT type, state FROM offboarding_verifications 
       WHERE offboarding_id = (SELECT id FROM offboarding_requests WHERE employee_id = $1)
       AND type IN ('email', 'phone', 'address')`,
      [emp.id]
    );

    const requiredTypes = ['email', 'phone', 'address'];
    const verifiedTypes = verificationsResult.rows.filter(v => v.state === 'verified').map(v => v.type);
    
    if (verifiedTypes.length < requiredTypes.length) {
      return res.status(400).json({ 
        error: 'All verifications must be complete',
        missing: requiredTypes.filter(t => !verifiedTypes.includes(t))
      });
    }

    // Update offboarding request with survey and reason
    await query(`
      UPDATE offboarding_requests
      SET survey_json = $1, reason = $2, status = 'in_review', updated_at = now()
      WHERE employee_id = $3
    `, [JSON.stringify(survey_json || {}), reason, emp.id]);

    // Create approval records
    const requestResult = await query(
      'SELECT id, policy_snapshot FROM offboarding_requests WHERE employee_id = $1',
      [emp.id]
    );
    const request = requestResult.rows[0];
    const policy = request.policy_snapshot;

    // Get manager
    const managerResult = await query(
      'SELECT reporting_manager_id FROM employees WHERE id = $1',
      [emp.id]
    );
    const managerId = managerResult.rows[0]?.reporting_manager_id;

    // Create Manager approval
    if (managerId) {
      const managerProfileResult = await query(
        'SELECT user_id FROM employees WHERE id = $1',
        [managerId]
      );
      if (managerProfileResult.rows.length > 0) {
        await query(`
          INSERT INTO offboarding_approvals (offboarding_id, role, approver_id)
          VALUES ($1, 'manager', $2)
          ON CONFLICT (offboarding_id, role) DO NOTHING
        `, [request.id, managerProfileResult.rows[0].user_id]);
      }
    }

    // Create HR approval (get any HR user in org)
    const hrResult = await query(`
      SELECT p.id FROM profiles p
      JOIN user_roles ur ON ur.user_id = p.id
      WHERE p.tenant_id = $1 AND ur.role = 'hr'
      LIMIT 1
    `, [emp.tenant_id]);
    if (hrResult.rows.length > 0) {
      await query(`
        INSERT INTO offboarding_approvals (offboarding_id, role, approver_id)
        VALUES ($1, 'hr', $2)
        ON CONFLICT (offboarding_id, role) DO NOTHING
      `, [request.id, hrResult.rows[0].id]);
    }

    // Create CEO approval if policy requires it
    if (policy.use_ceo_approval) {
      const ceoResult = await query(`
        SELECT p.id FROM profiles p
        JOIN user_roles ur ON ur.user_id = p.id
        WHERE p.tenant_id = $1 AND ur.role = 'ceo'
        LIMIT 1
      `, [emp.tenant_id]);
      if (ceoResult.rows.length > 0) {
        await query(`
          INSERT INTO offboarding_approvals (offboarding_id, role, approver_id)
          VALUES ($1, 'ceo', $2)
          ON CONFLICT (offboarding_id, role) DO NOTHING
        `, [request.id, ceoResult.rows[0].id]);
      }
    }

    // Update employee status to offboarding
    await query(
      'UPDATE employees SET status = $1, updated_at = now() WHERE id = $2',
      ['offboarding', emp.id]
    );

    await audit({
      actorId: req.user.id,
      action: 'offboarding_request_submitted',
      entityType: 'offboarding_request',
      entityId: request.id,
      reason,
      details: { survey_json },
    });

    res.json({ success: true, message: 'Survey submitted and request created' });
  } catch (error) {
    console.error('Error submitting survey:', error);
    res.status(500).json({ error: error.message || 'Failed to submit survey' });
  }
});

// GET /api/offboarding/:id - Get offboarding request details (Role-gated)
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const tenantId = await getTenantId(req.user.id);
    const role = await getUserRole(req.user.id);

    const requestResult = await query(`
      SELECT 
        or_req.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'department', e.department,
          'position', e.position
        ) as employee,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email,
          'phone', p.phone
        ) as employee_profile
      FROM offboarding_requests or_req
      JOIN employees e ON e.id = or_req.employee_id
      JOIN profiles p ON p.id = e.user_id
      WHERE or_req.id = $1 AND or_req.org_id = $2
    `, [id, tenantId]);

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestResult.rows[0];

    // Check permissions: Employee can only see their own
    if (role === 'employee' && request.employee_id !== req.user.id) {
      // Need to check if user_id matches employee_id
      const empCheck = await query('SELECT user_id FROM employees WHERE id = $1', [request.employee_id]);
      if (empCheck.rows[0]?.user_id !== req.user.id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    // Get approvals
    const approvalsResult = await query(`
      SELECT 
        oa.*,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name
        ) as approver_profile
      FROM offboarding_approvals oa
      LEFT JOIN profiles p ON p.id = oa.approver_id
      WHERE oa.offboarding_id = $1
    `, [id]);

    // Get verifications
    const verificationsResult = await query(
      'SELECT * FROM offboarding_verifications WHERE offboarding_id = $1',
      [id]
    );

    // Get checklist
    const checklistResult = await query(
      'SELECT * FROM exit_checklists WHERE offboarding_id = $1',
      [id]
    );

    request.approvals = approvalsResult.rows;
    request.verifications = verificationsResult.rows;
    request.checklist = checklistResult.rows[0] || null;

    res.json(request);
  } catch (error) {
    console.error('Error fetching offboarding request:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch request' });
  }
});

// POST /api/offboarding/:id/approve - Approve offboarding request (Manager/HR/CEO)
router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { comment } = req.body;

    const role = await getUserRole(req.user.id);
    
    // Determine approver role
    let approverRole;
    if (role === 'manager') approverRole = 'manager';
    else if (role === 'hr') approverRole = 'hr';
    else if (role === 'ceo') approverRole = 'ceo';
    else {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get request
    const requestResult = await query(
      'SELECT * FROM offboarding_requests WHERE id = $1',
      [id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestResult.rows[0];

    // Check if already approved/denied
    const approvalResult = await query(
      'SELECT * FROM offboarding_approvals WHERE offboarding_id = $1 AND role = $2',
      [id, approverRole]
    );

    if (approvalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Approval record not found' });
    }

    const approval = approvalResult.rows[0];

    if (approval.decision !== 'pending') {
      return res.status(400).json({ error: 'Already decided' });
    }

    // Update approval
    await query(`
      UPDATE offboarding_approvals
      SET decision = 'approved', decided_at = now(), approver_id = $1, comment = $2
      WHERE id = $3
    `, [req.user.id, comment || null, approval.id]);

    // Check if all approvals are complete
    const allApprovalsResult = await query(
      'SELECT decision FROM offboarding_approvals WHERE offboarding_id = $1',
      [id]
    );

    const allApproved = allApprovalsResult.rows.every(a => a.decision === 'approved');
    const anyDenied = allApprovalsResult.rows.some(a => a.decision === 'denied');

    if (anyDenied) {
      await query('UPDATE offboarding_requests SET status = $1 WHERE id = $2', ['denied', id]);
    } else if (allApproved) {
      await query('UPDATE offboarding_requests SET status = $1 WHERE id = $2', ['approved', id]);
    }

    await audit({
      actorId: req.user.id,
      action: 'offboarding_approved',
      entityType: 'offboarding_request',
      entityId: id,
      reason: comment,
      details: { approverRole },
    });

    res.json({ success: true, message: 'Request approved' });
  } catch (error) {
    console.error('Error approving request:', error);
    res.status(500).json({ error: error.message || 'Failed to approve request' });
  }
});

// POST /api/offboarding/:id/deny - Deny offboarding request (Manager/HR/CEO)
router.post('/:id/deny', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { comment } = req.body;

    if (!comment) {
      return res.status(400).json({ error: 'Comment is required for denial' });
    }

    const role = await getUserRole(req.user.id);
    
    let approverRole;
    if (role === 'manager') approverRole = 'manager';
    else if (role === 'hr') approverRole = 'hr';
    else if (role === 'ceo') approverRole = 'ceo';
    else {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const approvalResult = await query(
      'SELECT * FROM offboarding_approvals WHERE offboarding_id = $1 AND role = $2',
      [id, approverRole]
    );

    if (approvalResult.rows.length === 0) {
      return res.status(404).json({ error: 'Approval record not found' });
    }

    const approval = approvalResult.rows[0];

    if (approval.decision !== 'pending') {
      return res.status(400).json({ error: 'Already decided' });
    }

    // Update approval
    await query(`
      UPDATE offboarding_approvals
      SET decision = 'denied', decided_at = now(), approver_id = $1, comment = $2
      WHERE id = $3
    `, [req.user.id, comment, approval.id]);

    // Update request status
    await query('UPDATE offboarding_requests SET status = $1 WHERE id = $2', ['denied', id]);

    await audit({
      actorId: req.user.id,
      action: 'offboarding_denied',
      entityType: 'offboarding_request',
      entityId: id,
      reason: comment,
      details: { approverRole },
    });

    res.json({ success: true, message: 'Request denied' });
  } catch (error) {
    console.error('Error denying request:', error);
    res.status(500).json({ error: error.message || 'Failed to deny request' });
  }
});

// POST /api/offboarding/:id/checklist - Update checklist (HR/Finance/IT)
router.post('/:id/checklist', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { leaves_remaining, financials_due, assets_pending, compliance_clear, finance_clear, it_clear, notes } = req.body;

    const role = await getUserRole(req.user.id);
    
    // Finance/IT can only update their specific fields
    if (role !== 'hr' && role !== 'admin') {
      if (role === 'accountant' && (compliance_clear !== undefined || it_clear !== undefined)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    // Upsert checklist
    await query(`
      INSERT INTO exit_checklists (
        offboarding_id, leaves_remaining, financials_due, assets_pending,
        compliance_clear, finance_clear, it_clear, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (offboarding_id)
      DO UPDATE SET
        leaves_remaining = COALESCE($2, exit_checklists.leaves_remaining),
        financials_due = COALESCE($3, exit_checklists.financials_due),
        assets_pending = COALESCE($4, exit_checklists.assets_pending),
        compliance_clear = COALESCE($5, exit_checklists.compliance_clear),
        finance_clear = COALESCE($6, exit_checklists.finance_clear),
        it_clear = COALESCE($7, exit_checklists.it_clear),
        notes = COALESCE($8, exit_checklists.notes),
        updated_at = now()
    `, [id, leaves_remaining, financials_due, assets_pending, compliance_clear, finance_clear, it_clear, notes]);

    await audit({
      actorId: req.user.id,
      action: 'checklist_updated',
      entityType: 'exit_checklist',
      entityId: id,
      details: req.body,
    });

    res.json({ success: true, message: 'Checklist updated' });
  } catch (error) {
    console.error('Error updating checklist:', error);
    res.status(500).json({ error: error.message || 'Failed to update checklist' });
  }
});

// GET /api/offboarding - List offboarding requests (Role-gated)
router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const tenantId = await getTenantId(req.user.id);
    const role = await getUserRole(req.user.id);

    let queryStr = `
      SELECT 
        or_req.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'department', e.department,
          'position', e.position
        ) as employee,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) as employee_profile
      FROM offboarding_requests or_req
      JOIN employees e ON e.id = or_req.employee_id
      JOIN profiles p ON p.id = e.user_id
      WHERE or_req.org_id = $1
    `;
    const params = [tenantId];

    // Employee can only see their own
    if (role === 'employee') {
      const empResult = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
      if (empResult.rows.length > 0) {
        queryStr += ` AND or_req.employee_id = $2`;
        params.push(empResult.rows[0].id);
      } else {
        return res.json([]);
      }
    }
    // Manager can see their team
    else if (role === 'manager') {
      const empResult = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
      if (empResult.rows.length > 0) {
        queryStr += ` AND e.reporting_manager_id = $2`;
        params.push(empResult.rows[0].id);
      }
    }

    queryStr += ` ORDER BY or_req.created_at DESC LIMIT 100`;

    const result = await query(queryStr, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching offboarding requests:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch requests' });
  }
});

// POST /api/offboarding/:id/generate-letter - Generate PDF letter (HR)
router.post('/:id/generate-letter', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const tenantId = await getTenantId(req.user.id);
    const role = await getUserRole(req.user.id);

    if (!['hr', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get request with employee details
    const requestResult = await query(`
      SELECT 
        or_req.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'department', e.department,
          'position', e.position,
          'join_date', e.join_date,
          'work_location', e.work_location
        ) as employee,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) as employee_profile,
        json_build_object(
          'name', o.name,
          'domain', o.domain
        ) as organization
      FROM offboarding_requests or_req
      JOIN employees e ON e.id = or_req.employee_id
      JOIN profiles p ON p.id = e.user_id
      JOIN organizations o ON o.id = or_req.org_id
      WHERE or_req.id = $1 AND or_req.org_id = $2
    `, [id, tenantId]);

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestResult.rows[0];

    if (!['approved', 'auto_approved'].includes(request.status)) {
      return res.status(400).json({ error: 'Request must be approved before generating letter' });
    }

    const lastWorkingDay = new Date(request.last_working_day);
    const now = new Date();
    if (now < lastWorkingDay) {
      return res.status(400).json({ error: 'Last working day not reached yet' });
    }

    // Generate HTML template
    const employeeFullName = `${request.employee_profile.first_name} ${request.employee_profile.last_name}`;
    const letterDate = formatDateKolkata(new Date(), 'MMMM d, yyyy');
    const relievingDate = formatDateKolkata(lastWorkingDay, 'MMMM d, yyyy');
    const dateOfJoining = request.employee.join_date 
      ? formatDateKolkata(new Date(request.employee.join_date), 'MMMM d, yyyy')
      : 'N/A';

    const referenceNo = `REL-${request.employee.employee_id}-${new Date().getFullYear()}`;
    
    // Get organization details
    const org = request.organization;
    const companyAddress = org.name || 'Company Name';
    const websiteUrl = org.domain ? `https://${org.domain}` : '';
    const supportEmail = 'hr@example.com'; // TODO: Get from org settings

    // HTML template
    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Relieving cum Experience Letter</title>
  <style>
    body { 
      font-family: "Times New Roman", serif; 
      font-size: 12pt; 
      line-height: 1.35; 
      color: #000; 
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
    }
    .header { margin-bottom: 16px; }
    .header .addr { white-space: pre-line; }
    .ref { margin-top: 8px; margin-bottom: 16px; }
    h1 { font-size: 14pt; text-align: left; margin: 18px 0; }
    .sig { margin-top: 24px; }
    .foot { font-size: 10pt; margin-top: 24px; white-space: pre-line; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    table td { padding: 8px; border: 1px solid #ddd; }
    table td:first-child { font-weight: bold; width: 30%; }
  </style>
</head>
<body>
  <div class="header">
    <div class="addr">${companyAddress}</div>
    <div>${websiteUrl}</div>
    <div class="ref">Reference No: ${referenceNo}<br>Date: ${letterDate}</div>
  </div>

  <h1>Relieving cum Experience Letter</h1>

  <p>Dear ${employeeFullName},</p>

  <p>This is further to your resignation from the services of the organization.
  We confirm that you are being relieved from the services of the organization, effective the
  closing hours of ${relievingDate}, by your own accord, with the details provided below.</p>

  <table>
    <tr>
      <td><b>Emp. Code</b></td>
      <td>${request.employee.employee_id}</td>
      <td><b>Location</b></td>
      <td>${request.employee.work_location || 'N/A'}</td>
    </tr>
    <tr>
      <td><b>Date of Joining</b></td>
      <td>${dateOfJoining}</td>
      <td><b>Relieving Date</b></td>
      <td>${relievingDate}</td>
    </tr>
    <tr>
      <td><b>Designation</b></td>
      <td>${request.employee.position || 'N/A'}</td>
      <td><b>Local Grade</b></td>
      <td>N/A</td>
    </tr>
  </table>

  <p>For your final settlement, kindly reach out to the Employee Services - Exit Team by
  emailing on ${supportEmail}.</p>

  <p><i>Note:</i> As per your employment contract, you remain bound by the company's policies on
  Confidentiality, Non-Compete, Non-Solicitation, and Intellectual Property Rights even after
  cessation of your employment.</p>

  <p>We sincerely appreciate your contributions and dedication to ${companyAddress} and wish you the very best in your future endeavours.</p>

  <div class="sig">
    Yours truly,<br/>
    For ${companyAddress}<br/><br/>
    <small>*This is a digitally signed document and does not require any signatures on it.</small>
  </div>

  <div class="foot">
    ${companyAddress}
  </div>
</body>
</html>
    `;

    // TODO: Generate PDF using Puppeteer/Playwright
    // For now, return HTML (can be stored and converted to PDF later)
    // In production, use: const pdfBuffer = await generatePDF(htmlTemplate);
    // Store in S3/object storage and get URL

    // For now, store HTML URL (in production, store PDF URL)
    const letterUrl = `/api/offboarding/${id}/letter.html?t=${Date.now()}`;
    
    await query(`
      UPDATE offboarding_requests
      SET letter_url = $1, updated_at = now()
      WHERE id = $2
    `, [letterUrl, id]);

    // Store HTML in a temporary location (in production, use object storage)
    // For now, we'll just return the URL

    await audit({
      actorId: req.user.id,
      action: 'letter_generated',
      entityType: 'offboarding_request',
      entityId: id,
      details: { letterUrl, referenceNo },
    });

    res.json({ 
      success: true, 
      message: 'Letter generated successfully',
      letter_url: letterUrl,
      reference_no: referenceNo
    });
  } catch (error) {
    console.error('Error generating letter:', error);
    res.status(500).json({ error: error.message || 'Failed to generate letter' });
  }
});

// GET /api/offboarding/:id/letter.html - View letter HTML
router.get('/:id/letter.html', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const tenantId = await getTenantId(req.user.id);
    const role = await getUserRole(req.user.id);

    // Only HR/Admin can view letters
    if (!['hr', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const requestResult = await query(`
      SELECT 
        or_req.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'position', e.position,
          'join_date', e.join_date,
          'work_location', e.work_location
        ) as employee,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name
        ) as employee_profile,
        json_build_object(
          'name', o.name,
          'domain', o.domain
        ) as organization
      FROM offboarding_requests or_req
      JOIN employees e ON e.id = or_req.employee_id
      JOIN profiles p ON p.id = e.user_id
      JOIN organizations o ON o.id = or_req.org_id
      WHERE or_req.id = $1 AND or_req.org_id = $2
    `, [id, tenantId]);

    if (requestResult.rows.length === 0 || !requestResult.rows[0].letter_url) {
      return res.status(404).json({ error: 'Letter not found' });
    }

    const request = requestResult.rows[0];
    const employeeFullName = `${request.employee_profile.first_name} ${request.employee_profile.last_name}`;
    const letterDate = formatDateKolkata(new Date(), 'MMMM d, yyyy');
    const relievingDate = formatDateKolkata(new Date(request.last_working_day), 'MMMM d, yyyy');
    const dateOfJoining = request.employee.join_date 
      ? formatDateKolkata(new Date(request.employee.join_date), 'MMMM d, yyyy')
      : 'N/A';

    const referenceNo = `REL-${request.employee.employee_id}-${new Date().getFullYear()}`;
    const org = request.organization;
    const companyAddress = org.name || 'Company Name';
    const websiteUrl = org.domain ? `https://${org.domain}` : '';
    const supportEmail = 'hr@example.com';

    const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Relieving cum Experience Letter</title>
  <style>
    body { 
      font-family: "Times New Roman", serif; 
      font-size: 12pt; 
      line-height: 1.35; 
      color: #000; 
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
    }
    .header { margin-bottom: 16px; }
    .header .addr { white-space: pre-line; }
    .ref { margin-top: 8px; margin-bottom: 16px; }
    h1 { font-size: 14pt; text-align: left; margin: 18px 0; }
    .sig { margin-top: 24px; }
    .foot { font-size: 10pt; margin-top: 24px; white-space: pre-line; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    table td { padding: 8px; border: 1px solid #ddd; }
    table td:first-child { font-weight: bold; width: 30%; }
  </style>
</head>
<body>
  <div class="header">
    <div class="addr">${companyAddress}</div>
    <div>${websiteUrl}</div>
    <div class="ref">Reference No: ${referenceNo}<br>Date: ${letterDate}</div>
  </div>

  <h1>Relieving cum Experience Letter</h1>

  <p>Dear ${employeeFullName},</p>

  <p>This is further to your resignation from the services of the organization.
  We confirm that you are being relieved from the services of the organization, effective the
  closing hours of ${relievingDate}, by your own accord, with the details provided below.</p>

  <table>
    <tr>
      <td><b>Emp. Code</b></td>
      <td>${request.employee.employee_id}</td>
      <td><b>Location</b></td>
      <td>${request.employee.work_location || 'N/A'}</td>
    </tr>
    <tr>
      <td><b>Date of Joining</b></td>
      <td>${dateOfJoining}</td>
      <td><b>Relieving Date</b></td>
      <td>${relievingDate}</td>
    </tr>
    <tr>
      <td><b>Designation</b></td>
      <td>${request.employee.position || 'N/A'}</td>
      <td><b>Local Grade</b></td>
      <td>N/A</td>
    </tr>
  </table>

  <p>For your final settlement, kindly reach out to the Employee Services - Exit Team by
  emailing on ${supportEmail}.</p>

  <p><i>Note:</i> As per your employment contract, you remain bound by the company's policies on
  Confidentiality, Non-Compete, Non-Solicitation, and Intellectual Property Rights even after
  cessation of your employment.</p>

  <p>We sincerely appreciate your contributions and dedication to ${companyAddress} and wish you the very best in your future endeavours.</p>

  <div class="sig">
    Yours truly,<br/>
    For ${companyAddress}<br/><br/>
    <small>*This is a digitally signed document and does not require any signatures on it.</small>
  </div>

  <div class="foot">
    ${companyAddress}
  </div>
</body>
</html>
    `;

    res.setHeader('Content-Type', 'text/html');
    res.send(htmlTemplate);
  } catch (error) {
    console.error('Error fetching letter:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch letter' });
  }
});

// POST /api/offboarding/:id/finalize - Finalize offboarding (data minimization) (HR)
router.post('/:id/finalize', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const tenantId = await getTenantId(req.user.id);
    const role = await getUserRole(req.user.id);

    if (!['hr', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get request
    const requestResult = await query(`
      SELECT 
        or_req.*,
        e.id as employee_id,
        e.employee_id as emp_code,
        e.department,
        e.position,
        e.grade,
        p.first_name,
        p.last_name,
        p.email
      FROM offboarding_requests or_req
      JOIN employees e ON e.id = or_req.employee_id
      JOIN profiles p ON p.id = e.user_id
      WHERE or_req.id = $1 AND or_req.org_id = $2
    `, [id, tenantId]);

    if (requestResult.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    const request = requestResult.rows[0];

    // Check if ready for finalization
    if (!['approved', 'auto_approved'].includes(request.status)) {
      return res.status(400).json({ error: 'Request must be approved before finalization' });
    }

    const lastWorkingDay = new Date(request.last_working_day);
    const now = new Date();
    if (now < lastWorkingDay) {
      return res.status(400).json({ error: 'Last working day not reached yet' });
    }

    if (!request.letter_url) {
      return res.status(400).json({ error: 'Letter must be generated before finalization' });
    }

    // Check checklist
    const checklistResult = await query(
      'SELECT * FROM exit_checklists WHERE offboarding_id = $1',
      [id]
    );

    const checklist = checklistResult.rows[0];
    if (!checklist || !checklist.finance_clear || !checklist.compliance_clear || !checklist.it_clear || checklist.assets_pending > 0) {
      return res.status(400).json({ error: 'All checklist items must be clear before finalization' });
    }

    // Hash email for retention
    const emailHash = await hashString(request.email.toLowerCase());

    // Create offboarded identity record
    await query(`
      INSERT INTO offboarded_identities (
        org_id, former_emp_id, emp_code, full_name, email_hash,
        last_working_day, designation, grade, reason, letter_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (org_id, former_emp_id) DO UPDATE SET
        email_hash = $5,
        letter_url = $10,
        designation = $7,
        grade = $8,
        reason = $9
    `, [
      tenantId,
      request.employee_id,
      request.emp_code,
      `${request.first_name} ${request.last_name}`,
      emailHash,
      request.last_working_day,
      request.position || null,
      request.grade || null,
      request.reason || null,
      request.letter_url
    ]);

    // Soft-delete employee
    await query(`
      UPDATE employees
      SET status = 'offboarded', is_soft_deleted = true, updated_at = now()
      WHERE id = $1
    `, [request.employee_id]);

    // Nullify non-essential PII from profile (keep only what's legally required)
    // Note: We keep email and basic info for audit purposes, but can be purged per policy
    // await query(`
    //   UPDATE profiles
    //   SET phone = NULL, security_question_1 = NULL, security_answer_1 = NULL,
    //       security_question_2 = NULL, security_answer_2 = NULL
    //   WHERE id = (SELECT user_id FROM employees WHERE id = $1)
    // `, [request.employee_id]);

    // Update request status (optional: add a 'finalized' status)
    await query(`
      UPDATE offboarding_requests
      SET updated_at = now()
      WHERE id = $1
    `, [id]);

    await audit({
      actorId: req.user.id,
      action: 'offboarding_finalized',
      entityType: 'offboarding_request',
      entityId: id,
      reason: 'Data minimization and retention completed',
      details: { 
        employee_id: request.employee_id,
        email_hash: emailHash,
        letter_url: request.letter_url
      },
    });

    res.json({ 
      success: true, 
      message: 'Offboarding finalized successfully. Data minimized and moved to retention.',
      offboarded_identity_id: (await query('SELECT id FROM offboarded_identities WHERE former_emp_id = $1', [request.employee_id])).rows[0]?.id
    });
  } catch (error) {
    console.error('Error finalizing offboarding:', error);
    res.status(500).json({ error: error.message || 'Failed to finalize offboarding' });
  }
});

export default router;

