import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

// Get current user profile
router.get('/me', async (req, res) => {
  try {
    const result = await query(
      `SELECT p.*, ur.role
       FROM profiles p
       LEFT JOIN user_roles ur ON ur.user_id = p.id
       WHERE p.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

