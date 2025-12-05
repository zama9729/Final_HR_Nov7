import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { audit } from '../utils/auditLog.js';
import { getPresignedGetUrl } from '../services/storage.js';
import { linkDocumentsToBackgroundCheck } from '../utils/backgroundCheckDocs.js';

const router = express.Router();

/**
 * Get user roles helper
 */
const getUserRoles = async (userId) => {
  const result = await query(
    'SELECT role FROM user_roles WHERE user_id = $1',
    [userId]
  );
  return result.rows.map((r) => r.role?.toLowerCase()).filter(Boolean);
};

/**
 * Check if user has HR role
 */
const isHrRole = (roles = []) => roles.some((role) =>
  ['hr', 'hrbp', 'hradmin', 'admin', 'ceo', 'director'].includes(role)
);

/**
 * Ensure HR access middleware
 */
const ensureHrAccess = async (req, res, next) => {
  const roles = await getUserRoles(req.user.id);
  if (!isHrRole(roles)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  req.userRoles = roles;
  return next();
};

const notifyOnboardingApproval = async ({ tenantId, employeeId, title, message }) => {
  if (!tenantId || !employeeId) return;
  try {
    const userResult = await query('SELECT user_id FROM employees WHERE id = $1', [employeeId]);
    const userId = userResult.rows[0]?.user_id;
    if (!userId) return;

    await query(
      `INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
       VALUES ($1, $2, $3, $4, 'onboarding', now())`,
      [tenantId, userId, title, message]
    );
  } catch (error) {
    console.warn('Failed to send onboarding approval notification:', error.message);
  }
};

/**
 * Get tenant ID for user
 */
const getTenantIdForUser = async (userId) => {
  const result = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return result.rows[0]?.tenant_id || null;
};

/**
 * GET /api/onboarding/:candidateId/background-check
 * Get background check status and documents for a candidate
 */
router.get('/:candidateId/background-check', authenticateToken, async (req, res) => {
  try {
    const { candidateId } = req.params;
    const tenantId = await getTenantIdForUser(req.user.id);
    
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Check permissions
    const roles = await getUserRoles(req.user.id);
    const isHr = isHrRole(roles);
    
    // Check if user is viewing their own data
    const employeeCheck = await query(
      'SELECT id, user_id, tenant_id FROM employees WHERE id = $1',
      [candidateId]
    );
    
    if (employeeCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    
    const employee = employeeCheck.rows[0];
    if (employee.tenant_id !== tenantId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const isSelf = employee.user_id === req.user.id;
    if (!isHr && !isSelf) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Get background check record
    const bgCheckResult = await query(
      `SELECT * FROM background_checks WHERE employee_id = $1`,
      [candidateId]
    );

    let backgroundCheck = bgCheckResult.rows[0];

    // If no background check exists, create one
    if (!backgroundCheck) {
      const insertResult = await query(
        `INSERT INTO background_checks (employee_id, tenant_id, status)
         VALUES ($1, $2, 'pending')
         RETURNING *`,
        [candidateId, tenantId]
      );
      backgroundCheck = insertResult.rows[0];
    }

    if (backgroundCheck?.id) {
      await linkDocumentsToBackgroundCheck(backgroundCheck.id, candidateId);
    }

    // Get all documents linked to this background check
    const documentsResult = await query(
      `SELECT 
        d.id,
        d.document_type,
        d.file_name,
        d.mime_type,
        d.file_size,
        d.status as document_status,
        d.uploaded_at,
        d.storage_key,
        bcd.verification_status,
        bcd.hr_comment,
        bcd.is_required,
        bcd.verified_by,
        bcd.verified_at,
        json_build_object('id', up.id, 'first_name', up.first_name, 'last_name', up.last_name) as uploaded_by_user,
        json_build_object('id', vp.id, 'first_name', vp.first_name, 'last_name', vp.last_name) as verified_by_user
      FROM background_check_documents bcd
      JOIN onboarding_documents d ON d.id = bcd.document_id
      LEFT JOIN profiles up ON up.id = d.uploaded_by
      LEFT JOIN profiles vp ON vp.id = bcd.verified_by
      WHERE bcd.background_check_id = $1
      ORDER BY d.uploaded_at DESC`,
      [backgroundCheck.id]
    );

    // Get all required documents that should be part of background check
    const requiredDocTypes = [
      'RESUME',
      'ID_PROOF',
      'PAN',
      'AADHAAR',
      'PASSPORT',
      'EDUCATION_CERT',
      'EXPERIENCE_LETTER',
      'ADDRESS_PROOF',
      'BANK_STATEMENT',
      'SIGNED_CONTRACT',
      'BG_CHECK_DOC',
    ];
    
    // Get all uploaded documents for this employee (even if not linked to BG check yet)
    const allDocsResult = await query(
      `SELECT id, document_type, file_name, status, uploaded_at
       FROM onboarding_documents
      WHERE (employee_id = $1 OR candidate_id = $1)
      AND document_type = ANY($2::text[])
       ORDER BY uploaded_at DESC`,
      [candidateId, requiredDocTypes]
    );

    const documents = await Promise.all(
      documentsResult.rows.map(async (doc) => {
        let downloadUrl = null;
        if (isHr || isSelf) {
          const objectKey = doc.storage_key || null;
          if (objectKey) {
            try {
              downloadUrl = await getPresignedGetUrl({ objectKey, expiresIn: 300 });
            } catch (error) {
              console.warn('Failed to generate download url for document', doc.id, error.message);
            }
          }
        }

        return {
          id: doc.id,
          document_type: doc.document_type,
          file_name: doc.file_name,
          mime_type: doc.mime_type,
          file_size: doc.file_size,
          document_status: doc.document_status,
          verification_status: doc.verification_status,
          hr_comment: doc.hr_comment,
          is_required: doc.is_required,
          uploaded_at: doc.uploaded_at,
          uploaded_by: doc.uploaded_by_user,
          verified_by: doc.verified_by_user,
          verified_at: doc.verified_at,
          download_url: downloadUrl,
        };
      })
    );

    // Count statuses
    const statusCounts = {
      pending: documents.filter(d => d.verification_status === 'PENDING').length,
      approved: documents.filter(d => d.verification_status === 'APPROVED').length,
      hold: documents.filter(d => d.verification_status === 'HOLD').length,
      rejected: documents.filter(d => d.verification_status === 'REJECTED').length,
    };

    res.json({
      background_check: {
        id: backgroundCheck.id,
        employee_id: backgroundCheck.employee_id,
        status: backgroundCheck.status,
        has_prior_background_check: backgroundCheck.has_prior_background_check,
        prior_bg_check_verified_by: backgroundCheck.prior_bg_check_verified_by,
        prior_bg_check_verified_at: backgroundCheck.prior_bg_check_verified_at,
        prior_bg_check_notes: backgroundCheck.prior_bg_check_notes,
        initiated_at: backgroundCheck.initiated_at,
        completed_at: backgroundCheck.completed_at,
        notes: backgroundCheck.notes,
        created_at: backgroundCheck.created_at,
        updated_at: backgroundCheck.updated_at,
      },
      documents,
      status_counts: statusCounts,
      all_uploaded_docs: allDocsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching background check:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch background check' });
  }
});

/**
 * POST /api/onboarding/:candidateId/background-check/documents/:docId/approve
 * Approve a document in background check
 */
router.post('/:candidateId/background-check/documents/:docId/approve', 
  authenticateToken, 
  ensureHrAccess, 
  async (req, res) => {
    try {
      const { candidateId, docId } = req.params;
      const { comment } = req.body;
      const tenantId = await getTenantIdForUser(req.user.id);

      if (!tenantId) {
        return res.status(403).json({ error: 'No organization found' });
      }

      // Verify document belongs to candidate
      const docResult = await query(
        `SELECT d.*, COALESCE(d.tenant_id, e.tenant_id) as tenant_id
         FROM onboarding_documents d
         LEFT JOIN employees e ON e.id = d.employee_id
         WHERE d.id = $1 AND (d.employee_id = $2 OR d.candidate_id = $2)`,
        [docId, candidateId]
      );

      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = docResult.rows[0];
      if (document.tenant_id !== tenantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Get or create background check
      let bgCheckResult = await query(
        'SELECT id FROM background_checks WHERE employee_id = $1',
        [candidateId]
      );

      let bgCheckId;
      if (bgCheckResult.rows.length === 0) {
        const insertResult = await query(
        `INSERT INTO background_checks (employee_id, tenant_id, status)
         VALUES ($1, $2, 'in_progress')
           RETURNING id`,
          [candidateId, tenantId]
        );
        bgCheckId = insertResult.rows[0].id;
      } else {
        bgCheckId = bgCheckResult.rows[0].id;
      }

      // Link document to background check if not already linked
      await query(
        `INSERT INTO background_check_documents (background_check_id, document_id, onboarding_document_id, is_required, verification_status, decision)
         VALUES ($1, $2, $2, true, 'PENDING', 'pending')
         ON CONFLICT (background_check_id, document_id) DO NOTHING`,
        [bgCheckId, docId]
      );

      // Update document verification status
      await query(
        `UPDATE background_check_documents
         SET verification_status = 'APPROVED',
             verified_by = $1,
             verified_at = now(),
             hr_comment = COALESCE($2, hr_comment)
         WHERE background_check_id = $3 AND document_id = $4`,
        [req.user.id, comment, bgCheckId, docId]
      );

      // Update document status
      await query(
        `UPDATE onboarding_documents
         SET status = 'approved',
             verified_by = $1,
             verified_at = now(),
             hr_notes = COALESCE($2, hr_notes)
         WHERE id = $3`,
        [req.user.id, comment, docId]
      );

      // Check if all required documents are approved
      const requiredDocsResult = await query(
        `SELECT COUNT(*) as total,
                SUM(CASE WHEN verification_status = 'APPROVED' THEN 1 ELSE 0 END) as approved
         FROM background_check_documents
         WHERE background_check_id = $1 AND is_required = true`,
        [bgCheckId]
      );

      const { total, approved } = requiredDocsResult.rows[0];
      if (parseInt(total) > 0 && parseInt(approved) === parseInt(total)) {
        // All required documents approved, mark background check as completed
        await query(
          `UPDATE background_checks
           SET status = 'completed',
               completed_at = now(),
               completed_by = $1
           WHERE id = $2`,
          [req.user.id, bgCheckId]
        );

        // Update employee onboarding status if all steps are done
        await query(
          `UPDATE employees
           SET onboarding_status_extended = 'ONBOARDING_COMPLETED',
               updated_at = now()
           WHERE id = $1`,
          [candidateId]
        );

        await notifyOnboardingApproval({
          tenantId,
          employeeId: candidateId,
          title: 'Onboarding approved',
          message: 'Your onboarding is approved. Welcome aboard!',
        });
      }

      await audit({
        actorId: req.user.id,
        action: 'background_check_document_approved',
        entityType: 'onboarding_document',
        entityId: docId,
        details: { candidate_id: candidateId, comment },
      }).catch(() => {});

        res.json({ 
          success: true, 
          message: 'Document approved',
          background_check_status: parseInt(approved) === parseInt(total) ? 'completed' : 'in_progress'
        });
    } catch (error) {
      console.error('Error approving document:', error);
      res.status(500).json({ error: error.message || 'Failed to approve document' });
    }
  }
);

/**
 * POST /api/onboarding/:candidateId/background-check/documents/:docId/hold
 * Put a document on hold (request clarification)
 */
router.post('/:candidateId/background-check/documents/:docId/hold',
  authenticateToken,
  ensureHrAccess,
  async (req, res) => {
    try {
      const { candidateId, docId } = req.params;
      const { comment } = req.body;

      if (!comment || comment.trim().length === 0) {
        return res.status(400).json({ error: 'Comment is required when putting document on hold' });
      }

      const tenantId = await getTenantIdForUser(req.user.id);
      if (!tenantId) {
        return res.status(403).json({ error: 'No organization found' });
      }

      // Verify document
      const docResult = await query(
        `SELECT d.*, COALESCE(d.tenant_id, e.tenant_id) as tenant_id
         FROM onboarding_documents d
         LEFT JOIN employees e ON e.id = d.employee_id
         WHERE d.id = $1 AND (d.employee_id = $2 OR d.candidate_id = $2)`,
        [docId, candidateId]
      );

      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = docResult.rows[0];
      if (document.tenant_id !== tenantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Get background check
      const bgCheckResult = await query(
        'SELECT id FROM background_checks WHERE employee_id = $1',
        [candidateId]
      );

      if (bgCheckResult.rows.length === 0) {
        return res.status(404).json({ error: 'Background check not found' });
      }

      const bgCheckId = bgCheckResult.rows[0].id;

      // Update document verification status to HOLD
      await query(
        `UPDATE background_check_documents
         SET verification_status = 'HOLD',
             hr_comment = $1,
             verified_by = NULL,
             verified_at = NULL
         WHERE background_check_id = $2 AND document_id = $3`,
        [comment, bgCheckId, docId]
      );

      // Update background check status
      await query(
        `UPDATE background_checks
         SET status = 'on_hold',
         notes = COALESCE($1, notes)
         WHERE id = $2`,
        [comment, bgCheckId]
      );

      // Update employee onboarding status
      await query(
        `UPDATE employees
         SET onboarding_status_extended = 'BG_CHECK_HOLD'
         WHERE id = $1`,
        [candidateId]
      );

      // Update document status
      await query(
        `UPDATE onboarding_documents
         SET status = 'hold',
             hr_notes = $1
         WHERE id = $2`,
        [comment, docId]
      );

      // TODO: Send notification to candidate

      await audit({
        actorId: req.user.id,
        action: 'background_check_document_hold',
        entityType: 'onboarding_document',
        entityId: docId,
        details: { candidate_id: candidateId, comment },
      }).catch(() => {});

      res.json({ success: true, message: 'Document put on hold' });
    } catch (error) {
      console.error('Error putting document on hold:', error);
      res.status(500).json({ error: error.message || 'Failed to put document on hold' });
    }
  }
);

/**
 * POST /api/onboarding/:candidateId/background-check/documents/:docId/unhold
 * Clear HOLD and move document back to pending
 */
router.post('/:candidateId/background-check/documents/:docId/unhold',
  authenticateToken,
  ensureHrAccess,
  async (req, res) => {
    try {
      const { candidateId, docId } = req.params;
      const { comment } = req.body || {};

      const tenantId = await getTenantIdForUser(req.user.id);
      if (!tenantId) {
        return res.status(403).json({ error: 'No organization found' });
      }

      // Verify document
      const docResult = await query(
        `SELECT d.*, COALESCE(d.tenant_id, e.tenant_id) as tenant_id
         FROM onboarding_documents d
         LEFT JOIN employees e ON e.id = d.employee_id
         WHERE d.id = $1 AND (d.employee_id = $2 OR d.candidate_id = $2)`,
        [docId, candidateId]
      );

      if (docResult.rows.length === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }

      const document = docResult.rows[0];
      if (document.tenant_id !== tenantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Get background check
      const bgCheckResult = await query(
        'SELECT id FROM background_checks WHERE employee_id = $1',
        [candidateId]
      );

      if (bgCheckResult.rows.length === 0) {
        return res.status(404).json({ error: 'Background check not found' });
      }

      const bgCheckId = bgCheckResult.rows[0].id;

      // Reset document verification status back to PENDING
      await query(
        `UPDATE background_check_documents
         SET verification_status = 'PENDING',
             hr_comment = COALESCE($1, hr_comment),
             verified_by = NULL,
             verified_at = NULL
         WHERE background_check_id = $2 AND document_id = $3`,
        [comment || null, bgCheckId, docId]
      );

      // If background check was on_hold, move it back to in_progress
      await query(
        `UPDATE background_checks
         SET status = 'in_progress',
             updated_at = now()
         WHERE id = $1 AND status = 'on_hold'`,
        [bgCheckId]
      );

      // Reset onboarding document status back to 'uploaded' (pending review)
      await query(
        `UPDATE onboarding_documents
         SET status = 'uploaded',
             hr_notes = COALESCE($1, hr_notes)
         WHERE id = $2`,
        [comment || null, docId]
      );

      await audit({
        actorId: req.user.id,
        action: 'background_check_document_unhold',
        entityType: 'onboarding_document',
        entityId: docId,
        details: { candidate_id: candidateId, comment },
      }).catch(() => {});

      res.json({ success: true, message: 'Document moved back to pending' });
    } catch (error) {
      console.error('Error unholding document:', error);
      res.status(500).json({ error: error.message || 'Failed to unhold document' });
    }
  }
);

/**
 * POST /api/onboarding/:candidateId/background-check/complete
 * Mark background check as complete (for prior background check scenario)
 */
router.post('/:candidateId/background-check/complete',
  authenticateToken,
  ensureHrAccess,
  async (req, res) => {
    try {
      const { candidateId } = req.params;
      const { notes, prior_bg_check_verified } = req.body;
      const tenantId = await getTenantIdForUser(req.user.id);

      if (!tenantId) {
        return res.status(403).json({ error: 'No organization found' });
      }

      // Get or create background check
      let bgCheckResult = await query(
        'SELECT id FROM background_checks WHERE employee_id = $1',
        [candidateId]
      );

      let bgCheckId;
      if (bgCheckResult.rows.length === 0) {
        const insertResult = await query(
          `INSERT INTO background_checks (employee_id, tenant_id, status)
           VALUES ($1, $2, 'completed')
           RETURNING id`,
          [candidateId, tenantId]
        );
        bgCheckId = insertResult.rows[0].id;
      } else {
        bgCheckId = bgCheckResult.rows[0].id;
      }

      // Update background check
      await query(
        `UPDATE background_checks
         SET status = 'completed',
             has_prior_background_check = $1,
             prior_bg_check_verified_by = CASE WHEN $1 THEN $2 ELSE NULL END,
             prior_bg_check_verified_at = CASE WHEN $1 THEN now() ELSE NULL END,
             prior_bg_check_notes = CASE WHEN $1 THEN $3 ELSE NULL END,
             completed_at = now(),
             completed_by = $2,
             notes = $3
         WHERE id = $4`,
        [prior_bg_check_verified || false, req.user.id, notes, bgCheckId]
      );

      // Auto-approve all linked documents if prior BG check is verified
      if (prior_bg_check_verified) {
        await query(
          `UPDATE background_check_documents
           SET verification_status = 'APPROVED',
               verified_by = $1,
               verified_at = now(),
               hr_comment = 'Auto-approved via prior background check verification'
           WHERE background_check_id = $2`,
          [req.user.id, bgCheckId]
        );
      }

      // Update employee onboarding status
      await query(
        `UPDATE employees
         SET onboarding_status_extended = 'ONBOARDING_COMPLETED',
             updated_at = now()
         WHERE id = $1`,
        [candidateId]
      );

      await notifyOnboardingApproval({
        tenantId,
        employeeId: candidateId,
        title: 'Onboarding approved',
        message: 'Your onboarding is approved. Welcome aboard!',
      });

      await audit({
        actorId: req.user.id,
        action: 'background_check_completed',
        entityType: 'background_check',
        entityId: bgCheckId,
        details: { candidate_id: candidateId, prior_bg_check_verified },
      }).catch(() => {});

      res.json({ success: true, message: 'Background check marked as completed' });
    } catch (error) {
      console.error('Error completing background check:', error);
      res.status(500).json({ error: error.message || 'Failed to complete background check' });
    }
  }
);

export default router;

