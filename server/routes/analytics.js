import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// GET /api/analytics - General analytics overview
router.get('/', authenticateToken, setTenantContext, requireRole('ceo', 'hr', 'director', 'admin'), async (req, res) => {
  try {
    const orgId = req.orgId;

    // Employee growth over time
    const employeeGrowthResult = await queryWithOrg(
      `SELECT 
         TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
         COUNT(*) as count
       FROM employees
       WHERE tenant_id = $1
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month`,
      [orgId],
      orgId
    );

    // Department distribution - ensure departments are scoped to org
    const departmentResult = await queryWithOrg(
      `SELECT 
         COALESCE(d.name, 'Unassigned') as name,
         COUNT(DISTINCT e.id) as value
       FROM employees e
       LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
       LEFT JOIN departments d ON d.id = ea.department_id AND d.org_id = $1
       WHERE e.tenant_id = $1 AND e.status = 'active'
       GROUP BY d.name
       ORDER BY value DESC`,
      [orgId],
      orgId
    );

    // Leave data by month
    const leaveResult = await queryWithOrg(
      `SELECT 
         TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
         COUNT(*) FILTER (WHERE status = 'approved') as approved,
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'rejected') as rejected
       FROM leave_requests
       WHERE tenant_id = $1
       GROUP BY DATE_TRUNC('month', created_at)
       ORDER BY month DESC
       LIMIT 12`,
      [orgId],
      orgId
    );

    // Attendance data by month
    const attendanceResult = await queryWithOrg(
      `SELECT 
         TO_CHAR(DATE_TRUNC('month', raw_timestamp), 'YYYY-MM') as month,
         AVG(EXTRACT(EPOCH FROM (
           COALESCE(
             (SELECT MIN(ae2.raw_timestamp) FROM attendance_events ae2 
              WHERE ae2.employee_id = ae.employee_id 
                AND DATE(ae2.raw_timestamp) = DATE(ae.raw_timestamp)
                AND ae2.event_type = 'OUT'),
             ae.raw_timestamp + INTERVAL '8 hours'
           ) - ae.raw_timestamp
         )) / 3600) as avg_hours,
         COUNT(DISTINCT ae.employee_id) as active_employees
       FROM attendance_events ae
       WHERE tenant_id = $1 AND event_type = 'IN'
       GROUP BY DATE_TRUNC('month', raw_timestamp)
       ORDER BY month DESC
       LIMIT 12`,
      [orgId],
      orgId
    );

    // Project utilization - ensure org_id matches tenant_id
    const projectResult = await queryWithOrg(
      `SELECT 
         p.name,
         COUNT(DISTINCT a.employee_id) as employees,
         COUNT(DISTINCT a.id) as assignments
       FROM projects p
       LEFT JOIN assignments a ON a.project_id = p.id
       LEFT JOIN employees e ON e.id = a.employee_id AND e.tenant_id = $1
       WHERE p.org_id = $1
       GROUP BY p.id, p.name
       ORDER BY employees DESC
       LIMIT 10`,
      [orgId],
      orgId
    );

    // Top skills - filter by tenant_id on skills table directly for RLS compliance
    const skillsResult = await queryWithOrg(
      `SELECT 
         s.name,
         COUNT(*) as count,
         AVG(s.level) as avg_level
       FROM skills s
       JOIN employees e ON e.id = s.employee_id
       WHERE s.tenant_id = $1 AND e.tenant_id = $1 AND e.status = 'active'
       GROUP BY s.name
       ORDER BY count DESC
       LIMIT 10`,
      [orgId],
      orgId
    );

    // Overall stats - ensure all subqueries are properly scoped
    const overallResult = await queryWithOrg(
      `SELECT 
         (SELECT COUNT(*) FROM employees WHERE tenant_id = $1 AND status = 'active') as total_employees,
         (SELECT COUNT(DISTINCT e.id) FROM employees e 
          WHERE e.tenant_id = $1 AND e.status = 'active'
          AND (e.id IN (SELECT reporting_manager_id FROM employees WHERE reporting_manager_id IS NOT NULL AND tenant_id = $1)
               OR e.user_id IN (SELECT ur.user_id FROM user_roles ur 
                                 JOIN employees emp ON emp.user_id = ur.user_id 
                                 WHERE ur.role = 'manager' AND emp.tenant_id = $1))) as manager_count,
         (SELECT COUNT(DISTINCT lr.employee_id) FROM leave_requests lr
          JOIN employees emp ON emp.id = lr.employee_id
          WHERE lr.tenant_id = $1 AND emp.tenant_id = $1
          AND lr.status = 'approved'
          AND CURRENT_DATE BETWEEN lr.start_date AND lr.end_date) as employees_on_leave,
         (SELECT COUNT(*) FROM projects WHERE org_id = $1 AND status = 'open') as active_projects,
         (SELECT COUNT(*) FROM projects WHERE org_id = $1 AND status = 'open') as project_count,
         (SELECT COUNT(*) FROM leave_requests WHERE tenant_id = $1 AND status = 'pending') as pending_leaves,
         (SELECT COUNT(*) FROM teams WHERE org_id = $1) as total_teams,
         (SELECT COUNT(*) FROM assignments a 
          JOIN projects p ON p.id = a.project_id 
          WHERE p.org_id = $1 AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)) as active_assignments`,
      [orgId],
      orgId
    );

    res.json({
      employeeGrowth: employeeGrowthResult.rows,
      departmentData: departmentResult.rows,
      leaveData: leaveResult.rows,
      attendanceData: attendanceResult.rows,
      projectUtilization: projectResult.rows,
      topSkills: skillsResult.rows,
      overall: overallResult.rows[0] || {},
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch analytics' });
  }
});

// GET /api/analytics/attendance/overview
router.get('/attendance/overview', authenticateToken, setTenantContext, requireRole('ceo', 'hr', 'director', 'admin'), async (req, res) => {
  try {
    const { from, to, branch_id } = req.query;
    const orgId = req.orgId;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required (YYYY-MM-DD)' });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    // Build branch filter
    const branchFilter = branch_id ? 'AND ae.work_location_branch_id = $4' : '';

    // Total employees
    const totalEmployeesResult = await queryWithOrg(
      `SELECT COUNT(DISTINCT e.id) as count
       FROM employees e
       WHERE e.tenant_id = $1 AND e.status = 'active'`,
      [orgId],
      orgId
    );
    const totalEmployees = parseInt(totalEmployeesResult.rows[0]?.count || '0');

    // Today's present count
    const today = new Date().toISOString().split('T')[0];
    const todayParams = [orgId, today];
    if (branch_id) {
      todayParams.push(branch_id);
    }
    const todayPresentResult = await queryWithOrg(
      `SELECT COUNT(DISTINCT ae.employee_id) as count
       FROM attendance_events ae
       JOIN employees e ON e.id = ae.employee_id AND e.tenant_id = $1
       WHERE ae.tenant_id = $1
         AND DATE(ae.raw_timestamp) = $2
         AND ae.event_type = 'IN'
         ${branchFilter}`,
      todayParams,
      orgId
    );
    const todayPresent = parseInt(todayPresentResult.rows[0]?.count || '0');
    const todayPresentPercent = totalEmployees > 0 ? Math.round((todayPresent / totalEmployees) * 100) : 0;

    // On-time percentage (assuming 9 AM as standard start time)
    const onTimeParams = [orgId, fromDate, toDate];
    if (branch_id) onTimeParams.push(branch_id);
    const onTimeResult = await queryWithOrg(
      `SELECT COUNT(*) as on_time, COUNT(*) FILTER (WHERE EXTRACT(HOUR FROM ae.raw_timestamp) > 9) as late
       FROM attendance_events ae
       JOIN employees e ON e.id = ae.employee_id AND e.tenant_id = $1
       WHERE ae.tenant_id = $1
         AND DATE(ae.raw_timestamp) >= $2
         AND DATE(ae.raw_timestamp) <= $3
         AND ae.event_type = 'IN'
         ${branchFilter}`,
      onTimeParams,
      orgId
    );
    const onTime = parseInt(onTimeResult.rows[0]?.on_time || '0');
    const late = parseInt(onTimeResult.rows[0]?.late || '0');
    const onTimePercent = (onTime + late) > 0 ? Math.round((onTime / (onTime + late)) * 100) : 0;

    // WFO vs WFH percentage (handle NULL work_type)
    const wfoWfhParams = [orgId, fromDate, toDate];
    if (branch_id) wfoWfhParams.push(branch_id);
    const wfoWfhResult = await queryWithOrg(
      `SELECT 
         COUNT(*) FILTER (WHERE COALESCE(ae.work_type, 'WFH') = 'WFO') as wfo_count,
         COUNT(*) FILTER (WHERE COALESCE(ae.work_type, 'WFH') = 'WFH') as wfh_count
       FROM attendance_events ae
       JOIN employees e ON e.id = ae.employee_id AND e.tenant_id = $1
       WHERE ae.tenant_id = $1
         AND DATE(ae.raw_timestamp) >= $2
         AND DATE(ae.raw_timestamp) <= $3
         AND ae.event_type = 'IN'
         ${branchFilter}`,
      wfoWfhParams,
      orgId
    );
    const wfoCount = parseInt(wfoWfhResult.rows[0]?.wfo_count || '0');
    const wfhCount = parseInt(wfoWfhResult.rows[0]?.wfh_count || '0');
    const total = wfoCount + wfhCount;
    const wfoPercent = total > 0 ? Math.round((wfoCount / total) * 100) : 0;
    const wfhPercent = total > 0 ? Math.round((wfhCount / total) * 100) : 0;

    // Pending approvals (timesheet approvals) - use new 'pending_approval' status
    const pendingApprovalsResult = await queryWithOrg(
      `SELECT COUNT(*) as count
       FROM timesheets t
       JOIN employees e ON e.id = t.employee_id AND e.tenant_id = $1
       WHERE t.tenant_id = $1
         AND t.status = 'pending_approval'
         ${branch_id ? 'AND EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea.employee_id = e.id AND ea.branch_id = $2)' : ''}`,
      branch_id ? [orgId, branch_id] : [orgId],
      orgId
    );
    const pendingApprovals = parseInt(pendingApprovalsResult.rows[0]?.count || '0');

    res.json({
      total_employees: totalEmployees,
      today_present: todayPresent,
      today_present_percent: todayPresentPercent,
      on_time_percent: onTimePercent,
      wfo_percent: wfoPercent,
      wfh_percent: wfhPercent,
      pending_approvals: pendingApprovals,
    });
  } catch (error) {
    console.error('Analytics overview error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch overview' });
  }
});

// GET /api/analytics/approvals/pending
// List timesheets in pending_approval state for HR/CEO/Admin
router.get('/approvals/pending', authenticateToken, setTenantContext, requireRole('ceo', 'hr', 'director', 'admin'), async (req, res) => {
  try {
    const { from, to, manager_id, department_id } = req.query;
    const orgId = req.orgId;

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to) : null;

    const filters = ['t.tenant_id = $1', "t.status = 'pending_approval'"];
    const params = [orgId];
    let idx = 2;

    if (fromDate) {
      filters.push(`t.submitted_at >= $${idx++}`);
      params.push(fromDate);
    }
    if (toDate) {
      filters.push(`t.submitted_at <= $${idx++}`);
      params.push(toDate);
    }
    if (manager_id) {
      filters.push(`mgr.id = $${idx++}`);
      params.push(manager_id);
    }
    if (department_id) {
      filters.push(`ea.department_id = $${idx++}`);
      params.push(department_id);
    }

    const result = await queryWithOrg(
      `SELECT
         t.id,
         t.week_start_date,
         t.week_end_date,
         t.status,
         t.submitted_at,
         t.total_hours,
         json_build_object(
           'id', e.id,
           'employee_id', e.employee_id,
           'first_name', p.first_name,
           'last_name', p.last_name,
           'email', p.email
         ) AS employee,
         mgr.id AS manager_id,
         mp.first_name AS manager_first_name,
         mp.last_name  AS manager_last_name,
         mp.email      AS manager_email
       FROM timesheets t
       JOIN employees e ON e.id = t.employee_id AND e.tenant_id = $1
       JOIN profiles p ON p.id = e.user_id AND p.tenant_id = $1
       LEFT JOIN employees mgr ON mgr.id = e.reporting_manager_id AND mgr.tenant_id = $1
       LEFT JOIN profiles mp ON mp.id = mgr.user_id AND mp.tenant_id = $1
       LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
       WHERE ${filters.join(' AND ')}
       ORDER BY t.submitted_at DESC NULLS LAST`,
      params,
      orgId
    );

    res.json({ pending: result.rows });
  } catch (error) {
    console.error('Analytics approvals pending error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch pending approvals' });
  }
});

// GET /api/analytics/attendance/histogram
router.get('/attendance/histogram', authenticateToken, setTenantContext, requireRole('ceo', 'hr', 'director', 'admin'), async (req, res) => {
  try {
    const { from, to, branch_id, team_id, department_id } = req.query;
    const orgId = req.orgId;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required' });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Build filters
    const filters = ['ae.tenant_id = $1', 'DATE(ae.raw_timestamp) >= $2', 'DATE(ae.raw_timestamp) <= $3'];
    const params = [orgId, fromDate, toDate];
    let paramIndex = 4;

    if (branch_id) {
      filters.push(`ae.work_location_branch_id = $${paramIndex++}`);
      params.push(branch_id);
    }

    if (team_id || department_id) {
      filters.push(`EXISTS (
        SELECT 1 FROM employee_assignments ea
        WHERE ea.employee_id = ae.employee_id
          ${team_id ? `AND ea.team_id = $${paramIndex++}` : ''}
          ${department_id ? `AND ea.department_id = $${paramIndex++}` : ''}
      )`);
      if (team_id) params.push(team_id);
      if (department_id) params.push(department_id);
    }

    const result = await queryWithOrg(
      `SELECT 
         DATE(ae.raw_timestamp) as date,
         COUNT(DISTINCT ae.employee_id) FILTER (WHERE ae.event_type = 'IN') as present,
         COUNT(DISTINCT ae.employee_id) FILTER (WHERE ae.event_type = 'IN' AND COALESCE(ae.work_type, 'WFH') = 'WFO') as wfo,
         COUNT(DISTINCT ae.employee_id) FILTER (WHERE ae.event_type = 'IN' AND COALESCE(ae.work_type, 'WFH') = 'WFH') as wfh,
         COUNT(DISTINCT ae.employee_id) FILTER (WHERE ae.event_type = 'IN' AND EXTRACT(HOUR FROM ae.raw_timestamp) > 9) as late
       FROM attendance_events ae
       JOIN employees e ON e.id = ae.employee_id AND e.tenant_id = $1
       WHERE ${filters.join(' AND ')}
       GROUP BY DATE(ae.raw_timestamp)
       ORDER BY date`,
      params,
      orgId
    );

    // Get total employees for absent calculation
    const totalEmployeesResult = await queryWithOrg(
      `SELECT COUNT(DISTINCT e.id) as count
       FROM employees e
       WHERE e.tenant_id = $1 AND e.status = 'active'`,
      [orgId],
      orgId
    );
    const totalEmployees = parseInt(totalEmployeesResult.rows[0]?.count || '0');

    // Normalize rows by date for quick lookup
    const rowMap = new Map();
    result.rows.forEach(row => {
      // Ensure date string in YYYY-MM-DD
      const dateKey = new Date(row.date).toISOString().split('T')[0];
      rowMap.set(dateKey, {
        present: parseInt(row.present || '0'),
        late: parseInt(row.late || '0'),
        wfo: parseInt(row.wfo || '0'),
        wfh: parseInt(row.wfh || '0'),
      });
    });

    // Fill every day in range to avoid gaps in timeline graph
    const histogram = [];
    for (
      let cursor = new Date(fromDate);
      cursor <= toDate;
      cursor.setDate(cursor.getDate() + 1)
    ) {
      const dateKey = cursor.toISOString().split('T')[0];
      const stats = rowMap.get(dateKey) || {
        present: 0,
        late: 0,
        wfo: 0,
        wfh: 0,
      };
      const absent = Math.max(0, totalEmployees - stats.present);
      histogram.push({
        date: dateKey,
        present: stats.present,
        absent,
        late: stats.late,
        wfo: stats.wfo,
        wfh: stats.wfh,
      });
    }

    res.json({ histogram, total_employees: totalEmployees });
  } catch (error) {
    console.error('Analytics histogram error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch histogram' });
  }
});

// GET /api/analytics/attendance/heatmap
router.get('/attendance/heatmap', authenticateToken, setTenantContext, requireRole('ceo', 'hr', 'director', 'admin'), async (req, res) => {
  try {
    const { from, to, branch_id, group_by = 'department' } = req.query;
    const orgId = req.orgId;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required' });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Group by department or team
    const groupColumn = group_by === 'team' 
      ? 'ea.team_id, t.name as group_name'
      : 'ea.department_id, d.name as group_name';
    const groupJoin = group_by === 'team'
      ? 'LEFT JOIN teams t ON t.id = ea.team_id'
      : 'LEFT JOIN departments d ON d.id = ea.department_id';

    const result = await queryWithOrg(
      `SELECT 
         ${groupColumn},
         DATE(ae.raw_timestamp) as date,
         COUNT(DISTINCT ae.employee_id) FILTER (WHERE ae.event_type = 'IN') as present_count,
         COUNT(DISTINCT e.id) as total_employees
       FROM attendance_events ae
       JOIN employees e ON e.id = ae.employee_id AND e.tenant_id = $1
       LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
       ${groupJoin}
       WHERE ae.tenant_id = $1
         AND DATE(ae.raw_timestamp) >= $2
         AND DATE(ae.raw_timestamp) <= $3
         ${branch_id ? 'AND ae.work_location_branch_id = $4' : ''}
       GROUP BY ${groupColumn}, DATE(ae.raw_timestamp)
       ORDER BY date, group_name`,
      branch_id ? [orgId, fromDate, toDate, branch_id] : [orgId, fromDate, toDate],
      orgId
    );

    // Transform to heatmap format
    const heatmap = {};
    result.rows.forEach(row => {
      const groupName = row.group_name || 'Unassigned';
      const date = row.date;
      if (!heatmap[groupName]) {
        heatmap[groupName] = {};
      }
      const presentCount = parseInt(row.present_count || '0');
      const total = parseInt(row.total_employees || '1');
      heatmap[groupName][date] = {
        present: presentCount,
        total: total,
        percentage: Math.round((presentCount / total) * 100),
      };
    });

    res.json({ heatmap });
  } catch (error) {
    console.error('Analytics heatmap error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch heatmap' });
  }
});

// GET /api/analytics/attendance/map
router.get('/attendance/map', authenticateToken, setTenantContext, requireRole('ceo', 'hr', 'director', 'admin'), async (req, res) => {
  try {
    const { from, to, branch_id, team_id } = req.query;
    const orgId = req.orgId;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required' });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Get most frequent work locations
    const result = await queryWithOrg(
      `SELECT 
         ae.lat,
         ae.lon,
         ae.address_text,
         ae.work_location_branch_id,
         ob.name as branch_name,
         COUNT(*) as frequency,
         COUNT(DISTINCT ae.employee_id) as unique_employees
       FROM attendance_events ae
       JOIN employees e ON e.id = ae.employee_id AND e.tenant_id = $1
       LEFT JOIN org_branches ob ON ob.id = ae.work_location_branch_id AND ob.org_id = $1
       WHERE ae.tenant_id = $1
         AND DATE(ae.raw_timestamp) >= $2
         AND DATE(ae.raw_timestamp) <= $3
         AND ae.lat IS NOT NULL
         AND ae.lon IS NOT NULL
         AND ae.event_type = 'IN'
         ${branch_id ? 'AND ae.work_location_branch_id = $4' : ''}
         ${team_id ? 'AND EXISTS (SELECT 1 FROM employee_assignments ea WHERE ea.employee_id = ae.employee_id AND ea.team_id = $5)' : ''}
       GROUP BY ae.lat, ae.lon, ae.address_text, ae.work_location_branch_id, ob.name
       HAVING COUNT(*) >= 3
       ORDER BY frequency DESC
       LIMIT 100`,
      branch_id && team_id ? [orgId, fromDate, toDate, branch_id, team_id] :
      branch_id ? [orgId, fromDate, toDate, branch_id] :
      team_id ? [orgId, fromDate, toDate, team_id] :
      [orgId, fromDate, toDate],
      orgId
    );

    const locations = result.rows.map(row => ({
      lat: parseFloat(row.lat),
      lon: parseFloat(row.lon),
      address: row.address_text,
      branch_id: row.work_location_branch_id,
      branch_name: row.branch_name,
      frequency: parseInt(row.frequency || '0'),
      unique_employees: parseInt(row.unique_employees || '0'),
    }));

    res.json({ locations });
  } catch (error) {
    console.error('Analytics map error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch map data' });
  }
});

// GET /api/analytics/attendance/distribution
router.get('/attendance/distribution', authenticateToken, setTenantContext, requireRole('ceo', 'hr', 'director', 'admin'), async (req, res) => {
  try {
    const { from, to, branch_id, team_id } = req.query;
    const orgId = req.orgId;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required' });
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);

    // Get daily hours worked per employee
    const result = await queryWithOrg(
      `SELECT 
         e.id as employee_id,
         p.first_name || ' ' || p.last_name as employee_name,
         ea.team_id,
         t.name as team_name,
         ea.department_id,
         d.name as department_name,
         DATE(ae.raw_timestamp) as work_date,
         EXTRACT(EPOCH FROM (
           COALESCE(
             (SELECT MIN(ae2.raw_timestamp) FROM attendance_events ae2 
              WHERE ae2.employee_id = ae.employee_id 
                AND ae2.tenant_id = $1
                AND DATE(ae2.raw_timestamp) = DATE(ae.raw_timestamp)
                AND ae2.event_type = 'OUT'),
             ae.raw_timestamp + INTERVAL '8 hours'
           ) - ae.raw_timestamp
         )) / 3600 as hours_worked
       FROM attendance_events ae
       JOIN employees e ON e.id = ae.employee_id AND e.tenant_id = $1
       JOIN profiles p ON p.id = e.user_id AND p.tenant_id = $1
       LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
       LEFT JOIN teams t ON t.id = ea.team_id AND t.org_id = $1
       LEFT JOIN departments d ON d.id = ea.department_id AND d.org_id = $1
       WHERE ae.tenant_id = $1
         AND DATE(ae.raw_timestamp) >= $2
         AND DATE(ae.raw_timestamp) <= $3
         AND ae.event_type = 'IN'
         ${branch_id ? 'AND ae.work_location_branch_id = $4' : ''}
         ${team_id ? 'AND ea.team_id = $5' : ''}
       ORDER BY work_date, team_name, department_name`,
      branch_id && team_id ? [orgId, fromDate, toDate, branch_id, team_id] :
      branch_id ? [orgId, fromDate, toDate, branch_id] :
      team_id ? [orgId, fromDate, toDate, team_id] :
      [orgId, fromDate, toDate],
      orgId
    );

    // Group by team/department
    const distribution = {};
    result.rows.forEach(row => {
      const groupName = row.team_name || row.department_name || 'Unassigned';
      const hours = parseFloat(row.hours_worked || '0');
      if (!distribution[groupName]) {
        distribution[groupName] = [];
      }
      distribution[groupName].push(hours);
    });

    // Calculate statistics for each group
    const stats = Object.entries(distribution).map(([group, hours]) => {
      const sorted = [...hours].sort((a, b) => a - b);
      const mean = hours.reduce((a, b) => a + b, 0) / hours.length;
      const median = sorted[Math.floor(sorted.length / 2)];
      const q1 = sorted[Math.floor(sorted.length * 0.25)];
      const q3 = sorted[Math.floor(sorted.length * 0.75)];
      const min = Math.min(...hours);
      const max = Math.max(...hours);

      return {
        group,
        values: hours,
        mean: Math.round(mean * 100) / 100,
        median: Math.round(median * 100) / 100,
        q1: Math.round(q1 * 100) / 100,
        q3: Math.round(q3 * 100) / 100,
        min: Math.round(min * 100) / 100,
        max: Math.round(max * 100) / 100,
        count: hours.length,
      };
    });

    res.json({ distribution: stats });
  } catch (error) {
    console.error('Analytics distribution error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch distribution' });
  }
});

// GET /api/analytics/skills/network - Get skills network data for interactive graph
router.get('/skills/network', authenticateToken, setTenantContext, requireRole('ceo', 'hr', 'director', 'admin'), async (req, res) => {
  try {
    const orgId = req.orgId;

    // Get all skills with employee connections
    const skillsNetworkResult = await queryWithOrg(
      `SELECT 
         s.id as skill_id,
         s.name as skill_name,
         s.level,
         s.endorsements,
         e.id as employee_id,
         p.first_name || ' ' || p.last_name as employee_name,
         p.email as employee_email,
         ea.department_id,
         d.name as department_name
       FROM skills s
       JOIN employees e ON e.id = s.employee_id AND e.tenant_id = $1
       JOIN profiles p ON p.id = e.user_id AND p.tenant_id = $1
       LEFT JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
       LEFT JOIN departments d ON d.id = ea.department_id AND d.org_id = $1
       WHERE s.tenant_id = $1 AND e.status = 'active'
       ORDER BY s.name, s.level DESC`,
      [orgId],
      orgId
    );

    // Build network structure: only skills, connected by shared employees
    const skillNodes = new Map();
    const employeeSkillsMap = new Map(); // employee_id -> Set of skill names

    skillsNetworkResult.rows.forEach(row => {
      const skillId = `skill_${row.skill_name}`;
      const employeeId = row.employee_id;

      // Add skill node
      if (!skillNodes.has(skillId)) {
        skillNodes.set(skillId, {
          id: skillId,
          type: 'skill',
          name: row.skill_name,
          count: 0,
          avgLevel: 0,
          totalEndorsements: 0,
          employees: [],
          departments: new Set(),
        });
      }
      const skillNode = skillNodes.get(skillId);
      skillNode.count += 1;
      skillNode.avgLevel = ((skillNode.avgLevel * (skillNode.count - 1)) + (row.level || 1)) / skillNode.count;
      skillNode.totalEndorsements += row.endorsements || 0;
      skillNode.employees.push({
        id: row.employee_id,
        name: row.employee_name,
        email: row.employee_email,
        level: row.level,
        department: row.department_name,
      });
      if (row.department_name) {
        skillNode.departments.add(row.department_name);
      }

      // Track employee skills for co-occurrence
      if (!employeeSkillsMap.has(employeeId)) {
        employeeSkillsMap.set(employeeId, new Set());
      }
      employeeSkillsMap.get(employeeId).add(row.skill_name);
    });

    // Build links between skills based on shared employees (co-occurrence)
    const links = [];
    const linkMap = new Map(); // Track existing links to avoid duplicates

    employeeSkillsMap.forEach((skillSet, employeeId) => {
      const skillsArray = Array.from(skillSet);
      // Create links between all pairs of skills this employee has
      for (let i = 0; i < skillsArray.length; i++) {
        for (let j = i + 1; j < skillsArray.length; j++) {
          const skill1 = `skill_${skillsArray[i]}`;
          const skill2 = `skill_${skillsArray[j]}`;
          const linkKey = [skill1, skill2].sort().join('|');
          
          if (!linkMap.has(linkKey)) {
            linkMap.set(linkKey, {
              source: skill1,
              target: skill2,
              weight: 1,
            });
          } else {
            linkMap.get(linkKey).weight += 1;
          }
        }
      }
    });

    // Convert link map to array
    links.push(...Array.from(linkMap.values()));

    // Convert skill nodes to array with size based on employee count
    const nodes = Array.from(skillNodes.values()).map(skill => ({
      ...skill,
      departments: Array.from(skill.departments),
      size: Math.min(60, Math.max(20, skill.count * 4)),
    }));

    res.json({
      nodes,
      links,
      stats: {
        totalSkills: skillNodes.size,
        totalEmployees: employeeSkillsMap.size,
        totalConnections: links.length,
      },
    });
  } catch (error) {
    console.error('Skills network error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch skills network' });
  }
});

export default router;
