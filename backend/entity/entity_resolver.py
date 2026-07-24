import json
import os
import logging
from typing import Optional, Dict, Any
from .alias_mapper import AliasMapper
from .phonetic_matcher import PhoneticMatcher

logger = logging.getLogger(__name__)

class EntityResolver:
    def __init__(self):
        self.alias_mapper = AliasMapper()
        self.phonetic_matcher = PhoneticMatcher()
        self.krx_data = self._load_krx_data()

    def _load_krx_data(self) -> Dict[str, Any]:
        """
        Load KRX 100 metadata.
        For MVP, returns a dummy dict. In production, load from a json/csv.
        """
        try:
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            data_path = os.path.join(base_dir, 'data', 'krx100.json')
            if os.path.exists(data_path):
                with open(data_path, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load KRX data: {e}")
            
        # MVP Fallback
        return {
            "005930": {"name_ko": "삼성전자", "name_en": "Samsung Electronics"},
            "005380": {"name_ko": "현대차", "name_en": "Hyundai Motor"},
            "068270": {"name_ko": "셀트리온", "name_en": "Celltrion"},
            "247540": {"name_ko": "에코프로비엠", "name_en": "Ecopro BM"},
            "128940": {"name_ko": "한미약품", "name_en": "Hanmi Pharm"}
        }

    def resolve_entity(self, text: str) -> Optional[str]:
        """
        Takes raw text (e.g. from news article) and returns standard KRX ticker.
        """
        # 1. Try exact alias match
        ticker = self.alias_mapper.resolve(text)
        if ticker:
            return ticker

        # 2. Try phonetic/fuzzy matching if exact alias fails
        ticker = self.phonetic_matcher.fuzzy_match(text, self.alias_mapper.alias_table)
        if ticker:
            return ticker

        # 3. Could integrate LLM/Kensho Link here as the fallback layer.
        # For now, return None if unresolved.
        return None

    def get_entity_metadata(self, ticker: str) -> Optional[Dict[str, Any]]:
        return self.krx_data.get(ticker)

if __name__ == "__main__":
    resolver = EntityResolver()
    test_cases = ["삼성전자", "Samsung Electronics", "サムスン電子", "三星电子", "에코프로비엠", "Unknown Company"]
    
    for case in test_cases:
        ticker = resolver.resolve_entity(case)
        if ticker:
            meta = resolver.get_entity_metadata(ticker)
            print(f"[{case}] resolved to Ticker: {ticker} ({meta['name_ko']})")
        else:
            print(f"[{case}] could not be resolved.")
