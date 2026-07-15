$body = @{ dryRun = $false } | ConvertTo-Json
$result = Invoke-RestMethod -Uri 'https://www.tdusales.com/api/timeclock/recalculate' -Method POST -ContentType 'application/json' -Body $body
Write-Host "Dry Run: $($result.dryRun)"
Write-Host "Total Entries: $($result.totalEntries)"
Write-Host "Fixed: $($result.fixed)"
Write-Host "Skipped: $($result.skipped)"
Write-Host "Total Minutes Saved: $($result.totalMinutesSaved)"
Write-Host "Total Hours Saved: $($result.totalHoursSaved)"
