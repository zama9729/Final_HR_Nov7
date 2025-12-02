import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { createProjectAssignmentEvent, createProjectEndEvent } from '../utils/employee-events.js';

const router = express.Router();

// Ensure project infrastructure exists
let ensureProjectInfraPromise = null;
const ensureProjectInfra = async () => {
  if (ensureProjectInfraPromise) return ensureProjectInfraPromise;
  ensureProjectInfraPromise = (async () => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.join(process.cwd(), 'server', 'db', 'migrations', '20250131_team_project_allocation.sql');
      if (fs.existsSync(migrationPath)) {
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        await query(migrationSQL);
      }
    } catch (err) {
      console.error('Error ensuring project infrastructure:', err);
    }
  })();
  return ensureProjectInfraPromise;
};

// Get all projects for the organization
router.get('/', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureProjectInfra();
    const orgId = req.orgId;
    const { status, search } = req.query;
    
    let filters = ['p.org_id = $1'];
    const params = [orgId];
    let paramIndex = 2;
    
    if (status) {
      filters.push(`p.status = $${paramIndex++}`);
      params.push(status);
    }
    
    if (search) {
      filters.push(`(p.name ILIKE $${paramIndex} OR p.code ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // Get all projects with assignment counts and manager info
    const projectsRes = await queryWithOrg(
      `SELECT 
        p.id,
        p.name,
        p.code,
        p.description,
        p.start_date,
        p.end_date,
        p.priority,
        p.expected_allocation_percent,
        p.location,
        p.required_skills,
        p.required_certifications,
        p.status,
        p.project_manager_id,
        p.team_id,
        pm.first_name || ' ' || pm.last_name as project_manager_name,
        pm.email as project_manager_email,
        t.name as team_name,
        COUNT(DISTINCT pa.id) as allocation_count,
        COALESCE(SUM(pa.percent_allocation), 0) as total_allocation,
        p.created_at
      FROM projects p
      LEFT JOIN employees pm_emp ON pm_emp.id = p.project_manager_id
      LEFT JOIN profiles pm ON pm.id = pm_emp.user_id
      LEFT JOIN teams t ON t.id = p.team_id
      LEFT JOIN project_allocations pa ON pa.project_id = p.id 
        AND (pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE)
      WHERE ${filters.join(' AND ')}
      GROUP BY p.id, p.name, p.code, p.description, p.start_date, p.end_date, p.priority, 
               p.expected_allocation_percent, p.location, p.required_skills, p.required_certifications,
               p.status, p.project_manager_id, p.team_id, pm.first_name, pm.last_name, pm.email, t.name, p.created_at
      ORDER BY p.created_at DESC`,
      params,
      orgId
    );
    
    res.json({ projects: projectsRes.rows });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch projects' });
  }
});

// Create project
router.post('/', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureProjectInfra();
    const orgId = req.orgId;
    const { 
      name, 
      code,
      description,
      start_date, 
      end_date, 
      required_skills, 
      required_certifications, 
      priority, 
      expected_allocation_percent, 
      location,
      project_manager_id,
      team_id,
      status = 'PLANNED'
    } = req.body || {};
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    if (!['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    // Ensure required_skills is a valid JSON array
    let skillsJson = required_skills || [];
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
    
    // Generate code if not provided
    let projectCode = code;
    if (!projectCode) {
      const codeResult = await queryWithOrg(
        `SELECT COUNT(*) + 1 as next_num FROM projects WHERE org_id = $1`,
        [orgId],
        orgId
      );
      projectCode = `PROJ-${String(codeResult.rows[0].next_num).padStart(3, '0')}`;
    }
    
    // If team_id is provided, verify it exists and is a PROJECT team
    if (team_id) {
      const teamResult = await queryWithOrg(
        'SELECT team_type FROM teams WHERE id = $1 AND org_id = $2',
        [team_id, orgId],
        orgId
      );
      if (teamResult.rows.length === 0) {
        return res.status(404).json({ error: 'Team not found' });
      }
      if (teamResult.rows[0].team_type !== 'PROJECT') {
        return res.status(400).json({ error: 'Team must be of type PROJECT' });
      }
    } else {
      // Create a project team automatically
      const teamResult = await queryWithOrg(
        `INSERT INTO teams (org_id, name, code, team_type, description, is_active)
         VALUES ($1, $2, $3, 'PROJECT', $4, true)
         RETURNING id`,
        [orgId, `${name} Team`, `${projectCode}-TEAM`, description || null],
        orgId
      );
      team_id = teamResult.rows[0].id;
    }
    
    const result = await queryWithOrg(
      `INSERT INTO projects (
        org_id, name, code, description, start_date, end_date, required_skills, 
        required_certifications, priority, expected_allocation_percent, location,
        project_manager_id, team_id, status
      )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14::project_status)
       RETURNING *`,
      [
        orgId, 
        name, 
        projectCode,
        description || null,
        start_date || null, 
        end_date || null, 
        JSON.stringify(skillsJson), 
        required_certifications || [], 
        priority || 0, 
        expected_allocation_percent || 50, 
        location || null,
        project_manager_id || null,
        team_id,
        status
      ],
      orgId
    );
    
    res.status(201).json(result.rows[0]);
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
router.get('/:id', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureProjectInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    const projectRes = await queryWithOrg(
      `SELECT 
         p.*,
         p.project_manager_id,
         p.team_id,
         pm.first_name || ' ' || pm.last_name as project_manager_name,
         pm.email as project_manager_email,
         t.name as team_name
       FROM projects p
       LEFT JOIN employees pm_emp ON pm_emp.id = p.project_manager_id
       LEFT JOIN profiles pm ON pm.id = pm_emp.user_id
       LEFT JOIN teams t ON t.id = p.team_id
       WHERE p.id = $1 AND p.org_id = $2`,
      [id, orgId],
      orgId
    );
    
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get project allocations
    const allocationsResult = await queryWithOrg(
      `SELECT 
         pa.*,
         e.id as employee_id,
         p.first_name || ' ' || p.last_name as employee_name,
         p.email as employee_email,
         e.position,
         e.department,
         -- Get employee's primary team
         (SELECT t.name FROM team_memberships tm
          JOIN teams t ON t.id = tm.team_id
          WHERE tm.employee_id = e.id AND tm.is_primary = true AND tm.end_date IS NULL
          LIMIT 1) as primary_team_name,
         -- Get employee's primary manager
         (SELECT mp.first_name || ' ' || mp.last_name FROM reporting_lines rl
          JOIN employees m ON m.id = rl.manager_id
          JOIN profiles mp ON mp.id = m.user_id
          WHERE rl.employee_id = e.id AND rl.relationship_type = 'PRIMARY_MANAGER' AND rl.end_date IS NULL
          LIMIT 1) as primary_manager_name
       FROM project_allocations pa
       JOIN employees e ON e.id = pa.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE pa.project_id = $1 AND pa.org_id = $2 AND (pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE)
       ORDER BY pa.start_date DESC`,
      [id, orgId],
      orgId
    );
    
    res.json({
      ...projectRes.rows[0],
      allocations: allocationsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch project' });
  }
});

// Update project
router.patch('/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureProjectInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    const { 
      name, 
      code,
      description,
      start_date, 
      end_date, 
      required_skills, 
      required_certifications, 
      priority, 
      expected_allocation_percent, 
      location,
      project_manager_id,
      team_id,
      status
    } = req.body || {};
    
    // Verify project belongs to organization
    const projectRes = await queryWithOrg(
      'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );
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
    if (code !== undefined) {
      updates.push(`code = $${paramIndex++}`);
      params.push(code);
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(description || null);
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
    if (project_manager_id !== undefined) {
      updates.push(`project_manager_id = $${paramIndex++}`);
      params.push(project_manager_id || null);
    }
    if (team_id !== undefined) {
      // Verify team exists and is PROJECT type
      if (team_id) {
        const teamResult = await queryWithOrg(
          'SELECT team_type FROM teams WHERE id = $1 AND org_id = $2',
          [team_id, orgId],
          orgId
        );
        if (teamResult.rows.length === 0) {
          return res.status(404).json({ error: 'Team not found' });
        }
        if (teamResult.rows[0].team_type !== 'PROJECT') {
          return res.status(400).json({ error: 'Team must be of type PROJECT' });
        }
      }
      updates.push(`team_id = $${paramIndex++}`);
      params.push(team_id || null);
    }
    if (status !== undefined) {
      if (!['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      updates.push(`status = $${paramIndex++}::project_status`);
      params.push(status);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = now()`);
    params.push(id, orgId);
    
    const result = await queryWithOrg(
      `UPDATE projects 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND org_id = $${paramIndex++}
       RETURNING *`,
      params,
      orgId
    );
    
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

// GET /api/projects/:id/members - Get project members (from project_allocations)
router.get('/:id/members', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureProjectInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    // Verify project belongs to organization
    const projectRes = await queryWithOrg(
      'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Get all project allocations with employee details
    const allocationsRes = await queryWithOrg(
      `SELECT 
        pa.*,
        e.id as employee_id,
        p.first_name || ' ' || p.last_name as employee_name,
        p.email as employee_email,
        e.position,
        e.department,
        -- Get employee's primary team
        (SELECT t.name FROM team_memberships tm
         JOIN teams t ON t.id = tm.team_id
         WHERE tm.employee_id = e.id AND tm.is_primary = true AND tm.end_date IS NULL
         LIMIT 1) as primary_team_name,
        -- Get employee's primary manager
        (SELECT mp.first_name || ' ' || mp.last_name FROM reporting_lines rl
         JOIN employees m ON m.id = rl.manager_id
         JOIN profiles mp ON mp.id = m.user_id
         WHERE rl.employee_id = e.id AND rl.relationship_type = 'PRIMARY_MANAGER' AND rl.end_date IS NULL
         LIMIT 1) as primary_manager_name
      FROM project_allocations pa
      JOIN employees e ON e.id = pa.employee_id
      JOIN profiles p ON p.id = e.user_id
      WHERE pa.project_id = $1 AND pa.org_id = $2
        AND (pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE)
      ORDER BY pa.created_at DESC`,
      [id, orgId],
      orgId
    );
    
    res.json({ members: allocationsRes.rows });
  } catch (error) {
    console.error('Error fetching project members:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch project members' });
  }
});

// Legacy endpoint for backward compatibility
router.get('/:id/assignments', authenticateToken, setTenantContext, async (req, res) => {
  // Redirect to members endpoint
  req.url = req.url.replace('/assignments', '/members');
  return router.handle(req, res);
});

// POST /api/projects/:id/allocations - Create project allocation
router.post('/:id/allocations', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureProjectInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    const { 
      employee_id, 
      allocation_type = 'PART_TIME',
      percent_allocation,
      start_date,
      end_date,
      role_on_project
    } = req.body;
    
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' });
    }
    
    if (!['FULL_TIME', 'PART_TIME', 'AD_HOC'].includes(allocation_type)) {
      return res.status(400).json({ error: 'Invalid allocation_type' });
    }
    
    // Verify project exists
    const projectRes = await queryWithOrg(
      'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );
    if (projectRes.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Verify employee exists
    const empRes = await queryWithOrg(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employee_id, orgId],
      orgId
    );
    if (empRes.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // Check utilization if percent_allocation is provided
    if (percent_allocation !== undefined && percent_allocation !== null) {
      const utilRes = await queryWithOrg(
        `SELECT COALESCE(SUM(percent_allocation), 0) AS alloc
         FROM project_allocations
         WHERE employee_id = $1 AND org_id = $2 AND (end_date IS NULL OR end_date >= CURRENT_DATE)`,
        [employee_id, orgId],
        orgId
      );
      const currentAlloc = Number(utilRes.rows[0]?.alloc || 0);
      if (currentAlloc + Number(percent_allocation) > 100) {
        return res.status(409).json({ 
          error: 'Total allocation would exceed 100%', 
          current_allocation: currentAlloc 
        });
      }
    }
    
    const result = await queryWithOrg(
      `INSERT INTO project_allocations (
        org_id, project_id, employee_id, allocation_type, percent_allocation,
        start_date, end_date, role_on_project
      ) VALUES ($1, $2, $3, $4::allocation_type, $5, $6, $7, $8)
      RETURNING *`,
      [
        orgId,
        id,
        employee_id,
        allocation_type,
        percent_allocation || null,
        start_date || new Date().toISOString().split('T')[0],
        end_date || null,
        role_on_project || null,
      ],
      orgId
    );
    
    // Create PROJECT_ASSIGNMENT event
    try {
      const project = projectRes.rows[0];
      await createProjectAssignmentEvent(orgId, employee_id, result.rows[0], project);
    } catch (eventError) {
      console.error('Error creating project assignment event:', eventError);
      // Don't fail allocation creation if event creation fails
    }
    
    // The trigger will automatically create PROJECT_MANAGER reporting line
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating project allocation:', error);
    res.status(500).json({ error: error.message || 'Failed to create project allocation' });
  }
});

// Legacy endpoint for backward compatibility
router.post('/:id/assign', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  const { employee_id, allocation_percent, role, start_date, end_date } = req.body || {};
  if (!employee_id || !allocation_percent) {
    return res.status(400).json({ error: 'employee_id and allocation_percent required' });
  }
  
  // Convert to new format
  req.body = {
    employee_id,
    allocation_type: allocation_percent >= 100 ? 'FULL_TIME' : 'PART_TIME',
    percent_allocation: allocation_percent,
    role_on_project: role,
    start_date,
    end_date,
  };
  
  return router.handle({ ...req, url: req.url.replace('/assign', '/allocations'), method: 'POST' }, res);
});

// PATCH /api/projects/:id/allocations/:allocId - Update project allocation
router.patch('/:id/allocations/:allocId', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureProjectInfra();
    const { id, allocId } = req.params;
    const orgId = req.orgId;
    const {
      allocation_type,
      percent_allocation,
      end_date,
      role_on_project,
    } = req.body;
    
    // Verify allocation exists and belongs to project
    const allocResult = await queryWithOrg(
      'SELECT * FROM project_allocations WHERE id = $1 AND project_id = $2 AND org_id = $3',
      [allocId, id, orgId],
      orgId
    );
    
    if (allocResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project allocation not found' });
    }
    
    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (allocation_type !== undefined) {
      if (!['FULL_TIME', 'PART_TIME', 'AD_HOC'].includes(allocation_type)) {
        return res.status(400).json({ error: 'Invalid allocation_type' });
      }
      updates.push(`allocation_type = $${paramIndex++}::allocation_type`);
      params.push(allocation_type);
    }
    if (percent_allocation !== undefined) {
      updates.push(`percent_allocation = $${paramIndex++}`);
      params.push(percent_allocation);
    }
    if (end_date !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      params.push(end_date || null);
    }
    if (role_on_project !== undefined) {
      updates.push(`role_on_project = $${paramIndex++}`);
      params.push(role_on_project || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = now()`);
    params.push(allocId, id, orgId);
    
    const oldAllocation = allocResult.rows[0];
    
    const result = await queryWithOrg(
      `UPDATE project_allocations 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND project_id = $${paramIndex++} AND org_id = $${paramIndex++}
       RETURNING *`,
      params,
      orgId
    );
    
    // If end_date was set and allocation is ending, create PROJECT_END event
    if (end_date !== undefined && end_date && !oldAllocation.end_date) {
      try {
        const projectRes = await queryWithOrg(
          'SELECT * FROM projects WHERE id = $1 AND org_id = $2',
          [id, orgId],
          orgId
        );
        if (projectRes.rows.length > 0) {
          await createProjectEndEvent(orgId, oldAllocation.employee_id, result.rows[0], projectRes.rows[0]);
        }
      } catch (eventError) {
        console.error('Error creating project end event:', eventError);
        // Don't fail update if event creation fails
      }
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating project allocation:', error);
    res.status(500).json({ error: error.message || 'Failed to update project allocation' });
  }
});

// Legacy endpoint for backward compatibility
router.post('/:id/deallocate', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { assignment_id, end_date } = req.body || {};
    
    if (!assignment_id) {
      return res.status(400).json({ error: 'assignment_id required' });
    }
    
    // Try to find in project_allocations first
    const allocResult = await queryWithOrg(
      `SELECT pa.* FROM project_allocations pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.id = $1 AND pa.project_id = $2 AND p.org_id = $3`,
      [assignment_id, req.params.id, req.orgId],
      req.orgId
    );
    
    if (allocResult.rows.length > 0) {
      // Update project allocation
      const endDate = end_date || new Date().toISOString().split('T')[0];
      await queryWithOrg(
        `UPDATE project_allocations 
         SET end_date = $1, updated_at = now()
         WHERE id = $2`,
        [endDate, assignment_id],
        req.orgId
      );
      return res.json({ success: true, message: 'Allocation deallocated successfully' });
    }
    
    // Fallback to old assignments table
    const assignRes = await queryWithOrg(
      `SELECT a.* FROM assignments a
       JOIN projects p ON p.id = a.project_id
       WHERE a.id = $1 AND a.project_id = $2 AND p.org_id = $3`,
      [assignment_id, req.params.id, req.orgId],
      req.orgId
    );
    
    if (assignRes.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }
    
    const endDate = end_date || new Date().toISOString().split('T')[0];
    await queryWithOrg(
      `UPDATE assignments 
       SET end_date = $1, updated_at = now()
       WHERE id = $2`,
      [endDate, assignment_id],
      req.orgId
    );
    
    res.json({ success: true, message: 'Assignment deallocated successfully' });
  } catch (error) {
    console.error('Error deallocating:', error);
    res.status(500).json({ error: error.message || 'Failed to deallocate' });
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


