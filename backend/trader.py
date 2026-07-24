import datetime
from typing import List, Dict
from kis_api import KISApiClient

class BrokerageAPI:
    """
    한국투자증권 OpenAPI Wrapper
    """
    def __init__(self, account_no: str, api_key: str, app_secret: str, is_mock: bool = True):
        self.client = KISApiClient(api_key, app_secret, account_no, is_mock)
        print(f"Brokerage API 연동 완료 (계좌: {account_no})")

    def get_current_price(self, ticker: str) -> int:
        return self.client.get_current_price(ticker)

    def order_buy(self, ticker: str, qty: int, price: int):
        print(f"[주문요청] 종목: {ticker} | 수량: {qty}주 | 단가: {price}원 (총액: {qty * price:,}원)")
        self.client.order_buy(ticker, qty, price)


def execute_equal_weight_buy(stocks: List[Dict], total_capital: float, broker: BrokerageAPI):
    """
    9시 5분 기준, 외국계 순매수 비중이 20% 이상인 종목을 동일 비중으로 전량 매수하는 로직.
    """
    print(f"\n--- [9:05 AM] 외국계 순매수 20% 이상 종목 퀀트 매수 시작 ---")
    
    # 1. 조건 검색: 외국계 순매수 비율 >= 20%
    target_stocks = [s for s in stocks if s.get("ratio", 0) >= 20.0]
    
    results = []
    if not target_stocks:
        print("조건(순매수 20% 이상)을 만족하는 종목이 없어 매수를 진행하지 않습니다.")
        return results

    print(f"포착된 매수 대상 종목 수: {len(target_stocks)}개")
    
    # 2. 동일 비중 자산 배분
    allocated_capital_per_stock = total_capital / len(target_stocks)
    print(f"총 자본금: {total_capital:,.0f}원 | 종목당 배정 금액: {allocated_capital_per_stock:,.0f}원")
    
    # 3. 매수 주문 실행
    for stock in target_stocks:
        ticker = stock["ticker"]
        name = stock["name"]
        
        # 현재가 조회 (실제로는 시장가 주문 또는 최우선 매도호가 사용)
        current_price = broker.get_current_price(ticker)
        
        # 수량 계산 (소수점 버림)
        qty = int(allocated_capital_per_stock // current_price)
        
        if qty > 0:
            print(f"[{name}({ticker})] 순매수 비중 {stock['ratio']}% -> 매수 진행")
            broker.order_buy(ticker=ticker, qty=qty, price=current_price)
            results.append({
                "ticker": ticker,
                "name": name,
                "price": current_price,
                "qty": qty,
                "total_amount": current_price * qty,
                "ratio": stock['ratio']
            })
        else:
            print(f"[{name}({ticker})] 배정된 자본금({allocated_capital_per_stock}원)으로 1주도 살 수 없습니다. (현재가: {current_price}원)")
            
    print("--- 매수 주문 완료 ---\n")
    return results

if __name__ == "__main__":
    # Mock Data (from krx100.json logic)
    mock_market_data = [
      { "ticker": "005930", "name": "삼성전자", "ratio": 24.0 },
      { "ticker": "000660", "name": "SK하이닉스", "ratio": 20.8 },
      { "ticker": "035420", "name": "NAVER", "ratio": 10.0 },
      { "ticker": "051910", "name": "LG화학", "ratio": 22.5 },
    ]
    
    # KIS API 계좌 및 토큰 세팅 (모의투자)
    my_broker = BrokerageAPI(
        account_no="44790516-01", 
        api_key="PS7qebWyCKOenh2K32vrFUzuFLNguRPtJad2",
        app_secret="X4uheemKo6gRCwa6aZjCVcanJlok52HJCLi7yXpAyGMIYZV9ueUcuXT0HKftn4Sx64fdN+/pSOJEiQzei0oi6eM7MpzOYpXIvp2lUqftn60497mGsWaNh5Noe3M4lxrV4qfJ9wChBIKoiyOshWPi2pNFdossVKkP6k80I1GhPXLDN7GJmsQ=",
        is_mock=True
    )
    TOTAL_CAPITAL = 10000000 
    
    # 전략 실행
    execute_equal_weight_buy(stocks=mock_market_data, total_capital=TOTAL_CAPITAL, broker=my_broker)
