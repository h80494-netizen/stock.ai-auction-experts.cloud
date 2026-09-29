import os
import time
import datetime
import pandas as pd
import numpy as np
from pykrx import stock

SAVE_EXCEL_PATH = r"C:\Users\llll\Documents\두인경매\주식투자\data\시장지표_수급_20130813이후_일별.xlsx"

def fetch_market_indicators_since_2013():
    start_date = datetime.date(2013, 8, 13)
    end_date = datetime.date.today()
    
    start_str = start_date.strftime("%Y%m%d")
    end_str = end_date.strftime("%Y%m%d")
    
    print(f"Fetching market supply/demand indicators from {start_str} to {end_str}...")
    
    # 1. Trading days list from pykrx index OHLCV
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
        
        # Default blanks/values
        foreign_buy = None
        personal_buy = None
        futures_foreign_buy = None
        open_interest = None
        arbitrage_buy = None
        call_theo = 1.80
        put_theo = 3.14
        new_high = None
        new_low = None
        up_count = None
        down_count = None
        
        # Pykrx net purchases by investor for KOSPI
        try:
            net_trading = stock.get_market_net_purchases_of_equities_by_ticker(dt_krx, dt_krx, "KOSPI")
            if not net_trading.empty:
                if '외국인합계' in net_trading.columns:
                    foreign_buy = round(float(net_trading['외국인합계'].sum()) / 1e8, 2)
                if '개인' in net_trading.columns:
                    personal_buy = round(float(net_trading['개인'].sum()) / 1e8, 2)
        except Exception:
            pass

        records.append({
            'Date': dt_str,
            'KOSPI_Foreign_Net_Buy(억)': foreign_buy,
            'KOSPI_Personal_Net_Buy(억)': personal_buy,
            'Call_Option_Theo_Price': call_theo,
            'Put_Option_Theo_Price': put_theo,
            'K200_Futures_Foreign_Net_Buy': futures_foreign_buy,
            'Open_Interest': open_interest,
            'Arbitrage_Program_Buy(억)': arbitrage_buy,
            'New_High_Count': new_high,
            'New_Low_Count': new_low,
            'Up_Count': up_count,
            'Down_Count': down_count
        })

    result_df = pd.DataFrame(records)
    print(f"Collected {len(result_df)} trading days of market indicators.")
    
    # Save to Excel
    result_df.to_excel(SAVE_EXCEL_PATH, index=False)
    print(f"[Success] Saved market indicators Excel to: {SAVE_EXCEL_PATH}")

if __name__ == "__main__":
    fetch_market_indicators_since_2013()
