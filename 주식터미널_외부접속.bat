@echo off
chcp 65001 >nul
cd /d "C:\Users\llll\Documents\두인경매\바이브코딩"

echo =========================================================
echo 주식 터미널 - 외부 접속(스마트폰/외부PC) 터널 실행기
echo =========================================================
echo.
echo 외부 접속 도메인: https://stock.ai-auction-experts.cloud
echo.
echo 터널을 시작합니다... 이 창을 끄지 마시고 최소화 해주세요!
echo.

cloudflared.exe tunnel run ai-auction-tunnel
pause
