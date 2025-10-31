import { query } from '../db/pool.js';

function tzNow(tz) {
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz || 'UTC' }));
}

export async function scheduleHolidayNotifications() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') return;
  let cron;
  try {
    ({ default: cron } = await import('node-cron'));
  } catch (e) {
    console.error('node-cron not installed, skipping scheduler');
    return;
  }
  // Run at 00:05 daily, but we'll filter to day 1 per org
  cron.schedule('5 0 * * *', async () => {
    try {
      const orgs = await query('SELECT id, timezone FROM organizations');
      for (const org of orgs.rows) {
        const now = tzNow(org.timezone || process.env.ORG_TIMEZONE || 'UTC');
        if (now.getDate() !== Number(process.env.NOTIFY_MANAGER_DAY || 1)) continue;

        // managers in org
        const mgrs = await query(`
          SELECT e.id as employee_id, p.id as user_id
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          JOIN user_roles ur ON ur.user_id = p.id
          WHERE p.tenant_id = $1 AND ur.role = 'manager'`, [org.id]);

        const month = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        for (const m of mgrs.rows) {
          // direct reports
          const team = await query('SELECT id FROM employees WHERE reporting_manager_id = $1', [m.employee_id]);
          const summary = [];
          for (const r of team.rows) {
            // get holiday rows
            const empRes = await query('SELECT state, work_mode, holiday_override, tenant_id FROM employees WHERE id = $1', [r.id]);
            const emp = empRes.rows[0];
            const { selectEmployeeHolidays } = await import('./holidays.js');
            const holidays = await selectEmployeeHolidays({ orgId: emp.tenant_id, employee: emp, year: Number(month.slice(0,4)), month: Number(month.slice(5,7)) });
            summary.push({ employee_id: r.id, month, holidays });
          }
          // create in-app notification
          await query('INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at) VALUES ($1,$2,$3,$4,$5, now())', [org.id, m.user_id, 'Team holidays summary', `Summary for ${month}`, 'holidays_summary']);
        }
      }
    } catch (e) {
      console.error('Holiday cron error', e);
    }
  });
}

export default { scheduleHolidayNotifications };


