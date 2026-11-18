#!/usr/bin/env bash
# One-command deploy of ExamCloud to AWS.
set -euo pipefail
cd "$(dirname "$0")/../infra"

command -v terraform >/dev/null || { echo "Install Terraform first: https://developer.hashicorp.com/terraform/install"; exit 1; }
command -v aws >/dev/null || { echo "Install the AWS CLI first and run: aws configure"; exit 1; }
aws sts get-caller-identity >/dev/null || { echo "AWS credentials not working. Run: aws configure"; exit 1; }

[ -f terraform.tfvars ] || cp terraform.tfvars.example terraform.tfvars
terraform init -input=false
terraform apply -auto-approve

echo
echo "Deployed. Allow 3-5 minutes for the servers to boot, then open:"
terraform output -raw app_url; echo
echo "Admin login: $(terraform output -raw admin_email)"
echo "Admin password: terraform output -raw admin_password"
