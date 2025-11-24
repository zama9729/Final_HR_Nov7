import { query, queryWithOrg } from '../db/pool.js';

function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function dayDiff(start, end) {
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / ms);
}

function computeSegments(timesheet, assignments) {
  const segments = [];
  const rangeStart = toDate(timesheet.week_start_date);
  const rangeEnd = toDate(timesheet.week_end_date);
  if (!rangeStart || !rangeEnd) return segments;

  const totalDays = dayDiff(rangeStart, rangeEnd) + 1;
  if (totalDays <= 0) return segments;

  let consumedHours = 0;
  assignments
    .sort((a, b) => {
      if (a.is_home === b.is_home) {
        return toDate(a.start_date || rangeStart) - toDate(b.start_date || rangeStart);
      }
      return a.is_home ? -1 : 1;
    })
    .forEach((assignment, idx) => {
      const assignmentStart = toDate(assignment.start_date) || rangeStart;
      const assignmentEnd = toDate(assignment.end_date) || rangeEnd;
      const segmentStart = assignmentStart > rangeStart ? assignmentStart : rangeStart;
      const segmentEnd = assignmentEnd < rangeEnd ? assignmentEnd : rangeEnd;
      if (segmentEnd < segmentStart) {
        return;
      }
      const spanDays = dayDiff(segmentStart, segmentEnd) + 1;
      if (spanDays <= 0) return;
      let hours = Number(((timesheet.total_hours * spanDays) / totalDays).toFixed(2));
      consumedHours += hours;
      const isLast = idx === assignments.length - 1;
      if (isLast && consumedHours !== timesheet.total_hours) {
        const diff = Number((timesheet.total_hours - consumedHours).toFixed(2));
        hours = Number((hours + diff).toFixed(2));
      }
      segments.push({
        assignment_id: assignment.id,
        branch_id: assignment.branch_id,
        department_id: assignment.department_id,
        team_id: assignment.team_id,
        start: segmentStart,
        end: segmentEnd,
        hours,
        fte: assignment.fte || 1,
        pay_group_id: assignment.pay_group_id || null,
      });
    });

  return segments;
}

export async function rebuildTimesheetSegmentsForOrg(orgId) {
  if (!orgId) return;
  const timesheets = await queryWithOrg(
    `SELECT id, employee_id, week_start_date, week_end_date, total_hours
     FROM timesheets
     WHERE tenant_id = $1`,
    [orgId],
    orgId
  );

  for (const ts of timesheets.rows) {
    await rebuildSegmentsForTimesheet(orgId, ts);
  }
}

export async function rebuildSegmentsForEmployee(orgId, employeeId) {
  if (!orgId || !employeeId) return;
  const timesheets = await queryWithOrg(
    `SELECT id, employee_id, week_start_date, week_end_date, total_hours
     FROM timesheets
     WHERE tenant_id = $1 AND employee_id = $2`,
    [orgId, employeeId],
    orgId
  );

  for (const ts of timesheets.rows) {
    await rebuildSegmentsForTimesheet(orgId, ts);
  }
}

async function rebuildSegmentsForTimesheet(orgId, timesheet) {
  const assignments = await queryWithOrg(
    `SELECT *
     FROM employee_assignments
     WHERE org_id = $1 AND employee_id = $2`,
    [orgId, timesheet.employee_id],
    orgId
  );

  await queryWithOrg(
    'DELETE FROM timesheet_assignment_segments WHERE timesheet_id = $1',
    [timesheet.id],
    orgId
  );

  if (assignments.rows.length === 0) {
    return;
  }

  const segments = computeSegments(timesheet, assignments.rows);

  for (const segment of segments) {
    await queryWithOrg(
      `INSERT INTO timesheet_assignment_segments (
        timesheet_id,
        employee_id,
        assignment_id,
        segment_start,
        segment_end,
        fte,
        pay_group_id,
        branch_id,
        hours_worked
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        timesheet.id,
        timesheet.employee_id,
        segment.assignment_id,
        segment.start,
        segment.end,
        segment.fte,
        segment.pay_group_id,
        segment.branch_id,
        segment.hours,
      ],
      orgId
    );
  }
}

export async function scheduleAssignmentSegmentation() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') return;
  let cron;
  try {
    ({ default: cron } = await import('node-cron'));
  } catch (error) {
    console.warn('node-cron not installed; skipping assignment segmentation job');
    return;
  }

  cron.schedule('15 * * * *', async () => {
    try {
      const orgs = await query('SELECT id FROM organizations');
      for (const org of orgs.rows) {
        await rebuildTimesheetSegmentsForOrg(org.id);
      }
    } catch (error) {
      console.error('Assignment segmentation cron error', error);
    }
  });
}


