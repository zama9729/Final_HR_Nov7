import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { startInstance, decide, listPendingActions } from '../services/workflows.js';
import { generateWorkflowFromNaturalLanguage, validateWorkflow } from '../services/ai/workflow-generator.js';

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

// Create workflow from natural language using OpenAI
router.post('/create-from-natural-language', authenticateToken, async (req, res) => {
  try {
    await ensureWorkflowsTable();
    
    const { description, name } = req.body;
    if (!description) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const userId = req.user.id;
    const tenantId = await getTenantId(userId);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Generate workflow using OpenAI
    const workflowData = await generateWorkflowFromNaturalLanguage(description, tenantId);

    // Validate workflow
    const validation = validateWorkflow(workflowData.workflow_json);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Save workflow to database
    const result = await query(
      `INSERT INTO workflows (tenant_id, name, description, workflow_json, status, created_by)
       VALUES ($1, $2, $3, $4::jsonb, 'draft', $5)
       RETURNING id, name, description, workflow_json, status, created_at`,
      [
        tenantId,
        name || workflowData.name,
        workflowData.description,
        JSON.stringify(workflowData.workflow_json),
        userId
      ]
    );

    res.json({
      success: true,
      workflow: result.rows[0],
      message: 'Workflow created successfully from natural language description'
    });
  } catch (error) {
    console.error('Error creating workflow from natural language:', error);
    res.status(500).json({ error: error.message || 'Failed to create workflow' });
  }
});

// Save or update workflow
router.post('/', authenticateToken, async (req, res) => {
  try {
    await ensureWorkflowsTable();
    const { id, name, description, workflow_json, status } = req.body;
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Validate workflow
    const validation = validateWorkflow(workflow_json);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    if (id) {
      // Update existing
      const result = await query(
        `UPDATE workflows 
         SET name = $1, description = $2, workflow_json = $3::jsonb, status = $4, updated_at = now()
         WHERE id = $5 AND tenant_id = $6
         RETURNING *`,
        [name, description, JSON.stringify(workflow_json), status || 'draft', id, tenantId]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Workflow not found' });
      }
      res.json({ workflow: result.rows[0] });
    } else {
      // Create new
      const result = await query(
        `INSERT INTO workflows (tenant_id, name, description, workflow_json, status, created_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         RETURNING *`,
        [tenantId, name, description, JSON.stringify(workflow_json), status || 'draft', userId]
      );
      res.json({ workflow: result.rows[0] });
    }
  } catch (error) {
    console.error('Error saving workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all workflows for tenant (organization-scoped)
router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureWorkflowsTable();
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `SELECT id, name, description, workflow_json, status, created_at, updated_at
       FROM workflows
       WHERE tenant_id = $1
       ORDER BY updated_at DESC`,
      [tenantId]
    );

    res.json({ workflows: result.rows });
  } catch (error) {
    console.error('Error fetching workflows:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single workflow
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    await ensureWorkflowsTable();
    const { id } = req.params;
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `SELECT id, name, description, workflow_json, status, created_at, updated_at
       FROM workflows
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({ workflow: result.rows[0] });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update workflow
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    await ensureWorkflowsTable();
    const { id } = req.params;
    const { name, description, workflow_json, status } = req.body;
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Validate workflow
    const validation = validateWorkflow(workflow_json);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const result = await query(
      `UPDATE workflows 
       SET name = $1, description = $2, workflow_json = $3::jsonb, status = $4, updated_at = now()
       WHERE id = $5 AND tenant_id = $6
       RETURNING *`,
      [name, description, JSON.stringify(workflow_json), status || 'draft', id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({ workflow: result.rows[0] });
  } catch (error) {
    console.error('Error updating workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete workflow
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `DELETE FROM workflows
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start workflow instance
router.post('/:id/start', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, triggerPayload } = req.body;
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const workflowRes = await query(
      'SELECT * FROM workflows WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (workflowRes.rows.length === 0) {
      return res.status(404).json({ error: 'Workflow not found' });
    }

    const workflow = workflowRes.rows[0];
    const instanceId = await startInstance({
      tenantId,
      userId,
      workflow: {
        ...workflow,
        workflow_json: typeof workflow.workflow_json === 'string' 
          ? JSON.parse(workflow.workflow_json) 
          : workflow.workflow_json
      },
      name,
      triggerPayload
    });

    res.json({ success: true, instance_id: instanceId });
  } catch (error) {
    console.error('Error starting workflow:', error);
    res.status(500).json({ error: error.message });
  }
});

// Execute/Preview workflow (for testing without saving)
router.post('/execute', authenticateToken, async (req, res) => {
  try {
    const { workflow } = req.body;
    
    if (!workflow || !workflow.nodes || !workflow.connections) {
      return res.status(400).json({ error: 'Workflow must have nodes and connections' });
    }

    // Validate workflow structure
    const validation = validateWorkflow(workflow);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    // Simulate workflow execution to generate preview
    const steps = [];
    const approvals = [];
    
    // Build connection map
    const nextBy = {};
    (workflow.connections || []).forEach(c => {
      if (!nextBy[c.from]) nextBy[c.from] = [];
      nextBy[c.from].push(c.to);
    });
    
    // Build node map
    const nodesById = Object.fromEntries(workflow.nodes.map(n => [n.id, n]));
    
    // Find trigger nodes
    const triggerNodes = workflow.nodes.filter(n => n.type?.startsWith('trigger_'));
    
    // Simulate execution starting from triggers
    const visited = new Set();
    const queue = [...triggerNodes.map(n => n.id)];
    
    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      
      const node = nodesById[nodeId];
      if (!node) continue;
      
      // Record step
      steps.push({
        nodeId: node.id,
        type: node.type,
        label: node.label || node.id,
        props: node.props || {}
      });
      
      // Check if it's an approval node
      if (node.type?.startsWith('approval_')) {
        const role = node.props?.approverRole || node.type.replace('approval_', '');
        approvals.push({
          nodeId: node.id,
          label: node.label || node.id,
          role: role,
          type: node.type
        });
      }
      
      // Add next nodes to queue
      const nextNodes = nextBy[nodeId] || [];
      queue.push(...nextNodes);
    }
    
    res.json({
      success: true,
      steps,
      approvals,
      totalSteps: steps.length,
      totalApprovals: approvals.length
    });
  } catch (error) {
    console.error('Error executing workflow preview:', error);
    res.status(500).json({ error: error.message });
  }
});

// List pending actions for current user
router.get('/actions/pending', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const actions = await listPendingActions({ userId });
    res.json({ actions });
  } catch (error) {
    console.error('Error fetching pending actions:', error);
    res.status(500).json({ error: error.message });
  }
});

// Decide on an action (approve/reject)
router.post('/actions/:id/decide', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, reason } = req.body;
    const userId = req.user.id;

    if (!['approve', 'reject'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approve or reject' });
    }

    // Get workflow for action
    const actionRes = await query(
      `SELECT a.*, w.workflow_json, w.tenant_id
       FROM workflow_actions a
       JOIN workflow_instances i ON i.id = a.instance_id
       JOIN workflows w ON w.id = i.workflow_id OR i.workflow_id IS NULL
       WHERE a.id = $1`,
      [id]
    );

    if (actionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Action not found' });
    }

    const action = actionRes.rows[0];
    
    // Verify tenant access
    const userTenant = await getTenantId(userId);
    if (action.tenant_id !== userTenant) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const workflow = {
      workflow_json: typeof action.workflow_json === 'string'
        ? JSON.parse(action.workflow_json)
        : action.workflow_json
    };

    await decide({ actionId: id, decision, reason, userId, workflow });
    res.json({ success: true });
  } catch (error) {
    console.error('Error deciding action:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
