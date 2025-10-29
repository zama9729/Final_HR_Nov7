import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get organization by user
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].tenant_id) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const orgResult = await query(
      'SELECT id, name, logo_url FROM organizations WHERE id = $1',
      [profileResult.rows[0].tenant_id]
    );

    if (orgResult.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json(orgResult.rows[0]);
  } catch (error) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

