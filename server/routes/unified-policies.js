import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { saveDocumentBuffer, getDocumentStream, getPresignedGetUrl, isS3Available } from '../services/storage.js';
import PDFDocument from 'pdfkit';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';

const router = express.Router();

// Ensure unified policy tables exist
let ensureUnifiedPolicyInfraPromise = null;
const ensureUnifiedPolicyInfra = async () => {
  if (ensureUnifiedPolicyInfraPromise) return ensureUnifiedPolicyInfraPromise;
  ensureUnifiedPolicyInfraPromise = (async () => {
    try {
      // Read and execute migration
      const fs = await import('fs');
      const path = await import('path');
      const migrationPath = path.join(process.cwd(), 'server', 'db', 'migrations', '20250130_unified_policy_management.sql');
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      await query(migrationSQL);
    } catch (err) {
      console.error('Error ensuring unified policy tables:', err);
      // If migration file doesn't exist, try to create tables directly
      try {
        await query(`
          DO $$ BEGIN
            CREATE TYPE IF NOT EXISTS policy_category AS ENUM ('LEAVE', 'OFFBOARDING', 'GENERAL');
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$;
          
          DO $$ BEGIN
            CREATE TYPE IF NOT EXISTS unified_policy_status AS ENUM ('DRAFT', 'PENDING_REVIEW', 'PUBLISHED', 'ARCHIVED');
          EXCEPTION WHEN duplicate_object THEN NULL;
          END $$;
        `);
      } catch (e) {
        console.error('Error creating types:', e);
      }
    }
  })();
  return ensureUnifiedPolicyInfraPromise;
};

// Helper to convert HTML to plain text for PDF
function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

// Generate PDF from policy content
async function generatePolicyPDF(policy, orgName) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      
      // Header
      doc.fontSize(16).text(orgName || 'Organization', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text('Policy Document', { align: 'center' });
      doc.moveDown(2);
      
      // Policy title
      doc.fontSize(18).text(policy.title || 'Untitled Policy', { align: 'left' });
      doc.moveDown();
      
      // Metadata
      if (policy.code) {
        doc.fontSize(10).text(`Policy Code: ${policy.code}`, { align: 'left' });
      }
      if (policy.category) {
        doc.fontSize(10).text(`Category: ${policy.category}`, { align: 'left' });
      }
      if (policy.version) {
        doc.fontSize(10).text(`Version: ${policy.version}`, { align: 'left' });
      }
      if (policy.effective_from) {
        doc.fontSize(10).text(`Effective From: ${new Date(policy.effective_from).toLocaleDateString()}`, { align: 'left' });
      }
      doc.moveDown();
      
      // Policy content
      const content = policy.snapshot_html || policy.content_html || '';
      const textContent = htmlToText(content);
      doc.fontSize(11).text(textContent, { align: 'left' });
      
      // Footer
      doc.fontSize(8)
        .text(`Generated: ${new Date().toLocaleString()}`, 50, doc.page.height - 50, { align: 'left' })
        .text(`Policy ID: ${policy.id}`, doc.page.width - 200, doc.page.height - 50, { align: 'right' });
      
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

// GET /api/unified-policies - List policies (HR)
router.get('/', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { category, status, search } = req.query;
    const orgId = req.orgId;
    
    let filters = ['up.org_id = $1'];
    const params = [orgId];
    let paramIndex = 2;
    
    if (category) {
      filters.push(`up.category = $${paramIndex++}`);
      params.push(category);
    }
    
    if (status) {
      filters.push(`up.status = $${paramIndex++}`);
      params.push(status);
    }
    
    if (search) {
      filters.push(`(up.title ILIKE $${paramIndex} OR up.short_description ILIKE $${paramIndex} OR up.code ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    const result = await queryWithOrg(
      `SELECT 
         up.*,
         pr.first_name || ' ' || pr.last_name as created_by_name,
         pub.first_name || ' ' || pub.last_name as published_by_name
       FROM unified_policies up
       LEFT JOIN profiles pr ON pr.id = up.created_by_user_id
       LEFT JOIN profiles pub ON pub.id = up.published_by_user_id
       WHERE ${filters.join(' AND ')}
       ORDER BY up.created_at DESC`,
      params,
      orgId
    );
    
    res.json({ policies: result.rows });
  } catch (error) {
    console.error('Error fetching policies:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policies' });
  }
});

// GET /api/unified-policies/:id - Get policy details (HR)
router.get('/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    const result = await queryWithOrg(
      `SELECT 
         up.*,
         pr.first_name || ' ' || pr.last_name as created_by_name,
         pub.first_name || ' ' || pub.last_name as published_by_name
       FROM unified_policies up
       LEFT JOIN profiles pr ON pr.id = up.created_by_user_id
       LEFT JOIN profiles pub ON pub.id = up.published_by_user_id
       WHERE up.id = $1 AND up.org_id = $2`,
      [id, orgId],
      orgId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    // Get version history
    const versionsResult = await queryWithOrg(
      `SELECT 
         upv.*,
         pr.first_name || ' ' || pr.last_name as published_by_name
       FROM unified_policy_versions upv
       LEFT JOIN profiles pr ON pr.id = upv.published_by_user_id
       WHERE upv.policy_id = $1 AND upv.org_id = $2
       ORDER BY upv.version DESC`,
      [id, orgId],
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

// POST /api/unified-policies - Create policy (HR)
router.post('/', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const {
      category,
      title,
      short_description,
      content_html,
      content_markdown,
      effective_from,
      effective_to,
    } = req.body;
    
    if (!category || !title || !content_html) {
      return res.status(400).json({ error: 'category, title, and content_html are required' });
    }
    
    if (!['LEAVE', 'OFFBOARDING', 'GENERAL'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Must be LEAVE, OFFBOARDING, or GENERAL' });
    }
    
    const orgId = req.orgId;
    
    // Generate policy code
    const codeResult = await queryWithOrg(
      `SELECT generate_policy_code($1, $2::policy_category) as code`,
      [orgId, category],
      orgId
    );
    const code = codeResult.rows[0].code;
    
    const result = await queryWithOrg(
      `INSERT INTO unified_policies (
        org_id, category, code, title, short_description,
        content_html, content_markdown, status, effective_from, effective_to,
        created_by_user_id, updated_by_user_id
      ) VALUES ($1, $2::policy_category, $3, $4, $5, $6, $7, 'DRAFT', $8, $9, $10, $10)
      RETURNING *`,
      [
        orgId,
        category,
        code,
        title,
        short_description || null,
        content_html,
        content_markdown || null,
        effective_from || null,
        effective_to || null,
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

// PATCH /api/unified-policies/:id - Update policy (HR)
router.patch('/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    const {
      title,
      short_description,
      content_html,
      content_markdown,
      effective_from,
      effective_to,
      status,
    } = req.body;
    
    // Get current policy
    const currentResult = await queryWithOrg(
      'SELECT * FROM unified_policies WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    const current = currentResult.rows[0];
    
    // Don't allow editing published policies directly (must archive first or create new version)
    if (current.status === 'PUBLISHED' && status !== 'ARCHIVED') {
      return res.status(400).json({ error: 'Cannot edit published policy. Archive it first or create a new version.' });
    }
    
    // Build update query
    const updates = [];
    const params = [];
    let paramIndex = 1;
    
    if (title !== undefined) {
      updates.push(`title = $${paramIndex++}`);
      params.push(title);
    }
    if (short_description !== undefined) {
      updates.push(`short_description = $${paramIndex++}`);
      params.push(short_description);
    }
    if (content_html !== undefined) {
      updates.push(`content_html = $${paramIndex++}`);
      params.push(content_html);
    }
    if (content_markdown !== undefined) {
      updates.push(`content_markdown = $${paramIndex++}`);
      params.push(content_markdown);
    }
    if (effective_from !== undefined) {
      updates.push(`effective_from = $${paramIndex++}`);
      params.push(effective_from || null);
    }
    if (effective_to !== undefined) {
      updates.push(`effective_to = $${paramIndex++}`);
      params.push(effective_to || null);
    }
    if (status !== undefined) {
      updates.push(`status = $${paramIndex++}::unified_policy_status`);
      params.push(status);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_by_user_id = $${paramIndex++}`);
    params.push(req.user.id);
    params.push(id, orgId);
    
    const result = await queryWithOrg(
      `UPDATE unified_policies
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND org_id = $${paramIndex++}
       RETURNING *`,
      params,
      orgId
    );
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating policy:', error);
    res.status(500).json({ error: error.message || 'Failed to update policy' });
  }
});

// POST /api/unified-policies/:id/publish - Publish policy (HR)
router.post('/:id/publish', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { id } = req.params;
    const { changelog_text } = req.body;
    const orgId = req.orgId;
    
    // Get current policy
    const currentResult = await queryWithOrg(
      'SELECT * FROM unified_policies WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );
    
    if (currentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    const current = currentResult.rows[0];
    
    // Validate required fields
    if (!current.title || !current.content_html || !current.effective_from) {
      return res.status(400).json({ 
        error: 'Policy must have title, content_html, and effective_from before publishing' 
      });
    }
    
    // Update status to PUBLISHED (trigger will handle versioning)
    const updateResult = await queryWithOrg(
      `UPDATE unified_policies
       SET status = 'PUBLISHED',
           published_at = now(),
           published_by_user_id = $1,
           updated_by_user_id = $1
       WHERE id = $2 AND org_id = $3
       RETURNING *`,
      [req.user.id, id, orgId],
      orgId
    );
    
    const publishedPolicy = updateResult.rows[0];
    
    // Get the version that was just created
    const versionResult = await queryWithOrg(
      `SELECT * FROM unified_policy_versions
       WHERE policy_id = $1 AND org_id = $2 AND version = $3`,
      [id, orgId, publishedPolicy.version],
      orgId
    );
    
    if (versionResult.rows.length === 0) {
      return res.status(500).json({ error: 'Version snapshot not created' });
    }
    
    const version = versionResult.rows[0];
    
    // Update changelog if provided
    if (changelog_text) {
      await queryWithOrg(
        `UPDATE unified_policy_versions
         SET changelog_text = $1
         WHERE id = $2 AND org_id = $3`,
        [changelog_text, version.id, orgId],
        orgId
      );
    }
    
    // Generate PDF and store in MinIO/S3
    try {
      const orgResult = await queryWithOrg(
        'SELECT name FROM organizations WHERE id = $1',
        [orgId],
        orgId
      );
      const orgName = orgResult.rows[0]?.name || 'Organization';
      
      const pdfBuffer = await generatePolicyPDF({
        ...publishedPolicy,
        snapshot_html: version.snapshot_html,
      }, orgName);
      
      // Store PDF in object storage
      const storageKey = `${orgId}/policies/${id}/v${publishedPolicy.version}.pdf`;
      const storageResult = await saveDocumentBuffer({
        buffer: pdfBuffer,
        mimeType: 'application/pdf',
        extension: 'pdf',
        originalName: `policy-${publishedPolicy.code}-v${publishedPolicy.version}.pdf`,
        tenantId: orgId,
      });
      
      // Update version with storage key
      await queryWithOrg(
        `UPDATE unified_policy_versions
         SET file_storage_key = $1
         WHERE id = $2 AND org_id = $3`,
        [storageResult.storageKey, version.id, orgId],
        orgId
      );
      
      // Trigger RAG ingestion (async, don't wait for completion)
      // Note: RAG ingestion can be triggered manually via the /rag/ingest endpoint
      // or set up as a background job. For now, we log that it should be ingested.
      console.log(`[RAG] Policy ${publishedPolicy.code} v${publishedPolicy.version} published. Use /api/unified-policies/${id}/rag/ingest to ingest into RAG.`);
      
    } catch (pdfError) {
      console.error('Error generating/storing PDF:', pdfError);
      // Don't fail the publish if PDF generation fails
    }
    
    res.json({
      ...publishedPolicy,
      version_snapshot: version,
    });
  } catch (error) {
    console.error('Error publishing policy:', error);
    res.status(500).json({ error: error.message || 'Failed to publish policy' });
  }
});

// POST /api/unified-policies/:id/archive - Archive policy (HR)
router.post('/:id/archive', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    const result = await queryWithOrg(
      `UPDATE unified_policies
       SET status = 'ARCHIVED',
           updated_by_user_id = $1
       WHERE id = $2 AND org_id = $3
       RETURNING *`,
      [req.user.id, id, orgId],
      orgId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error archiving policy:', error);
    res.status(500).json({ error: error.message || 'Failed to archive policy' });
  }
});

// GET /api/unified-policies/:id/versions - Get policy version history (HR)
router.get('/:id/versions', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    const result = await queryWithOrg(
      `SELECT 
         upv.*,
         pr.first_name || ' ' || pr.last_name as published_by_name
       FROM unified_policy_versions upv
       LEFT JOIN profiles pr ON pr.id = upv.published_by_user_id
       WHERE upv.policy_id = $1 AND upv.org_id = $2
       ORDER BY upv.version DESC`,
      [id, orgId],
      orgId
    );
    
    res.json({ versions: result.rows });
  } catch (error) {
    console.error('Error fetching policy versions:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policy versions' });
  }
});

// GET /api/unified-policies/:id/versions/:version - Get specific version (HR)
router.get('/:id/versions/:version', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { id, version } = req.params;
    const orgId = req.orgId;
    
    const result = await queryWithOrg(
      `SELECT 
         upv.*,
         pr.first_name || ' ' || pr.last_name as published_by_name
       FROM unified_policy_versions upv
       LEFT JOIN profiles pr ON pr.id = upv.published_by_user_id
       WHERE upv.policy_id = $1 AND upv.org_id = $2 AND upv.version = $3`,
      [id, orgId, parseInt(version)],
      orgId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Policy version not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching policy version:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policy version' });
  }
});

// GET /api/unified-policies/:id/versions/:version/download - Download PDF (HR/Employee)
router.get('/:id/versions/:version/download', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { id, version } = req.params;
    const orgId = req.orgId;
    
    // Get version
    const versionResult = await queryWithOrg(
      `SELECT upv.*, up.code, up.title
       FROM unified_policy_versions upv
       JOIN unified_policies up ON up.id = upv.policy_id
       WHERE upv.policy_id = $1 AND upv.org_id = $2 AND upv.version = $3`,
      [id, orgId, parseInt(version)],
      orgId
    );
    
    if (versionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy version not found' });
    }
    
    const versionData = versionResult.rows[0];
    
    // Check if employee can access (must be published)
    const policyResult = await queryWithOrg(
      'SELECT status FROM unified_policies WHERE id = $1 AND org_id = $2',
      [id, orgId],
      orgId
    );
    
    if (policyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }
    
    const isHrUser = ['hr', 'director', 'ceo', 'admin'].includes(req.user.role);
    if (!isHrUser && policyResult.rows[0].status !== 'PUBLISHED') {
      return res.status(403).json({ error: 'Policy not published' });
    }
    
    // If PDF exists in storage, stream it
    if (versionData.file_storage_key) {
      try {
        if (isS3Available()) {
          // Generate presigned URL for S3
          const presignedUrl = await getPresignedGetUrl({
            objectKey: versionData.file_storage_key,
            expiresIn: 3600, // 1 hour
          });
          // Return JSON with presigned URL
          return res.json({ downloadUrl: presignedUrl });
        } else {
          // Stream from local storage
          const streamResult = await getDocumentStream(versionData.file_storage_key);
          res.setHeader('Content-Type', 'application/pdf');
          res.setHeader('Content-Disposition', `attachment; filename="policy-${versionData.code}-v${version}.pdf"`);
          // Pipe the stream to response
          if (streamResult.stream.pipe) {
            streamResult.stream.pipe(res);
          } else {
            // If it's a buffer, send it directly
            const chunks = [];
            for await (const chunk of streamResult.stream) {
              chunks.push(chunk);
            }
            res.send(Buffer.concat(chunks));
          }
          return;
        }
      } catch (storageError) {
        console.error('Error accessing stored PDF, generating on-the-fly:', storageError);
        // Fall through to generate PDF on-the-fly
      }
    }
    
    // Generate PDF on-the-fly if not stored
    const orgResult = await queryWithOrg(
      'SELECT name FROM organizations WHERE id = $1',
      [orgId],
      orgId
    );
    const orgName = orgResult.rows[0]?.name || 'Organization';
    
    const pdfBuffer = await generatePolicyPDF({
      ...versionData,
      snapshot_html: versionData.snapshot_html,
    }, orgName);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="policy-${versionData.code}-v${version}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error downloading policy PDF:', error);
    res.status(500).json({ error: error.message || 'Failed to download policy PDF' });
  }
});

// ========== EMPLOYEE ENDPOINTS ==========

// GET /api/me/policies - List published policies for employee
router.get('/me/policies', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { category, search } = req.query;
    const orgId = req.orgId;
    
    let filters = ['up.org_id = $1', "up.status = 'PUBLISHED'"];
    const params = [orgId];
    let paramIndex = 2;
    
    if (category) {
      filters.push(`up.category = $${paramIndex++}`);
      params.push(category);
    }
    
    if (search) {
      filters.push(`(up.title ILIKE $${paramIndex} OR up.short_description ILIKE $${paramIndex} OR up.code ILIKE $${paramIndex})`);
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    const result = await queryWithOrg(
      `SELECT 
         up.id,
         up.code,
         up.title,
         up.short_description,
         up.category,
         up.version,
         up.effective_from,
         up.effective_to,
         up.published_at,
         upv.snapshot_html as content_html
       FROM unified_policies up
       LEFT JOIN LATERAL (
         SELECT snapshot_html
         FROM unified_policy_versions
         WHERE policy_id = up.id AND version = up.version
         LIMIT 1
       ) upv ON true
       WHERE ${filters.join(' AND ')}
       ORDER BY up.published_at DESC, up.created_at DESC`,
      params,
      orgId
    );
    
    res.json({ policies: result.rows });
  } catch (error) {
    console.error('Error fetching employee policies:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policies' });
  }
});

// GET /api/me/policies/:id - Get published policy detail for employee
router.get('/me/policies/:id', authenticateToken, setTenantContext, async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    // Get latest published version
    const result = await queryWithOrg(
      `SELECT 
         up.id,
         up.code,
         up.title,
         up.short_description,
         up.category,
         up.version,
         up.effective_from,
         up.effective_to,
         up.published_at,
         upv.snapshot_html as content_html,
         upv.snapshot_markdown,
         upv.changelog_text,
         pr.first_name || ' ' || pr.last_name as published_by_name
       FROM unified_policies up
       LEFT JOIN unified_policy_versions upv ON upv.policy_id = up.id AND upv.version = up.version
       LEFT JOIN profiles pr ON pr.id = up.published_by_user_id
       WHERE up.id = $1 AND up.org_id = $2 AND up.status = 'PUBLISHED'`,
      [id, orgId],
      orgId
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Published policy not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching employee policy:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch policy' });
  }
});

// POST /api/unified-policies/rag/reindex - Re-index all published policies for RAG (HR/Admin)
// Note: This endpoint requires form-data and node-fetch packages. Install them if needed:
// npm install form-data node-fetch@2
router.post('/rag/reindex', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const orgId = req.orgId;
    
    // Get all published policies
    const policiesResult = await queryWithOrg(
      `SELECT 
         up.id,
         up.code,
         up.title,
         up.category,
         up.version,
         upv.snapshot_markdown,
         upv.snapshot_html
       FROM unified_policies up
       JOIN unified_policy_versions upv ON upv.policy_id = up.id AND upv.version = up.version
       WHERE up.org_id = $1 AND up.status = 'PUBLISHED'`,
      [orgId],
      orgId
    );
    
    res.json({
      success: true,
      message: `Found ${policiesResult.rows.length} published policies. RAG ingestion requires form-data and node-fetch packages. Use individual /:id/rag/ingest endpoint or set up a background job.`,
      policies: policiesResult.rows.map(p => ({ id: p.id, code: p.code, title: p.title })),
    });
  } catch (error) {
    console.error('Error reindexing policies for RAG:', error);
    res.status(500).json({ error: error.message || 'Failed to reindex policies' });
  }
});

// POST /api/unified-policies/:id/rag/ingest - Ingest single policy into RAG (HR/Admin)
// Note: This endpoint requires form-data and node-fetch packages. Install them if needed:
// npm install form-data node-fetch@2
router.post('/:id/rag/ingest', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureUnifiedPolicyInfra();
    const { id } = req.params;
    const orgId = req.orgId;
    
    // Get latest published version
    const policyResult = await queryWithOrg(
      `SELECT 
         up.id,
         up.code,
         up.title,
         up.category,
         up.version,
         upv.snapshot_markdown,
         upv.snapshot_html
       FROM unified_policies up
       JOIN unified_policy_versions upv ON upv.policy_id = up.id AND upv.version = up.version
       WHERE up.id = $1 AND up.org_id = $2 AND up.status = 'PUBLISHED'`,
      [id, orgId],
      orgId
    );
    
    if (policyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Published policy not found' });
    }
    
    const policy = policyResult.rows[0];
    const content = policy.snapshot_markdown || htmlToText(policy.snapshot_html || '');
    
    if (!content.trim()) {
      return res.status(400).json({ error: 'Policy has no content to ingest' });
    }
    
    // Return instructions for manual ingestion or background job setup
    res.json({
      success: true,
      message: 'Policy ready for RAG ingestion. To enable automatic ingestion, install form-data and node-fetch packages, or set up a background job.',
      policy: {
        id: policy.id,
        code: policy.code,
        title: policy.title,
        content_length: content.length,
      },
      instructions: 'Use the RAG service API directly or set up a Celery/background job to ingest policies automatically on publish.',
    });
  } catch (error) {
    console.error('Error ingesting policy into RAG:', error);
    res.status(500).json({ error: error.message || 'Failed to ingest policy into RAG' });
  }
});

export default router;

