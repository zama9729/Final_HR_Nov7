# PowerShell script to run employee filter migration on Kubernetes
# Usage: .\run-migration-k8s.ps1

Write-Host "🚀 Starting Migration: Remove Implicit Active-Only Filters" -ForegroundColor Cyan
Write-Host ""

# Step 1: Find PostgreSQL pod
Write-Host "📋 Step 1: Finding PostgreSQL pod..." -ForegroundColor Yellow
$postgresPod = kubectl get pods -n hr-suite -o json | ConvertFrom-Json | 
    Where-Object { $_.metadata.name -like "*postgres*" } | 
    Select-Object -First 1 -ExpandProperty metadata.name

if (-not $postgresPod) {
    Write-Host "❌ Error: Could not find PostgreSQL pod in hr-suite namespace" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Found PostgreSQL pod: $postgresPod" -ForegroundColor Green
Write-Host ""

# Step 2: Copy migration file to pod
Write-Host "📋 Step 2: Copying migration file to pod..." -ForegroundColor Yellow
$migrationFile = "server/db/migrations/20250130_remove_implicit_active_filters.sql"

if (-not (Test-Path $migrationFile)) {
    Write-Host "❌ Error: Migration file not found: $migrationFile" -ForegroundColor Red
    exit 1
}

kubectl cp $migrationFile "hr-suite/$postgresPod`:/tmp/migration.sql"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Failed to copy migration file" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Migration file copied successfully" -ForegroundColor Green
Write-Host ""

# Step 3: Run migration
Write-Host "📋 Step 3: Running migration..." -ForegroundColor Yellow
kubectl exec -it $postgresPod -n hr-suite -- psql -U postgres -d hr_suite -f /tmp/migration.sql

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Migration failed" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Migration completed successfully" -ForegroundColor Green
Write-Host ""

# Step 4: Restart backend API
Write-Host "📋 Step 4: Restarting backend API..." -ForegroundColor Yellow
kubectl rollout restart deployment/api -n hr-suite
Write-Host "⏳ Waiting for API rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/api -n hr-suite --timeout=60s

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Warning: API rollout status check timed out or failed" -ForegroundColor Yellow
} else {
    Write-Host "✅ Backend API restarted successfully" -ForegroundColor Green
}
Write-Host ""

# Step 5: Restart frontend
Write-Host "📋 Step 5: Restarting frontend..." -ForegroundColor Yellow
kubectl rollout restart deployment/frontend -n hr-suite
Write-Host "⏳ Waiting for frontend rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/frontend -n hr-suite --timeout=60s

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Warning: Frontend rollout status check timed out or failed" -ForegroundColor Yellow
} else {
    Write-Host "✅ Frontend restarted successfully" -ForegroundColor Green
}
Write-Host ""

# Step 6: Verify pods
Write-Host "📋 Step 6: Verifying pods..." -ForegroundColor Yellow
kubectl get pods -n hr-suite -l app=api
kubectl get pods -n hr-suite -l app=frontend
Write-Host ""

# Summary
Write-Host "✅ Migration Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Wait 1-2 minutes for pods to fully restart"
Write-Host "   2. Navigate to /employees page"
Write-Host "   3. Verify all employees are visible (not just active)"
Write-Host "   4. Test the Status filter dropdown"
Write-Host '   5. Check API endpoint in browser DevTools'
Write-Host ""
