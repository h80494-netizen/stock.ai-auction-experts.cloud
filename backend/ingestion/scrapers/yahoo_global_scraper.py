from typing import List, Dict, Any
from .base import BaseScraper
import urllib.parse
from datetime import datetime

class YahooFinanceUSScraper(BaseScraper):
    def __init__(self):
        super().__init__("Yahoo Finance US")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        encoded_keyword = urllib.parse.quote(keyword)
        # Yahoo finance uses a common search endpoint
        url = f"https://finance.yahoo.com/news/search/?q={encoded_keyword}"
        soup = self.fetch_page(url)
        
        if not soup:
            return []
            
        news_items = []
        # Fallback to general Yahoo News search if Finance is strictly SPA
        # For simplicity, we'll hit Yahoo News with a finance filter
        url = f"https://news.yahoo.com/search?p={encoded_keyword}&fr=uh3_finance_web"
        soup = self.fetch_page(url)
        if not soup: return []

        articles = soup.find_all('div', class_='NewsArticle', limit=10)
        
        for article in articles:
            title_tag = article.find('h4')
            if not title_tag: continue
            
            a_tag = title_tag.find('a')
            if not a_tag: continue
            
            title = a_tag.text.strip()
            link = a_tag.get('href')
            
            source_tag = article.find('span', class_='s-source')
            source = source_tag.text.strip() if source_tag else "Yahoo Finance"
            
            snippet_tag = article.find('p', class_='s-desc')
            snippet = snippet_tag.text.strip() if snippet_tag else ""
            
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "snippet": snippet,
                "language": "en",
                "timestamp": datetime.now().isoformat()
            })
            
        return news_items

class YahooFinanceJapanScraper(BaseScraper):
    def __init__(self):
        super().__init__("Yahoo Finance Japan")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://news.yahoo.co.jp/search?p={encoded_keyword}&ei=utf-8&c=business"
        soup = self.fetch_page(url)
        
        if not soup:
            return []
            
        news_items = []
        articles = soup.find_all('li', class_='newsFeed_item', limit=10)
        
        for article in articles:
            a_tag = article.find('a', class_='newsFeed_item_link')
            if not a_tag: continue
            
            title_tag = article.find('div', class_='newsFeed_item_title')
            if not title_tag: continue
            
            title = title_tag.text.strip()
            link = a_tag.get('href')
            
            source_tag = article.find('span', class_='newsFeed_item_source')
            source = source_tag.text.strip() if source_tag else "Yahoo Japan"
            
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "snippet": "", # Snippet might not be readily available
                "language": "ja",
                "timestamp": datetime.now().isoformat()
            })
            
        return news_items

class YahooFinanceTaiwanScraper(BaseScraper):
    def __init__(self):
        super().__init__("Yahoo Finance Taiwan")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://tw.news.yahoo.com/search?p={encoded_keyword}&fr=uh3_finance_web"
        soup = self.fetch_page(url)
        
        if not soup:
            return []
            
        news_items = []
        articles = soup.find_all('li', class_='StreamMegaItem', limit=10)
        
        for article in articles:
            title_tag = article.find('h3')
            if not title_tag: continue
            
            a_tag = title_tag.find('a')
            if not a_tag: continue
            
            title = a_tag.text.strip()
            link = "https://tw.news.yahoo.com" + a_tag.get('href') if a_tag.get('href', '').startswith('/') else a_tag.get('href')
            
            # Extract source and snippet if available
            source = "Yahoo Taiwan"
            
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "snippet": "",
                "language": "zh-TW",
                "timestamp": datetime.now().isoformat()
            })
            
        return news_items
