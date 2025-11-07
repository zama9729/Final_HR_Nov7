import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get calendar data for projects/assignments
// Supports filters: employee_id, project_id, start_date, end_date
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { employee_id, project_id, start_date, end_date } = req.query;
    
    // Get user's tenant
    const userRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = userRes.rows[0]?.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Check user role
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director'].includes(userRole);
    
    // If employee role, they can only see their own data (unless employee_id is provided and matches)
    let employeeFilter = '';
    const params = [tenantId];
    let paramIndex = 1;
    
    if (!isHROrCEO) {
      // Get current user's employee ID
      const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
      if (empRes.rows.length === 0) {
        return res.json({ events: [], projects: [], employees: [] });
      }
      const myEmployeeId = empRes.rows[0].id;
      employeeFilter = `AND a.employee_id = $${++paramIndex}`;
      params.push(myEmployeeId);
    } else if (employee_id) {
      // HR/CEO can filter by specific employee
      employeeFilter = `AND a.employee_id = $${++paramIndex}`;
      params.push(employee_id);
    }

    // Date range filter
    let dateFilter = '';
    if (start_date) {
      dateFilter += ` AND (a.end_date IS NULL OR a.end_date >= $${++paramIndex}::date)`;
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ` AND (a.start_date IS NULL OR a.start_date <= $${++paramIndex}::date)`;
      params.push(end_date);
    }

    // Project filter
    let projectFilter = '';
    if (project_id) {
      projectFilter = `AND a.project_id = $${++paramIndex}`;
      params.push(project_id);
    }

    // Get assignments with project and employee details
    const assignmentsQuery = `
      SELECT 
        a.id,
        a.project_id,
        a.employee_id,
        a.role,
        a.allocation_percent,
        a.start_date,
        a.end_date,
        a.override,
        a.override_reason,
        p.name as project_name,
        p.start_date as project_start_date,
        p.end_date as project_end_date,
        p.status as project_status,
        e.employee_id as employee_code,
        pr.first_name,
        pr.last_name,
        pr.email
      FROM assignments a
      JOIN projects p ON p.id = a.project_id
      JOIN employees e ON e.id = a.employee_id
      JOIN profiles pr ON pr.id = e.user_id
      WHERE p.org_id = $1 ${employeeFilter} ${projectFilter} ${dateFilter}
      ORDER BY a.start_date ASC, a.created_at ASC
    `;

    const assignmentsRes = await query(assignmentsQuery, params);
    
    // Format as calendar events
    const events = assignmentsRes.rows.map(assign => ({
      id: assign.id,
      title: `${assign.project_name} - ${assign.first_name} ${assign.last_name} (${assign.allocation_percent}%)`,
      start: assign.start_date || assign.project_start_date,
      end: assign.end_date || assign.project_end_date || null,
      allDay: true,
      resource: {
        type: 'assignment',
        project_id: assign.project_id,
        project_name: assign.project_name,
        employee_id: assign.employee_id,
        employee_name: `${assign.first_name} ${assign.last_name}`,
        employee_email: assign.email,
        allocation_percent: assign.allocation_percent,
        role: assign.role,
        override: assign.override,
        override_reason: assign.override_reason
      }
    }));

    // Get project list (for filter dropdown)
    const projectsQuery = isHROrCEO
      ? `SELECT id, name, status, start_date, end_date FROM projects WHERE org_id = $1 ORDER BY name`
      : `SELECT DISTINCT p.id, p.name, p.status, p.start_date, p.end_date 
         FROM projects p 
         JOIN assignments a ON a.project_id = p.id 
         JOIN employees e ON e.id = a.employee_id 
         WHERE p.org_id = $1 AND e.user_id = $2 
         ORDER BY p.name`;
    const projectsParams = isHROrCEO ? [tenantId] : [tenantId, req.user.id];
    const projectsRes = await query(projectsQuery, projectsParams);
    
    // Get employee list (for HR/CEO filter)
    let employees = [];
    if (isHROrCEO) {
      const empListRes = await query(
        `SELECT e.id, e.employee_id, pr.first_name, pr.last_name, pr.email
         FROM employees e
         JOIN profiles pr ON pr.id = e.user_id
         WHERE e.tenant_id = $1
         ORDER BY pr.first_name, pr.last_name`,
        [tenantId]
      );
      employees = empListRes.rows.map(e => ({
        id: e.id,
        name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
        email: e.email,
        employee_code: e.employee_id
      }));
    } else {
      // For employees, just return their own info
      const empRes = await query(
        `SELECT e.id, e.employee_id, pr.first_name, pr.last_name, pr.email
         FROM employees e
         JOIN profiles pr ON pr.id = e.user_id
         WHERE e.user_id = $1`,
        [req.user.id]
      );
      if (empRes.rows.length > 0) {
        const e = empRes.rows[0];
        employees = [{
          id: e.id,
          name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
          email: e.email,
          employee_code: e.employee_id
        }];
      }
    }

    // Calculate availability periods (gaps between assignments)
    const availabilityPeriods = [];
    if (assignmentsRes.rows.length > 0) {
      const sortedAssignments = [...assignmentsRes.rows].sort((a, b) => {
        const aStart = a.start_date || a.project_start_date;
        const bStart = b.start_date || b.project_start_date;
        return new Date(aStart || 0) - new Date(bStart || 0);
      });

      // Group by employee
      const byEmployee = {};
      sortedAssignments.forEach(assign => {
        if (!byEmployee[assign.employee_id]) {
          byEmployee[assign.employee_id] = [];
        }
        byEmployee[assign.employee_id].push(assign);
      });

      // Calculate gaps for each employee
      Object.entries(byEmployee).forEach(([empId, assigns]) => {
        for (let i = 0; i < assigns.length - 1; i++) {
          const currentEnd = assigns[i].end_date || assigns[i].project_end_date;
          const nextStart = assigns[i + 1].start_date || assigns[i + 1].project_start_date;
          
          if (currentEnd && nextStart) {
            const endDate = new Date(currentEnd);
            const startDate = new Date(nextStart);
            endDate.setDate(endDate.getDate() + 1); // Next day after assignment ends
            
            if (startDate > endDate) {
              // There's a gap
              availabilityPeriods.push({
                employee_id: empId,
                employee_name: assigns[i].first_name + ' ' + assigns[i].last_name,
                start: endDate.toISOString().split('T')[0],
                end: startDate.toISOString().split('T')[0]
              });
            }
          }
        }
      });
    }

    res.json({
      events,
      projects: projectsRes.rows,
      employees,
      availability: availabilityPeriods
    });
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch calendar data' });
  }
});

// Get employee utilization timeline
router.get('/employee/:id/utilization', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    
    // Verify access (employee can see own, HR/CEO can see any)
    const userRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = userRes.rows[0]?.tenant_id;
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director'].includes(userRole);
    
    if (!isHROrCEO) {
      const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
      if (empRes.rows.length === 0 || empRes.rows[0].id !== id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    // Get assignments with date range
    const params = [id];
    let dateFilter = '';
    if (start_date) {
      dateFilter += ` AND (end_date IS NULL OR end_date >= $${params.length + 1}::date)`;
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ` AND (start_date IS NULL OR start_date <= $${params.length + 1}::date)`;
      params.push(end_date);
    }

    const utilRes = await query(
      `SELECT 
        a.id,
        a.project_id,
        a.allocation_percent,
        a.start_date,
        a.end_date,
        p.name as project_name,
        p.start_date as project_start,
        p.end_date as project_end
      FROM assignments a
      JOIN projects p ON p.id = a.project_id
      WHERE a.employee_id = $1 ${dateFilter}
      ORDER BY COALESCE(a.start_date, p.start_date) ASC`,
      params
    );

    // Calculate utilization per day/month
    const timeline = [];
    utilRes.rows.forEach(assign => {
      const start = assign.start_date || assign.project_start;
      const end = assign.end_date || assign.project_end || new Date().toISOString().split('T')[0];
      
      if (start) {
        timeline.push({
          project_id: assign.project_id,
          project_name: assign.project_name,
          allocation_percent: assign.allocation_percent,
          start,
          end
        });
      }
    });

    res.json({ timeline });
  } catch (error) {
    console.error('Error fetching utilization:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch utilization' });
  }
});

export default router;
