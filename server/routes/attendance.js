import express from 'express';
import multer from 'multer';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { processAttendanceUpload } from '../services/attendance-processor.js';
import { geocodeAddress, reverseGeocode } from '../services/geocoding.js';

const router = express.Router();

async function getTenantIdForUser(userId) {
  const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return tenantResult.rows[0]?.tenant_id || null;
}

async function getEmployeeIdForUser(userId, tenantId) {
  const empResult = await query(
    'SELECT id FROM employees WHERE user_id = $1 AND tenant_id = $2 LIMIT 1',
    [userId, tenantId]
  );
  return empResult.rows[0]?.id || null;
}

async function verifyEmployeeInTenant(employeeId, tenantId) {
  const empResult = await query('SELECT tenant_id FROM employees WHERE id = $1', [employeeId]);
  if (!empResult.rows.length) {
    throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
  }
  if (empResult.rows[0].tenant_id !== tenantId) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
  }
  return true;
}

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
    const { employee_id: providedEmployeeId, timestamp, type, device_id, metadata, location } = req.body || {};

    if (!timestamp || !type || !['IN', 'OUT'].includes(type)) {
      return res.status(400).json({
        error: 'Missing required fields: timestamp, type (IN/OUT)'
      });
    }

    const userTenantId = await getTenantIdForUser(req.user.id);
    if (!userTenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    let employeeId = providedEmployeeId;
    if (employeeId) {
      await verifyEmployeeInTenant(employeeId, userTenantId);
    } else {
      employeeId = await getEmployeeIdForUser(req.user.id, userTenantId);
      if (!employeeId) {
        return res.status(404).json({ error: 'Employee record not found for current user' });
      }
    }

    const punchTime = new Date(timestamp);
    if (isNaN(punchTime.getTime())) {
      return res.status(400).json({ error: 'Invalid timestamp format' });
    }

    const geoPayload = location && typeof location === 'object'
      ? {
          lat: typeof location.lat === 'number' ? location.lat : Number(location.lat),
          lng: typeof location.lng === 'number' ? location.lng : Number(location.lng),
          accuracy: typeof location.accuracy === 'number' ? location.accuracy : Number(location.accuracy) || null
        }
      : null;

    const metadataPayload = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      ...(geoPayload ? { location: geoPayload } : {})
    };
    const metadataJson = Object.keys(metadataPayload).length ? JSON.stringify(metadataPayload) : null;

    if (type === 'IN') {
      const openSessionResult = await query(
        `SELECT id FROM clock_punch_sessions
         WHERE tenant_id = $1 AND employee_id = $2 AND clock_out_at IS NULL
         LIMIT 1`,
        [userTenantId, employeeId]
      );

      if (openSessionResult.rows.length > 0) {
        return res.status(400).json({ error: 'Already clocked in. Please clock out before clocking in again.' });
      }
    }

    const eventResult = await query(
      `INSERT INTO attendance_events (
        tenant_id, employee_id, raw_timestamp, event_type, device_id, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id, raw_timestamp, event_type`,
      [
        userTenantId,
        employeeId,
        punchTime,
        type,
        device_id || null,
        metadataJson,
        req.user.id
      ]
    );

    const event = eventResult.rows[0];
    let pairedTimesheetEntryId = null;

    if (type === 'IN') {
      await query(
        `INSERT INTO clock_punch_sessions (
          tenant_id, employee_id, in_event_id, clock_in_at, device_in, geo_in, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7::jsonb, '{}'::jsonb))`,
        [
          userTenantId,
          employeeId,
          event.id,
          punchTime,
          device_id || null,
          geoPayload ? JSON.stringify(geoPayload) : null,
          metadataJson
        ]
      );
    }

    if (type === 'OUT') {
      const inEventResult = await query(
        `SELECT id, raw_timestamp
         FROM attendance_events
         WHERE employee_id = $1
           AND event_type = 'IN'
           AND paired_timesheet_entry_id IS NULL
           AND DATE(raw_timestamp) = DATE($2)
         ORDER BY raw_timestamp DESC
         LIMIT 1`,
        [employeeId, punchTime]
      );

      if (inEventResult.rows.length > 0) {
        const inEvent = inEventResult.rows[0];
        const startTime = new Date(inEvent.raw_timestamp);
        const endTime = punchTime;
        const workDate = startTime.toISOString().split('T')[0];
        const totalHours = Math.max(0, (endTime - startTime) / (1000 * 60 * 60));

        const weekStart = getWeekStart(workDate);
        const weekEnd = getWeekEnd(weekStart);

        let timesheetResult = await query(
          `SELECT id FROM timesheets 
           WHERE employee_id = $1 AND week_start_date = $2`,
          [employeeId, weekStart]
        );

        let timesheetId;
        if (timesheetResult.rows.length === 0) {
          const newTimesheetResult = await query(
            `INSERT INTO timesheets (employee_id, week_start_date, week_end_date, total_hours, tenant_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [employeeId, weekStart, weekEnd, 0, userTenantId]
          );
          timesheetId = newTimesheetResult.rows[0].id;
        } else {
          timesheetId = timesheetResult.rows[0].id;
        }

        const entryResult = await query(
          `INSERT INTO timesheet_entries (
            timesheet_id, employee_id, work_date, hours, tenant_id, source, 
            attendance_event_id, start_time_utc, end_time_utc, payroll_status, description
          )
          VALUES ($1, $2, $3, $4, $5, 'api', $6, $7, $8, 'pending_for_payroll', 'Punch In/Out')
          RETURNING id`,
          [
            timesheetId,
            employeeId,
            workDate,
            totalHours,
            userTenantId,
            event.id,
            startTime,
            endTime
          ]
        );

        pairedTimesheetEntryId = entryResult.rows[0].id;

        await query(
          'UPDATE attendance_events SET paired_timesheet_entry_id = $1 WHERE id IN ($2, $3)',
          [pairedTimesheetEntryId, inEvent.id, event.id]
        );

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

        const durationMinutes = Math.max(1, Math.round((endTime - startTime) / (1000 * 60)));
        const sessionUpdate = await query(
          `WITH open_session AS (
            SELECT id FROM clock_punch_sessions
            WHERE tenant_id = $1 AND employee_id = $2 AND clock_out_at IS NULL
            ORDER BY clock_in_at DESC
            LIMIT 1
          )
          UPDATE clock_punch_sessions cps
          SET out_event_id = $3,
              clock_out_at = $4,
              duration_minutes = $5,
              device_out = $6,
              geo_out = $7::jsonb,
              timesheet_entry_id = $8,
              updated_at = now()
          FROM open_session
          WHERE cps.id = open_session.id
          RETURNING cps.id`,
          [
            userTenantId,
            employeeId,
            event.id,
            endTime,
            durationMinutes,
            device_id || null,
            geoPayload ? JSON.stringify(geoPayload) : null,
            pairedTimesheetEntryId
          ]
        );

        if (!sessionUpdate.rows.length) {
          await query(
            `INSERT INTO clock_punch_sessions (
              tenant_id, employee_id, in_event_id, out_event_id,
              clock_in_at, clock_out_at, duration_minutes, device_in, device_out,
              geo_in, geo_out, metadata, timesheet_entry_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, COALESCE($12::jsonb, '{}'::jsonb), $13)`,
            [
              userTenantId,
              employeeId,
              inEvent.id,
              event.id,
              startTime,
              endTime,
              durationMinutes,
              null,
              device_id || null,
              null,
              geoPayload ? JSON.stringify(geoPayload) : null,
              metadataJson,
              pairedTimesheetEntryId
            ]
          );
        }
      }
    }

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
    const status = error.statusCode || 500;
    console.error('Punch API error:', error);
    res.status(status).json({ error: error.message || 'Failed to process punch' });
  }
});

router.get('/punch/status', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const employeeId = await getEmployeeIdForUser(req.user.id, tenantId);
    if (!employeeId) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    const [openSessionResult, sessionsResult, lastEventResult, settingsResult] = await Promise.all([
      query(
        `SELECT * FROM clock_punch_sessions
         WHERE tenant_id = $1 AND employee_id = $2 AND clock_out_at IS NULL
         ORDER BY clock_in_at DESC
         LIMIT 1`,
        [tenantId, employeeId]
      ),
      query(
        `SELECT *
         FROM clock_punch_sessions
         WHERE tenant_id = $1 AND employee_id = $2
         ORDER BY clock_in_at DESC
         LIMIT 50`,
        [tenantId, employeeId]
      ),
      query(
        `SELECT id, raw_timestamp, event_type, device_id
         FROM attendance_events
         WHERE tenant_id = $1 AND employee_id = $2
         ORDER BY raw_timestamp DESC
         LIMIT 1`,
        [tenantId, employeeId]
      ),
      query(
        `SELECT capture_method, enable_geofence, enable_kiosk
         FROM org_attendance_settings
         WHERE org_id = $1`,
        [tenantId]
      )
    ]);

    const settings = settingsResult.rows[0] || {};
    const captureMethod = settings.capture_method || 'timesheets';
    const isClockMode = captureMethod === 'clock_in_out';

    res.json({
      tenant_id: tenantId,
      employee_id: employeeId,
      capture_method: captureMethod,
      enable_geofence: Boolean(settings.enable_geofence),
      enable_kiosk: Boolean(settings.enable_kiosk),
      is_clock_mode: isClockMode,
      is_clocked_in: openSessionResult.rows.length > 0,
      open_session: openSessionResult.rows[0] || null,
      sessions: sessionsResult.rows,
      last_event: lastEventResult.rows[0] || null
    });
  } catch (error) {
    console.error('Punch status error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch punch status' });
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

// POST /api/attendance/clock
// New clock in/out API with geolocation, address capture, and WFO/WFH determination
// Feature flag: multi_branch_attendance_v1 (optional - enabled by default)
router.post('/clock', authenticateToken, punchRateLimit, async (req, res) => {
  try {
    // Check feature flag (default to enabled if not set)
    const featureFlag = process.env.MULTI_BRANCH_ATTENDANCE_V1 !== 'false';
    if (!featureFlag) {
      // Fallback to old endpoint
      return res.status(404).json({ error: 'Feature not enabled' });
    }

    const {
      employee_id: providedEmployeeId,
      action, // 'IN' or 'OUT'
      ts, // ISO8601 timestamp
      lat,
      lon,
      address_text,
      capture_method = 'unknown', // 'geo', 'manual', 'kiosk', 'unknown'
      consent = false,
      device_id
    } = req.body;

    if (!action || !['IN', 'OUT'].includes(action)) {
      return res.status(400).json({ error: 'action must be "IN" or "OUT"' });
    }

    if (!ts) {
      return res.status(400).json({ error: 'ts (timestamp) is required' });
    }

    const userTenantId = await getTenantIdForUser(req.user.id);
    if (!userTenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    let employeeId = providedEmployeeId;
    if (employeeId) {
      await verifyEmployeeInTenant(employeeId, userTenantId);
    } else {
      employeeId = await getEmployeeIdForUser(req.user.id, userTenantId);
      if (!employeeId) {
        return res.status(404).json({ error: 'Employee record not found for current user' });
      }
    }

    const punchTime = new Date(ts);
    if (isNaN(punchTime.getTime())) {
      return res.status(400).json({ error: 'Invalid timestamp format' });
    }

    // Get employee's current assignment to determine home branch
    const assignmentResult = await query(
      `SELECT branch_id, org_id
       FROM employee_assignments
       WHERE employee_id = $1
         AND is_home = true
         AND (end_date IS NULL OR end_date >= CURRENT_DATE)
       ORDER BY start_date DESC
       LIMIT 1`,
      [employeeId]
    );

    const orgId = userTenantId;
    let resolvedLat = lat ? parseFloat(lat) : null;
    let resolvedLon = lon ? parseFloat(lon) : null;
    let resolvedAddress = address_text || null;

    // Geocode if we have address but no coordinates
    if (!resolvedLat || !resolvedLon) {
      if (resolvedAddress) {
        try {
          const geocoded = await geocodeAddress(resolvedAddress);
          resolvedLat = geocoded.lat;
          resolvedLon = geocoded.lon;
          resolvedAddress = geocoded.formatted_address || resolvedAddress;
        } catch (error) {
          console.warn('Geocoding failed:', error.message);
          // Continue without coordinates
        }
      }
    }

    // Reverse geocode if we have coordinates but no address
    if (resolvedLat && resolvedLon && !resolvedAddress) {
      try {
        resolvedAddress = await reverseGeocode(resolvedLat, resolvedLon);
      } catch (error) {
        console.warn('Reverse geocoding failed:', error.message);
        resolvedAddress = `${resolvedLat}, ${resolvedLon}`;
      }
    }

    // Resolve branch from coordinates using geofences
    let resolvedBranchId = null;
    let workType = 'WFH'; // Default to WFH

    if (resolvedLat && resolvedLon) {
      const branchResult = await query(
        `SELECT resolve_branch_from_coords($1, $2, $3) as branch_id`,
        [resolvedLat, resolvedLon, orgId]
      );
      resolvedBranchId = branchResult.rows[0]?.branch_id || null;

      if (resolvedBranchId) {
        workType = 'WFO';
      }
    }

    const consentTs = consent ? new Date() : null;

    // Validate capture_method
    const validCaptureMethods = ['geo', 'manual', 'kiosk', 'unknown'];
    const finalCaptureMethod = validCaptureMethods.includes(capture_method) ? capture_method : 'unknown';

    // Check for open session if clocking in
    if (action === 'IN') {
      const openSessionResult = await query(
        `SELECT id FROM clock_punch_sessions
         WHERE tenant_id = $1 AND employee_id = $2 AND clock_out_at IS NULL
         LIMIT 1`,
        [userTenantId, employeeId]
      );

      if (openSessionResult.rows.length > 0) {
        return res.status(400).json({ error: 'Already clocked in. Please clock out before clocking in again.' });
      }
    }

    // Create attendance event
    const eventResult = await query(
      `INSERT INTO attendance_events (
        tenant_id, employee_id, raw_timestamp, event_type, device_id,
        lat, lon, address_text, capture_method, consent, consent_ts,
        work_location_branch_id, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id, raw_timestamp, event_type`,
      [
        userTenantId,
        employeeId,
        punchTime,
        action,
        device_id || null,
        resolvedLat,
        resolvedLon,
        resolvedAddress,
        finalCaptureMethod,
        consent,
        consentTs,
        resolvedBranchId,
        req.user.id
      ]
    );

    const event = eventResult.rows[0];
    let pairedTimesheetEntryId = null;

    // Update work_type on the event
    await query(
      `UPDATE attendance_events SET work_type = $1 WHERE id = $2`,
      [workType, event.id]
    );

    // Handle clock in
    if (action === 'IN') {
      await query(
        `INSERT INTO clock_punch_sessions (
          tenant_id, employee_id, in_event_id, clock_in_at, device_in,
          lat_in, lon_in, address_text_in, capture_method_in,
          consent_in, consent_ts_in, work_location_branch_id, work_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          userTenantId,
          employeeId,
          event.id,
          punchTime,
          device_id || null,
          resolvedLat,
          resolvedLon,
          resolvedAddress,
          finalCaptureMethod,
          consent,
          consentTs,
          resolvedBranchId,
          workType
        ]
      );
    }

    // Handle clock out
    if (action === 'OUT') {
      const inEventResult = await query(
        `SELECT id, raw_timestamp
         FROM attendance_events
         WHERE employee_id = $1
           AND event_type = 'IN'
           AND paired_timesheet_entry_id IS NULL
           AND DATE(raw_timestamp) = DATE($2)
         ORDER BY raw_timestamp DESC
         LIMIT 1`,
        [employeeId, punchTime]
      );

      if (inEventResult.rows.length > 0) {
        const inEvent = inEventResult.rows[0];
        const startTime = new Date(inEvent.raw_timestamp);
        const endTime = punchTime;
        const workDate = startTime.toISOString().split('T')[0];
        const totalHours = Math.max(0, (endTime - startTime) / (1000 * 60 * 60));

        const weekStart = getWeekStart(workDate);
        const weekEnd = getWeekEnd(weekStart);

        let timesheetResult = await query(
          `SELECT id FROM timesheets 
           WHERE employee_id = $1 AND week_start_date = $2`,
          [employeeId, weekStart]
        );

        let timesheetId;
        if (timesheetResult.rows.length === 0) {
          const newTimesheetResult = await query(
            `INSERT INTO timesheets (employee_id, week_start_date, week_end_date, total_hours, tenant_id)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id`,
            [employeeId, weekStart, weekEnd, 0, userTenantId]
          );
          timesheetId = newTimesheetResult.rows[0].id;
        } else {
          timesheetId = timesheetResult.rows[0].id;
        }

        const entryResult = await query(
          `INSERT INTO timesheet_entries (
            timesheet_id, employee_id, work_date, hours, tenant_id, source, 
            attendance_event_id, start_time_utc, end_time_utc, payroll_status, description
          )
          VALUES ($1, $2, $3, $4, $5, 'api', $6, $7, $8, 'pending_for_payroll', 'Punch In/Out')
          RETURNING id`,
          [
            timesheetId,
            employeeId,
            workDate,
            totalHours,
            userTenantId,
            event.id,
            startTime,
            endTime
          ]
        );

        pairedTimesheetEntryId = entryResult.rows[0].id;

        await query(
          'UPDATE attendance_events SET paired_timesheet_entry_id = $1 WHERE id IN ($2, $3)',
          [pairedTimesheetEntryId, inEvent.id, event.id]
        );

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

        const durationMinutes = Math.max(1, Math.round((endTime - startTime) / (1000 * 60)));
        
        // Update clock_punch_sessions
        const sessionUpdate = await query(
          `WITH open_session AS (
            SELECT id FROM clock_punch_sessions
            WHERE tenant_id = $1 AND employee_id = $2 AND clock_out_at IS NULL
            ORDER BY clock_in_at DESC
            LIMIT 1
          )
          UPDATE clock_punch_sessions cps
          SET out_event_id = $3,
              clock_out_at = $4,
              duration_minutes = $5,
              device_out = $6,
              lat_out = $7,
              lon_out = $8,
              address_text_out = $9,
              capture_method_out = $10,
              consent_out = $11,
              consent_ts_out = $12,
              work_location_branch_id = $13,
              work_type = $14,
              timesheet_entry_id = $15,
              updated_at = now()
          FROM open_session
          WHERE cps.id = open_session.id
          RETURNING cps.id`,
          [
            userTenantId,
            employeeId,
            event.id,
            endTime,
            durationMinutes,
            device_id || null,
            resolvedLat,
            resolvedLon,
            resolvedAddress,
            finalCaptureMethod,
            consent,
            consentTs,
            resolvedBranchId,
            workType,
            pairedTimesheetEntryId
          ]
        );

        if (!sessionUpdate.rows.length) {
          // Create session if it doesn't exist
          await query(
            `INSERT INTO clock_punch_sessions (
              tenant_id, employee_id, in_event_id, out_event_id,
              clock_in_at, clock_out_at, duration_minutes,
              device_in, device_out,
              lat_in, lon_in, address_text_in, capture_method_in,
              lat_out, lon_out, address_text_out, capture_method_out,
              consent_in, consent_ts_in, consent_out, consent_ts_out,
              work_location_branch_id, work_type, timesheet_entry_id
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)`,
            [
              userTenantId,
              employeeId,
              inEvent.id,
              event.id,
              startTime,
              endTime,
              durationMinutes,
              null,
              device_id || null,
              null,
              null,
              null,
              null,
              resolvedLat,
              resolvedLon,
              resolvedAddress,
              finalCaptureMethod,
              false,
              null,
              consent,
              consentTs,
              resolvedBranchId,
              workType,
              pairedTimesheetEntryId
            ]
          );
        }
      }
    }

    // Emit event for analytics (placeholder - can be extended with event emitter)
    // Event: attendance.clocked

    // Audit log
    await query(
      `INSERT INTO attendance_audit_logs (tenant_id, actor_id, action, object_type, object_id, details)
       VALUES ($1, $2, 'clock_${action.toLowerCase()}', 'attendance_event', $3, $4)`,
      [
        userTenantId,
        req.user.id,
        event.id,
        JSON.stringify({
          action,
          work_type: workType,
          resolved_branch_id: resolvedBranchId,
          capture_method: finalCaptureMethod,
          consent,
          has_coordinates: !!(resolvedLat && resolvedLon)
        })
      ]
    );

    res.json({
      status: 'ok',
      entry_id: event.id,
      work_type: workType,
      resolved_branch_id: resolvedBranchId,
      message: action === 'IN'
        ? `Clocked in - ${workType}`
        : `Clocked out - ${workType}`
    });
  } catch (error) {
    const status = error.statusCode || 500;
    console.error('Clock API error:', error);
    res.status(status).json({ error: error.message || 'Failed to process clock action' });
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

