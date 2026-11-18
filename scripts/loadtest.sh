#!/usr/bin/env bash
# Usage: scripts/loadtest.sh [users] [spawn-rate] [duration]
# Saves CSV results in loadtest/results_* for your report graphs.
set -euo pipefail
USERS=${1:-300}; RATE=${2:-10}; TIME=${3:-5m}
URL=$(cd "$(dirname "$0")/../infra" && terraform output -raw app_url)
cd "$(dirname "$0")/../loadtest"
pip install -q -r requirements.txt
locust -f locustfile.py --host "$URL" --headless -u "$USERS" -r "$RATE" -t "$TIME" --csv "results_${USERS}users" --html "report_${USERS}users.html"
echo "Done. Watch instances scale out in the CloudWatch dashboard: $(cd ../infra && terraform output -raw dashboard_url)"
