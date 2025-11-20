import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { query, queryWithOrg } from '../db/pool.js';

const router = express.Router();

router.use(authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin'));

router.get('/templates', async (req, res) => {
  try {
    const { country = 'IN', search } = req.query;
    const params = [country];
    let sql = `
      SELECT id, name, country, tags, sections, variables, legal_refs
      FROM policy_templates
      WHERE country = $1
    `;
    if (search) {
      params.push(`%${String(search).toLowerCase()}%`);
      sql += ' AND LOWER(name) LIKE $2';
    }
    sql += ' ORDER BY name';
    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch policy templates', error);
    res.status(500).json({ error: error.message || 'Unable to fetch templates' });
  }
});

router.get('/policies', async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    const { rows } = await queryWithOrg(
      `SELECT 
        op.*,
        pt.name as template_name,
        pt.country,
        last_version.version,
        last_version.effective_from,
        last_version.variables
       FROM org_policies op
       LEFT JOIN policy_templates pt ON pt.id = op.template_id
       LEFT JOIN LATERAL (
        SELECT version, effective_from, variables
        FROM policy_versions
        WHERE org_policy_id = op.id
        ORDER BY version DESC
        LIMIT 1
       ) last_version ON true
       WHERE op.org_id = $1
       ORDER BY op.created_at DESC`,
      [orgId],
      orgId
    );
    res.json(rows);
  } catch (error) {
    console.error('Failed to fetch org policies', error);
    res.status(500).json({ error: error.message || 'Unable to fetch policies' });
  }
});

router.post('/policies', async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    const { templateId, name, status = 'draft', variables = {}, tags = [] } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'Policy name is required' });
    }
    let policy;
    if (templateId) {
      const existing = await queryWithOrg(
        'SELECT * FROM org_policies WHERE org_id = $1 AND template_id = $2',
        [orgId, templateId],
        orgId
      );
      if (existing.rows.length) {
        policy = await queryWithOrg(
          `UPDATE org_policies
           SET name = $3, tags = $4, status = $5, updated_at = now()
           WHERE id = $2
           RETURNING *`,
          [orgId, existing.rows[0].id, name, tags, status],
          orgId
        );
      } else {
        policy = await queryWithOrg(
          `INSERT INTO org_policies (org_id, template_id, name, status, tags)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [orgId, templateId, name, status, tags],
          orgId
        );
      }
    } else {
      policy = await queryWithOrg(
        `INSERT INTO org_policies (org_id, name, status, tags)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [orgId, name, status, tags],
        orgId
      );
    }
    res.json({ ...policy.rows[0], variables });
  } catch (error) {
    console.error('Failed to upsert policy', error);
    res.status(500).json({ error: error.message || 'Unable to save policy' });
  }
});

router.post('/policies/:policyId/publish', async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    const { policyId } = req.params;
    const { variables = {}, effective_from } = req.body || {};

    const policyRes = await queryWithOrg(
      'SELECT id, latest_version FROM org_policies WHERE id = $1 AND org_id = $2',
      [policyId, orgId],
      orgId
    );
    if (!policyRes.rows.length) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    const currentVersion = Number(policyRes.rows[0].latest_version || 0);
    const nextVersion = currentVersion + 1;

    const versionRes = await queryWithOrg(
      `INSERT INTO policy_versions (org_policy_id, version, effective_from, sections, variables)
       VALUES ($1, $2, COALESCE($3::date, now()::date), '[]'::jsonb, $4::jsonb)
       RETURNING *`,
      [policyId, nextVersion, effective_from, JSON.stringify(variables)],
      orgId
    );

    const entries = Object.entries(variables || {});
    for (const [key, value] of entries) {
      await queryWithOrg(
        `INSERT INTO policy_values (org_policy_id, version, key, value)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (org_policy_id, version, key)
         DO UPDATE SET value = EXCLUDED.value`,
        [policyId, nextVersion, key, String(value)],
        orgId
      );
    }

    await queryWithOrg(
      `UPDATE org_policies
       SET latest_version = $2, status = 'active', updated_at = now()
       WHERE id = $1`,
      [policyId, nextVersion],
      orgId
    );

    res.json(versionRes.rows[0]);
  } catch (error) {
    console.error('Failed to publish policy', error);
    res.status(500).json({ error: error.message || 'Unable to publish policy' });
  }
});

export default router;

