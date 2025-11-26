import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { audit } from '../utils/auditLog.js';
import {
  ACTIVE_PROBATION_STATUSES,
  validateLeaveWindow,
  recordProbationEvent,
} from '../services/probation.js';

const router = express.Router();

const getTenantId = async (userId) => {
  const { rows } = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return rows[0]?.tenant_id || null;
};

const getUserRoles = async (userId) => {
  const { rows } = await query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return rows.map((row) => row.role?.toLowerCase()).filter(Boolean);
};

const isHrRole = (roles = []) =>
  roles.some((role) => ['hr', 'hrbp', 'hradmin', 'admin', 'ceo', 'director'].includes(role));

const ensureHr = async (req, res, next) => {
  const roles = await getUserRoles(req.user.id);
  if (!isHrRole(roles)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  req.userRoles = roles;
  return next();
};

const fetchEmployee = async (employeeId) => {
  const { rows } = await query(
    'SELECT id, tenant_id, user_id, reporting_manager_id FROM employees WHERE id = $1',
    [employeeId]
  );
  return rows[0] || null;
};

router.post('/', authenticateToken, ensureHr, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const {
      employee_id,
      probation_start,
      probation_days,
      allowed_leave_days = 0,
      is_eligible_for_perks = true,
      requires_mid_probation_review = false,
      mid_review_date,
      auto_confirm_at_end = false,
      probation_notice_days = 0,
      notes,
    } = req.body;

    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id required' });
    }

    const employee = await fetchEmployee(employee_id);
    if (!employee || employee.tenant_id !== tenantId) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const startDate = probation_start ? new Date(probation_start) : new Date();
    const totalDays = Number(probation_days || 90);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + totalDays);

    const midReview = requires_mid_probation_review
      ? mid_review_date
        ? new Date(mid_review_date)
        : new Date(startDate.getTime() + (totalDays / 2) * 24 * 60 * 60 * 1000)
      : null;

    const result = await query(
      `
      INSERT INTO probations (
        tenant_id,
        employee_id,
        probation_start,
        probation_end,
        probation_days,
        allowed_leave_days,
        status,
        is_eligible_for_perks,
        requires_mid_probation_review,
        mid_review_date,
        auto_confirm_at_end,
        probation_notice_days,
        notes,
        created_by
      )
      VALUES ($1,$2,$3,$4,$5,$6,'in_probation',$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
      `,
      [
        tenantId,
        employee_id,
        startDate,
        endDate,
        totalDays,
        allowed_leave_days,
        is_eligible_for_perks,
        requires_mid_probation_review,
        midReview,
        auto_confirm_at_end,
        probation_notice_days,
        notes || null,
        req.user.id,
      ]
    );

    const probation = result.rows[0];

    await recordProbationEvent({
      probationId: probation.id,
      tenantId,
      actorId: req.user.id,
      eventType: 'probation.created',
      payload: { probation_days: totalDays },
    });

    if (requires_mid_probation_review && midReview) {
      await query(
        `INSERT INTO probation_tasks (
          probation_id,
          tenant_id,
          task_type,
          due_on,
          assignee_id,
          status,
          metadata
        ) VALUES ($1,$2,'mid_review',$3,$4,'pending',$5)`,
        [
          probation.id,
          tenantId,
          midReview,
          employee.reporting_manager_id || null,
          JSON.stringify({ required: true }),
        ]
      );
    }

    await query(
      `UPDATE employees
       SET probation_status = 'in_probation',
           probation_end = $1
       WHERE id = $2`,
      [endDate, employee_id]
    );

    await audit({
      actorId: req.user.id,
      action: 'probation_created',
      entityType: 'probation',
      entityId: probation.id,
      details: { employee_id, probation_days: totalDays },
    }).catch(() => {});

    res.status(201).json(probation);
  } catch (error) {
    console.error('Error creating probation:', error);
    res.status(500).json({ error: error.message || 'Failed to create probation' });
  }
});

router.get('/', authenticateToken, ensureHr, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const statusFilter = req.query.status;
    const params = [tenantId];
    let where = 'WHERE p.tenant_id = $1';

    if (statusFilter) {
      params.push(statusFilter);
      where += ` AND p.status = $${params.length}`;
    }

    const { rows } = await query(
      `
      SELECT 
        p.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'department', e.department,
          'profiles', json_build_object(
            'first_name', prof.first_name,
            'last_name', prof.last_name
          )
        ) as employee
      FROM probations p
      JOIN employees e ON e.id = p.employee_id
      JOIN profiles prof ON prof.id = e.user_id
      ${where}
      ORDER BY p.probation_end ASC
      LIMIT 200
      `,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error('Error listing probations:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch probations' });
  }
});

router.get('/employee/:employeeId', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { employeeId } = req.params;
    const employee = await fetchEmployee(employeeId);
    if (!employee || employee.tenant_id !== tenantId) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const roles = await getUserRoles(req.user.id);
    const myEmployee = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
    const isSelf = myEmployee.rows[0]?.id === employeeId;
    const isManager = roles.includes('manager') && employee.reporting_manager_id === myEmployee.rows[0]?.id;

    if (!isHrRole(roles) && !isSelf && !isManager) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { rows } = await query(
      `SELECT * FROM probations
       WHERE tenant_id = $1 AND employee_id = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [tenantId, employeeId]
    );

    res.json(rows[0] || null);
  } catch (error) {
    console.error('Error fetching probation:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch probation' });
  }
});

router.get('/validate', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { employee_id, from, to } = req.query;
    if (!employee_id || !from || !to) {
      return res.status(400).json({ error: 'employee_id, from and to are required' });
    }

    const result = await validateLeaveWindow({
      tenantId,
      employeeId: employee_id,
      fromDate: from,
      toDate: to,
    });

    res.json(result);
  } catch (error) {
    console.error('Error validating probation leave:', error);
    res.status(500).json({ error: error.message || 'Validation failed' });
  }
});

router.post('/:id/confirm', authenticateToken, ensureHr, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    const { id } = req.params;
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { rows } = await query(
      `SELECT * FROM probations WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Probation not found' });
    }

    const probation = rows[0];
    if (probation.tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const updated = await query(
      `UPDATE probations
       SET status = 'confirmed',
           updated_at = now(),
           completed_at = now()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    await query(
      `UPDATE employees
       SET probation_status = 'confirmed'
       WHERE id = $1`,
      [probation.employee_id]
    );

    await recordProbationEvent({
      probationId: id,
      tenantId,
      actorId: req.user.id,
      eventType: 'probation.confirmed',
      payload: {},
    });

    await audit({
      actorId: req.user.id,
      action: 'probation_confirmed',
      entityType: 'probation',
      entityId: id,
      details: { employee_id: probation.employee_id },
    }).catch(() => {});

    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error confirming probation:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm probation' });
  }
});

export default router;

