import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// Ensure team infrastructure exists
let ensureTeamInfraPromise = null;
let hasCheckedColumns = false;
let hasOwnerManagerId = false;
let hasTeamType = false;
let hasIsActive = false;

const ensureTeamInfra = async () => {
  if (ensureTeamInfraPromise) return ensureTeamInfraPromise;
  ensureTeamInfraPromise = (async () => {
    try {
      // Check if columns exist first
      const colCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'teams' 
        AND column_name IN ('owner_manager_id', 'team_type', 'is_active', 'description', 'parent_team_id')
      `);
      
      const existingCols = colCheck.rows.map(r => r.column_name);
      hasOwnerManagerId = existingCols.includes('owner_manager_id');
      hasTeamType = existingCols.includes('team_type');
      hasIsActive = existingCols.includes('is_active');
      hasCheckedColumns = true;
      
      // If columns don't exist, add them directly
      if (!hasOwnerManagerId) {
        try {
          await query(`
            ALTER TABLE teams 
            ADD COLUMN IF NOT EXISTS owner_manager_id UUID REFERENCES employees(id) ON DELETE SET NULL
          `);
          hasOwnerManagerId = true;
        } catch (err) {
          console.warn('Could not add owner_manager_id:', err.message);
        }
      }
      
      if (!hasTeamType) {
        try {
          // Create enum if it doesn't exist
          await query(`
            DO $$ BEGIN
              CREATE TYPE team_type AS ENUM ('FUNCTIONAL', 'PROJECT');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
          `);
          await query(`
            ALTER TABLE teams 
            ADD COLUMN IF NOT EXISTS team_type team_type DEFAULT 'FUNCTIONAL'
          `);
          hasTeamType = true;
        } catch (err) {
          console.warn('Could not add team_type:', err.message);
        }
      }
      
      if (!hasIsActive) {
        try {
          await query(`
            ALTER TABLE teams 
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
          `);
          hasIsActive = true;
        } catch (err) {
          console.warn('Could not add is_active:', err.message);
        }
      }
      
      // Add other columns if needed
      const allColsCheck = await query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'teams' 
        AND column_name IN ('description', 'parent_team_id')
      `);
      const allCols = allColsCheck.rows.map(r => r.column_name);
      
      if (!allCols.includes('description')) {
        try {
          await query(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS description TEXT`);
        } catch (err) {
          console.warn('Could not add description:', err.message);
        }
      }
      
      if (!allCols.includes('parent_team_id')) {
        try {
          await query(`
            ALTER TABLE teams 
            ADD COLUMN IF NOT EXISTS parent_team_id UUID REFERENCES teams(id) ON DELETE SET NULL
          `);
        } catch (err) {
          console.warn('Could not add parent_team_id:', err.message);
        }
      }
      
      // Check if team_memberships table exists
      const tmTableCheck = await query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_name = 'team_memberships'
      `);
      if (tmTableCheck.rows.length === 0) {
        try {
          // Create team_memberships table
          await query(`
            DO $$ BEGIN
              CREATE TYPE team_member_role AS ENUM ('MEMBER', 'MANAGER', 'LEAD', 'COORDINATOR');
            EXCEPTION WHEN duplicate_object THEN NULL;
            END $$;
            
            CREATE TABLE IF NOT EXISTS team_memberships (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
              employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
              role team_member_role NOT NULL DEFAULT 'MEMBER',
              is_primary BOOLEAN NOT NULL DEFAULT false,
              start_date DATE NOT NULL DEFAULT CURRENT_DATE,
              end_date DATE,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              UNIQUE(org_id, team_id, employee_id, start_date)
            );
            
            CREATE INDEX IF NOT EXISTS idx_team_memberships_org ON team_memberships(org_id);
            CREATE INDEX IF NOT EXISTS idx_team_memberships_team ON team_memberships(team_id);
            CREATE INDEX IF NOT EXISTS idx_team_memberships_employee ON team_memberships(org_id, employee_id);
          `);
        } catch (err) {
          console.warn('Could not create team_memberships table:', err.message);
        }
      }
    } catch (err) {
      console.error('Error ensuring team infrastructure:', err);
      // Set defaults if check fails
      hasOwnerManagerId = false;
      hasTeamType = false;
      hasIsActive = false;
    }
  })();
  return ensureTeamInfraPromise;
};

// GET /api/teams - List teams
router.get('/', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureTeamInfra();
    const { type, search, active } = req.query;
    const orgId = req.orgId;
    
    let filters = ['t.org_id = $1'];
    const params = [orgId];
    let paramIndex = 2;
    
    // Check if team_type column exists
    const typeColCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'team_type'
    `);
    if (typeColCheck.rows.length > 0 && type) {
      filters.push(`t.team_type = $${paramIndex++}::team_type`);
      params.push(type);
    }
    
    // Check if is_active column exists
    const activeColCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'is_active'
    `);
    if (activeColCheck.rows.length > 0 && active !== undefined) {
      if (active === 'true' || active === true) {
        filters.push('t.is_active = true');
      } else {
        filters.push('t.is_active = false');
      }
    }
    
    if (search) {
      filters.push(`(t.name ILIKE $${paramIndex} OR t.code ILIKE $${paramIndex} OR t.description ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // Build dynamic SELECT based on available columns
    let selectFields = 't.*';
    let joins = '';
    
    // Check columns after ensureTeamInfra
    const colCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'teams' 
      AND column_name IN ('owner_manager_id', 'parent_team_id')
    `);
    const existingCols = colCheck.rows.map(r => r.column_name);
    const hasOwnerManagerCol = existingCols.includes('owner_manager_id');
    const hasParentTeamCol = existingCols.includes('parent_team_id');
    
    if (hasOwnerManagerCol) {
      selectFields += `, e.id as owner_manager_employee_id,
         p.first_name || ' ' || p.last_name as owner_manager_name,
         p.email as owner_manager_email`;
      joins += ' LEFT JOIN employees e ON e.id = t.owner_manager_id LEFT JOIN profiles p ON p.id = e.user_id';
    }
    
    if (hasParentTeamCol) {
      selectFields += ', parent.name as parent_team_name';
      joins += ' LEFT JOIN teams parent ON parent.id = t.parent_team_id';
    }
    
    // Check if team_memberships table exists
    const tmTableCheck = await query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'team_memberships'
    `);
    if (tmTableCheck.rows.length > 0) {
      selectFields += `, (SELECT COUNT(*) FROM team_memberships tm 
        WHERE tm.team_id = t.id AND tm.end_date IS NULL) as member_count`;
    } else {
      selectFields += ', 0 as member_count';
    }
    
    const result = await queryWithOrg(
      `SELECT ${selectFields}
       FROM teams t
       ${joins}
       WHERE ${filters.join(' AND ')}
       ORDER BY t.created_at DESC`,
      params,
      orgId
    );
    
    res.json({ teams: result.rows });
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch teams' });
  }
});

// GET /api/teams/:id - Get team details
router.get('/:id', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureTeamInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    // Build dynamic SELECT based on available columns
    let selectFields = 't.*';
    let joins = '';
    
    // Check if owner_manager_id column exists
    const ownerManagerColCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'owner_manager_id'
    `);
    if (ownerManagerColCheck.rows.length > 0) {
      selectFields += `, e.id as owner_manager_employee_id,
         p.first_name || ' ' || p.last_name as owner_manager_name,
         p.email as owner_manager_email`;
      joins += ' LEFT JOIN employees e ON e.id = t.owner_manager_id LEFT JOIN profiles p ON p.id = e.user_id';
    }
    
    const parentCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'parent_team_id'
    `);
    if (parentCheck.rows.length > 0) {
      selectFields += ', parent.name as parent_team_name, parent.id as parent_team_id';
      joins += ' LEFT JOIN teams parent ON parent.id = t.parent_team_id';
    }
    
    const result = await queryWithOrg(
      `SELECT ${selectFields}
       FROM teams t
       ${joins}
       WHERE t.id = $1 AND t.org_id = $2`,
      [id, orgId],
      orgId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    // Get team members - check if team_memberships table exists
    let members = [];
    const tmTableCheck = await query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'team_memberships'
    `);
    if (tmTableCheck.rows.length > 0) {
      try {
        const membersResult = await queryWithOrg(
          `SELECT 
             tm.*,
             e.id as employee_id,
             p.first_name || ' ' || p.last_name as employee_name,
             p.email as employee_email,
             e.position,
             e.department
           FROM team_memberships tm
           JOIN employees e ON e.id = tm.employee_id
           JOIN profiles p ON p.id = e.user_id
           WHERE tm.team_id = $1 AND tm.org_id = $2 AND tm.end_date IS NULL
           ORDER BY tm.is_primary DESC, tm.role, employee_name`,
          [id, orgId],
          orgId
        );
        members = membersResult.rows;
      } catch (err) {
        console.warn('Could not fetch team members:', err.message);
        members = [];
      }
    }
    
    res.json({
      ...result.rows[0],
      members: members,
    });
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch team' });
  }
});

// POST /api/teams - Create team
router.post('/', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureTeamInfra();
    const {
      name,
      code,
      description,
      team_type,
      parent_team_id,
      owner_manager_id,
    } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    
    // Check if team_type column exists
    const typeColCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'team_type'
    `);
    const hasTeamTypeCol = typeColCheck.rows.length > 0;
    
    if (hasTeamTypeCol && team_type && !['FUNCTIONAL', 'PROJECT'].includes(team_type)) {
      return res.status(400).json({ error: 'team_type must be FUNCTIONAL or PROJECT' });
    }
    
    // Default team_type if column exists but not provided
    const finalTeamType = hasTeamTypeCol ? (team_type || 'FUNCTIONAL') : undefined;
    
    const orgId = req.orgId;
    
    // Generate code if not provided
    let teamCode = code;
    if (!teamCode) {
      const codeResult = await queryWithOrg(
        `SELECT COUNT(*) + 1 as next_num FROM teams WHERE org_id = $1`,
        [orgId],
        orgId
      );
      teamCode = `TEAM-${String(codeResult.rows[0].next_num).padStart(3, '0')}`;
    }
    
    // Build INSERT query dynamically based on available columns
    let insertFields = ['org_id', 'name'];
    let insertValues = ['$1', '$2'];
    let insertParams = [orgId, name];
    let paramIndex = 3;
    
    if (code) {
      insertFields.push('code');
      insertValues.push(`$${paramIndex++}`);
      insertParams.push(teamCode);
    }
    
    const descCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'description'
    `);
    if (descCheck.rows.length > 0) {
      insertFields.push('description');
      insertValues.push(`$${paramIndex++}`);
      insertParams.push(description || null);
    }
    
    if (hasTeamTypeCol && finalTeamType) {
      insertFields.push('team_type');
      insertValues.push(`$${paramIndex++}::team_type`);
      insertParams.push(finalTeamType);
    }
    
    const parentCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'parent_team_id'
    `);
    if (parentCheck.rows.length > 0 && parent_team_id !== undefined) {
      insertFields.push('parent_team_id');
      insertValues.push(`$${paramIndex++}`);
      insertParams.push(parent_team_id || null);
    }
    
    const ownerManagerCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'owner_manager_id'
    `);
    if (ownerManagerCheck.rows.length > 0 && owner_manager_id !== undefined) {
      insertFields.push('owner_manager_id');
      insertValues.push(`$${paramIndex++}`);
      insertParams.push(owner_manager_id || null);
    }
    
    const isActiveCheck = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'is_active'
    `);
    if (isActiveCheck.rows.length > 0) {
      insertFields.push('is_active');
      insertValues.push('true');
    }
    
    const result = await queryWithOrg(
      `INSERT INTO teams (${insertFields.join(', ')})
       VALUES (${insertValues.join(', ')})
       RETURNING *`,
      insertParams,
      orgId
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating team:', error);
    res.status(500).json({ error: error.message || 'Failed to create team' });
  }
});

// PATCH /api/teams/:id - Update team
router.patch('/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureTeamInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    const {
      name,
      code,
      description,
      parent_team_id,
      owner_manager_id,
      is_active,
    } = req.body;
    
    // Get current team
    const currentResult = await queryWithOrg(
      'SELECT * FROM teams WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    // Build update query
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
    // Check if columns exist before updating
    const colChecks = await query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'teams' 
      AND column_name IN ('parent_team_id', 'owner_manager_id', 'is_active')
    `);
    const existingCols = colChecks.rows.map(r => r.column_name);
    
    if (parent_team_id !== undefined && existingCols.includes('parent_team_id')) {
      updates.push(`parent_team_id = $${paramIndex++}`);
      params.push(parent_team_id || null);
    }
    if (owner_manager_id !== undefined && existingCols.includes('owner_manager_id')) {
      updates.push(`owner_manager_id = $${paramIndex++}`);
      params.push(owner_manager_id || null);
    }
    if (is_active !== undefined && existingCols.includes('is_active')) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(is_active);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = now()`);
    params.push(id, orgId);
    
    const result = await queryWithOrg(
      `UPDATE teams
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND org_id = $${paramIndex++}
       RETURNING *`,
      params,
      orgId
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: error.message || 'Failed to update team' });
  }
});

// POST /api/teams/:id/activate - Activate team
router.post('/:id/activate', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureTeamInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    const result = await queryWithOrg(
      `UPDATE teams SET is_active = true, updated_at = now()
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [id, orgId],
      orgId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error activating team:', error);
    res.status(500).json({ error: error.message || 'Failed to activate team' });
  }
});

// POST /api/teams/:id/deactivate - Deactivate team
router.post('/:id/deactivate', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureTeamInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    const result = await queryWithOrg(
      `UPDATE teams SET is_active = false, updated_at = now()
       WHERE id = $1 AND org_id = $2
       RETURNING *`,
      [id, orgId],
      orgId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error deactivating team:', error);
    res.status(500).json({ error: error.message || 'Failed to deactivate team' });
  }
});

// GET /api/teams/:id/members - Get team members
router.get('/:id/members', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureTeamInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    const result = await queryWithOrg(
      `SELECT 
         tm.*,
         e.id as employee_id,
         p.first_name || ' ' || p.last_name as employee_name,
         p.email as employee_email,
         e.position,
         e.department
       FROM team_memberships tm
       JOIN employees e ON e.id = tm.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE tm.team_id = $1 AND tm.org_id = $2 AND tm.end_date IS NULL
       ORDER BY tm.is_primary DESC, tm.role, employee_name`,
      [id, orgId],
      orgId
    );
    
    res.json({ members: result.rows });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch team members' });
  }
});

// POST /api/teams/:id/members - Add team member
router.post('/:id/members', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureTeamInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    const {
      employee_id,
      role = 'MEMBER',
      is_primary = false,
      start_date,
    } = req.body;
    
    if (!employee_id) {
      return res.status(400).json({ error: 'employee_id is required' });
    }
    
    if (!['MEMBER', 'MANAGER', 'LEAD', 'COORDINATOR'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    // Verify team exists
    const teamResult = await queryWithOrg(
      'SELECT * FROM teams WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );
    
    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    // Verify employee exists and belongs to org
    const empResult = await queryWithOrg(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employee_id, orgId],
      orgId
    );
    
    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    // If setting as primary, the trigger will handle closing other primary memberships
    const result = await queryWithOrg(
      `INSERT INTO team_memberships (
        org_id, team_id, employee_id, role, is_primary, start_date
      ) VALUES ($1, $2, $3, $4::team_member_role, $5, $6)
      RETURNING *`,
      [
        orgId,
        id,
        employee_id,
        role,
        is_primary,
        start_date || new Date().toISOString().split('T')[0],
      ],
      orgId
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding team member:', error);
    res.status(500).json({ error: error.message || 'Failed to add team member' });
  }
});

// PATCH /api/teams/:id/members/:memberId - Update team membership
router.patch('/:id/members/:memberId', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureTeamInfra();
    const { id, memberId } = req.params;
    const orgId = req.orgId;
    const {
      role,
      is_primary,
      end_date,
    } = req.body;
    
    // Verify membership exists and belongs to team
    const membershipResult = await queryWithOrg(
      'SELECT * FROM team_memberships WHERE id = $1 AND team_id = $2 AND org_id = $3',
      [memberId, id, orgId],
      orgId
    );
    
    if (membershipResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team membership not found' });
    }
    
    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (role !== undefined) {
      if (!['MEMBER', 'MANAGER', 'LEAD', 'COORDINATOR'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
      }
      updates.push(`role = $${paramIndex++}::team_member_role`);
      params.push(role);
    }
    if (is_primary !== undefined) {
      updates.push(`is_primary = $${paramIndex++}`);
      params.push(is_primary);
    }
    if (end_date !== undefined) {
      updates.push(`end_date = $${paramIndex++}`);
      params.push(end_date || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = now()`);
    params.push(memberId, id, orgId);
    
    const result = await queryWithOrg(
      `UPDATE team_memberships
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND team_id = $${paramIndex++} AND org_id = $${paramIndex++}
       RETURNING *`,
      params,
      orgId
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating team membership:', error);
    res.status(500).json({ error: error.message || 'Failed to update team membership' });
  }
});

// GET /api/teams/:id/available-employees - Get employees available for team assignment
router.get('/:id/available-employees', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureTeamInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    // Verify team exists
    const teamResult = await queryWithOrg(
      'SELECT * FROM teams WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );
    
    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }
    
    // Get all employees in the organization
    // Check if project_allocations table exists
    const paTableCheck = await query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'project_allocations'
    `);
    const hasProjectAllocations = paTableCheck.rows.length > 0;
    
    // Get current team members to exclude them
    const tmTableCheck = await query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_name = 'team_memberships'
    `);
    const hasTeamMemberships = tmTableCheck.rows.length > 0;
    
    let projectAllocSubquery = '';
    if (hasProjectAllocations) {
      projectAllocSubquery = `
        , EXISTS(
          SELECT 1 FROM project_allocations pa
          WHERE pa.employee_id = e.id 
          AND pa.org_id = $1
          AND (pa.end_date IS NULL OR pa.end_date >= CURRENT_DATE)
        ) as has_active_project_allocation
      `;
    } else {
      projectAllocSubquery = ', false as has_active_project_allocation';
    }
    
    let excludeTeamMembers = '';
    let paramIndex = 1;
    const params = [orgId];
    
    if (hasTeamMemberships) {
      paramIndex++;
      params.push(id);
      excludeTeamMembers = `
        AND NOT EXISTS(
          SELECT 1 FROM team_memberships tm
          WHERE tm.employee_id = e.id 
          AND tm.team_id = $${paramIndex}
          AND tm.org_id = $1
          AND tm.end_date IS NULL
        )
      `;
    }
    
    const result = await queryWithOrg(
      `SELECT 
         e.id,
         p.first_name || ' ' || p.last_name as name,
         p.email,
         e.position,
         e.department
         ${projectAllocSubquery}
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       WHERE e.tenant_id = $1
         AND e.status = 'active'
         ${excludeTeamMembers}
       ORDER BY p.first_name, p.last_name`,
      params,
      orgId
    );
    
    res.json({ employees: result.rows });
  } catch (error) {
    console.error('Error fetching available employees:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch available employees' });
  }
});

export default router;

