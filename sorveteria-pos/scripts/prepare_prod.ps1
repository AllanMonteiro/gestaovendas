param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Copy-IfMissing {
    param(
        [string]$Source,
        [string]$Destination
    )

    if ((Test-Path $Destination) -and -not $Force) {
        Write-Host "Skipping existing file: $Destination" -ForegroundColor Yellow
        return
    }

    Copy-Item -Path $Source -Destination $Destination -Force
    Write-Host "Created: $Destination" -ForegroundColor Green
}

Set-Location (Join-Path $PSScriptRoot "..")

Copy-IfMissing ".env.prod.example" ".env.prod"
Copy-IfMissing "backend/.env.production.example" "backend/.env.production"

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1) Edit .env.prod (domains and runtime flags)." -ForegroundColor Cyan
Write-Host "2) Edit backend/.env.production (secret, database, redis)." -ForegroundColor Cyan
Write-Host "3) Run: powershell -ExecutionPolicy Bypass -File scripts/deploy_prod.ps1" -ForegroundColor Cyan
