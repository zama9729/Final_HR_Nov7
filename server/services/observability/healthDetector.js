/**
 * Tenant Health Detection Engine
 * Rule-based health checks and risk detection
 */

import { query } from '../../db/pool.js';

/**
 * Run all health checks for a tenant
 * @param {string} tenantId - Tenant UUID
 */
export async function runHealthChecks(tenantId) {
  if (!tenantId) return;
  
  const checks = [
    checkInactiveTenant,
    checkPayrollSkipped,
    checkErrorSpike,
    checkStorageLimit,
    checkLowAdoption,
    checkNoRecentActivity
  ];
  
  for (const check of checks) {
    try {
      await check(tenantId);
    } catch (error) {
      console.error(`[HealthDetector] Error in health check ${check.name}:`, error);
    }
  }
}

/**
 * Check if tenant is inactive (no logins in last 14 days)
 */
async function checkInactiveTenant(tenantId) {
  const result = await query(`
    SELECT 
      MAX(tm.date) AS last_activity_date,
      MAX(tm.active_users_count) AS last_active_users
    FROM tenant_metrics_daily tm
    WHERE tm.tenant_id = $1
      AND tm.active_users_count > 0
    GROUP BY tm.tenant_id
  `, [tenantId]);
  
  if (result.rows.length === 0) {
    // No activity ever recorded
    await createHealthFlag(tenantId, 'INACTIVE', 'HIGH', {
      reason: 'No activity recorded',
      days_inactive: 999
    });
    return;
  }
  
  const lastActivity = result.rows[0].last_activity_date;
  const daysInactive = Math.floor((new Date() - new Date(lastActivity)) / (1000 * 60 * 60 * 24));
  
  if (daysInactive >= 14) {
    await createHealthFlag(tenantId, 'INACTIVE', daysInactive >= 30 ? 'HIGH' : 'MEDIUM', {
      last_activity_date: lastActivity,
      days_inactive: daysInactive
    });
  } else {
    await resolveHealthFlag(tenantId, 'INACTIVE');
  }
}

/**
 * Check if payroll hasn't been run this month
 */
async function checkPayrollSkipped(tenantId) {
  const result = await query(`
    SELECT 
      MAX(tm.date) AS last_payroll_date,
      SUM(tm.payroll_runs_count) AS total_runs
    FROM tenant_metrics_daily tm
    WHERE tm.tenant_id = $1
      AND tm.payroll_runs_count > 0
    GROUP BY tm.tenant_id
  `, [tenantId]);
  
  if (result.rows.length === 0) {
    // Never run payroll - might be new tenant
    return;
  }
  
  const lastPayroll = result.rows[0].last_payroll_date;
  const now = new Date();
  const lastPayrollDate = new Date(lastPayroll);
  const isThisMonth = lastPayrollDate.getMonth() === now.getMonth() && 
                      lastPayrollDate.getFullYear() === now.getFullYear();
  
  if (!isThisMonth) {
    const daysSince = Math.floor((now - lastPayrollDate) / (1000 * 60 * 60 * 24));
    await createHealthFlag(tenantId, 'PAYROLL_SKIPPED', 'MEDIUM', {
      last_payroll_date: lastPayroll,
      days_since: daysSince
    });
  } else {
    await resolveHealthFlag(tenantId, 'PAYROLL_SKIPPED');
  }
}

/**
 * Check for error rate spike (>5% error rate in last 7 days)
 */
async function checkErrorSpike(tenantId) {
  const result = await query(`
    SELECT 
      SUM(tm.api_error_count) AS total_errors,
      SUM(tm.api_requests_count) AS total_requests,
      CASE 
        WHEN SUM(tm.api_requests_count) > 0 
        THEN (SUM(tm.api_error_count)::NUMERIC / SUM(tm.api_requests_count)::NUMERIC * 100)
        ELSE 0
      END AS error_rate_pct
    FROM tenant_metrics_daily tm
    WHERE tm.tenant_id = $1
      AND tm.date >= CURRENT_DATE - INTERVAL '7 days'
  `, [tenantId]);
  
  if (result.rows.length === 0 || result.rows[0].total_requests === 0) {
    return;
  }
  
  const errorRate = parseFloat(result.rows[0].error_rate_pct || 0);
  
  if (errorRate > 10) {
    await createHealthFlag(tenantId, 'ERROR_SPIKE', 'HIGH', {
      error_rate_pct: errorRate.toFixed(2),
      total_errors: result.rows[0].total_errors,
      total_requests: result.rows[0].total_requests
    });
  } else if (errorRate > 5) {
    await createHealthFlag(tenantId, 'ERROR_SPIKE', 'MEDIUM', {
      error_rate_pct: errorRate.toFixed(2),
      total_errors: result.rows[0].total_errors,
      total_requests: result.rows[0].total_requests
    });
  } else {
    await resolveHealthFlag(tenantId, 'ERROR_SPIKE');
  }
}

/**
 * Check if storage is approaching limit (>80% of tier limit)
 */
async function checkStorageLimit(tenantId) {
  const result = await query(`
    SELECT 
      o.tier,
      MAX(tm.storage_used_mb) AS current_storage_mb,
      get_tenant_storage_limit_mb(o.tier) AS storage_limit_mb
    FROM tenant_metrics_daily tm
    JOIN organizations o ON o.id = tm.tenant_id
    WHERE tm.tenant_id = $1
      AND tm.date >= CURRENT_DATE - INTERVAL '7 days'
    GROUP BY o.tier
  `, [tenantId]);
  
  if (result.rows.length === 0) {
    return;
  }
  
  const row = result.rows[0];
  const currentStorage = parseFloat(row.current_storage_mb || 0);
  const limit = parseInt(row.storage_limit_mb || 1024);
  const usagePercent = (currentStorage / limit) * 100;
  
  if (usagePercent >= 95) {
    await createHealthFlag(tenantId, 'STORAGE_LIMIT', 'CRITICAL', {
      current_storage_mb: currentStorage.toFixed(2),
      storage_limit_mb: limit,
      usage_percent: usagePercent.toFixed(2)
    });
  } else if (usagePercent >= 80) {
    await createHealthFlag(tenantId, 'STORAGE_LIMIT', 'HIGH', {
      current_storage_mb: currentStorage.toFixed(2),
      storage_limit_mb: limit,
      usage_percent: usagePercent.toFixed(2)
    });
  } else {
    await resolveHealthFlag(tenantId, 'STORAGE_LIMIT');
  }
}

/**
 * Check for low feature adoption (<3 features used in last 30 days)
 */
async function checkLowAdoption(tenantId) {
  const result = await query(`
    SELECT COUNT(*) AS active_features
    FROM tenant_feature_usage
    WHERE tenant_id = $1
      AND usage_count_30d > 0
  `, [tenantId]);
  
  const activeFeatures = parseInt(result.rows[0]?.active_features || 0);
  
  if (activeFeatures < 3) {
    await createHealthFlag(tenantId, 'LOW_ADOPTION', 'LOW', {
      active_features: activeFeatures,
      threshold: 3
    });
  } else {
    await resolveHealthFlag(tenantId, 'LOW_ADOPTION');
  }
}

/**
 * Check for no recent activity (no metrics in last 3 days)
 */
async function checkNoRecentActivity(tenantId) {
  const result = await query(`
    SELECT MAX(date) AS last_metric_date
    FROM tenant_metrics_daily
    WHERE tenant_id = $1
  `, [tenantId]);
  
  if (result.rows.length === 0) {
    return;
  }
  
  const lastMetricDate = result.rows[0].last_metric_date;
  if (!lastMetricDate) return;
  
  const daysSince = Math.floor((new Date() - new Date(lastMetricDate)) / (1000 * 60 * 60 * 24));
  
  if (daysSince >= 3) {
    await createHealthFlag(tenantId, 'NO_RECENT_ACTIVITY', 'MEDIUM', {
      last_metric_date: lastMetricDate,
      days_since: daysSince
    });
  } else {
    await resolveHealthFlag(tenantId, 'NO_RECENT_ACTIVITY');
  }
}

/**
 * Create or update a health flag
 */
async function createHealthFlag(tenantId, flagType, severity, metadata = {}) {
  try {
    await query(`
      INSERT INTO tenant_health_flags (tenant_id, flag_type, severity, metadata, message)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, flag_type, severity)
      DO UPDATE SET
        metadata = $4,
        message = $5,
        created_at = CASE 
          WHEN tenant_health_flags.resolved_at IS NOT NULL THEN now()
          ELSE tenant_health_flags.created_at
        END,
        resolved_at = NULL,
        updated_at = now()
    `, [
      tenantId,
      flagType,
      severity,
      JSON.stringify(metadata),
      getHealthFlagMessage(flagType, severity, metadata)
    ]);
  } catch (error) {
    console.error(`[HealthDetector] Error creating health flag:`, error);
  }
}

/**
 * Resolve a health flag
 */
async function resolveHealthFlag(tenantId, flagType) {
  try {
    await query(`
      UPDATE tenant_health_flags
      SET resolved_at = now(),
          updated_at = now()
      WHERE tenant_id = $1
        AND flag_type = $2
        AND resolved_at IS NULL
    `, [tenantId, flagType]);
  } catch (error) {
    // Ignore - flag might not exist
  }
}

/**
 * Get human-readable message for health flag
 */
function getHealthFlagMessage(flagType, severity, metadata) {
  const messages = {
    'INACTIVE': `No user activity for ${metadata.days_inactive || 'many'} days`,
    'PAYROLL_SKIPPED': `Payroll not run in ${metadata.days_since || 'this'} month`,
    'ERROR_SPIKE': `High error rate: ${metadata.error_rate_pct || 'N/A'}%`,
    'STORAGE_LIMIT': `Storage usage at ${metadata.usage_percent || 'N/A'}% of limit`,
    'LOW_ADOPTION': `Only ${metadata.active_features || 0} features in use`,
    'NO_RECENT_ACTIVITY': `No metrics recorded in last ${metadata.days_since || 3} days`
  };
  
  return messages[flagType] || `${flagType} detected`;
}

/**
 * Run health checks for all tenants
 */
export async function runHealthChecksForAllTenants() {
  const result = await query(`
    SELECT id FROM organizations WHERE status = 'active'
  `);
  
  for (const row of result.rows) {
    await runHealthChecks(row.id);
  }
}

