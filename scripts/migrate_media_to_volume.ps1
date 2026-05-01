param(
    [string]$ComposeFile = "docker-compose.prod.yml",
    [string]$ComposeEnvFile = ".env.prod",
    [string]$BackendService = "backend",
    [string]$MediaPath = "/app/media",
    [string]$VolumeName = "sorveteria-pos_media_data",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

if (-not (Test-Path $ComposeFile)) {
    throw "Compose file not found: $ComposeFile"
}

$composeArgs = @()
if ($ComposeEnvFile -and (Test-Path $ComposeEnvFile)) {
    $composeArgs += @("--env-file", $ComposeEnvFile)
}
$composeArgs += @("-f", $ComposeFile)

Write-Host "Resolving backend container..." -ForegroundColor Cyan
$backendContainerIdOutput = docker compose @composeArgs ps -q $BackendService
$backendContainerId = if ($null -eq $backendContainerIdOutput) { "" } else { ([string]$backendContainerIdOutput).Trim() }
if (-not $backendContainerId) {
    throw "No running container found for service '$BackendService'. Start the current stack before migrating media."
}

$tempRoot = Join-Path $PWD ".tmp\media-migration"
$sourceDir = Join-Path $tempRoot "source"

if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
New-Item -ItemType Directory -Path $sourceDir | Out-Null

Write-Host "Copying media from container $backendContainerId ..." -ForegroundColor Cyan
docker cp "${backendContainerId}:${MediaPath}/." $sourceDir

Write-Host "Ensuring Docker volume $VolumeName exists..." -ForegroundColor Cyan
$existingVolumeOutput = docker volume ls -q --filter "name=^${VolumeName}$"
$existingVolume = if ($null -eq $existingVolumeOutput) { "" } else { ([string]$existingVolumeOutput).Trim() }
if (-not $existingVolume) {
    docker volume create $VolumeName | Out-Null
}

$sourceFiles = Get-ChildItem -LiteralPath $sourceDir -Force -Recurse -ErrorAction SilentlyContinue
if (-not $sourceFiles) {
    Write-Host "No files were found under $MediaPath in container $backendContainerId." -ForegroundColor Yellow
    Write-Host "Nothing to migrate. The media volume $VolumeName is ready for future uploads." -ForegroundColor Green
    if (Test-Path $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
    exit 0
}

$mountSource = (Resolve-Path $sourceDir).Path -replace '\\', '/'
if ($mountSource -match '^[A-Za-z]:/') {
    $mountSource = "/$($mountSource.Substring(0,1).ToLower())$($mountSource.Substring(2))"
}

$existingCount = docker run --rm -v "${VolumeName}:/target" alpine sh -c "find /target -mindepth 1 | wc -l"
$existingCountText = if ($null -eq $existingCount) { "0" } else { ([string]$existingCount).Trim() }
$hasExistingData = [int]$existingCountText -gt 0
if ($hasExistingData -and -not $Force) {
    throw "Volume $VolumeName already contains files. Re-run with -Force if you want to overwrite it."
}

if ($hasExistingData -and $Force) {
    Write-Host "Clearing existing files from volume $VolumeName ..." -ForegroundColor Yellow
    docker run --rm -v "${VolumeName}:/target" alpine sh -c "rm -rf /target/* /target/.[!.]* /target/..?*"
}

Write-Host "Copying media into Docker volume $VolumeName ..." -ForegroundColor Cyan
docker run --rm -v "${VolumeName}:/target" -v "${mountSource}:/source:ro" alpine sh -c "cp -a /source/. /target/"

$finalCount = docker run --rm -v "${VolumeName}:/target" alpine sh -c "find /target -type f | wc -l"
$finalCountText = if ($null -eq $finalCount) { "0" } else { ([string]$finalCount).Trim() }
Write-Host "Media migration completed. Files in volume: $finalCountText" -ForegroundColor Green
Write-Host "You can now recreate the stack with the updated compose safely." -ForegroundColor Green

if (Test-Path $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
}
