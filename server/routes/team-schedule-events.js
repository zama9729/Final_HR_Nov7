import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// Helper: resolve tenant/org for current user
async function getTenantIdForUser(userId) {
  const res = await query(
    'SELECT tenant_id FROM profiles WHERE id = $1',
    [userId],
  );
  return res.rows[0]?.tenant_id || null;
}

// GET /api/team-schedule/events?team_id&start_date&end_date
router.get('/', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { team_id, start_date, end_date } = req.query;
    const params = [tenantId];
    let where = 'WHERE tenant_id = $1';
    let idx = 1;

    if (team_id && team_id !== 'all') {
      where += ` AND (team_id = $${++idx} OR team_id IS NULL)`;
      params.push(team_id);
    }

    if (start_date) {
      where += ` AND end_date >= $${++idx}::date`;
      params.push(start_date);
    }
    if (end_date) {
      where += ` AND start_date <= $${++idx}::date`;
      params.push(end_date);
    }

    const result = await query(
      `SELECT *
       FROM team_schedule_events
       ${where}
       ORDER BY start_date ASC, COALESCE(start_time, '00:00'::time) ASC`,
      params,
    );

    res.json({ events: result.rows });
  } catch (error) {
    console.error('Error fetching team schedule events:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch events' });
  }
});

// POST /api/team-schedule/events
router.post(
  '/',
  authenticateToken,
  setTenantContext,
  requireRole('manager', 'hr', 'director', 'ceo', 'admin'),
  async (req, res) => {
    try {
      const tenantId = await getTenantIdForUser(req.user.id);
      if (!tenantId) {
        return res.status(403).json({ error: 'No organization found' });
      }

      const {
        team_id,
        employee_id,
        title,
        event_type = 'event',
        start_date,
        end_date,
        start_time,
        end_time,
        notes,
      } = req.body || {};

      if (!title || !start_date || !end_date) {
        return res
          .status(400)
          .json({ error: 'title, start_date and end_date are required' });
      }

      const result = await query(
        `INSERT INTO team_schedule_events (
           tenant_id, team_id, employee_id, title, event_type,
           start_date, end_date, start_time, end_time, notes, created_by
         ) VALUES (
           $1, $2, $3, $4, $5,
           $6::date, $7::date, $8::time, $9::time, $10, $11
         )
         RETURNING *`,
        [
          tenantId,
          team_id || null,
          employee_id || null,
          title,
          String(event_type || 'event'),
          start_date,
          end_date,
          start_time || null,
          end_time || null,
          notes || null,
          req.user.id,
        ],
      );

      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Error creating team schedule event:', error);
      res.status(500).json({ error: error.message || 'Failed to create event' });
    }
  },
);

export default router;



