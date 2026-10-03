import os
import sys
import re
import time
import requests
import zipfile
import io
import xml.etree.ElementTree as ET
from dotenv import load_dotenv

# Path setup for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import database as db

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(env_path)
load_dotenv()

DART_API_KEY = os.environ.get("DART_API_KEY") or "539baccadbc74546d98d2d0b1d5f2763886d8ea1"

def get_corp_code_map():
    """DART OpenAPI에서 stock_code -> corp_code 맵 생성"""
    url = f"https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={DART_API_KEY}"
    res = requests.get(url)
    res.raise_for_status()

    code_map = {}
    with zipfile.ZipFile(io.BytesIO(res.content)) as z:
        with z.open("CORPCODE.xml") as f:
            tree = ET.parse(f)
            root = tree.getroot()
            for list_node in root.findall("list"):
                corp_code = list_node.findtext("corp_code")
                stock_code = list_node.findtext("stock_code")
                if corp_code and stock_code and stock_code.strip():
                    code_map[stock_code.strip().zfill(6)] = corp_code.strip().zfill(8)
    return code_map

def fetch_and_save_company_financials(ticker: str, corp_code: str, year: str = "2023", reprt_code: str = "11011"):
    """개별 상장기업의 DART 재무제표 수집 및 DB 저장"""
    clean_ticker = ticker.strip().zfill(6)
    clean_corp = corp_code.strip().zfill(8)
    
    url_all = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"
    url_single = "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json"
    
    data = None
    for fs in ["CFS", "OFS"]:
        try:
            res = requests.get(url_all, params={"crtfc_key": DART_API_KEY, "corp_code": clean_corp, "bsns_year": year, "reprt_code": reprt_code, "fs_div": fs}, timeout=5)
            if res.status_code == 200:
                j = res.json()
                if j.get("status") == "000" and j.get("list"):
                    data = j
                    break
        except Exception:
            pass

    if not data or not data.get("list"):
        try:
            res = requests.get(url_single, params={"crtfc_key": DART_API_KEY, "corp_code": clean_corp, "bsns_year": year, "reprt_code": reprt_code}, timeout=5)
            if res.status_code == 200:
                j = res.json()
                if j.get("status") == "000" and j.get("list"):
                    data = j
        except Exception:
            pass

    if not data or not data.get("list"):
        return False
            
    assets = 0
    equity = 0
    liabilities = 0
    revenue = 0
    operating_profit = 0
    net_profit = 0

    for item in data.get("list", []):
        acc_nm = item.get("account_nm", "").strip()
        amount_str = item.get("thstrm_amount")
        fs_div = item.get("fs_div")
        
        if not amount_str or amount_str == "-":
            continue
            
        try:
            val = int(amount_str.replace(",", ""))
        except ValueError:
            continue

        if "자산총계" in acc_nm and (assets == 0 or fs_div == 'CFS'):
            assets = val
        elif "자본총계" in acc_nm and (equity == 0 or fs_div == 'CFS'):
            equity = val
        elif "부채총계" in acc_nm and (liabilities == 0 or fs_div == 'CFS'):
            liabilities = val
        elif ("매출" in acc_nm or "수익" in acc_nm) and (revenue == 0 or fs_div == 'CFS'):
            revenue = val
        elif "영업이익" in acc_nm and (operating_profit == 0 or fs_div == 'CFS'):
            operating_profit = val
        elif "당기순이익" in acc_nm and (net_profit == 0 or fs_div == 'CFS'):
            net_profit = val
    
    if assets == 0 and revenue == 0 and net_profit == 0:
        return False

    db.insert_dart_financials(
        clean_ticker, year, reprt_code,
        assets, equity, liabilities, revenue, operating_profit, net_profit
    )
    return True

def seed_all_dart_companies(max_count: int = 300):
    """상장기업 전체 DART 재무 데이터 시딩 실행"""
    db.init_db()
    print("[DART Seed] Loading DART corp_code map...")
    code_map = get_corp_code_map()
    
    # DB stock 종목 + 대표 상장 종목코드 매칭
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute("SELECT DISTINCT ticker FROM stocks UNION SELECT DISTINCT ticker FROM financials")
    rows = c.fetchall()
    conn.close()
    
    db_tickers = [r['ticker'] for r in rows if r['ticker']]
    
    # 대표 상장사 종목코드 목록 추가 (삼성전자, SK하이닉스, LG에너지솔루션, 현대차, 네이버, 카카오 등)
    top_tickers = [
        "005930", "000660", "373220", "005380", "035420", "035720", "000270", "051910", "006400", "068270",
        "005935", "105560", "055550", "012330", "028260", "010550", "032830", "086790", "011200", "018260"
    ]
    
    all_tickers = list(set(db_tickers + top_tickers + list(code_map.keys())[:max_count]))
    
    success_count = 0
    print(f"[DART Seed] Starting financial data collection for target companies (Total: {len(all_tickers)})...")
    
    for idx, ticker in enumerate(all_tickers[:max_count]):
        corp_code = code_map.get(ticker)
        if not corp_code:
            continue
            
        saved = fetch_and_save_company_financials(ticker, corp_code, "2023", "11011") or \
                fetch_and_save_company_financials(ticker, corp_code, "2024", "11014")
                
        if saved:
            success_count += 1
            
        if (idx + 1) % 10 == 0:
            print(f" Progress: {idx + 1}/{min(max_count, len(all_tickers))} ({success_count} companies saved to DB)")
        
        time.sleep(0.05)
        
    print(f"[DART Seed] Finished collection! Successfully saved {success_count} companies to DB.")

if __name__ == "__main__":
    seed_all_dart_companies(max_count=200)
