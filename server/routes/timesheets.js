import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { injectHolidayRowsIntoTimesheet, selectEmployeeHolidays } from '../services/holidays.js';
import {
  calculateDurationHours,
  normalizeTimestamp,
  validateClockAction,
  parseMonthInput,
  normalizeCoordinate,
} from '../services/timesheet-clock.js';

// Helper function to auto-persist holiday entries
async function persistHolidayEntries(timesheetId, orgId, employee, month, existingEntries) {
  try {
    const [year, m] = month.split('-').map(Number);
    const holidays = await selectEmployeeHolidays({ orgId, employee, year, month: m });
    
    // Get existing entry dates to avoid duplicates
    const existingDates = new Set(existingEntries.map(e => String(e.work_date)));
    
    // Insert holiday entries that don't exist
    for (const h of holidays) {
      const dateStr = h.date instanceof Date ? h.date.toISOString().slice(0,10) : String(h.date);
      
      // Skip if entry already exists for this date
      if (existingDates.has(dateStr)) {
        // Update existing entry to mark it as holiday if it's not already
        await query(
          `UPDATE timesheet_entries 
           SET is_holiday = true, description = 'Holiday', holiday_id = $1
           WHERE timesheet_id = $2 AND work_date = $3 AND (is_holiday = false OR is_holiday IS NULL)`,
          [h.id || null, timesheetId, dateStr]
        );
        continue;
      }
      
      // Insert new holiday entry (check if entry already exists for this date)
      const existingEntry = await query(
        'SELECT id FROM timesheet_entries WHERE timesheet_id = $1 AND work_date = $2',
        [timesheetId, dateStr]
      );
      
      if (existingEntry.rows.length === 0) {
        await query(
          `INSERT INTO timesheet_entries (timesheet_id, tenant_id, work_date, hours, description, is_holiday, holiday_id)
           VALUES ($1, $2, $3, 0, 'Holiday', true, $4)`,
          [timesheetId, orgId, dateStr, h.id || null]
        );
      }
    }
  } catch (error) {
    console.error('Error persisting holiday entries:', error);
    // Don't throw - allow timesheet to load even if holiday persistence fails
  }
}

const router = express.Router();

router.post('/clock', authenticateToken, async (req, res) => {
  const { action, timestamp, note, source = 'manual', latitude, longitude, locationAccuracy } = req.body;
  const normalizedAction = (action || '').toLowerCase();

  if (!['in', 'out'].includes(normalizedAction)) {
    return res.status(400).json({ error: 'action must be "in" or "out"' });
  }

  try {
    const context = await getEmployeeContext(req.user.id);
    if (!context) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    const eventTime = normalizeTimestamp(timestamp);
    if (!eventTime) {
      return res.status(400).json({ error: 'Invalid timestamp' });
    }

    const lastEventResult = await query(
      `SELECT id, event_type, is_open, event_time
       FROM timesheet_clock_events
       WHERE employee_id = $1
       ORDER BY event_time DESC
       LIMIT 1`,
      [context.employee_id]
    );
    const lastEvent = lastEventResult.rows[0];
    const validation = validateClockAction(lastEvent, normalizedAction);
    if (!validation.ok) {
      return res.status(400).json({ error: validation.message });
    }

    const lat = normalizeCoordinate(latitude);
    const lon = normalizeCoordinate(longitude);
    const accuracy = normalizeCoordinate(locationAccuracy);

    await query('BEGIN');
    try {
      const eventInsert = await query(
        `INSERT INTO timesheet_clock_events (
          employee_id, tenant_id, event_type, event_time, source,
          latitude, longitude, location_accuracy, notes, metadata, is_open, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::jsonb, $10, $11)
        -- metadata optional placeholder
        RETURNING *`,
        [
          context.employee_id,
          context.tenant_id,
          normalizedAction,
          eventTime,
          source || 'manual',
          lat,
          lon,
          accuracy,
          note || null,
          normalizedAction === 'in',
          req.user.id,
        ]
      );
      const eventRow = eventInsert.rows[0];
      let entryRow = null;

      if (normalizedAction === 'out') {
        const openInResult = await query(
          `SELECT * FROM timesheet_clock_events
           WHERE employee_id = $1 AND event_type = 'in' AND is_open = true
           ORDER BY event_time DESC
           LIMIT 1`,
          [context.employee_id]
        );

        const openIn = openInResult.rows[0];
        if (!openIn) {
          await query('ROLLBACK');
          return res.status(400).json({ error: 'No open clock-in found' });
        }

        const durationHours = calculateDurationHours(openIn.event_time, eventTime);
        if (durationHours <= 0) {
          await query('ROLLBACK');
          return res.status(400).json({ error: 'Clock-out must be after clock-in' });
        }

        const workDate = new Date(openIn.event_time).toISOString().slice(0, 10);

        await query(
          `UPDATE timesheet_clock_events
           SET is_open = false, paired_event_id = $1
           WHERE id = $2`,
          [eventRow.id, openIn.id]
        );
        await query(
          `UPDATE timesheet_clock_events
           SET is_open = false
           WHERE id = $1`,
          [eventRow.id]
        );

        const entryInsert = await query(
          `INSERT INTO timesheet_entries (
            timesheet_id,
            employee_id,
            tenant_id,
            work_date,
            hours,
            clock_in,
            clock_out,
            clock_in_event_id,
            clock_out_event_id,
            duration_hours,
            source,
            notes
          ) VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8, $4, 'clock', $9)
          RETURNING id, work_date, hours, duration_hours`,
          [
            context.employee_id,
            context.tenant_id,
            workDate,
            durationHours,
            openIn.event_time,
            eventTime,
            openIn.id,
            eventRow.id,
            note || null,
          ]
        );

        entryRow = entryInsert.rows[0];
      }

      await query('COMMIT');
      res.json({
        event: eventRow,
        entry: entryRow,
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Clock API error:', error);
    res.status(500).json({ error: error.message || 'Failed to record clock event' });
  }
});

router.get('/clock/status', authenticateToken, async (req, res) => {
  try {
    const context = await getEmployeeContext(req.user.id);
    if (!context) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    const eventsResult = await query(
      `SELECT id, event_type, event_time, is_open
       FROM timesheet_clock_events
       WHERE employee_id = $1
       ORDER BY event_time DESC
       LIMIT 10`,
      [context.employee_id]
    );

    const openSession = eventsResult.rows.find((row) => row.event_type === 'in' && row.is_open) || null;

    res.json({
      last_event: eventsResult.rows[0] || null,
      open_session: openSession,
      recent_events: eventsResult.rows,
    });
  } catch (error) {
    console.error('Clock status error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch clock status' });
  }
});

router.get('/tasks', authenticateToken, async (req, res) => {
  try {
    const context = await getEmployeeContext(req.user.id);
    if (!context) {
      return res.status(404).json({ error: 'Employee record not found' });
    }
    const monthParam = req.query.month;
    const monthDate = parseMonthInput(monthParam) || parseMonthInput(new Date().toISOString().slice(0, 7));

    if (!monthDate) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
    }

    const tasksResult = await query(
      `SELECT id, task_name, client_name, project_name, description, is_billable, month
       FROM timesheet_tasks
       WHERE employee_id = $1 AND month = $2
       ORDER BY task_name ASC`,
      [context.employee_id, monthDate]
    );

    res.json(tasksResult.rows);
  } catch (error) {
    console.error('Fetch tasks error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch tasks' });
  }
});

router.post('/tasks', authenticateToken, async (req, res) => {
  try {
    const { month, taskName, clientName = '', projectName = '', description = '', isBillable = true } = req.body;
    if (!month || !taskName) {
      return res.status(400).json({ error: 'month and taskName are required' });
    }

    const context = await getEmployeeContext(req.user.id);
    if (!context) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    const monthDate = parseMonthInput(month);
    if (!monthDate) {
      return res.status(400).json({ error: 'Invalid month format. Use YYYY-MM' });
    }

    const result = await query(
      `INSERT INTO timesheet_tasks (
        employee_id, tenant_id, month, task_name, client_name, project_name, description, is_billable
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (employee_id, month, task_name, client_name, project_name)
      DO UPDATE SET
        description = EXCLUDED.description,
        is_billable = EXCLUDED.is_billable,
        updated_at = now()
      RETURNING *`,
      [
        context.employee_id,
        context.tenant_id,
        monthDate,
        taskName,
        clientName || '',
        projectName || '',
        description || '',
        Boolean(isBillable),
      ]
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({ error: error.message || 'Failed to save task' });
  }
});

async function getEmployeeContext(userId) {
  const result = await query(
    `SELECT e.id AS employee_id, e.tenant_id AS tenant_id
     FROM employees e
     WHERE e.user_id = $1
     LIMIT 1`,
    [userId]
  );
  return result.rows[0] || null;
}

// Get employee project assignments
router.get('/employee/:employeeId/projects', authenticateToken, async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { date } = req.query; // Optional date filter for active assignments
    
    // Check if employee is viewing their own data or user has HR/CEO role
    const empCheck = await query(
      'SELECT e.id, e.tenant_id FROM employees e WHERE e.id = $1 AND e.user_id = $2',
      [employeeId, req.user.id]
    );
    
    // Check if user has HR/CEO role
    const roleCheck = await query(
      'SELECT role FROM user_roles WHERE user_id = $1 AND role IN (\'hr\', \'director\', \'ceo\')',
      [req.user.id]
    );
    
    let tenantId = null;
    
    if (empCheck.rows.length > 0) {
      // Employee viewing their own data
      tenantId = empCheck.rows[0].tenant_id;
    } else if (roleCheck.rows.length > 0) {
      // HR/CEO viewing any employee's data - verify same org
      const tenantRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
      const userTenantId = tenantRes.rows[0]?.tenant_id;
      const empTenantRes = await query('SELECT tenant_id FROM employees WHERE id = $1', [employeeId]);
      const empTenantId = empTenantRes.rows[0]?.tenant_id;
      
      if (!userTenantId || userTenantId !== empTenantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      
      tenantId = userTenantId;
    } else {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    let assignmentsQuery = `
      SELECT 
        a.id,
        a.project_id,
        p.name as project_name,
        a.role,
        a.allocation_percent,
        a.start_date,
        a.end_date
      FROM assignments a
      JOIN projects p ON p.id = a.project_id
      WHERE a.employee_id = $1
    `;
    
    const params = [employeeId];
    
    if (date) {
      assignmentsQuery += ` AND a.start_date <= $2 AND (a.end_date IS NULL OR a.end_date >= $2)`;
      params.push(date);
    } else {
      // Get all active assignments (end_date is null or in future)
      assignmentsQuery += ` AND (a.end_date IS NULL OR a.end_date >= CURRENT_DATE)`;
    }
    
    assignmentsQuery += ` ORDER BY a.start_date DESC`;
    
    const result = await query(assignmentsQuery, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employee projects:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get employee ID for current user
router.get('/employee-id', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, tenant_id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // Auto-provision minimal employee row for logged-in user to enable skills/timesheets
      const prof = await query('SELECT tenant_id, first_name, last_name FROM profiles WHERE id = $1', [req.user.id]);
      const tenantId = prof.rows[0]?.tenant_id;
      if (!tenantId) return res.status(404).json({ error: 'Employee not found' });

      const empCodeRes = await query('SELECT gen_random_uuid() AS id');
      const newEmpId = `EMP-${empCodeRes.rows[0].id.slice(0,8).toUpperCase()}`;
      const insert = await query(
        `INSERT INTO employees (user_id, employee_id, tenant_id, onboarding_status, must_change_password)
         VALUES ($1,$2,$3,'not_started', false)
         RETURNING id, tenant_id`,
        [req.user.id, newEmpId, tenantId]
      );
      return res.json(insert.rows[0]);
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching employee ID:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get pending timesheets for manager's team (must be before '/' route)
router.get('/pending', authenticateToken, async (req, res) => {
  try {
    // Try to resolve employee record first
    const empResult = await query(
      `SELECT e.id, e.tenant_id, ur.role
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       LEFT JOIN user_roles ur ON ur.user_id = e.user_id
       WHERE e.user_id = $1
       LIMIT 1`,
      [req.user.id]
    );

    let managerId = null;
    let tenantId = null;
    let role = null;

    if (empResult.rows.length === 0) {
      // Fallback through profile + roles for HR/CEO
      const profileRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
      const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1', [req.user.id]);
      tenantId = profileRes.rows[0]?.tenant_id || null;
      role = roleRes.rows[0]?.role || null;
      // Only allow HR/CEO (not manager) without employee row
      if (!tenantId || !role || !['hr', 'director', 'ceo', 'admin'].includes(role)) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      // No managerId; skip manager filter below
    } else {
      managerId = empResult.rows[0].id;
      tenantId = empResult.rows[0].tenant_id;
      role = empResult.rows[0].role;
    }

    // Check if user is manager or HR/CEO/Admin
    if (!['manager', 'hr', 'director', 'ceo', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Build query based on role
    let timesheetsQuery;
    let queryParams = [];
    
    if (role === 'manager') {
      // Managers can only see their team's timesheets
      timesheetsQuery = `
        SELECT 
          t.*,
          json_build_object(
            'id', e.id,
            'employee_id', e.employee_id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'email', p.email
          ) as employee
        FROM timesheets t
        JOIN employees e ON e.id = t.employee_id
        JOIN profiles p ON p.id = e.user_id
        WHERE t.tenant_id = $1
          AND t.status = 'pending'
          AND e.reporting_manager_id = $2
        ORDER BY t.submitted_at DESC
      `;
      queryParams = [tenantId, managerId];
    } else if (['hr', 'director', 'ceo', 'admin'].includes(role)) {
      // HR/CEO can see timesheets where employee has no manager OR manager has no manager
      timesheetsQuery = `
        SELECT 
          t.*,
          json_build_object(
            'id', e.id,
            'employee_id', e.employee_id,
            'first_name', p.first_name,
            'last_name', p.last_name,
            'email', p.email
          ) as employee
        FROM timesheets t
        JOIN employees e ON e.id = t.employee_id
        JOIN profiles p ON p.id = e.user_id
        LEFT JOIN employees m ON e.reporting_manager_id = m.id
        WHERE t.tenant_id = $1
          AND t.status = 'pending'
          AND (e.reporting_manager_id IS NULL OR m.reporting_manager_id IS NULL)
        ORDER BY t.submitted_at DESC
      `;
      queryParams = [tenantId];
    } else {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    let result;
    if (role === 'manager') {
      if (!managerId) {
        // Managers must have an employee row
        return res.status(404).json({ error: 'Employee not found' });
      }
    }
    result = await query(timesheetsQuery, queryParams);
    
    // Fetch entries separately for each timesheet
    const timesheetsWithEntries = await Promise.all(
      result.rows.map(async (timesheet) => {
        const entriesResult = await query(
          'SELECT id, work_date, hours, description, project_id, project_type FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date',
          [timesheet.id]
        );
        return {
          ...timesheet,
          entries: entriesResult.rows || [],
        };
      })
    );
    
    res.json(timesheetsWithEntries);
  } catch (error) {
    console.error('Error fetching pending timesheets:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get timesheet for a week
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { weekStart, weekEnd } = req.query;

    if (!weekStart || !weekEnd) {
      return res.status(400).json({ error: 'weekStart and weekEnd required' });
    }

    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;

    // Get timesheet
    const timesheetResult = await query(
      `SELECT * FROM timesheets
       WHERE employee_id = $1 AND week_start_date = $2`,
      [employeeId, weekStart]
    );

    // Get employee info for holidays (needed even if timesheet doesn't exist)
    const orgRes = await query('SELECT tenant_id FROM employees WHERE id = $1', [employeeId]);
    const orgId = orgRes.rows[0]?.tenant_id;
    const empRes = await query(
      'SELECT id, tenant_id, state, work_location, holiday_override FROM employees WHERE id = $1',
      [employeeId]
    );
    const employee = empRes.rows[0] || {};
    const month = String(weekStart).slice(0,7); // YYYY-MM
    
    // Get attendance entries for this week (even if timesheet doesn't exist yet)
    const attendanceEntriesResult = await query(
      `SELECT * FROM timesheet_entries 
       WHERE employee_id = $1 
         AND work_date >= $2 
         AND work_date <= $3 
         AND source IN ('api', 'upload')
       ORDER BY work_date`,
      [employeeId, weekStart, weekEnd]
    );

    if (timesheetResult.rows.length === 0) {
      // No timesheet exists yet, but return attendance entries and holidays so they show in the UI
      const allEntries = attendanceEntriesResult.rows;
      const { holidayCalendar } = await injectHolidayRowsIntoTimesheet(orgId, employee, month, allEntries);
      
      // Calculate total hours from attendance entries
      const totalHours = allEntries.reduce((sum, e) => {
        return sum + parseFloat(e.hours || 0);
      }, 0);
      
      return res.json({ 
        entries: allEntries, 
        holidayCalendar,
        // Return a minimal timesheet structure for the frontend
        week_start_date: weekStart,
        week_end_date: weekEnd,
        total_hours: totalHours,
        status: 'pending'
      });
    }

    const timesheet = timesheetResult.rows[0];

    // Get entries - include both timesheet entries and attendance entries for this week
    const timesheetEntriesResult = await query(
      `SELECT * FROM timesheet_entries 
       WHERE timesheet_id = $1 
       ORDER BY work_date`,
      [timesheet.id]
    );

    // Get attendance entries for this week that aren't linked to the timesheet yet
    const attendanceEntriesForWeek = await query(
      `SELECT * FROM timesheet_entries 
       WHERE employee_id = $1 
         AND work_date >= $2 
         AND work_date <= $3 
         AND source IN ('api', 'upload')
         AND (timesheet_id IS NULL OR timesheet_id != $4)
       ORDER BY work_date`,
      [employeeId, weekStart, weekEnd, timesheet.id]
    );

    // Combine timesheet entries and attendance entries
    const allEntries = [...timesheetEntriesResult.rows, ...attendanceEntriesForWeek.rows];
    
    // Auto-persist holiday entries that don't exist in DB
    await persistHolidayEntries(timesheet.id, orgId, employee, month, allEntries);
    
    // Fetch entries again after persisting holidays (only timesheet entries)
    const updatedEntriesResult = await query('SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date', [timesheet.id]);
    
    // Combine with attendance entries again
    const finalEntries = [...updatedEntriesResult.rows, ...attendanceEntriesForWeek.rows];
    const { rows: withHolidays, holidayCalendar } = await injectHolidayRowsIntoTimesheet(orgId, employee, month, finalEntries);

    res.json({ ...timesheet, entries: withHolidays, holidayCalendar });
  } catch (error) {
    console.error('Error fetching timesheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save/update timesheet
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { weekStart, weekEnd, totalHours, entries } = req.body;

    // Log incoming data for debugging
    console.log('Received timesheet save request:', {
      weekStart,
      weekEnd,
      totalHours,
      entriesCount: entries?.length || 0,
      entries: entries,
    });

    // Validate entries have work_date
    if (entries && Array.isArray(entries)) {
      const invalidEntries = entries.filter(e => !e || !e.work_date);
      if (invalidEntries.length > 0) {
        console.error('Invalid entries received:', invalidEntries);
        return res.status(400).json({ 
          error: 'Some entries are missing work_date',
          invalidEntries 
        });
      }
    }

    // Get employee
    const empResult = await query(
      'SELECT id, tenant_id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const { id: employeeId, tenant_id: tenantId } = empResult.rows[0];

    await query('BEGIN');

    try {
      // Check if timesheet exists
      const existingResult = await query(
        'SELECT id, status FROM timesheets WHERE employee_id = $1 AND week_start_date = $2',
        [employeeId, weekStart]
      );

      let timesheetId;
      if (existingResult.rows.length > 0) {
        const existing = existingResult.rows[0];
        timesheetId = existing.id;
        // Only update if not approved
        if (existing.status !== 'approved') {
          await query(
            `UPDATE timesheets SET
              week_end_date = $1,
              total_hours = $2,
              status = 'pending',
              updated_at = now()
            WHERE id = $3`,
            [weekEnd, totalHours, timesheetId]
          );
        }
      } else {
        // Insert new timesheet
        const insertResult = await query(
          `INSERT INTO timesheets (
            employee_id, tenant_id, week_start_date, week_end_date,
            total_hours, status
          )
          VALUES ($1, $2, $3, $4, $5, 'pending')
          RETURNING *`,
          [employeeId, tenantId, weekStart, weekEnd, totalHours]
        );
        timesheetId = insertResult.rows[0].id;
      }

      // Delete old entries (but preserve holiday entries)
      await query(
        'DELETE FROM timesheet_entries WHERE timesheet_id = $1 AND is_holiday = false',
        [timesheetId]
      );

      // Insert new entries (skip holiday entries - they're auto-managed)
      if (entries && Array.isArray(entries) && entries.length > 0) {
        for (const entry of entries) {
          // Skip holiday entries - they're managed separately
          if (entry.is_holiday) {
            continue;
          }
          
          // Validate entry has required fields
          if (!entry) {
            console.warn('Skipping null/undefined entry');
            continue;
          }
          
          if (!entry.work_date) {
            console.error('Entry missing work_date:', JSON.stringify(entry));
            throw new Error(`Entry is missing required field 'work_date': ${JSON.stringify(entry)}`);
          }
          
          const workDate = String(entry.work_date).trim();
          if (!workDate) {
            console.error('Entry has empty work_date:', JSON.stringify(entry));
            throw new Error(`Entry has empty 'work_date': ${JSON.stringify(entry)}`);
          }
          
          // Check if this date already has a holiday entry - if so, skip
          const holidayCheck = await query(
            'SELECT id FROM timesheet_entries WHERE timesheet_id = $1 AND work_date = $2 AND is_holiday = true',
            [timesheetId, workDate]
          );
          if (holidayCheck.rows.length > 0) {
            continue; // Skip regular entry if holiday exists for this date
          }
          
          // Determine project_id and project_type from entry
          let projectId = null;
          let projectType = null;
          let description = entry.description || '';
          
          // If project_id is provided, use it (assigned project)
          // Note: project_type should be NULL when project_id is set
          if (entry.project_id) {
            projectId = entry.project_id;
            projectType = null; // Don't set project_type for assigned projects
          } else if (entry.project_type) {
            // If project_type is provided (non-billable or internal)
            projectType = entry.project_type;
            if (projectType === 'non-billable') {
              description = 'Non-billable project';
            } else if (projectType === 'internal') {
              description = 'Internal project';
            }
          }
          
          console.log('Inserting entry:', {
            timesheetId,
            tenantId,
            work_date: workDate,
            hours: Number(entry.hours) || 0,
            project_id: projectId,
            project_type: projectType,
            description,
          });
          
          await query(
            `INSERT INTO timesheet_entries (timesheet_id, tenant_id, work_date, hours, description, is_holiday, project_id, project_type)
             VALUES ($1, $2, $3, $4, $5, false, $6, $7)`,
            [
              timesheetId,
              tenantId,
              workDate,
              Number(entry.hours) || 0,
              description,
              projectId,
              projectType,
            ]
          );
        }
      }

      // Auto-persist holiday entries for this timesheet
      const empRes = await query(
        'SELECT id, tenant_id, state, work_location, holiday_override FROM employees WHERE id = $1',
        [employeeId]
      );
      const employee = empRes.rows[0] || {};
      const month = String(weekStart).slice(0,7); // YYYY-MM
      const existingEntriesResult = await query('SELECT * FROM timesheet_entries WHERE timesheet_id = $1', [timesheetId]);
      await persistHolidayEntries(timesheetId, tenantId, employee, month, existingEntriesResult.rows);

      await query('COMMIT');

      // Return updated timesheet
      const updatedResult = await query(
        `SELECT * FROM timesheets WHERE id = $1`,
        [timesheetId]
      );

      const entriesResult = await query(
        'SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date',
        [timesheetId]
      );

      res.json({
        ...updatedResult.rows[0],
        entries: entriesResult.rows,
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error saving timesheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve or reject timesheet
router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body; // action: 'approve', 'reject', or 'return'

    if (!action || !['approve', 'reject', 'return'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve, reject, or return' });
    }

    if ((action === 'reject' || action === 'return') && !rejectionReason) {
      return res.status(400).json({ error: 'Reason required for reject or return' });
    }

    // Get current user's employee ID and role
    const empResult = await query(
      `SELECT e.id
       FROM employees e
       WHERE e.user_id = $1`,
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const reviewerId = empResult.rows[0].id;

    // Get user's highest role
    const roleResult = await query(
      `SELECT role FROM user_roles
       WHERE user_id = $1
       ORDER BY CASE role
         WHEN 'admin' THEN 0
         WHEN 'ceo' THEN 1
         WHEN 'director' THEN 2
         WHEN 'hr' THEN 3
         WHEN 'manager' THEN 4
         WHEN 'employee' THEN 5
       END
       LIMIT 1`,
      [req.user.id]
    );

    if (roleResult.rows.length === 0) {
      return res.status(403).json({ error: 'User role not found' });
    }

    const role = roleResult.rows[0].role;

    // Check if user has permission
    if (!['manager', 'hr', 'director', 'ceo', 'admin'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get timesheet and verify permission
    const timesheetResult = await query(
      `SELECT t.*, e.reporting_manager_id
       FROM timesheets t
       JOIN employees e ON e.id = t.employee_id
       WHERE t.id = $1`,
      [id]
    );

    if (timesheetResult.rows.length === 0) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const timesheet = timesheetResult.rows[0];

    // Check permission based on role
    if (role === 'manager') {
      // Managers can only approve timesheets from their direct reports
      if (timesheet.reporting_manager_id !== reviewerId) {
        return res.status(403).json({ error: 'You can only approve timesheets from your team' });
      }
    } else if (['hr', 'director', 'ceo', 'admin'].includes(role)) {
      // HR/CEO can approve timesheets where employee has no manager OR manager has no manager
      // Check if this timesheet falls into that category
      const employeeCheck = await query(
        `SELECT e.reporting_manager_id, m.reporting_manager_id as manager_manager_id
         FROM employees e
         LEFT JOIN employees m ON e.reporting_manager_id = m.id
         WHERE e.id = $1`,
        [timesheet.employee_id]
      );
      
      if (employeeCheck.rows.length > 0) {
        const emp = employeeCheck.rows[0];
        const hasNoManagerOrManagerHasNoManager = !emp.reporting_manager_id || !emp.manager_manager_id;
        
        if (!hasNoManagerOrManagerHasNoManager) {
          // Normal hierarchy exists, so only manager can approve
          return res.status(403).json({ error: 'This timesheet should be approved by the employee\'s manager' });
        }
      }
    }

    // Update timesheet
    let status, updateQuery, params;
    
    if (action === 'approve') {
      status = 'approved';
      updateQuery = `UPDATE timesheets SET 
           status = $1,
           reviewed_by = $2,
           reviewed_at = now(),
           updated_at = now()
         WHERE id = $3
         RETURNING *`;
      params = [status, reviewerId, id];
    } else if (action === 'reject') {
      status = 'rejected';
      updateQuery = `UPDATE timesheets SET 
           status = $1,
           reviewed_by = $2,
           reviewed_at = now(),
           rejection_reason = $4,
           updated_at = now()
         WHERE id = $3
         RETURNING *`;
      params = [status, reviewerId, id, rejectionReason];
    } else { // return
      status = 'pending';
      updateQuery = `UPDATE timesheets SET 
           status = $1,
           reviewed_by = $2,
           reviewed_at = now(),
           rejection_reason = $4,
           updated_at = now(),
           resubmitted_at = NULL
         WHERE id = $3
         RETURNING *`;
      params = [status, reviewerId, id, rejectionReason];
    }

    const updateResult = await query(updateQuery, params);

    res.json({
      success: true,
      timesheet: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Error approving/rejecting timesheet:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

