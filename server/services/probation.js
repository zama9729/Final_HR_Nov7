import { query } from '../db/pool.js';

export const ACTIVE_PROBATION_STATUSES = ['in_probation', 'extended'];

export const addBusinessDays = (startDate, days) => {
  const date = new Date(startDate);
  date.setDate(date.getDate() + days);
  return date;
};

export const getActiveProbation = async (tenantId, employeeId) => {
  const { rows } = await query(
    `SELECT *
     FROM probations
     WHERE tenant_id = $1
       AND employee_id = $2
       AND status::text = ANY($3::text[])
     ORDER BY created_at DESC
     LIMIT 1`,
    [tenantId, employeeId, ACTIVE_PROBATION_STATUSES]
  );
  return rows[0] || null;
};

const diffDaysInclusive = (start, end) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return Math.max(0, Math.floor((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1);
};

export const validateLeaveWindow = async ({ tenantId, employeeId, fromDate, toDate }) => {
  const probation = await getActiveProbation(tenantId, employeeId);
  if (!probation) {
    return { allowed: true, reason: null, override_required: false };
  }

  const probationStart = new Date(probation.probation_start);
  const probationEnd = new Date(probation.probation_end);
  const requestStart = new Date(fromDate);
  const requestEnd = new Date(toDate);

  if (requestEnd < probationStart || requestStart > probationEnd) {
    return { allowed: true, reason: null, override_required: false };
  }

  const requestedDays = diffDaysInclusive(
    requestStart < probationStart ? probationStart : requestStart,
    requestEnd > probationEnd ? probationEnd : requestEnd
  );

  const leaveResult = await query(
    `SELECT start_date, end_date
     FROM leave_requests
     WHERE employee_id = $1
       AND tenant_id = $2
       AND status IN ('pending','approved')
       AND NOT (end_date < $3 OR start_date > $4)`,
    [employeeId, tenantId, probationStart, probationEnd]
  );

  let usedDays = 0;
  for (const leave of leaveResult.rows) {
    const overlapStart = new Date(Math.max(new Date(leave.start_date), probationStart));
    const overlapEnd = new Date(Math.min(new Date(leave.end_date), probationEnd));
    if (overlapEnd >= overlapStart) {
      usedDays += diffDaysInclusive(overlapStart, overlapEnd);
    }
  }

  const totalWithRequest = usedDays + requestedDays;
  const allowedLeave = probation.allowed_leave_days ?? 0;

  if (allowedLeave === 0 && requestedDays > 0) {
    return { allowed: false, reason: 'Leaves are blocked during probation', override_required: true };
  }

  if (totalWithRequest > allowedLeave) {
    return {
      allowed: false,
      reason: 'Cannot exceed probation leave allowance',
      override_required: true,
      remaining: Math.max(0, allowedLeave - usedDays),
    };
  }

  return {
    allowed: true,
    reason: null,
    override_required: totalWithRequest === allowedLeave,
    remaining: Math.max(0, allowedLeave - totalWithRequest),
  };
};

export const recordProbationEvent = async ({ probationId, tenantId, actorId, eventType, payload }) => {
  await query(
    `INSERT INTO probation_events (probation_id, tenant_id, event_type, actor_id, payload)
     VALUES ($1,$2,$3,$4,$5)`,
    [probationId, tenantId, eventType, actorId || null, JSON.stringify(payload || {})]
  );
};

