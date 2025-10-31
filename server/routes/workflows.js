import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

async function ensureWorkflowsTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS workflows (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      workflow_json JSONB NOT NULL,
      status TEXT DEFAULT 'draft',
      created_by UUID REFERENCES profiles(id),
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

// Helper: get tenant for current user
async function getTenantId(userId) {
  const res = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return res.rows[0]?.tenant_id || null;
}

// Templates for common org workflows
router.get('/templates', authenticateToken, async (req, res) => {
  const templates = [
    {
      key: 'leave_over_10_days',
      name: 'Leave > 10 Days (Manager → HR)',
      workflow: {
        nodes: [
          { id: 't1', type: 'trigger_leave', x: 50, y: 80, label: 'On Leave Request' },
          { id: 'p1', type: 'policy_check_leave', x: 260, y: 80, label: 'Check Leave Policy', props: { rule: 'days > 10' } },
          { id: 'a1', type: 'approval_manager', x: 480, y: 40, label: 'Manager Approval', props: { approverRole: 'manager' } },
          { id: 'a2', type: 'approval_hr', x: 700, y: 40, label: 'HR Approval', props: { approverRole: 'hr' } },
          { id: 'c1', type: 'complete', x: 920, y: 40, label: 'Complete' },
          { id: 'cElse', type: 'complete', x: 480, y: 140, label: 'Complete (Standard)' }
        ],
        connections: [
          { from: 't1', to: 'p1' },
          { from: 'p1', to: 'a1' },
          { from: 'a1', to: 'a2' },
          { from: 'a2', to: 'c1' },
          // implicit else branch for days <= 10 would be manager only; simplified here
        ]
      }
    },
    {
      key: 'expense_over_10000',
      name: 'Expense > 10,000 (Manager → HR)',
      workflow: {
        nodes: [
          { id: 't1', type: 'trigger_expense', x: 50, y: 80, label: 'On Expense Claim' },
          { id: 'p1', type: 'policy_check_expense', x: 260, y: 80, label: 'Check Expense Policy', props: { rule: 'amount > 10000' } },
          { id: 'a1', type: 'approval_manager', x: 480, y: 40, label: 'Manager Approval', props: { approverRole: 'manager' } },
          { id: 'a2', type: 'approval_hr', x: 700, y: 40, label: 'HR Approval', props: { approverRole: 'hr' } },
          { id: 'c1', type: 'complete', x: 920, y: 40, label: 'Complete' }
        ],
        connections: [
          { from: 't1', to: 'p1' },
          { from: 'p1', to: 'a1' },
          { from: 'a1', to: 'a2' },
          { from: 'a2', to: 'c1' }
        ]
      }
    },
    {
      key: 'onboarding_standard',
      name: 'Onboarding (Docs → Manager → HR → IT Notify)',
      workflow: {
        nodes: [
          { id: 't1', type: 'trigger_onboarding', x: 50, y: 80, label: 'On Onboarding' },
          { id: 'task1', type: 'assign_task', x: 260, y: 80, label: 'Collect Documents' },
          { id: 'a1', type: 'approval_manager', x: 480, y: 80, label: 'Manager Approval', props: { approverRole: 'manager' } },
          { id: 'a2', type: 'approval_hr', x: 700, y: 80, label: 'HR Approval', props: { approverRole: 'hr' } },
          { id: 'n1', type: 'notify', x: 920, y: 80, label: 'Notify IT', props: { message: 'Provision accounts' } },
          { id: 'c1', type: 'complete', x: 1140, y: 80, label: 'Complete' }
        ],
        connections: [
          { from: 't1', to: 'task1' },
          { from: 'task1', to: 'a1' },
          { from: 'a1', to: 'a2' },
          { from: 'a2', to: 'n1' },
          { from: 'n1', to: 'c1' }
        ]
      }
    }
  ];
  res.json({ templates });
});

// Save or update workflow
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { name, description, workflow, status = 'draft' } = req.body || {};
    if (!name || !workflow) return res.status(400).json({ error: 'name and workflow required' });

    await ensureWorkflowsTable();

    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) return res.status(403).json({ error: 'No organization found' });

    const result = await query(
      `INSERT INTO workflows (tenant_id, name, description, workflow_json, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id`,
      [tenantId, name, description || null, workflow, status, req.user.id]
    );
    res.json({ id: result.rows[0].id });
  } catch (e) {
    console.error('Save workflow error', e);
    res.status(500).json({ error: e.message });
  }
});

// Minimal execution/dry-run to analyze sequence (for previews or AI explanation)
router.post('/execute', authenticateToken, async (req, res) => {
  try {
    const { workflow, context = {} } = req.body || {};
    if (!workflow || !Array.isArray(workflow.nodes) || !Array.isArray(workflow.connections)) {
      return res.status(400).json({ error: 'Invalid workflow format' });
    }

    // Build adjacency
    const nextById = workflow.connections.reduce((acc, c) => {
      if (!acc[c.from]) acc[c.from] = [];
      acc[c.from].push(c.to);
      return acc;
    }, {});

    const nodesById = Object.fromEntries(workflow.nodes.map(n => [n.id, n]));
    // Find triggers (entry points)
    const triggers = workflow.nodes.filter(n => n.type.startsWith('trigger_'));
    if (triggers.length === 0) return res.status(400).json({ error: 'No trigger node found' });

    const steps = [];
    function dfs(nodeId) {
      const node = nodesById[nodeId];
      if (!node) return;
      steps.push({ id: node.id, type: node.type, label: node.label, props: node.props || {} });
      const outs = nextById[nodeId] || [];
      for (const n of outs) dfs(n);
    }
    dfs(triggers[0].id);

    // Extract approval sequence (for preview of routing)
    const approvals = steps.filter(s => s.type.startsWith('approval_')).map(s => ({ approverRole: s.props?.approverRole || s.type.replace('approval_','') , label: s.label }));

    res.json({ steps, approvals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;


