import os
import requests
import zipfile
import io
import xml.etree.ElementTree as ET
import json
from typing import Dict, List, Optional
from dotenv import load_dotenv

# .env 로드 경로 보장
env_candidates = [
    os.path.join(os.path.dirname(__file__), "..", "..", ".env"),
    os.path.join(os.getcwd(), ".env"),
    os.path.join(os.getcwd(), "backend", ".env")
]
for p in env_candidates:
    if os.path.exists(p):
        load_dotenv(p)
        break

DART_API_KEY = os.environ.get("DART_API_KEY")

class DartScraper:
    def __init__(self, api_key: str = None):
        self.api_key = api_key or os.environ.get("DART_API_KEY")
        self.corp_codes: Dict[str, str] = {}  # ticker -> corp_code
        self.load_corp_codes()

    def load_corp_codes(self):
        """DART 고유번호 ZIP을 다운로드하고 파싱하여 ticker -> corp_code 맵을 만듭니다."""
        try:
            cache_file = os.path.join(os.path.dirname(__file__), "dart_corp_codes.json")
            if os.path.exists(cache_file):
                with open(cache_file, "r", encoding="utf-8") as f:
                    self.corp_codes = json.load(f)
                return

            if not self.api_key:
                return

            print("Downloading DART corp codes...")
            url = f"https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={self.api_key}"
            res = requests.get(url, timeout=30)
            res.raise_for_status()

            with zipfile.ZipFile(io.BytesIO(res.content)) as z:
                with z.open("CORPCODE.xml") as f:
                    tree = ET.parse(f)
                    root = tree.getroot()
                    
                    for list_node in root.findall("list"):
                        corp_code = list_node.findtext("corp_code")
                        stock_code = list_node.findtext("stock_code")
                        
                        if corp_code and stock_code and stock_code.strip():
                            self.corp_codes[stock_code.strip()] = corp_code.strip()
            
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(self.corp_codes, f, ensure_ascii=False)
                
            print(f"Loaded {len(self.corp_codes)} DART corp codes.")
        except Exception as e:
            print(f"Failed to load DART corp codes: {e}")

    def get_raw_report_accounts(self, ticker: str, year: str, reprt_code: str) -> Optional[Dict]:
        """
        특정 분기 보고서의 주요 계정 원본(당기금액, 누적금액)을 가져옵니다.
        """
        corp_code = self.corp_codes.get(ticker)
        if not corp_code:
            return None

        url = "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json"
        params = {
            "crtfc_key": self.api_key,
            "corp_code": corp_code,
            "bsns_year": str(year),
            "reprt_code": reprt_code
        }
        
        try:
            res = requests.get(url, params=params, timeout=10)
            res.raise_for_status()
            data = res.json()
            
            if data.get("status") != "000":
                return None
                
            accounts = {}
            for item in data.get("list", []):
                acc_nm = item.get("account_nm", "")
                amount_str = item.get("thstrm_amount", "")
                add_amount_str = item.get("thstrm_add_amount", "")
                fs_div = item.get("fs_div")
                
                if not amount_str:
                    continue
                    
                def parse_val(v):
                    if not v or v == "-":
                        return 0
                    try:
                        return int(v.replace(",", ""))
                    except Exception:
                        return 0
                        
                thstrm = parse_val(amount_str)
                thstrm_add = parse_val(add_amount_str) if add_amount_str else thstrm
                
                # 표준화된 계정 키 결정
                std_key = None
                if "자산총계" in acc_nm:
                    std_key = "assets"
                elif "자본총계" in acc_nm:
                    std_key = "equity"
                elif "부채총계" in acc_nm:
                    std_key = "liabilities"
                elif "매출액" in acc_nm or "수익(매출액)" in acc_nm or acc_nm == "영업수익":
                    std_key = "revenue"
                elif "영업이익" in acc_nm:
                    std_key = "operating_profit"
                elif "당기순이익" in acc_nm or "분기순이익" in acc_nm or "반기순이익" in acc_nm:
                    std_key = "net_profit"

                if std_key:
                    if std_key not in accounts or fs_div == 'CFS':
                        accounts[std_key] = {
                            "amount": thstrm,
                            "accumulated": thstrm_add,
                            "fs_div": fs_div
                        }
                    
            if not accounts:
                return None
                
            return {
                "year": str(year),
                "quarter": reprt_code,
                "assets": accounts.get("assets", {}).get("amount", 0),
                "equity": accounts.get("equity", {}).get("amount", 0),
                "liabilities": accounts.get("liabilities", {}).get("amount", 0),
                "revenue_raw": accounts.get("revenue", {}).get("amount", 0),
                "revenue_add": accounts.get("revenue", {}).get("accumulated", 0),
                "op_raw": accounts.get("operating_profit", {}).get("amount", 0),
                "op_add": accounts.get("operating_profit", {}).get("accumulated", 0),
                "np_raw": accounts.get("net_profit", {}).get("amount", 0),
                "np_add": accounts.get("net_profit", {}).get("accumulated", 0),
            }
        except Exception as e:
            return None

    def get_financials(self, ticker: str, year: str, reprt_code: str = "11011") -> Optional[Dict]:
        """단일 보고서 간이 조회"""
        raw = self.get_raw_report_accounts(ticker, year, reprt_code)
        if not raw:
            return None
        return {
            "year": raw["year"],
            "quarter": raw["quarter"],
            "assets": raw["assets"],
            "equity": raw["equity"],
            "liabilities": raw["liabilities"],
            "revenue": raw["revenue_raw"],
            "operating_profit": raw["op_raw"],
            "net_profit": raw["np_raw"]
        }

    def get_financials_12quarters(self, ticker: str) -> List[Dict]:
        """
        최근 3년 전부터 최근 분기까지 12개 분기 데이터를 수집하고,
        '분기데이터 * 4' (연환산, Annualized)를 적용하여 정밀 반환합니다.
        """
        corp_code = self.corp_codes.get(ticker)
        if not corp_code:
            print(f"DART corp code not found for {ticker}")
            return []

        # 분기 코드: 11013 (1Q), 11012 (2Q), 11014 (3Q), 11011 (4Q)
        # 최근 분기부터 역순 탐색
        current_year = 2026
        years_to_check = [current_year - i for i in range(5)] # 2026, 2025, 2024, 2023, 2022
        quarter_codes = [
            ("11011", "4Q"),
            ("11014", "3Q"),
            ("11012", "2Q"),
            ("11013", "1Q")
        ]

        collected_reports = {} # (year, q_code) -> raw data

        for y in years_to_check:
            for q_code, q_name in quarter_codes:
                raw = self.get_raw_report_accounts(ticker, str(y), q_code)
                if raw:
                    collected_reports[(str(y), q_code)] = raw
                    # 12분기를 채우기 위해 4Q 계산용 직전 분기 포함하여 충분히 수집 (최대 16개 확보 시 조기 종료 가능)
                    if len(collected_reports) >= 15:
                        break
            if len(collected_reports) >= 15:
                break

        if not collected_reports:
            return []

        # 연도별 4Q 단일 실적 보정 계산
        # 11011 (4Q)의 thstrm_amount는 연간 전체 누적이므로,
        # 4Q 순수 분기 실적 = 연간 전체 실적 - 3분기 누적(11014 revenue_add)
        calculated_list = []
        for (y, q_code), r in collected_reports.items():
            if q_code == "11011":
                # 연간 전체 실적
                fy_rev = r["revenue_raw"]
                fy_op = r["op_raw"]
                fy_np = r["np_raw"]
                
                # 같은 해 3Q 누적 찾기
                q3_rep = collected_reports.get((y, "11014"))
                if q3_rep and q3_rep["revenue_add"] > 0:
                    q4_rev = max(0, fy_rev - q3_rep["revenue_add"])
                    q4_op = fy_op - q3_rep["op_add"]
                    q4_np = fy_np - q3_rep["np_add"]
                else:
                    # 3Q 누적이 없으면 1/4 균등 추정
                    q4_rev = fy_rev / 4.0
                    q4_op = fy_op / 4.0
                    q4_np = fy_np / 4.0
                    
                discrete_rev = q4_rev
                discrete_op = q4_op
                discrete_np = q4_np
            else:
                # 1Q, 2Q, 3Q는 DART에서 thstrm_amount가 순수 당해 3개월 분기 실적임
                discrete_rev = r["revenue_raw"]
                discrete_op = r["op_raw"]
                discrete_np = r["np_raw"]

            # 사용자 요구사항: "분기데이터 * 4" (연환산 규모)
            annualized_rev = discrete_rev * 4.0
            annualized_op = discrete_op * 4.0
            annualized_np = discrete_np * 4.0

            q_label = "1Q" if q_code == "11013" else "2Q" if q_code == "11012" else "3Q" if q_code == "11014" else "4Q"

            calculated_list.append({
                "ticker": ticker,
                "year": y,
                "quarter": q_code,
                "quarter_label": q_label,
                "assets": r["assets"],
                "equity": r["equity"],
                "liabilities": r["liabilities"],
                "revenue": annualized_rev,              # 분기데이터 * 4
                "operating_profit": annualized_op,    # 분기데이터 * 4
                "net_profit": annualized_np,          # 분기데이터 * 4
                "discrete_revenue": discrete_rev,
                "discrete_operating_profit": discrete_op,
                "discrete_net_profit": discrete_np
            })

        # 시간 오름차순 정렬 (연도 오름차순, 분기 오름차순)
        quarter_sort_weight = {"11013": 1, "11012": 2, "11014": 3, "11011": 4}
        calculated_list.sort(key=lambda x: (int(x["year"]), quarter_sort_weight.get(x["quarter"], 0)))

        # 최근 12개 분기만 슬라이싱
        recent_12 = calculated_list[-12:]
        return recent_12

dart_scraper = DartScraper()
