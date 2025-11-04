import { getChatCompletion } from '../openai.js';
import { getFunctionDefinitions } from '../openai.js';

/**
 * Generate workflow from natural language description using OpenAI
 * Creates workflow JSON structure based on user's natural language input
 */
export async function generateWorkflowFromNaturalLanguage(description, tenantId, options = {}) {
  const systemPrompt = `You are a workflow generator for an HR system. 
You create workflows based on natural language descriptions.

Available workflow node types:
- trigger_leave: Triggers on leave request
- trigger_expense: Triggers on expense claim
- trigger_onboarding: Triggers on employee onboarding
- trigger_timesheet: Triggers on timesheet submission
- policy_check_leave: Checks leave policy (props: { rule: string })
- policy_check_expense: Checks expense policy (props: { rule: string })
- approval_manager: Manager approval node (props: { approverRole: 'manager' })
- approval_hr: HR approval node (props: { approverRole: 'hr' })
- approval_director: Director approval node (props: { approverRole: 'director' })
- assign_task: Assign a task (props: { taskName: string, assigneeRole?: string })
- notify: Send notification (props: { message: string, recipient?: string })
- complete: Workflow completion node
- condition: Conditional branch (props: { condition: string })

Workflow structure:
{
  nodes: [
    { id: string, type: string, x: number, y: number, label: string, props?: object }
  ],
  connections: [
    { from: nodeId, to: nodeId }
  ]
}

Generate a valid workflow JSON structure based on the user's description.
Return ONLY the JSON, no additional text.`;

  const userPrompt = `Create a workflow for: ${description}

Requirements:
- The workflow should be appropriate for an HR system
- Use standard approval chains (manager → hr → director if needed)
- Include appropriate policy checks
- Make it organization-specific and secure
- Return only valid JSON matching the workflow structure`;

  try {
    const response = await getChatCompletion(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      {
        model: options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.3, // Lower temperature for more structured output
      }
    );

    // Parse the JSON from response
    let workflowJson;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || 
                       response.match(/```\s*([\s\S]*?)\s*```/) ||
                       [null, response];
      workflowJson = JSON.parse(jsonMatch[1] || response);
    } catch (parseError) {
      // If parsing fails, try to fix common issues
      const cleaned = response.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
      workflowJson = JSON.parse(cleaned);
    }

    // Validate workflow structure
    if (!workflowJson.nodes || !Array.isArray(workflowJson.nodes)) {
      throw new Error('Invalid workflow: missing nodes array');
    }
    if (!workflowJson.connections || !Array.isArray(workflowJson.connections)) {
      throw new Error('Invalid workflow: missing connections array');
    }

    // Generate a suggested name from description
    const namePrompt = `Generate a concise, professional workflow name (max 50 chars) for: ${description}`;
    const nameResponse = await getChatCompletion(
      [{ role: 'user', content: namePrompt }],
      { model: 'gpt-4o-mini', temperature: 0.7, max_tokens: 50 }
    );
    const suggestedName = nameResponse.trim().replace(/^["']|["']$/g, '').substring(0, 50);

    return {
      name: suggestedName || 'Generated Workflow',
      description: description,
      workflow_json: workflowJson,
      status: 'draft',
    };
  } catch (error) {
    console.error('Error generating workflow:', error);
    throw new Error(`Failed to generate workflow: ${error.message}`);
  }
}

/**
 * Validate workflow structure
 */
export function validateWorkflow(workflowJson) {
  if (!workflowJson || typeof workflowJson !== 'object') {
    return { valid: false, error: 'Workflow must be an object' };
  }

  if (!workflowJson.nodes || !Array.isArray(workflowJson.nodes)) {
    return { valid: false, error: 'Workflow must have a nodes array' };
  }

  if (!workflowJson.connections || !Array.isArray(workflowJson.connections)) {
    return { valid: false, error: 'Workflow must have a connections array' };
  }

  // Check nodes have required fields
  for (const node of workflowJson.nodes) {
    if (!node.id || !node.type || typeof node.x !== 'number' || typeof node.y !== 'number') {
      return { valid: false, error: 'All nodes must have id, type, x, and y fields' };
    }
  }

  // Check connections reference valid nodes
  const nodeIds = new Set(workflowJson.nodes.map(n => n.id));
  for (const conn of workflowJson.connections) {
    if (!nodeIds.has(conn.from) || !nodeIds.has(conn.to)) {
      return { valid: false, error: `Connection references invalid node: ${conn.from} -> ${conn.to}` };
    }
  }

  return { valid: true };
}

export default {
  generateWorkflowFromNaturalLanguage,
  validateWorkflow,
};




