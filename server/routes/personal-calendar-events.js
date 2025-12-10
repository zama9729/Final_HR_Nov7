import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getTenantIdForUser } from '../utils/tenant.js';

const router = express.Router();

// Ensure personal_calendar_events table exists
router.use(async (req, res, next) => {
  try {
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
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_tenant ON personal_calendar_events(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_employee ON personal_calendar_events(employee_id);
      CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_user ON personal_calendar_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_date ON personal_calendar_events(event_date);
    `);
  } catch (error) {
    console.warn('Error ensuring personal_calendar_events table:', error.message);
  }
  next();
});

// GET /api/personal-calendar-events - Get personal events for current user
router.get('/', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get employee ID for current user
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1 AND tenant_id = $2',
      [req.user.id, tenantId]
    );

    if (empResult.rows.length === 0) {
      return res.json({ events: [] });
    }

    const employeeId = empResult.rows[0].id;
    const { start_date, end_date } = req.query;

    let queryStr = `
      SELECT id, title, description, event_date, start_time, end_time, created_at, updated_at
      FROM personal_calendar_events
      WHERE employee_id = $1 AND tenant_id = $2
    `;
    const params = [employeeId, tenantId];

    if (start_date) {
      queryStr += ` AND event_date >= $${params.length + 1}::date`;
      params.push(start_date);
    }
    if (end_date) {
      queryStr += ` AND event_date <= $${params.length + 1}::date`;
      params.push(end_date);
    }

    queryStr += ' ORDER BY event_date, start_time NULLS LAST';

    const result = await query(queryStr, params);
    res.json({ events: result.rows });
  } catch (error) {
    console.error('Error fetching personal calendar events:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch personal calendar events' });
  }
});

// POST /api/personal-calendar-events - Create personal event
router.post('/', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { title, description, event_date, start_time, end_time } = req.body;

    if (!title || !event_date) {
      return res.status(400).json({ error: 'title and event_date are required' });
    }

    // Get employee ID for current user
    const empResult = await query(
      'SELECT id FROM employees WHERE user_id = $1 AND tenant_id = $2',
      [req.user.id, tenantId]
    );

    if (empResult.rows.length === 0) {
      return res.status(404).json({ error: 'Employee record not found' });
    }

    const employeeId = empResult.rows[0].id;

    // Ensure table exists before inserting
    try {
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
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_tenant ON personal_calendar_events(tenant_id);
        CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_employee ON personal_calendar_events(employee_id);
        CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_user ON personal_calendar_events(user_id);
        CREATE INDEX IF NOT EXISTS idx_personal_calendar_events_date ON personal_calendar_events(event_date);
      `);
    } catch (createError) {
      // Table might already exist
      console.warn('Error ensuring personal_calendar_events table:', createError.message);
    }

    const result = await query(
      `INSERT INTO personal_calendar_events (
        tenant_id, employee_id, user_id, title, description, event_date, start_time, end_time
      ) VALUES ($1, $2, $3, $4, $5, $6::date, $7::time, $8::time)
      RETURNING *`,
      [tenantId, employeeId, req.user.id, title, description || null, event_date, start_time || null, end_time || null]
    );

    console.log(`Created personal calendar event: ${result.rows[0].id} for employee ${employeeId} on ${event_date}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating personal calendar event:', error);
    res.status(500).json({ error: error.message || 'Failed to create personal calendar event' });
  }
});

// DELETE /api/personal-calendar-events/:id - Delete personal event
router.delete('/:id', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;

    // Verify the event belongs to the current user
    const result = await query(
      `DELETE FROM personal_calendar_events
       WHERE id = $1 AND user_id = $2 AND tenant_id = $3
       RETURNING *`,
      [id, req.user.id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Event not found or unauthorized' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting personal calendar event:', error);
    res.status(500).json({ error: error.message || 'Failed to delete personal calendar event' });
  }
});

export default router;

