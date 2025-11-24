import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { audit } from '../utils/auditLog.js';

const router = express.Router();
const FEATURE_ENABLED = process.env.TERMINATION_REHIRE_V1 !== 'false';

const getTenantId = async (userId) => {
  const result = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return result.rows[0]?.tenant_id || null;
};

const getUserRoles = async (userId) => {
  const result = await query('SELECT role FROM user_roles WHERE user_id = $1', [userId]);
  return result.rows.map((r) => r.role?.toLowerCase()).filter(Boolean);
};

const evaluateEligibility = async (exEmployeeId, tenantId) => {
  if (!exEmployeeId) {
    return { status: 'needs_review', reason: 'UNKNOWN_EMPLOYEE' };
  }
  const doNotRehire = await query(
    `
    SELECT id FROM do_not_rehire_flags
    WHERE tenant_id = $1 AND (employee_id = $2 OR profile_id = $3) AND (expires_at IS NULL OR expires_at >= current_date)
    LIMIT 1
    `,
    [tenantId, exEmployeeId, exEmployeeId]
  );
  if (doNotRehire.rows.length) {
    return { status: 'ineligible', reason: 'DO_NOT_REHIRE_FLAG' };
  }
  const lastTermination = await query(
    `
    SELECT final_lwd, type FROM terminations
    WHERE tenant_id = $1 AND employee_id = $2
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [tenantId, exEmployeeId]
  );
  if (!lastTermination.rows.length) {
    return { status: 'needs_review', reason: 'NO_TERMINATION_RECORD' };
  }
  const record = lastTermination.rows[0];
  const lwd = record.final_lwd ? new Date(record.final_lwd) : null;
  const diffDays = lwd ? Math.floor((Date.now() - lwd.getTime()) / (1000 * 60 * 60 * 24)) : 999;
  const coolOff = Number(process.env.REHIRE_COOLOFF_DAYS || 90);
  if (diffDays < coolOff) {
    return { status: 'needs_review', reason: 'COOL_OFF' };
  }
  if (record.type === 'cause') {
    return { status: 'ineligible', reason: 'TERMINATED_FOR_CAUSE' };
  }
  return { status: 'eligible', reason: null };
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
        rr.*,
        json_build_object(
          'id', t.id,
          'type', t.type,
          'final_lwd', t.final_lwd
        ) AS prior_termination
      FROM rehire_requests rr
      LEFT JOIN terminations t ON t.id = rr.prior_termination_id
      WHERE rr.tenant_id = $1
      ORDER BY rr.created_at DESC
      LIMIT 200
      `,
      [tenantId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching rehire requests:', error);
    res.status(500).json({ error: 'Failed to fetch rehire requests' });
  }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const { rows } = await query(
      `
      SELECT rr.*, json_build_object(
        'id', t.id,
        'type', t.type,
        'final_lwd', t.final_lwd,
        'status', t.status
      ) AS prior_termination
      FROM rehire_requests rr
      LEFT JOIN terminations t ON t.id = rr.prior_termination_id
      WHERE rr.id = $1 AND rr.tenant_id = $2
      `,
      [req.params.id, tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Rehire request not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching rehire request:', error);
    res.status(500).json({ error: 'Failed to fetch rehire request' });
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

    const { ex_employee_id, requested_start_date, prior_termination_id, notes } = req.body;
    if (!ex_employee_id) {
      return res.status(400).json({ error: 'ex_employee_id is required' });
    }

    const eligibility = await evaluateEligibility(ex_employee_id, tenantId);

    const insertResult = await query(
      `
      INSERT INTO rehire_requests (
        tenant_id,
        ex_employee_id,
        requested_by,
        requested_start_date,
        prior_termination_id,
        eligibility_status,
        eligibility_reason,
        status,
        rehire_policy_snapshot
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
      `,
      [
        tenantId,
        ex_employee_id,
        req.user.id,
        requested_start_date || null,
        prior_termination_id || null,
        eligibility.status,
        eligibility.reason,
        eligibility.status === 'eligible' ? 'awaiting_checks' : 'draft',
        JSON.stringify({
          cool_off_days: process.env.REHIRE_COOLOFF_DAYS || 90,
        }),
      ]
    );

    const rehireRequest = insertResult.rows[0];

    await audit({
      actorId: req.user.id,
      action: 'rehire_request_created',
      entityType: 'rehire_request',
      entityId: rehireRequest.id,
      details: { eligibility },
      reason: notes || null,
    });

    res.status(201).json(rehireRequest);
  } catch (error) {
    console.error('Error creating rehire request:', error);
    res.status(500).json({ error: error.message || 'Failed to create rehire request' });
  }
});

router.post('/:id/decision', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }
    const { rows } = await query(
      `
      SELECT * FROM rehire_requests WHERE id = $1 AND tenant_id = $2
      `,
      [req.params.id, tenantId]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Rehire request not found' });
    }
    const requestRecord = rows[0];
    const action = (req.body?.action || 'approve').toLowerCase();
    const note = req.body?.note || null;
    const roles = await getUserRoles(req.user.id);
    if (!roles.some((role) => ['hr', 'admin', 'orgadmin'].includes(role))) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    let nextStatus = requestRecord.status;
    if (action === 'reject') {
      nextStatus = 'rejected';
    } else if (requestRecord.status === 'awaiting_checks') {
      nextStatus = 'offer';
    } else if (requestRecord.status === 'offer') {
      nextStatus = 'onboarding';
    } else if (requestRecord.status === 'onboarding') {
      nextStatus = 'completed';
    }

    await query(
      `
      UPDATE rehire_requests
      SET status = $1,
          updated_at = now(),
          approvals = approvals || jsonb_build_array(jsonb_build_object('actor', $2, 'action', $3, 'note', $4, 'ts', now()))
      WHERE id = $5
      `,
      [nextStatus, req.user.id, action, note, req.params.id]
    );

    await audit({
      actorId: req.user.id,
      action: 'rehire_decision',
      entityType: 'rehire_request',
      entityId: req.params.id,
      reason: note,
      details: { from: requestRecord.status, to: nextStatus, action },
    });

    res.json({ success: true, status: nextStatus });
  } catch (error) {
    console.error('Error deciding rehire request:', error);
    res.status(500).json({ error: error.message || 'Failed to update rehire request' });
  }
});

export default router;

