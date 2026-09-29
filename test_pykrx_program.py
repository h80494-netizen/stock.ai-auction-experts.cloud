from pykrx import stock
import datetime

try:
    # 2024년 1월 2일 ~ 2024년 1월 10일
    df = stock.get_market_program_by_date("20240102", "20240110", "KOSPI")
    print("get_market_program_by_date columns:", df.columns)
    print(df.head())
except Exception as e:
    print("get_market_program_by_date error:", e)

try:
    # stock.get_program_trading_by_date
    methods = [m for m in dir(stock) if "program" in m]
    print("Program related stock methods:", methods)
except Exception as e:
    print(e)
