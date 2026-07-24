from abc import ABC, abstractmethod
from typing import List, Dict, Any
import requests
from bs4 import BeautifulSoup
import logging

logger = logging.getLogger(__name__)

class BaseScraper(ABC):
    def __init__(self, name: str):
        self.name = name
        # Common headers to avoid basic blocks
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }

    def fetch_page(self, url: str) -> BeautifulSoup:
        try:
            response = requests.get(url, headers=self.headers, timeout=10)
            response.raise_for_status()
            return BeautifulSoup(response.text, 'html.parser')
        except Exception as e:
            logger.error(f"[{self.name}] Error fetching {url}: {e}")
            return None

    @abstractmethod
    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        """
        Fetch news articles related to the given keyword/ticker.
        Returns a list of dictionaries with keys: title, link, source, timestamp, snippet
        """
        pass
