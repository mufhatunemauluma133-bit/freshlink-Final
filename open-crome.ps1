param(
    [int]$Port = 8080,
    [string]$Page = "index.html"
)

$ErrorActionPreference = "Stop"

$url = "http://localhost:$Port/$Page"

# Try Chrome by executable name first (works when Chrome is on PATH).
try {
    Start-Process "chrome.exe" $url | Out-Null
    Write-Host "Opened in Chrome: $url" -ForegroundColor Green
    return
} catch {
    # Fall back to the default Windows Chrome install path.
}

$defaultChromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (Test-Path $defaultChromePath) {
    Start-Process $defaultChromePath $url | Out-Null
    Write-Host "Opened in Chrome: $url" -ForegroundColor Green
    return
}

Write-Host "Chrome not found. Open this link manually:" -ForegroundColor Yellow
Write-Host $url -ForegroundColor Cyan
