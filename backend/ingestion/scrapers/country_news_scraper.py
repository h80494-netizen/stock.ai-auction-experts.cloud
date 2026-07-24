import requests
import xml.etree.ElementTree as ET
import urllib.parse
from datetime import datetime

def get_google_news_rss(keyword: str, market: str):
    if market == 'KR':
        hl, gl, ceid = "ko", "KR", "KR:ko"
    elif market == 'JP':
        hl, gl, ceid = "ja", "JP", "JP:ja"
    elif market == 'CN':
        hl, gl, ceid = "zh-CN", "CN", "CN:zh-Hans"
    else:
        hl, gl, ceid = "en-US", "US", "US:en"
        keyword = f"{keyword} stock"
        
    encoded_keyword = urllib.parse.quote(keyword)
    url = f"https://news.google.com/rss/search?q={encoded_keyword}&hl={hl}&gl={gl}&ceid={ceid}"
    try:
        res = requests.get(url, timeout=5)
        root = ET.fromstring(res.text)
        news = []
        for item in root.findall('.//item')[:10]:
            title = item.find('title').text
            link = item.find('link').text
            pubDate = item.find('pubDate').text
            source = item.find('source').text if item.find('source') is not None else "Google News"
            news.append({
                "title": title,
                "link": link,
                "published": pubDate,
                "source": source
            })
        return news
    except Exception as e:
        print(f"Google News RSS Error ({market}):", e)
        return []

def get_yfinance_news(ticker: str):
    import yfinance as yf
    news = []
    try:
        # Best effort cleanup of ticker for yfinance
        clean_ticker = ticker.split(':')[-1] if ':' in ticker else ticker
        if clean_ticker.isdigit() and len(clean_ticker) == 6:
            clean_ticker = f"{clean_ticker}.KS"
        
        info = yf.Ticker(clean_ticker).news
        if info:
            for item in info[:10]:
                pub_time = item.get("providerPublishTime")
                pub_date = datetime.fromtimestamp(pub_time).strftime("%Y-%m-%d %H:%M") if pub_time else ""
                news.append({
                    "title": item.get("title", ""),
                    "link": item.get("link", ""),
                    "published": pub_date,
                    "source": item.get("publisher", "Yahoo Finance")
                })
    except Exception as e:
        print("YFinance News Error:", e)
    return news

def fetch_country_news(keyword: str, market: str):
    # 'keyword' passed from frontend might be just the name. 
    # But wait, we receive 'keyword' from frontend which is 'name' or 'ticker'.
    # I should try getting from Google News first.
    news = get_google_news_rss(keyword, market)
    
    # Fallback if news < 5
    if len(news) < 5:
        # Fallback to US Google News
        us_news = get_google_news_rss(keyword, 'US')
        news.extend([n for n in us_news if n['link'] not in [x['link'] for x in news]])
        
    return news

def translate_text(text, target_lang):
    if not text: return ""
    try:
        url = "https://translate.googleapis.com/translate_a/single"
        params = {
            "client": "gtx",
            "sl": "auto",
            "tl": target_lang,
            "dt": "t",
            "q": text
        }
        res = requests.get(url, params=params, timeout=5)
        data = res.json()
        translated = "".join([d[0] for d in data[0] if d[0]])
        return translated
    except Exception as e:
        print("Translate error:", e)
        return text
