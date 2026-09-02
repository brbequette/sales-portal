$ErrorActionPreference = "Stop"
$lanAddress = "192.168.0.108"
$port = 3001
netsh interface portproxy delete v4tov4 listenaddress=$lanAddress listenport=$port 2>$null | Out-Null
netsh interface portproxy add v4tov4 listenaddress=$lanAddress listenport=$port connectaddress=127.0.0.1 connectport=$port | Out-Null
$ruleName = "Titan Dev Backend 3001"
if (-not (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -DisplayName $ruleName -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -Profile Private | Out-Null
}
