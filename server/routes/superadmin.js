import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken, requireSuperadmin } from '../middleware/auth.js';

const router = express.Router();

// All routes require superadmin authentication
router.use(authenticateToken);
router.use(requireSuperadmin);

// Health check route to verify superadmin routes are working
router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Superadmin routes are working' });
});

/**
 * GET /api/superadmin/tenants
 * List all tenants with their tier, status, and usage stats
 */
router.get('/tenants', async (req, res, next) => {
  try {
    const { status, tier, search } = req.query;
    
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
    
    if (search) {
      whereConditions.push(`(o.name ILIKE $${paramIndex} OR o.domain ILIKE $${paramIndex} OR o.subdomain ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    const result = await query(`
      SELECT 
        o.id,
        o.name,
        o.domain,
        o.subdomain,
        o.tier,
        o.status,
        o.created_at,
        o.updated_at,
        o.last_active_at,
        o.subscription_start_date,
        o.subscription_end_date,
        COUNT(DISTINCT p.id)::int AS user_count,
        COUNT(DISTINCT e.id)::int AS employee_count,
        COUNT(DISTINCT tf.feature_key) FILTER (WHERE tf.enabled = true)::int AS enabled_features_count
      FROM organizations o
      LEFT JOIN profiles p ON p.tenant_id = o.id
      LEFT JOIN employees e ON e.tenant_id = o.id
      LEFT JOIN tenant_features tf ON tf.tenant_id = o.id
      ${whereClause}
      GROUP BY o.id
      ORDER BY o.created_at DESC
    `, params);
    
    res.json({ tenants: result.rows });
  } catch (error) {
    console.error('Error fetching tenants:', error);
    res.status(500).json({ error: 'Failed to fetch tenants', details: error.message });
  }
});

/**
 * GET /api/superadmin/tenants/:id
 * Get detailed information about a specific tenant
 */
router.get('/tenants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const tenantResult = await query(`
      SELECT 
        o.*,
        COUNT(DISTINCT p.id)::int AS user_count,
        COUNT(DISTINCT e.id)::int AS employee_count,
        COUNT(DISTINCT tf.feature_key) FILTER (WHERE tf.enabled = true)::int AS enabled_features_count
      FROM organizations o
      LEFT JOIN profiles p ON p.tenant_id = o.id
      LEFT JOIN employees e ON e.tenant_id = o.id
      LEFT JOIN tenant_features tf ON tf.tenant_id = o.id
      WHERE o.id = $1
      GROUP BY o.id
    `, [id]);
    
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    // Get all features for this tenant
    const featuresResult = await query(`
      SELECT 
        tf.feature_key,
        tf.enabled,
        tf.overridden,
        ff.feature_name,
        ff.description
      FROM tenant_features tf
      JOIN feature_flags ff ON ff.feature_key = tf.feature_key
      WHERE tf.tenant_id = $1
      ORDER BY ff.feature_name
    `, [id]);
    
    res.json({
      tenant: tenantResult.rows[0],
      features: featuresResult.rows
    });
  } catch (error) {
    console.error('Error fetching tenant details:', error);
    res.status(500).json({ error: 'Failed to fetch tenant details', details: error.message });
  }
});

/**
 * PATCH /api/superadmin/tenants/:id/tier
 * Change a tenant's subscription tier and auto-update features
 */
router.patch('/tenants/:id/tier', async (req, res) => {
  try {
    const { id } = req.params;
    const { tier } = req.body;
    
    if (!tier || !['basic', 'premium', 'enterprise'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be basic, premium, or enterprise' });
    }
    
    // Get current tenant info
    const tenantResult = await query('SELECT name, tier FROM organizations WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const oldTier = tenantResult.rows[0].tier;
    const tenantName = tenantResult.rows[0].name;
    
    // Update tier (trigger will auto-sync features)
    await query(
      'UPDATE organizations SET tier = $1, updated_at = now() WHERE id = $2',
      [tier, id]
    );
    
    // Log audit trail
    await query(`
      INSERT INTO superadmin_audit_logs (superadmin_id, superadmin_email, action, tenant_id, tenant_name, metadata)
      VALUES ($1, $2, 'tier_changed', $3, $4, $5)
    `, [
      req.user.id,
      req.user.email,
      id,
      tenantName,
      JSON.stringify({ old_tier: oldTier, new_tier: tier })
    ]);
    
    res.json({ 
      success: true, 
      message: `Tenant tier updated from ${oldTier} to ${tier}`,
      tier 
    });
  } catch (error) {
    console.error('Error updating tenant tier:', error);
    res.status(500).json({ error: 'Failed to update tenant tier', details: error.message });
  }
});

/**
 * PATCH /api/superadmin/tenants/:id/status
 * Change a tenant's status (activate/deactivate/suspend)
 */
router.patch('/tenants/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!status || !['active', 'inactive', 'suspended', 'trial'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    const tenantResult = await query('SELECT name, status FROM organizations WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    
    const oldStatus = tenantResult.rows[0].status;
    const tenantName = tenantResult.rows[0].name;
    
    await query(
      'UPDATE organizations SET status = $1, updated_at = now() WHERE id = $2',
      [status, id]
    );
    
    // Log audit trail
    await query(`
      INSERT INTO superadmin_audit_logs (superadmin_id, superadmin_email, action, tenant_id, tenant_name, metadata)
      VALUES ($1, $2, 'status_changed', $3, $4, $5)
    `, [
      req.user.id,
      req.user.email,
      id,
      tenantName,
      JSON.stringify({ old_status: oldStatus, new_status: status })
    ]);
    
    res.json({ success: true, status });
  } catch (error) {
    console.error('Error updating tenant status:', error);
    res.status(500).json({ error: 'Failed to update tenant status', details: error.message });
  }
});

/**
 * GET /api/superadmin/features
 * List all available features with tier associations
 */
router.get('/features', async (req, res) => {
  try {
    const result = await query(`
      SELECT 
        feature_key,
        feature_name,
        description,
        enabled_by_default,
        tier_basic,
        tier_premium,
        tier_enterprise,
        created_at,
        updated_at
      FROM feature_flags
      ORDER BY feature_name
    `);
    
    res.json({ features: result.rows });
  } catch (error) {
    console.error('Error fetching features:', error);
    res.status(500).json({ error: 'Failed to fetch features', details: error.message });
  }
});

/**
 * GET /api/superadmin/tenants/:id/features
 * Get all features for a specific tenant
 */
router.get('/tenants/:id/features', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await query(`
      SELECT 
        tf.feature_key,
        tf.enabled,
        tf.overridden,
        ff.feature_name,
        ff.description,
        ff.tier_basic,
        ff.tier_premium,
        ff.tier_enterprise,
        o.tier AS tenant_tier
      FROM tenant_features tf
      JOIN feature_flags ff ON ff.feature_key = tf.feature_key
      JOIN organizations o ON o.id = tf.tenant_id
      WHERE tf.tenant_id = $1
      ORDER BY ff.feature_name
    `, [id]);
    
    res.json({ features: result.rows });
  } catch (error) {
    console.error('Error fetching tenant features:', error);
    res.status(500).json({ error: 'Failed to fetch tenant features', details: error.message });
  }
});

/**
 * PATCH /api/superadmin/tenants/:id/features
 * Update feature toggles for a tenant (with override capability)
 */
router.patch('/tenants/:id/features', async (req, res) => {
  try {
    const { id } = req.params;
    const { features } = req.body; // Array of { feature_key, enabled }
    
    if (!Array.isArray(features)) {
      return res.status(400).json({ error: 'features must be an array' });
    }
    
    // Verify tenant exists
    const tenantResult = await query('SELECT name FROM organizations WHERE id = $1', [id]);
    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    const tenantName = tenantResult.rows[0].name;
    
    // Update features
    const updates = [];
    for (const feature of features) {
      if (!feature.feature_key || typeof feature.enabled !== 'boolean') {
        continue;
      }
      
      // Check if this is an override (different from tier default)
      const tierResult = await query(`
        SELECT o.tier, 
               CASE 
                 WHEN o.tier = 'basic' THEN ff.tier_basic
                 WHEN o.tier = 'premium' THEN ff.tier_premium
                 WHEN o.tier = 'enterprise' THEN ff.tier_enterprise
                 ELSE false
               END AS tier_default
        FROM organizations o
        CROSS JOIN feature_flags ff
        WHERE o.id = $1 AND ff.feature_key = $2
      `, [id, feature.feature_key]);
      
      const tierDefault = tierResult.rows[0]?.tier_default || false;
      const isOverride = feature.enabled !== tierDefault;
      
      await query(`
        INSERT INTO tenant_features (tenant_id, feature_key, enabled, overridden, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (tenant_id, feature_key)
        DO UPDATE SET 
          enabled = $3,
          overridden = $4,
          updated_at = now()
      `, [id, feature.feature_key, feature.enabled, isOverride]);
      
      updates.push({
        feature_key: feature.feature_key,
        enabled: feature.enabled,
        overridden: isOverride
      });
    }
    
    // Log audit trail
    await query(`
      INSERT INTO superadmin_audit_logs (superadmin_id, superadmin_email, action, tenant_id, tenant_name, metadata)
      VALUES ($1, $2, 'features_updated', $3, $4, $5)
    `, [
      req.user.id,
      req.user.email,
      id,
      tenantName,
      JSON.stringify({ features: updates })
    ]);
    
    res.json({ 
      success: true, 
      message: `Updated ${updates.length} feature(s)`,
      features: updates 
    });
  } catch (error) {
    console.error('Error updating tenant features:', error);
    res.status(500).json({ error: 'Failed to update tenant features', details: error.message });
  }
});

/**
 * GET /api/superadmin/audit-logs
 * Get audit logs for Super Admin actions
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const { tenant_id, action, limit = 100, offset = 0 } = req.query;
    
    let whereConditions = [];
    let params = [];
    let paramIndex = 1;
    
    if (tenant_id) {
      whereConditions.push(`tenant_id = $${paramIndex}`);
      params.push(tenant_id);
      paramIndex++;
    }
    
    if (action) {
      whereConditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }
    
    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';
    
    params.push(parseInt(limit));
    params.push(parseInt(offset));
    
    const result = await query(`
      SELECT 
        id,
        superadmin_id,
        superadmin_email,
        action,
        tenant_id,
        tenant_name,
        metadata,
        created_at
      FROM superadmin_audit_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, params);
    
    const countResult = await query(`
      SELECT COUNT(*)::int AS total
      FROM superadmin_audit_logs
      ${whereClause}
    `, params.slice(0, -2));
    
    res.json({
      logs: result.rows,
      total: countResult.rows[0]?.total || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs', details: error.message });
  }
});

/**
 * GET /api/superadmin/stats
 * Get platform-wide statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [tenantsByTier, tenantsByStatus, totalFeatures, recentActivity] = await Promise.all([
      query(`
        SELECT tier, COUNT(*)::int AS count
        FROM organizations
        GROUP BY tier
      `),
      query(`
        SELECT status, COUNT(*)::int AS count
        FROM organizations
        GROUP BY status
      `),
      query('SELECT COUNT(*)::int AS count FROM feature_flags'),
      query(`
        SELECT COUNT(*)::int AS count
        FROM superadmin_audit_logs
        WHERE created_at >= now() - interval '7 days'
      `)
    ]);
    
    res.json({
      tenants_by_tier: tenantsByTier.rows,
      tenants_by_status: tenantsByStatus.rows,
      total_features: totalFeatures.rows[0]?.count || 0,
      recent_activity_count: recentActivity.rows[0]?.count || 0
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
});

export default router;

