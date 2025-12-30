# Quick Migration Guide: Remove Implicit Active-Only Filters

## Migration File
**Location**: `server/db/migrations/20250130_remove_implicit_active_filters.sql`

## Option 1: Run via Kubernetes (Recommended for Production)

### Step 1: Copy migration file to database pod

```powershell
# Find the PostgreSQL pod
kubectl get pods -n hr-suite | Select-String "postgres"

# Copy migration file (replace POD_NAME with actual pod name)
kubectl cp server/db/migrations/20250130_remove_implicit_active_filters.sql hr-suite/POD_NAME:/tmp/migration.sql
```

### Step 2: Run migration

```powershell
# Run migration (replace POD_NAME with actual pod name)
kubectl exec -it POD_NAME -n hr-suite -- psql -U postgres -d hr_suite -f /tmp/migration.sql
```

### Step 3: Restart deployments

```powershell
# Restart backend API
kubectl rollout restart deployment/api -n hr-suite
kubectl rollout status deployment/api -n hr-suite --timeout=60s

# Restart frontend
kubectl rollout restart deployment/frontend -n hr-suite
kubectl rollout status deployment/frontend -n hr-suite --timeout=60s

# Verify pods are running
kubectl get pods -n hr-suite
```

## Option 2: Run via psql with Port Forward

### Step 1: Port forward to database

```powershell
# Port forward PostgreSQL (run in separate terminal)
kubectl port-forward -n hr-suite svc/postgres 5432:5432
```

### Step 2: Run migration (in another terminal)

```powershell
# Set connection string (adjust credentials as needed)
$env:PGPASSWORD="your_password"
psql -h localhost -p 5432 -U postgres -d hr_suite -f server/db/migrations/20250130_remove_implicit_active_filters.sql
```

### Step 3: Restart deployments (same as Option 1, Step 3)

## Option 3: Run via Node.js Script (if database is accessible)

```powershell
# Set database environment variables
$env:DB_HOST="your_db_host"
$env:DB_PORT="5432"
$env:DB_NAME="hr_suite"
$env:DB_USER="postgres"
$env:DB_PASSWORD="your_password"

# Run migration script
cd server
node scripts/run-employee-filter-migration.js
```

## Verification

After running the migration and restarting deployments:

1. **Check Employees Page**: Navigate to `/employees` - should show ALL employees
2. **Check API**: Test `GET /api/employees` - should return all employees
3. **Check Status Filter**: Use the Status dropdown to filter employees

## Troubleshooting

### Changes Not Visible

1. **Frontend not rebuilt**: The frontend code changes need to be deployed
   ```powershell
   # Rebuild frontend (if using local build)
   npm run build
   
   # Or restart Kubernetes deployment (if using k8s)
   kubectl rollout restart deployment/frontend -n hr-suite
   ```

2. **Backend not restarted**: Backend code changes need to be deployed
   ```powershell
   kubectl rollout restart deployment/api -n hr-suite
   ```

3. **Browser cache**: Clear browser cache or use incognito mode

4. **Check API response**: Open browser DevTools → Network tab → Check `/api/employees` response

### Database Connection Issues

- Verify PostgreSQL pod is running: `kubectl get pods -n hr-suite | Select-String postgres`
- Check database credentials in Kubernetes secrets
- Verify port forwarding is active (if using Option 2)

## Quick Commands Summary

```powershell
# 1. Find postgres pod
kubectl get pods -n hr-suite | Select-String postgres

# 2. Copy migration file (replace POD_NAME)
kubectl cp server/db/migrations/20250130_remove_implicit_active_filters.sql hr-suite/POD_NAME:/tmp/migration.sql

# 3. Run migration (replace POD_NAME)
kubectl exec -it POD_NAME -n hr-suite -- psql -U postgres -d hr_suite -f /tmp/migration.sql

# 4. Restart services
kubectl rollout restart deployment/api -n hr-suite
kubectl rollout restart deployment/frontend -n hr-suite

# 5. Check status
kubectl get pods -n hr-suite
kubectl rollout status deployment/api -n hr-suite --timeout=60s
kubectl rollout status deployment/frontend -n hr-suite --timeout=60s
```

