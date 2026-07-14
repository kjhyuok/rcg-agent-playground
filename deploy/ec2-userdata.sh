#!/bin/bash
# EC2 UserData — Agent Playground (Code Editor 대체, SageMaker 불필요)
# AMI: ami-0fd6240f599091088 (Amazon Linux 2023) / Instance: t3.large
# 참가자별 워크샵 계정에서 이 UserData로 EC2를 띄우면 포트 3000(UI)/5050(API)에서 바로 접속 가능.
set -e
exec > /var/log/playground-setup.log 2>&1
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs git python3-pip
cd /opt
git clone https://github.com/kjhyuok/rcg-agent-playground.git playground
cd playground
npm install
npm run build
cd api && pip3 install -r requirements.txt && cd /opt/playground
export AWS_REGION=us-west-2
nohup python3 api/app.py > /var/log/playground-api.log 2>&1 &
nohup npx next start -p 3000 -H 0.0.0.0 > /var/log/playground-ui.log 2>&1 &
echo "READY" > /tmp/playground-status
