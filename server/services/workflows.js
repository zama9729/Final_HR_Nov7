import { query } from '../db/pool.js';

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

export async function startInstance({ tenantId, userId, workflow, name, triggerPayload }) {
  const result = await query(
    `INSERT INTO workflow_instances (workflow_id, tenant_id, name, status, current_node_ids, trigger_payload, created_by)
     VALUES ($1,$2,$3,'running',$4,$5,$6) RETURNING id`,
    [null, tenantId, name || workflow?.name || 'Workflow', [], triggerPayload || {}, userId]
  );
  const instanceId = result.rows[0].id;
  await log(instanceId, 'Instance started', 'info', { triggerPayload });
  await advance(instanceId, workflow, null); // from trigger
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

export async function advance(instanceId, workflow, fromNodeId) {
  const nodes = workflow?.nodes || [];
  const nextBy = buildNextMap(workflow?.connections || []);
  const nodesById = Object.fromEntries(nodes.map(n => [n.id, n]));

  let startNodes = nodes.filter(n => n.type?.startsWith('trigger_'));
  let frontier = [];
  if (!fromNodeId) {
    frontier = startNodes.map(n => n.id);
  } else {
    frontier = nextBy[fromNodeId] || [];
  }

  for (const nodeId of frontier) {
    const node = nodesById[nodeId];
    if (!node) continue;
    if (node.type?.startsWith('approval_')) {
      const role = node?.props?.approverRole || node.type.replace('approval_', '');
      await query(
        `INSERT INTO workflow_actions (instance_id, tenant_id, node_id, node_type, label, assignee_role)
         SELECT $1,$2,$3,$4,$5,$6`,
        [instanceId, null, node.id, node.type, node.label, role]
      );
      await log(instanceId, 'Created approval action', 'info', { nodeId: node.id, role });
    } else if (node.type === 'notify') {
      await triggerN8n({ instanceId, node, event: 'notify' });
      await log(instanceId, 'Notification sent', 'info', { nodeId: node.id });
      await advance(instanceId, workflow, node.id);
    } else if (node.type === 'condition') {
      // naive condition: if rule includes ">" pick the first next, else the second when exists
      const outs = nextBy[node.id] || [];
      const nextPick = outs[0] || null;
      await log(instanceId, 'Condition evaluated', 'info', { nodeId: node.id, next: nextPick });
      if (nextPick) await advance(instanceId, workflow, node.id);
    } else if (node.type === 'complete') {
      await query('UPDATE workflow_instances SET status = $2, updated_at = now() WHERE id = $1', [instanceId, 'completed']);
      await log(instanceId, 'Workflow completed', 'info', { nodeId: node.id });
    } else {
      // passthrough
      await advance(instanceId, workflow, node.id);
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
  await log(instanceId, 'Action decided', 'info', { actionId, decision });
  if (decision === 'reject') {
    await query('UPDATE workflow_instances SET status=$2, updated_at=now() WHERE id=$1', [instanceId, 'rejected']);
    await triggerN8n({ instanceId, node: { type: 'notify', props: { message: 'Request rejected' } }, event: 'notify' });
    return;
  }
  // approved -> continue on from this node
  const nodesById = Object.fromEntries((workflow?.nodes || []).map(n => [n.id, n]));
  const node = nodesById[action.node_id];
  await advance(instanceId, workflow, node?.id);
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


