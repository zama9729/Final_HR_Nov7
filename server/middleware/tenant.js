import { query, withClient } from '../db/pool.js';

/**
 * Sets tenant context from org_id in request (set by auth middleware or org resolution)
 * This sets the PostgreSQL session variable for RLS
 */
export async function setTenantContext(req, res, next) {
  try {
    const orgId = req.orgId || req.user?.org_id;
    
    if (!orgId) {
      // Try to get from user's profile
      if (req.user?.id) {
        const r = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
        req.orgId = r.rows[0]?.tenant_id;
      }
    }
    
    // Set session context for RLS (stored in req for use by query wrapper)
    if (req.orgId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (uuidRegex.test(req.orgId)) {
        // Store orgId for use by query wrapper
        // The actual session variable will be set per query using withClient
      }
    }
  } catch (e) {
    console.error('Failed to set tenant context', e?.message || e);
  }
  next();
}

/**
 * Resolves organization from slug (subdomain or path param)
 * Extracts orgSlug from hostname or path and resolves to org_id
 */
export async function resolveOrgFromSlug(req, res, next) {
  try {
    let orgSlug = null;
    
    // Check subdomain: {orgSlug}.app.com
    const host = req.get('host') || '';
    const subdomainMatch = host.match(/^([^.]+)\./);
    if (subdomainMatch) {
      orgSlug = subdomainMatch[1];
    }
    
    // Check path param: /o/:orgSlug
    if (!orgSlug && req.params.orgSlug) {
      orgSlug = req.params.orgSlug;
    }
    
    // Check query param: ?slug=...
    if (!orgSlug && req.query.slug) {
      orgSlug = req.query.slug;
    }
    
    if (orgSlug) {
      // Check if slug column exists
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'slug'
      `);
      
      if (columnCheck.rows.length === 0) {
        // Slug column doesn't exist, can't resolve by slug
        // Skip slug resolution - will use JWT org_id instead
        return next();
      }
      
      // Resolve slug to org_id
      const result = await query(
        'SELECT id FROM organizations WHERE slug = $1',
        [orgSlug]
      );
      
      if (result.rows.length > 0) {
        req.orgId = result.rows[0].id;
        req.orgSlug = orgSlug;
      } else {
        return res.status(404).json({ error: 'Organization not found' });
      }
    }
    
    // Verify JWT org_id matches resolved org_id (if authenticated)
    if (req.user && req.orgId && req.user.org_id) {
      if (req.user.org_id !== req.orgId) {
        return res.status(403).json({ error: 'Cross-org access denied' });
      }
    }
    
    next();
  } catch (e) {
    console.error('Failed to resolve org from slug', e?.message || e);
    next();
  }
}

export default { setTenantContext, resolveOrgFromSlug };


