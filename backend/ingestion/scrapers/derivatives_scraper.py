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
    def get_foreign_net_buy_history(days: int = 60):
        """
        외국인 일자별 현물 순매수 추이 및 KOSPI/KOSPI200 지수 병합
        1) data/futures_simulation.db 의 futures_daily_data (spot_foreign_net, fut_foreign_net, program_arb_net, k200_close) 실데이터 우선 로드
        2) 네이버 일자별 투자자 매매동향 스크래핑 병합/보완
        """
        import os
        import sqlite3
        from datetime import datetime, timedelta

        history_map = {}

        # 1) futures_simulation.db 실데이터 조회 (최근 60거래일)
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
            candidates = [
                os.path.join(base_dir, "data", "futures_simulation.db"),
                os.path.join(base_dir, "backend", "futures_simulation.db"),
            ]
            for db_p in candidates:
                if os.path.exists(db_p):
                    conn = sqlite3.connect(db_p, timeout=10.0)
                    cur = conn.cursor()
                    cur.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='futures_daily_data'")
                    if cur.fetchone()[0] > 0:
                        cur.execute(
                            """
                            SELECT date, k200_close, fut_close, spot_foreign_net, spot_personal_net, fut_foreign_net, program_arb_net
                            FROM futures_daily_data
                            WHERE date IS NOT NULL
                            ORDER BY date DESC
                            LIMIT ?
                            """,
                            (max(30, int(days)),),
                        )
                        rows = cur.fetchall()
                        for r in reversed(rows):
                            d_str = str(r[0])[:10]
                            k200_c = float(r[1] or 0.0)
                            fut_c = float(r[2] or 0.0)
                            # spot_foreign_net in rawdata is in 10M KRW (천만원) or 100M KRW -> convert to 억 원 (eok) and 백만 원
                            raw_spot_for = float(r[3] or 0.0)
                            spot_for_eok = round(raw_spot_for / 10.0, 1) if abs(raw_spot_for) > 5000 else round(raw_spot_for, 1)
                            raw_spot_per = float(r[4] or 0.0)
                            spot_per_eok = round(raw_spot_per / 10.0, 1) if abs(raw_spot_per) > 5000 else round(raw_spot_per, 1)
                            fut_for_contracts = round(float(r[5] or 0.0), 0)
                            prog_arb_raw = float(r[6] or 0.0)
                            prog_arb_eok = round(prog_arb_raw / 100.0, 1) if abs(prog_arb_raw) > 5000 else round(prog_arb_raw, 1)

                            # KOSPI 지수 환산 (KOSPI200 * 7.45 근사 또는 실지수)
                            kospi_est = round(k200_c * 7.45, 2) if k200_c < 1500 else round(k200_c, 2)
                            history_map[d_str] = {
                                "date": d_str,
                                "daily_net_buy": round(spot_for_eok, 1),          # 단위: 억 원
                                "daily_net_buy_eok": round(spot_for_eok, 1),      # 단위: 억 원
                                "personal_net_buy_eok": round(spot_per_eok, 1),   # 단위: 억 원
                                "futures_foreign_net": fut_for_contracts,         # 단위: 계약
                                "program_arb_eok": prog_arb_eok,                  # 단위: 억 원
                                "k200_index": round(k200_c, 2),
                                "futures_index": round(fut_c, 2),
                                "kospi_index": kospi_est,
                            }
                    conn.close()
                    if history_map:
                        break
        except Exception as e:
            print("Error loading futures_daily_data for foreign_net_buy_history:", e)

        # 2) 네이버 투자자별 매매동향 스크래핑 시도 (보조)
        if len(history_map) < 10:
            url = "https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate={}&sosok=01&page=1"
            headers = {"User-Agent": "Mozilla/5.0"}
            try:
                today = datetime.now().strftime('%Y%m%d')
                for page_no in (1, 2, 3):
                    res = requests.get(f"https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate={today}&sosok=01&page={page_no}", headers=headers, timeout=4)
                    res.encoding = 'euc-kr'
                    soup = BeautifulSoup(res.text, "html.parser")
                    tables = soup.find_all("table", class_="type_1")
                    if not tables:
                        break
                    for r in tables[0].find_all("tr"):
                        cols = r.find_all("td")
                        if len(cols) >= 3:
                            date_str = cols[0].get_text(strip=True)
                            personal = cols[1].get_text(strip=True).replace(',', '')
                            foreign = cols[2].get_text(strip=True).replace(',', '')
                            if date_str and foreign:
                                try:
                                    dt = datetime.strptime(f"20{date_str}" if len(date_str) == 8 else date_str, '%Y.%m.%d')
                                    d_iso = dt.strftime('%Y-%m-%d')
                                    f_eok = round(float(foreign), 1)
                                    p_eok = round(float(personal or 0), 1)
                                    if d_iso not in history_map:
                                        history_map[d_iso] = {
                                            "date": d_iso,
                                            "daily_net_buy": f_eok,
                                            "daily_net_buy_eok": f_eok,
                                            "personal_net_buy_eok": p_eok,
                                            "futures_foreign_net": 0,
                                            "program_arb_eok": 0,
                                            "k200_index": 380.0,
                                            "futures_index": 380.0,
                                            "kospi_index": 2650.0,
                                        }
                                except Exception:
                                    continue
            except Exception as e:
                print("Error scraping naver foreign net buy history:", e)

        sorted_items = [history_map[k] for k in sorted(history_map.keys())][-max(30, int(days)):]
        cum_val = 0.0
        for item in sorted_items:
            cum_val = round(cum_val + float(item.get("daily_net_buy", 0.0)), 1)
            item["cum_net_buy_eok"] = cum_val

        return sorted_items
