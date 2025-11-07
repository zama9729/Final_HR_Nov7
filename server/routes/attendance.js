import express from 'express';
import multer from 'multer';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { processAttendanceUpload } from '../services/attendance-processor.js';

const router = express.Router();

// Configure multer for file uploads (50MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(csv|xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only CSV and Excel files are allowed.'));
    }
  }
});

// Rate limiting for punch API
const punchRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many punch requests, please try again later.'
});

// POST /api/v1/attendance/punch
// Real-time punch in/out API
router.post('/punch', authenticateToken, punchRateLimit, async (req, res) => {
  try {
    const { employee_id, timestamp, type, device_id, metadata } = req.body;

    if (!employee_id || !timestamp || !type || !['IN', 'OUT'].includes(type)) {
      return res.status(400).json({ 
        error: 'Missing required fields: employee_id, timestamp, type (IN/OUT)' 
      });
    }

    // Get user's tenant_id for authorization
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const userTenantId = tenantResult.rows[0]?.tenant_id;

    if (!userTenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Verify employee belongs to tenant
    const empResult = await query(
      'SELECT id, tenant_id FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empResult.rows[0].tenant_id !== userTenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Parse timestamp
    const punchTime = new Date(timestamp);
    if (isNaN(punchTime.getTime())) {
      return res.status(400).json({ error: 'Invalid timestamp format' });
    }

    // Store attendance event
    const eventResult = await query(
      `INSERT INTO attendance_events (
        tenant_id, employee_id, raw_timestamp, event_type, device_id, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, raw_timestamp, event_type`,
      [
        userTenantId,
        employee_id,
        punchTime,
        type,
        device_id || null,
        metadata ? JSON.stringify(metadata) : null,
        req.user.id
      ]
    );

    const event = eventResult.rows[0];

    // Try to pair IN/OUT and create timesheet entry
    let pairedTimesheetEntryId = null;
    
    if (type === 'OUT') {
      // Find the most recent IN event without an OUT
      const inEventResult = await query(
        `SELECT id, raw_timestamp
         FROM attendance_events
         WHERE employee_id = $1
           AND event_type = 'IN'
           AND paired_timesheet_entry_id IS NULL
           AND DATE(raw_timestamp) = DATE($2)
         ORDER BY raw_timestamp DESC
         LIMIT 1`,
        [employee_id, punchTime]
      );

      if (inEventResult.rows.length > 0) {
        const inEvent = inEventResult.rows[0];
        const startTime = new Date(inEvent.raw_timestamp);
        const endTime = punchTime;
        const workDate = startTime.toISOString().split('T')[0];
        const totalHours = (endTime - startTime) / (1000 * 60 * 60); // Convert to hours

        // Create or get timesheet for the week
        const weekStart = getWeekStart(workDate);
        const weekEnd = getWeekEnd(weekStart);

        let timesheetResult = await query(
          `SELECT id FROM timesheets 
           WHERE employee_id = $1 AND week_start_date = $2`,
          [employee_id, weekStart]
        );

        let timesheetId;
        if (timesheetResult.rows.length === 0) {
          // Create new timesheet
          const newTimesheetResult = await query(
            `INSERT INTO timesheets (employee_id, week_start_date, week_end_date, total_hours, tenant_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [employee_id, weekStart, weekEnd, 0, userTenantId]
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
          VALUES ($1, $2, $3, $4, $5, 'api', $6, $7, $8, 'pending_for_payroll', 'Punch In/Out')
          RETURNING id`,
          [
            timesheetId,
            employee_id,
            workDate,
            totalHours,
            userTenantId,
            event.id,
            startTime,
            endTime
          ]
        );

        pairedTimesheetEntryId = entryResult.rows[0].id;

        // Update both events with timesheet entry ID
        await query(
          'UPDATE attendance_events SET paired_timesheet_entry_id = $1 WHERE id IN ($2, $3)',
          [pairedTimesheetEntryId, inEvent.id, event.id]
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
      }
    }

    // Log audit
    await query(
      `INSERT INTO attendance_audit_logs (tenant_id, actor_id, action, object_type, object_id, details)
       VALUES ($1, $2, 'punch_${type.toLowerCase()}', 'attendance_event', $3, $4)`,
      [
        userTenantId,
        req.user.id,
        event.id,
        JSON.stringify({ type, device_id, paired: !!pairedTimesheetEntryId })
      ]
    );

    res.json({
      event_id: event.id,
      paired_timesheet_id: pairedTimesheetEntryId,
      message: pairedTimesheetEntryId 
        ? 'Punch recorded and timesheet entry created.'
        : type === 'IN' 
          ? 'Punch IN recorded. Waiting for OUT to create timesheet.'
          : 'Punch OUT recorded but no matching IN found.'
    });
  } catch (error) {
    console.error('Punch API error:', error);
    res.status(500).json({ error: error.message || 'Failed to process punch' });
  }
});

// POST /api/v1/attendance/upload
// Bulk upload CSV/Excel file
router.post('/upload', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(400).json({ error: err.message || 'File upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Parse mapping config if provided
    let mappingConfig = null;
    if (req.body.mapping) {
      try {
        mappingConfig = JSON.parse(req.body.mapping);
      } catch (e) {
        return res.status(400).json({ error: 'Invalid mapping JSON' });
      }
    }

    // Store file info (in production, save to S3/local storage)
    const storagePath = `attendance/${tenantId}/${Date.now()}_${req.file.originalname}`;
    
    // Create upload record
    const uploadResult = await query(
      `INSERT INTO attendance_uploads (
        tenant_id, uploader_id, original_filename, storage_path, 
        file_size, file_type, status, mapping_config
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      RETURNING id`,
      [
        tenantId,
        req.user.id,
        req.file.originalname,
        storagePath,
        req.file.size,
        req.file.mimetype,
        mappingConfig ? JSON.stringify(mappingConfig) : null
      ]
    );

    const uploadId = uploadResult.rows[0].id;

    // Log audit
    await query(
      `INSERT INTO attendance_audit_logs (tenant_id, actor_id, action, object_type, object_id, details)
       VALUES ($1, $2, 'upload_started', 'attendance_upload', $3, $4)`,
      [
        tenantId,
        req.user.id,
        uploadId,
        JSON.stringify({ filename: req.file.originalname, size: req.file.size })
      ]
    );

    // Process file asynchronously
    processAttendanceUpload(uploadId, req.file.buffer, req.file.originalname, tenantId, mappingConfig)
      .catch(error => {
        console.error('Error processing attendance upload:', error);
        // Update upload status to failed - check if table exists first
        query(
          'UPDATE attendance_uploads SET status = $1, error_summary = $2, processed_at = now() WHERE id = $3',
          ['failed', JSON.stringify({ error: error.message || 'Processing failed' }), uploadId]
        ).catch(err => {
          console.error('Error updating upload status:', err);
        });
      });

    res.json({
      upload_id: uploadId,
      status: 'processing',
      message: 'File accepted and queued for processing'
    });
  } catch (error) {
    console.error('Upload API error:', error);
    res.status(500).json({ error: error.message || 'Failed to upload file' });
  }
});

// GET /api/v1/attendance/upload/:upload_id/status
router.get('/upload/:upload_id/status', authenticateToken, async (req, res) => {
  try {
    const { upload_id } = req.params;

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get upload record
    const uploadResult = await query(
      `SELECT 
        id, original_filename, status, total_rows, succeeded_rows, 
        failed_rows, ignored_rows, processing_started_at, processed_at,
        error_summary, created_at
      FROM attendance_uploads
      WHERE id = $1 AND tenant_id = $2`,
      [upload_id, tenantId]
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Get failed rows details
    const failedRowsResult = await query(
      `SELECT row_number, error_message, raw_data
       FROM attendance_upload_rows
       WHERE upload_id = $1 AND status = 'failed'
       ORDER BY row_number
       LIMIT 100`,
      [upload_id]
    );

    res.json({
      ...uploadResult.rows[0],
      failed_rows_details: failedRowsResult.rows
    });
  } catch (error) {
    console.error('Get upload status error:', error);
    res.status(500).json({ error: error.message || 'Failed to get upload status' });
  }
});

// GET /api/v1/attendance/employee/:employee_id/timesheet
router.get('/employee/:employee_id/timesheet', authenticateToken, async (req, res) => {
  try {
    const { employee_id } = req.params;
    const { from, to } = req.query;

    if (!from || !to) {
      return res.status(400).json({ error: 'from and to date parameters required (YYYY-MM-DD)' });
    }

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Verify employee belongs to tenant
    const empResult = await query(
      'SELECT id, tenant_id FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empResult.rows.length === 0 || empResult.rows[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get attendance-derived timesheet entries
    const entriesResult = await query(
      `SELECT 
        te.id, te.work_date, te.hours, te.start_time_utc, te.end_time_utc,
        te.source, te.payroll_status, te.created_at, te.description,
        t.status as timesheet_status,
        ae.event_type, ae.device_id,
        aur.row_number as upload_row_number
      FROM timesheet_entries te
      LEFT JOIN timesheets t ON t.id = te.timesheet_id
      LEFT JOIN attendance_events ae ON ae.id = te.attendance_event_id
      LEFT JOIN attendance_upload_rows aur ON aur.id = te.attendance_upload_row_id
      WHERE te.employee_id = $1
        AND te.source IN ('api', 'upload')
        AND te.work_date >= $2
        AND te.work_date <= $3
        AND te.tenant_id = $4
      ORDER BY te.work_date, te.start_time_utc`,
      [employee_id, from, to, tenantId]
    );

    res.json({
      employee_id,
      period: { from, to },
      entries: entriesResult.rows
    });
  } catch (error) {
    console.error('Get employee timesheet error:', error);
    res.status(500).json({ error: error.message || 'Failed to get timesheet' });
  }
});

// GET /api/v1/attendance/uploads
router.get('/uploads', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get uploads for tenant
    const uploadsResult = await query(
      `SELECT 
        au.id, au.original_filename, au.status, au.total_rows,
        au.succeeded_rows, au.failed_rows, au.ignored_rows,
        au.processing_started_at, au.processed_at, au.created_at,
        au.uploader_id,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) as uploader
      FROM attendance_uploads au
      LEFT JOIN profiles p ON p.id = au.uploader_id
      WHERE au.tenant_id = $1
      ORDER BY au.created_at DESC
      LIMIT 100`,
      [tenantId]
    );

    res.json(uploadsResult.rows);
  } catch (error) {
    console.error('Get uploads error:', error);
    res.status(500).json({ error: error.message || 'Failed to get uploads' });
  }
});

// POST /api/v1/attendance/upload/:upload_id/retry
router.post('/upload/:upload_id/retry', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { upload_id } = req.params;
    const { force } = req.body;

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get upload record
    const uploadResult = await query(
      `SELECT id, storage_path, original_filename, mapping_config
       FROM attendance_uploads
       WHERE id = $1 AND tenant_id = $2`,
      [upload_id, tenantId]
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    // Get failed rows
    const failedRowsResult = await query(
      `SELECT row_number, raw_data
       FROM attendance_upload_rows
       WHERE upload_id = $1 AND status = 'failed'`,
      [upload_id]
    );

    if (failedRowsResult.rows.length === 0) {
      return res.status(400).json({ error: 'No failed rows to retry' });
    }

    // Reset failed rows to pending and reprocess
    await query(
      `UPDATE attendance_upload_rows
       SET status = 'pending', error_message = NULL
       WHERE upload_id = $1 AND status = 'failed'`,
      [upload_id]
    );

    await query(
      `UPDATE attendance_uploads
       SET status = 'processing', processing_started_at = now()
       WHERE id = $1`,
      [upload_id]
    );

    // In production, re-queue the failed rows for processing
    // For now, we'll mark them as pending and they'll be processed on next run
    res.json({
      message: 'Failed rows queued for reprocessing',
      failed_rows_count: failedRowsResult.rows.length
    });
  } catch (error) {
    console.error('Retry upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to retry upload' });
  }
});

// Cancel/Stop processing for a stuck upload
router.post('/upload/:upload_id/cancel', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { upload_id } = req.params;
    
    // Check if upload exists and is in processing state
    const uploadResult = await query(
      `SELECT id, status FROM attendance_uploads WHERE id = $1`,
      [upload_id]
    );

    if (uploadResult.rows.length === 0) {
      return res.status(404).json({ error: 'Upload not found' });
    }

    const upload = uploadResult.rows[0];
    
    if (upload.status !== 'processing' && upload.status !== 'pending') {
      return res.status(400).json({ 
        error: `Cannot cancel upload with status: ${upload.status}. Only processing or pending uploads can be cancelled.` 
      });
    }

    // Update upload status to failed
    await query(
      `UPDATE attendance_uploads
       SET status = 'failed', 
           processed_at = now(),
           error_summary = $1
       WHERE id = $2`,
      [JSON.stringify({ error: 'Cancelled by user', cancelled_at: new Date().toISOString() }), upload_id]
    );

    // Mark any pending rows as failed
    await query(
      `UPDATE attendance_upload_rows
       SET status = 'failed', 
           error_message = 'Upload cancelled by user'
       WHERE upload_id = $1 AND status IN ('pending')`,
      [upload_id]
    );

    res.json({
      message: 'Upload cancelled successfully',
      upload_id: upload_id
    });
  } catch (error) {
    console.error('Cancel upload error:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel upload' });
  }
});

// Helper functions
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday as start
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function getWeekEnd(weekStart) {
  const start = new Date(weekStart);
  start.setDate(start.getDate() + 6);
  return start.toISOString().split('T')[0];
}

export default router;

