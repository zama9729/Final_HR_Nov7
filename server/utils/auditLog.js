/**
 * Centralized Audit Log Helper
 * 
 * Provides a unified interface for logging all audit events:
 * - Overrides
 * - Terminations
 * - Payroll actions
 * - Policy edits
 * - Holiday edits
 * - Any other high-risk actions
 */

import { query } from '../db/pool.js';

// Ensure audit_logs table exists
const ensureAuditLogsTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
      actor_id UUID REFERENCES profiles(id),
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id UUID,
      reason TEXT,
      details JSONB DEFAULT '{}'::jsonb,
      diff JSONB,
      scope TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
  `).catch(err => {
    // Table might already exist, ignore
    if (!err.message.includes('already exists')) {
      console.error('Error creating audit_logs table:', err);
    }
  });
};

// Initialize table on import
ensureAuditLogsTable();

/**
 * Log an audit event
 * 
 * @param {Object} params
 * @param {string} params.actorId - User ID of the actor
 * @param {string} params.action - Action performed (e.g., 'override', 'terminate', 'payroll_run')
 * @param {string} params.entityType - Type of entity (e.g., 'timesheet', 'leave_request', 'employee')
 * @param {string} params.entityId - ID of the entity
 * @param {string} [params.reason] - Reason for the action (required for overrides)
 * @param {Object} [params.diff] - Before/after diff if applicable
 * @param {Object} [params.details] - Additional details
 * @param {string} [params.scope] - Scope of action (e.g., 'org', 'dept', 'team')
 * @returns {Promise<Object>} Created audit log entry
 */
export async function audit({
  actorId,
  action,
  entityType,
  entityId,
  reason = null,
  diff = null,
  details = {},
  scope = null,
}) {
  try {
    // Get actor role and tenant
    const actorResult = await query(
      `SELECT 
        p.tenant_id,
        ur.role
       FROM profiles p
       LEFT JOIN user_roles ur ON ur.user_id = p.id
       WHERE p.id = $1
       LIMIT 1`,
      [actorId]
    );

    const actor = actorResult.rows[0];
    if (!actor) {
      throw new Error(`Actor ${actorId} not found`);
    }

    const tenantId = actor.tenant_id;
    const actorRole = actor.role;

    // For override actions, reason is mandatory
    if (['override', 'break_glass_override', 'timesheet_override', 'leave_override'].includes(action) && !reason) {
      throw new Error('Reason is required for override actions');
    }

    // Insert audit log
    const result = await query(
      `INSERT INTO audit_logs (
        tenant_id,
        actor_id,
        actor_role,
        action,
        entity_type,
        entity_id,
        reason,
        details,
        diff,
        scope
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *`,
      [
        tenantId,
        actorId,
        actorRole,
        action,
        entityType,
        entityId,
        reason,
        JSON.stringify(details),
        diff ? JSON.stringify(diff) : null,
        scope,
      ]
    );

    return result.rows[0];
  } catch (error) {
    console.error('Error creating audit log:', error);
    throw error;
  }
}

/**
 * Get audit logs with optional filters
 * 
 * @param {Object} filters
 * @param {string} [filters.tenantId] - Filter by tenant
 * @param {string} [filters.actorId] - Filter by actor
 * @param {string} [filters.entityType] - Filter by entity type
 * @param {string} [filters.entityId] - Filter by entity ID
 * @param {string} [filters.action] - Filter by action
 * @param {Date} [filters.from] - Start date
 * @param {Date} [filters.to] - End date
 * @param {number} [filters.limit] - Limit results (default: 100)
 * @param {number} [filters.offset] - Offset for pagination
 * @returns {Promise<Array>} Audit log entries
 */
export async function getAuditLogs(filters = {}) {
  try {
    const {
      tenantId,
      actorId,
      entityType,
      entityId,
      action,
      from,
      to,
      limit = 100,
      offset = 0,
    } = filters;

    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (tenantId) {
      conditions.push(`tenant_id = $${paramIndex++}`);
      params.push(tenantId);
    }

    if (actorId) {
      conditions.push(`actor_id = $${paramIndex++}`);
      params.push(actorId);
    }

    if (entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(entityType);
    }

    if (entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      params.push(entityId);
    }

    if (action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(action);
    }

    if (from) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(from);
    }

    if (to) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(to);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);

    const result = await query(
      `SELECT 
        al.*,
        json_build_object(
          'id', p.id,
          'email', p.email,
          'first_name', p.first_name,
          'last_name', p.last_name
        ) as actor
       FROM audit_logs al
       LEFT JOIN profiles p ON p.id = al.actor_id
       ${whereClause}
       ORDER BY al.created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      params
    );

    return result.rows;
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
}

/**
 * Get high-risk audit logs (for CEO dashboard)
 * 
 * @param {string} tenantId - Tenant ID
 * @param {number} [limit] - Limit results (default: 50)
 * @returns {Promise<Array>} High-risk audit log entries
 */
export async function getHighRiskAuditLogs(tenantId, limit = 50) {
  const highRiskActions = [
    'override',
    'break_glass_override',
    'terminate',
    'rehire',
    'payroll_run',
    'payroll_rollback',
    'policy_edit',
    'holiday_edit',
    'role_change',
    'compensation_change',
  ];

  return getAuditLogs({
    tenantId,
    action: highRiskActions,
    limit,
  });
}

