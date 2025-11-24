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
            const empRes = await query(
              'SELECT id, tenant_id, state, work_location, holiday_override FROM employees WHERE id = $1',
              [r.id]
            );
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

// Notification rules for different roles
export async function scheduleNotificationRules() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') return;
  let cron;
  try {
    ({ default: cron } = await import('node-cron'));
  } catch (e) {
    console.error('node-cron not installed, skipping notification scheduler');
    return;
  }

  // Manager: Monthly summary on 1st at 09:00 local
  cron.schedule('0 9 1 * *', async () => {
    try {
      const orgs = await query('SELECT id, timezone FROM organizations');
      for (const org of orgs.rows) {
        const now = tzNow(org.timezone || 'UTC');
        if (now.getDate() !== 1) continue;

        const managers = await query(`
          SELECT e.id as employee_id, p.id as user_id
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          JOIN user_roles ur ON ur.user_id = p.id
          WHERE p.tenant_id = $1 AND ur.role = 'manager'
        `, [org.id]);

        for (const mgr of managers.rows) {
          // Get pending items count
          const pendingCounts = await query(`
            SELECT 
              (SELECT COUNT(*) FROM timesheets WHERE status = 'pending' AND employee_id IN 
                (SELECT id FROM employees WHERE reporting_manager_id = $1)) as timesheets,
              (SELECT COUNT(*) FROM leave_requests WHERE status = 'pending' AND employee_id IN 
                (SELECT id FROM employees WHERE reporting_manager_id = $1)) as leaves
          `, [mgr.employee_id]);

          const counts = pendingCounts.rows[0] || { timesheets: 0, leaves: 0 };
          const total = (counts.timesheets || 0) + (counts.leaves || 0);

          if (total > 0) {
            await query(`
              INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
              VALUES ($1, $2, $3, $4, $5, now())
            `, [
              org.id,
              mgr.user_id,
              'Monthly Summary - Pending Items',
              `You have ${total} pending items: ${counts.timesheets || 0} timesheets, ${counts.leaves || 0} leave requests`,
              'monthly_summary'
            ]);
          }
        }
      }
    } catch (e) {
      console.error('Monthly summary cron error:', e);
    }
  });

  // Employee: Friday day-end reminder if draft hours exist
  cron.schedule('0 17 * * 5', async () => {
    try {
      const orgs = await query('SELECT id FROM organizations');
      for (const org of orgs.rows) {
        const employees = await query(`
          SELECT e.id as employee_id, p.id as user_id
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          WHERE p.tenant_id = $1 AND e.status = 'active'
        `, [org.id]);

        for (const emp of employees.rows) {
          // Check for draft timesheets this week
          const weekStart = new Date();
          weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); // Monday
          weekStart.setHours(0, 0, 0, 0);

          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6); // Sunday

          const draftTimesheets = await query(`
            SELECT id FROM timesheets
            WHERE employee_id = $1
            AND week_start_date = $2
            AND status = 'pending'
          `, [emp.employee_id, weekStart]);

          if (draftTimesheets.rows.length > 0) {
            await query(`
              INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
              VALUES ($1, $2, $3, $4, $5, now())
            `, [
              org.id,
              emp.user_id,
              'Reminder: Submit Your Timesheet',
              'You have a pending timesheet for this week. Please submit before end of week.',
              'reminder'
            ]);
          }
        }
      }
    } catch (e) {
      console.error('Friday reminder cron error:', e);
    }
  });

  // Director: Weekly dept snapshot
  cron.schedule('0 9 * * 1', async () => {
    try {
      const orgs = await query('SELECT id FROM organizations');
      for (const org of orgs.rows) {
        const directors = await query(`
          SELECT e.id as employee_id, p.id as user_id, e.department
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          JOIN user_roles ur ON ur.user_id = p.id
          WHERE p.tenant_id = $1 AND ur.role = 'director'
        `, [org.id]);

        for (const dir of directors.rows) {
          // Get department stats
          const stats = await query(`
            SELECT 
              COUNT(*) FILTER (WHERE status = 'pending') as pending_timesheets,
              COUNT(*) FILTER (WHERE status = 'pending') as pending_leaves
            FROM employees e
            LEFT JOIN timesheets t ON t.employee_id = e.id AND t.status = 'pending'
            LEFT JOIN leave_requests lr ON lr.employee_id = e.id AND lr.status = 'pending'
            WHERE e.department = $1 AND e.tenant_id = $2
          `, [dir.department, org.id]);

          const deptStats = stats.rows[0] || { pending_timesheets: 0, pending_leaves: 0 };

          await query(`
            INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
            VALUES ($1, $2, $3, $4, $5, now())
          `, [
            org.id,
            dir.user_id,
            'Weekly Department Snapshot',
            `Department ${dir.department}: ${deptStats.pending_timesheets || 0} pending timesheets, ${deptStats.pending_leaves || 0} pending leave requests`,
            'weekly_snapshot'
          ]);
        }
      }
    } catch (e) {
      console.error('Weekly snapshot cron error:', e);
    }
  });

  // CEO: Monthly executive digest
  cron.schedule('0 9 1 * *', async () => {
    try {
      const orgs = await query('SELECT id FROM organizations');
      for (const org of orgs.rows) {
        const ceos = await query(`
          SELECT p.id as user_id
          FROM profiles p
          JOIN user_roles ur ON ur.user_id = p.id
          WHERE p.tenant_id = $1 AND ur.role = 'ceo'
        `, [org.id]);

        for (const ceo of ceos.rows) {
          // Get org-wide stats
          const stats = await query(`
            SELECT 
              COUNT(*) FILTER (WHERE status = 'active') as active_employees,
              COUNT(*) FILTER (WHERE status = 'pending') as pending_onboardings
            FROM employees
            WHERE tenant_id = $1
          `, [org.id]);

          const orgStats = stats.rows[0] || { active_employees: 0, pending_onboardings: 0 };

          await query(`
            INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
            VALUES ($1, $2, $3, $4, $5, now())
          `, [
            org.id,
            ceo.user_id,
            'Monthly Executive Digest',
            `Organization Overview: ${orgStats.active_employees || 0} active employees, ${orgStats.pending_onboardings || 0} pending onboardings`,
            'executive_digest'
          ]);
        }
      }
    } catch (e) {
      console.error('Executive digest cron error:', e);
    }
  });
}

export default { scheduleHolidayNotifications, scheduleNotificationRules };


