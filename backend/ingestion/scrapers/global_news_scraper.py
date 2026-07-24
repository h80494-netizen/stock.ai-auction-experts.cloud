import yfinance as yf
import time
import concurrent.futures
from datetime import datetime

# Keywords for scoring
GOOD_KEYWORDS = ["surge", "jump", "soar", "beat", "upgrade", "buy", "up", "record", "growth", "profit", "dividend", "상승", "급등", "흑자", "성장", "호조", "상회"]
BAD_KEYWORDS = ["drop", "fall", "plunge", "miss", "downgrade", "sell", "down", "loss", "decline", "cut", "하락", "급락", "적자", "감소", "부진", "하회"]

MARKETS = {
    'KR': [('삼성전자', '005930.KS'), ('SK하이닉스', '000660.KS'), ('현대차', '005380.KS'), ('기아', '000270.KS'), ('LG에너지솔루션', '373220.KS'), ('NAVER', '035420.KS'), ('카카오', '035720.KS'), ('셀트리온', '068270.KS'), ('포스코홀딩스', '005490.KS'), ('KB금융', '105560.KS')],
    'US': [('NVIDIA', 'NVDA'), ('Apple', 'AAPL'), ('Microsoft', 'MSFT'), ('Tesla', 'TSLA'), ('Amazon', 'AMZN'), ('Alphabet', 'GOOGL'), ('Meta', 'META'), ('Broadcom', 'AVGO'), ('AMD', 'AMD'), ('Eli Lilly', 'LLY')],
    'JP': [('Toyota', '7203.T'), ('Sony', '6758.T'), ('Keyence', '6861.T'), ('Mitsubishi', '8058.T'), ('SoftBank', '9984.T'), ('Nintendo', '7974.T'), ('Hitachi', '6501.T'), ('Honda', '7267.T'), ('Fast Retailing', '9983.T'), ('Shin-Etsu', '4063.T')],
    'CN': [('Tencent', '0700.HK'), ('Alibaba', 'BABA'), ('BYD', '1211.HK'), ('Baidu', 'BIDU'), ('Meituan', '3690.HK'), ('JD.com', 'JD'), ('NetEase', 'NTES'), ('Ping An', '2318.HK'), ('Bank of China', '3988.HK'), ('PetroChina', '0857.HK')]
}

def analyze_news(title, publisher, timestamp):
    title_lower = title.lower()
    score = 30 # base score
    
    good_matches = sum(1 for w in GOOD_KEYWORDS if w in title_lower)
    bad_matches = sum(1 for w in BAD_KEYWORDS if w in title_lower)
    
    score += good_matches * 15
    score += bad_matches * 15
    
    # Check if real-time (within last 24 hours)
    now = int(time.time())
    is_realtime = False
    
    if isinstance(timestamp, int) and timestamp > 0:
        if now - timestamp < 86400:
            score += 20
            is_realtime = True
            
    # Normalize score
    score = min(100, max(10, score))
    
    return {
        "title": title,
        "source": publisher.upper() if publisher else "UNKNOWN",
        "domain": publisher or "unknown",
        "isRealTime": is_realtime,
        "importance_score": score,
        "factors": [
            {"category": "Keyword Match", "score": good_matches * 15 + bad_matches * 15},
            {"category": "Recency", "score": 20 if is_realtime else 0}
        ]
    }

def fetch_stock_news(name, ticker, market_code):
    try:
        t = yf.Ticker(ticker)
        news = t.news
        
        top_news = []
        total_score = 0
        news_count = len(news)
        
        if news_count == 0:
            return None
            
        for item in news[:5]: # Take top 5 news
            # Handle new yfinance format where news details are inside 'content'
            n = item.get('content', item) if isinstance(item, dict) else item
            
            # Extract publisher
            publisher = n.get('publisher')
            if not publisher and isinstance(n.get('provider'), dict):
                publisher = n['provider'].get('displayName')
            if not publisher:
                publisher = 'Yahoo Finance'
                
            title = n.get('title', '')
            
            # Extract link
            link = n.get('link')
            if not link and isinstance(n.get('clickThroughUrl'), dict):
                link = n['clickThroughUrl'].get('url')
            if not link and isinstance(n.get('canonicalUrl'), dict):
                link = n['canonicalUrl'].get('url')
            if not link:
                link = ''
                
            # Extract timestamp
            timestamp = n.get('providerPublishTime', 0)
            if not timestamp and n.get('pubDate'):
                try:
                    pub_str = n['pubDate'].replace('Z', '+00:00')
                    dt = datetime.fromisoformat(pub_str)
                    timestamp = int(dt.timestamp())
                except:
                    pass
            
            analyzed = analyze_news(title, publisher, timestamp)
            analyzed["id"] = f"{ticker}_{timestamp}_{len(top_news)}"
            analyzed["summary"] = title
            analyzed["url"] = link
            
            if timestamp > 0:
                analyzed["date"] = datetime.fromtimestamp(timestamp).isoformat()
            else:
                analyzed["date"] = datetime.now().isoformat()
                
            top_news.append(analyzed)
            total_score += analyzed["importance_score"]
            
        avg_score = total_score / len(top_news) if top_news else 0
        
        return {
            "ticker": ticker,
            "name": name,
            "market": market_code,
            "total_score": round(avg_score, 1),
            "news_count": news_count,
            "top_news": top_news
        }
    except Exception as e:
        print(f"Error fetching news for {ticker}: {e}")
        return None

def get_global_news_ranking():
    results = []
    
    # We will fetch asynchronously using ThreadPoolExecutor
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = []
        for market, stocks in MARKETS.items():
            for name, ticker in stocks:
                futures.append(executor.submit(fetch_stock_news, name, ticker, market))
                
        for future in concurrent.futures.as_completed(futures):
            res = future.result()
            if res:
                results.append(res)
                
    # Sort by total_score descending
    results.sort(key=lambda x: x["total_score"], reverse=True)
    return results

if __name__ == "__main__":
    ranking = get_global_news_ranking()
    for r in ranking[:3]:
        print(r['name'], r['total_score'], len(r['top_news']))
