import os
import re
import glob
import datetime
import requests
import pandas as pd
import numpy as np
from bs4 import BeautifulSoup

DATA_DIR = r"C:\Users\llll\Documents\두인경매\주식투자\data"
OUTPUT_EXCEL_PATH = os.path.join(DATA_DIR, "market_supply_demand_2013_2026.xlsx")

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

def load_baseline_excel_data():
    """
    Loads baseline supply/demand time-series data from archive excel files starting 2013-08-13.
    """
    target_files = [
        os.path.join(DATA_DIR, "선물가격업데이트_260917.xlsx"),
        os.path.join(DATA_DIR, "선물가격업데이트.xlsx"),
        os.path.join(DATA_DIR, "KOSPI200선물_미결제약정_외인순매수_통합_20130813이후.xlsx")
    ]
    
    excel_path = None
    for f in target_files:
        if os.path.exists(f):
            excel_path = f
            break
            
    if not excel_path:
        print("[Warning] Baseline Excel file not found. Creating empty container.")
        return pd.DataFrame()

    print(f"Loading baseline supply-demand archive from: {os.path.basename(excel_path)}")
    try:
        raw_df = pd.read_excel(excel_path)
    except Exception as e:
        print(f"[Error] Failed to read {excel_path}: {e}")
        return pd.DataFrame()

    cols = list(raw_df.columns)
    
    # Map key columns based on position or fuzzy name
    date_col = cols[0]
    
    df = pd.DataFrame()
    df['Date'] = pd.to_datetime(raw_df[date_col], errors='coerce').dt.strftime('%Y-%m-%d')
    df = df.dropna(subset=['Date']).copy()

    # KOSPI Foreign Spot (억원)
    if len(cols) > 15:
        df['KOSPI_Foreign_Net_Buy_Amount(억원)'] = pd.to_numeric(raw_df.iloc[:, 15], errors='coerce')
    else:
        df['KOSPI_Foreign_Net_Buy_Amount(억원)'] = np.nan

    # KOSPI Personal Spot (억원)
    if len(cols) > 23:
        df['KOSPI_Personal_Net_Buy_Amount(억원)'] = pd.to_numeric(raw_df.iloc[:, 23], errors='coerce')
    else:
        df['KOSPI_Personal_Net_Buy_Amount(억원)'] = np.nan

    # KOSPI Institution Spot (억원) - Derived
    df['KOSPI_Institution_Net_Buy_Amount(억원)'] = -(
        df['KOSPI_Foreign_Net_Buy_Amount(억원)'].fillna(0) + df['KOSPI_Personal_Net_Buy_Amount(억원)'].fillna(0)
    )

    # K200 Futures Foreign Net (계약)
    if len(cols) > 20:
        df['K200_Futures_Foreign_Net_Contracts(계약)'] = pd.to_numeric(raw_df.iloc[:, 20], errors='coerce')
    else:
        df['K200_Futures_Foreign_Net_Contracts(계약)'] = np.nan

    df['K200_Futures_Personal_Net_Contracts(계약)'] = np.nan
    df['K200_Futures_Institution_Net_Contracts(계약)'] = np.nan

    # Options Net (계약)
    if len(cols) > 37:
        df['Call_Option_Foreign_Net_Contracts(계약)'] = pd.to_numeric(raw_df.iloc[:, 34], errors='coerce')
        df['Call_Option_Personal_Net_Contracts(계약)'] = pd.to_numeric(raw_df.iloc[:, 35], errors='coerce')
        df['Put_Option_Foreign_Net_Contracts(계약)'] = pd.to_numeric(raw_df.iloc[:, 36], errors='coerce')
        df['Put_Option_Personal_Net_Contracts(계약)'] = pd.to_numeric(raw_df.iloc[:, 37], errors='coerce')
    else:
        df['Call_Option_Foreign_Net_Contracts(계약)'] = np.nan
        df['Call_Option_Personal_Net_Contracts(계약)'] = np.nan
        df['Put_Option_Foreign_Net_Contracts(계약)'] = np.nan
        df['Put_Option_Personal_Net_Contracts(계약)'] = np.nan

    df['Call_Option_Institution_Net_Contracts(계약)'] = -(
        df['Call_Option_Foreign_Net_Contracts(계약)'].fillna(0) + df['Call_Option_Personal_Net_Contracts(계약)'].fillna(0)
    )
    df['Put_Option_Institution_Net_Contracts(계약)'] = -(
        df['Put_Option_Foreign_Net_Contracts(계약)'].fillna(0) + df['Put_Option_Personal_Net_Contracts(계약)'].fillna(0)
    )

    cutoff = '2013-08-13'
    df = df[df['Date'] >= cutoff].sort_values('Date').reset_index(drop=True)
    return df

def fetch_recent_naver_investor_trend(max_pages=20):
    """
    Fetches latest daily KOSPI Foreign, Personal, Institution Spot Net Purchases (억원) from Naver Finance.
    """
    print(f"Fetching latest Naver Finance investor deal trend ({max_pages} pages)...")
    records = []
    session = requests.Session()
    session.headers.update(HEADERS)
    
    cutoff_date = datetime.date(2013, 8, 13)
    
    for page in range(1, max_pages + 1):
        url = f"https://finance.naver.com/sise/investorDealTrendDay.naver?bizdate=20260923&sosok=&page={page}"
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
                            dt_val = "20" + date_str if len(date_str) == 8 else date_str
                            dt = datetime.datetime.strptime(dt_val, "%Y.%m.%d").date()
                        except Exception:
                            continue
                            
                        if dt < cutoff_date:
                            continue
                            
                        # Naver Table Column 1: 개인, Column 2: 외국인, Column 3: 기관 (단위: 억원)
                        personal_val = float(cols[1].text.strip().replace(',', ''))
                        foreign_val = float(cols[2].text.strip().replace(',', ''))
                        inst_val = float(cols[3].text.strip().replace(',', ''))
                        
                        records.append({
                            'Date': dt.strftime("%Y-%m-%d"),
                            'KOSPI_Foreign_Net_Buy_Amount(억원)': int(foreign_val),
                            'KOSPI_Personal_Net_Buy_Amount(억원)': int(personal_val),
                            'KOSPI_Institution_Net_Buy_Amount(억원)': int(inst_val)
                        })
        except Exception as e:
            print(f"[Warning] Naver page {page} fetch failed: {e}")
            
    df = pd.DataFrame(records)
    if not df.empty:
        df = df.drop_duplicates(subset=['Date']).sort_values('Date').reset_index(drop=True)
    return df

def generate_market_supply_demand_excel():
    print("================================================================")
    print("Exporting Market Supply & Demand Time Series (2013-08-13 ~ 2026-09-23)")
    print("================================================================")

    # 1. Load Baseline Archive Data
    df_base = load_baseline_excel_data()
    print(f"Loaded {len(df_base)} baseline daily records.")

    # 2. Fetch Recent Naver Investor Data
    df_recent = fetch_recent_naver_investor_trend(max_pages=20)
    print(f"Fetched {len(df_recent)} recent daily records.")

    # 3. Merge Baseline & Recent Data
    if not df_recent.empty and not df_base.empty:
        merged = pd.merge(df_base, df_recent, on='Date', how='outer', suffixes=('_base', '_recent'))
        
        for col in ['KOSPI_Foreign_Net_Buy_Amount(억원)', 'KOSPI_Personal_Net_Buy_Amount(억원)', 'KOSPI_Institution_Net_Buy_Amount(억원)']:
            if f"{col}_recent" in merged.columns:
                merged[col] = merged[f"{col}_recent"].combine_first(merged[f"{col}_base"])
            else:
                merged[col] = merged[f"{col}_base"]
                
        cols_to_keep = [
            'Date',
            'KOSPI_Foreign_Net_Buy_Amount(억원)',
            'KOSPI_Personal_Net_Buy_Amount(억원)',
            'KOSPI_Institution_Net_Buy_Amount(억원)',
            'K200_Futures_Foreign_Net_Contracts(계약)',
            'K200_Futures_Personal_Net_Contracts(계약)',
            'K200_Futures_Institution_Net_Contracts(계약)',
            'Call_Option_Foreign_Net_Contracts(계약)',
            'Call_Option_Personal_Net_Contracts(계약)',
            'Call_Option_Institution_Net_Contracts(계약)',
            'Put_Option_Foreign_Net_Contracts(계약)',
            'Put_Option_Personal_Net_Contracts(계약)',
            'Put_Option_Institution_Net_Contracts(계약)'
        ]
        
        final_df = merged[[c for c in cols_to_keep if c in merged.columns]].sort_values('Date').reset_index(drop=True)
    elif not df_base.empty:
        final_df = df_base
    else:
        final_df = df_recent

    final_df = final_df[final_df['Date'] >= '2013-08-13'].reset_index(drop=True)

    # 4. Export to Excel
    os.makedirs(os.path.dirname(OUTPUT_EXCEL_PATH), exist_ok=True)
    final_df.to_excel(OUTPUT_EXCEL_PATH, index=False)
    print(f"\n[Success] Successfully saved integrated supply & demand dataset ({len(final_df)} rows) to:\n - {OUTPUT_EXCEL_PATH}")

if __name__ == "__main__":
    generate_market_supply_demand_excel()
