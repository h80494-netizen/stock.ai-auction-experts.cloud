import os
import sys
import time
import json
import sqlite3
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Any

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from kis_instance import kis_client
from foreign_order_scanner import get_base_tickers

# 결과를 저장할 캐시 파일 경로
CACHE_FILE = os.path.join(os.path.dirname(__file__), "data", "kis_foreign_stocks_cache.json")
_scan_lock = threading.Lock()

def fetch_kis_foreign_net(stock_info: Dict[str, Any]) -> Dict[str, Any]:
    """
    KIS API를 사용하여 단일 종목의 외국인(외국계) 순매수 및 거래량 비중을 계산합니다.
    """
    ticker = stock_info.get('clean_ticker', stock_info.get('ticker'))
    if ticker.startswith('KRX:'):
        ticker = ticker.split(':')[1]
    
    f_net = 0
    vol = 0
    
    try:
        # 현재가 상세 정보 조회 (거래량 포함)
        detail = kis_client.get_current_price_detail(ticker)
        vol = detail.get('volume', 0)
        stock_info['price'] = detail.get('price', stock_info.get('price', 0))
        stock_info['change'] = detail.get('change', stock_info.get('change', 0))
        stock_info['changePct'] = detail.get('changePct', stock_info.get('changePct', 0))
        stock_info['volume'] = vol
        stock_info['clean_ticker'] = ticker
        stock_info['ticker'] = f"KRX:{ticker}" if not stock_info.get('ticker', '').startswith('KRX:') else stock_info['ticker']
        
        # 외국계 창구(증권사) 매매 동향 조회
        broker_trend = kis_client.get_foreign_broker_trend(ticker)
        if broker_trend:
            # glob_ntby_qty: 외국계 창구 순매수 수량
            raw_f_net = broker_trend.get("glob_ntby_qty", "0")
            if raw_f_net.lstrip('-').isdigit():
                f_net = int(raw_f_net)
                
    except Exception as e:
        print(f"[KISForeignScanner] API Error for {ticker}: {e}")

    ratio = (f_net / vol * 100.0) if vol > 0 else 0.0
    
    return {
        **stock_info,
        'foreign_net_buy': f_net,
        'foreign_ratio': round(ratio, 2)
    }

def execute_kis_scan():
    """전체 스캔 수행 로직 (스레드 내부)"""
    start_time = time.time()
    
    # 1. 대상 종목 200개 추출 (DB 또는 네이버 랭킹 활용)
    stock_map = get_base_tickers()
    if not stock_map:
        print("[KISForeignScanner] No base tickers found.")
        return []

    if isinstance(stock_map, dict):
        base_list = list(stock_map.values())
    else:
        base_list = stock_map

    # base_list는 이미 시총 상위 200개 종목이므로 거래량 필터를 생략하거나 기본값을 줍니다.
    candidates = [s for s in base_list if s.get('volume', 1000) > 500]
    results = []
    
    print(f"[KISForeignScanner] Scanning {len(candidates)} stocks using KIS API...")
    
    # KIS API는 초당 15회 제한이 있으므로 workers를 5 정도로 제한하여 rate limit 초과 방지
    with ThreadPoolExecutor(max_workers=5) as executor:
        for r in executor.map(fetch_kis_foreign_net, candidates):
            if r and r['price'] > 0:
                results.append(r)

    # 디스크 캐시 파일로 저장
    try:
        os.makedirs(os.path.dirname(CACHE_FILE), exist_ok=True)
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                'updated_at': time.time(),
                'stocks': results
            }, f, ensure_ascii=False, indent=2)
    except Exception as fe:
        print(f"[KISForeignScanner] Failed to write disk cache: {fe}")

    elapsed = time.time() - start_time
    print(f"[KISForeignScanner] Successfully scanned {len(results)} active stocks in {elapsed:.2f}s.")
    return results

def _background_scan():
    try:
        execute_kis_scan()
    except Exception as e:
        print(f"[KISForeignScanner] background scan error: {e}")

def get_foreign_net_buy_stocks(threshold: float = 5.0, limit: int = 20) -> List[Dict[str, Any]]:
    """
    외국인 순매수 비중이 threshold% 이상인 종목을 내림차순으로 정렬하여 최대 limit개 반환
    (디스크 캐시를 읽어서 반환하며, 캐시가 오래되었으면 백그라운드 갱신)
    """
    results = []
    need_update = True
    
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                results = data.get('stocks', [])
                updated_at = data.get('updated_at', 0)
                # 캐시 유효기간 10분(600초) 설정
                if time.time() - updated_at < 600:
                    need_update = False
        except Exception as e:
            print(f"[KISForeignScanner] Cache read error: {e}")
            
    if need_update and not _scan_lock.locked():
        # 백그라운드에서 스캔 실행
        threading.Thread(target=_background_scan, daemon=True).start()
        
    filtered = [s for s in results if s.get('foreign_ratio', 0) >= threshold]
    filtered.sort(key=lambda x: x.get('foreign_ratio', 0), reverse=True)
    return filtered[:limit]

if __name__ == "__main__":
    print("Testing KIS foreign order scanner...")
    res = get_foreign_net_buy_stocks(threshold=5.0, limit=20)
    print(f"\nScan results (Found {len(res)} stocks >= 5%):")
    for i, s in enumerate(res, 1):
        print(f"{i:2d}. [{s['market']}] {s['name']}({s['clean_ticker']}): 가격={s['price']:,}원 | 순매수={s['foreign_net_buy']:,}주 | 거래량={s['volume']:,}주 | 비중={s['foreign_ratio']}%")
