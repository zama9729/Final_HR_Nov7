import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get current user profile
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // Get profile
    const profileResult = await query(
      `SELECT p.* FROM profiles p WHERE p.id = $1`,
      [req.user.id]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const profile = profileResult.rows[0];

    // Get all user roles first to debug
    const allRolesResult = await query(
      `SELECT role FROM user_roles WHERE user_id = $1 ORDER BY role`,
      [req.user.id]
    );
    
    const allRoles = allRolesResult.rows.map(r => r.role);
    
    // Get highest priority role (same logic as get_user_role function)
    const roleResult = await query(
      `SELECT role FROM user_roles WHERE user_id = $1
       ORDER BY CASE role
         WHEN 'admin' THEN 0
         WHEN 'ceo' THEN 1
         WHEN 'director' THEN 2
         WHEN 'hr' THEN 3
         WHEN 'manager' THEN 4
         WHEN 'employee' THEN 5
       END
       LIMIT 1`,
      [req.user.id]
    );

    // Check if user has direct reports and should have manager role
    const hasDirectReports = await query(
      `SELECT COUNT(*) as count FROM employees 
       WHERE reporting_manager_id IN (
         SELECT id FROM employees WHERE user_id = $1
       )`,
      [req.user.id]
    );

    const directReportsCount = parseInt(hasDirectReports.rows[0]?.count || '0');

    let role = roleResult.rows[0]?.role || 'employee';
    
    // Log if user has multiple roles to help debug
    if (allRoles.length > 1) {
      console.log(`User ${req.user.id} has multiple roles: ${allRoles.join(', ')}. Using: ${role}`);
    }

    // If user has direct reports but doesn't have manager role, auto-assign it
    if (directReportsCount > 0 && role !== 'manager' && !['admin', 'ceo', 'director', 'hr'].includes(role)) {
      // Check if manager role already exists
      const existingManagerRole = await query(
        `SELECT id FROM user_roles WHERE user_id = $1 AND role = 'manager'`,
        [req.user.id]
      );

      if (existingManagerRole.rows.length === 0) {
        // Add manager role
        await query(
          `INSERT INTO user_roles (user_id, role, tenant_id)
           VALUES ($1, 'manager', $2)
           ON CONFLICT (user_id, role) DO NOTHING`,
          [req.user.id, profile.tenant_id]
        );
        role = 'manager';
      }
    }

    res.json({
      ...profile,
      role
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update presence status
router.post('/me/presence', authenticateToken, async (req, res) => {
  try {
    const { presence_status } = req.body;
    
    // Validate presence status
    if (!['online', 'away', 'out_of_office', 'break'].includes(presence_status)) {
      return res.status(400).json({ error: 'Invalid presence status' });
    }

    // Check if employee exists
    const empCheck = await query(
      `SELECT id FROM employees WHERE user_id = $1`,
      [req.user.id]
    );

    // If employee doesn't exist, return success with default (for admin/CEO who haven't created employee record)
    if (empCheck.rows.length === 0) {
      return res.json({
        presence_status: presence_status,
        has_active_leave: false
      });
    }

    // Check for active approved leave
    const leaveCheck = await query(
      `SELECT has_active_approved_leave(e.id) as has_active_leave
       FROM employees e
       WHERE e.user_id = $1`,
      [req.user.id]
    );

    // If employee has active approved leave, append "but available"
    let effectiveStatus = presence_status;
    if (leaveCheck.rows.length > 0 && leaveCheck.rows[0].has_active_leave) {
      effectiveStatus = 'out_of_office'; // Force out_of_office if on leave
    }

    // Update presence status
    await query(
      `UPDATE employees 
       SET presence_status = $1, last_presence_update = now()
       WHERE user_id = $2`,
      [effectiveStatus, req.user.id]
    );

    res.json({ 
      presence_status: effectiveStatus,
      has_active_leave: leaveCheck.rows[0]?.has_active_leave || false
    });
  } catch (error) {
    console.error('Error updating presence status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user's presence status
router.get('/me/presence', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      `SELECT 
        e.presence_status, 
        e.last_presence_update,
        has_active_approved_leave(e.id) as has_active_leave
       FROM employees e
       WHERE e.user_id = $1`,
      [req.user.id]
    );

    // If employee not found, return default presence status (for admin/CEO who haven't created employee record)
    if (result.rows.length === 0) {
      return res.json({
        presence_status: 'online',
        last_presence_update: null,
        has_active_leave: false
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching presence status:', error);
    // Return default on error instead of failing
    res.json({
      presence_status: 'online',
      last_presence_update: null,
      has_active_leave: false
    });
  }
});

// Update current user's profile (employees can update their own profile)
router.patch('/me', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, email, phone } = req.body;

    // Build update query dynamically
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (firstName !== undefined) {
      updates.push(`first_name = $${paramIndex++}`);
      params.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${paramIndex++}`);
      params.push(lastName);
    }
    if (email !== undefined) {
      // Check if email is already taken by another user
      const emailCheck = await query(
        'SELECT id FROM profiles WHERE email = $1 AND id != $2',
        [email, req.user.id]
      );
      if (emailCheck.rows.length > 0) {
        return res.status(400).json({ error: 'Email already in use' });
      }
      updates.push(`email = $${paramIndex++}`);
      params.push(email);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramIndex++}`);
      params.push(phone);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Add updated_at
    updates.push(`updated_at = now()`);
    params.push(req.user.id);

    const queryStr = `
      UPDATE profiles
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, first_name, last_name, email, phone, tenant_id, created_at, updated_at
    `;

    const result = await query(queryStr, params);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: error.message || 'Failed to update profile' });
  }
});

export default router;

