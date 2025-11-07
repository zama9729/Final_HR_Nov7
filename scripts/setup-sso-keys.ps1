# PowerShell script to setup SSO RSA Keys for HR-Payroll Integration
# This script reads the generated keys and displays them for manual setup

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$KeysDir = Join-Path $ProjectRoot ".keys"

Write-Host "🔐 Setting up SSO RSA Keys for HR-Payroll Integration..." -ForegroundColor Cyan
Write-Host ""

# Check if keys exist
$PrivateKeyPath = Join-Path $KeysDir "hr-payroll-private.pem"
$PublicKeyPath = Join-Path $KeysDir "hr-payroll-public.pem"

if (-not (Test-Path $PrivateKeyPath) -or -not (Test-Path $PublicKeyPath)) {
    Write-Host "❌ RSA keys not found. Generating keys first..." -ForegroundColor Yellow
    node (Join-Path $ScriptDir "generate-rsa-keys.js")
}

# Read keys
$PrivateKey = (Get-Content $PrivateKeyPath -Raw) -replace "`r?`n", "\n"
$PublicKey = (Get-Content $PublicKeyPath -Raw) -replace "`r?`n", "\n"

Write-Host "✅ Keys loaded from .keys directory" -ForegroundColor Green
Write-Host ""
Write-Host "📝 Add these to your environment:" -ForegroundColor Yellow
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""
Write-Host "For HR System (.env in root directory):" -ForegroundColor Cyan
Write-Host "HR_PAYROLL_JWT_PRIVATE_KEY=`"$PrivateKey`""
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""
Write-Host "For Payroll System (docker-compose.yml environment section):" -ForegroundColor Cyan
Write-Host "HR_PAYROLL_JWT_PUBLIC_KEY=`"$PublicKey`""
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""
Write-Host "⚠️  After adding keys, restart services:" -ForegroundColor Yellow
Write-Host "   docker-compose restart api payroll-api"
Write-Host ""

