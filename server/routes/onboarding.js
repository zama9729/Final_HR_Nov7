import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

// Ensure document infrastructure exists (for onboarding documents)
let ensureDocumentInfraPromise = null;
const ensureDocumentInfra = async () => {
  if (ensureDocumentInfraPromise) return ensureDocumentInfraPromise;
  ensureDocumentInfraPromise = (async () => {
    try {
      // Ensure hr_documents table exists
      await query(`
        CREATE TABLE IF NOT EXISTS hr_documents (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
          tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
          doc_type TEXT NOT NULL,
          object_key TEXT NOT NULL,
          filename TEXT NOT NULL,
          file_size BIGINT,
          content_type TEXT,
          verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'rejected', 'hold')),
          verified_by UUID REFERENCES profiles(id),
          verified_at TIMESTAMPTZ,
          verification_notes TEXT,
          consent BOOLEAN DEFAULT false,
          notes TEXT,
          source TEXT DEFAULT 'employee',
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS hr_document_audit_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          document_id UUID REFERENCES hr_documents(id) ON DELETE CASCADE NOT NULL,
          actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          note TEXT,
          previous_status TEXT,
          next_status TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_hr_documents_employee ON hr_documents(employee_id);
        CREATE INDEX IF NOT EXISTS idx_hr_documents_tenant ON hr_documents(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_hr_documents_status ON hr_documents(verification_status);
        CREATE INDEX IF NOT EXISTS idx_hr_document_audit_doc ON hr_document_audit_logs(document_id);
      `).catch(err => {
        if (!err.message.includes('already exists')) {
          console.error('Error ensuring document infrastructure:', err);
        }
      });
    } catch (err) {
      console.error('Error ensuring document infrastructure:', err);
    }
  })();
  return ensureDocumentInfraPromise;
};

const router = express.Router();

// Submit onboarding data (Employee)
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { employeeId, ...onboardingData } = req.body;

    // Verify employee belongs to user
    const employeeResult = await query(
      `SELECT id FROM employees WHERE id = $1 AND user_id = $2`,
      [employeeId, userId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(403).json({ error: 'Employee not found or access denied' });
    }

    // Get tenant_id
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );
    const tenantId = profileResult.rows[0]?.tenant_id;

    // Upsert onboarding data
    await query(
      `INSERT INTO onboarding_data (
        employee_id, tenant_id,
        emergency_contact_name, emergency_contact_phone, emergency_contact_relation,
        address, city, state, postal_code,
        permanent_address, permanent_city, permanent_state, permanent_postal_code,
        current_address, current_city, current_state, current_postal_code,
        bank_account_number, bank_name, bank_branch, ifsc_code,
        pan_number, aadhar_number, passport_number, uan_number,
        bank_details_status, completed_at
      ) VALUES (
        $1, $2,
        $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, $19, $20, $21,
        $22, $23, $24, $25,
        $26, now()
      )
      ON CONFLICT (employee_id) DO UPDATE SET
        emergency_contact_name = EXCLUDED.emergency_contact_name,
        emergency_contact_phone = EXCLUDED.emergency_contact_phone,
        emergency_contact_relation = EXCLUDED.emergency_contact_relation,
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        postal_code = EXCLUDED.postal_code,
        permanent_address = EXCLUDED.permanent_address,
        permanent_city = EXCLUDED.permanent_city,
        permanent_state = EXCLUDED.permanent_state,
        permanent_postal_code = EXCLUDED.permanent_postal_code,
        current_address = EXCLUDED.current_address,
        current_city = EXCLUDED.current_city,
        current_state = EXCLUDED.current_state,
        current_postal_code = EXCLUDED.current_postal_code,
        bank_account_number = EXCLUDED.bank_account_number,
        bank_name = EXCLUDED.bank_name,
        bank_branch = EXCLUDED.bank_branch,
        ifsc_code = EXCLUDED.ifsc_code,
        pan_number = EXCLUDED.pan_number,
        aadhar_number = EXCLUDED.aadhar_number,
        passport_number = EXCLUDED.passport_number,
        uan_number = EXCLUDED.uan_number,
        bank_details_status = EXCLUDED.bank_details_status,
        completed_at = now(),
        updated_at = now()`,
      [
        employeeId, tenantId,
        onboardingData.emergency_contact_name || null,
        onboardingData.emergency_contact_phone || null,
        onboardingData.emergency_contact_relation || null,
        onboardingData.address || null,
        onboardingData.city || null,
        onboardingData.state || null,
        onboardingData.postal_code || null,
        onboardingData.permanent_address || null,
        onboardingData.permanent_city || null,
        onboardingData.permanent_state || null,
        onboardingData.permanent_postal_code || null,
        onboardingData.current_address || null,
        onboardingData.current_city || null,
        onboardingData.current_state || null,
        onboardingData.current_postal_code || null,
        onboardingData.bank_account_number || null,
        onboardingData.bank_name || null,
        onboardingData.bank_branch || null,
        onboardingData.ifsc_code || null,
        onboardingData.pan_number || null,
        onboardingData.aadhar_number || null,
        onboardingData.passport_number || null,
        onboardingData.uan_number || null,
        onboardingData.bank_account_number ? 'completed' : 'pending',
      ]
    );

    // Update employee onboarding status
    await query(
      `UPDATE employees SET onboarding_status = 'completed', updated_at = now() WHERE id = $1`,
      [employeeId]
    );

    res.json({ success: true, message: 'Onboarding data submitted successfully' });
  } catch (error) {
    console.error('Onboarding submit error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit onboarding data' });
  }
});

// Get onboarding progress (Employee)
router.get('/me/progress', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT 
        e.id as employee_id,
        e.onboarding_status,
        e.must_change_password,
        od.completed_at,
        od.bank_details_status,
        CASE 
          WHEN od.id IS NOT NULL THEN 'completed'
          ELSE 'pending'
        END as data_status
      FROM employees e
      LEFT JOIN onboarding_data od ON od.employee_id = e.id
      WHERE e.user_id = $1
      LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get onboarding progress error:', error);
    res.status(500).json({ error: error.message || 'Failed to get onboarding progress' });
  }
});

// Get "About Me" data (Employee)
router.get('/me/about', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT 
        e.id as employee_id,
        e.about_me,
        e.job_love,
        e.hobbies
      FROM employees e
      WHERE e.user_id = $1
      LIMIT 1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(result.rows[0] || {});
  } catch (error) {
    console.error('Get about me error:', error);
    res.status(500).json({ error: error.message || 'Failed to get about me data' });
  }
});

// Update "About Me" data (Employee)
router.post('/me/about', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { about_me, job_love, hobbies } = req.body;

    await query(
      `UPDATE employees 
       SET about_me = $1, job_love = $2, hobbies = $3, updated_at = now()
       WHERE user_id = $4`,
      [about_me || null, job_love || null, hobbies || null, userId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update about me error:', error);
    res.status(500).json({ error: error.message || 'Failed to update about me data' });
  }
});

// Skip bank details (Employee)
router.post('/bank-details/skip', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { employeeId } = req.body;

    // Verify employee belongs to user
    const employeeResult = await query(
      `SELECT id FROM employees WHERE id = $1 AND user_id = $2`,
      [employeeId, userId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(403).json({ error: 'Employee not found or access denied' });
    }

    await query(
      `UPDATE onboarding_data 
       SET bank_details_status = 'skipped', updated_at = now()
       WHERE employee_id = $1`,
      [employeeId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Skip bank details error:', error);
    res.status(500).json({ error: error.message || 'Failed to skip bank details' });
  }
});

// Update bank details (Employee)
router.post('/bank-details/update', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { employeeId, bankAccountNumber, bankName, bankBranch, ifscCode } = req.body;

    // Verify employee belongs to user
    const employeeResult = await query(
      `SELECT id, tenant_id FROM employees WHERE id = $1 AND user_id = $2`,
      [employeeId, userId]
    );

    if (employeeResult.rows.length === 0) {
      return res.status(403).json({ error: 'Employee not found or access denied' });
    }

    const tenantId = employeeResult.rows[0].tenant_id;

    await query(
      `INSERT INTO onboarding_data (employee_id, tenant_id, bank_account_number, bank_name, bank_branch, ifsc_code, bank_details_status, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'completed', now())
       ON CONFLICT (employee_id) DO UPDATE SET
         bank_account_number = EXCLUDED.bank_account_number,
         bank_name = EXCLUDED.bank_name,
         bank_branch = EXCLUDED.bank_branch,
         ifsc_code = EXCLUDED.ifsc_code,
         bank_details_status = 'completed',
         updated_at = now()`,
      [employeeId, tenantId, bankAccountNumber, bankName, bankBranch, ifscCode]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('Update bank details error:', error);
    res.status(500).json({ error: error.message || 'Failed to update bank details' });
  }
});

// Get missing onboarding data (Employee)
router.get('/me/missing-data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      `SELECT 
        e.id as employee_id,
        CASE WHEN od.emergency_contact_name IS NULL THEN 'emergency_contact' END as missing_field
      FROM employees e
      LEFT JOIN onboarding_data od ON od.employee_id = e.id
      WHERE e.user_id = $1
      LIMIT 1`,
      [userId]
    );

    const missing = [];
    if (result.rows.length > 0) {
      const row = result.rows[0];
      if (!row.missing_field) {
        // Check other fields
        const dataResult = await query(
          `SELECT 
            CASE WHEN emergency_contact_name IS NULL THEN 'emergency_contact' END,
            CASE WHEN address IS NULL THEN 'address' END,
            CASE WHEN bank_account_number IS NULL AND bank_details_status != 'skipped' THEN 'bank_details' END
          FROM onboarding_data WHERE employee_id = $1`,
          [row.employee_id]
        );
        // Process missing fields
      }
    }

    res.json({ missing });
  } catch (error) {
    console.error('Get missing data error:', error);
    res.status(500).json({ error: error.message || 'Failed to get missing data' });
  }
});

export { ensureDocumentInfra };
export default router;
