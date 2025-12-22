# Complete App Restart Script
Write-Host ""
Write-Host "RESTARTING ENTIRE APPLICATION..." -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Stop all Node.js processes (Frontend & Backend)
Write-Host "1. Stopping all Node.js processes..." -ForegroundColor Yellow
Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Write-Host "   Node processes stopped" -ForegroundColor Green
Write-Host ""

# Step 2: Stop Docker containers (if running)
Write-Host "2. Checking Docker containers..." -ForegroundColor Yellow
if (Get-Command docker -ErrorAction SilentlyContinue) {
    $containers = docker ps -q
    if ($containers) {
        Write-Host "   Stopping Docker containers..." -ForegroundColor Yellow
        docker stop $containers 2>$null
        Start-Sleep -Seconds 2
        Write-Host "   Docker containers stopped" -ForegroundColor Green
    } else {
        Write-Host "   No running Docker containers" -ForegroundColor Gray
    }
} else {
    Write-Host "   Docker not found, skipping" -ForegroundColor Yellow
}
Write-Host ""

# Step 3: Start Docker services (Postgres, Redis, MinIO)
Write-Host "3. Starting Docker infrastructure services..." -ForegroundColor Yellow
if (Test-Path "docker-compose.yml") {
    docker-compose up -d postgres redis minio 2>$null
    Write-Host "   Infrastructure services started" -ForegroundColor Green
    Start-Sleep -Seconds 3
} else {
    Write-Host "   docker-compose.yml not found, skipping" -ForegroundColor Yellow
}
Write-Host ""

# Step 4: Start Backend Server
Write-Host "4. Starting Backend Server..." -ForegroundColor Yellow
$backendCmd = "cd '$PWD\server'; Write-Host 'Backend Server Starting...' -ForegroundColor Green; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $backendCmd -WindowStyle Normal
Start-Sleep -Seconds 3
Write-Host "   Backend server starting in new window" -ForegroundColor Green
Write-Host ""

# Step 5: Start Frontend Server
Write-Host "5. Starting Frontend Server..." -ForegroundColor Yellow
$frontendCmd = "cd '$PWD'; Write-Host 'Frontend Server Starting...' -ForegroundColor Green; npm run dev"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $frontendCmd -WindowStyle Normal
Start-Sleep -Seconds 2
Write-Host "   Frontend server starting in new window" -ForegroundColor Green
Write-Host ""

# Step 6: Start AI RAG Service
Write-Host "6. Starting AI RAG Service..." -ForegroundColor Yellow
if (Test-Path "rag-service\docker-compose.yml") {
    Set-Location rag-service
    docker-compose up -d 2>$null
    Set-Location ..
    Write-Host "   AI RAG Service started" -ForegroundColor Green
} else {
    Write-Host "   RAG service not found, AI will use OpenAI directly" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host ""
Write-Host "APPLICATION RESTART COMPLETE!" -ForegroundColor Green
Write-Host "=====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Services:" -ForegroundColor White
Write-Host "   - Frontend:     http://localhost:3000 (or port shown in terminal)" -ForegroundColor Cyan
Write-Host "   - Backend API:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "   - AI RAG:       http://localhost:8001" -ForegroundColor Cyan
Write-Host "   - MinIO:        http://localhost:9001" -ForegroundColor Cyan
Write-Host ""
Write-Host "Check the terminal windows for logs and any errors" -ForegroundColor Yellow
Write-Host ""
