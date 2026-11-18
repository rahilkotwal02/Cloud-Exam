# Load testing script using Locust (PowerShell)
# Usage: .\scripts\loadtest.ps1 [-Users 300] [-SpawnRate 10] [-Duration "5m"]
param(
    [int]$Users = 300,
    [int]$SpawnRate = 10,
    [string]$Duration = "5m"
)

$ErrorActionPreference = "Stop"

$infraDir = Join-Path $PSScriptRoot "..\infra"
$binDir = Join-Path $PSScriptRoot "..\bin"
if (Test-Path $binDir) {
    $env:PATH = "$binDir;$env:PATH"
}
$loadtestDir = Join-Path $PSScriptRoot "..\loadtest"

Write-Host "Fetching App URL from Terraform..." -ForegroundColor Cyan
Set-Location $infraDir
$appUrl = (terraform output -raw app_url).Trim()

if (-not $appUrl) {
    Write-Host "No deployed AWS App URL found. Testing against local Docker instance (http://localhost:3000)..." -ForegroundColor Yellow
    $appUrl = "http://localhost:3000"
}

Write-Host "Target Host: $appUrl" -ForegroundColor Green
Write-Host "Simulating $Users users at rate $SpawnRate users/sec for $Duration..." -ForegroundColor Cyan

Set-Location $loadtestDir

# Install requirements if locust is not installed
if (-not (Get-Command locust -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Locust..." -ForegroundColor Cyan
    pip install -r requirements.txt
}

$csvPrefix = "results_${Users}users"
$htmlReport = "report_${Users}users.html"

locust -f locustfile.py --host $appUrl --headless -u $Users -r $SpawnRate -t $Duration --csv $csvPrefix --html $htmlReport

Write-Host "Load test complete!" -ForegroundColor Green
Write-Host "HTML Report saved: $loadtestDir\$htmlReport" -ForegroundColor White
Write-Host "CSV Summary saved: $loadtestDir\${csvPrefix}_stats.csv" -ForegroundColor White
