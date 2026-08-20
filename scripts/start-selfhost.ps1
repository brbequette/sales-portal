$ErrorActionPreference = "Stop"

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()

# WSL may be marked "running" because of a short command while still lacking a
# persistent process. Ensure the hidden keepalive itself exists after reboots.
$keepaliveRunning = Get-CimInstance Win32_Process -Filter "Name = 'wsl.exe'" |
  Where-Object { $_.CommandLine -match 'Ubuntu-24\.04.*sleep.*infinity' } |
  Select-Object -First 1
if (-not $keepaliveRunning) {
  Start-Process -FilePath "wsl.exe" `
    -ArgumentList @("-d", $distribution, "--", "sleep", "infinity") `
    -WindowStyle Hidden
  Start-Sleep -Seconds 3
}

$envFile = Join-Path $projectDirectory ".env.selfhost"
$tunnelSetting = Get-Content -LiteralPath $envFile |
  Where-Object { $_ -match '^CLOUDFLARE_TUNNEL_TOKEN=' } |
  Select-Object -Last 1
$hasTunnelToken = $tunnelSetting -and (($tunnelSetting -split '=', 2)[1].Trim().Length -gt 0)

$composeArguments = @(
  "-d", $distribution, "--", "docker", "compose",
  "--project-directory", $wslProjectDirectory,
  "--env-file", "$wslProjectDirectory/.env.selfhost"
)
if ($hasTunnelToken) {
  $composeArguments += @("--profile", "public", "up", "-d", "postgres", "ollama", "app", "cloudflared")
} else {
  $composeArguments += @("up", "-d", "postgres", "ollama", "app")
}

& wsl.exe $composeArguments
if ($LASTEXITCODE -ne 0) {
  throw "Docker Compose failed to start TDGPT."
}

$deadline = (Get-Date).AddSeconds(60)
do {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:3000/login" -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -eq 200) {
      Write-Output "TDGPT is ready at http://localhost:3000/login"
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 2
  }
} while ((Get-Date) -lt $deadline)

throw "TDGPT did not become ready within 60 seconds."
