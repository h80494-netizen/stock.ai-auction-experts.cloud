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

EXCLUDE_PATTERNS = [
    r"KODEX", r"TIGER", r"KBSTAR", r"ACE", r"SOL", r"ARIRANG", r"HANARO", r"TIMEFOLIO", r"WOORI",
    r"PLUS", r"FOCUS", r"TRUST", r"ETF", r"ETN", r"ELW", r"스팩", r"SPAC", r"리츠", r"REIT", r"증권투자",
    r"채권", r"선물", r"인버스", r"레버리지", r"액티브"
]

def is_excluded_company(corp_name: str) -> bool:
    """ETF, ETN, SPAC, REIT 등 금융투자 상품 및 특수회사 제외"""
    for pattern in EXCLUDE_PATTERNS:
        if re.search(pattern, corp_name, re.IGNORECASE):
            return True
    return False

def get_listed_dart_companies():
    """DART OpenAPI에서 상장된 일반 기업(ETF, ETN 등 제외)의 고유번호 및 종목코드 추출"""
    print("[DART] Loading corpCode.xml from DART OpenAPI...")
    url = f"https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={DART_API_KEY}"
    res = requests.get(url)
    res.raise_for_status()

    companies = []
    with zipfile.ZipFile(io.BytesIO(res.content)) as z:
        with z.open("CORPCODE.xml") as f:
            tree = ET.parse(f)
            root = tree.getroot()
            
            for list_node in root.findall("list"):
                corp_code = list_node.findtext("corp_code")
                corp_name = list_node.findtext("corp_name")
                stock_code = list_node.findtext("stock_code")
                
                if corp_code and stock_code and stock_code.strip():
                    stock_code = stock_code.strip()
                    corp_name = corp_name.strip()
                    
                    if not is_excluded_company(corp_name):
                        companies.append({
                            "corp_code": corp_code.strip(),
                            "corp_name": corp_name,
                            "stock_code": stock_code
                        })

    print(f"[DART] Filtered listed companies: {len(companies)} tickers")
    return companies

def fetch_and_save_company_financials(company: dict, year: str = "2023", reprt_code: str = "11011"):
    """개별 상장기업의 DART 재무제표 수집 및 DB 저장"""
    stock_code = str(company["stock_code"]).strip().zfill(6)
    corp_code = str(company["corp_code"]).strip().zfill(8)
    
    url = "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json"
    params = {
        "crtfc_key": DART_API_KEY,
        "corp_code": corp_code,
        "bsns_year": year,
        "reprt_code": reprt_code
    }
    
    try:
        res = requests.get(url, params=params, timeout=10)
        res.raise_for_status()
        data = res.json()
        
        if data.get("status") != "000":
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

            # 연결재무제표(CFS) 데이터를 우선 적용, 없으면 개별(OFS)
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
        
        # 최소한 자산이나 매출/순이익 중 하나 이상 데이터가 존재하는 경우 저장
        if assets == 0 and revenue == 0 and net_profit == 0:
            return False

        db.insert_dart_financials(
            stock_code, year, reprt_code,
            assets, equity, liabilities, revenue, operating_profit, net_profit
        )
        return True
    except Exception as e:
        print(f"Error fetching DART data for {stock_code}: {e}")
        return False

def seed_all_dart_companies(max_count: int = 300):
    """상장기업 전체 DART 재무 데이터 시딩 실행"""
    db.init_db()
    companies = get_listed_dart_companies()
    
    success_count = 0
    print(f"[DART Seed] Starting financial data collection for listed companies (Target max: {min(max_count, len(companies))})...")
    
    for idx, comp in enumerate(companies[:max_count]):
        saved_2023 = fetch_and_save_company_financials(comp, "2023", "11011") # 2023 사업보고서
        saved_2024 = fetch_and_save_company_financials(comp, "2024", "11014") # 2024 3분기보고서
        
        if saved_2023 or saved_2024:
            success_count += 1
            
        if (idx + 1) % 10 == 0:
            print(f" Progress: {idx + 1}/{min(max_count, len(companies))} ({success_count} companies saved)")
        
        time.sleep(0.05) # Rate limit respect
        
    print(f"[DART Seed] Finished collection! Successfully saved {success_count} companies.")

if __name__ == "__main__":
    seed_all_dart_companies(max_count=200)
