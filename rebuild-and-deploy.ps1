# PowerShell script to rebuild Docker images and deploy to Kubernetes
# This will rebuild images with the latest code changes

Write-Host "🔨 Rebuilding Docker Images with Latest Code Changes" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
$dockerRunning = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Docker is running" -ForegroundColor Green
Write-Host ""

# Step 1: Build Frontend Image
Write-Host "📦 Step 1: Building Frontend Docker Image..." -ForegroundColor Yellow
docker build -t hr-suite-frontend:latest -f Dockerfile .
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: Frontend build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Frontend image built successfully" -ForegroundColor Green
Write-Host ""

# Step 2: Build API Image
Write-Host "📦 Step 2: Building API Docker Image..." -ForegroundColor Yellow
docker build -t hr-suite-api:latest -f server/Dockerfile.api ./server
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Error: API build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ API image built successfully" -ForegroundColor Green
Write-Host ""

# Step 3: Load images into Kubernetes (if using local registry like kind/minikube)
Write-Host "📦 Step 3: Loading images into Kubernetes..." -ForegroundColor Yellow

# Try to detect Kubernetes environment
$k8sContext = kubectl config current-context
Write-Host "Kubernetes context: $k8sContext" -ForegroundColor Gray

# Check if using minikube
$minikubeStatus = minikube status 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "Detected minikube, loading images..." -ForegroundColor Gray
    minikube image load hr-suite-frontend:latest
    minikube image load hr-suite-api:latest
    Write-Host "✅ Images loaded into minikube" -ForegroundColor Green
} else {
    # Check if using kind
    $kindClusters = kind get clusters 2>&1
    if ($LASTEXITCODE -eq 0 -and $kindClusters) {
        Write-Host "Detected kind, loading images..." -ForegroundColor Gray
        kind load docker-image hr-suite-frontend:latest
        kind load docker-image hr-suite-api:latest
        Write-Host "✅ Images loaded into kind" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Warning: Could not detect minikube or kind" -ForegroundColor Yellow
        Write-Host "   If using a remote registry, push images manually:" -ForegroundColor Yellow
        Write-Host "   docker push your-registry/hr-suite-frontend:latest" -ForegroundColor Gray
        Write-Host "   docker push your-registry/hr-suite-api:latest" -ForegroundColor Gray
    }
}
Write-Host ""

# Step 4: Restart Deployments
Write-Host "🚀 Step 4: Restarting Kubernetes Deployments..." -ForegroundColor Yellow
kubectl rollout restart deployment/api -n hr-suite
kubectl rollout restart deployment/frontend -n hr-suite

Write-Host "⏳ Waiting for deployments to roll out..." -ForegroundColor Yellow
kubectl rollout status deployment/api -n hr-suite --timeout=120s
kubectl rollout status deployment/frontend -n hr-suite --timeout=120s

Write-Host ""
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 Verification Steps:" -ForegroundColor Cyan
Write-Host "   1. Wait 1-2 minutes for pods to fully start" -ForegroundColor White
Write-Host "   2. Navigate to /employees page" -ForegroundColor White
Write-Host "   3. You should see ALL employees (not just active)" -ForegroundColor White
Write-Host "   4. Use the Status filter dropdown to filter by status" -ForegroundColor White
Write-Host '   5. Check browser DevTools Network tab to verify API returns all employees' -ForegroundColor White
Write-Host ""

