# PowerShell Script to Run RAG AI Service
# Run this script from the rag-service directory

Write-Host "`n=== Starting RAG AI Service ===" -ForegroundColor Cyan
Write-Host ""

# Navigate to rag-service directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    docker ps | Out-Null
    Write-Host "✅ Docker is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker is not running. Please start Docker Desktop first." -ForegroundColor Red
    exit 1
}

# Check if .env file exists
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found. Creating from template..." -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "✅ Created .env file. Please edit it with your OpenAI API key." -ForegroundColor Yellow
    } else {
        Write-Host "⚠️  .env.example not found. You may need to set environment variables manually." -ForegroundColor Yellow
    }
}

# Start all services
Write-Host "`nStarting RAG service containers..." -ForegroundColor Yellow
docker-compose up -d

# Wait for services to be healthy
Write-Host "`nWaiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check service status
Write-Host "`n=== Service Status ===" -ForegroundColor Cyan
docker-compose ps

# Run migrations
Write-Host "`nRunning database migrations..." -ForegroundColor Yellow
docker-compose exec -T rag-api alembic upgrade head

# Check health
Write-Host "`nChecking RAG API health..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8001/health" -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ RAG API is healthy!" -ForegroundColor Green
    Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
} catch {
    Write-Host "⚠️  RAG API health check failed. Service may still be starting..." -ForegroundColor Yellow
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Gray
}

Write-Host "`n=== RAG Service Started ===" -ForegroundColor Green
Write-Host ""
Write-Host "Services:" -ForegroundColor White
Write-Host "  - RAG API:        http://localhost:8001" -ForegroundColor Cyan
Write-Host "  - Chroma DB:      http://localhost:8000" -ForegroundColor Cyan
Write-Host "  - Postgres:       localhost:5433" -ForegroundColor Cyan
Write-Host "  - Redis:          localhost:6381" -ForegroundColor Cyan
Write-Host ""
Write-Host "View logs:" -ForegroundColor White
Write-Host "  docker-compose logs -f rag-api" -ForegroundColor Gray
Write-Host ""
Write-Host "Stop services:" -ForegroundColor White
Write-Host "  docker-compose down" -ForegroundColor Gray
Write-Host ""

