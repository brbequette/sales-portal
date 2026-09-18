[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$source = Join-Path $repositoryPath 'scripts\invoke-master-admin-provisioning.ps1'
$destinationDirectory = Join-Path $repositoryPath '.codex-tmp'
$destination = Join-Path $destinationDirectory 'run-production-master-admin-provisioning.ps1'

if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw 'CANONICAL_MASTER_ADMIN_RUNNER_NOT_FOUND'
}
if (-not (Test-Path -LiteralPath $destinationDirectory -PathType Container)) {
    New-Item -ItemType Directory -Path $destinationDirectory | Out-Null
}
Copy-Item -LiteralPath $source -Destination $destination -Force

function Get-Sha256 {
    param([Parameter(Mandatory = $true)][string]$Path)
    $stream = [IO.File]::OpenRead($Path)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-', '')
    }
    finally {
        $algorithm.Dispose()
        $stream.Dispose()
    }
}

$sourceHash = Get-Sha256 -Path $source
$destinationHash = Get-Sha256 -Path $destination
if ($sourceHash -ne $destinationHash) {
    throw 'MASTER_ADMIN_RUNNER_INSTALL_VERIFICATION_FAILED'
}
Write-Output 'MASTER_ADMIN_RUNNER_INSTALLED=PASS'
