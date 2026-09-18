[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CapturedOutput,
    [Parameter(Mandatory = $true)]
    [string]$Sentinel
)

$ErrorActionPreference = 'Stop'
$output = Get-Content -LiteralPath $CapturedOutput -Raw
if ($output.Contains($Sentinel)) { throw 'SENTINEL_APPEARED_IN_CAPTURED_OUTPUT' }
if ($output -notmatch 'MASTER_ADMIN_SECURE_INPUT_SELF_TEST=PASS') { throw 'SECURE_INPUT_SELF_TEST_DID_NOT_PASS' }
if ($output -match '\*{2,}') { throw 'PASSWORD_LENGTH_ASTERISKS_APPEARED' }
Write-Output 'MASTER_ADMIN_WINDOWS_CONSOLE_NO_ECHO_E2E=PASS'
