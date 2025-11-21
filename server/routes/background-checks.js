import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { audit } from '../utils/auditLog.js';

const router = express.Router();
const FEATURE_ENABLED = process.env.TERMINATION_REHIRE_V1 !== 'false';

const getTenantId = async (userId) => {
  const { rows } = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return rows[0]?.tenant_id || null;
};

const getUserRoles = async (userId) => {
  const { rows } = await query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return rows.map((r) => r.role?.toLowerCase()).filter(Boolean);
};

router.use((req, res, next) => {
  if (!FEATURE_ENABLED) {
    return res.status(404).json({ error: 'termination_rehire_v1 feature flag disabled' });
  }
  next();
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { rows } = await query(
      `
      SELECT 
        bc.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'department', e.department
        ) AS employee,
        json_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) AS employee_profile
      FROM background_checks bc
      LEFT JOIN employees e ON e.id = bc.employee_id
      LEFT JOIN profiles p ON p.id = e.user_id
      WHERE bc.tenant_id = $1
      ORDER BY bc.created_at DESC
      LIMIT 200
      `,
      [tenantId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching background checks:', error);
    res.status(500).json({ error: 'Failed to fetch background checks' });
  }
});

// Get background check status for employee
router.get('/employee/:employeeId', authenticateToken, async (req, res) => {
  try {
    // Ensure table exists before querying
    await ensureBackgroundCheckInfrastructure();
    
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
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const roles = await getUserRoles(req.user.id);
    if (!roles.some((role) => ['hr', 'admin', 'orgadmin'].includes(role))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const {
      employee_id,
      candidate_id,
      type = 'prehire',
      vendor_id,
      notes,
      consent,
      scope,
    } = req.body;

    if (!employee_id && !candidate_id) {
      return res.status(400).json({ error: 'Provide employee_id or candidate_id' });
    }

    if (employee_id) {
      const { rows } = await query('SELECT tenant_id FROM employees WHERE id = $1', [employee_id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      if (rows[0].tenant_id !== tenantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const insertResult = await query(
      `
      INSERT INTO background_checks (
        tenant_id,
        candidate_id,
        employee_id,
        type,
        status,
        vendor_id,
        consent_snapshot,
        request_payload,
        initiated_by
      )
      VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8)
      RETURNING *
      `,
      [
        tenantId,
        candidate_id || null,
        employee_id || null,
        type,
        vendor_id || null,
        JSON.stringify(
          consent || {
            captured: new Date().toISOString(),
            scope: scope || {},
          }
        ),
        JSON.stringify({ scope: scope || {} }),
        req.user.id,
      ]
    );

    const check = insertResult.rows[0];

    await query(
      `
      INSERT INTO background_check_events (check_id, event_type, actor, note, payload)
      VALUES ($1,'initiated',$2,$3,$4)
      `,
      [check.id, req.user.id, notes || null, JSON.stringify({ scope })]
    );

    await audit({
      actorId: req.user.id,
      action: 'background_check_initiated',
      entityType: 'background_check',
      entityId: check.id,
      details: { type, vendor_id },
    });

    res.status(201).json(check);
  } catch (error) {
    console.error('Error creating background check:', error);
    res.status(500).json({ error: error.message || 'Failed to create background check' });
  }
});

// Update background check status (HR only)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, result_summary, notes } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const validStatuses = [
      'pending',
      'in_progress',
      'vendor_delay',
      'completed_green',
      'completed_amber',
      'completed_red',
      'cancelled',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const checkResult = await query(
      'SELECT * FROM background_checks WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Background check not found' });
    }

    const check = checkResult.rows[0];

    // Update status
    await query(
      `
      UPDATE background_checks
      SET status = $1,
          result_summary = COALESCE($2,result_summary),
          notes = COALESCE($3, notes),
          completed_at = CASE WHEN $1 LIKE 'completed%' THEN now() ELSE completed_at END,
          updated_at = now()
      WHERE id = $4
      `,
      [status, result_summary ? JSON.stringify(result_summary) : null, notes || null, id]
    );

    await query(
      `
      INSERT INTO background_check_events (check_id, event_type, actor, note, payload)
      VALUES ($1,'status_update',$2,$3,$4)
      `,
      [id, req.user.id, notes || null, JSON.stringify({ new_status: status, result_summary })]
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'background_check_status_updated',
      entityType: 'background_check',
      entityId: id,
      details: { status, result_summary, notes },
      diff: { old_status: check.status, new_status: status },
    });

    res.json({ success: true, message: 'Background check status updated' });
  } catch (error) {
    console.error('Error updating background check status:', error);
    res.status(500).json({ error: error.message || 'Failed to update background check status' });
  }
});

router.get('/:id/report', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const { rows } = await query(
      `
      SELECT * FROM background_checks
      WHERE id = $1 AND tenant_id = $2
      `,
      [req.params.id, tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Background check not found' });
    }
    const events = await query(
      `
      SELECT * FROM background_check_events
      WHERE check_id = $1
      ORDER BY created_at ASC
      `,
      [req.params.id]
    );
    res.json({ ...rows[0], events: events.rows });
  } catch (error) {
    console.error('Error fetching background check report:', error);
    res.status(500).json({ error: 'Failed to fetch report' });
  }
});

export default router;

