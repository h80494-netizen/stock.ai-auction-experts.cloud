import time
from typing import List
from datetime import datetime, timedelta
from trader import BrokerageAPI
import os
from dotenv import load_dotenv
from excel_parser import load_kospi_data
import database as db
from trading_config import get_trading_config, calculate_settlement_metrics

load_dotenv()

_INIT_CFG = get_trading_config()
TOTAL_CAPITAL = _INIT_CFG["max_total_capital"]
CAPITAL_PER_STOCK = _INIT_CFG["max_per_stock_capital"]

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
    now_kst = datetime.utcnow() + timedelta(hours=9)
    today_str = now_kst.strftime("%Y-%m-%d")
    auto_batch_id = f"AUTO_{today_str}"
    print(f"[{now_kst}] 9:10 AM 자동매수 스케줄러 실행 시작...")
    if not BROKER:
        print("Broker 객체가 없습니다.")
        return

    if not BROKER.client.is_market_open():
        print("오늘은 휴장일 또는 주말이므로 매수를 실행하지 않습니다.")
        return

    allowed, reason = db.can_execute_initial_buy(today_str, batch_id=auto_batch_id)
    if not allowed:
        print(f"당일 추가 매수 제한으로 자동매수를 건너뜁니다: {reason}")
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
        
    cfg = get_trading_config()
    max_total = float(cfg["max_total_capital"])
    max_stocks = int(cfg["max_stocks"])
    cap_per_stock = float(cfg["max_per_stock_capital"])
    target_stocks = target_stocks[:max_stocks]
    print(f"총 {len(target_stocks)}개 종목 매수 진행...")
    
    for stock in target_stocks:
        ticker = stock["ticker"]
        name = stock["name"]

        allowed, reason = db.can_execute_initial_buy(today_str, ticker=ticker, batch_id=auto_batch_id)
        if not allowed:
            print(f"[{name}] 매수 생략: {reason}")
            continue
        
        # 현재가 조회 (수량 계산을 위한 기준가 용도)
        current_price = BROKER.client.get_current_price(ticker)
        
        if current_price <= 0:
            print(f"{name} 현재가 데이터 오류. 매수 생략.")
            continue
            
        # 기준가로 살 수 있는 수량 계산 (종목당 한도 및 총 1억 한도 적용)
        remaining_budget = max(0.0, max_total - db.get_today_buy_total(today_str))
        qty = min(int(cap_per_stock // current_price), int(remaining_budget // current_price))
        
        if qty > 0:
            print(f"[{name}] 기준가({current_price}원) 바탕으로 {qty}주 시장가 매수 주문")
            # price를 0으로 넘기면 '시장가(01)'로 주문이 들어감
            success = BROKER.client.order_buy(ticker, qty, 0)
            if success:
                # DB 업데이트 (시장가 매수이므로 예상 체결가인 current_price 기록)
                db.update_holding(ticker, name, qty, current_price)
                db.record_trading_buy(today_str, ticker.split(":")[-1], name, current_price, qty, batch_id=auto_batch_id)
        else:
            print(f"[{name}] 한도 초과 또는 단가 초과로 매수할 수 없습니다.")

def job_1520_sell_order():
    print(f"[{datetime.now()}] 15:20 PM 장마감 동시호가 자동매도 주문 전송 시작 (15:30 종가 체결 예정)...")
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
            
        # 15:20 시장가(동시호가) 매도 주문 시도 (100% 보유 수량)
        # 시장가(0)로 주문을 넣으면 거래소 규정에 따라 15:20~15:30 동시호가에 접수되어 15:30 종가로 일괄 체결됨
        print(f"[{name}] 보유수량 {qty}주 15:20 동시호가 시장가 매도 주문 전송 (15:30 종가 체결 대기)")
        try:
            BROKER.client.order_sell(ticker, qty, 0)
        except Exception as e:
            print(f"[{name}] 매도 주문 API 호출 중 예외 발생 (15:30 종가 강제 정산 예정): {e}")

# 하위 호환성 별칭
job_1525_sell_order = job_1520_sell_order

def job_1531_ledger_record():
    print(f"[{datetime.now()}] 15:31 PM 장마감 최종 종가 체결 정산 및 거래원장 기록 시작...")
    if not BROKER:
        return
        
    if not BROKER.client.is_market_open():
        return
        
    holdings = db.get_holdings()
    if not holdings:
        print("정산할 보유 잔고가 없습니다.")
        return
        
    total_buy = 0.0
    total_sell = 0.0
    today_str = (datetime.utcnow() + timedelta(hours=9)).strftime("%Y-%m-%d")
    sell_items = []
    
    for h in holdings:
        ticker = h['ticker']
        pure_t = ticker.split(':')[-1]
        name = h.get('name', pure_t)
        qty = h['qty']
        
        if qty <= 0:
            continue
            
        # 15:30 장마감 이후이므로 거래소 당일 최종 종가를 가져옴
        closing_price = 0
        if hasattr(BROKER.client, 'get_closing_price'):
            try:
                closing_price = BROKER.client.get_closing_price(pure_t)
            except Exception:
                closing_price = 0
                
        if closing_price <= 0:
            closing_price = BROKER.get_current_price(pure_t)
            
        buy_price = h.get('buyPrice', h.get('buy_price', 0))
        
        if closing_price <= 0:
            closing_price = buy_price
            
        total_buy += qty * buy_price
        total_sell += qty * closing_price
        
        item_pnl = (closing_price - buy_price) * qty
        sell_items.append({
            'ticker': pure_t,
            'name': name,
            'qty': qty,
            'buy_price': buy_price,
            'sell_price': closing_price,
            'pnl': item_pnl
        })
        
    # 손익 계산 및 장부 기록 (100% 보유수량 15:30 최종 종가 매도 확정)
    if total_buy > 0:
        metrics = calculate_settlement_metrics(total_buy, total_sell)
        fees = metrics["fees"]
        tax = metrics["tax"]
        net_pnl = metrics["net_pnl"]
        return_rate = metrics["return_rate"]
        
        # 1) 일자별 요약 원장 기록 (trade_ledger)
        db.add_ledger_record(today_str, total_buy, total_sell, fees, tax, net_pnl, return_rate)
        # 2) 종목별 상세 매매원장 기록 (trading_ledger) - 15:30 종가 매도 확정
        db.record_trading_sell_all(today_str, sell_items)
        # 3) 일별 실현손익 기록 (pnl_history) 동기화
        db.add_realized_pnl(today_str, net_pnl)
        
        print(f"15:30 최종 종가 기준 100% 일괄 매도 정산 완료. 당일 실현 손익: {net_pnl:,.0f}원 ({return_rate:.2f}%)")
        
    # 보유 잔고 100% 비우기 (다음날 잔여 수량 이월 방지)
    db.clear_holdings()

if __name__ == "__main__":
    pass
