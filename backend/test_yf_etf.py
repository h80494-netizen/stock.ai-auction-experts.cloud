import yfinance as yf

for ticker in ['SPY', 'XLK']:
    print(f"--- {ticker} ---")
    t = yf.Ticker(ticker)
    info = t.info
    print("Description:", info.get('longBusinessSummary', '')[:200])
    print("Holdings keys:", t.get_funds_data().top_holdings.index.tolist()[:5] if t.get_funds_data() and t.get_funds_data().top_holdings is not None else "No holdings")
    print("Weights:", t.get_funds_data().top_holdings.tolist()[:5] if t.get_funds_data() and t.get_funds_data().top_holdings is not None else "No weights")
