# PowerShell Light Theme Script
Write-Host "Changing console to light theme..." -ForegroundColor Cyan

# Set console colors to light theme
[Console]::BackgroundColor = 'White'
[Console]::ForegroundColor = 'Black'
Clear-Host

Write-Host "Console theme changed to light mode!" -ForegroundColor Green
Write-Host "Background: White" -ForegroundColor Black -BackgroundColor White
Write-Host "Foreground: Black" -ForegroundColor Black -BackgroundColor White


