import re
from typing import Optional

class PhoneticMatcher:
    def __init__(self):
        # Basic character sets for heuristics
        self.katakana_regex = re.compile(r'[\u30A0-\u30FF]+')
        self.hanzi_regex = re.compile(r'[\u4E00-\u9FFF]+')
        self.hangul_regex = re.compile(r'[\uAC00-\uD7A3]+')

    def normalize_text(self, text: str) -> str:
        """
        Normalize text: lowercase, remove special characters that might interfere.
        """
        # Remove simple punctuation but keep alphanumeric and CJK chars
        text = text.lower()
        text = re.sub(r'[^\w\s\u30A0-\u30FF\u4E00-\u9FFF\uAC00-\uD7A3]', '', text)
        return text.strip()

    def fuzzy_match(self, text: str, candidates: dict) -> Optional[str]:
        """
        A placeholder for a true phonetic/linguistic matching algorithm (like Kensho Link).
        For this MVP, it does a basic substring or containment check after normalization.
        candidates is expected to be a dict of { "alias_lower": "ticker" }
        """
        norm_text = self.normalize_text(text)
        
        # 1. Exact match after normalization
        if norm_text in candidates:
            return candidates[norm_text]
            
        # 2. Containment match (if an alias is entirely within the text)
        # e.g., "サムスン電子" is in the text
        # We sort aliases by length descending so we match the longest (most specific) alias first
        sorted_aliases = sorted(candidates.keys(), key=len, reverse=True)
        for alias in sorted_aliases:
            if len(alias) >= 2 and alias in norm_text:
                return candidates[alias]
                
        return None
