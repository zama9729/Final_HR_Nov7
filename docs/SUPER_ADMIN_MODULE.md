# Super Admin Module Documentation

## Overview

The Super Admin module provides a comprehensive system for managing all tenants (organizations) in the multi-tenant HR & Payroll Management Platform. It includes tier-based pricing, feature flag management, and complete audit logging.

## Features

1. **Tenant Management**: View, filter, and manage all tenants
2. **Tier Management**: Change tenant subscription tiers (Basic, Premium, Enterprise)
3. **Feature Flags**: Enable/disable features per tenant with override capability
4. **Audit Logging**: Complete audit trail of all Super Admin actions
5. **Feature Matrix**: View which features belong to which tier

## Database Schema

### Tables Created

1. **organizations** (updated)
   - Added columns: `tier`, `status`, `subscription_start_date`, `subscription_end_date`, `last_active_at`

2. **feature_flags**
   - Master list of all platform features
   - Defines which features are available for each tier

3. **tenant_features**
   - Join table linking tenants to features
   - Supports manual overrides from tier defaults

4. **superadmin_audit_logs**
   - Complete audit trail of all Super Admin actions

## Installation

### 1. Run Database Migration

```bash
# Apply the migration
psql -U your_user -d your_database -f server/db/migrations/20260120_super_admin_module.sql
```

### 2. Configure Super Admin Access

Set the `ADMIN_EMAILS` environment variable with comma-separated email addresses:

```bash
# Backend (.env)
ADMIN_EMAILS=admin@example.com,superadmin@example.com

# Frontend (.env)
VITE_ADMIN_EMAILS=admin@example.com,superadmin@example.com
```

### 3. Access the Dashboard

Navigate to `/superadmin` in your application. Only users with emails in `ADMIN_EMAILS` can access this route.

## API Endpoints

All endpoints are under `/api/superadmin` and require Super Admin authentication.

### Tenants

- `GET /api/superadmin/tenants` - List all tenants (supports `status`, `tier`, `search` query params)
- `GET /api/superadmin/tenants/:id` - Get tenant details with features
- `PATCH /api/superadmin/tenants/:id/tier` - Update tenant tier
- `PATCH /api/superadmin/tenants/:id/status` - Update tenant status

### Features

- `GET /api/superadmin/features` - List all available features
- `GET /api/superadmin/tenants/:id/features` - Get tenant's features
- `PATCH /api/superadmin/tenants/:id/features` - Update tenant features

### Audit & Stats

- `GET /api/superadmin/audit-logs` - Get audit logs (supports pagination and filtering)
- `GET /api/superadmin/stats` - Get platform-wide statistics

## Using Feature Flags in Your Code

### Backend

```javascript
import { requireFeature, isFeatureEnabled } from '../utils/featureFlags.js';

// Middleware to protect a route
router.get('/api/payroll', authenticateToken, requireFeature('payroll'), async (req, res) => {
  // This route is only accessible if 'payroll' feature is enabled
});

// Check feature in code
const canUsePayroll = await isFeatureEnabled(tenantId, 'payroll');
if (canUsePayroll) {
  // Enable payroll functionality
}
```

### Frontend

Feature flags are automatically enforced on the backend. The frontend can check feature availability via API if needed.

## Default Features by Tier

### Basic Tier
- Performance Reviews
- Leave Management
- Attendance Tracking
- Timesheet Management
- Employee Directory
- Document Management

### Premium Tier (includes Basic +)
- Payroll Management
- Advanced Analytics
- AI Assistant
- API Access
- Priority Support
- Multi-Branch Management
- Advanced Onboarding
- Team Scheduling
- Project Management
- Expense Management

### Enterprise Tier (includes Premium +)
- Custom Workflows
- White Label
- Biometric Integration
- Background Checks

## Tier Upgrade/Downgrade Logic

When a tenant's tier is changed:
1. All features are automatically updated based on the new tier
2. Manual overrides are preserved (marked as `overridden`)
3. Features that match tier defaults have `overridden` set to `false`
4. An audit log entry is created

## Manual Feature Overrides

Super Admins can manually enable/disable features for specific tenants:
- Overrides are marked with `overridden: true`
- Overrides persist even when tier changes
- Overrides can be reset by changing the feature back to match tier default

## Audit Logging

All Super Admin actions are logged with:
- Timestamp
- Super Admin ID and email
- Action type (tier_changed, status_changed, features_updated)
- Tenant ID and name
- Metadata (JSON) with action-specific details

## Security

- All Super Admin routes require authentication via `authenticateToken`
- Additional check via `requireSuperadmin` middleware validates email against `ADMIN_EMAILS`
- Super Admins bypass all feature flag checks
- All actions are audited

## Frontend Components

### SuperAdminDashboard
Main dashboard with tabs for Tenants, Feature Matrix, and Audit Logs.

### TenantList
Table view of all tenants with filtering and inline tier/status editing.

### TenantDetailsModal
Detailed view of a tenant with overview and feature management tabs.

### FeatureManager
Toggle switches for managing tenant features with override indicators.

### FeatureMatrixView
Matrix showing which features are available for each tier.

### AuditLogsView
Paginated list of all Super Admin actions with filtering.

## Usage Example

1. **Change Tenant Tier**:
   - Navigate to Super Admin Dashboard
   - Find tenant in the list
   - Change tier dropdown (automatically updates features)

2. **Override Feature**:
   - Click "View" on a tenant
   - Go to "Features" tab
   - Toggle any feature (marked as "Overridden")
   - Click "Save Changes"

3. **View Audit Trail**:
   - Go to "Audit Logs" tab
   - Filter by action type or tenant
   - View all Super Admin actions

## Troubleshooting

### Migration Issues
- Ensure PostgreSQL extensions `uuid-ossp` and `pgcrypto` are enabled
- Check that `organizations` table exists before running migration

### Access Issues
- Verify `ADMIN_EMAILS` environment variable is set correctly
- Ensure user email matches exactly (case-insensitive)
- Check browser console for authentication errors

### Feature Flag Issues
- Verify `tenant_features` table has entries for the tenant
- Check that feature keys match exactly (case-sensitive)
- Ensure triggers are working (check `sync_tenant_features` function)

## Future Enhancements

- [ ] Bulk operations (change multiple tenants at once)
- [ ] Usage analytics per tenant
- [ ] Automated tier recommendations
- [ ] Email notifications for tier changes
- [ ] Feature usage tracking
- [ ] Custom feature definitions per tenant

