import { query } from '../db/pool.js';

export async function getPublishedList(orgId, region, year) {
  if (!region) return null;
  const res = await query(
    `SELECT hl.* FROM holiday_lists hl
     WHERE hl.org_id = $1 AND hl.region = $2 AND hl.year = $3 AND hl.published = true
     ORDER BY hl.created_at DESC LIMIT 1`,
    [orgId, region, year]
  );
  return res.rows[0] || null;
}

export async function getHolidaysForList(listId) {
  if (!listId) return [];
  const res = await query(
    'SELECT * FROM holidays WHERE list_id = $1 ORDER BY is_national DESC, date ASC',
    [listId]
  );
  return res.rows;
}

function formatMonth(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function dayCount(year, month) {
  return new Date(year, month, 0).getDate();
}

function isActiveAssignment(assignment, dateStr) {
  const start = assignment.start_date ? normalizeDate(assignment.start_date) : null;
  const end = assignment.end_date ? normalizeDate(assignment.end_date) : null;
  if (start && dateStr < start) return false;
  if (end && dateStr > end) return false;
  return true;
}

function extractRegionFromAssignment(assignment, calendarMap) {
  if (!assignment) return null;
  if (assignment.holiday_calendar_id && calendarMap.get(assignment.holiday_calendar_id)) {
    return calendarMap.get(assignment.holiday_calendar_id)?.region_code;
  }
  const addr = assignment.address || {};
  const region =
    addr.state ||
    addr.State ||
    addr.city ||
    addr.City ||
    addr.country ||
    addr.Country;
  return region || null;
}

function fallbackRegion(employee) {
  return (
    employee?.work_location ||
    employee?.state ||
    employee?.location ||
    'remote'
  );
}

async function fetchAssignments(employeeId) {
  if (!employeeId) return [];
  const res = await query(
    `SELECT ea.*, ob.name as branch_name, ob.address, ob.holiday_calendar_id
     FROM employee_assignments ea
     LEFT JOIN org_branches ob ON ob.id = ea.branch_id
     WHERE ea.employee_id = $1
     ORDER BY ea.is_home DESC, ea.start_date DESC NULLS LAST`,
    [employeeId]
  );
  return res.rows;
}

async function fetchCalendars(calendarIds) {
  if (!calendarIds.length) return new Map();
  const res = await query(
    'SELECT id, region_code FROM holiday_calendars WHERE id = ANY($1)',
    [calendarIds]
  );
  return new Map(res.rows.map((row) => [row.id, row]));
}

async function buildRegionMap(orgId, year, assignments, employee) {
  const calendarIds = assignments
    .map((a) => a.holiday_calendar_id)
    .filter(Boolean);
  const calendarMap = await fetchCalendars(calendarIds);
  const homeAssignment = assignments.find((a) => a.is_home) || assignments[0] || null;

  return (dateStr) => {
    const active = assignments.find((a) => isActiveAssignment(a, dateStr));
    const candidate = active || homeAssignment;
    return (
      extractRegionFromAssignment(candidate, calendarMap) ||
      fallbackRegion(employee)
    );
  };
}

export async function selectEmployeeHolidays({ orgId, employee, year, month }) {
  const monthKey = formatMonth(year, month);
  const override = employee?.holiday_override;
  if (override && override[monthKey]) {
    const dates = override[monthKey];
    return dates.map((d) => ({ date: d, name: 'Holiday (override)', is_national: false }));
  }

  const assignments = await fetchAssignments(employee?.id || employee?.employee_id);
  const resolveRegion = await buildRegionMap(orgId, year, assignments, employee);
  const days = dayCount(year, month);
  const regionHolidayCache = new Map();
  const holidayByDate = new Map();

  for (let day = 1; day <= days; day++) {
    const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
    const region = resolveRegion(dateStr);
    if (!region) continue;
    if (!regionHolidayCache.has(region)) {
      const list = await getPublishedList(orgId, region, year);
      if (!list) {
        regionHolidayCache.set(region, []);
      } else {
        const holidays = await getHolidaysForList(list.id);
        regionHolidayCache.set(region, holidays);
      }
    }
    const holidaysForRegion = regionHolidayCache.get(region) || [];
    holidaysForRegion
      .filter((h) => String(h.date).startsWith(monthKey))
      .forEach((holiday) => {
        const holidayDate = normalizeDate(holiday.date);
        if (holidayDate === dateStr) {
          holidayByDate.set(dateStr, {
            ...holiday,
            date: holidayDate,
            region,
          });
        }
      });
  }

  return Array.from(holidayByDate.values());
}

export async function injectHolidayRowsIntoTimesheet(orgId, employee, month, rows) {
  const [year, m] = month.split('-').map(Number);
  const holidays = await selectEmployeeHolidays({ orgId, employee, year, month: m });
  const holidayRows = [];
  for (const h of holidays) {
    const dateStr = h.date instanceof Date ? h.date.toISOString().slice(0, 10) : String(h.date);
    const conflict = rows.some((r) => String(r.work_date || r.date) === dateStr && !r.is_holiday);
    holidayRows.push({
      work_date: dateStr,
      hours: 0,
      description: 'Holiday',
      is_holiday: true,
      readonly: true,
      conflict,
      holiday_id: h.id || null,
    });
  }
  const merged = [...rows, ...holidayRows].sort((a, b) =>
    String(a.work_date || a.date).localeCompare(String(b.work_date || b.date))
  );
  const holidayCalendar = holidays.map((h) => ({ date: String(h.date), name: h.name }));
  return { rows: merged, holidayCalendar };
}

export default { selectEmployeeHolidays, injectHolidayRowsIntoTimesheet };


