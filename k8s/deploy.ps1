# HR Suite Kubernetes Deployment Script (PowerShell)
# This script deploys all components of the HR Suite to Kubernetes

$ErrorActionPreference = "Stop"
$NAMESPACE = "hr-suite"

Write-Host "🚀 Starting HR Suite Kubernetes Deployment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check if kubectl is available
try {
    $null = Get-Command kubectl -ErrorAction Stop
} catch {
    Write-Host "❌ kubectl is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check if cluster is accessible
try {
    $null = kubectl cluster-info 2>&1
} catch {
    Write-Host "❌ Cannot connect to Kubernetes cluster" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Kubernetes cluster is accessible" -ForegroundColor Green

# Step 1: Create namespace
Write-Host ""
Write-Host "📦 Step 1: Creating namespace..." -ForegroundColor Yellow
kubectl apply -f namespace.yaml

# Step 2: Create ConfigMaps
Write-Host ""
Write-Host "⚙️  Step 2: Creating ConfigMaps..." -ForegroundColor Yellow
kubectl apply -f configmaps.yaml

# Step 3: Check if secrets.yaml exists
Write-Host ""
if (-not (Test-Path "secrets.yaml")) {
    Write-Host "⚠️  WARNING: secrets.yaml not found!" -ForegroundColor Red
    Write-Host "   Please copy secrets-template.yaml to secrets.yaml and update with your values"
    Write-Host "   Then run this script again."
    exit 1
}

Write-Host "🔐 Step 3: Creating Secrets..." -ForegroundColor Yellow
kubectl apply -f secrets.yaml

# Step 4: Deploy infrastructure
Write-Host ""
Write-Host "🏗️  Step 4: Deploying infrastructure services..." -ForegroundColor Yellow
kubectl apply -f postgres-deployment.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f minio-deployment.yaml

Write-Host ""
Write-Host "⏳ Waiting for infrastructure services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
kubectl wait --for=condition=ready pod -l app=postgres -n $NAMESPACE --timeout=300s 2>&1 | Out-Null
kubectl wait --for=condition=ready pod -l app=redis -n $NAMESPACE --timeout=300s 2>&1 | Out-Null
kubectl wait --for=condition=ready pod -l app=minio -n $NAMESPACE --timeout=300s 2>&1 | Out-Null

# Step 5: Deploy application services
Write-Host ""
Write-Host "🚀 Step 5: Deploying application services..." -ForegroundColor Yellow
kubectl apply -f api-deployment.yaml
kubectl apply -f payroll-api-deployment.yaml
kubectl apply -f rag-service-deployment.yaml

# Step 6: Deploy frontend services
Write-Host ""
Write-Host "🎨 Step 6: Deploying frontend services..." -ForegroundColor Yellow
kubectl apply -f frontend-deployment.yaml

# Step 7: Create services
Write-Host ""
Write-Host "🔌 Step 7: Creating services..." -ForegroundColor Yellow
kubectl apply -f services.yaml

# Step 8: Deploy ingress (optional)
Write-Host ""
$deployIngress = Read-Host "Deploy Ingress? (y/n)"
if ($deployIngress -eq "y" -or $deployIngress -eq "Y") {
    Write-Host "🌐 Step 8: Deploying Ingress..." -ForegroundColor Yellow
    kubectl apply -f ingress.yaml
} else {
    Write-Host "⏭️  Skipping Ingress deployment" -ForegroundColor Gray
}

# Summary
Write-Host ""
Write-Host "✅ Deployment complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📊 Current status:" -ForegroundColor Cyan
kubectl get pods -n $NAMESPACE
Write-Host ""
Write-Host "🔍 To check logs:" -ForegroundColor Cyan
Write-Host "   kubectl logs -f deployment/api -n $NAMESPACE"
Write-Host "   kubectl logs -f deployment/payroll-api -n $NAMESPACE"
Write-Host ""
Write-Host "📖 For more information, see README.md" -ForegroundColor Cyan











