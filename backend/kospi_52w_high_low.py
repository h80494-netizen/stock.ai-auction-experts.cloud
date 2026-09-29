import urllib.request
import io
import re
import pandas as pd
import yfinance as yf

def calculate_kospi_52w_high_low(start_date_target="2013-08-13", end_date_target="2026-09-22"):
    print("=== 1. KOSPI 상장 종목 리스트 수집 (KRX KIND) ===")
    url = "http://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13&marketType=stockMkt"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        html = resp.read().decode('euc-kr', errors='ignore')
        df_kind = pd.read_html(io.StringIO(html))[0]
        
    yf_tickers = []
    for code in df_kind['종목코드']:
        code_str = str(code).strip()
        match = re.search(r'\d+', code_str)
        if match:
            clean_code = match.group(0).zfill(6)
            yf_tickers.append(f"{clean_code}.KS")
            
    yf_tickers = list(set(yf_tickers))
    print(f"  -> KOSPI 대상 종목 수: {len(yf_tickers)}개\n")

    print(f"=== 2. KOSPI 일별 종가 시세 다운로드 (2012-08-01 ~ {end_date_target}) ===")
    start_date = "2012-08-01"
    
    data = yf.download(yf_tickers, start=start_date, end="2026-09-25", progress=False, auto_adjust=True)
    
    if data.empty or 'Close' not in data:
        print("[오류] 시세 데이터를 가져오지 못했습니다.")
        return

    price_matrix = data['Close'].dropna(how='all')
    print(f"  -> 수집된 거래일 수: {len(price_matrix)}일\n")

    print("=== 3. 52주(250 거래일) 롤링 신고가 및 신저가 산출 중 ===")
    rolling_high = price_matrix.shift(1).rolling(window=250, min_periods=200).max()
    rolling_low  = price_matrix.shift(1).rolling(window=250, min_periods=200).min()

    is_new_high = price_matrix >= rolling_high
    is_new_low  = price_matrix <= rolling_low

    nh_series = is_new_high.sum(axis=1)
    nl_series = is_new_low.sum(axis=1)

    breadth_df = pd.DataFrame({
        'KOSPI_52W_High': nh_series,
        'KOSPI_52W_Low': nl_series
    }, index=price_matrix.index)

    # 2013-08-13 ~ 2026-09-22 범위 지정
    breadth_df.index = pd.to_datetime(breadth_df.index).strftime('%Y-%m-%d')
    result_df = breadth_df.loc[start_date_target:end_date_target].copy()
    result_df['Net_NH_NL'] = result_df['KOSPI_52W_High'] - result_df['KOSPI_52W_Low']
    result_df.index.name = 'Date'

    csv_filename = "KOSPI_52W_High_Low_2013_2026.csv"
    xlsx_filename = "KOSPI_52W_High_Low_2013_2026.xlsx"
    
    result_df.to_csv(csv_filename)
    result_df.to_excel(xlsx_filename)

    print(f"\n★ [52주 신고가/신저가] 수집 완결 ({result_df.index.min()} ~ {result_df.index.max()})")
    print(f"★ 저장된 파일: [{csv_filename}], [{xlsx_filename}] (총 {len(result_df)}개 거래일)")

if __name__ == '__main__':
    calculate_kospi_52w_high_low()
