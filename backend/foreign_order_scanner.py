import os
import sys
import time
import json
import sqlite3
import threading
import requests
from bs4 import BeautifulSoup
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

# Proxy Configuration (e.g., ScraperAPI, BrightData, or any HTTP proxy)
# 예: "http://scraperapi:YOUR_API_KEY@proxy-server.scraperapi.com:8001"
PROXY_URL = os.environ.get("PROXY_URL", "")
PROXIES = {"http": PROXY_URL, "https": PROXY_URL} if PROXY_URL else None


CACHE_FILE = os.path.join(os.path.dirname(__file__), "data", "foreign_stocks_cache.json")

_foreign_stocks_cache: List[Dict[str, Any]] = []
_last_scan_time: float = 0.0
_scan_lock = threading.Lock()
_bg_thread_started: bool = False

def _load_disk_cache():
    """디스크 캐시 로드"""
    global _foreign_stocks_cache, _last_scan_time
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                _foreign_stocks_cache = data.get('stocks', [])
                _last_scan_time = data.get('updated_at', 0.0)
                print(f"[ForeignScanner] Loaded {len(_foreign_stocks_cache)} stocks from disk cache.", flush=True)
        except Exception as e:
            print(f"[ForeignScanner] Disk cache load error: {e}", flush=True)

# 초기 로드
_load_disk_cache()


def get_base_tickers() -> Dict[str, Dict[str, Any]]:
    """
    KOSPI 및 KOSDAQ 시장의 상위 핵심 상장 종목군 수집 (각 100종목 총 200종목)
    """
    tickers_dict = {}

    try:
        mobile_headers = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148'
        }
        for market in ['KOSPI', 'KOSDAQ']:
            try:
                url = f"https://m.stock.naver.com/api/stocks/marketValue/{market}?page=1&pageSize=100"
                r = requests.get(url, headers=mobile_headers, proxies=PROXIES, timeout=10.0)
                if r.status_code == 200:
                    data = r.json()
                    for s in data.get('stocks', []):
                        code = s.get('itemCode')
                        name = s.get('stockName')
                        
                        price = s.get('closePriceRaw')
                        if isinstance(price, str): price = int(price.replace(',', ''))
                        elif price is None: price = 0
                        else: price = int(price)
                        
                        vol = s.get('accumulatedTradingVolumeRaw')
                        if isinstance(vol, str): vol = int(vol.replace(',', ''))
                        elif vol is None: vol = 0
                        else: vol = int(vol)
                        
                        if code and code not in tickers_dict:
                            tickers_dict[code] = {
                                'ticker': f"KRX:{code}",
                                'clean_ticker': code,
                                'name': name,
                                'market': market,
                                'price': float(price),
                                'change': 0,
                                'changePct': 0.0,
                                'volume': int(vol),
                                'total_volume': int(vol)
                            }
            except Exception as ex:
                print(f"[ForeignScanner] Error fetching {market}: {ex}", flush=True)
    except Exception as e:
        print(f"[ForeignScanner] Naver API error: {e}", flush=True)

    # Fallback: DB 보완
    if len(tickers_dict) < 50:
        db_path = os.path.join(os.path.dirname(__file__), "stock_data.sqlite3")
        if os.path.exists(db_path):
            try:
                conn = sqlite3.connect(db_path)
                cur = conn.cursor()
                cur.execute("SELECT ticker, name FROM stocks LIMIT 200")
                for row in cur.fetchall():
                    raw_ticker = row[0]
                    clean = raw_ticker.split(':')[-1] if ':' in raw_ticker else raw_ticker
                    if clean.isdigit() and len(clean) == 6 and clean not in tickers_dict:
                        tickers_dict[clean] = {
                            'ticker': f"KRX:{clean}",
                            'clean_ticker': clean,
                            'name': row[1],
                            'market': 'KOSPI',
                            'price': 1000.0,
                            'change': 0,
                            'changePct': 0.0,
                            'volume': 1000000,
                            'total_volume': 1000000
                        }
                conn.close()
            except Exception as dbe:
                print(f"[ForeignScanner] DB fallback error: {dbe}", flush=True)

    return tickers_dict


def fetch_single_foreign_net(stock_info: Dict[str, Any]) -> Dict[str, Any]:
    """개별 종목의 외국계 창구 순매수량 조회 (신규 네이버 API 사용)"""
    cd = stock_info['clean_ticker']
    url = f"https://m.stock.naver.com/api/stock/{cd}/integration"
    f_net = 0
    try:
        res = requests.get(url, headers=headers, proxies=PROXIES, timeout=10.0)
        if res.status_code == 200:
            data = res.json()
            trends = data.get("dealTrendInfos", [])
            if trends:
                raw = trends[0].get("foreignerPureBuyQuant", "0")
                raw = raw.replace(',', '').replace('+', '')
                if raw and raw.lstrip('-').isdigit():
                    f_net = int(raw)
    except Exception:
        pass

    vol = stock_info['volume']
    ratio = (f_net / vol * 100.0) if vol > 0 else 0.0
    
    return {
        **stock_info,
        'foreign_net_buy': f_net,
        'foreign_ratio': round(ratio, 2)
    }


def _execute_scan():
    """실제 전체 스캔 수행 로직 (스레드 내부)"""
    global _foreign_stocks_cache, _last_scan_time

    start_time = time.time()
    stock_map = get_base_tickers()
    if not stock_map:
        return

    # 2. 거래량 활성 종목에 대해 외국계 순매수 병렬 조회
    candidates = [s for s in stock_map.values() if s['volume'] > 500]
    results = []
    with ThreadPoolExecutor(max_workers=35) as executor:
        for r in executor.map(fetch_single_foreign_net, candidates):
            if r and r['price'] > 0:
                results.append(r)

    _foreign_stocks_cache = results
    _last_scan_time = time.time()

    # 3. 디스크 캐시 파일로 저장
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                'updated_at': _last_scan_time,
                'stocks': results
            }, f, ensure_ascii=False, indent=2)
    except Exception as fe:
        print(f"[ForeignScanner] Failed to write disk cache: {fe}", flush=True)

    elapsed = time.time() - start_time
    print(f"[ForeignScanner] Successfully scanned {len(results)} active stocks in {elapsed:.2f}s.", flush=True)


def run_full_scan(wait: bool = True):
    """KOSPI + KOSDAQ 종목 실시간 시세 및 외국계 순매수 일괄 스캔"""
    if wait:
        with _scan_lock:
            _execute_scan()
    else:
        # non-blocking background trigger
        if _scan_lock.acquire(blocking=False):
            def _runner():
                try:
                    _execute_scan()
                finally:
                    _scan_lock.release()
            threading.Thread(target=_runner, daemon=True).start()


def start_bg_scanner():
    """백그라운드 자동 갱신 스레드 가동 (60초 주기)"""
    global _bg_thread_started
    if _bg_thread_started:
        return
    _bg_thread_started = True

    def _loop():
        # 디스크 캐시가 비어있으면 1회 즉시 실행
        if not _foreign_stocks_cache:
            run_full_scan(wait=True)

        while True:
            time.sleep(60) # 1분마다 주기적 백그라운드 갱신
            try:
                run_full_scan(wait=False)
            except Exception as e:
                print(f"[ForeignScanner] Loop scan error: {e}", flush=True)

    threading.Thread(target=_loop, daemon=True).start()


def scan_foreign_order_stocks(threshold: float = 5.0, limit: int = 20, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    KOSPI 및 KOSDAQ 전종목 중 외국계 창구 순매수 비중이 threshold% 이상인 종목을
    비중 내림차순으로 상위 최대 limit개 (limit개 이하면 있는 개수 그대로) 반환
    """
    global _foreign_stocks_cache, _last_scan_time

    # 백그라운드 갱신 스레드 가동 보장
    start_bg_scanner()

    now = time.time()
    # 캐시가 전혀 없거나 force_refresh인 경우
    if force_refresh or not _foreign_stocks_cache:
        run_full_scan(wait=True)
    elif (now - _last_scan_time) > 120:
        # 캐시가 2분 이상 경과했으면 백그라운드로 갱신 트리거하고 현재 캐시 즉각 반환
        run_full_scan(wait=False)

    # 1. threshold 이상 필터링
    filtered = [s for s in _foreign_stocks_cache if s.get('foreign_ratio', 0) >= threshold]
    # 2. 비중 높은 순 정렬
    filtered.sort(key=lambda x: x.get('foreign_ratio', 0), reverse=True)
    # 3. 상위 limit개 추출 (20개 이하면 그 개수 그대로!)
    return filtered[:limit]


if __name__ == "__main__":
    print("Testing foreign_order_scanner...", flush=True)
    res = scan_foreign_order_stocks(threshold=5.0, limit=20, force_refresh=True)
    print(f"\nScan results (Found {len(res)} stocks >= 5%):", flush=True)
    for i, s in enumerate(res, 1):
        print(f"{i:2d}. [{s['market']}] {s['name']}({s['clean_ticker']}): 가격={s['price']:,}원 | 순매수={s['foreign_net_buy']:,}주 | 거래량={s['volume']:,}주 | 비중={s['foreign_ratio']}%", flush=True)
