import sqlite3
import pandas as pd
import yfinance as yf
from datetime import datetime

ETF_TARGETS = {
    "EWY": "한국 (South Korea)",
    "EWJ": "일본 (Japan)"
}

def test_yf():
    for ticker in ETF_TARGETS.keys():
        print(f"Fetching {ticker}")
        ticker_obj = yf.Ticker(ticker)
        df = ticker_obj.history(period="1mo")
        print(df.tail(2))

test_yf()
