import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, queryWithOrg } from '../db/pool.js';
import { rebuildSegmentsForEmployee } from '../services/assignment-segmentation.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { createJoiningEvent, createHikeEvent } from '../utils/employee-events.js';
import { audit } from '../utils/auditLog.js';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { sendInviteEmail } from '../services/email.js';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

const assignmentSelectFragment = `
  COALESCE((
    SELECT json_build_object(
      'assignment_id', ea.id,
      'branch_id', ea.branch_id,
      'branch_name', ob.name,
      'department_id', ea.department_id,
      'department_name', dept.name,
      'team_id', ea.team_id,
      'team_name', team.name,
      'pay_group_id', pg.id,
      'pay_group_name', pg.name,
      'timezone', ob.timezone,
      'holiday_calendar_id', ob.holiday_calendar_id,
      'is_home', ea.is_home,
      'fte', ea.fte,
      'role', ea.role,
      'start_date', ea.start_date,
      'end_date', ea.end_date
    )
    FROM employee_assignments ea
    LEFT JOIN org_branches ob ON ob.id = ea.branch_id
    LEFT JOIN departments dept ON dept.id = ea.department_id
    LEFT JOIN teams team ON team.id = ea.team_id
    LEFT JOIN pay_groups pg ON pg.id = ea.pay_group_id
    WHERE ea.employee_id = e.id
    ORDER BY ea.is_home DESC, ea.start_date DESC NULLS LAST
    LIMIT 1
  ), '{}'::json) as home_assignment,
  COALESCE((
    SELECT json_agg(json_build_object(
      'assignment_id', ea.id,
      'branch_id', ea.branch_id,
      'branch_name', ob.name,
      'department_id', ea.department_id,
      'department_name', dept.name,
      'team_id', ea.team_id,
      'team_name', team.name,
      'is_home', ea.is_home,
      'fte', ea.fte,
      'role', ea.role,
      'start_date', ea.start_date,
      'end_date', ea.end_date
    ) ORDER BY ea.is_home DESC, ea.start_date DESC NULLS LAST)
    FROM employee_assignments ea
    LEFT JOIN org_branches ob ON ob.id = ea.branch_id
    LEFT JOIN departments dept ON dept.id = ea.department_id
    LEFT JOIN teams team ON team.id = ea.team_id
    WHERE ea.employee_id = e.id
  ), '[]'::json) as assignments
`;

// Profile change request routes
router.post('/profile/requests', authenticateToken, async (req, res) => {
  try {
    const { changes, reason } = req.body;
    if (!changes || typeof changes !== 'object' || Object.keys(changes).length === 0) {
      return res.status(400).json({ error: 'changes object required' });
    }

    const employeeResult = await query(
      'SELECT id, tenant_id FROM employees WHERE user_id = $1',
      [req.user.id]
    );
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee record not found' });
    }
    const employeeId = employeeResult.rows[0].id;

    const requestInsert = await query(
      `INSERT INTO profile_change_requests (
        employee_id, tenant_id, changed_fields, requested_by, status, reason
      ) VALUES ($1, $2, $3, $4, 'pending', $5)
      RETURNING id, status`,
      [
        employeeId,
        employeeResult.rows[0].tenant_id,
        JSON.stringify(changes),
        req.user.id,
        reason || null,
      ]
    );

    res.json(requestInsert.rows[0]);
  } catch (error) {
    console.error('Profile change request error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit request' });
  }
});

router.get('/profile/requests', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = tenantResult.rows[0]?.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const requests = await query(
      `SELECT 
        r.id,
        r.employee_id,
        r.changed_fields,
        r.status,
        r.reason,
        r.created_at,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) AS employee_profile
       FROM profile_change_requests r
       JOIN employees e ON e.id = r.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE r.tenant_id = $1
       ORDER BY r.created_at DESC
       LIMIT 100`,
      [tenantId]
    );

    res.json(requests.rows);
  } catch (error) {
    console.error('List profile change requests error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch requests' });
  }
});

router.post('/profile/requests/:id/review', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { action, note } = req.body;
    if (!['approve', 'deny'].includes(action)) {
      return res.status(400).json({ error: 'action must be approve or deny' });
    }

    const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = tenantResult.rows[0]?.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    await query('BEGIN');
    try {
      const requestResult = await query(
        `SELECT * FROM profile_change_requests WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId]
      );
      if (requestResult.rows.length === 0) {
        await query('ROLLBACK');
        return res.status(404).json({ error: 'Request not found' });
      }
      const request = requestResult.rows[0];
      if (request.status !== 'pending') {
        await query('ROLLBACK');
        return res.status(400).json({ error: 'Request already processed' });
      }

      if (action === 'approve') {
        const changedFields = request.changed_fields || {};
        const allowedFields = ['first_name', 'last_name', 'email', 'phone', 'work_location'];
        const updates = [];
        const params = [];
        let paramIndex = 1;

        Object.entries(changedFields).forEach(([key, value]) => {
          if (allowedFields.includes(key)) {
            updates.push(`${key} = $${paramIndex++}`);
            params.push(value);
          }
        });

        if (updates.length > 0) {
          params.push(request.employee_id);
          await query(
            `UPDATE employees
             SET ${updates.join(', ')}, updated_at = now()
             WHERE id = $${params.length}`,
            params
          );
        }
      }

      await query(
        `UPDATE profile_change_requests
         SET status = $1,
             reviewed_by = $2,
             reviewed_at = now(),
             review_note = $3
         WHERE id = $4`,
        [action === 'approve' ? 'approved' : 'denied', req.user.id, note || null, id]
      );

      await query('COMMIT');
      res.json({ id, status: action === 'approve' ? 'approved' : 'denied' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Review profile change request error:', error);
    res.status(500).json({ error: error.message || 'Failed to review request' });
  }
});

// Get all employees
router.get('/', authenticateToken, async (req, res) => {
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

    let employeesQuery;
    const params = [tenantId];

    // If manager, only show their team
    if (req.user.role === 'manager') {
      const managerResult = await query(
        'SELECT id FROM employees WHERE user_id = $1',
        [req.user.id]
      );
      
      if (managerResult.rows.length > 0) {
        const managerId = managerResult.rows[0].id;
        employeesQuery = `
          SELECT 
            e.*,
            CASE 
              WHEN e.onboarding_status IS NULL OR e.onboarding_status != 'completed' THEN 'waiting_for_onboarding'
              ELSE e.presence_status
            END as display_presence_status,
            json_build_object(
              'first_name', p.first_name,
              'last_name', p.last_name,
              'email', p.email,
              'role', ur.role
            ) as profiles,
            ${assignmentSelectFragment}
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          LEFT JOIN user_roles ur ON ur.user_id = e.user_id
          WHERE e.tenant_id = $1 
            AND e.reporting_manager_id = $2
          ORDER BY e.created_at DESC
        `;
        params.push(managerId);
      } else {
        employeesQuery = `
          SELECT 
            e.*,
            CASE 
              WHEN e.onboarding_status IS NULL OR e.onboarding_status != 'completed' THEN 'waiting_for_onboarding'
              ELSE e.presence_status
            END as display_presence_status,
            json_build_object(
              'first_name', p.first_name,
              'last_name', p.last_name,
              'email', p.email,
              'role', ur.role
            ) as profiles,
            ${assignmentSelectFragment}
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          LEFT JOIN user_roles ur ON ur.user_id = e.user_id
          WHERE e.tenant_id = $1
          ORDER BY e.created_at DESC
        `;
      }
    } else {
      employeesQuery = `
        SELECT 
          e.*,
          CASE 
            WHEN e.onboarding_status IS NULL OR e.onboarding_status != 'completed' THEN 'waiting_for_onboarding'
            ELSE e.presence_status
          END as display_presence_status,
          json_build_object(
            'first_name', p.first_name,
            'last_name', p.last_name,
            'email', p.email,
            'role', ur.role
          ) as profiles,
          ${assignmentSelectFragment}
        FROM employees e
        JOIN profiles p ON p.id = e.user_id
        LEFT JOIN user_roles ur ON ur.user_id = e.user_id
        WHERE e.tenant_id = $1
        ORDER BY e.created_at DESC
      `;
    }

    const result = await query(employeesQuery, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get org chart structure (all active employees with profiles) - MUST be before /:id
router.get('/org-chart', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id - try multiple sources
    let tenantId = req.orgId || req.tenant_id;
    
    if (!tenantId) {
      const tenantResult = await query(
        'SELECT tenant_id FROM profiles WHERE id = $1',
        [req.user.id]
      );
      tenantId = tenantResult.rows[0]?.tenant_id;
    }

    if (!tenantId) {
      console.error('[Org Chart] No tenant_id found for user:', req.user.id);
      return res.status(403).json({ error: 'No organization found' });
    }

    console.log(`[Org Chart] Fetching org chart for tenant: ${tenantId}`);

    // Check if profile_picture_url column exists
    const columnCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'profiles' AND column_name = 'profile_picture_url'`
    );
    const hasProfilePictureColumn = columnCheck.rows.length > 0;

    // Build profiles JSON conditionally based on column existence
    const profilePictureField = hasProfilePictureColumn 
      ? `'profile_picture_url', p.profile_picture_url`
      : `'profile_picture_url', NULL::text`;

    // More inclusive status filter - include active, confirmed, and NULL status employees
    // Exclude only terminated, on_hold, and resigned
    // Explicitly include user_id for profile picture RLS
    const result = await query(
      `SELECT 
        e.id,
        e.employee_id,
        e.user_id,
        e.position,
        e.department,
        e.work_location,
        e.presence_status,
        e.reporting_manager_id,
        e.status,
        e.join_date,
        e.about_me,
        e.job_love,
        e.hobbies,
        d.name as designation_name,
        NULL as designation_level,
        rl.parent_designation_id as designation_parent_id,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email,
          'phone', p.phone,
          ${profilePictureField}
        ) as profiles,
        ${assignmentSelectFragment}
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      LEFT JOIN org_designations d ON d.name = e.position AND d.organisation_id = $1
      LEFT JOIN org_reporting_lines rl ON rl.designation_id = d.id AND rl.organisation_id = $1
      WHERE e.tenant_id = $1 
        AND COALESCE(e.status, 'active') NOT IN ('terminated', 'on_hold', 'resigned')
      ORDER BY e.employee_id`,
      [tenantId]
    );

    console.log(`[Org Chart] Found ${result.rows.length} employees for tenant ${tenantId}`);
    
    // Log sample employee data to verify user_id and profile_picture_url are included
    if (result.rows.length > 0) {
      const sample = result.rows[0];
      console.log(`[Org Chart] Sample employee:`, {
        id: sample.id,
        employee_id: sample.employee_id,
        user_id: sample.user_id,
        has_profiles: !!sample.profiles,
        profile_picture_url: sample.profiles?.profile_picture_url || 'NOT SET',
        first_name: sample.profiles?.first_name
      });
    }
    
    // Log sample if no results
    if (result.rows.length === 0) {
      const debugResult = await query(
        `SELECT COUNT(*) as total, 
                COUNT(CASE WHEN COALESCE(status, 'active') NOT IN ('terminated', 'on_hold', 'resigned') THEN 1 END) as active_count
         FROM employees 
         WHERE tenant_id = $1`,
        [tenantId]
      );
      console.log(`[Org Chart] Debug - Total employees: ${debugResult.rows[0].total}, Active: ${debugResult.rows[0].active_count}`);
    }

    res.json(result.rows);
  } catch (error) {
    console.error('[Org Chart] Error fetching org chart:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch organization chart' });
  }
});

// Profile picture upload endpoint
router.post('/profile-picture/upload', authenticateToken, async (req, res) => {
  try {
    const { url, key } = req.body;
    const userId = req.user.id;

    if (!url || !key) {
      return res.status(400).json({ error: 'url and key are required' });
    }

    // Get user's tenant_id for RLS
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Verify the key belongs to this user's tenant (RLS check)
    const keyPrefix = tenantId ? `tenants/${tenantId}/profile-pictures/${userId}` : `profile-pictures/${userId}`;
    if (!key.startsWith(keyPrefix)) {
      return res.status(403).json({ error: 'Unauthorized: Invalid file path' });
    }

    // Check if profile_picture_url column exists, create if not
    const columnCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'profiles' AND column_name = 'profile_picture_url'`
    );
    
    if (columnCheck.rows.length === 0) {
      // Create the column if it doesn't exist
      await query(`
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;
      `).catch((err) => {
        console.error('Error creating profile_picture_url column:', err);
        return res.status(500).json({ 
          error: 'Failed to initialize profile picture feature',
          migration_required: true 
        });
      });
    }

    // Construct public URL (use presigned URL or public bucket URL)
    const minioPublicUrl = process.env.MINIO_PUBLIC_URL || process.env.MINIO_ENDPOINT?.replace('minio:', 'localhost:') || 'http://localhost:9000';
    // Use the same bucket priority as storage.js for consistency
    const bucket = process.env.MINIO_BUCKET_ONBOARDING || 
                   process.env.DOCS_STORAGE_BUCKET || 
                   process.env.MINIO_BUCKET || 
                   'hr-onboarding-docs';
    const publicUrl = `${minioPublicUrl}/${bucket}/${key}`;

    // Ensure profile_picture_url column exists before updating
    try {
      await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_picture_url TEXT');
    } catch (err) {
      // Ignore if column already exists
    }

    // Update profile with picture URL - ensure organization scoping
    const updateResult = await query(
      `UPDATE profiles 
       SET profile_picture_url = $1, updated_at = now() 
       WHERE id = $2 AND tenant_id = $3 
       RETURNING id, profile_picture_url, tenant_id`,
      [publicUrl, userId, tenantId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found or access denied' });
    }

    res.json({
      success: true, 
      profile_picture_url: updateResult.rows[0].profile_picture_url || publicUrl,
      message: 'Profile picture uploaded successfully' 
    });
  } catch (error) {
    console.error('Error uploading profile picture:', error);
    res.status(500).json({ error: error.message || 'Failed to upload profile picture' });
  }
});

// Get presigned URL for profile picture upload
router.post('/profile-picture/presign', authenticateToken, async (req, res) => {
  try {
    const { contentType } = req.body;
    const userId = req.user.id;

    if (!contentType || !contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'Invalid content type. Only images are allowed.' });
    }

    // Get user's tenant_id for RLS
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Import storage functions
    const { getPresignedPutUrl, getStorageProvider } = await import('../services/storage.js');
    
    // Check if S3/MinIO is available
    const storageProvider = getStorageProvider();
    if (storageProvider !== 's3') {
      return res.status(400).json({ 
        error: 'S3/MinIO storage is not configured. Please configure MinIO environment variables to enable profile picture uploads.',
        storage_provider: storageProvider,
        requires_s3: true,
        message: 'MinIO is required for profile picture uploads. Please set MINIO_ENABLED=true and configure MinIO credentials.'
      });
    }
    
    // Generate object key with tenant isolation (RLS)
    const ext = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'jpg';
    const fileName = `${Date.now()}_${crypto.randomUUID()}.${ext}`;
    const objectKey = `tenants/${tenantId}/profile-pictures/${userId}/${fileName}`;

    // Generate presigned URL (5 minute expiry)
    const url = await getPresignedPutUrl({
      objectKey,
      contentType,
      expiresIn: 300, // 5 minutes
    });

    res.json({
      url,
      key: objectKey,
      expiresIn: 300,
    });
  } catch (error) {
    console.error('Error generating presigned URL for profile picture:', error);
    res.status(500).json({ error: error.message || 'Failed to generate upload URL' });
  }
});

// Get presigned URL for viewing profile picture
router.get('/profile-picture/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const requesterUserId = req.user.id;

    // Ensure profile_picture_url column exists
    try {
      await query('ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_picture_url TEXT');
    } catch (err) {
      // Ignore if column already exists
    }

    // Get requester's tenant_id for organization scoping
    const requesterResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [requesterUserId]
    );
    const requesterTenantId = requesterResult.rows[0]?.tenant_id;

    if (!requesterTenantId) {
      return res.status(403).json({ error: 'No organization found for requester' });
    }

    // Get the profile picture URL from database - ensure organization scoping
    let profileResult = await query(
      `SELECT profile_picture_url, tenant_id 
       FROM profiles 
       WHERE id = $1 AND tenant_id = $2`,
      [userId, requesterTenantId]
    );

    // If no profile found by userId, treat param as an employee_id and resolve to profile
    if (!profileResult.rows.length) {
      const empProfileResult = await query(
        `SELECT p.profile_picture_url, p.tenant_id
         FROM employees e
         JOIN profiles p ON p.id = e.user_id
         WHERE e.id = $1 AND e.tenant_id = $2`,
        [userId, requesterTenantId]
      );

      if (empProfileResult.rows.length) {
        profileResult = empProfileResult;
      }
    }

    if (!profileResult.rows.length) {
      // Check if profile exists but in different tenant (for better error message)
      const anyProfileResult = await query(
        'SELECT id, tenant_id FROM profiles WHERE id = $1',
        [userId]
      );
      
      if (anyProfileResult.rows.length > 0) {
        console.warn(`Profile ${userId} exists but belongs to different tenant. Requester tenant: ${requesterTenantId}`);
        return res.status(403).json({ error: 'Access denied: Profile belongs to different organization' });
      }
      
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profile = profileResult.rows[0];
    
    if (!profile.profile_picture_url) {
      // Return 404 but with a more specific message
      return res.status(404).json({ error: 'No profile picture found', has_profile: true });
    }

    // Extract object key from the stored URL
    // URL format: http://localhost:9000/bucket/tenants/.../profile-pictures/.../filename.png
    // Or: http://localhost:9000/hr-onboarding-docs/tenants/.../profile-pictures/.../filename.png
    let key = null;
    const urlParts = profile.profile_picture_url.split('/');
    
    // Try to find the bucket name first
    const bucketNames = ['hr-onboarding-docs', 'docshr', 'onboarding-docs'];
    let bucketIndex = -1;
    let bucketName = null;
    
    for (const bucket of bucketNames) {
      const idx = urlParts.findIndex(part => part === bucket || part.includes(bucket));
      if (idx !== -1) {
        bucketIndex = idx;
        bucketName = urlParts[idx];
        break;
      }
    }
    
    // If bucket found, extract key (everything after bucket)
    if (bucketIndex !== -1) {
      key = urlParts.slice(bucketIndex + 1).join('/');
    } else {
      // Try to find 'tenants' as a fallback
      const tenantsIndex = urlParts.findIndex(part => part === 'tenants');
      if (tenantsIndex !== -1) {
        key = urlParts.slice(tenantsIndex).join('/');
      } else {
        // Last resort: try to extract from common patterns
        const lastSlashIndex = profile.profile_picture_url.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
          const possibleKey = profile.profile_picture_url.substring(
            profile.profile_picture_url.indexOf('/tenants/') !== -1 
              ? profile.profile_picture_url.indexOf('/tenants/') + 1
              : profile.profile_picture_url.indexOf('/profile-pictures/') !== -1
              ? profile.profile_picture_url.indexOf('/profile-pictures/') + 1
              : lastSlashIndex
          );
          if (possibleKey.includes('tenants/') || possibleKey.includes('profile-pictures/')) {
            key = possibleKey;
          }
        }
      }
    }
    
    if (!key) {
      console.error('Could not extract key from URL:', profile.profile_picture_url);
      return res.status(400).json({ error: 'Invalid profile picture URL format', url: profile.profile_picture_url });
    }

    // Import storage functions
    const { getPresignedGetUrl, getStorageProvider } = await import('../services/storage.js');
    
    // Check if S3/MinIO is available
    const storageProvider = getStorageProvider();
    if (storageProvider !== 's3') {
      return res.status(400).json({ 
        error: 'S3/MinIO storage is not configured.',
        storage_provider: storageProvider,
      });
    }

    // Generate presigned GET URL (1 hour expiry for viewing)
    const presignedUrl = await getPresignedGetUrl({
      objectKey: key,
      expiresIn: 3600, // 1 hour
    });

    res.json({
      url: presignedUrl,
      expiresIn: 3600,
    });
  } catch (error) {
    console.error('Error generating presigned GET URL:', error);
    res.status(500).json({ error: error.message || 'Failed to generate presigned URL' });
  }
});

// Check if employee needs to change password
router.get('/check-password-change', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, must_change_password, onboarding_status FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.json({ must_change_password: false, onboarding_status: null });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error checking password change:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single employee by ID - MUST be after specific routes like /org-chart and /check-password-change
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get user's tenant_id for authorization
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const userTenantId = tenantResult.rows[0]?.tenant_id;
    
    if (!userTenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    
    // Check if verified_by column exists
    const verifiedByCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'employees' AND column_name = 'verified_by'`
    );
    const hasVerifiedBy = verifiedByCheck.rows.length > 0;

    // Check if profile_picture_url column exists
    const profilePicCheck = await query(
      `SELECT column_name 
       FROM information_schema.columns 
       WHERE table_name = 'profiles' AND column_name = 'profile_picture_url'`
    );
    const hasProfilePictureColumn = profilePicCheck.rows.length > 0;

    // Build query conditionally based on column existence
    const verifiedByJoin = hasVerifiedBy 
      ? `LEFT JOIN profiles vb ON vb.id = e.verified_by`
      : '';
    const verifiedBySelect = hasVerifiedBy
      ? `json_build_object(
          'id', vb.id,
          'first_name', vb.first_name,
          'last_name', vb.last_name
        ) as verified_by_profile`
      : `NULL::jsonb as verified_by_profile`;

    // Build profiles JSON conditionally based on column existence
    const profilePictureField = hasProfilePictureColumn 
      ? `'profile_picture_url', p.profile_picture_url`
      : `'profile_picture_url', NULL::text`;

    // Get employee with profile data, reporting manager info, and organization info
    const employeeResult = await query(
      `SELECT 
        e.*,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email,
          'phone', p.phone,
          ${profilePictureField}
        ) as profiles,
        json_build_object(
          'id', mgr_e.id,
          'employee_id', mgr_e.employee_id,
          'first_name', mgr_p.first_name,
          'last_name', mgr_p.last_name,
          'email', mgr_p.email,
          'position', mgr_e.position,
          'department', mgr_e.department
        ) as reporting_manager,
        json_build_object(
          'name', o.name,
          'domain', o.domain
        ) as organization,
        ${verifiedBySelect}
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      LEFT JOIN employees mgr_e ON mgr_e.id = e.reporting_manager_id
      LEFT JOIN profiles mgr_p ON mgr_p.id = mgr_e.user_id
      LEFT JOIN organizations o ON o.id = e.tenant_id
      ${verifiedByJoin}
      WHERE e.id = $1 AND e.tenant_id = $2`,
      [id, userTenantId]
    );
    
    if (employeeResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const employee = employeeResult.rows[0];
    
    // Get reporting team (direct reports)
    const teamResult = await query(
      `SELECT 
        e.*,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) as profiles
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      WHERE e.reporting_manager_id = $1 AND e.tenant_id = $2 AND e.status = 'active'
      ORDER BY e.employee_id`,
      [id, userTenantId]
    );
    
    employee.reporting_team = teamResult.rows;
    
    // Get onboarding data
    const onboardingResult = await query(
      `SELECT * FROM onboarding_data WHERE employee_id = $1`,
      [id]
    );
    
    if (onboardingResult.rows.length > 0) {
      employee.onboarding_data = onboardingResult.rows[0];
    }

    const probationResult = await query(
      `SELECT *
       FROM probations
       WHERE employee_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
      [id]
    );
    employee.probation = probationResult.rows[0] || null;
    
    // Get performance reviews
    const reviewsResult = await query(
      `SELECT 
        pr.*,
        json_build_object(
          'cycle_name', ac.cycle_name,
          'cycle_year', ac.cycle_year,
          'start_date', ac.start_date,
          'end_date', ac.end_date
        ) as appraisal_cycle,
        json_build_object(
          'first_name', reviewer_p.first_name,
          'last_name', reviewer_p.last_name,
          'position', reviewer_e.position
        ) as reviewer
      FROM performance_reviews pr
      LEFT JOIN appraisal_cycles ac ON ac.id = pr.appraisal_cycle_id
      LEFT JOIN employees reviewer_e ON reviewer_e.id = pr.reviewer_id
      LEFT JOIN profiles reviewer_p ON reviewer_p.id = reviewer_e.user_id
      WHERE pr.employee_id = $1 AND pr.tenant_id = $2
      ORDER BY pr.created_at DESC`,
      [id, userTenantId]
    );
    
    employee.performance_reviews = reviewsResult.rows;
    
    res.json(employee);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create employee (HR/CEO/Director/Admin only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    // Check role
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;
    
    if (!userRole || !['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    const {
      firstName,
      lastName,
      email,
      employeeId,
      department,
      position,
      workLocation,
      joinDate,
      reportingManagerId,
      role,
      homeBranchId,
      homeDepartmentId,
      homeTeamId,
      assignmentStartDate,
      assignmentRole,
      assignmentFte,
      assignmentMetadata
    } = req.body;

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Generate random password
    const tempPassword = Math.random().toString(36).slice(-8) + 
                         Math.random().toString(36).slice(-8).toUpperCase();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await query('BEGIN');

    try {
      // Create user ID
      const userIdResult = await query('SELECT gen_random_uuid() as id');
      const userId = userIdResult.rows[0].id;

      // Create profile
      await query(
        `INSERT INTO profiles (id, email, first_name, last_name, tenant_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, email, firstName, lastName, tenantId]
      );

      // Create auth record
      await query(
        `INSERT INTO user_auth (user_id, password_hash)
         VALUES ($1, $2)`,
        [userId, hashedPassword]
      );

      // Create employee record
      const empResult = await query(
        `INSERT INTO employees (
          user_id, employee_id, department, position, work_location,
          join_date, reporting_manager_id, tenant_id, must_change_password,
          onboarding_status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'not_started')
        RETURNING *`,
        [
          userId, employeeId, department, position, workLocation,
          joinDate, reportingManagerId || null, tenantId
        ]
      );
      const createdEmployee = empResult.rows[0];

      // Create JOINING event
      try {
        if (createdEmployee.join_date) {
          await createJoiningEvent(tenantId, createdEmployee.id, createdEmployee.join_date);
        }
      } catch (eventError) {
        console.error('Error creating joining event:', eventError);
        // Don't fail employee creation if event creation fails
      }

      // Create probation record based on active policy
      try {
        if (createdEmployee.join_date) {
          const { createProbationRecordForEmployee } = await import('../utils/create-probation-record.js');
          await createProbationRecordForEmployee(tenantId, createdEmployee.id, createdEmployee.join_date);
        }
      } catch (probationError) {
        console.error('Error creating probation record:', probationError);
        // Don't fail employee creation if probation creation fails
      }

      if (homeBranchId || homeDepartmentId || homeTeamId) {
        await queryWithOrg(
          `INSERT INTO employee_assignments (
            org_id, user_id, employee_id, branch_id, department_id, team_id,
            role, fte, start_date, is_home, metadata
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 1.0), COALESCE($9::date, $10::date), true, COALESCE($11::jsonb, '{}'::jsonb))`,
          [
            tenantId,
            userId,
            createdEmployee.id,
            homeBranchId || null,
            homeDepartmentId || null,
            homeTeamId || null,
            assignmentRole || position || 'Member',
            assignmentFte || 1,
            assignmentStartDate || joinDate || new Date().toISOString().slice(0, 10),
            joinDate || new Date().toISOString().slice(0, 10),
            assignmentMetadata || {}
          ],
          tenantId
        );
        await rebuildSegmentsForEmployee(tenantId, createdEmployee.id);
      }

      // Create user role
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, $2, $3)`,
        [userId, role || 'employee', tenantId]
      );

      // Create invite token and send email
      try {
        // Get org info for email (check if slug column exists)
        let orgResult;
        try {
          const columnCheck = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'organizations' AND column_name = 'slug'
          `);
          const hasSlugColumn = columnCheck.rows.length > 0;
          
          if (hasSlugColumn) {
            orgResult = await query('SELECT name, slug FROM organizations WHERE id = $1', [tenantId]);
          } else {
            orgResult = await query('SELECT name FROM organizations WHERE id = $1', [tenantId]);
            if (orgResult.rows.length > 0) {
              orgResult.rows[0].slug = null;
            }
          }
        } catch (error) {
          // Fallback if check fails
          orgResult = await query('SELECT name FROM organizations WHERE id = $1', [tenantId]);
          if (orgResult.rows.length > 0) {
            orgResult.rows[0].slug = null;
          }
        }
        
        const org = orgResult.rows[0] || { name: 'Organization', slug: null };

        // Check if invite_tokens table exists
        const tableCheck = await query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' AND table_name = 'invite_tokens'
        `);
        
        if (tableCheck.rows.length > 0) {
          // Generate invite token
          const token = crypto.randomBytes(32).toString('hex');
          const expiresAt = new Date();
          expiresAt.setHours(expiresAt.getHours() + 72); // 72 hours expiry

          // Create invite token
          await query(
            `INSERT INTO invite_tokens (org_id, email, token, expires_at)
             VALUES ($1, $2, $3, $4)`,
            [tenantId, email.toLowerCase().trim(), token, expiresAt]
          );

          // Send invite email
          try {
            await sendInviteEmail(email, org.name, org.slug || 'org', token);
            console.log(`✅ Invite email sent to ${email}`);
          } catch (emailError) {
            console.error(`⚠️  Failed to send invite email to ${email}:`, emailError);
            // Continue even if email fails - invite token is still created
          }
        } else {
          console.log(`⚠️  invite_tokens table not found. Skipping invite email for ${email}.`);
          console.log(`   Please run the migration: server/db/migrations/20241201_multi_tenant_rls.sql`);
        }
      } catch (inviteError) {
        console.error(`⚠️  Failed to create invite token for ${email}:`, inviteError);
        // Continue even if invite creation fails
      }

      await query('COMMIT');

      // Sync employee to Payroll system using sync service
      const { syncUserToPayrollWithRetry } = await import('../services/payroll-sync.js');
      
      // This will automatically create the user in Payroll with correct role mapping
      // Include employee-specific data: employeeId, department, position, joinDate
      await syncUserToPayrollWithRetry({
        hr_user_id: userId,
        email: email.toLowerCase().trim(),
        first_name: firstName,
        last_name: lastName,
        org_id: tenantId,
        role: role || 'employee',
        employee_id: employeeId,
        department: department,
        position: position, // HR uses 'position', Payroll maps to 'designation'
        join_date: joinDate // Format: YYYY-MM-DD
      }, 3); // Retry up to 3 times

      res.status(201).json({
        success: true,
        email,
        message: 'Employee created successfully. Invite email has been sent.',
        userId
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error creating employee:', error);
    res.status(500).json({ error: error.message || 'Failed to create employee' });
  }
});

// Helper: send a simple in-app notification to an employee's user account
async function sendEmployeeNotification(tenantId, employeeId, { title, message, type = 'org' }) {
  try {
    if (!tenantId || !employeeId) return;

    const empResult = await query(
      'SELECT user_id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employeeId, tenantId]
    );
    const userId = empResult.rows[0]?.user_id;
    if (!userId) return;

    await query(
      `INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [tenantId, userId, title, message, type]
    );
  } catch (error) {
    console.error('Failed to send employee notification:', error);
  }
}

// Update employee (HR/CEO only – includes assigning reporting manager)
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check role - only HR-family roles and CEO can update core employee data (including reporting manager)
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );
    const userRole = roleResult.rows[0]?.role;
    
    if (!userRole || !['hr', 'hrbp', 'hradmin', 'ceo'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
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

    // Verify employee belongs to same tenant
    const empCheck = await query(
      'SELECT tenant_id, user_id FROM employees WHERE id = $1',
      [id]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empCheck.rows[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      employeeId,
      department,
      position,
      workLocation,
      joinDate,
      reportingManagerId,
      status,
      ctc
    } = req.body;

    await query('BEGIN');

    try {
      const userId = empCheck.rows[0].user_id;

      // Update profile if provided
      if (firstName || lastName || email || phone !== undefined) {
        const profileUpdates = [];
        const profileParams = [];
        let paramIndex = 1;

        if (firstName !== undefined) {
          profileUpdates.push(`first_name = $${paramIndex++}`);
          profileParams.push(firstName);
        }
        if (lastName !== undefined) {
          profileUpdates.push(`last_name = $${paramIndex++}`);
          profileParams.push(lastName);
        }
        if (email !== undefined) {
          profileUpdates.push(`email = $${paramIndex++}`);
          profileParams.push(email);
        }
        if (phone !== undefined) {
          profileUpdates.push(`phone = $${paramIndex++}`);
          profileParams.push(phone);
        }

        if (profileUpdates.length > 0) {
          profileUpdates.push(`updated_at = now()`);
          profileParams.push(userId);
          
          await query(
            `UPDATE profiles SET ${profileUpdates.join(', ')} WHERE id = $${paramIndex}`,
            profileParams
          );
        }
      }

      // Update employee if provided
      if (employeeId || department || position || workLocation || joinDate !== undefined || reportingManagerId !== undefined || status !== undefined) {
        const employeeUpdates = [];
        const employeeParams = [];
        let paramIndex = 1;

        if (employeeId !== undefined) {
          employeeUpdates.push(`employee_id = $${paramIndex++}`);
          employeeParams.push(employeeId);
        }
        if (department !== undefined) {
          employeeUpdates.push(`department = $${paramIndex++}`);
          employeeParams.push(department);
        }
        if (position !== undefined) {
          employeeUpdates.push(`position = $${paramIndex++}`);
          employeeParams.push(position);
        }
        if (workLocation !== undefined) {
          employeeUpdates.push(`work_location = $${paramIndex++}`);
          employeeParams.push(workLocation);
        }
        if (joinDate !== undefined) {
          employeeUpdates.push(`join_date = $${paramIndex++}`);
          employeeParams.push(joinDate);
        }
        if (reportingManagerId !== undefined) {
          employeeUpdates.push(`reporting_manager_id = $${paramIndex++}`);
          employeeParams.push(reportingManagerId || null);
        }
        if (status !== undefined) {
          employeeUpdates.push(`status = $${paramIndex++}`);
          employeeParams.push(status);
        }
        if (ctc !== undefined) {
          employeeUpdates.push(`ctc = $${paramIndex++}`);
          employeeParams.push(ctc);
        }

        if (employeeUpdates.length > 0) {
          employeeUpdates.push(`updated_at = now()`);
          employeeParams.push(id);
          
          // Get old values for audit diff
          const oldEmpResult = await query(
            'SELECT position, department, ctc, status, reporting_manager_id FROM employees WHERE id = $1',
            [id]
          );
          const oldValues = oldEmpResult.rows[0] || {};
          
          await query(
            `UPDATE employees SET ${employeeUpdates.join(', ')} WHERE id = $${paramIndex}`,
            employeeParams
          );
          
          // Get new values for audit diff
          const newEmpResult = await query(
            'SELECT position, department, ctc, status, reporting_manager_id FROM employees WHERE id = $1',
            [id]
          );
          const newValues = newEmpResult.rows[0] || {};
          
          // Create audit log for employee update
          const diff = {};
          if (position !== undefined && oldValues.position !== newValues.position) {
            diff.position = { old: oldValues.position, new: newValues.position };
          }
          if (department !== undefined && oldValues.department !== newValues.department) {
            diff.department = { old: oldValues.department, new: newValues.department };
          }
          if (ctc !== undefined && oldValues.ctc !== newValues.ctc) {
            diff.ctc = { old: oldValues.ctc, new: newValues.ctc };
          }
          if (status !== undefined && oldValues.status !== newValues.status) {
            diff.status = { old: oldValues.status, new: newValues.status };
          }
          if (reportingManagerId !== undefined && oldValues.reporting_manager_id !== newValues.reporting_manager_id) {
            diff.reporting_manager_id = { old: oldValues.reporting_manager_id, new: newValues.reporting_manager_id };

            // Send notifications when reporting manager changes
            try {
              const oldMgrId = oldValues.reporting_manager_id || null;
              const newMgrId = newValues.reporting_manager_id || null;

              // Notify the employee about the change
              await sendEmployeeNotification(tenantId, id, {
                title: 'Reporting manager updated',
                message: oldMgrId && newMgrId && oldMgrId !== newMgrId
                  ? 'Your reporting manager has been changed.'
                  : newMgrId && !oldMgrId
                  ? 'A reporting manager has been assigned to you.'
                  : !newMgrId && oldMgrId
                  ? 'Your reporting manager assignment has been removed.'
                  : 'Your reporting manager details have been updated.',
                type: 'org',
              });

              // Notify the new reporting manager
              if (newMgrId && newMgrId !== oldMgrId) {
                await sendEmployeeNotification(tenantId, newMgrId, {
                  title: 'New direct report assigned',
                  message: 'You have been assigned as reporting manager for a team member.',
                  type: 'org',
                });
              }

              // Notify the previous reporting manager (if any) that they are no longer manager
              if (oldMgrId && oldMgrId !== newMgrId) {
                await sendEmployeeNotification(tenantId, oldMgrId, {
                  title: 'Reporting line updated',
                  message: 'A team member is no longer assigned to you as a direct report.',
                  type: 'org',
                });
              }
            } catch (notifyError) {
              console.error('Failed to send reporting manager change notifications:', notifyError);
            }
          }
          
          if (Object.keys(diff).length > 0) {
            try {
              await audit({
                actorId: req.user.id,
                action: 'employee_update',
                entityType: 'employee',
                entityId: id,
                diff: diff,
                details: {
                  updatedFields: Object.keys(diff),
                  employeeId: employeeId || id,
                },
                scope: 'org',
              });
            } catch (auditError) {
              console.error('Error creating audit log:', auditError);
              // Don't fail the update if audit logging fails
            }
          }
        }
      }

      await query('COMMIT');

      // Create HIKE event if CTC was updated and increased
      if (ctc !== undefined && oldCTC !== null && ctc > oldCTC) {
        try {
          await createHikeEvent(tenantId, id, {
            oldCTC: oldCTC,
            newCTC: ctc,
            effectiveDate: new Date().toISOString().split('T')[0],
            sourceTable: 'employees',
            sourceId: id,
          });
        } catch (eventError) {
          console.error('Error creating hike event:', eventError);
          // Don't fail employee update if event creation fails
        }
      }

      // Check for auto-promotion if reporting_manager_id was updated
      if (reportingManagerId !== undefined) {
        // The trigger will handle auto-promotion automatically
        // But we can also manually check if needed by counting direct reports
        const managerCheckResult = await query(
          `SELECT COUNT(*) as count FROM employees 
           WHERE reporting_manager_id = $1 AND status = 'active'`,
          [reportingManagerId]
        );
        
        if (managerCheckResult.rows[0]?.count >= 2) {
          const managerEmpResult = await query(
            'SELECT user_id, tenant_id FROM employees WHERE id = $1',
            [reportingManagerId]
          );
          if (managerEmpResult.rows.length > 0) {
            const { user_id, tenant_id } = managerEmpResult.rows[0];
            // Check if already has manager role or higher
            const roleCheck = await query(
              `SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('manager', 'hr', 'director', 'ceo', 'admin')`,
              [user_id]
            );
            if (roleCheck.rows.length === 0) {
              // Promote to manager
              await query(
                'INSERT INTO user_roles (user_id, role, tenant_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, role) DO NOTHING',
                [user_id, 'manager', tenant_id]
              );
            }
          }
        }
      }
      
      // Also check if this employee should be promoted (if they now have 2+ reports)
      const directReportsResult = await query(
        `SELECT COUNT(*) as count FROM employees 
         WHERE reporting_manager_id = $1 AND status = 'active'`,
        [id]
      );
      
      if (directReportsResult.rows[0]?.count >= 2) {
        const empCheck = await query(
          'SELECT user_id, tenant_id FROM employees WHERE id = $1',
          [id]
        );
        if (empCheck.rows.length > 0) {
          const { user_id, tenant_id } = empCheck.rows[0];
          // Check if already has manager role
          const roleCheck = await query(
            `SELECT 1 FROM user_roles WHERE user_id = $1 AND role IN ('manager', 'hr', 'director', 'ceo', 'admin')`,
            [user_id]
          );
          if (roleCheck.rows.length === 0) {
            // Promote to manager
            await query(
              'INSERT INTO user_roles (user_id, role, tenant_id) VALUES ($1, $2, $3) ON CONFLICT (user_id, role) DO NOTHING',
              [user_id, 'manager', tenant_id]
            );
          }
        }
      }

      // Fetch updated employee
      const updatedResult = await query(
        `SELECT 
          e.*,
          json_build_object(
            'first_name', p.first_name,
            'last_name', p.last_name,
            'email', p.email,
            'phone', p.phone
          ) as profiles
        FROM employees e
        JOIN profiles p ON p.id = e.user_id
        WHERE e.id = $1 AND e.tenant_id = $2`,
        [id, tenantId]
      );

      res.json(updatedResult.rows[0]);
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error updating employee:', error);
    res.status(500).json({ error: error.message || 'Failed to update employee' });
  }
});

// Bulk CSV import
router.post('/import', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Missing file' });
  const errors = [];
  let imported = 0;
  // Parse CSV rows
  let records;
  try {
    const csvContent = req.file.buffer.toString('utf8');
    console.log('CSV file received, size:', csvContent.length, 'bytes');
    console.log('First 500 chars of CSV:', csvContent.substring(0, 500));
    
    records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true // Handle UTF-8 BOM
    });
    
    console.log(`Parsed ${records.length} rows from CSV`);
    if (records.length === 0) {
      return res.status(400).json({ 
        error: 'CSV file appears to be empty or has no valid rows',
        imported_count: 0,
        failed_count: 0,
        errors: ['No rows found in CSV file']
      });
    }
    console.log('First row sample:', JSON.stringify(records[0], null, 2));
  } catch (e) {
    console.error('CSV parsing error:', e);
    return res.status(400).json({ 
      error: 'Invalid CSV file: ' + e.message,
      imported_count: 0,
      failed_count: 0,
      errors: ['Failed to parse CSV: ' + e.message]
    });
  }
  // Get org/tenant
  const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
  const tenantId = tenantResult.rows[0]?.tenant_id;
  if (!tenantId) return res.status(403).json({ error: 'No organization found' });

  console.log(`Processing ${records.length} rows from CSV for tenant ${tenantId}`);
  const managerMappings = []; // Store employee_id -> manager_email mappings for second pass
  for (const [idx, row] of records.entries()) {
    console.log(`Row ${idx + 2}:`, row);
    // Normalize column names (case-insensitive)
    const normalizedRow = {};
    for (const [key, value] of Object.entries(row)) {
      const normalizedKey = key.toLowerCase().trim();
      normalizedRow[normalizedKey] = value ? String(value).trim() : '';
    }
    const {
      firstname, lastname, email, employeeid, department, position, worklocation,
      joindate, grade, manageremail, role
    } = normalizedRow;
    
    // Map normalized keys back to expected names
    const firstName = (firstname || normalizedRow['first_name'] || '').trim();
    const lastName = (lastname || normalizedRow['last_name'] || '').trim();
    const employeeId = (employeeid || normalizedRow['employee_id'] || '').trim();
    const workLocation = (worklocation || normalizedRow['work_location'] || '').trim();
    let joinDate = (joindate || normalizedRow['join_date'] || '').trim();
    const managerEmail = (manageremail || normalizedRow['manager_email'] || '').trim();
    const deptValue = (department || normalizedRow['department'] || '').trim();
    const posValue = (position || normalizedRow['position'] || '').trim();
    
    // Normalize role (case-insensitive, handle common variations)
    const roleValue = (role || '').trim().toLowerCase();
    const roleMapping = {
      'employee': 'employee',
      'hr': 'hr',
      'ceo': 'ceo',
      'director': 'director',
      'manager': 'manager',
      'admin': 'admin'
    };
    const validatedRole = roleMapping[roleValue] || 'employee';
    if (roleValue && !roleMapping[roleValue]) {
      console.log(`Row ${idx + 2}: Invalid role '${role}', defaulting to 'employee'`);
    }
    
    // Validate required fields
    if (!firstName || !lastName || !email || !employeeId) {
      const missing = [];
      if (!firstName) missing.push('firstName');
      if (!lastName) missing.push('lastName');
      if (!email) missing.push('email');
      if (!employeeId) missing.push('employeeId');
      const errorMsg = `Row ${idx + 2}: Missing required fields: ${missing.join(', ')}. Found: firstName="${firstName}", lastName="${lastName}", email="${email}", employeeId="${employeeId}"`;
      errors.push(errorMsg);
      console.log(`Row ${idx + 2} skipped:`, errorMsg);
      console.log(`Raw row data:`, row);
      continue;
    }
    
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      const errorMsg = `Row ${idx + 2}: Invalid email format: "${email}"`;
      errors.push(errorMsg);
      console.log(errorMsg);
      continue;
    }
    
    // Parse and normalize date format (handle DD-MM-YYYY, MM-DD-YYYY, YYYY-MM-DD, etc.)
    let normalizedJoinDate = null;
    if (joinDate) {
      try {
        // Try to parse various date formats
        const dateParts = joinDate.split(/[-\/]/);
        if (dateParts.length === 3) {
          let year, month, day;
          // Check if first part is likely year (4 digits)
          if (dateParts[0].length === 4) {
            // YYYY-MM-DD or YYYY/MM/DD
            year = dateParts[0];
            month = dateParts[1].padStart(2, '0');
            day = dateParts[2].padStart(2, '0');
          } else {
            // Assume DD-MM-YYYY (most common in Indian format)
            day = dateParts[0].padStart(2, '0');
            month = dateParts[1].padStart(2, '0');
            year = dateParts[2];
          }
          // Validate year is reasonable (1900-2100)
          const yearNum = parseInt(year);
          if (yearNum >= 1900 && yearNum <= 2100) {
            normalizedJoinDate = `${year}-${month}-${day}`;
            // Validate it's a valid date
            const testDate = new Date(normalizedJoinDate);
            if (isNaN(testDate.getTime())) {
              normalizedJoinDate = null;
              console.log(`Row ${idx + 2}: Invalid date format '${joinDate}', will be set to null`);
            }
          } else {
            console.log(`Row ${idx + 2}: Invalid year in date '${joinDate}', will be set to null`);
          }
        } else {
          console.log(`Row ${idx + 2}: Invalid date format '${joinDate}', will be set to null`);
        }
      } catch (e) {
        console.log(`Row ${idx + 2}: Error parsing date '${joinDate}':`, e.message);
      }
    }
    
    // Store manager email for later lookup (after all employees are created)
    // We'll import employees first, then update manager relationships
    // Deduplicate by email (check both in CSV being imported and existing in DB)
    const existing = await query('SELECT id FROM profiles WHERE lower(email) = lower($1) AND tenant_id = $2', [email, tenantId]);
    if (existing.rows.length) {
      const errorMsg = `Row ${idx + 2}: Email ${email} already exists in database`;
      errors.push(errorMsg);
      console.log(errorMsg);
      continue;
    }
    
    // Check for duplicate employeeId in same CSV (within current import)
    const duplicateEmployeeId = records.slice(0, idx).some(r => {
      const normalized = {};
      for (const [k, v] of Object.entries(r)) {
        normalized[k.toLowerCase().trim()] = String(v || '').trim();
      }
      const otherId = normalized['employeeid'] || normalized['employee_id'] || '';
      return otherId && otherId.toLowerCase() === employeeId.toLowerCase();
    });
    if (duplicateEmployeeId) {
      const errorMsg = `Row ${idx + 2}: Duplicate employeeId "${employeeId}" found in CSV file`;
      errors.push(errorMsg);
      console.log(errorMsg);
      continue;
    }
    
    // Use same logic as normal employee create (in transaction for safety)
    try {
      await query('BEGIN');
      // Create user ID
      const userIdResult = await query('SELECT gen_random_uuid() as id');
      const userId = userIdResult.rows[0].id;
      // Create profile
      await query(
        `INSERT INTO profiles (id, email, first_name, last_name, tenant_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, email, firstName, lastName, tenantId]
      );
      // Generate random password
      const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();
      const hashedPassword = await bcrypt.hash(tempPassword, 10);
      // Create auth record
      await query(
        `INSERT INTO user_auth (user_id, password_hash)
         VALUES ($1, $2)`,
        [userId, hashedPassword]
      );
      // Create employee record (manager relationship will be set later)
      await query(
        `INSERT INTO employees (
          user_id, employee_id, department, position, work_location,
          join_date, reporting_manager_id, tenant_id, must_change_password,
          onboarding_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'not_started')`,
        [userId, employeeId, deptValue || null, posValue || null, workLocation || null, normalizedJoinDate, null, tenantId]
      );
      // Create user role
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, $2, $3)`,
        [userId, validatedRole, tenantId]
      );
      await query('COMMIT');
      imported++;
      console.log(`Row ${idx + 2}: Successfully imported ${email} (employee_id: ${employeeId})`);
      
      // Store manager email mapping for second pass
      if (managerEmail) {
        managerMappings.push({
          employeeId: employeeId,
          managerEmail: managerEmail,
          rowIndex: idx + 2
        });
      }
    } catch (err) {
      await query('ROLLBACK');
      const errorMsg = err?.message || 'Unknown error';
      errors.push(`Row ${idx + 2}: ${errorMsg}`);
      console.error(`Row ${idx + 2} error:`, errorMsg, err);
    }
  }
  
  // Second pass: Update manager relationships
  console.log(`Updating manager relationships... (${managerMappings.length} relationships to update)`);
  let managerUpdates = 0;
  for (const mapping of managerMappings) {
    try {
      // Find the manager by email
      const mgrRes = await query(
        'SELECT e.id FROM employees e JOIN profiles p ON p.id = e.user_id WHERE lower(p.email) = lower($1) AND e.tenant_id = $2',
        [mapping.managerEmail, tenantId]
      );
      if (mgrRes.rows.length) {
        const managerId = mgrRes.rows[0].id;
        // Update employee with manager relationship
        await query(
          'UPDATE employees SET reporting_manager_id = $1 WHERE employee_id = $2 AND tenant_id = $3',
          [managerId, mapping.employeeId, tenantId]
        );
        managerUpdates++;
        console.log(`Updated manager relationship for employee ${mapping.employeeId} -> manager ${mapping.managerEmail}`);
      } else {
        console.log(`Warning: Manager with email ${mapping.managerEmail} not found for employee ${mapping.employeeId} (Row ${mapping.rowIndex})`);
      }
    } catch (err) {
      console.error(`Error updating manager relationship for employee ${mapping.employeeId}:`, err.message);
    }
  }
  console.log(`Updated ${managerUpdates} manager relationships`);
  console.log(`Import complete: ${imported} imported, ${errors.length} errors`);
  res.json({ 
    imported_count: imported, 
    failed_count: errors.length,
    imported,
    errors 
  });
});

// Delete employee (HR/CEO/Director/Admin only)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check role - only HR/CEO/Director/Admin can delete
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
    const userRole = roleResult.rows[0]?.role;
    
    if (!userRole || !['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
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

    // Verify employee belongs to same tenant
    const empCheck = await query(
      'SELECT tenant_id, user_id FROM employees WHERE id = $1',
      [id]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empCheck.rows[0].tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const userId = empCheck.rows[0].user_id;

    await query('BEGIN');

    try {
      // Delete employee record (this will cascade to onboarding_data due to FK)
      await query('DELETE FROM employees WHERE id = $1', [id]);

      // Delete user roles
      await query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

      // Delete user auth
      await query('DELETE FROM user_auth WHERE user_id = $1', [userId]);

      // Delete profile (this will cascade to other related records)
      await query('DELETE FROM profiles WHERE id = $1', [userId]);

      await query('COMMIT');

      res.json({ success: true, message: 'Employee deleted successfully' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error deleting employee:', error);
    res.status(500).json({ error: error.message || 'Failed to delete employee' });
  }
});

// Employee assignments management
router.get('/:id/assignments', authenticateToken, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const { id } = req.params;

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const assignments = await queryWithOrg(
      `SELECT ea.*, 
              ob.name as branch_name, 
              dept.name as department_name, 
              team.name as team_name
       FROM employee_assignments ea
       LEFT JOIN org_branches ob ON ob.id = ea.branch_id
       LEFT JOIN departments dept ON dept.id = ea.department_id
       LEFT JOIN teams team ON team.id = ea.team_id
       WHERE ea.employee_id = $1
       ORDER BY ea.is_home DESC, ea.start_date DESC NULLS LAST`,
      [id],
      tenantId
    );

    res.json(assignments.rows);
  } catch (error) {
    console.error('Error fetching employee assignments:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch assignments' });
  }
});

router.post('/:id/assignments', authenticateToken, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      assignmentId,
      branchId,
      departmentId,
      teamId,
      startDate,
      endDate,
      fte,
      roleTitle,
      isHome,
      metadata
    } = req.body;

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const employeeRecord = await query(
      'SELECT id, user_id FROM employees WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (employeeRecord.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    let result;
    if (assignmentId) {
      result = await queryWithOrg(
        `UPDATE employee_assignments
         SET branch_id = $1,
             department_id = $2,
             team_id = $3,
             start_date = COALESCE($4::date, start_date),
             end_date = $5::date,
             fte = COALESCE($6, fte),
             role = COALESCE($7, role),
             is_home = COALESCE($8, is_home),
             metadata = COALESCE($9::jsonb, metadata),
             updated_at = now()
         WHERE id = $10 AND employee_id = $11
         RETURNING *`,
        [
          branchId || null,
          departmentId || null,
          teamId || null,
          startDate || null,
          endDate || null,
          fte || null,
          roleTitle || null,
          typeof isHome === 'boolean' ? isHome : null,
          metadata || null,
          assignmentId,
          id
        ],
        tenantId
      );
    } else {
      result = await queryWithOrg(
        `INSERT INTO employee_assignments (
          org_id, user_id, employee_id, branch_id, department_id, team_id,
          role, fte, start_date, end_date, is_home, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 1.0), COALESCE($9::date, now()::date), $10::date, COALESCE($11, false), COALESCE($12::jsonb, '{}'::jsonb))
        RETURNING *`,
        [
          tenantId,
          employeeRecord.rows[0].user_id,
          employeeRecord.rows[0].id,
          branchId || null,
          departmentId || null,
          teamId || null,
          roleTitle || 'Assignment',
          fte || 1,
          startDate || null,
          endDate || null,
          Boolean(isHome),
          metadata || {}
        ],
        tenantId
      );
    }

    await rebuildSegmentsForEmployee(tenantId, employeeRecord.rows[0].id);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving assignment:', error);
    res.status(500).json({ error: error.message || 'Failed to save assignment' });
  }
});

export default router;
