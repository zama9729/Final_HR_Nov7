/**
 * Tenant Metrics Collector Service
 * Collects and aggregates tenant-level metrics (no PII)
 */

import { query } from '../../db/pool.js';

/**
 * Record a daily metric increment
 * @param {string} tenantId - Tenant UUID
 * @param {string} metricField - Field name in tenant_metrics_daily
 * @param {number} increment - Amount to increment (default: 1)
 */
export async function incrementDailyMetric(tenantId, metricField, increment = 1) {
  if (!tenantId) return;
  
  const validFields = [
    'active_users_count',
    'total_users',
    'new_users_count',
    'payroll_runs_count',
    'attendance_events_count',
    'leave_requests_count',
    'expense_claims_count',
    'timesheet_submissions_count',
    'api_requests_count',
    'api_error_count',
    'api_success_count'
  ];
  
  if (!validFields.includes(metricField)) {
    console.warn(`[MetricsCollector] Invalid metric field: ${metricField}`);
    return;
  }
  
  try {
    await query(`
      INSERT INTO tenant_metrics_daily (tenant_id, date, ${metricField})
      VALUES ($1, CURRENT_DATE, $2)
      ON CONFLICT (tenant_id, date)
      DO UPDATE SET
        ${metricField} = tenant_metrics_daily.${metricField} + $2,
        updated_at = now()
    `, [tenantId, increment]);
  } catch (error) {
    console.error(`[MetricsCollector] Error incrementing ${metricField}:`, error);
    // Don't throw - metrics collection should not break main flow
  }
}

/**
 * Record feature usage
 * @param {string} tenantId - Tenant UUID
 * @param {string} featureKey - Feature identifier
 * @param {string} userId - User ID (for unique user counting)
 */
export async function recordFeatureUsage(tenantId, featureKey, userId = null) {
  if (!tenantId || !featureKey) return;
  
  try {
    // Update or insert feature usage
    await query(`
      INSERT INTO tenant_feature_usage (
        tenant_id, 
        feature_key, 
        usage_count, 
        last_used_at,
        first_used_at,
        usage_count_7d,
        usage_count_30d,
        usage_count_90d
      )
      VALUES ($1, $2, 1, now(), now(), 1, 1, 1)
      ON CONFLICT (tenant_id, feature_key)
      DO UPDATE SET
        usage_count = tenant_feature_usage.usage_count + 1,
        last_used_at = now(),
        usage_count_7d = CASE 
          WHEN last_used_at >= now() - INTERVAL '7 days' 
          THEN tenant_feature_usage.usage_count_7d + 1 
          ELSE 1 
        END,
        usage_count_30d = CASE 
          WHEN last_used_at >= now() - INTERVAL '30 days' 
          THEN tenant_feature_usage.usage_count_30d + 1 
          ELSE 1 
        END,
        usage_count_90d = CASE 
          WHEN last_used_at >= now() - INTERVAL '90 days' 
          THEN tenant_feature_usage.usage_count_90d + 1 
          ELSE 1 
        END,
        updated_at = now()
    `, [tenantId, featureKey]);
    
    // Update unique users count if userId provided
    if (userId) {
      // This is a simplified approach - for exact counts, you'd need a separate tracking table
      // For now, we'll estimate based on usage patterns
    }
  } catch (error) {
    console.error(`[MetricsCollector] Error recording feature usage:`, error);
  }
}

/**
 * Record API request metrics
 * @param {string} tenantId - Tenant UUID
 * @param {boolean} isError - Whether request resulted in error
 * @param {number} responseTimeMs - Response time in milliseconds
 */
export async function recordApiMetric(tenantId, isError, responseTimeMs = 0) {
  if (!tenantId) return;
  
  try {
    const errorIncrement = isError ? 1 : 0;
    const successIncrement = isError ? 0 : 1;
    
    await query(`
      INSERT INTO tenant_metrics_daily (tenant_id, date, api_requests_count, api_error_count, api_success_count, avg_response_time_ms)
      VALUES ($1, CURRENT_DATE, 1, $2, $3, $4)
      ON CONFLICT (tenant_id, date)
      DO UPDATE SET
        api_requests_count = tenant_metrics_daily.api_requests_count + 1,
        api_error_count = tenant_metrics_daily.api_error_count + $2,
        api_success_count = tenant_metrics_daily.api_success_count + $3,
        avg_response_time_ms = (
          (tenant_metrics_daily.avg_response_time_ms * tenant_metrics_daily.api_requests_count + $4) 
          / (tenant_metrics_daily.api_requests_count + 1)
        )::INTEGER,
        updated_at = now()
    `, [tenantId, errorIncrement, successIncrement, responseTimeMs]);
  } catch (error) {
    console.error(`[MetricsCollector] Error recording API metric:`, error);
  }
}

/**
 * Update storage usage for a tenant
 * @param {string} tenantId - Tenant UUID
 * @param {number} storageMb - Storage used in MB
 */
export async function updateStorageUsage(tenantId, storageMb) {
  if (!tenantId) return;
  
  try {
    await query(`
      INSERT INTO tenant_metrics_daily (tenant_id, date, storage_used_mb)
      VALUES ($1, CURRENT_DATE, $2)
      ON CONFLICT (tenant_id, date)
      DO UPDATE SET
        storage_used_mb = $2,
        updated_at = now()
    `, [tenantId, storageMb]);
  } catch (error) {
    console.error(`[MetricsCollector] Error updating storage usage:`, error);
  }
}

/**
 * Record user login (for active user tracking)
 * @param {string} tenantId - Tenant UUID
 * @param {string} userId - User ID
 */
export async function recordUserLogin(tenantId, userId) {
  if (!tenantId || !userId) return;
  
  try {
    // Increment active users (deduplication handled by counting unique logins per day)
    // For simplicity, we'll use a simple increment - for exact counts, track unique users separately
    await query(`
      INSERT INTO tenant_metrics_daily (tenant_id, date, active_users_count)
      VALUES ($1, CURRENT_DATE, 1)
      ON CONFLICT (tenant_id, date)
      DO UPDATE SET
        active_users_count = GREATEST(
          tenant_metrics_daily.active_users_count,
          (SELECT COUNT(DISTINCT user_id) FROM auth_logs 
           WHERE tenant_id = $1 AND DATE(created_at) = CURRENT_DATE)
        ),
        updated_at = now()
    `, [tenantId]);
  } catch (error) {
    // If auth_logs table doesn't exist, use simple increment
    await incrementDailyMetric(tenantId, 'active_users_count', 1);
  }
}

