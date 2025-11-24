import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { audit } from '../utils/auditLog.js';
import {
  calculateSettlementPreview,
  determineWorkflowStages,
  allowedRolesForStatus,
} from '../services/termination-settlement.js';

const router = express.Router();
const FEATURE_ENABLED = process.env.TERMINATION_REHIRE_V1 !== 'false';

const getTenantId = async (userId) => {
  const { rows } = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return rows[0]?.tenant_id || null;
};

const getUserRoles = async (userId) => {
  const { rows } = await query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return rows.map((r) => r.role?.toLowerCase()).filter(Boolean);
};

const fetchTermination = async (terminationId, tenantId) => {
  const { rows } = await query(
    `
    SELECT 
      t.*,
      json_build_object(
        'id', e.id,
        'employee_id', e.employee_id,
        'department', e.department,
        'manager_id', e.reporting_manager_id
      ) AS employee,
      json_build_object(
        'id', p.id,
        'first_name', p.first_name,
        'last_name', p.last_name,
        'email', p.email
      ) AS employee_profile
    FROM terminations t
    JOIN employees e ON e.id = t.employee_id
    JOIN profiles p ON p.id = e.user_id
    WHERE t.id = $1 AND ($2::uuid IS NULL OR t.tenant_id = $2)
    `,
    [terminationId, tenantId || null]
  );
  return rows[0] || null;
};

const enrichTermination = async (terminationId, tenantId) => {
  const termination = await fetchTermination(terminationId, tenantId);
  if (!termination) return null;
  const auditTrail = await query(
    `
    SELECT ta.*, pr.first_name, pr.last_name
    FROM termination_audit ta
    LEFT JOIN profiles pr ON pr.id = ta.actor_id
    WHERE ta.termination_id = $1
    ORDER BY ta.created_at ASC
    `,
    [terminationId]
  );
  termination.audit_trail = auditTrail.rows;
  const checklist = await query(
    `
    SELECT * FROM termination_checklist_items
    WHERE termination_id = $1
    ORDER BY created_at ASC
    `,
    [terminationId]
  );
  termination.checklist_items = checklist.rows;
  return termination;
};

const getNextStatus = (type, currentStatus) => {
  const workflow = determineWorkflowStages(type);
  if (!workflow.length) return 'completed';
  if (currentStatus === 'initiated') {
    return workflow[0];
  }
  const idx = workflow.indexOf(currentStatus);
  if (idx === -1) return workflow[0];
  return workflow[idx + 1] || 'completed';
};

router.use((req, res, next) => {
  if (!FEATURE_ENABLED) {
    return res.status(404).json({ error: 'termination_rehire_v1 feature flag disabled' });
  }
  next();
});

router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const { rows } = await query(
      `
      SELECT 
        t.*,
        json_build_object(
          'id', e.id,
          'employee_id', e.employee_id,
          'department', e.department
        ) AS employee,
        json_build_object(
          'id', p.id,
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) AS employee_profile
      FROM terminations t
      JOIN employees e ON e.id = t.employee_id
      JOIN profiles p ON p.id = e.user_id
      WHERE t.tenant_id = $1
      ORDER BY t.created_at DESC
      LIMIT 200
      `,
      [tenantId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching terminations:', error);
    res.status(500).json({ error: 'Failed to fetch terminations' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const record = await enrichTermination(req.params.id, tenantId);
    if (!record) {
      return res.status(404).json({ error: 'Termination not found' });
    }
    res.json(record);
  } catch (error) {
    console.error('Error fetching termination:', error);
    res.status(500).json({ error: 'Failed to fetch termination' });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const roles = await getUserRoles(req.user.id);
    if (!roles.some((role) => ['hr', 'admin', 'orgadmin'].includes(role))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const {
      employee_id,
      type,
      reason_text,
      proposed_lwd,
      attachments = [],
      evidence_refs = [],
    } = req.body;

    if (!employee_id || !type) {
      return res.status(400).json({ error: 'employee_id and type are required' });
    }

    const preview = await calculateSettlementPreview({
      employeeId: employee_id,
      tenantId,
      type,
      proposedLastWorkingDate: proposed_lwd,
    });

    const workflow = determineWorkflowStages(type);
    const initialStatus = workflow[0] || 'hr_review';

    const insertResult = await query(
      `
      INSERT INTO terminations (
        tenant_id,
        employee_id,
        type,
        initiator_id,
        initiator_role,
        reason_text,
        evidence_refs,
        proposed_lwd,
        notice_days,
        notice_pay_amount,
        gratuity_amount,
        retrenchment_comp_amount,
        settlement_amount,
        status,
        attachments
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::termination_status_enum,$15
      )
      RETURNING id
      `,
      [
        tenantId,
        employee_id,
        type,
        req.user.id,
        roles[0] || null,
        reason_text || null,
        JSON.stringify(evidence_refs || []),
        proposed_lwd || null,
        preview.noticeDays,
        preview.lines.find((l) => l.code === 'NOTICE_PAY')?.amount || 0,
        preview.lines.find((l) => l.code === 'GRATUITY')?.amount || 0,
        preview.lines.find((l) => l.code === 'RETRENCHMENT')?.amount || 0,
        preview.totals.payable,
        initialStatus,
        JSON.stringify(attachments || []),
      ]
    );

    const insertedId = insertResult.rows[0].id;

    await query(
      `
      INSERT INTO termination_audit (termination_id, action, actor_id, actor_role, reason, snapshot_json)
      VALUES ($1,'created',$2,$3,$4,$5)
      `,
      [insertedId, req.user.id, roles[0] || null, reason_text || null, JSON.stringify({ preview, workflow })]
    );

    await audit({
      actorId: req.user.id,
      action: 'termination_initiated',
      entityType: 'termination',
      entityId: insertedId,
      details: { type, proposed_lwd },
    });

    const response = await enrichTermination(insertedId, tenantId);
    res.status(201).json(response);
  } catch (error) {
    console.error('Error initiating termination:', error);
    res.status(500).json({ error: error.message || 'Failed to create termination' });
  }
});

router.get('/:id/preview_settlement', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const termination = await fetchTermination(req.params.id, tenantId);
    if (!termination) {
      return res.status(404).json({ error: 'Termination not found' });
    }
    const preview = await calculateSettlementPreview({
      employeeId: termination.employee_id,
      tenantId,
      type: termination.type,
      proposedLastWorkingDate: termination.proposed_lwd,
    });
    res.json(preview);
  } catch (error) {
    console.error('Error previewing settlement:', error);
    res.status(500).json({ error: error.message || 'Failed to preview settlement' });
  }
});

router.post('/:id/approve', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const termination = await fetchTermination(req.params.id, tenantId);
    if (!termination) {
      return res.status(404).json({ error: 'Termination not found' });
    }
    const roles = await getUserRoles(req.user.id);
    const allowed = allowedRolesForStatus(termination.status);
    if (!roles.some((role) => allowed.includes(role))) {
      return res.status(403).json({ error: 'Not authorized for this stage' });
    }
    const action = (req.body?.action || 'approve').toLowerCase();
    const note = req.body?.note || null;

    let nextStatus = termination.status;
    if (action === 'reject') {
      nextStatus = 'rejected';
    } else {
      nextStatus = getNextStatus(termination.type, termination.status);
    }

    await query(
      `
      UPDATE terminations
      SET status = $1::termination_status_enum,
          updated_at = now(),
          closed_at = CASE WHEN $1::termination_status_enum IN ('completed','rejected') THEN now() ELSE closed_at END
      WHERE id = $2
      `,
      [nextStatus, req.params.id]
    );

    await query(
      `
      INSERT INTO termination_audit (termination_id, action, actor_id, actor_role, reason, snapshot_json)
      VALUES ($1,$2,$3,$4,$5,$6)
      `,
      [
        req.params.id,
        action === 'reject' ? 'rejected' : 'stage_approved',
        req.user.id,
        roles[0] || null,
        note,
        JSON.stringify({ from: termination.status, to: nextStatus }),
      ]
    );

    await audit({
      actorId: req.user.id,
      action: 'termination_stage_transition',
      entityType: 'termination',
      entityId: req.params.id,
      details: { from: termination.status, to: nextStatus, note },
    });

    const payload = await enrichTermination(req.params.id, tenantId);
    res.json(payload);
  } catch (error) {
    console.error('Error approving termination:', error);
    res.status(500).json({ error: error.message || 'Failed to update termination stage' });
  }
});

export default router;

