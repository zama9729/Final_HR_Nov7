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

    // Get employee ID if exists (needed for role check)
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [user.id]
    );

    const employeeId = empResult.rows[0]?.id;

    // Get user's role (highest priority)
    const roleResult = await query(
      `SELECT role FROM user_roles WHERE user_id = $1
       ORDER BY CASE role
         WHEN 'admin' THEN 0
         WHEN 'ceo' THEN 1
         WHEN 'director' THEN 2
         WHEN 'hr' THEN 3
         WHEN 'manager' THEN 4
         WHEN 'employee' THEN 5
       END
       LIMIT 1`,
      [user.id]
    );

    let role = roleResult.rows[0]?.role;

    // Check if user has direct reports and should be treated as manager
    if (employeeId) {
      const hasDirectReports = await query(
        `SELECT COUNT(*) as count FROM employees 
         WHERE reporting_manager_id = $1`,
        [employeeId]
      );
      const directReportsCount = parseInt(hasDirectReports.rows[0]?.count || '0');
      
      // If user has direct reports but doesn't have manager role, treat them as manager for this query
      if (directReportsCount > 0 && !['admin', 'ceo', 'director', 'hr', 'manager'].includes(role)) {
        role = 'manager';
      }
    }

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
    if (['manager', 'hr', 'director', 'ceo'].includes(role)) {
      // Build query to fetch pending requests
      let pendingRequestsQuery = `
        SELECT 
          lr.*,
          e.employee_id,
          e.reporting_manager_id,
          m.reporting_manager_id as manager_manager_id,
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
        LEFT JOIN employees m ON e.reporting_manager_id = m.id
        WHERE lr.tenant_id = $1 AND lr.status = 'pending'
      `;

      let queryParams = [tenantId];

      if (role === 'manager' && employeeId) {
        // Managers see only direct reports (normal flow)
        pendingRequestsQuery += ` AND e.reporting_manager_id = $2`;
        queryParams.push(employeeId);
      } else if (['hr', 'director', 'ceo'].includes(role)) {
        // HR/CEO see requests where employee has no manager OR manager has no manager
        pendingRequestsQuery += ` AND (e.reporting_manager_id IS NULL OR m.reporting_manager_id IS NULL)`;
      }

      pendingRequestsQuery += ` ORDER BY lr.submitted_at DESC`;

      const pendingRequestsResult = await query(pendingRequestsQuery, queryParams);

      // For managers, filter to only show requests from direct reports
      // For HR/CEO, show requests that need their approval (no manager or manager has no manager)
      if (role === 'manager' && employeeId) {
        teamRequests = pendingRequestsResult.rows.filter(
          (req) => req.employee?.profiles?.first_name || true // For now, show all pending
        );
      } else {
        teamRequests = pendingRequestsResult.rows;
      }

      // Fetch approved requests for the team
      let approvedQuery = `
        SELECT 
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
        WHERE lr.tenant_id = $1 AND lr.status = 'approved'
      `;
      
      let approvedParams = [tenantId];
      
      // Exclude manager's own requests if they have an employee ID
      if (employeeId) {
        approvedQuery += ` AND lr.employee_id != $2`;
        approvedParams.push(employeeId);
      }
      
      approvedQuery += ` ORDER BY lr.reviewed_at DESC`;
      
      const approvedRequestsResult = await query(approvedQuery, approvedParams);
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
    
    // Check if approvals table exists, if not, allow direct approval for CEO/HR
    let approvalsTableExists = true;
    try {
      await query('SELECT 1 FROM approvals LIMIT 1');
    } catch (tableError) {
      if (tableError.message && tableError.message.includes('does not exist')) {
        approvalsTableExists = false;
      } else {
        throw tableError;
      }
    }

    // Get employee ID (reviewer) - check if user has employee record
    let empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    let reviewerId;

    if (empResult.rows.length === 0) {
      // CEO/HR might not have employee records - find by role
      const roleResult = await query(
        `SELECT ur.role, p.tenant_id
         FROM user_roles ur
         JOIN profiles p ON p.id = ur.user_id
         WHERE ur.user_id = $1 AND ur.role IN ('ceo', 'hr', 'director')`,
        [req.user.id]
      );

      if (roleResult.rows.length > 0) {
        // Try to find employee record by role
        const role = roleResult.rows[0].role;
        const tenantId = roleResult.rows[0].tenant_id;
        
        const empByRoleResult = await query(
          `SELECT e.id
           FROM employees e
           JOIN user_roles ur ON ur.user_id = e.user_id
           WHERE ur.user_id = $1 AND ur.role = $2 AND e.tenant_id = $3`,
          [req.user.id, role, tenantId]
        );

        if (empByRoleResult.rows.length > 0) {
          reviewerId = empByRoleResult.rows[0].id;
        } else {
          // Create minimal employee record for CEO/HR if needed
          const profileResult = await query(
            'SELECT tenant_id FROM profiles WHERE id = $1',
            [req.user.id]
          );
          
          if (profileResult.rows.length === 0) {
            return res.status(404).json({ error: 'User profile not found' });
          }

          const tenantIdForEmp = profileResult.rows[0].tenant_id;
          const empCodeRes = await query('SELECT gen_random_uuid() AS id');
          const newEmpId = `EMP-${empCodeRes.rows[0].id.slice(0,8).toUpperCase()}`;
          
          const insertResult = await query(
            `INSERT INTO employees (user_id, employee_id, tenant_id, onboarding_status, must_change_password)
             VALUES ($1, $2, $3, 'completed', false)
             RETURNING id`,
            [req.user.id, newEmpId, tenantIdForEmp]
          );
          
          reviewerId = insertResult.rows[0].id;
        }
      } else {
        return res.status(404).json({ error: 'Employee not found and user does not have CEO/HR role' });
      }
    } else {
      reviewerId = empResult.rows[0].id;
    }

    let result;
    
    // Check if approval workflow exists, if not create it or approve directly
    let existingApprovals = { rows: [] };
    
    if (approvalsTableExists) {
      try {
        existingApprovals = await query(
          `SELECT * FROM approvals WHERE resource_type = 'leave' AND resource_id = $1`,
          [id]
        );
      } catch (queryError) {
        console.error('Error querying approvals:', queryError);
        approvalsTableExists = false;
      }
    }
    
    if (existingApprovals.rows.length === 0 || !approvalsTableExists) {
      // No approval workflow exists - check if we should approve directly
      // Get leave request to check employee's manager situation
      const leaveRequest = await query(
        `SELECT lr.*, e.reporting_manager_id, m.reporting_manager_id as manager_manager_id
         FROM leave_requests lr
         LEFT JOIN employees e ON lr.employee_id = e.id
         LEFT JOIN employees m ON e.reporting_manager_id = m.id
         WHERE lr.id = $1`,
        [id]
      );

      if (leaveRequest.rows.length === 0) {
        return res.status(404).json({ error: 'Leave request not found' });
      }

      const leave = leaveRequest.rows[0];
      
      // Check if CEO/HR can approve this (no manager or manager has no manager)
      const canDirectlyApprove = !leave.reporting_manager_id || !leave.manager_manager_id;
      
      // Get reviewer role (highest role)
      const reviewerRoleResult = await query(
        `SELECT role FROM user_roles
         WHERE user_id = $1
         ORDER BY CASE role
           WHEN 'admin' THEN 0
           WHEN 'ceo' THEN 1
           WHEN 'director' THEN 2
           WHEN 'hr' THEN 3
           WHEN 'manager' THEN 4
           WHEN 'employee' THEN 5
         END
         LIMIT 1`,
        [req.user.id]
      );
      
      const reviewerRole = reviewerRoleResult.rows[0]?.role;
      
      if (!reviewerRole) {
        return res.status(403).json({ error: 'User role not found' });
      }
      
      // Check if manager is approving their direct report
      const isManagerApprovingDirectReport = reviewerRole === 'manager' && 
        leave.reporting_manager_id === reviewerId;
      
      if ((canDirectlyApprove && ['ceo', 'hr', 'director', 'admin'].includes(reviewerRole)) || 
          isManagerApprovingDirectReport) {
        // Directly approve without workflow
        await query(
          `UPDATE leave_requests SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE id = $2`,
          [reviewerId, id]
        );
        
        result = { updated: true, final: true, status: 'approved' };
      } else {
        // Create approval workflow now
        try {
          const leaveReq = await query('SELECT employee_id, total_days FROM leave_requests WHERE id = $1', [id]);
          if (leaveReq.rows.length === 0) {
            return res.status(404).json({ error: 'Leave request not found' });
          }
          
          const employeeRes = await query('SELECT user_id FROM employees WHERE id = $1', [leaveReq.rows[0].employee_id]);
          if (employeeRes.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found for leave request' });
          }
          
          await create_approval('leave', leaveReq.rows[0].total_days, employeeRes.rows[0].user_id, id);
          
          // Now apply approval
          result = await apply_approval('leave', id, reviewerId, 'approve', null);
        } catch (createError) {
          console.error('Error creating approval workflow:', createError);
          // If creation fails, still try direct approval if allowed
          const isManagerApprovingDirectReport2 = reviewerRole === 'manager' && 
            leave.reporting_manager_id === reviewerId;
          if ((canDirectlyApprove && ['ceo', 'hr', 'director', 'admin'].includes(reviewerRole)) || 
              isManagerApprovingDirectReport2) {
            await query(
              `UPDATE leave_requests SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE id = $2`,
              [reviewerId, id]
            );
            result = { updated: true, final: true, status: 'approved' };
          } else {
            throw createError;
          }
        }
      }
    } else {
      // Approval workflow exists, use it
      // Get reviewer role to verify permissions
      const reviewerRoleResult = await query(
        `SELECT role FROM user_roles
         WHERE user_id = $1
         ORDER BY CASE role
           WHEN 'admin' THEN 0
           WHEN 'ceo' THEN 1
           WHEN 'director' THEN 2
           WHEN 'hr' THEN 3
           WHEN 'manager' THEN 4
           WHEN 'employee' THEN 5
         END
         LIMIT 1`,
        [req.user.id]
      );

      const reviewerRole = reviewerRoleResult.rows[0]?.role;
      
      if (!reviewerRole || !['manager', 'hr', 'director', 'ceo', 'admin'].includes(reviewerRole)) {
        return res.status(403).json({ error: 'Insufficient permissions to approve leave requests' });
      }

      // Check if manager is approving their direct report
      const leaveCheck = await query(
        `SELECT e.reporting_manager_id 
         FROM leave_requests lr
         JOIN employees e ON e.id = lr.employee_id
         WHERE lr.id = $1`,
        [id]
      );

      if (reviewerRole === 'manager' && leaveCheck.rows.length > 0) {
        const reportingManagerId = leaveCheck.rows[0].reporting_manager_id;
        if (reportingManagerId !== reviewerId) {
          return res.status(403).json({ error: 'You can only approve leave requests from your direct reports' });
        }
      }

      if (approvalsTableExists) {
        result = await apply_approval('leave', id, reviewerId, 'approve', null);
      } else {
        // Fallback to direct approval
        await query(
          `UPDATE leave_requests SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE id = $2`,
          [reviewerId, id]
        );
        result = { updated: true, final: true, status: 'approved' };
      }
    }

    if (result.final && result.status === 'approved') {
      await query(
        `UPDATE leave_requests SET status = 'approved', reviewed_by = $1, reviewed_at = now() WHERE id = $2`,
        [reviewerId, id]
      );
    }

    // If still pending next stage, return next approver info
    let next = { pending: false };
    if (approvalsTableExists) {
      try {
        next = await next_approver('leave', id);
      } catch (error) {
        console.error('Error getting next approver:', error);
      }
    }
    
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

    // Get employee ID (reviewer) - check if user has employee record
    let empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    let reviewerId;

    if (empResult.rows.length === 0) {
      // CEO/HR might not have employee records - find by role
      const roleResult = await query(
        `SELECT ur.role, p.tenant_id
         FROM user_roles ur
         JOIN profiles p ON p.id = ur.user_id
         WHERE ur.user_id = $1 AND ur.role IN ('ceo', 'hr', 'director')`,
        [req.user.id]
      );

      if (roleResult.rows.length > 0) {
        // Try to find employee record by role
        const role = roleResult.rows[0].role;
        const tenantId = roleResult.rows[0].tenant_id;
        
        const empByRoleResult = await query(
          `SELECT e.id
           FROM employees e
           JOIN user_roles ur ON ur.user_id = e.user_id
           WHERE ur.user_id = $1 AND ur.role = $2 AND e.tenant_id = $3`,
          [req.user.id, role, tenantId]
        );

        if (empByRoleResult.rows.length > 0) {
          reviewerId = empByRoleResult.rows[0].id;
        } else {
          // Create minimal employee record for CEO/HR if needed
          const profileResult = await query(
            'SELECT tenant_id FROM profiles WHERE id = $1',
            [req.user.id]
          );
          
          if (profileResult.rows.length === 0) {
            return res.status(404).json({ error: 'User profile not found' });
          }

          const tenantIdForEmp = profileResult.rows[0].tenant_id;
          const empCodeRes = await query('SELECT gen_random_uuid() AS id');
          const newEmpId = `EMP-${empCodeRes.rows[0].id.slice(0,8).toUpperCase()}`;
          
          const insertResult = await query(
            `INSERT INTO employees (user_id, employee_id, tenant_id, onboarding_status, must_change_password)
             VALUES ($1, $2, $3, 'completed', false)
             RETURNING id`,
            [req.user.id, newEmpId, tenantIdForEmp]
          );
          
          reviewerId = insertResult.rows[0].id;
        }
      } else {
        return res.status(404).json({ error: 'Employee not found and user does not have CEO/HR role' });
      }
    } else {
      reviewerId = empResult.rows[0].id;
    }

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

