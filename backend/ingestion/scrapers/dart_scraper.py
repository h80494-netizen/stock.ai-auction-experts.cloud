import os
import requests
import zipfile
import io
import xml.etree.ElementTree as ET
import json
from typing import Dict, List, Optional
from dotenv import load_dotenv

load_dotenv()

DART_API_KEY = os.environ.get("DART_API_KEY")

class DartScraper:
    def __init__(self, api_key: str = DART_API_KEY):
        self.api_key = api_key
        self.corp_codes: Dict[str, str] = {}  # ticker -> corp_code
        self.load_corp_codes()

    def load_corp_codes(self):
        """DART 고유번호 ZIP을 다운로드하고 파싱하여 ticker -> corp_code 맵을 만듭니다."""
        try:
            # 먼저 로컬 캐시 확인
            cache_file = os.path.join(os.path.dirname(__file__), "dart_corp_codes.json")
            if os.path.exists(cache_file):
                with open(cache_file, "r", encoding="utf-8") as f:
                    self.corp_codes = json.load(f)
                return

            print("Downloading DART corp codes...")
            url = f"https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={self.api_key}"
            res = requests.get(url)
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
            
            # 캐시 저장
            with open(cache_file, "w", encoding="utf-8") as f:
                json.dump(self.corp_codes, f, ensure_ascii=False)
                
            print(f"Loaded {len(self.corp_codes)} DART corp codes.")
        except Exception as e:
            print(f"Failed to load DART corp codes: {e}")

    def get_financials(self, ticker: str, year: str, reprt_code: str = "11011") -> Optional[Dict]:
        """
        특정 종목의 주요 재무계정을 가져옵니다.
        reprt_code: 
          11013: 1분기보고서
          11012: 반기보고서
          11014: 3분기보고서
          11011: 사업보고서 (연간)
        """
        corp_code = self.corp_codes.get(ticker)
        if not corp_code:
            print(f"DART corp code not found for {ticker}")
            return None

        url = "https://opendart.fss.or.kr/api/fnlttSinglAcnt.json"
        params = {
            "crtfc_key": self.api_key,
            "corp_code": corp_code,
            "bsns_year": year,
            "reprt_code": reprt_code
        }
        
        try:
            res = requests.get(url, params=params, timeout=10)
            res.raise_for_status()
            data = res.json()
            
            if data.get("status") != "000":
                print(f"DART API Error for {ticker} ({year}-{reprt_code}): {data.get('message')}")
                return None
                
            results = {}
            for item in data.get("list", []):
                # 보통 fs_div == 'CFS' (연결재무제표)를 우선, 없으면 'OFS' (개별)
                acc_nm = item.get("account_nm")
                amount_str = item.get("thstrm_amount") # 당기금액
                fs_div = item.get("fs_div")
                
                if not amount_str or amount_str == "":
                    continue
                    
                key = acc_nm
                if key not in results or fs_div == 'CFS':
                    try:
                        results[key] = int(amount_str.replace(",", ""))
                        results[f"{key}_fs_div"] = fs_div
                    except ValueError:
                        pass
            
            if not results:
                return None
                
            return {
                "year": year,
                "quarter": reprt_code, 
                "assets": results.get("자산총계", 0),
                "equity": results.get("자본총계", 0),
                "liabilities": results.get("부채총계", 0),
                "revenue": results.get("매출액", 0),
                "operating_profit": results.get("영업이익", 0),
                "net_profit": results.get("당기순이익", 0),
            }
            
        except Exception as e:
            print(f"Exception fetching DART financials for {ticker}: {e}")
            return None

dart_scraper = DartScraper()
