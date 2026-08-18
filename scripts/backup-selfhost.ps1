param(
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

if ($RetentionDays -lt 1) {
  throw "RetentionDays must be at least 1."
}

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backupDirectory = Join-Path $projectDirectory "backups"
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null

function Get-SelfHostValue([string]$Name, [string]$Default) {
  $match = Get-Content -LiteralPath (Join-Path $projectDirectory ".env.selfhost") |
    Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
    Select-Object -Last 1
  if (-not $match) { return $Default }
  return ($match -split "=", 2)[1].Trim()
}

$databaseName = Get-SelfHostValue "SELFHOST_DB_NAME" "tdgpt"
$databaseUser = Get-SelfHostValue "SELFHOST_DB_USER" "tdgpt"
if ($databaseName -notmatch '^[A-Za-z0-9_]+$' -or $databaseUser -notmatch '^[A-Za-z0-9_]+$') {
  throw "SELFHOST_DB_NAME and SELFHOST_DB_USER may contain only letters, digits, and underscores."
}

$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()
$wslBackupDirectory = (wsl.exe -d $distribution -- wslpath -a $backupDirectory).Trim()
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "tdgpt-$timestamp.dump"
$wslBackupPath = "$wslBackupDirectory/$fileName"
$backupPath = Join-Path $backupDirectory $fileName

if ($wslProjectDirectory.Contains("'") -or $wslBackupPath.Contains("'")) {
  throw "Self-host paths containing apostrophes are not supported."
}
$quotedProject = "'$wslProjectDirectory'"
$quotedBackup = "'$wslBackupPath'"
$readyCommand = "cd $quotedProject && docker compose --env-file .env.selfhost up -d --wait postgres"
wsl.exe -d $distribution -- bash -lc $readyCommand
if ($LASTEXITCODE -ne 0) {
  throw "PostgreSQL did not become ready for backup."
}

$command = "cd $quotedProject && docker compose --env-file .env.selfhost exec -T postgres pg_dump -U $databaseUser -d $databaseName --format=custom --compress=6 --no-owner --no-privileges > $quotedBackup"

wsl.exe -d $distribution -- bash -lc $command
if ($LASTEXITCODE -ne 0) {
  Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
  throw "PostgreSQL backup failed with exit code $LASTEXITCODE."
}

if (-not (Test-Path -LiteralPath $backupPath) -or (Get-Item -LiteralPath $backupPath).Length -eq 0) {
  Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
  throw "Backup archive was not created or is empty."
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $backupDirectory -Filter "tdgpt-*.dump" -File |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  Remove-Item -Force

$sizeMb = [math]::Round((Get-Item -LiteralPath $backupPath).Length / 1MB, 2)
Write-Output "Backup created: $backupPath ($sizeMb MB)"
Write-Output "Retention: $RetentionDays days"
