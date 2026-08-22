$ErrorActionPreference = "Stop"

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $projectDirectory ".env.selfhost"
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()
$databaseName = "tdgpt_baseline_validation_$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

function Get-SelfHostValue([string]$Name, [string]$Default) {
  $match = Get-Content -LiteralPath $envFile |
    Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
    Select-Object -Last 1
  if (-not $match) { return $Default }
  return ($match -split "=", 2)[1].Trim()
}

$databaseUser = Get-SelfHostValue "SELFHOST_DB_USER" "tdgpt"
if ($databaseUser -notmatch '^[A-Za-z0-9_]+$') {
  throw "SELFHOST_DB_USER may contain only letters, digits, and underscores."
}

$quotedProject = "'$wslProjectDirectory'"
$baseCommand = "cd $quotedProject && docker compose --env-file .env.selfhost"
$created = $false

try {
  wsl.exe -d $distribution -- bash -lc "$baseCommand build db-init"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not build the current migration validation image."
  }

  wsl.exe -d $distribution -- bash -lc "$baseCommand exec -T postgres createdb -U $databaseUser $databaseName"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not create the isolated validation database."
  }
  $created = $true

  $deploy = "cd $quotedProject && export SELFHOST_DB_NAME=$databaseName && docker compose --env-file .env.selfhost run --rm --entrypoint npx db-init prisma migrate deploy"
  wsl.exe -d $distribution -- bash -lc $deploy
  if ($LASTEXITCODE -ne 0) {
    throw "The baseline migration failed in the isolated database."
  }

  $diff = "cd $quotedProject && export SELFHOST_DB_NAME=$databaseName && docker compose --env-file .env.selfhost run --rm --entrypoint npx db-init prisma migrate diff --exit-code --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma"
  wsl.exe -d $distribution -- bash -lc $diff
  if ($LASTEXITCODE -ne 0) {
    throw "The migrated database differs from prisma/schema.prisma."
  }

  Write-Output "Migration baseline validated against an isolated PostgreSQL database."
} finally {
  if ($created) {
    wsl.exe -d $distribution -- bash -lc "$baseCommand exec -T postgres dropdb --force -U $databaseUser $databaseName"
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Could not remove temporary database $databaseName."
    }
  }
}
