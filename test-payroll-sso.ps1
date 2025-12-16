# Test Payroll SSO endpoint
# First, get your auth token from browser localStorage after logging into HR
# Then run this script with your token

param(
    [Parameter(Mandatory=$true)]
    [string]$Token
)

$headers = @{
    "Authorization" = "Bearer $Token"
    "Content-Type" = "application/json"
}

try {
    $response = Invoke-RestMethod -Uri "http://localhost:3001/api/payroll/sso" -Method GET -Headers $headers
    Write-Host "✅ SSO URL generated:" -ForegroundColor Green
    Write-Host $response.redirectUrl -ForegroundColor Cyan
    Write-Host "`nOpen this URL in your browser to test Payroll SSO"
} catch {
    Write-Host "❌ Error:" -ForegroundColor Red
    Write-Host $_.Exception.Message
}

