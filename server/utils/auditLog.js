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

import { query, createPool } from '../db/pool.js';

// Ensure audit_logs table exists
let ensurePromise = null;
const ensureAuditLogsTable = async () => {
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      await createPool();
      await query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          actor_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
          action TEXT NOT NULL,
          object_type TEXT NOT NULL,
          object_id UUID,
          payload JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_user_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_object ON audit_logs(object_type, object_id);
        CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
      `);
    } catch (err) {
      console.error('Error creating audit_logs table:', err);
    }
  })();
  return ensurePromise;
};

// Initialize table on import (best effort)
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
    await ensureAuditLogsTable();
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
    // Store rich payload in a single JSONB column to match existing schema
    const payload = {
      reason,
      details,
      diff,
      scope,
      actor_role: actorRole,
    };

    const result = await query(
      `INSERT INTO audit_logs (
        org_id,
        actor_user_id,
        action,
        object_type,
        object_id,
        payload
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *`,
      [
        tenantId,
        actorId,
        action,
        entityType,
        entityId,
        payload,
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
      conditions.push(`al.org_id = $${paramIndex++}`);
      params.push(tenantId);
    }

    if (actorId) {
      conditions.push(`al.actor_user_id = $${paramIndex++}`);
      params.push(actorId);
    }

    if (entityType) {
      // Support comma-separated entity types (e.g., "payroll_run,payroll_run_adjustment")
      if (entityType.includes(',')) {
        const entityTypes = entityType.split(',').map(t => t.trim()).filter(Boolean);
        if (entityTypes.length > 0) {
          const placeholders = entityTypes.map((_, i) => `$${paramIndex + i}`).join(', ');
          conditions.push(`al.entity_type IN (${placeholders})`);
          params.push(...entityTypes);
          paramIndex += entityTypes.length;
        }
      } else {
        conditions.push(`al.object_type = $${paramIndex++}`);
        params.push(entityType);
      }
    }

    if (entityId) {
      conditions.push(`al.object_id = $${paramIndex++}`);
      params.push(entityId);
    }

    if (action) {
      conditions.push(`al.action = $${paramIndex++}`);
      params.push(action);
    }

    if (from) {
      conditions.push(`al.created_at >= $${paramIndex++}`);
      params.push(from);
    }

    if (to) {
      conditions.push(`al.created_at <= $${paramIndex++}`);
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
       LEFT JOIN profiles p ON p.id = al.actor_user_id
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

