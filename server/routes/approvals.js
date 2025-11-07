import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { create_approval, next_approver, apply_approval } from '../approval_flow.js';
import { query } from '../db/pool.js';

const router = express.Router();

// Create an approval request for a resource
router.post('/create', authenticateToken, async (req, res) => {
  try {
    const { request_type, amount_or_days, resource_id } = req.body;
    if (!request_type || !resource_id) return res.status(400).json({ error: 'Missing fields' });
    await create_approval(request_type, amount_or_days, req.user.id, resource_id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Who is next to approve
router.get('/next', authenticateToken, async (req, res) => {
  const { resource_type, resource_id } = req.query;
  if (!resource_type || !resource_id) return res.status(400).json({ error: 'Missing fields' });
  const info = await next_approver(resource_type, resource_id);
  res.json(info);
});

// Apply approval/rejection
router.post('/apply', authenticateToken, async (req, res) => {
  const { resource_type, resource_id, action, comment } = req.body;
  if (!resource_type || !resource_id || !action) return res.status(400).json({ error: 'Missing fields' });

  // Resolve employee id for approver based on user id
  const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
  const approverEmployeeId = empRes.rows[0]?.id;
  if (!approverEmployeeId) return res.status(403).json({ error: 'Employee record not found' });

  try {
    const result = await apply_approval(resource_type, resource_id, approverEmployeeId, action, comment);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

export default router;


