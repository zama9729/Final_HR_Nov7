/**
 * Staff Scheduling API Routes
 * Handles shift templates, rule sets, schedule generation, and management
 */

import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { RuleEngine } from '../services/scheduling/rule-engine.js';
import { getScheduler } from '../services/scheduling/scheduler.js';

const router = express.Router();

// ========== SHIFT TEMPLATES ==========

// GET /api/scheduling/templates
router.get('/templates', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const orgId = req.orgId;
    const { team_id, branch_id } = req.query;

    let queryStr = `
      SELECT * FROM shift_templates
      WHERE tenant_id = $1
    `;
    const params = [orgId];

    if (team_id) {
      queryStr += ` AND (team_id = $2 OR team_id IS NULL)`;
      params.push(team_id);
    }

    if (branch_id) {
      queryStr += ` AND (branch_id = $3 OR branch_id IS NULL)`;
      params.push(branch_id);
    }

    queryStr += ` ORDER BY name ASC`;

    const result = await query(queryStr, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching shift templates:', error);
    // Check if table doesn't exist
    if (error.message && error.message.includes('does not exist')) {
      return res.status(500).json({ 
        error: 'Database tables not initialized. Please run the migration: server/db/migrations/20250121_shift_scheduling_module.sql',
        details: error.message 
      });
    }
    res.status(500).json({ error: error.message });
  }
});

// POST /api/scheduling/templates
router.post('/templates', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const {
      name,
      start_time,
      end_time,
      shift_type,
      duration_hours,
      crosses_midnight,
      is_default,
      team_id,
      branch_id
    } = req.body;

    if (!name || !start_time || !end_time || !shift_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const orgId = req.orgId;
    const result = await query(
      `INSERT INTO shift_templates (
        tenant_id, name, start_time, end_time, shift_type,
        duration_hours, crosses_midnight, is_default, team_id, branch_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        orgId,
        name,
        start_time,
        end_time,
        shift_type,
        duration_hours || null,
        crosses_midnight || false,
        is_default || false,
        team_id || null,
        branch_id || null,
        req.user.id
      ]
    );

    // Audit log
    await query(
      `INSERT INTO schedule_audit_log (tenant_id, action, entity_type, entity_id, created_by)
       VALUES ($1, 'create', 'template', $2, $3)`,
      [orgId, result.rows[0].id, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating shift template:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/scheduling/templates/:id
router.put('/templates/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId;

    const {
      name,
      start_time,
      end_time,
      shift_type,
      duration_hours,
      crosses_midnight,
      is_default,
      team_id,
      branch_id
    } = req.body;

    const result = await query(
      `UPDATE shift_templates
       SET name = $1, start_time = $2, end_time = $3, shift_type = $4,
           duration_hours = $5, crosses_midnight = $6, is_default = $7,
           team_id = $8, branch_id = $9, updated_at = now()
       WHERE id = $10 AND tenant_id = $11
       RETURNING *`,
      [
        name, start_time, end_time, shift_type,
        duration_hours, crosses_midnight, is_default,
        team_id, branch_id, id, orgId
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Audit log
    await query(
      `INSERT INTO schedule_audit_log (tenant_id, action, entity_type, entity_id, created_by)
       VALUES ($1, 'update', 'template', $2, $3)`,
      [orgId, id, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating shift template:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/scheduling/templates/:id
router.delete('/templates/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId;

    const result = await query(
      `DELETE FROM shift_templates WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Audit log
    await query(
      `INSERT INTO schedule_audit_log (tenant_id, action, entity_type, entity_id, created_by)
       VALUES ($1, 'delete', 'template', $2, $3)`,
      [orgId, id, req.user.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting shift template:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== RULE SETS ==========

// GET /api/scheduling/rule-sets
router.get('/rule-sets', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const orgId = req.orgId;
    const result = await query(
      `SELECT * FROM scheduling_rule_sets
       WHERE tenant_id = $1
       ORDER BY is_default DESC, name ASC`,
      [orgId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching rule sets:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/scheduling/rule-sets
router.post('/rule-sets', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { name, description, is_default, rules } = req.body;

    if (!name || !rules || !Array.isArray(rules)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const orgId = req.orgId;
    const result = await query(
      `INSERT INTO scheduling_rule_sets (
        tenant_id, name, description, is_default, rules, created_by
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
      RETURNING *`,
      [orgId, name, description || null, is_default || false, JSON.stringify(rules), req.user.id]
    );

    // Audit log
    await query(
      `INSERT INTO schedule_audit_log (tenant_id, action, entity_type, entity_id, created_by)
       VALUES ($1, 'create', 'rule_set', $2, $3)`,
      [orgId, result.rows[0].id, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating rule set:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/scheduling/rule-sets/:id
router.put('/rule-sets/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_default, rules } = req.body;
    const orgId = req.orgId;

    const result = await query(
      `UPDATE scheduling_rule_sets
       SET name = $1, description = $2, is_default = $3, rules = $4::jsonb, updated_at = now()
       WHERE id = $5 AND tenant_id = $6
       RETURNING *`,
      [name, description, is_default, JSON.stringify(rules), id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Rule set not found' });
    }

    // Audit log
    await query(
      `INSERT INTO schedule_audit_log (tenant_id, action, entity_type, entity_id, created_by)
       VALUES ($1, 'update', 'rule_set', $2, $3)`,
      [orgId, id, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating rule set:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/scheduling/employee/:employee_id/shifts
router.get('/employee/:employee_id/shifts', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { employee_id } = req.params;
    const { start_date, end_date } = req.query;
    const orgId = req.orgId;

    // Verify access - employees can only see their own shifts
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isHROrCEO = ['hr', 'ceo', 'director', 'admin'].includes(userRole);

    if (!isHROrCEO) {
      // Check if this is the employee's own ID
      const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
      if (empRes.rows.length === 0 || empRes.rows[0].id !== employee_id) {
        return res.status(403).json({ error: 'Unauthorized - can only view own shifts' });
      }
    }

    let queryStr = `
      SELECT 
        sa.id,
        sa.shift_date,
        sa.start_time,
        sa.end_time,
        sa.assigned_by,
        t.name as template_name,
        t.shift_type,
        gs.week_start_date,
        gs.week_end_date,
        gs.status as schedule_status
      FROM schedule_assignments sa
      JOIN shift_templates t ON t.id = sa.shift_template_id
      JOIN generated_schedules gs ON gs.id = sa.schedule_id
      WHERE sa.tenant_id = $1 
        AND sa.employee_id = $2
        AND gs.status IN ('approved', 'active')
    `;
    const params = [orgId, employee_id];

    if (start_date) {
      queryStr += ` AND sa.shift_date >= $${params.length + 1}::date`;
      params.push(start_date);
    }
    if (end_date) {
      queryStr += ` AND sa.shift_date <= $${params.length + 1}::date`;
      params.push(end_date);
    }

    queryStr += ` ORDER BY sa.shift_date ASC, sa.start_time ASC`;

    const result = await query(queryStr, params);

    res.json({ shifts: result.rows });
  } catch (error) {
    console.error('Error fetching employee shifts:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== AVAILABILITY ==========

// GET /api/scheduling/availability
router.get('/availability', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { employee_id, date_from, date_to } = req.query;
    const orgId = req.orgId;

    let queryStr = `SELECT * FROM employee_availability WHERE tenant_id = $1`;
    const params = [orgId];

    if (employee_id) {
      queryStr += ` AND employee_id = $${params.length + 1}`;
      params.push(employee_id);
    }

    if (date_from) {
      queryStr += ` AND date >= $${params.length + 1}`;
      params.push(date_from);
    }

    if (date_to) {
      queryStr += ` AND date <= $${params.length + 1}`;
      params.push(date_to);
    }

    queryStr += ` ORDER BY date ASC, start_time ASC`;

    const result = await query(queryStr, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/scheduling/availability
router.post('/availability', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const {
      employee_id,
      date,
      start_time,
      end_time,
      availability_type,
      shift_template_id,
      is_pinned,
      is_forbidden,
      notes
    } = req.body;

    if (!employee_id || !date || !availability_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const orgId = req.orgId;
    const result = await query(
      `INSERT INTO employee_availability (
        tenant_id, employee_id, date, start_time, end_time,
        availability_type, shift_template_id, is_pinned, is_forbidden, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (employee_id, date, start_time, end_time) 
      DO UPDATE SET
        availability_type = EXCLUDED.availability_type,
        shift_template_id = EXCLUDED.shift_template_id,
        is_pinned = EXCLUDED.is_pinned,
        is_forbidden = EXCLUDED.is_forbidden,
        notes = EXCLUDED.notes,
        updated_at = now()
      RETURNING *`,
      [
        orgId, employee_id, date, start_time || null, end_time || null,
        availability_type, shift_template_id || null, is_pinned || false,
        is_forbidden || false, notes || null
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating availability:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== SCHEDULE GENERATION ==========

// POST /api/scheduling/schedules/run
router.post('/schedules/run', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const {
      week_start_date,
      week_end_date,
      rule_set_id,
      algorithm,
      template_ids,
      employee_ids,
      branch_id,
      team_id,
      seed,
      replace_schedule_id // If provided, replace this schedule instead of creating new
    } = req.body;

    if (!week_start_date || !week_end_date || !rule_set_id || !algorithm) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const orgId = req.orgId;

    // Fetch rule set
    const ruleSetResult = await query(
      `SELECT * FROM scheduling_rule_sets WHERE id = $1 AND tenant_id = $2`,
      [rule_set_id, orgId]
    );

    if (ruleSetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Rule set not found' });
    }

    const ruleSet = ruleSetResult.rows[0];
    const rules = ruleSet.rules || [];

    // Initialize rule engine
    const ruleEngine = new RuleEngine(rules);

    // Fetch templates
    let templateQuery = `SELECT * FROM shift_templates WHERE tenant_id = $1`;
    const templateParams = [orgId];
    
    if (template_ids && template_ids.length > 0) {
      templateQuery += ` AND id = ANY($2)`;
      templateParams.push(template_ids);
    }

    const templatesResult = await query(templateQuery, templateParams);
    const templates = templatesResult.rows;

    // Fetch employees - ONLY from employees table, only active employees
    let employeeQuery = `
      SELECT e.*, p.first_name, p.last_name, p.email
      FROM employees e
      INNER JOIN profiles p ON p.id = e.user_id
      WHERE e.tenant_id = $1 
        AND e.status = 'active'
        AND e.id IS NOT NULL
    `;
    const employeeParams = [orgId];
    let paramIndex = 2;

    if (employee_ids && employee_ids.length > 0) {
      employeeQuery += ` AND e.id = ANY($${paramIndex})`;
      employeeParams.push(employee_ids);
      paramIndex++;
    }

    if (branch_id) {
      employeeQuery += ` AND EXISTS (
        SELECT 1 FROM employee_assignments ea
        WHERE ea.employee_id = e.id 
          AND ea.branch_id = $${paramIndex}
          AND (ea.end_date IS NULL OR ea.end_date >= CURRENT_DATE)
      )`;
      employeeParams.push(branch_id);
      paramIndex++;
    }

    if (team_id) {
      employeeQuery += ` AND EXISTS (
        SELECT 1 FROM employee_assignments ea
        WHERE ea.employee_id = e.id 
          AND ea.team_id = $${paramIndex}
          AND (ea.end_date IS NULL OR ea.end_date >= CURRENT_DATE)
      )`;
      employeeParams.push(team_id);
      paramIndex++;
    }

    employeeQuery += ` ORDER BY p.first_name, p.last_name`;

    const employeesResult = await query(employeeQuery, employeeParams);
    const employees = employeesResult.rows;

    const rosterEmployees = employees.map(emp => ({
      id: emp.id,
      first_name: emp.first_name,
      last_name: emp.last_name,
      email: emp.email
    }));

    if (employees.length === 0) {
      return res.status(400).json({ 
        error: 'No active employees found for scheduling. Please ensure there are active employees in the system.' 
      });
    }

    // Calculate prior night shifts from the most recent approved/created schedule
    let priorNightCounts = {};
    const previousScheduleResult = await query(
      `SELECT id
       FROM generated_schedules
       WHERE tenant_id = $1
         AND week_end_date < $2
       ORDER BY week_end_date DESC
       LIMIT 1`,
      [orgId, week_start_date]
    );

    if (previousScheduleResult.rows.length > 0) {
      const previousScheduleId = previousScheduleResult.rows[0].id;
      const nightCountsResult = await query(
        `SELECT sa.employee_id, COUNT(*) as night_count
         FROM schedule_assignments sa
         JOIN shift_templates st ON st.id = sa.shift_template_id
         WHERE sa.schedule_id = $1
           AND st.shift_type = 'night'
         GROUP BY sa.employee_id`,
        [previousScheduleId]
      );

      priorNightCounts = nightCountsResult.rows.reduce((acc, row) => {
        acc[row.employee_id] = parseInt(row.night_count, 10);
        return acc;
      }, {});
    }

    // Fetch availability
    const employeeIds = employees.map(e => e.id);

    const availabilityResult = await query(
      `SELECT * FROM employee_availability
       WHERE tenant_id = $1
         AND date >= $2 AND date <= $3
         AND employee_id = ANY($4)`,
      [orgId, week_start_date, week_end_date, employeeIds]
    );
    const baseAvailability = availabilityResult.rows;

    // Fetch approved/ planned leaves to enforce as blackouts
    const leaveResult = await query(
      `SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date, lr.reason, lp.name AS policy_name
       FROM leave_requests lr
       LEFT JOIN leave_policies lp ON lp.id = lr.leave_type_id
       WHERE lr.tenant_id = $1
         AND lr.status IN ('approved', 'planned')
         AND lr.employee_id = ANY($4)
         AND lr.start_date <= $3
         AND lr.end_date >= $2`,
      [orgId, week_start_date, week_end_date, employeeIds]
    );

    const leaveBlackouts = [];
    for (const leave of leaveResult.rows) {
      const start = new Date(leave.start_date);
      const end = new Date(leave.end_date);
      for (
        let cursor = new Date(start);
        cursor <= end;
        cursor.setDate(cursor.getDate() + 1)
      ) {
        const dateStr = cursor.toISOString().split('T')[0];
        if (dateStr < week_start_date || dateStr > week_end_date) continue;
        leaveBlackouts.push({
          id: `leave_${leave.id}_${dateStr}`,
          tenant_id: orgId,
          employee_id: leave.employee_id,
          date: dateStr,
          availability_type: 'blackout',
          is_forbidden: true,
          source: 'leave',
          source_id: leave.id,
          notes: leave.reason || leave.policy_name || 'Leave'
        });
      }
    }

    // Fetch company holidays during the window
    const holidayListsRes = await query(
      `SELECT id
       FROM holiday_lists
       WHERE org_id = $1
         AND published = true`,
      [orgId]
    );
    let holidayBlackouts = [];
    if (holidayListsRes.rows.length > 0) {
      const holidaysRes = await query(
        `SELECT h.*
         FROM holidays h
         JOIN holiday_lists hl ON hl.id = h.list_id
         WHERE hl.org_id = $1
           AND h.date BETWEEN $2 AND $3`,
        [orgId, week_start_date, week_end_date]
      );
      holidayBlackouts = holidaysRes.rows.flatMap((holiday) => {
        const dateStr = holiday.date instanceof Date
          ? holiday.date.toISOString().split('T')[0]
          : holiday.date;
        return employeeIds.map((empId) => ({
          id: `holiday_${holiday.id}_${empId}`,
          tenant_id: orgId,
          employee_id: empId,
          date: dateStr,
          availability_type: 'blackout',
          is_forbidden: true,
          source: 'holiday',
          source_id: holiday.id,
          notes: holiday.name
        }));
      });
    }

    const availability = [
      ...baseAvailability,
      ...leaveBlackouts,
      ...holidayBlackouts
    ];

    // Fetch demand requirements
    const demandResult = await query(
      `SELECT * FROM shift_demand_requirements
       WHERE tenant_id = $1
         AND (effective_from IS NULL OR effective_from <= $2)
         AND (effective_to IS NULL OR effective_to >= $3)`,
      [orgId, week_end_date, week_start_date]
    );
    let demand = demandResult.rows;

    // If no demand requirements exist, create default ones for all templates
    // Default: 1 employee per shift template per day (Monday-Friday)
    if (demand.length === 0 && templates.length > 0) {
      console.log('No demand requirements found. Creating default demand: 1 employee per template per weekday.');
      
      // Create default demand for each template, Monday (1) through Friday (5)
      for (const template of templates) {
        for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
          demand.push({
            id: `default_${template.id}_${dayOfWeek}`,
            tenant_id: orgId,
            shift_template_id: template.id,
            day_of_week: dayOfWeek,
            required_count: 1,
            required_roles: null,
            branch_id: null,
            team_id: null,
            effective_from: null,
            effective_to: null
          });
        }
      }
    }

    if (demand.length === 0) {
      return res.status(400).json({ 
        error: 'No shift templates or demand requirements found. Please create shift templates first.' 
      });
    }

    // Fetch exceptions
    const exceptionsResult = await query(
      `SELECT * FROM schedule_exceptions
       WHERE tenant_id = $1 AND status = 'approved'`,
      [orgId]
    );
    const exceptions = exceptionsResult.rows;

    // Get scheduler (inject fairness context and seed for randomization)
    const scheduler = getScheduler(algorithm, ruleEngine, {
      priorNightCounts,
      seed: seed || Math.floor(Math.random() * 1000000) // Use provided seed or random
    });

    // Generate schedule
    console.log(`[Scheduling] Generating schedule for ${employees.length} employees, ${templates.length} templates, ${demand.length} demand requirements`);
    
    let result;
    try {
      result = await scheduler.generateSchedule({
        weekStart: week_start_date,
        weekEnd: week_end_date,
        employees,
        templates,
        demand,
        availability,
        exceptions,
        ruleSet,
        priorNightCounts
      });
    } catch (error) {
      console.error(`[Scheduling] Error generating schedule with ${algorithm} algorithm:`, error);
      // If constraint solver fails, fallback to greedy
      if (algorithm === 'ilp' || algorithm === 'constraint') {
        console.log(`[Scheduling] Falling back to greedy algorithm`);
        const greedyScheduler = getScheduler('greedy', ruleEngine, {
          priorNightCounts,
          seed: seed || Math.floor(Math.random() * 1000000) // Pass seed for randomization
        });
        result = await greedyScheduler.generateSchedule({
          weekStart: week_start_date,
          weekEnd: week_end_date,
          employees,
          templates,
          demand,
          availability,
          exceptions,
          ruleSet,
          priorNightCounts
        });
      } else {
        throw error;
      }
    }

    console.log(`[Scheduling] Generated ${result.assignments?.length || 0} assignments`);

    // Evaluate the generated schedule
    const schedule = {
      week_start_date,
      week_end_date
    };

    const evaluation = ruleEngine.evaluate(schedule, result.assignments || [], {
      employees,
      templates,
      availability,
      exceptions,
      demand
    });
    
    console.log(`[Scheduling] Evaluation: ${evaluation.isValid ? 'Valid' : 'Invalid'}, Score: ${evaluation.score}, Hard violations: ${evaluation.hardViolations.length}, Soft violations: ${evaluation.softViolations.length}`);

    // If replacing an existing schedule, delete old assignments first
    let scheduleId;
    if (replace_schedule_id) {
      // Verify the schedule exists and belongs to this tenant
      const existingScheduleResult = await query(
        `SELECT id FROM generated_schedules WHERE id = $1 AND tenant_id = $2`,
        [replace_schedule_id, orgId]
      );
      
      if (existingScheduleResult.rows.length === 0) {
        return res.status(404).json({ error: 'Schedule to replace not found' });
      }
      
      scheduleId = replace_schedule_id;
      
      // Delete old assignments
      await query(
        `DELETE FROM schedule_assignments WHERE schedule_id = $1 AND tenant_id = $2`,
        [scheduleId, orgId]
      );
      
      // Update the schedule record
      await query(
        `UPDATE generated_schedules SET
          week_start_date = $1,
          week_end_date = $2,
          rule_set_id = $3,
          algorithm_used = $4,
          status = 'draft',
          score = $5,
          violated_hard_constraints = $6::jsonb,
          violated_soft_constraints = $7::jsonb,
          telemetry = $8::jsonb,
          updated_at = now()
        WHERE id = $9 AND tenant_id = $10`,
        [
          week_start_date,
          week_end_date,
          rule_set_id,
          algorithm,
          evaluation.score,
          JSON.stringify(evaluation.hardViolations),
          JSON.stringify(evaluation.softViolations),
          JSON.stringify(result.telemetry),
          scheduleId,
          orgId
        ]
      );
      
      // Audit log for replacement
      await query(
        `INSERT INTO schedule_audit_log (tenant_id, schedule_id, action, entity_type, created_by)
         VALUES ($1, $2, 'update', 'schedule', $3)`,
        [orgId, scheduleId, req.user.id]
      );
    } else {
      // Create new schedule record
      const scheduleResult = await query(
        `INSERT INTO generated_schedules (
          tenant_id, week_start_date, week_end_date, rule_set_id,
          algorithm_used, status, score, violated_hard_constraints,
          violated_soft_constraints, telemetry, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11)
        RETURNING *`,
        [
          orgId,
          week_start_date,
          week_end_date,
          rule_set_id,
          algorithm,
          'draft',
          evaluation.score,
          JSON.stringify(evaluation.hardViolations),
          JSON.stringify(evaluation.softViolations),
          JSON.stringify(result.telemetry),
          req.user.id
        ]
      );
      
      scheduleId = scheduleResult.rows[0].id;
      
      // Audit log for creation
      await query(
        `INSERT INTO schedule_audit_log (tenant_id, schedule_id, action, entity_type, created_by)
         VALUES ($1, $2, 'create', 'schedule', $3)`,
        [orgId, scheduleId, req.user.id]
      );
    }

    // Create assignments
    console.log(`[Scheduling] Creating ${result.assignments?.length || 0} assignments in database`);
    
    if (result.assignments && result.assignments.length > 0) {
      // Insert assignments one by one to avoid SQL injection and handle errors better
      for (const assignment of result.assignments) {
        try {
          await query(
            `INSERT INTO schedule_assignments (
              schedule_id, tenant_id, employee_id, shift_date,
              shift_template_id, start_time, end_time, assigned_by, assigned_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (schedule_id, employee_id, shift_date, start_time) DO NOTHING`,
            [
              scheduleId,
              orgId,
              assignment.employee_id,
              assignment.shift_date,
              assignment.shift_template_id,
              assignment.start_time,
              assignment.end_time,
              assignment.assigned_by || 'algorithm',
              req.user.id
            ]
          );
        } catch (err) {
          console.error(`[Scheduling] Error inserting assignment:`, err);
          // Continue with other assignments
        }
      }
      console.log(`[Scheduling] Successfully created assignments`);
    } else {
      console.warn(`[Scheduling] No assignments to create - result.assignments is empty or undefined`);
    }

    // Fetch complete schedule with assignments (with employee names)
    const completeScheduleResult = await query(
      `SELECT s.*
       FROM generated_schedules s
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [scheduleId, orgId]
    );

    const assignmentsWithNames = await query(
      `SELECT a.*,
        e.employee_id,
        p.first_name,
        p.last_name,
        t.name as template_name,
        t.shift_type,
        ap.first_name as assigned_by_first_name,
        ap.last_name as assigned_by_last_name
       FROM schedule_assignments a
       JOIN employees e ON e.id = a.employee_id
       JOIN profiles p ON p.id = e.user_id
       JOIN shift_templates t ON t.id = a.shift_template_id
       LEFT JOIN profiles ap ON ap.id = a.assigned_by_user_id
       WHERE a.schedule_id = $1 AND a.tenant_id = $2
       ORDER BY a.shift_date ASC, a.start_time ASC`,
      [scheduleId, orgId]
    );

    const scheduleData = completeScheduleResult.rows[0];
    
    // Format dates as strings (yyyy-MM-dd) to avoid timezone issues
    if (scheduleData.week_start_date) {
      scheduleData.week_start_date = scheduleData.week_start_date instanceof Date 
        ? scheduleData.week_start_date.toISOString().split('T')[0]
        : String(scheduleData.week_start_date).split('T')[0];
    }
    if (scheduleData.week_end_date) {
      scheduleData.week_end_date = scheduleData.week_end_date instanceof Date 
        ? scheduleData.week_end_date.toISOString().split('T')[0]
        : String(scheduleData.week_end_date).split('T')[0];
    }

    res.status(201).json({
      ...scheduleData,
      assignments: assignmentsWithNames.rows,
      employees: rosterEmployees,
      evaluation: {
        isValid: evaluation.isValid,
        hardViolations: evaluation.hardViolations,
        softViolations: evaluation.softViolations,
        score: evaluation.score
      },
      fairness_summary: result.telemetry?.fairness || null,
      exception_suggestions: result.telemetry?.unfilledSlots || []
    });
  } catch (error) {
    console.error('Error generating schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/scheduling/schedules
router.get('/schedules', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { week_start, week_end, status } = req.query;
    const orgId = req.orgId;

    let queryStr = `
      SELECT s.*,
        (SELECT COUNT(*) FROM schedule_assignments a WHERE a.schedule_id = s.id) as assignment_count
      FROM generated_schedules s
      WHERE s.tenant_id = $1
    `;
    const params = [orgId];

    if (week_start) {
      queryStr += ` AND s.week_start_date >= $${params.length + 1}`;
      params.push(week_start);
    }

    if (week_end) {
      queryStr += ` AND s.week_end_date <= $${params.length + 1}`;
      params.push(week_end);
    }

    if (status) {
      queryStr += ` AND s.status = $${params.length + 1}`;
      params.push(status);
    }

    queryStr += ` ORDER BY s.week_start_date DESC, s.created_at DESC`;

    const result = await query(queryStr, params);
    
    // Format dates as strings (yyyy-MM-dd) for all schedules
    const formattedSchedules = result.rows.map(schedule => {
      if (schedule.week_start_date) {
        schedule.week_start_date = schedule.week_start_date instanceof Date 
          ? schedule.week_start_date.toISOString().split('T')[0]
          : String(schedule.week_start_date).split('T')[0];
      }
      if (schedule.week_end_date) {
        schedule.week_end_date = schedule.week_end_date instanceof Date 
          ? schedule.week_end_date.toISOString().split('T')[0]
          : String(schedule.week_end_date).split('T')[0];
      }
      return schedule;
    });
    
    res.json(formattedSchedules);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/scheduling/schedules/:id
router.get('/schedules/:id', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId;

    const scheduleResult = await query(
      `SELECT * FROM generated_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, orgId]
    );

    if (scheduleResult.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const assignmentsResult = await query(
      `SELECT a.*,
        e.employee_id,
        p.first_name,
        p.last_name,
        t.name as template_name,
        t.shift_type,
        ap.first_name as assigned_by_first_name,
        ap.last_name as assigned_by_last_name
       FROM schedule_assignments a
       JOIN employees e ON e.id = a.employee_id
       JOIN profiles p ON p.id = e.user_id
       JOIN shift_templates t ON t.id = a.shift_template_id
       LEFT JOIN profiles ap ON ap.id = a.assigned_by_user_id
       WHERE a.schedule_id = $1 AND a.tenant_id = $2
       ORDER BY a.shift_date ASC, a.start_time ASC`,
      [id, orgId]
    );

    const rosterResult = await query(
      `SELECT e.id, p.first_name, p.last_name, p.email
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       WHERE e.tenant_id = $1
         AND e.status = 'active'
       ORDER BY p.first_name, p.last_name`,
      [orgId]
    );

    const scheduleData = scheduleResult.rows[0];
    
    // Format dates as strings (yyyy-MM-dd) to avoid timezone issues
    if (scheduleData.week_start_date) {
      scheduleData.week_start_date = scheduleData.week_start_date instanceof Date 
        ? scheduleData.week_start_date.toISOString().split('T')[0]
        : String(scheduleData.week_start_date).split('T')[0];
    }
    if (scheduleData.week_end_date) {
      scheduleData.week_end_date = scheduleData.week_end_date instanceof Date 
        ? scheduleData.week_end_date.toISOString().split('T')[0]
        : String(scheduleData.week_end_date).split('T')[0];
    }

    let telemetryObj = scheduleData.telemetry;
    if (telemetryObj && typeof telemetryObj === 'string') {
      try {
        telemetryObj = JSON.parse(telemetryObj);
      } catch {
        telemetryObj = null;
      }
    }

    const fairnessSummary = telemetryObj?.fairness || null;
    const exceptionSuggestions = telemetryObj?.unfilledSlots || [];

    res.json({
      ...scheduleData,
      assignments: assignmentsResult.rows,
      employees: rosterResult.rows,
      fairness_summary: fairnessSummary,
      exception_suggestions: exceptionSuggestions
    });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/scheduling/schedules/:id
router.delete('/schedules/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId;

    // Check if schedule exists
    const scheduleCheck = await query(
      `SELECT id, status FROM generated_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, orgId]
    );

    if (scheduleCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    // Audit log BEFORE deleting (so the foreign key reference still exists)
    await query(
      `INSERT INTO schedule_audit_log (tenant_id, schedule_id, action, entity_type, created_by)
       VALUES ($1, $2, 'delete', 'schedule', $3)`,
      [orgId, id, req.user.id]
    );

    // Delete assignments first (CASCADE should handle this, but being explicit)
    await query(
      `DELETE FROM schedule_assignments WHERE schedule_id = $1`,
      [id]
    );

    // Delete schedule
    await query(
      `DELETE FROM generated_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, orgId]
    );

    res.json({ success: true, message: 'Schedule deleted successfully' });
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/scheduling/schedules/:id/approve
router.patch('/schedules/:id/approve', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId;

    const result = await query(
      `UPDATE generated_schedules
       SET status = 'approved', approved_by = $1, approved_at = now()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [req.user.id, id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule not found' });
    }

    const schedule = result.rows[0];

    // Audit log
    await query(
      `INSERT INTO schedule_audit_log (tenant_id, schedule_id, action, entity_type, created_by)
       VALUES ($1, $2, 'approve', 'schedule', $3)`,
      [orgId, id, req.user.id]
    );

    // === Create timesheet entries from approved schedule assignments ===
    try {
      // Fetch all assignments for this schedule with template info
      const assignmentsRes = await query(
        `SELECT 
           sa.employee_id,
           sa.shift_date,
           sa.start_time,
           sa.end_time,
           st.name AS template_name
         FROM schedule_assignments sa
         JOIN shift_templates st ON st.id = sa.shift_template_id
         WHERE sa.schedule_id = $1
           AND sa.tenant_id = $2`,
        [id, orgId]
      );

      const assignments = assignmentsRes.rows;

      if (assignments.length > 0) {
        // Group assignments by employee
        const assignmentsByEmployee = assignments.reduce((acc, row) => {
          if (!acc[row.employee_id]) acc[row.employee_id] = [];
          acc[row.employee_id].push(row);
          return acc;
        }, {});

        // Determine week range for timesheets from schedule (fallback to shift range if needed)
        const scheduleWeekStart = schedule.week_start_date;
        const scheduleWeekEnd = schedule.week_end_date;

        for (const [employeeId, empAssignments] of Object.entries(assignmentsByEmployee)) {
          // Ensure there is a pending timesheet for this employee and week
          let timesheetId = null;

          if (scheduleWeekStart && scheduleWeekEnd) {
            const existingTs = await query(
              `SELECT id 
               FROM timesheets 
               WHERE employee_id = $1 
                 AND tenant_id = $2 
                 AND week_start_date = $3::date 
                 AND week_end_date = $4::date
               LIMIT 1`,
              [employeeId, orgId, scheduleWeekStart, scheduleWeekEnd]
            );

            if (existingTs.rows.length > 0) {
              timesheetId = existingTs.rows[0].id;
            } else {
              // Create a new pending timesheet (do not auto-submit)
              try {
                const insertTs = await query(
                  `INSERT INTO timesheets (
                     employee_id, week_start_date, week_end_date, total_hours, tenant_id, status, submitted_at
                   )
                   VALUES ($1, $2::date, $3::date, 0, $4, 'pending', NULL)
                   RETURNING id`,
                  [employeeId, scheduleWeekStart, scheduleWeekEnd, orgId]
                );
                timesheetId = insertTs.rows[0].id;
              } catch (err) {
                // Fallback if submitted_at cannot be NULL (older schema)
                if (err.message && err.message.includes('submitted_at') && err.message.includes('null value')) {
                  const insertTs = await query(
                    `INSERT INTO timesheets (
                       employee_id, week_start_date, week_end_date, total_hours, tenant_id, status
                     )
                     VALUES ($1, $2::date, $3::date, 0, $4, 'pending')
                     RETURNING id`,
                    [employeeId, scheduleWeekStart, scheduleWeekEnd, orgId]
                  );
                  timesheetId = insertTs.rows[0].id;
                } else {
                  throw err;
                }
              }
            }
          }

          if (!timesheetId) {
            // If we couldn't determine a week range, skip creating entries for safety
            // rather than inserting incorrect timesheet rows.
            continue;
          }

          // For each assignment, create a timesheet entry if one doesn't already exist for that date/source
          for (const assignment of empAssignments) {
            const workDate = assignment.shift_date;
            const startTime = assignment.start_time;
            const endTime = assignment.end_time;

            // Compute duration in hours (handle overnight)
            let start = new Date(`${workDate}T${startTime}`);
            let end = new Date(`${workDate}T${endTime}`);
            if (endTime && startTime && startTime > endTime) {
              // Crosses midnight, add 1 day to end
              end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
            }
            const durationHours = Math.max(
              0,
              (end.getTime() - start.getTime()) / (1000 * 60 * 60)
            );

            // Skip zero or negative durations
            if (!durationHours || durationHours <= 0) continue;

            // Avoid duplicate shift entries (same timesheet + date + employee + source='shift')
            const existingEntry = await query(
              `SELECT id 
               FROM timesheet_entries 
               WHERE timesheet_id = $1 
                 AND employee_id = $2
                 AND work_date = $3::date
                 AND source = 'shift'
               LIMIT 1`,
              [timesheetId, employeeId, workDate]
            );

            if (existingEntry.rows.length > 0) {
              continue;
            }

            const description =
              assignment.template_name
                ? `Shift: ${assignment.template_name}`
                : 'Scheduled shift';

            await query(
              `INSERT INTO timesheet_entries (
                 timesheet_id,
                 employee_id,
                 tenant_id,
                 work_date,
                 hours,
                 source,
                 description,
                 readonly
               )
               VALUES ($1, $2, $3, $4::date, $5, 'shift', $6, false)`,
              [timesheetId, employeeId, orgId, workDate, durationHours, description]
            );
          }
        }
      }
    } catch (err) {
      console.error('[Scheduling] Failed to create timesheet entries from approved schedule:', err);
      // Do not fail schedule approval if timesheet sync fails
    }

    res.json(schedule);
  } catch (error) {
    console.error('Error approving schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/scheduling/schedules/:id/manual-edit
router.patch('/schedules/:id/manual-edit', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { assignments, reason } = req.body;
    const orgId = req.orgId;

    if (!Array.isArray(assignments)) {
      return res.status(400).json({ error: 'assignments must be an array' });
    }

    // Update or create assignments
    for (const assignment of assignments) {
      if (assignment.id) {
        // Update existing
        await query(
          `UPDATE schedule_assignments
           SET employee_id = $1, shift_date = $2, shift_template_id = $3,
               start_time = $4, end_time = $5, assigned_by = 'manual',
               assigned_by_user_id = $6, updated_at = now()
           WHERE id = $7 AND schedule_id = $8`,
          [
            assignment.employee_id,
            assignment.shift_date,
            assignment.shift_template_id,
            assignment.start_time,
            assignment.end_time,
            req.user.id,
            assignment.id,
            id
          ]
        );
      } else {
        // Create new
        await query(
          `INSERT INTO schedule_assignments (
            schedule_id, tenant_id, employee_id, shift_date,
            shift_template_id, start_time, end_time, assigned_by, assigned_by_user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'manual', $8)`,
          [
            id,
            orgId,
            assignment.employee_id,
            assignment.shift_date,
            assignment.shift_template_id,
            assignment.start_time,
            assignment.end_time,
            req.user.id
          ]
        );
      }
    }

    // Audit log
    await query(
      `INSERT INTO schedule_audit_log (
        tenant_id, schedule_id, action, entity_type, changes, reason, created_by
      ) VALUES ($1, $2, 'manual_edit', 'schedule', $3::jsonb, $4, $5)`,
      [orgId, id, JSON.stringify({ assignments }), reason || 'Manual edit', req.user.id]
    );

    // Re-evaluate schedule
    const scheduleResult = await query(
      `SELECT * FROM generated_schedules WHERE id = $1 AND tenant_id = $2`,
      [id, orgId]
    );

    if (scheduleResult.rows.length > 0) {
      const schedule = scheduleResult.rows[0];
      const ruleSetResult = await query(
        `SELECT * FROM scheduling_rule_sets WHERE id = $1 AND tenant_id = $2`,
        [schedule.rule_set_id, orgId]
      );

      if (ruleSetResult.rows.length > 0) {
        const ruleSet = ruleSetResult.rows[0];
        const ruleEngine = new RuleEngine(ruleSet.rules || []);

        const assignmentsResult = await query(
          `SELECT * FROM schedule_assignments WHERE schedule_id = $1 AND tenant_id = $2`,
          [id, orgId]
        );

        const evaluation = ruleEngine.evaluate(
          schedule,
          assignmentsResult.rows,
          {} // Context would need to be fetched
        );

        // Update schedule score
        await query(
          `UPDATE generated_schedules
           SET score = $1, violated_hard_constraints = $2::jsonb,
               violated_soft_constraints = $3::jsonb, updated_at = now()
           WHERE id = $4`,
          [
            evaluation.score,
            JSON.stringify(evaluation.hardViolations),
            JSON.stringify(evaluation.softViolations),
            id
          ]
        );
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error manually editing schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== EXCEPTIONS ==========

// POST /api/scheduling/exceptions
router.post('/exceptions', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const {
      schedule_id,
      employee_id,
      rule_id,
      exception_type,
      reason
    } = req.body;

    if (!employee_id || !rule_id || !exception_type || !reason) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const orgId = req.orgId;
    const result = await query(
      `INSERT INTO schedule_exceptions (
        tenant_id, schedule_id, employee_id, rule_id,
        exception_type, reason, requested_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [orgId, schedule_id || null, employee_id, rule_id, exception_type, reason, req.user.id]
    );

    // Audit log
    await query(
      `INSERT INTO schedule_audit_log (
        tenant_id, schedule_id, action, entity_type, entity_id, created_by
      ) VALUES ($1, $2, 'exception_request', 'exception', $3, $4)`,
      [orgId, schedule_id, result.rows[0].id, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating exception:', error);
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/scheduling/exceptions/:id/approve
router.patch('/exceptions/:id/approve', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin', 'manager'), async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId;

    const result = await query(
      `UPDATE schedule_exceptions
       SET status = 'approved', approved_by = $1, approved_at = now()
       WHERE id = $2 AND tenant_id = $3
       RETURNING *`,
      [req.user.id, id, orgId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exception not found' });
    }

    // Audit log
    await query(
      `INSERT INTO schedule_audit_log (
        tenant_id, action, entity_type, entity_id, created_by
      ) VALUES ($1, 'exception_approve', 'exception', $2, $3)`,
      [orgId, id, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error approving exception:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== EXPORTS ==========

// GET /api/scheduling/schedules/:id/export/csv
router.get('/schedules/:id/export/csv', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.orgId;

    const assignmentsResult = await query(
      `SELECT 
        a.shift_date, a.start_time, a.end_time, a.assigned_by,
        e.employee_id, p.first_name, p.last_name,
        t.name as shift_name, t.shift_type
       FROM schedule_assignments a
       JOIN employees e ON e.id = a.employee_id
       JOIN profiles p ON p.id = e.user_id
       JOIN shift_templates t ON t.id = a.shift_template_id
       JOIN generated_schedules s ON s.id = a.schedule_id
       WHERE a.schedule_id = $1 AND s.tenant_id = $2
       ORDER BY a.shift_date ASC, a.start_time ASC`,
      [id, orgId]
    );

    // Generate CSV
    const headers = ['Date', 'Employee ID', 'Employee Name', 'Shift Name', 'Shift Type', 'Start Time', 'End Time', 'Assigned By'];
    const rows = assignmentsResult.rows.map(a => [
      a.shift_date,
      a.employee_id,
      `${a.first_name} ${a.last_name}`,
      a.shift_name,
      a.shift_type,
      a.start_time,
      a.end_time,
      a.assigned_by
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="schedule-${id}.csv"`);
    res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

