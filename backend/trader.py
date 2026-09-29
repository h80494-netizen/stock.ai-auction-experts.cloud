import datetime
import os
import sqlite3
from typing import List, Dict
from dotenv import load_dotenv
from kis_api import KISApiClient

load_dotenv()

DB_FILE = os.path.join(os.path.dirname(__file__), "stock_data.sqlite3")

class BrokerageAPI:
    """
    한국투자증권 OpenAPI Wrapper
    """
    def __init__(self, account_no: str, api_key: str, app_secret: str, is_mock: bool = True):
        self.client = KISApiClient(api_key, app_secret, account_no, is_mock)
        print(f"Brokerage API 연동 완료 (계좌: {account_no})")

    def get_current_price(self, ticker: str) -> int:
        return self.client.get_current_price(ticker)
        
    def get_ask_price_1(self, ticker: str) -> int:
        return self.client.get_ask_price_1(ticker)

    def order_buy(self, ticker: str, qty: int, price: int):
        print(f"[주문요청] 매수 종목: {ticker} | 수량: {qty}주 | 단가: {price}원")
        return self.client.order_buy(ticker, qty, price)
        
    def order_sell(self, ticker: str, qty: int, price: int = 0):
        print(f"[주문요청] 매도 종목: {ticker} | 수량: {qty}주 | 단가: {price}원 (0=시장가)")
        return self.client.order_sell(ticker, qty, price)


def record_trade(trade_date: str, ticker: str, name: str, buy_price: float, qty: int, status: str):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        INSERT INTO trading_ledger (trade_date, ticker, name, buy_price, qty, status)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (trade_date, ticker, name, buy_price, qty, status))
    conn.commit()
    conn.close()

def update_sell_trade(trade_date: str, ticker: str, sell_price: float, pnl: float):
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute('''
        UPDATE trading_ledger 
        SET sell_price = ?, pnl = ?, status = 'SELL'
        WHERE trade_date = ? AND ticker = ? AND status = 'BUY'
    ''', (sell_price, pnl, trade_date, ticker))
    conn.commit()
    conn.close()


def execute_morning_buy(broker: BrokerageAPI, limit: int = 3, target_amount_per_stock: float = 5000000.0):
    """
    9시 5분 매수 로직:
    외국계 창구 순매수 비중 5% 이상인 상위 N개 종목을 매도 1호가로 종목당 target_amount 만큼 지정가 매수
    """
    print(f"\n--- [9:05 AM] 외국계 순매수 상위 {limit}개 종목 매수 시작 ---")
    
    # 1. KIS 스캐너를 통해 최신 외국계 순매수 종목 리스트 획득
    from kis_foreign_scanner import get_foreign_net_buy_stocks
    stocks = get_foreign_net_buy_stocks(threshold=5.0, limit=limit)
    
    if not stocks:
        print("조건(외국계 순매수 비중 5% 이상)을 만족하는 종목이 없어 매수를 진행하지 않습니다.")
        return []

    print(f"포착된 매수 대상 종목 수: {len(stocks)}개 (최대 {limit}개)")
    
    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    results = []
    
    for stock in stocks:
        ticker = stock["clean_ticker"]
        name = stock["name"]
        ratio = stock["foreign_ratio"]
        
        # 매도 1호가 조회
        ask_price_1 = broker.get_ask_price_1(ticker)
        if ask_price_1 <= 0:
            print(f"[{name}] 호가 조회 실패, 매수 건너뜀.")
            continue
            
        # 수량 계산
        qty = int(target_amount_per_stock // ask_price_1)
        
        if qty > 0:
            print(f"[{name}({ticker})] 순매수 비중 {ratio}% -> 매수 1호가({ask_price_1}원) 매수 진행")
            success = broker.order_buy(ticker=ticker, qty=qty, price=ask_price_1)
            if success:
                # DB 원장에 기록
                record_trade(today_str, ticker, name, ask_price_1, qty, 'BUY')
                results.append({
                    "ticker": ticker,
                    "name": name,
                    "buy_price": ask_price_1,
                    "qty": qty,
                    "total_amount": ask_price_1 * qty
                })
        else:
            print(f"[{name}({ticker})] 1주도 살 수 없는 금액({target_amount_per_stock}원).")
            
    print("--- 매수 주문 완료 ---\n")
    return results

def execute_afternoon_sell(broker: BrokerageAPI):
    """
    15시 20분(또는 15시 30분) 매도 로직:
    당일 매수한 종목을 조회하여 주문 성공/체결 여부와 상관없이 100% 보유 수량을 당일 종가에 전량 매도 정산 처리
    """
    print(f"\n--- [3:20 PM] 당일 매수 종목 100% 종가 매도 정산 시작 ---")
    today_str = datetime.datetime.now().strftime("%Y-%m-%d")
    
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM trading_ledger WHERE trade_date = ? AND status = 'BUY'", (today_str,))
    buy_positions = c.fetchall()
    conn.close()
    
    if not buy_positions:
        print("당일 매수한 종목이 없습니다.")
        return []
        
    results = []
    for pos in buy_positions:
        ticker = pos["ticker"]
        name = pos["name"]
        qty = pos["qty"]
        buy_price = pos["buy_price"]
        
        print(f"[{name}({ticker})] 보유수량 {qty}주 -> 15:25 시장가 매도 주문 시도 (무조건 100% 종가 정산)")
        try:
            broker.order_sell(ticker=ticker, qty=qty, price=0)
        except Exception as e:
            print(f"[{name}({ticker})] 매도 주문 API 호출 예외 (종가 강제 정산 진행): {e}")
        
        # API 반환값과 상관없이 100% 보유수량 당일 종가 매도 확정
        sell_price = broker.get_current_price(ticker)
        if sell_price <= 0:
            sell_price = buy_price  # fallback if current_price read fails
            
        pnl = (sell_price - buy_price) * qty
        update_sell_trade(today_str, ticker, sell_price, pnl)
        
        results.append({
            "ticker": ticker,
            "name": name,
            "sell_price": sell_price,
            "qty": qty,
            "pnl": pnl
        })
            
    print("--- 100% 종가 매도 정산 완료 ---\n")
    return results

if __name__ == "__main__":
    pass
