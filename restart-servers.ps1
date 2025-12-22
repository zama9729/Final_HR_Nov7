# Script to restart backend and start AI server
Write-Host "🔄 Restarting Backend Server..." -ForegroundColor Cyan

# Kill existing node processes (backend)
Get-Process | Where-Object {$_.ProcessName -eq "node" -and $_.Path -like "*server*"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# Start Backend Server
Write-Host "🚀 Starting Backend Server..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd server; npm run dev" -WindowStyle Normal

Start-Sleep -Seconds 3

# Start AI RAG Service (if docker-compose exists)
if (Test-Path "rag-service\docker-compose.yml") {
    Write-Host "🤖 Starting AI RAG Service..." -ForegroundColor Green
    Set-Location rag-service
    docker-compose up -d
    Set-Location ..
    Write-Host "✅ AI RAG Service started on port 8001" -ForegroundColor Green
} else {
    Write-Host "⚠️  RAG service docker-compose.yml not found. AI chat will use OpenAI directly." -ForegroundColor Yellow
}

Write-Host "`n✅ Servers are starting..." -ForegroundColor Green
Write-Host "   - Backend: http://localhost:3001" -ForegroundColor Cyan
Write-Host "   - AI RAG Service: http://localhost:8001 (if started)" -ForegroundColor Cyan
Write-Host "`n📝 Check the backend terminal window for logs" -ForegroundColor Yellow


