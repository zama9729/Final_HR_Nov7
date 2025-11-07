/**
 * Background Check Routes
 * 
 * Handles background check triggering and status tracking
 * Requires HR role to trigger, Director can view own dept
 */

import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireCapability, CAPABILITIES } from '../policy/authorize.js';
import { audit } from '../utils/auditLog.js';

const router = express.Router();

// Ensure background check tables exist
const ensureBackgroundCheckTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS background_checks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
      check_type TEXT NOT NULL DEFAULT 'standard' CHECK (check_type IN ('standard', 'enhanced', 'criminal', 'credit', 'employment')),
      initiated_by UUID REFERENCES profiles(id),
      initiated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      completed_at TIMESTAMPTZ,
      provider TEXT,
      reference_id TEXT,
      result JSONB DEFAULT '{}'::jsonb,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_background_checks_tenant ON background_checks(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_background_checks_employee ON background_checks(employee_id);
    CREATE INDEX IF NOT EXISTS idx_background_checks_status ON background_checks(status);
  `).catch(err => {
    if (!err.message.includes('already exists')) {
      console.error('Error creating background check tables:', err);
    }
  });
};

ensureBackgroundCheckTables();

// Get background checks (HR all, Director dept only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Ensure table exists before querying
    await ensureBackgroundCheckTables();
    
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get user role
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;

    let queryStr = `
      SELECT 
        bc.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'department', e.department
        ) as employee,
        json_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) as employee_profile,
        json_build_object(
          'id', p2.id,
          'first_name', p2.first_name,
          'last_name', p2.last_name
        ) as initiated_by_user
      FROM background_checks bc
      JOIN employees e ON e.id = bc.employee_id
      JOIN profiles p ON p.id = e.user_id
      LEFT JOIN profiles p2 ON p2.id = bc.initiated_by
      WHERE bc.tenant_id = $1
    `;
    const params = [tenantId];

    // Director can only see their department
    if (userRole === 'director') {
      const empResult = await query(
        'SELECT department FROM employees WHERE user_id = $1',
        [req.user.id]
      );
      const dept = empResult.rows[0]?.department;
      if (dept) {
        queryStr += ` AND e.department = $2`;
        params.push(dept);
      }
    }

    queryStr += ` ORDER BY bc.created_at DESC LIMIT 100`;

    const result = await query(queryStr, params);

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching background checks:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch background checks' });
  }
});

// Get background check status for employee
router.get('/employee/:employeeId', authenticateToken, async (req, res) => {
  try {
    // Ensure table exists before querying
    await ensureBackgroundCheckTables();
    
    const { employeeId } = req.params;

    // Check if user can access this employee
    const empCheck = await query(
      `SELECT e.id, e.user_id, e.department, e.tenant_id
       FROM employees e
       WHERE e.id = $1`,
      [employeeId]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empCheck.rows[0];

    // Owner can see their own, HR/Director can see based on role
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const userTenantId = tenantResult.rows[0]?.tenant_id;

    if (emp.user_id !== req.user.id && emp.tenant_id !== userTenantId) {
      // Check if user has HR/Director role
      const roleResult = await query(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [req.user.id]
      );
      const userRole = roleResult.rows[0]?.role;

      if (!['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Director can only see their department
      if (userRole === 'director') {
        const userEmpResult = await query(
          'SELECT department FROM employees WHERE user_id = $1',
          [req.user.id]
        );
        const userDept = userEmpResult.rows[0]?.department;
        if (userDept !== emp.department) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
      }
    }

    // Get background checks
    const checksResult = await query(
      `SELECT 
        bc.*,
        json_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name
        ) as initiated_by_user
       FROM background_checks bc
       LEFT JOIN profiles p ON p.id = bc.initiated_by
       WHERE bc.employee_id = $1
       ORDER BY bc.created_at DESC`,
      [employeeId]
    );

    res.json(checksResult.rows);
  } catch (error) {
    console.error('Error fetching background check status:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch background check status' });
  }
});

// Trigger background check (HR only)
router.post('/', authenticateToken, requireCapability(CAPABILITIES.BG_CHECK_TRIGGER), async (req, res) => {
  try {
    // Ensure table exists before querying
    await ensureBackgroundCheckTables();
    
    const { employee_id, check_type = 'standard', provider, notes } = req.body;

    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' });
    }

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Verify employee belongs to tenant
    const empResult = await query(
      'SELECT id, tenant_id FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empResult.rows[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Create background check
    const checkResult = await query(
      `INSERT INTO background_checks (
        tenant_id, employee_id, check_type, status,
        initiated_by, provider, notes
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [tenantId, employee_id, check_type, 'pending', req.user.id, provider, notes]
    );

    const check = checkResult.rows[0];

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'background_check_triggered',
      entityType: 'background_check',
      entityId: check.id,
      details: { employee_id, check_type, provider },
    });

    res.status(201).json(check);
  } catch (error) {
    console.error('Error triggering background check:', error);
    res.status(500).json({ error: error.message || 'Failed to trigger background check' });
  }
});

// Update background check status (HR only)
router.patch('/:id/status', authenticateToken, requireCapability(CAPABILITIES.BG_CHECK_TRIGGER), async (req, res) => {
  try {
    // Ensure table exists before querying
    await ensureBackgroundCheckTables();
    
    const { id } = req.params;
    const { status, result, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const validStatuses = ['pending', 'in_progress', 'completed', 'failed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Get background check
    const checkResult = await query(
      'SELECT * FROM background_checks WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Background check not found' });
    }

    const check = checkResult.rows[0];

    // Update status
    const updateFields = ['status = $1'];
    const params = [status, id];
    let paramIndex = 2;

    if (result) {
      updateFields.push(`result = $${paramIndex++}`);
      params.splice(paramIndex - 2, 0, JSON.stringify(result));
    }

    if (notes) {
      updateFields.push(`notes = $${paramIndex++}`);
      params.splice(paramIndex - 2, 0, notes);
    }

    if (status === 'completed' || status === 'failed') {
      updateFields.push(`completed_at = now()`);
    }

    updateFields.push(`updated_at = now()`);

    await query(
      `UPDATE background_checks 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex}`,
      params
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'background_check_status_updated',
      entityType: 'background_check',
      entityId: id,
      details: { status, result, notes },
      diff: { old_status: check.status, new_status: status },
    });

    res.json({ success: true, message: 'Background check status updated' });
  } catch (error) {
    console.error('Error updating background check status:', error);
    res.status(500).json({ error: error.message || 'Failed to update background check status' });
  }
});

export default router;

