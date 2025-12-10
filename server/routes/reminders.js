import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { getTenantIdForUser } from '../utils/tenant.js';

const router = express.Router();

// GET /api/reminders/active - Get active (unread, not dismissed) reminders for current user
router.get('/active', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const now = new Date().toISOString();

    // Get active reminders that haven't been triggered yet (remind_at > now)
    // and haven't been read or dismissed
    const result = await query(
      `SELECT id, remind_at, message, source_memo_text, created_at
       FROM reminders
       WHERE user_id = $1
         AND tenant_id = $2
         AND remind_at > $3
         AND is_read = false
         AND is_dismissed = false
       ORDER BY remind_at ASC
       LIMIT 10`,
      [req.user.id, tenantId, now]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching active reminders:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch reminders' });
  }
});

// POST /api/reminders/:id/cancel - Cancel/dismiss a reminder
router.post('/:id/cancel', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Mark reminder as dismissed
    const result = await query(
      `UPDATE reminders
       SET is_dismissed = true, updated_at = now()
       WHERE id = $1
         AND user_id = $2
         AND tenant_id = $3
         AND is_dismissed = false
       RETURNING id`,
      [id, req.user.id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Reminder not found or already dismissed' });
    }

    res.json({ success: true, message: 'Reminder cancelled' });
  } catch (error) {
    console.error('Error cancelling reminder:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel reminder' });
  }
});

export default router;

