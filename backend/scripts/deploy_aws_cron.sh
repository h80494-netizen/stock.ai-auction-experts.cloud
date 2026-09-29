#!/bin/bash
# deploy_aws_cron.sh - AWS Server Cron Registration Script
# This script sets up a daily crontab task on AWS EC2 to automatically update 선물가격업데이트.xlsx

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_EXEC="$(which python3 || which python)"

CRON_JOB="30 16 * * 1-5 cd $PROJECT_DIR && $PYTHON_EXEC backend/ingestion/update_futures_excel.py >> $PROJECT_DIR/logs/futures_update.log 2>&1"

# Create logs directory if not exists
mkdir -p "$PROJECT_DIR/logs"

# Check if cron job already exists in crontab
(crontab -l 2>/dev/null | grep -F "update_futures_excel.py") >/dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "[Info] Cron job already registered in AWS crontab."
else
    # Append job to crontab
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "[Success] Registered daily futures update cron job on AWS (Mon-Fri 16:30 KST)."
fi

echo "Current active crontab:"
crontab -l | grep "update_futures_excel"
