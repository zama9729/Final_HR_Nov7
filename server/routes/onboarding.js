import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'onboarding-documents');
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: employeeId_documentType_timestamp.ext
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    const timestamp = Date.now();
    const filename = `${req.body.employeeId || 'unknown'}_${name}_${timestamp}${ext}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow only PDF, images, and common document formats
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, images, and Word documents are allowed.'));
    }
  }
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

// Submit onboarding data (requires auth to get tenant_id)
router.post('/submit', authenticateToken, async (req, res) => {
  try {
    const employeeId = req.body.employeeId;
    const onboardingData = req.body;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID required' });
    }

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
          pan_number, aadhar_number, passport_number, completed_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, now())
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
          onboardingData.passportNumber || null
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

// Create documents table if it doesn't exist
async function ensureDocumentsTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS onboarding_documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
        document_type TEXT NOT NULL,
        file_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        mime_type TEXT,
        uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
      )
    `);
    
    // Create index for faster lookups
    await query(`
      CREATE INDEX IF NOT EXISTS idx_onboarding_documents_employee 
      ON onboarding_documents(employee_id)
    `);
  } catch (error) {
    // Table might already exist, ignore error
    console.log('Documents table check:', error.message);
  }
}

// Upload document for onboarding
router.post('/upload-document', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    const { employeeId, documentType } = req.body;
    const file = req.file;

    if (!employeeId) {
      return res.status(400).json({ error: 'Employee ID required' });
    }

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!documentType) {
      return res.status(400).json({ error: 'Document type required' });
    }

    // Verify employee belongs to same tenant
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].tenant_id) {
      return res.status(403).json({ error: 'No organization found' });
    }

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

    // Ensure documents table exists
    await ensureDocumentsTable();

    // Save document metadata to database
    const result = await query(
      `INSERT INTO onboarding_documents (
        employee_id, document_type, file_name, file_path, file_size, mime_type
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, file_name, document_type, uploaded_at`,
      [
        employeeId,
        documentType,
        file.originalname,
        file.path,
        file.size,
        file.mimetype
      ]
    );

    res.json({
      success: true,
      document: result.rows[0],
      message: 'Document uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading document:', error);
    res.status(500).json({ error: error.message || 'Failed to upload document' });
  }
});

// Get documents for an employee
router.get('/documents/:employeeId', authenticateToken, async (req, res) => {
  try {
    const { employeeId } = req.params;

    // Verify employee belongs to same tenant
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].tenant_id) {
      return res.status(403).json({ error: 'No organization found' });
    }

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

    // Ensure documents table exists
    await ensureDocumentsTable();

    // Get documents
    const result = await query(
      `SELECT id, document_type, file_name, file_path, file_size, mime_type, uploaded_at
       FROM onboarding_documents
       WHERE employee_id = $1
       ORDER BY uploaded_at DESC`,
      [employeeId]
    );

    res.json({
      success: true,
      documents: result.rows
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch documents' });
  }
});

// Download document
router.get('/documents/:documentId/download', authenticateToken, async (req, res) => {
  try {
    const { documentId } = req.params;

    // Get document info
    const docResult = await query(
      `SELECT d.*, e.tenant_id
       FROM onboarding_documents d
       JOIN employees e ON e.id = d.employee_id
       WHERE d.id = $1`,
      [documentId]
    );

    if (docResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const document = docResult.rows[0];

    // Verify tenant
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0 || 
        profileResult.rows[0].tenant_id !== document.tenant_id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Check if file exists
    if (!fs.existsSync(document.file_path)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // Send file
    res.download(document.file_path, document.file_name);
  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ error: error.message || 'Failed to download document' });
  }
});

export default router;
