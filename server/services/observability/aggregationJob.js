/**
 * Daily Aggregation Job
 * Aggregates metrics and refreshes materialized views
 */

import { query } from '../../db/pool.js';
import { runHealthChecksForAllTenants } from './healthDetector.js';

/**
 * Run daily aggregation for all tenants
 */
export async function runDailyAggregation() {
  console.log('[Observability] Starting daily aggregation...');
  
  try {
    // 1. Aggregate user counts (active vs total)
    await aggregateUserCounts();
    
    // 2. Refresh materialized views
    await refreshMaterializedViews();
    
    // 3. Run health checks
    await runHealthChecksForAllTenants();
    
    // 4. Clean up old resolved health flags (older than 90 days)
    await cleanupOldHealthFlags();
    
    console.log('[Observability] Daily aggregation completed');
  } catch (error) {
    console.error('[Observability] Error in daily aggregation:', error);
    throw error;
  }
}

/**
 * Aggregate user counts from profiles table
 */
async function aggregateUserCounts() {
  await query(`
    INSERT INTO tenant_metrics_daily (tenant_id, date, total_users, active_users_count)
    SELECT 
      tenant_id,
      CURRENT_DATE,
      COUNT(*) AS total_users,
      COUNT(*) FILTER (WHERE last_login_at >= CURRENT_DATE - INTERVAL '30 days') AS active_users_30d
    FROM profiles
    WHERE tenant_id IS NOT NULL
    GROUP BY tenant_id
    ON CONFLICT (tenant_id, date)
    DO UPDATE SET
      total_users = EXCLUDED.total_users,
      active_users_count = EXCLUDED.active_users_count,
      updated_at = now()
  `);
}

/**
 * Refresh materialized views
 */
async function refreshMaterializedViews() {
  await query(`
    REFRESH MATERIALIZED VIEW CONCURRENTLY tenant_activity_summary_30d
  `).catch(err => {
    // If CONCURRENTLY fails, try without it
    return query(`REFRESH MATERIALIZED VIEW tenant_activity_summary_30d`);
  });
}

/**
 * Clean up old resolved health flags
 */
async function cleanupOldHealthFlags() {
  await query(`
    DELETE FROM tenant_health_flags
    WHERE resolved_at IS NOT NULL
      AND resolved_at < CURRENT_DATE - INTERVAL '90 days'
  `);
}

/**
 * Calculate storage usage from MinIO/S3
 * This should be called separately as it requires storage service connection
 */
export async function updateStorageMetrics() {
  // This would integrate with MinIO/S3 to get actual storage usage
  // For now, we'll use a placeholder that can be extended
  
  const tenants = await query(`
    SELECT id, tier FROM organizations WHERE status = 'active'
  `);
  
  for (const tenant of tenants.rows) {
    // TODO: Integrate with actual storage service
    // For now, we'll estimate based on document counts or use a default
    const estimatedStorage = await estimateStorageForTenant(tenant.id);
    
    await query(`
      INSERT INTO tenant_metrics_daily (tenant_id, date, storage_used_mb)
      VALUES ($1, CURRENT_DATE, $2)
      ON CONFLICT (tenant_id, date)
      DO UPDATE SET
        storage_used_mb = $2,
        updated_at = now()
    `, [tenant.id, estimatedStorage]);
  }
}

/**
 * Estimate storage for a tenant (placeholder - should be replaced with actual storage query)
 */
async function estimateStorageForTenant(tenantId) {
  // Estimate based on document count (rough: 1MB per document on average)
  const result = await query(`
    SELECT COUNT(*) * 1.0 AS estimated_mb
    FROM documents
    WHERE tenant_id = $1
  `, [tenantId]).catch(() => ({ rows: [{ estimated_mb: 0 }] }));
  
  return parseFloat(result.rows[0]?.estimated_mb || 0);
}

