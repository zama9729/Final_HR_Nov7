import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all projects for the organization
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = tenantRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // Get all projects for the organization with assignment counts
    const projectsRes = await query(
      `SELECT 
        p.id,
        p.name,
        p.start_date,
        p.end_date,
        p.priority,
        p.expected_allocation_percent,
        p.location,
        p.required_skills,
        p.required_certifications,
        p.created_at,
        COUNT(DISTINCT a.id) as assignment_count,
        COALESCE(SUM(a.allocation_percent), 0) as total_allocation
      FROM projects p
      LEFT JOIN assignments a ON a.project_id = p.id 
        AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
      WHERE p.org_id = $1
      GROUP BY p.id, p.name, p.start_date, p.end_date, p.priority, p.expected_allocation_percent, p.location, p.required_skills, p.required_certifications, p.created_at
      ORDER BY p.created_at DESC`,
      [tenantId]
    );
    
    res.json(projectsRes.rows);
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch projects' });
  }
});

// Create project
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, start_date, end_date, required_skills, required_certifications, priority, expected_allocation_percent, location } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'name required' });
    }
    const t = await query('SELECT tenant_id FROM profiles WHERE id=$1', [req.user.id]);
    const org = t.rows[0]?.tenant_id;
    if (!org) {
      return res.status(403).json({ error: 'No org' });
    }
    
    // Ensure required_skills is a valid JSON array (not double-encoded)
    let skillsJson = required_skills || [];
    // If it's already a string, try to parse it (could be double-encoded)
    if (typeof skillsJson === 'string') {
      try {
        skillsJson = JSON.parse(skillsJson);
        // If parsing returns a string, it was double-encoded, parse again
        if (typeof skillsJson === 'string') {
          skillsJson = JSON.parse(skillsJson);
        }
      } catch (e) {
        console.error('Error parsing required_skills:', e, 'Raw:', skillsJson);
        return res.status(400).json({ error: 'Invalid required_skills format' });
      }
    }
    if (!Array.isArray(skillsJson)) {
      return res.status(400).json({ error: 'required_skills must be an array' });
    }
    
    const result = await query(
      `INSERT INTO projects (org_id, name, start_date, end_date, required_skills, required_certifications, priority, expected_allocation_percent, location)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
       RETURNING *`,
      [org, name, start_date || null, end_date || null, JSON.stringify(skillsJson), required_certifications || [], priority || 0, expected_allocation_percent || 50, location || null]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: error.message || 'Failed to create project' });
  }
});

// Suggest candidates (delegates to AI service)
router.post('/:id/suggest-candidates', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const projectRes = await query('SELECT * FROM projects WHERE id = $1', [id]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const project = projectRes.rows[0];
    const { suggestCandidates } = await import('../services/ai/suggester.js');
    const suggestions = await suggestCandidates(project, req.body || {});
    
    // Save logs with proper JSONB formatting
    await query(
      'INSERT INTO ai_suggestion_logs (project_id, request_payload, response_payload, computed_by) VALUES ($1,$2::jsonb,$3::jsonb,$4)',
      [id, JSON.stringify(req.body || {}), JSON.stringify(suggestions), 'ai-suggester-v1']
    );
    
    res.json({ candidates: suggestions });
  } catch (error) {
    console.error('Error suggesting candidates:', error);
    res.status(500).json({ error: error.message || 'Failed to suggest candidates' });
  }
});

// Get project by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = tenantRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    const projectRes = await query(
      'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
      [id, tenantId]
    );
    
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(projectRes.rows[0]);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch project' });
  }
});

// Update project
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, start_date, end_date, required_skills, required_certifications, priority, expected_allocation_percent, location } = req.body || {};
    
    const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = tenantRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // Verify project belongs to organization
    const projectRes = await query('SELECT * FROM projects WHERE id = $1 AND org_id = $2', [id, tenantId]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(name);
    }
    if (start_date !== undefined) {
      updates.push(`start_date = $${paramIndex++}`);
      params.push(start_date || null);
    }
    if (end_date !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      params.push(end_date || null);
    }
    if (required_skills !== undefined) {
      let skillsJson = required_skills;
      if (typeof skillsJson === 'string') {
        try {
          skillsJson = JSON.parse(skillsJson);
          if (typeof skillsJson === 'string') {
            skillsJson = JSON.parse(skillsJson);
          }
        } catch (e) {
          return res.status(400).json({ error: 'Invalid required_skills format' });
        }
      }
      if (!Array.isArray(skillsJson)) {
        return res.status(400).json({ error: 'required_skills must be an array' });
      }
      updates.push(`required_skills = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(skillsJson));
    }
    if (required_certifications !== undefined) {
      updates.push(`required_certifications = $${paramIndex++}`);
      params.push(required_certifications || []);
    }
    if (priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(priority);
    }
    if (expected_allocation_percent !== undefined) {
      updates.push(`expected_allocation_percent = $${paramIndex++}`);
      params.push(expected_allocation_percent);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramIndex++}`);
      params.push(location || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = now()`);
    params.push(id, tenantId);
    
    const updateQuery = `
      UPDATE projects 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex++} AND org_id = $${paramIndex++}
      RETURNING *
    `;
    
    const result = await query(updateQuery, params);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: error.message || 'Failed to update project' });
  }
});

// Delete project
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = tenantRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // Verify project belongs to organization
    const projectRes = await query('SELECT * FROM projects WHERE id = $1 AND org_id = $2', [id, tenantId]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Delete project (assignments will be handled by CASCADE or manual cleanup)
    await query('DELETE FROM projects WHERE id = $1 AND org_id = $2', [id, tenantId]);
    
    res.json({ success: true, message: 'Project deleted successfully' });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: error.message || 'Failed to delete project' });
  }
});

// Get assigned employees for a project
router.get('/:id/assignments', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = tenantRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // Verify project belongs to organization
    const projectRes = await query('SELECT * FROM projects WHERE id = $1 AND org_id = $2', [id, tenantId]);
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get all assignments with employee details
    const assignmentsRes = await query(
      `SELECT 
        a.id as assignment_id,
        a.role,
        a.allocation_percent,
        a.start_date,
        a.end_date,
        a.override,
        a.override_reason,
        a.created_at as assigned_at,
        e.id as employee_id,
        p.first_name || ' ' || p.last_name as employee_name,
        p.email as employee_email,
        e.department,
        e.position,
        e.state,
        e.work_mode
      FROM assignments a
      JOIN employees e ON e.id = a.employee_id
      JOIN profiles p ON p.id = e.user_id
      WHERE a.project_id = $1
        AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)
      ORDER BY a.created_at DESC`,
      [id]
    );
    
    res.json(assignmentsRes.rows);
  } catch (error) {
    console.error('Error fetching assignments:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch assignments' });
  }
});

// Assign candidate
router.post('/:id/assign', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { employee_id, allocation_percent, role, start_date, end_date, override, override_reason } = req.body || {};
  if (!employee_id || !allocation_percent) return res.status(400).json({ error: 'employee_id and allocation_percent required' });

  // Check utilization
  const utilRes = await query(
    `SELECT COALESCE(SUM(allocation_percent),0) AS alloc
     FROM assignments
     WHERE employee_id = $1 AND (end_date IS NULL OR end_date >= now()::date)`,
    [employee_id]
  );
  const currentAlloc = Number(utilRes.rows[0]?.alloc || 0);
  if (!override && currentAlloc + Number(allocation_percent) > 100) {
    return res.status(409).json({ error: 'Utilization would exceed 100%', currentAlloc });
  }

  const result = await query(
    `INSERT INTO assignments (project_id, employee_id, role, allocation_percent, start_date, end_date, assigned_by, override, override_reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [id, employee_id, role || null, allocation_percent, start_date || null, end_date || null, req.user.id, !!override, override ? (override_reason || 'HR override') : null]
  );

  // Award benefit points (simple rule: 10 per month at creation time)
  await query('INSERT INTO benefit_points (employee_id, points, reason, project_id) VALUES ($1,$2,$3,$4)', [employee_id, 10, 'Project assignment', id]);

  res.json(result.rows[0]);
});

// Deallocate (end assignment)
router.post('/:id/deallocate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { assignment_id, end_date, reason } = req.body || {};
    
    if (!assignment_id) {
      return res.status(400).json({ error: 'assignment_id required' });
    }
    
    const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = tenantRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // Verify assignment belongs to project and organization
    const assignRes = await query(
      `SELECT a.* FROM assignments a
       JOIN projects p ON p.id = a.project_id
       WHERE a.id = $1 AND a.project_id = $2 AND p.org_id = $3`,
      [assignment_id, id, tenantId]
    );
    
    if (assignRes.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    // End the assignment
    const endDate = end_date || new Date().toISOString().split('T')[0];
    await query(
      `UPDATE assignments 
       SET end_date = $1, updated_at = now()
       WHERE id = $2`,
      [endDate, assignment_id]
    );
    
    res.json({ success: true, message: 'Assignment deallocated successfully' });
  } catch (error) {
    console.error('Error deallocating assignment:', error);
    res.status(500).json({ error: error.message || 'Failed to deallocate assignment' });
  }
});

// Replace assignment (end one and create another)
router.post('/:id/replace', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      old_assignment_id, 
      new_employee_id, 
      allocation_percent, 
      role, 
      start_date, 
      end_date, 
      override, 
      override_reason,
      reason 
    } = req.body || {};
    
    if (!old_assignment_id || !new_employee_id || !allocation_percent) {
      return res.status(400).json({ error: 'old_assignment_id, new_employee_id, and allocation_percent required' });
    }
    
    const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = tenantRes.rows[0]?.tenant_id;
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // Verify old assignment belongs to project and organization
    const oldAssignRes = await query(
      `SELECT a.* FROM assignments a
       JOIN projects p ON p.id = a.project_id
       WHERE a.id = $1 AND a.project_id = $2 AND p.org_id = $3`,
      [old_assignment_id, id, tenantId]
    );
    
    if (oldAssignRes.rows.length === 0) {
      return res.status(404).json({ error: 'Old assignment not found' });
    }
    
    // Check new employee utilization
    const utilRes = await query(
      `SELECT COALESCE(SUM(allocation_percent),0) AS alloc
       FROM assignments
       WHERE employee_id = $1 AND (end_date IS NULL OR end_date >= now()::date)`,
      [new_employee_id]
    );
    const currentAlloc = Number(utilRes.rows[0]?.alloc || 0);
    if (!override && currentAlloc + Number(allocation_percent) > 100) {
      return res.status(409).json({ error: 'Utilization would exceed 100%', currentAlloc });
    }
    
    await query('BEGIN');
    
    try {
      // End old assignment
      const endDate = new Date().toISOString().split('T')[0];
      await query(
        `UPDATE assignments 
         SET end_date = $1, updated_at = now()
         WHERE id = $2`,
        [endDate, old_assignment_id]
      );
      
      // Create new assignment
      const newAssignRes = await query(
        `INSERT INTO assignments (project_id, employee_id, role, allocation_percent, start_date, end_date, assigned_by, override, override_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         RETURNING *`,
        [id, new_employee_id, role || null, allocation_percent, start_date || endDate, end_date || null, req.user.id, !!override, override ? (override_reason || 'HR override') : null]
      );
      
      // Award benefit points to new employee
      await query('INSERT INTO benefit_points (employee_id, points, reason, project_id) VALUES ($1,$2,$3,$4)', 
        [new_employee_id, 10, 'Project assignment (replacement)', id]);
      
      await query('COMMIT');
      
      res.json({ 
        success: true, 
        message: 'Assignment replaced successfully',
        new_assignment: newAssignRes.rows[0]
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error replacing assignment:', error);
    res.status(500).json({ error: error.message || 'Failed to replace assignment' });
  }
});

export default router;


