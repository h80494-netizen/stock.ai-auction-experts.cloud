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
    KIS API를 우선 사용하여 단일 종목의 외국인(외국계) 순매수 및 거래량 비중을 계산합니다.
    실패 시 네이버 금융 스크래퍼로 실시간 보정합니다.
    """
    ticker = stock_info.get('clean_ticker', stock_info.get('ticker'))
    if ticker.startswith('KRX:'):
        ticker = ticker.split(':')[1]
    
    f_net = 0
    vol = 0
    price = stock_info.get('price', 0)
    change = stock_info.get('change', 0)
    change_pct = stock_info.get('changePct', 0.0)
    
    # 1. KIS API 시도
    try:
        if kis_client:
            # 현재가 상세 정보 조회 (거래량 포함)
            detail = kis_client.get_current_price_detail(ticker)
            if detail and detail.get('price', 0) > 0:
                price = detail.get('price', price)
                change = detail.get('change', change)
                change_pct = detail.get('changePct', change_pct)
                vol = detail.get('volume', 0)
            
            # 외국계 창구(증권사) 매매 동향 조회
            broker_trend = kis_client.get_foreign_broker_trend(ticker)
            if broker_trend:
                raw_f_net = broker_trend.get("glob_ntby_qty", "0")
                if raw_f_net.lstrip('-').isdigit():
                    f_net = int(raw_f_net)
                if vol == 0:
                    acml = broker_trend.get("acml_vol", "0")
                    if acml.isdigit():
                        vol = int(acml)
    except Exception as e:
        print(f"[KISForeignScanner] API Error for {ticker}: {e}")

    # 2. 만약 KIS에서 가격이나 거래량을 못 가져왔거나 f_net이 0인 경우 네이버 스크래퍼로 fallback
    if price <= 0 or vol <= 0:
        try:
            from naver_finance_scraper import naver_scraper
            detail = naver_scraper.get_current_price_detail(ticker)
            if detail and detail.get('price', 0) > 0:
                price = detail.get('price', price)
                change = detail.get('change', change)
                change_pct = detail.get('changePct', change_pct)
                if vol == 0:
                    vol = detail.get('volume', 0)
            if f_net == 0:
                f_net = naver_scraper.get_foreign_brokerage_net_buy(ticker)
        except Exception as ne:
            print(f"[KISForeignScanner] Naver fallback error for {ticker}: {ne}")

    ratio = (f_net / vol * 100.0) if vol > 0 else 0.0
    
    stock_info['price'] = price
    stock_info['change'] = change
    stock_info['changePct'] = change_pct
    stock_info['volume'] = vol
    stock_info['total_volume'] = vol
    stock_info['clean_ticker'] = ticker
    stock_info['ticker'] = f"KRX:{ticker}" if not str(stock_info.get('ticker', '')).startswith('KRX:') else stock_info['ticker']
    stock_info['foreign_net_buy'] = f_net
    stock_info['foreign_ratio'] = round(ratio, 2)
    stock_info['currentRatio'] = round(ratio, 2)
    
    return stock_info

def execute_kis_scan():
    """전체 스캔 수행 로직 (스레드 내부)"""
    if not _scan_lock.acquire(blocking=False):
        print("[KISForeignScanner] Scan already in progress, skipping duplicate scan.")
        return []
        
    start_time = time.time()
    try:
        # 1. 대상 종목 200개 추출 (DB 또는 네이버 랭킹 활용)
        stock_map = get_base_tickers()
        if not stock_map:
            print("[KISForeignScanner] No base tickers found.")
            return []

        if isinstance(stock_map, dict):
            base_list = list(stock_map.values())
        else:
            base_list = stock_map

        candidates = [s for s in base_list if s.get('volume', 1000) > 500]
        results = []
        
        print(f"[KISForeignScanner] Scanning {len(candidates)} stocks using KIS API...")
        
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
    finally:
        _scan_lock.release()

def _background_scan():
    try:
        execute_kis_scan()
    except Exception as e:
        print(f"[KISForeignScanner] background scan error: {e}")

import datetime

# 9시 5분 동결 스냅샷 파일 경로
SNAPSHOT_0905_FILE = os.path.join(os.path.dirname(__file__), "data", "foreign_orders_0905.json")

def get_snapshot_0905_map() -> Dict[str, float]:
    """오늘 날짜의 09:05 스냅샷 비율 맵 반환 (없으면 빈 딕셔너리)"""
    if not os.path.exists(SNAPSHOT_0905_FILE):
        return {}
    try:
        with open(SNAPSHOT_0905_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            today_str = datetime.datetime.now().strftime("%Y-%m-%d")
            if data.get("date") == today_str:
                return data.get("ratios", {})
    except Exception as e:
        print(f"[KISForeignScanner] Snapshot read error: {e}")
    return {}

def save_snapshot_0905(results: List[Dict[str, Any]]):
    """현재 스캔 결과를 오늘 날짜 09:05 스냅샷으로 저장"""
    try:
        os.makedirs(os.path.dirname(SNAPSHOT_0905_FILE), exist_ok=True)
        today_str = datetime.datetime.now().strftime("%Y-%m-%d")
        r_map = {}
        for s in results:
            tk = s.get('clean_ticker') or s.get('ticker', '').replace('KRX:', '')
            if tk:
                r_map[tk] = s.get('foreign_ratio', 0.0)
        with open(SNAPSHOT_0905_FILE, 'w', encoding='utf-8') as f:
            json.dump({
                "date": today_str,
                "created_at": time.time(),
                "ratios": r_map
            }, f, ensure_ascii=False, indent=2)
        print(f"[KISForeignScanner] Saved 09:05 snapshot for {len(r_map)} stocks on {today_str}.")
    except Exception as e:
        print(f"[KISForeignScanner] Failed to save 09:05 snapshot: {e}")

def get_foreign_net_buy_stocks(threshold: float = 5.0, limit: int = 20, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    외국인 순매수 비중이 threshold% 이상인 종목을 내림차순으로 정렬하여 최대 limit개 반환
    장중에는 짧은 캐시 주기(60초)와 상위 종목 실시간 빠른 갱신을 통해 비중 변화를 즉각 반영합니다.
    """
    results = []
    need_update = force_refresh
    cache_age = 999999
    
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, 'r', encoding='utf-8') as f:
                data = json.load(f)
                results = data.get('stocks', [])
                updated_at = data.get('updated_at', 0)
                cache_age = time.time() - updated_at
                # 장중(평일 9시~15시30분)에는 60초 초과 시 갱신 필요, 장외에는 300초
                now = datetime.datetime.now()
                is_market_hours = (now.weekday() < 5 and 9 <= now.hour < 16)
                ttl = 60 if is_market_hours else 300
                if cache_age > ttl:
                    need_update = True
        except Exception as e:
            print(f"[KISForeignScanner] Cache read error: {e}")
            need_update = True
    else:
        need_update = True
            
    if need_update and not _scan_lock.locked():
        # 백그라운드에서 전체 200개 종목 스캔 실행
        threading.Thread(target=_background_scan, daemon=True).start()
        
    # 09:05 스냅샷 맵 확인
    snap_map = get_snapshot_0905_map()
    if not snap_map and results:
        save_snapshot_0905(results)
        snap_map = get_snapshot_0905_map()

    # 상위 종목군 및 09:05 스냅샷 종목에 대해 실시간 값(외국계순매수, 거래량, 현재가)을 즉시 최신화
    # 사용자가 기다리지 않도록 상위 25개 종목만 빠르게 동기 갱신 (캐시가 10초 이상 지났을 때)
    if results and cache_age > 10:
        candidates_to_refresh = []
        for s in results:
            tk = s.get('clean_ticker') or s.get('ticker', '').replace('KRX:', '')
            r0905 = snap_map.get(tk, s.get('foreign_ratio', 0.0))
            if r0905 >= threshold or s.get('foreign_ratio', 0.0) >= threshold:
                candidates_to_refresh.append(s)
            if len(candidates_to_refresh) >= 25:
                break
        
        if candidates_to_refresh:
            try:
                with ThreadPoolExecutor(max_workers=5) as executor:
                    refreshed = list(executor.map(fetch_kis_foreign_net, candidates_to_refresh))
                # results 내부 해당 종목 업데이트
                ref_map = { (r.get('clean_ticker') or r.get('ticker', '').replace('KRX:', '')): r for r in refreshed }
                for idx, item in enumerate(results):
                    it_tk = item.get('clean_ticker') or item.get('ticker', '').replace('KRX:', '')
                    if it_tk in ref_map:
                        results[idx] = ref_map[it_tk]
            except Exception as ref_err:
                print(f"[KISForeignScanner] Quick refresh error: {ref_err}")

    # 종목별 ratio0905 (09:05 고정값) 및 foreign_ratio / currentRatio (실시간 수치) 매핑
    output = []
    for s in results:
        s_copy = dict(s)
        tk = s_copy.get('clean_ticker') or s_copy.get('ticker', '').replace('KRX:', '')
        ratio_0905 = snap_map.get(tk, s_copy.get('foreign_ratio', 0.0))
        s_copy['ratio0905'] = ratio_0905
        s_copy['foreign_ratio_0905'] = ratio_0905
        # 실시간 비중 동기화
        live_r = s_copy.get('foreign_ratio', 0.0)
        s_copy['currentRatio'] = live_r
        output.append(s_copy)

    # 매수 추천 기준: 9시 5분 고정 비중이 threshold% 이상인 종목들
    filtered = [s for s in output if s.get('ratio0905', 0.0) >= threshold or s.get('foreign_ratio', 0.0) >= threshold]
    filtered.sort(key=lambda x: x.get('foreign_ratio', 0.0), reverse=True)
    return filtered[:limit]

if __name__ == "__main__":
    print("Testing KIS foreign order scanner...")
    res = get_foreign_net_buy_stocks(threshold=5.0, limit=20)
    print(f"\nScan results (Found {len(res)} stocks >= 5%):")
    for i, s in enumerate(res, 1):
        print(f"{i:2d}. [{s['market']}] {s['name']}({s['clean_ticker']}): 가격={s['price']:,}원 | 순매수={s['foreign_net_buy']:,}주 | 거래량={s['volume']:,}주 | 비중={s['foreign_ratio']}%")
