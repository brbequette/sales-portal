$ErrorActionPreference = "Stop"

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()

& wsl.exe -d $distribution -- docker compose `
  --project-directory $wslProjectDirectory `
  --env-file "$wslProjectDirectory/.env.dev" `
  -f "$wslProjectDirectory/compose.dev.yaml" `
  exec -T app node scripts/create-local-admin.js
if ($LASTEXITCODE -ne 0) { throw "The development administrator could not be created." }
