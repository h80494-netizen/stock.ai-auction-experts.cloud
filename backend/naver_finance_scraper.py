import requests
import json
import yfinance as yf

class NaverFinanceScraper:
    def __init__(self):
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }

    def _clean_ticker(self, ticker: str) -> str:
        clean = ticker.split(':')[-1] if ':' in ticker else ticker
        return clean.replace(".KS", "").replace(".KQ", "")

    def get_current_price_detail(self, ticker: str) -> dict:
        """단일 종목의 실시간 현재가, 등락, 거래량 조회"""
        clean_ticker = self._clean_ticker(ticker)
        # 네이버 모바일 주식 API 사용
        url = f"https://m.stock.naver.com/api/stock/{clean_ticker}/integration"
        try:
            res = requests.get(url, headers=self.headers, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if "closePrice" in data:
                    price = int(data.get("closePrice", "0").replace(",", ""))
                    change = int(data.get("compareToPreviousClosePrice", "0").replace(",", ""))
                    change_pct = float(data.get("fluctuationsRatio", "0"))
                    volume = int(data.get("accumulatedTradingVolume", "0").replace(",", ""))
                    
                    # 네이버는 하락 시 compareToPreviousClosePrice가 양수이거나 음수일 수 있음. 
                    # fluctuationsRatio 부호에 맞춤.
                    if change_pct < 0 and change > 0:
                        change = -change
                        
                    return {
                        "price": price,
                        "change": change,
                        "changePct": change_pct,
                        "volume": volume
                    }
        except Exception as e:
            print(f"Naver scraper error ({ticker}): {e}")
            
        return {"price": 0, "change": 0, "changePct": 0, "volume": 0}

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
            
        return prices

naver_scraper = NaverFinanceScraper()
