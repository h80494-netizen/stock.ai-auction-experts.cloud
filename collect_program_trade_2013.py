import os
import sys
import time
import json
import datetime
import requests
import pandas as pd

# Add backend directory to path to use existing kis_instance if needed
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from kis_instance import kis_client

def generate_date_ranges(start_date_str, end_date_str, chunk_days=90):
    """Generate date ranges of chunk_days from start_date to end_date."""
    start_dt = datetime.datetime.strptime(start_date_str, "%Y%m%d")
    end_dt = datetime.datetime.strptime(end_date_str, "%Y%m%d")
    
    ranges = []
    curr_dt = start_dt
    while curr_dt <= end_dt:
        next_dt = curr_dt + datetime.timedelta(days=chunk_days - 1)
        if next_dt > end_dt:
            next_dt = end_dt
        ranges.append((curr_dt.strftime("%Y%m%d"), next_dt.strftime("%Y%m%d")))
        curr_dt = next_dt + datetime.timedelta(days=1)
    return ranges

def fetch_program_trade_daily():
    start_date = "20130813"
    today_str = datetime.datetime.now().strftime("%Y%m%d")
    
    print(f"=== KIS API 일별 차익거래 프로그램 매매 수집 시작 ({start_date} ~ {today_str}) ===")
    
    date_ranges = generate_date_ranges(start_date, today_str, chunk_days=90)
    print(f"총 {len(date_ranges)}개 기간 구간으로 분할하여 수집을 진행합니다.")

    all_records = []
    
    # URL List to attempt
    url_candidates = [
        f"{kis_client.base_url}/uapi/domestic-stock/v1/quotations/program-trade-by-daily",
        f"{kis_client.base_url}/uapi/domestic-stock/v1/quotations/program-trade-trend",
        f"{kis_client.base_url}/uapi/domestic-stock/v1/quotations/comp-program-trade-daily",
    ]

    working_url = None

    # First check working URL
    for candidate in url_candidates:
        headers = kis_client.get_headers("FHKST01010600")
        headers["custtype"] = "P"
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": "0001",
            "FID_INPUT_DATE_1": "20240101",
            "FID_INPUT_DATE_2": "20240131"
        }
        kis_client.rate_limiter.wait()
        res = requests.get(candidate, headers=headers, params=params)
        if res.status_code == 200:
            working_url = candidate
            print(f"사용할 엔드포인트 URL 확인: {working_url}")
            break

    if not working_url:
        print("설정된 Candidates 중 Direct 200 응답 URL이 없어 기본 지정 URL 사용합니다.")
        working_url = url_candidates[0]

    for idx, (d1, d2) in enumerate(date_ranges):
        print(f"[{idx+1}/{len(date_ranges)}] 기간 수집 중: {d1} ~ {d2} ... ", end="")
        headers = kis_client.get_headers("FHKST01010600")
        headers["custtype"] = "P"
        
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": "0001",
            "FID_INPUT_DATE_1": d1,
            "FID_INPUT_DATE_2": d2
        }
        
        # Rate limit pause
        time.sleep(0.5)
        
        try:
            res = requests.get(working_url, headers=headers, params=params)
            if res.status_code == 200:
                data = res.json()
                output = data.get("output", [])
                if output:
                    print(f"성공 ({len(output)}건)")
                    all_records.extend(output)
                else:
                    print("데이터 없음")
            else:
                print(f"호출 실패 (Status: {res.status_code})")
        except Exception as e:
            print(f"오류 발생: {e}")

    print(f"\n총 수집된 데이터 레코드 수: {len(all_records)}건")

    if not all_records:
        print("수집된 레코드가 없어 예시용 샘플 구조 엑셀 서식을 생성합니다.")
        # Create empty template DataFrame
        df_result = pd.DataFrame(columns=[
            "영업일자", "차익_매수금액(원)", "차익_매도금액(원)", "차익_순매수금액(원)",
            "차익_매수(억원)", "차익_매도(억원)", "차익_순매수(억원)",
            "비차익_매수(억원)", "비차익_매도(억원)", "비차익_순매수(억원)"
        ])
    else:
        df = pd.DataFrame(all_records)
        # Unique by date
        if "stck_bsop_date" in df.columns:
            df = df.drop_duplicates(subset=["stck_bsop_date"]).sort_values("stck_bsop_date")
            
            df_result = pd.DataFrame()
            df_result["영업일자"] = df["stck_bsop_date"]
            
            # Numeric conversion
            for c in ["arb_tr_shnu_tr_amt", "arb_tr_seln_tr_amt", "arb_tr_ntby_tr_amt", 
                      "narb_tr_shnu_tr_amt", "narb_tr_seln_tr_amt", "narb_tr_ntby_tr_amt"]:
                if c in df.columns:
                    df[c] = pd.to_numeric(df[c], errors="coerce").fillna(0)
                else:
                    df[c] = 0

            df_result["차익_매수금액(원)"] = df["arb_tr_shnu_tr_amt"]
            df_result["차익_매도금액(원)"] = df["arb_tr_seln_tr_amt"]
            df_result["차익_순매수금액(원)"] = df["arb_tr_ntby_tr_amt"]
            
            df_result["차익_매수(억원)"] = (df["arb_tr_shnu_tr_amt"] / 100_000_000).round(2)
            df_result["차익_매도(억원)"] = (df["arb_tr_seln_tr_amt"] / 100_000_000).round(2)
            df_result["차익_순매수(억원)"] = (df["arb_tr_ntby_tr_amt"] / 100_000_000).round(2)
            
            df_result["비차익_매수(억원)"] = (df["narb_tr_shnu_tr_amt"] / 100_000_000).round(2)
            df_result["비차익_매도(억원)"] = (df["narb_tr_seln_tr_amt"] / 100_000_000).round(2)
            df_result["비차익_순매수(억원)"] = (df["narb_tr_ntby_tr_amt"] / 100_000_000).round(2)
        else:
            df_result = df

    excel_filename = "코스피_차익거래_프로그램매매_20130813_현재.xlsx"
    excel_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), excel_filename)
    df_result.to_excel(excel_path, index=False)
    print(f"엑셀 파일 저장 완료: {excel_path}")

if __name__ == "__main__":
    fetch_program_trade_daily()
