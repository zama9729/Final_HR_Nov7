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
          AND t.status = 'pending_approval'
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
          AND t.status = 'pending_approval'
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
        // Check if project_id column exists, if not use a simpler query
        let entriesResult;
        try {
          entriesResult = await query(
            'SELECT id, work_date, hours, description, project_id, project_type FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date',
            [timesheet.id]
          );
        } catch (err) {
          // If project_id doesn't exist, use query without those columns
          if (err.code === '42703') {
            entriesResult = await query(
              'SELECT id, work_date, hours, description FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date',
              [timesheet.id]
            );
            // Add null values for missing columns
            entriesResult.rows = entriesResult.rows.map(row => ({
              ...row,
              project_id: null,
              project_type: null
            }));
          } else {
            throw err;
          }
        }
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

    // Get employee & tenant
    const empResult = await query(
      'SELECT id, tenant_id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;
    const tenantId = empResult.rows[0].tenant_id;

    // Try to find an existing timesheet for this week
    const timesheetResult = await query(
      `SELECT * FROM timesheets
       WHERE employee_id = $1 AND week_start_date = $2`,
      [employeeId, weekStart]
    );

    const timesheet = timesheetResult.rows[0] || null;

    // Build base rows from punches (attendance_events)
    const punchesResult = await query(
      `SELECT 
         DATE(raw_timestamp) AS work_date,
         MIN(raw_timestamp) FILTER (WHERE event_type = 'IN')  AS first_in,
         MAX(raw_timestamp) FILTER (WHERE event_type = 'OUT') AS last_out
       FROM attendance_events
       WHERE tenant_id = $1
         AND employee_id = $2
         AND raw_timestamp >= $3::date
         AND raw_timestamp <= $4::date + INTERVAL '1 day' - INTERVAL '1 second'
       GROUP BY DATE(raw_timestamp)
       ORDER BY work_date`,
      [tenantId, employeeId, weekStart, weekEnd]
    );

    const punchMap = new Map();
    punchesResult.rows.forEach((row) => {
      punchMap.set(String(row.work_date), row);
    });

    // If a timesheet exists, load its entries to overlay manual edits
    let existingEntriesByDate = new Map();
    if (timesheet) {
      const tsEntries = await query(
        `SELECT * FROM timesheet_entries 
         WHERE timesheet_id = $1 
         ORDER BY work_date`,
        [timesheet.id]
      );
      tsEntries.rows.forEach((e) => {
        existingEntriesByDate.set(String(e.work_date), e);
      });
    }

    // Build rows for each day in the requested range
    const rows = [];
    let cursor = new Date(weekStart);
    const endDate = new Date(weekEnd);
    while (cursor <= endDate) {
      const dateKey = cursor.toISOString().split('T')[0];
      const punch = punchMap.get(dateKey);
      const existing = existingEntriesByDate.get(dateKey);

      let clockIn = punch?.first_in || null;
      let clockOut = punch?.last_out || null;
      let manualIn = existing?.manual_in || null;
      let manualOut = existing?.manual_out || null;
      let source = existing?.source || (manualIn || manualOut ? 'manual_edit' : 'punch');

      // Prefer manual overrides if present
      const effectiveIn = manualIn || clockIn;
      const effectiveOut = manualOut || clockOut;

      let hoursWorked = null;
      let hasMissingPunches = false;
      if (effectiveIn && effectiveOut) {
        const diffMs = new Date(effectiveOut) - new Date(effectiveIn);
        hoursWorked = Math.max(0, diffMs / (1000 * 60 * 60));
      } else if (clockIn || clockOut) {
        hasMissingPunches = true;
      }

      rows.push({
        work_date: dateKey,
        clock_in: clockIn,
        clock_out: clockOut,
        manual_in: manualIn,
        manual_out: manualOut,
        notes: existing?.notes || existing?.description || null,
        hours_worked: existing?.hours_worked ?? hoursWorked,
        source,
        has_missing_punches: hasMissingPunches,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    const totalHours = rows.reduce((sum, r) => sum + (Number(r.hours_worked) || 0), 0);

    // Return either the existing timesheet with rows, or a virtual draft
    if (timesheet) {
      return res.json({
        ...timesheet,
        total_hours: totalHours,
        entries: rows,
      });
    }

    return res.json({
      employee_id: employeeId,
      week_start_date: weekStart,
      week_end_date: weekEnd,
      status: 'draft',
      total_hours: totalHours,
      entries: rows,
    });
  } catch (error) {
    console.error('Error fetching timesheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Save/update timesheet (draft) with manual edits
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

    // Check if project_id and project_type columns exist (cache for this request)
    let hasProjectColumns = false;
    try {
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'timesheet_entries'
        AND column_name IN ('project_id', 'project_type')
      `);
      hasProjectColumns = columnCheck.rows.length === 2;
    } catch (err) {
      // If check fails, assume columns don't exist
      hasProjectColumns = false;
    }

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
              status = 'draft',
              updated_at = now()
            WHERE id = $3`,
            [weekEnd, totalHours, timesheetId]
          );
        }
      } else {
        // Insert new timesheet as draft
        const insertResult = await query(
          `INSERT INTO timesheets (
            employee_id, tenant_id, week_start_date, week_end_date,
            total_hours, status
          )
          VALUES ($1, $2, $3, $4, $5, 'draft')
          RETURNING *`,
          [employeeId, tenantId, weekStart, weekEnd, totalHours]
        );
        timesheetId = insertResult.rows[0].id;
      }

      // Delete old non-holiday entries; manual edits are represented by new rows
      await query(
        'DELETE FROM timesheet_entries WHERE timesheet_id = $1 AND (is_holiday = false OR is_holiday IS NULL)',
        [timesheetId]
      );

      // Insert new entries (skip holiday entries - they're auto-managed)
      // Allow entries with 0 hours so users can add new entries and fill them in later
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
          
          // Allow entries with 0 hours - users can add entries and fill them in later
          // Only skip if hours is negative (invalid)
          if (entry.hours < 0) {
            console.warn('Skipping entry with negative hours:', entry);
            continue;
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
            clock_in: entry.clock_in,
            clock_out: entry.clock_out,
            manual_in: entry.manual_in,
            manual_out: entry.manual_out,
          });

          // Compute hours_worked from effective in/out if not provided
          let hoursWorked = entry.hours_worked;
          const effectiveIn = entry.manual_in || entry.clock_in;
          const effectiveOut = entry.manual_out || entry.clock_out;
          if (hoursWorked == null && effectiveIn && effectiveOut) {
            const diffMs = new Date(effectiveOut) - new Date(effectiveIn);
            hoursWorked = Math.max(0, diffMs / (1000 * 60 * 60));
          }
          const source = entry.manual_in || entry.manual_out ? 'manual_edit' : (entry.source || 'punch');
          
          if (hasProjectColumns) {
            await query(
              `INSERT INTO timesheet_entries (
                 timesheet_id, tenant_id, work_date, hours, description, is_holiday,
                 project_id, project_type, clock_in, clock_out, manual_in, manual_out,
                 notes, hours_worked, source
               )
               VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
              [
                timesheetId,
                tenantId,
                workDate,
                Number(entry.hours) || 0,
                description,
                projectId,
                projectType,
                entry.clock_in || null,
                entry.clock_out || null,
                entry.manual_in || null,
                entry.manual_out || null,
                entry.notes || null,
                hoursWorked ?? null,
                source,
              ]
            );
          } else {
            // Insert without project columns
            await query(
              `INSERT INTO timesheet_entries (
                 timesheet_id, tenant_id, work_date, hours, description, is_holiday,
                 clock_in, clock_out, manual_in, manual_out, notes, hours_worked, source
               )
               VALUES ($1, $2, $3, $4, $5, false, $6, $7, $8, $9, $10, $11, $12)`,
              [
                timesheetId,
                tenantId,
                workDate,
                Number(entry.hours) || 0,
                description,
                entry.clock_in || null,
                entry.clock_out || null,
                entry.manual_in || null,
                entry.manual_out || null,
                entry.notes || null,
                hoursWorked ?? null,
                source,
              ]
            );
          }
        }
      }

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

// Submit timesheet - lock and move to pending_approval, create audit snapshot & approvals shell
router.post('/:id/submit', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Load timesheet and ensure it belongs to current user
    const tsResult = await query(
      `SELECT t.*, e.user_id AS employee_user_id, e.reporting_manager_id
       FROM timesheets t
       JOIN employees e ON e.id = t.employee_id
       WHERE t.id = $1`,
      [id]
    );

    if (tsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Timesheet not found' });
    }

    const ts = tsResult.rows[0];

    if (ts.employee_user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only submit your own timesheet' });
    }

    if (ts.status === 'approved' || ts.status === 'pending_approval') {
      return res.status(400).json({ error: 'Timesheet is already submitted' });
    }

    // Load entries to build audit snapshot
    const entriesRes = await query(
      'SELECT * FROM timesheet_entries WHERE timesheet_id = $1 ORDER BY work_date',
      [id]
    );
    const entries = entriesRes.rows;

    if (!entries.length) {
      return res.status(400).json({ error: 'Cannot submit an empty timesheet' });
    }

    const totalHours = entries.reduce((sum, e) => sum + Number(e.hours_worked || e.hours || 0), 0);
    if (totalHours <= 0) {
      return res.status(400).json({ error: 'Timesheet has no hours to submit' });
    }

    // Simple approval shell: manager first; HR/CEO can be appended later
    const approvals = [];
    if (ts.reporting_manager_id) {
      approvals.push({
        approver_role: 'manager',
        approver_employee_id: ts.reporting_manager_id,
        status: 'pending',
      });
    }

    const snapshot = {
      id,
      week_start_date: ts.week_start_date,
      week_end_date: ts.week_end_date,
      total_hours: totalHours,
      entries,
    };

    const updated = await query(
      `UPDATE timesheets
       SET status = 'pending_approval',
           total_hours = $1,
           submitted_at = COALESCE(submitted_at, now()),
           submitted_by = COALESCE(submitted_by, $2),
           approvals = $3::jsonb,
           audit_snapshot = $4::jsonb,
           updated_at = now()
       WHERE id = $5
       RETURNING *`,
      [totalHours, req.user.id, JSON.stringify(approvals), JSON.stringify(snapshot), id]
    );

    res.json(updated.rows[0]);
  } catch (error) {
    console.error('Error submitting timesheet:', error);
    res.status(500).json({ error: error.message });
  }
});

// Approve or reject timesheet (simple single-step approval, will be extended later)
router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason } = req.body; // action: 'approve', 'reject'

    if (!action || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Action must be approve or reject' });
    }

    if (action === 'reject' && !rejectionReason) {
      return res.status(400).json({ error: 'Reason required for reject' });
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

    // For now, simple single-step approval that updates status directly
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    const updateResult = await query(
      `UPDATE timesheets SET 
         status = $1,
         reviewed_by = $2,
         reviewed_at = now(),
         rejection_reason = $3,
         updated_at = now()
       WHERE id = $4
       RETURNING *`,
      [newStatus, reviewerId, rejectionReason || null, id]
    );

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

