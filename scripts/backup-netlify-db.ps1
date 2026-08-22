param([int]$RetentionDays = 14)

$ErrorActionPreference = "Stop"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envPath = Join-Path $projectDirectory ".env"
$databaseLine = Get-Content -LiteralPath $envPath | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -Last 1
if (-not $databaseLine) { throw "DATABASE_URL is missing from .env." }
$databaseUrl = ($databaseLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
if ($databaseUrl -notmatch '^postgres(?:ql)?://') { throw "DATABASE_URL is not a PostgreSQL URL." }

$backupDirectory = Join-Path $projectDirectory "backups"
New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$backupPath = Join-Path $backupDirectory ("netlify-{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$wslBackupPath = (wsl.exe -d Ubuntu-24.04 -- wslpath -a $backupPath).Trim()

$escapedUrl = $databaseUrl.Replace("'", "'\''")
$escapedPath = $wslBackupPath.Replace("'", "'\''")
$command = "docker run --rm postgres:17-alpine pg_dump '$escapedUrl' --format=custom --compress=6 --no-owner --no-privileges > '$escapedPath'"
wsl.exe -d Ubuntu-24.04 -- bash -lc $command
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $backupPath) -or (Get-Item -LiteralPath $backupPath).Length -eq 0) {
  Remove-Item -LiteralPath $backupPath -Force -ErrorAction SilentlyContinue
  throw "Netlify PostgreSQL backup failed."
}

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -LiteralPath $backupDirectory -Filter 'netlify-*.dump' -File |
  Where-Object { $_.LastWriteTime -lt $cutoff } |
  Remove-Item -Force

$sizeMb = [math]::Round((Get-Item -LiteralPath $backupPath).Length / 1MB, 2)
Write-Output "Netlify database backup created: $backupPath ($sizeMb MB)"
