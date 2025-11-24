import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// Get policy catalog (all available policies)
router.get('/catalog', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT id, key, display_name, category, description, value_type FROM policy_catalog ORDER BY category, display_name'
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching policy catalog:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policy catalog' });
  }
});

// Get effective org policies (with date filtering)
router.get('/org', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    // Try to get policies from org_policies table (policy_catalog based schema)
    let legacyPolicies = [];
    try {
      // Check if the old schema table exists by checking for policy_key column
      const tableCheck = await queryWithOrg(
        `SELECT column_name FROM information_schema.columns 
         WHERE table_name = 'org_policies' AND column_name = 'policy_key'`,
        [],
        orgId
      );
      
      if (tableCheck.rows.length > 0) {
        // Old schema exists
        const legacyResult = await queryWithOrg(
          `SELECT 
            op.id,
            op.org_id,
            op.policy_key,
            pc.display_name,
            pc.category,
            pc.description,
            pc.value_type,
            op.value,
            op.effective_from,
            op.effective_to
          FROM org_policies op
          JOIN policy_catalog pc ON pc.key = op.policy_key
          WHERE op.org_id = $1
          ORDER BY pc.category, pc.display_name`,
          [orgId],
          orgId
        );
        legacyPolicies = legacyResult.rows.map(row => ({
          id: row.id,
          org_id: row.org_id,
          policy_key: row.policy_key,
          display_name: row.display_name,
          category: row.category,
          description: row.description,
          value_type: row.value_type,
          value: row.value,
          effective_from: row.effective_from,
          effective_to: row.effective_to,
        }));
      }
    } catch (err) {
      // Old schema doesn't exist or has different structure, continue
      console.log('Legacy schema not found, using new schema');
    }

    // Get policies from new schema (policy-platform)
    let newPolicies = [];
    try {
      const newResult = await queryWithOrg(
        `SELECT 
          op.id,
          op.org_id,
          op.name as display_name,
          op.status,
          op.tags,
          pt.name as template_name,
          pt.country,
          pv.variables,
          pv.sections,
          pv.version,
          pv.effective_from
        FROM org_policies op
        LEFT JOIN policy_templates pt ON pt.id = op.template_id
        LEFT JOIN LATERAL (
          SELECT variables, sections, version, effective_from
          FROM policy_versions
          WHERE org_policy_id = op.id
          ORDER BY version DESC
          LIMIT 1
        ) pv ON true
        WHERE op.org_id = $1
        ORDER BY op.created_at DESC`,
        [orgId],
        orgId
      );

      newPolicies = newResult.rows.map(row => ({
        id: row.id,
        org_id: row.org_id,
        display_name: row.display_name,
        category: row.tags?.[0] || 'General',
        description: row.template_name || '',
        value_type: 'JSON',
        value: row.variables || {},
        effective_from: row.effective_from || row.created_at,
        effective_to: null,
        status: row.status,
        template_name: row.template_name,
      }));
    } catch (err) {
      // New schema doesn't exist, that's okay
      console.log('New schema not found');
    }

    // Combine both (legacy takes precedence if both exist)
    const allPolicies = [...legacyPolicies, ...newPolicies];

    res.json(allPolicies);
  } catch (error) {
    console.error('Error fetching org policies:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch org policies' });
  }
});

// Create/update org policy (HR/CEO/Admin)
router.post('/org', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    const { policy_key, value, effective_from, effective_to } = req.body;

    if (!policy_key || !value) {
      return res.status(400).json({ error: 'policy_key and value are required' });
    }

    // Verify policy exists in catalog
    const catalogCheck = await query(
      'SELECT key FROM policy_catalog WHERE key = $1',
      [policy_key]
    );

    if (catalogCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid policy key' });
    }

    // Use legacy table for policy_catalog based policies
    const effectiveFrom = effective_from || new Date().toISOString().split('T')[0];
    
    // Check for existing policy with same effective_from
    const existing = await queryWithOrg(
      'SELECT id FROM org_policies_legacy WHERE org_id = $1 AND policy_key = $2 AND effective_from = $3',
      [orgId, policy_key, effectiveFrom],
      orgId
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await queryWithOrg(
        `UPDATE org_policies_legacy 
         SET value = $1, effective_to = $2, created_at = now()
         WHERE id = $3
         RETURNING id, org_id, policy_key, value, effective_from, effective_to`,
        [JSON.stringify(value), effective_to || null, existing.rows[0].id],
        orgId
      );
    } else {
      // Create new
      result = await queryWithOrg(
        `INSERT INTO org_policies_legacy (org_id, policy_key, value, effective_from, effective_to)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, org_id, policy_key, value, effective_from, effective_to`,
        [
          orgId,
          policy_key,
          JSON.stringify(value),
          effectiveFrom,
          effective_to || null
        ],
        orgId
      );
    }

    // Log audit
    await queryWithOrg(
      `INSERT INTO audit_logs (org_id, actor_user_id, action, object_type, object_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        req.user.id,
        existing.rows.length > 0 ? 'update' : 'create',
        'org_policy',
        result.rows[0].id,
        JSON.stringify({ policy_key, effective_from, effective_to })
      ],
      orgId
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating/updating org policy:', error);
    res.status(500).json({ error: error.message || 'Failed to create/update org policy' });
  }
});

// Get resolved policies for employee (employee override > org policy)
router.get('/employee/:userId', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { userId } = req.params;
    const orgId = req.orgId || req.user?.org_id;
    
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    // Verify user belongs to same org
    const userCheck = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0 || userCheck.rows[0].tenant_id !== orgId) {
      return res.status(403).json({ error: 'User not found or cross-org access denied' });
    }

    const { date } = req.query;
    const effectiveDate = date || new Date().toISOString().split('T')[0];

    // Get all policies from catalog
    const catalogResult = await query(
      'SELECT key, display_name, category, description, value_type FROM policy_catalog ORDER BY category, display_name'
    );

    const policies = [];

    for (const policy of catalogResult.rows) {
      // Use resolve_policy_value function
      const resolved = await queryWithOrg(
        'SELECT resolve_policy_value($1, $2, $3::date) as value',
        [userId, policy.key, effectiveDate],
        orgId
      );

      if (resolved.rows[0].value) {
        policies.push({
          policy_key: policy.key,
          display_name: policy.display_name,
          category: policy.category,
          description: policy.description,
          value_type: policy.value_type,
          value: resolved.rows[0].value,
          source: 'resolved'
        });
      }
    }

    res.json(policies);
  } catch (error) {
    console.error('Error fetching employee policies:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch employee policies' });
  }
});

// Create/update employee policy override (HR/CEO/Admin)
router.post('/employee/:userId', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin', 'director'), async (req, res) => {
  try {
    const { userId } = req.params;
    const orgId = req.orgId || req.user?.org_id;
    
    if (!orgId) {
      return res.status(400).json({ error: 'Organization not found' });
    }

    // Verify user belongs to same org
    const userCheck = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (userCheck.rows.length === 0 || userCheck.rows[0].tenant_id !== orgId) {
      return res.status(403).json({ error: 'User not found or cross-org access denied' });
    }

    const { policy_key, value, effective_from, effective_to } = req.body;

    if (!policy_key || !value) {
      return res.status(400).json({ error: 'policy_key and value are required' });
    }

    // Verify policy exists in catalog
    const catalogCheck = await query(
      'SELECT key FROM policy_catalog WHERE key = $1',
      [policy_key]
    );

    if (catalogCheck.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid policy key' });
    }

    // Check for existing override
    const existing = await queryWithOrg(
      'SELECT id FROM employee_policies WHERE user_id = $1 AND policy_key = $2 AND effective_from = $3',
      [userId, policy_key, effective_from || new Date().toISOString().split('T')[0]],
      orgId
    );

    let result;
    if (existing.rows.length > 0) {
      // Update existing
      result = await queryWithOrg(
        `UPDATE employee_policies 
         SET value = $1, effective_to = $2
         WHERE id = $3
         RETURNING id, user_id, policy_key, value, effective_from, effective_to`,
        [JSON.stringify(value), effective_to || null, existing.rows[0].id],
        orgId
      );
    } else {
      // Create new
      result = await queryWithOrg(
        `INSERT INTO employee_policies (user_id, policy_key, value, effective_from, effective_to)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, user_id, policy_key, value, effective_from, effective_to`,
        [
          userId,
          policy_key,
          JSON.stringify(value),
          effective_from || new Date().toISOString().split('T')[0],
          effective_to || null
        ],
        orgId
      );
    }

    // Log audit
    await queryWithOrg(
      `INSERT INTO audit_logs (org_id, actor_user_id, action, object_type, object_id, payload)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        orgId,
        req.user.id,
        existing.rows.length > 0 ? 'update' : 'create',
        'employee_policy',
        result.rows[0].id,
        JSON.stringify({ user_id: userId, policy_key, effective_from, effective_to })
      ],
      orgId
    );

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error creating/updating employee policy:', error);
    res.status(500).json({ error: error.message || 'Failed to create/update employee policy' });
  }
});

export default router;

