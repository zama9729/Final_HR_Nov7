import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { audit } from '../utils/auditLog.js';
import { authenticateToken, requireRole, requireSuperadmin } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { Parser } from 'json2csv';

const router = express.Router();

// Platform-level metrics for application heads (temporarily restricted to CE0 role)
router.get('/metrics', authenticateToken, requireSuperadmin, async (req, res) => {
  try {
    const [orgs, users, employees, orgsByDay, revenueByMonth, totalRevenue, mrr] = await Promise.all([
      query('SELECT COUNT(*)::int AS count FROM organizations'),
      query('SELECT COUNT(*)::int AS count FROM profiles'),
      query('SELECT COUNT(*)::int AS count FROM employees'),
      query(
        `SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS count
           FROM organizations
          WHERE created_at >= now() - interval '30 days'
          GROUP BY 1
          ORDER BY 1`
      ),
      query(
        `WITH months AS (
           SELECT date_trunc('month', now()) - (n || ' months')::interval AS m
             FROM generate_series(0, 11) AS n
        )
        SELECT to_char(m, 'YYYY-MM') AS month,
               COALESCE((
                 SELECT SUM(amount_cents) FROM payments
                  WHERE status = 'paid' AND date_trunc('month', created_at) = date_trunc('month', m)
               ), 0)::int AS amount
          FROM months
         ORDER BY month`
      ),
      query(`SELECT COALESCE(SUM(amount_cents),0)::bigint AS cents FROM payments WHERE status='paid'`),
      query(`SELECT COALESCE(SUM(price_cents),0)::bigint AS cents FROM subscriptions WHERE status='active'`),
    ]);

    const totalOrganizations = orgs.rows[0]?.count ?? 0;
    const totalUsers = users.rows[0]?.count ?? 0;
    const totalEmployees = employees.rows[0]?.count ?? 0;
    const totalRevenueCents = Number(totalRevenue.rows[0]?.cents ?? 0);
    const mrrCents = Number(mrr.rows[0]?.cents ?? 0);

    res.json({
      totals: {
        organizations: totalOrganizations,
        users: totalUsers,
        employees: totalEmployees,
        revenue: totalRevenueCents / 100,
        mrr: mrrCents / 100,
      },
      series: {
        organizationsByDay: orgsByDay.rows,
        revenueByMonth: revenueByMonth.rows,
      },
    });
  } catch (error) {
    console.error('Admin metrics error:', error);
    res.status(500).json({ error: error.message || 'Failed to load metrics' });
  }
});

// Payments listing with optional date filters
router.get('/payments', authenticateToken, requireSuperadmin, async (req, res) => {
  try {
    const { from, to, limit = 100 } = req.query;
    const clauses = ["status = 'paid'"];
    const params = [];
    if (from) { params.push(from); clauses.push(`created_at >= $${params.length}`); }
    if (to)   { params.push(to);   clauses.push(`created_at <= $${params.length}`); }
    params.push(Number(limit));
    const sql = `SELECT id, organization_id, amount_cents, currency, created_at
                   FROM payments
                  WHERE ${clauses.join(' AND ')}
                  ORDER BY created_at DESC
                  LIMIT $${params.length}`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Admin payments error:', error);
    res.status(500).json({ error: error.message || 'Failed to load payments' });
  }
});

// CSV export
router.get('/payments/export.csv', authenticateToken, requireSuperadmin, async (req, res) => {
  try {
    const { from, to } = req.query;
    const clauses = ["status = 'paid'"];
    const params = [];
    if (from) { params.push(from); clauses.push(`created_at >= $${params.length}`); }
    if (to)   { params.push(to);   clauses.push(`created_at <= $${params.length}`); }
    const sql = `SELECT id, organization_id, amount_cents, currency, created_at FROM payments WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`;
    const result = await query(sql, params);
    const parser = new Parser({ fields: ['id','organization_id','amount_cents','currency','created_at'] });
    const csv = parser.parse(result.rows);
    res.header('Content-Type', 'text/csv');
    res.attachment('payments.csv');
    res.send(csv);
  } catch (error) {
    console.error('Admin payments export error:', error);
    res.status(500).json({ error: error.message || 'Failed to export payments' });
  }
});

// Probe: tell client whether current user is superadmin (allowlisted)
router.get('/access', authenticateToken, async (req, res) => {
  const email = (req.user?.email || '').toLowerCase();
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  const superadmin = email && adminEmails.includes(email);
  res.json({ superadmin });
});

// Tenant-safe database reset (ADMIN/CEO only)
// DELETE /admin/orgs/:orgId/reset
// Requires: X-CONFIRM-RESET header with org slug, ORG_RESET_CONFIRM env passphrase
router.delete('/orgs/:orgId/reset', authenticateToken, setTenantContext, requireRole('admin', 'ceo'), async (req, res) => {
  try {
    const { orgId } = req.params;
    const orgIdFromRequest = req.orgId || req.user?.org_id;
    
    // Verify orgId matches
    if (orgId !== orgIdFromRequest) {
      return res.status(403).json({ error: 'Cross-org reset denied' });
    }

    // Verify confirm header
    const confirmSlug = req.headers['x-confirm-reset'];
    if (!confirmSlug) {
      return res.status(400).json({ error: 'X-CONFIRM-RESET header required' });
    }

    // Get org slug
    const orgResult = await query(
      'SELECT slug, name FROM organizations WHERE id = $1',
      [orgId]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const org = orgResult.rows[0];

    // Verify slug matches
    if (confirmSlug !== org.slug) {
      return res.status(400).json({ error: 'Slug confirmation mismatch' });
    }

    // Verify passphrase (if set)
    const passphrase = process.env.ORG_RESET_CONFIRM;
    if (passphrase) {
      const providedPassphrase = req.headers['x-reset-passphrase'];
      if (!providedPassphrase || providedPassphrase !== passphrase) {
        return res.status(403).json({ error: 'Invalid reset passphrase' });
      }
    }

    // Get requesting admin user ID
    const adminUserId = req.user.id;

    // Start transaction
    await query('BEGIN');

    try {
      // Delete in order (respect FK constraints)
      // 1. Promotion evaluations
      await query(
        `DELETE FROM promotion_evaluations 
         WHERE cycle_id IN (SELECT id FROM promotion_cycles WHERE org_id = $1)`,
        [orgId]
      );

      // 2. Promotion cycles
      await query('DELETE FROM promotion_cycles WHERE org_id = $1', [orgId]);

      // 3. Employee policies
      await query(
        `DELETE FROM employee_policies 
         WHERE user_id IN (SELECT id FROM profiles WHERE tenant_id = $1)`,
        [orgId]
      );

      // 4. Org policies
      await query('DELETE FROM org_policies WHERE org_id = $1', [orgId]);

      // 5. Audit logs
      await query('DELETE FROM audit_logs WHERE org_id = $1', [orgId]);

      // 6. Invite tokens
      await query('DELETE FROM invite_tokens WHERE org_id = $1', [orgId]);

      // 7. Other org-scoped tables (keep existing employees, profiles, etc. for now)
      // Note: We're only resetting the new multi-tenant tables
      // If you want to reset all data, uncomment:
      /*
      await query('DELETE FROM leave_requests WHERE tenant_id = $1', [orgId]);
      await query('DELETE FROM timesheets WHERE tenant_id = $1', [orgId]);
      await query('DELETE FROM notifications WHERE tenant_id = $1', [orgId]);
      await query('DELETE FROM employees WHERE tenant_id = $1 AND user_id != $2', [orgId, adminUserId]);
      await query('DELETE FROM user_roles WHERE tenant_id = $1 AND user_id != $2', [orgId, adminUserId]);
      await query('DELETE FROM profiles WHERE tenant_id = $1 AND id != $2', [orgId, adminUserId]);
      */

      // Log audit (before resetting org)
      await audit({
        actorId: adminUserId,
        action: 'organization_reset',
        entityType: 'organization',
        entityId: orgId,
        details: {
          org_name: org.name,
          org_slug: org.slug,
          reset_by: adminUserId,
          timestamp: new Date().toISOString(),
        },
        scope: 'org',
      });

      await query('COMMIT');

      res.json({
        success: true,
        message: `Organization ${org.name} data has been reset`,
        org_id: orgId,
        reset_at: new Date().toISOString()
      });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Error resetting organization:', error);
    res.status(500).json({ error: error.message || 'Failed to reset organization' });
  }
});

export default router;


