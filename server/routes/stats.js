import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get pending counts
router.get('/pending-counts', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.json({ timesheets: 0, leaves: 0 });
    }

    // Count pending timesheets
    const timesheetResult = await query(
      'SELECT COUNT(*) as count FROM timesheets WHERE status = $1 AND tenant_id = $2',
      ['pending', tenantId]
    );

    // Count pending leave requests
    const leaveResult = await query(
      'SELECT COUNT(*) as count FROM leave_requests WHERE status = $1 AND tenant_id = $2',
      ['pending', tenantId]
    );

    res.json({
      timesheets: parseInt(timesheetResult.rows[0]?.count || '0'),
      leaves: parseInt(leaveResult.rows[0]?.count || '0'),
    });
  } catch (error) {
    console.error('Error fetching pending counts:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

