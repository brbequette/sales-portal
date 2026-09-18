<#
.SYNOPSIS
Runs an exact-target LOCAL_MASTER preflight or securely provisions after preflight.

.PARAMETER EnvironmentFile
Path to an operator-supplied protected environment file. The wrapper has no default production path.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Preflight', 'Provision', 'SecureInputSelfTest')]
    [string]$Action,
    [Parameter(Mandatory = $true)]
    [string]$LoginIdentifier,
    [Parameter(Mandatory = $true)]
    [string]$ExpectedUserId,
    [Parameter(Mandatory = $true)]
    [string]$EnvironmentFile,
    [ValidateSet('Create', 'ReplaceRevoked')]
    [string]$Mode = 'Create'
)

$ErrorActionPreference = 'Stop'
$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$databaseKey = 'DATABASE_URL'
$secureStdinKey = 'MASTER_ADMIN_SECURE_STDIN'
$previousDatabaseUrl = [Environment]::GetEnvironmentVariable($databaseKey, 'Process')
$previousSecureStdin = [Environment]::GetEnvironmentVariable($secureStdinKey, 'Process')
$databaseUrl = $null
$databaseLine = $null
$password = $null
$confirmation = $null
$passwordBstr = [IntPtr]::Zero
$confirmationBstr = [IntPtr]::Zero
$child = $null

function Read-NoEchoSecureString {
    param([Parameter(Mandatory = $true)][string]$Prompt)

    if ([Console]::IsInputRedirected -or -not [Environment]::UserInteractive) {
        throw 'SECURE_CONSOLE_INPUT_UNAVAILABLE'
    }
    $value = [Security.SecureString]::new()
    try {
        Write-Host -NoNewline ($Prompt + ': ')
        while ($true) {
            try {
                $key = [Console]::ReadKey($true)
            }
            catch {
                throw 'SECURE_CONSOLE_INPUT_UNAVAILABLE'
            }
            if ($key.Key -eq [ConsoleKey]::Enter) { break }
            if ($key.Key -eq [ConsoleKey]::C -and ($key.Modifiers -band [ConsoleModifiers]::Control)) {
                throw 'SECURE_INPUT_CANCELLED'
            }
            if ($key.Key -eq [ConsoleKey]::Backspace) {
                if ($value.Length -gt 0) { $value.RemoveAt($value.Length - 1) }
                continue
            }
            if (-not [char]::IsControl($key.KeyChar)) { $value.AppendChar($key.KeyChar) }
        }
        Write-Host
        $value.MakeReadOnly()
        return $value
    }
    catch {
        $value.Dispose()
        throw
    }
}

try {
    if ($Action -eq 'SecureInputSelfTest') {
        if ($env:MASTER_ADMIN_SECURE_INPUT_SELF_TEST -ne '1') { throw 'SECURE_INPUT_SELF_TEST_NOT_ENABLED' }
        $passwordSecure = Read-NoEchoSecureString 'Sentinel password'
        $confirmationSecure = Read-NoEchoSecureString 'Confirm sentinel password'
        $passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
        $confirmationBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmationSecure)
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)
        $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationBstr)
        if ($password -ne $confirmation) { throw 'SECURE_INPUT_SELF_TEST_MISMATCH' }
        Write-Output 'MASTER_ADMIN_SECURE_INPUT_SELF_TEST=PASS'
        return
    }
    if (-not (Test-Path -LiteralPath $EnvironmentFile -PathType Leaf)) {
        throw 'PRODUCTION_ENVIRONMENT_FILE_NOT_FOUND'
    }
    $resolvedEnvironmentFile = (Resolve-Path -LiteralPath $EnvironmentFile).Path
    $databaseLine = Get-Content -LiteralPath $resolvedEnvironmentFile |
        Where-Object { $_.StartsWith($databaseKey + '=') } |
        Select-Object -Last 1
    if (-not $databaseLine) { throw 'PRODUCTION_DATABASE_URL_NOT_FOUND' }
    $databaseUrl = ($databaseLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if ($databaseUrl -notmatch '^postgres(?:ql)?://') { throw 'PRODUCTION_DATABASE_URL_INVALID' }
    [Environment]::SetEnvironmentVariable($databaseKey, $databaseUrl, 'Process')

    $normalizedLogin = $LoginIdentifier.Trim().ToLowerInvariant()
    if ($normalizedLogin -notmatch '^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$') {
        throw 'INVALID_LOGIN_IDENTIFIER'
    }
    if ($ExpectedUserId -notmatch '^[A-Za-z0-9_-]+$') {
        throw 'INVALID_EXPECTED_USER_ID'
    }
    $modeArgument = if ($Mode -eq 'ReplaceRevoked') { 'replace-revoked' } else { 'create' }
    $nodePath = Join-Path $env:ProgramFiles 'nodejs\node.exe'
    $preflightScript = Join-Path $repositoryPath 'scripts\preflight-master-admin.mjs'

    & $nodePath $preflightScript '--login-identifier' $normalizedLogin '--expected-user-id' $ExpectedUserId '--mode' $modeArgument
    if ($LASTEXITCODE -ne 0) { throw "MASTER_ADMIN_PREFLIGHT_EXIT_$LASTEXITCODE" }
    if ($Action -eq 'Preflight') { return }

    $passwordSecure = Read-NoEchoSecureString 'Master administrator password'
    $confirmationSecure = Read-NoEchoSecureString 'Confirm password'
    $passwordBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
    $confirmationBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmationSecure)
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordBstr)
    $confirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmationBstr)

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $nodePath
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $provisionScript = Join-Path $repositoryPath 'scripts\provision-master-admin.mjs'
    $startInfo.Arguments = ('"{0}" --login-identifier "{1}" --expected-user-id "{2}" --mode "{3}"' -f `
        $provisionScript, $normalizedLogin, $ExpectedUserId, $modeArgument)
    $child = [Diagnostics.Process]::new()
    $child.StartInfo = $startInfo
    [Environment]::SetEnvironmentVariable($secureStdinKey, '1', 'Process')
    if (-not $child.Start()) { throw 'MASTER_ADMIN_PROVISIONING_START_FAILED' }
    $child.StandardInput.WriteLine($password)
    $child.StandardInput.WriteLine($confirmation)
    $child.StandardInput.Close()
    $child.WaitForExit()
    if ($child.ExitCode -ne 0) { throw "MASTER_ADMIN_PROVISIONING_EXIT_$($child.ExitCode)" }
}
catch {
    $category = if ($_.Exception.Message -match '^[A-Z0-9_]+$') {
        $_.Exception.Message
    } else {
        'MASTER_ADMIN_PROVISIONING_FAILED'
    }
    Write-Error $category -ErrorAction Continue
    exit 1
}
finally {
    if ($passwordBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordBstr) }
    if ($confirmationBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmationBstr) }
    $password = $null
    $confirmation = $null
    if ($null -ne $passwordSecure) { $passwordSecure.Dispose() }
    if ($null -ne $confirmationSecure) { $confirmationSecure.Dispose() }
    $passwordSecure = $null
    $confirmationSecure = $null
    if ($null -ne $child) { $child.Dispose() }
    [Environment]::SetEnvironmentVariable($databaseKey, $previousDatabaseUrl, 'Process')
    [Environment]::SetEnvironmentVariable($secureStdinKey, $previousSecureStdin, 'Process')
    $databaseUrl = $null
    $databaseLine = $null
    $previousDatabaseUrl = $null
    $previousSecureStdin = $null
}
