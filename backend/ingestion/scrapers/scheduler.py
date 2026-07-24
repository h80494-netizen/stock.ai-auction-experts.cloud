import time
import logging
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor

from .naver_scraper import NaverScraper, InvestingKoreaScraper
from .yahoo_global_scraper import YahooFinanceUSScraper, YahooFinanceJapanScraper, YahooFinanceTaiwanScraper
from .baidu_scraper import BaiduScraper
from .global_media_scraper import ReutersScraper, ForbesScraper, BusinessInsiderScraper, BloombergScraper
from .japan_media_scraper import EETimesJapanScraper, ToyoKeizaiScraper

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class NewsAggregator:
    def __init__(self):
        self.scrapers = [
            NaverScraper(),
            InvestingKoreaScraper(),
            YahooFinanceUSScraper(),
            YahooFinanceJapanScraper(),
            YahooFinanceTaiwanScraper(),
            BaiduScraper(),
            ReutersScraper(),
            ForbesScraper(),
            BusinessInsiderScraper(),
            BloombergScraper(),
            EETimesJapanScraper(),
            ToyoKeizaiScraper()
        ]

    def _scrape_single(self, scraper, keyword: str) -> List[Dict[str, Any]]:
        try:
            logger.info(f"Running {scraper.name} for keyword: {keyword}")
            return scraper.fetch_news(keyword)
        except Exception as e:
            logger.error(f"Error in {scraper.name}: {e}")
            return []

    def fetch_all_news(self, keyword: str) -> List[Dict[str, Any]]:
        all_news = []
        # Run scrapers in parallel
        with ThreadPoolExecutor(max_workers=len(self.scrapers)) as executor:
            futures = [executor.submit(self._scrape_single, scraper, keyword) for scraper in self.scrapers]
            for future in futures:
                result = future.result()
                if result:
                    all_news.extend(result)
        
        # Sort by timestamp descending
        all_news.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
        return all_news

if __name__ == "__main__":
    # Simple test
    aggregator = NewsAggregator()
    keyword = "Samsung Electronics"
    print(f"Fetching news for {keyword}...")
    results = aggregator.fetch_all_news(keyword)
    print(f"Found {len(results)} articles.")
    for res in results[:5]:
        print(f"[{res['source']}] {res['title']}")
