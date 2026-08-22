#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

Write-Host 'Enabling Windows Subsystem for Linux...' -ForegroundColor Cyan
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
if ($LASTEXITCODE -ne 0) { throw "WSL feature failed with exit code $LASTEXITCODE" }

Write-Host 'Enabling Virtual Machine Platform...' -ForegroundColor Cyan
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
if ($LASTEXITCODE -ne 0) { throw "Virtual Machine Platform failed with exit code $LASTEXITCODE" }

Write-Host ''
Write-Host 'Windows features are enabled. Restart the computer, then return to Codex and say continue.' -ForegroundColor Green
Read-Host 'Press Enter to close this window'
