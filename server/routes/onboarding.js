import express from 'express';
import multer from 'multer';
import crypto from 'crypto';
import mime from 'mime-types';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { audit } from '../utils/auditLog.js';
import {
  saveDocumentBuffer,
  getDocumentStream,
} from '../services/storage.js';

const router = express.Router();

const requireDocsFeature = (req, res, next) => {
  if (!FEATURE_FLAG_DOCS) {
    return res.status(404).json({ error: 'onboarding_v2_docs feature disabled' });
  }
  return next();
};

const BANK_DETAILS_STATUS = {
  PENDING: 'pending',
  SKIPPED: 'skipped',
  PROVIDED: 'provided',
};

const ensureHrAccess = async (req, res, next) => {
  const roles = await getUserRoles(req.user.id);
  if (!isHrRole(roles)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  req.userRoles = roles;
  return next();
};

const ensureDocumentInfra = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS onboarding_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
      document_type TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT,
      file_size INTEGER,
      mime_type TEXT,
      uploaded_at TIMESTAMPTZ DEFAULT now()
    )
  `);

  await query(`
    ALTER TABLE onboarding_documents
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS candidate_id UUID,
      ADD COLUMN IF NOT EXISTS title TEXT,
      ADD COLUMN IF NOT EXISTS storage_key TEXT,
      ADD COLUMN IF NOT EXISTS storage_provider TEXT DEFAULT 'local',
      ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
      ADD COLUMN IF NOT EXISTS status document_status_enum DEFAULT 'uploaded',
      ADD COLUMN IF NOT EXISTS uploaded_by UUID REFERENCES profiles(id),
      ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES profiles(id),
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS hr_notes TEXT,
      ADD COLUMN IF NOT EXISTS retention_until DATE,
      ADD COLUMN IF NOT EXISTS consent_snapshot JSONB DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS uploader_notes TEXT,
      ADD COLUMN IF NOT EXISTS doc_source TEXT DEFAULT 'candidate',
      ADD COLUMN IF NOT EXISTS quarantine_reason TEXT,
      ADD COLUMN IF NOT EXISTS audit_hash TEXT,
      ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS document_audit_logs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id UUID REFERENCES onboarding_documents(id) ON DELETE CASCADE NOT NULL,
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      actor_id UUID REFERENCES profiles(id),
      action TEXT NOT NULL,
      comment TEXT,
      previous_status document_status_enum,
      next_status document_status_enum,
      snapshot_json JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  `);
};

const ensureOnboardingBankColumns = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS onboarding_data (
      employee_id UUID PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE
    )
  `);

  await query(`
    ALTER TABLE onboarding_data
      ADD COLUMN IF NOT EXISTS bank_details_status TEXT DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS bank_account_number TEXT,
      ADD COLUMN IF NOT EXISTS bank_name TEXT,
      ADD COLUMN IF NOT EXISTS bank_branch TEXT,
      ADD COLUMN IF NOT EXISTS ifsc_code TEXT
  `);
};

const getTenantIdForUser = async (userId) => {
  const result = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return result.rows[0]?.tenant_id || null;
};

const getUserRoles = async (userId) => {
  const result = await query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [userId]
  );
  return result.rows.map((r) => r.role?.toLowerCase()).filter(Boolean);
};

const isHrRole = (roles = []) => roles.some((role) =>
  ['hr', 'hrbp', 'hradmin', 'admin', 'ceo', 'director'].includes(role)
);

const buildConsentSnapshot = async ({ tenantId, subjectId, docType, userId, consentFlag, notes, req }) => {
  if (!consentFlag) return null;
  const snapshot = {
    text: `Consent provided for uploading ${docType} document`,
    scope: docType,
    captured_at: new Date().toISOString(),
    ip_address: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
    user_agent: req.headers['user-agent'] || null,
    notes: notes || null,
    actor_id: userId,
  };

  try {
    const result = await query(
      `INSERT INTO consent_snapshots (
        tenant_id, subject_id, subject_type, consent_text, scope, ip_address, user_agent, signed_by
      ) VALUES ($1, $2, 'employee', $3, to_jsonb($4::text), $5, $6, $7)
      RETURNING id`,
      [
        tenantId,
        subjectId || null,
        snapshot.text,
        docType,
        snapshot.ip_address,
        snapshot.user_agent,
        userId,
      ]
    );
    snapshot.snapshot_id = result.rows[0]?.id;
  } catch (error) {
    console.warn('Failed to persist consent snapshot:', error.message);
  }
  return snapshot;
};

const recordDocumentAudit = async ({
  tenantId,
  documentId,
  actorId,
  action,
  previousStatus,
  nextStatus,
  comment,
  snapshot,
}) => {
  try {
    await query(
      `INSERT INTO document_audit_logs (
        document_id, tenant_id, actor_id, action, previous_status, next_status, comment, snapshot_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        documentId,
        tenantId,
        actorId || null,
        action,
        previousStatus || null,
        nextStatus || null,
        comment || null,
        snapshot ? JSON.stringify(snapshot) : '{}',
      ]
    );
  } catch (error) {
    console.error('Failed to write document audit log:', error.message);
  }
};

const mapDocumentRow = (row, { isHr, baseUrl }) => {
  const docType = row.document_type;
  const catalog = DOCUMENT_TYPE_CATALOG[docType] || { label: docType, sensitive: false };
  const previewable = row.mime_type?.startsWith('image/') || row.mime_type === 'application/pdf';

  const downloadUrl = `${baseUrl}/api/onboarding/documents/${row.id}/download`;
  const masked = catalog.sensitive && !isHr;

  return {
    id: row.id,
    doc_type: docType,
    doc_label: catalog.label,
    file_name: masked ? `${catalog.label} (restricted)` : row.file_name,
    mime_type: row.mime_type,
    file_size: row.file_size,
    status: row.status,
    uploaded_at: row.uploaded_at,
    uploaded_by: row.uploaded_by_user || null,
    verified_by: row.verified_by_user || null,
    verified_at: row.verified_at,
    hr_notes: row.hr_notes,
    consent_snapshot: isHr ? row.consent_snapshot : undefined,
    retention_until: row.retention_until,
    url: masked ? null : downloadUrl,
    thumbnail_url: previewable && !masked ? downloadUrl : null,
    previewable: previewable && !masked,
  };
};

const persistDocumentUpload = async ({
  req,
  file,
  candidateId,
  docType,
  uploaderNotes,
  consent,
  source = 'candidate',
}) => {
  if (!file) {
    throw new Error('No file uploaded');
  }

  if (!docType || !Object.prototype.hasOwnProperty.call(DOCUMENT_TYPE_CATALOG, docType)) {
    throw new Error('Invalid document type');
  }

  await ensureDocumentInfra();

  const tenantId = await getTenantIdForUser(req.user.id);
  if (!tenantId) {
    throw new Error('No organization found');
  }

  let employeeId = null;
  let candidateGuid = candidateId || null;

  if (candidateId) {
    const employeeResult = await query(
      'SELECT id, tenant_id FROM employees WHERE id = $1',
      [candidateId]
    );
    if (employeeResult.rows.length > 0) {
      const employee = employeeResult.rows[0];
      if (employee.tenant_id !== tenantId) {
        throw new Error('Unauthorized');
      }
      employeeId = employee.id;
    }
  }

  const ext =
    ALLOWED_MIME_TYPES[file.mimetype] ||
    mime.extension(file.mimetype) ||
    file.originalname.split('.').pop() ||
    'bin';

  const storageResult = await saveDocumentBuffer({
    buffer: file.buffer,
    mimeType: file.mimetype,
    extension: `.${ext}`,
    originalName: file.originalname,
    tenantId,
  });

  const consentSnapshot = await buildConsentSnapshot({
    tenantId,
    subjectId: employeeId || candidateGuid,
    docType,
    userId: req.user.id,
    consentFlag: consent,
    notes: uploaderNotes,
    req,
  });

  const hash = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const catalog = DOCUMENT_TYPE_CATALOG[docType] || { label: docType };

  const insertResult = await query(
    `INSERT INTO onboarding_documents (
      tenant_id,
      employee_id,
      candidate_id,
      document_type,
      title,
      file_name,
      file_path,
      storage_key,
      storage_provider,
      file_size,
      mime_type,
      status,
      uploaded_by,
      uploader_notes,
      doc_source,
      consent_snapshot,
      audit_hash
    ) VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    )
    RETURNING *`,
    [
      tenantId,
      employeeId,
      candidateGuid,
      docType,
      catalog.label,
      file.originalname,
      storageResult.storageKey,
      storageResult.storageKey,
      storageResult.storageProvider,
      file.size,
      file.mimetype,
      'uploaded',
      req.user.id,
      uploaderNotes || null,
      source,
      consentSnapshot || null,
      hash,
    ]
  );

  const doc = insertResult.rows[0];

  await recordDocumentAudit({
    tenantId,
    documentId: doc.id,
    actorId: req.user.id,
    action: 'document.uploaded',
    nextStatus: doc.status,
    snapshot: { file_name: doc.file_name, doc_type: doc.document_type },
  });

  await audit({
    actorId: req.user.id,
    action: 'document_uploaded',
    entityType: 'onboarding_document',
    entityId: doc.id,
    details: {
      doc_type: doc.document_type,
      storage_provider: storageResult.storageProvider,
      consent: Boolean(consentSnapshot),
    },
  }).catch(() => {});

  return doc;
};

const listDocumentsForCandidate = async ({ req, candidateId, filters }) => {
  const tenantId = await getTenantIdForUser(req.user.id);
  if (!tenantId) {
    throw new Error('No organization found');
  }

  const roles = await getUserRoles(req.user.id);
  const isHr = isHrRole(roles);

  const employeeResult = await query(
    'SELECT id, user_id, tenant_id FROM employees WHERE id = $1',
    [candidateId]
  );
  const targetEmployee = employeeResult.rows[0];

  if (employeeResult.rows.length === 0) {
    const docTenant = await query(
      `SELECT tenant_id FROM onboarding_documents WHERE (candidate_id = $1 OR employee_id = $1) LIMIT 1`,
      [candidateId]
    );
    if (docTenant.rows.length === 0) {
      const err = new Error('Candidate or employee not found');
      err.status = 404;
      throw err;
    }
    if (docTenant.rows[0].tenant_id !== tenantId) {
      const err = new Error('Unauthorized');
      err.status = 403;
      throw err;
    }
  } else if (employeeResult.rows[0].tenant_id !== tenantId) {
    const err = new Error('Unauthorized');
    err.status = 403;
    throw err;
  }

  const myEmployee = await query(
    'SELECT id FROM employees WHERE user_id = $1',
    [req.user.id]
  );
  const isSelf = myEmployee.rows[0]?.id === candidateId;
  const isOwnerByEmployeeRecord = targetEmployee?.user_id === req.user.id;
  
  // Also check if user uploaded the documents (for onboarding flow)
  const userUploadedDocs = await query(
    `SELECT COUNT(*) as count FROM onboarding_documents 
     WHERE (employee_id = $1 OR candidate_id = $1) AND uploaded_by = $2`,
    [candidateId, req.user.id]
  );
  const hasUploadedDocs = parseInt(userUploadedDocs.rows[0]?.count || '0') > 0;

  if (!isHr && !isSelf && !hasUploadedDocs && !isOwnerByEmployeeRecord) {
    const err = new Error('Insufficient permissions');
    err.status = 403;
    throw err;
  }

  let filtersSql = '';
  const params = [tenantId, candidateId];
  let paramIndex = 3;

  if (filters?.status) {
    filtersSql += ` AND d.status = $${paramIndex++}`;
    params.push(filters.status);
  }
  if (filters?.doc_type) {
    filtersSql += ` AND d.document_type = $${paramIndex++}`;
    params.push(filters.doc_type.toUpperCase());
  }

  const docsResult = await query(
    `
    SELECT 
      d.*,
      json_build_object('id', up.id, 'first_name', up.first_name, 'last_name', up.last_name) as uploaded_by_user,
      json_build_object('id', vp.id, 'first_name', vp.first_name, 'last_name', vp.last_name) as verified_by_user
    FROM onboarding_documents d
    LEFT JOIN profiles up ON up.id = d.uploaded_by
    LEFT JOIN profiles vp ON vp.id = d.verified_by
    LEFT JOIN employees e ON e.id = d.employee_id
    WHERE COALESCE(d.tenant_id, e.tenant_id) = $1
      AND (d.employee_id = $2 OR d.candidate_id = $2)
      ${filtersSql}
    ORDER BY d.uploaded_at DESC
    `,
    params
  );

  const baseUrl = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return docsResult.rows.map((row) =>
    mapDocumentRow(row, { isHr, baseUrl })
  );
};

const notifyDocumentOwner = async ({ tenantId, employeeId, title, message, type }) => {
  if (!employeeId) return;
  try {
    const result = await query(
      'SELECT user_id FROM employees WHERE id = $1',
      [employeeId]
    );
    const userId = result.rows[0]?.user_id;
    if (!userId) return;

    await query(
      `INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [tenantId, userId, title, message, type || 'document']
    );
  } catch (error) {
    console.warn('Failed to send document notification:', error.message);
  }
};

const FEATURE_FLAG_DOCS = (process.env.FEATURE_FLAG_ONBOARDING_V2_DOCS || 'true') !== 'false';
const MAX_FILE_SIZE_MB = Number(process.env.ONBOARDING_DOC_MAX_SIZE_MB || 10);

const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/tiff': 'tiff',
};

const DOCUMENT_TYPE_CATALOG = {
  ID_PROOF: { label: 'ID Proof', sensitive: true },
  ADDRESS_PROOF: { label: 'Address Proof', sensitive: true },
  EDUCATION_CERT: { label: 'Education Certificate', sensitive: false },
  EXPERIENCE_LETTER: { label: 'Experience Letter', sensitive: false },
  PAN: { label: 'PAN Card', sensitive: true },
  AADHAAR: { label: 'Aadhaar', sensitive: true },
  AADHAR: { label: 'Aadhaar', sensitive: true },
  BANK_STATEMENT: { label: 'Bank Statement / Cheque', sensitive: true },
  PASSPORT: { label: 'Passport', sensitive: true },
  OFFER_ACCEPTANCE: { label: 'Offer Acceptance', sensitive: false },
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIME_TYPES[file.mimetype]) {
      return cb(null, true);
    }
    cb(new Error('Invalid file type. Allowed: pdf, doc, docx, jpg, png, tiff'));
  },
});

// Verify employee email for password setup
router.post('/verify-employee-email', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find profile
    const profileResult = await query(
      'SELECT id FROM profiles WHERE email = $1',
      [email]
    );

    if (profileResult.rows.length === 0) {
      return res.json({
        valid: false,
        error: 'No employee found with this email address. Please contact HR.'
      });
    }

    // Check employee and password setup requirement
    const employeeResult = await query(
      `SELECT id, user_id, must_change_password
       FROM employees
       WHERE user_id = $1`,
      [profileResult.rows[0].id]
    );

    if (employeeResult.rows.length === 0) {
      return res.json({
        valid: false,
        error: 'No employee found with this email address. Please contact HR.'
      });
    }

    const employee = employeeResult.rows[0];

    if (!employee.must_change_password) {
      return res.json({
        valid: false,
        error: 'This account has already been set up. Please use the login page.'
      });
    }

    return res.json({
      valid: true,
      employeeId: employee.id
    });
  } catch (error) {
    console.error('Error verifying employee email:', error);
    res.status(500).json({ error: error.message });
  }
});

// Setup employee password
router.post('/setup-password', async (req, res) => {
  try {
    const {
      email,
      password,
      securityQuestion1,
      securityAnswer1,
      securityQuestion2,
      securityAnswer2
    } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find profile
    const profileResult = await query(
      'SELECT id FROM profiles WHERE email = $1',
      [email]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee profile not found' });
    }

    const userId = profileResult.rows[0].id;

    // Get employee record
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [userId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Hash new password
    const bcrypt = (await import('bcryptjs')).default;
    const hashedPassword = await bcrypt.hash(password, 10);

    await query('BEGIN');

    try {
      // Update password
      await query(
        'UPDATE user_auth SET password_hash = $1, updated_at = now() WHERE user_id = $2',
        [hashedPassword, userId]
      );

      // Update employee
      await query(
        `UPDATE employees
         SET must_change_password = false, onboarding_status = 'in_progress', updated_at = now()
         WHERE id = $1`,
        [empResult.rows[0].id]
      );

      // Update profile with security questions
      await query(
        `UPDATE profiles
         SET security_question_1 = $1, security_answer_1 = $2,
             security_question_2 = $3, security_answer_2 = $4, updated_at = now()
         WHERE id = $5`,
        [securityQuestion1, securityAnswer1, securityQuestion2, securityAnswer2, userId]
      );

      await query('COMMIT');

      res.json({ success: true });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error setting up password:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/:candidateId/documents', authenticateToken, requireDocsFeature, upload.single('file'), async (req, res) => {
  try {
    const { candidateId } = req.params;
    const rawDocType = req.body.doc_type || req.body.documentType || '';
    const docType = rawDocType.toUpperCase();
    const consent = req.body.consent === 'true' || req.body.consent === true;
    const notes = req.body.notes || req.body.uploader_notes || null;

    if (!docType) {
      return res.status(400).json({ error: 'doc_type is required' });
    }

    const document = await persistDocumentUpload({
      req,
      file: req.file,
      candidateId,
      docType,
      uploaderNotes: notes,
      consent,
      source: req.body.source || 'candidate',
    });

    const baseUrl = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const downloadUrl = `${baseUrl}/api/onboarding/documents/${document.id}/download`;

    res.status(201).json({
      status: document.status,
      doc_id: document.id,
      url: downloadUrl,
      thumbnail_url: downloadUrl,
    });
  } catch (error) {
    console.error('Error uploading onboarding document:', error);
    res.status(400).json({ error: error.message || 'Failed to upload document' });
  }
});

router.get('/:candidateId/documents', authenticateToken, requireDocsFeature, async (req, res) => {
  try {
    const documents = await listDocumentsForCandidate({
      req,
      candidateId: req.params.candidateId,
      filters: {
        status: req.query.status,
        doc_type: req.query.doc_type,
      },
    });
    res.json({ documents });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error fetching onboarding documents:', error);
    res.status(status).json({ error: error.message || 'Failed to fetch documents' });
  }
});

// Submit onboarding data (requires auth to get tenant_id)
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.body.employeeId;
    const onboardingData = req.body;
    const bankDetailsStatus =
      onboardingData.bankDetailsStatus === BANK_DETAILS_STATUS.SKIPPED
        ? BANK_DETAILS_STATUS.SKIPPED
        : BANK_DETAILS_STATUS.PROVIDED;
    const uanNumber = onboardingData.uanNumber || null;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID required' });
    }

    await ensureOnboardingBankColumns();

    // Get tenant_id from user's profile
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].tenant_id) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Verify employee belongs to same tenant
    const empResult = await query(
      'SELECT tenant_id FROM employees WHERE id = $1',
      [employeeId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    if (empResult.rows[0].tenant_id !== profileResult.rows[0].tenant_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const tenantId = profileResult.rows[0].tenant_id;

    await query('BEGIN');

    try {
      // Insert or update onboarding data (without gender and tenant_id)
      await query(
        `INSERT INTO onboarding_data (
          employee_id, emergency_contact_name, emergency_contact_phone,
          emergency_contact_relation, address, city, state, postal_code,
          permanent_address, permanent_city, permanent_state, permanent_postal_code,
          current_address, current_city, current_state, current_postal_code,
          bank_account_number, bank_name, bank_branch, ifsc_code,
          pan_number, aadhar_number, passport_number, uan_number, bank_details_status, completed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, now())
        ON CONFLICT (employee_id) 
        DO UPDATE SET
          emergency_contact_name = $2,
          emergency_contact_phone = $3,
          emergency_contact_relation = $4,
          address = COALESCE($5, onboarding_data.current_address),
          city = COALESCE($6, onboarding_data.current_city),
          state = COALESCE($7, onboarding_data.current_state),
          postal_code = COALESCE($8, onboarding_data.current_postal_code),
          permanent_address = $9,
          permanent_city = $10,
          permanent_state = $11,
          permanent_postal_code = $12,
          current_address = $13,
          current_city = $14,
          current_state = $15,
          current_postal_code = $16,
          bank_account_number = $17,
          bank_name = $18,
          bank_branch = $19,
          ifsc_code = $20,
          pan_number = $21,
          aadhar_number = $22,
          passport_number = $23,
          uan_number = $24,
          bank_details_status = $25,
          completed_at = now(),
          updated_at = now()`,
        [
          employeeId,
          onboardingData.emergencyContactName,
          onboardingData.emergencyContactPhone,
          onboardingData.emergencyContactRelation,
          onboardingData.address || onboardingData.currentAddress,
          onboardingData.city || onboardingData.currentCity,
          onboardingData.state || onboardingData.currentState,
          onboardingData.postalCode || onboardingData.currentPostalCode,
          onboardingData.permanentAddress || null,
          onboardingData.permanentCity || null,
          onboardingData.permanentState || null,
          onboardingData.permanentPostalCode || null,
          onboardingData.currentAddress || null,
          onboardingData.currentCity || null,
          onboardingData.currentState || null,
          onboardingData.currentPostalCode || null,
          onboardingData.bankAccountNumber,
          onboardingData.bankName,
          onboardingData.bankBranch,
          onboardingData.ifscCode,
          onboardingData.panNumber,
          onboardingData.aadharNumber,
          onboardingData.passportNumber || null,
          uanNumber,
          bankDetailsStatus
        ]
      );

      // Update employee with gender if provided (check if column exists)
      if (onboardingData.gender) {
        try {
          // Check if gender column exists in employees table
          const columnCheck = await query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'employees' AND column_name = 'gender'
          `);
          
          if (columnCheck.rows.length > 0) {
            await query(
              `UPDATE employees SET gender = $1, updated_at = now() 
               WHERE id = $2`,
              [onboardingData.gender, employeeId]
            );
          } else {
            // Add gender column if it doesn't exist
            await query(`
              ALTER TABLE employees 
              ADD COLUMN IF NOT EXISTS gender TEXT
            `);
            await query(
              `UPDATE employees SET gender = $1, updated_at = now() 
               WHERE id = $2`,
              [onboardingData.gender, employeeId]
            );
          }
        } catch (error) {
          console.warn('Failed to update gender:', error);
          // Continue even if gender update fails
        }
      }

      if (uanNumber) {
        await query(
          `ALTER TABLE employees ADD COLUMN IF NOT EXISTS uan_number TEXT`
        );
        await query(
          `UPDATE employees
           SET uan_number = $1,
               updated_at = now()
           WHERE id = $2`,
          [uanNumber, employeeId]
        );
      }

      // Update employee onboarding status
      await query(
        `UPDATE employees
         SET onboarding_status = 'completed', must_change_password = false, updated_at = now()
         WHERE id = $1`,
        [employeeId]
      );

      await query('COMMIT');

      res.json({ success: true });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error submitting onboarding:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/bank-details/skip', authenticateToken, async (req, res) => {
  try {
    const { employeeId } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID required' });
    }

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

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

    await ensureOnboardingBankColumns();

    await query(
      `INSERT INTO onboarding_data (employee_id, bank_details_status, bank_account_number, bank_name, bank_branch, ifsc_code)
       VALUES ($1, $2, NULL, NULL, NULL, NULL)
       ON CONFLICT (employee_id)
       DO UPDATE SET 
         bank_details_status = $2,
         bank_account_number = NULL,
         bank_name = NULL,
         bank_branch = NULL,
         ifsc_code = NULL,
         updated_at = now()`,
      [employeeId, BANK_DETAILS_STATUS.SKIPPED]
    );

    res.json({ status: BANK_DETAILS_STATUS.SKIPPED });
  } catch (error) {
    console.error('Error skipping bank details:', error);
    res.status(500).json({ error: error.message || 'Failed to skip bank details' });
  }
});

// Upload document for onboarding
router.post('/upload-document', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    const { employeeId, documentType } = req.body;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID required' });
    }
    if (!documentType) {
      return res.status(400).json({ error: 'Document type required' });
    }

    const document = await persistDocumentUpload({
      req,
      file: req.file,
      candidateId: employeeId,
      docType: documentType.toUpperCase(),
      uploaderNotes: req.body.notes || null,
      consent: req.body.consent === 'true' || req.body.consent === true,
      source: 'candidate',
    });

    res.json({
      success: true,
      document: {
        id: document.id,
        file_name: document.file_name,
        document_type: document.document_type,
        uploaded_at: document.uploaded_at,
        status: document.status,
      },
      message: 'Document uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: error.message || 'Failed to upload document' });
  }
});

router.post('/documents/:docId/approve', authenticateToken, requireDocsFeature, ensureHrAccess, async (req, res) => {
  try {
    const { docId } = req.params;
    await ensureDocumentInfra();

    const docResult = await query(
      'SELECT * FROM onboarding_documents WHERE id = $1',
      [docId]
    );
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId || (docResult.rows[0].tenant_id && docResult.rows[0].tenant_id !== tenantId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const notes = req.body.notes || null;

    const updateResult = await query(
      `UPDATE onboarding_documents
       SET status = 'approved',
           verified_by = $1,
           verified_at = now(),
           hr_notes = COALESCE($2, hr_notes),
           tenant_id = COALESCE(tenant_id, $3)
       WHERE id = $4
       RETURNING *`,
      [req.user.id, notes, tenantId, docId]
    );

    const document = updateResult.rows[0];

    await recordDocumentAudit({
      tenantId,
      documentId: docId,
      actorId: req.user.id,
      action: 'document.approved',
      previousStatus: docResult.rows[0].status,
      nextStatus: 'approved',
      comment: notes,
    });

    await audit({
      actorId: req.user.id,
      action: 'document_approved',
      entityType: 'onboarding_document',
      entityId: docId,
      details: { doc_type: document.document_type },
    }).catch(() => {});

    await notifyDocumentOwner({
      tenantId,
      employeeId: document.employee_id,
      title: 'Document approved',
      message: `${DOCUMENT_TYPE_CATALOG[document.document_type]?.label || 'Document'} approved`,
    });

    const baseUrl = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    const payload = mapDocumentRow(document, { isHr: true, baseUrl });

    res.json({ success: true, document: payload });
  } catch (error) {
    console.error('Error approving document:', error);
    res.status(500).json({ error: error.message || 'Failed to approve document' });
  }
});

router.post('/documents/:docId/reject', authenticateToken, requireDocsFeature, ensureHrAccess, async (req, res) => {
  try {
    const { docId } = req.params;
    await ensureDocumentInfra();

    const docResult = await query(
      'SELECT * FROM onboarding_documents WHERE id = $1',
      [docId]
    );
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId || (docResult.rows[0].tenant_id && docResult.rows[0].tenant_id !== tenantId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const reason = req.body.reason || req.body.notes || null;

    const updateResult = await query(
      `UPDATE onboarding_documents
       SET status = 'rejected',
           verified_by = NULL,
           verified_at = NULL,
           hr_notes = COALESCE($1, hr_notes),
           tenant_id = COALESCE(tenant_id, $2)
       WHERE id = $3
       RETURNING *`,
      [reason, tenantId, docId]
    );

    const document = updateResult.rows[0];

    await recordDocumentAudit({
      tenantId,
      documentId: docId,
      actorId: req.user.id,
      action: 'document.rejected',
      previousStatus: docResult.rows[0].status,
      nextStatus: 'rejected',
      comment: reason,
    });

    await audit({
      actorId: req.user.id,
      action: 'document_rejected',
      entityType: 'onboarding_document',
      entityId: docId,
      details: { reason },
    }).catch(() => {});

    await notifyDocumentOwner({
      tenantId,
      employeeId: document.employee_id,
      title: 'Document rejected',
      message: reason || 'Please re-upload the document',
      type: 'document_rejected',
    });

    const baseUrl = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, document: mapDocumentRow(document, { isHr: true, baseUrl }) });
  } catch (error) {
    console.error('Error rejecting document:', error);
    res.status(500).json({ error: error.message || 'Failed to reject document' });
  }
});

router.post('/documents/:docId/request-resubmission', authenticateToken, requireDocsFeature, ensureHrAccess, async (req, res) => {
  try {
    const { docId } = req.params;
    await ensureDocumentInfra();

    const docResult = await query(
      'SELECT * FROM onboarding_documents WHERE id = $1',
      [docId]
    );
    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId || (docResult.rows[0].tenant_id && docResult.rows[0].tenant_id !== tenantId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const note = req.body.note || req.body.reason || null;

    const updateResult = await query(
      `UPDATE onboarding_documents
       SET status = 'resubmission_requested',
           hr_notes = COALESCE($1, hr_notes),
           verified_by = NULL,
           verified_at = NULL,
           tenant_id = COALESCE(tenant_id, $2)
       WHERE id = $3
       RETURNING *`,
      [note, tenantId, docId]
    );

    const document = updateResult.rows[0];

    await recordDocumentAudit({
      tenantId,
      documentId: docId,
      actorId: req.user.id,
      action: 'document.resubmission_requested',
      previousStatus: docResult.rows[0].status,
      nextStatus: 'resubmission_requested',
      comment: note,
    });

    await notifyDocumentOwner({
      tenantId,
      employeeId: document.employee_id,
      title: 'Document needs attention',
      message: note || 'Please re-submit the requested document',
      type: 'document_resubmit',
    });

    const baseUrl = process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    res.json({ success: true, document: mapDocumentRow(document, { isHr: true, baseUrl }) });
  } catch (error) {
    console.error('Error requesting resubmission:', error);
    res.status(500).json({ error: error.message || 'Failed to request resubmission' });
  }
});
// Get documents for an employee
router.get('/documents/:employeeId', authenticateToken, async (req, res) => {
  try {
    const documents = await listDocumentsForCandidate({
      req,
      candidateId: req.params.employeeId,
      filters: {
        status: req.query.status,
        doc_type: req.query.doc_type,
      },
    });
    res.json({ success: true, documents });
  } catch (error) {
    const status = error.status || 500;
    console.error('Error fetching documents:', error);
    res.status(status).json({ error: error.message || 'Failed to fetch documents' });
  }
});

// Download document
router.get('/documents/:documentId/download', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;
    const docResult = await query(
      `SELECT d.*, 
              COALESCE(d.tenant_id, e.tenant_id) as tenant_id,
              e.user_id as employee_user_id
       FROM onboarding_documents d
       LEFT JOIN employees e ON e.id = d.employee_id
       WHERE d.id = $1`,
      [documentId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult.rows[0];

    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId || tenantId !== document.tenant_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const roles = await getUserRoles(req.user.id);
    const isHr = isHrRole(roles);

    // Allow access if: HR, employee owner, or user who uploaded the document
    const isOwner = document.employee_user_id === req.user.id;
    const isUploader = document.uploaded_by === req.user.id;

    if (!isHr && !isOwner && !isUploader) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    let streamResult;
    try {
      const key = document.storage_key || document.object_key || document.file_path;
      if (!key) {
        return res.status(404).json({ error: 'Document storage key not found' });
      }
      streamResult = await getDocumentStream(key);
    } catch (error) {
      console.error('Failed to load document from storage', error);
      return res.status(404).json({ error: 'File not found' });
    }

    if (streamResult.contentType) {
      res.setHeader('Content-Type', streamResult.contentType);
    }
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.file_name || 'document'}"`
    );
    streamResult.stream.pipe(res);
  } catch (error) {
    console.error('Error downloading document:', error);
    if (!res.headersSent) {
    res.status(500).json({ error: error.message || 'Failed to download document' });
    }
  }
});

export default router;
