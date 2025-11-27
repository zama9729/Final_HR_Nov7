# PowerShell script to generate self-signed SSL certificates for Windows
# Usage: .\nginx\ssl-setup.ps1

$sslDir = ".\nginx\ssl"

# Create SSL directory if it doesn't exist
if (-not (Test-Path $sslDir)) {
    New-Item -ItemType Directory -Path $sslDir -Force | Out-Null
    Write-Host "Created directory: $sslDir"
}

# Check if certificates already exist
if ((Test-Path "$sslDir\cert.pem") -and (Test-Path "$sslDir\key.pem")) {
    Write-Host "SSL certificates already exist in $sslDir" -ForegroundColor Yellow
    Write-Host "To regenerate, delete the existing files and run this script again."
    exit 0
}

Write-Host "Generating self-signed certificate (valid for 365 days)..." -ForegroundColor Cyan

# Check if OpenSSL is available
$opensslPath = Get-Command openssl -ErrorAction SilentlyContinue
if (-not $opensslPath) {
    Write-Host "OpenSSL is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Please install OpenSSL:" -ForegroundColor Yellow
    Write-Host "  1. Download from: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor Yellow
    Write-Host "  2. Or use Chocolatey: choco install openssl" -ForegroundColor Yellow
    Write-Host "  3. Or use Git Bash (includes OpenSSL)" -ForegroundColor Yellow
    exit 1
}

# Generate self-signed certificate
$certPath = "$sslDir\cert.pem"
$keyPath = "$sslDir\key.pem"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 `
    -keyout $keyPath `
    -out $certPath `
    -subj "/C=US/ST=State/L=City/O=Organization/CN=localhost" `
    -addext "subjectAltName=DNS:localhost,DNS:*.localhost,IP:127.0.0.1,IP:::1"

if ($LASTEXITCODE -eq 0) {
    Write-Host "SSL certificates generated successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Certificate details:" -ForegroundColor Cyan
    Write-Host "  Certificate: $certPath"
    Write-Host "  Private Key: $keyPath"
    Write-Host ""
    Write-Host "Note: These are self-signed certificates for development only." -ForegroundColor Yellow
    Write-Host "For production, use certificates from Let's Encrypt or your CA." -ForegroundColor Yellow
} else {
    Write-Host "Failed to generate certificates. Check OpenSSL installation." -ForegroundColor Red
    exit 1
}

