import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { queryWithOrg } from '../db/pool.js';
import { invalidateSetupState } from '../services/setup-state.js';

const router = express.Router();

async function ensureSettings(orgId) {
  const result = await queryWithOrg(
    `INSERT INTO org_attendance_settings (org_id)
     VALUES ($1)
     ON CONFLICT (org_id) DO UPDATE SET org_id = org_attendance_settings.org_id
     RETURNING *`,
    [orgId],
    orgId
  );
  return result.rows[0];
}

router.use(authenticateToken);

router.get('/', async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization context missing' });
    }
    const { rows } = await queryWithOrg(
      'SELECT * FROM org_attendance_settings WHERE org_id = $1',
      [orgId],
      orgId
    );
    if (!rows.length) {
      const settings = await ensureSettings(orgId);
      return res.json(settings);
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Failed to fetch attendance settings', error);
    res.status(500).json({ error: error.message || 'Unable to fetch attendance settings' });
  }
});

router.put('/', requireRole('admin', 'hr', 'ceo'), async (req, res) => {
  try {
    const orgId = req.orgId || req.user?.org_id;
    if (!orgId) {
      return res.status(400).json({ error: 'Organization context missing' });
    }

    await ensureSettings(orgId);
    const { capture_method, enable_geofence, enable_kiosk, default_week_start, metadata } = req.body || {};

    const result = await queryWithOrg(
      `UPDATE org_attendance_settings
       SET capture_method = COALESCE($2, capture_method),
           enable_geofence = COALESCE($3, enable_geofence),
           enable_kiosk = COALESCE($4, enable_kiosk),
           default_week_start = COALESCE($5, default_week_start),
           metadata = COALESCE($6::jsonb, metadata),
           updated_by = $7,
           updated_at = now()
       WHERE org_id = $1
       RETURNING *`,
      [
        orgId,
        capture_method,
        enable_geofence,
        enable_kiosk,
        typeof default_week_start === 'number' ? default_week_start : null,
        metadata,
        req.user.id,
      ],
      orgId
    );

    invalidateSetupState(orgId);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Failed to update attendance settings', error);
    res.status(500).json({ error: error.message || 'Unable to update attendance settings' });
  }
});

export default router;

