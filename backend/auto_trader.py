import time
from typing import List
from datetime import datetime
from trader import BrokerageAPI
import os
from dotenv import load_dotenv
from excel_parser import load_kospi_data
import database as db

load_dotenv()

TOTAL_CAPITAL = 100000000 # 1억원
CAPITAL_PER_STOCK = TOTAL_CAPITAL * 0.05 # 종목당 500만원

# 전역 Broker 객체 (실제 운영 시에는 환경변수 사용 권장)
try:
    BROKER = BrokerageAPI(
        account_no=os.environ.get("KIS_ACCOUNT_NO"), 
        api_key=os.environ.get("KIS_API_KEY"),
        app_secret=os.environ.get("KIS_APP_SECRET"),
        is_mock=False
    )
except Exception as e:
    print(f"Brokerage API 초기화 실패: {e}")
    BROKER = None

def job_910_buy():
    print(f"[{datetime.now()}] 9:10 AM 자동매수 스케줄러 실행 시작...")
    if not BROKER:
        print("Broker 객체가 없습니다.")
        return
        
    if not BROKER.client.is_market_open():
        print("오늘은 휴장일 또는 주말이므로 매수를 실행하지 않습니다.")
        return
        
    # 종목 풀 가져오기 (예: KOSPI 상위 종목)
    stocks = load_kospi_data()
    if not stocks:
        print("검색할 종목 데이터가 없습니다.")
        return
        
    target_stocks = []
    
    print(f"총 {len(stocks)}개 종목 대상 실시간 외국계 매수 비중 검사 중...")
    
    # KRX100 전 종목 대상 검사
    for stock in stocks:
        ticker = stock["ticker"]
        # 외국인 동향 조회
        trend = BROKER.client.get_investor_trend(ticker)
        if trend:
            # 리스트로 반환될 수 있음. 최신 데이터가 인덱스 0이라 가정
            if isinstance(trend, list) and len(trend) > 0:
                trend_data = trend[0]
            else:
                trend_data = trend
                
            acml_vol = int(trend_data.get("acml_vol", 0))
            # frgn_ntby_qty (외국인 순매수 수량)
            frgn_ntby_qty = int(trend_data.get("frgn_ntby_qty", 0))
            
            if acml_vol > 0:
                ratio = (frgn_ntby_qty / acml_vol) * 100
                if ratio >= 10.0:
                    print(f"조건 만족 포착: {stock['name']}({ticker}) - 외국계 순매수 {ratio:.2f}% (수량: {frgn_ntby_qty})")
                    target_stocks.append(stock)
        
        # API 제한(Rate Limit) 방지를 위한 딜레이
        time.sleep(0.1)
        
    if not target_stocks:
        print("외국계 순매수 10% 이상 종목을 찾지 못했습니다.")
        return
        
    print(f"총 {len(target_stocks)}개 종목 매수 진행...")
    
    for stock in target_stocks:
        ticker = stock["ticker"]
        name = stock["name"]
        
        # 현재가 조회 (수량 계산을 위한 기준가 용도)
        current_price = BROKER.client.get_current_price(ticker)
        
        if current_price <= 0:
            print(f"{name} 현재가 데이터 오류. 매수 생략.")
            continue
            
        # 기준가로 살 수 있는 수량 계산
        qty = int(CAPITAL_PER_STOCK // current_price)
        
        if qty > 0:
            print(f"[{name}] 기준가({current_price}원) 바탕으로 {qty}주 시장가 매수 주문")
            # price를 0으로 넘기면 '시장가(01)'로 주문이 들어감
            success = BROKER.client.order_buy(ticker, qty, 0)
            if success:
                # DB 업데이트 (시장가 매수이므로 예상 체결가인 current_price 기록)
                db.update_holding(ticker, name, qty, current_price)
        else:
            print(f"[{name}] 단가가 너무 높아 500만원으로 1주도 살 수 없습니다.")

def job_1525_sell_order():
    print(f"[{datetime.now()}] 15:25 PM 자동매도 스케줄러 실행 시작...")
    if not BROKER:
        return
        
    if not BROKER.client.is_market_open():
        print("오늘은 휴장일이므로 매도를 실행하지 않습니다.")
        return
        
    holdings = db.get_holdings()
    if not holdings:
        print("현재 보유 중인 종목이 없습니다.")
        return
        
    for h in holdings:
        ticker = h['ticker']
        name = h.get('name', ticker)
        qty = h['qty']
        
        if qty <= 0:
            continue
            
        # 15:25 시장가(동시호가) 매도 주문 시도 (100% 보유 수량)
        print(f"[{name}] 보유수량 {qty}주 15:25 동시호가 시장가 매도 주문 전송 (15:30 종가 체결 예정)")
        try:
            BROKER.client.order_sell(ticker, qty, 0)
        except Exception as e:
            print(f"[{name}] 매도 주문 API 호출 중 예외 발생 (15:30 종가 강제 정산 예정): {e}")

def job_1531_ledger_record():
    print(f"[{datetime.now()}] 15:31 PM 자동매도 종가 체결 정산 및 장부 기록...")
    if not BROKER:
        return
        
    if not BROKER.client.is_market_open():
        return
        
    holdings = db.get_holdings()
    if not holdings:
        return
        
    total_buy = 0.0
    total_sell = 0.0
    today_str = datetime.now().strftime("%Y-%m-%d")
    
    for h in holdings:
        ticker = h['ticker']
        qty = h['qty']
        
        if qty <= 0:
            continue
            
        # 15:30 이후이므로 get_current_price는 최종 종가를 반환함
        current_price = BROKER.get_current_price(ticker)
        buy_price = h.get('buyPrice', h.get('buy_price', 0))
        
        if current_price <= 0:
            current_price = buy_price
            
        total_buy += qty * buy_price
        total_sell += qty * current_price
        
    # 손익 계산 및 장부 기록 (100% 보유수량 종가 매도 확정)
    if total_buy > 0:
        fees = (total_buy + total_sell) * 0.00015
        tax = total_sell * 0.0020
        net_pnl = total_sell - total_buy - fees - tax
        return_rate = (net_pnl / total_buy) * 100
        
        # 1) 상세 매매원장 기록 (trade_ledger)
        db.add_ledger_record(today_str, total_buy, total_sell, fees, tax, net_pnl, return_rate)
        # 2) 일별 실현손익 기록 (pnl_history) 동기화
        db.add_realized_pnl(today_str, net_pnl)
        
        print(f"15:30 최종 종가 기준 100% 일괄 매도 정산 완료. 당일 실현 손익: {net_pnl:,.0f}원 ({return_rate:.2f}%)")
        
    # 보유 잔고 100% 비우기 (다음날 잔여 수량 이월 방지)
    db.clear_holdings()

if __name__ == "__main__":
    # Test execution
    # job_910_buy()
    pass
