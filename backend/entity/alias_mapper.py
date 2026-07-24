import json
import os
from typing import Dict, Optional, List

class AliasMapper:
    def __init__(self, data_dir: str = None):
        if data_dir is None:
            # Default to backend/data
            base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
            self.data_dir = os.path.join(base_dir, 'data')
        else:
            self.data_dir = data_dir
            
        self.alias_table: Dict[str, str] = {}
        self._load_aliases()

    def _load_aliases(self):
        """
        Loads alias table. For MVP, we define a static dictionary.
        In production, this would load from a database or a large JSON file.
        Format: { "alias": "ticker" }
        """
        # Hardcoded MVP examples based on the architecture doc
        self.alias_table = {
            # Samsung Electronics (005930)
            "삼성전자": "005930",
            "samsung electronics": "005930",
            "samsung": "005930",
            "三星电子": "005930",
            "三星": "005930",
            "サムスン電子": "005930",
            "サムスン": "005930",
            
            # Hyundai Motor (005380)
            "현대차": "005380",
            "현대자동차": "005380",
            "hyundai motor": "005380",
            "hyundai": "005380",
            "现代汽车": "005380",
            "ヒョンデ": "005380",
            "現代自動車": "005380",

            # Celltrion (068270)
            "셀트리온": "068270",
            "celltrion": "068270",
            "セルトリオン": "068270",
            "赛尔群": "068270",
            
            # Ecopro BM (247540)
            "에코프로비엠": "247540",
            "ecopro bm": "247540",
            "エコプロbm": "247540",
            
            # Hanmi Pharm (128940)
            "한미약품": "128940",
            "hanmi pharm": "128940",
            "hanmi pharmaceutical": "128940",
            "ハンミ薬品": "128940",
        }
        
    def add_alias(self, alias: str, ticker: str):
        self.alias_table[alias.lower()] = ticker
        
    def resolve(self, text: str) -> Optional[str]:
        """
        Attempt to resolve a text to a ticker exactly using alias table.
        """
        return self.alias_table.get(text.lower().strip())
