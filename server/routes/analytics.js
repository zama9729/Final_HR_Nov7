import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get analytics data for organization
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Employee Growth (last 6 months)
    const employeeGrowthRes = await query(
      `WITH months AS (
        SELECT date_trunc('month', now()) - (n || ' months')::interval AS month
        FROM generate_series(0, 5) AS n
      )
      SELECT 
        to_char(months.month, 'Mon YY') AS month,
        COUNT(e.id) AS count
      FROM months
      LEFT JOIN employees e ON date_trunc('month', e.created_at) = months.month AND e.tenant_id = $1 AND e.status = 'active'
      GROUP BY months.month
      ORDER BY months.month`,
      [tenantId]
    );

    // Department Distribution
    const deptRes = await query(
      `SELECT 
        COALESCE(department, 'Unassigned') AS name,
        COUNT(*) AS value
      FROM employees
      WHERE tenant_id = $1 AND status = 'active'
      GROUP BY department
      ORDER BY value DESC`,
      [tenantId]
    );

    // Leave Requests Trend (last 6 months)
    const leaveTrendRes = await query(
      `WITH months AS (
        SELECT date_trunc('month', now()) - (n || ' months')::interval AS month
        FROM generate_series(0, 5) AS n
      )
      SELECT 
        to_char(months.month, 'Mon YY') AS month,
        COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN 1 ELSE 0 END), 0) AS approved,
        COALESCE(SUM(CASE WHEN lr.status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
        COALESCE(SUM(CASE WHEN lr.status = 'rejected' THEN 1 ELSE 0 END), 0) AS rejected
      FROM months
      LEFT JOIN leave_requests lr ON date_trunc('month', lr.submitted_at) = months.month AND lr.tenant_id = $1
      GROUP BY months.month
      ORDER BY months.month`,
      [tenantId]
    );

    // Attendance/Timesheet Trends (last 6 months)
    const attendanceRes = await query(
      `WITH months AS (
        SELECT date_trunc('month', now()) - (n || ' months')::interval AS month
        FROM generate_series(0, 5) AS n
      )
      SELECT 
        to_char(months.month, 'Mon YY') AS month,
        COALESCE(AVG(t.total_hours), 0) AS avg_hours,
        COUNT(DISTINCT t.employee_id) AS active_employees
      FROM months
      LEFT JOIN timesheets t ON date_trunc('month', t.week_start_date) = months.month AND t.tenant_id = $1 AND t.status = 'approved'
      GROUP BY months.month
      ORDER BY months.month`,
      [tenantId]
    );

    // Project Utilization (current)
    const projectUtilRes = await query(
      `SELECT 
        p.name AS project_name,
        COUNT(DISTINCT a.employee_id) AS assigned_employees,
        AVG(a.allocation_percent) AS avg_allocation,
        SUM(CASE WHEN a.end_date IS NULL OR a.end_date >= now()::date THEN 1 ELSE 0 END) AS active_assignments
      FROM projects p
      LEFT JOIN assignments a ON a.project_id = p.id
      WHERE p.org_id = $1 AND p.status = 'open'
      GROUP BY p.id, p.name
      ORDER BY active_assignments DESC`,
      [tenantId]
    );

    // Skills Distribution
    const skillsRes = await query(
      `SELECT 
        s.name,
        COUNT(*) AS count,
        AVG(s.level) AS avg_level
      FROM skills s
      JOIN employees e ON e.id = s.employee_id
      WHERE e.tenant_id = $1
      GROUP BY s.name
      ORDER BY count DESC
      LIMIT 10`,
      [tenantId]
    );

    // Overall Stats
    const overallRes = await query(
      `SELECT 
        (SELECT COUNT(*) FROM employees WHERE tenant_id = $1 AND status = 'active') AS total_employees,
        (SELECT COUNT(*) FROM leave_requests WHERE tenant_id = $1 AND status = 'pending') AS pending_leaves,
        (SELECT COUNT(*) FROM timesheets WHERE tenant_id = $1 AND status = 'pending') AS pending_timesheets,
        (SELECT COUNT(*) FROM projects WHERE org_id = $1 AND status = 'open') AS active_projects,
        (SELECT COUNT(*) FROM assignments a JOIN projects p ON p.id = a.project_id WHERE p.org_id = $1 AND (a.end_date IS NULL OR a.end_date >= now()::date)) AS active_assignments`,
      [tenantId]
    );

    res.json({
      employeeGrowth: employeeGrowthRes.rows,
      departmentData: deptRes.rows,
      leaveData: leaveTrendRes.rows,
      attendanceData: attendanceRes.rows,
      projectUtilization: projectUtilRes.rows,
      topSkills: skillsRes.rows,
      overall: overallRes.rows[0] || {}
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
  }
});

export default router;
