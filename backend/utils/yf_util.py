import yfinance as yf

def get_yf_ticker(symbol: str):
    return yf.Ticker(symbol)

def get_yf_tickers(symbols: str):
    return yf.Tickers(symbols)
