import os
import sys
import time
import schedule
from datetime import datetime
from dotenv import load_dotenv

# Path setup for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import database as db
from ingestion.seed_all_dart_companies import seed_all_dart_companies

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(env_path)
load_dotenv()

def run_quarterly_auto_update():
    """
    매월 중순(분기 발표 주기: 5월, 8월, 11월, 3월 중순) DART 최신 분기 실적 자동 수집 데몬
    1) 1,800여 개 전체 상장기업 최신 분기 수집
    2) 개별 기업별 최신 12분기(3년) 초과 구 데이터 자동 삭제 (12분기 롤링 유지)
    3) TTM (최근 4분기 누적 연 실적) 재산출 및 DB 업데이트
    """
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{now_str}] 🔄 [DART Quarterly Auto-Updater] Starting quarterly auto-sync...")
    
    try:
        # 1. 1,800개 상장기업 수집 및 12분기 롤링 정리 자동 수행
        seed_all_dart_companies(max_count=3000)
        
        # 2. TTM 연간 실적 재산출 일괄 수행
        db.recalculate_all_ttm_financials()
        
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] 🎉 [DART Quarterly Auto-Updater] Sync & 12-quarter rolling prune completed successfully!")
    except Exception as e:
        print(f"[DART Quarterly Auto-Updater Error]: {e}")

def start_daemon_schedule():
    """매월 15일 및 30일 중순마다 정기 업데이트 스케줄러 등록"""
    print("⏰ [DART Auto-Daemon] Schedule started (Running auto-sync on mid-month & quarterly release cycles)")
    
    # 매월 15일 03:00 및 30일 03:00 백그라운드 수집
    schedule.every().day.at("03:30").do(check_mid_month_schedule)

def check_mid_month_schedule():
    today = datetime.now()
    # 매월 중순 (15일~17일) 또는 분기 실적 마무리 시점 (30일전후) 정기 갱신
    if today.day in [15, 16, 30]:
        run_quarterly_auto_update()

if __name__ == "__main__":
    print("🚀 Running one-time DART quarterly auto-update test...")
    run_quarterly_auto_update()
