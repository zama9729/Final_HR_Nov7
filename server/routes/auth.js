import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { query, queryWithOrg } from '../db/pool.js';

const router = express.Router();

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

      // Provision Payroll tenant if subdomain provided
      if (payrollSubdomain) {
        try {
          const provisionUrl = process.env.PAYROLL_PROVISION_URL || 'http://localhost:4000/api/provision/tenant';
          const provisionToken = process.env.PAYROLL_PROVISION_TOKEN || 'your-shared-provisioning-secret';
          
          await fetch(provisionUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${provisionToken}`
            },
            body: JSON.stringify({
              org_id: orgId.toString(),
              org_name: orgName,
              subdomain: payrollSubdomain,
              admin_email: email
            })
          });
          console.log(`✅ Payroll tenant provisioned for ${orgName} (${payrollSubdomain})`);
        } catch (provisionError) {
          console.error('⚠️  Failed to provision Payroll tenant:', provisionError);
          // Continue with signup even if provisioning fails
        }
      }

      // Generate user ID (UUID)
      const userIdResult = await query('SELECT gen_random_uuid() as id');
      const userId = userIdResult.rows[0].id;

      // Create profile
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

export default router;

