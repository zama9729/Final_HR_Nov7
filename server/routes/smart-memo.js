import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getTenantIdForUser } from '../utils/tenant.js';
import { inferSmartMemoIntents } from '../services/smartMemoAI.js';

const router = express.Router();

/**
 * GET /api/calendar/employees/search?q=summie
 * Search employees for @mention autocomplete (same organization only)
 */
router.get('/employees/search', authenticateToken, async (req, res) => {
  try {
    const { q } = req.query;
    
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // If query is empty, return all employees in the organization (when user just types @)
    if (!q || typeof q !== 'string' || !q.trim()) {
      const result = await query(
        `SELECT 
          e.id,
          e.employee_id,
          e.user_id,
          e.position as designation,
          e.department,
          p.first_name,
          p.last_name,
          p.email,
          COALESCE(t.name, 'No Team') as team_name
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      LEFT JOIN team_memberships tm ON tm.employee_id = e.id AND tm.end_date IS NULL AND tm.org_id = $1
      LEFT JOIN teams t ON t.id = tm.team_id AND t.org_id = $1
      WHERE e.tenant_id = $1
      ORDER BY p.first_name, p.last_name`,
        [tenantId]
      );
      
      return res.json({
        employees: result.rows.map(row => ({
          id: row.id,
          user_id: row.user_id,
          employee_id: row.employee_id,
          name: `${row.first_name} ${row.last_name}`,
          email: row.email,
          designation: row.designation,
          department: row.department,
          team: row.team_name
        }))
      });
    }

    const searchTerm = `%${q.trim()}%`;
    
    // Search employees in same organization with name, designation, and team info
    const result = await query(
      `SELECT 
        e.id,
        e.employee_id,
        e.user_id,
        e.position as designation,
        e.department,
        p.first_name,
        p.last_name,
        p.email,
        COALESCE(t.name, 'No Team') as team_name
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
        LEFT JOIN team_memberships tm ON tm.employee_id = e.id AND tm.end_date IS NULL AND tm.org_id = $1
        LEFT JOIN teams t ON t.id = tm.team_id AND t.org_id = $1
        WHERE e.tenant_id = $1
        AND (
          p.first_name ILIKE $2 
          OR p.last_name ILIKE $2 
          OR CONCAT(p.first_name, ' ', p.last_name) ILIKE $2
          OR p.email ILIKE $2
          OR e.employee_id ILIKE $2
        )
      ORDER BY 
        CASE 
          WHEN p.first_name ILIKE $2 THEN 1
          WHEN CONCAT(p.first_name, ' ', p.last_name) ILIKE $2 THEN 2
          ELSE 3
        END,
        p.first_name, p.last_name`,
      [tenantId, searchTerm]
    );

    res.json({
      employees: result.rows.map(row => ({
        id: row.id,
        user_id: row.user_id,
        employee_id: row.employee_id,
        name: `${row.first_name} ${row.last_name}`,
        email: row.email,
        designation: row.designation,
        department: row.department,
        team: row.team_name
      }))
    });
  } catch (error) {
    console.error('Error searching employees:', error);
    res.status(500).json({ error: error.message || 'Failed to search employees' });
  }
});

/**
 * Parse smart memo text (same logic as frontend, but server-side for validation)
 * This is a simplified version - in production, you might want to share the parser
 */
function parseSmartMemo(text, baseDate) {
  if (!text || !text.trim()) {
    return [];
  }

  const entries = [];
  const segments = text.split(',').map(s => s.trim()).filter(s => s.length > 0);
  
  for (const segment of segments) {
    // Pattern 1: HH:MM-HH:MM description
    let match = segment.match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})\s+(.+)$/);
    if (match) {
      const [, startH, startM, endH, endM, description] = match;
      const startHour = parseInt(startH, 10);
      const startMin = parseInt(startM, 10);
      const endHour = parseInt(endH, 10);
      const endMin = parseInt(endM, 10);
      
      if (isValidTimeRange(startHour, startMin, endHour, endMin)) {
        const startDateTime = new Date(baseDate);
        startDateTime.setHours(startHour, startMin, 0, 0);
        
        const endDateTime = new Date(baseDate);
        endDateTime.setHours(endHour, endMin, 0, 0);
        
        entries.push({
          startDateTime,
          endDateTime,
          title: description.trim(),
          sourceText: segment.trim()
        });
      }
      continue;
    }
    
    // Pattern 2: HH-HH description
    match = segment.match(/^(\d{1,2})\s*-\s*(\d{1,2})\s+(.+)$/);
    if (match) {
      const [, startH, endH, description] = match;
      const startHour = parseInt(startH, 10);
      const endHour = parseInt(endH, 10);
      
      if (isValidTimeRange(startHour, 0, endHour, 0)) {
        const startDateTime = new Date(baseDate);
        startDateTime.setHours(startHour, 0, 0, 0);
        
        const endDateTime = new Date(baseDate);
        endDateTime.setHours(endHour, 0, 0, 0);
        
        entries.push({
          startDateTime,
          endDateTime,
          title: description.trim(),
          sourceText: segment.trim()
        });
      }
    }
  }
  
  return entries;
}

function isValidTimeRange(startHour, startMin, endHour, endMin) {
  if (startHour < 0 || startHour > 23 || startMin < 0 || startMin > 59) {
    return false;
  }
  if (endHour < 0 || endHour > 23 || endMin < 0 || endMin > 59) {
    return false;
  }
  
  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;
  
  return startTotal < endTotal;
}

function parseReminderCommands(text, baseDate = new Date()) {
  if (!text || !text.trim()) {
    return [];
  }

  const reminders = [];
  const normalizedText = text.toLowerCase();
  
  const patterns = [
    /remind\s+me\s+in\s+(\d+)\s+minute(s)?/gi,
    /remind\s+me\s+in\s+(\d+)\s+hour(s)?/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const amount = parseInt(match[1], 10);
      const unit = match[0].includes('hour') ? 'hours' : 'minutes';
      const rawText = text.substring(match.index, match.index + match[0].length);
      
      if (amount > 0) {
        const remindAt = new Date(baseDate);
        if (unit === 'hours') {
          remindAt.setHours(remindAt.getHours() + amount);
        } else {
          remindAt.setMinutes(remindAt.getMinutes() + amount);
        }
        
        reminders.push({
          remindAt,
          rawText: rawText.trim()
        });
      }
    }
  }
  
  return reminders;
}

function extractReminders(text, baseDate = new Date()) {
  const reminders = parseReminderCommands(text, baseDate);
  let cleanedText = text;
  
  for (const reminder of reminders) {
    const regex = new RegExp(reminder.rawText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    cleanedText = cleanedText.replace(regex, '').trim();
    cleanedText = cleanedText.replace(/,\s*,/g, ',').replace(/^\s*,\s*|\s*,\s*$/g, '').trim();
  }
  
  return { cleanedText, reminders };
}

// POST /api/calendar/smart-memo
router.post('/smart-memo', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { memoText, baseDate, mentions = [] } = req.body;

    if (!memoText || !baseDate) {
      return res.status(400).json({ error: 'memoText and baseDate are required' });
    }

    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1 AND tenant_id = $2',
      [req.user.id, tenantId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    const employeeId = empResult.rows[0].id;

    // Validate mentions - ensure all are in same organization
    if (mentions.length > 0) {
      const mentionedEmployeeIds = mentions.map(m => m.employee_id);
      const validationResult = await query(
        `SELECT id, tenant_id FROM employees WHERE id = ANY($1::uuid[])`,
        [mentionedEmployeeIds]
      );
      
      const invalidMentions = validationResult.rows.filter(
        row => row.tenant_id.toString() !== tenantId.toString()
      );
      
      if (invalidMentions.length > 0) {
        return res.status(403).json({ 
          error: 'All mentioned employees must be in the same organization' 
        });
      }
    }

    // Parse memo
    const baseDateObj = new Date(baseDate);
    const { cleanedText, reminders } = extractReminders(memoText, new Date());
    const entries = parseSmartMemo(cleanedText, baseDateObj);

    if (entries.length === 0 && reminders.length === 0) {
      return res.status(400).json({ error: 'No valid entries or reminders found in memo' });
    }

    // Ensure tables exist
    await query(`
      CREATE TABLE IF NOT EXISTS personal_calendar_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        event_date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        source_memo_text TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      
      CREATE TABLE IF NOT EXISTS reminders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
        remind_at TIMESTAMPTZ NOT NULL,
        message TEXT,
        source_memo_text TEXT,
        is_read BOOLEAN NOT NULL DEFAULT false,
        is_dismissed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      
      CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON reminders(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
      CREATE INDEX IF NOT EXISTS idx_reminders_unread ON reminders(user_id, is_read, is_dismissed) WHERE is_read = false AND is_dismissed = false;
    `);

    // Add source_memo_text column if it doesn't exist
    try {
      await query(`
        ALTER TABLE personal_calendar_events
        ADD COLUMN IF NOT EXISTS source_memo_text TEXT
      `);
    } catch (err) {
      // Column might already exist
    }

    const createdEvents = [];
    const createdReminders = [];

    // Ensure team_schedule_events table exists and has RLS enabled
    // Note: Table creation doesn't need RLS context, but we'll set it up
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS team_schedule_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
          employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
          title TEXT NOT NULL,
          event_type TEXT NOT NULL DEFAULT 'event',
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          start_time TIME,
          end_time TIME,
          notes TEXT,
          created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        
        CREATE INDEX IF NOT EXISTS idx_team_schedule_events_tenant ON team_schedule_events(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_team_schedule_events_team ON team_schedule_events(team_id);
        CREATE INDEX IF NOT EXISTS idx_team_schedule_events_employee ON team_schedule_events(employee_id);
        CREATE INDEX IF NOT EXISTS idx_team_schedule_events_date ON team_schedule_events(start_date, end_date);
      `);
      
      // Enable RLS
      await query(`ALTER TABLE team_schedule_events ENABLE ROW LEVEL SECURITY`);
      
      // Drop existing policies if they exist
      await query(`DROP POLICY IF EXISTS org_isolation_team_schedule_events ON team_schedule_events`);
      await query(`DROP POLICY IF EXISTS team_schedule_events_select ON team_schedule_events`);
      await query(`DROP POLICY IF EXISTS team_schedule_events_insert ON team_schedule_events`);
      await query(`DROP POLICY IF EXISTS team_schedule_events_update ON team_schedule_events`);
      await query(`DROP POLICY IF EXISTS team_schedule_events_delete ON team_schedule_events`);
      
      // RLS Policy: Users can select events from their tenant
      await query(`
        CREATE POLICY team_schedule_events_select ON team_schedule_events
        FOR SELECT
        USING (tenant_id = current_setting('app.org_id', true)::uuid)
      `);
      
      // RLS Policy: Users can insert events in their tenant
      await query(`
        CREATE POLICY team_schedule_events_insert ON team_schedule_events
        FOR INSERT
        WITH CHECK (tenant_id = current_setting('app.org_id', true)::uuid)
      `);
      
      // RLS Policy: Users can update events in their tenant
      await query(`
        CREATE POLICY team_schedule_events_update ON team_schedule_events
        FOR UPDATE
        USING (tenant_id = current_setting('app.org_id', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.org_id', true)::uuid)
      `);
      
      // RLS Policy: Users can delete events in their tenant
      await query(`
        CREATE POLICY team_schedule_events_delete ON team_schedule_events
        FOR DELETE
        USING (tenant_id = current_setting('app.org_id', true)::uuid)
      `);
    } catch (err) {
      // Table or policies might already exist, that's okay
      console.warn('Error setting up team_schedule_events table/RLS:', err.message);
    }

    // Ensure smart_memos and memo_mentions tables exist
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS smart_memos (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          memo_text TEXT NOT NULL,
          base_date DATE NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        
        CREATE TABLE IF NOT EXISTS memo_mentions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          memo_id UUID NOT NULL REFERENCES smart_memos(id) ON DELETE CASCADE,
          tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          mentioned_employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
          mentioned_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
          mention_text TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        
        CREATE INDEX IF NOT EXISTS idx_smart_memos_tenant ON smart_memos(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_smart_memos_employee ON smart_memos(employee_id);
        CREATE INDEX IF NOT EXISTS idx_memo_mentions_memo ON memo_mentions(memo_id);
        CREATE INDEX IF NOT EXISTS idx_memo_mentions_employee ON memo_mentions(mentioned_employee_id);
        
        ALTER TABLE team_schedule_events
          ADD COLUMN IF NOT EXISTS is_shared BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS shared_with_employee_ids UUID[],
          ADD COLUMN IF NOT EXISTS memo_id UUID REFERENCES smart_memos(id) ON DELETE SET NULL;
      `);
    } catch (err) {
      console.warn('Error ensuring smart_memos tables:', err.message);
    }

    // Store memo
    const memoResult = await query(
      `INSERT INTO smart_memos (tenant_id, employee_id, user_id, memo_text, base_date)
       VALUES ($1, $2, $3, $4, $5::date)
       RETURNING id`,
      [tenantId, employeeId, req.user.id, memoText, baseDate]
    );
    const memoId = memoResult.rows[0].id;

    // Store mentions
    const mentionedEmployeeIds = [];
    for (const mention of mentions) {
      await query(
        `INSERT INTO memo_mentions (memo_id, tenant_id, mentioned_employee_id, mentioned_user_id, mention_text)
         VALUES ($1, $2, $3, $4, $5)`,
        [memoId, tenantId, mention.employee_id, mention.user_id, mention.mention_text]
      );
      mentionedEmployeeIds.push(mention.employee_id);
    }

    // Insert calendar events into team_schedule_events (team calendar)
    for (const entry of entries) {
      const eventDate = entry.startDateTime.toISOString().split('T')[0];
      const startTime = `${String(entry.startDateTime.getHours()).padStart(2, '0')}:${String(entry.startDateTime.getMinutes()).padStart(2, '0')}:00`;
      const endTime = `${String(entry.endDateTime.getHours()).padStart(2, '0')}:${String(entry.endDateTime.getMinutes()).padStart(2, '0')}:00`;

      // Check for overlapping events for creator
      const overlapCheck = await query(
        `SELECT id FROM team_schedule_events
         WHERE tenant_id = $1
           AND employee_id = $2
           AND start_date = $3::date
           AND (
             (start_time <= $4::time AND end_time > $4::time)
             OR (start_time < $5::time AND end_time >= $5::time)
             OR (start_time >= $4::time AND end_time <= $5::time)
           )`,
        [tenantId, employeeId, eventDate, startTime, endTime]
      );

      if (overlapCheck.rows.length > 0) {
        console.warn(`Skipping overlapping event for creator: ${entry.title}`);
        continue;
      }

      // Create event for creator
      const result = await queryWithOrg(
        `INSERT INTO team_schedule_events (
          tenant_id, employee_id, title, event_type, start_date, end_date, start_time, end_time, notes, created_by,
          is_shared, shared_with_employee_ids, memo_id
        ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::time, $8::time, $9, $10, $11, $12, $13)
        RETURNING *`,
        [
          tenantId,
          employeeId,
          entry.title,
          'event',
          eventDate,
          eventDate,
          startTime,
          endTime,
          entry.sourceText || null,
          req.user.id,
          mentions.length > 0, // is_shared
          mentionedEmployeeIds.length > 0 ? mentionedEmployeeIds : null, // shared_with_employee_ids
          memoId
        ],
        tenantId
      );

      createdEvents.push(result.rows[0]);

      // Create shared events for mentioned users
      for (const mentionedEmployeeId of mentionedEmployeeIds) {
        // Check for overlapping events for mentioned user
        const mentionedOverlapCheck = await query(
          `SELECT id FROM team_schedule_events
           WHERE tenant_id = $1
             AND employee_id = $2
             AND start_date = $3::date
             AND (
               (start_time <= $4::time AND end_time > $4::time)
               OR (start_time < $5::time AND end_time >= $5::time)
               OR (start_time >= $4::time AND end_time <= $5::time)
             )`,
          [tenantId, mentionedEmployeeId, eventDate, startTime, endTime]
        );

        if (mentionedOverlapCheck.rows.length > 0) {
          console.warn(`Skipping overlapping event for mentioned user ${mentionedEmployeeId}: ${entry.title}`);
          continue;
        }

        // Create shared event for mentioned user
        await queryWithOrg(
          `INSERT INTO team_schedule_events (
            tenant_id, employee_id, title, event_type, start_date, end_date, start_time, end_time, notes, created_by,
            is_shared, shared_with_employee_ids, memo_id
          ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::time, $8::time, $9, $10, $11, $12, $13)
          RETURNING *`,
          [
            tenantId,
            mentionedEmployeeId,
            entry.title,
            'event',
            eventDate,
            eventDate,
            startTime,
            endTime,
            entry.sourceText || null,
            req.user.id,
            true, // is_shared
            [employeeId, ...mentionedEmployeeIds.filter(id => id !== mentionedEmployeeId)], // shared_with_employee_ids
            memoId
          ],
          tenantId
        );
      }
    }

    // Insert reminders
    for (const reminder of reminders) {
      const result = await query(
        `INSERT INTO reminders (
          tenant_id, user_id, employee_id, remind_at, message, source_memo_text
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          tenantId,
          req.user.id,
          employeeId,
          reminder.remindAt.toISOString(),
          `Reminder from memo: ${reminder.rawText}`,
          reminder.rawText
        ]
      );

      createdReminders.push(result.rows[0]);
    }

    res.json({
      success: true,
      events: createdEvents,
      reminders: createdReminders,
      memo_id: memoId
    });
  } catch (error) {
    console.error('Error processing smart memo:', error);
    res.status(500).json({ error: error.message || 'Failed to process smart memo' });
  }
});

/**
 * POST /api/calendar/smart-memo/ai-infer
 * AI-powered intent inference - returns draft actions without saving
 */
router.post('/smart-memo/ai-infer', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { memoText, currentPage, currentEntityId, currentEntityType, currentEntityName } = req.body;

    if (!memoText || !memoText.trim()) {
      return res.status(400).json({ error: 'memoText is required' });
    }

    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get user role from JWT (preferred) and fall back to 'employee' if missing.
    // We used to read this from profiles.role, but that column does not exist in some schemas.
    const userRole = (req.user.role || 'employee').toLowerCase();

    // Build context for AI inference
    const context = {
      userId: req.user.id,
      userRole,
      tenantId,
      currentPage: currentPage || 'dashboard',
      currentEntityId,
      currentEntityType,
      currentEntityName,
    };

    // Infer intents using AI
    const draftAction = await inferSmartMemoIntents(memoText, context);

    res.json(draftAction);
  } catch (error) {
    console.error('Error in AI intent inference:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to infer intents',
      fallback: true 
    });
  }
});

/**
 * POST /api/calendar/smart-memo/ai-execute
 * Execute confirmed draft actions (create calendar events, reminders, notes)
 */
router.post('/smart-memo/ai-execute', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { draftActionId, confirmedActions } = req.body;

    if (!confirmedActions || !Array.isArray(confirmedActions) || confirmedActions.length === 0) {
      return res.status(400).json({ error: 'confirmedActions array is required' });
    }

    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get employee ID
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1 AND tenant_id = $2',
      [req.user.id, tenantId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    const employeeId = empResult.rows[0].id;
    const results = {
      calendarEvents: [],
      reminders: [],
      notes: [],
      errors: [],
    };

    // Process each confirmed action
    for (const action of confirmedActions) {
      try {
        if (action.type === 'calendar_event') {
          const event = await createCalendarEvent(action, employeeId, tenantId, req.user.id);
          results.calendarEvents.push(event);
        } else if (action.type === 'reminder') {
          // Validate reminder action has required fields
          if (!action.reminderTime) {
            throw new Error('Reminder action missing reminderTime');
          }
          if (!action.message && !action.title) {
            throw new Error('Reminder action missing message or title');
          }
          const reminder = await createReminder(action, employeeId, tenantId, req.user.id);
          results.reminders.push(reminder);
        } else if (action.type === 'note') {
          const note = await createNote(action, employeeId, tenantId, req.user.id);
          results.notes.push(note);
        }
      } catch (error) {
        console.error(`Error creating ${action.type}:`, error);
        results.errors.push({
          type: action.type,
          error: error.message,
        });
      }
    }

    // Log audit entry
    try {
      const { audit } = await import('../utils/auditLog.js');
      await audit({
        actorId: req.user.id,
        action: 'smart_memo_execute',
        entityType: 'smart_memo',
        entityId: draftActionId || 'batch',
        details: {
          actionsCount: confirmedActions.length,
          actionTypes: confirmedActions.map(a => a.type),
          results: {
            calendarEvents: results.calendarEvents.length,
            reminders: results.reminders.length,
            notes: results.notes.length,
            errors: results.errors.length,
          },
        },
      });
    } catch (auditError) {
      console.error('Error logging audit event:', auditError);
      // Don't fail the request if audit logging fails
    }

    res.json({
      success: true,
      results,
      summary: {
        calendarEvents: results.calendarEvents.length,
        reminders: results.reminders.length,
        notes: results.notes.length,
        errors: results.errors.length,
      },
    });
  } catch (error) {
    console.error('Error executing smart memo actions:', error);
    res.status(500).json({ error: error.message || 'Failed to execute actions' });
  }
});

/**
 * Helper: Create calendar event from action
 */
async function createCalendarEvent(action, employeeId, tenantId, userId) {
  const { title, startDateTime, duration, participants = [], linkedEntityId, description } = action;
  
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + (duration || 30) * 60 * 1000);

  // Ensure team_schedule_events table exists
  await query(`
    CREATE TABLE IF NOT EXISTS team_schedule_events (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      description TEXT,
      linked_entity_type TEXT,
      linked_entity_id UUID,
      created_at TIMESTAMPTZ DEFAULT now(),
      created_by UUID REFERENCES profiles(id)
    )
  `);

  const result = await query(
    `INSERT INTO team_schedule_events 
     (tenant_id, employee_id, title, start_time, end_time, description, linked_entity_type, linked_entity_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, title, start_time, end_time`,
    [
      tenantId,
      employeeId,
      title,
      startDate,
      endDate,
      description || null,
      action.linkedEntity || null,
      linkedEntityId || null,
      userId,
    ]
  );

  return result.rows[0];
}

/**
 * Helper: Create reminder from action
 */
async function createReminder(action, employeeId, tenantId, userId) {
  const { reminderTime, message, title, linkedEntityId } = action;
  
  // Ensure reminders table exists with correct schema
  await query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
      remind_at TIMESTAMPTZ NOT NULL,
      message TEXT,
      source_memo_text TEXT,
      is_read BOOLEAN NOT NULL DEFAULT false,
      is_dismissed BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Create indexes if they don't exist
  await query(`
    CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON reminders(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_reminders_remind_at ON reminders(remind_at);
    CREATE INDEX IF NOT EXISTS idx_reminders_unread ON reminders(user_id, is_read, is_dismissed) WHERE is_read = false AND is_dismissed = false;
  `).catch(() => {
    // Indexes might already exist, ignore error
  });

  const remindAt = new Date(reminderTime);
  if (isNaN(remindAt.getTime())) {
    throw new Error(`Invalid reminder time: ${reminderTime}`);
  }

  // Use message or title, fallback to a default message
  const reminderMessage = message || title || 'Reminder from Smart Memo';

  const result = await query(
    `INSERT INTO reminders 
     (tenant_id, user_id, employee_id, remind_at, message, source_memo_text)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, message, remind_at, created_at`,
    [
      tenantId,
      userId,
      employeeId,
      remindAt.toISOString(),
      reminderMessage,
      action.content || action.message || action.title || 'Smart Memo reminder',
    ]
  );

  if (!result.rows || result.rows.length === 0) {
    throw new Error('Failed to create reminder - no row returned');
  }

  return result.rows[0];
}

/**
 * Helper: Create note from action
 */
async function createNote(action, employeeId, tenantId, userId) {
  const { title, content, linkedEntityId } = action;
  
  // Ensure notes table exists (or use existing document/notes system)
  await query(`
    CREATE TABLE IF NOT EXISTS smart_memo_notes (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL,
      employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      linked_entity_type TEXT,
      linked_entity_id UUID,
      created_at TIMESTAMPTZ DEFAULT now(),
      created_by UUID REFERENCES profiles(id)
    )
  `);

  const result = await query(
    `INSERT INTO smart_memo_notes 
     (tenant_id, employee_id, title, content, linked_entity_type, linked_entity_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, title, content, created_at`,
    [
      tenantId,
      employeeId,
      title || 'Note',
      content || '',
      action.linkedEntity || null,
      linkedEntityId || null,
      userId,
    ]
  );

  return result.rows[0];
}

export default router;

