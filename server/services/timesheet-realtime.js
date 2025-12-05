import { query } from '../db/pool.js';
import { publishTimesheetEvent } from './timesheet-bus.js';

const KOLKATA_OFFSET_MINUTES = 5.5 * 60; // UTC+5:30, no DST

function toKolkata(date) {
  const ms = date.getTime() + KOLKATA_OFFSET_MINUTES * 60 * 1000;
  return new Date(ms);
}

function dateKeyKolkata(date) {
  const local = toKolkata(date);
  return local.toISOString().slice(0, 10);
}

export async function handlePunchEvent({ tenantId, employeeId, punch }) {
  const localKey = dateKeyKolkata(new Date(punch.timestamp));

  // Recompute current day and neighbouring days to handle overnight spans
  const affected = new Set([
    localKey,
    dateKeyKolkata(new Date(new Date(punch.timestamp).getTime() - 24 * 60 * 60 * 1000)),
    dateKeyKolkata(new Date(new Date(punch.timestamp).getTime() + 24 * 60 * 60 * 1000)),
  ]);

  for (const d of affected) {
    const summary = await recomputeTimesheetDay({ tenantId, employeeId, date: d });
    if (summary) {
      await publishTimesheetEvent(employeeId, {
        event: 'timesheet.day.updated',
        data: summary,
      });
    }
  }
}

export async function recomputeTimesheetDay({ tenantId, employeeId, date }) {
  const center = new Date(date + 'T00:00:00Z');
  const from = new Date(center.getTime() - 24 * 60 * 60 * 1000);
  const to = new Date(center.getTime() + 24 * 60 * 60 * 1000);

  const { rows: punches } = await query(
    `
    SELECT *
    FROM punches
    WHERE tenant_id = $1
      AND employee_id = $2
      AND "timestamp" >= $3
      AND "timestamp" <= $4
    ORDER BY "timestamp" ASC
    `,
    [tenantId, employeeId, from, to],
  );

  if (!punches.length) {
    // No punches in the window – clear any existing summary for that day
    await query(
      `DELETE FROM timesheet_days WHERE tenant_id = $1 AND employee_id = $2 AND "date" = $3`,
      [tenantId, employeeId, date],
    );
    return null;
  }

  const { intervals, anomalies } = pairPunches(punches);
  const segmentsByDate = splitIntervalsByDay(intervals);
  const segmentsToday = segmentsByDate[date] || [];

  const totalMinutes = segmentsToday.reduce((sum, s) => sum + (s.minutes || 0), 0);
  const roundedMinutes = roundToNearest(totalMinutes, 5);
  const breakMinutes = autoBreakMinutes(roundedMinutes);
  const overtimeMinutes = Math.max(0, roundedMinutes - 8 * 60);

  const { rows: upsert } = await query(
    `
    INSERT INTO timesheet_days (
      tenant_id, employee_id, "date",
      total_minutes, rounded_minutes, overtime_minutes, break_minutes,
      status, last_recomputed_at
    )
    VALUES (
      $1, $2, $3,
      $4, $5, $6, $7,
      COALESCE(
        (SELECT status FROM timesheet_days WHERE tenant_id = $1 AND employee_id = $2 AND "date" = $3),
        'draft'
      ),
      now()
    )
    ON CONFLICT (employee_id, "date")
    DO UPDATE SET
      total_minutes = EXCLUDED.total_minutes,
      rounded_minutes = EXCLUDED.rounded_minutes,
      overtime_minutes = EXCLUDED.overtime_minutes,
      break_minutes = EXCLUDED.break_minutes,
      last_recomputed_at = now()
    RETURNING *
    `,
    [tenantId, employeeId, date, totalMinutes, roundedMinutes, overtimeMinutes, breakMinutes],
  );

  const dayRow = upsert[0];
  if (!dayRow) return null;

  await query('DELETE FROM timesheet_day_intervals WHERE timesheet_day_id = $1', [dayRow.id]);

  let seq = 1;
  for (const s of segmentsToday) {
    await query(
      `
      INSERT INTO timesheet_day_intervals (
        timesheet_day_id, sequence, in_ts, out_ts, minutes, source, flag
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)
      `,
      [dayRow.id, seq++, s.in_ts, s.out_ts, s.minutes, 'punch', s.flag || 'OK'],
    );
  }

  return buildClientSummary({ date, dayRow, segments: segmentsToday, anomalies });
}

function pairPunches(punches) {
  const intervals = [];
  const anomalies = [];
  let lastIn = null;

  for (const p of punches) {
    if (p.type === 'IN') {
      if (lastIn) {
        anomalies.push({ type: 'DUPLICATE_IN', punch_id: p.id });
        continue;
      }
      lastIn = p;
    } else if (p.type === 'OUT') {
      if (!lastIn) {
        anomalies.push({ type: 'UNMATCHED_OUT', punch_id: p.id });
        continue;
      }
      if (new Date(p.timestamp) <= new Date(lastIn.timestamp)) {
        anomalies.push({ type: 'OUT_BEFORE_IN', punch_id: p.id });
        continue;
      }
      intervals.push({ in: lastIn, out: p });
      lastIn = null;
    }
  }

  if (lastIn) {
    intervals.push({ in: lastIn, out: null, flag: 'UNRESOLVED' });
    anomalies.push({ type: 'UNRESOLVED', punch_id: lastIn.id });
  }

  return { intervals, anomalies };
}

function splitIntervalsByDay(intervals) {
  const result = {};

  for (const { in: pIn, out: pOut, flag } of intervals) {
    const inDate = new Date(pIn.timestamp);
    const outDate = pOut ? new Date(pOut.timestamp) : null;

    if (!outDate) {
      const key = dateKeyKolkata(inDate);
      result[key] ||= [];
      result[key].push({
        in_ts: inDate,
        out_ts: null,
        minutes: 0,
        flag: flag || 'UNRESOLVED',
      });
      continue;
    }

    let start = inDate;
    while (start < outDate) {
      const localStart = toKolkata(start);
      const localEnd = toKolkata(outDate);

      const dayStartLocal = new Date(localStart);
      dayStartLocal.setHours(0, 0, 0, 0);
      const dayEndLocal = new Date(dayStartLocal.getTime() + 24 * 60 * 60 * 1000);

      const segEndLocal = localEnd < dayEndLocal ? localEnd : dayEndLocal;

      const segStartUtc = new Date(segEndLocal.getTime() - (localEnd.getTime() - outDate.getTime()));
      const segEndUtc = new Date(segStartUtc.getTime() + (segEndLocal.getTime() - localStart.getTime()));

      const minutes = Math.max(
        0,
        Math.round((segEndLocal.getTime() - localStart.getTime()) / (1000 * 60)),
      );

      const key = dateKeyKolkata(start);
      result[key] ||= [];
      result[key].push({
        in_ts: segStartUtc,
        out_ts: segEndUtc,
        minutes,
        flag: flag || 'OK',
      });

      // move to next day
      start = new Date(dayEndLocal.getTime() - KOLKATA_OFFSET_MINUTES * 60 * 1000);
    }
  }

  return result;
}

function roundToNearest(minutes, interval) {
  return Math.round(minutes / interval) * interval;
}

function autoBreakMinutes(roundedMinutes) {
  return roundedMinutes > 6 * 60 ? 30 : 0;
}

function buildClientSummary({ date, dayRow, segments, anomalies }) {
  const intervals = segments.map((s) => ({
    in: s.in_ts,
    out: s.out_ts,
    minutes: s.minutes,
    flag: s.flag || 'OK',
  }));

  const hours = `${Math.floor(dayRow.rounded_minutes / 60)}h ${
    dayRow.rounded_minutes % 60
  }m`;

  const liveInterval = intervals.find((i) => !i.out) || null;

  return {
    employee_id: dayRow.employee_id,
    date,
    intervals,
    total_minutes: dayRow.total_minutes,
    rounded_minutes: dayRow.rounded_minutes,
    hours,
    overtime_minutes: dayRow.overtime_minutes,
    status: dayRow.status,
    approved_by: null,
    approval_version: dayRow.approval_version,
    flags: anomalies,
    live_interval: liveInterval,
  };
}



