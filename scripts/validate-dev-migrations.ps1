param(
    [string]$Distribution = "Ubuntu-24.04"
)

$ErrorActionPreference = "Stop"
$projectPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$wslProjectPath = (wsl.exe -d $Distribution -- wslpath -a $projectPath).Trim()
if (-not $wslProjectPath) { throw "Could not resolve the project path in WSL." }

$bash = @'
set -euo pipefail
cd __PROJECT_PATH__
cleanup() {
  docker compose -f compose.dev.yaml --env-file .env.dev exec -T postgres \
    dropdb --if-exists -U tdgpt_dev tdgpt_release_validation >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
docker compose -f compose.dev.yaml --env-file .env.dev exec -T postgres \
  createdb -U tdgpt_dev tdgpt_release_validation

docker compose -f compose.dev.yaml --env-file .env.dev exec -T app sh -lc \
  'export DATABASE_URL="postgresql://tdgpt_dev:tdgpt-dev-local-only@postgres:5432/tdgpt_release_validation"; npx prisma migrate deploy'

echo "All migrations applied successfully to the isolated validation database."
'@

if ($wslProjectPath.Contains("'")) { throw "Project paths containing single quotes are not supported." }
$quotedWslPath = "'" + $wslProjectPath + "'"
$bash = $bash.Replace("__PROJECT_PATH__", $quotedWslPath)
wsl.exe -d $Distribution -- bash -lc $bash
if ($LASTEXITCODE -ne 0) { throw "Migration validation failed." }
