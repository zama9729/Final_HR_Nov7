import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

// Helper: get tenant for current user
async function getTenantId(userId) {
  const { rows } = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return rows[0]?.tenant_id || null;
}

// Get all probation policies for organization
router.get('/', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { rows } = await query(
      `SELECT 
        pp.*,
        json_build_object(
          'id', pb.id,
          'first_name', pb.first_name,
          'last_name', pb.last_name
        ) as published_by_profile,
        json_build_object(
          'id', cb.id,
          'first_name', cb.first_name,
          'last_name', cb.last_name
        ) as created_by_profile
       FROM probation_policies pp
       LEFT JOIN profiles pb ON pb.id = pp.published_by
       LEFT JOIN profiles cb ON cb.id = pp.created_by
       WHERE pp.tenant_id = $1
       ORDER BY pp.created_at DESC`,
      [tenantId]
    );

    res.json({ policies: rows });
  } catch (error) {
    console.error('Error fetching probation policies:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch probation policies' });
  }
});

// Get active probation policy
router.get('/active', authenticateToken, async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { rows } = await query(
      `SELECT * FROM probation_policies
       WHERE tenant_id = $1 AND status = 'published' AND is_active = true
       ORDER BY published_at DESC
       LIMIT 1`,
      [tenantId]
    );

    res.json({ policy: rows[0] || null });
  } catch (error) {
    console.error('Error fetching active probation policy:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch active policy' });
  }
});

// Create probation policy
router.post('/', authenticateToken, requireRole('hr', 'ceo', 'admin'), async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const {
      name,
      probation_days = 90,
      allowed_leave_days = 0,
      requires_mid_probation_review = false,
      auto_confirm_at_end = false,
      probation_notice_days = 0,
      status = 'draft',
    } = req.body;

    if (!name || !probation_days) {
      return res.status(400).json({ error: 'Name and probation_days are required' });
    }

    const { rows } = await query(
      `INSERT INTO probation_policies (
        tenant_id, name, probation_days, allowed_leave_days,
        requires_mid_probation_review, auto_confirm_at_end,
        probation_notice_days, status, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        tenantId,
        name,
        probation_days,
        allowed_leave_days,
        requires_mid_probation_review,
        auto_confirm_at_end,
        probation_notice_days,
        status,
        req.user.id,
      ]
    );

    res.status(201).json({ policy: rows[0] });
  } catch (error) {
    console.error('Error creating probation policy:', error);
    res.status(500).json({ error: error.message || 'Failed to create policy' });
  }
});

// Update probation policy
router.put('/:id', authenticateToken, requireRole('hr', 'ceo', 'admin'), async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;
    const {
      name,
      probation_days,
      allowed_leave_days,
      requires_mid_probation_review,
      auto_confirm_at_end,
      probation_notice_days,
      status,
      is_active,
    } = req.body;

    // Check if policy exists and belongs to tenant
    const checkResult = await query(
      'SELECT * FROM probation_policies WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    const updateFields = [];
    const updateValues = [];
    let paramCount = 1;

    if (name !== undefined) {
      updateFields.push(`name = $${paramCount++}`);
      updateValues.push(name);
    }
    if (probation_days !== undefined) {
      updateFields.push(`probation_days = $${paramCount++}`);
      updateValues.push(probation_days);
    }
    if (allowed_leave_days !== undefined) {
      updateFields.push(`allowed_leave_days = $${paramCount++}`);
      updateValues.push(allowed_leave_days);
    }
    if (requires_mid_probation_review !== undefined) {
      updateFields.push(`requires_mid_probation_review = $${paramCount++}`);
      updateValues.push(requires_mid_probation_review);
    }
    if (auto_confirm_at_end !== undefined) {
      updateFields.push(`auto_confirm_at_end = $${paramCount++}`);
      updateValues.push(auto_confirm_at_end);
    }
    if (probation_notice_days !== undefined) {
      updateFields.push(`probation_notice_days = $${paramCount++}`);
      updateValues.push(probation_notice_days);
    }
    if (status !== undefined) {
      updateFields.push(`status = $${paramCount++}`);
      updateValues.push(status);
      if (status === 'published') {
        updateFields.push(`published_at = now()`);
        updateFields.push(`published_by = $${paramCount++}`);
        updateValues.push(req.user.id);
      }
    }
    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      updateValues.push(is_active);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateFields.push(`updated_at = now()`);
    updateValues.push(id, tenantId);

    const { rows } = await query(
      `UPDATE probation_policies
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount++} AND tenant_id = $${paramCount++}
       RETURNING *`,
      updateValues
    );

    // If policy is being published, auto-create probation records for employees without probation
    if (status === 'published' && rows[0]) {
      await autoCreateProbationRecords(tenantId, rows[0]);
    }

    res.json({ policy: rows[0] });
  } catch (error) {
    console.error('Error updating probation policy:', error);
    res.status(500).json({ error: error.message || 'Failed to update policy' });
  }
});

// Auto-create probation records for employees without probation when policy is published
async function autoCreateProbationRecords(tenantId, policy) {
  try {
    // Find employees who:
    // 1. Have a join_date
    // 2. Don't have an active probation record
    // 3. Are still in probation period (join_date + probation_days > today)
    const { rows: employees } = await query(
      `SELECT e.id, e.join_date, e.reporting_manager_id
       FROM employees e
       WHERE e.tenant_id = $1
         AND e.join_date IS NOT NULL
         AND e.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM probations p
           WHERE p.employee_id = e.id
             AND p.status IN ('in_probation', 'extended')
         )
         AND (e.join_date + INTERVAL '1 day' * $2) > CURRENT_DATE
       ORDER BY e.join_date DESC`,
      [tenantId, policy.probation_days]
    );

    for (const employee of employees) {
      const startDate = new Date(employee.join_date);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + policy.probation_days);

      const midReview = policy.requires_mid_probation_review
        ? new Date(startDate.getTime() + (policy.probation_days / 2) * 24 * 60 * 60 * 1000)
        : null;

      await query(
        `INSERT INTO probations (
          tenant_id, employee_id, probation_start, probation_end,
          probation_days, allowed_leave_days, status,
          is_eligible_for_perks, requires_mid_probation_review,
          mid_review_date, auto_confirm_at_end, probation_notice_days
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'in_probation', $7, $8, $9, $10, $11)
        ON CONFLICT DO NOTHING`,
        [
          tenantId,
          employee.id,
          startDate,
          endDate,
          policy.probation_days,
          policy.allowed_leave_days,
          true, // is_eligible_for_perks
          policy.requires_mid_probation_review,
          midReview,
          policy.auto_confirm_at_end,
          policy.probation_notice_days,
        ]
      );

      // Update employee record
      await query(
        `UPDATE employees
         SET probation_status = 'in_probation',
             probation_end = $1
         WHERE id = $2`,
        [endDate, employee.id]
      );
    }

    console.log(`Auto-created probation records for ${employees.length} employees`);
  } catch (error) {
    console.error('Error auto-creating probation records:', error);
    // Don't throw - this is a background operation
  }
}

// Delete probation policy
router.delete('/:id', authenticateToken, requireRole('hr', 'ceo', 'admin'), async (req, res) => {
  try {
    const tenantId = await getTenantId(req.user.id);
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { id } = req.params;

    const { rows } = await query(
      `DELETE FROM probation_policies
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting probation policy:', error);
    res.status(500).json({ error: error.message || 'Failed to delete policy' });
  }
});

export default router;

