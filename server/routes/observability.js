/**
 * Tenant Observability API Routes
 * Super Admin only - provides tenant health, metrics, and usage data
 */

import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken, requireSuperadmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require superadmin authentication
router.use(authenticateToken);
router.use(requireSuperadmin);

/**
 * Audit log helper
 */
async function logObservabilityAccess(req, action, tenantId = null, metadata = {}) {
  try {
    const tenantName = tenantId ? await getTenantName(tenantId) : null;
    await query(`
      INSERT INTO observability_audit_logs (
        superadmin_id, 
        superadmin_email, 
        action, 
        tenant_id, 
        tenant_name,
        endpoint,
        query_params,
        metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      req.user.id,
      req.user.email,
      action,
      tenantId,
      tenantName,
      req.path,
      JSON.stringify(req.query),
      JSON.stringify(metadata)
    ]);
  } catch (error) {
    console.error('[Observability] Error logging access:', error);
    // Don't fail the request if audit logging fails
  }
}

async function getTenantName(tenantId) {
  try {
    const result = await query('SELECT name FROM organizations WHERE id = $1', [tenantId]);
    return result.rows[0]?.name || null;
  } catch {
    return null;
  }
}

/**
 * GET /api/superadmin/observability/overview
 * Platform-wide observability stats
 */
router.get('/overview', async (req, res) => {
  try {
    await logObservabilityAccess(req, 'viewed_overview');
    
    // Total tenants
    const tenantsResult = await query(`
      SELECT 
        COUNT(*)::int AS total_tenants,
        COUNT(*) FILTER (WHERE status = 'active')::int AS active_tenants,
        COUNT(*) FILTER (WHERE status = 'inactive')::int AS inactive_tenants,
        COUNT(*) FILTER (WHERE tier = 'basic')::int AS basic_tenants,
        COUNT(*) FILTER (WHERE tier = 'premium')::int AS premium_tenants,
        COUNT(*) FILTER (WHERE tier = 'enterprise')::int AS enterprise_tenants
      FROM organizations
    `);
    
    // At-risk tenants (with active health flags)
    const atRiskResult = await query(`
      SELECT COUNT(DISTINCT tenant_id)::int AS at_risk_count
      FROM tenant_health_flags
      WHERE resolved_at IS NULL
        AND severity IN ('HIGH', 'CRITICAL')
    `);
    
    // Average feature adoption
    const adoptionResult = await query(`
      SELECT 
        AVG(active_features)::numeric(10, 2) AS avg_features_per_tenant
      FROM (
        SELECT 
          tenant_id,
          COUNT(*) FILTER (WHERE usage_count_30d > 0) AS active_features
        FROM tenant_feature_usage
        GROUP BY tenant_id
      ) AS tenant_features
    `);
    
    // Recent activity (tenants with activity in last 7 days)
    const activityResult = await query(`
      SELECT COUNT(DISTINCT tenant_id)::int AS active_recently
      FROM tenant_metrics_daily
      WHERE date >= CURRENT_DATE - INTERVAL '7 days'
        AND (active_users_count > 0 OR api_requests_count > 0)
    `);
    
    res.json({
      tenants: tenantsResult.rows[0],
      at_risk: {
        count: atRiskResult.rows[0]?.at_risk_count || 0
      },
      adoption: {
        avg_features_per_tenant: parseFloat(adoptionResult.rows[0]?.avg_features_per_tenant || 0)
      },
      activity: {
        active_recently: activityResult.rows[0]?.active_recently || 0
      }
    });
  } catch (error) {
    console.error('[Observability] Error fetching overview:', error);
    res.status(500).json({ error: 'Failed to fetch overview', details: error.message });
  }
});

/**
 * GET /api/superadmin/observability/tenants/:id/metrics
 * Time-series metrics for a specific tenant
 */
router.get('/tenants/:id/metrics', async (req, res) => {
  try {
    const { id } = req.params;
    const { days = 30 } = req.query;
    const daysInt = Math.min(parseInt(days) || 30, 90); // Max 90 days
    
    await logObservabilityAccess(req, 'viewed_tenant_metrics', id, { days: daysInt });
    
    const result = await query(`
      SELECT 
        date,
        active_users_count,
        total_users,
        payroll_runs_count,
        attendance_events_count,
        leave_requests_count,
        expense_claims_count,
        timesheet_submissions_count,
        api_requests_count,
        api_error_count,
        api_success_count,
        storage_used_mb,
        avg_response_time_ms,
        CASE 
          WHEN api_requests_count > 0 
          THEN (api_error_count::NUMERIC / api_requests_count::NUMERIC * 100)
          ELSE 0
        END AS error_rate_pct
      FROM tenant_metrics_daily
      WHERE tenant_id = $1
        AND date >= CURRENT_DATE - INTERVAL '${daysInt} days'
      ORDER BY date ASC
    `, [id]);
    
    res.json({
      tenant_id: id,
      period_days: daysInt,
      metrics: result.rows
    });
  } catch (error) {
    console.error('[Observability] Error fetching tenant metrics:', error);
    res.status(500).json({ error: 'Failed to fetch tenant metrics', details: error.message });
  }
});

/**
 * GET /api/superadmin/observability/tenants/:id/health
 * Current health flags and status for a tenant
 */
router.get('/tenants/:id/health', async (req, res) => {
  try {
    const { id } = req.params;
    
    await logObservabilityAccess(req, 'viewed_tenant_health', id);
    
    // Get active health flags
    const flagsResult = await query(`
      SELECT 
        flag_type,
        severity,
        message,
        metadata,
        created_at
      FROM tenant_health_flags
      WHERE tenant_id = $1
        AND resolved_at IS NULL
      ORDER BY 
        CASE severity
          WHEN 'CRITICAL' THEN 1
          WHEN 'HIGH' THEN 2
          WHEN 'MEDIUM' THEN 3
          WHEN 'LOW' THEN 4
        END,
        created_at DESC
    `, [id]);
    
    // Get tenant info
    const tenantResult = await query(`
      SELECT id, name, tier, status
      FROM organizations
      WHERE id = $1
    `, [id]);
    
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Determine overall health status
    const flags = flagsResult.rows;
    const hasCritical = flags.some(f => f.severity === 'CRITICAL');
    const hasHigh = flags.some(f => f.severity === 'HIGH');
    const overallStatus = hasCritical ? 'CRITICAL' : hasHigh ? 'HIGH' : flags.length > 0 ? 'MEDIUM' : 'HEALTHY';
    
    res.json({
      tenant_id: id,
      tenant: tenantResult.rows[0],
      overall_status: overallStatus,
      flags: flags,
      flag_count: flags.length
    });
  } catch (error) {
    console.error('[Observability] Error fetching tenant health:', error);
    res.status(500).json({ error: 'Failed to fetch tenant health', details: error.message });
  }
});

/**
 * GET /api/superadmin/observability/tenants/:id/feature-usage
 * Feature adoption breakdown for a tenant
 */
router.get('/tenants/:id/feature-usage', async (req, res) => {
  try {
    const { id } = req.params;
    
    await logObservabilityAccess(req, 'viewed_tenant_feature_usage', id);
    
    const result = await query(`
      SELECT 
        feature_key,
        usage_count,
        usage_count_7d,
        usage_count_30d,
        usage_count_90d,
        last_used_at,
        first_used_at
      FROM tenant_feature_usage
      WHERE tenant_id = $1
      ORDER BY usage_count_30d DESC, feature_key ASC
    `, [id]);
    
    res.json({
      tenant_id: id,
      features: result.rows
    });
  } catch (error) {
    console.error('[Observability] Error fetching feature usage:', error);
    res.status(500).json({ error: 'Failed to fetch feature usage', details: error.message });
  }
});

/**
 * GET /api/superadmin/observability/tenants
 * List all tenants with health summary
 */
router.get('/tenants', async (req, res) => {
  try {
    const { status, tier, health_status } = req.query;
    
    await logObservabilityAccess(req, 'viewed_tenant_list', null, { status, tier, health_status });
    
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;
    
    if (status) {
      whereConditions.push(`o.status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }
    
    if (tier) {
      whereConditions.push(`o.tier = $${paramIndex}`);
      params.push(tier);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    // Get tenants with health summary
    const result = await query(`
      SELECT 
        o.id,
        o.name,
        o.tier,
        o.status,
        o.created_at,
        COUNT(DISTINCT thf.id) FILTER (WHERE thf.resolved_at IS NULL)::int AS active_flag_count,
        MAX(thf.severity) FILTER (WHERE thf.resolved_at IS NULL) AS max_severity,
        tas.active_days,
        tas.total_active_users,
        tas.error_rate_pct
      FROM organizations o
      LEFT JOIN tenant_health_flags thf ON thf.tenant_id = o.id
      LEFT JOIN tenant_activity_summary_30d tas ON tas.tenant_id = o.id
      ${whereClause}
      GROUP BY o.id, o.name, o.tier, o.status, o.created_at, tas.active_days, tas.total_active_users, tas.error_rate_pct
      ORDER BY 
        CASE 
          WHEN MAX(thf.severity) FILTER (WHERE thf.resolved_at IS NULL) = 'CRITICAL' THEN 1
          WHEN MAX(thf.severity) FILTER (WHERE thf.resolved_at IS NULL) = 'HIGH' THEN 2
          WHEN MAX(thf.severity) FILTER (WHERE thf.resolved_at IS NULL) = 'MEDIUM' THEN 3
          ELSE 4
        END,
        o.created_at DESC
    `, params);
    
    // Filter by health_status if provided
    let tenants = result.rows;
    if (health_status) {
      tenants = tenants.filter(t => {
        const hasFlags = t.active_flag_count > 0;
        const maxSev = t.max_severity;
        
        if (health_status === 'healthy') return !hasFlags;
        if (health_status === 'at_risk') return hasFlags && ['HIGH', 'CRITICAL'].includes(maxSev);
        if (health_status === 'warning') return hasFlags && ['LOW', 'MEDIUM'].includes(maxSev);
        return true;
      });
    }
    
    res.json({ tenants });
  } catch (error) {
    console.error('[Observability] Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants', details: error.message });
  }
});

export default router;

