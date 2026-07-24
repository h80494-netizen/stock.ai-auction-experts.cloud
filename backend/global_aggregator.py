import feedparser
import time
from kis_instance import kis_client

_global_cache = None
_last_fetch = 0

def fetch_global_indices():
    """
    Fetch global indices and exchange rates using yfinance.
    """
    tickers = {
        "S&P 500": "^GSPC",
        "NASDAQ": "^IXIC",
        "Nikkei 225": "^N225",
        "Shanghai": "000001.SS",
        "KOSPI": "^KS11",
        "KOSDAQ": "^KQ11",
        "USD/KRW": "KRW=X",
        "JPY/KRW": "JPYKRW=X",
        "CNY/KRW": "CNYKRW=X"
    }
    
    results = []
    try:
        import yfinance as yf
        yft = yf.Tickers(" ".join(tickers.values()))
        for name, t in tickers.items():
            try:
                info = yft.tickers[t].info if hasattr(yft, 'tickers') and t in yft.tickers else yf.Ticker(t).info
                price = info.get("regularMarketPrice") or info.get("previousClose") or info.get("currentPrice") or 0
                change_pct = info.get("regularMarketChangePercent") or 0
                change = info.get("regularMarketChange") or 0
                
                # JPY/KRW is typically quoted per 100 JPY in Korea, but yfinance gives per 1 JPY. 
                # Let's adjust JPY to per 100 JPY for familiarity if it's small, actually let's just keep the raw rate and format in frontend or here.
                if name == "JPY/KRW" and price < 50:
                    price = price * 100
                    change = change * 100
                    
                results.append({
                    "name": name,
                    "ticker": t,
                    "price": round(price, 2),
                    "change": round(change, 2),
                    "changePct": round(change_pct, 2)
                })
            except Exception as e:
                print(f"Failed to fetch index/rate {name}: {e}")
                results.append({"name": name, "ticker": t, "price": 0, "change": 0, "changePct": 0})
    except Exception as e:
        print(f"Error fetching global indices: {e}")
        
    return results

def get_major_global_stocks():
    """
    Fetch major global stocks using KIS API.
    """
    stocks = {
        "AAPL": {"excd": "NAS", "name": "Apple (US)"},
        "MSFT": {"excd": "NAS", "name": "Microsoft (US)"},
        "NVDA": {"excd": "NAS", "name": "NVIDIA (US)"},
        "7203": {"excd": "TSE", "name": "Toyota (JP)"},
        "9984": {"excd": "TSE", "name": "SoftBank (JP)"},
        "0700": {"excd": "HKS", "name": "Tencent (HK)"},
        "BABA": {"excd": "NYS", "name": "Alibaba (US/CN)"},
    }
    
    results = []
    for tk, info in stocks.items():
        try:
            if kis_client:
                data = kis_client.get_overseas_price(info["excd"], tk)
                price_str = data.get("last", "0")
                sign = data.get("sign", "3") # 1,2 up, 3 equal, 4,5 down
                change_str = data.get("diff", "0")
                change_pct_str = data.get("rate", "0")
                
                price = float(price_str) if price_str else 0
                change = float(change_str) if change_str else 0
                if sign in ["4", "5"]:
                    change = -change
                change_pct = float(change_pct_str) if change_pct_str else 0
                if sign in ["4", "5"]:
                    change_pct = -change_pct
                
                results.append({
                    "ticker": tk,
                    "name": info["name"],
                    "price": round(price, 2),
                    "change": round(change, 2),
                    "changePct": round(change_pct, 2),
                    "market_cap": 0, # KIS overseas might not return MCAP in price API
                    "categories": ["Global Major"]
                })
            else:
                results.append({"ticker": tk, "name": info["name"], "price": 0, "change": 0, "changePct": 0, "market_cap": 0, "categories": ["Global Major"]})
        except Exception as e:
            print(f"Failed to process {tk}: {e}")
            results.append({"ticker": tk, "name": info["name"], "price": 0, "change": 0, "changePct": 0, "market_cap": 0, "categories": ["Global Major"]})
    return results

import requests

def get_aggregated_news():
    """
    Fetch news from RSS feeds for US, KR, JP, CN and disclosures.
    """
    feeds = [
        {"source": "Yahoo Finance (US)", "url": "https://finance.yahoo.com/news/rss"},
        {"source": "Reuters (Global)", "url": "https://www.reutersagency.com/feed/?best-topics=business-finance&type=best"},
        {"source": "MK News (KR/공시)", "url": "https://www.mk.co.kr/rss/30100041/"}, # 매일경제 증권/공시 RSS
        {"source": "Yahoo Japan (JP)", "url": "https://news.yahoo.co.jp/rss/categories/business.xml"},
        {"source": "SCMP (CN)", "url": "https://www.scmp.com/rss/318206/feed"}
    ]
    
    news_items = []
    for feed in feeds:
        try:
            res = requests.get(feed["url"], timeout=3)
            if res.status_code == 200:
                d = feedparser.parse(res.text)
                for entry in d.entries[:4]: # Top 4 from each
                    news_items.append({
                        "title": entry.title,
                        "source": feed["source"],
                        "link": entry.link,
                        "published": entry.get("published", entry.get("updated", ""))
                    })
        except Exception as e:
            print(f"Failed to fetch feed {feed['source']}: {e}")
            
    # Add dummies if fetching fails
    if len(news_items) < 5:
        news_items.extend([
            {"title": "China's economic recovery shows mixed signals", "source": "Baidu Finance", "link": "#", "published": "Just now"},
            {"title": "BOJ considers rate hike timing", "source": "Yahoo Japan", "link": "#", "published": "10 mins ago"}
        ])
    
    # Shuffle to mix global news
    import random
    random.shuffle(news_items)
    return news_items

def get_global_data():
    global _global_cache, _last_fetch
    
    if _global_cache is not None and (time.time() - _last_fetch) < 600: # 10 min cache
        return _global_cache
        
    indices = fetch_global_indices()
    major_stocks = get_major_global_stocks()
    kospi_top50 = get_market_top50("KR")
    
    # Merge all
    all_stocks = major_stocks + kospi_top50
    
    _global_cache = {
        "indices": indices,
        "stocks": all_stocks
    }
    _last_fetch = time.time()
    
    return _global_cache

def get_market_top50(market: str):
    """
    Returns top 50 (or available top) stocks for the given market.
    """
    market = market.upper()
    if market == "KR":
        from scraper import get_kospi_100
        data = get_kospi_100()
        for d in data:
            if "KR Top 50" not in d.get("categories", []):
                d.setdefault("categories", []).append("KR Top 50")
        return data[:50]
        
    if market == "KOSDAQ":
        from scraper import get_kosdaq_100
        data = get_kosdaq_100()
        for d in data:
            if "KOSDAQ Top 50" not in d.get("categories", []):
                d.setdefault("categories", []).append("KOSDAQ Top 50")
        return data[:50]
        
    tickers_map = {
        "US": ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "BRK-B", "TSLA", "LLY", "V", "JPM", "UNH", "XOM", "MA", "JNJ", "PG", "HD", "AVGO", "CVX", "MRK", "ABBV", "COST", "PEP", "ADBE", "KO", "CSCO", "CRM", "ACN", "MCD", "TMO", "LIN", "ABT", "AMD", "NFLX", "WFC", "INTC", "TXN", "PM", "CMCSA", "DHR", "VZ", "NEE", "INTU", "COP", "RTX", "BA", "IBM", "SPGI", "AMGN", "HON"],
        "JP": ["7203.T", "6758.T", "8306.T", "9984.T", "6861.T", "9432.T", "8035.T", "4063.T", "6098.T", "8001.T", "7974.T", "6902.T", "8316.T", "8031.T", "8058.T", "6501.T", "7267.T", "9433.T", "4519.T", "4568.T", "3382.T", "6981.T", "8053.T", "7751.T", "8766.T", "4502.T", "9022.T", "6954.T", "6594.T", "8801.T"],
        "CN": ["0700.HK", "BABA", "0939.HK", "1398.HK", "0941.HK", "3690.HK", "1211.HK", "3988.HK", "0883.HK", "0386.HK", "0005.HK", "0857.HK", "2318.HK", "1810.HK", "0881.HK", "2020.HK", "0175.HK", "1928.HK", "0267.HK", "0016.HK", "1109.HK", "1093.HK", "0688.HK", "2313.HK", "1044.HK"]
    }
    
    cat_map = {"US": "US Top 50", "JP": "JP Top 50", "CN": "CN Top 50"}
    target_tickers = tickers_map.get(market, [])
    if not target_tickers:
        return []
        
    import yfinance as yf
    try:
        yft = yf.Tickers(" ".join(target_tickers))
        results = []
        for t in target_tickers:
            try:
                info = yft.tickers[t].info if hasattr(yft, 'tickers') and t in yft.tickers else yf.Ticker(t).info
                price = info.get("currentPrice", info.get("regularMarketPrice", 0))
                change_pct = info.get("regularMarketChangePercent", 0)
                name = info.get("shortName", t)
                
                results.append({
                    "ticker": t,
                    "name": name,
                    "price": price,
                    "change": round((price * change_pct / 100) if price and change_pct else 0, 2),
                    "changePct": round(change_pct, 2) if change_pct else 0,
                    "market_cap": info.get("marketCap", 0),
                    "categories": [cat_map[market]]
                })
            except:
                pass
        return results
    except Exception as e:
        print(f"Failed to fetch market {market} top 50: {e}")
        return []

if __name__ == "__main__":
    print(fetch_global_indices())
    print(get_major_global_stocks())
    print(get_aggregated_news())
