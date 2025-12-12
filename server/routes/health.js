import express from 'express';
import { query } from '../db/pool.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err?.message || 'unhealthy' });
  }
});

export default router;

