/**
 * Document Vault/Inbox Routes
 * 
 * Handles document templates, e-sign packets, document inbox for employees
 * HR can manage documents, employees can view their inbox
 */

import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireCapability, CAPABILITIES } from '../policy/authorize.js';
import { audit } from '../utils/auditLog.js';
import multer from 'multer';

const router = express.Router();

const upload = multer({ storage: multer.memoryStorage() });

// Ensure document tables exist
const ensureDocumentTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS document_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('offer', 'policy', 'acknowledgment', 'payslip', 'general')),
      file_url TEXT,
      file_type TEXT,
      file_size BIGINT,
      requires_signature BOOLEAN DEFAULT false,
      created_by UUID REFERENCES profiles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS document_assignments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      template_id UUID REFERENCES document_templates(id) ON DELETE CASCADE NOT NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'viewed', 'signed', 'expired')),
      sent_at TIMESTAMPTZ,
      viewed_at TIMESTAMPTZ,
      signed_at TIMESTAMPTZ,
      signature_data JSONB,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS employee_documents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
      document_type TEXT NOT NULL CHECK (document_type IN ('offer', 'policy_ack', 'payslip', 'other')),
      title TEXT NOT NULL,
      file_url TEXT,
      file_type TEXT,
      file_size BIGINT,
      status TEXT NOT NULL DEFAULT 'unread' CHECK (status IN ('unread', 'read', 'archived')),
      created_by UUID REFERENCES profiles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_document_templates_tenant ON document_templates(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_document_assignments_tenant ON document_assignments(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_document_assignments_employee ON document_assignments(employee_id);
    CREATE INDEX IF NOT EXISTS idx_employee_documents_tenant ON employee_documents(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON employee_documents(employee_id);
  `).catch(err => {
    if (!err.message.includes('already exists')) {
      console.error('Error creating document tables:', err);
    }
  });
};

ensureDocumentTables();

// Get document templates (HR/Director/CEO)
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const templatesResult = await query(
      `SELECT 
        dt.*,
        json_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name
        ) as created_by_user
       FROM document_templates dt
       LEFT JOIN profiles p ON p.id = dt.created_by
       WHERE dt.tenant_id = $1
       ORDER BY dt.created_at DESC`,
      [tenantId]
    );

    res.json(templatesResult.rows);
  } catch (error) {
    console.error('Error fetching document templates:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch document templates' });
  }
});

// Create document template (HR/Director/CEO)
router.post('/templates', authenticateToken, requireCapability(CAPABILITIES.POLICIES_CREATE_EDIT), async (req, res) => {
  try {
    const { name, category, file_url, file_type, file_size, requires_signature } = req.body;

    if (!name || !category) {
      return res.status(400).json({ error: 'name and category are required' });
    }

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const templateResult = await query(
      `INSERT INTO document_templates (
        tenant_id, name, category, file_url, file_type, file_size, requires_signature, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [tenantId, name, category, file_url, file_type, file_size, requires_signature || false, req.user.id]
    );

    const template = templateResult.rows[0];

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'document_template_created',
      entityType: 'document_template',
      entityId: template.id,
      details: { name, category },
    });

    res.status(201).json(template);
  } catch (error) {
    console.error('Error creating document template:', error);
    res.status(500).json({ error: error.message || 'Failed to create document template' });
  }
});

// Get employee document inbox
router.get('/inbox', authenticateToken, async (req, res) => {
  try {
    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(403).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;

    // Get tenant
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    // Get documents
    const documentsResult = await query(
      `SELECT 
        ed.*,
        json_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name
        ) as created_by_user
       FROM employee_documents ed
       LEFT JOIN profiles p ON p.id = ed.created_by
       WHERE ed.employee_id = $1 AND ed.tenant_id = $2
       ORDER BY ed.created_at DESC`,
      [employeeId, tenantId]
    );

    // Get pending assignments (e-sign packets)
    const assignmentsResult = await query(
      `SELECT 
        da.*,
        json_build_object(
          'id', dt.id,
          'name', dt.name,
          'category', dt.category,
          'file_url', dt.file_url,
          'requires_signature', dt.requires_signature
        ) as template
       FROM document_assignments da
       JOIN document_templates dt ON dt.id = da.template_id
       WHERE da.employee_id = $1 AND da.tenant_id = $2
       AND da.status IN ('pending', 'sent', 'viewed')
       ORDER BY da.created_at DESC`,
      [employeeId, tenantId]
    );

    res.json({
      documents: documentsResult.rows,
      assignments: assignmentsResult.rows,
    });
  } catch (error) {
    console.error('Error fetching document inbox:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch document inbox' });
  }
});

// Assign document to employee (HR/Director/CEO)
router.post('/assign', authenticateToken, requireCapability(CAPABILITIES.POLICIES_CREATE_EDIT), async (req, res) => {
  try {
    const { template_id, employee_id, expires_at } = req.body;

    if (!template_id || !employee_id) {
      return res.status(400).json({ error: 'template_id and employee_id are required' });
    }

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Verify template and employee belong to tenant
    const templateResult = await query(
      'SELECT id, tenant_id FROM document_templates WHERE id = $1',
      [template_id]
    );

    if (templateResult.rows.length === 0 || templateResult.rows[0].tenant_id !== tenantId) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const empResult = await query(
      'SELECT id, tenant_id FROM employees WHERE id = $1',
      [employee_id]
    );

    if (empResult.rows.length === 0 || empResult.rows[0].tenant_id !== tenantId) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    // Create assignment
    const assignmentResult = await query(
      `INSERT INTO document_assignments (
        tenant_id, template_id, employee_id, status, expires_at
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [tenantId, template_id, employee_id, 'pending', expires_at || null]
    );

    const assignment = assignmentResult.rows[0];

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'document_assigned',
      entityType: 'document_assignment',
      entityId: assignment.id,
      details: { template_id, employee_id },
    });

    res.status(201).json(assignment);
  } catch (error) {
    console.error('Error assigning document:', error);
    res.status(500).json({ error: error.message || 'Failed to assign document' });
  }
});

// Sign document (Employee)
router.post('/assignments/:id/sign', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { signature_data } = req.body;

    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(403).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;

    // Get assignment
    const assignmentResult = await query(
      'SELECT * FROM document_assignments WHERE id = $1',
      [id]
    );

    if (assignmentResult.rows.length === 0) {
      return res.status(404).json({ error: 'Assignment not found' });
    }

    const assignment = assignmentResult.rows[0];

    if (assignment.employee_id !== employeeId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    if (assignment.status === 'signed') {
      return res.status(400).json({ error: 'Document already signed' });
    }

    // Update assignment
    await query(
      `UPDATE document_assignments 
       SET status = $1, signed_at = now(), signature_data = $2, updated_at = now()
       WHERE id = $3`,
      ['signed', JSON.stringify(signature_data || {}), id]
    );

    // Audit log
    await audit({
      actorId: req.user.id,
      action: 'document_signed',
      entityType: 'document_assignment',
      entityId: id,
      details: { assignment_id: id },
    });

    res.json({ success: true, message: 'Document signed successfully' });
  } catch (error) {
    console.error('Error signing document:', error);
    res.status(500).json({ error: error.message || 'Failed to sign document' });
  }
});

// Mark document as read (Employee)
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1',
      [req.user.id]
    );

    if (empResult.rows.length === 0) {
      return res.status(403).json({ error: 'Employee not found' });
    }

    const employeeId = empResult.rows[0].id;

    // Update document status
    await query(
      `UPDATE employee_documents 
       SET status = 'read', updated_at = now()
       WHERE id = $1 AND employee_id = $2`,
      [id, employeeId]
    );

    res.json({ success: true, message: 'Document marked as read' });
  } catch (error) {
    console.error('Error marking document as read:', error);
    res.status(500).json({ error: error.message || 'Failed to mark document as read' });
  }
});

export default router;

