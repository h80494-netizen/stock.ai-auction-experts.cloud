import os
import sys
import time
import json
import datetime
import requests
import pandas as pd

# 1. KIS API 인스턴스 준비
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from kis_instance import kis_client

def generate_date_intervals(start_str="20130813", end_str=None, chunk_days=90):
    """2013년 8월 13일부터 현재 일자까지 chunk_days 단위의 기간 구간 생성"""
    if end_str is None:
        end_str = datetime.datetime.now().strftime("%Y%m%d")
        
    start_dt = datetime.datetime.strptime(start_str, "%Y%m%d")
    end_dt = datetime.datetime.strptime(end_str, "%Y%m%d")
    
    intervals = []
    curr_dt = start_dt
    while curr_dt <= end_dt:
        next_dt = curr_dt + datetime.timedelta(days=chunk_days - 1)
        if next_dt > end_dt:
            next_dt = end_dt
        intervals.append((curr_dt.strftime("%Y%m%d"), next_dt.strftime("%Y%m%d")))
        curr_dt = next_dt + datetime.timedelta(days=1)
    return intervals

def collect_kis_program_trade():
    print("=" * 70)
    print("  한국투자증권(KIS API) 코스피 차익거래 프로그램 매매 일별 데이터 수집기")
    print("  조회 기간: 2013년 8월 13일 ~ 현재")
    print("=" * 70)
    
    start_date = "20130813"
    end_date = datetime.datetime.now().strftime("%Y%m%d")
    intervals = generate_date_intervals(start_date, end_date, chunk_days=90)
    
    # 엔드포인트 및 TR ID 설정 (사용자 가이드 TR)
    endpoint = "/uapi/domestic-stock/v1/quotations/program-trade-by-daily"
    url = f"{kis_client.base_url}{endpoint}"
    tr_id = "FHKST01010600"
    
    collected_rows = []
    
    for i, (d1, d2) in enumerate(intervals, 1):
        print(f"[{i}/{len(intervals)}] 수집 기간: {d1} ~ {d2} ... ", end="")
        
        headers = kis_client.get_headers(tr_id)
        headers["custtype"] = "P"
        
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",  # 주식/업종 (코스피)
            "FID_INPUT_ISCD": "0001",       # 코스피 종합지수
            "FID_INPUT_DATE_1": d1,
            "FID_INPUT_DATE_2": d2
        }
        
        # Rate Limit 준수 (0.5초)
        time.sleep(0.5)
        
        try:
            res = requests.get(url, headers=headers, params=params)
            if res.status_code == 200:
                data = res.json()
                output = data.get("output", [])
                if isinstance(output, list) and len(output) > 0:
                    print(f"성공 ({len(output)}건 수집)")
                    collected_rows.extend(output)
                else:
                    print("데이터 없음 (휴장일 또는 해당 기간 데이터 미제공)")
            else:
                print(f"호출 응답 코드 {res.status_code}")
        except Exception as e:
            print(f"호출 오류: {e}")

    print(f"\n총 누적 수집 건수: {len(collected_rows)}건")
    
    # DataFrame 가공 및 엑셀 출력
    output_filename = "코스피_차익거래_프로그램매매_일별_20130813_현재.xlsx"
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), output_filename)
    
    if collected_rows:
        df_raw = pd.DataFrame(collected_rows)
        
        # 중복 제거 및 영업일자 정렬
        if "stck_bsop_date" in df_raw.columns:
            df_raw = df_raw.drop_duplicates(subset=["stck_bsop_date"]).sort_values("stck_bsop_date")
        
        # 필드 가공
        df_export = pd.DataFrame()
        df_export["영업일자"] = df_raw.get("stck_bsop_date", "")
        
        # 수치형 변환 함수
        def to_num(col_name):
            if col_name in df_raw.columns:
                return pd.to_numeric(df_raw[col_name], errors="coerce").fillna(0)
            return pd.Series([0] * len(df_raw))

        df_export["차익_매수금액(원)"] = to_num("arb_tr_shnu_tr_amt")
        df_export["차익_매도금액(원)"] = to_num("arb_tr_seln_tr_amt")
        df_export["차익_순매수금액(원)"] = to_num("arb_tr_ntby_tr_amt")
        
        df_export["차익_매수(억원)"] = (df_export["차익_매수금액(원)"] / 100_000_000).round(2)
        df_export["차익_매도(억원)"] = (df_export["차익_매도금액(원)"] / 100_000_000).round(2)
        df_export["차익_순매수(억원)"] = (df_export["차익_순매수금액(원)"] / 100_000_000).round(2)
        
        df_export["비차익_매수(억원)"] = (to_num("narb_tr_shnu_tr_amt") / 100_000_000).round(2)
        df_export["비차익_매도(억원)"] = (to_num("narb_tr_seln_tr_amt") / 100_000_000).round(2)
        df_export["비차익_순매수(억원)"] = (to_num("narb_tr_ntby_tr_amt") / 100_000_000).round(2)
    else:
        # 데이터가 없을 경우 구조화된 표준 컬럼 생성
        df_export = pd.DataFrame(columns=[
            "영업일자",
            "차익_매수금액(원)", "차익_매도금액(원)", "차익_순매수금액(원)",
            "차익_매수(억원)", "차익_매도(억원)", "차익_순매수(억원)",
            "비차익_매수(억원)", "비차익_매도(억원)", "비차익_순매수(억원)"
        ])

    df_export.to_excel(output_path, index=False)
    print(f"\n[최종 완성] 엑셀 파일 생성 성공: {output_path}")

if __name__ == "__main__":
    collect_kis_program_trade()
