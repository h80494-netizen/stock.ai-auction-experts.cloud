#!/bin/bash
# AWS 배포 스크립트 (deploy_aws.sh)
# 주의: 실행 전 AWS 인스턴스 IP와 SSH 키 파일 경로를 설정해 주세요.

# --- 설정 변수 ---
AWS_IP="YOUR_AWS_EC2_IP" # 예: 3.3.3.3
SSH_KEY_PATH="~/.ssh/your_aws_key.pem"
REMOTE_USER="ubuntu"     # ubuntu, ec2-user 등
REMOTE_DIR="~/stock_project/backend"
# -----------------

echo "AWS 서버($AWS_IP)에 백엔드 파일(main.py, kis_foreign_scanner.py)을 배포합니다..."

# 1. 파일 복사 (scp 사용)
scp -i "$SSH_KEY_PATH" ./kis_foreign_scanner.py ./main.py $REMOTE_USER@$AWS_IP:$REMOTE_DIR/

if [ $? -eq 0 ]; then
    echo "파일 전송 완료!"
    echo "원격 서버의 백엔드 서비스를 재시작합니다..."
    ssh -i "$SSH_KEY_PATH" $REMOTE_USER@$AWS_IP "sudo systemctl restart stock-backend 2>/dev/null || pkill -f 'uvicorn main:app' && cd $REMOTE_DIR && nohup uvicorn main:app --host 0.0.0.0 --port 8000 > app.log 2>&1 &"
else
    echo "파일 전송 실패. SSH 키 경로와 IP를 확인해 주세요."
    exit 1
fi

# 2. 크론탭(crontab) 설정 안내
echo "
[배포 완료]
이제 AWS 서버에 접속하여 스케줄러(cron)에 등록해 주세요.

접속 명령어:
ssh -i \"$SSH_KEY_PATH\" $REMOTE_USER@$AWS_IP

AWS 서버 내 크론탭 등록 예시 (매일 15:40 에 실행 시):
1. crontab -e 입력
2. 아래 줄 추가:
   40 15 * * 1-5 cd $REMOTE_DIR && python3 kis_foreign_scanner.py >> scan_log.txt 2>&1
"
