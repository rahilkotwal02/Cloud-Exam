# One-command deploy of ExamCloud to AWS (PowerShell)
$ErrorActionPreference = "Stop"

$infraDir = Join-Path $PSScriptRoot "..\infra"
$binDir = Join-Path $PSScriptRoot "..\bin"
if (Test-Path $binDir) {
    $env:PATH = "$binDir;$env:PATH"
}
Set-Location $infraDir

# Check Terraform
if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    Write-Error "Terraform is not installed or not in PATH. Install from: https://developer.hashicorp.com/terraform/install"
    exit 1
}

# Check AWS CLI
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Error "AWS CLI is not installed or not in PATH. Install from: https://aws.amazon.com/cli/"
    exit 1
}

# Verify credentials
Write-Host "Verifying AWS credentials..." -ForegroundColor Cyan
try {
    $identity = aws sts get-caller-identity | ConvertFrom-Json
    Write-Host "Authenticated as AWS Account: $($identity.Account) (Arn: $($identity.Arn))" -ForegroundColor Green
} catch {
    Write-Error "AWS credentials not working. Run 'aws configure' first."
    exit 1
}

if (-not (Test-Path "terraform.tfvars")) {
    Copy-Item "terraform.tfvars.example" "terraform.tfvars"
    Write-Host "Created terraform.tfvars from template." -ForegroundColor Yellow
}

Write-Host "Initializing Terraform..." -ForegroundColor Cyan
terraform init -input=false

Write-Host "Deploying infrastructure to AWS..." -ForegroundColor Cyan
terraform apply -auto-approve

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "ExamCloud successfully deployed to AWS!" -ForegroundColor Green
Write-Host "Allow 3-5 minutes for EC2 servers to finish boot sequence." -ForegroundColor Yellow
$appUrl = terraform output -raw app_url
$adminEmail = terraform output -raw admin_email
$adminPass = terraform output -raw admin_password
Write-Host "App URL: $appUrl" -ForegroundColor Cyan
Write-Host "Admin Email: $adminEmail" -ForegroundColor White
Write-Host "Admin Password: $adminPass" -ForegroundColor White
Write-Host "==========================================================" -ForegroundColor Green
