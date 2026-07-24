import os
from pydantic import BaseModel
from typing import List
import google.generativeai as genai

# Configure Gemini (Replace with actual API key in production)
# genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

class NewsAnalysisResult(BaseModel):
    is_related: bool
    relevance_score: int # 0 to 100
    reason: str

def analyze_news_relevance(news_title: str, krx_stock: dict) -> NewsAnalysisResult:
    """
    Analyzes whether a given news article is relevant to a KRX100 stock 
    based on its industry, products, and competitors.
    """
    # In a real scenario, this would call Gemini or OpenAI API
    # prompt = f"Stock: {krx_stock['name']}\nIndustry: {krx_stock['industry']}\nCompetitors: {krx_stock['competitors']}\nNews Title: {news_title}\nIs this news relevant? Return JSON."
    
    # Mocking the AI response for now
    title_lower = news_title.lower()
    related = False
    score = 0
    reason = "No direct relation found."
    
    # Simple mock logic
    for category, competitors in krx_stock.get("competitors", {}).items():
        for comp in competitors:
            if comp.lower() in title_lower:
                related = True
                score = 85
                reason = f"Mentions competitor {comp}"
                
    for prod in krx_stock.get("products", []):
        if prod.lower() in title_lower:
            related = True
            score = 90
            reason = f"Mentions product {prod}"

    return NewsAnalysisResult(
        is_related=related,
        relevance_score=score,
        reason=reason
    )

if __name__ == "__main__":
    test_stock = {
        "name": "삼성전자",
        "products": ["스마트폰", "반도체"],
        "competitors": {"US": ["Apple"]}
    }
    print(analyze_news_relevance("Apple releases new iPhone 15 with advanced features", test_stock))
