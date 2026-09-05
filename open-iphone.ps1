param(
    [int]$Port = 8080,
    [string]$Page = "index.html"
)

$ErrorActionPreference = "Stop"

$workspace = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $workspace

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '169.254*' -and $_.IPAddress -ne '127.0.0.1' -and $_.InterfaceAlias -notlike '*vEthernet*' } |
    Select-Object -First 1 -ExpandProperty IPAddress)

if (-not $ip) {
    throw "Could not detect a LAN IPv4 address. Connect to Wi-Fi and try again."
}

$url = "http://$ip`:$Port/$Page"

Write-Host "Open this in Chrome on your iPhone (same Wi-Fi):" -ForegroundColor Cyan
Write-Host $url -ForegroundColor Yellow
