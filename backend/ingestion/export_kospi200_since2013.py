import os
import time
import datetime
import requests
import pandas as pd
from bs4 import BeautifulSoup
import openpyxl

SAVE_EXCEL_2013 = r"C:\Users\llll\Documents\두인경매\주식투자\data\KOSPI200_20130813이후_현물지수.xlsx"
FUTURES_EXCEL = r"C:\Users\llll\Documents\두인경매\주식투자\data\선물가격업데이트.xlsx"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

def fetch_kospi200_since_2013():
    """
    Fetches KOSPI 200 OHLCV data from 2013-08-13 to present from Naver Finance.
    """
    print("Starting KOSPI 200 OHLCV data collection since 2013-08-13...")
    records = []
    
    # 600 pages covers > 3,500 trading days (~14 years, back to 2012)
    max_pages = 600
    cutoff_date = datetime.date(2013, 8, 13)
    
    session = requests.Session()
    session.headers.update(HEADERS)
    
    for page in range(1, max_pages + 1):
        url = f"https://finance.naver.com/sise/sise_index_day.naver?code=KPI200&page={page}"
        try:
            res = session.get(url, timeout=5)
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table.type_1 tr')
            
            page_has_data = False
            for tr in rows:
                cols = tr.find_all('td')
                if len(cols) >= 6:
                    date_str = cols[0].text.strip()
                    if date_str and '.' in date_str:
                        dt = datetime.datetime.strptime(date_str, "%Y.%m.%d").date()
                        
                        if dt < cutoff_date:
                            continue
                            
                        close_v = float(cols[1].text.replace(',', ''))
                        vol_v = float(cols[4].text.replace(',', '')) if len(cols) > 4 and cols[4].text.strip().replace(',','').isdigit() else 0
                        
                        records.append({
                            'Date': dt,
                            'Close': close_v,
                            'Volume': int(vol_v)
                        })
                        page_has_data = True
                        
            if page % 50 == 0:
                print(f"Fetched page {page}/{max_pages}...")
                
        except Exception as e:
            print(f"[Warning] Error fetching page {page}: {e}")
            time.sleep(0.3)

    df = pd.DataFrame(records)
    if df.empty:
        raise ValueError("Failed to fetch KOSPI 200 data.")
        
    df = df.drop_duplicates(subset=['Date']).sort_values('Date').reset_index(drop=True)
    print(f"Total collected records: {len(df)} days (from {df['Date'].min()} to {df['Date'].max()})")
    
    # Enrich with exact Open, High, Low using yfinance or fallback
    print("Fetching Open, High, Low details via yfinance...")
    try:
        import yfinance as yf
        start_str = df['Date'].min().strftime("%Y-%m-%d")
        end_str = (df['Date'].max() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        
        yf_df = yf.Ticker("^KS200").history(start=start_str, end=end_str)
        if not yf_df.empty:
            yf_df.index = pd.to_datetime(yf_df.index).date
            
            df['Open'] = df['Date'].map(lambda d: round(float(yf_df.loc[d]['Open']), 2) if d in yf_df.index and pd.notna(yf_df.loc[d]['Open']) else None)
            df['High'] = df['Date'].map(lambda d: round(float(yf_df.loc[d]['High']), 2) if d in yf_df.index and pd.notna(yf_df.loc[d]['High']) else None)
            df['Low'] = df['Date'].map(lambda d: round(float(yf_df.loc[d]['Low']), 2) if d in yf_df.index and pd.notna(yf_df.loc[d]['Low']) else None)
    except Exception as e:
        print("[Info] yfinance detail fetch fallback:", e)

    df['Open'] = df['Open'].fillna(df['Close'])
    df['High'] = df['High'].fillna(df['Close'])
    df['Low'] = df['Low'].fillna(df['Close'])

    # Reorder columns
    df = df[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']]
    
    # Save standalone Excel file since 2013-08-13
    df.to_excel(SAVE_EXCEL_2013, index=False)
    print(f"[Success] Saved KOSPI 200 Excel (since 2013-08-13) to: {SAVE_EXCEL_2013}")

if __name__ == "__main__":
    fetch_kospi200_since_2013()
