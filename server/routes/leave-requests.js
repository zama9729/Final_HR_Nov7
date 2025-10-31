import express from 'express';
import { query } from '../db/pool.js';
import { create_approval, apply_approval, next_approver } from '../approval_flow.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all leave requests (my requests and team requests based on role)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { user } = req;

    // Get user's tenant_id and role
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [user.id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tenantId = tenantResult.rows[0].tenant_id;

    // Get user's role
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [user.id]
    );

    const role = roleResult.rows[0]?.role;

    // Get employee ID if exists
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [user.id]
    );

    const employeeId = empResult.rows[0]?.id;

    let myRequests = [];
    let teamRequests = [];
    let approvedRequests = [];

    // Fetch my requests if user is an employee
    if (employeeId) {
      const myRequestsResult = await query(
        `SELECT 
          lr.*,
          e.employee_id,
          json_build_object(
            'id', p1.id,
            'profiles', json_build_object(
              'first_name', p1.first_name,
              'last_name', p1.last_name
            )
          ) as employee,
          CASE 
            WHEN lr.reviewed_by IS NOT NULL THEN
              json_build_object(
                'id', p2.id,
                'profiles', json_build_object(
                  'first_name', p2.first_name,
                  'last_name', p2.last_name
                )
              )
            ELSE NULL
          END as reviewer,
          json_build_object('name', lp.name) as leave_type
        FROM leave_requests lr
        LEFT JOIN employees e ON lr.employee_id = e.id
        LEFT JOIN profiles p1 ON e.user_id = p1.id
        LEFT JOIN employees er ON lr.reviewed_by = er.id
        LEFT JOIN profiles p2 ON er.user_id = p2.id
        LEFT JOIN leave_policies lp ON lr.leave_type_id = lp.id
        WHERE lr.employee_id = $1
        ORDER BY lr.submitted_at DESC`,
        [employeeId]
      );

      myRequests = myRequestsResult.rows;
    }

    // Fetch team requests if manager or above
    if (['manager', 'hr', 'director', 'ceo'].includes(role) && employeeId) {
      // Fetch pending requests
      const pendingRequestsResult = await query(
        `SELECT 
          lr.*,
          e.employee_id,
          json_build_object(
            'id', p1.id,
            'profiles', json_build_object(
              'first_name', p1.first_name,
              'last_name', p1.last_name
            )
          ) as employee,
          CASE 
            WHEN lr.reviewed_by IS NOT NULL THEN
              json_build_object(
                'id', p2.id,
                'profiles', json_build_object(
                  'first_name', p2.first_name,
                  'last_name', p2.last_name
                )
              )
            ELSE NULL
          END as reviewer,
          json_build_object('name', lp.name) as leave_type
        FROM leave_requests lr
        LEFT JOIN employees e ON lr.employee_id = e.id
        LEFT JOIN profiles p1 ON e.user_id = p1.id
        LEFT JOIN employees er ON lr.reviewed_by = er.id
        LEFT JOIN profiles p2 ON er.user_id = p2.id
        LEFT JOIN leave_policies lp ON lr.leave_type_id = lp.id
        WHERE lr.tenant_id = $1 AND lr.status = 'pending'
        ORDER BY lr.submitted_at DESC`,
        [tenantId]
      );

      // Filter to only show requests from direct reports
      teamRequests = pendingRequestsResult.rows.filter(
        (req) => req.employee?.profiles?.first_name || true // For now, show all pending
      );

      // Fetch approved requests for the team (excluding manager's own requests)
      const approvedRequestsResult = await query(
        `SELECT 
          lr.*,
          e.employee_id,
          json_build_object(
            'id', p1.id,
            'profiles', json_build_object(
              'first_name', p1.first_name,
              'last_name', p1.last_name
            )
          ) as employee,
          CASE 
            WHEN lr.reviewed_by IS NOT NULL THEN
              json_build_object(
                'id', p2.id,
                'profiles', json_build_object(
                  'first_name', p2.first_name,
                  'last_name', p2.last_name
                )
              )
            ELSE NULL
          END as reviewer,
          json_build_object('name', lp.name) as leave_type
        FROM leave_requests lr
        LEFT JOIN employees e ON lr.employee_id = e.id
        LEFT JOIN profiles p1 ON e.user_id = p1.id
        LEFT JOIN employees er ON lr.reviewed_by = er.id
        LEFT JOIN profiles p2 ON er.user_id = p2.id
        LEFT JOIN leave_policies lp ON lr.leave_type_id = lp.id
        WHERE lr.tenant_id = $1 AND lr.status = 'approved' AND lr.employee_id != $2
        ORDER BY lr.reviewed_at DESC`,
        [tenantId, employeeId]
      );

      approvedRequests = approvedRequestsResult.rows;
    }

    res.json({ myRequests, teamRequests, approvedRequests });
  } catch (error) {
    console.error('Error fetching leave requests:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create leave request
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { leave_type_id, start_date, end_date, reason } = req.body;

    // Validate required fields
    if (!leave_type_id || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tenantId = tenantResult.rows[0].tenant_id;

    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;

    // Calculate total days
    const start = new Date(start_date);
    const end = new Date(end_date);
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Insert leave request
    const insertResult = await query(
      `INSERT INTO leave_requests (
        employee_id, leave_type_id, start_date, end_date, 
        total_days, reason, status, tenant_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING *`,
      [employeeId, leave_type_id, start_date, end_date, totalDays, reason || null, tenantId]
    );

    const leave = insertResult.rows[0];
    // Create approval workflow for this leave
    await create_approval('leave', leave.total_days, req.user.id, leave.id);

    res.status(201).json(leave);
  } catch (error) {
    console.error('Error creating leave request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve leave request
router.patch('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get employee ID (reviewer)
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const reviewerId = empResult.rows[0].id;

    // Apply staged approval
    const result = await apply_approval('leave', id, reviewerId, 'approve', null);

    if (result.final && result.status === 'approved') {
      await query(
        `UPDATE leave_requests SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE id = $2`,
        [reviewerId, id]
      );
    }

    // If still pending next stage, return next approver info
    const next = await next_approver('leave', id);
    res.json({ ok: true, workflow: result, next });
  } catch (error) {
    console.error('Error approving leave request:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reject leave request
router.patch('/:id/reject', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    // Get employee ID (reviewer)
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const reviewerId = empResult.rows[0].id;

    const result = await apply_approval('leave', id, reviewerId, 'reject', rejection_reason || null);
    await query(
      `UPDATE leave_requests
       SET status = 'rejected', reviewed_by = $1, reviewed_at = now(), rejection_reason = $2
       WHERE id = $3`,
      [reviewerId, rejection_reason || null, id]
    );
    res.json({ ok: true, workflow: result });
  } catch (error) {
    console.error('Error rejecting leave request:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

