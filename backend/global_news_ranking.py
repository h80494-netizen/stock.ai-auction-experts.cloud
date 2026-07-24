import time
import random
import asyncio
from typing import List, Dict

# ==========================================
# 1. Contexts
# ==========================================

class AntiBotContext:
    def __init__(self):
        self.user_agents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/113.0.0.0 Safari/537.36"
        ]
        self.target_domains = [
            "naver.com", "einfomax.co.kr", "hankyung.com", 
            "yahoo.com", "marketwatch.com", "cnbc.com", 
            "investing.com", "reuters.com", "bloomberg.com", 
            "forbes.com", "businessinsider.com", "thestreet.com", 
            "tipranks.com", "minkabu.jp", "eastmoney.com", 
            "sina.com.cn", "caixinglobal.com"
        ]
        
    def get_random_header(self) -> dict:
        return {
            "User-Agent": random.choice(self.user_agents),
            "Accept-Language": "en-US,en;q=0.9,ko-KR;q=0.8,ko;q=0.7",
            "Referer": "https://www.google.com/"
        }
        
    def get_time_lag(self) -> float:
        return random.uniform(3.0, 7.0)

class SearchContext:
    def __init__(self, markets: List[str] = ["KR", "US", "JP", "CN"]):
        self.markets = markets
        # Ideally, keywords would be mapped from top 100 tickers across these 4 countries.
        self.keywords = ["NVIDIA", "Samsung", "Toyota", "Tencent", "Tesla", "Sony", "Alibaba", "SK Hynix"]

# ==========================================
# 2. Skills
# ==========================================

class BrowserScrapingSkill:
    def __init__(self, bot_context: AntiBotContext):
        self.bot_context = bot_context

    async def scrape_domain(self, domain: str, keyword: str) -> List[Dict]:
        headers = self.bot_context.get_random_header()
        lag = self.bot_context.get_time_lag()
        
        # await asyncio.sleep(lag) # Disabled for mock test speed
        
        is_real_time = random.random() > 0.7 # 30% chance of sudden price movement news
        
        return [{
            "domain": domain,
            "title": f"[BREAKING] {keyword} 급등/급락 포착!" if is_real_time else f"{keyword} 공급망 및 투자 계획 발표",
            "url": f"https://www.{domain}/news/123",
            "content": f"Real-time volatility." if is_real_time else "Supply expansion, net profit increase.",
            "date": time.strftime("%Y-%m-%d %H:%M:%S"),
            "is_real_time": is_real_time
        }]

class ImportanceScoringSkill:
    def __init__(self):
        # 5 main factors + Real-time price movement
        self.scoring_categories = ["Investment", "Demand", "Supply", "Net Profit", "Analyst Report", "Price Movement (Real-time)"]

    def score_news(self, news_item: Dict) -> Dict:
        content = news_item.get("content", "").lower()
        title = news_item.get("title", "").lower()
        is_real_time = news_item.get("is_real_time", False)
        text = title + " " + content
        
        score = 0
        factors = []
        
        if "invest" in text or "투자" in text:
            factors.append({"category": "Investment", "score": 20})
            score += 20
        if "supply" in text or "공급" in text:
            factors.append({"category": "Supply", "score": 20})
            score += 20
        if "demand" in text or "수요" in text:
            factors.append({"category": "Demand", "score": 15})
            score += 15
        if "profit" in text or "순이익" in text:
            factors.append({"category": "Net Profit", "score": 25})
            score += 25
            
        # Give massive weight to real-time price volatility
        if is_real_time or "급등" in text or "급락" in text:
            factors.append({"category": "Price Movement (Real-time)", "score": 40})
            score += 40
            
        return {
            "importance_score": min(score, 100),
            "factors": factors
        }

# ==========================================
# 3. Loops
# ==========================================

class StealthIngestionLoop:
    def __init__(self, scraper: BrowserScrapingSkill):
        self.scraper = scraper
        
    async def run(self, context: SearchContext):
        all_news = []
        domains = self.scraper.bot_context.target_domains
        random.shuffle(domains)
        
        for domain in domains[:3]: # limit for test
            for kw in context.keywords:
                try:
                    news = await self.scraper.scrape_domain(domain, kw)
                    all_news.extend(news)
                except Exception as e:
                    pass
        return all_news

class AnalysisAndRankingLoop:
    def __init__(self, scorer: ImportanceScoringSkill):
        self.scorer = scorer
        
    def run(self, raw_news_list: List[Dict]) -> List[Dict]:
        ranked_news = []
        for news in raw_news_list:
            score_data = self.scorer.score_news(news)
            news.update(score_data)
            ranked_news.append(news)
            
        ranked_news.sort(key=lambda x: x["importance_score"], reverse=True)
        return ranked_news

# ==========================================
# Main Execution (Mock Test)
# ==========================================
async def test_run():
    bot_ctx = AntiBotContext()
    search_ctx = SearchContext()
    
    scraper = BrowserScrapingSkill(bot_ctx)
    scorer = ImportanceScoringSkill()
    
    ingestion = StealthIngestionLoop(scraper)
    analysis = AnalysisAndRankingLoop(scorer)
    
    raw_data = await ingestion.run(search_ctx)
    ranked_data = analysis.run(raw_data)
    
    print("\n--- Top 5 Impactful News (across KR, US, JP, CN) ---")
    for d in ranked_data[:5]:
        print(f"[{'BREAKING' if d['is_real_time'] else 'NORMAL'}] Score: {d['importance_score']} - {d['title']} ({d['domain']})")
        for f in d['factors']:
            print(f"  - {f['category']}: +{f['score']}")
        print("-" * 30)

if __name__ == "__main__":
    asyncio.run(test_run())
