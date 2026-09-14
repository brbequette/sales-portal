param(
  [switch]$Apply,
  [switch]$ZipSmokeOnly,
  [switch]$DbPreflightOnly,
  [switch]$ValidateDbConfigOnly,
  [switch]$ApplyReadyCanary,
  [switch]$ApplyReadyResume,
  [switch]$ZohoApplyPreflight,
  [switch]$PrepareArtifactRegistrationPackage,
  [string]$RunDirectory,
  [string]$CredentialFile,
  [int]$ApplyCanary = 0,
  [string]$Manifest
)

$ErrorActionPreference = 'Stop'
$docker = 'C:\Users\titan\Documents\ChatGPT\Titan Diamond\tmp\docker-cli\docker.exe'
$repo = Split-Path -Parent $PSCommandPath
$inputs = 'C:\Users\titan\Documents\ChatGPT\Titan Diamond\tmp\Titan_Zoho_Reconciliation_Inputs_2026-09-08'
$sourceRoot = 'C:\Users\titan\Documents\ChatGPT\Titan Diamond'
$credentialSource = if ([string]::IsNullOrWhiteSpace($CredentialFile)) { Join-Path $sourceRoot '.env' } else { $CredentialFile }
$runId = Get-Date -Format 'yyyyMMddHHmmss'
$work = Join-Path $repo "runtime\runs\$runId"
$credFile = Join-Path $work 'credentials.env'
$report = Join-Path $work 'preflight-report.json'
$log = Join-Path $work 'run.log'
$networkCreated = $false
$containerCreated = $false
$originalError = $null
$runExitCode = 0

function Redact([string]$text) {
  if ($null -eq $text) { return '' }
  return ($text -replace '(?i)(postgres(?:ql)?://)[^\s"'']+', '$1[REDACTED]') -replace '(?i)(Zoho-oauthtoken\s+)[^\s"'']+', '$1[REDACTED]'
}

function Normalize-DatabaseUrl([string]$line) {
  $line = [string]$line
  if ($null -eq $line) { return [pscustomobject]@{ Value = $null; Reason = 'DB_URL_MISSING' } }
  if ($line.StartsWith([char]0xFEFF)) { $line = $line.Substring(1) }
  $equals = $line.IndexOf('=')
  if ($equals -lt 0) { return [pscustomobject]@{ Value = $null; Reason = 'DB_URL_MISSING' } }
  $value = $line.Substring($equals + 1).Trim()
  if ([string]::IsNullOrWhiteSpace($value)) { return [pscustomobject]@{ Value = $null; Reason = 'DB_URL_EMPTY' } }
  if ($value.StartsWith([char]0xFEFF)) { $value = $value.Substring(1) }
  if ($value.IndexOf("`r") -ge 0 -or $value.IndexOf("`n") -ge 0) { return [pscustomobject]@{ Value = $null; Reason = 'DB_URL_MULTILINE' } }
  $firstCode = [int][char]$value[0]
  $lastCode = [int][char]$value[$value.Length - 1]
  $firstQuoted = ($firstCode -eq 34) -or ($firstCode -eq 39)
  $lastQuoted = ($lastCode -eq 34) -or ($lastCode -eq 39)
  if ($firstQuoted -ne $lastQuoted) {
    # A closing quote can be introduced by line-oriented env readers; remove it only
    # when it is the sole final delimiter and leave all URL characters unchanged.
    if (-not $firstQuoted -and $lastQuoted) { $value = $value.Substring(0, $value.Length - 1); $lastQuoted = $false }
    else { return [pscustomobject]@{ Value = $null; Reason = 'DB_URL_MISMATCHED_QUOTES' } }
  }
  if ($firstQuoted -and ($firstCode -ne $lastCode)) { return [pscustomobject]@{ Value = $null; Reason = 'DB_URL_MISMATCHED_QUOTES' } }
  if ($firstQuoted) { $value = $value.Substring(1, $value.Length - 2) }
  if ([string]::IsNullOrWhiteSpace($value)) { return [pscustomobject]@{ Value = $null; Reason = 'DB_URL_EMPTY' } }
  if ($value -match '\$\{[^}]+\}' -or $value -match '<[^>]+>') { return [pscustomobject]@{ Value = $null; Reason = 'DB_URL_UNRESOLVED_TEMPLATE' } }
  return [pscustomobject]@{ Value = $value; Reason = $null }
}

function Import-ProtectedCredentialEnvironment([string]$path) {
  $allowed = @('DATABASE_URL','ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN','ZOHO_ORGANIZATION_ID','ZOHO_DC')
  $lines = Get-Content -LiteralPath $path
  foreach ($name in $allowed) {
    $line = @($lines | Where-Object { $_ -match ('^' + [regex]::Escape($name) + '=') }) | Select-Object -Last 1
    if ($null -eq $line) { throw "Missing protected credential: $name" }
    $equals = $line.IndexOf('=')
    if ($equals -lt 0) { throw "Malformed protected credential: $name" }
    [Environment]::SetEnvironmentVariable($name, $line.Substring($equals + 1), 'Process')
  }
}

function Invoke-Docker {
  param(
    [Parameter(Mandatory)][string]$Stage,
    [Parameter(Mandatory)][string[]]$ArgumentList,
    [switch]$AllowNonZero
  )
  if ($ArgumentList.Count -eq 0) { throw "Docker stage '$Stage' received an empty argument list." }
  if ([string]::IsNullOrWhiteSpace($ArgumentList[0])) { throw "Docker stage '$Stage' is missing its first argument." }
  $shown = ($ArgumentList | ForEach-Object { if ($_ -match 'DATABASE_URL=|PASSWORD=|TOKEN=|SECRET=|CLIENT_SECRET=') { '[REDACTED]' } else { $_ } }) -join ' '
  $stamp = (Get-Date).ToString('o')
  Add-Content -LiteralPath $log -Value "[$stamp] STAGE=$Stage COMMAND=docker $shown"
  $stdoutFile = Join-Path $work ("$Stage.stdout.log")
  $stderrFile = Join-Path $work ("$Stage.stderr.log")
  $oldEap = $ErrorActionPreference
  $oldNativePreference = $null
  $hadNativePreference = $null -ne (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)
  if ($hadNativePreference) { $oldNativePreference = $PSNativeCommandUseErrorActionPreference }
  $invocationError = $null
  $exitCode = $null
  try {
    $ErrorActionPreference = 'Continue'
    if ($hadNativePreference) { $PSNativeCommandUseErrorActionPreference = $false }
    try {
      & $docker @ArgumentList 1> $stdoutFile 2> $stderrFile
      $exitCode = $LASTEXITCODE
    } catch {
      $invocationError = $_
      $exitCode = $LASTEXITCODE
    }
  } finally {
    $ErrorActionPreference = $oldEap
    if ($hadNativePreference) { $PSNativeCommandUseErrorActionPreference = $oldNativePreference }
  }
  $code = $exitCode
  $stdout = if (Test-Path $stdoutFile) { Get-Content -Raw $stdoutFile } else { '' }
  $stderr = if (Test-Path $stderrFile) { Get-Content -Raw $stderrFile } else { '' }
  Add-Content -LiteralPath $log -Value "[$stamp] STDOUT=`n$(Redact $stdout)`nSTDERR=`n$(Redact $stderr)`nEXIT_CODE=$code"
  if ($invocationError) { Add-Content -LiteralPath $log -Value "[$stamp] INVOCATION_ERROR=$(Redact ([string]$invocationError.Exception))" }
  Write-Host ("[$Stage] exit=$code")
  if (($null -eq $code) -or ($code -ne 0 -and -not $AllowNonZero)) { throw "Docker stage '$Stage' failed with exit code $code. See $log" }
  if (($stdout + $stderr) -match '(?i)Usage:\s+docker') { throw "Docker stage '$Stage' returned Docker help instead of executing the requested command." }
  return [pscustomobject]@{ Output = (Redact ($stdout + $stderr)); Stdout = (Redact $stdout); Stderr = (Redact $stderr); ExitCode = $code }
}

if ($ZipSmokeOnly) {
  if (-not (Test-Path -LiteralPath $docker)) { throw 'Missing approved Docker CLI.' }
  if (-not (Test-Path -LiteralPath $inputs)) { throw 'Missing reconciliation inputs.' }
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  $smokeNetwork = "titan-reconciliation-zip-$runId-net"; $smokeNetworkCreated = $false; $smokeExit = 1; $originalError = $null
  try {
    $null = Invoke-Docker -Stage 'zip-docker-version' -ArgumentList @('version')
    $networkResult = Invoke-Docker -Stage 'zip-network-create' -ArgumentList @('network','create',$smokeNetwork)
    if ($networkResult.ExitCode -ne 0 -or $networkResult.Stdout.Trim() -notmatch '^[0-9a-fA-F]{64}$') { throw 'ZIP smoke network creation failed.' }
    $smokeNetworkCreated = $true
    $smoke = Invoke-Docker -Stage 'zip-smoke-only' -ArgumentList @('run','--rm','--name',"titan-reconciliation-zip-$runId",'--network',$smokeNetwork,'-v',"${inputs}:/inputs:ro",'-v',"${repo}:/work:ro",'node:24-bookworm','sh','-lc','apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/* && RECONCILIATION_INPUTS=/inputs node /work/tests/zip-extraction.test.mjs && RECONCILIATION_INPUTS=/inputs RECONCILIATION_ZIP_OUTPUT=/tmp/zip-smoke node /work/reconciliation-zip-smoke.mjs')
    if ($smoke.ExitCode -ne 0) { throw 'ZIP smoke container returned a nonzero exit code.' }
    foreach ($marker in @('ZIP_REGRESSION_TEST=PASS','ZIP_VALIDATION=PASS','ZIP_EXTRACTION=PASS','ZIP_HASH_VERIFICATION=PASS','ZIP_REPEATABILITY=PASS','ZIP_CLEANUP=PASS')) { if ($smoke.Stdout -notmatch [regex]::Escape($marker)) { throw "Missing ZIP marker: $marker" } }
    $smokeExit = 0
  } catch { $originalError = $_; $smokeExit = 1 } finally {
    $oldEap = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { if ($smokeNetworkCreated) { & $docker network inspect $smokeNetwork *> $null; if ($LASTEXITCODE -eq 0) { & $docker network rm $smokeNetwork *> $null } } } finally { $ErrorActionPreference = $oldEap }
  }
  if ($originalError) { Write-Error $originalError.Exception.Message }
  exit $smokeExit
}

if ($ApplyCanary -gt 0) { if (-not $Manifest) { throw 'ApplyCanary requires -Manifest.' }; if (-not (Test-Path -LiteralPath $Manifest)) { throw 'Manifest path not found.' }; if ($ApplyCanary -ne 10) { throw 'Only a 10-document canary is supported.' }; throw 'Canary execution requires an approved interactive Zoho client; no writes are enabled in this environment.' }

if ($DbPreflightOnly) {
  if (-not (Test-Path -LiteralPath $docker)) { throw 'Missing approved Docker CLI.' }
  New-Item -ItemType Directory -Path $work -Force | Out-Null
  $network = "titan-reconciliation-db-$runId-net"; $container = "titan-reconciliation-db-$runId"; $networkCreated = $false
  try {
    $envLine = [string](@(Get-Content -LiteralPath $credentialSource | Where-Object { $_ -match '^DATABASE_URL=' })[0])
    if (-not $envLine) { throw 'Missing DATABASE_URL.' }
    $normalized = Normalize-DatabaseUrl $envLine
    if ($normalized.Reason) { throw $normalized.Reason }
    $databaseUrl = $normalized.Value
    Set-Content -LiteralPath $credFile -Value ("DATABASE_URL=$databaseUrl") -Encoding utf8
    $created = Invoke-Docker -Stage 'db-network-create' -ArgumentList @('network','create',$network)
    if ($created.ExitCode -ne 0) { throw 'DB preflight network creation failed.' }; $networkCreated = $true
    $r = Invoke-Docker -Stage 'db-preflight-only' -ArgumentList @('run','--rm','--name',$container,'--network',$network,'--env-file',$credFile,'-v',"${repo}:/workspace:ro",'-v',"${work}:/output",'node:24-bookworm','sh','-lc','rm -rf /tmp/reconciliation-db-work && mkdir -p /tmp/reconciliation-db-work && cp -a /workspace/. /tmp/reconciliation-db-work/ && cd /tmp/reconciliation-db-work && npm ci --ignore-scripts --no-audit --no-fund && echo DB_DEPENDENCIES=PASS && npx --no-install prisma generate && echo DB_PRISMA_GENERATE=PASS && RECONCILIATION_OUTPUT=/output node /tmp/reconciliation-db-work/reconciliation-db-preflight.mjs')
    foreach ($marker in @('DB_DEPENDENCIES=PASS','DB_PRISMA_GENERATE=PASS','DB_PREFLIGHT=PASS')) { if ($r.Stdout -notmatch [regex]::Escape($marker)) { throw "Missing DB preflight marker: $marker" } }; $runExitCode = 0
  } catch { $originalError = $_; $runExitCode = 1 } finally {
    $old = $ErrorActionPreference; $ErrorActionPreference = 'Continue'; try { if (Test-Path $credFile) { Remove-Item -LiteralPath $credFile -Force -ErrorAction SilentlyContinue }; if ($networkCreated) { & $docker network inspect $network *> $null; if ($LASTEXITCODE -eq 0) { & $docker network rm $network *> $null } } } finally { $ErrorActionPreference = $old }
  }
  if ($originalError) { Write-Error $originalError.Exception.Message }; exit $runExitCode
}

if ($ValidateDbConfigOnly) {
  $envText = Get-Content -LiteralPath $credentialSource -Raw
  $line = [string](@($envText -split "`r?`n" | Where-Object { $_ -match '^\s*DATABASE_URL=' })[0])
  $normalized = Normalize-DatabaseUrl -line $line
  if ($normalized.Reason) { Write-Output $normalized.Reason; exit 1 }
  Write-Output 'DB_CONFIG_VALIDATION=PASS'; exit 0
}
if ($ApplyReadyCanary -or $ApplyReadyResume) {
  if ($Apply) { throw 'APPLY_REMAINS_DISABLED' }
  if ([string]::IsNullOrWhiteSpace($RunDirectory)) { throw 'APPLY_RUN_DIRECTORY_REQUIRED' }
  Import-ProtectedCredentialEnvironment -path $credentialSource
  $runDirectory = (Resolve-Path -LiteralPath $RunDirectory).Path
  if (-not (Test-Path -LiteralPath (Join-Path $runDirectory 'ready-forward-payload.json'))) { throw 'APPLY_RUN_ARTIFACTS_INCOMPLETE' }
  $mode = if ($ApplyReadyCanary) { 'canary' } else { 'resume' }
  & node (Join-Path $repo 'reconciliation-ready-apply.mjs') '--mode' $mode '--run-directory' $runDirectory
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  exit 0
}
if ($ZohoApplyPreflight) {
  Import-ProtectedCredentialEnvironment -path $credentialSource
  $preflightOutput = Join-Path $repo 'runtime\zoho-preflight'
  & node (Join-Path $repo 'reconciliation-zoho-apply-preflight.mjs')
  $code = $LASTEXITCODE
  Write-Output 'APPLY_NOT_EXECUTED=PASS'
  exit $code
}
if ($PrepareArtifactRegistrationPackage) {
  if ([string]::IsNullOrWhiteSpace($RunDirectory)) { throw 'RUN_DIRECTORY_REQUIRED' }
  $resolvedRun = (Resolve-Path -LiteralPath $RunDirectory).Path
  $packageDir = Join-Path (Split-Path -Parent $resolvedRun) 'registration-packages'
  & node --experimental-strip-types (Join-Path $repo 'reconciliation-artifact-package.mjs') $resolvedRun $packageDir
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
  exit 0
}
if (-not (Test-Path -LiteralPath $docker)) { throw "Missing approved Docker CLI." }
if (-not (Test-Path -LiteralPath $repo)) { throw "Missing isolated repository." }
if (-not (Test-Path -LiteralPath $inputs)) { throw "Missing reconciliation inputs." }
New-Item -ItemType Directory -Path $work -Force | Out-Null
$requiredFiles = @(
  'reconciliation-focused-test-runner.mjs','tests/enrichment-order.test.mjs',
  'reconciliation-engine.mjs','reconciliation-db.mjs','reconciliation-calculations.mjs','reconciliation-artifact-package.mjs',
  'tests/provider-packaging.integration.test.mjs','reconciliation-manifest.mjs','tests/sha256-manifest.test.mjs',
  'reconciliation-payload-review.mjs','reconciliation-redaction-audit.mjs',
  'reconciliation-credential-preflight.mjs','reconciliation-db-preflight.mjs',
  'tests/rules.test.mjs','tests/calculations.test.mjs',
  'reconciliation-ready-apply.mjs','reconciliation-zoho-client.mjs','tests/ready-apply.test.mjs','tests/zoho-client.test.mjs',
  'reconciliation-zoho-apply-preflight.mjs','tests/zoho-token-provider.test.mjs',
  'tests/zoho-auth-compatibility.test.mjs','tests/zoho-apply-preflight-contract.test.mjs','tests/zoho-preflight-real-process.test.mjs',
  'tests/payload-review.test.mjs','tests/db-structure.test.mjs','tests/db-preflight-diagnostic.test.mjs','tests/db-wrapper-structure.test.mjs','tests/eligibility-canary.test.mjs',
  'tests/cost-fixtures.test.mjs','tests/cost-source-preflight.test.mjs','tests/item-fallback.integration.test.mjs','tests/breakdown-fixtures.test.mjs','tests/breakdown-all-exports.integration.test.mjs','tests/zip-extraction.test.mjs','tests/classification-fixtures.test.mjs','tests/engine-core.integration.test.mjs','tests/runtime-artifact.integration.test.mjs','tests/diagnostic-redaction.test.mjs','reconciliation-engine-core.mjs','reconciliation-diagnostics.mjs','reconciliation-zip-smoke.mjs','reconciliation-cost-sources.mjs'
)
$requiredFiles += 'tests/selected-source.integration.test.mjs'
$requiredFiles += 'reconciliation-document-builder.mjs','tests/document-builder-parity.test.mjs'
$requiredFiles += 'reconciliation-calculation-context.mjs','tests/calculation-context-parity.test.mjs'
$requiredFiles += 'tests/legacy-context-dependencies.test.mjs'
$requiredFiles += 'reconciliation-vig-timeline.mjs','tests/vig-timeline.test.mjs'
$requiredFiles += 'tests/document-result-builder.test.mjs'
$requiredFiles += 'reconciliation-legacy-document-adapter.mjs','tests/legacy-adapter-characterization.test.mjs','tests/legacy-adapter-structure.test.mjs'
$requiredFiles += 'tests/document-result-export-parity.integration.test.mjs'
$requiredFiles += 'tests/runtime-single-path.test.mjs'
$requiredFiles += 'tests/capability-inventory.test.mjs'
$requiredFiles += 'tests/runtime-orchestration-order.test.mjs'
$requiredFiles += 'tests/vig-audit-before-gate.test.mjs'
$requiredFiles += 'tests/apply-gates-credential-contract.test.mjs'
$missingFiles = @($requiredFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $repo $_)) })
if ($missingFiles.Count -gt 0) { throw ("Missing required reconciliation files: " + ($missingFiles -join ', ')) }

try {
  $envLines = Get-Content -LiteralPath $credentialSource
  $required = @('DATABASE_URL','ZOHO_CLIENT_ID','ZOHO_CLIENT_SECRET','ZOHO_REFRESH_TOKEN','ZOHO_ORGANIZATION_ID','ZOHO_DC')
  $pairs = foreach ($name in $required) {
    $line = $envLines | Where-Object { $_ -match "^$name=" } | Select-Object -Last 1
    if (-not $line) { throw "Missing required environment variable name: $name" }
    $value = $line.Substring($line.IndexOf('=') + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) { $value = $value.Substring(1, $value.Length - 2) }
    "$name=$value"
  }
  if ($pairs.Count -ne $required.Count) { throw 'Credential entry count mismatch.' }
  $pairNames = @($pairs | ForEach-Object { ($_ -split '=', 2)[0] })
  if (($pairNames | Sort-Object -Unique).Count -ne $required.Count) { throw 'Duplicate credential names detected.' }
  foreach ($pair in $pairs) { $parts = $pair -split '=', 2; if ($parts.Count -ne 2 -or [string]::IsNullOrWhiteSpace($parts[1]) -or $parts[1] -match '[\r\n]') { throw 'Empty or malformed credential value detected.' } }
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [IO.File]::WriteAllText($credFile, (($pairs -join "`n") + "`n"), $utf8NoBom)

  $container = "titan-reconciliation-$runId"
  $network = "titan-reconciliation-$runId-net"
  $reportJson = @{
    runId = $runId
    mode = if ($Apply) { 'apply' } else { 'dry-run' }
    repository = $repo
    inputs = $inputs
    nativeFieldsAllowed = $false
    lineItemsAllowed = $false
    writesEnabled = [bool]$Apply
  } | ConvertTo-Json -Depth 4
  Set-Content -LiteralPath $report -Value $reportJson -Encoding UTF8

  $version = Invoke-Docker -Stage 'docker-self-test' -ArgumentList @('version','--format','{{.Server.Version}}')
  if ($version.ExitCode -ne 0 -or [string]::IsNullOrWhiteSpace($version.Stdout) -or $version.Stdout -match '(?i)Usage:') { throw 'Docker argument self-test failed.' }
  $imageCheck = Invoke-Docker -Stage 'image-preflight' -ArgumentList @('image','inspect','node:24-bookworm') -AllowNonZero
  if ($imageCheck.ExitCode -ne 0) {
    Invoke-Docker -Stage 'image-pull' -ArgumentList @('pull','node:24-bookworm') | Out-Null
    $imageCheck = Invoke-Docker -Stage 'image-verify' -ArgumentList @('image','inspect','node:24-bookworm')
    if ($imageCheck.ExitCode -ne 0) { throw 'node:24-bookworm image verification failed after pull.' }
  }
  $networkResult = Invoke-Docker -Stage 'network-create' -ArgumentList @('network','create',$network)
  $networkId = $networkResult.Stdout.Trim()
  if ($networkResult.ExitCode -ne 0 -or $networkId -notmatch '^[0-9a-fA-F]{64}$') { throw 'Docker network creation did not return exactly one valid network ID.' }
  $networkCheck = Invoke-Docker -Stage 'network-verify' -ArgumentList @('network','inspect',$network,'--format','{{.Name}}')
  if ($networkCheck.ExitCode -ne 0 -or $networkCheck.Stdout.Trim() -cne $network) { throw 'Docker network inspection did not confirm the requested network name.' }
  $networkCreated = $true
  $zipSmoke = Invoke-Docker -Stage 'zip-smoke' -ArgumentList @('run','--rm','--name',"${container}-zip",'--network','none','-e','RECONCILIATION_INPUTS=/inputs','-e','RECONCILIATION_ZIP_OUTPUT=/tmp/zip-smoke','-v',"${inputs}:/inputs:ro",'-v',"${repo}:/work:ro",'node:24-bookworm','sh','-lc','command -v unzip >/dev/null 2>&1 || { echo ZIP_UNZIP_MISSING >&2; exit 127; }; node /work/reconciliation-zip-smoke.mjs')
  if ($zipSmoke.ExitCode -ne 0 -or $zipSmoke.Stdout -notmatch 'ZIP_VALIDATION=PASS' -or $zipSmoke.Stdout -notmatch 'ZIP_EXTRACTION=PASS' -or $zipSmoke.Stdout -notmatch 'ZIP_HASH_VERIFICATION=PASS' -or $zipSmoke.Stdout -notmatch 'ZIP_REPEATABILITY=PASS' -or $zipSmoke.Stdout -notmatch 'ZIP_CLEANUP=PASS') { throw 'ZIP-only smoke validation failed.' }
  $preflight = Invoke-Docker -Stage 'preflight-container' -ArgumentList @('run','--rm','--name',$container,'--network',$network,'--env-file',$credFile,'-e','RECONCILIATION_REPO=/work','-e','RECONCILIATION_APP_ROOT=/work','-e','RECONCILIATION_INPUTS=/inputs','-e','RECONCILIATION_OUTPUT=/output','-v',"${repo}:/workspace:ro",'-v',"${repo}/netlify:/netlify:ro",'-v',"${inputs}:/inputs:ro",'-v',"${work}:/output",'node:24-bookworm','sh','-lc','apt-get update && apt-get install -y --no-install-recommends unzip && rm -rf /var/lib/apt/lists/* && cp -a /workspace/. /work && cd /work && node /work/reconciliation-credential-preflight.mjs && npm ci --ignore-scripts --no-audit --no-fund && npx --no-install prisma generate && echo PRISMA_GENERATE=PASS && node /work/reconciliation-focused-test-runner.mjs && node /work/reconciliation-db-preflight.mjs && node /work/reconciliation-engine.mjs --dry-run && node /work/reconciliation-redaction-audit.mjs /output && node /work/reconciliation-payload-review.mjs /output && echo ENGINE_DRY_RUN=PASS')
  $preflightStdout = Join-Path $work 'preflight-container.stdout.log'
  $preflightExit = $preflight.ExitCode
  if (($preflightExit -ne 0) -or -not (Test-Path $preflightStdout)) { throw "Preflight container did not produce a successful recorded result." }
  $preflightText = Get-Content -Raw $preflightStdout
  if($preflightText -notmatch 'SELECTED_SOURCE_INVARIANTS=PASS'){ throw 'Missing required preflight marker: SELECTED_SOURCE_INVARIANTS=PASS' }
  foreach($marker in @('CREDENTIAL_NAMES=PASS','PRISMA_GENERATE=PASS','CLASSIFICATION_TESTS=PASS','ENRICHMENT_BEFORE_CLASSIFICATION=PASS','ENGINE_CORE_INTEGRATION=PASS','RUNTIME_ARTIFACT_INTEGRATION=PASS','RUNTIME_VIG_CONTRACT=PASS','POST_ARTIFACT_RUNTIME_CONTRACT=PASS','PRODUCTION_PAYLOAD_VALIDATION_CONTRACT=PASS','SELECTED_BUT_UNRESOLVED_ZERO=PASS','DB_CATALOG_FALLBACK=PASS','HISTORICAL_INVOICE_JSON_PATH=PASS','NO_SELLING_PRICE_AS_COST=PASS','RESOLVED_PROVENANCE_COMPLETE=PASS','DB_PREFLIGHT_DIAGNOSTIC=PASS','BLOCKER_DIAGNOSTIC_INTEGRATION=PASS','DIAGNOSTIC_REDACTION=PASS','RECONCILIATION_TESTS=PASS','POST_COMPLETENESS_ARTIFACT=PASS','INDEPENDENT_PAYLOAD_REVIEW=PASS','DRY_RUN_COMPLETE=PASS','DRY_RUN_STATUS=COMPLETE_WITH_BLOCKERS','READY_PAYLOAD_ISOLATION=PASS','BLOCKED_DOCUMENT_EXCLUSION=PASS','BLOCKER_CONSERVATION=PASS','APPLY_REMAINS_DISABLED=PASS','DB_PREFLIGHT=PASS','ENGINE_DRY_RUN=PASS','FULL_SHA256_MANIFEST=PASS','CANONICAL_SHA256_MANIFEST=PASS','MANIFEST_PRODUCER_CONSUMER_PARITY=PASS','ARTIFACT_FINGERPRINT=PASS','REGISTRATION_PACKAGE=PASS','SERVER_ARTIFACT_VALIDATION=PASS','APPLY_CAPABILITY_ABSENT=PASS')) { if($preflightText -notmatch [regex]::Escape($marker)){ throw "Missing required preflight marker: $marker" } }
  $containerCreated = $true

  if (-not $Apply) {
    Write-Host 'Dry-run preflight completed. No Zoho writes were attempted.'
    $runExitCode = 0
    return
  }
  throw 'Apply mode is intentionally blocked until a production-aware payload generator, rollback snapshot, field allowlist, and read-back verifier are present and reviewed.'
}
catch {
  $originalError = $_
  $runExitCode = 1
  Add-Content -LiteralPath $log -Value "[$((Get-Date).ToString('o'))] ORIGINAL_ERROR=$(Redact ([string]$_.Exception))"
  Write-Error (Redact ([string]$_.Exception))
}
finally {
  $oldPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $oldNativePreference = $null
  $hasNativePreference = $null -ne (Get-Variable PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue)
  if ($hasNativePreference) { $oldNativePreference = $PSNativeCommandUseErrorActionPreference; $PSNativeCommandUseErrorActionPreference = $false }
  try {
    if ($containerCreated) { & $docker container inspect $container *> $null; $inspectCode = $LASTEXITCODE; Add-Content -LiteralPath $log -Value "CLEANUP container-inspect exit=$inspectCode"; if ($inspectCode -eq 0) { & $docker container rm -f $container *> $null; $cleanupCode = $LASTEXITCODE; Add-Content -LiteralPath $log -Value "CLEANUP container-remove exit=$cleanupCode" } }
    if ($networkCreated) { & $docker network inspect $network *> $null; $inspectCode = $LASTEXITCODE; Add-Content -LiteralPath $log -Value "CLEANUP network-inspect exit=$inspectCode"; if ($inspectCode -eq 0) { & $docker network rm $network *> $null; $cleanupCode = $LASTEXITCODE; Add-Content -LiteralPath $log -Value "CLEANUP network-remove exit=$cleanupCode" } else { Add-Content -LiteralPath $log -Value 'CLEANUP network absent=no-op' } }
  } finally {
    $ErrorActionPreference = $oldPreference
    if ($hasNativePreference) { $PSNativeCommandUseErrorActionPreference = $oldNativePreference }
  }
  if (Test-Path -LiteralPath $credFile) { Remove-Item -LiteralPath $credFile -Force -ErrorAction SilentlyContinue }
}
exit $runExitCode
