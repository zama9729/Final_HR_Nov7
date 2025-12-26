import { query } from '../db/pool.js';

/**
 * Check if a feature is enabled for a tenant
 * @param {string} tenantId - Tenant/Organization ID
 * @param {string} featureKey - Feature key to check
 * @returns {Promise<boolean>} - True if feature is enabled
 */
export async function isFeatureEnabled(tenantId, featureKey) {
  try {
    const result = await query(`
      SELECT enabled
      FROM tenant_features
      WHERE tenant_id = $1 AND feature_key = $2
    `, [tenantId, featureKey]);
    
    return result.rows.length > 0 ? result.rows[0].enabled : false;
  } catch (error) {
    console.error(`Error checking feature ${featureKey} for tenant ${tenantId}:`, error);
    return false; // Fail closed - if we can't check, assume disabled
  }
}

/**
 * Middleware to require a specific feature to be enabled
 * @param {string} featureKey - Feature key to check
 * @returns {Function} Express middleware
 */
export function requireFeature(featureKey) {
  return async (req, res, next) => {
    try {
      // Superadmins bypass feature checks
      const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase())
        .filter(Boolean);
      
      if (req.user?.email && adminEmails.includes(req.user.email.toLowerCase())) {
        return next();
      }
      
      // Get tenant_id from request (set by setTenantContext middleware or from user profile)
      let tenantId = req.tenantId;
      
      if (!tenantId && req.user?.id) {
        const profileResult = await query(
          'SELECT tenant_id FROM profiles WHERE id = $1',
          [req.user.id]
        );
        tenantId = profileResult.rows[0]?.tenant_id;
      }
      
      if (!tenantId) {
        return res.status(403).json({ 
          error: 'Feature check failed: Tenant context required',
          feature: featureKey 
        });
      }
      
      const enabled = await isFeatureEnabled(tenantId, featureKey);
      
      if (!enabled) {
        return res.status(403).json({ 
          error: `Feature not enabled: ${featureKey}`,
          feature: featureKey,
          message: 'This feature is not available for your subscription tier. Please contact support to upgrade.'
        });
      }
      
      next();
    } catch (error) {
      console.error('Error in requireFeature middleware:', error);
      res.status(500).json({ error: 'Feature check failed', details: error.message });
    }
  };
}

/**
 * Get all enabled features for a tenant
 * @param {string} tenantId - Tenant/Organization ID
 * @returns {Promise<string[]>} - Array of enabled feature keys
 */
export async function getEnabledFeatures(tenantId) {
  try {
    const result = await query(`
      SELECT feature_key
      FROM tenant_features
      WHERE tenant_id = $1 AND enabled = true
    `, [tenantId]);
    
    return result.rows.map(row => row.feature_key);
  } catch (error) {
    console.error(`Error fetching enabled features for tenant ${tenantId}:`, error);
    return [];
  }
}

/**
 * Get tenant tier
 * @param {string} tenantId - Tenant/Organization ID
 * @returns {Promise<string|null>} - Tier name or null
 */
export async function getTenantTier(tenantId) {
  try {
    const result = await query(
      'SELECT tier FROM organizations WHERE id = $1',
      [tenantId]
    );
    
    return result.rows[0]?.tier || null;
  } catch (error) {
    console.error(`Error fetching tenant tier for ${tenantId}:`, error);
    return null;
  }
}

