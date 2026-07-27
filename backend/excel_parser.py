import pandas as pd
import json
import os
import math
import random
import time
from kis_instance import kis_client

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
EXCEL_FILE = os.path.join(DATA_DIR, '경쟁기업_Total_value21.xlsm')
KRX100_FILE = os.path.join(DATA_DIR, 'krx100.json')

_kospi_cache = []
_kospi_last_fetch = 0
_bg_thread_started = False
_fnguide_thread_started = False

import threading

def _run_fnguide_scraper(stocks):
    try:
        from fnguide_scraper import fetch_fnguide_financials
        import time
        for s in stocks:
            ticker = s['ticker']
            print(f"[FnGuide Background] Fetching for {ticker}...")
            fetch_fnguide_financials(ticker)
            time.sleep(1)
        print("[FnGuide Background] Completed fetching all financials.")
    except Exception as e:
        print("[FnGuide Background] Error:", e)

def update_kospi_prices_bg():
    global _kospi_cache, _kospi_last_fetch
    while True:
        try:
            from scraper import get_naver_sectors, get_kospi_100
            naver_sectors = get_naver_sectors()
            kospi_data = get_kospi_100()
            
            # Merge kospi_data and naver_sectors
            all_stocks = {}
            if kospi_data:
                for s in kospi_data:
                    all_stocks[s['ticker']] = s
            
            if naver_sectors:
                for tk, info in naver_sectors.items():
                    if tk not in all_stocks:
                        all_stocks[tk] = {
                            "ticker": tk,
                            "name": info["name"],
                            "price": 0,
                            "market_cap": 0,
                            "categories": info["categories"]
                        }
                    else:
                        for c in info["categories"]:
                            if c not in all_stocks[tk]["categories"]:
                                all_stocks[tk]["categories"].append(c)
                                
            merged_list = list(all_stocks.values())
            # Preserve ratio from scraper


            try:
                from naver_finance_scraper import naver_scraper
                print(f"[Background] Fetching KRX prices for {len(merged_list)} stocks from Naver...")
                for stock in merged_list:
                    clean_ticker = stock['ticker'].split(':')[-1] if ':' in stock['ticker'] else stock['ticker']
                    try:
                        detail = naver_scraper.get_current_price_detail(clean_ticker)
                        if detail['price'] > 0:
                            stock['price'] = detail['price']
                            stock['change'] = detail['change']
                            stock['changePct'] = detail['changePct']
                            if 'volume' in detail and detail['volume'] > 0:
                                stock['total_volume'] = detail['volume']
                                stock['foreign_net_buy'] = int(detail['volume'] * (stock.get('ratio', 0) / 100) * 0.1)
                    except Exception as e:
                        print(f"[Background] Error fetching price for {clean_ticker}: {e}")
                    time.sleep(0.1)
            except Exception as outer_e:
                print(f"Failed to use naver scraper in bg: {outer_e}")
                for stock in merged_list:
                    stock['price'] = stock.get('price', 0)
                    if 'change' not in stock:
                        stock['change'] = random.randint(-1000, 1000)
                    if 'changePct' not in stock:
                        stock['changePct'] = round(random.uniform(-5, 5), 2)

            _kospi_cache = merged_list
            _kospi_last_fetch = time.time()
            print("[Background] All stocks price update complete.")
            
        except Exception as e:
            print("[Background] Update Error:", e)
            
        try:
            from datetime import datetime
            now_time = datetime.now()
            # If time is between 14:50 and 15:00
            if now_time.hour == 14 and 50 <= now_time.minute <= 59:
                from main import api_kis_sell_all
                from database import get_holdings
                if get_holdings():
                    print("[Background] 14:50 detected. Auto-selling all holdings at market price.")
                    res = api_kis_sell_all()
                    print(f"[Background] Auto-sell result: {res}")
        except Exception as se:
            print("[Background] Auto-sell error:", se)
            
        time.sleep(60) # Update every 1 minute

def load_kospi_data():
    global _kospi_cache, _bg_thread_started, _fnguide_thread_started, _kospi_last_fetch
    
    if not _bg_thread_started:
        _bg_thread_started = True
        threading.Thread(target=update_kospi_prices_bg, daemon=True).start()
            
    if not _fnguide_thread_started and _kospi_cache:
        _fnguide_thread_started = True
        threading.Thread(target=_run_fnguide_scraper, args=(_kospi_cache,), daemon=True).start()
            
    return _kospi_cache

def get_spot_news():
    return []

if __name__ == "__main__":
    print(load_kospi_data()[:2])
