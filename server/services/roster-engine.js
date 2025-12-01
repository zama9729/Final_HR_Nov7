import { queryWithOrg, withClient } from '../db/pool.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

function slotKey(slot) {
  return `${slot.shiftDate}|${slot.shiftName}|${slot.startTime}|${slot.positionIndex}`;
}

function addDays(date, days) {
  const copy = new Date(date.valueOf());
  copy.setDate(copy.getDate() + days);
  return copy;
}

async function fetchActiveEmployees(client, tenantId) {
  const result = await client.query(
    `SELECT id, employee_id, status
     FROM employees
     WHERE tenant_id = $1 AND status = 'active'
     ORDER BY employee_id ASC`,
    [tenantId]
  );
  return result.rows;
}

async function fetchLockedSlots(client, scheduleId) {
  if (!scheduleId) return [];
  const result = await client.query(
    `SELECT shift_date, shift_name, start_time, position_index, assigned_employee_id
     FROM schedule_slots
     WHERE schedule_id = $1
       AND manual_lock = true
       AND assigned_employee_id IS NOT NULL`,
    [scheduleId]
  );
  return result.rows;
}

export async function generateRosterRun({
  tenantId,
  templateId,
  startDate,
  endDate,
  requestedBy,
  preserveManualEdits = false,
  seed = 0,
  name,
  existingScheduleId = null,
  decayRate,
  shiftWeights,
  overwriteLocked = false,
  ruleSetId
}) {
  if (!tenantId) {
    throw new Error('tenantId is required for roster generation');
  }

  return withClient(
    async (client) => {
      await client.query('BEGIN');
      try {
        let effectiveTemplateId = templateId;
        let effectiveStartDate = startDate;
        let effectiveEndDate = endDate;

        if (existingScheduleId && (!templateId || !startDate || !endDate)) {
          const priorSchedule = await client.query(
            `SELECT template_id, start_date, end_date
             FROM schedules
             WHERE id = $1 AND tenant_id = $2`,
            [existingScheduleId, tenantId]
          );
          if (priorSchedule.rows.length === 0) {
            throw new Error('Existing schedule not found for rerun');
          }
          const previous = priorSchedule.rows[0];
          effectiveTemplateId = effectiveTemplateId || previous.template_id;
          effectiveStartDate = effectiveStartDate || previous.start_date;
          effectiveEndDate = effectiveEndDate || previous.end_date;
        }

        // 1. Fetch Shift Templates
        const templatesResult = await client.query(
          `SELECT * FROM shift_templates WHERE tenant_id = $1`,
          [tenantId]
        );
        const templates = templatesResult.rows;

        if (templates.length === 0) {
          throw new Error('No shift templates found');
        }

        // 2. Fetch Active Employees
        const employeesResult = await client.query(
          `SELECT e.*, p.first_name, p.last_name, p.email
           FROM employees e
           INNER JOIN profiles p ON p.id = e.user_id
           WHERE e.tenant_id = $1 AND e.status = 'active'`,
          [tenantId]
        );
        const employees = employeesResult.rows;

        if (employees.length === 0) {
          throw new Error('No active employees found');
        }

        // 3. Fetch Demand Requirements
        const demandResult = await client.query(
          `SELECT * FROM shift_demand_requirements
           WHERE tenant_id = $1
             AND (effective_from IS NULL OR effective_from <= $2)
             AND (effective_to IS NULL OR effective_to >= $3)`,
          [tenantId, effectiveEndDate, effectiveStartDate]
        );
        let demand = demandResult.rows;

        // Default demand if none exists
        if (demand.length === 0) {
          console.log('No demand requirements found. Creating default demand.');
          for (const template of templates) {
            for (let dayOfWeek = 0; dayOfWeek <= 6; dayOfWeek++) {
              demand.push({
                id: `default_${template.id}_${dayOfWeek}`,
                tenant_id: tenantId,
                shift_template_id: template.id,
                day_of_week: dayOfWeek,
                required_count: 1,
                required_roles: null
              });
            }
          }
        }

        // Generate slots from demand (for internal use and saving)
        const slots = [];
        const start = new Date(effectiveStartDate);
        const end = new Date(effectiveEndDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const dayOfWeek = d.getDay(); // 0=Sunday

          // Find demand for this day
          const dailyDemand = demand.filter(req => req.day_of_week === dayOfWeek);

          for (const req of dailyDemand) {
            const template = templates.find(t => t.id === req.shift_template_id);
            if (!template) continue;

            for (let i = 0; i < req.required_count; i++) {
              slots.push({
                shiftDate: dateStr,
                shiftName: template.name,
                startTime: template.start_time,
                endTime: template.end_time,
                isNight: template.shift_type === 'night', // or check times
                requiredSkill: req.required_roles ? req.required_roles[0] : null,
                templateRuleId: null,
                positionIndex: i,
                shift_template_id: template.id,
                shift_type: template.shift_type
              });
            }
          }
        }

        // 4. Fetch Availability & Leaves
        const employeeIds = employees.map(e => e.id);
        const availabilityResult = await client.query(
          `SELECT * FROM employee_availability
           WHERE tenant_id = $1
             AND date >= $2 AND date <= $3
             AND employee_id = ANY($4)`,
          [tenantId, effectiveStartDate, effectiveEndDate, employeeIds]
        );

        // Fetch Leaves
        const leaveResult = await client.query(
          `SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date, lr.reason
             FROM leave_requests lr
             WHERE lr.tenant_id = $1
               AND lr.status IN ('approved', 'planned')
               AND lr.employee_id = ANY($4)
               AND lr.start_date <= $3
               AND lr.end_date >= $2`,
          [tenantId, effectiveStartDate, effectiveEndDate, employeeIds]
        );

        const leaveBlackouts = [];
        for (const leave of leaveResult.rows) {
          const start = new Date(leave.start_date);
          const end = new Date(leave.end_date);
          for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            if (dateStr >= effectiveStartDate && dateStr <= effectiveEndDate) {
              leaveBlackouts.push({
                employee_id: leave.employee_id,
                date: dateStr,
                availability_type: 'blackout',
                is_forbidden: true,
                source: 'leave'
              });
            }
          }
        }

        const availability = [...availabilityResult.rows, ...leaveBlackouts];

        // 5. Fetch Prior Night Counts
        let priorNightCounts = {};

        // 6. Initialize ScoreRank Scheduler
        const { getScheduler } = await import('./scheduling/scheduler.js');
        const { RuleEngine } = await import('./scheduling/rule-engine.js');

        const ruleEngine = new RuleEngine([]);

        const scheduler = getScheduler('score_rank', ruleEngine, {
          tenantId,
          seed,
          decayRate,
          shiftWeights,
          overwriteLocked
        });

        // 7. Generate Schedule
        const result = await scheduler.generateSchedule({
          weekStart: effectiveStartDate,
          weekEnd: effectiveEndDate,
          employees,
          templates,
          demand,
          availability,
          exceptions: [],
          priorNightCounts,
          demandSlots: slots // Pass pre-generated slots
        });

        // 8. Save to Database

        // Create Schedule Record
        const scheduleResult = await client.query(
          `INSERT INTO generated_schedules (
              tenant_id, week_start_date, week_end_date, rule_set_id, algorithm_used,
              status, score, telemetry, created_by
            ) VALUES ($1, $2, $3, $4, $5, 'draft', $6, $7::jsonb, $8)
            RETURNING id`,
          [
            tenantId,
            effectiveStartDate,
            effectiveEndDate,
            ruleSetId,
            'score_rank',
            0,
            JSON.stringify(result.telemetry || {}),
            requestedBy
          ]
        );
        const scheduleId = scheduleResult.rows[0].id;

        // Insert Assignments
        if (result.assignments && result.assignments.length > 0) {
          for (const assignment of result.assignments) {
            const template = templates.find(t => t.id === assignment.shift_template_id);
            await client.query(
              `INSERT INTO schedule_assignments (
                      schedule_id, tenant_id, employee_id, shift_date,
                      shift_template_id, start_time, end_time, assigned_by, shift_type
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (schedule_id, employee_id, shift_date, start_time) DO NOTHING`,
              [
                scheduleId,
                tenantId,
                assignment.employee_id,
                assignment.shift_date,
                assignment.shift_template_id,
                assignment.start_time,
                assignment.end_time,
                'algorithm',
                template ? template.shift_type : 'day'
              ]
            );
          }
        }

        await client.query('COMMIT');

        // 9. Return formatted result
        const fullScheduleResult = await client.query(
          `SELECT * FROM generated_schedules WHERE id = $1`,
          [scheduleId]
        );
        const fullSchedule = fullScheduleResult.rows[0];

        const assignmentsResult = await client.query(
          `SELECT sa.*, p.first_name, p.last_name, t.name as template_name
             FROM schedule_assignments sa
             LEFT JOIN employees e ON e.id = sa.employee_id
             LEFT JOIN profiles p ON p.id = e.user_id
             LEFT JOIN shift_templates t ON t.id = sa.shift_template_id
             WHERE sa.schedule_id = $1`,
          [scheduleId]
        );

        return {
          ...fullSchedule,
          assignments: assignmentsResult.rows,
          employees: employees.map(e => ({
            id: e.id,
            first_name: e.first_name,
            last_name: e.last_name,
            email: e.email
          }))
        };

      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  );
}

export async function listSchedules(tenantId, { status, dateFrom, dateTo }) {
  const filters = ['tenant_id = $1'];
  const params = [tenantId];

  if (status) {
    filters.push('status = $2');
    params.push(status);
  }

  if (dateFrom) {
    filters.push(`start_date >= $${params.length + 1}::date`);
    params.push(dateFrom);
  }

  if (dateTo) {
    filters.push(`end_date <= $${params.length + 1}::date`);
    params.push(dateTo);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  const result = await queryWithOrg(
    `
    SELECT
      s.*,
      t.name AS template_name,
      r.summary AS run_summary
    FROM schedules s
    LEFT JOIN schedule_templates t ON t.id = s.template_id
    LEFT JOIN scheduler_runs r ON r.id = s.run_id
    ${whereClause}
    ORDER BY s.start_date DESC, s.created_at DESC
    `,
    params,
    tenantId
  );

  return result.rows;
}
