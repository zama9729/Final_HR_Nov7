# PowerShell script to verify SSO setup
# Tests if SSO endpoint is configured correctly

Write-Host "🧪 Testing SSO Endpoint Setup..." -ForegroundColor Cyan
Write-Host ""

# Check if Payroll API is running
Write-Host "1. Checking if Payroll API is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ Payroll API is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Payroll API is not running on port 4000" -ForegroundColor Red
    Write-Host "   Start it with: docker-compose up payroll-api" -ForegroundColor Yellow
    exit 1
}

# Check if HR API is running
Write-Host ""
Write-Host "2. Checking if HR API is running..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "✅ HR API is running" -ForegroundColor Green
} catch {
    Write-Host "❌ HR API is not running on port 3001" -ForegroundColor Red
    Write-Host "   Start it with: docker-compose up api" -ForegroundColor Yellow
}

# Test SSO endpoint without token (should fail)
Write-Host ""
Write-Host "3. Testing SSO endpoint without token (should fail)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000/sso" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
    Write-Host "⚠️  Unexpected: SSO endpoint accepted request without token" -ForegroundColor Yellow
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "✅ SSO endpoint correctly rejects requests without token" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Unexpected error: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Check if containers are running
Write-Host ""
Write-Host "4. Checking Docker containers..." -ForegroundColor Yellow
$containers = docker ps --format "{{.Names}}" | Select-String -Pattern "payroll-api|api"
if ($containers) {
    Write-Host "✅ Docker containers are running:" -ForegroundColor Green
    $containers | ForEach-Object { Write-Host "   - $_" -ForegroundColor Gray }
} else {
    Write-Host "⚠️  No Docker containers found" -ForegroundColor Yellow
    Write-Host "   Start with: docker-compose up -d" -ForegroundColor Yellow
}

# Check for .env file
Write-Host ""
Write-Host "5. Checking environment setup..." -ForegroundColor Yellow
if (Test-Path ".env") {
    Write-Host "✅ .env file exists" -ForegroundColor Green
    $envContent = Get-Content ".env" -Raw
    if ($envContent -match "HR_PAYROLL_JWT") {
        Write-Host "✅ RSA keys found in .env file" -ForegroundColor Green
    } else {
        Write-Host "⚠️  RSA keys not found in .env file" -ForegroundColor Yellow
        Write-Host "   Run: node scripts/generate-rsa-keys.js" -ForegroundColor Yellow
    }
} else {
    Write-Host "⚠️  .env file not found" -ForegroundColor Yellow
    Write-Host "   Create .env file and add RSA keys" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""
Write-Host "📝 Next Steps:" -ForegroundColor Cyan
Write-Host "   1. Ensure RSA keys are set in .env file" -ForegroundColor White
Write-Host "   2. Restart services: docker-compose restart api payroll-api" -ForegroundColor White
Write-Host "   3. Login to HR system and click 'Payroll' link" -ForegroundColor White
Write-Host "   4. Should automatically redirect to Payroll app with SSO" -ForegroundColor White
Write-Host ""

