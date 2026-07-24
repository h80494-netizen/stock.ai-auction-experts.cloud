import time
from typing import List
from datetime import datetime
from trader import BrokerageAPI
from excel_parser import load_kospi_data
import database as db

TOTAL_CAPITAL = 100000000 # 1억원
CAPITAL_PER_STOCK = TOTAL_CAPITAL * 0.05 # 종목당 500만원

# 전역 Broker 객체 (실제 운영 시에는 환경변수 사용 권장)
try:
    BROKER = BrokerageAPI(
        account_no="44790516-01", 
        api_key="PS7qebWyCKOenh2K32vrFUzuFLNguRPtJad2",
        app_secret="X4uheemKo6gRCwa6aZjCVcanJlok52HJCLi7yXpAyGMIYZV9ueUcuXT0HKftn4Sx64fdN+/pSOJEiQzei0oi6eM7MpzOYpXIvp2lUqftn60497mGsWaNh5Noe3M4lxrV4qfJ9wChBIKoiyOshWPi2pNFdossVKkP6k80I1GhPXLDN7GJmsQ=",
        is_mock=True
    )
except Exception as e:
    print(f"Brokerage API 초기화 실패: {e}")
    BROKER = None

def job_905_buy():
    print(f"[{datetime.now()}] 9:05 AM 자동매수 스케줄러 실행 시작...")
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
                if ratio >= 20.0:
                    print(f"조건 만족 포착: {stock['name']}({ticker}) - 외국계 순매수 {ratio:.2f}% (수량: {frgn_ntby_qty})")
                    target_stocks.append(stock)
        
        # API 제한(Rate Limit) 방지를 위한 딜레이
        time.sleep(0.1)
        
    if not target_stocks:
        print("외국계 순매수 20% 이상 종목을 찾지 못했습니다.")
        return
        
    print(f"총 {len(target_stocks)}개 종목 매수 진행...")
    
    for stock in target_stocks:
        ticker = stock["ticker"]
        name = stock["name"]
        
        # 3매도호가 조회
        orderbook = BROKER.client.get_orderbook(ticker)
        # askp3 : 3매도호가
        ask_price_str = orderbook.get("askp3", "0")
        ask_price = int(ask_price_str)
        
        if ask_price <= 0:
            print(f"{name} 호가 데이터 오류 또는 상한가. 매수 생략.")
            continue
            
        qty = int(CAPITAL_PER_STOCK // ask_price)
        
        if qty > 0:
            print(f"[{name}] 3매도호가({ask_price}원)에 {qty}주 매수 주문")
            success = BROKER.client.order_buy(ticker, qty, ask_price)
            if success:
                # DB 업데이트
                db.update_holding(ticker, name, qty, ask_price)
        else:
            print(f"[{name}] 단가가 너무 높아 500만원으로 1주도 살 수 없습니다.")

def job_1455_sell():
    print(f"[{datetime.now()}] 14:55 PM 자동매도 스케줄러 실행 시작...")
    if not BROKER:
        return
        
    if not BROKER.client.is_market_open():
        print("오늘은 휴장일이므로 매도를 실행하지 않습니다.")
        return
        
    holdings = db.get_holdings()
    if not holdings:
        print("현재 보유 중인 종목이 없습니다.")
        return
        
    total_buy = 0.0
    total_sell = 0.0
    
    for h in holdings:
        ticker = h['ticker']
        name = h.get('name', ticker)
        qty = h['qty']
        
        if qty <= 0:
            continue
            
        # 시장가 매도 (price = 0)
        print(f"[{name}] 보유수량 {qty}주 시장가 전량 매도 주문")
        success = BROKER.client.order_sell(ticker, qty, 0)
        
        # DB 정산을 위한 현재가 조회 (시장가 체결가로 가정)
        current_price = BROKER.get_current_price(ticker)
        buy_price = h.get('buyPrice', h.get('buy_price', 0))
        
        total_buy += qty * buy_price
        total_sell += qty * current_price
        
    # 손익 계산 및 장부 기록
    if total_buy > 0:
        fees = (total_buy + total_sell) * 0.00015
        tax = total_sell * 0.0020
        net_pnl = total_sell - total_buy - fees - tax
        return_rate = (net_pnl / total_buy) * 100
        
        today_str = datetime.now().strftime("%Y-%m-%d")
        db.add_ledger_record(today_str, total_buy, total_sell, fees, tax, net_pnl, return_rate)
        print(f"일괄 매도 완료. 당일 실현 손익: {net_pnl:,.0f}원 ({return_rate:.2f}%)")
        
    db.clear_holdings()

if __name__ == "__main__":
    # Test execution
    # job_905_buy()
    pass
