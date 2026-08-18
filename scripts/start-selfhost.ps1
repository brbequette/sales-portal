$ErrorActionPreference = "Stop"

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()

# WSL may shut down when an interactive command ends. This hidden process keeps
# the distribution, Docker daemon, and published localhost ports available.
$isRunning = wsl.exe --list --running --quiet | Where-Object { $_.Trim() -eq $distribution }
if (-not $isRunning) {
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
