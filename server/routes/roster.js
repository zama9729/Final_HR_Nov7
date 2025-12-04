import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { queryWithOrg } from '../db/pool.js';
import { generateRosterRun, listSchedules } from '../services/roster-engine.js';

const router = express.Router();

router.use(authenticateToken);
router.use(setTenantContext);

function ensureTenant(req, res) {
  if (!req.orgId) {
    res.status(400).json({ error: 'Organization context missing' });
    return false;
  }
  return true;
}

// ---- Templates ----
router.get('/templates', requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  if (!ensureTenant(req, res)) return;
  try {
    const result = await queryWithOrg(
      `SELECT *
       FROM schedule_templates
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [req.orgId],
      req.orgId
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Roster templates fetch error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch templates' });
  }
});

router.post('/templates', requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  if (!ensureTenant(req, res)) return;
  try {
    const {
      name,
      description,
      timezone,
      coveragePlan,
      restRules,
      constraintRules,
      preferenceRules,
      metadata,
    } = req.body;
    if (!name || !Array.isArray(coveragePlan) || coveragePlan.length === 0) {
      return res.status(400).json({ error: 'Template name and coveragePlan are required' });
    }
    const result = await queryWithOrg(
      `INSERT INTO schedule_templates (
        tenant_id,
        name,
        description,
        timezone,
        coverage_plan,
        rest_rules,
        constraint_rules,
        preference_rules,
        metadata,
        created_by,
        updated_by
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10, $10
      )
      RETURNING *`,
      [
        req.orgId,
        name,
        description || null,
        timezone || 'UTC',
        JSON.stringify(coveragePlan),
        JSON.stringify(restRules || {}),
        JSON.stringify(constraintRules || {}),
        JSON.stringify(preferenceRules || {}),
        JSON.stringify(metadata || {}),
        req.user.id,
      ],
      req.orgId
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Roster template create error:', error);
    res.status(500).json({ error: error.message || 'Failed to create template' });
  }
});

router.put('/templates/:id', requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  if (!ensureTenant(req, res)) return;
  try {
    const { id } = req.params;
    const {
      name,
      description,
      timezone,
      coveragePlan,
      restRules,
      constraintRules,
      preferenceRules,
      metadata,
    } = req.body;
    const result = await queryWithOrg(
      `UPDATE schedule_templates
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           timezone = COALESCE($4, timezone),
           coverage_plan = COALESCE($5::jsonb, coverage_plan),
           rest_rules = COALESCE($6::jsonb, rest_rules),
           constraint_rules = COALESCE($7::jsonb, constraint_rules),
           preference_rules = COALESCE($8::jsonb, preference_rules),
           metadata = COALESCE($9::jsonb, metadata),
           updated_by = $10,
           updated_at = now()
       WHERE id = $1 AND tenant_id = $11
       RETURNING *`,
      [
        id,
        name,
        description || null,
        timezone || null,
        coveragePlan ? JSON.stringify(coveragePlan) : null,
        restRules ? JSON.stringify(restRules) : null,
        constraintRules ? JSON.stringify(constraintRules) : null,
        preferenceRules ? JSON.stringify(preferenceRules) : null,
        metadata ? JSON.stringify(metadata) : null,
        req.user.id,
        req.orgId,
      ],
      req.orgId
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Roster template update error:', error);
    res.status(500).json({ error: error.message || 'Failed to update template' });
  }
});

router.delete('/templates/:id', requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  if (!ensureTenant(req, res)) return;
  try {
    const { id } = req.params;
    const result = await queryWithOrg(
      `DELETE FROM schedule_templates
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, req.orgId],
      req.orgId
    );
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Template not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Roster template delete error:', error);
    res.status(500).json({ error: error.message || 'Failed to delete template' });
  }
});

// ---- Scheduler Runs ----
router.get('/runs', requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  if (!ensureTenant(req, res)) return;
  try {
    const result = await queryWithOrg(
      `SELECT r.*, t.name AS template_name
       FROM scheduler_runs r
       LEFT JOIN schedule_templates t ON t.id = r.template_id
       WHERE r.tenant_id = $1
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [req.orgId],
      req.orgId
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Roster run list error:', error);
    res.status(500).json({ error: error.message || 'Failed to load scheduler runs' });
  }
});

router.post('/runs', requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  if (!ensureTenant(req, res)) return;
  try {
    const {
      templateId,
      startDate,
      endDate,
      preserveManualEdits = false,
      seed = null,
      name,
      existingScheduleId = null,
    } = req.body;
    if (!templateId && !existingScheduleId) {
      return res.status(400).json({ error: 'templateId or existingScheduleId is required' });
    }
    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate and endDate are required' });
    }
    const result = await generateRosterRun({
      tenantId: req.orgId,
      templateId,
      startDate,
      endDate,
      preserveManualEdits,
      seed,
      name,
      requestedBy: req.user.id,
      existingScheduleId,
      // ScoreRank options
      decayRate: req.body.decayRate,
      shiftWeights: req.body.shiftWeights,
      overwriteLocked: req.body.overwriteLocked
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('Roster generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate roster' });
  }
});

// ---- Schedules ----
router.get('/schedules', requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  if (!ensureTenant(req, res)) return;
  try {
    const schedules = await listSchedules(req.orgId, {
      status: req.query.status,
      dateFrom: req.query.start_date,
      dateTo: req.query.end_date,
    });
    res.json(schedules);
  } catch (error) {
    console.error('Roster schedules list error:', error);
    res.status(500).json({ error: error.message || 'Failed to load schedules' });
  }
});

router.get('/schedules/:id', requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  if (!ensureTenant(req, res)) return;
  try {
    const { id } = req.params;

    // 1. Fetch Schedule from generated_schedules
    const scheduleResult = await queryWithOrg(
      `SELECT s.*
       FROM generated_schedules s
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [id, req.orgId],
      req.orgId
    );

    if (!scheduleResult.rows.length) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const scheduleData = scheduleResult.rows[0];

    // Parse telemetry
    let telemetryObj = scheduleData.telemetry;
    if (telemetryObj && typeof telemetryObj === 'string') {
      try {
        telemetryObj = JSON.parse(telemetryObj);
      } catch {
        telemetryObj = null;
      }
    }

    // 2. Fetch Assignments
    const assignmentsResult = await queryWithOrg(
      `SELECT a.*,
        t.name as template_name,
        t.shift_type,
        tm.name as team_name
       FROM schedule_assignments a
       JOIN shift_templates t ON t.id = a.shift_template_id
       LEFT JOIN teams tm ON tm.id = a.team_id
       WHERE a.schedule_id = $1 AND a.tenant_id = $2
       ORDER BY a.shift_date ASC, a.start_time ASC`,
      [id, req.orgId],
      req.orgId
    );

    // 3. Construct Slots (Assignments + Unfilled)
    const slots = [];

    // Add assigned slots
    assignmentsResult.rows.forEach((a, index) => {
      slots.push({
        id: a.id,
        schedule_id: a.schedule_id,
        shift_date: a.shift_date instanceof Date ? a.shift_date.toISOString().split('T')[0] : a.shift_date,
        shift_name: a.template_name,
        start_time: a.start_time,
        end_time: a.end_time,
        assigned_employee_id: a.employee_id,
        assigned_team_id: a.team_id,
        assignment_type: a.assignment_type,
        assignment_status: 'assigned',
        assignment_source: a.assigned_by === 'system' ? 'auto' : 'manual',
        position_index: index, // Approximate
        manual_lock: false // Not tracked in assignments currently
      });
    });

    // Add unfilled slots from telemetry
    const unfilledSlots = telemetryObj?.unfilledSlots || [];
    unfilledSlots.forEach((u, index) => {
      slots.push({
        id: `unfilled-${index}`,
        schedule_id: id,
        shift_date: u.date,
        shift_name: 'Unfilled Slot', // Need template name?
        start_time: u.startTime,
        end_time: u.endTime,
        assigned_employee_id: null,
        assignment_status: 'unassigned',
        assignment_source: 'auto',
        position_index: 1000 + index,
        manual_lock: false
      });
    });

    // 4. Extract Conflicts from Telemetry
    const conflicts = (telemetryObj?.conflicts || []).map((c, index) => ({
      id: `conflict-${index}`,
      schedule_id: id,
      conflict_type: 'unassigned_slot',
      severity: 'high',
      details: {
        reason: c.reason,
        slot: c.slot,
        shift_date: c.slot?.date,
        shift_name: c.slot?.shiftName
      }
    }));

    // Map conflicts back to slots
    slots.forEach(slot => {
      const slotConflicts = conflicts.filter(c => {
        const conflictDate = c.details.shift_date;
        const conflictStart = c.details.slot?.startTime;
        return conflictDate === slot.shift_date && conflictStart === slot.start_time;
      });

      if (slotConflicts.length > 0) {
        slot.conflict_flags = slotConflicts.map(c => c.details.reason);
        slot.assignment_status = 'conflict'; // Update status if conflict exists
      }
    });

    res.json({
      schedule: {
        ...scheduleData,
        template_name: 'Generated Schedule', // Fallback
        run_summary: telemetryObj
      },
      slots: slots,
      conflicts: conflicts,
    });
  } catch (error) {
    console.error('Roster schedule detail error:', error);
    res.status(500).json({ error: error.message || 'Failed to load schedule details' });
  }
});

router.patch(
  '/schedules/:scheduleId/slots/:slotId',
  requireRole('hr', 'director', 'ceo', 'admin'),
  async (req, res) => {
    if (!ensureTenant(req, res)) return;
    try {
      const { scheduleId, slotId } = req.params;
      const { assigned_employee_id: assignedEmployeeId, manual_lock: manualLock = true } = req.body;
      const assignmentStatus = assignedEmployeeId ? 'assigned' : 'unassigned';
      const result = await queryWithOrg(
        `UPDATE schedule_slots
         SET assigned_employee_id = $1,
             assignment_source = 'manual',
             assignment_status = $2,
             manual_lock = $3,
             conflict_flags = '[]'::jsonb,
             warning_flags = '[]'::jsonb,
             updated_at = now()
         WHERE id = $4 AND schedule_id = $5
         RETURNING *`,
        [assignedEmployeeId || null, assignmentStatus, manualLock, slotId, scheduleId],
        req.orgId
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Slot not found' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Roster slot update error:', error);
      res.status(500).json({ error: error.message || 'Failed to update slot' });
    }
  }
);

router.post(
  '/schedules/:id/publish',
  requireRole('hr', 'director', 'ceo', 'admin'),
  async (req, res) => {
    if (!ensureTenant(req, res)) return;
    try {
      const { id } = req.params;
      const result = await queryWithOrg(
        `UPDATE schedules
         SET status = 'published',
             published_by = $2,
             published_at = now()
         WHERE id = $1 AND tenant_id = $3 AND status = 'draft'
         RETURNING *`,
        [id, req.user.id, req.orgId],
        req.orgId
      );
      if (!result.rows.length) {
        return res.status(404).json({ error: 'Draft schedule not found' });
      }
      res.json(result.rows[0]);
    } catch (error) {
      console.error('Roster publish error:', error);
      res.status(500).json({ error: error.message || 'Failed to publish schedule' });
    }
  }
);

export default router;



