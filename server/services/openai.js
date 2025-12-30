import { getSystemContext, getRoleContext } from './ai/knowledge.js';

// Lazy import OpenAI to avoid crashing if package is not installed
let OpenAI = null;
let openaiImportAttempted = false;

async function loadOpenAI() {
  if (openaiImportAttempted) {
    return OpenAI;
  }
  openaiImportAttempted = true;
  try {
    const openaiModule = await import('openai');
    OpenAI = openaiModule.default;
  } catch (e) {
    console.warn('⚠️  OpenAI package not found. AI features will not work. Run: npm install openai');
    OpenAI = null;
  }
  return OpenAI;
}

// Initialize OpenAI client
let openaiClient = null;

export async function getOpenAIClient() {
  // Try to load OpenAI if not already loaded
  if (!OpenAI && !openaiImportAttempted) {
    await loadOpenAI();
  }

  if (!OpenAI) {
    console.warn('⚠️  OpenAI package not installed. Install with: npm install openai');
    return null;
  }

  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // Don't throw on import, allow graceful degradation
      console.warn('⚠️  OPENAI_API_KEY is not configured. AI features will not work.');
      return null;
    }
    try {
      openaiClient = new OpenAI({
        apiKey: apiKey,
      });
    } catch (error) {
      console.error('Error initializing OpenAI client:', error);
      return null;
    }
  }
  return openaiClient;
}

/**
 * Get function definitions for OpenAI function calling
 */
export function getFunctionDefinitions() {
  return [
    {
      name: 'get_employee_info',
      description: 'Get detailed information about a specific employee by employee ID or UUID',
      parameters: {
        type: 'object',
        properties: {
          employee_id: {
            type: 'string',
            description: 'The UUID or employee ID of the employee to retrieve information for',
          },
        },
        required: ['employee_id'],
      },
    },
    {
      name: 'list_employees',
      description: 'List employees with optional filters (department, status, search query)',
      parameters: {
        type: 'object',
        properties: {
          department: {
            type: 'string',
            description: 'Filter by department name',
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'terminated'],
            description: 'Filter by employment status',
          },
          search: {
            type: 'string',
            description: 'Search by name or email',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results (default: 50, max: 100)',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_leave_request',
      description: 'Get detailed information about a specific leave request',
      parameters: {
        type: 'object',
        properties: {
          leave_request_id: {
            type: 'string',
            description: 'The UUID of the leave request',
          },
        },
        required: ['leave_request_id'],
      },
    },
    {
      name: 'list_pending_leave_requests',
      description: 'List all pending leave requests that need approval (for managers and HR)',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_timesheet',
      description: 'Get detailed information about a specific timesheet',
      parameters: {
        type: 'object',
        properties: {
          timesheet_id: {
            type: 'string',
            description: 'The UUID of the timesheet',
          },
        },
        required: ['timesheet_id'],
      },
    },
    {
      name: 'get_dashboard_stats',
      description: 'Get dashboard statistics including total employees, pending leave requests, and pending timesheets',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_leave_policies',
      description: 'Get all active leave policies for the organization',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_my_leave_requests',
      description: "Get current user's leave requests (no parameters needed - automatically uses current user)",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'create_leave_request',
      description: 'Create a new leave request for the current user. Use this when user wants to apply for leave or request time off.',
      parameters: {
        type: 'object',
        properties: {
          leave_type: {
            type: 'string',
            description: 'Type of leave: annual, sick, casual, maternity, paternity, or bereavement',
            enum: ['annual', 'sick', 'casual', 'maternity', 'paternity', 'bereavement'],
          },
          start_date: {
            type: 'string',
            description: 'Start date in YYYY-MM-DD format',
          },
          end_date: {
            type: 'string',
            description: 'End date in YYYY-MM-DD format',
          },
          reason: {
            type: 'string',
            description: 'Reason for leave (optional)',
          },
        },
        required: ['leave_type', 'start_date', 'end_date'],
      },
    },
    {
      name: 'list_workflows',
      description: 'List all available workflows for the organization',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
    {
      name: 'get_workflow',
      description: 'Get details of a specific workflow by ID',
      parameters: {
        type: 'object',
        properties: {
          workflow_id: {
            type: 'string',
            description: 'The UUID of the workflow to retrieve',
          },
        },
        required: ['workflow_id'],
      },
    },
    {
      name: 'create_workflow_from_natural_language',
      description: 'Create a new workflow from a natural language description. Use this when user wants to create or build a workflow.',
      parameters: {
        type: 'object',
        properties: {
          description: {
            type: 'string',
            description: 'Natural language description of the workflow to create (e.g., "Create a workflow for leave requests over 10 days that requires manager and HR approval")',
          },
          name: {
            type: 'string',
            description: 'Optional name for the workflow. If not provided, AI will generate one.',
          },
        },
        required: ['description'],
      },
    },
    {
      name: 'start_workflow',
      description: 'Start/trigger a workflow instance. Use this when user wants to execute a workflow.',
      parameters: {
        type: 'object',
        properties: {
          workflow_id: {
            type: 'string',
            description: 'The UUID of the workflow to start',
          },
          name: {
            type: 'string',
            description: 'Optional name for this workflow instance',
          },
          trigger_payload: {
            type: 'object',
            description: 'Optional payload data to pass to the workflow trigger',
          },
        },
        required: ['workflow_id'],
      },
    },
    {
      name: 'list_mini_apps',
      description: 'List all available Opal mini apps for the organization',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Optional category filter (e.g., "leave", "timesheet", "employee")',
          },
        },
        required: [],
      },
    },
    {
      name: 'get_mini_app',
      description: 'Get details of a specific Opal mini app',
      parameters: {
        type: 'object',
        properties: {
          mini_app_id: {
            type: 'string',
            description: 'The UUID of the mini app to retrieve',
          },
        },
        required: ['mini_app_id'],
      },
    },
    {
      name: 'execute_mini_app',
      description: 'Execute/run an Opal mini app with given parameters',
      parameters: {
        type: 'object',
        properties: {
          mini_app_id: {
            type: 'string',
            description: 'The UUID of the mini app to execute',
          },
          params: {
            type: 'object',
            description: 'Parameters to pass to the mini app',
          },
        },
        required: ['mini_app_id'],
      },
    },
  ];
}

/**
 * Get dynamic function definitions including Opal mini apps
 * This allows AI to discover mini apps at runtime
 */
export async function getFunctionDefinitionsWithMiniApps(tenantId) {
  const baseFunctions = getFunctionDefinitions();

  try {
    const { getAvailableMiniApps } = await import('./ai/opal-integration.js');
    const miniApps = await getAvailableMiniApps(tenantId);

    // Convert mini apps to function definitions
    const miniAppFunctions = miniApps.map(app => ({
      name: app.function_name,
      description: `${app.description || app.name}. Category: ${app.category || 'general'}`,
      parameters: {
        type: 'object',
        properties: app.app_config?.parameters || {},
        required: app.app_config?.required || [],
      },
    }));

    return [...baseFunctions, ...miniAppFunctions];
  } catch (error) {
    console.error('Error loading mini apps for function definitions:', error);
    return baseFunctions;
  }
}

/**
 * Stream chat completion using OpenAI with function calling support
 * @param {Array} messages - Array of message objects {role, content}
 * @param {Object} options - Additional options
 * @returns {ReadableStream} - Stream of chat responses
 */
export async function streamChatCompletion(messages, options = {}) {
  const client = await getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client is not initialized. Please install openai package and configure OPENAI_API_KEY.');
  }
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  // Get system context and role context
  const systemContext = getSystemContext();
  const roleContext = options.role ? getRoleContext(options.role) : '';
  const userContextMessage = options.userContext ? options.userContext : '';

  const systemMessage = options.systemMessage || `${systemContext}
${roleContext}
${userContextMessage}

You are a helpful HR assistant for Petal HR Suite.
Capabilities:
- Employee info & management
- Leave requests (create with 'create_leave_request')
- Timesheets & Stats
- Workflows

Rules:
1. For leave requests ("apply for leave", "sick leave", etc.), IMMEDIATELY call 'create_leave_request'. Do not ask for confirmation if you have the details.
2. Use functions for specific data lookups.
3. Be concise.`;

  // Only include functions if explicitly enabled AND tenantId provided
  let functionDefinitions = null;
  if (options.enableFunctions && options.tenantId) {
    try {
      functionDefinitions = await getFunctionDefinitionsWithMiniApps(options.tenantId);
    } catch (error) {
      console.warn('Could not load function definitions:', error.message);
      // Continue without functions
    }
  }

  // Truncate history to last 10 messages to save tokens
  const recentMessages = messages.slice(-10);

  const requestOptions = {
    model: model,
    messages: [
      { role: 'system', content: systemMessage },
      ...recentMessages
    ],
    stream: true,
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 2000,
  };

  // Add function calling only if enabled AND we have valid function definitions
  if (options.enableFunctions !== false && functionDefinitions && functionDefinitions.length > 0) {
    try {
      requestOptions.tools = functionDefinitions.map(func => ({
        type: 'function',
        function: func,
      }));
      requestOptions.tool_choice = options.tool_choice || 'auto';
    } catch (error) {
      console.warn('Error setting up tools:', error.message);
      // Continue without function calling
      requestOptions.tool_choice = 'none';
    }
  } else {
    // Disable function calling for simple questions
    requestOptions.tool_choice = 'none';
  }

  try {
    const response = await client.chat.completions.create(requestOptions);
    return response;
  } catch (error) {
    console.error('OpenAI API error in streamChatCompletion:', error);
    throw error;
  }
}

/**
 * Chat completion with function calling support (non-streaming)
 * Handles function calls automatically
 */
export async function chatWithFunctions(messages, options = {}, executeFunction = null) {
  const client = await getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client is not initialized. Please install openai package and configure OPENAI_API_KEY.');
  }
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const systemContext = getSystemContext();
  const roleContext = options.role ? getRoleContext(options.role) : '';
  const userContextMessage = options.userContext ? options.userContext : '';

  const systemMessage = `${systemContext}

${roleContext}

${userContextMessage}

You are a helpful HR assistant for Petal HR Suite with access to real-time system data.
Use the available functions to retrieve accurate information when users ask about:
- Employee details
- Leave requests
- Timesheets
- Statistics
- Policies

Be professional, friendly, and concise.`;

  // Only get function definitions if we're actually going to use them
  let functionDefinitions = null;
  let conversationMessages = [
    { role: 'system', content: systemMessage },
    ...messages
  ];

  // Handle up to 5 function call iterations (increased for better handling)
  for (let i = 0; i < 5; i++) {
    // Get function definitions on first iteration only (to avoid errors)
    if (i === 0 && options.tenantId) {
      try {
        functionDefinitions = await getFunctionDefinitionsWithMiniApps(options.tenantId);
      } catch (error) {
        console.warn('Could not load mini apps, using base functions:', error.message);
        functionDefinitions = getFunctionDefinitions();
      }
    }

    const requestOptions = {
      model: model,
      messages: conversationMessages,
      temperature: options.temperature || 0.7,
      max_tokens: options.max_tokens || 2000,
    };

    // Only add tools if we have function definitions
    if (functionDefinitions && functionDefinitions.length > 0) {
      requestOptions.tools = functionDefinitions.map(func => ({
        type: 'function',
        function: func,
      }));
      requestOptions.tool_choice = 'auto';
    } else {
      requestOptions.tool_choice = 'none';
    }

    const response = await client.chat.completions.create(requestOptions);

    const message = response.choices[0].message;

    // Add assistant message (with tool_calls if any)
    const assistantMessage = {
      role: message.role,
      content: message.content || null,
    };

    // Only add tool_calls if they exist
    if (message.tool_calls && message.tool_calls.length > 0) {
      assistantMessage.tool_calls = message.tool_calls.map(tc => ({
        id: tc.id,
        type: tc.type || 'function',
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));
    }

    conversationMessages.push(assistantMessage);

    // Check if function calls are needed
    if (message.tool_calls && message.tool_calls.length > 0 && executeFunction) {
      // Execute function calls
      for (const toolCall of message.tool_calls) {
        if (!toolCall.function || !toolCall.function.name) {
          console.error('Invalid tool call:', toolCall);
          continue;
        }

        const functionName = toolCall.function.name;
        let functionArgs = {};

        try {
          if (typeof toolCall.function.arguments === 'string') {
            functionArgs = JSON.parse(toolCall.function.arguments);
          } else if (typeof toolCall.function.arguments === 'object') {
            functionArgs = toolCall.function.arguments;
          }
        } catch (e) {
          console.error('Error parsing function arguments:', e);
          functionArgs = {};
        }

        try {
          const functionResult = await executeFunction(functionName, functionArgs);

          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: typeof functionResult === 'string' ? functionResult : JSON.stringify(functionResult),
          });
        } catch (funcError) {
          console.error(`Error executing function ${functionName}:`, funcError);
          conversationMessages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: funcError.message || 'Function execution failed' }),
          });
        }
      }
    } else {
      // No more function calls, return the final response
      const finalContent = message.content;
      if (finalContent) {
        return finalContent;
      }
      // If no content but no tool calls, something went wrong
      return 'I apologize, but I could not generate a response. Please try rephrasing your question.';
    }
  }

  // If we've done max iterations, try to return the last message content
  const lastMessage = conversationMessages[conversationMessages.length - 1];
  if (lastMessage && lastMessage.content) {
    return lastMessage.content;
  }

  // Fallback: return a helpful message
  return 'I apologize, but I encountered an issue processing your request. Please try asking your question differently.';
}

/**
 * Get chat completion (non-streaming)
 * @param {Array} messages - Array of message objects {role, content}
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - Chat response text
 */
export async function getChatCompletion(messages, options = {}) {
  const client = await getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client is not initialized. Please install openai package and configure OPENAI_API_KEY.');
  }
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  // Get system context
  const systemContext = getSystemContext();
  const roleContext = options.role ? getRoleContext(options.role) : '';
  const userContextMessage = options.userContext ? options.userContext : '';

  const systemMessage = `${systemContext}

${roleContext}

${userContextMessage}

You are a helpful HR assistant for Petal HR Suite. You can help users with:
- Employee information and management
- Leave requests and policies
- Timesheet tracking
- Dashboard statistics
- General HR queries
- Workflow creation and automation

IMPORTANT: For simple conversational questions (greetings, "how are you", general questions), respond naturally WITHOUT calling functions.
Only call functions when users explicitly ask for specific information like employee data, leave requests, timesheets, or statistics.

Be professional, friendly, and concise.`;

  const requestOptions = {
    model: model,
    messages: [
      { role: 'system', content: systemMessage },
      ...messages
    ],
    temperature: options.temperature || 0.7,
    max_tokens: options.max_tokens || 2000,
  };

  // Only add function calling if explicitly enabled
  if (options.enableFunctions && options.tenantId) {
    try {
      const functionDefinitions = await getFunctionDefinitionsWithMiniApps(options.tenantId);
      if (functionDefinitions && functionDefinitions.length > 0) {
        requestOptions.tools = functionDefinitions.map(func => ({
          type: 'function',
          function: func,
        }));
        requestOptions.tool_choice = 'auto';
      }
    } catch (error) {
      console.warn('Could not load function definitions for getChatCompletion:', error.message);
      // Continue without function calling
    }
  } else {
    // Disable function calling for simple questions
    requestOptions.tool_choice = 'none';
  }

  try {
    const response = await client.chat.completions.create(requestOptions);
    const content = response.choices[0].message.content;

    if (!content) {
      return 'I apologize, but I could not generate a response. Please try rephrasing your question.';
    }

    return content;
  } catch (error) {
    console.error('OpenAI API error in getChatCompletion:', error);
    throw error;
  }
}

/**
 * Generate project candidate suggestions using AI
 * @param {Object} project - Project details
 * @param {Array} candidates - Candidate data array
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - AI-generated suggestions
 */
export async function generateProjectSuggestions(project, candidates, options = {}) {
  const client = await getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client is not initialized. Please install openai package and configure OPENAI_API_KEY.');
  }
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const prompt = `You are an expert HR recruiter. Analyze the following project requirements and candidate profiles to provide intelligent matching suggestions.

Project Details:
- Name: ${project.name || 'N/A'}
- Description: ${project.description || 'N/A'}
- Required Skills: ${JSON.stringify(project.required_skills || [])}
- Required Certifications: ${JSON.stringify(project.required_certifications || [])}

Candidate Profiles:
${JSON.stringify(candidates.slice(0, 10), null, 2)}

Based on the candidate scores, skills, availability, and past project experience, provide:
1. Top 3 recommended candidates with brief reasoning
2. Key strengths of each recommended candidate
3. Any concerns or considerations

Keep the response concise and actionable.`;

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert HR recruiter specializing in technical talent matching. Provide clear, actionable recommendations.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 800,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating project suggestions:', error);
    throw error;
  }
}

/**
 * Generate performance review insights using AI
 * @param {Object} review - Performance review data
 * @param {Object} employeeData - Employee data
 * @param {Object} options - Additional options
 * @returns {Promise<string>} - AI-generated insights
 */
export async function generatePerformanceInsights(review, employeeData, options = {}) {
  const client = await getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client is not initialized. Please install openai package and configure OPENAI_API_KEY.');
  }
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const prompt = `Analyze the following performance review and provide insights:

Employee: ${employeeData.name || 'N/A'}
Position: ${employeeData.position || 'N/A'}
Rating: ${review.rating || 'N/A'}/5
Performance Score: ${review.performance_score || 'N/A'}/5
Strengths: ${review.strengths || 'N/A'}
Areas for Improvement: ${review.areas_of_improvement || 'N/A'}
Goals: ${review.goals || 'N/A'}
Comments: ${review.comments || 'N/A'}

Provide:
1. Overall performance summary
2. Key strengths highlighted
3. Development recommendations
4. Goal alignment analysis

Keep response professional and constructive.`;

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert HR performance analyst. Provide professional, constructive insights on employee performance reviews.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 600,
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Error generating performance insights:', error);
    throw error;
  }
}

/**
 * Generate shift roster suggestions using AI
 * @param {Object} requirements - Shift requirements
 * @param {Array} employees - Employee data array
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} - AI-generated roster
 */
export async function generateShiftRoster(requirements, employees, options = {}) {
  const client = await getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client is not initialized. Please install openai package and configure OPENAI_API_KEY.');
  }
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

  const prompt = `Generate a fair and balanced shift roster based on the following requirements:

Start Date: ${requirements.start_date}
End Date: ${requirements.end_date}
Max Hours per Employee: ${requirements.max_hours_per_employee || 40}
Roles Needed: ${JSON.stringify(requirements.roles_needed || [])}

Available Employees:
${JSON.stringify(employees.map(e => ({
    id: e.id,
    name: e.name,
    department: e.department,
    position: e.position
  })), null, 2)}

Return ONLY valid JSON in this format:
{
  "shifts": [
    {
      "employee_id": "uuid",
      "shift_date": "YYYY-MM-DD",
      "start_time": "HH:MM:SS",
      "end_time": "HH:MM:SS",
      "shift_type": "morning|afternoon|night|regular",
      "notes": "optional notes"
    }
  ],
  "summary": {
    "total_shifts": 0,
    "hours_distributed": 0,
    "notes": "brief summary"
  }
}`;

  try {
    const response = await client.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert shift scheduler. Generate fair, balanced rosters considering work-life balance, equal distribution, and operational needs. Return ONLY valid JSON, no markdown.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0].message.content;
    try {
      return JSON.parse(content);
    } catch (parseError) {
      // Try to extract JSON if wrapped in markdown
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('Invalid JSON response from AI');
    }
  } catch (error) {
    console.error('Error generating shift roster:', error);
    throw error;
  }
}

export default {
  streamChatCompletion,
  getChatCompletion,
  chatWithFunctions,
  generateProjectSuggestions,
  generatePerformanceInsights,
  generateShiftRoster,
  getFunctionDefinitions,
};

