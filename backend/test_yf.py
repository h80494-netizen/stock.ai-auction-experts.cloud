import sys
sys.path.append("c:/Users/llll/Documents/두인경매/주식투자/backend")
from utils.yf_util import get_yf_ticker

ticker = "AAPL"
t = get_yf_ticker(ticker)
print(f"Info keys: {list(t.info.keys())}")
print(f"Price: {t.info.get('regularMarketPrice')}")
