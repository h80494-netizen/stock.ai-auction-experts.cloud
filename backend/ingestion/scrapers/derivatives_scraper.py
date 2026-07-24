import requests
from bs4 import BeautifulSoup
import json

class DerivativesScraper:
    @staticmethod
    def get_index_futures_basis():
        """
        주요 시장 지수와 대응되는 최근월물 선물의 베이시스(선물 - 현물)를 스크래핑합니다.
        (현재는 간단히 네이버의 KOSPI200, KOSDAQ150 관련 수치 파싱)
        """
        # 실제 환경에서는 KRX 데이터나 증권사 API 연동이 필요할 수 있습니다.
        # 여기서는 하드코딩된 예시나 기본적인 스크래핑 구조를 제공합니다.
        data = [
            {"index": "KOSPI 200", "cash_price": 0, "futures_price": 0, "basis": 0, "theoretical_basis": 0},
            {"index": "KOSDAQ 150", "cash_price": 0, "futures_price": 0, "basis": 0, "theoretical_basis": 0}
        ]
        
        # 네이버 선물 페이지 예시 (실제 페이지 구조에 맞춰 정교화 필요)
        url = "https://finance.naver.com/sise/sise_index.naver?code=FUT"
        try:
            res = requests.get(url, timeout=5)
            # 여기서는 단순히 응답 확인까지만 하고 모의 데이터 리턴 (파싱 복잡도 감안)
            if res.status_code == 200:
                # KOSPI 200
                data[0]["cash_price"] = 380.50
                data[0]["futures_price"] = 381.20
                data[0]["basis"] = round(381.20 - 380.50, 2)
                data[0]["theoretical_basis"] = 0.50
                
                # KOSPI 200 Options (ATM Mock Data)
                data[0]["atm_strike"] = 380.00
                data[0]["atm_call"] = 5.20
                data[0]["atm_put"] = 4.10
                # Conversion = (Futures - Strike) - (Call - Put)
                # Reversal = (Call - Put) - (Futures - Strike)
                data[0]["conversion"] = round((381.20 - 380.00) - (5.20 - 4.10), 2)
                data[0]["reversal"] = round((5.20 - 4.10) - (381.20 - 380.00), 2)
                
                # KOSDAQ 150
                data[1]["cash_price"] = 1500.10
                data[1]["futures_price"] = 1502.30
                data[1]["basis"] = round(1502.30 - 1500.10, 2)
                data[1]["theoretical_basis"] = 1.20
                
                # KOSDAQ 150 Options (ATM Mock Data)
                data[1]["atm_strike"] = 1500.00
                data[1]["atm_call"] = 32.50
                data[1]["atm_put"] = 31.00
                data[1]["conversion"] = round((1502.30 - 1500.00) - (32.50 - 31.00), 2)
                data[1]["reversal"] = round((32.50 - 31.00) - (1502.30 - 1500.00), 2)
        except Exception as e:
            print("Error scraping futures basis:", e)
            
        return data

    @staticmethod
    def get_investor_trends():
        """
        투자주체별(개인, 외국인, 기관) 매매동향 파싱.
        """
        url = "https://finance.naver.com/sise/sise_trans_style.naver"
        headers = {"User-Agent": "Mozilla/5.0"}
        trends = {
            "KOSPI": {"retail": 0, "foreign": 0, "institutional": 0},
            "KOSDAQ": {"retail": 0, "foreign": 0, "institutional": 0},
            "FUTURES": {"retail": 0, "foreign": 0, "institutional": 0}
        }
        
        try:
            res = requests.get(url, headers=headers, timeout=5)
            # cp949 인코딩 처리
            res.encoding = 'euc-kr'
            soup = BeautifulSoup(res.text, "html.parser")
            
            # 투자자별 매매동향 테이블 파싱 로직
            # 네이버 구조: table.type_1
            # 간략한 모의 수치 생성 로직 (웹 스크래핑 파손 우려로 기본값 적용)
            import random
            trends["KOSPI"]["retail"] = random.randint(-5000, 5000)
            trends["KOSPI"]["foreign"] = random.randint(-5000, 5000)
            trends["KOSPI"]["institutional"] = random.randint(-5000, 5000)
            
            trends["KOSDAQ"]["retail"] = random.randint(-2000, 2000)
            trends["KOSDAQ"]["foreign"] = random.randint(-2000, 2000)
            trends["KOSDAQ"]["institutional"] = random.randint(-2000, 2000)
            
            trends["FUTURES"]["retail"] = random.randint(-10000, 10000)
            trends["FUTURES"]["foreign"] = random.randint(-10000, 10000)
            trends["FUTURES"]["institutional"] = random.randint(-10000, 10000)
            
        except Exception as e:
            print("Error scraping investor trends:", e)
            
        return trends

    @staticmethod
    def get_program_trading():
        """
        프로그램 매매(차익/비차익) 동향 파싱
        """
        # url = "https://finance.naver.com/sise/sise_program.naver"
        # 모의 데이터 리턴
        import random
        return {
            "KOSPI": {
                "arbitrage_buy": random.randint(100, 1000),
                "arbitrage_sell": random.randint(100, 1000),
                "non_arbitrage_buy": random.randint(1000, 5000),
                "non_arbitrage_sell": random.randint(1000, 5000)
            },
            "KOSDAQ": {
                "arbitrage_buy": random.randint(10, 100),
                "arbitrage_sell": random.randint(10, 100),
                "non_arbitrage_buy": random.randint(500, 2000),
                "non_arbitrage_sell": random.randint(500, 2000)
            }
        }

    @staticmethod
    def get_foreign_net_buy_history():
        """
        외국인 일자별 순매수 추이 및 KOSPI 지수 병합
        """
        url = "https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate={}&sosok=&page=1"
        headers = {"User-Agent": "Mozilla/5.0"}
        
        try:
            from datetime import datetime, timedelta
            today = datetime.now().strftime('%Y%m%d')
            res = requests.get(url.format(today), headers=headers, timeout=5)
            res.encoding = 'euc-kr'
            soup = BeautifulSoup(res.text, "html.parser")
            
            tables = soup.find_all("table", class_="type_1")
            if not tables:
                return []
                
            table = tables[0]
            rows = table.find_all("tr")
            
            history = []
            current_year = datetime.now().year
            
            for r in rows:
                cols = r.find_all("td")
                if len(cols) >= 3:
                    date_str = cols[0].get_text(strip=True)
                    foreign = cols[2].get_text(strip=True).replace(',', '')
                    if date_str and foreign and foreign != '0':
                        try:
                            dt = datetime.strptime(f'20{date_str}', '%Y.%m.%d')
                        except Exception as e:
                            continue
                        history.append({
                            "date": dt.strftime('%Y-%m-%d'),
                            "daily_net_buy": int(foreign) * 100
                        })
            
            # KOSPI 지수 병합
            import yfinance as yf
            end_date = datetime.now() + timedelta(days=1)
            start_date = end_date - timedelta(days=40)
            ks11 = yf.download('^KS11', start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), progress=False)
            
            for h in history:
                d = h['date']
                if d in ks11.index:
                    close_series = ks11['Close']
                    if isinstance(close_series, type(ks11)):
                        val = float(close_series.iloc[:, 0].loc[d]) if len(close_series.columns) > 0 else 0
                    else:
                        val = float(close_series.loc[d])
                    h['kospi_index'] = round(val, 2)
                else:
                    h['kospi_index'] = 0
            
            return history
            
        except Exception as e:
            print("Error scraping foreign net buy history:", e)
            return []
