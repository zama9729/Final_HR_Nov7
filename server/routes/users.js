import express from 'express';
import crypto from 'crypto';
import { query, queryWithOrg } from '../db/pool.js';
import { audit } from '../utils/auditLog.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { sendInviteEmail } from '../services/email.js';

const router = express.Router();

/**
 * Generate a secure invite token (32+ bytes)
 */
function generateInviteToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create invite tokens and send emails
 * POST /users/invite
 * Body: { emails: string[], role, org_id }
 */
router.post('/invite', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    const { emails, role } = req.body;

    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return res.status(400).json({ error: 'emails array is required' });
    }

    if (!role) {
      return res.status(400).json({ error: 'role is required' });
    }

    // Get org info
    const orgResult = await query(
      'SELECT id, name, slug FROM organizations WHERE id = $1',
      [orgId]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = orgResult.rows[0];

    // Calculate expiry (72 hours from now)
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 72);

    const results = [];
    const errors = [];

    for (const email of emails) {
      try {
        const normalizedEmail = email.toLowerCase().trim();

        // Check if user already exists
        const existingUser = await query(
          'SELECT id, status FROM profiles WHERE email = $1',
          [normalizedEmail]
        );

        let userId = null;
        let userStatus = 'INVITED';

        if (existingUser.rows.length > 0) {
          userId = existingUser.rows[0].id;
          userStatus = existingUser.rows[0].status || 'INVITED';
          
          // Verify user belongs to this org
          const userOrgCheck = await query(
            'SELECT tenant_id FROM profiles WHERE id = $1',
            [userId]
          );

          if (userOrgCheck.rows.length === 0 || userOrgCheck.rows[0].tenant_id !== orgId) {
            errors.push({ email, error: 'User belongs to different organization' });
            continue;
          }
        } else {
          // Create user profile with INVITED status
          await query('BEGIN');
          try {
            const userResult = await query(
              `INSERT INTO profiles (email, status, tenant_id)
               VALUES ($1, $2, $3)
               RETURNING id`,
              [normalizedEmail, 'INVITED', orgId]
            );
            userId = userResult.rows[0].id;

            // Create user role
            await query(
              `INSERT INTO user_roles (user_id, role, tenant_id)
               VALUES ($1, $2, $3)`,
              [userId, role, orgId]
            );

            await query('COMMIT');
          } catch (error) {
            await query('ROLLBACK');
            throw error;
          }
        }

        // Generate token
        const token = generateInviteToken();

        // Create invite token
        await queryWithOrg(
          `INSERT INTO invite_tokens (org_id, email, token, expires_at)
           VALUES ($1, $2, $3, $4)
           RETURNING id, email, token, expires_at`,
          [orgId, normalizedEmail, token, expiresAt],
          orgId
        );

        // Send invite email
        try {
          await sendInviteEmail(normalizedEmail, org.name, org.slug, token);
        } catch (emailError) {
          console.error(`Failed to send invite email to ${normalizedEmail}:`, emailError);
          // Continue even if email fails
        }

        results.push({
          email: normalizedEmail,
          user_id: userId,
          status: 'invited',
          expires_at: expiresAt.toISOString()
        });
      } catch (error) {
        console.error(`Error inviting ${email}:`, error);
        errors.push({ email, error: error.message || 'Failed to invite user' });
      }
    }

    // Log audit
    await audit({
      actorId: req.user.id,
      action: 'invite_users',
      entityType: 'users',
      entityId: null,
      details: {
        orgId,
        emails,
        role,
        results,
        errors,
      },
      scope: 'org',
    });

    res.status(201).json({
      success: true,
      invited: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error inviting users:', error);
    res.status(500).json({ error: error.message || 'Failed to invite users' });
  }
});

export default router;

