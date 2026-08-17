import os
import json
import time
from competitor_analyzer import SECTORS, get_sector_details

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
if not os.path.exists(DATA_DIR):
    os.makedirs(DATA_DIR)

def main():
    print("Generating sector details... This may take a few minutes as it fetches data for all tickers.")
    all_data = {}
    total_sectors = len(SECTORS)
    
    for i, sector_name in enumerate(SECTORS.keys()):
        print(f"[{i+1}/{total_sectors}] Fetching details for sector: {sector_name}")
        details = get_sector_details(sector_name)
        all_data[sector_name] = details
        time.sleep(1) # Be nice to the APIs
        
    output_path = os.path.join(DATA_DIR, 'sector_details.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(all_data, f, ensure_ascii=False, indent=2)
    print(f"Successfully saved to {output_path}")

if __name__ == "__main__":
    main()
