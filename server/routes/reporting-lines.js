import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// Ensure reporting infrastructure exists
let ensureReportingInfraPromise = null;
const ensureReportingInfra = async () => {
  if (ensureReportingInfraPromise) return ensureReportingInfraPromise;
  ensureReportingInfraPromise = (async () => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.join(process.cwd(), 'server', 'db', 'migrations', '20250131_team_project_allocation.sql');
      if (fs.existsSync(migrationPath)) {
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        await query(migrationSQL);
      }
    } catch (err) {
      console.error('Error ensuring reporting infrastructure:', err);
    }
  })();
  return ensureReportingInfraPromise;
};

// GET /api/reporting-lines/employee/:employeeId - Get reporting structure for employee
router.get('/employee/:employeeId', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureReportingInfra();
    const { employeeId } = req.params;
    const orgId = req.orgId;
    
    // Verify employee belongs to org
    const empResult = await queryWithOrg(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, orgId],
      orgId
    );
    
    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Get all reporting lines for this employee
    const result = await queryWithOrg(
      `SELECT 
         rl.*,
         m.id as manager_employee_id,
         mp.first_name || ' ' || mp.last_name as manager_name,
         mp.email as manager_email,
         me.position as manager_position,
         t.name as team_name,
         t.team_type
       FROM reporting_lines rl
       JOIN employees m ON m.id = rl.manager_id
       JOIN profiles mp ON mp.id = m.user_id
       LEFT JOIN employees me ON me.id = m.id
       LEFT JOIN teams t ON t.id = rl.team_id
       WHERE rl.employee_id = $1 AND rl.org_id = $2 AND rl.end_date IS NULL
       ORDER BY 
         CASE rl.relationship_type
           WHEN 'PRIMARY_MANAGER' THEN 1
           WHEN 'SECONDARY_MANAGER' THEN 2
           WHEN 'PROJECT_MANAGER' THEN 3
         END`,
      [employeeId, orgId],
      orgId
    );
    
    res.json({ reporting_lines: result.rows });
  } catch (error) {
    console.error('Error fetching reporting lines:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch reporting lines' });
  }
});

// GET /api/reporting-lines/manager/:managerId - Get direct reports for manager
router.get('/manager/:managerId', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureReportingInfra();
    const { managerId } = req.params;
    const orgId = req.orgId;
    const { relationship_type } = req.query;
    
    let filters = ['rl.manager_id = $1', 'rl.org_id = $2', 'rl.end_date IS NULL'];
    const params = [managerId, orgId];
    let paramIndex = 3;
    
    if (relationship_type) {
      filters.push(`rl.relationship_type = $${paramIndex++}::reporting_relationship_type`);
      params.push(relationship_type);
    }
    
    const result = await queryWithOrg(
      `SELECT 
         rl.*,
         e.id as employee_id,
         p.first_name || ' ' || p.last_name as employee_name,
         p.email as employee_email,
         e.position,
         e.department,
         t.name as team_name,
         t.team_type
       FROM reporting_lines rl
       JOIN employees e ON e.id = rl.employee_id
       JOIN profiles p ON p.id = e.user_id
       LEFT JOIN teams t ON t.id = rl.team_id
       WHERE ${filters.join(' AND ')}
       ORDER BY rl.relationship_type, employee_name`,
      params,
      orgId
    );
    
    res.json({ direct_reports: result.rows });
  } catch (error) {
    console.error('Error fetching direct reports:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch direct reports' });
  }
});

// POST /api/reporting-lines/set-primary-manager - Set primary manager
router.post('/set-primary-manager', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureReportingInfra();
    const { employee_id, manager_id, start_date } = req.body;
    const orgId = req.orgId;
    
    if (!employee_id || !manager_id) {
      return res.status(400).json({ error: 'employee_id and manager_id are required' });
    }
    
    // Verify both employees exist and belong to org
    const empCheck = await queryWithOrg(
      'SELECT id FROM employees WHERE id IN ($1, $2) AND tenant_id = $3',
      [employee_id, manager_id, orgId],
      orgId
    );
    
    if (empCheck.rows.length !== 2) {
      return res.status(404).json({ error: 'Employee or manager not found' });
    }
    
    // Prevent self-reporting
    if (employee_id === manager_id) {
      return res.status(400).json({ error: 'Employee cannot report to themselves' });
    }
    
    // The trigger will automatically close existing PRIMARY_MANAGER relationships
    const result = await queryWithOrg(
      `INSERT INTO reporting_lines (
        org_id, employee_id, manager_id, relationship_type, start_date
      ) VALUES ($1, $2, $3, 'PRIMARY_MANAGER', $4)
      RETURNING *`,
      [
        orgId,
        employee_id,
        manager_id,
        start_date || new Date().toISOString().split('T')[0],
      ],
      orgId
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error setting primary manager:', error);
    res.status(500).json({ error: error.message || 'Failed to set primary manager' });
  }
});

// POST /api/reporting-lines/add-secondary-manager - Add secondary manager
router.post('/add-secondary-manager', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureReportingInfra();
    const { employee_id, manager_id, team_id, start_date } = req.body;
    const orgId = req.orgId;
    
    if (!employee_id || !manager_id) {
      return res.status(400).json({ error: 'employee_id and manager_id are required' });
    }
    
    // Verify employees exist
    const empCheck = await queryWithOrg(
      'SELECT id FROM employees WHERE id IN ($1, $2) AND tenant_id = $3',
      [employee_id, manager_id, orgId],
      orgId
    );
    
    if (empCheck.rows.length !== 2) {
      return res.status(404).json({ error: 'Employee or manager not found' });
    }
    
    const result = await queryWithOrg(
      `INSERT INTO reporting_lines (
        org_id, employee_id, manager_id, relationship_type, team_id, start_date
      ) VALUES ($1, $2, $3, 'SECONDARY_MANAGER', $4, $5)
      RETURNING *`,
      [
        orgId,
        employee_id,
        manager_id,
        team_id || null,
        start_date || new Date().toISOString().split('T')[0],
      ],
      orgId
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding secondary manager:', error);
    res.status(500).json({ error: error.message || 'Failed to add secondary manager' });
  }
});

// POST /api/reporting-lines/remove-manager - Remove manager relationship
router.post('/remove-manager', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureReportingInfra();
    const { reporting_line_id, end_date } = req.body;
    const orgId = req.orgId;
    
    if (!reporting_line_id) {
      return res.status(400).json({ error: 'reporting_line_id is required' });
    }
    
    // Verify reporting line exists and belongs to org
    const lineResult = await queryWithOrg(
      'SELECT * FROM reporting_lines WHERE id = $1 AND org_id = $2',
      [reporting_line_id, orgId],
      orgId
    );
    
    if (lineResult.rows.length === 0) {
      return res.status(404).json({ error: 'Reporting line not found' });
    }
    
    const line = lineResult.rows[0];
    
    // Don't allow removing PRIMARY_MANAGER without replacement
    if (line.relationship_type === 'PRIMARY_MANAGER') {
      return res.status(400).json({ 
        error: 'Cannot remove primary manager. Use set-primary-manager to change it.' 
      });
    }
    
    // End the relationship
    const result = await queryWithOrg(
      `UPDATE reporting_lines
       SET end_date = $1, updated_at = now()
       WHERE id = $2 AND org_id = $3
       RETURNING *`,
      [
        end_date || new Date().toISOString().split('T')[0],
        reporting_line_id,
        orgId,
      ],
      orgId
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error removing manager:', error);
    res.status(500).json({ error: error.message || 'Failed to remove manager' });
  }
});

export default router;



