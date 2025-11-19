import { query } from '../db/pool.js';
import { sendWorkflowEmail, buildWorkflowNotificationBody } from './email.js';

function getEnv(name, def) {
  return process.env[name] || def;
}

const N8N_BASE_URL = getEnv('N8N_BASE_URL', 'http://localhost:5678');
const N8N_API_KEY = getEnv('N8N_API_KEY', '');
const N8N_WEBHOOK_PATH = getEnv('N8N_WEBHOOK_PATH', '/webhook/workflow-exec');

async function log(instanceId, message, level = 'info', data = null) {
  await query(
    'INSERT INTO workflow_logs (instance_id, level, message, data) VALUES ($1,$2,$3,$4)',
    [instanceId, level, message, data]
  );
}

function evaluateRule(rule, context = {}) {
  if (!rule || typeof rule !== 'string') return false;
  const normalized = rule.trim();
  if (!normalized) return false;
  const operators = ['>=', '<=', '==', '!=', '>', '<'];
  const op = operators.find(o => normalized.includes(o));
  if (!op) return false;
  const [rawLeft, rawRight] = normalized.split(op);
  if (rawRight === undefined) return false;
  const leftKey = rawLeft.trim();
  const rightKey = rawRight.trim();

  const resolveValue = (key) => {
    if (key === '') return undefined;
    const normalizedKey = key.replace(/\s+/g, '_');
    if (!Number.isNaN(Number(key))) return Number(key);
    if (!Number.isNaN(Number(normalizedKey))) return Number(normalizedKey);
    if (context.hasOwnProperty(key)) return context[key];
    if (context.hasOwnProperty(normalizedKey)) return context[normalizedKey];
    return undefined;
  };

  const leftVal = resolveValue(leftKey);
  const rightVal = resolveValue(rightKey);

  if (leftVal === undefined || rightVal === undefined) return false;

  switch (op) {
    case '>=': return leftVal >= rightVal;
    case '<=': return leftVal <= rightVal;
    case '>': return leftVal > rightVal;
    case '<': return leftVal < rightVal;
    case '==': return leftVal == rightVal; // intentional loose equality for numbers/strings
    case '!=': return leftVal != rightVal;
    default: return false;
  }
}

export async function startInstance({ tenantId, userId, workflow, name, triggerPayload, resourceType, resourceId }) {
  console.log(`[Workflow StartInstance] Starting instance for workflow ${workflow?.id}, resource: ${resourceType}/${resourceId}`);
  
  const result = await query(
    `INSERT INTO workflow_instances (workflow_id, tenant_id, name, status, current_node_ids, trigger_payload, created_by, resource_type, resource_id)
     VALUES ($1,$2,$3,'running',$4,$5,$6,$7,$8) RETURNING id`,
    [workflow?.id || null, tenantId, name || workflow?.name || 'Workflow', [], triggerPayload || {}, userId, resourceType || null, resourceId || null]
  );
  const instanceId = result.rows[0].id;
  console.log(`[Workflow StartInstance] Created instance ${instanceId}`);
  
  await log(instanceId, 'Instance started', 'info', { triggerPayload, resourceType, resourceId });
  
  // Ensure workflow structure is correct - it should have nodes and connections
  const workflowToAdvance = {
    ...workflow,
    nodes: workflow?.workflow_json?.nodes || workflow?.nodes || [],
    connections: workflow?.workflow_json?.connections || workflow?.connections || []
  };
  
  console.log(`[Workflow StartInstance] Workflow structure - nodes: ${workflowToAdvance.nodes.length}, connections: ${workflowToAdvance.connections.length}`);
  
  await advance(instanceId, workflowToAdvance, null, resourceType, resourceId); // from trigger
  return instanceId;
}

function buildNextMap(connections) {
  const map = {};
  (connections || []).forEach(c => {
    if (!map[c.from]) map[c.from] = [];
    map[c.from].push(c.to);
  });
  return map;
}

export async function advance(instanceId, workflow, fromNodeId, resourceType = null, resourceId = null, forcedFrontier = null) {
  // Handle both workflow_json structure and direct nodes/connections
  const nodes = workflow?.workflow_json?.nodes || workflow?.nodes || [];
  const connections = workflow?.workflow_json?.connections || workflow?.connections || [];
  
  console.log(`[Workflow Advance] Instance ${instanceId}, fromNode: ${fromNodeId}, nodes: ${nodes.length}, connections: ${connections.length}`);
  
  const nextBy = buildNextMap(connections);
  const nodesById = Object.fromEntries(nodes.map(n => [n.id, n]));

  let startNodes = nodes.filter(n => n.type?.startsWith('trigger_'));
  let frontier = [];
  if (forcedFrontier && forcedFrontier.length) {
    frontier = forcedFrontier;
    console.log(`[Workflow Advance] Forced frontier: ${frontier.join(', ')}`);
  } else if (!fromNodeId) {
    frontier = startNodes.map(n => n.id);
    console.log(`[Workflow Advance] Starting from trigger nodes: ${frontier.join(', ')}`);
  } else {
    frontier = nextBy[fromNodeId] || [];
    console.log(`[Workflow Advance] Continuing from node ${fromNodeId}, next nodes: ${frontier.join(', ')}`);
  }

  // Get tenant_id and user info from instance
  const instanceRes = await query('SELECT tenant_id, created_by, trigger_payload FROM workflow_instances WHERE id = $1', [instanceId]);
  const tenantId = instanceRes.rows[0]?.tenant_id || null;
  const userId = instanceRes.rows[0]?.created_by || null;
  const triggerPayload = instanceRes.rows[0]?.trigger_payload || {};

  for (const nodeId of frontier) {
    const node = nodesById[nodeId];
    if (!node) {
      console.log(`[Workflow Advance] ⚠️ Node ${nodeId} not found in nodesById`);
      continue;
    }
    
    console.log(`[Workflow Advance] Processing node ${nodeId} (type: ${node.type}, label: ${node.label})`);
    
    // TRIGGER NODE: Find overdue onboarding candidates when trigger_onboarding executes
    if (node.type === 'trigger_onboarding') {
      try {
        console.log(`[Workflow Advance] 🚀 Trigger node (onboarding): Checking for overdue candidates...`);
        
        // Get allotted days from node props or triggerPayload (default: 7 days)
        const allottedDays = node.props?.allottedDays ?? node.props?.allotted_days ?? triggerPayload?.allottedDays ?? triggerPayload?.allotted_days ?? 7;
        const allottedDaysNum = Number(allottedDays) || 7;
        
        // Calculate the cutoff date (allotted days ago)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - allottedDaysNum);
        
        // Find employees with incomplete onboarding that started before the cutoff date
        const overdueCandidates = await query(
          `SELECT 
            e.id as employee_id,
            e.employee_id as employee_code,
            e.onboarding_status,
            e.created_at,
            e.join_date,
            COALESCE(e.join_date, e.created_at::date) as start_date,
            p.first_name,
            p.last_name,
            p.email as employee_email
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          WHERE e.tenant_id = $1
            AND e.onboarding_status != 'completed'
            AND COALESCE(e.join_date, e.created_at::date) < $2
          ORDER BY COALESCE(e.join_date, e.created_at::date) ASC`,
          [tenantId, cutoffDate.toISOString().split('T')[0]]
        );
        
        const candidates = overdueCandidates.rows || [];
        console.log(`[Workflow Advance] Found ${candidates.length} overdue onboarding candidate(s)`);
        
        // Store the overdue candidates in trigger_payload for use by subsequent nodes
        await query(
          `UPDATE workflow_instances 
           SET trigger_payload = trigger_payload || $1::jsonb 
           WHERE id = $2`,
          [
            JSON.stringify({
              overdue_candidates: candidates,
              candidate_count: candidates.length,
              allotted_days: allottedDaysNum,
              cutoff_date: cutoffDate.toISOString().split('T')[0]
            }),
            instanceId
          ]
        );
        
        await log(instanceId, 'Onboarding trigger executed', 'info', {
          nodeId: node.id,
          allottedDays: allottedDaysNum,
          candidateCount: candidates.length,
          candidates: candidates.map(c => ({ id: c.employee_id, name: `${c.first_name} ${c.last_name}` }))
        });
        
        // Continue to next node with the candidate data
        await advance(instanceId, workflow, node.id, resourceType, resourceId);
        
      } catch (error) {
        console.error(`[Workflow Advance] ❌ Error in trigger_onboarding:`, error);
        await log(instanceId, 'Onboarding trigger error', 'error', { nodeId: node.id, error: error.message });
        throw error;
      }
    }
    // TRIGGER NODE: Create leave request when trigger_leave executes
    else if (node.type === 'trigger_leave') {
      try {
        console.log(`[Workflow Advance] 🚀 Trigger node: Creating leave request...`);
        
        // Get employee ID for the user who started the workflow
        const empResult = await query('SELECT id FROM employees WHERE user_id = $1', [userId]);
        if (empResult.rows.length === 0) {
          throw new Error('Employee not found for workflow creator');
        }
        const employeeId = empResult.rows[0].id;
        
        // Extract leave request data from triggerPayload or use defaults
        // triggerPayload should contain: leave_type_id, start_date, end_date, reason
        const totalDaysOverrideRaw = triggerPayload.total_days ?? triggerPayload.totalDays ?? node.props?.totalDays ?? node.props?.total_days;
        const totalDaysOverride = totalDaysOverrideRaw && !Number.isNaN(Number(totalDaysOverrideRaw))
          ? Math.max(1, Number(totalDaysOverrideRaw))
          : null;
        const leaveTypeId = triggerPayload.leave_type_id || node.props?.leave_type_id;
        let startDate = triggerPayload.start_date || node.props?.start_date || new Date().toISOString().split('T')[0];
        let endDate = triggerPayload.end_date || node.props?.end_date || null;
        const reason = triggerPayload.reason || node.props?.reason || 'Leave request from workflow';
        
        // Compute end date if missing but we have a duration override
        if (!endDate && totalDaysOverride) {
          const start = new Date(startDate);
          const computedEnd = new Date(start);
          computedEnd.setDate(computedEnd.getDate() + (totalDaysOverride - 1));
          endDate = computedEnd.toISOString().split('T')[0];
        }
        
        if (!endDate) {
          endDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        }
        
        if (!leaveTypeId) {
          // Try to find first active leave policy as fallback
          const policyResult = await query(
            'SELECT id FROM leave_policies WHERE tenant_id = $1 AND is_active = true LIMIT 1',
            [tenantId]
          );
          if (policyResult.rows.length === 0) {
            throw new Error('No leave policy found. Please specify leave_type_id in triggerPayload.');
          }
          var finalLeaveTypeId = policyResult.rows[0].id;
        } else {
          var finalLeaveTypeId = leaveTypeId;
        }
        
        // Calculate total days
        const start = new Date(startDate);
        const end = new Date(endDate);
        let totalDays = totalDaysOverride || Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (!Number.isFinite(totalDays) || totalDays <= 0) {
          totalDays = 1;
        }
        
        // Create leave request - IGNORE ALL VALIDATIONS as per requirements
        const leaveResult = await query(
          `INSERT INTO leave_requests (
            employee_id, leave_type_id, start_date, end_date, 
            total_days, reason, status, tenant_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
          RETURNING id`,
          [employeeId, finalLeaveTypeId, startDate, endDate, totalDays, reason, tenantId]
        );
        
        const createdLeaveId = leaveResult.rows[0].id;
        console.log(`[Workflow Advance] ✅ Created leave request ${createdLeaveId} from trigger node`);
        
        // Update instance with the created resource
        await query(
          `UPDATE workflow_instances 
           SET resource_type = $1, 
               resource_id = $2,
               trigger_payload = COALESCE(trigger_payload, '{}'::jsonb) || $4::jsonb
           WHERE id = $3`,
          ['leave', createdLeaveId, instanceId, JSON.stringify({ start_date: startDate, end_date: endDate, total_days: totalDays })]
        );
        
        resourceType = 'leave';
        resourceId = createdLeaveId;
        
        await log(instanceId, 'Leave request created from trigger', 'info', { 
          nodeId: node.id, 
          leaveRequestId: createdLeaveId,
          employeeId,
          startDate,
          endDate,
          totalDays
        });
        
        // Continue to next node
        await advance(instanceId, workflow, node.id, resourceType, resourceId);
        
      } catch (triggerError) {
        console.error(`[Workflow Advance] ❌ Error in trigger_leave node:`, triggerError);
        await log(instanceId, 'Trigger node failed', 'error', { nodeId: node.id, error: triggerError.message });
        await query('UPDATE workflow_instances SET status = $2, updated_at = now() WHERE id = $1', [instanceId, 'error']);
        throw triggerError;
      }
    }
    // APPROVAL NODE: Create pending action and PAUSE workflow (don't auto-approve)
    else if (node.type?.startsWith('approval_')) {
      const role = node?.props?.approverRole || node.type.replace('approval_', '');
      console.log(`[Workflow Advance] ⏸️ Approval node: Creating pending action for role ${role} - workflow will pause here`);
      
      const actionResult = await query(
        `INSERT INTO workflow_actions (instance_id, tenant_id, node_id, node_type, label, assignee_role, resource_type, resource_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [instanceId, tenantId, node.id, node.type, node.label || node.id, role, resourceType, resourceId]
      );
      const actionId = actionResult.rows[0]?.id;
      console.log(`[Workflow Advance] ✅ Created approval action ${actionId} for role ${role}, resource: ${resourceType}/${resourceId}`);
      console.log(`[Workflow Advance] ⏸️ Workflow PAUSED - waiting for ${role} approval. Leave request visible in HR pending page.`);
      
      await log(instanceId, 'Created approval action - workflow paused', 'info', { 
        nodeId: node.id, 
        role, 
        resourceType, 
        resourceId, 
        actionId 
      });
      
      // DO NOT continue automatically - workflow pauses here until approval decision
      // The workflow will continue when decide() is called and advances from this node
      
    } else if (node.type === 'notify') {
      try {
        // Check if this is an email notification
        const notificationType = node.props?.type || node.props?.notificationType || 'general';
        const message = node.props?.message || node.props?.text || 'Notification from workflow';
        const recipientEmail = node.props?.email || node.props?.recipientEmail;
        const recipientRole = node.props?.recipientRole || node.props?.role || 'hr';
        
        // If email is specified or recipientRole is set, send email
        if (notificationType === 'email' || recipientEmail || recipientRole) {
          await sendWorkflowEmail({
            instanceId,
            tenantId,
            message,
            recipientEmail,
            recipientRole,
            nodeProps: node.props,
            triggerPayload
          });
        } else {
          // Fallback to n8n webhook if configured
          await triggerN8n({ instanceId, node, event: 'notify' });
        }
        
        await log(instanceId, 'Notification sent', 'info', { 
          nodeId: node.id, 
          type: notificationType,
          recipientEmail: recipientEmail || `role:${recipientRole}`
        });
        await advance(instanceId, workflow, node.id, resourceType, resourceId);
      } catch (error) {
        console.error(`[Workflow Advance] ❌ Error in notify node:`, error);
        await log(instanceId, 'Notification error', 'error', { nodeId: node.id, error: error.message });
        // Continue workflow even if notification fails
        await advance(instanceId, workflow, node.id, resourceType, resourceId);
      }
    } else if (node.type === 'condition') {
      const rule = node.props?.rule || node.props?.condition;
      const outs = nextBy[node.id] || [];
      const truthyTarget = outs[0] || null;
      const falsyTarget = outs[1] || null;
      const conditionContext = {
        days: triggerPayload.total_days,
        total_days: triggerPayload.total_days,
        start_date: triggerPayload.start_date,
        end_date: triggerPayload.end_date
      };
      const result = evaluateRule(rule, conditionContext);
      const nextPick = result ? truthyTarget : falsyTarget;
      await log(instanceId, 'Condition evaluated', 'info', { nodeId: node.id, rule, result, next: nextPick });
      if (nextPick) {
        await advance(instanceId, workflow, node.id, resourceType, resourceId, [nextPick]);
      }
    } else if (node.type === 'policy_check_leave') {
      const outs = nextBy[node.id] || [];
      const passTarget = outs[0] || null;
      const failTarget = outs[1] || null;
      const context = {
        days: triggerPayload.total_days,
        total_days: triggerPayload.total_days,
        start_date: triggerPayload.start_date,
        end_date: triggerPayload.end_date,
        reason: triggerPayload.reason
      };
      const result = evaluateRule(node.props?.rule, context);
      await log(instanceId, 'Policy check (leave)', 'info', { nodeId: node.id, rule: node.props?.rule, context, result });
      const target = result ? passTarget : failTarget;
      if (target) {
        await advance(instanceId, workflow, node.id, resourceType, resourceId, [target]);
      }
    } else if (node.type === 'complete') {
      await query('UPDATE workflow_instances SET status = $2, updated_at = now() WHERE id = $1', [instanceId, 'completed']);
      await log(instanceId, 'Workflow completed', 'info', { nodeId: node.id });
      
      // Complete node ONLY marks workflow as finished - NO auto-approval of leave request
      // Leave request status remains as 'pending' until HR explicitly approves via the approval action
      console.log(`[Workflow Advance] ✅ Workflow marked as completed. Leave request status unchanged (pending until HR approval).`);
      
    } else {
      // passthrough for other node types
      await advance(instanceId, workflow, node.id, resourceType, resourceId);
    }
  }
}

export async function decide({ actionId, decision, reason, userId, workflow }) {
  const actionRes = await query('SELECT * FROM workflow_actions WHERE id = $1', [actionId]);
  if (actionRes.rows.length === 0) throw new Error('Action not found');
  const action = actionRes.rows[0];
  if (action.status !== 'pending') throw new Error('Action already decided');
  const instanceId = action.instance_id;
  
  await query(
    `UPDATE workflow_actions SET status=$2, decision_reason=$3, decided_by=$4, decided_at=now() WHERE id=$1`,
    [actionId, decision === 'approve' ? 'approved' : 'rejected', reason || null, userId]
  );
  await log(instanceId, 'Action decided', 'info', { actionId, decision, reason });
  
  // Update leave request status if linked
  if (action.resource_type === 'leave' && action.resource_id) {
    if (decision === 'reject') {
      await query(
        'UPDATE leave_requests SET status = $1, reviewed_at = now() WHERE id = $2',
        ['rejected', action.resource_id]
      );
      console.log(`[Workflow Decide] ❌ Leave request ${action.resource_id} rejected`);
    } else if (decision === 'approve') {
      // Update leave request to approved when HR approves
      await query(
        'UPDATE leave_requests SET status = $1, reviewed_at = now() WHERE id = $2',
        ['approved', action.resource_id]
      );
      console.log(`[Workflow Decide] ✅ Leave request ${action.resource_id} approved`);
    }
  }
  
  if (decision === 'reject') {
    await query('UPDATE workflow_instances SET status=$2, updated_at=now() WHERE id=$1', [instanceId, 'rejected']);
    await log(instanceId, 'Workflow rejected', 'info', { actionId, reason });
    await triggerN8n({ instanceId, node: { type: 'notify', props: { message: 'Request rejected' } }, event: 'notify' });
    return;
  }
  
  // approved -> continue workflow from this approval node
  console.log(`[Workflow Decide] ✅ Approval granted - continuing workflow from node ${action.node_id}`);
  const nodes = workflow?.workflow_json?.nodes || workflow?.nodes || [];
  const nodesById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const node = nodesById[action.node_id];
  
  // Get resource info from instance
  const instanceRes = await query('SELECT resource_type, resource_id FROM workflow_instances WHERE id = $1', [instanceId]);
  const resourceType = instanceRes.rows[0]?.resource_type || action.resource_type;
  const resourceId = instanceRes.rows[0]?.resource_id || action.resource_id;
  
  // Continue workflow execution from the approval node
  await advance(instanceId, workflow, node?.id, resourceType, resourceId);
}

export async function listPendingActions({ userId }) {
  // Resolve user role and tenant
  const prof = await query('SELECT tenant_id FROM profiles WHERE id=$1', [userId]);
  const tenantId = prof.rows[0]?.tenant_id;
  const roleRes = await query('SELECT role FROM user_roles WHERE user_id=$1', [userId]);
  const role = roleRes.rows[0]?.role;
  const result = await query(
    `SELECT a.* FROM workflow_actions a 
     WHERE a.status='pending' AND a.tenant_id IS NULL OR a.tenant_id=$1
     AND (a.assignee_role = $2 OR a.assignee_user_id = $3)
     ORDER BY a.created_at ASC`,
    [tenantId, role, userId]
  );
  return result.rows;
}

async function triggerN8n({ instanceId, node, event }) {
  try {
    const url = `${N8N_BASE_URL}${N8N_WEBHOOK_PATH}`;
    const headers = { 'Content-Type': 'application/json' };
    if (N8N_API_KEY) headers['X-N8N-API-KEY'] = N8N_API_KEY;
    await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ instanceId, event, node })
    });
  } catch (e) {
    await log(instanceId, 'n8n call failed', 'error', { error: e?.message });
  }
}

export default { startInstance, advance, decide, listPendingActions };


