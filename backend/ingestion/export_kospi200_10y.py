import os
import time
import datetime
import requests
import pandas as pd
from bs4 import BeautifulSoup
import openpyxl

SAVE_EXCEL_10Y = r"C:\Users\llll\Documents\두인경매\주식투자\data\KOSPI200_10년_현물지수.xlsx"
FUTURES_EXCEL = r"C:\Users\llll\Documents\두인경매\주식투자\data\선물가격업데이트.xlsx"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

def fetch_kospi200_10years():
    """
    Fetches 10 years of KOSPI 200 OHLCV data from Naver Finance index day pages.
    """
    print("Starting 10-year KOSPI 200 OHLCV data collection...")
    records = []
    
    # 450 pages covers > 2,600 trading days (~10.5 years)
    max_pages = 450
    
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
                        close_v = float(cols[1].text.replace(',', ''))
                        
                        # Check OHLCV details from columns if available
                        # Table columns: 날짜(0), 체결가(1), 전일비(2), 등락률(3), 거래량(4), 거래대금(5)
                        vol_v = float(cols[4].text.replace(',', '')) if len(cols) > 4 and cols[4].text.strip().replace(',','').isdigit() else 0
                        
                        records.append({
                            'Date': dt,
                            'Close': close_v,
                            'Volume': int(vol_v)
                        })
                        page_has_data = True
                        
            if page % 50 == 0:
                print(f"Fetched page {page}/{max_pages}...")
                
            if not page_has_data and page > 10:
                break
                
        except Exception as e:
            print(f"[Warning] Error fetching page {page}: {e}")
            time.sleep(0.5)

    df = pd.DataFrame(records)
    if df.empty:
        raise ValueError("Failed to fetch KOSPI 200 data.")
        
    df = df.drop_duplicates(subset=['Date']).sort_values('Date').reset_index(drop=True)
    print(f"Total collected records: {len(df)} days (from {df['Date'].min()} to {df['Date'].max()})")
    
    # Now let's enrich with exact Open, High, Low using yfinance or detailed index endpoint
    print("Fetching Open, High, Low details...")
    try:
        import yfinance as yf
        start_str = df['Date'].min().strftime("%Y-%m-%d")
        end_str = (df['Date'].max() + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
        
        # 122630.KS or ^KS200 index
        yf_df = yf.Ticker("^KS200").history(start=start_str, end=end_str)
        if not yf_df.empty:
            yf_df.index = pd.to_datetime(yf_df.index).date
            
            df['Open'] = df['Date'].map(lambda d: round(float(yf_df.loc[d]['Open']), 2) if d in yf_df.index and pd.notna(yf_df.loc[d]['Open']) else None)
            df['High'] = df['Date'].map(lambda d: round(float(yf_df.loc[d]['High']), 2) if d in yf_df.index and pd.notna(yf_df.loc[d]['High']) else None)
            df['Low'] = df['Date'].map(lambda d: round(float(yf_df.loc[d]['Low']), 2) if d in yf_df.index and pd.notna(yf_df.loc[d]['Low']) else None)
    except Exception as e:
        print("[Info] yfinance detail fetch fallback:", e)

    # For any missing Open/High/Low, keep exact Close value or None
    df['Open'] = df['Open'].fillna(df['Close'])
    df['High'] = df['High'].fillna(df['Close'])
    df['Low'] = df['Low'].fillna(df['Close'])

    # Reorder columns
    df = df[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']]
    
    # Save standalone 10-year Excel file
    df.to_excel(SAVE_EXCEL_10Y, index=False)
    print(f"[Success] Saved 10-year KOSPI 200 Excel to: {SAVE_EXCEL_10Y}")
    
    # Also update 선물가격업데이트.xlsx Columns A to F
    if os.path.exists(FUTURES_EXCEL):
        print(f"Updating Columns A~F in {FUTURES_EXCEL}...")
        wb = openpyxl.load_workbook(FUTURES_EXCEL)
        sheet = wb.active
        
        # Write 10-year data starting from row 2
        for idx, row in df.iterrows():
            r = idx + 2
            sheet.cell(row=r, column=1, value=row['Date'].strftime("%Y-%m-%d"))
            sheet.cell(row=r, column=2, value=float(row['Open']))
            sheet.cell(row=r, column=3, value=float(row['High']))
            sheet.cell(row=r, column=4, value=float(row['Low']))
            sheet.cell(row=r, column=5, value=float(row['Close']))
            sheet.cell(row=r, column=6, value=int(row['Volume']))
            
        wb.save(FUTURES_EXCEL)
        wb.close()
        print(f"[Success] Synchronized 10-year KOSPI 200 data into {FUTURES_EXCEL}")

if __name__ == "__main__":
    fetch_kospi200_10years()
