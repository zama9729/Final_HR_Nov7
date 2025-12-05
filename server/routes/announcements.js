import express from 'express';
import { query, createPool } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Ensure announcements table exists
let ensureAnnouncementsPromise = null;
const ensureAnnouncementsTable = async () => {
  if (ensureAnnouncementsPromise) return ensureAnnouncementsPromise;
  ensureAnnouncementsPromise = (async () => {
    try {
      await createPool();
      await query(`
        CREATE TABLE IF NOT EXISTS announcements (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          title TEXT NOT NULL,
          body TEXT NOT NULL,
          priority TEXT NOT NULL DEFAULT 'normal',
          pinned BOOLEAN NOT NULL DEFAULT FALSE,
          created_by UUID REFERENCES profiles(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_announcements_org ON announcements(org_id);
        CREATE INDEX IF NOT EXISTS idx_announcements_created ON announcements(created_at);
      `);
    } catch (err) {
      console.error('Error ensuring announcements table:', err);
    }
  })();
  return ensureAnnouncementsPromise;
};

// Helper: resolve tenant/org for current user
async function getTenantIdForUser(userId) {
  const res = await query(
    'SELECT tenant_id FROM profiles WHERE id = $1',
    [userId]
  );
  return res.rows[0]?.tenant_id || null;
}

// List announcements for current org (optionally limited)
router.get('/', authenticateToken, async (req, res) => {
  try {
    await ensureAnnouncementsTable();
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const limit = Math.min(Number(req.query.limit || 5), 20);

    const result = await query(
      `SELECT id, title, body, priority, pinned, created_by, created_at, updated_at
       FROM announcements
       WHERE org_id = $1
       ORDER BY pinned DESC, created_at DESC
       LIMIT $2`,
      [tenantId, limit]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch announcements' });
  }
});

// Create announcement (HR / CEO / Admin only)
router.post('/', authenticateToken, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureAnnouncementsTable();
    const tenantId = await getTenantIdForUser(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { title, body, priority = 'normal', pinned = false } = req.body || {};
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    const prio = String(priority).toLowerCase();
    if (!['normal', 'urgent'].includes(prio)) {
      return res.status(400).json({ error: 'priority must be normal or urgent' });
    }

    const result = await query(
      `INSERT INTO announcements (org_id, title, body, priority, pinned, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, title, body, priority, pinned, created_by, created_at, updated_at`,
      [tenantId, title, body, prio, !!pinned, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ error: error.message || 'Failed to create announcement' });
  }
});

export default router;



