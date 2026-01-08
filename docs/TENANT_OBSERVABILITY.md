# Tenant Observability Module

## Overview

The Tenant Observability module provides Super Admins with deep insights into tenant health, usage patterns, and risk indicators without exposing any PII (Personally Identifiable Information).

## Features

- **Daily Metrics Collection**: Automatic aggregation of tenant-level metrics
- **Health Detection**: Rule-based health checks and risk flagging
- **Feature Usage Tracking**: Monitor feature adoption per tenant
- **Time-Series Analytics**: Historical metrics with configurable time ranges
- **Audit Logging**: Complete audit trail of Super Admin access

## Database Schema

### Tables

1. **tenant_metrics_daily**: Daily aggregated metrics per tenant
2. **tenant_feature_usage**: Feature adoption and usage tracking
3. **tenant_health_flags**: Health and risk indicators
4. **observability_audit_logs**: Audit trail of Super Admin access

See `server/db/migrations/20260121_tenant_observability.sql` for full schema.

## Installation

### 1. Run Migration

```bash
node server/scripts/run-observability-migration.js
```

Or manually:
```bash
psql -U postgres -d hr_suite -f server/db/migrations/20260121_tenant_observability.sql
```

### 2. Restart Backend

The observability cron job will start automatically and run daily at 2 AM UTC.

## Usage

### Accessing Observability Dashboard

1. Log in as Super Admin (email in `ADMIN_EMAILS`)
2. Navigate to `/superadmin`
3. Click on the **Observability** tab

### Features

#### Platform Overview
- Total tenants and active percentage
- At-risk tenant count
- Average feature adoption
- Recent activity metrics

#### Tenant Health Table
- Filter by status, tier, and health status
- View health flags and severity
- See activity metrics and error rates
- Click "View" to see detailed metrics

#### Tenant Metrics View
- Time-series charts for:
  - Active users
  - Payroll runs
  - Attendance events
  - API requests/errors
  - Storage usage
- Configurable time range (7/30/60/90 days)

#### Feature Usage Heatmap
- Feature adoption breakdown
- Usage intensity indicators
- Last used dates
- 7-day, 30-day, and total usage counts

## Health Detection Rules

The system automatically detects:

1. **INACTIVE**: No user logins in 14+ days
2. **PAYROLL_SKIPPED**: Payroll not run this month
3. **ERROR_SPIKE**: Error rate >5% (MEDIUM) or >10% (HIGH)
4. **STORAGE_LIMIT**: Storage >80% (HIGH) or >95% (CRITICAL) of tier limit
5. **LOW_ADOPTION**: <3 features used in last 30 days
6. **NO_RECENT_ACTIVITY**: No metrics recorded in last 3 days

## API Endpoints

All endpoints require Super Admin authentication:

- `GET /api/superadmin/observability/overview` - Platform-wide stats
- `GET /api/superadmin/observability/tenants` - List tenants with health summary
- `GET /api/superadmin/observability/tenants/:id/metrics` - Time-series metrics
- `GET /api/superadmin/observability/tenants/:id/health` - Health flags
- `GET /api/superadmin/observability/tenants/:id/feature-usage` - Feature adoption

## Metrics Collection

Metrics are collected automatically via:

1. **API Middleware**: Tracks all authenticated API requests
2. **Background Jobs**: Daily aggregation at 2 AM UTC
3. **Event Hooks**: Payroll runs, attendance events, etc.

### Manual Metric Recording

```javascript
import { incrementDailyMetric, recordFeatureUsage } from './services/observability/metricsCollector.js';

// Record a payroll run
await incrementDailyMetric(tenantId, 'payroll_runs_count', 1);

// Record feature usage
await recordFeatureUsage(tenantId, 'payroll', userId);
```

## Security & Privacy

- **No PII**: All metrics are tenant-level aggregates only
- **Super Admin Only**: All endpoints require Super Admin authentication
- **Audit Logging**: Every access is logged in `observability_audit_logs`
- **RLS Bypass**: Super Admin queries bypass tenant RLS safely

## Troubleshooting

### Metrics Not Appearing

1. Check if migration ran successfully
2. Verify cron job is running: Check server logs for `[Observability]` messages
3. Ensure middleware is applied to routes
4. Check database for data in `tenant_metrics_daily`

### Health Flags Not Updating

1. Health checks run daily at 2 AM UTC
2. Check `tenant_health_flags` table for flags
3. Verify health detection rules in `server/services/observability/healthDetector.js`

### Storage Metrics Missing

1. Storage calculation requires integration with MinIO/S3
2. Currently uses estimated values based on document counts
3. Extend `updateStorageMetrics()` in `aggregationJob.js` for actual storage queries

## Future Enhancements

- [ ] Real-time metrics streaming
- [ ] Custom health check rules
- [ ] Alert notifications for critical flags
- [ ] Export metrics to CSV/JSON
- [ ] Comparative analytics (tenant vs tenant)
- [ ] Predictive analytics (churn risk, etc.)

