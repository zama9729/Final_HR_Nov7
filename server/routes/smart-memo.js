import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getTenantIdForUser } from '../utils/tenant.js';

const router = express.Router();

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
    const { memoText, baseDate } = req.body;

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

    // Insert calendar events into team_schedule_events (team calendar)
    for (const entry of entries) {
      const eventDate = entry.startDateTime.toISOString().split('T')[0];
      const startTime = `${String(entry.startDateTime.getHours()).padStart(2, '0')}:${String(entry.startDateTime.getMinutes()).padStart(2, '0')}:00`;
      const endTime = `${String(entry.endDateTime.getHours()).padStart(2, '0')}:${String(entry.endDateTime.getMinutes()).padStart(2, '0')}:00`;

      // Store in team_schedule_events with employee_id set to current user's employee
      // This makes it visible in team calendar but associated with the creator
      // Use queryWithOrg to ensure RLS policies are applied
      const result = await queryWithOrg(
        `INSERT INTO team_schedule_events (
          tenant_id, employee_id, title, event_type, start_date, end_date, start_time, end_time, notes, created_by
        ) VALUES ($1, $2, $3, $4, $5::date, $6::date, $7::time, $8::time, $9, $10)
        RETURNING *`,
        [
          tenantId,
          employeeId, // Associate with employee who created it
          entry.title,
          'event', // Default event type
          eventDate, // start_date
          eventDate, // end_date (same day for single-day events)
          startTime,
          endTime,
          entry.sourceText || null, // Store source memo text in notes
          req.user.id // created_by
        ],
        tenantId // Pass orgId for RLS
      );

      createdEvents.push(result.rows[0]);
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
      reminders: createdReminders
    });
  } catch (error) {
    console.error('Error processing smart memo:', error);
    res.status(500).json({ error: error.message || 'Failed to process smart memo' });
  }
});

export default router;

