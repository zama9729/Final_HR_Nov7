import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import { setTenantContext } from '../middleware/tenant.js';

const router = express.Router();

// Ensure AI configuration table exists
async function ensureAIConfigurationTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS ai_configuration (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        
        can_access_projects BOOLEAN DEFAULT true,
        can_access_timesheets BOOLEAN DEFAULT true,
        can_access_leaves BOOLEAN DEFAULT true,
        can_access_attendance BOOLEAN DEFAULT true,
        can_access_expenses BOOLEAN DEFAULT true,
        can_access_onboarding BOOLEAN DEFAULT true,
        can_access_payroll BOOLEAN DEFAULT true,
        can_access_analytics BOOLEAN DEFAULT true,
        can_access_employee_directory BOOLEAN DEFAULT true,
        can_access_notifications BOOLEAN DEFAULT true,
        
        enabled BOOLEAN DEFAULT true,
        
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        
        UNIQUE(tenant_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_ai_configuration_tenant ON ai_configuration(tenant_id);
    `);
  } catch (error) {
    console.error('Error ensuring AI configuration table:', error);
  }
}

// GET /api/ai/settings - Get AI configuration
router.get('/settings', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureAIConfigurationTable();
    const tenantId = req.orgId || req.user?.org_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const result = await query(
      `SELECT * FROM ai_configuration WHERE tenant_id = $1`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      // Create default configuration
      const defaultConfig = await query(
        `INSERT INTO ai_configuration (tenant_id, enabled)
         VALUES ($1, true)
         RETURNING *`,
        [tenantId]
      );
      return res.json({ configuration: defaultConfig.rows[0] });
    }

    res.json({ configuration: result.rows[0] });
  } catch (error) {
    console.error('Error fetching AI configuration:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/ai/settings - Update AI configuration
router.put('/settings', authenticateToken, setTenantContext, requireRole('hr', 'ceo', 'admin'), async (req, res) => {
  try {
    await ensureAIConfigurationTable();
    const tenantId = req.orgId || req.user?.org_id;

    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    const {
      can_access_projects,
      can_access_timesheets,
      can_access_leaves,
      can_access_attendance,
      can_access_expenses,
      can_access_onboarding,
      can_access_payroll,
      can_access_analytics,
      can_access_employee_directory,
      can_access_notifications,
      enabled,
    } = req.body;

    // Check if configuration exists
    const existing = await query(
      `SELECT id FROM ai_configuration WHERE tenant_id = $1`,
      [tenantId]
    );

    let result;
    if (existing.rows.length === 0) {
      // Create new configuration
      result = await query(
        `INSERT INTO ai_configuration (
          tenant_id,
          can_access_projects,
          can_access_timesheets,
          can_access_leaves,
          can_access_attendance,
          can_access_expenses,
          can_access_onboarding,
          can_access_payroll,
          can_access_analytics,
          can_access_employee_directory,
          can_access_notifications,
          enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *`,
        [
          tenantId,
          can_access_projects ?? true,
          can_access_timesheets ?? true,
          can_access_leaves ?? true,
          can_access_attendance ?? true,
          can_access_expenses ?? true,
          can_access_onboarding ?? true,
          can_access_payroll ?? true,
          can_access_analytics ?? true,
          can_access_employee_directory ?? true,
          can_access_notifications ?? true,
          enabled ?? true,
        ]
      );
    } else {
      // Update existing configuration
      result = await query(
        `UPDATE ai_configuration SET
          can_access_projects = $2,
          can_access_timesheets = $3,
          can_access_leaves = $4,
          can_access_attendance = $5,
          can_access_expenses = $6,
          can_access_onboarding = $7,
          can_access_payroll = $8,
          can_access_analytics = $9,
          can_access_employee_directory = $10,
          can_access_notifications = $11,
          enabled = $12,
          updated_at = now()
        WHERE tenant_id = $1
        RETURNING *`,
        [
          tenantId,
          can_access_projects ?? true,
          can_access_timesheets ?? true,
          can_access_leaves ?? true,
          can_access_attendance ?? true,
          can_access_expenses ?? true,
          can_access_onboarding ?? true,
          can_access_payroll ?? true,
          can_access_analytics ?? true,
          can_access_employee_directory ?? true,
          can_access_notifications ?? true,
          enabled ?? true,
        ]
      );
    }

    res.json({ 
      success: true,
      configuration: result.rows[0],
      message: 'AI configuration updated successfully'
    });
  } catch (error) {
    console.error('Error updating AI configuration:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

