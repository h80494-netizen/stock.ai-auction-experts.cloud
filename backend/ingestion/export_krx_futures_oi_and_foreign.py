import os
import time
import datetime
import requests
import pandas as pd
import openpyxl
from bs4 import BeautifulSoup

SAVE_EXCEL_PATH = r"C:\Users\llll\Documents\두인경매\주식투자\data\KOSPI200선물_미결제약정_외인순매수_통합_20130813이후.xlsx"
SAVE_EXCEL_OI = r"C:\Users\llll\Documents\두인경매\주식투자\data\선물미결제_외인순매수_20130813이후_일별.xlsx"
FUTURES_EXCEL_PATH = r"C:\Users\llll\Documents\두인경매\주식투자\data\KOSPI200_선물최근월물_20130813이후_일별.xlsx"
ORIGINAL_EXCEL_PATH = r"C:\Users\llll\Documents\두인경매\주식투자\data\선물가격업데이트.xlsx"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'}

def fetch_krx_futures_oi_bulk(start_date, end_date):
    """
    Attempts to fetch daily KOSPI 200 Futures Open Interest from KRX or Naver Finance archives.
    """
    print("Fetching KRX KOSPI 200 Futures Open Interest...")
    # KRX getJsonData endpoint via requests session
    session = requests.Session()
    session.headers.update(HEADERS)
    
    # Pre-populate dates
    dates = pd.date_range(start=start_date, end=end_date, freq='B')
    records = []
    
    for dt in dates:
        dt_str = dt.strftime("%Y-%m-%d")
        dt_krx = dt.strftime("%Y%m%d")
        
        oi_val = None
        # Attempt KRX OTP fetch for bld dbms/MDC/STAT/standard/MDCSTAT12501
        try:
            gen_url = "http://data.krx.co.kr/comm/fileHtml/generate.jsp"
            data_url = "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd"
            payload = {
                "bld": "dbms/MDC/STAT/standard/MDCSTAT12501",
                "trdDd": dt_krx,
                "prodId": "KRDRVFUK2I"
            }
            otp = session.post(gen_url, data=payload, timeout=3).text.strip()
            res = session.post(data_url, data={"code": otp}, timeout=3)
            if res.status_code == 200:
                items = res.json().get("output", [])
                if items:
                    # Filter front month (first item or item with minimum maturity)
                    front_item = items[0]
                    oi_raw = front_item.get("OPEN_INT_QTY", front_item.get("OPNINT_QTY", None))
                    if oi_raw:
                        oi_val = int(str(oi_raw).replace(',', ''))
        except Exception:
            pass

        records.append({'Date': dt_str, 'Futures_Open_Interest(계약)': oi_val})
        
    return pd.DataFrame(records)

def fetch_naver_investor_foreign_exact(max_pages=450):
    """
    Fetches daily KOSPI Foreign Net Buy Amounts from Naver Finance in exact 억원 unit.
    NO DIVIDE BY 100! Native table value is exact 억원 (-16,726 = -16,726 억원).
    """
    print(f"Fetching KOSPI Foreign net purchases from Naver Finance in EXACT 억원 ({max_pages} pages)...")
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
                            
                        # Native unit is EXACT 억원 (-16,726 = -16,726 억원)
                        foreign_val = float(cols[2].text.strip().replace(',', ''))
                        records.append({
                            'Date': dt.strftime("%Y-%m-%d"),
                            'KOSPI_Foreign_Net_Buy_Amount(억)': int(foreign_val)
                        })
                        
            if page % 50 == 0:
                print(f"Fetched investor trend page {page}/{max_pages}...")
                
        except Exception as e:
            print(f"[Warning] Error page {page}: {e}")
            time.sleep(0.2)
            
    df = pd.DataFrame(records)
    if not df.empty:
        df = df.drop_duplicates(subset=['Date']).sort_values('Date').reset_index(drop=True)
    return df

def process_and_export():
    start_date = datetime.date(2013, 8, 13)
    end_date = datetime.date.today()
    
    # 1. Fetch exact KOSPI Foreign Net Buy (억원)
    df_foreign = fetch_naver_investor_foreign_exact(max_pages=450)
    
    # 2. Fetch KRX Futures Open Interest
    df_oi = fetch_krx_futures_oi_bulk(start_date, end_date)
    
    # 3. Load KOSPI 200 Futures OHLCV
    if os.path.exists(FUTURES_EXCEL_PATH):
        df_futures = pd.read_excel(FUTURES_EXCEL_PATH)
        df_futures['Date'] = pd.to_datetime(df_futures['Date']).dt.strftime('%Y-%m-%d')
    else:
        df_futures = pd.DataFrame(columns=['Date', 'Open', 'High', 'Low', 'Close', 'Volume'])

    # Merge Futures OHLCV + OI + Foreign Net Buy
    m1 = pd.merge(df_futures, df_oi, on='Date', how='left')
    final_df = pd.merge(m1, df_foreign, on='Date', how='left')
    
    cols = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'Futures_Open_Interest(계약)', 'KOSPI_Foreign_Net_Buy_Amount(억)']
    existing_cols = [c for c in cols if c in final_df.columns]
    final_df = final_df[existing_cols].sort_values('Date').reset_index(drop=True)
    
    # Save to Excel files
    final_df.to_excel(SAVE_EXCEL_PATH, index=False)
    final_df.to_excel(SAVE_EXCEL_OI, index=False)
    print(f"[Success] Saved integrated Excel files to:\n - {SAVE_EXCEL_PATH}\n - {SAVE_EXCEL_OI}")

if __name__ == "__main__":
    process_and_export()
