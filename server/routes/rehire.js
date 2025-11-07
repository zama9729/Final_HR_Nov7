/**
 * Rehire API Routes
 * 
 * Handles rehire requests and approvals for offboarded employees
 */

import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { hashString } from '../utils/masking.js';
import { audit } from '../utils/auditLog.js';

const router = express.Router();

// Ensure tables exist
let tablesEnsured = false;
const ensureTables = async () => {
  if (tablesEnsured) return;
  try {
    await query(`
      DO $$ BEGIN
        CREATE TYPE IF NOT EXISTS rehire_status AS ENUM ('pending', 'approved', 'denied');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      CREATE TABLE IF NOT EXISTS rehire_requests (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
        former_emp_id UUID,
        offboarded_identity_id UUID,
        new_employee_id UUID REFERENCES employees(id),
        status rehire_status NOT NULL DEFAULT 'pending',
        created_by UUID REFERENCES profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS rehire_approvals (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        rehire_id UUID REFERENCES rehire_requests(id) ON DELETE CASCADE NOT NULL,
        role approver_role NOT NULL CHECK (role IN ('hr', 'manager')),
        approver_id UUID REFERENCES profiles(id),
        decision approval_decision NOT NULL DEFAULT 'pending',
        decided_at TIMESTAMPTZ,
        comment TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(rehire_id, role)
      );

      CREATE TABLE IF NOT EXISTS offboarded_identities (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        org_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
        former_emp_id UUID NOT NULL,
        emp_code TEXT NOT NULL,
        full_name TEXT NOT NULL,
        email_hash TEXT NOT NULL,
        last_working_day DATE NOT NULL,
        designation TEXT,
        grade TEXT,
        reason TEXT,
        letter_url TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE(org_id, former_emp_id)
      );

      CREATE INDEX IF NOT EXISTS idx_rehire_org ON rehire_requests(org_id);
      CREATE INDEX IF NOT EXISTS idx_rehire_status ON rehire_requests(status);
      CREATE INDEX IF NOT EXISTS idx_rehire_approvals_rehire ON rehire_approvals(rehire_id);
      CREATE INDEX IF NOT EXISTS idx_offboarded_org ON offboarded_identities(org_id);
      CREATE INDEX IF NOT EXISTS idx_offboarded_email_hash ON offboarded_identities(email_hash);
      CREATE INDEX IF NOT EXISTS idx_offboarded_emp_code ON offboarded_identities(emp_code);
    `);
    tablesEnsured = true;
  } catch (err) {
    if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
      console.error('Error creating rehire tables:', err);
    } else {
      tablesEnsured = true;
    }
  }
};

const getTenantId = async (userId) => {
  const result = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return result.rows[0]?.tenant_id;
};

const getUserRole = async (userId) => {
  const result = await query('SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1', [userId]);
  return result.rows[0]?.role;
};

// POST /api/rehire/search - Search offboarded identities (HR)
router.post('/search', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) return res.status(403).json({ error: 'No organization found' });

    const role = await getUserRole(req.user.id);
    if (!['hr', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { email, emp_code } = req.body;

    let queryStr = 'SELECT * FROM offboarded_identities WHERE org_id = $1';
    const params = [tenantId];
    let paramIndex = 2;

    if (email) {
      const emailHash = await hashString(email.toLowerCase());
      queryStr += ` AND email_hash = $${paramIndex++}`;
      params.push(emailHash);
    }

    if (emp_code) {
      queryStr += ` AND emp_code = $${paramIndex++}`;
      params.push(emp_code);
    }

    queryStr += ` ORDER BY created_at DESC LIMIT 20`;

    const result = await query(queryStr, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching offboarded identities:', error);
    res.status(500).json({ error: error.message || 'Failed to search' });
  }
});

// POST /api/rehire/request - Create rehire request (HR)
router.post('/request', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) return res.status(403).json({ error: 'No organization found' });

    const role = await getUserRole(req.user.id);
    if (!['hr', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { offboarded_identity_id, manager_id, department, position, email, first_name, last_name } = req.body;

    if (!offboarded_identity_id || !email || !first_name || !last_name) {
      return res.status(400).json({ error: 'offboarded_identity_id, email, first_name, and last_name are required' });
    }

    // Get offboarded identity
    const identityResult = await query(
      'SELECT * FROM offboarded_identities WHERE id = $1 AND org_id = $2',
      [offboarded_identity_id, tenantId]
    );

    if (identityResult.rows.length === 0) {
      return res.status(404).json({ error: 'Offboarded identity not found' });
    }

    const identity = identityResult.rows[0];

    // Create rehire request
    const rehireResult = await query(`
      INSERT INTO rehire_requests (
        org_id, offboarded_identity_id, former_emp_id, created_by, status
      )
      VALUES ($1, $2, $3, $4, 'pending')
      RETURNING *
    `, [tenantId, offboarded_identity_id, identity.former_emp_id, req.user.id]);

    const rehire = rehireResult.rows[0];

    // Create approval records
    // HR approval
    await query(`
      INSERT INTO rehire_approvals (rehire_id, role, approver_id)
      VALUES ($1, 'hr', $2)
      ON CONFLICT (rehire_id, role) DO NOTHING
    `, [rehire.id, req.user.id]);

    // Manager approval (if manager_id provided)
    if (manager_id) {
      const managerProfileResult = await query(
        'SELECT user_id FROM employees WHERE id = $1',
        [manager_id]
      );
      if (managerProfileResult.rows.length > 0) {
        await query(`
          INSERT INTO rehire_approvals (rehire_id, role, approver_id)
          VALUES ($1, 'manager', $2)
          ON CONFLICT (rehire_id, role) DO NOTHING
        `, [rehire.id, managerProfileResult.rows[0].user_id]);
      }
    }

    await audit({
      actorId: req.user.id,
      action: 'rehire_request_created',
      entityType: 'rehire_request',
      entityId: rehire.id,
      details: { offboarded_identity_id, former_emp_id: identity.former_emp_id },
    });

    res.status(201).json(rehire);
  } catch (error) {
    console.error('Error creating rehire request:', error);
    res.status(500).json({ error: error.message || 'Failed to create rehire request' });
  }
});

// GET /api/rehire - List rehire requests (Role-gated)
router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const tenantId = await getTenantId(req.user.id);
    const role = await getUserRole(req.user.id);

    let queryStr = `
      SELECT 
        rr.*,
        json_build_object(
          'id', oi.id,
          'emp_code', oi.emp_code,
          'full_name', oi.full_name,
          'designation', oi.designation,
          'last_working_day', oi.last_working_day
        ) as offboarded_identity,
        json_agg(
          json_build_object(
            'id', ra.id,
            'role', ra.role,
            'decision', ra.decision,
            'comment', ra.comment,
            'decided_at', ra.decided_at
          )
        ) as approvals
      FROM rehire_requests rr
      JOIN offboarded_identities oi ON oi.id = rr.offboarded_identity_id
      LEFT JOIN rehire_approvals ra ON ra.rehire_id = rr.id
      WHERE rr.org_id = $1
    `;
    const params = [tenantId];

    // Manager can only see requests where they are an approver
    if (role === 'manager') {
      const empResult = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
      if (empResult.rows.length > 0) {
        queryStr += ` AND rr.id IN (
          SELECT rehire_id FROM rehire_approvals WHERE approver_id = $2 AND role = 'manager'
        )`;
        params.push(req.user.id);
      }
    }

    queryStr += ` GROUP BY rr.id, oi.id ORDER BY rr.created_at DESC LIMIT 100`;

    const result = await query(queryStr, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching rehire requests:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch requests' });
  }
});

// GET /api/rehire/:id - Get rehire request details
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const tenantId = await getTenantId(req.user.id);

    const result = await query(`
      SELECT 
        rr.*,
        json_build_object(
          'id', oi.id,
          'emp_code', oi.emp_code,
          'full_name', oi.full_name,
          'designation', oi.designation,
          'last_working_day', oi.last_working_day,
          'letter_url', oi.letter_url
        ) as offboarded_identity,
        json_agg(
          json_build_object(
            'id', ra.id,
            'role', ra.role,
            'decision', ra.decision,
            'comment', ra.comment,
            'decided_at', ra.decided_at,
            'approver', json_build_object(
              'first_name', p.first_name,
              'last_name', p.last_name
            )
          )
        ) as approvals
      FROM rehire_requests rr
      JOIN offboarded_identities oi ON oi.id = rr.offboarded_identity_id
      LEFT JOIN rehire_approvals ra ON ra.rehire_id = rr.id
      LEFT JOIN profiles p ON p.id = ra.approver_id
      WHERE rr.id = $1 AND rr.org_id = $2
      GROUP BY rr.id, oi.id
    `, [id, tenantId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Request not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching rehire request:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch request' });
  }
});

// POST /api/rehire/:id/approve - Approve rehire (HR/Manager)
router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    await ensureTables();
    const { id } = req.params;
    const { comment } = req.body;

    const role = await getUserRole(req.user.id);
    
    let approverRole;
    if (role === 'hr') approverRole = 'hr';
    else if (role === 'manager') approverRole = 'manager';
    else {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const approvalResult = await query(
      'SELECT * FROM rehire_approvals WHERE rehire_id = $1 AND role = $2',
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
      UPDATE rehire_approvals
      SET decision = 'approved', decided_at = now(), approver_id = $1, comment = $2
      WHERE id = $3
    `, [req.user.id, comment || null, approval.id]);

    // Check if all approvals are complete
    const allApprovalsResult = await query(
      'SELECT decision FROM rehire_approvals WHERE rehire_id = $1',
      [id]
    );

    const allApproved = allApprovalsResult.rows.every(a => a.decision === 'approved');
    const anyDenied = allApprovalsResult.rows.some(a => a.decision === 'denied');

    if (anyDenied) {
      await query('UPDATE rehire_requests SET status = $1 WHERE id = $2', ['denied', id]);
    } else if (allApproved) {
      await query('UPDATE rehire_requests SET status = $1 WHERE id = $2', ['approved', id]);
      
      // TODO: Create/restore employee record here
      // This would typically involve:
      // 1. Creating a new profile and employee record
      // 2. Linking to the offboarded identity
      // 3. Setting status to 'rehired' or 'active'
      // 4. Assigning manager and department
    }

    await audit({
      actorId: req.user.id,
      action: 'rehire_approved',
      entityType: 'rehire_request',
      entityId: id,
      reason: comment,
      details: { approverRole },
    });

    res.json({ success: true, message: 'Rehire approved' });
  } catch (error) {
    console.error('Error approving rehire:', error);
    res.status(500).json({ error: error.message || 'Failed to approve rehire' });
  }
});

// POST /api/rehire/:id/deny - Deny rehire (HR/Manager)
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
    if (role === 'hr') approverRole = 'hr';
    else if (role === 'manager') approverRole = 'manager';
    else {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const approvalResult = await query(
      'SELECT * FROM rehire_approvals WHERE rehire_id = $1 AND role = $2',
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
      UPDATE rehire_approvals
      SET decision = 'denied', decided_at = now(), approver_id = $1, comment = $2
      WHERE id = $3
    `, [req.user.id, comment, approval.id]);

    // Update request status
    await query('UPDATE rehire_requests SET status = $1 WHERE id = $2', ['denied', id]);

    await audit({
      actorId: req.user.id,
      action: 'rehire_denied',
      entityType: 'rehire_request',
      entityId: id,
      reason: comment,
      details: { approverRole },
    });

    res.json({ success: true, message: 'Rehire denied' });
  } catch (error) {
    console.error('Error denying rehire:', error);
    res.status(500).json({ error: error.message || 'Failed to deny rehire' });
  }
});

export default router;

