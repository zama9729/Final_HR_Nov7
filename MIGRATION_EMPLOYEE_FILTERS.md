# Migration Guide: Remove Implicit Active-Only Filters

## Overview

This migration documents and applies changes that remove implicit `status='active'` filters from employee queries across the application. All API endpoints now return **ALL employees by default**, with explicit filtering available where needed.

## What Changed

### Backend Changes
- **API Routes Updated**: `employees.js`, `employee-stats.js`, `calendar.js`, `scheduling.js`, `teams.js`, `analytics.js`
- **Default Behavior**: All routes now return all employees unless explicitly filtered
- **Explicit Filtering**: Status filtering available via query parameters where needed

### Frontend Changes
- **Employees Page**: Added explicit Status filter dropdown (All, Active, Inactive, On Notice, Exited)
- **Shift Management**: Removed implicit active filter, added explicit status filter
- **Shift Management 2**: Added explicit "Employee Status" filter dropdown

### Database Changes
- Ensures `employees.status` column exists
- Adds performance indexes for status-based queries
- Documents the change in database comments

## Migration File

**Location**: `server/db/migrations/20250130_remove_implicit_active_filters.sql`

## Running the Migration

### Option 1: Using Node.js Script (Recommended)

```bash
# From project root
node server/scripts/run-employee-filter-migration.js
```

### Option 2: Using psql Directly

```bash
# Set your database connection string
export DATABASE_URL="postgresql://user:password@host:5432/database"

# Run migration
psql $DATABASE_URL -f server/db/migrations/20250130_remove_implicit_active_filters.sql
```

### Option 3: Using Docker (if using Docker Compose)

```bash
# Copy migration file to container
docker cp server/db/migrations/20250130_remove_implicit_active_filters.sql hr-suite-postgres:/tmp/migration.sql

# Run migration
docker exec hr-suite-postgres psql -U postgres -d hr_suite -f /tmp/migration.sql
```

### Option 4: Using Kubernetes (if deployed on k8s)

```bash
# Find the database pod
kubectl get pods -n hr-suite | grep postgres

# Copy migration file to pod
kubectl cp server/db/migrations/20250130_remove_implicit_active_filters.sql hr-suite/postgres-pod-name:/tmp/migration.sql

# Run migration
kubectl exec -it postgres-pod-name -n hr-suite -- psql -U postgres -d hr_suite -f /tmp/migration.sql
```

## After Running Migration

### 1. Restart Backend API

**Local Development:**
```bash
# Stop current server (Ctrl+C) and restart
cd server
npm start
# or
npm run dev
```

**Kubernetes:**
```bash
kubectl rollout restart deployment/api -n hr-suite
kubectl rollout status deployment/api -n hr-suite --timeout=60s
```

### 2. Rebuild Frontend

**Local Development:**
```bash
# From project root
npm run build
# or for development
npm run dev
```

**Kubernetes:**
```bash
kubectl rollout restart deployment/frontend -n hr-suite
kubectl rollout status deployment/frontend -n hr-suite --timeout=60s
```

### 3. Verify Changes

1. **Employees Page**: 
   - Navigate to `/employees`
   - You should see ALL employees (not just active)
   - Use the Status filter dropdown to filter by status

2. **Shift Management**:
   - Navigate to `/shift-management-2`
   - Check that all employees are available
   - Use the "Employee Status" filter if you want to filter to active only

3. **API Endpoints**:
   - Test `/api/employees` - should return all employees
   - Test `/api/employees?status=active` - should return only active
   - Test `/api/employees?status=inactive` - should return only inactive

## Verification Queries

Run these SQL queries to verify the migration:

```sql
-- Check total employees vs active
SELECT 
  COUNT(*) FILTER (WHERE status = 'active') as active_count,
  COUNT(*) FILTER (WHERE status != 'active' OR status IS NULL) as non_active_count,
  COUNT(*) as total_count
FROM employees;

-- Check status distribution
SELECT status, COUNT(*) 
FROM employees 
GROUP BY status 
ORDER BY COUNT(*) DESC;

-- Verify indexes exist
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'employees' 
AND indexname LIKE '%status%';
```

## Troubleshooting

### Changes Not Visible in Application

1. **Frontend not rebuilt**: Run `npm run build` and restart the dev server
2. **Backend not restarted**: Restart the API server
3. **Kubernetes pods not restarted**: Run rollout restart commands
4. **Browser cache**: Clear browser cache or use incognito mode
5. **Check API response**: Use browser DevTools Network tab to verify API returns all employees

### Migration Errors

- **"column already exists"**: This is normal, migration is idempotent
- **"index already exists"**: This is normal, migration is idempotent
- **Connection errors**: Check database connection string and credentials

### API Still Returning Only Active Employees

1. Check that backend code changes were deployed
2. Verify API route files have been updated
3. Check server logs for any errors
4. Restart backend server

## Rollback (if needed)

If you need to rollback, you would need to:
1. Revert code changes in the affected files
2. Rebuild and redeploy
3. Note: The database migration itself doesn't need rollback (it only adds indexes and comments)

## Files Modified

### Backend
- `server/routes/employees.js`
- `server/routes/employee-stats.js`
- `server/routes/calendar.js`
- `server/routes/scheduling.js`
- `server/routes/teams.js`
- `server/routes/analytics.js`
- `server/routes/payroll.js` (documentation only)

### Frontend
- `src/pages/Employees.tsx`
- `src/pages/ShiftManagement.tsx`
- `src/pages/ShiftManagement2.tsx`

## Support

If you encounter issues:
1. Check server logs for errors
2. Verify database connection
3. Ensure all code changes are deployed
4. Verify frontend is rebuilt with latest changes

