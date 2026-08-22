param(
  [switch]$Quiet
)

$ErrorActionPreference = "Stop"
$healthUrl = "http://127.0.0.1:3000/login"
$startScript = Join-Path $PSScriptRoot "start-selfhost.ps1"

function Test-TDGPT {
  try {
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 8
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-TDGPT) {
  if (-not $Quiet) {
    Write-Output "TDGPT health check passed."
  }
  exit 0
}

Write-Warning "TDGPT did not answer its health check. Starting the self-host stack."
& powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $startScript
if ($LASTEXITCODE -ne 0) {
  throw "The TDGPT start script failed with exit code $LASTEXITCODE."
}

if (-not (Test-TDGPT)) {
  throw "TDGPT remained unavailable after the restart attempt."
}

Write-Output "TDGPT recovered and is available at $healthUrl"
