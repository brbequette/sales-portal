param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("SYNC")]
  [string]$ConfirmClone
)

$ErrorActionPreference = "Stop"

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupDirectory = Join-Path $projectDirectory "backups"
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()
$wslBackupDirectory = (wsl.exe -d $distribution -- wslpath -a $backupDirectory).Trim()
$countSqlPath = (Resolve-Path (Join-Path $PSScriptRoot "audit-key-counts.sql")).Path
$wslCountSqlPath = (wsl.exe -d $distribution -- wslpath -a $countSqlPath).Trim()
if ($wslProjectDirectory.Contains("'") -or $wslBackupDirectory.Contains("'")) {
  throw "Project and backup paths containing apostrophes are not supported."
}

$quotedProject = "'$wslProjectDirectory'"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$productionDumpName = "tdgpt-prod-for-dev-$timestamp.dump"
$developmentDumpName = "tdgpt-dev-before-sync-$timestamp.dump"
$wslProductionDump = "'$wslBackupDirectory/$productionDumpName'"
$wslDevelopmentDump = "'$wslBackupDirectory/$developmentDumpName'"
$productionDumpPath = Join-Path $backupDirectory $productionDumpName
$developmentDumpPath = Join-Path $backupDirectory $developmentDumpName

function Invoke-WslCommand([string]$Command, [string]$FailureMessage) {
  wsl.exe -d $distribution -- bash -lc $Command
  if ($LASTEXITCODE -ne 0) { throw $FailureMessage }
}

Write-Output "1/7 Starting and validating both PostgreSQL services..."
Invoke-WslCommand "cd $quotedProject && docker compose --env-file .env.selfhost up -d --wait postgres" "Production PostgreSQL is not ready."
Invoke-WslCommand "cd $quotedProject && docker compose -f compose.dev.yaml up -d --wait postgres" "Development PostgreSQL is not ready."

Write-Output "2/7 Backing up authoritative production data..."
Invoke-WslCommand "cd $quotedProject && docker compose --env-file .env.selfhost exec -T postgres pg_dump -U tdgpt -d tdgpt --format=custom --compress=6 --no-owner --no-privileges > $wslProductionDump" "Production backup failed. Development was not changed."

Write-Output "3/7 Backing up the current development database for rollback..."
Invoke-WslCommand "cd $quotedProject && docker compose -f compose.dev.yaml exec -T postgres pg_dump -U tdgpt_dev -d tdgpt_dev --format=custom --compress=6 --no-owner --no-privileges > $wslDevelopmentDump" "Development backup failed. Development was not changed."

foreach ($dumpPath in @($productionDumpPath, $developmentDumpPath)) {
  if (-not (Test-Path -LiteralPath $dumpPath) -or (Get-Item -LiteralPath $dumpPath).Length -eq 0) {
    throw "Expected backup archive is missing or empty: $dumpPath"
  }
}

Write-Output "4/7 Validating both backup archives..."
Invoke-WslCommand "cd $quotedProject && docker compose -f compose.dev.yaml exec -T postgres pg_restore --list < $wslProductionDump >/dev/null" "Production archive validation failed. Development was not changed."
Invoke-WslCommand "cd $quotedProject && docker compose -f compose.dev.yaml exec -T postgres pg_restore --list < $wslDevelopmentDump >/dev/null" "Development rollback archive validation failed. Development was not changed."

Write-Output "5/7 Replacing only the development database..."
Invoke-WslCommand "cd $quotedProject && docker compose -f compose.dev.yaml stop app" "Could not stop the development app."
try {
  Invoke-WslCommand "cd $quotedProject && docker compose -f compose.dev.yaml exec -T postgres dropdb -U tdgpt_dev --if-exists --force tdgpt_dev" "Could not drop the development database."
  Invoke-WslCommand "cd $quotedProject && docker compose -f compose.dev.yaml exec -T postgres createdb -U tdgpt_dev tdgpt_dev" "Could not recreate the development database."
  Invoke-WslCommand "cd $quotedProject && docker compose -f compose.dev.yaml exec -T postgres pg_restore -U tdgpt_dev -d tdgpt_dev --no-owner --no-privileges < $wslProductionDump" "Production data restore into development failed. Use the retained development backup to roll back."
} finally {
  wsl.exe -d $distribution -- bash -lc "cd $quotedProject && docker compose -f compose.dev.yaml up -d app"
}

Write-Output "6/7 Waiting for development health..."
$healthy = $false
for ($attempt = 1; $attempt -le 60; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3001/login" -TimeoutSec 3
    if ($response.StatusCode -eq 200) { $healthy = $true; break }
  } catch { }
  Start-Sleep -Seconds 2
}
if (-not $healthy) { throw "Development did not become healthy after the database clone." }

Write-Output "7/7 Verifying authoritative record counts..."
$quotedCountSql = "'$wslCountSqlPath'"
$prodCountCommand = "cd $quotedProject && docker compose --env-file .env.selfhost exec -T postgres psql -U tdgpt -d tdgpt -AtF '|' < $quotedCountSql"
$devCountCommand = "cd $quotedProject && docker compose -f compose.dev.yaml exec -T postgres psql -U tdgpt_dev -d tdgpt_dev -AtF '|' < $quotedCountSql"
$productionCounts = @(wsl.exe -d $distribution -- bash -lc $prodCountCommand)
if ($LASTEXITCODE -ne 0) { throw "Could not count production records." }
$developmentCounts = @(wsl.exe -d $distribution -- bash -lc $devCountCommand)
if ($LASTEXITCODE -ne 0) { throw "Could not count development records." }
if (($productionCounts -join "`n") -ne ($developmentCounts -join "`n")) {
  throw "Key record counts do not match after the clone."
}
$productionCounts | ForEach-Object { Write-Output $_ }

$productionSize = [math]::Round((Get-Item -LiteralPath $productionDumpPath).Length / 1MB, 2)
$developmentSize = [math]::Round((Get-Item -LiteralPath $developmentDumpPath).Length / 1MB, 2)
Write-Output "Production-to-development clone completed successfully."
Write-Output "Production snapshot: $productionDumpPath ($productionSize MB)"
Write-Output "Development rollback: $developmentDumpPath ($developmentSize MB)"
Write-Output "Production remained online at http://localhost:3000."
Write-Output "Development is healthy at http://localhost:3001."
