/**
 * Termination/Rehire Routes
 * 
 * Handles employee termination and rehire workflows
 * HR can execute, Director can approve for their dept
 */

import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireCapability, CAPABILITIES } from '../policy/authorize.js';
import { audit } from '../utils/auditLog.js';

const router = express.Router();

// Ensure termination tables exist (call on first request)
let tablesEnsured = false;
const ensureTerminationTables = async () => {
  if (tablesEnsured) return;
  
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS employee_terminations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        termination_date DATE NOT NULL,
        termination_type TEXT NOT NULL DEFAULT 'voluntary' CHECK (termination_type IN ('voluntary', 'involuntary', 'end_of_contract', 'redundancy')),
        reason TEXT,
        initiated_by UUID REFERENCES profiles(id),
        approved_by UUID REFERENCES profiles(id),
        approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS employee_rehires (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
        original_employee_id UUID REFERENCES employees(id),
        new_employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        rehire_date DATE NOT NULL,
        previous_termination_id UUID REFERENCES employee_terminations(id),
        reason TEXT,
        initiated_by UUID REFERENCES profiles(id),
        approved_by UUID REFERENCES profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_terminations_tenant ON employee_terminations(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_terminations_employee ON employee_terminations(employee_id);
      CREATE INDEX IF NOT EXISTS idx_terminations_status ON employee_terminations(approval_status);
      CREATE INDEX IF NOT EXISTS idx_rehires_tenant ON employee_rehires(tenant_id);
    `);
    tablesEnsured = true;
  } catch (err) {
    if (!err.message.includes('already exists')) {
      console.error('Error creating termination tables:', err);
    } else {
      tablesEnsured = true;
    }
  }
};

// Get terminations (HR all, Director dept only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Ensure tables exist
    await ensureTerminationTables();

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
        et.*,
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
        CASE 
          WHEN p2.id IS NOT NULL THEN
            json_build_object(
              'id', p2.id,
              'first_name', p2.first_name,
              'last_name', p2.last_name
            )
          ELSE NULL
        END as initiated_by_user,
        CASE 
          WHEN p3.id IS NOT NULL THEN
            json_build_object(
              'id', p3.id,
              'first_name', p3.first_name,
              'last_name', p3.last_name
            )
          ELSE NULL
        END as approved_by_user
      FROM employee_terminations et
      JOIN employees e ON e.id = et.employee_id
      JOIN profiles p ON p.id = e.user_id
      LEFT JOIN profiles p2 ON p2.id = et.initiated_by
      LEFT JOIN profiles p3 ON p3.id = et.approved_by
      WHERE et.tenant_id = $1
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

    queryStr += ` ORDER BY et.created_at DESC LIMIT 100`;

    const result = await query(queryStr, params);

    res.json(result.rows || []);
  } catch (error) {
    console.error('Error fetching terminations:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch terminations' });
  }
});

// Get rehires
router.get('/rehires', authenticateToken, async (req, res) => {
  try {
    // Ensure tables exist
    await ensureTerminationTables();

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const rehiresResult = await query(
      `SELECT 
        er.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id
        ) as new_employee,
        CASE 
          WHEN p.id IS NOT NULL THEN
            json_build_object(
              'id', p.id,
              'first_name', p.first_name,
              'last_name', p.last_name
            )
          ELSE NULL
        END as initiated_by_user
       FROM employee_rehires er
       JOIN employees e ON e.id = er.new_employee_id
       LEFT JOIN profiles p ON p.id = er.initiated_by
       WHERE er.tenant_id = $1
       ORDER BY er.created_at DESC
       LIMIT 100`,
      [tenantId]
    );

    res.json(rehiresResult.rows || []);
  } catch (error) {
    console.error('Error fetching rehires:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch rehires' });
  }
});

// Initiate termination (HR)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Ensure tables exist
    await ensureTerminationTables();

    // Check if user has HR/Director/CEO/Admin role
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;

    if (!['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { employee_id, termination_date, termination_type, reason, notes } = req.body;

    if (!employee_id || !termination_date || !termination_type) {
      return res.status(400).json({ error: 'employee_id, termination_date, and termination_type are required' });
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
      'SELECT id, tenant_id, department FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empResult.rows[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Check if Director approval is needed (for their department)
    const empDept = empResult.rows[0].department;
    let needsApproval = false;
    let approvalStatus = 'approved';

    if (empDept) {
      const directorCheck = await query(
        `SELECT e.id 
         FROM employees e
         JOIN user_roles ur ON ur.user_id = e.user_id
         WHERE e.department = $1 AND ur.role = 'director' AND e.tenant_id = $2`,
        [empDept, tenantId]
      );
      if (directorCheck.rows.length > 0) {
        needsApproval = true;
        approvalStatus = 'pending';
      }
    }

    // Create termination record
    const termResult = await query(
      `INSERT INTO employee_terminations (
        tenant_id, employee_id, termination_date, termination_type,
        reason, notes, initiated_by, approval_status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [tenantId, employee_id, termination_date, termination_type, reason, notes, req.user.id, approvalStatus]
    );

    const termination = termResult.rows[0];

    // Update employee status to terminated
    await query(
      `UPDATE employees 
       SET status = 'terminated', updated_at = now()
       WHERE id = $1`,
      [employee_id]
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'employee_terminated',
      entityType: 'employee',
      entityId: employee_id,
      reason,
      details: { termination_date, termination_type, needs_approval: needsApproval },
    });

    res.status(201).json(termination);
  } catch (error) {
    console.error('Error initiating termination:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate termination' });
  }
});

// Approve termination (Director for their dept)
router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    // Ensure tables exist
    await ensureTerminationTables();

    const { id } = req.params;
    const { notes } = req.body;

    // Get termination
    const termResult = await query(
      `SELECT et.*, e.department
       FROM employee_terminations et
       JOIN employees e ON e.id = et.employee_id
       WHERE et.id = $1`,
      [id]
    );

    if (termResult.rows.length === 0) {
      return res.status(404).json({ error: 'Termination not found' });
    }

    const termination = termResult.rows[0];

    if (termination.approval_status !== 'pending') {
      return res.status(400).json({ error: 'Termination is not pending approval' });
    }

    // Verify director belongs to same department
    const userEmpResult = await query(
      'SELECT department FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (userEmpResult.rows.length === 0 || userEmpResult.rows[0].department !== termination.department) {
      return res.status(403).json({ error: 'Unauthorized - not your department' });
    }

    // Update approval
    await query(
      `UPDATE employee_terminations 
       SET approval_status = $1, approved_by = $2, notes = COALESCE($3, notes), updated_at = now()
       WHERE id = $4`,
      ['approved', req.user.id, notes, id]
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'termination_approved',
      entityType: 'employee_termination',
      entityId: id,
      reason: notes || 'Director approval',
      details: { termination_id: id },
    });

    res.json({ success: true, message: 'Termination approved' });
  } catch (error) {
    console.error('Error approving termination:', error);
    res.status(500).json({ error: error.message || 'Failed to approve termination' });
  }
});

// Update termination (HR/Admin)
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    await ensureTerminationTables();

    const { id } = req.params;
    const { termination_date, termination_type, reason, notes } = req.body;

    // Check permissions
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;

    if (!['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get termination
    const termResult = await query(
      'SELECT * FROM employee_terminations WHERE id = $1',
      [id]
    );

    if (termResult.rows.length === 0) {
      return res.status(404).json({ error: 'Termination not found' });
    }

    const termination = termResult.rows[0];

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (termination_date) {
      updates.push(`termination_date = $${paramIndex++}`);
      params.push(termination_date);
    }
    if (termination_type) {
      updates.push(`termination_type = $${paramIndex++}`);
      params.push(termination_type);
    }
    if (reason !== undefined) {
      updates.push(`reason = $${paramIndex++}`);
      params.push(reason);
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = now()`);
    params.push(id);

    await query(
      `UPDATE employee_terminations 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}`,
      params
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'termination_updated',
      entityType: 'employee_termination',
      entityId: id,
      details: { termination_date, termination_type, reason, notes },
    });

    res.json({ success: true, message: 'Termination updated' });
  } catch (error) {
    console.error('Error updating termination:', error);
    res.status(500).json({ error: error.message || 'Failed to update termination' });
  }
});

// Delete termination (HR/Admin)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    await ensureTerminationTables();

    const { id } = req.params;

    // Check permissions
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;

    if (!['hr', 'ceo', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get termination
    const termResult = await query(
      'SELECT * FROM employee_terminations WHERE id = $1',
      [id]
    );

    if (termResult.rows.length === 0) {
      return res.status(404).json({ error: 'Termination not found' });
    }

    const termination = termResult.rows[0];

    // Delete termination
    await query('DELETE FROM employee_terminations WHERE id = $1', [id]);

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'termination_deleted',
      entityType: 'employee_termination',
      entityId: id,
      details: { employee_id: termination.employee_id },
    });

    res.json({ success: true, message: 'Termination deleted' });
  } catch (error) {
    console.error('Error deleting termination:', error);
    res.status(500).json({ error: error.message || 'Failed to delete termination' });
  }
});

// Rehire employee
router.post('/rehire', authenticateToken, async (req, res) => {
  try {
    // Ensure tables exist
    await ensureTerminationTables();

    // Check if user has HR/Director/CEO/Admin role
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;

    if (!['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { original_employee_id, new_employee_id, rehire_date, reason, previous_termination_id } = req.body;

    if (!new_employee_id || !rehire_date) {
      return res.status(400).json({ error: 'new_employee_id and rehire_date are required' });
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
      [new_employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empResult.rows[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Create rehire record
    const rehireResult = await query(
      `INSERT INTO employee_rehires (
        tenant_id, original_employee_id, new_employee_id, rehire_date,
        previous_termination_id, reason, initiated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [tenantId, original_employee_id || null, new_employee_id, rehire_date, previous_termination_id || null, reason, req.user.id]
    );

    const rehire = rehireResult.rows[0];

    // Update employee status to active
    await query(
      `UPDATE employees 
       SET status = 'active', updated_at = now()
       WHERE id = $1`,
      [new_employee_id]
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'employee_rehired',
      entityType: 'employee',
      entityId: new_employee_id,
      reason,
      details: { original_employee_id, rehire_date },
    });

    res.status(201).json(rehire);
  } catch (error) {
    console.error('Error rehiring employee:', error);
    res.status(500).json({ error: error.message || 'Failed to rehire employee' });
  }
});

// Update rehire (HR/Admin)
router.patch('/rehires/:id', authenticateToken, async (req, res) => {
  try {
    await ensureTerminationTables();

    const { id } = req.params;
    const { rehire_date, reason } = req.body;

    // Check permissions
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;

    if (!['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get rehire
    const rehireResult = await query(
      'SELECT * FROM employee_rehires WHERE id = $1',
      [id]
    );

    if (rehireResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rehire not found' });
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (rehire_date) {
      updates.push(`rehire_date = $${paramIndex++}`);
      params.push(rehire_date);
    }
    if (reason !== undefined) {
      updates.push(`reason = $${paramIndex++}`);
      params.push(reason);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(id);

    await query(
      `UPDATE employee_rehires 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}`,
      params
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'rehire_updated',
      entityType: 'employee_rehire',
      entityId: id,
      details: { rehire_date, reason },
    });

    res.json({ success: true, message: 'Rehire updated' });
  } catch (error) {
    console.error('Error updating rehire:', error);
    res.status(500).json({ error: error.message || 'Failed to update rehire' });
  }
});

// Delete rehire (HR/Admin)
router.delete('/rehires/:id', authenticateToken, async (req, res) => {
  try {
    await ensureTerminationTables();

    const { id } = req.params;

    // Check permissions
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;

    if (!['hr', 'ceo', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get rehire
    const rehireResult = await query(
      'SELECT * FROM employee_rehires WHERE id = $1',
      [id]
    );

    if (rehireResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rehire not found' });
    }

    const rehire = rehireResult.rows[0];

    // Delete rehire
    await query('DELETE FROM employee_rehires WHERE id = $1', [id]);

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'rehire_deleted',
      entityType: 'employee_rehire',
      entityId: id,
      details: { new_employee_id: rehire.new_employee_id },
    });

    res.json({ success: true, message: 'Rehire deleted' });
  } catch (error) {
    console.error('Error deleting rehire:', error);
    res.status(500).json({ error: error.message || 'Failed to delete rehire' });
  }
});

export default router;

