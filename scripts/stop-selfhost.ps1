$ErrorActionPreference = "Stop"

$distribution = "Ubuntu-24.04"
$projectDirectory = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wslProjectDirectory = (wsl.exe -d $distribution -- wslpath -a $projectDirectory).Trim()

wsl.exe -d $distribution -- docker compose `
  --project-directory $wslProjectDirectory `
  --env-file "$wslProjectDirectory/.env.selfhost" `
  --profile public `
  stop

wsl.exe --terminate $distribution
Write-Output "TDGPT and Ubuntu have stopped."
