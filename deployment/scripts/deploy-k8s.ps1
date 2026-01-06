# Kubernetes Deployment Script for HR Suite (PowerShell)
# Usage: .\deploy-k8s.ps1 [-Namespace hr-suite]

param(
    [Parameter(Mandatory=$false)]
    [string]$Namespace = "hr-suite"
)

$ErrorActionPreference = "Stop"

$K8SDir = "../k8s"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "HR Suite Kubernetes Deployment" -ForegroundColor Cyan
Write-Host "Namespace: $Namespace" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check if kubectl is available
if (-not (Get-Command kubectl -ErrorAction SilentlyContinue)) {
    Write-Host "Error: kubectl is not installed or not in PATH" -ForegroundColor Red
    exit 1
}

# Check if namespace exists, create if not
$nsExists = kubectl get namespace $Namespace 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Creating namespace: $Namespace" -ForegroundColor Yellow
    kubectl create namespace $Namespace
}

# Apply namespace
Write-Host ""
Write-Host "Applying namespace..." -ForegroundColor Yellow
kubectl apply -f "$K8SDir/namespace.yaml"

# Apply ConfigMap
Write-Host ""
Write-Host "Applying ConfigMap..." -ForegroundColor Yellow
kubectl apply -f "$K8SDir/configmap.yaml"

# Check if secrets file exists
if (Test-Path "$K8SDir/secrets.yaml") {
    Write-Host ""
    Write-Host "Applying Secrets..." -ForegroundColor Yellow
    kubectl apply -f "$K8SDir/secrets.yaml"
} else {
    Write-Host ""
    Write-Host "Warning: secrets.yaml not found!" -ForegroundColor Yellow
    Write-Host "Please create secrets.yaml from secrets.template.yaml and fill in values." -ForegroundColor Yellow
    Write-Host "You can use: kubectl create secret generic hr-suite-secrets --from-env-file=secrets.env -n $Namespace" -ForegroundColor Cyan
    exit 1
}

# Apply database deployments
Write-Host ""
Write-Host "Applying PostgreSQL deployment..." -ForegroundColor Yellow
kubectl apply -f "$K8SDir/postgres-deployment.yaml"

Write-Host ""
Write-Host "Applying Redis deployment..." -ForegroundColor Yellow
kubectl apply -f "$K8SDir/redis-deployment.yaml"

# Wait for database to be ready
Write-Host ""
Write-Host "Waiting for database to be ready..." -ForegroundColor Yellow
kubectl wait --for=condition=ready pod -l app=postgres -n $Namespace --timeout=300s

# Apply API deployment
Write-Host ""
Write-Host "Applying API deployment..." -ForegroundColor Yellow
kubectl apply -f "$K8SDir/api-deployment.yaml"

# Apply Frontend deployment
Write-Host ""
Write-Host "Applying Frontend deployment..." -ForegroundColor Yellow
kubectl apply -f "$K8SDir/frontend-deployment.yaml"

# Apply RAG Service deployments
Write-Host ""
Write-Host "Applying RAG Service deployments..." -ForegroundColor Yellow
kubectl apply -f "$K8SDir/rag-service-deployment.yaml"

# Wait for deployments to be ready
Write-Host ""
Write-Host "Waiting for deployments to be ready..." -ForegroundColor Yellow
kubectl wait --for=condition=available deployment/api -n $Namespace --timeout=300s
kubectl wait --for=condition=available deployment/frontend -n $Namespace --timeout=300s
kubectl wait --for=condition=available deployment/rag-api -n $Namespace --timeout=300s

# Apply Ingress
Write-Host ""
Write-Host "Applying Ingress..." -ForegroundColor Yellow
kubectl apply -f "$K8SDir/ingress.yaml"

# Show status
Write-Host ""
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "Deployment Status:" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
kubectl get all -n $Namespace

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To view logs: kubectl logs -f deployment/api -n $Namespace" -ForegroundColor Cyan
Write-Host "To check pods: kubectl get pods -n $Namespace" -ForegroundColor Cyan
Write-Host "To delete: kubectl delete namespace $Namespace" -ForegroundColor Cyan
Write-Host ""

