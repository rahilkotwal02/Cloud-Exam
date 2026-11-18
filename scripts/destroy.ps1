# Teardown script for ExamCloud (PowerShell)
# Deletes all AWS resources to eliminate any ongoing charges.
$ErrorActionPreference = "Stop"

$infraDir = Join-Path $PSScriptRoot "..\infra"
$binDir = Join-Path $PSScriptRoot "..\bin"
if (Test-Path $binDir) {
    $env:PATH = "$binDir;$env:PATH"
}
Set-Location $infraDir

Write-Host "WARNING: This will destroy all ExamCloud AWS resources (ALB, ASG, EC2, RDS, S3, etc.)." -ForegroundColor Yellow
$confirm = Read-Host "Are you sure you want to proceed? (yes/no)"
if ($confirm -ne "yes") {
    Write-Host "Teardown aborted." -ForegroundColor Green
    exit 0
}

Write-Host "Running terraform destroy..." -ForegroundColor Red
terraform destroy -auto-approve

Write-Host "All AWS resources destroyed successfully. Billing stopped." -ForegroundColor Green
