/**
 * Biometric Device Integration Routes
 * 
 * Manages employee mappings to biometric device user codes
 * and provides endpoints to trigger syncs manually
 */

import express from 'express';
import { query, queryWithOrg } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';
import { runBiometricSync } from '../services/biometric-sync.js';

const router = express.Router();

/**
 * GET /api/biometric/mappings
 * Get all biometric employee mappings for the current organization
 */
router.get('/mappings', authenticateToken, setTenantContext, async (req, res) => {
  try {
    const orgId = req.orgId;
    if (!orgId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { rows } = await queryWithOrg(
      `SELECT 
        bem.id,
        bem.device_user_code,
        bem.employee_id,
        bem.device_id,
        bem.is_active,
        bem.created_at,
        bem.updated_at,
        e.employee_id as employee_code,
        p.first_name,
        p.last_name,
        p.email
       FROM biometric_employee_map bem
       JOIN employees e ON e.id = bem.employee_id
       JOIN profiles p ON p.id = e.user_id
       WHERE bem.tenant_id = $1
       ORDER BY bem.created_at DESC`,
      [orgId],
      orgId
    );

    res.json({ mappings: rows });
  } catch (error) {
    console.error('Error fetching biometric mappings:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch mappings' });
  }
});

/**
 * POST /api/biometric/mappings
 * Create a new biometric employee mapping
 */
router.post('/mappings', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const orgId = req.orgId;
    if (!orgId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { device_user_code, employee_id, device_id } = req.body;

    if (!device_user_code || !employee_id) {
      return res.status(400).json({ error: 'device_user_code and employee_id are required' });
    }

    // Verify employee belongs to tenant
    const empCheck = await queryWithOrg(
      'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2',
      [employee_id, orgId],
      orgId
    );

    if (empCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Employee not found in this organization' });
    }

    // Check for existing mapping
    const existing = await queryWithOrg(
      `SELECT id FROM biometric_employee_map 
       WHERE tenant_id = $1 AND (device_user_code = $2 OR (employee_id = $3 AND device_id = $4))`,
      [orgId, device_user_code, employee_id, device_id || null],
      orgId
    );

    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Mapping already exists for this device code or employee' });
    }

    const { rows } = await queryWithOrg(
      `INSERT INTO biometric_employee_map 
       (tenant_id, device_user_code, employee_id, device_id, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [orgId, device_user_code, employee_id, device_id || null],
      orgId
    );

    res.status(201).json({ mapping: rows[0] });
  } catch (error) {
    console.error('Error creating biometric mapping:', error);
    if (error.code === '23505') { // Unique violation
      return res.status(409).json({ error: 'Mapping already exists' });
    }
    res.status(500).json({ error: error.message || 'Failed to create mapping' });
  }
});

/**
 * PATCH /api/biometric/mappings/:id
 * Update a biometric employee mapping
 */
router.patch('/mappings/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const { id } = req.params;
    const { device_user_code, employee_id, device_id, is_active } = req.body;

    if (!orgId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (device_user_code !== undefined) {
      updates.push(`device_user_code = $${paramIndex++}`);
      values.push(device_user_code);
    }
    if (employee_id !== undefined) {
      // Verify employee belongs to tenant
      const empCheck = await queryWithOrg(
        'SELECT id FROM employees WHERE id = $1 AND tenant_id = $2',
        [employee_id, orgId],
        orgId
      );
      if (empCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Employee not found in this organization' });
      }
      updates.push(`employee_id = $${paramIndex++}`);
      values.push(employee_id);
    }
    if (device_id !== undefined) {
      updates.push(`device_id = $${paramIndex++}`);
      values.push(device_id);
    }
    if (is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id, orgId);
    updates.push(`updated_at = now()`);

    const { rows } = await queryWithOrg(
      `UPDATE biometric_employee_map 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex++} AND tenant_id = $${paramIndex++}
       RETURNING *`,
      values,
      orgId
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Mapping not found' });
    }

    res.json({ mapping: rows[0] });
  } catch (error) {
    console.error('Error updating biometric mapping:', error);
    res.status(500).json({ error: error.message || 'Failed to update mapping' });
  }
});

/**
 * DELETE /api/biometric/mappings/:id
 * Delete a biometric employee mapping
 */
router.delete('/mappings/:id', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    const orgId = req.orgId;
    const { id } = req.params;

    if (!orgId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { rows } = await queryWithOrg(
      `DELETE FROM biometric_employee_map 
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, orgId],
      orgId
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Mapping not found' });
    }

    res.json({ success: true, message: 'Mapping deleted' });
  } catch (error) {
    console.error('Error deleting biometric mapping:', error);
    res.status(500).json({ error: error.message || 'Failed to delete mapping' });
  }
});

/**
 * POST /api/biometric/sync
 * Manually trigger a biometric sync
 */
router.post('/sync', authenticateToken, setTenantContext, requireRole('hr', 'director', 'ceo', 'admin'), async (req, res) => {
  try {
    // Run sync in background
    runBiometricSync().catch((err) => {
      console.error('[BiometricSync] Error in manual sync:', err);
    });

    res.json({ 
      success: true, 
      message: 'Biometric sync started. Check logs for progress.' 
    });
  } catch (error) {
    console.error('Error triggering biometric sync:', error);
    res.status(500).json({ error: error.message || 'Failed to trigger sync' });
  }
});

export default router;

