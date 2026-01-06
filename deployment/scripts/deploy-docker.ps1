# Docker Deployment Script for HR Suite (PowerShell)
# Usage: .\deploy-docker.ps1 [-Environment dev|staging|production]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("dev", "staging", "production")]
    [string]$Environment = "production"
)

$ErrorActionPreference = "Stop"

$ComposeFile = "docker-compose.$Environment.yml"
$EnvFile = "../env-templates/env.$Environment.template"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "HR Suite Docker Deployment" -ForegroundColor Cyan
Write-Host "Environment: $Environment" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# Check if docker-compose file exists
if (-not (Test-Path $ComposeFile)) {
    Write-Host "Error: $ComposeFile not found!" -ForegroundColor Red
    exit 1
}

# Check if .env file exists
if (-not (Test-Path $EnvFile)) {
    Write-Host "Warning: $EnvFile not found. Using defaults." -ForegroundColor Yellow
} else {
    Write-Host "Using environment file: $EnvFile" -ForegroundColor Green
}

# Build images
Write-Host ""
Write-Host "Building Docker images..." -ForegroundColor Yellow
docker-compose -f $ComposeFile build --no-cache

# Stop existing containers
Write-Host ""
Write-Host "Stopping existing containers..." -ForegroundColor Yellow
docker-compose -f $ComposeFile down

# Start services
Write-Host ""
Write-Host "Starting services..." -ForegroundColor Yellow
docker-compose -f $ComposeFile up -d

# Wait for services to be healthy
Write-Host ""
Write-Host "Waiting for services to be healthy..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service status
Write-Host ""
Write-Host "Service Status:" -ForegroundColor Cyan
docker-compose -f $ComposeFile ps

# Show logs
Write-Host ""
Write-Host "Recent logs (last 20 lines):" -ForegroundColor Cyan
docker-compose -f $ComposeFile logs --tail=20

Write-Host ""
Write-Host "==========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "To view logs: docker-compose -f $ComposeFile logs -f" -ForegroundColor Cyan
Write-Host "To stop: docker-compose -f $ComposeFile down" -ForegroundColor Cyan
Write-Host ""

