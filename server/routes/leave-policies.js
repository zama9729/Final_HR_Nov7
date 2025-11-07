import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all leave policies
router.get('/', authenticateToken, async (req, res) => {
  try {
    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tenantId = tenantResult.rows[0].tenant_id;

    // Fetch all active leave policies
    const { rows } = await query(
      `SELECT id, name, leave_type, annual_entitlement, probation_entitlement, 
              carry_forward_allowed, max_carry_forward, encashment_allowed, 
              is_active, created_at, updated_at
       FROM leave_policies
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY created_at DESC`,
      [tenantId]
    );

    res.json(rows);
  } catch (error) {
    console.error('Error fetching leave policies:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create new leave policy
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { 
      name, 
      leave_type, 
      annual_entitlement, 
      probation_entitlement,
      carry_forward_allowed,
      max_carry_forward,
      encashment_allowed 
    } = req.body;

    // Validate required fields
    if (!name || !leave_type || annual_entitlement === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get user's tenant_id
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tenantId = tenantResult.rows[0].tenant_id;

    // Check if user has permission (HR or above)
    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );

    const role = roleResult.rows[0]?.role;
    if (!['hr', 'director', 'ceo'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Insert new policy
    const insertResult = await query(
      `INSERT INTO leave_policies (
        tenant_id, name, leave_type, annual_entitlement, 
        probation_entitlement, carry_forward_allowed, 
        max_carry_forward, encashment_allowed, is_active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        tenantId,
        name,
        leave_type,
        annual_entitlement,
        probation_entitlement || 0,
        carry_forward_allowed || false,
        max_carry_forward || 0,
        encashment_allowed || false,
        true
      ]
    );

    res.status(201).json(insertResult.rows[0]);
  } catch (error) {
    console.error('Error creating leave policy:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update leave policy
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Get user's tenant_id and verify permission
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tenantId = tenantResult.rows[0].tenant_id;

    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );

    const role = roleResult.rows[0]?.role;
    if (!['hr', 'director', 'ceo'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Build update query dynamically
    const fields = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(updates).forEach((key) => {
      fields.push(`${key} = $${paramIndex}`);
      values.push(updates[key]);
      paramIndex++;
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id, tenantId);
    
    const updateQuery = `
      UPDATE leave_policies
      SET ${fields.join(', ')}, updated_at = now()
      WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
      RETURNING *
    `;

    const updateResult = await query(updateQuery, values);

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json(updateResult.rows[0]);
  } catch (error) {
    console.error('Error updating leave policy:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete/deactivate leave policy
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Get user's tenant_id and verify permission
    const tenantResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [req.user.id]
    );

    if (tenantResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const tenantId = tenantResult.rows[0].tenant_id;

    const roleResult = await query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [req.user.id]
    );

    const role = roleResult.rows[0]?.role;
    if (!['hr', 'director', 'ceo'].includes(role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Soft delete by setting is_active = false
    const updateResult = await query(
      `UPDATE leave_policies
       SET is_active = false, updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING *`,
      [id, tenantId]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({ error: 'Policy not found' });
    }

    res.json({ message: 'Policy deactivated successfully' });
  } catch (error) {
    console.error('Error deleting leave policy:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

