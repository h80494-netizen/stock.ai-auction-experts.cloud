import os
import sys
import time

# Add the parent directory to sys.path so we can import from backend
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import database as db
from ingestion.scrapers.dart_scraper import dart_scraper

def seed_financials():
    print("Fetching top stocks from Korea Investment API/Public API...")
    # Get Top stocks (e.g., KOSPI Top 50 or top volume)
    # We will just fetch a few test tickers or use dart_scraper's corp_codes
    
    # Alternatively, just pick some representative tickers:
    tickers = ["005930", "000660", "373220", "207940", "005380", "068270", "000270", "051910", "035420", "035720", "005490", "105560", "028260", "012330", "055550", "066570", "032830", "096770", "034730", "011200", "033780", "010140", "042700", "323410", "018260", "015760", "316140", "259960", "051900", "034220", "010950", "009150", "024110", "011170", "086280", "003670", "004020", "161390", "036570", "030200"]
    
    print(f"Starting to seed DART financials for {len(tickers)} tickers...")
    
    current_year = "2023" # Or 2024
    
    for i, ticker in enumerate(tickers):
        print(f"[{i+1}/{len(tickers)}] Fetching {ticker}...")
        try:
            data = dart_scraper.get_financials(ticker, current_year, "11011")
            if data:
                db.insert_dart_financials(
                    ticker, data["year"], data["quarter"],
                    data["assets"], data["equity"], data["liabilities"],
                    data["revenue"], data["operating_profit"], data["net_profit"]
                )
                print(f"  -> Success: Inserted {ticker} financials into DB.")
            else:
                print(f"  -> Failed or no data for {ticker}.")
        except Exception as e:
            print(f"  -> Error on {ticker}: {e}")
        
        # Be nice to DART API
        time.sleep(1)
        
    print("Seeding complete! You can now check the Tetris Screener.")

if __name__ == "__main__":
    seed_financials()
