$ErrorActionPreference = "Stop"

$envPath = Join-Path (Split-Path $PSScriptRoot -Parent) ".env.selfhost"
if (-not (Test-Path -LiteralPath $envPath)) {
  throw "Missing .env.selfhost"
}

$lines = [System.Collections.Generic.List[string]](Get-Content -LiteralPath $envPath)
$existingIndex = -1
for ($index = 0; $index -lt $lines.Count; $index++) {
  if ($lines[$index] -match '^INTERNAL_SYNC_SECRET=(.+)$') {
    $existingIndex = $index
    break
  }
}

if ($existingIndex -ge 0) {
  Write-Output "Internal sync secret is already configured."
  exit 0
}

$bytes = [byte[]]::new(48)
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $generator.GetBytes($bytes)
} finally {
  $generator.Dispose()
}
$secret = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
$lines.Add("INTERNAL_SYNC_SECRET=$secret")
Set-Content -LiteralPath $envPath -Value $lines -Encoding utf8
Write-Output "Internal sync secret configured without displaying it."
