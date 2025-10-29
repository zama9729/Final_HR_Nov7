import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get onboarding employees
router.get('/employees', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );
    const tenantId = tenantResult.rows[0]?.tenant_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Get employees with onboarding data
    const result = await query(
      `SELECT 
        e.*,
        json_build_object(
          'first_name', p.first_name,
          'last_name', p.last_name,
          'email', p.email
        ) as profiles,
        od.id as onboarding_data_id,
        od.completed_at,
        od.emergency_contact_name,
        od.address,
        od.city,
        od.state
      FROM employees e
      JOIN profiles p ON p.id = e.user_id
      LEFT JOIN onboarding_data od ON od.employee_id = e.id
      WHERE e.tenant_id = $1
        AND e.onboarding_status IN ('pending', 'in_progress', 'not_started')
      ORDER BY e.created_at DESC`,
      [tenantId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching onboarding employees:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

