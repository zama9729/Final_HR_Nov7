import { getOpenAIClient } from './openai.js';
import { query } from '../db/pool.js';
import { getTenantIdForUser } from '../utils/tenant.js';

/**
 * AI-powered Smart Memo Intent Inference Service
 * Uses OpenAI to infer user intents from natural language input
 */

/**
 * Infer intents and extract entities from natural language input
 * @param {string} memoText - User's natural language input
 * @param {Object} context - Context information (user, role, currentPage, etc.)
 * @returns {Promise<Object>} DraftAction object with inferred intents and proposed actions
 */
export async function inferSmartMemoIntents(memoText, context = {}) {
  const openaiClient = await getOpenAIClient();
  
  if (!openaiClient) {
    // Fallback to basic parsing if OpenAI is not available
    return fallbackIntentInference(memoText, context);
  }

  const {
    userId,
    userRole,
    currentPage,
    currentEntityId, // employee_id, project_id, etc.
    currentEntityType, // 'employee', 'project', 'appraisal', 'payroll'
    tenantId,
  } = context;

  // Build context-aware prompt
  const systemPrompt = buildSystemPrompt(userRole, currentPage, currentEntityType);
  const userPrompt = buildUserPrompt(memoText, context);

  try {
    const response = await openaiClient.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent parsing
      response_format: { type: 'json_object' },
    });

    const content = JSON.parse(response.choices[0].message.content);
    
    // Validate and enrich the response
    const draftAction = await enrichDraftAction(content, context);
    
    return draftAction;
  } catch (error) {
    console.error('Error in AI intent inference:', error);
    // Fallback to basic parsing
    return fallbackIntentInference(memoText, context);
  }
}

/**
 * Build system prompt for intent inference
 */
function buildSystemPrompt(userRole, currentPage, currentEntityType) {
  return `You are an AI assistant that helps users convert natural language notes into structured HR actions.

Your task is to analyze user input and infer their intent(s). You can detect multiple intents from a single input.

INTENTS YOU CAN DETECT:
1. calendar_event - User wants to create a calendar event/meeting
2. reminder - User wants to set a reminder/notification
3. note - User wants to save a contextual note
4. task - User wants to create a task (future enhancement)

OUTPUT FORMAT (JSON):
{
  "intents": ["calendar_event", "reminder"],
  "confidence": 0.9,
  "proposedActions": [
    {
      "type": "calendar_event",
      "title": "1:1 with John - Performance",
      "startDateTime": "2024-01-15T14:00:00Z",
      "duration": 30,
      "participants": ["employee-uuid-1"],
      "recurrence": null,
      "linkedEntity": "employee",
      "linkedEntityId": "employee-uuid-1",
      "description": "Performance discussion"
    },
    {
      "type": "reminder",
      "reminderTime": "2024-01-15T13:30:00Z",
      "message": "Prepare for performance discussion with John"
    }
  ],
  "extractedEntities": {
    "people": ["John"],
    "dates": ["2024-01-15"],
    "times": ["14:00"],
    "topics": ["performance", "appraisal"]
  }
}

RULES:
- Extract people mentioned (names, @mentions)
- Infer dates from relative terms: "tomorrow", "next week", "Monday", etc.
- Infer times from natural language: "morning" = 10:00, "afternoon" = 14:00, "evening" = 18:00
- Default meeting duration: 30 min for 1:1s, 60 min for group meetings
- If user is on an Employee Profile page, link actions to that employee
- If user is Manager and mentions a name, check if it's a direct report
- Always propose actions, never assume - user must confirm
- Confidence should be 0-1, where 0.6+ is high confidence
- If confidence < 0.6, set clarificationNeeded: true

CURRENT CONTEXT:
- User Role: ${userRole || 'unknown'}
- Current Page: ${currentPage || 'dashboard'}
- Entity Type: ${currentEntityType || 'none'}

Be smart about defaults but always allow user to edit before saving.`;
}

/**
 * Build user prompt with context
 */
function buildUserPrompt(memoText, context) {
  const { currentEntityId, currentEntityType, currentEntityName } = context;
  
  let prompt = `Analyze this user input and infer intents:\n\n"${memoText}"\n\n`;
  
  if (currentEntityType && currentEntityName) {
    prompt += `CONTEXT: User is currently viewing ${currentEntityType} "${currentEntityName}". `;
    prompt += `Link actions to this entity when relevant.\n\n`;
  }
  
  prompt += `Extract all intents, entities, and propose structured actions. `;
  prompt += `Return valid JSON only.`;
  
  return prompt;
}

/**
 * Enrich draft action with actual employee IDs, validate dates, etc.
 */
async function enrichDraftAction(content, context) {
  const { tenantId, userId } = context;
  
  // Resolve people mentions to actual employee IDs
  if (content.extractedEntities?.people) {
    const resolvedPeople = await resolvePeopleMentions(
      content.extractedEntities.people,
      tenantId
    );
    
    // Update proposed actions with resolved employee IDs
    if (content.proposedActions) {
      content.proposedActions = content.proposedActions.map(action => {
        if (action.type === 'calendar_event' && action.participants) {
          // Map participant names to IDs
          action.participants = action.participants
            .map(name => resolvedPeople.find(p => p.name === name)?.id)
            .filter(Boolean);
        }
        return action;
      });
    }
  }
  
  // Validate and normalize dates/times
  if (content.proposedActions) {
    content.proposedActions = content.proposedActions.map(action => {
      if (action.startDateTime) {
        action.startDateTime = normalizeDateTime(action.startDateTime);
      }
      if (action.reminderTime) {
        action.reminderTime = normalizeDateTime(action.reminderTime);
      }
      return action;
    });
  }
  
  // Link to current entity if on a specific page
  if (context.currentEntityId && context.currentEntityType) {
    content.proposedActions = content.proposedActions.map(action => {
      if (!action.linkedEntityId) {
        action.linkedEntity = context.currentEntityType;
        action.linkedEntityId = context.currentEntityId;
      }
      return action;
    });
  }
  
  return content;
}

/**
 * Resolve people mentions to employee IDs
 */
async function resolvePeopleMentions(peopleNames, tenantId) {
  if (!peopleNames || peopleNames.length === 0 || !tenantId) {
    return [];
  }
  
  try {
    const searchTerms = peopleNames.map(name => `%${name}%`);
    // Build dynamic query for multiple name searches
    const conditions = peopleNames.map((_, i) => 
      `(p.first_name ILIKE $${i + 2} OR p.last_name ILIKE $${i + 2} OR CONCAT(p.first_name, ' ', p.last_name) ILIKE $${i + 2})`
    ).join(' OR ');
    
    const result = await query(
      `SELECT e.id, p.first_name, p.last_name, 
              CONCAT(p.first_name, ' ', p.last_name) as full_name
       FROM employees e
       JOIN profiles p ON p.id = e.user_id
       WHERE e.tenant_id = $1
       AND (${conditions})
       LIMIT 20`,
      [tenantId, ...searchTerms]
    );
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.full_name,
    }));
  } catch (error) {
    console.error('Error resolving people mentions:', error);
    return [];
  }
}

/**
 * Normalize date/time strings to ISO format
 */
function normalizeDateTime(dateTimeStr) {
  try {
    const date = new Date(dateTimeStr);
    if (isNaN(date.getTime())) {
      // Try to parse relative dates
      return parseRelativeDate(dateTimeStr);
    }
    return date.toISOString();
  } catch (error) {
    console.error('Error normalizing date:', error);
    return new Date().toISOString();
  }
}

/**
 * Parse relative date strings (fallback)
 */
function parseRelativeDate(dateStr) {
  const now = new Date();
  const lower = dateStr.toLowerCase();
  
  if (lower.includes('tomorrow')) {
    now.setDate(now.getDate() + 1);
  } else if (lower.includes('next week')) {
    now.setDate(now.getDate() + 7);
  } else if (lower.includes('next month')) {
    now.setMonth(now.getMonth() + 1);
  }
  
  // Try to extract time
  const timeMatch = dateStr.match(/(\d{1,2}):?(\d{2})?/);
  if (timeMatch) {
    const hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    now.setHours(hour, minute, 0, 0);
  } else if (lower.includes('morning')) {
    now.setHours(10, 0, 0, 0);
  } else if (lower.includes('afternoon')) {
    now.setHours(14, 0, 0, 0);
  } else if (lower.includes('evening')) {
    now.setHours(18, 0, 0, 0);
  }
  
  return now.toISOString();
}

/**
 * Fallback intent inference using basic parsing (when AI is unavailable)
 */
function fallbackIntentInference(memoText, context) {
  // Use existing regex-based parser as fallback
  const intents = [];
  const proposedActions = [];
  
  // Check for calendar event indicators
  if (/\d{1,2}[-:]\d{1,2}/.test(memoText) || 
      /meeting|call|standup|1:1|one-on-one/i.test(memoText)) {
    intents.push('calendar_event');
  }
  
  // Check for reminder indicators
  if (/remind|reminder|notify|alert/i.test(memoText)) {
    intents.push('reminder');
  }
  
  // Default to note if nothing else detected
  if (intents.length === 0) {
    intents.push('note');
  }
  
  return {
    intents,
    confidence: 0.5, // Lower confidence for fallback
    proposedActions: [],
    extractedEntities: {
      people: [],
      dates: [],
      times: [],
      topics: [],
    },
    clarificationNeeded: true,
  };
}

