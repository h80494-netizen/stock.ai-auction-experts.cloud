import os
import time
import schedule
from dotenv import load_dotenv
from trader import BrokerageAPI, execute_morning_buy, execute_afternoon_sell
from kis_instance import kis_client
from kis_api import KISApiClient

load_dotenv()

# We can re-use kis_client from kis_instance, but trader needs BrokerageAPI wrapper.
# Since kis_client is already a KISApiClient instance, we can just wrap it or re-initialize.
class SingletonBrokerageAPI(BrokerageAPI):
    def __init__(self):
        # By-pass initialization to use the global one if needed, or re-init
        self.client = kis_client
        print(f"Brokerage API 연동 완료 (계좌: {self.client.cano}-{self.client.acnt_prdt_cd})")

def morning_job():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 아침 매수 작업 시작")
    broker = SingletonBrokerageAPI()
    
    # 09시 현재 거래소 시장 개장 여부(영업일) 체크
    if not broker.client.is_market_open():
        print("오늘은 휴장일(영업일 아님)이므로 매수 작업을 취소합니다.")
        return
        
    try:
        # 상위 N개(현재 3개로 설정), 외국계 순매수 비중 5% 이상인 종목만 500만원씩
        execute_morning_buy(broker, limit=3, target_amount_per_stock=5000000.0)
    except Exception as e:
        print(f"아침 매수 작업 중 에러 발생: {e}")

def afternoon_job():
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 오후 매도 작업 시작")
    broker = SingletonBrokerageAPI()
    
    # 영업일 체크 (장이 열리지 않는 날이면 매도할 것도 없음)
    if not broker.client.is_market_open():
        print("오늘은 휴장일(영업일 아님)이므로 매도 작업을 취소합니다.")
        return
        
    try:
        execute_afternoon_sell(broker)
    except Exception as e:
        print(f"오후 매도 작업 중 에러 발생: {e}")

def main():
    print("자동 매매 데몬 스케줄러 시작...")
    
    # 평일 09:05:01에 매수 (schedule 라이브러리는 요일 지정 및 초 지정 지원)
    days = [schedule.every().monday, schedule.every().tuesday, schedule.every().wednesday, schedule.every().thursday, schedule.every().friday]
    
    for day in days:
        day.at("09:05:01").do(morning_job)
        day.at("15:20:00").do(afternoon_job)
        
    print("스케줄 등록 완료. 대기 중...")
    
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    main()
