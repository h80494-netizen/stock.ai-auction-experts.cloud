import requests
import json
import time
import random
import datetime
import pandas as pd

def fetch_program_trend(start_date_target="20130813"):
    """
    네이버 증권 차익/비차익 프로그램 매매 일별 순매수 데이터 수집 및 엑셀 저장
    - startIdx는 0, 1, 2, 3... (페이지 번호) 방식으로 순차 수집하여 일자 누락 방지
    - target_date(20130813) 이전 날짜에 도달하면 수집 종료
    - 각 요청 사이 2초~10초 사이 랜덤 지연
    """
    today_str = datetime.datetime.now().strftime('%Y%m%d')
    url = "https://stock.naver.com/api/domestic/market/trendProgram"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://stock.naver.com/market/stock/kr/trend/program'
    }
    
    all_data = []
    page_idx = 0  # 페이지 인덱스 (0, 1, 2, 3... 순차 증가)
    page_size = 20
    stop_crawling = False
    
    print(f"=== 네이버 증권 프로그램 매매 일별 데이터 크롤링 시작 ===")
    print(f"목표 수집 기간: {start_date_target} ~ {today_str}\n", flush=True)
    
    while not stop_crawling:
        params = {
            'tradeType': 'KRX',
            'krxMarketType': 'KOSPI',
            'bizdate': today_str,
            'startIdx': page_idx,  # 페이지 번호
            'pageSize': page_size,
            'periodType': 'DAY'
        }
        
        print(f"[페이지 {page_idx + 1}] 데이터 요청 중... (startIdx={page_idx})", flush=True)
        
        try:
            res = requests.get(url, params=params, headers=headers, timeout=10)
            res.raise_for_status()
            
            data = res.json()
            content = data.get('content', [])
            count = len(content)
            
            if count == 0:
                print(f"  -> 더 이상 수집할 데이터가 없습니다. (수집 종료)", flush=True)
                break
                
            oldest_date_in_page = content[-1].get('bizdate', '')
            latest_date_in_page = content[0].get('bizdate', '')
            print(f"  -> 수집 건수: {count}개 ({oldest_date_in_page} ~ {latest_date_in_page})", flush=True)
            
            # 수집 목록에 추가 및 시작일자(20130813) 체크
            for item in content:
                bizdate = item.get('bizdate', '')
                if bizdate < start_date_target:
                    print(f"  -> 목표 시작일자({start_date_target}) 이전 항목 도달({bizdate}). 수집을 종료합니다.", flush=True)
                    stop_crawling = True
                    break
                all_data.append(item)
                
            if stop_crawling:
                break
                
            # 20개 미만이면 마지막 페이지
            if count < page_size:
                print(f"  -> 마지막 페이지 달성 ({count}개 < {page_size}개). 크롤링 종료", flush=True)
                break
                
            # 다음 페이지로 이동
            page_idx += 1
            
            # 2초 ~ 10초 사이 랜덤 딜레이
            sleep_sec = random.uniform(2, 10)
            print(f"  -> 다음 페이지 요청 전 {sleep_sec:.2f}초 대기...\n", flush=True)
            time.sleep(sleep_sec)
            
        except Exception as e:
            print(f"[오류] 데이터 수집 중 에러 발생: {e}", flush=True)
            break
            
    if not all_data:
        print("수집된 데이터가 없습니다.", flush=True)
        return

    # DataFrame 생성 및 정제
    df = pd.DataFrame(all_data)
    
    # 중복 날짜 제거 및 날짜 오름차순 정렬
    df.drop_duplicates(subset=['bizdate'], inplace=True)
    df.sort_values(by='bizdate', ascending=True, inplace=True)
    
    # 2013년 8월 13일 이후 데이터 필터링
    df = df[df['bizdate'] >= start_date_target]
    
    # 주요 컬럼명 한글화 및 순서 정리
    column_mapping = {
        'bizdate': '일자',
        'diffBuyAmt': '차익매수금액(원)',
        'diffSellAmt': '차익매도금액(원)',
        'diffPureBuyAmt': '차익순매수금액(원)',
        'biDiffBuyAmt': '비차익매수금액(원)',
        'biDiffSellAmt': '비차익매도금액(원)',
        'biDiffPureBuyAmt': '비차익순매수금액(원)',
        'totalDiffBuyAmt': '전체매수금액(원)',
        'totalDiffSellAmt': '전체매도금액(원)',
        'totalDiffPureBuyAmt': '전체순매수금액(원)'
    }
    
    available_cols = [col for col in column_mapping.keys() if col in df.columns]
    df = df[available_cols]
    df.rename(columns=column_mapping, inplace=True)
    
    # 엑셀 파일 저장
    output_filename = "naver_program_arbitrage_daily.xlsx"
    df.to_excel(output_filename, index=False)
    print(f"\n★ 총 {len(df)}건의 일별 데이터 수집 완료 ({df['일자'].min()} ~ {df['일자'].max()})")
    print(f"★ [{output_filename}] 파일로 정상 저장되었습니다.", flush=True)

if __name__ == '__main__':
    fetch_program_trend(start_date_target="20130813")