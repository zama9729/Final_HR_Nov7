import { queryWithOrg, withClient } from '../db/pool.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

export function normalizeCoveragePlan(coveragePlan = []) {
  if (!Array.isArray(coveragePlan)) return [];
  return coveragePlan
    .filter((entry) => entry && entry.shift_name && entry.start_time && entry.end_time)
    .map((entry) => ({
      day_of_week: Array.isArray(entry.day_of_week)
        ? entry.day_of_week.map((d) => Number(d))
        : [Number(entry.day_of_week ?? -1)],
      shift_name: entry.shift_name,
      start_time: entry.start_time,
      end_time: entry.end_time,
      coverage_required: Number(entry.coverage_required || entry.coverage || 1),
      required_skill: entry.required_skill || null,
      is_night:
        typeof entry.is_night === 'boolean'
          ? entry.is_night
          : isNightShift(entry.start_time, entry.end_time),
      template_rule_id: entry.template_rule_id || null,
    }))
    .filter((entry) => entry.day_of_week.every((d) => d >= 0 && d <= 6));
}

export function isNightShift(startTime, endTime) {
  if (!startTime || !endTime) return false;
  const start = parseTime(startTime);
  const end = parseTime(endTime);
  return start >= 22 || end <= 6 || end < start;
}

export function generateCoverageSlots(coveragePlan, startDate, endDate) {
  const normalizedPlan = normalizeCoveragePlan(coveragePlan);
  const slots = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.valueOf()) || Number.isNaN(end.valueOf()) || start > end) {
    return [];
  }

  for (
    let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    cursor <= end;
    cursor.setDate(cursor.getDate() + 1)
  ) {
    const dateStr = formatDateKey(cursor);
    const dayOfWeek = cursor.getDay();
    normalizedPlan.forEach((rule) => {
      if (!rule.day_of_week.includes(dayOfWeek)) return;
      const total = Math.max(1, rule.coverage_required || 1);
      for (let pos = 0; pos < total; pos += 1) {
        slots.push({
          shiftDate: dateStr,
          shiftName: rule.shift_name,
          startTime: rule.start_time,
          endTime: rule.end_time,
          isNight: rule.is_night,
          requiredSkill: rule.required_skill,
          templateRuleId: rule.template_rule_id || null,
          positionIndex: pos,
        });
      }
    });
  }
  return slots;
}

function formatDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function rotateEmployees(employees, seed = 0) {
  if (!Array.isArray(employees) || employees.length === 0) return [];
  const ordered = [...employees].sort((a, b) => {
    const aKey = `${a.employee_id || ''}-${a.id}`;
    const bKey = `${b.employee_id || ''}-${b.id}`;
    return aKey.localeCompare(bKey);
  });
  if (!seed) {
    return ordered;
  }
  const rotation = Math.abs(Math.floor(Number(seed))) % ordered.length;
  return ordered.slice(rotation).concat(ordered.slice(0, rotation));
}

function parseTime(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const [hours] = timeStr.split(':').map((part) => Number(part));
  return Number.isFinite(hours) ? hours : 0;
}

function combineDateAndTime(dateStr, timeStr) {
  const safeTime = timeStr || '00:00';
  // Parse date and time components separately to avoid timezone issues
  // Times are treated as local time on the given date
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes = 0] = safeTime.split(':').map(Number);
  
  // Create date in local timezone (not UTC) to ensure accurate rest hours calculation
  const date = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(date.valueOf())) {
    // Fallback to simple date parsing
    return new Date(dateStr);
  }
  return date;
}

function addDays(date, days) {
  const copy = new Date(date.valueOf());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function slotKey(slot) {
  return `${slot.shiftDate}|${slot.shiftName}|${slot.startTime}|${slot.positionIndex}`;
}

function buildLeaveMap(leaves) {
  const map = new Map();
  leaves.forEach((leave) => {
    if (!map.has(leave.employee_id)) {
      map.set(leave.employee_id, []);
    }
    map.get(leave.employee_id).push({
      start: new Date(leave.start_date),
      end: new Date(leave.end_date),
    });
  });
  return map;
}

function isEmployeeOnLeave(leaveMap, employeeId, dateStr) {
  if (!leaveMap || !leaveMap.size) return false;
  const entries = leaveMap.get(employeeId);
  if (!entries || entries.length === 0) return false;
  const targetDate = new Date(dateStr);
  return entries.some((entry) => targetDate >= entry.start && targetDate <= addDays(entry.end, 1));
}

function hoursBetween(dateA, dateB) {
  return Math.abs(dateA.valueOf() - dateB.valueOf()) / ONE_HOUR_MS;
}

export function assignSlotsToEmployees(slots, employees, options = {}) {
  const {
    leaveMap,
    minRestHours = 8,
    maxConsecutiveNights = 2,
    seed = 0,
    lockedAssignments = new Map(),
  } = options;

  // Sort slots chronologically by date and start time to ensure accurate rest hours tracking
  const sortedSlots = [...slots].sort((a, b) => {
    const dateCompare = a.shiftDate.localeCompare(b.shiftDate);
    if (dateCompare !== 0) return dateCompare;
    const timeA = a.startTime || '00:00';
    const timeB = b.startTime || '00:00';
    return timeA.localeCompare(timeB);
  });

  const order = rotateEmployees(employees, seed);
  const results = [];
  const state = {
    lastAssignmentEnd: new Map(),
    consecutiveNights: new Map(),
    lastNightDate: new Map(), // Track last night shift date to reset counter properly
  };
  let pointer = 0;
  let assignedCount = 0;
  let lockPreserved = 0;
  const conflicts = [];

  console.log(`[RosterEngine] Processing ${sortedSlots.length} slots for ${order.length} employees`);
  console.log(`[RosterEngine] Constraints: minRestHours=${minRestHours}, maxConsecutiveNights=${maxConsecutiveNights}`);

  sortedSlots.forEach((slot, index) => {
    const key = slotKey(slot);
    const locked = lockedAssignments.get(key);
    if (locked && locked.assigned_employee_id) {
      results.push({
        ...slot,
        assignedEmployeeId: locked.assigned_employee_id,
        assignmentSource: 'manual',
        manualLock: true,
        assignmentStatus: 'assigned',
        conflictFlags: [],
        warningFlags: [],
      });
      assignedCount += 1;
      lockPreserved += 1;
      const lockedEnd = combineDateAndTime(slot.shiftDate, slot.endTime);
      const lockedShiftEnd = slot.endTime && slot.endTime <= slot.startTime
        ? addDays(lockedEnd, 1)
        : lockedEnd;
      state.lastAssignmentEnd.set(locked.assigned_employee_id, lockedShiftEnd);
      
      // Reset consecutive nights if it's been more than 1 day since last night shift
      if (slot.isNight) {
        const lastNightDate = state.lastNightDate.get(locked.assigned_employee_id);
        const currentDate = slot.shiftDate;
        if (!lastNightDate || currentDate !== lastNightDate) {
          // Check if dates are consecutive
          const dateDiff = new Date(currentDate).valueOf() - new Date(lastNightDate || currentDate).valueOf();
          const daysDiff = dateDiff / (24 * 60 * 60 * 1000);
          if (daysDiff > 1) {
            state.consecutiveNights.set(locked.assigned_employee_id, 0);
          }
        }
        const current = state.consecutiveNights.get(locked.assigned_employee_id) || 0;
        state.consecutiveNights.set(locked.assigned_employee_id, current + 1);
        state.lastNightDate.set(locked.assigned_employee_id, slot.shiftDate);
      } else {
        // Reset consecutive nights counter when a non-night shift is assigned
        state.consecutiveNights.set(locked.assigned_employee_id, 0);
      }
      return;
    }

    if (!order.length) {
      conflicts.push({
        slot,
        reason: 'no_employees_available',
      });
      results.push({
        ...slot,
        assignedEmployeeId: null,
        assignmentSource: 'auto',
        manualLock: false,
        assignmentStatus: 'unassigned',
        conflictFlags: ['no_employees_available'],
        warningFlags: [],
      });
      return;
    }

    let assignedEmployee = null;
    for (let attempt = 0; attempt < order.length; attempt += 1) {
      const idx = (pointer + attempt) % order.length;
      const candidate = order[idx];

      if (
        candidate &&
        candidate.id &&
        !isEmployeeOnLeave(leaveMap, candidate.id, slot.shiftDate) &&
        respectsRest(
          candidate.id,
          slot,
          state.lastAssignmentEnd,
          minRestHours
        ) &&
        respectsNightLimit(candidate.id, slot, state.consecutiveNights, maxConsecutiveNights)
      ) {
        assignedEmployee = candidate;
        pointer = (idx + 1) % order.length;
        break;
      }
    }

    if (!assignedEmployee) {
      // Log why assignment failed for debugging
      const debugReasons = [];
      order.forEach((emp) => {
        if (!emp || !emp.id) return;
        if (isEmployeeOnLeave(leaveMap, emp.id, slot.shiftDate)) {
          debugReasons.push(`${emp.id}: on leave`);
        } else if (!respectsRest(emp.id, slot, state.lastAssignmentEnd, minRestHours)) {
          const prevEnd = state.lastAssignmentEnd.get(emp.id);
          const currentStart = combineDateAndTime(slot.shiftDate, slot.startTime);
          const restHours = prevEnd ? (currentStart.valueOf() - prevEnd.valueOf()) / ONE_HOUR_MS : 0;
          debugReasons.push(`${emp.id}: insufficient rest (${restHours.toFixed(1)}h < ${minRestHours}h)`);
        } else if (!respectsNightLimit(emp.id, slot, state.consecutiveNights, maxConsecutiveNights)) {
          const nights = state.consecutiveNights.get(emp.id) || 0;
          debugReasons.push(`${emp.id}: too many consecutive nights (${nights} >= ${maxConsecutiveNights})`);
        }
      });
      if (debugReasons.length > 0 && index < 5) {
        console.log(`[RosterEngine] Slot ${slot.shiftDate} ${slot.shiftName} unassigned. Reasons: ${debugReasons.slice(0, 3).join(', ')}`);
      }
      
      conflicts.push({
        slot,
        reason: 'no_available_candidate',
      });
      results.push({
        ...slot,
        assignedEmployeeId: null,
        assignmentSource: 'auto',
        manualLock: false,
        assignmentStatus: 'unassigned',
        conflictFlags: ['no_available_candidate'],
        warningFlags: [],
      });
      return;
    }

    assignedCount += 1;
    const assignmentEnd = combineDateAndTime(slot.shiftDate, slot.endTime);
    const shiftEnd =
      slot.endTime && slot.endTime <= slot.startTime
        ? addDays(assignmentEnd, 1)
        : assignmentEnd;
    state.lastAssignmentEnd.set(assignedEmployee.id, shiftEnd);
    
    // Reset consecutive nights if it's been more than 1 day since last night shift
    if (slot.isNight) {
      const lastNightDate = state.lastNightDate.get(assignedEmployee.id);
      const currentDate = slot.shiftDate;
      if (!lastNightDate || currentDate !== lastNightDate) {
        // Check if dates are consecutive
        const dateDiff = new Date(currentDate).valueOf() - new Date(lastNightDate || currentDate).valueOf();
        const daysDiff = dateDiff / (24 * 60 * 60 * 1000);
        if (daysDiff > 1) {
          state.consecutiveNights.set(assignedEmployee.id, 0);
        }
      }
      const current = state.consecutiveNights.get(assignedEmployee.id) || 0;
      state.consecutiveNights.set(assignedEmployee.id, current + 1);
      state.lastNightDate.set(assignedEmployee.id, slot.shiftDate);
    } else {
      // Reset consecutive nights counter when a non-night shift is assigned
      state.consecutiveNights.set(assignedEmployee.id, 0);
    }

    results.push({
      ...slot,
      assignedEmployeeId: assignedEmployee.id,
      assignmentSource: 'auto',
      manualLock: false,
      assignmentStatus: 'assigned',
      conflictFlags: [],
      warningFlags: [],
    });
  });

  const summary = {
    totalSlots: sortedSlots.length,
    assignedSlots: assignedCount,
    unassignedSlots: sortedSlots.length - assignedCount,
    preservedManualSlots: lockPreserved,
    conflicts: conflicts.length,
  };
  
  console.log(`[RosterEngine] Assignment complete: ${summary.assignedSlots}/${summary.totalSlots} slots assigned, ${summary.conflicts} conflicts`);
  
  return {
    slots: results,
    summary,
    conflicts,
  };
}

function respectsRest(employeeId, slot, lastAssignmentEnd, minRestHours) {
  const previousEnd = lastAssignmentEnd.get(employeeId);
  if (!previousEnd) return true;
  const currentStart = combineDateAndTime(slot.shiftDate, slot.startTime);
  const diffMs = currentStart.valueOf() - previousEnd.valueOf();
  const restHours = diffMs / ONE_HOUR_MS;
  // Allow small negative differences (up to 1 hour) to handle edge cases with time rounding
  // This can happen when shifts end and start at the same time or very close
  if (diffMs < 0 && Math.abs(diffMs) <= ONE_HOUR_MS) {
    return true;
  }
  return restHours >= minRestHours;
}

function respectsNightLimit(employeeId, slot, consecutiveNights, maxConsecutiveNights) {
  if (!slot.isNight) return true;
  const current = consecutiveNights.get(employeeId) || 0;
  return current < maxConsecutiveNights;
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

async function fetchApprovedLeaves(client, tenantId, startDate, endDate) {
  const result = await client.query(
    `SELECT employee_id, start_date, end_date
     FROM leave_requests
     WHERE tenant_id = $1
       AND status = 'approved'
       AND start_date <= $3::date
       AND end_date >= $2::date`,
    [tenantId, startDate, endDate]
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

        if (!effectiveTemplateId) {
          throw new Error('templateId is required');
        }

        const templateResult = await client.query(
          `SELECT *
           FROM schedule_templates
           WHERE id = $1 AND tenant_id = $2`,
          [effectiveTemplateId, tenantId]
        );

        if (templateResult.rows.length === 0) {
          throw new Error('Schedule template not found for tenant');
        }

        const template = templateResult.rows[0];
        const coveragePlan = normalizeCoveragePlan(template.coverage_plan);
        if (!coveragePlan.length) {
          throw new Error('Template coverage plan is empty');
        }

        const employees = await fetchActiveEmployees(client, tenantId);
        if (!employees.length) {
          throw new Error('No active employees available for scheduling');
        }

        const slots = generateCoverageSlots(coveragePlan, effectiveStartDate, effectiveEndDate);
        if (!slots.length) {
          throw new Error('No schedule slots generated for the selected range');
        }

        const leaves = await fetchApprovedLeaves(client, tenantId, effectiveStartDate, effectiveEndDate);
        const leaveMap = buildLeaveMap(leaves);

        const lockedAssignments = preserveManualEdits
          ? new Map(
              (await fetchLockedSlots(client, existingScheduleId)).map((slotRow) => [
                slotKey({
                  shiftDate: slotRow.shift_date,
                  shiftName: slotRow.shift_name,
                  startTime: slotRow.start_time,
                  positionIndex: slotRow.position_index,
                }),
                slotRow,
              ])
            )
          : new Map();

        const assignmentResult = assignSlotsToEmployees(slots, employees, {
          leaveMap,
          minRestHours: template.rest_rules?.min_rest_hours || 8,
          maxConsecutiveNights: template.rest_rules?.max_consecutive_nights || 2,
          seed,
          lockedAssignments,
        });

        const runResult = await client.query(
          `INSERT INTO scheduler_runs (
            tenant_id,
            template_id,
            schedule_id,
            requested_by,
            status,
            preserve_manual_edits,
            seed,
            parameters,
            summary,
            conflict_count,
            warning_count,
            created_at,
            started_at
          ) VALUES (
            $1, $2, NULL, $3, 'running', $4, $5,
            $6::jsonb, '{}'::jsonb, 0, 0, now(), now()
          )
          RETURNING *`,
          [
            tenantId,
            effectiveTemplateId,
            requestedBy,
            preserveManualEdits,
            seed || null,
            JSON.stringify({
              templateId: effectiveTemplateId,
              startDate: effectiveStartDate,
              endDate: effectiveEndDate,
              preserveManualEdits,
              existingScheduleId,
            }),
          ]
        );

        const scheduleResult = await client.query(
          `INSERT INTO schedules (
            tenant_id,
            template_id,
            run_id,
            name,
            status,
            start_date,
            end_date,
            timezone,
            source,
            metadata,
            created_by
          ) VALUES (
            $1, $2, $3, $4, 'draft', $5, $6, $7, 'auto', $8::jsonb, $9
          )
          RETURNING *`,
          [
            tenantId,
            effectiveTemplateId,
            runResult.rows[0].id,
            name || `${template.name} ${effectiveStartDate} → ${effectiveEndDate}`,
            effectiveStartDate,
            effectiveEndDate,
            template.timezone || 'UTC',
            JSON.stringify({
              coverage_plan_size: coveragePlan.length,
              preserve_manual_edits: preserveManualEdits,
            }),
            requestedBy || null,
          ]
        );

        const scheduleId = scheduleResult.rows[0].id;

        const { values: slotValueClauses, params: slotParams } = buildSlotInsert(
          assignmentResult.slots,
          scheduleId
        );

        const insertedSlots = await client.query(
          `
          INSERT INTO schedule_slots (
            schedule_id,
            shift_date,
            shift_name,
            start_time,
            end_time,
            is_night,
            required_skill,
            coverage_required,
            position_index,
            assigned_employee_id,
            assignment_source,
            assignment_status,
            manual_lock,
            conflict_flags,
            warning_flags,
            notes,
            template_rule_id,
            shift_id
          ) VALUES
          ${slotValueClauses.join(', ')}
          RETURNING id, shift_date, shift_name, start_time, end_time, position_index, assigned_employee_id, assignment_status
          `,
          slotParams
        );

        if (assignmentResult.conflicts.length > 0) {
          const slotLookup = new Map();
          insertedSlots.rows.forEach((row) => {
            slotLookup.set(
              slotKey({
                shiftDate: row.shift_date,
                shiftName: row.shift_name,
                startTime: row.start_time,
                positionIndex: row.position_index,
              }),
              row.id
            );
          });
          const conflictClauses = [];
          const conflictParams = [];
          assignmentResult.conflicts.forEach((conflict, index) => {
            const base = index * 4;
            const slotIdentifier = slotKey(conflict.slot || {});
            const linkedSlotId = slotLookup.get(slotIdentifier) || null;
            conflictClauses.push(
              `($${base + 1}, $${base + 2}, NULL, $${base + 3}, 'warning', $${base + 4}::jsonb, false, NULL, NULL)`
            );
            conflictParams.push(
              scheduleId,
              linkedSlotId,
              conflict.reason || 'unassigned_slot',
              JSON.stringify({
                reason: conflict.reason,
                shift_date: conflict.slot?.shiftDate,
                shift_name: conflict.slot?.shiftName,
              })
            );
          });
          await client.query(
            `
            INSERT INTO schedule_conflicts (
              schedule_id,
              slot_id,
              employee_id,
              conflict_type,
              severity,
              details,
              resolved,
              resolved_by,
              resolved_at
            ) VALUES
            ${conflictClauses.join(', ')}
          `,
            conflictParams
          );
        }

        const summaryPayload = {
          ...assignmentResult.summary,
          seed,
        };

        await client.query(
          `UPDATE scheduler_runs
           SET schedule_id = $1,
               status = 'completed',
               summary = $2::jsonb,
               conflict_count = $3,
               warning_count = $4,
               completed_at = now()
           WHERE id = $5`,
          [
            scheduleId,
            JSON.stringify(summaryPayload),
            assignmentResult.summary.conflicts,
            assignmentResult.summary.unassignedSlots,
            runResult.rows[0].id,
          ]
        );

        await client.query('COMMIT');

        return {
          run: {
            ...runResult.rows[0],
            status: 'completed',
            schedule_id: scheduleId,
            summary: summaryPayload,
          },
          schedule: scheduleResult.rows[0],
          slots: insertedSlots.rows,
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    },
    tenantId
  );
}

function buildSlotInsert(slots, scheduleId) {
  const params = [];
  const values = [];
  slots.forEach((slot, index) => {
    const base = index * 18;
    values.push(
      `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11}, $${base + 12}, $${base + 13}, $${base + 14}::jsonb, $${base + 15}::jsonb, $${base + 16}, $${base + 17}, $${base + 18})`
    );

    params.push(
      scheduleId,
      slot.shiftDate,
      slot.shiftName,
      slot.startTime,
      slot.endTime,
      slot.isNight,
      slot.requiredSkill,
      1,
      slot.positionIndex,
      slot.assignedEmployeeId,
      slot.assignmentSource,
      slot.assignmentStatus,
      slot.manualLock,
      JSON.stringify(slot.conflictFlags || []),
      JSON.stringify(slot.warningFlags || []),
      slot.notes || null,
      slot.templateRuleId,
      slot.shiftId || null
    );
  });
  return { params, values };
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

