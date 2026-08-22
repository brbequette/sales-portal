param(
  [ValidateRange(0, 23)]
  [int]$Hour = 2,

  [ValidateRange(0, 59)]
  [int]$Minute = 0,

  [ValidateRange(1, 365)]
  [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

$taskName = "TDGPT Database Backup"
$backupScript = (Resolve-Path (Join-Path $PSScriptRoot "backup-selfhost.ps1")).Path
$powerShell = (Get-Command powershell.exe).Source
$arguments = "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$backupScript`" -RetentionDays $RetentionDays"

$action = New-ScheduledTaskAction -Execute $powerShell -Argument $arguments
$startTime = (Get-Date).Date.AddHours($Hour).AddMinutes($Minute)
$trigger = New-ScheduledTaskTrigger -Daily -At $startTime
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# The task runs only as the signed-in user and stores no database credentials.
# The backup script reads the ignored .env.selfhost file at execution time.
$principal = New-ScheduledTaskPrincipal `
  -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
  -LogonType Interactive `
  -RunLevel Limited

$task = New-ScheduledTask `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Create a compressed local backup of the TDGPT PostgreSQL database."

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Write-Output "Scheduled task installed: $taskName"
Write-Output ("Schedule: daily at {0:00}:{1:00}; retention: {2} days" -f $Hour, $Minute, $RetentionDays)
