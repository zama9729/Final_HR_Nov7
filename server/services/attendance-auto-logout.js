import { query } from '../db/pool.js';

/**
 * Automatically log out all employees who forgot to clock out
 * This runs at midnight (00:00) and closes all open sessions from the previous day
 */
export async function autoLogoutForgottenSessions() {
  try {
    console.log('[Auto Logout] Starting automatic logout for forgotten sessions...');
    
    // Get all open sessions that started before today (i.e., from previous day)
    // We want to close sessions that started before today at midnight
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = today.toISOString();
    
    const openSessionsResult = await query(
      `SELECT 
        cps.id as session_id,
        cps.tenant_id,
        cps.employee_id,
        cps.clock_in_at,
        cps.in_event_id,
        e.user_id
       FROM clock_punch_sessions cps
       JOIN employees e ON e.id = cps.employee_id
       WHERE cps.clock_out_at IS NULL
         AND cps.clock_in_at < $1
       ORDER BY cps.clock_in_at DESC`,
      [todayStart]
    );

    if (openSessionsResult.rows.length === 0) {
      console.log('[Auto Logout] No forgotten sessions found');
      return { processed: 0, errors: [] };
    }

    console.log(`[Auto Logout] Found ${openSessionsResult.rows.length} forgotten session(s) to close`);

    const errors = [];
    let processed = 0;

    for (const session of openSessionsResult.rows) {
      try {
        const clockInTime = new Date(session.clock_in_at);
        // Set clock out to end of the day when they clocked in
        const clockOutTime = new Date(clockInTime);
        clockOutTime.setHours(23, 59, 59, 999); // End of the clock-in day
        
        const durationMinutes = Math.max(1, Math.round((clockOutTime - clockInTime) / (1000 * 60)));
        const workDate = clockInTime.toISOString().split('T')[0];
        const totalHours = Math.max(0, (clockOutTime - clockInTime) / (1000 * 60 * 60));

        // Create OUT attendance event marked as system logout
        const outEventResult = await query(
          `INSERT INTO attendance_events (
            tenant_id, employee_id, raw_timestamp, event_type, 
            device_id, capture_method, work_type, created_by
          ) VALUES ($1, $2, $3, 'OUT', NULL, 'system', 'WFH', NULL)
          RETURNING id`,
          [
            session.tenant_id,
            session.employee_id,
            clockOutTime
          ]
        );

        const outEventId = outEventResult.rows[0].id;

        // Get or create timesheet
        const weekStart = getWeekStart(workDate);
        const weekEnd = getWeekEnd(weekStart);

        let timesheetResult = await query(
          `SELECT id FROM timesheets 
           WHERE employee_id = $1 AND week_start_date = $2`,
          [session.employee_id, weekStart]
        );

        let timesheetId;
        if (timesheetResult.rows.length === 0) {
          const newTimesheetResult = await query(
            `INSERT INTO timesheets (employee_id, week_start_date, week_end_date, total_hours, tenant_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [session.employee_id, weekStart, weekEnd, 0, session.tenant_id]
          );
          timesheetId = newTimesheetResult.rows[0].id;
        } else {
          timesheetId = timesheetResult.rows[0].id;
        }

        // Create timesheet entry
        const entryResult = await query(
          `INSERT INTO timesheet_entries (
            timesheet_id, employee_id, work_date, hours, tenant_id, source, 
            attendance_event_id, start_time_utc, end_time_utc, payroll_status, description
          )
          VALUES ($1, $2, $3, $4, $5, 'system', $6, $7, $8, 'pending_for_payroll', 'System Auto Logout - Forgot to clock out')
          RETURNING id`,
          [
            timesheetId,
            session.employee_id,
            workDate,
            totalHours,
            session.tenant_id,
            outEventId,
            clockInTime,
            clockOutTime
          ]
        );

        const timesheetEntryId = entryResult.rows[0].id;

        // Update IN event if it exists
        if (session.in_event_id) {
          await query(
            `UPDATE attendance_events 
             SET paired_timesheet_entry_id = $1 
             WHERE id IN ($2, $3)`,
            [timesheetEntryId, session.in_event_id, outEventId]
          );
        } else {
          await query(
            `UPDATE attendance_events 
             SET paired_timesheet_entry_id = $1 
             WHERE id = $2`,
            [timesheetEntryId, outEventId]
          );
        }

        // Update timesheet total
        await query(
          `UPDATE timesheets 
           SET total_hours = (
             SELECT COALESCE(SUM(hours), 0) 
             FROM timesheet_entries 
             WHERE timesheet_id = $1
           )
           WHERE id = $1`,
          [timesheetId]
        );

        // Close the session
        await query(
          `UPDATE clock_punch_sessions
           SET out_event_id = $1,
               clock_out_at = $2,
               duration_minutes = $3,
               capture_method_out = 'system',
               work_type = COALESCE(work_type, 'WFH'),
               timesheet_entry_id = $4,
               updated_at = now()
           WHERE id = $5`,
          [
            outEventId,
            clockOutTime,
            durationMinutes,
            timesheetEntryId,
            session.session_id
          ]
        );

        // Audit log
        await query(
          `INSERT INTO attendance_audit_logs (tenant_id, actor_id, action, object_type, object_id, details)
           VALUES ($1, NULL, 'system_auto_logout', 'clock_punch_session', $2, $3)`,
          [
            session.tenant_id,
            session.session_id,
            JSON.stringify({
              clock_in_at: session.clock_in_at,
              clock_out_at: clockOutTime.toISOString(),
              duration_minutes: durationMinutes,
              reason: 'Forgot to clock out - automatic system logout at midnight'
            })
          ]
        );

        processed++;
        console.log(`[Auto Logout] Closed session ${session.session_id} for employee ${session.employee_id}`);
      } catch (error) {
        console.error(`[Auto Logout] Error processing session ${session.session_id}:`, error);
        errors.push({ session_id: session.session_id, error: error.message });
      }
    }

    console.log(`[Auto Logout] Completed: ${processed} session(s) closed, ${errors.length} error(s)`);
    return { processed, errors };
  } catch (error) {
    console.error('[Auto Logout] Fatal error:', error);
    throw error;
  }
}

/**
 * Schedule automatic logout job to run at midnight (00:00) every day
 */
export async function scheduleAutoLogout() {
  if (String(process.env.CRON_ENABLED || 'true') !== 'true') {
    console.log('[Auto Logout] Cron disabled, skipping scheduler');
    return;
  }

  let cron;
  try {
    ({ default: cron } = await import('node-cron'));
  } catch (e) {
    console.error('[Auto Logout] node-cron not installed, skipping auto-logout scheduler');
    return;
  }

  // Run at 00:00 (midnight) every day
  // Using UTC timezone - adjust if needed for your timezone
  cron.schedule('0 0 * * *', async () => {
    try {
      await autoLogoutForgottenSessions();
    } catch (error) {
      console.error('[Auto Logout] Scheduled job error:', error);
    }
  });

  console.log('✅ Auto-logout cron job scheduled (runs daily at 00:00 UTC)');
}

// Helper functions
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function getWeekEnd(weekStart) {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}

export default {
  autoLogoutForgottenSessions,
  scheduleAutoLogout
};

