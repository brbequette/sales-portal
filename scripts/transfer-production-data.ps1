$ErrorActionPreference = "Stop"

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $projectDirectory ".env"
$selfHostEnvFile = Join-Path $projectDirectory ".env.selfhost"
$backupDirectory = Join-Path $projectDirectory "backups"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$candidateDatabase = "tdgpt_import_$stamp" -replace '-', '_'
$rollbackDatabase = "tdgpt_preimport_$stamp" -replace '-', '_'
$dumpPath = Join-Path $backupDirectory "production-data-$stamp.sql"
$temporaryEnvPath = Join-Path $backupDirectory ".production-transfer-$stamp.env"
$temporarySqlPath = Join-Path $backupDirectory ".production-transfer-$stamp.sql"

function Get-EnvValue([string]$Path, [string]$Name, [string]$Default = "") {
  $match = Get-Content -LiteralPath $Path |
    Where-Object { $_ -match "^$([regex]::Escape($Name))=" } |
    Select-Object -Last 1
  if (-not $match) { return $Default }
  return ($match -split "=", 2)[1].Trim().Trim('"').Trim("'")
}

$sourceDatabaseUrl = Get-EnvValue $envFile "DATABASE_URL"
$localDatabase = Get-EnvValue $selfHostEnvFile "SELFHOST_DB_NAME" "tdgpt"
$localUser = Get-EnvValue $selfHostEnvFile "SELFHOST_DB_USER" "tdgpt"
$localPassword = Get-EnvValue $selfHostEnvFile "SELFHOST_DB_PASSWORD"
if ([string]::IsNullOrWhiteSpace($sourceDatabaseUrl)) {
  throw "Production DATABASE_URL is missing from .env."
}
if ($sourceDatabaseUrl -match '@(?:postgres|localhost|127\.0\.0\.1)(?::|/)') {
  throw "The production source points at a local database. Transfer aborted."
}
if ($localDatabase -notmatch '^[A-Za-z0-9_]+$' -or $localUser -notmatch '^[A-Za-z0-9_]+$' -or [string]::IsNullOrWhiteSpace($localPassword)) {
  throw "Local database credentials are missing or the database name/user contains unsupported characters."
}

try {
  $sourceUri = [Uri]$sourceDatabaseUrl
  $sourceUserInfo = $sourceUri.UserInfo -split ':', 2
  if ($sourceUserInfo.Count -ne 2) { throw "missing credentials" }
  $sourcePgUser = [Uri]::UnescapeDataString($sourceUserInfo[0])
  $sourcePgPassword = [Uri]::UnescapeDataString($sourceUserInfo[1])
  $sourcePgHost = $sourceUri.Host
  $sourcePgPort = if ($sourceUri.IsDefaultPort) { 5432 } else { $sourceUri.Port }
  $sourcePgDatabase = $sourceUri.AbsolutePath.TrimStart('/')
  $sourcePgSslMode = if ($sourceUri.Query -match '(?:^|[?&])sslmode=([^&]+)') {
    [Uri]::UnescapeDataString($matches[1])
  } else {
    "require"
  }
  if ([string]::IsNullOrWhiteSpace($sourcePgHost) -or [string]::IsNullOrWhiteSpace($sourcePgDatabase)) {
    throw "missing host or database"
  }
} catch {
  throw "Production DATABASE_URL could not be parsed safely."
}

New-Item -ItemType Directory -Path $backupDirectory -Force | Out-Null
$wslProject = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()
$wslDump = (wsl.exe -d $distribution -- wslpath -a $dumpPath).Trim()
$wslBackupDirectory = (wsl.exe -d $distribution -- wslpath -a $backupDirectory).Trim()
$wslTemporaryEnv = (wsl.exe -d $distribution -- wslpath -a $temporaryEnvPath).Trim()
$quotedProject = "'$wslProject'"
$quotedDump = "'$wslDump'"
$quotedTemporaryEnv = "'$wslTemporaryEnv'"
$baseCommand = "cd $quotedProject && docker compose --env-file .env.selfhost"
$candidateCreated = $false
$swapCompleted = $false

$verificationSql = 'SELECT ''User='' || count(*) FROM public."User" UNION ALL SELECT ''Account='' || count(*) FROM public."Account" UNION ALL SELECT ''Contact='' || count(*) FROM public."Contact" UNION ALL SELECT ''Product='' || count(*) FROM public."Product" UNION ALL SELECT ''Quote='' || count(*) FROM public."Quote" UNION ALL SELECT ''SalesOrder='' || count(*) FROM public."SalesOrder" UNION ALL SELECT ''Invoice='' || count(*) FROM public."Invoice" UNION ALL SELECT ''Deal='' || count(*) FROM public."Deal" UNION ALL SELECT ''Task='' || count(*) FROM public."Task" ORDER BY 1;'

function Write-Utf8File([string]$Path, [string]$Content) {
  [IO.File]::WriteAllText($Path, $Content, (New-Object Text.UTF8Encoding($false)))
}

function Set-LocalClientEnvironment([string]$Database) {
  Write-Utf8File $temporaryEnvPath "PGHOST=postgres`nPGPORT=5432`nPGDATABASE=$Database`nPGUSER=$localUser`nPGPASSWORD=$localPassword"
}

function Invoke-LocalSql([string]$Database, [string]$Sql, [switch]$TuplesOnly) {
  Write-Utf8File $temporarySqlPath $Sql
  Set-LocalClientEnvironment $Database
  $arguments = @(
    "-d", $distribution, "--", "docker", "run", "--rm",
    "--network", "tdgpt_internal",
    "--env-file", $wslTemporaryEnv,
    "-v", "${wslBackupDirectory}:/transfer:ro",
    "postgres:17-alpine", "psql", "-v", "ON_ERROR_STOP=1"
  )
  if ($TuplesOnly) { $arguments += "-At" }
  $arguments += @("-f", "/transfer/$(Split-Path $temporarySqlPath -Leaf)")
  $output = @(& wsl.exe $arguments)
  if ($LASTEXITCODE -ne 0) { throw "A guarded PostgreSQL command failed." }
  return $output
}

try {
  Write-Output "1/8 Backing up the current local database..."
  & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass `
    -File (Join-Path $PSScriptRoot "backup-selfhost.ps1")
  if ($LASTEXITCODE -ne 0) { throw "Local safety backup failed." }

  # The temporary Docker env file prevents the production URL from appearing in
  # process arguments. It is removed in the finally block.
  [IO.File]::WriteAllText(
    $temporaryEnvPath,
    "PGHOST=$sourcePgHost`nPGPORT=$sourcePgPort`nPGDATABASE=$sourcePgDatabase`nPGUSER=$sourcePgUser`nPGPASSWORD=$sourcePgPassword`nPGSSLMODE=$sourcePgSslMode",
    (New-Object Text.UTF8Encoding($false))
  )

  Write-Output "2/8 Creating a read-only production data dump..."
  & wsl.exe -d $distribution -- docker run --rm `
    --env-file $wslTemporaryEnv `
    -v "${wslBackupDirectory}:/transfer" `
    postgres:17-alpine pg_dump `
    --format=plain --data-only --schema=public --no-owner --no-privileges `
    --disable-triggers `
    --exclude-table-data=_prisma_migrations `
    --file="/transfer/$(Split-Path $dumpPath -Leaf)"
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $dumpPath) -or (Get-Item $dumpPath).Length -eq 0) {
    Remove-Item -LiteralPath $dumpPath -Force -ErrorAction SilentlyContinue
    throw "Production data dump failed or produced an empty archive."
  }
  & wsl.exe -d $distribution -- docker run --rm `
    -v "${wslBackupDirectory}:/transfer" `
    postgres:17-alpine sed -i /transaction_timeout/d `
    "/transfer/$(Split-Path $dumpPath -Leaf)"
  if ($LASTEXITCODE -ne 0) {
    throw "Could not normalize the PostgreSQL 17 session directives."
  }
  if (-not (Select-String -LiteralPath $dumpPath -SimpleMatch 'COPY public."User"' -Quiet)) {
    throw "Production data export does not contain the expected application tables."
  }
  Write-Utf8File $temporarySqlPath $verificationSql
  $sourceCounts = @(& wsl.exe -d $distribution -- docker run --rm `
    --env-file $wslTemporaryEnv `
    -v "${wslBackupDirectory}:/transfer:ro" `
    postgres:17-alpine psql -v ON_ERROR_STOP=1 -At `
    -f "/transfer/$(Split-Path $temporarySqlPath -Leaf)")
  if ($LASTEXITCODE -ne 0) { throw "Could not count production records." }

  Write-Output "3/8 Preserving local credential hashes and creating a candidate database..."
  $passwordQuery = 'SELECT encode(convert_to(email,''UTF8''),''base64'') || '':'' || encode(convert_to(password,''UTF8''),''base64'') FROM public."User" WHERE password IS NOT NULL;'
  $passwordRows = @(Invoke-LocalSql $localDatabase $passwordQuery -TuplesOnly)

  & wsl.exe -d $distribution -- docker compose `
    --project-directory $wslProject --env-file "$wslProject/.env.selfhost" `
    exec -T postgres createdb -U $localUser $candidateDatabase
  if ($LASTEXITCODE -ne 0) { throw "Could not create the isolated candidate database." }
  $candidateCreated = $true

  Write-Output "4/8 Applying the validated schema to the candidate..."
  $migrateCommand = "cd $quotedProject && export SELFHOST_DB_NAME=$candidateDatabase && docker compose --env-file .env.selfhost run --rm --entrypoint npx db-init prisma migrate deploy"
  wsl.exe -d $distribution -- bash -lc $migrateCommand
  if ($LASTEXITCODE -ne 0) { throw "Candidate migration failed." }

  Write-Output "5/8 Restoring production rows into the candidate..."
  Set-LocalClientEnvironment $candidateDatabase
  & wsl.exe -d $distribution -- docker run --rm `
    --network tdgpt_internal `
    --env-file $wslTemporaryEnv `
    -v "${wslBackupDirectory}:/transfer:ro" `
    postgres:17-alpine psql -v ON_ERROR_STOP=1 `
    -f "/transfer/$(Split-Path $dumpPath -Leaf)"
  if ($LASTEXITCODE -ne 0) { throw "Production data could not be restored into the candidate database." }

  $passwordUpdateSql = ""
  foreach ($row in $passwordRows) {
    if ($row -notmatch '^([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$') { continue }
    $emailBase64 = $matches[1]
    $hashBase64 = $matches[2]
    $passwordUpdateSql += "UPDATE public.`"User`" SET password=convert_from(decode('$hashBase64','base64'),'UTF8') WHERE email=convert_from(decode('$emailBase64','base64'),'UTF8');`n"
  }
  if ($passwordUpdateSql) { Invoke-LocalSql $candidateDatabase $passwordUpdateSql | Out-Null }

  Write-Output "6/8 Comparing critical production and candidate row counts..."
  $candidateCounts = @(Invoke-LocalSql $candidateDatabase $verificationSql -TuplesOnly)
  if (($sourceCounts -join "`n").Trim() -ne ($candidateCounts -join "`n").Trim()) {
    Write-Output "Production counts:`n$($sourceCounts -join "`n")"
    Write-Output "Candidate counts:`n$($candidateCounts -join "`n")"
    throw "Candidate row counts do not match production."
  }
  Write-Output ($candidateCounts -join ", ")

  Write-Output "7/8 Stopping TDGPT briefly and swapping validated databases..."
  wsl.exe -d $distribution -- bash -lc "$baseCommand stop app"
  if ($LASTEXITCODE -ne 0) { throw "Could not stop TDGPT before the database swap." }

  $terminateSql = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname IN ('$localDatabase','$candidateDatabase') AND pid <> pg_backend_pid();"
  $swapSql = "ALTER DATABASE `"$localDatabase`" RENAME TO `"$rollbackDatabase`"; ALTER DATABASE `"$candidateDatabase`" RENAME TO `"$localDatabase`";"
  Invoke-LocalSql "postgres" "$terminateSql`n$swapSql" | Out-Null
  $swapCompleted = $true
  $candidateCreated = $false

  Write-Output "8/8 Starting TDGPT and checking application health..."
  wsl.exe -d $distribution -- bash -lc "$baseCommand up -d app"
  if ($LASTEXITCODE -ne 0) { throw "TDGPT failed to start after the database swap." }

  $deadline = (Get-Date).AddSeconds(90)
  do {
    try { $response = Invoke-WebRequest -Uri "http://127.0.0.1:3000/login" -UseBasicParsing -TimeoutSec 5 } catch { $response = $null }
    if ($response -and $response.StatusCode -eq 200) { break }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  if (-not $response -or $response.StatusCode -ne 200) { throw "TDGPT did not become healthy after the database swap." }

  Write-Output "Production data transfer completed successfully."
  Write-Output "Rollback database retained as: $rollbackDatabase"
  Write-Output "Production dump retained as: $dumpPath"
} catch {
  if ($swapCompleted) {
    Write-Warning "Transfer failed after the swap. Attempting automatic rollback..."
    wsl.exe -d $distribution -- bash -lc "$baseCommand stop app" | Out-Null
    $failedDatabase = "tdgpt_failed_$stamp" -replace '-', '_'
    $rollbackSql = "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$localDatabase' AND pid <> pg_backend_pid(); ALTER DATABASE `"$localDatabase`" RENAME TO `"$failedDatabase`"; ALTER DATABASE `"$rollbackDatabase`" RENAME TO `"$localDatabase`";"
    Invoke-LocalSql "postgres" $rollbackSql | Out-Null
    wsl.exe -d $distribution -- bash -lc "$baseCommand up -d app" | Out-Null
  }
  throw
} finally {
  Remove-Item -LiteralPath $temporaryEnvPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $temporarySqlPath -Force -ErrorAction SilentlyContinue
  if ($candidateCreated) {
    & wsl.exe -d $distribution -- docker compose `
      --project-directory $wslProject --env-file "$wslProject/.env.selfhost" `
      exec -T postgres dropdb --force -U $localUser $candidateDatabase | Out-Null
  }
}
