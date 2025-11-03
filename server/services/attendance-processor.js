import { query } from '../db/pool.js';
import { parse } from 'csv-parse/sync';
import XLSX from 'xlsx';
import crypto from 'crypto';

/**
 * Process attendance upload file (CSV or Excel)
 * This function handles parsing, validation, normalization, and creating timesheet entries
 */
export async function processAttendanceUpload(uploadId, fileBuffer, filename, tenantId, mappingConfig) {
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

        // Check for duplicates using row hash
        const rowHash = calculateRowHash(
          tenantId,
          normalized.employee_id,
          normalized.work_date,
          normalized.start_time_utc,
          normalized.end_time_utc,
          'upload'
        );

        const existingResult = await query(
          `SELECT id FROM attendance_upload_rows 
           WHERE row_hash = $1 AND status = 'success'`,
          [rowHash]
        );

        if (existingResult.rows.length > 0) {
          await query(
            `UPDATE attendance_upload_rows 
             SET status = 'ignored', error_message = 'Duplicate record', row_hash = $1
             WHERE upload_id = $2 AND row_number = $3`,
            [rowHash, uploadId, rowNumber]
          );
          ignoredCount++;
          continue;
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
    // Create new timesheet
    const newTimesheetResult = await query(
      `INSERT INTO timesheets (employee_id, week_start_date, week_end_date, total_hours, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [normalized.employee_id, weekStart, weekEnd, 0, tenantId]
    );
    timesheetId = newTimesheetResult.rows[0].id;
  } else {
    timesheetId = timesheetResult.rows[0].id;
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

  return entryResult.rows[0].id;
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
 * Notify about upload completion (placeholder for notification service)
 */
async function notifyUploadCompletion(uploadId, tenantId, stats) {
  // TODO: Implement notification service
  // This could send emails, in-app notifications, etc.
  console.log(`Upload ${uploadId} completed with stats:`, stats);
}

