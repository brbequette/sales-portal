$ErrorActionPreference = "Stop"

$baselineName = "00000000000000_baseline"
$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $projectDirectory ".env.selfhost"
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()

function Get-SelfHostValue([string]$Name, [string]$Default) {
  $match = Get-Content -LiteralPath $envFile |
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

Write-Output "Creating a safety backup before migration adoption..."
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass `
  -File (Join-Path $PSScriptRoot "backup-selfhost.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Safety backup failed. Migration history was not changed."
}

$quotedProject = "'$wslProjectDirectory'"
$baseCommand = "cd $quotedProject && docker compose --env-file .env.selfhost"

wsl.exe -d $distribution -- bash -lc "$baseCommand build db-init"
if ($LASTEXITCODE -ne 0) {
  throw "Could not build the current migration image."
}

$historyTableQuery = "SELECT CASE WHEN to_regclass('public._prisma_migrations') IS NULL THEN 'missing' ELSE 'present' END;"
$historyTable = (& wsl.exe -d $distribution -- docker compose `
  --project-directory $wslProjectDirectory `
  --env-file "$wslProjectDirectory/.env.selfhost" `
  exec -T postgres psql -U $databaseUser -d $databaseName -tAc $historyTableQuery |
  Out-String).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Could not inspect the local migration history."
}

if ($historyTable -eq "present") {
  $baselineQuery = "SELECT count(*) FROM _prisma_migrations WHERE migration_name='$baselineName' AND finished_at IS NOT NULL;"
  $baselineApplied = (& wsl.exe -d $distribution -- docker compose `
    --project-directory $wslProjectDirectory `
    --env-file "$wslProjectDirectory/.env.selfhost" `
    exec -T postgres psql -U $databaseUser -d $databaseName -tAc $baselineQuery |
    Out-String).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Could not inspect the baseline migration record."
  }
  if ($baselineApplied -ne "1") {
    throw "A different Prisma migration history already exists. Manual reconciliation is required."
  }
} elseif ($historyTable -eq "missing") {
  Write-Output "Verifying that the existing database exactly matches prisma/schema.prisma..."
  wsl.exe -d $distribution -- bash -lc "$baseCommand run --rm --entrypoint npx db-init prisma migrate diff --exit-code --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma"
  if ($LASTEXITCODE -ne 0) {
    throw "Schema drift was detected. The baseline was not adopted."
  }

  wsl.exe -d $distribution -- bash -lc "$baseCommand run --rm --entrypoint npx db-init prisma migrate resolve --applied $baselineName"
  if ($LASTEXITCODE -ne 0) {
    throw "Prisma could not record the baseline migration."
  }
} else {
  throw "Unexpected migration history result: $historyTable"
}

wsl.exe -d $distribution -- bash -lc "$baseCommand run --rm --entrypoint npx db-init prisma migrate deploy"
if ($LASTEXITCODE -ne 0) {
  throw "Migration deployment verification failed."
}

Write-Output "The local database now uses the validated Prisma migration baseline."
