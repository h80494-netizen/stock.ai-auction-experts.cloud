import requests
import json
import time
import os

class KISApiClient:
    def __init__(self, app_key: str, app_secret: str, account_no: str, is_mock: bool = True):
        self.app_key = app_key
        self.app_secret = app_secret
        
        # Parse account_no (e.g., "44790516-01")
        if "-" in account_no:
            parts = account_no.split("-")
            self.cano = parts[0]
            self.acnt_prdt_cd = parts[1]
        else:
            self.cano = account_no[:8]
            self.acnt_prdt_cd = account_no[8:] if len(account_no) > 8 else "01"
            
        self.is_mock = is_mock
        if self.is_mock:
            self.base_url = "https://openapivts.koreainvestment.com:29443"
        else:
            self.base_url = "https://openapi.koreainvestment.com:9443"

        self.access_token = None
        self.token_expired_at = 0
        current_dir = os.path.dirname(os.path.abspath(__file__))
        self.token_file = os.path.join(current_dir, "kis_token.json")
        
        # Initial token generation
        self.load_or_issue_token()

    def load_or_issue_token(self):
        if os.path.exists(self.token_file):
            try:
                with open(self.token_file, "r") as f:
                    data = json.load(f)
                    if data.get("app_key") == self.app_key and data.get("token_expired_at", 0) > time.time():
                        self.access_token = data.get("access_token")
                        self.token_expired_at = data.get("token_expired_at")
                        print("KIS API Cached Token Loaded")
                        return
            except Exception as e:
                print(f"Failed to load cached token: {e}")
        self.issue_token()

    def issue_token(self):
        """한국투자증권 접근 토큰 발급"""
        url = f"{self.base_url}/oauth2/tokenP"
        headers = {
            "content-type": "application/json"
        }
        body = {
            "grant_type": "client_credentials",
            "appkey": self.app_key,
            "appsecret": self.app_secret
        }
        res = requests.post(url, headers=headers, data=json.dumps(body))
        if res.status_code == 200:
            data = res.json()
            self.access_token = data.get("access_token")
            expires_in = data.get("expires_in", 86400)
            self.token_expired_at = time.time() + expires_in - 600 # renew 10 mins early
            print("KIS API 토큰 발급 성공")
            try:
                with open(self.token_file, "w") as f:
                    json.dump({
                        "app_key": self.app_key,
                        "access_token": self.access_token,
                        "token_expired_at": self.token_expired_at
                    }, f)
            except Exception as e:
                print(f"Failed to save token to cache: {e}")
        else:
            print(f"KIS API 토큰 발급 실패: {res.text}")
            # Fallback: 토큰 발급 실패 시(특히 횟수 초과 EGW00133) 기존 저장된 토큰이 있다면 강제로라도 읽어서 사용 시도
            if os.path.exists(self.token_file):
                try:
                    print("Fallback: 이전에 발급받은 토큰 파일이 존재하여 강제로 재사용을 시도합니다.")
                    with open(self.token_file, "r") as f:
                        data = json.load(f)
                        self.access_token = data.get("access_token")
                        self.token_expired_at = data.get("token_expired_at", time.time() + 3600)
                except Exception as fallback_e:
                    raise Exception(f"토큰 발급 및 Fallback 실패: {res.text} / {fallback_e}")
            else:
                raise Exception(f"토큰 발급 실패: {res.text}")

    def get_token(self):
        if time.time() > self.token_expired_at or not self.access_token:
            self.issue_token()
        return self.access_token

    def get_headers(self, tr_id: str):
        return {
            "content-type": "application/json; charset=utf-8",
            "authorization": f"Bearer {self.get_token()}",
            "appkey": self.app_key,
            "appsecret": self.app_secret,
            "tr_id": tr_id
        }

    def get_current_price(self, ticker: str) -> int:
        """현재가 조회 (국내주식)"""
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-price"
        headers = self.get_headers("FHKST01010100")
        
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": ticker
        }
        try:
            res = requests.get(url, headers=headers, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    output = data.get("output", {})
                    price_str = output.get("stck_prpr", "0")
                    return int(price_str)
                else:
                    print(f"현재가 조회 오류 ({ticker}): {data.get('msg1')}")
                    return 0
            else:
                print(f"현재가 API 호출 실패: {res.text}")
                return 0
        except Exception as e:
            print(f"현재가 API 예외 ({ticker}): {e}")
            return 0

    def get_current_price_detail(self, ticker: str) -> dict:
        """현재가, 등락, 등락률 상세 조회 (국내주식)"""
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-price"
        headers = self.get_headers("FHKST01010100")
        
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": ticker
        }
        try:
            res = requests.get(url, headers=headers, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    output = data.get("output", {})
                    price = int(output.get("stck_prpr", "0"))
                    change_pct = float(output.get("prdy_ctrt", "0"))
                    change = int(output.get("prdy_vrss", "0"))
                    if change_pct < 0:
                        change = -change
                    return {"price": price, "change": change, "changePct": change_pct}
            return {"price": 0, "change": 0, "changePct": 0}
        except Exception as e:
            print(f"상세 현재가 API 예외 ({ticker}): {e}")
            return {"price": 0, "change": 0, "changePct": 0}

    def order_buy(self, ticker: str, qty: int, price: int = 0):
        """현금 매수 주문 (모의투자/실전투자)"""
        url = f"{self.base_url}/uapi/domestic-stock/v1/trading/order-cash"
        tr_id = "VTTC0802U" if self.is_mock else "TTTC0802U"
        headers = self.get_headers(tr_id)
        order_type = "01" if price == 0 else "00"
        body = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "PDNO": ticker,
            "ORD_DVSN": order_type,
            "ORD_QTY": str(qty),
            "ORD_UNPR": str(price)
        }
        try:
            res = requests.post(url, headers=headers, data=json.dumps(body), timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    print(f"[KIS주문완료] {ticker} | 수량: {qty} | 단가: {price}")
                    return True
                else:
                    print(f"[KIS주문실패] {ticker}: {data.get('msg1')}")
                    return False
            else:
                print(f"주문 API 호출 실패: {res.text}")
                return False
        except Exception as e:
            print(f"주문 API 예외 ({ticker}): {e}")
            return False

    def order_sell(self, ticker: str, qty: int, price: int = 0):
        """현금 매도 주문 (모의투자/실전투자)"""
        url = f"{self.base_url}/uapi/domestic-stock/v1/trading/order-cash"
        tr_id = "VTTC0801U" if self.is_mock else "TTTC0801U"
        headers = self.get_headers(tr_id)
        order_type = "01" if price == 0 else "00"
        body = {
            "CANO": self.cano,
            "ACNT_PRDT_CD": self.acnt_prdt_cd,
            "PDNO": ticker,
            "ORD_DVSN": order_type,
            "ORD_QTY": str(qty),
            "ORD_UNPR": str(price)
        }
        try:
            res = requests.post(url, headers=headers, data=json.dumps(body), timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    print(f"[KIS매도주문완료] {ticker} | 수량: {qty} | 단가: {price}")
                    return True
                else:
                    print(f"[KIS매도주문실패] {ticker}: {data.get('msg1')}")
                    return False
            else:
                print(f"매도주문 API 호출 실패: {res.text}")
                return False
        except Exception as e:
            print(f"매도주문 API 예외 ({ticker}): {e}")
            return False

    def get_overseas_chart(self, excd: str, ticker: str, period: str = "D"):
        """해외주식 차트"""
        if self.is_mock:
            return []
            
        # 해외 분봉은 API가 다름 (inquire-time-itemchartprice)
        # 하지만 해외주식은 모의투자 미지원이므로 일단 일봉(dailyprice)만 유지
        url = f"{self.base_url}/uapi/overseas-price/v1/quotations/dailyprice"
        headers = self.get_headers("FHKST03030100")
        import datetime
        now = datetime.datetime.now()
        params = {
            "AUTH": "",
            "EXCD": excd,
            "SYMB": ticker,
            "GUBN": "0" if period == "D" else ("1" if period == "W" else "2"),
            "BYMD": now.strftime("%Y%m%d"),
            "MODP": "1"
        }
        try:
            res = requests.get(url, headers=headers, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    return data.get("output2", [])
                else:
                    print(f"해외 차트 조회 오류 ({ticker}): {data.get('msg1')}")
            return []
        except Exception as e:
            print(f"해외 차트 예외 ({ticker}): {e}")
            return []

    def get_domestic_chart(self, ticker: str, period: str = "D"):
        """국내주식 차트 (분봉, 일/주/월봉)"""
        import datetime
        now = datetime.datetime.now()
        
        if period == "m":
            # 분봉
            url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice"
            headers = self.get_headers("FHKST03010200")
            params = {
                "FID_ETC_CLS_CODE": "",
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": ticker,
                "FID_INPUT_HOUR_1": now.strftime("%H%M%S"),
                "FID_PW_DATA_INCU_YN": "N"
            }
        else:
            # 일/주/월봉
            url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice"
            headers = self.get_headers("FHKST03010100")
            start = now - datetime.timedelta(days=365) if period in ["W", "M"] else now - datetime.timedelta(days=100)
            params = {
                "FID_COND_MRKT_DIV_CODE": "J",
                "FID_INPUT_ISCD": ticker,
                "FID_INPUT_DATE_1": start.strftime("%Y%m%d"),
                "FID_INPUT_DATE_2": now.strftime("%Y%m%d"),
                "FID_PERIOD_DIV_CODE": period,
                "FID_ORG_ADJ_PRC": "1" # 수정주가
            }
            
        try:
            res = requests.get(url, headers=headers, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    return data.get("output2", [])
                else:
                    print(f"차트 조회 오류 ({ticker}): {data.get('msg1')}")
            return []
        except Exception as e:
            print(f"국내 차트 조회 예외 ({ticker}): {e}")
            return []

    def get_overseas_price(self, excd: str, ticker: str) -> dict:
        """해외주식 현재가"""
        if self.is_mock:
            # 모의투자 API는 해외주식을 미지원하여 타임아웃 발생 방지용 더미 반환
            return {}
            
        url = f"{self.base_url}/uapi/overseas-price/v1/quotations/price"
        headers = self.get_headers("FHKST03030200")
        params = {
            "AUTH": "",
            "EXCD": excd,
            "SYMB": ticker
        }
        try:
            res = requests.get(url, headers=headers, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    return data.get("output", {})
                else:
                    print(f"해외 현재가 조회 오류 ({ticker}): {data.get('msg1')}")
            return {}
        except Exception as e:
            print(f"해외 현재가 예외 ({ticker}): {e}")
            return {}

    def get_overseas_chart(self, excd: str, ticker: str):
        """해외주식 일봉 차트"""
        if self.is_mock:
            # 모의투자 API 해외 미지원 더미 반환
            return []
            
        url = f"{self.base_url}/uapi/overseas-price/v1/quotations/dailyprice"
        headers = self.get_headers("FHKST03030100")
        import datetime
        now = datetime.datetime.now()
        params = {
            "AUTH": "",
            "EXCD": excd,
            "SYMB": ticker,
            "GUBN": "0",
            "BYMD": now.strftime("%Y%m%d"),
            "MODP": "1"
        }
        try:
            res = requests.get(url, headers=headers, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    return data.get("output2", [])
                else:
                    print(f"해외 차트 조회 오류 ({ticker}): {data.get('msg1')}")
            return []
        except Exception as e:
            print(f"해외 차트 예외 ({ticker}): {e}")
            return []

    def get_orderbook(self, ticker: str) -> dict:
        """국내주식 호가 조회"""
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn"
        headers = self.get_headers("FHKST01010200")
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": ticker
        }
        try:
            res = requests.get(url, headers=headers, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    return data.get("output1", {})
            return {}
        except Exception as e:
            print(f"호가 조회 예외 ({ticker}): {e}")
            return {}

    def get_investor_trend(self, ticker: str) -> dict:
        """국내주식 종목별 투자자 동향 (당일 가집계 또는 전일 동향)"""
        # FHKST01010900: 주식현재가 투자자
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/inquire-investor"
        headers = self.get_headers("FHKST01010900")
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": ticker
        }
        try:
            res = requests.get(url, headers=headers, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    return data.get("output", {})
            return {}
        except Exception as e:
            print(f"투자자 동향 예외 ({ticker}): {e}")
            return {}

    def is_market_open(self) -> bool:
        """국내 휴장일 조회 (오늘)"""
        import datetime
        now = datetime.datetime.now()
        # 주말 체크
        if now.weekday() >= 5:
            return False
            
        url = f"{self.base_url}/uapi/domestic-stock/v1/quotations/chk-holiday"
        headers = self.get_headers("CTCA0503R") if not self.is_mock else self.get_headers("CTCA0503R")
        # Note: 휴장일 조회는 모의/실전 TR ID가 같거나 CTCA0503R일 수 있음. 기본적으로 휴일이면 영업일 여부가 N임.
        params = {
            "BASS_DT": now.strftime("%Y%m%d"),
            "CTX_AREA_NK": "",
            "CTX_AREA_FK": ""
        }
        try:
            res = requests.get(url, headers=headers, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if data.get("rt_cd") == "0":
                    out = data.get("output", [])
                    if out:
                        today_info = out[0]
                        # opnd_yn (영업일 여부): Y 이면 개장, N 이면 휴장
                        return today_info.get("opnd_yn") == "Y"
            # API 실패 시 단순히 주말만 거른 상태이므로 True를 리턴할 수 있으나, 안전하게 주말이 아니면 True 리턴
            return True
        except Exception as e:
            print(f"휴장일 조회 예외: {e}")
            return True
