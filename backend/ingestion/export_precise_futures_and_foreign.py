import os
import time
import datetime
import requests
import pandas as pd
from bs4 import BeautifulSoup

SAVE_EXCEL_PATH = r"C:\Users\llll\Documents\두인경매\주식투자\data\KOSPI200선물_미결제약정_외인순매수_통합_20130813이후.xlsx"
SAVE_EXCEL_OI = r"C:\Users\llll\Documents\두인경매\주식투자\data\선물미결제_외인순매수_20130813이후_일별.xlsx"
FUTURES_EXCEL_PATH = r"C:\Users\llll\Documents\두인경매\주식투자\data\KOSPI200_선물최근월물_20130813이후_일별.xlsx"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

def fetch_naver_investor_trend(max_pages=450):
    """
    Fetches daily KOSPI Foreign Net Buy Amounts from Naver Finance in exact 억원 unit.
    Naver Finance investorDealTrend table native unit is 억원 (100 million KRW).
    """
    print(f"Fetching KOSPI Foreign net purchases from Naver Finance ({max_pages} pages)...")
    records = []
    session = requests.Session()
    session.headers.update(HEADERS)
    
    cutoff_date = datetime.date(2013, 8, 13)
    
    for page in range(1, max_pages + 1):
        url = f"https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate=20260916&sosok=&page={page}"
        try:
            res = session.get(url, timeout=5)
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table tr')
            
            for tr in rows:
                cols = tr.find_all('td')
                if len(cols) >= 4:
                    date_str = cols[0].text.strip()
                    if date_str and ('.' in date_str or '-' in date_str):
                        try:
                            dt = datetime.datetime.strptime("20" + date_str if len(date_str) == 8 else date_str, "%Y.%m.%d").date()
                        except Exception:
                            continue
                            
                        if dt < cutoff_date:
                            continue
                            
                        # Naver table native unit is 억원! Do not divide by 100!
                        foreign_val = float(cols[2].text.strip().replace(',', ''))
                        records.append({
                            'Date': dt.strftime("%Y-%m-%d"),
                            'KOSPI_Foreign_Net_Buy_Amount(억)': int(foreign_val)
                        })
                        
            if page % 50 == 0:
                print(f"Fetched investor trend page {page}/{max_pages}...")
                
        except Exception as e:
            print(f"[Warning] Error page {page}: {e}")
            time.sleep(0.3)
            
    df = pd.DataFrame(records)
    if not df.empty:
        df = df.drop_duplicates(subset=['Date']).sort_values('Date').reset_index(drop=True)
    return df

def generate_integrated_excel():
    # 1. Fetch Naver Investor Foreign Net Buy Trend (Exact 억원)
    df_foreign = fetch_naver_investor_trend(max_pages=450)
    print(f"Collected {len(df_foreign)} days of foreign net buy data.")

    # 2. Load Futures OHLCV
    if os.path.exists(FUTURES_EXCEL_PATH):
        df_futures = pd.read_excel(FUTURES_EXCEL_PATH)
        df_futures['Date'] = pd.to_datetime(df_futures['Date']).dt.strftime('%Y-%m-%d')
    else:
        df_futures = pd.DataFrame(columns=['Date', 'Open', 'High', 'Low', 'Close', 'Volume'])

    # 3. Merge data
    if not df_futures.empty and not df_foreign.empty:
        merged_df = pd.merge(df_futures, df_foreign, on='Date', how='left')
    elif not df_futures.empty:
        merged_df = df_futures
        merged_df['KOSPI_Foreign_Net_Buy_Amount(억)'] = None
    else:
        merged_df = df_foreign

    # Open Interest column (left blank for non-fetched items as requested)
    merged_df['Futures_Open_Interest(계약)'] = None

    # Reorder columns
    cols = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'Futures_Open_Interest(계약)', 'KOSPI_Foreign_Net_Buy_Amount(억)']
    existing_cols = [c for c in cols if c in merged_df.columns]
    final_df = merged_df[existing_cols].sort_values('Date').reset_index(drop=True)

    # Save to Excel files
    final_df.to_excel(SAVE_EXCEL_PATH, index=False)
    final_df.to_excel(SAVE_EXCEL_OI, index=False)
    print(f"[Success] Saved corrected Excel files with exact 억원 unit to:\n - {SAVE_EXCEL_PATH}\n - {SAVE_EXCEL_OI}")

if __name__ == "__main__":
    generate_integrated_excel()
