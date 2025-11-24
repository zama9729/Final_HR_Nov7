import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { sendPasswordResetEmail } from '../services/email.js';
import { ensureOrgSetupState } from '../services/setup-state.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

const BYPASS_PASSWORD_RESET_EMAIL = process.env.BYPASS_PASSWORD_RESET_EMAIL === 'true';
const APP_BASE_URL = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

let passwordResetTableEnsured = false;

async function ensurePasswordResetTable() {
  if (passwordResetTableEnsured) {
    return;
  }

  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
      token TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_password_reset_tokens_token
    ON password_reset_tokens(token)
  `);

  await query(`
    CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user
    ON password_reset_tokens(user_id)
  `);

  passwordResetTableEnsured = true;
}

// Register/Signup
router.post('/signup', async (req, res) => {
  try {
    const {
      email,
      password,
      firstName,
      lastName,
      orgName,
      domain,
      companySize,
      industry,
      timezone,
      subdomain
    } = req.body;

    // Validate input
    if (!email || !password || !firstName || !orgName || !domain) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate subdomain if provided
    let payrollSubdomain = null;
    if (subdomain) {
      payrollSubdomain = subdomain.toString().toLowerCase().trim();
      const subdomainRegex = /^[a-z0-9-]{3,32}$/;
      if (!subdomainRegex.test(payrollSubdomain)) {
        return res.status(400).json({ error: 'Invalid subdomain format. Must be 3-32 lowercase alphanumeric or hyphens.' });
      }
    }

    // Check if user exists
    const existingUser = await query(
      'SELECT id FROM profiles WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate slug from org name
    function generateSlug(name) {
      return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
    }

    async function generateUniqueSlug(baseSlug) {
      // Check if slug column exists
      try {
        const columnCheck = await query(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'organizations' AND column_name = 'slug'
        `);
        
        if (columnCheck.rows.length === 0) {
          // Slug column doesn't exist, return base slug
          return baseSlug;
        }
      } catch (error) {
        // If check fails, assume column doesn't exist
        return baseSlug;
      }
      
      let slug = baseSlug;
      let counter = 1;
      
      while (true) {
        const result = await query(
          'SELECT id FROM organizations WHERE slug = $1',
          [slug]
        );
        
        if (result.rows.length === 0) {
          return slug;
        }
        
        slug = `${baseSlug}-${counter}`;
        counter++;
      }
    }

    // Start transaction
    await query('BEGIN');

    try {
      // Ensure subdomain column exists
      try {
        await query(`
          ALTER TABLE organizations 
          ADD COLUMN IF NOT EXISTS subdomain VARCHAR(64)
        `);
        await query(`
          CREATE UNIQUE INDEX IF NOT EXISTS ux_orgs_subdomain 
          ON organizations(subdomain) 
          WHERE subdomain IS NOT NULL
        `);
      } catch (error) {
        // Column might already exist, continue
        console.log('Subdomain column check:', error.message);
      }

      // Check if subdomain is already taken
      if (payrollSubdomain) {
        const dupCheck = await query(
          `SELECT id FROM organizations WHERE subdomain = $1`,
          [payrollSubdomain]
        );
        if (dupCheck.rows.length > 0) {
          return res.status(400).json({ error: 'Subdomain already taken' });
        }
      }

      // Check if slug column exists
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'slug'
      `);
      
      const hasSlugColumn = columnCheck.rows.length > 0;
      let orgResult;
      
      if (hasSlugColumn) {
        // Generate unique slug
        const baseSlug = generateSlug(orgName);
        const slug = await generateUniqueSlug(baseSlug);
        
        // Create organization with slug and subdomain
        orgResult = await query(
          `INSERT INTO organizations (name, domain, slug, subdomain, company_size, industry, timezone)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [orgName, domain, slug, payrollSubdomain, companySize || null, industry || null, timezone || 'Asia/Kolkata']
        );
      } else {
        // Create organization without slug but with subdomain
        orgResult = await query(
          `INSERT INTO organizations (name, domain, subdomain, company_size, industry, timezone)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
          [orgName, domain, payrollSubdomain, companySize || null, industry || null, timezone || 'Asia/Kolkata']
        );
      }
      const orgId = orgResult.rows[0].id;

      // Generate user ID (UUID)
      const userIdResult = await query('SELECT gen_random_uuid() as id');
      const userId = userIdResult.rows[0].id;

      // Create profile FIRST (before Payroll sync)
      await query(
        `INSERT INTO profiles (id, email, first_name, last_name, tenant_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [userId, email, firstName, lastName, orgId]
      );

      // Create user role (admin for signups)
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, 'admin', $2)`,
        [userId, orgId]
      );

      // Store hashed password (we'll use profiles table or create auth table)
      await query(
        `INSERT INTO user_auth (user_id, password_hash)
         VALUES ($1, $2)`,
        [userId, hashedPassword]
      );

      await query('COMMIT');

      try {
        await ensureOrgSetupState(orgId);
      } catch (setupError) {
        console.warn('⚠️  Failed to initialize org setup status', setupError?.message || setupError);
      }

      // Provision Payroll tenant and create admin user simultaneously AFTER HR profile is created
      // This ensures the user exists in HR before syncing to Payroll
      if (payrollSubdomain) {
        try {
          const { syncOrganizationToPayroll, syncUserToPayroll } = await import('../services/payroll-sync.js');
          
          console.log(`🔄 Syncing organization to Payroll: ${orgName} (${payrollSubdomain})`);
          
          // Provision organization in Payroll
          const orgSyncResult = await syncOrganizationToPayroll({
            org_id: orgId.toString(),
            org_name: orgName,
            subdomain: payrollSubdomain,
            admin_email: email
          });
          
          if (orgSyncResult.success === false) {
            console.error(`⚠️  Organization sync failed: ${orgSyncResult.error}`);
          }
          
          // Create admin user in Payroll with retry
          console.log(`🔄 Syncing admin user to Payroll: ${email} (${userId})`);
          const userSyncResult = await syncUserToPayroll({
            hr_user_id: userId.toString(),
            email: email,
            first_name: firstName,
            last_name: lastName,
            org_id: orgId.toString(),
            role: 'admin' // Admin role for organization signup
          });
          
          if (userSyncResult.success === false) {
            console.error(`⚠️  User sync failed: ${userSyncResult.error}`);
          } else {
            console.log(`✅ Successfully synced organization and admin user to Payroll`);
          }
        } catch (syncError) {
          // Log error but don't fail signup - user can still be created later
          console.error('⚠️  Payroll sync error during signup:', syncError);
          console.error('   User will need to be manually synced or will be created on first SSO login');
        }
      }

      // Generate JWT token with org_id
      const token = jwt.sign(
        { id: userId, email, role: 'admin', org_id: orgId },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        token,
        user: { id: userId, email, firstName, lastName, role: 'admin' }
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: error.message || 'Signup failed' });
  }
});

router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const hashed = await bcrypt.hash(newPassword, 10);
    await query(
      `UPDATE user_auth SET password_hash = $1, updated_at = now()
       WHERE user_id = $2`,
      [hashed, req.user.id]
    );
    await query(
      `UPDATE employees
       SET must_change_password = false, updated_at = now()
       WHERE user_id = $1`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: error.message || 'Failed to change password' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Get user with password hash
    const userResult = await query(
      `SELECT p.id, p.email, p.first_name, p.last_name, ua.password_hash
       FROM profiles p
       JOIN user_auth ua ON ua.user_id = p.id
       WHERE p.email = $1`,
      [email.toLowerCase().trim()]
    );

    console.log('Login attempt for email:', email);
    console.log('User found:', userResult.rows.length > 0 ? 'Yes' : 'No');

    if (userResult.rows.length === 0) {
      console.log('No user found with email:', email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    console.log('Password valid:', validPassword);
    
    if (!validPassword) {
      console.log('Password mismatch for user:', user.email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Get user role and org_id
    const roleResult = await query(
      `SELECT ur.role, p.tenant_id as org_id
       FROM user_roles ur
       JOIN profiles p ON p.id = ur.user_id
       WHERE ur.user_id = $1
       LIMIT 1`,
      [user.id]
    );
    const role = roleResult.rows[0]?.role || 'employee';
    const orgId = roleResult.rows[0]?.org_id;

    // Generate JWT token with org_id
    const token = jwt.sign(
      { id: user.id, email: user.email, role, org_id: orgId },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message || 'Login failed' });
  }
});

// First login with invite token
router.post('/first-login', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    // Validate password strength
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Find invite token
    const inviteResult = await query(
      `SELECT it.id, it.org_id, it.email, it.expires_at, it.used_at, o.slug
       FROM invite_tokens it
       JOIN organizations o ON o.id = it.org_id
       WHERE it.token = $1`,
      [token]
    );

    if (inviteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invite token' });
    }

    const invite = inviteResult.rows[0];

    // Check if token is already used
    if (invite.used_at) {
      return res.status(400).json({ error: 'Invite token has already been used' });
    }

    // Check if token is expired
    const now = new Date();
    if (new Date(invite.expires_at) < now) {
      return res.status(400).json({ error: 'Invite token has expired' });
    }

    // Check if user exists
    const userResult = await query(
      'SELECT id, status FROM profiles WHERE email = $1',
      [invite.email.toLowerCase().trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // Verify user belongs to the org
    const userOrgCheck = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (userOrgCheck.rows.length === 0 || userOrgCheck.rows[0].tenant_id !== invite.org_id) {
      return res.status(403).json({ error: 'User does not belong to this organization' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Start transaction
    await query('BEGIN');

    try {
      // Update or create password
      await query(
        `INSERT INTO user_auth (user_id, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET password_hash = EXCLUDED.password_hash, updated_at = now()`,
        [userId, hashedPassword]
      );

      // Mark token as used
      await query(
        'UPDATE invite_tokens SET used_at = now() WHERE id = $1',
        [invite.id]
      );

      // Update user status to ACTIVE
      await query(
        'UPDATE profiles SET status = $1 WHERE id = $2',
        ['ACTIVE', userId]
      );

      await query('COMMIT');

      // Get user role
      const roleResult = await query(
        'SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1',
        [userId]
      );
      const role = roleResult.rows[0]?.role || 'employee';

      // Generate JWT token with org_id
      const jwtToken = jwt.sign(
        { id: userId, email: invite.email, role, org_id: invite.org_id },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        token: jwtToken,
        user: {
          id: userId,
          email: invite.email,
          role,
          org_id: invite.org_id
        },
        message: 'Account activated successfully. Please complete onboarding.'
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('First login error:', error);
    res.status(500).json({ error: error.message || 'Failed to activate account' });
  }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    await ensurePasswordResetTable();

    const userResult = await query(
      `SELECT id, first_name, last_name
       FROM profiles
       WHERE email = $1`,
      [normalizedEmail]
    );

    // Always return success to avoid account enumeration
    if (userResult.rows.length === 0) {
      return res.json({ success: true, message: 'If the account exists, a reset email has been sent.' });
    }

    const user = userResult.rows[0];
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

    await query('BEGIN');

    try {
      await query(
        'DELETE FROM password_reset_tokens WHERE user_id = $1',
        [user.id]
      );

      await query(
        `INSERT INTO password_reset_tokens (user_id, token, expires_at)
         VALUES ($1, $2, $3)`,
        [user.id, token, expiresAt]
      );

      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

    const responsePayload = {
      success: true,
      message: 'If the account exists, a reset email has been sent.'
    };

    if (BYPASS_PASSWORD_RESET_EMAIL) {
      responsePayload.debugToken = token;
      responsePayload.resetUrl = `${APP_BASE_URL}/auth/reset-password?token=${token}`;
      console.warn('🔐 Password reset email bypass enabled. Token:', token);
    } else {
      try {
        await sendPasswordResetEmail(normalizedEmail, token, {
          firstName: user.first_name,
          lastName: user.last_name
        });
      } catch (emailError) {
        console.error('Failed to send password reset email:', emailError);
        // Continue - we already created the token
      }
    }

    res.json(responsePayload);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: error.message || 'Failed to process password reset request' });
  }
});

// Get password reset info
router.get('/reset-password', async (req, res) => {
  try {
    const { token } = req.query;

    if (typeof token !== 'string' || !token) {
      return res.status(400).json({ error: 'Token is required' });
    }

    await ensurePasswordResetTable();

    const tokenResult = await query(
      `SELECT prt.id, prt.expires_at, prt.used_at,
              p.security_question_1, p.security_question_2
       FROM password_reset_tokens prt
       JOIN profiles p ON p.id = prt.user_id
       WHERE prt.token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const resetRecord = tokenResult.rows[0];

    if (resetRecord.used_at) {
      return res.status(400).json({ error: 'Reset link has already been used' });
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Reset link has expired' });
    }

    res.json({
      success: true,
      securityQuestions: [
        resetRecord.security_question_1,
        resetRecord.security_question_2
      ].filter(Boolean)
    });
  } catch (error) {
    console.error('Password reset token lookup error:', error);
    res.status(500).json({ error: error.message || 'Failed to validate reset token' });
  }
});

// Complete password reset
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password, securityAnswer1, securityAnswer2 } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long' });
    }

    await ensurePasswordResetTable();

    const tokenResult = await query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at,
              p.security_answer_1, p.security_answer_2
       FROM password_reset_tokens prt
       JOIN profiles p ON p.id = prt.user_id
       WHERE prt.token = $1`,
      [token]
    );

    if (tokenResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const resetRecord = tokenResult.rows[0];

    if (resetRecord.used_at) {
      return res.status(400).json({ error: 'Reset link has already been used' });
    }

    if (new Date(resetRecord.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Reset link has expired' });
    }

    // Validate security answers (if present)
    const expectedAnswer1 = resetRecord.security_answer_1 ? resetRecord.security_answer_1.trim().toLowerCase() : null;
    const expectedAnswer2 = resetRecord.security_answer_2 ? resetRecord.security_answer_2.trim().toLowerCase() : null;

    if (expectedAnswer1) {
      const providedAnswer1 = (securityAnswer1 || '').trim().toLowerCase();
      if (!providedAnswer1 || providedAnswer1 !== expectedAnswer1) {
        return res.status(400).json({ error: 'Security answer 1 is incorrect' });
      }
    }

    if (expectedAnswer2) {
      const providedAnswer2 = (securityAnswer2 || '').trim().toLowerCase();
      if (!providedAnswer2 || providedAnswer2 !== expectedAnswer2) {
        return res.status(400).json({ error: 'Security answer 2 is incorrect' });
      }
    }

    const bcryptModule = await import('bcryptjs');
    const bcryptInstance = bcryptModule.default;
    const hashedPassword = await bcryptInstance.hash(password, 10);

    await query('BEGIN');

    try {
      await query(
        `UPDATE user_auth
         SET password_hash = $1, updated_at = now()
         WHERE user_id = $2`,
        [hashedPassword, resetRecord.user_id]
      );

      await query(
        `UPDATE password_reset_tokens
         SET used_at = now()
         WHERE id = $1`,
        [resetRecord.id]
      );

      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: error.message || 'Failed to reset password' });
  }
});

export default router;

