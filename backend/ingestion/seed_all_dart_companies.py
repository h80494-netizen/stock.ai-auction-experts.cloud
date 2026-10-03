import os
import sys
import re
import time
import requests
import zipfile
import io
import json
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

# Path setup for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import database as db

env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
load_dotenv(env_path)
load_dotenv()

DART_API_KEY = os.environ.get("DART_API_KEY") or "539baccadbc74546d98d2d0b1d5f2763886d8ea1"
STATUS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "dart_scan_status.json")

EXCLUDE_PATTERNS = [
    r"KODEX", r"TIGER", r"KBSTAR", r"ACE", r"SOL", r"ARIRANG", r"HANARO", r"TIMEFOLIO", r"WOORI",
    r"PLUS", r"FOCUS", r"TRUST", r"ETF", r"ETN", r"ELW", r"스팩", r"SPAC", r"리츠", r"REIT", r"증권투자",
    r"채권", r"선물", r"인버스", r"레버리지", r"액티브", r"펀드", r"투자신탁", r"금융투자", r"인프라"
]

def is_excluded_company(corp_name: str) -> bool:
    """ETF, ETN, SPAC, REIT 등 금융투자 상품 및 특수회사 제외"""
    for pattern in EXCLUDE_PATTERNS:
        if re.search(pattern, corp_name, re.IGNORECASE):
            return True
    return False

def update_status(current: int, total: int, saved_count: int, message: str, is_running: bool = True):
    """수집 진행 상태 파일 업데이트"""
    try:
        os.makedirs(os.path.dirname(STATUS_FILE), exist_ok=True)
        status_data = {
            "is_running": is_running,
            "current": current,
            "total": total,
            "saved_count": saved_count,
            "message": message,
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
        }
        with open(STATUS_FILE, "w", encoding="utf-8") as f:
            json.dump(status_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error writing status file: {e}")

def get_dart_listed_companies():
    """DART OpenAPI에서 상장된 일반 기업(ETF, ETN 제외) 6자리 주식 종목코드 전체 추출"""
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
                    stock_code = stock_code.strip().zfill(6)
                    corp_name = corp_name.strip()
                    
                    # 6자리 숫자인 순수 상장 주식 종목코드만 선별 (ETF, ETN 제외)
                    if re.match(r"^\d{6}$", stock_code) and not is_excluded_company(corp_name):
                        companies.append({
                            "corp_code": corp_code.strip().zfill(8),
                            "corp_name": corp_name,
                            "stock_code": stock_code
                        })

    print(f"[DART] Filtered listed companies: {len(companies)} tickers")
    return companies

def fetch_and_save_company_financials(company: dict):
    """개별 상장기업의 DART 재무제표 수집 및 DB 저장"""
    stock_code = company["stock_code"]
    corp_code = company["corp_code"]
    
    url_all = "https://opendart.fss.or.kr/api/fnlttSinglAcntAll.json"
    url_single = "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json"
    
    # 2023 사업보고서(11011) -> 2024 3분기보고서(11014) 순으로 시도 (2023 연간 데이터 100% 확보)
    attempts = [
        ("2023", "11011", "CFS"), ("2023", "11011", "OFS"),
        ("2024", "11014", "CFS"), ("2024", "11014", "OFS")
    ]
    
    data = None
    target_year = "2023"
    target_quarter = "11011"
    
    for year, q_code, fs in attempts:
        try:
            res = requests.get(url_all, params={"crtfc_key": DART_API_KEY, "corp_code": corp_code, "bsns_year": year, "reprt_code": q_code, "fs_div": fs}, timeout=6)
            if res.status_code == 200:
                j = res.json()
                if j.get("status") == "000" and j.get("list"):
                    data = j
                    target_year = year
                    target_quarter = q_code
                    break
        except Exception:
            pass

    if not data or not data.get("list"):
        # Single API Fallback
        try:
            res = requests.get(url_single, params={"crtfc_key": DART_API_KEY, "corp_code": corp_code, "bsns_year": "2023", "reprt_code": "11011"}, timeout=6)
            if res.status_code == 200:
                j = res.json()
                if j.get("status") == "000" and j.get("list"):
                    data = j
                    target_year = "2023"
                    target_quarter = "11011"
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
        stock_code, target_year, target_quarter,
        assets, equity, liabilities, revenue, operating_profit, net_profit
    )
    return True

def seed_all_dart_companies(max_count: int = 3000):
    """상장기업 전체 (약 1,800+ 개) DART 재무 데이터 병렬 시딩 실행"""
    db.init_db()
    companies = get_dart_listed_companies()
    total_companies = min(max_count, len(companies))
    target_list = companies[:total_companies]
    
    print(f"[DART Seed] Starting financial collection for {total_companies} listed companies...")
    update_status(0, total_companies, 0, f"상장기업 {total_companies}개 DART 재무 DB 수집 시작", is_running=True)
    
    saved_count = 0
    completed_count = 0
    
    # 5개 멀티스레드 작업으로 속도 대폭 향상
    with ThreadPoolExecutor(max_workers=5) as executor:
        future_to_comp = {executor.submit(fetch_and_save_company_financials, comp): comp for comp in target_list}
        
        for future in as_completed(future_to_comp):
            comp = future_to_comp[future]
            completed_count += 1
            try:
                success = future.result()
                if success:
                    saved_count += 1
            except Exception as e:
                print(f"Error processing {comp['corp_name']}: {e}")
                
            if completed_count % 10 == 0 or completed_count == total_companies:
                msg = f"DART 수집 진행 중: {completed_count}/{total_companies}개 ({comp['corp_name']})"
                print(f" Progress: {completed_count}/{total_companies} (Saved: {saved_count} companies)")
                update_status(completed_count, total_companies, saved_count, msg, is_running=True)

    final_msg = f"DART 전 상장사 재무 DB 수집 완료! 총 {saved_count}개 기업 DB 수집 완료"
    print(f"[DART Seed] Finished collection! Successfully saved {saved_count} companies.")
    update_status(completed_count, total_companies, saved_count, final_msg, is_running=False)

if __name__ == "__main__":
    seed_all_dart_companies(max_count=3000)
