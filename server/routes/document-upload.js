import express from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  getPresignedPutUrl,
  getPresignedGetUrl,
  calculateChecksum,
  getStorageProvider,
} from '../services/storage.js';
import { audit } from '../utils/auditLog.js';

const router = express.Router();

// Stub for malware scanning (replace with ClamAV or cloud function)
async function scanFile(objectKey) {
  // TODO: Implement actual malware scanning
  // Example: Call ClamAV API or AWS Lambda function
  console.log(`[scan] Scanning file: ${objectKey}`);
  return { clean: true, threat: null };
}

// Get user's tenant ID
async function getTenantIdForUser(userId) {
  const result = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return result.rows[0]?.tenant_id || null;
}

// Check if user has HR role
async function isHrUser(userId) {
  const result = await query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [userId]
  );
  const roles = result.rows.map((r) => r.role?.toLowerCase()).filter(Boolean);
  return roles.some((role) => ['hr', 'hrbp', 'hradmin', 'admin', 'ceo', 'director'].includes(role));
}

/**
 * POST /api/onboarding/docs/presign
 * Generate presigned URL for direct upload to MinIO/S3
 */
router.post('/presign', authenticateToken, async (req, res) => {
  try {
    const { filename, contentType } = req.body;
    const userId = req.user.id;

    if (!filename || !contentType) {
      return res.status(400).json({ error: 'filename and contentType are required' });
    }

    // Validate file type
    const allowedMimeTypes = {
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/tiff': 'tiff',
    };

    if (!allowedMimeTypes[contentType]) {
      return res.status(400).json({ error: 'Invalid file type. Allowed: pdf, doc, docx, jpg, png, tiff' });
    }

    // Check if S3/MinIO is available
    const { getStorageProvider } = await import('../services/storage.js');
    const storageProvider = getStorageProvider();
    
    if (storageProvider !== 's3') {
      return res.status(400).json({ 
        error: 'S3/MinIO storage is not configured. Please configure MinIO environment variables to enable document uploads.',
        storage_provider: storageProvider,
        requires_s3: true,
        message: 'MinIO is required for document uploads. Please set MINIO_ENABLED=true and configure MinIO credentials.'
      });
    }

    const tenantId = await getTenantIdForUser(userId);
    const keyPrefix = tenantId ? `employees/${tenantId}/${userId}` : `employees/${userId}`;
    const safeExt = allowedMimeTypes[contentType];
    const fileName = `${Date.now()}_${crypto.randomUUID()}.${safeExt}`;
    const objectKey = `${keyPrefix}/${fileName}`;

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
    console.error('Error generating presigned URL:', error);
    res.status(500).json({ error: error.message || 'Failed to generate upload URL' });
  }
});

/**
 * POST /api/onboarding/docs/complete
 * Called after successful upload to MinIO/S3
 * Validates checksum, runs malware scan, saves metadata to DB
 */
router.post('/complete', authenticateToken, async (req, res) => {
  try {
    const { key, filename, size, checksum, docType, consent, notes, employeeId: providedEmployeeId } = req.body;
    const userId = req.user.id;

    if (!key || !filename || !size) {
      return res.status(400).json({ error: 'key, filename, and size are required' });
    }

    // Get tenant ID
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get employee ID - use provided employeeId or find by user_id
    let employeeId = providedEmployeeId;
    if (!employeeId) {
      const employeeResult = await query(
        'SELECT id, tenant_id FROM employees WHERE user_id = $1',
        [userId]
      );
      if (employeeResult.rows.length === 0) {
        return res.status(404).json({ error: 'Employee record not found. Please provide employeeId in request body.' });
      }
      employeeId = employeeResult.rows[0].id;
      
      // Verify tenant match
      if (employeeResult.rows[0].tenant_id !== tenantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    } else {
      // Verify provided employeeId belongs to same tenant
      const empResult = await query(
        'SELECT tenant_id FROM employees WHERE id = $1',
        [employeeId]
      );
      if (empResult.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      if (empResult.rows[0].tenant_id !== tenantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    // Run malware scan (stub)
    const scanResult = await scanFile(key);
    if (!scanResult.clean) {
      return res.status(400).json({
        error: 'File failed security scan',
        threat: scanResult.threat,
      });
    }

    // Determine content type from filename
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeMap = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      tiff: 'image/tiff',
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';

    // Ensure onboarding_documents table exists
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'document_status_enum') THEN
          CREATE TYPE document_status_enum AS ENUM (
            'uploaded', 'pending', 'approved', 'rejected', 'hold',
            'resubmission_requested', 'quarantined'
          );
        END IF;
      END $$;
    `);

    const requiredStatuses = ['uploaded', 'pending', 'approved', 'rejected', 'hold', 'resubmission_requested', 'quarantined'];
    for (const status of requiredStatuses) {
      await query(`ALTER TYPE document_status_enum ADD VALUE IF NOT EXISTS '${status}'`);
    }

    await query(`
      CREATE TABLE IF NOT EXISTS onboarding_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        candidate_id UUID,
        tenant_id UUID,
        document_type TEXT NOT NULL,
        file_name TEXT NOT NULL,
        storage_key TEXT,
        object_key TEXT,
        storage_provider TEXT DEFAULT 's3',
        mime_type TEXT,
        file_size INTEGER,
        uploaded_by UUID REFERENCES profiles(id),
        uploaded_at TIMESTAMPTZ DEFAULT now(),
        status document_status_enum DEFAULT 'uploaded',
        checksum TEXT,
        verified_by UUID REFERENCES profiles(id),
        verified_at TIMESTAMPTZ,
        hr_notes TEXT
      )
    `);

    // Ensure legacy tables get new columns required by the workflow
    await query(`
      ALTER TABLE onboarding_documents
        ADD COLUMN IF NOT EXISTS file_path TEXT,
        ADD COLUMN IF NOT EXISTS storage_key TEXT,
        ADD COLUMN IF NOT EXISTS object_key TEXT,
        ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 's3',
        ADD COLUMN IF NOT EXISTS mime_type TEXT,
        ADD COLUMN IF NOT EXISTS file_size INTEGER,
        ADD COLUMN IF NOT EXISTS checksum TEXT,
        ADD COLUMN IF NOT EXISTS status document_status_enum DEFAULT 'uploaded'
    `);

    // Save to onboarding_documents table (primary table for onboarding)
    let documentId;
    let onboardingDocRecord = null;
    let hrDocRecord = null;
    if (docType) {
      const onboardingDocResult = await query(
        `INSERT INTO onboarding_documents (
          employee_id, candidate_id, tenant_id, document_type, file_name, file_path, storage_key,
          storage_provider, mime_type, file_size, uploaded_by, status, object_key, checksum
        ) VALUES ($1, $2, $3, $4, $5, $6, $6, 's3', $7, $8, $9, 'pending', $6, $10)
        RETURNING id, uploaded_at`,
        [employeeId, employeeId, tenantId, docType.toUpperCase(), filename, key, contentType, size, userId, checksum || null]
      );
      onboardingDocRecord = onboardingDocResult.rows[0] || null;
      documentId = onboardingDocRecord?.id;
    }

    // Also try to save to hr_documents if table exists (for HR viewing)
    try {
      const hrDocResult = await query(
        `INSERT INTO hr_documents (
          employee_id, object_key, filename, content_type, size_bytes,
          uploaded_by, checksum, verification_status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
        RETURNING id, uploaded_at`,
        [employeeId, key, filename, contentType, size, userId, checksum || null]
      );
      hrDocRecord = hrDocResult.rows[0] || null;
    } catch (hrTableError) {
      // hr_documents table might not exist, that's okay
      console.log('hr_documents table not available:', hrTableError.message);
    }

    if (!documentId) {
      const fallbackResult = await query(
        `SELECT id, uploaded_at FROM onboarding_documents WHERE object_key = $1 ORDER BY uploaded_at DESC LIMIT 1`,
        [key]
      );
      if (fallbackResult.rows.length > 0) {
        onboardingDocRecord = onboardingDocRecord || fallbackResult.rows[0];
        documentId = fallbackResult.rows[0].id;
      }
    }

    // Audit log
    if (documentId) {
      await audit({
        tenantId,
        userId,
        action: 'document_uploaded',
        resourceType: 'document',
        resourceId: documentId,
        metadata: { filename, size, objectKey: key },
      });
    }

    res.status(201).json({
      success: true,
      document: {
        id: documentId,
        object_key: key,
        filename,
        size_bytes: size,
        verification_status: 'pending',
        uploaded_at: onboardingDocRecord?.uploaded_at || hrDocRecord?.uploaded_at || new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error completing document upload:', error);
    res.status(500).json({ error: error.message || 'Failed to complete upload' });
  }
});

/**
 * GET /api/onboarding/docs/hr/employees/:id/documents
 * List all documents for an employee (HR only)
 * Also available at /api/hr/employees/:id/documents
 */
router.get('/hr/employees/:id/documents', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const employeeId = req.params.id;

    // Check HR access
    if (!(await isHrUser(userId))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const result = await query(
      `SELECT 
        id, object_key, filename, content_type, size_bytes,
        uploaded_by, uploaded_at, checksum, verified, verification_status,
        hr_notes, verified_by, verified_at
      FROM hr_documents
      WHERE employee_id = $1
      ORDER BY uploaded_at DESC`,
      [employeeId]
    );

    res.json({
      success: true,
      documents: result.rows,
    });
  } catch (error) {
    console.error('Error fetching employee documents:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch documents' });
  }
});

/**
 * POST /api/onboarding/docs/hr/documents/:docId/verify
 * Approve or deny a document (HR only)
 */
router.post('/hr/documents/:docId/verify', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const docId = req.params.docId;
    const { action, note } = req.body;

    if (!['approve', 'deny'].includes(action)) {
      return res.status(400).json({ error: 'action must be "approve" or "deny"' });
    }

    // Check HR access
    if (!(await isHrUser(userId))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get document
    const docResult = await query(
      'SELECT id, employee_id, verification_status FROM hr_documents WHERE id = $1',
      [docId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const previousStatus = docResult.rows[0].verification_status;
    const nextStatus = action === 'approve' ? 'approved' : 'denied';
    const employeeId = docResult.rows[0].employee_id;

    // Update document
    await query(
      `UPDATE hr_documents
       SET verification_status = $1, verified = $2, verified_by = $3, verified_at = now(), hr_notes = $4
       WHERE id = $5`,
      [nextStatus, action === 'approve', userId, note || null, docId]
    );

    // Update onboarding_documents if exists
    await query(
      `UPDATE onboarding_documents
       SET status = $1, verified_by = $2, verified_at = now(), hr_notes = $3
       WHERE object_key = (SELECT object_key FROM hr_documents WHERE id = $4)`,
      [action === 'approve' ? 'approved' : 'rejected', userId, note || null, docId]
    );

    // Audit log
    await query(
      `INSERT INTO hr_document_audit_logs (document_id, actor_id, action, comment, previous_status, next_status)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [docId, userId, action, note || null, previousStatus, nextStatus]
    );

    // TODO: Send notification to employee (stub)
    console.log(`[notification] Document ${action}d for employee ${employeeId}`);

    res.json({
      success: true,
      document: {
        id: docId,
        verification_status: nextStatus,
        verified: action === 'approve',
      },
    });
  } catch (error) {
    console.error('Error verifying document:', error);
    res.status(500).json({ error: error.message || 'Failed to verify document' });
  }
});

/**
 * GET /api/onboarding/docs/:docId/download
 * Get presigned download URL (employee owner or HR)
 */
router.get('/:docId/download', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const docId = req.params.docId;

    // Get document
    const docResult = await query(
      'SELECT id, employee_id, object_key FROM hr_documents WHERE id = $1',
      [docId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult.rows[0];
    const isHr = await isHrUser(userId);

    // Check access: employee must own the document, or user must be HR
    if (!isHr) {
      const employeeResult = await query(
        'SELECT id FROM employees WHERE user_id = $1',
        [userId]
      );
      if (employeeResult.rows.length === 0 || employeeResult.rows[0].id !== document.employee_id) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
    }

    // Generate presigned download URL (15 minute expiry)
    const url = await getPresignedGetUrl({
      objectKey: document.object_key,
      expiresIn: 900,
    });

    // Audit log
    await query(
      `INSERT INTO hr_document_audit_logs (document_id, actor_id, action)
       VALUES ($1, $2, 'download')`,
      [docId, userId]
    );

    res.json({
      success: true,
      url,
      expiresIn: 900,
    });
  } catch (error) {
    console.error('Error generating download URL:', error);
    res.status(500).json({ error: error.message || 'Failed to generate download URL' });
  }
});

export default router;

