import express from 'express';
import { query, withClient } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get employee projects - returns active project allocations (for Dashboard) or past projects (for Profile)
// Query param ?type=past returns past projects, otherwise returns active allocations
router.get('/employees/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.query; // 'past' for past projects, otherwise active allocations
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: empTenant, user_id: empUserId } = empRes.rows[0];
    if (!empTenant) {
      return res.status(400).json({ error: 'Employee has no tenant assigned' });
    }
    
    // Check requester's tenant and role
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== empTenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole?.toLowerCase());
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: only CEO/HR or employee can view projects' });
    }
    
    if (type === 'past') {
      // Return past projects from employee_projects
      const result = await withClient(async (client) => {
        return client.query(
          `SELECT ep.*
           FROM employee_projects ep
           JOIN employees e ON e.id = ep.employee_id
           WHERE ep.employee_id = $1 AND e.tenant_id = $2
           ORDER BY ep.start_date DESC NULLS LAST`,
          [id, empTenant]
        );
      }, empTenant);
      return res.json(result.rows || []);
    } else {
      // Return active project allocations from project_allocations
      const result = await withClient(async (client) => {
        return client.query(
          `SELECT 
            pa.project_id as id,
            pa.project_id,
            p.name as project_name,
            p.name,
            p.code as project_code,
            pa.role_on_project as role,
            pa.percent_allocation as allocation_percent,
            pa.start_date,
            pa.end_date,
            pa.allocation_type
           FROM project_allocations pa
           JOIN projects p ON p.id = pa.project_id
           JOIN employees e ON e.id = pa.employee_id
           WHERE pa.employee_id = $1 
             AND pa.org_id = $2
             AND (pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE)
           ORDER BY pa.start_date DESC`,
          [id, empTenant]
        );
      }, empTenant);
      return res.json(result.rows || []);
    }
  } catch (error) {
    console.error('Error fetching employee projects:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch employee projects' });
  }
});

router.post('/employees/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { project_name, role, start_date, end_date, technologies, description } = req.body || {};
    if (!project_name) return res.status(400).json({ error: 'project_name required' });
    
    // Get employee info and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: tenant, user_id: empUserId } = empRes.rows[0];
    
    // Check permissions
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== tenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: can only edit own past projects' });
    }
    
    const result = await withClient(async (client) => client.query(
      `INSERT INTO employee_projects (employee_id, project_name, role, start_date, end_date, technologies, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *`,
      [id, project_name, role || null, start_date || null, end_date || null, Array.isArray(technologies) ? technologies : [], description || null]
    ), tenant);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving past project:', error);
    res.status(500).json({ error: error.message || 'Failed to save past project' });
  }
});

// Update past project
router.put('/employees/:id/projects/:projectId', authenticateToken, async (req, res) => {
  try {
    const { id, projectId } = req.params;
    const { project_name, role, start_date, end_date, technologies, description } = req.body || {};
    
    // Get employee info and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: tenant, user_id: empUserId } = empRes.rows[0];
    
    // Check permissions
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== tenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: can only edit own past projects' });
    }
    
    const result = await withClient(async (client) => {
      return client.query(
        `UPDATE employee_projects ep
         SET project_name = COALESCE($1, ep.project_name),
             role = $2,
             start_date = $3,
             end_date = $4,
             technologies = $5,
             description = $6,
             updated_at = now()
         FROM employees e
         WHERE ep.id = $7
           AND ep.employee_id = $8
           AND e.id = ep.employee_id
           AND e.tenant_id = $9
         RETURNING ep.*`,
        [
          project_name || null, 
          role || null, 
          start_date || null, 
          end_date || null, 
          Array.isArray(technologies) ? technologies : (technologies || []), 
          description || null, 
          projectId, 
          id, 
          tenant
        ]
      );
    }, tenant);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Past project not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating past project:', error);
    res.status(500).json({ error: error.message || 'Failed to update past project' });
  }
});

// Delete past project
router.delete('/employees/:id/projects/:projectId', authenticateToken, async (req, res) => {
  try {
    const { id, projectId } = req.params;
    
    // Get employee info and check permissions
    const empRes = await query('SELECT tenant_id, user_id FROM employees WHERE id = $1', [id]);
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const { tenant_id: tenant, user_id: empUserId } = empRes.rows[0];
    
    // Check permissions
    const reqProfile = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const reqTenant = reqProfile.rows[0]?.tenant_id;
    if (!reqTenant || reqTenant !== tenant) {
      return res.status(403).json({ error: 'Unauthorized: different organization' });
    }
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);
    const isOwnProfile = empUserId === req.user.id;
    
    if (!isHROrCEO && !isOwnProfile) {
      return res.status(403).json({ error: 'Unauthorized: can only delete own past projects' });
    }
    
    const result = await withClient(async (client) => {
      return client.query(
        `DELETE FROM employee_projects ep
         USING employees e
         WHERE ep.id = $1
           AND ep.employee_id = $2
           AND e.id = ep.employee_id
           AND e.tenant_id = $3
         RETURNING ep.id`,
        [projectId, id, tenant]
      );
    }, tenant);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Past project not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting past project:', error);
    res.status(500).json({ error: error.message || 'Failed to delete past project' });
  }
});

export default router;


