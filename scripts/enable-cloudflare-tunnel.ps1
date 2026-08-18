$ErrorActionPreference = "Stop"

$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$envFile = Join-Path $projectDirectory ".env.selfhost"
if (-not (Test-Path -LiteralPath $envFile)) {
  throw "Missing .env.selfhost. Copy .env.selfhost.example and configure it first."
}

$settings = @{}
Get-Content -LiteralPath $envFile | ForEach-Object {
  if ($_ -match '^([A-Z0-9_]+)=(.*)$') {
    $settings[$matches[1]] = $matches[2].Trim()
  }
}

if ([string]::IsNullOrWhiteSpace($settings.CLOUDFLARE_TUNNEL_TOKEN)) {
  throw "Set CLOUDFLARE_TUNNEL_TOKEN in .env.selfhost before enabling the tunnel."
}
if ($settings.SELFHOST_APP_URL -notmatch '^https://[^/]+/?$') {
  throw "Set SELFHOST_APP_URL to the final HTTPS hostname before enabling the tunnel."
}

$distribution = "Ubuntu-24.04"
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()
wsl.exe -d $distribution -- docker compose `
  --project-directory $wslProjectDirectory `
  --env-file "$wslProjectDirectory/.env.selfhost" `
  --profile public `
  up -d app cloudflared
if ($LASTEXITCODE -ne 0) {
  throw "Cloudflare Tunnel failed to start."
}

Write-Output "Cloudflare Tunnel is starting for $($settings.SELFHOST_APP_URL)"
Write-Output "Check its status in the Cloudflare dashboard before sharing the URL."
