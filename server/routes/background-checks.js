import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { audit } from '../utils/auditLog.js';
import { getPresignedGetUrl } from '../services/storage.js';
import { linkDocumentsToBackgroundCheck } from '../utils/backgroundCheckDocs.js';

const router = express.Router();
const FEATURE_ENABLED = process.env.TERMINATION_REHIRE_V1 !== 'false';

const getTenantId = async (userId) => {
  const { rows } = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return rows[0]?.tenant_id || null;
};

const getUserRoles = async (userId) => {
  const { rows } = await query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return rows.map((r) => r.role?.toLowerCase()).filter(Boolean);
};

const notifyOnboardingApproval = async ({ tenantId, employeeId, title, message }) => {
  if (!tenantId || !employeeId) {
    console.warn('notifyOnboardingApproval: Missing tenantId or employeeId', { tenantId, employeeId });
    return;
  }
  try {
    const userResult = await query('SELECT user_id FROM employees WHERE id = $1', [employeeId]);
    const userId = userResult.rows[0]?.user_id;
    if (!userId) {
      console.warn('notifyOnboardingApproval: No user_id found for employee', employeeId);
      return;
    }

    const result = await query(
      `INSERT INTO notifications (tenant_id, user_id, title, message, type, created_at)
       VALUES ($1, $2, $3, $4, 'onboarding', now())
       RETURNING id`,
      [tenantId, userId, title, message]
    );
    console.log('Onboarding approval notification sent:', { notificationId: result.rows[0]?.id, userId, employeeId });
  } catch (error) {
    console.error('Failed to send onboarding approval notification:', error.message, error.stack);
  }
};

router.use((req, res, next) => {
  if (!FEATURE_ENABLED) {
    return res.status(404).json({ error: 'termination_rehire_v1 feature flag disabled' });
  }
  next();
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { rows } = await query(
      `
      SELECT 
        bc.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'department', e.department
        ) AS employee,
        json_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) AS employee_profile
      FROM background_checks bc
      LEFT JOIN employees e ON e.id = bc.employee_id
      LEFT JOIN profiles p ON p.id = e.user_id
      WHERE bc.tenant_id = $1
      ORDER BY bc.created_at DESC
      LIMIT 200
      `,
      [tenantId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching background checks:', error);
    res.status(500).json({ error: 'Failed to fetch background checks' });
  }
});

// Get background check status for employee
router.get('/employee/:employeeId', authenticateToken, async (req, res) => {
  try {
    // Ensure table exists before querying
    await ensureBackgroundCheckInfrastructure();
    
    const { employeeId } = req.params;

    // Check if user can access this employee
    const empCheck = await query(
      `SELECT e.id, e.user_id, e.department, e.tenant_id
       FROM employees e
       WHERE e.id = $1`,
      [employeeId]
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const emp = empCheck.rows[0];

    // Owner can see their own, HR/Director can see based on role
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const userTenantId = tenantResult.rows[0]?.tenant_id;

    if (emp.user_id !== req.user.id && emp.tenant_id !== userTenantId) {
      // Check if user has HR/Director role
      const roleResult = await query(
        'SELECT role FROM user_roles WHERE user_id = $1',
        [req.user.id]
      );
      const userRole = roleResult.rows[0]?.role;

      if (!['hr', 'director', 'ceo', 'admin'].includes(userRole)) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Director can only see their department
      if (userRole === 'director') {
        const userEmpResult = await query(
          'SELECT department FROM employees WHERE user_id = $1',
          [req.user.id]
        );
        const userDept = userEmpResult.rows[0]?.department;
        if (userDept !== emp.department) {
          return res.status(403).json({ error: 'Unauthorized' });
        }
      }
    }

    // Get background checks
    const checksResult = await query(
      `SELECT 
        bc.*,
        json_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name
        ) as initiated_by_user
       FROM background_checks bc
       LEFT JOIN profiles p ON p.id = bc.initiated_by
       WHERE bc.employee_id = $1
       ORDER BY bc.created_at DESC`,
      [employeeId]
    );

    res.json(checksResult.rows);
  } catch (error) {
    console.error('Error fetching background check status:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch background check status' });
  }
});

// Trigger background check (HR only)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const roles = await getUserRoles(req.user.id);
    if (!roles.some((role) => ['hr', 'admin', 'orgadmin'].includes(role))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const {
      employee_id,
      candidate_id,
      type = 'prehire',
      vendor_id,
      notes,
      consent,
      scope,
      attach_doc_ids,
    } = req.body;

    if (!employee_id && !candidate_id) {
      return res.status(400).json({ error: 'Provide employee_id or candidate_id' });
    }

    if (employee_id) {
      const { rows } = await query('SELECT tenant_id FROM employees WHERE id = $1', [employee_id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found' });
      }
      if (rows[0].tenant_id !== tenantId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    const verificationScope = Array.isArray(scope) ? scope : (scope ? [scope] : null);
    const insertResult = await query(
      `
      INSERT INTO background_checks (
        tenant_id,
        candidate_id,
        employee_id,
        type,
        status,
        vendor_id,
        consent_snapshot,
        request_payload,
        initiated_by,
        verification_scope
      )
      VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9)
      RETURNING *
      `,
      [
        tenantId,
        candidate_id || null,
        employee_id || null,
        type,
        vendor_id || null,
        JSON.stringify(
          consent || {
            captured: new Date().toISOString(),
            scope: scope || {},
          }
        ),
        JSON.stringify({ scope: scope || {} }),
        req.user.id,
        verificationScope,
      ]
    );

    const check = insertResult.rows[0];

    await query(
      `
      INSERT INTO background_check_events (check_id, event_type, actor, note, payload)
      VALUES ($1,'initiated',$2,$3,$4)
      `,
      [check.id, req.user.id, notes || null, JSON.stringify({ scope })]
    );

    if (Array.isArray(attach_doc_ids) && attach_doc_ids.length > 0) {
      const { rows: documents } = await query(
        `SELECT id, employee_id, tenant_id FROM onboarding_documents WHERE id = ANY($1::uuid[])`,
        [attach_doc_ids]
      );

      const unmatched = attach_doc_ids.filter(
        (docId) => !documents.find((doc) => doc.id === docId)
      );
      if (unmatched.length > 0) {
        return res.status(400).json({ error: 'One or more documents not found' });
      }

      for (const doc of documents) {
        if (doc.tenant_id && doc.tenant_id !== tenantId) {
          return res.status(403).json({ error: 'Document tenant mismatch' });
        }
        if (employee_id && doc.employee_id && doc.employee_id !== employee_id) {
          return res.status(400).json({ error: 'Document does not belong to employee' });
        }
        await query(
          `INSERT INTO background_check_documents (
             background_check_id,
             document_id,
             onboarding_document_id,
             is_required,
             verification_status,
             decision
           )
           VALUES ($1, $2, $2, true, 'PENDING', 'pending')
           ON CONFLICT DO NOTHING`,
          [check.id, doc.id]
        );
      }
    }

    await audit({
      actorId: req.user.id,
      action: 'background_check_initiated',
      entityType: 'background_check',
      entityId: check.id,
      details: { type, vendor_id },
    });

    res.status(201).json(check);
  } catch (error) {
    console.error('Error creating background check:', error);
    res.status(500).json({ error: error.message || 'Failed to create background check' });
  }
});

// Update background check status (HR only)
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, result_summary, notes, verification_result, verification_scope } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const validStatuses = [
      'pending',
      'in_progress',
      'vendor_delay',
      'completed_green',
      'completed_amber',
      'completed_red',
      'cancelled',
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const checkResult = await query(
      'SELECT * FROM background_checks WHERE id = $1',
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Background check not found' });
    }

    const check = checkResult.rows[0];

    // Update status
    const scopeArray = Array.isArray(verification_scope)
      ? verification_scope
      : verification_scope
      ? [verification_scope]
      : check.verification_scope;

    await query(
      `
      UPDATE background_checks
      SET status = $1,
          result_summary = COALESCE($2,result_summary),
          notes = COALESCE($3, notes),
          completed_at = CASE WHEN $1 LIKE 'completed%' THEN now() ELSE completed_at END,
          updated_at = now(),
          verification_result = COALESCE($4, verification_result),
          verification_scope = COALESCE($5, verification_scope)
      WHERE id = $6
      `,
      [
        status,
        result_summary ? JSON.stringify(result_summary) : null,
        notes || null,
        verification_result || null,
        scopeArray,
        id,
      ]
    );

    await query(
      `
      INSERT INTO background_check_events (check_id, event_type, actor, note, payload)
      VALUES ($1,'status_update',$2,$3,$4)
      `,
      [id, req.user.id, notes || null, JSON.stringify({ new_status: status, result_summary, verification_result })]
    );

    if (check.employee_id && verification_result) {
      const resultLower = verification_result.toLowerCase();
      if (resultLower === 'accepted') {
        await query(
          `UPDATE employees
           SET verified_by = $1,
               verified_at = now(),
               verified_scope = $2
           WHERE id = $3`,
          [req.user.id, scopeArray, check.employee_id]
        );
      } else if (['rejected', 'needs review', 'needs_review'].includes(resultLower)) {
        await query(
          `UPDATE employees
           SET verified_by = NULL,
               verified_at = NULL,
               verified_scope = NULL
           WHERE id = $1`,
          [check.employee_id]
        );
      }
    }

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'background_check_status_updated',
      entityType: 'background_check',
      entityId: id,
      details: { status, result_summary, notes, verification_result },
      diff: { old_status: check.status, new_status: status },
    });

    res.json({ success: true, message: 'Background check status updated' });
  } catch (error) {
    console.error('Error updating background check status:', error);
    res.status(500).json({ error: error.message || 'Failed to update background check status' });
  }
});

router.get('/:id/report', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const { rows } = await query(
      `
      SELECT * FROM background_checks
      WHERE id = $1 AND tenant_id = $2
      `,
      [req.params.id, tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Background check not found' });
    }
    const checkRecord = rows[0];

    const events = await query(
      `
      SELECT * FROM background_check_events
      WHERE check_id = $1
      ORDER BY created_at ASC
      `,
      [req.params.id]
    );
    
    // Get all relevant onboarding documents for this employee (both linked and unlinked)
    // This ensures HR can see all documents even if auto-linking didn't work
    let attachmentResult = { rows: [] };
    
    if (checkRecord?.employee_id) {
      try {
        await linkDocumentsToBackgroundCheck(checkRecord.id, checkRecord.employee_id);
      } catch (linkError) {
        console.warn('Error linking documents to background check:', linkError.message);
        // Continue even if linking fails
      }
      
      try {
        attachmentResult = await query(
          `
          SELECT 
            d.id,
            d.document_type,
            d.file_name,
            d.mime_type,
            d.file_size,
            d.status AS document_status,
            d.storage_key,
            d.file_path,
            d.uploaded_at,
            d.hr_notes,
            COALESCE(bcd.verification_status::text, bcd.decision, d.status::text) AS decision,
            COALESCE(bcd.notes, d.hr_notes) AS notes,
            bcd.verified_by,
            bcd.verified_at
          FROM onboarding_documents d
          LEFT JOIN background_check_documents bcd ON bcd.document_id = d.id AND bcd.background_check_id = $1
          WHERE (d.employee_id = $2 OR d.candidate_id = $2)
            AND UPPER(d.document_type) IN ('RESUME', 'ID_PROOF', 'PAN', 'AADHAAR', 'AADHAR', 'PASSPORT', 'EDUCATION_CERT', 'EXPERIENCE_LETTER', 'ADDRESS_PROOF', 'BANK_STATEMENT', 'SIGNED_CONTRACT', 'BG_CHECK_DOC')
          ORDER BY d.uploaded_at DESC
          `,
          [req.params.id, checkRecord.employee_id]
        );
      } catch (queryError) {
        console.error('Error fetching attachments:', queryError);
        // Return empty attachments array if query fails
        attachmentResult = { rows: [] };
      }
    }

    const attachments = await Promise.all(
      attachmentResult.rows.map(async (doc) => {
        let downloadUrl = null;
        const objectKey = doc.storage_key || doc.file_path;
        if (objectKey) {
          try {
            downloadUrl = await getPresignedGetUrl({ objectKey, expiresIn: 300 });
          } catch (error) {
            console.warn('Failed to generate download url for document', doc.id, error.message);
          }
        }

        return {
          id: doc.id,
          document_type: doc.document_type,
          file_name: doc.file_name,
          mime_type: doc.mime_type,
          file_size: doc.file_size,
          uploaded_at: doc.uploaded_at,
          status: doc.document_status,
          decision: doc.decision,
          notes: doc.notes || doc.hr_notes,
          verified_by: doc.verified_by,
          verified_at: doc.verified_at,
          download_url: downloadUrl,
        };
      })
    );

    // Check if all documents are approved and update status accordingly
    if (checkRecord?.employee_id && attachments.length > 0) {
      // Check approval status from background_check_documents table
      const approvalCheckResult = await query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN verification_status = 'APPROVED' THEN 1 ELSE 0 END) as approved
         FROM background_check_documents
         WHERE background_check_id = $1`,
        [checkRecord.id]
      );
      
      const { total, approved } = approvalCheckResult.rows[0];
      const totalCount = parseInt(total) || 0;
      const approvedCount = parseInt(approved) || 0;
      
      if (totalCount > 0 && approvedCount === totalCount) {
        // All documents approved - mark as completed
        if (checkRecord.status !== 'completed_green' && checkRecord.status !== 'completed_amber' && checkRecord.status !== 'completed_red') {
          // Try to add completed_by column if it doesn't exist (idempotent)
          try {
            await query(`ALTER TABLE background_checks ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES profiles(id)`);
          } catch (alterError) {
            // Column might already exist, ignore error
            console.warn('Note: completed_by column check:', alterError.message);
          }
          
          // Update with completed_by if possible
          try {
            await query(
              `UPDATE background_checks 
               SET status = 'completed_green'::background_check_status_enum, 
                   completed_at = COALESCE(completed_at, now()),
                   completed_by = COALESCE(completed_by, $1),
                   updated_at = now() 
               WHERE id = $2`,
              [req.user.id, checkRecord.id]
            );
          } catch (updateError) {
            // Fallback if completed_by column doesn't exist
            if (updateError.message.includes('completed_by')) {
              await query(
                `UPDATE background_checks 
                 SET status = 'completed_green'::background_check_status_enum, 
                     completed_at = COALESCE(completed_at, now()),
                     updated_at = now() 
                 WHERE id = $1`,
                [checkRecord.id]
              );
            } else {
              throw updateError;
            }
          }
          
          // Send notification if not already sent
          try {
            if (typeof notifyOnboardingApproval === 'function') {
              await notifyOnboardingApproval({
                tenantId,
                employeeId: checkRecord.employee_id,
                title: 'Background check completed',
                message: 'All your documents have been approved. Your onboarding is complete!',
              });
            }
          } catch (notifyError) {
            console.warn('Could not send notification:', notifyError.message);
            // Continue even if notification fails
          }
          
          checkRecord.status = 'completed_green';
        }
      } else if (checkRecord.status === 'pending' && totalCount > 0) {
        // Has documents but not all approved - mark as in progress
        await query(
          `UPDATE background_checks SET status = 'in_progress'::background_check_status_enum, updated_at = now() WHERE id = $1`,
          [checkRecord.id]
        );
        checkRecord.status = 'in_progress';
      }
    }

    // Re-fetch the check record to get the latest status
    const updatedCheckResult = await query(
      `SELECT * FROM background_checks WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId]
    );
    if (updatedCheckResult.rows.length > 0) {
      Object.assign(checkRecord, updatedCheckResult.rows[0]);
    }

    res.json({ ...checkRecord, events: events.rows, attachments });
  } catch (error) {
    console.error('Error fetching background check report:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({ 
      error: 'Failed to fetch report',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;

