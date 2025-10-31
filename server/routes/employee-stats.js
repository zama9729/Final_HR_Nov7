import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get employee-wise statistics for CEO/HR
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get user ID - JWT might use 'id' or 'userId'
    const userId = req.user.id || req.user.userId || req.user.user_id;
    
    if (!userId) {
      console.error('No user ID found in token:', req.user);
      return res.status(403).json({ error: 'User ID not found in token', errors: [] });
    }
    
    // Check user role manually to ensure proper access control
    const roleRes = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [userId]
    );
    const userRole = roleRes.rows[0]?.role;
    
    console.log('Employee stats check:', { userId, userRole, userEmail: req.user.email });
    
    if (!userRole || !['hr', 'director', 'ceo'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions', errors: [] });
    }
    // Get user's tenant_id
    const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
    const tenantId = tenantRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    const { startDate, endDate, employeeId } = req.query;
    
    // Build base query with proper parameterization
    const params = [tenantId];
    let paramIndex = 2;
    
    let whereClause = 'WHERE e.tenant_id = $1 AND e.status = \'active\'';
    let timesheetJoinCondition = '';
    
    if (startDate) {
      timesheetJoinCondition += ` AND t.week_start_date >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      timesheetJoinCondition += ` AND t.week_end_date <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }
    
    if (employeeId) {
      whereClause += ` AND e.id = $${paramIndex}`;
      params.push(employeeId);
      paramIndex++;
    }
    
    let statsQuery = `
      SELECT 
        e.id as employee_id,
        p.first_name || ' ' || p.last_name as employee_name,
        p.email as employee_email,
        e.department,
        e.position,
        COUNT(DISTINCT a.id) as project_count,
        COALESCE(SUM(a.allocation_percent), 0) as total_allocation,
        COUNT(DISTINCT t.id) as timesheet_count,
        COALESCE(SUM(t.total_hours), 0) as total_hours_logged,
        COUNT(DISTINCT te.id) as timesheet_entry_count,
        COUNT(DISTINCT CASE WHEN te.project_id IS NOT NULL THEN te.id END) as billable_entries,
        COUNT(DISTINCT CASE WHEN te.project_type = 'non-billable' THEN te.id END) as non_billable_entries,
        COUNT(DISTINCT CASE WHEN te.project_type = 'internal' THEN te.id END) as internal_entries
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      LEFT JOIN assignments a ON a.employee_id = e.id 
        AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
      LEFT JOIN timesheets t ON t.employee_id = e.id
    `;
    
    if (timesheetJoinCondition) {
      statsQuery += timesheetJoinCondition;
    }
    
    statsQuery += `
      LEFT JOIN timesheet_entries te ON te.timesheet_id = t.id
        AND te.is_holiday = false
      ${whereClause}
      GROUP BY e.id, p.first_name, p.last_name, p.email, e.department, e.position
      ORDER BY employee_name
    `;
    
    const result = await query(statsQuery, params);
    
    // Get project details for each employee
    const statsWithProjects = await Promise.all(result.rows.map(async (emp) => {
      const projectsRes = await query(
        `SELECT 
          p.id as project_id,
          p.name as project_name,
          a.role,
          a.allocation_percent,
          a.start_date,
          a.end_date
        FROM assignments a
        JOIN projects p ON p.id = a.project_id
        WHERE a.employee_id = $1
          AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
        ORDER BY a.start_date DESC`,
        [emp.employee_id]
      );
      
      return {
        ...emp,
        projects: projectsRes.rows,
      };
    }));
    
    res.json(statsWithProjects);
  } catch (error) {
    console.error('Error fetching employee stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

