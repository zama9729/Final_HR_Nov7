import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// Ensure policies + policy_versions tables exist (in case migrations haven't run)
let ensurePolicyInfraPromise = null;
const ensurePolicyInfra = async () => {
  if (ensurePolicyInfraPromise) return ensurePolicyInfraPromise;
  ensurePolicyInfraPromise = (async () => {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS policies (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          branch_id UUID REFERENCES org_branches(id) ON DELETE CASCADE,
          key TEXT NOT NULL,
          title TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('doc', 'numeric', 'boolean', 'json')) DEFAULT 'doc',
          value_json JSONB DEFAULT '{}'::jsonb,
          template_text TEXT,
          status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')) DEFAULT 'draft',
          effective_from DATE,
          version INT NOT NULL DEFAULT 1,
          created_by UUID REFERENCES profiles(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          published_at TIMESTAMPTZ,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(org_id, branch_id, key, version)
        );

        CREATE TABLE IF NOT EXISTS policy_versions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
          version_int INT NOT NULL,
          change_note TEXT,
          author UUID REFERENCES profiles(id),
          content_snapshot_json JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(policy_id, version_int)
        );
      `);
    } catch (err) {
      console.error('Error ensuring policy tables:', err);
    }
  })();
  return ensurePolicyInfraPromise;
};

// GET /api/policy-management/policies
router.get('/policies', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensurePolicyInfra();
    const { branch_id, status, type } = req.query;
    const orgId = req.orgId;

    let filters = ['p.org_id = $1'];
    const params = [orgId];
    let paramIndex = 2;

    if (branch_id) {
      filters.push(`(p.branch_id = $${paramIndex++} OR p.branch_id IS NULL)`);
      params.push(branch_id);
    } else {
      filters.push('p.branch_id IS NULL'); // Only org-level by default
    }

    if (status) {
      filters.push(`p.status = $${paramIndex++}`);
      params.push(status);
    }

    if (type) {
      filters.push(`p.type = $${paramIndex++}`);
      params.push(type);
    }

    const result = await queryWithOrg(
      `SELECT 
         p.*,
         pr.first_name || ' ' || pr.last_name as created_by_name
       FROM policies p
       LEFT JOIN profiles pr ON pr.id = p.created_by
       WHERE ${filters.join(' AND ')}
       ORDER BY p.created_at DESC`,
      params,
      orgId
    );

    res.json({ policies: result.rows });
  } catch (error) {
    console.error('Error fetching policies:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policies' });
  }
});

// GET /api/policy-management/policies/:id
router.get('/policies/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensurePolicyInfra();
    const { id } = req.params;
    const orgId = req.orgId;

    const result = await queryWithOrg(
      `SELECT 
         p.*,
         pr.first_name || ' ' || pr.last_name as created_by_name,
         ob.name as branch_name
       FROM policies p
       LEFT JOIN profiles pr ON pr.id = p.created_by
       LEFT JOIN org_branches ob ON ob.id = p.branch_id
       WHERE p.id = $1 AND p.org_id = $2`,
      [id, orgId],
      orgId
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    // Get version history
    const versionsResult = await queryWithOrg(
      `SELECT pv.*, pr.first_name || ' ' || pr.last_name as author_name
       FROM policy_versions pv
       LEFT JOIN profiles pr ON pr.id = pv.author
       WHERE pv.policy_id = $1
       ORDER BY pv.version_int DESC`,
      [id],
      orgId
    );

    res.json({
      ...result.rows[0],
      versions: versionsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching policy:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policy' });
  }
});

// POST /api/policy-management/policies
router.post('/policies', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensurePolicyInfra();
    const {
      branch_id,
      key,
      title,
      type = 'doc',
      value_json = {},
      template_text,
      status = 'draft',
      effective_from,
    } = req.body;

    if (!key || !title) {
      return res.status(400).json({ error: 'key and title are required' });
    }

    const orgId = req.orgId;

    // Check if policy with same key exists
    const existingResult = await queryWithOrg(
      `SELECT id, version FROM policies
       WHERE org_id = $1 AND key = $2 AND (branch_id = $3 OR (branch_id IS NULL AND $3 IS NULL))
       ORDER BY version DESC LIMIT 1`,
      [orgId, key, branch_id || null],
      orgId
    );

    const nextVersion = existingResult.rows.length > 0
      ? existingResult.rows[0].version + 1
      : 1;

    const result = await queryWithOrg(
      `INSERT INTO policies (
        org_id, branch_id, key, title, type, value_json, template_text,
        status, effective_from, version, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        orgId,
        branch_id || null,
        key,
        title,
        type,
        JSON.stringify(value_json),
        template_text || null,
        status,
        effective_from || null,
        nextVersion,
        req.user.id,
      ],
      orgId
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating policy:', error);
    res.status(500).json({ error: error.message || 'Failed to create policy' });
  }
});

// PATCH /api/policy-management/policies/:id
router.patch('/policies/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensurePolicyInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    const {
      title,
      value_json,
      template_text,
      status,
      effective_from,
      change_note,
    } = req.body;

    // Get current policy
    const currentResult = await queryWithOrg(
      'SELECT * FROM policies WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    const current = currentResult.rows[0];
    let newVersion = current.version;
    let publishedAt = current.published_at;

    // If publishing, increment version
    if (status === 'published' && current.status !== 'published') {
      newVersion = current.version + 1;
      publishedAt = new Date();
    }

    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (value_json !== undefined) {
      updates.push(`value_json = $${paramIndex++}::jsonb`);
      params.push(JSON.stringify(value_json));
    }
    if (template_text !== undefined) {
      updates.push(`template_text = $${paramIndex++}`);
      params.push(template_text);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(status);
      if (status === 'published') {
        updates.push(`published_at = $${paramIndex++}`);
        params.push(publishedAt);
        updates.push(`version = $${paramIndex++}`);
        params.push(newVersion);
      }
    }
    if (effective_from !== undefined) {
      updates.push(`effective_from = $${paramIndex++}`);
      params.push(effective_from);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push(`updated_at = now()`);
    params.push(id, orgId);

    const result = await queryWithOrg(
      `UPDATE policies
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND org_id = $${paramIndex++}
       RETURNING *`,
      params,
      orgId
    );

    // Store change note in value_json if provided
    if (change_note && result.rows.length > 0) {
      const updatedPolicy = result.rows[0];
      const updatedValueJson = {
        ...updatedPolicy.value_json,
        change_note,
      };
      await queryWithOrg(
        'UPDATE policies SET value_json = $1::jsonb WHERE id = $2',
        [JSON.stringify(updatedValueJson), id],
        orgId
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating policy:', error);
    res.status(500).json({ error: error.message || 'Failed to update policy' });
  }
});

// DELETE /api/policy-management/policies/:id
router.delete('/policies/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensurePolicyInfra();
    const { id } = req.params;
    const orgId = req.orgId;

    const result = await queryWithOrg(
      'DELETE FROM policies WHERE id = $1 AND org_id = $2 RETURNING id',
      [id, orgId],
      orgId
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json({ success: true, message: 'Policy deleted' });
  } catch (error) {
    console.error('Error deleting policy:', error);
    res.status(500).json({ error: error.message || 'Failed to delete policy' });
  }
});

// POST /api/policy-management/policies/:id/publish
router.post('/policies/:id/publish', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensurePolicyInfra();
    const { id } = req.params;
    const { change_note } = req.body;
    const orgId = req.orgId;

    const currentResult = await queryWithOrg(
      'SELECT * FROM policies WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );

    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    const current = currentResult.rows[0];
    const newVersion = current.status === 'published' ? current.version : current.version + 1;

    const result = await queryWithOrg(
      `UPDATE policies
       SET status = 'published',
           version = $1,
           published_at = now(),
           updated_at = now()
       WHERE id = $2 AND org_id = $3
       RETURNING *`,
      [newVersion, id, orgId],
      orgId
    );

    // Store change note
    if (change_note) {
      const updatedValueJson = {
        ...result.rows[0].value_json,
        change_note,
      };
      await queryWithOrg(
        'UPDATE policies SET value_json = $1::jsonb WHERE id = $2',
        [JSON.stringify(updatedValueJson), id],
        orgId
      );
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error publishing policy:', error);
    res.status(500).json({ error: error.message || 'Failed to publish policy' });
  }
});

// GET /api/policy-management/policies/:id/download?version=:v
router.get('/policies/:id/download', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensurePolicyInfra();
    // Dynamic import of PDFKit to handle ESM
    const pdfkitModule = await import('pdfkit');
    const PDFDocument = pdfkitModule.default || pdfkitModule;

    const { id } = req.params;
    const { version } = req.query;
    const orgId = req.orgId;

    let policy;
    if (version) {
      // Get specific version
      const versionResult = await queryWithOrg(
        `SELECT pv.content_snapshot_json, p.key, p.org_id, o.name as org_name, o.logo_url
         FROM policy_versions pv
         JOIN policies p ON p.id = pv.policy_id
         JOIN organizations o ON o.id = p.org_id
         WHERE pv.policy_id = $1 AND pv.version_int = $2 AND p.org_id = $3`,
        [id, version, orgId],
        orgId
      );

      if (versionResult.rows.length === 0) {
        return res.status(404).json({ error: 'Policy version not found' });
      }

      policy = {
        ...versionResult.rows[0].content_snapshot_json,
        key: versionResult.rows[0].key,
        org_name: versionResult.rows[0].org_name,
        logo_url: versionResult.rows[0].logo_url,
        version: parseInt(version),
      };
    } else {
      // Get current published version
      const result = await queryWithOrg(
        `SELECT p.*, o.name as org_name, o.logo_url
         FROM policies p
         JOIN organizations o ON o.id = p.org_id
         WHERE p.id = $1 AND p.org_id = $2 AND p.status = 'published'`,
        [id, orgId],
        orgId
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Published policy not found' });
      }

      policy = {
        ...result.rows[0],
        org_name: result.rows[0].org_name,
        logo_url: result.rows[0].logo_url,
      };
    }

    // Generate PDF
    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="policy-${policy.key}-v${policy.version || 'latest'}.pdf"`);
    doc.pipe(res);

    // Header with logo
    if (policy.logo_url) {
      // In production, fetch and embed logo image
      doc.text(policy.org_name || 'Organization', { align: 'center' });
    } else {
      doc.fontSize(16).text(policy.org_name || 'Organization', { align: 'center' });
    }

    doc.moveDown();
    doc.fontSize(12).text('Policy Document', { align: 'center' });
    doc.moveDown(2);

    // Policy title
    doc.fontSize(18).text(policy.title || policy.key, { align: 'left' });
    doc.moveDown();

    // Version and effective date
    if (policy.version) {
      doc.fontSize(10).text(`Version: ${policy.version}`, { align: 'left' });
    }
    if (policy.effective_from) {
      doc.fontSize(10).text(`Effective From: ${new Date(policy.effective_from).toLocaleDateString()}`, { align: 'left' });
    }
    doc.moveDown();

    // Policy content
    if (policy.type === 'doc' && policy.template_text) {
      // Replace template variables
      let content = policy.template_text;
      if (policy.value_json && typeof policy.value_json === 'object') {
        Object.entries(policy.value_json).forEach(([key, value]) => {
          content = content.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
        });
      }
      doc.fontSize(11).text(content, { align: 'left' });
    } else if (policy.value_json) {
      doc.fontSize(11).text(JSON.stringify(policy.value_json, null, 2), { align: 'left' });
    }

    // Footer
    doc.fontSize(8)
      .text(`Generated: ${new Date().toLocaleString()}`, 50, doc.page.height - 50, { align: 'left' })
      .text(`Policy ID: ${id}`, doc.page.width - 200, doc.page.height - 50, { align: 'right' });

    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to generate PDF' });
  }
});

export default router;

