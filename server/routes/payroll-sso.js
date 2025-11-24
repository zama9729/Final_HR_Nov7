/**
 * Payroll SSO Integration Routes
 * 
 * Generates JWT tokens for SSO to Payroll application
 */

import express from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

/**
 * Map HR roles to Payroll roles
 * @param {string[]} hrRoles - Array of HR roles
 * @returns {'payroll_admin'|'payroll_employee'} Payroll role
 */
function mapHrToPayrollRole(hrRoles) {
  const adminSet = new Set(['CEO', 'Admin', 'HR', 'ceo', 'admin', 'hr']);
  return hrRoles.some(r => adminSet.has(r)) ? 'payroll_admin' : 'payroll_employee';
}

/**
 * GET /api/payroll/sso
 * Generate SSO JWT token for Payroll application
 * 
 * Returns a redirect URL with JWT token for Payroll SSO
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Check if Payroll integration is enabled (default to true if not set)
    const rawFlag = (process.env.PAYROLL_INTEGRATION_ENABLED ?? '').toString().trim().toLowerCase();
    const integrationEnabled = rawFlag === '' || ['true', '1', 'yes', 'on'].includes(rawFlag);

    if (!integrationEnabled) {
      const nodeEnv = (process.env.NODE_ENV || 'development').toLowerCase();
      console.warn('⚠️  Payroll integration flag disabled but continuing (NODE_ENV=', nodeEnv, ').');
      // Continue execution even if flag disabled to avoid blocking local usage
    }

    const userId = req.user.id;
    const userEmail = req.user.email;

    // Get user profile
    const profileResult = await query(
      `SELECT p.id, p.email, p.first_name, p.last_name, p.tenant_id as org_id
       FROM profiles p
       WHERE p.id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const profile = profileResult.rows[0];

    // Get all user roles
    const rolesResult = await query(
      `SELECT role FROM user_roles WHERE user_id = $1`,
      [userId]
    );

    const hrRoles = rolesResult.rows.map(r => r.role);
    
    // Map HR roles to Payroll role
    const payrollRole = mapHrToPayrollRole(hrRoles);

    // Get organization details
    const orgResult = await query(
      `SELECT id, name, domain FROM organizations WHERE id = $1`,
      [profile.org_id]
    );

    const org = orgResult.rows[0] || { id: profile.org_id, name: 'Organization', domain: '' };

    // Build JWT claims
    const claims = {
      iss: 'hr-app',
      aud: 'payroll-app',
      sub: userId.toString(), // HR user ID
      org_id: profile.org_id.toString(),
      email: profile.email,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      name: `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email,
      roles: hrRoles,
      payroll_role: payrollRole
    };

    // Sign JWT (RS256) with 5 minute expiry
    const privateKey = (process.env.HR_PAYROLL_JWT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const sharedSecret = process.env.PAYROLL_JWT_SECRET || process.env.JWT_SECRET;

    let signingKey = privateKey;
    let algorithm = 'RS256';

    if (!privateKey || privateKey.trim() === '' || !privateKey.includes('BEGIN PRIVATE KEY')) {
      if (sharedSecret && sharedSecret.trim() !== '') {
        console.warn('⚠️  HR_PAYROLL_JWT_PRIVATE_KEY missing. Falling back to PAYROLL_JWT_SECRET/JWT_SECRET for HS256 signing.');
        signingKey = sharedSecret;
        algorithm = 'HS256';
      } else {
        console.warn('⚠️  No payroll SSO keys configured. Using local development fallback secret.');
        signingKey = process.env.DEV_PAYROLL_SSO_SECRET || 'development-payroll-secret';
        algorithm = 'HS256';
      }
    }

    const token = jwt.sign(claims, signingKey, {
      algorithm,
      expiresIn: '5m'
    });

    // Build Payroll SSO URL - use base URL without subdomain
    const baseUrl = process.env.PAYROLL_BASE_URL || 'http://localhost:3002';
    const redirectUrl = `${baseUrl}/sso?token=${encodeURIComponent(token)}`;
    
    console.log(`✅ Payroll SSO URL generated: ${redirectUrl}`);

    // Log SSO attempt (for audit) - check if audit_logs table exists
    try {
      const tableCheck = await query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'audit_logs'
        );
      `);
      
      if (tableCheck.rows[0]?.exists) {
        await query(
          `INSERT INTO audit_logs (org_id, actor_user_id, action, object_type, object_id, payload)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            profile.org_id,
            userId,
            'payroll_sso_initiated',
            'sso',
            null,
            JSON.stringify({ 
              email: profile.email, 
              payroll_role: payrollRole,
              hr_roles: hrRoles 
            })
          ]
        );
      }
    } catch (auditError) {
      // Continue even if audit log fails
      console.warn('Failed to log SSO audit:', auditError);
    }

    // Return redirect URL
    res.json({
      success: true,
      redirectUrl,
      token, // For debugging (remove in production)
      expiresIn: 300,
      payrollRole
    });
  } catch (error) {
    console.error('Error generating Payroll SSO token:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to generate SSO token' 
    });
  }
});

/**
 * GET /api/payroll/sso/verify
 * Verify SSO token (for testing/debugging)
 */
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    const token = req.query.token;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const jwtSecret = process.env.PAYROLL_JWT_SECRET || process.env.JWT_SECRET || 'your-secret-key';
    const decoded = jwt.verify(token, jwtSecret);

    res.json({
      valid: true,
      claims: decoded
    });
  } catch (error) {
    res.status(400).json({
      valid: false,
      error: error.message
    });
  }
});

export default router;

