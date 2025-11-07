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

async function getCeoApproverEmployeeId(tenantId) {
  const res = await query(
    `SELECT e.id
     FROM user_roles ur
     JOIN employees e ON e.user_id = ur.user_id
     WHERE ur.role = 'ceo' AND ur.tenant_id = $1
     ORDER BY e.created_at ASC
     LIMIT 1`,
    [tenantId]
  );
  return res.rows[0]?.id || null;
}

async function checkManagerHierarchy(employeeId) {
  // Check if employee has a reporting manager
  const managerId = await getManagerEmployeeId(employeeId);
  if (!managerId) {
    return { hasManager: false, managerHasManager: false };
  }
  
  // Check if the manager has a reporting manager
  const managerManagerId = await getManagerEmployeeId(managerId);
  return { hasManager: true, managerHasManager: !!managerManagerId };
}

async function getThresholds(tenantId) {
  try {
    // Check if table exists first
    const tableCheck = await query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'hr_approval_thresholds'
      )
    `);
    
    if (tableCheck.rows[0]?.exists) {
      const res = await query('SELECT leave_days_hr_threshold, expense_amount_hr_threshold FROM hr_approval_thresholds WHERE tenant_id = $1', [tenantId]);
      const row = res.rows[0] || {};
      const leaveDays = row.leave_days_hr_threshold ?? parseInt(process.env.LEAVE_DAYS_HR_THRESHOLD || '10', 10);
      const expenseAmount = row.expense_amount_hr_threshold ?? parseFloat(process.env.EXPENSE_AMOUNT_HR_THRESHOLD || '10000');
      return { leaveDays, expenseAmount };
    }
  } catch (error) {
    // Table doesn't exist or query failed, fall back to environment variables
    console.warn('hr_approval_thresholds table not found, using environment variables:', error.message);
  }
  
  // Fallback to environment variables
  const leaveDays = parseInt(process.env.LEAVE_DAYS_HR_THRESHOLD || '10', 10);
  const expenseAmount = parseFloat(process.env.EXPENSE_AMOUNT_HR_THRESHOLD || '10000');
  return { leaveDays, expenseAmount };
}

export async function create_approval(request_type, amount_or_days, requester_user_id, resource_id) {
  const tenantId = await getTenantIdForRequester(requester_user_id);
  if (!tenantId) throw new Error('No tenant found for requester');

  const requesterEmployeeId = await getEmployeeIdByUserId(requester_user_id);
  if (!requesterEmployeeId) throw new Error('Requester employee record not found');

  const { leaveDays, expenseAmount } = await getThresholds(tenantId);

  // Check manager hierarchy
  const hierarchyCheck = await checkManagerHierarchy(requesterEmployeeId);
  const managerId = await getManagerEmployeeId(requesterEmployeeId);
  const hrId = await getHrApproverEmployeeId(tenantId);
  const ceoId = await getCeoApproverEmployeeId(tenantId);

  // If employee has no manager OR manager has no manager, route to CEO and HR
  let stages = [];
  if (!hierarchyCheck.hasManager || !hierarchyCheck.managerHasManager) {
    // Route to CEO and HR - both can approve
    if (!ceoId && !hrId) {
      throw new Error('No CEO or HR approver configured for tenant');
    }
    
    // Create parallel approval stages for CEO and HR
    // Both need to approve, or either can approve? Based on user requirement: "either one of them can approve"
    // So we'll create two separate stages but allow either to approve
    const approvers = [];
    if (ceoId) {
      approvers.push({ approver_type: 'ceo', approver_id: ceoId });
    }
    if (hrId) {
      approvers.push({ approver_type: 'hr', approver_id: hrId });
    }
    
    if (approvers.length === 0) {
      throw new Error('No CEO or HR approver available');
    }
    
    // For parallel approval where either can approve, we use a single stage with multiple approvers
    // But since our current system supports sequential, we'll make it so the first one to approve completes it
    // We'll create stages but mark them as parallel-friendly
    stages = approvers.map(approver => approver);
  } else {
    // Normal flow: manager exists and has manager
    if (!managerId) {
      throw new Error('No manager assigned for requester');
    }
    if (!hrId) {
      throw new Error('No HR approver configured for tenant');
    }

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
    // Get approver's role to check if they're CEO or HR
    const approverRoleRes = await query(
      `SELECT ur.role FROM user_roles ur
       JOIN employees e ON e.user_id = ur.user_id
       WHERE e.id = $1 AND ur.role IN ('ceo', 'hr')`,
      [approver_employee_id]
    );
    const approverRole = approverRoleRes.rows[0]?.role;

    // Lock pending stage rows for this resource
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

    // Check if any pending stage is assigned to this approver, OR
    // if this is a CEO/HR approval and any pending stage has CEO/HR as approver type (for "either can approve" scenario)
    const canApprove = lockRes.rows.some(stage => {
      if (stage.approver_id === approver_employee_id) {
        return true; // Direct match
      }
      // Check if this is CEO/HR scenario where either can approve
      if (approverRole && (stage.approver_type === 'ceo' || stage.approver_type === 'hr')) {
        // Check if all pending stages are CEO or HR type (meaning either can approve)
        const allCeoOrHr = lockRes.rows.every(s => s.approver_type === 'ceo' || s.approver_type === 'hr');
        if (allCeoOrHr && (stage.approver_type === approverRole)) {
          return true;
        }
        // Or if approver is CEO/HR and any stage has CEO/HR type (allow either to approve)
        if ((approverRole === 'ceo' && stage.approver_type === 'ceo') ||
            (approverRole === 'hr' && stage.approver_type === 'hr') ||
            (approverRole === 'ceo' && stage.approver_type === 'hr') ||
            (approverRole === 'hr' && stage.approver_type === 'ceo')) {
          return true;
        }
      }
      return false;
    });

    if (!canApprove) {
      await query('ROLLBACK');
      return { updated: false, reason: 'Not authorized for this approval stage' };
    }

    // For CEO/HR "either can approve" scenario, approve all pending stages
    // Otherwise, approve the matching stage
    const newStatus = action === 'approve' ? 'approved' : 'rejected';
    let stagesToUpdate = [];
    
    if (approverRole && (approverRole === 'ceo' || approverRole === 'hr')) {
      // Check if all pending stages are CEO/HR type (either can approve scenario)
      const allCeoOrHr = lockRes.rows.every(s => s.approver_type === 'ceo' || s.approver_type === 'hr');
      if (allCeoOrHr && action === 'approve') {
        // Update all CEO/HR stages at once
        stagesToUpdate = lockRes.rows;
      } else {
        // Find the matching stage
        const current = lockRes.rows.find(s => 
          s.approver_id === approver_employee_id || 
          (s.approver_type === approverRole && (approverRole === 'ceo' || approverRole === 'hr'))
        ) || lockRes.rows[0];
        stagesToUpdate = [current];
      }
    } else {
      // Normal case: find exact match
      const current = lockRes.rows.find(s => s.approver_id === approver_employee_id) || lockRes.rows[0];
      stagesToUpdate = [current];
    }

    // Update all matching stages
    for (const stage of stagesToUpdate) {
      await query(
        `UPDATE approvals SET status = $1, acted_by = $2, acted_at = now(), comment = $3, updated_at = now()
         WHERE id = $4`,
        [newStatus, approver_employee_id, comment || null, stage.id]
      );

      await query(
        `INSERT INTO approval_audit (tenant_id, approval_id, action, actor_employee_id, reason, details)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [stage.tenant_id, stage.id, newStatus, approver_employee_id, comment || null, { resource_type, resource_id }]
      );
    }


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


