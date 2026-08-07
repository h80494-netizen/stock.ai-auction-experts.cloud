import requests
import json
import yfinance as yf
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils.retry_util import with_retry
class NaverFinanceScraper:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def _clean_ticker(self, ticker: str) -> str:
        clean = ticker.split(':')[-1] if ':' in ticker else ticker
        return clean.replace(".KS", "").replace(".KQ", "")

    @with_retry(max_retries=3, initial_delay=1.0)
    def get_current_price_detail(self, ticker: str) -> dict:
        """단일 종목의 실시간 현재가, 등락, 거래량 조회"""
        clean_ticker = self._clean_ticker(ticker)
        
        result = {"price": 0, "change": 0, "changePct": 0, "volume": 0}
        
        try:
            # 1. 주가 및 등락률 (basic API)
            basic_url = f"https://m.stock.naver.com/api/stock/{clean_ticker}/basic"
            basic_res = requests.get(basic_url, headers=self.headers, timeout=3)
            if basic_res.status_code == 200:
                basic_data = basic_res.json()
                if "closePrice" in basic_data:
                    result["price"] = int(basic_data.get("closePrice", "0").replace(",", ""))
                    change = int(basic_data.get("compareToPreviousClosePrice", "0").replace(",", ""))
                    change_pct = float(basic_data.get("fluctuationsRatio", "0"))
                    
                    if change_pct < 0 and change > 0:
                        change = -change
                    
                    result["change"] = change
                    result["changePct"] = change_pct

            # 2. 거래량 (integration API의 totalInfos)
            int_url = f"https://m.stock.naver.com/api/stock/{clean_ticker}/integration"
            int_res = requests.get(int_url, headers=self.headers, timeout=3)
            if int_res.status_code == 200:
                int_data = int_res.json()
                for info in int_data.get("totalInfos", []):
                    if info.get("code") == "accumulatedTradingVolume":
                        result["volume"] = int(info.get("value", "0").replace(",", ""))
                        break
        except Exception as e:
            print(f"Naver scraper error ({ticker}): {e}")
            
        if result["price"] == 0:
            try:
                yf_ticker = ticker
                if not yf_ticker.endswith(".KS") and not yf_ticker.endswith(".KQ") and not yf_ticker.endswith(".T"):
                    yf_ticker = f"{ticker}.KS"
                info = yf.Ticker(yf_ticker).info
                price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose") or 0
                result["price"] = int(price)
                result["change"] = int(info.get("regularMarketChange", 0))
                result["changePct"] = float(info.get("regularMarketChangePercent", 0))
                result["volume"] = int(info.get("regularMarketVolume", 0))
            except Exception as yf_e:
                print(f"YFinance fallback error ({ticker}): {yf_e}")
                
        return result

    @with_retry(max_retries=3, initial_delay=1.0)
    def get_foreign_brokerage_net_buy(self, ticker: str) -> int:
        """외국계 증권사 순매수량(매수-매도) 조회"""
        clean_ticker = self._clean_ticker(ticker)
        url = f"https://finance.naver.com/item/main.naver?code={clean_ticker}"
        try:
            from bs4 import BeautifulSoup
            res = requests.get(url, headers=self.headers, timeout=3)
            res.encoding = 'euc-kr'
            soup = BeautifulSoup(res.text, 'html.parser')
            tb = soup.select_one('.tb_type1')
            if tb:
                trs = tb.find_all('tr')
                if len(trs) >= 2:
                    cols = [td.get_text(strip=True) for td in trs[1].find_all(['th', 'td'])]
                    if len(cols) >= 4:
                        net_buy_str = cols[2].replace(',', '').replace('+', '')
                        if net_buy_str.strip() == '':
                            return 0
                        return int(net_buy_str)
        except Exception as e:
            print(f"Naver foreign net buy error ({ticker}): {e}")
            
        return 0

    def get_current_price(self, ticker: str) -> int:
        detail = self.get_current_price_detail(ticker)
        return detail.get("price", 0)

    @with_retry(max_retries=3, initial_delay=1.0)
    def get_realtime_prices(self, tickers: list) -> dict:
        """다중 종목 실시간 가격 조회 (polling API 활용)"""
        if not tickers:
            return {}
            
        clean_tickers = [self._clean_ticker(t) for t in tickers]
        query_str = ",".join(clean_tickers)
        url = f"https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:{query_str}"
        
        prices = {}
        try:
            res = requests.get(url, headers=self.headers, timeout=5)
            if res.status_code == 200:
                data = res.json()
                items = data.get("result", {}).get("areas", [{}])[0].get("datas", [])
                
                # 매핑을 위해 딕셔너리 생성
                naver_results = {}
                for item in items:
                    t = item.get("cd")
                    nv = item.get("nv")
                    if t and nv:
                        naver_results[t] = int(nv)
                
                # 요청한 원본 티커 이름으로 반환
                for original_ticker, clean in zip(tickers, clean_tickers):
                    if clean in naver_results:
                        prices[original_ticker] = naver_results[clean]
                        
        except Exception as e:
            print(f"Naver realtime bulk scraper error: {e}")
            
        # Fallback for missing tickers via yfinance
        for original_ticker in tickers:
            if original_ticker not in prices or prices[original_ticker] == 0:
                try:
                    yf_ticker = original_ticker
                    if not yf_ticker.endswith(".KS") and not yf_ticker.endswith(".KQ") and not yf_ticker.endswith(".T"):
                        yf_ticker = f"{original_ticker}.KS"
                    info = yf.Ticker(yf_ticker).info
                    price = info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose") or 0
                    if price > 0:
                        prices[original_ticker] = int(price)
                except Exception as yf_e:
                    print(f"YFinance fallback error for {original_ticker}: {yf_e}")
                    
        return prices

naver_scraper = NaverFinanceScraper()
