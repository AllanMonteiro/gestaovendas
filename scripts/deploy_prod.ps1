param(
    [switch]$SkipSmoke,
    [string]$SmokeEmail = "",
    [string]$SmokePassword = ""
)

$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path ".env.prod")) {
    throw "Missing .env.prod. Run scripts/prepare_prod.ps1 first."
}

if (-not (Test-Path "backend/.env.production")) {
    throw "Missing backend/.env.production. Run scripts/prepare_prod.ps1 first."
}

Write-Host "Starting production stack..." -ForegroundColor Cyan
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

Write-Host "Waiting for backend health..." -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(3)
do {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method GET -TimeoutSec 8 -ErrorAction Stop
        if ($health.status -eq "ok") {
            Write-Host "Backend health: ok" -ForegroundColor Green
            break
        }
    }
    catch {
    }
    Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)

if ((Get-Date) -ge $deadline) {
    throw "Backend health timeout. Check logs: docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail=200 backend"
}

if (-not $SkipSmoke) {
    Write-Host "Running smoke test..." -ForegroundColor Cyan
    if (-not $SmokeEmail) { $SmokeEmail = $env:SMOKE_EMAIL }
    if (-not $SmokePassword) { $SmokePassword = $env:SMOKE_PASSWORD }

    if ($SmokeEmail -and $SmokePassword) {
        powershell -ExecutionPolicy Bypass -File "scripts/smoke_test.ps1" -BaseUrl "http://127.0.0.1:8000" -Email $SmokeEmail -Password $SmokePassword
    }
    else {
        powershell -ExecutionPolicy Bypass -File "scripts/smoke_test.ps1" -BaseUrl "http://127.0.0.1:8000"
    }
}

Write-Host "Done." -ForegroundColor Green
