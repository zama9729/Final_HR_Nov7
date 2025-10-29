import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

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
      // Insert or update onboarding data
      await query(
        `INSERT INTO onboarding_data (
          employee_id, emergency_contact_name, emergency_contact_phone,
          emergency_contact_relation, address, city, state, postal_code,
          bank_account_number, bank_name, bank_branch, ifsc_code,
          pan_number, aadhar_number, completed_at, tenant_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, now(), $15)
        ON CONFLICT (employee_id) 
        DO UPDATE SET
          emergency_contact_name = $2,
          emergency_contact_phone = $3,
          emergency_contact_relation = $4,
          address = $5,
          city = $6,
          state = $7,
          postal_code = $8,
          bank_account_number = $9,
          bank_name = $10,
          bank_branch = $11,
          ifsc_code = $12,
          pan_number = $13,
          aadhar_number = $14,
          completed_at = now(),
          tenant_id = $15,
          updated_at = now()`,
        [
          employeeId,
          onboardingData.emergencyContactName,
          onboardingData.emergencyContactPhone,
          onboardingData.emergencyContactRelation,
          onboardingData.address,
          onboardingData.city,
          onboardingData.state,
          onboardingData.postalCode,
          onboardingData.bankAccountNumber,
          onboardingData.bankName,
          onboardingData.bankBranch,
          onboardingData.ifscCode,
          onboardingData.panNumber,
          onboardingData.aadharNumber,
          tenantId
        ]
      );

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

export default router;
