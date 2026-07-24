from typing import List, Dict, Any
from .base import BaseScraper
import urllib.parse
from datetime import datetime

class EETimesJapanScraper(BaseScraper):
    def __init__(self):
        super().__init__("EE Times Japan")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        encoded_keyword = urllib.parse.quote(keyword)
        # Search URL for EE times Japan
        url = f"https://eetimes.itmedia.co.jp/search/?q={encoded_keyword}"
        soup = self.fetch_page(url)
        if not soup: return []
        
        news_items = []
        articles = soup.find_all('div', class_='colBoxTitle', limit=10)
        for article in articles:
            a_tag = article.find('a')
            if not a_tag: continue
            
            title = a_tag.text.strip()
            link = a_tag.get('href')
            if not link.startswith('http'):
                link = "https://eetimes.itmedia.co.jp" + link
                
            news_items.append({
                "title": title,
                "link": link,
                "source": "EE Times Japan",
                "snippet": "",
                "language": "ja",
                "timestamp": datetime.now().isoformat()
            })
        return news_items

class ToyoKeizaiScraper(BaseScraper):
    def __init__(self):
        super().__init__("Toyo Keizai Online")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://toyokeizai.net/search?fulltext={encoded_keyword}"
        soup = self.fetch_page(url)
        if not soup: return []
        
        news_items = []
        articles = soup.find_all('li', class_='p-search-result__item', limit=10)
        for article in articles:
            a_tag = article.find('a', class_='p-search-result__link')
            if not a_tag: continue
            
            title_tag = article.find('h3', class_='p-search-result__title')
            title = title_tag.text.strip() if title_tag else a_tag.text.strip()
            
            link = a_tag.get('href')
            if not link.startswith('http'):
                link = "https://toyokeizai.net" + link
            
            news_items.append({
                "title": title,
                "link": link,
                "source": "Toyo Keizai Online",
                "snippet": "",
                "language": "ja",
                "timestamp": datetime.now().isoformat()
            })
        return news_items
