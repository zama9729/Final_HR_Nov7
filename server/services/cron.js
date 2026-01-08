import { query } from '../db/pool.js';

function tzNow(tz) {
  return new Date(new Date().toLocaleString('en-US', { timeZone: tz || 'UTC' }));
}

async function notifyUser(tenantId, userId, title, message) {
  try {
    await query(
      `INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
       VALUES ($1,$2,$3,$4,'probation', now())`,
      [tenantId, userId, title, message]
    );
  } catch (error) {
    console.error('Failed to create probation notification', error);
  }
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

export async function scheduleProbationJobs() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') return;
  let cron;
  try {
    ({ default: cron } = await import('node-cron'));
  } catch (e) {
    console.error('node-cron not installed, skipping probation scheduler');
    return;
  }

  cron.schedule('0 8 * * *', async () => {
    try {
      const reminders = await query(
        `
        SELECT p.*, e.reporting_manager_id, e.tenant_id, e.user_id as employee_user
        FROM probations p
        JOIN employees e ON e.id = p.employee_id
        WHERE p.status = ANY($1::text[])
          AND DATE_PART('day', p.probation_end::date - CURRENT_DATE) IN (7,2)
        `,
        [['in_probation', 'extended']]
      );

      for (const probation of reminders.rows) {
        if (probation.reporting_manager_id) {
          const manager = await query(
            'SELECT user_id FROM employees WHERE id = $1',
            [probation.reporting_manager_id]
          );
          if (manager.rows[0]) {
            await notifyUser(
              probation.tenant_id,
              manager.rows[0].user_id,
              'Probation ending soon',
              `Probation for employee ${probation.employee_id} ends on ${probation.probation_end}`
            );
          }
        }
        if (probation.employee_user) {
          await notifyUser(
            probation.tenant_id,
            probation.employee_user,
            'Probation reminder',
            `Your probation ends on ${probation.probation_end}`
          );
        }
      }

      // Notify HR when probation ends (today or yesterday)
      const endedProbations = await query(
        `
        SELECT p.*, e.employee_id, e.tenant_id,
               json_build_object(
                 'first_name', prof.first_name,
                 'last_name', prof.last_name
               ) as employee_profile
        FROM probations p
        JOIN employees e ON e.id = p.employee_id
        JOIN profiles prof ON prof.id = e.user_id
        WHERE p.status = ANY($1::text[])
          AND p.probation_end::date >= CURRENT_DATE - INTERVAL '1 day'
          AND p.probation_end::date <= CURRENT_DATE
        `,
        [['in_probation', 'extended']]
      );

      for (const probation of endedProbations.rows) {
        // Get HR users for this tenant
        const hrUsers = await query(
          `SELECT DISTINCT p.id as user_id
           FROM profiles p
           JOIN user_roles ur ON ur.user_id = p.id
           WHERE p.tenant_id = $1
             AND ur.role IN ('hr', 'ceo', 'admin', 'director')`,
          [probation.tenant_id]
        );

        const employeeName = `${probation.employee_profile?.first_name || ''} ${probation.employee_profile?.last_name || ''}`.trim() || probation.employee_id;

        for (const hr of hrUsers.rows) {
          await notifyUser(
            probation.tenant_id,
            hr.user_id,
            'Probation Period Ended - Action Required',
            `Probation period for ${employeeName} (${probation.employee_id}) ended on ${probation.probation_end}. ${probation.auto_confirm_at_end ? 'Auto-confirmed.' : 'Please review and confirm full-time employment.'}`
          );
        }
      }

      const autoConfirm = await query(
        `
        SELECT * FROM probations
        WHERE auto_confirm_at_end = true
          AND status = ANY($1::text[])
          AND probation_end::date <= CURRENT_DATE
        `,
        [['in_probation', 'extended']]
      );

      for (const probation of autoConfirm.rows) {
        await query(
          `UPDATE probations
           SET status = 'completed',
               completed_at = now()
           WHERE id = $1`,
          [probation.id]
        );
        await query(
          `UPDATE employees
           SET probation_status = 'completed'
           WHERE id = $1`,
          [probation.employee_id]
        );
        await query(
          `INSERT INTO probation_events (probation_id, tenant_id, actor_id, event_type, payload)
           VALUES ($1,$2,$3,'probation.auto_confirmed',$4)`,
          [probation.id, probation.tenant_id, null, JSON.stringify({ auto: true })]
        );
      }
    } catch (error) {
      console.error('Probation cron error', error);
    }
  });
}

// Weekly timesheet submission reminders (default Friday 17:00 Asia/Kolkata)
export async function scheduleTimesheetReminders() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') return;
  let cron;
  try {
    ({ default: cron } = await import('node-cron'));
  } catch (e) {
    console.error('node-cron not installed, skipping timesheet reminder scheduler');
    return;
  }

  // Default: every Friday 17:00 Asia/Kolkata (approx 11:30 UTC)
  const expr = process.env.TIMESHEET_REMINDER_CRON || '30 11 * * 5';

  cron.schedule(expr, async () => {
    try {
      const employeesRes = await query(
        `SELECT e.id, e.user_id, e.tenant_id
         FROM employees e
         JOIN profiles p ON p.id = e.user_id
         WHERE e.status = 'active' AND p.tenant_id IS NOT NULL`
      );

      const today = new Date();
      const day = today.getUTCDay(); // use UTC base, we only need week window
      const diffToMonday = (day + 6) % 7;
      const weekStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
      weekStart.setUTCDate(weekStart.getUTCDate() - diffToMonday);
      const weekEnd = new Date(weekStart);
      weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      for (const emp of employeesRes.rows) {
        const tsRes = await query(
          `SELECT status
           FROM timesheets
           WHERE employee_id = $1
             AND week_start_date = $2`,
          [emp.id, weekStartStr]
        );

        const hasSubmitted = tsRes.rows.some((t) =>
          ['pending_approval', 'approved'].includes(t.status)
        );
        if (hasSubmitted) continue;

        await notifyUser(
          emp.tenant_id,
          emp.user_id,
          'Timesheet reminder',
          `Please review and submit your timesheet for the week starting ${weekStartStr}.`
        );
      }
    } catch (error) {
      console.error('Timesheet reminder cron error', error);
    }
  });
}

export async function scheduleObservabilityAggregation() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') return;
  let cron;
  try {
    ({ default: cron } = await import('node-cron'));
  } catch (e) {
    console.error('node-cron not installed, skipping observability scheduler');
    return;
  }
  
  // Run daily at 2 AM UTC
  cron.schedule('0 2 * * *', async () => {
    try {
      const { runDailyAggregation, updateStorageMetrics } = await import('./observability/aggregationJob.js');
      console.log('[Observability] Running daily aggregation...');
      await runDailyAggregation();
      await updateStorageMetrics();
      console.log('[Observability] Daily aggregation completed');
    } catch (error) {
      console.error('[Observability] Daily aggregation error:', error);
    }
  });
  
  console.log('[Observability] Scheduled daily aggregation at 2 AM UTC');
}

export default { scheduleHolidayNotifications, scheduleNotificationRules, scheduleProbationJobs, scheduleTimesheetReminders, scheduleObservabilityAggregation };
