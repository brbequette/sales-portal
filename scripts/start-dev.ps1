$ErrorActionPreference = "Stop"

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()

if (-not (Test-Path -LiteralPath (Join-Path $projectDirectory ".env.dev"))) {
  throw "Missing .env.dev. Copy .env.dev.example to .env.dev first."
}

$keepaliveRunning = Get-CimInstance Win32_Process -Filter "Name = 'wsl.exe'" |
  Where-Object { $_.CommandLine -match 'Ubuntu-24\.04.*sleep.*infinity' } |
  Select-Object -First 1
if (-not $keepaliveRunning) {
  Start-Process -FilePath "wsl.exe" `
    -ArgumentList @("-d", $distribution, "--", "sleep", "infinity") `
    -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

& wsl.exe -d $distribution -- docker compose `
  --project-directory $wslProjectDirectory `
  --env-file "$wslProjectDirectory/.env.dev" `
  -f "$wslProjectDirectory/compose.dev.yaml" `
  up -d --build
if ($LASTEXITCODE -ne 0) { throw "The TDGPT development stack failed to start." }

$deadline = (Get-Date).AddMinutes(3)
do {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3001/login" -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
      Write-Output "TDGPT development is ready at http://localhost:3001/login"
      Write-Output "Production remains available at http://localhost:3000"
      exit 0
    }
  } catch { Start-Sleep -Seconds 2 }
} while ((Get-Date) -lt $deadline)

throw "TDGPT development did not become ready within 3 minutes."
