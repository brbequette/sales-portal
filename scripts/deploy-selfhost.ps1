param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("DEPLOY")]
  [string]$ConfirmProduction,
  [int]$HealthTimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

if ($HealthTimeoutSeconds -lt 30) {
  throw "HealthTimeoutSeconds must be at least 30."
}

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $projectDirectory ".env.selfhost"

if (-not (Test-Path -LiteralPath $envFile)) {
  throw ".env.selfhost is missing. Production deployment aborted."
}

Write-Output "1/6 Checking the release patch..."
Push-Location $projectDirectory
try {
  & git diff --check
  if ($LASTEXITCODE -ne 0) {
    throw "git diff --check failed. Production deployment aborted."
  }
} finally {
  Pop-Location
}

Write-Output "2/6 Creating the mandatory production database backup..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "backup-selfhost.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Production backup failed. No application changes were deployed."
}

$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()
if (-not $wslProjectDirectory -or $wslProjectDirectory.Contains("'")) {
  throw "The project path could not be safely converted for WSL."
}
$quotedProject = "'$wslProjectDirectory'"
$compose = "cd $quotedProject && docker compose --env-file .env.selfhost"

Write-Output "3/6 Building the production application image..."
wsl.exe -d $distribution -- bash -lc "$compose build app db-init"
if ($LASTEXITCODE -ne 0) {
  throw "Production image build failed. The existing application remains in place."
}

Write-Output "4/6 Applying validated database migrations..."
wsl.exe -d $distribution -- bash -lc "$compose run --rm db-init"
if ($LASTEXITCODE -ne 0) {
  throw "Database migration failed. Review the error and use restore-selfhost.ps1 only if required."
}

Write-Output "5/6 Starting the application and automatic Books sync worker..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-selfhost.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "The updated application failed to start. The pre-deployment backup is available for rollback."
}

Write-Output "6/6 Verifying production service health..."
$deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
do {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3000/login" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
      Write-Output "Production deployment completed successfully."
      Write-Output "TDGPT is healthy at http://localhost:3000/login"
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 3
  }
} while ((Get-Date) -lt $deadline)

throw "Deployment finished, but the production health check did not pass. Use the retained backup and container logs to diagnose or roll back."
