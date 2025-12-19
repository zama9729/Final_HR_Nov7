import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { queryWithOrg } from '../db/pool.js';
import { audit } from '../utils/auditLog.js';

const router = express.Router();

router.use(authenticateToken, requireRole('admin', 'hr', 'ceo', 'manager'), setTenantContext, (req, res, next) => {
  if (!req.orgId) {
    return res.status(400).json({ error: 'Organization context missing' });
  }
  return next();
});

router.get('/', async (req, res) => {
  try {
    // Ensure orgId is available from setTenantContext middleware
    const orgId = req.orgId;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }
    console.log(`[Branches] Fetching branches for orgId: ${orgId}`);
    const { rows: branches } = await queryWithOrg(
      `SELECT 
         b.id, 
         b.org_id, 
         b.name, 
         b.code, 
         b.timezone, 
         b.holiday_calendar_id, 
         b.pay_group_id, 
         b.address, 
         b.is_active, 
         b.metadata, 
         b.created_at, 
         b.updated_at,
         (SELECT COUNT(DISTINCT e.id) 
          FROM employees e
          JOIN employee_assignments ea ON ea.employee_id = e.id AND ea.is_home = true
          WHERE ea.branch_id = b.id 
            AND COALESCE(e.status, 'active') NOT IN ('terminated', 'on_hold', 'resigned')
            AND e.tenant_id = $1) as employee_count,
         (SELECT COUNT(DISTINCT t.id)
          FROM teams t
          WHERE t.branch_id = b.id AND t.org_id = $1) as team_count
       FROM org_branches b
       WHERE b.org_id = $1
       ORDER BY b.created_at`,
      [orgId],
      orgId
    );

    const { rows: departments } = await queryWithOrg(
      `SELECT id, org_id, branch_id, name, code, created_at, updated_at
       FROM departments
       WHERE org_id = $1
       ORDER BY created_at`,
      [req.orgId],
      req.orgId
    );

    const { rows: teams } = await queryWithOrg(
      `SELECT id, org_id, branch_id, department_id, name, name as team_name, code, host_branch_id, metadata, created_at, updated_at
       FROM teams
       WHERE org_id = $1
       ORDER BY created_at`,
      [orgId],
      orgId
    );

    const { rows: calendars } = await queryWithOrg(
      `SELECT id, org_id, name, region_code, rules, is_default
       FROM holiday_calendars
       WHERE org_id = $1`,
      [orgId],
      orgId
    );

    const { rows: payGroups } = await queryWithOrg(
      `SELECT id, org_id, name, cycle, currency, proration_rule, is_default
       FROM pay_groups
       WHERE org_id = $1`,
      [orgId],
      orgId
    );

    res.json({
      branches,
      departments,
      teams,
      calendars,
      payGroups,
    });
  } catch (error) {
    console.error('Failed to fetch branches', error);
    res.status(500).json({ error: error.message || 'Failed to fetch branches' });
  }
});

router.post('/upsert', async (req, res) => {
  const { id, name, code, timezone, holidayCalendarId, payGroupId, address, metadata, isActive = true } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Branch name required' });
  }
  try {
    const result = await queryWithOrg(
      `INSERT INTO org_branches (id, org_id, name, code, timezone, holiday_calendar_id, pay_group_id, address, metadata, is_active)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, COALESCE($5, 'Asia/Kolkata'), $6, $7, COALESCE($8::jsonb, '{}'::jsonb), COALESCE($9::jsonb, '{}'::jsonb), $10)
       ON CONFLICT (id) DO UPDATE
         SET name = EXCLUDED.name,
             code = EXCLUDED.code,
             timezone = EXCLUDED.timezone,
             holiday_calendar_id = EXCLUDED.holiday_calendar_id,
             pay_group_id = EXCLUDED.pay_group_id,
             address = EXCLUDED.address,
             metadata = EXCLUDED.metadata,
             is_active = EXCLUDED.is_active,
             updated_at = now()
       RETURNING *`,
      [id || null, req.orgId, name, code || null, timezone, holidayCalendarId || null, payGroupId || null, address || {}, metadata || {}, isActive],
      req.orgId
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to upsert branch', error);
    res.status(500).json({ error: error.message || 'Failed to save branch' });
  }
});

router.post('/departments/upsert', async (req, res) => {
  const { id, name, branchId, code } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Department name required' });
  }
  try {
    const isUpdate = Boolean(id);
    
    // Get old values if updating
    let oldValues = {};
    if (isUpdate) {
      const oldResult = await queryWithOrg(
        'SELECT name, code, branch_id FROM departments WHERE id = $1 AND org_id = $2',
        [id, req.orgId],
        req.orgId
      );
      if (oldResult.rows.length > 0) {
        oldValues = oldResult.rows[0];
      }
    }
    
    const result = await queryWithOrg(
      `INSERT INTO departments (id, org_id, branch_id, name, code)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET branch_id = EXCLUDED.branch_id,
             name = EXCLUDED.name,
             code = EXCLUDED.code,
             updated_at = now()
       RETURNING *`,
      [id || null, req.orgId, branchId || null, name, code || null],
      req.orgId
    );
    
    const department = result.rows[0];
    
    // Create audit log
    try {
      const diff = isUpdate ? {
        name: oldValues.name !== name ? { old: oldValues.name, new: name } : undefined,
        code: oldValues.code !== code ? { old: oldValues.code, new: code } : undefined,
        branch_id: oldValues.branch_id !== branchId ? { old: oldValues.branch_id, new: branchId } : undefined,
      } : null;
      
      await audit({
        actorId: req.user.id,
        action: isUpdate ? 'department_update' : 'department_create',
        entityType: 'department',
        entityId: department.id,
        diff: diff,
        details: {
          name: department.name,
          code: department.code,
          branchId: department.branch_id,
        },
        scope: 'org',
      });
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }
    
    res.json(department);
  } catch (error) {
    console.error('Failed to upsert department', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Department with this name already exists in the organization' });
    }
    res.status(500).json({ error: error.message || 'Failed to save department' });
  }
});

router.post('/teams/upsert', async (req, res) => {
  const { id, name, branchId, departmentId, code, hostBranchId, metadata } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Team name required' });
  }
  try {
    const isUpdate = Boolean(id);
    
    // Get old values if updating
    let oldValues = {};
    if (isUpdate) {
      const oldResult = await queryWithOrg(
        'SELECT name, code, branch_id, department_id, host_branch_id FROM teams WHERE id = $1 AND org_id = $2',
        [id, req.orgId],
        req.orgId
      );
      if (oldResult.rows.length > 0) {
        oldValues = oldResult.rows[0];
      }
    }
    
    const result = await queryWithOrg(
      `INSERT INTO teams (id, org_id, branch_id, department_id, name, code, host_branch_id, metadata)
       VALUES (COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, COALESCE($8::jsonb, '{}'::jsonb))
       ON CONFLICT (id) DO UPDATE
         SET branch_id = EXCLUDED.branch_id,
             department_id = EXCLUDED.department_id,
             name = EXCLUDED.name,
             code = EXCLUDED.code,
             host_branch_id = EXCLUDED.host_branch_id,
             metadata = EXCLUDED.metadata,
             updated_at = now()
       RETURNING *`,
      [id || null, req.orgId, branchId || null, departmentId || null, name, code || null, hostBranchId || null, metadata || {}],
      req.orgId
    );
    
    const team = result.rows[0];
    
    // Create audit log
    try {
      const diff = isUpdate ? {
        name: oldValues.name !== name ? { old: oldValues.name, new: name } : undefined,
        code: oldValues.code !== code ? { old: oldValues.code, new: code } : undefined,
        branch_id: oldValues.branch_id !== branchId ? { old: oldValues.branch_id, new: branchId } : undefined,
        department_id: oldValues.department_id !== departmentId ? { old: oldValues.department_id, new: departmentId } : undefined,
      } : null;
      
      await audit({
        actorId: req.user.id,
        action: isUpdate ? 'team_update' : 'team_create',
        entityType: 'team',
        entityId: team.id,
        diff: diff,
        details: {
          name: team.name,
          code: team.code,
          branchId: team.branch_id,
          departmentId: team.department_id,
        },
        scope: 'org',
      });
    } catch (auditError) {
      console.error('Error creating audit log:', auditError);
    }
    
    res.json(team);
  } catch (error) {
    console.error('Failed to upsert team', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Team with this name already exists for this branch' });
    }
    res.status(500).json({ error: error.message || 'Failed to save team' });
  }
});

router.delete('/:branchId', async (req, res) => {
  const { branchId } = req.params;
  try {
    await queryWithOrg(
      `UPDATE org_branches
       SET is_active = false, updated_at = now()
       WHERE id = $1 AND org_id = $2`,
      [branchId, req.orgId],
      req.orgId
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to deactivate branch', error);
    res.status(500).json({ error: error.message || 'Failed to deactivate branch' });
  }
});

router.patch('/:branchId/geofence', async (req, res) => {
  const { branchId } = req.params;
  const { lat, lng, radius, label, clear } = req.body || {};
  try {
    if (clear) {
      const result = await queryWithOrg(
        `UPDATE org_branches
         SET metadata = (COALESCE(metadata, '{}'::jsonb) - 'geofence'),
             updated_at = now()
         WHERE id = $1 AND org_id = $2
         RETURNING id, metadata`,
        [branchId, req.orgId],
        req.orgId
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Branch not found' });
      }
      return res.json(result.rows[0]);
    }

    const latNumber = Number(lat);
    const lngNumber = Number(lng);
    const radiusNumber = Number(radius);

    if (!Number.isFinite(latNumber) || !Number.isFinite(lngNumber) || !Number.isFinite(radiusNumber)) {
      return res.status(400).json({ error: 'lat, lng, and radius are required numeric values' });
    }

    if (radiusNumber <= 0) {
      return res.status(400).json({ error: 'Radius must be greater than zero' });
    }

    const geofencePayload = {
      lat: latNumber,
      lng: lngNumber,
      radius: radiusNumber,
      label: label || null,
      updated_at: new Date().toISOString(),
    };

    const result = await queryWithOrg(
      `UPDATE org_branches
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('geofence', $3::jsonb),
           updated_at = now()
       WHERE id = $1 AND org_id = $2
       RETURNING id, metadata`,
      [branchId, req.orgId, JSON.stringify(geofencePayload)],
      req.orgId
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Branch not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update geofence', error);
    res.status(500).json({ error: error.message || 'Failed to update geofence' });
  }
});

export default router;


