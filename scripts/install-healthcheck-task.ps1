param(
  [ValidateRange(1, 60)]
  [int]$IntervalMinutes = 5
)

$ErrorActionPreference = "Stop"

$taskName = "TDGPT Health Watchdog"
$healthScript = (Resolve-Path (Join-Path $PSScriptRoot "healthcheck-selfhost.ps1")).Path
$powerShell = (Get-Command powershell.exe).Source
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$healthScript`" -Quiet"

$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 3)
$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited

$task = New-ScheduledTask `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Check TDGPT localhost availability and restart its WSL/Docker stack when needed."

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Write-Output "Scheduled task installed: $taskName"
Write-Output "Health interval: $IntervalMinutes minutes"
