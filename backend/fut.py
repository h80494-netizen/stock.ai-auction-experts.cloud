import requests
import json
import time
import random
import datetime
import pandas as pd

def fetch_kospi200_futures(start_date_target="2013-08-13", output_file="KOSPI200_Futures_Daily_2013_2026.xlsx"):
    """
    네이버 증권 KOSPI 200 선물 일별 시세 데이터 크롤러
    - 1페이지부터 20개씩 크롤링
    - 수집된 데이터 개수가 20개 미만이거나 2013-08-13 이전 날짜 도달 시 수집 중단
    - 각 요청 사이 2초~10초 사이 랜덤 지연
    - 수집된 데이터를 엑셀 파일로 저장
    """
    today_str = datetime.datetime.now().strftime('%Y-%m-%d')
    url = "https://stock.naver.com/api/securityFe/api/index/FUT/price"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://stock.naver.com/domestic/index/FUT/price'
    }
    
    all_records = []
    page = 1
    page_size = 20  # 페이지당 20개
    stop_crawling = False
    
    print(f"=== KOSPI 200 선물 일별 시세 크롤링 시작 ===")
    print(f"수집 범위: {start_date_target} ~ {today_str}\n")
    
    while not stop_crawling:
        params = {
            'page': str(page),
            'pageSize': str(page_size)
        }
        
        print(f"[페이지 {page}] 데이터 요청 중... (pageSize={page_size})", flush=True)
        
        try:
            res = requests.get(url, params=params, headers=headers, timeout=10)
            res.raise_for_status()
            
            data = res.json()
            if not isinstance(data, list):
                print("  -> 올바르지 않은 응답 형식입니다. 크롤링 종료.", flush=True)
                break
                
            count = len(data)
            print(f"  -> 수집된 데이터 개수: {count}개", flush=True)
            
            if count == 0:
                print("  -> 더 이상 수집할 데이터가 없습니다. 크롤링 종료.", flush=True)
                break
                
            oldest_date = data[-1].get('localTradedAt', '')
            latest_date = data[0].get('localTradedAt', '')
            print(f"  -> 수집 일자 범위: {oldest_date} ~ {latest_date}", flush=True)
            
            for item in data:
                traded_date = item.get('localTradedAt', '')
                if traded_date < start_date_target:
                    print(f"  -> 목표 일자({start_date_target}) 이전 데이터 도달({traded_date}). 수집을 완결합니다.", flush=True)
                    stop_crawling = True
                    break
                
                # 변동구분 텍스트 추출 (상승/하락/보합)
                trend_text = ""
                price_dir = item.get('compareToPreviousPrice')
                if isinstance(price_dir, dict):
                    trend_text = price_dir.get('text', '')
                
                record = {
                    '일자': traded_date,
                    '선물종가': item.get('closePrice'),
                    '전일대비': item.get('compareToPreviousClosePrice'),
                    '등락구분': trend_text,
                    '등락률(%)': item.get('fluctuationsRatio'),
                    '시가': item.get('openPrice'),
                    '고가': item.get('highPrice'),
                    '저가': item.get('lowPrice')
                }
                all_records.append(record)
                
            if stop_crawling:
                break
                
            # 20개 미만이면 마지막 페이지로 판단하고 종료
            if count < page_size:
                print(f"  -> 마지막 페이지 달성 ({count}개 < {page_size}개). 크롤링을 종료합니다.", flush=True)
                break
                
            # 다음 페이지로
            page += 1
            
            # 2초 ~ 10초 사이 랜덤 딜레이
            sleep_sec = random.uniform(2, 10)
            print(f"  -> 다음 페이지 요청 전 {sleep_sec:.2f}초 동안 대기합니다...\n", flush=True)
            time.sleep(sleep_sec)
            
        except Exception as e:
            print(f"[오류] 데이터 수집 중 에러 발생: {e}", flush=True)
            break
            
    if not all_records:
        print("[오류] 수집된 데이터가 없습니다.", flush=True)
        return

    # DataFrame 생성 및 정제
    df = pd.DataFrame(all_records)
    
    # 중복 제거 및 날짜 오름차순 정렬
    df.drop_duplicates(subset=['일자'], inplace=True)
    df.sort_values(by='일자', ascending=True, inplace=True)
    df.reset_index(drop=True, inplace=True)
    
    # 엑셀 파일 저장
    df.to_excel(output_file, index=False)
    
    # CSV 동시 저장
    csv_file = output_file.replace('.xlsx', '.csv')
    df.to_csv(csv_file, index=False, encoding='utf-8-sig')
    
    print(f"\n★ 총 {len(df)}건의 KOSPI 200 선물 일별 데이터 크롤링 완료! ({df['일자'].min()} ~ {df['일자'].max()})")
    print(f"★ 엑셀 저장 완료: [{output_file}]")
    print(f"★ CSV 저장 완료: [{csv_file}]", flush=True)
    
    print("\n=== 상위 5개 행 미리보기 ===")
    print(df.head())

if __name__ == '__main__':
    fetch_kospi200_futures()