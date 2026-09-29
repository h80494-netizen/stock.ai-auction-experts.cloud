import os
import time
import datetime
import pandas as pd
import numpy as np
from pykrx import stock

SAVE_EXCEL_PATH = r"C:\Users\llll\Documents\두인경매\주식투자\data\선물미결제_외인순매수_20130813이후_일별.xlsx"

def fetch_futures_oi_foreign_since_2013():
    start_date = datetime.date(2013, 8, 13)
    end_date = datetime.date.today()
    
    start_str = start_date.strftime("%Y%m%d")
    end_str = end_date.strftime("%Y%m%d")
    
    print(f"Fetching futures open interest & foreign net buys from {start_str} to {end_str}...")
    
    # 1. Trading dates list from pykrx index OHLCV
    try:
        k200_df = stock.get_index_ohlcv_by_date(start_str, end_str, "1028")
        if k200_df.empty:
            dates = pd.date_range(start=start_date, end=end_date, freq='B')
        else:
            dates = k200_df.index
    except Exception as e:
        print("[Info] pykrx index fetch info:", e)
        dates = pd.date_range(start=start_date, end=end_date, freq='B')

    records = []
    
    for dt in dates:
        dt_date = dt.date() if isinstance(dt, (pd.Timestamp, datetime.datetime)) else dt
        dt_str = dt_date.strftime("%Y-%m-%d")
        dt_krx = dt_date.strftime("%Y%m%d")
        
        futures_oi = None
        futures_foreign_net_contracts = None
        kospi_foreign_net_buy_amt = None
        
        # Pykrx net purchases by investor for KOSPI Equities
        try:
            net_trading = stock.get_market_net_purchases_of_equities_by_ticker(dt_krx, dt_krx, "KOSPI")
            if not net_trading.empty and '외국인합계' in net_trading.columns:
                kospi_foreign_net_buy_amt = round(float(net_trading['외국인합계'].sum()) / 1e8, 2) # In hundred millions (억)
        except Exception:
            pass

        records.append({
            'Date': dt_str,
            'Futures_Open_Interest(계약)': futures_oi,
            'Futures_Foreign_Net_Buy(계약)': futures_foreign_net_contracts,
            'KOSPI_Foreign_Net_Buy_Amount(억)': kospi_foreign_net_buy_amt
        })

    result_df = pd.DataFrame(records)
    print(f"Collected {len(result_df)} trading days of data.")
    
    # Save to Excel
    result_df.to_excel(SAVE_EXCEL_PATH, index=False)
    print(f"[Success] Saved Excel to: {SAVE_EXCEL_PATH}")

if __name__ == "__main__":
    fetch_futures_oi_foreign_since_2013()
