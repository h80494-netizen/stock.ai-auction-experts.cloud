import requests
import urllib.parse
from datetime import datetime
import time

SERVICE_KEY = "R6zpn4dzyzuasYP5k7dxF1K+gv1J4nes6bhZCrVeZYkPlm++lz96SoaeBLlLvpqjsKyST6S0mmVtEa5zRctGng=="
BASE_URL = "https://apis.data.go.kr/1160100/service/GetStockSecuritiesInfoService/getStockPriceInfo"

def get_stock_history(ticker: str, count: int = 300) -> list:
    """
    Fetch historical daily OHLCV data for a given Korean stock ticker.
    Args:
        ticker: 6-digit stock code (e.g., '005930')
        count: number of days to fetch (default: 300)
    Returns:
        List of dictionaries with 'time', 'open', 'high', 'low', 'close', 'value'
    """
    clean_ticker = ticker.replace("KRX:", "").replace("KOSDAQ:", "").replace(".KS", "").replace(".KQ", "")
    
    url = f"{BASE_URL}?serviceKey={urllib.parse.quote(SERVICE_KEY)}&resultType=json&numOfRows={count}&likeSrtnCd={clean_ticker}"
    
    try:
        res = requests.get(url, timeout=10)
        data = res.json()
        
        items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
        if not items:
            return []
            
        formatted = []
        # API returns latest first, but charting library usually needs oldest first or specific order.
        # TV chart expects oldest first generally, but let's just return what we parse
        # Wait, the fallback_chart parser expects it in what format?
        for item in reversed(items): # reverse so oldest is first
            date_str = item.get("basDt", "")
            if not date_str:
                continue
            
            # basDt format: YYYYMMDD
            unix_ts = int(time.mktime(datetime.strptime(date_str, "%Y%m%d").timetuple()))
            
            formatted.append({
                "time": f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:]}", # YYYY-MM-DD
                "open": float(item.get("mkp", 0)),
                "high": float(item.get("hipr", 0)),
                "low": float(item.get("lopr", 0)),
                "close": float(item.get("clpr", 0)),
                "value": float(item.get("trqu", 0))
            })
            
        return formatted
    except Exception as e:
        print(f"PublicDataAPI History Error for {ticker}: {e}")
        return []

def get_current_price(ticker: str) -> dict:
    """
    Fetch the latest current price data for a Korean stock ticker.
    Args:
        ticker: 6-digit stock code (e.g., '005930')
    Returns:
        dict with price details
    """
    clean_ticker = ticker.replace("KRX:", "").replace("KOSDAQ:", "").replace(".KS", "").replace(".KQ", "")
    url = f"{BASE_URL}?serviceKey={urllib.parse.quote(SERVICE_KEY)}&resultType=json&numOfRows=1&likeSrtnCd={clean_ticker}"
    
    try:
        res = requests.get(url, timeout=5)
        data = res.json()
        items = data.get("response", {}).get("body", {}).get("items", {}).get("item", [])
        if not items:
            return None
            
        item = items[0]
        # map to our expected format
        return {
            "stck_prpr": str(item.get("clpr", "0")), # 현재가
            "prdy_vrss": str(item.get("vs", "0")), # 전일대비
            "prdy_ctrt": str(item.get("fltRt", "0")), # 전일대비율
            "acml_vol": str(item.get("trqu", "0")), # 거래량
            "stck_oprc": str(item.get("mkp", "0")), # 시가
            "stck_hgpr": str(item.get("hipr", "0")), # 고가
            "stck_lwpr": str(item.get("lopr", "0")), # 저가
        }
    except Exception as e:
        print(f"PublicDataAPI Price Error for {ticker}: {e}")
        return None
