import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Helper: get tenant for current user
async function getTenantId(userId) {
  const res = await query('SELECT tenant_id FROM profiles WHERE id = $1', [userId]);
  return res.rows[0]?.tenant_id || null;
}

// Get all mini apps for organization
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const { category, enabled } = req.query;

    let sql = `
      SELECT id, name, description, category, opal_app_id, opal_app_url, 
             function_name, enabled, created_at, updated_at
      FROM opal_mini_apps
      WHERE tenant_id = $1
    `;
    const params = [tenantId];

    if (category) {
      sql += ` AND category = $${params.length + 1}`;
      params.push(category);
    }

    if (enabled !== undefined) {
      sql += ` AND enabled = $${params.length + 1}`;
      params.push(enabled === 'true');
    }

    sql += ` ORDER BY created_at DESC`;

    const result = await query(sql, params);

    res.json({
      mini_apps: result.rows,
      count: result.rows.length
    });
  } catch (error) {
    console.error('Error fetching mini apps:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get single mini app
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `SELECT id, name, description, category, opal_app_id, opal_app_url,
              app_config, function_name, enabled, created_by, created_at, updated_at
       FROM opal_mini_apps
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mini app not found' });
    }

    res.json({ mini_app: result.rows[0] });
  } catch (error) {
    console.error('Error fetching mini app:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create or update mini app
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { id, name, description, category, opal_app_id, opal_app_url, app_config, function_name, enabled } = req.body;

    if (!name || !function_name) {
      return res.status(400).json({ error: 'Name and function_name are required' });
    }

    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    if (id) {
      // Update existing
      const result = await query(
        `UPDATE opal_mini_apps
         SET name = $1, description = $2, category = $3, opal_app_id = $4,
             opal_app_url = $5, app_config = $6::jsonb, function_name = $7,
             enabled = $8, updated_at = now()
         WHERE id = $9 AND tenant_id = $10
         RETURNING *`,
        [name, description, category, opal_app_id, opal_app_url, JSON.stringify(app_config || {}), function_name, enabled !== false, id, tenantId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Mini app not found' });
      }

      res.json({ mini_app: result.rows[0] });
    } else {
      // Create new
      const result = await query(
        `INSERT INTO opal_mini_apps 
         (tenant_id, name, description, category, opal_app_id, opal_app_url, 
          app_config, function_name, enabled, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10)
         RETURNING *`,
        [tenantId, name, description || null, category || null, opal_app_id || null, 
         opal_app_url || null, JSON.stringify(app_config || {}), function_name, enabled !== false, userId]
      );

      res.json({ mini_app: result.rows[0] });
    }
  } catch (error) {
    console.error('Error saving mini app:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete mini app
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `DELETE FROM opal_mini_apps
       WHERE id = $1 AND tenant_id = $2
       RETURNING id`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mini app not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting mini app:', error);
    res.status(500).json({ error: error.message });
  }
});

// Toggle enabled status
router.patch('/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `UPDATE opal_mini_apps
       SET enabled = NOT enabled, updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, enabled`,
      [id, tenantId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Mini app not found' });
    }

    res.json({ success: true, enabled: result.rows[0].enabled });
  } catch (error) {
    console.error('Error toggling mini app:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get mini apps by category
router.get('/category/:category', authenticateToken, async (req, res) => {
  try {
    const { category } = req.params;
    const userId = req.user.id;
    const tenantId = await getTenantId(userId);

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `SELECT id, name, description, category, function_name, enabled
       FROM opal_mini_apps
       WHERE tenant_id = $1 AND category = $2 AND enabled = true
       ORDER BY name`,
      [tenantId, category]
    );

    res.json({ mini_apps: result.rows, count: result.rows.length });
  } catch (error) {
    console.error('Error fetching mini apps by category:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;






