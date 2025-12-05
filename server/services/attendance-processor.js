import { query } from '../db/pool.js';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import crypto from 'crypto';
import { selectEmployeeHolidays } from './holidays.js';

/**
 * Process attendance upload file (CSV or Excel)
 * This function handles parsing, validation, normalization, and creating timesheet entries
 */
const DATE_COLUMN_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const MATRIX_WORKING_CODES = ['P', 'PR', 'PRESENT', 'WFH', 'OD', 'ON DUTY', 'ONDUTY', 'TRAVEL', 'FIELD'];
const DEFAULT_MATRIX_TIME_IN = process.env.DEFAULT_MATRIX_TIME_IN || '09:00';
const DEFAULT_MATRIX_TIME_OUT = process.env.DEFAULT_MATRIX_TIME_OUT || '18:00';

export async function processAttendanceUpload(uploadId, fileBuffer, filename, tenantId, etlConfig) {
  try {
    // Update status to processing
    await query(
      'UPDATE attendance_uploads SET status = $1, processing_started_at = now() WHERE id = $2',
      ['processing', uploadId]
    );

    // Get tenant timezone
    const tenantResult = await query(
      'SELECT timezone FROM organizations WHERE id = $1',
      [tenantId]
    );
    const tenantTimezone = tenantResult.rows[0]?.timezone || 'Asia/Kolkata';

    // Parse file based on extension
    let rows = [];
    const fileExt = filename.split('.').pop().toLowerCase();

    if (fileExt === 'csv') {
      rows = parseCSV(fileBuffer);
    } else if (['xlsx', 'xls'].includes(fileExt)) {
      rows = parseExcel(fileBuffer);
    } else {
      throw new Error('Unsupported file format');
    }

    if (rows.length === 0) {
      throw new Error('File is empty or could not be parsed');
    }

    // Update total rows
    await query(
      'UPDATE attendance_uploads SET total_rows = $1 WHERE id = $2',
      [rows.length, uploadId]
    );

    let mappingConfig = etlConfig?.mapping || null;

    // Detect and convert matrix-style datasets (one row per employee, date columns)
    const matrixResult = convertMatrixDataset(rows, tenantTimezone);
    if (matrixResult) {
      rows = matrixResult.rows;
      mappingConfig = mappingConfig || matrixResult.mapping;

      await query(
        'UPDATE attendance_uploads SET total_rows = $1 WHERE id = $2',
        [rows.length, uploadId]
      );
    }

    // Get or infer column mapping
    const mapping = mappingConfig || inferColumnMapping(rows[0]);

    // Validate required columns
    const requiredColumns = ['employee_identifier', 'date', 'time_in'];
    for (const col of requiredColumns) {
      if (!mapping[col]) {
        throw new Error(`Required column not found: ${col}. Please provide mapping.`);
      }
    }

    // Process rows
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let ignoredCount = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 because CSV has header and is 1-indexed

      try {
        // Store raw row data
        await query(
          `INSERT INTO attendance_upload_rows (upload_id, row_number, raw_data, status)
           VALUES ($1, $2, $3, 'pending')
           ON CONFLICT (upload_id, row_number) DO NOTHING`,
          [uploadId, rowNumber, JSON.stringify(row)]
        );

        // Normalize and validate row
        const normalized = await normalizeRow(row, mapping, tenantId, tenantTimezone);

        if (!normalized) {
          await query(
            `UPDATE attendance_upload_rows 
             SET status = 'ignored', error_message = 'Skipped - missing required data'
             WHERE upload_id = $1 AND row_number = $2`,
            [uploadId, rowNumber]
          );
          ignoredCount++;
          continue;
        }

        // Check if date is a weekend (Saturday = 6, Sunday = 0)
        const workDate = new Date(normalized.work_date);
        const dayOfWeek = workDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          await query(
            `UPDATE attendance_upload_rows 
             SET status = 'ignored', error_message = 'Skipped - weekend'
             WHERE upload_id = $1 AND row_number = $2`,
            [uploadId, rowNumber]
          );
          ignoredCount++;
          continue;
        }

        // Check if date is a holiday
        const isHoliday = await checkIfHoliday(normalized.employee_id, normalized.work_date, tenantId);
        if (isHoliday) {
          await query(
            `UPDATE attendance_upload_rows 
             SET status = 'ignored', error_message = 'Skipped - holiday'
             WHERE upload_id = $1 AND row_number = $2`,
            [uploadId, rowNumber]
          );
          ignoredCount++;
          continue;
        }

        // Check for existing timesheet entry for this employee and date
        // Allow overwriting by deleting the old entry if it exists
        const existingEntryResult = await query(
          `SELECT te.id, te.timesheet_id
           FROM timesheet_entries te
           WHERE te.employee_id = $1 
             AND te.work_date = $2
             AND te.source = 'upload'
           LIMIT 1`,
          [normalized.employee_id, normalized.work_date]
        );

        if (existingEntryResult.rows.length > 0) {
          // Delete the existing entry to allow overwrite
          const existingEntry = existingEntryResult.rows[0];
          await query(
            `DELETE FROM timesheet_entries WHERE id = $1`,
            [existingEntry.id]
          );
          
          // Recalculate timesheet total hours
          await query(
            `UPDATE timesheets 
             SET total_hours = (
               SELECT COALESCE(SUM(hours), 0) 
               FROM timesheet_entries 
               WHERE timesheet_id = $1
             )
             WHERE id = $1`,
            [existingEntry.timesheet_id]
          );
        }

        // Check for duplicates in current upload using row hash
        const rowHash = calculateRowHash(
          tenantId,
          normalized.employee_id,
          normalized.work_date,
          normalized.start_time_utc,
          normalized.end_time_utc,
          'upload'
        );

        const existingUploadRowResult = await query(
          `SELECT id FROM attendance_upload_rows 
           WHERE row_hash = $1 AND status = 'success' AND upload_id != $2`,
          [rowHash, uploadId]
        );

        if (existingUploadRowResult.rows.length > 0) {
          // Same data in a previous upload - still process it as user wants overwrite capability
          // Don't skip, continue processing
        }

        // Update row with normalized data and hash
        await query(
          `UPDATE attendance_upload_rows 
           SET normalized_data = $1, row_hash = $2
           WHERE upload_id = $3 AND row_number = $4`,
          [JSON.stringify(normalized), rowHash, uploadId, rowNumber]
        );

        // Create timesheet entry
        const timesheetEntryId = await createTimesheetEntryFromAttendance(
          normalized,
          uploadId,
          rowNumber,
          tenantId
        );

        // Update row status to success
        await query(
          `UPDATE attendance_upload_rows 
           SET status = 'success', timesheet_entry_id = $1
           WHERE upload_id = $2 AND row_number = $3`,
          [timesheetEntryId, uploadId, rowNumber]
        );

        successCount++;
      } catch (error) {
        // Handle duplicate row_hash specially: treat as ignored, not failed
        if (error.code === '23505' && error.constraint === 'idx_attendance_upload_rows_hash_unique') {
          const msg = 'Duplicate attendance row detected (same hash as a previous upload) - row ignored';
          console.warn(`Ignoring duplicate attendance row ${rowNumber} due to unique hash:`, error.detail || error.message);

          await query(
            `UPDATE attendance_upload_rows 
             SET status = 'ignored', error_message = $1
             WHERE upload_id = $2 AND row_number = $3`,
            [msg, uploadId, rowNumber]
          );

          ignoredCount++;
        } else {
          console.error(`Error processing row ${rowNumber}:`, error);
          
          await query(
            `UPDATE attendance_upload_rows 
             SET status = 'failed', error_message = $1
             WHERE upload_id = $2 AND row_number = $3`,
            [error.message.substring(0, 500), uploadId, rowNumber]
          );

          errors.push({
            row: rowNumber,
            error: error.message
          });
          failedCount++;
        }
      }

      processedCount++;

    }

    // Determine final status
    let finalStatus = 'completed';
    if (failedCount > 0 && successCount === 0) {
      finalStatus = 'failed';
    } else if (failedCount > 0) {
      finalStatus = 'partial';
    }

    // Update upload summary
    await query(
      `UPDATE attendance_uploads 
       SET status = $1, succeeded_rows = $2, failed_rows = $3, ignored_rows = $4,
           processed_at = now(), error_summary = $5
       WHERE id = $6`,
      [
        finalStatus,
        successCount,
        failedCount,
        ignoredCount,
        errors.length > 0 ? JSON.stringify(errors.slice(0, 100)) : null, // Limit errors
        uploadId
      ]
    );

    // Send notification (TODO: implement notification service)
    if (failedCount > 0) {
      await notifyUploadCompletion(uploadId, tenantId, {
        total: rows.length,
        succeeded: successCount,
        failed: failedCount,
        ignored: ignoredCount
      });
    }

    return {
      upload_id: uploadId,
      status: finalStatus,
      total: rows.length,
      succeeded: successCount,
      failed: failedCount,
      ignored: ignoredCount
    };
  } catch (error) {
    // Update upload to failed
    await query(
      `UPDATE attendance_uploads 
       SET status = 'failed', error_summary = $1, processed_at = now()
       WHERE id = $2`,
      [JSON.stringify({ error: error.message }), uploadId]
    );

    throw error;
  }
}

/**
 * Parse CSV file
 */
function parseCSV(buffer) {
  try {
    const csvString = buffer.toString('utf8');
    const records = parse(csvString, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
    return records;
  } catch (error) {
    throw new Error(`CSV parsing error: ${error.message}`);
  }
}

/**
 * Parse Excel file
 */
function parseExcel(buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    return records;
  } catch (error) {
    throw new Error(`Excel parsing error: ${error.message}`);
  }
}

/**
 * Infer column mapping from first row
 */
function inferColumnMapping(firstRow) {
  const mapping = {};
  const lowerRow = Object.keys(firstRow).reduce((acc, key) => {
    acc[key.toLowerCase()] = firstRow[key];
    return acc;
  }, {});

  // Map common column name variations
  const columnMappings = {
    employee_identifier: ['employee_identifier', 'employee_id', 'emp_id', 'employee_code', 'emp_code', 'id'],
    employee_email: ['employee_email', 'email', 'emp_email'],
    date: ['date', 'work_date', 'attendance_date'],
    time_in: ['time_in', 'timein', 'check_in', 'punch_in', 'start_time', 'in'],
    time_out: ['time_out', 'timeout', 'check_out', 'punch_out', 'end_time', 'out'],
    timezone: ['timezone', 'tz', 'time_zone'],
    device_id: ['device_id', 'device', 'deviceid'],
    notes: ['notes', 'note', 'remarks', 'description']
  };

  for (const [key, variations] of Object.entries(columnMappings)) {
    for (const variation of variations) {
      if (lowerRow[variation] !== undefined) {
        mapping[key] = variation;
        break;
      }
    }
  }

  return mapping;
}

/**
 * Normalize row data and validate
 */
async function normalizeRow(row, mapping, tenantId, tenantTimezone) {
  try {
    // Extract values using mapping
    const employeeIdentifier = getValue(row, mapping.employee_identifier);
    const employeeEmail = mapping.employee_email ? getValue(row, mapping.employee_email) : null;
    const dateStr = getValue(row, mapping.date);
    const timeInStr = getValue(row, mapping.time_in);
    const timeOutStr = mapping.time_out ? getValue(row, mapping.time_out) : null;
    const timezone = mapping.timezone ? getValue(row, mapping.timezone) : tenantTimezone;
    const deviceId = mapping.device_id ? getValue(row, mapping.device_id) : null;
    const notes = mapping.notes ? getValue(row, mapping.notes) : null;

    if (!employeeIdentifier || !dateStr || !timeInStr) {
      return null; // Skip if required fields missing
    }

    // Lookup employee
    let employeeResult;
    if (employeeEmail) {
      employeeResult = await query(
        `SELECT e.id, e.tenant_id, e.employee_id
         FROM employees e
         JOIN profiles p ON p.id = e.user_id
         WHERE (e.employee_id = $1 OR LOWER(p.email) = LOWER($2))
           AND e.tenant_id = $3
         LIMIT 1`,
        [employeeIdentifier, employeeEmail, tenantId]
      );
    } else {
      employeeResult = await query(
        `SELECT id, tenant_id, employee_id
         FROM employees
         WHERE employee_id = $1 AND tenant_id = $2
         LIMIT 1`,
        [employeeIdentifier, tenantId]
      );
    }

    if (employeeResult.rows.length === 0) {
      throw new Error(`Employee not found: ${employeeIdentifier}`);
    }

    const employee = employeeResult.rows[0];

    // Parse date
    const workDate = parseDate(dateStr);
    if (!workDate) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    // Parse times and convert to UTC
    const startTime = parseDateTime(workDate, timeInStr, timezone || tenantTimezone);
    if (!startTime) {
      throw new Error(`Invalid time_in format: ${timeInStr}`);
    }

    let endTime = null;
    let totalHours = 0;

    if (timeOutStr) {
      endTime = parseDateTime(workDate, timeOutStr, timezone || tenantTimezone);
      if (!endTime) {
        throw new Error(`Invalid time_out format: ${timeOutStr}`);
      }

      // Calculate total hours
      totalHours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

      if (totalHours < 0) {
        throw new Error('time_out must be after time_in');
      }
    }

    return {
      employee_id: employee.id,
      work_date: workDate.toISOString().split('T')[0],
      start_time_utc: startTime.toISOString(),
      end_time_utc: endTime ? endTime.toISOString() : null,
      total_hours: totalHours,
      timezone: timezone || tenantTimezone,
      device_id: deviceId,
      notes: notes
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Create timesheet entry from attendance data
 */
async function createTimesheetEntryFromAttendance(normalized, uploadId, rowNumber, tenantId) {
  // Get or create timesheet for the week
  const weekStart = getWeekStart(normalized.work_date);
  const weekEnd = getWeekEnd(weekStart);

  let timesheetResult = await query(
    `SELECT id FROM timesheets 
     WHERE employee_id = $1 AND week_start_date = $2`,
    [normalized.employee_id, weekStart]
  );

  let timesheetId;
  if (timesheetResult.rows.length === 0) {
    // Create new timesheet with status 'draft' (not submitted)
    // Attendance uploads should not auto-submit timesheets - user must submit manually
    // Timesheets should only go to 'pending_approval' when user explicitly submits them
    try {
      const newTimesheetResult = await query(
        `INSERT INTO timesheets (employee_id, week_start_date, week_end_date, total_hours, tenant_id, status, submitted_at)
         VALUES ($1, $2, $3, $4, $5, 'draft', NULL)
         RETURNING id`,
        [normalized.employee_id, weekStart, weekEnd, 0, tenantId]
      );
      timesheetId = newTimesheetResult.rows[0].id;
    } catch (error) {
      // If NULL is not allowed (migration not run yet), omit submitted_at to use DEFAULT
      // This will still set status='draft' which indicates it needs manual submission
      if (error.message && error.message.includes('submitted_at') && error.message.includes('null value')) {
        const newTimesheetResult = await query(
          `INSERT INTO timesheets (employee_id, week_start_date, week_end_date, total_hours, tenant_id, status)
           VALUES ($1, $2, $3, $4, $5, 'draft')
           RETURNING id`,
          [normalized.employee_id, weekStart, weekEnd, 0, tenantId]
        );
        timesheetId = newTimesheetResult.rows[0].id;
      } else {
        throw error;
      }
    }
  } else {
    timesheetId = timesheetResult.rows[0].id;
    // Don't modify submission status - user must submit manually
    // Just add the attendance entry to the existing timesheet
  }

  // Get upload row ID
  const rowResult = await query(
    `SELECT id FROM attendance_upload_rows 
     WHERE upload_id = $1 AND row_number = $2`,
    [uploadId, rowNumber]
  );
  const uploadRowId = rowResult.rows[0]?.id;

  // Create timesheet entry
  const entryResult = await query(
    `INSERT INTO timesheet_entries (
      timesheet_id, employee_id, work_date, hours, tenant_id, source,
      attendance_upload_row_id, start_time_utc, end_time_utc, payroll_status, description
    )
    VALUES ($1, $2, $3, $4, $5, 'upload', $6, $7, $8, 'pending_for_payroll', $9)
    RETURNING id`,
    [
      timesheetId,
      normalized.employee_id,
      normalized.work_date,
      normalized.total_hours,
      tenantId,
      uploadRowId,
      normalized.start_time_utc,
      normalized.end_time_utc,
      normalized.notes || 'Attendance upload'
    ]
  );

  const timesheetEntryId = entryResult.rows[0].id;

  // Also create synthetic attendance_events so analytics dashboards see uploaded data
  // Use start_time_utc as IN event, end_time_utc (if present) as OUT event
  if (normalized.start_time_utc) {
    await query(
      `INSERT INTO attendance_events (
        tenant_id, employee_id, raw_timestamp, event_type, device_id, metadata, created_by, paired_timesheet_entry_id, work_type
      ) VALUES ($1, $2, $3, 'IN', 'upload', NULL, NULL, $4, 'WFO')`,
      [tenantId, normalized.employee_id, new Date(normalized.start_time_utc), timesheetEntryId]
    );
  }

  if (normalized.end_time_utc) {
    await query(
      `INSERT INTO attendance_events (
        tenant_id, employee_id, raw_timestamp, event_type, device_id, metadata, created_by, paired_timesheet_entry_id, work_type
      ) VALUES ($1, $2, $3, 'OUT', 'upload', NULL, NULL, $4, 'WFO')`,
      [tenantId, normalized.employee_id, new Date(normalized.end_time_utc), timesheetEntryId]
    );
  }

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

  return timesheetEntryId;
}

/**
 * Calculate row hash for idempotency
 */
function calculateRowHash(tenantId, employeeId, workDate, startTimeUtc, endTimeUtc, source) {
  const hashString = `${tenantId}|${employeeId}|${workDate}|${startTimeUtc}|${endTimeUtc || ''}|${source}`;
  return crypto.createHash('sha256').update(hashString).digest('hex');
}

/**
 * Parse date string
 */
function parseDate(dateStr) {
  // Try ISO format first (YYYY-MM-DD)
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try other formats
  // DD-MM-YYYY or DD/MM/YYYY
  const ddmmyyyy = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // MM/DD/YYYY or MM-DD-YYYY
  const mmddyyyy = dateStr.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (mmddyyyy && !ddmmyyyy) {
    const [, month, day, year] = mmddyyyy;
    const date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Try generic Date parsing
  const date = new Date(dateStr);
  if (!isNaN(date.getTime())) {
    return date;
  }

  return null;
}

/**
 * Parse date-time string
 */
function parseDateTime(workDate, timeStr, timezone) {
  // Try ISO format first
  if (timeStr.includes('T') || timeStr.includes(' ')) {
    let dt = new Date(timeStr);
    if (!isNaN(dt.getTime())) {
      return dt;
    }
  }

  // Try time-only formats (HH:MM or HH:MM:SS)
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (timeMatch) {
    const [, hours, minutes, seconds] = timeMatch;
    
    // Ensure workDate is a Date object
    let dateObj;
    if (workDate instanceof Date) {
      dateObj = workDate;
    } else if (typeof workDate === 'string') {
      dateObj = new Date(workDate);
    } else {
      return null;
    }
    
    if (isNaN(dateObj.getTime())) {
      return null;
    }
    
    const dateStr = dateObj.toISOString().split('T')[0];
    
    // Combine date and time
    const combined = `${dateStr}T${hours.padStart(2, '0')}:${minutes}:${seconds || '00'}`;
    
    // Parse as local time - for now treat as UTC
    // In production, use a proper timezone library like luxon or moment-timezone
    const localDate = new Date(combined);
    
    if (isNaN(localDate.getTime())) {
      return null;
    }
    
    return localDate;
  }

  return null;
}

function normalizeHeaderLabel(header) {
  return (header || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function findHeader(headers, candidates) {
  const normalized = headers.map((header) => ({
    raw: header,
    norm: normalizeHeaderLabel(header),
  }));
  const target = candidates.map(normalizeHeaderLabel);
  const match = normalized.find((entry) => target.includes(entry.norm));
  return match?.raw || null;
}

function normalizeStatusValue(value) {
  return (value || '').replace(/[^a-z]/gi, '').toUpperCase();
}

function isWorkingMatrixStatus(value) {
  const normalized = normalizeStatusValue(value);
  return MATRIX_WORKING_CODES.some((code) =>
    normalized.includes(code.replace(/\s/g, ''))
  );
}

function convertMatrixDataset(rows, tenantTimezone) {
  if (!rows.length) return null;
  const headers = Object.keys(rows[0]);
  const dateColumns = headers.filter((header) =>
    DATE_COLUMN_REGEX.test((header || '').trim())
  );
  if (dateColumns.length === 0) {
    return null;
  }

  const identifierHeader = findHeader(headers, [
    'employee code',
    'employee_id',
    'employee id',
    'emp id',
    'emp code',
    'code',
  ]);
  if (!identifierHeader) return null;

  const emailHeader = findHeader(headers, ['employee email', 'email']);
  const timezoneHeader = findHeader(headers, ['timezone', 'tz', 'time zone']);

  const expandedRows = [];
  rows.forEach((row) => {
    const identifier = (row[identifierHeader] || '').toString().trim();
    if (!identifier) return;

    dateColumns.forEach((dateCol) => {
      const statusValue = (row[dateCol] || '').toString().trim();
      if (!statusValue || !isWorkingMatrixStatus(statusValue)) return;

      expandedRows.push({
        employee_identifier: identifier,
        employee_email: emailHeader ? (row[emailHeader] || '').toString().trim() : '',
        date: dateCol,
        time_in: DEFAULT_MATRIX_TIME_IN,
        time_out: DEFAULT_MATRIX_TIME_OUT,
        timezone: timezoneHeader ? (row[timezoneHeader] || tenantTimezone) : tenantTimezone,
        notes: `Status: ${statusValue}`,
      });
    });
  });

  if (!expandedRows.length) return null;

  return {
    rows: expandedRows,
    mapping: {
      employee_identifier: 'employee_identifier',
      employee_email: 'employee_email',
      date: 'date',
      time_in: 'time_in',
      time_out: 'time_out',
      timezone: 'timezone',
      notes: 'notes',
    },
  };
}

/**
 * Get value from row using case-insensitive key
 */
function getValue(row, key) {
  if (!key) return null;
  
  // Try exact match
  if (row[key] !== undefined) {
    return row[key];
  }

  // Try case-insensitive
  const lowerKey = key.toLowerCase();
  for (const k in row) {
    if (k.toLowerCase() === lowerKey) {
      return row[k];
    }
  }

  return null;
}

/**
 * Helper functions for week calculation
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  const weekStart = new Date(d.setDate(diff));
  return weekStart.toISOString().split('T')[0];
}

function getWeekEnd(weekStart) {
  const start = new Date(weekStart);
  start.setDate(start.getDate() + 6);
  return start.toISOString().split('T')[0];
}

/**
 * Check if a date is a holiday for an employee
 */
async function checkIfHoliday(employeeId, workDate, tenantId) {
  try {
    // Get employee info (state, holiday_override)
    const empResult = await query(
      `SELECT id, state, work_location, holiday_override
       FROM employees WHERE id = $1`,
      [employeeId]
    );

    if (empResult.rows.length === 0) {
      return false;
    }

    const employee = empResult.rows[0];
    const dateObj = new Date(workDate);
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth() + 1; // JavaScript months are 0-indexed

    // Check holiday override first
    const override = employee.holiday_override;
    if (override && override[`${year}-${String(month).padStart(2, '0')}`]) {
      const overrideDates = override[`${year}-${String(month).padStart(2, '0')}`];
      const dateStr = workDate instanceof Date ? workDate.toISOString().slice(0, 10) : String(workDate).slice(0, 10);
      if (overrideDates.includes(dateStr)) {
        return true;
      }
    }

    // Check published holidays
    const holidays = await selectEmployeeHolidays({
      orgId: tenantId,
      employee,
      year,
      month
    });

    const dateStr = workDate instanceof Date ? workDate.toISOString().slice(0, 10) : String(workDate).slice(0, 10);
    return holidays.some(h => {
      const holidayDate = h.date instanceof Date ? h.date.toISOString().slice(0, 10) : String(h.date).slice(0, 10);
      return holidayDate === dateStr;
    });
  } catch (error) {
    console.error('Error checking holiday:', error);
    // On error, don't skip - allow attendance to be processed
    return false;
  }
}

/**
 * Notify about upload completion (placeholder for notification service)
 */
async function notifyUploadCompletion(uploadId, tenantId, stats) {
  // TODO: Implement notification service
  // This could send emails, in-app notifications, etc.
  console.log(`Upload ${uploadId} completed with stats:`, stats);
}

