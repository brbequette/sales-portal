param(
  [Parameter(Mandatory = $true)]
  [string]$BackupPath,

  [switch]$ConfirmRestore
)

$ErrorActionPreference = "Stop"

if (-not $ConfirmRestore) {
  throw "Restore replaces the current local TDGPT database. Re-run with -ConfirmRestore to proceed."
}

$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
if ([IO.Path]::GetExtension($resolvedBackup) -ne ".dump") {
  throw "Expected a PostgreSQL custom-format .dump archive."
}

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()
$wslBackupPath = (wsl.exe -d $distribution -- wslpath -a $resolvedBackup).Trim()

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

if ($wslProjectDirectory.Contains("'") -or $wslBackupPath.Contains("'")) {
  throw "Self-host paths containing apostrophes are not supported."
}
$quotedProject = "'$wslProjectDirectory'"
$quotedBackup = "'$wslBackupPath'"

$verifyCommand = "cd $quotedProject && docker compose --env-file .env.selfhost exec -T postgres pg_restore --list < $quotedBackup >/dev/null"
wsl.exe -d $distribution -- bash -lc $verifyCommand
if ($LASTEXITCODE -ne 0) {
  throw "The backup archive failed PostgreSQL validation. The database was not changed."
}

wsl.exe -d $distribution -- bash -lc "cd $quotedProject && docker compose --env-file .env.selfhost stop app"
if ($LASTEXITCODE -ne 0) {
  throw "Could not stop the application before restore."
}

try {
  $restoreCommand = "cd $quotedProject && docker compose --env-file .env.selfhost exec -T postgres pg_restore -U $databaseUser -d $databaseName --clean --if-exists --no-owner --no-privileges < $quotedBackup"
  wsl.exe -d $distribution -- bash -lc $restoreCommand
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL restore failed with exit code $LASTEXITCODE."
  }
} finally {
  wsl.exe -d $distribution -- bash -lc "cd $quotedProject && docker compose --env-file .env.selfhost up -d app"
}

Write-Output "Database restored from: $resolvedBackup"
Write-Output "TDGPT is starting at http://localhost:3000/login"
