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
        "matched_keywords": [w for w in GOOD_KEYWORDS + BAD_KEYWORDS if w in title_lower],
        "factors": [
            {"category": "Keyword Match", "score": good_matches * 15 + bad_matches * 15},
            {"category": "Recency", "score": 20 if is_realtime else 0}
        ]
    }

def fetch_news_from_google(name, ticker, market_code):
    """
    yfinance 조회가 불가할 때 Google News RSS를 통해 실시간 글로벌 뉴스를 수집합니다.
    """
    from .country_news_scraper import get_google_news_rss
    from email.utils import parsedate_to_datetime
    
    query = name
    raw_items = get_google_news_rss(query, market_code)
    if not raw_items and market_code != 'US':
        # 영문 티커나 보조 검색어로 재시도
        raw_items = get_google_news_rss(ticker.split('.')[0], 'US')
        
    converted = []
    for item in raw_items:
        ts = int(time.time())
        if item.get("published"):
            try:
                dt = parsedate_to_datetime(item["published"])
                ts = int(dt.timestamp())
            except Exception:
                pass
        converted.append({
            "title": item.get("title", ""),
            "publisher": item.get("source", "Google News"),
            "link": item.get("link", ""),
            "timestamp": ts,
            "providerPublishTime": ts
        })
    return converted

def fetch_stock_news(name, ticker, market_code):
    try:
        top_news = []
        total_score = 0
        news_items = []
        
        # 1. yfinance 시도 (yfinance MCP 규칙 및 기본 연동 존중)
        try:
            t = yf.Ticker(ticker)
            raw_news = t.news
            if raw_news and isinstance(raw_news, list):
                for item in raw_news:
                    n = item.get('content', item) if isinstance(item, dict) else item
                    publisher = n.get('publisher')
                    if not publisher and isinstance(n.get('provider'), dict):
                        publisher = n['provider'].get('displayName')
                    if not publisher:
                        publisher = 'Yahoo Finance'
                    title = n.get('title', '')
                    link = n.get('link') or (n.get('clickThroughUrl', {}).get('url') if isinstance(n.get('clickThroughUrl'), dict) else '') or (n.get('canonicalUrl', {}).get('url') if isinstance(n.get('canonicalUrl'), dict) else '') or ''
                    ts = n.get('providerPublishTime', 0)
                    if not ts and n.get('pubDate'):
                        try:
                            pub_str = n['pubDate'].replace('Z', '+00:00')
                            dt = datetime.fromisoformat(pub_str)
                            ts = int(dt.timestamp())
                        except Exception:
                            ts = 0
                    if title:
                        news_items.append({
                            "title": title,
                            "publisher": publisher,
                            "link": link,
                            "timestamp": ts
                        })
        except Exception:
            pass

        # 2. yfinance 결과가 없거나 부족한 경우 Google News RSS로 보강
        if len(news_items) < 3:
            g_items = fetch_news_from_google(name, ticker, market_code)
            for gi in g_items:
                if not any(gi["title"] == ni["title"] for ni in news_items):
                    news_items.append(gi)

        news_count = len(news_items)
        if news_count == 0:
            return None
            
        for idx, n in enumerate(news_items[:5]): # 상위 최대 5개 뉴스
            title = n.get('title', '')
            publisher = n.get('publisher', 'Global Media')
            link = n.get('link', '')
            timestamp = n.get('timestamp', int(time.time()))
            
            analyzed = analyze_news(title, publisher, timestamp)
            analyzed["id"] = f"{ticker}_{timestamp}_{idx}"
            analyzed["summary"] = title
            analyzed["url"] = link
            
            if timestamp > 0:
                analyzed["date"] = datetime.fromtimestamp(timestamp).isoformat()
            else:
                analyzed["date"] = datetime.now().isoformat()
                
            top_news.append(analyzed)
            total_score += analyzed["importance_score"]
            
        avg_score = total_score / len(top_news) if top_news else 50.0
        
        # Generate decisive_comment
        KEYWORD_KO = {
            "surge": "급등", "jump": "상승", "soar": "폭등", "beat": "실적 상회", "upgrade": "목표가 상향", 
            "buy": "매수", "up": "상승세", "record": "기록적", "growth": "성장", "profit": "수익/흑자", "dividend": "배당",
            "drop": "하락", "fall": "하락세", "plunge": "폭락", "miss": "실적 하회", "downgrade": "목표가 하향", 
            "sell": "매도", "down": "하락세", "loss": "손실/적자", "decline": "감소", "cut": "삭감/축소",
            "상승": "상승", "급등": "급등", "흑자": "흑자", "성장": "성장", "호조": "호조", "상회": "상회",
            "하락": "하락", "급락": "급락", "적자": "적자", "감소": "감소", "부진": "부진", "하회": "하회"
        }
        all_keywords = set()
        for news in top_news:
            if "matched_keywords" in news:
                for kw in news["matched_keywords"]:
                    all_keywords.add(kw)
                    
        translated_kws = list(set([KEYWORD_KO.get(kw, kw) for kw in all_keywords]))
        if translated_kws:
            decisive_comment = f"최근 글로벌 뉴스에서 '{', '.join(translated_kws)}' 관련 모멘텀이 부각되며 주가에 결정적 영향을 미치고 있습니다."
        else:
            decisive_comment = f"시장의 주요 이슈와 펀더멘털 변화가 주가 변동성에 영향을 주고 있습니다."
        
        return {
            "ticker": ticker,
            "name": name,
            "market": market_code,
            "total_score": round(avg_score, 1),
            "news_count": news_count,
            "decisive_comment": decisive_comment,
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
