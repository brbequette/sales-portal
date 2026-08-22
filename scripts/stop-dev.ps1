$ErrorActionPreference = "Stop"

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()

& wsl.exe -d $distribution -- docker compose `
  --project-directory $wslProjectDirectory `
  --env-file "$wslProjectDirectory/.env.dev" `
  -f "$wslProjectDirectory/compose.dev.yaml" `
  stop
if ($LASTEXITCODE -ne 0) { throw "The TDGPT development stack failed to stop." }

Write-Output "TDGPT development stopped. Production was not changed."
