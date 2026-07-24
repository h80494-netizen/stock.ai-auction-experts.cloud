from typing import List, Dict, Any
from .base import BaseScraper
import urllib.parse
from datetime import datetime

class BaiduScraper(BaseScraper):
    def __init__(self):
        super().__init__("Baidu News")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        encoded_keyword = urllib.parse.quote(keyword)
        # Baidu News Search URL
        url = f"https://www.baidu.com/s?rtt=1&bsst=1&cl=2&tn=news&word={encoded_keyword}"
        soup = self.fetch_page(url)
        
        if not soup:
            return []
            
        news_items = []
        # Baidu news search results wrapper
        articles = soup.find_all('div', class_='result-op', limit=10)
        
        for article in articles:
            title_tag = article.find('h3', class_='news-title_1YtI1')
            if not title_tag:
                title_tag = article.find('h3') # fallback
            if not title_tag: continue
            
            a_tag = title_tag.find('a')
            if not a_tag: continue
            
            title = a_tag.text.strip()
            link = a_tag.get('href')
            
            source_tag = article.find('span', class_='c-color-gray')
            source = source_tag.text.strip() if source_tag else "Baidu News"
            
            snippet_tag = article.find('span', class_='c-font-normal c-color-text')
            snippet = snippet_tag.text.strip() if snippet_tag else ""
            
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "snippet": snippet,
                "language": "zh-CN",
                "timestamp": datetime.now().isoformat()
            })
            
        return news_items
