#!/usr/bin/env bash
# Delete everything this project created, so you stop paying for it.
set -euo pipefail
cd "$(dirname "$0")/../infra"
terraform destroy -auto-approve
