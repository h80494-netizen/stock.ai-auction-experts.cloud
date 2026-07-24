import os
import sys
import sqlite3
import time

# 부모 디렉토리의 모듈을 임포트하기 위해 경로 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import get_db_connection, insert_analyst_target_history
from ingestion.scrapers.naver_scraper import get_naver_target_history

def get_all_korean_tickers():
    conn = get_db_connection()
    c = conn.cursor()
    # 한국 주식만 (숫자로만 이루어진 티커 또는 KRX: 로 시작하는 티커)
    c.execute('SELECT ticker FROM stocks')
    rows = c.fetchall()
    conn.close()
    
    korean_tickers = []
    for row in rows:
        ticker = row['ticker']
        clean_ticker = ticker.split('.')[0] if '.' in ticker else ticker
        clean_ticker = clean_ticker.split(':')[-1] if ':' in clean_ticker else clean_ticker
        if clean_ticker.isdigit():
            korean_tickers.append(clean_ticker)
    
    return korean_tickers

def update_all_targets():
    print("Starting target price update...")
    tickers = get_all_korean_tickers()
    total = len(tickers)
    
    for i, ticker in enumerate(tickers):
        print(f"[{i+1}/{total}] Updating target history for {ticker}...")
        try:
            history = get_naver_target_history(ticker)
            if history:
                for item in history:
                    date = item.get('time')
                    text = item.get('text', '')
                    
                    target_price = 0
                    try:
                        # Extract target price from text "목표가: 10,000" or similar
                        if '목표가' in text:
                            val_str = text.split()[-1].replace(',', '')
                            if val_str.isdigit():
                                target_price = float(val_str)
                    except Exception as e:
                        pass
                        
                    insert_analyst_target_history(ticker, date, target_price, text)
            time.sleep(0.5) # Avoid hammering Naver too hard
        except Exception as e:
            print(f"Error updating {ticker}: {e}")

    print("Finished target price update.")

if __name__ == "__main__":
    update_all_targets()
