param(
    [switch]$SkipSmoke
)

$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")
$env:REQUIRE_AUTH = "0"

Write-Host "Starting local Docker stack..." -ForegroundColor Cyan
docker compose -f docker-compose.prod.yml up -d --build

Write-Host "Running Django migrations..." -ForegroundColor Cyan
docker compose -f docker-compose.prod.yml exec -T backend python manage.py migrate

Write-Host "Waiting for local endpoints..." -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(3)
do {
    try {
        $backendHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8001/health" -Method GET -TimeoutSec 8 -ErrorAction Stop
        $frontend = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:8000" -Method GET -TimeoutSec 8 -ErrorAction Stop
        if ($backendHealth.status -eq "ok" -and $frontend.StatusCode -eq 200) {
            Write-Host "Local stack ready." -ForegroundColor Green
            break
        }
    }
    catch {
    }
    Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)

if ((Get-Date) -ge $deadline) {
    throw "Local stack timeout. Check logs with: docker compose -f docker-compose.prod.yml logs --tail=200"
}

if (-not $SkipSmoke) {
    Write-Host "Running local smoke checks..." -ForegroundColor Cyan
    $checks = @(
        "http://127.0.0.1:8001/health",
        "http://127.0.0.1:8000/api/config",
        "http://127.0.0.1:8000/api/categories",
        "http://127.0.0.1:8000/api/products",
        "http://127.0.0.1:8000/api/orders/open",
        "http://127.0.0.1:8000/api/cash/status"
    )

    foreach ($url in $checks) {
        $response = Invoke-WebRequest -UseBasicParsing -Uri $url -Method GET -TimeoutSec 15
        Write-Host ("{0} -> {1}" -f $url, $response.StatusCode) -ForegroundColor Green
    }
}

Write-Host "Application URL: http://localhost:8000" -ForegroundColor Green
Write-Host "Backend health: http://localhost:8001/health" -ForegroundColor Green
