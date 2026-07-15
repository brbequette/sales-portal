$r = Invoke-RestMethod -Uri 'https://www.tdusales.com/api/admin/users' -Method GET
$brian = $r.users | Where-Object { $_.name -like '*Brian*' -or $_.name -like '*Basil*' -or $_.email -like '*brian*' -or $_.email -like '*basil*' }
if ($brian) {
    Write-Host "Found user(s):"
    $brian | ForEach-Object {
        Write-Host "  ID: $($_.id)"
        Write-Host "  Name: $($_.name)"
        Write-Host "  Email: $($_.email)"
        Write-Host "  Role: $($_.role)"
        Write-Host "  ZohoId: $($_.zohoId)"
        Write-Host "  ---"
    }
} else {
    Write-Host "No user found matching 'Brian' or 'Basil'"
    Write-Host ""
    Write-Host "All users:"
    $r.users | ForEach-Object { Write-Host "  $($_.name) | $($_.email) | zohoId=$($_.zohoId)" }
}
