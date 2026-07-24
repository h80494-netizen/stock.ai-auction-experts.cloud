from typing import List, Dict, Any
from .base import BaseScraper
import urllib.parse
from datetime import datetime

class ReutersScraper(BaseScraper):
    def __init__(self):
        super().__init__("Reuters")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        # Reuters blocks basic scraping heavily, using simple search structure
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://www.reuters.com/site-search/?query={encoded_keyword}"
        soup = self.fetch_page(url)
        if not soup: return []
        
        news_items = []
        articles = soup.find_all('li', class_='search-results__item__2oqiX', limit=10)
        
        for article in articles:
            a_tag = article.find('a', class_='media-story-card__heading__eqhp9')
            if not a_tag: continue
            
            title = a_tag.text.strip()
            link = "https://www.reuters.com" + a_tag.get('href') if a_tag.get('href', '').startswith('/') else a_tag.get('href')
            
            news_items.append({
                "title": title,
                "link": link,
                "source": "Reuters",
                "snippet": "",
                "language": "en",
                "timestamp": datetime.now().isoformat()
            })
        return news_items

class ForbesScraper(BaseScraper):
    def __init__(self):
        super().__init__("Forbes")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://www.forbes.com/search/?q={encoded_keyword}"
        soup = self.fetch_page(url)
        if not soup: return []
        
        news_items = []
        articles = soup.find_all('article', class_='stream-item', limit=10)
        for article in articles:
            a_tag = article.find('a', class_='stream-item__title')
            if not a_tag: continue
            
            title = a_tag.text.strip()
            link = a_tag.get('href')
            
            news_items.append({
                "title": title,
                "link": link,
                "source": "Forbes",
                "snippet": "",
                "language": "en",
                "timestamp": datetime.now().isoformat()
            })
        return news_items

class BusinessInsiderScraper(BaseScraper):
    def __init__(self):
        super().__init__("Business Insider")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://www.businessinsider.com/s?q={encoded_keyword}"
        soup = self.fetch_page(url)
        if not soup: return []
        
        news_items = []
        articles = soup.find_all('div', class_='search-result-item', limit=10)
        for article in articles:
            a_tag = article.find('a', class_='title')
            if not a_tag: continue
            
            title = a_tag.text.strip()
            link = "https://www.businessinsider.com" + a_tag.get('href') if a_tag.get('href', '').startswith('/') else a_tag.get('href')
            
            news_items.append({
                "title": title,
                "link": link,
                "source": "Business Insider",
                "snippet": "",
                "language": "en",
                "timestamp": datetime.now().isoformat()
            })
        return news_items

class BloombergScraper(BaseScraper):
    def __init__(self):
        super().__init__("Bloomberg")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        # Bloomberg is heavily protected by Cloudflare/Paywalls. 
        # For MVP, attempting simple structure.
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://www.bloomberg.com/search?query={encoded_keyword}"
        soup = self.fetch_page(url)
        if not soup: return []
        
        news_items = []
        articles = soup.find_all('article', class_='storyListStory', limit=10)
        for article in articles:
            a_tag = article.find('a', class_='headline')
            if not a_tag: continue
            
            title = a_tag.text.strip()
            link = a_tag.get('href')
            
            news_items.append({
                "title": title,
                "link": link,
                "source": "Bloomberg",
                "snippet": "",
                "language": "en",
                "timestamp": datetime.now().isoformat()
            })
        return news_items
