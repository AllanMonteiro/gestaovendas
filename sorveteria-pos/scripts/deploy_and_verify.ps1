param(
    [string]$ComposeFiles = "docker-compose.prod.yml",
    [string]$ComposeEnvFile = ".env.prod",
    [string]$BaseUrl = "http://localhost:8000",
    [string]$FallbackBaseUrl = "http://localhost",
    [int]$HealthTimeoutSec = 120
)

$ErrorActionPreference = "Stop"

$files = $ComposeFiles.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ }
if ($files.Count -eq 0) {
    throw "Compose files list is empty."
}

$composeArgs = @()
foreach ($f in $files) {
    $composeArgs += @("-f", $f)
}

Write-Host "Starting containers..." -ForegroundColor Cyan
if (Test-Path $ComposeEnvFile) {
    docker compose --env-file $ComposeEnvFile @composeArgs up -d --build
}
else {
    docker compose @composeArgs up -d --build
}

function Test-Health {
    param([string]$Url)
    try {
        $res = Invoke-RestMethod -Uri "$Url/health" -Method GET -TimeoutSec 8 -ErrorAction Stop
        return ($res.status -eq "ok")
    }
    catch {
        return $false
    }
}

$selectedBase = $BaseUrl
$deadline = (Get-Date).AddSeconds($HealthTimeoutSec)

Write-Host "Waiting for health endpoint..." -ForegroundColor Cyan
while ((Get-Date) -lt $deadline) {
    if (Test-Health -Url $BaseUrl) {
        $selectedBase = $BaseUrl
        break
    }
    if ($FallbackBaseUrl -and (Test-Health -Url $FallbackBaseUrl)) {
        $selectedBase = $FallbackBaseUrl
        break
    }
    Start-Sleep -Seconds 2
}

if (-not (Test-Health -Url $selectedBase)) {
    Write-Host "Health check failed for both URLs:" -ForegroundColor Red
    Write-Host " - $BaseUrl" -ForegroundColor Red
    if ($FallbackBaseUrl) { Write-Host " - $FallbackBaseUrl" -ForegroundColor Red }
    exit 1
}

Write-Host "Health OK at $selectedBase" -ForegroundColor Green

Write-Host "Running smoke test..." -ForegroundColor Cyan
powershell -ExecutionPolicy Bypass -File "scripts\smoke_test.ps1" -BaseUrl $selectedBase -FallbackBaseUrl $FallbackBaseUrl

if ($LASTEXITCODE -ne 0) {
    Write-Host "Smoke test failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "Deploy + verification completed successfully." -ForegroundColor Green
