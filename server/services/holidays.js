import { query } from '../db/pool.js';

// Note: Removed holiday count limits - all published holidays are now shown

export async function getPublishedList(orgId, region, year, options = {}) {
  const res = await query(
    `SELECT hl.* FROM holiday_lists hl
     WHERE hl.org_id = $1 AND hl.region = $2 AND hl.year = $3 AND hl.published = true
     ORDER BY hl.created_at DESC LIMIT 1`,
    [orgId, region, year]
  );
  return res.rows[0] || null;
}

export async function getHolidaysForList(listId) {
  const res = await query('SELECT * FROM holidays WHERE list_id = $1 ORDER BY is_national DESC, date ASC', [listId]);
  return res.rows;
}

export async function selectEmployeeHolidays({ orgId, employee, year, month }) {
  // overrides
  const override = employee.holiday_override;
  if (override && override[`${year}-${String(month).padStart(2,'0')}`]) {
    const dates = override[`${year}-${String(month).padStart(2,'0')}`];
    return dates.map(d => ({ date: d, name: 'Holiday (override)', is_national: false }));
  }

  // region list - get ALL published holidays (no limit)
  const list = await getPublishedList(orgId, employee.state || 'remote', year);
  if (!list) return [];
  const all = await getHolidaysForList(list.id);

  // Return all holidays (national first, then region-specific), filtered to month
  // No limit - show all published holidays
  const nationals = all.filter(h => h.is_national);
  const regionals = all.filter(h => !h.is_national);
  const allHolidays = [...nationals, ...regionals]; // No .slice() - get all
  
  // filter to month
  const picksThisMonth = allHolidays.filter(h => String(h.date).startsWith(`${year}-${String(month).padStart(2,'0')}`));
  return picksThisMonth;
}

export async function injectHolidayRowsIntoTimesheet(orgId, employee, month, rows) {
  const [year, m] = month.split('-').map(Number);
  const holidays = await selectEmployeeHolidays({ orgId, employee, year, month: m });
  const holidayRows = [];
  for (const h of holidays) {
    const dateStr = h.date instanceof Date ? h.date.toISOString().slice(0,10) : String(h.date);
    const conflict = rows.some(r => String(r.work_date || r.date) === dateStr && !r.is_holiday);
    holidayRows.push({
      work_date: dateStr,
      hours: 0,
      description: 'Holiday', // Fixed description as "Holiday"
      is_holiday: true,
      readonly: true,
      conflict,
      holiday_id: h.id || null,
    });
  }
  // merge: append holiday rows and sort by date
  const merged = [...rows, ...holidayRows].sort((a,b) => String(a.work_date||a.date).localeCompare(String(b.work_date||b.date)));
  // calendar helper
  const holidayCalendar = holidays.map(h => ({ date: String(h.date), name: h.name }));
  return { rows: merged, holidayCalendar };
}

export default { selectEmployeeHolidays, injectHolidayRowsIntoTimesheet };


