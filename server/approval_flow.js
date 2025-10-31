import { query } from './db/pool.js';

async function getTenantIdForRequester(requesterUserId) {
  const result = await query('SELECT tenant_id FROM profiles WHERE id = $1', [requesterUserId]);
  return result.rows[0]?.tenant_id || null;
}

async function getEmployeeIdByUserId(userId) {
  const result = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
  return result.rows[0]?.id || null;
}

async function getManagerEmployeeId(employeeId) {
  const res = await query('SELECT reporting_manager_id FROM employees WHERE id = $1', [employeeId]);
  return res.rows[0]?.reporting_manager_id || null;
}

async function getHrApproverEmployeeId(tenantId) {
  const res = await query(
    `SELECT e.id
     FROM user_roles ur
     JOIN employees e ON e.user_id = ur.user_id
     WHERE ur.role = 'hr' AND ur.tenant_id = $1
     ORDER BY e.created_at ASC
     LIMIT 1`,
    [tenantId]
  );
  return res.rows[0]?.id || null;
}

async function getThresholds(tenantId) {
  const res = await query('SELECT leave_days_hr_threshold, expense_amount_hr_threshold FROM hr_approval_thresholds WHERE tenant_id = $1', [tenantId]);
  const row = res.rows[0] || {};
  const leaveDays = row.leave_days_hr_threshold ?? parseInt(process.env.LEAVE_DAYS_HR_THRESHOLD || '10', 10);
  const expenseAmount = row.expense_amount_hr_threshold ?? parseFloat(process.env.EXPENSE_AMOUNT_HR_THRESHOLD || '10000');
  return { leaveDays, expenseAmount };
}

export async function create_approval(request_type, amount_or_days, requester_user_id, resource_id) {
  const tenantId = await getTenantIdForRequester(requester_user_id);
  if (!tenantId) throw new Error('No tenant found for requester');

  const requesterEmployeeId = await getEmployeeIdByUserId(requester_user_id);
  if (!requesterEmployeeId) throw new Error('Requester employee record not found');

  const { leaveDays, expenseAmount } = await getThresholds(tenantId);

  const managerId = await getManagerEmployeeId(requesterEmployeeId);
  const hrId = await getHrApproverEmployeeId(tenantId);

  if (!managerId) throw new Error('No manager assigned for requester');
  if (!hrId) throw new Error('No HR approver configured for tenant');

  let stages = [];
  if (request_type === 'leave') {
    if (Number(amount_or_days) > leaveDays) {
      stages = [{ approver_type: 'manager', approver_id: managerId }, { approver_type: 'hr', approver_id: hrId }];
    } else {
      stages = [{ approver_type: 'manager', approver_id: managerId }];
    }
  } else if (request_type === 'expense') {
    if (Number(amount_or_days) > expenseAmount) {
      stages = [{ approver_type: 'manager', approver_id: managerId }, { approver_type: 'hr', approver_id: hrId }];
    } else {
      stages = [{ approver_type: 'manager', approver_id: managerId }];
    }
  } else {
    throw new Error('Unsupported request_type');
  }

  await query('BEGIN');
  try {
    // Insert first stage pending approval
    for (let i = 0; i < stages.length; i++) {
      const stage = stages[i];
      // Only first stage starts as pending; later stages are inserted pending as well but we advance stage via apply_approval
      await query(
        `INSERT INTO approvals (
          tenant_id, resource_type, resource_id, requester_id,
          stage_index, total_stages, approver_id, approver_type, status, meta
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending', $9)`,
        [tenantId, request_type, resource_id, requesterEmployeeId, i, stages.length, stage.approver_id, stage.approver_type, { amount_or_days }]
      );
    }
    // Audit
    const auditRes = await query('SELECT id FROM approvals WHERE tenant_id = $1 AND resource_type = $2 AND resource_id = $3 ORDER BY stage_index ASC LIMIT 1', [tenantId, request_type, resource_id]);
    if (auditRes.rows.length) {
      await query(
        `INSERT INTO approval_audit (tenant_id, approval_id, action, actor_employee_id, reason, details)
         VALUES ($1,$2,'created',$3,$4,$5)`,
        [tenantId, auditRes.rows[0].id, requesterEmployeeId, 'created', { request_type, amount_or_days }]
      );
    }
    await query('COMMIT');
  } catch (e) {
    await query('ROLLBACK');
    throw e;
  }
}

export async function next_approver(resource_type, resource_id) {
  const res = await query(
    `SELECT stage_index, total_stages, approver_id, approver_type, status
     FROM approvals
     WHERE resource_type = $1 AND resource_id = $2
     ORDER BY stage_index ASC`,
    [resource_type, resource_id]
  );
  if (!res.rows.length) return { pending: false, approvers: [], parallel: false };
  // Find first pending stage
  const pendingStage = res.rows.find(r => r.status === 'pending');
  if (!pendingStage) return { pending: false, approvers: [], parallel: false };
  return {
    pending: true,
    approvers: [{ approver_id: pendingStage.approver_id, approver_type: pendingStage.approver_type }],
    parallel: false
  };
}

export async function apply_approval(resource_type, resource_id, approver_employee_id, action, comment) {
  if (!['approve','reject'].includes(action)) throw new Error('Invalid action');
  await query('BEGIN');
  try {
    // Lock pending stage row for this approver
    const lockRes = await query(
      `SELECT * FROM approvals
       WHERE resource_type = $1 AND resource_id = $2 AND status = 'pending'
       ORDER BY stage_index ASC
       FOR UPDATE`,
      [resource_type, resource_id]
    );
    if (!lockRes.rows.length) {
      await query('ROLLBACK');
      return { updated: false, reason: 'No pending approvals' };
    }
    const current = lockRes.rows[0];
    if (current.approver_id !== approver_employee_id) {
      await query('ROLLBACK');
      return { updated: false, reason: 'Not authorized for this approval stage' };
    }

    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    await query(
      `UPDATE approvals SET status = $1, acted_by = $2, acted_at = now(), comment = $3, updated_at = now()
       WHERE id = $4`,
      [newStatus, approver_employee_id, comment || null, current.id]
    );

    await query(
      `INSERT INTO approval_audit (tenant_id, approval_id, action, actor_employee_id, reason, details)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [current.tenant_id, current.id, newStatus, approver_employee_id, comment || null, { resource_type, resource_id }]
    );

    if (newStatus === 'rejected') {
      await query('COMMIT');
      return { updated: true, final: true, status: 'rejected' };
    }

    // If approved, check if there is another stage pending
    const remaining = await query(
      `SELECT status FROM approvals
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY stage_index ASC`,
      [resource_type, resource_id]
    );
    const pendingLeft = remaining.rows.some(r => r.status === 'pending');
    await query('COMMIT');
    return { updated: true, final: !pendingLeft, status: !pendingLeft ? 'approved' : 'pending' };
  } catch (e) {
    await query('ROLLBACK');
    throw e;
  }
}

export default { create_approval, next_approver, apply_approval };


