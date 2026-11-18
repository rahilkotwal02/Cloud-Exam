#!/bin/bash
# Bootstrap for an ExamCloud web server (Amazon Linux 2023).
# app-bundle-hash: ${app_hash}
set -eux
exec > >(tee /var/log/examcloud-bootstrap.log) 2>&1
export HOME=/root

# Node.js 20 (NodeSource first, Amazon Linux package as fallback)
if ! (curl -fsSL https://rpm.nodesource.com/setup_20.x | bash - && dnf install -y nodejs); then
  dnf install -y nodejs20 nodejs20-npm
fi
dnf install -y unzip

# Fetch and install the application
mkdir -p /opt/examcloud
aws s3 cp s3://${bucket}/artifacts/app.zip /tmp/app.zip --region ${region}
unzip -oq /tmp/app.zip -d /opt/examcloud
cd /opt/examcloud
npm install --omit=dev --no-audit --no-fund

id examcloud >/dev/null 2>&1 || useradd -r -s /sbin/nologin examcloud
chown -R examcloud:examcloud /opt/examcloud

# Runtime configuration. Passwords stay in Secrets Manager; only ARNs are written here.
cat > /etc/examcloud.env <<ENVEOF
PORT=3000
AWS_REGION=${region}
DB_HOST=${db_host}
DB_NAME=examcloud
DB_SECRET_ARN=${db_secret_arn}
APP_SECRET_ARN=${app_secret_arn}
S3_BUCKET=${bucket}
SES_FROM=${ses_sender}
ENVEOF
chmod 600 /etc/examcloud.env

NODE_BIN=$(command -v node)
cat > /etc/systemd/system/examcloud.service <<UNITEOF
[Unit]
Description=ExamCloud web app
After=network-online.target
Wants=network-online.target

[Service]
User=examcloud
WorkingDirectory=/opt/examcloud
EnvironmentFile=/etc/examcloud.env
ExecStart=$NODE_BIN server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNITEOF

systemctl daemon-reload
systemctl enable --now examcloud
