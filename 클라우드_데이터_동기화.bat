@echo off
chcp 65001 > nul
echo =====================================================================
echo 주식 터미널 클라우드 서버(AWS)로 필수 데이터 및 설정 동기화
echo =====================================================================
echo.
echo [1/3] 로컬 데이터베이스, 엑셀, 설정 파일(토큰 등) 압축 중...

cd /d "C:\Users\llll\Documents\두인경매\주식투자\backend"
:: 기존 압축 파일이 있다면 삭제
if exist stock_backup.tar.gz del stock_backup.tar.gz

:: 필요한 파일들만 압축 (.db, .sqlite3, .xlsx, .xlsm, .env, json 등)
tar -czvf stock_backup.tar.gz *.db *.sqlite3 *.xlsx *.xlsm .env kis_token.json data/sector_details.json

echo.
echo [1.5/3] 프론트엔드 차트 이미지 전송 중...
scp -i "C:\Users\llll\Downloads\aws-key.pem" -o StrictHostKeyChecking=no "../frontend/public/charts/*.png" ubuntu@13.209.3.151:~/stock_project/frontend/public/charts/

echo.
echo [2/3] 클라우드 서버(13.209.3.151)로 파일 전송 중... (용량에 따라 수 분 소요될 수 있습니다)
scp -i "C:\Users\llll\Downloads\aws-key.pem" -o StrictHostKeyChecking=no stock_backup.tar.gz ubuntu@13.209.3.151:~/stock_project/backend/

echo.
echo [3/3] 서버에서 파일 압축 해제 중...
ssh -i "C:\Users\llll\Downloads\aws-key.pem" -o StrictHostKeyChecking=no ubuntu@13.209.3.151 "cd ~/stock_project/backend && tar -xzvf stock_backup.tar.gz && rm stock_backup.tar.gz"

:: 압축 완료 후 로컬 파일 삭제
del stock_backup.tar.gz
cd ..

echo.
echo =====================================================================
echo 동기화가 완료되었습니다! 
echo 이제 AWS 서버에서 앱을 재시작하시거나 서비스를 리로드해주세요.
echo (예: sudo systemctl restart 백엔드서비스이름)
echo =====================================================================
pause
