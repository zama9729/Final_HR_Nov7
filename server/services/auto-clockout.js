import { query } from '../db/pool.js';

/**
 * Get shift end time for an employee on a specific date
 * Returns the shift end time or default 6:00 PM if no shift assigned
 * @param {string} employeeId - Employee UUID
 * @param {string} tenantId - Tenant UUID
 * @param {Date} date - Date to check shift for
 * @returns {Promise<Date>} - Shift end time as Date object
 */
export async function getShiftEndTime(employeeId, tenantId, date) {
  try {
    const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Try to get shift assignment for the date
    const shiftResult = await query(
      `SELECT sa.end_time, sa.shift_date, t.end_time as template_end_time
       FROM schedule_assignments sa
       JOIN shift_templates t ON t.id = sa.shift_template_id
       JOIN generated_schedules gs ON gs.id = sa.schedule_id
       WHERE sa.tenant_id = $1
         AND sa.employee_id = $2
         AND sa.shift_date = $3::date
         AND gs.status IN ('approved', 'active')
       ORDER BY sa.start_time DESC
       LIMIT 1`,
      [tenantId, employeeId, dateStr]
    );

    if (shiftResult.rows.length > 0) {
      const shift = shiftResult.rows[0];
      const endTime = shift.end_time || shift.template_end_time;
      
      if (endTime) {
        // Parse time string (HH:MM:SS or HH:MM) and create Date object
        const [hours, minutes] = endTime.split(':').map(Number);
        const endDateTime = new Date(date);
        endDateTime.setHours(hours, minutes || 0, 0, 0);
        
        // Handle shifts that cross midnight
        if (shift.start_time && shift.start_time > endTime) {
          endDateTime.setDate(endDateTime.getDate() + 1);
        }
        
        return endDateTime;
      }
    }

    // Default to 6:00 PM if no shift assigned
    const defaultEndTime = new Date(date);
    defaultEndTime.setHours(18, 0, 0, 0); // 6:00 PM
    return defaultEndTime;
  } catch (error) {
    console.error('[Auto Clock-Out] Error getting shift end time:', error);
    // Fallback to 6:00 PM
    const defaultEndTime = new Date(date);
    defaultEndTime.setHours(18, 0, 0, 0);
    return defaultEndTime;
  }
}

/**
 * Auto clock-out an employee who forgot to clock out
 * @param {string} sessionId - Clock punch session ID
 * @param {string} employeeId - Employee UUID
 * @param {string} tenantId - Tenant UUID
 * @param {Date} clockInTime - Original clock-in time
 * @param {Date} autoClockOutTime - Time to auto clock-out at
 * @returns {Promise<Object>} - Result object with success status and details
 */
export async function performAutoClockOut(sessionId, employeeId, tenantId, clockInTime, autoClockOutTime) {
  try {
    // Check if already clocked out
    const sessionCheck = await query(
      `SELECT id, clock_out_at FROM clock_punch_sessions WHERE id = $1`,
      [sessionId]
    );

    if (sessionCheck.rows.length === 0) {
      return { success: false, error: 'Session not found' };
    }

    if (sessionCheck.rows[0].clock_out_at) {
      return { success: false, error: 'Already clocked out' };
    }

    // Create attendance event for auto clock-out
    const eventResult = await query(
      `INSERT INTO attendance_events (
        tenant_id, employee_id, raw_timestamp, event_type, device_id,
        capture_method, work_type, created_by, is_auto_clockout
      ) VALUES ($1, $2, $3, 'OUT', NULL, 'auto', 
        (SELECT work_type FROM clock_punch_sessions WHERE id = $4), 
        NULL, true)
      RETURNING id, raw_timestamp, event_type`,
      [tenantId, employeeId, autoClockOutTime, sessionId]
    );

    const outEvent = eventResult.rows[0];
    const durationMinutes = Math.max(1, Math.round((autoClockOutTime - clockInTime) / (1000 * 60)));

    // Update the session with auto clock-out
    await query(
      `UPDATE clock_punch_sessions
       SET out_event_id = $1,
           clock_out_at = $2,
           duration_minutes = $3,
           is_auto_clockout = true,
           auto_clockout_reason = 'Shift end time reached',
           updated_at = now()
       WHERE id = $4`,
      [outEvent.id, autoClockOutTime, durationMinutes, sessionId]
    );

    // Create timesheet entry if needed (similar to manual clock-out logic)
    const workDate = clockInTime.toISOString().split('T')[0];
    const totalHours = Math.max(0, (autoClockOutTime - clockInTime) / (1000 * 60 * 60));
    const validatedTotalHours = Math.max(0, Math.min(999.99, Math.round(totalHours * 100) / 100));

    // Get or create timesheet
    const weekStart = getWeekStart(workDate);
    const weekEnd = getWeekEnd(weekStart);

    let timesheetResult = await query(
      `SELECT id FROM timesheets 
       WHERE employee_id = $1 AND week_start_date = $2 AND tenant_id = $3`,
      [employeeId, weekStart, tenantId]
    );

    let timesheetId;
    if (timesheetResult.rows.length === 0) {
      const newTimesheetResult = await query(
        `INSERT INTO timesheets (employee_id, week_start_date, week_end_date, total_hours, tenant_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [employeeId, weekStart, weekEnd, 0, tenantId]
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
      VALUES ($1, $2, $3, $4, $5, 'punch', $6, $7, $8, 'pending_for_payroll', 'Auto Clock-Out')
      RETURNING id`,
      [
        timesheetId,
        employeeId,
        workDate,
        validatedTotalHours,
        tenantId,
        outEvent.id,
        clockInTime,
        autoClockOutTime
      ]
    );

    // Update timesheet total hours
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

    console.log(`[Auto Clock-Out] Auto clocked out employee ${employeeId} at ${autoClockOutTime.toISOString()}`);

    return {
      success: true,
      sessionId,
      outEventId: outEvent.id,
      clockOutTime: autoClockOutTime,
      durationMinutes
    };
  } catch (error) {
    console.error('[Auto Clock-Out] Error performing auto clock-out:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check and auto clock-out employees who forgot to clock out
 * This function should be called periodically (e.g., every 15 minutes)
 */
export async function checkAndAutoClockOut() {
  try {
    const now = new Date();
    const currentDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // Find all open sessions (clocked in but not clocked out)
    const openSessions = await query(
      `SELECT 
         cps.id,
         cps.tenant_id,
         cps.employee_id,
         cps.clock_in_at,
         cps.work_type,
         e.user_id
       FROM clock_punch_sessions cps
       JOIN employees e ON e.id = cps.employee_id
       WHERE cps.clock_out_at IS NULL
         AND cps.is_auto_clockout IS NOT TRUE
       ORDER BY cps.clock_in_at ASC`
    );

    if (openSessions.rows.length === 0) {
      return { processed: 0, skipped: 0 };
    }

    console.log(`[Auto Clock-Out] Found ${openSessions.rows.length} open session(s) to check`);

    let processed = 0;
    let skipped = 0;

    for (const session of openSessions.rows) {
      try {
        const clockInTime = new Date(session.clock_in_at);
        const clockInDate = new Date(clockInTime.getFullYear(), clockInTime.getMonth(), clockInTime.getDate());
        const clockInDateStr = clockInDate.toISOString().split('T')[0];
        const nowDateStr = currentDate.toISOString().split('T')[0];
        
        // Check if we're past midnight (new day) - auto clock-out previous day's sessions
        const isNewDay = nowDateStr !== clockInDateStr;
        
        let autoClockOutTime;
        if (isNewDay) {
          // If it's a new day, use end of previous day (23:59:59) as clock-out time
          autoClockOutTime = new Date(clockInDate.getFullYear(), clockInDate.getMonth(), clockInDate.getDate(), 23, 59, 59);
        } else {
          // Same day - get shift end time
          const shiftEndTime = await getShiftEndTime(
            session.employee_id,
            session.tenant_id,
            clockInDate
          );
          
          // Only auto clock-out if shift end time has passed
          if (now < shiftEndTime) {
            skipped++;
            continue; // Shift hasn't ended yet
          }
          
          autoClockOutTime = shiftEndTime;
        }

        // Perform auto clock-out
        const result = await performAutoClockOut(
          session.id,
          session.employee_id,
          session.tenant_id,
          clockInTime,
          autoClockOutTime
        );

        if (result.success) {
          processed++;
          console.log(`[Auto Clock-Out] Successfully auto clocked out session ${session.id} at ${autoClockOutTime.toISOString()}`);
        } else {
          skipped++;
          console.log(`[Auto Clock-Out] Skipped session ${session.id}: ${result.error}`);
        }
      } catch (error) {
        console.error(`[Auto Clock-Out] Error processing session ${session.id}:`, error);
        skipped++;
      }
    }

    return { processed, skipped, total: openSessions.rows.length };
  } catch (error) {
    console.error('[Auto Clock-Out] Error checking for auto clock-out:', error);
    return { processed: 0, skipped: 0, error: error.message };
  }
}

/**
 * Helper function to get week start date (Monday)
 */
function getWeekStart(dateStr) {
  const date = new Date(dateStr);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  return new Date(date.setDate(diff)).toISOString().split('T')[0];
}

/**
 * Helper function to get week end date (Sunday)
 */
function getWeekEnd(weekStartStr) {
  const start = new Date(weekStartStr);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return end.toISOString().split('T')[0];
}

