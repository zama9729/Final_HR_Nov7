import express from 'express';
import crypto from 'crypto';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { streamChatCompletion, getChatCompletion, chatWithFunctions, generateProjectSuggestions, generateShiftRoster } from '../services/openai.js';

const router = express.Router();

// Simple API key middleware
function requireApiKey(req, res, next) {
  const key = req.header('x-api-key') || req.query.api_key;
  const expected = process.env.AI_TOOL_API_KEY;
  if (!expected) return res.status(500).json({ error: 'AI_TOOL_API_KEY not configured' });
  if (!key || key !== expected) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// Naive in-memory rate limit per key
const buckets = new Map();
function rateLimit(maxPerMinute = 60) {
  return (req, res, next) => {
    const key = req.header('x-api-key') || 'anon';
    const now = Date.now();
    const windowMs = 60 * 1000;
    const bucket = buckets.get(key) || [];
    const recent = bucket.filter((t) => now - t < windowMs);
    if (recent.length >= maxPerMinute) return res.status(429).json({ error: 'Rate limit exceeded' });
    recent.push(now);
    buckets.set(key, recent);
    next();
  };
}

// Discovery manifest for Opal-like tools (includes workflows)
router.get('/discovery', requireApiKey, rateLimit(30), async (req, res) => {
  try {
    // Get available workflows for discovery
    const workflowsRes = await query(`
      SELECT id, name, description, status 
      FROM workflows 
      WHERE status = 'active'
      LIMIT 20
    `);
    
    const workflows = workflowsRes.rows.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      status: w.status,
    }));
    
    res.json({
      schema_version: '1.0',
      name_for_human: 'Petal HR Tools',
      name_for_model: 'petal_hr_tools',
      description_for_human: 'Roster generation, CSV diagnostics, HR policy explanations, and workflow automation.',
      description_for_model: 'Use these tools to generate shift rosters, validate CSV mappings, explain HR policy thresholds, create workflows from natural language, and execute workflows.',
      available_workflows: workflows,
      api: {
        type: 'openapi',
        url: `${req.protocol}://${req.get('host')}/api/ai/openapi.json`,
      },
      auth: { type: 'api_key', name: 'x-api-key' }
    });
  } catch (error) {
    console.error('Error in discovery endpoint:', error);
    // Return basic discovery even if workflows query fails
    res.json({
      schema_version: '1.0',
      name_for_human: 'Petal HR Tools',
      name_for_model: 'petal_hr_tools',
      description_for_human: 'Roster generation, CSV diagnostics, HR policy explanations, and workflow automation.',
      description_for_model: 'Use these tools to generate shift rosters, validate CSV mappings, explain HR policy thresholds, create workflows from natural language, and execute workflows.',
      api: {
        type: 'openapi',
        url: `${req.protocol}://${req.get('host')}/api/ai/openapi.json`,
      },
      auth: { type: 'api_key', name: 'x-api-key' }
    });
  }
});

// OpenAPI spec for Opal discovery
router.get('/openapi.json', requireApiKey, (req, res) => {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  
  res.json({
    openapi: '3.1.0',
    info: {
      title: 'Petal HR Suite AI Tools',
      version: '1.0.0',
      description: 'AI-powered tools for HR management including employee information, leave requests, timesheets, and statistics',
    },
    servers: [{ url: baseUrl }],
    paths: {
      '/api/ai/chat': {
        post: {
          summary: 'Chat with AI assistant (streaming)',
          description: 'Natural language chat interface with function calling support',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    messages: {
                      type: 'array',
                      items: { type: 'object' },
                    },
                    enable_functions: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
      '/api/ai/chat/simple': {
        post: {
          summary: 'Chat with AI assistant (non-streaming)',
          description: 'Natural language chat with function calling support',
        },
      },
      '/api/ai/roster/generate': {
        post: {
          summary: 'Generate shift roster',
          description: 'Generate AI-powered shift roster',
        },
      },
      '/api/ai/roster/generate-enhanced': {
        post: {
          summary: 'Generate enhanced shift roster',
          description: 'Generate AI-powered shift roster with enhanced features',
        },
      },
      '/api/ai/csv/diagnose': {
        post: {
          summary: 'Diagnose CSV mapping',
          description: 'Validate and diagnose CSV file mappings',
        },
      },
      '/api/ai/policy/explain': {
        get: {
          summary: 'Explain HR policy',
          description: 'Get explanation of HR policies',
          parameters: [
            {
              name: 'topic',
              in: 'query',
              schema: { type: 'string' },
            },
          ],
        },
      },
      '/api/workflows/create-from-natural-language': {
        post: {
          summary: 'Create workflow from natural language',
          description: 'Create a new workflow from natural language description using AI',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    description: { type: 'string' },
                    name: { type: 'string' },
                  },
                  required: ['description'],
                },
              },
            },
          },
        },
      },
      '/api/workflows': {
        get: {
          summary: 'List workflows',
          description: 'Get all workflows for the organization',
        },
      },
      '/api/workflows/:id/start': {
        post: {
          summary: 'Start workflow instance',
          description: 'Trigger/execute a workflow instance',
        },
      },
    },
    components: {
      schemas: {
        Employee: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            employee_id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            department: { type: 'string' },
            position: { type: 'string' },
            status: { type: 'string' },
          },
        },
        LeaveRequest: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            employee: { $ref: '#/components/schemas/Employee' },
            leave_type: { type: 'string' },
            start_date: { type: 'string' },
            end_date: { type: 'string' },
            total_days: { type: 'number' },
            status: { type: 'string' },
          },
        },
      },
    },
  });
});

// Roster generation (heuristics placeholder)
router.post('/roster/generate', requireApiKey, rateLimit(20), express.json(), async (req, res) => {
  const { start_date, end_date, roles_needed, max_hours_per_employee, unavailable_employee_ids = [] } = req.body || {};
  if (!start_date || !end_date || !Array.isArray(roles_needed)) return res.status(400).json({ error: 'Missing fields' });

  // Minimal heuristic: return empty draft and id; real generation can call LLM via serverless function
  const tenantId = null; // Will be set when called from authenticated admin via backend; external tool has no tenant
  const draft = { start_date, end_date, roles_needed, assignments: [], notes: 'Draft generated by heuristic v1' };
  res.json({ draft });
});

// CSV diagnose: validate mapping on sample rows
router.post('/csv/diagnose', requireApiKey, rateLimit(30), express.json(), async (req, res) => {
  const { rows = [], mapping = {} } = req.body || {};
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'No rows provided' });
  const required = ['first_name','last_name','email','employee_id','role'];
  const errors = [];
  const warnings = [];
  const mappedFields = Object.values(mapping || {});
  for (const f of required) if (!mappedFields.includes(f)) errors.push(`Missing mapping for required field: ${f}`);
  // Validate emails and duplicates in sample
  const seen = new Set();
  rows.slice(0, 10).forEach((r, idx) => {
    const email = r[mapping.email];
    const empId = r[mapping.employee_id];
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push(`Row ${idx + 1}: invalid email`);
    if (!empId) errors.push(`Row ${idx + 1}: missing employee_id`);
    const key = `${email}|${empId}`;
    if (seen.has(key)) warnings.push(`Row ${idx + 1}: duplicate in sample`);
    seen.add(key);
  });
  res.json({ ok: errors.length === 0, errors, warnings });
});

// Policy explain
router.get('/policy/explain', requireApiKey, rateLimit(60), async (req, res) => {
  const topic = req.query.topic || 'leave-approval';
  if (topic === 'leave-approval') {
    res.json({
      topic,
      text: 'Leaves over the configured threshold require Manager then HR approvals. Default threshold is 10 days. Standard leaves require only Manager approval.'
    });
  } else if (topic === 'expense-approval') {
    res.json({
      topic,
      text: 'Expenses over the configured amount require Manager then HR approvals. Default threshold is 10,000.'
    });
  } else {
    res.json({ topic, text: 'Policy not found.' });
  }
});

// Chat endpoint - streaming chat with OpenAI and function calling
router.post('/chat', authenticateToken, async (req, res) => {
  try {
    const { messages, enable_functions = true, conversation_id } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Get user role for context
    const userId = req.user.id;
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const userRole = roleResult.rows[0]?.role || 'employee';

    // Get tenant ID
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;
    
    // Get user context for AI (auto-inject user info)
    const { getUserContext, buildUserContextMessage } = await import('../services/ai/user-context.js');
    const userContext = await getUserContext(userId, tenantId);
    const userContextMessage = userContext ? buildUserContextMessage(userContext) : '';

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Set headers for streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    try {
      const { executeFunction } = await import('../services/ai/functions.js');
      const { chatWithFunctions } = await import('../services/openai.js');

      // If function calling is enabled, use the function-enabled chat
      if (enable_functions) {
        try {
          // For streaming with functions, we need to handle it differently
          // First attempt: use streaming, but if function calls are needed, switch to non-streaming
          const stream = await streamChatCompletion(messages, {
            role: userRole,
            enableFunctions: true,
            userContext: userContextMessage,
            tenantId: tenantId, // Pass tenantId for mini app discovery
          });

        let hasFunctionCall = false;
        let toolCalls = [];

        // Process stream and detect function calls
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;

          // Check for function calls in delta
          if (delta?.tool_calls) {
            hasFunctionCall = true;
            for (const tcDelta of delta.tool_calls) {
              const index = tcDelta.index || 0;
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: tcDelta.id || '',
                  type: 'function',
                  function: {
                    name: tcDelta.function?.name || '',
                    arguments: tcDelta.function?.arguments || '',
                  },
                };
              } else {
                // Accumulate arguments (they come in chunks)
                if (tcDelta.function?.arguments) {
                  toolCalls[index].function.arguments += tcDelta.function.arguments;
                }
                if (tcDelta.function?.name && !toolCalls[index].function.name) {
                  toolCalls[index].function.name = tcDelta.function.name;
                }
                if (tcDelta.id && !toolCalls[index].id) {
                  toolCalls[index].id = tcDelta.id;
                }
              }
            }
          }

          const content = delta?.content;
          if (content) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
          }
        }

        // If function calls were detected, handle them
        if (hasFunctionCall && toolCalls.length > 0) {
          // Close current stream
          res.write('data: [FUNCTION_CALL]\n\n');

          // Execute functions and get result
          const allToolResults = [];
          for (let idx = 0; idx < toolCalls.length; idx++) {
            const toolCall = toolCalls[idx];
            if (!toolCall || !toolCall.function || !toolCall.function.name || !toolCall.id) {
              console.error('Invalid tool call at index', idx, toolCall);
              continue;
            }
            
            const functionName = toolCall.function.name;
            let functionArgs = {};
            
            try {
              const argsStr = toolCall.function.arguments || '{}';
              functionArgs = JSON.parse(argsStr);
            } catch (e) {
              console.error('Error parsing function arguments:', e, 'Raw args:', toolCall.function.arguments);
              functionArgs = {};
            }

            try {
              const functionResult = await executeFunction(
                functionName,
                functionArgs,
                userId,
                tenantId
              );

              allToolResults.push({
                toolCallId: toolCall.id,
                result: typeof functionResult === 'string' ? functionResult : JSON.stringify(functionResult),
              });
            } catch (funcError) {
              console.error(`Error executing function ${functionName}:`, funcError);
              allToolResults.push({
                toolCallId: toolCall.id,
                result: JSON.stringify({ error: funcError.message || 'Function execution failed' }),
              });
            }
          }

          // Build properly formatted messages for continuation
          const assistantMessage = {
            role: 'assistant',
            content: null,
            tool_calls: toolCalls.filter(tc => tc && tc.function && tc.function.name).map(tc => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments || '{}',
              },
            })),
          };

          const toolMessages = allToolResults.map(tr => ({
            role: 'tool',
            tool_call_id: tr.toolCallId,
            content: tr.result,
          }));
          
          const updatedMessages = [
            ...messages,
            assistantMessage,
            ...toolMessages,
          ];

          // Continue chat with function results
          try {
            const finalResponse = await chatWithFunctions(
              updatedMessages,
              { role: userRole, userContext: userContextMessage, tenantId: tenantId },
              async (fnName, fnArgs) => await executeFunction(fnName, fnArgs, userId, tenantId)
            );

            // Send final response
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: finalResponse } }] })}\n\n`);
          } catch (chatError) {
            console.error('Error in chatWithFunctions:', chatError);
            res.write(`data: ${JSON.stringify({ error: chatError.message || 'Error processing request' })}\n\n`);
          }
        }

          // Send done signal
          res.write('data: [DONE]\n\n');
          res.end();
        } catch (functionStreamError) {
          console.error('Function streaming error:', functionStreamError);
          // Fallback to simple chat without functions
          try {
            const simpleStream = await streamChatCompletion(messages, {
              role: userRole,
              enableFunctions: false,
              userContext: userContextMessage,
              tenantId: tenantId,
            });
            
            for await (const chunk of simpleStream) {
              const content = chunk.choices[0]?.delta?.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
              }
            }
            res.write('data: [DONE]\n\n');
            res.end();
          } catch (fallbackError) {
            console.error('Fallback streaming error:', fallbackError);
            res.write(`data: ${JSON.stringify({ error: 'Failed to generate response. Please try again.' })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          }
        }
      } else {
        // Simple streaming without function calls
        try {
          const stream = await streamChatCompletion(messages, {
            role: userRole,
            enableFunctions: false,
            userContext: userContextMessage,
            tenantId: tenantId,
          });

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
            }
          }

          res.write('data: [DONE]\n\n');
          res.end();
        } catch (streamError) {
          console.error('Streaming error:', streamError);
          res.write(`data: ${JSON.stringify({ error: 'Failed to generate response. Please try again.' })}\n\n`);
          res.write('data: [DONE]\n\n');
          res.end();
        }
      }
      
      // Save conversation to history
      try {
        const allMessages = [...messages, { role: 'user', content: messages[messages.length - 1]?.content || '' }];
        const lastMessage = allMessages[allMessages.length - 1];
        const title = lastMessage?.content?.substring(0, 100) || 'New Conversation';
        
        if (conversation_id) {
          // Update existing conversation
          await query(
            `UPDATE ai_conversations 
             SET messages = $1::jsonb, title = $2, updated_at = now()
             WHERE id = $3 AND user_id = $4 AND tenant_id = $5`,
            [JSON.stringify(allMessages), title, conversation_id, userId, tenantId]
          );
        } else {
          // Create new conversation
          const convResult = await query(
            `INSERT INTO ai_conversations (tenant_id, user_id, title, messages)
             VALUES ($1, $2, $3, $4::jsonb)
             RETURNING id`,
            [tenantId, userId, title, JSON.stringify(allMessages)]
          );
          
          // Send conversation ID back to client
          if (convResult.rows.length > 0 && !res.headersSent) {
            res.write(`data: ${JSON.stringify({ conversation_id: convResult.rows[0].id })}\n\n`);
          }
        }
      } catch (saveError) {
        console.error('Error saving conversation:', saveError);
        // Don't fail the request if saving fails
      }
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      res.write(`data: ${JSON.stringify({ error: openaiError.message || 'OpenAI API error' })}\n\n`);
      res.end();
    }
  } catch (error) {
    console.error('Error in chat endpoint:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }
});

// Chat endpoint - non-streaming with function calling support
router.post('/chat/simple', authenticateToken, async (req, res) => {
  try {
    const { messages, enable_functions = true } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Get user role and tenant
    const userId = req.user.id;
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1 LIMIT 1',
      [userId]
    );
    const userRole = roleResult.rows[0]?.role || 'employee';

    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { executeFunction } = await import('../services/ai/functions.js');
    const { chatWithFunctions } = await import('../services/openai.js');

    // Get user context for AI
    const { getUserContext, buildUserContextMessage } = await import('../services/ai/user-context.js');
    const userContext = await getUserContext(userId, tenantId);
    const userContextMessage = userContext ? buildUserContextMessage(userContext) : '';

    if (enable_functions) {
      // Use function-enabled chat
      const response = await chatWithFunctions(
        messages,
        { role: userRole, userContext: userContextMessage, tenantId: tenantId },
        async (functionName, functionArgs) => {
          return await executeFunction(functionName, functionArgs, userId, tenantId);
        }
      );
      
      // Save conversation
      const { conversation_id } = req.body;
      const allMessages = [...messages, { role: 'assistant', content: response }];
      const title = messages[0]?.content?.substring(0, 100) || 'New Conversation';
      
      try {
        if (conversation_id) {
          await query(
            `UPDATE ai_conversations 
             SET messages = $1::jsonb, updated_at = now()
             WHERE id = $2 AND user_id = $3 AND tenant_id = $4`,
            [JSON.stringify(allMessages), conversation_id, userId, tenantId]
          );
          res.json({ message: response, conversation_id });
        } else {
          const convResult = await query(
            `INSERT INTO ai_conversations (tenant_id, user_id, title, messages)
             VALUES ($1, $2, $3, $4::jsonb)
             RETURNING id`,
            [tenantId, userId, title, JSON.stringify(allMessages)]
          );
          res.json({ message: response, conversation_id: convResult.rows[0]?.id });
        }
      } catch (saveError) {
        console.error('Error saving conversation:', saveError);
        res.json({ message: response }); // Still return response even if save fails
      }
    } else {
      // Simple chat without functions
      const response = await getChatCompletion(messages, { role: userRole, userContext: userContextMessage, tenantId: tenantId });
      
      // Save conversation
      const { conversation_id } = req.body;
      const allMessages = [...messages, { role: 'assistant', content: response }];
      const title = messages[0]?.content?.substring(0, 100) || 'New Conversation';
      
      try {
        if (conversation_id) {
          await query(
            `UPDATE ai_conversations 
             SET messages = $1::jsonb, updated_at = now()
             WHERE id = $2 AND user_id = $3 AND tenant_id = $4`,
            [JSON.stringify(allMessages), conversation_id, userId, tenantId]
          );
          res.json({ message: response, conversation_id });
        } else {
          const convResult = await query(
            `INSERT INTO ai_conversations (tenant_id, user_id, title, messages)
             VALUES ($1, $2, $3, $4::jsonb)
             RETURNING id`,
            [tenantId, userId, title, JSON.stringify(allMessages)]
          );
          res.json({ message: response, conversation_id: convResult.rows[0]?.id });
        }
      } catch (saveError) {
        console.error('Error saving conversation:', saveError);
        res.json({ message: response });
      }
    }
  } catch (error) {
    console.error('Error in simple chat endpoint:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

// Enhanced roster generation with OpenAI
router.post('/roster/generate-enhanced', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, roles_needed, max_hours_per_employee, unavailable_employee_ids = [] } = req.body;

    if (!start_date || !end_date || !Array.isArray(roles_needed)) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get available employees for the tenant
    const userId = req.user.id;
    const profileResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
    const tenantId = profileResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Fetch employees
    const employeesResult = await query(
      `SELECT e.id, e.employee_id, p.first_name, p.last_name, e.department, e.position
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       WHERE e.tenant_id = $1 AND e.status = 'active'
       AND e.id != ALL($2::uuid[])`,
      [tenantId, unavailable_employee_ids]
    );

    const employees = employeesResult.rows.map(row => ({
      id: row.id,
      name: `${row.first_name} ${row.last_name}`,
      department: row.department,
      position: row.position,
    }));

    // Generate roster using OpenAI
    const roster = await generateShiftRoster(
      { start_date, end_date, roles_needed, max_hours_per_employee },
      employees
    );

    res.json({ draft: roster, notes: 'Generated using OpenAI' });
  } catch (error) {
    console.error('Error generating roster:', error);
    res.status(500).json({ error: error.message || 'Failed to generate roster' });
  }
});

// Enhanced project suggestions with OpenAI insights
router.post('/projects/:projectId/suggestions-enhanced', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { includeOverloaded = false } = req.body;

    // Get project details
    const projectResult = await query(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );

    if (projectResult.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const project = projectResult.rows[0];

    // Get candidates using existing suggester
    const { suggestCandidates } = await import('../services/ai/suggester.js');
    const candidates = await suggestCandidates(project, { include_overloaded: includeOverloaded });

    // Generate AI insights
    try {
      const aiInsights = await generateProjectSuggestions(project, candidates);
      res.json({
        candidates,
        ai_insights: aiInsights,
        generated_at: new Date().toISOString(),
      });
    } catch (aiError) {
      // If AI fails, still return candidates
      console.error('AI suggestion generation failed:', aiError);
      res.json({
        candidates,
        ai_insights: null,
        error: 'AI insights unavailable',
      });
    }
  } catch (error) {
    console.error('Error generating enhanced suggestions:', error);
    res.status(500).json({ error: error.message || 'Failed to generate suggestions' });
  }
});

// Get conversation history
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `SELECT id, title, messages, created_at, updated_at
       FROM ai_conversations
       WHERE user_id = $1 AND tenant_id = $2
       ORDER BY updated_at DESC
       LIMIT 50`,
      [userId, tenantId]
    );

    res.json({
      conversations: result.rows.map(row => ({
        id: row.id,
        title: row.title,
        message_count: Array.isArray(row.messages) ? row.messages.length : 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
        preview: Array.isArray(row.messages) && row.messages.length > 0 
          ? (row.messages[0].content || '').substring(0, 100)
          : '',
      })),
    });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single conversation
router.get('/conversations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `SELECT id, title, messages, created_at, updated_at
       FROM ai_conversations
       WHERE id = $1 AND user_id = $2 AND tenant_id = $3`,
      [id, userId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      conversation: {
        id: result.rows[0].id,
        title: result.rows[0].title,
        messages: result.rows[0].messages,
        created_at: result.rows[0].created_at,
        updated_at: result.rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete conversation
router.delete('/conversations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `DELETE FROM ai_conversations
       WHERE id = $1 AND user_id = $2 AND tenant_id = $3
       RETURNING id`,
      [id, userId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update conversation title
router.patch('/conversations/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user.id;
    const tenantResult = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await query(
      `UPDATE ai_conversations
       SET title = $1, updated_at = now()
       WHERE id = $2 AND user_id = $3 AND tenant_id = $4
       RETURNING id`,
      [title, id, userId, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating conversation:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;


