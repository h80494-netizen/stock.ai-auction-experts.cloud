import os
import datetime
import pandas as pd
import yfinance as yf

SAVE_EXCEL_PATH = r"C:\Users\llll\Documents\두인경매\주식투자\data\원달러환율_20130813이후_일별.xlsx"

def fetch_usdkrw_since_2013():
    """
    Fetches USD/KRW daily OHLCV from 2013-08-13 to present.
    """
    start_date = datetime.date(2013, 8, 13)
    end_date = datetime.date.today()
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = (end_date + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    
    print(f"Fetching USD/KRW exchange rate data from {start_str} to {end_str}...")
    
    # Fetch from yfinance (USDKRW=X)
    df = yf.Ticker("USDKRW=X").history(start=start_str, end=end_str)
    
    if df.empty:
        raise ValueError("Failed to fetch USDKRW=X data.")
        
    df.index = pd.to_datetime(df.index).date
    df = df.reset_index()
    df.rename(columns={'index': 'Date'}, inplace=True)
    
    # Filter strictly >= 2013-08-13
    df = df[df['Date'] >= start_date].copy()
    
    # Select and format columns
    df['Date'] = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d')
    df['Open'] = df['Open'].round(2)
    df['High'] = df['High'].round(2)
    df['Low'] = df['Low'].round(2)
    df['Close'] = df['Close'].round(2)
    df['Volume'] = df['Volume'].astype(int)
    
    result_df = df[['Date', 'Open', 'High', 'Low', 'Close', 'Volume']].sort_values('Date').reset_index(drop=True)
    
    print(f"Successfully collected {len(result_df)} trading days of USD/KRW exchange rates.")
    print(f"Date range: {result_df['Date'].min()} ~ {result_df['Date'].max()}")
    
    # Save to Excel
    result_df.to_excel(SAVE_EXCEL_PATH, index=False)
    print(f"[Success] Saved USD/KRW Excel to: {SAVE_EXCEL_PATH}")

if __name__ == "__main__":
    fetch_usdkrw_since_2013()
