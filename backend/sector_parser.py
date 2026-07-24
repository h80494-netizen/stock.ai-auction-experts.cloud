import pandas as pd
import os
import json

def get_sectors_data():
    file_path = os.path.join(os.path.dirname(__file__), '업종종목.xlsx')
    if not os.path.exists(file_path):
        return {"error": "업종종목.xlsx not found"}
        
    try:
        df = pd.read_excel(file_path, header=None)
        sectors = []
        current_sector = None
        current_stocks = []
        
        for idx, row in df.iterrows():
            vals = [str(x).strip() for x in row.values if pd.notna(x)]
            if not vals:
                continue
                
            # Detect Sector Title (usually starts with '핵심' or has only 1 column, but sometimes 2 columns if empty)
            import re
            if len(vals) == 1 and (re.search(r'\d+\.', vals[0]) or '핵심' in vals[0]):
                if current_sector:
                    sectors.append({"sector": current_sector, "stocks": current_stocks})
                
                # Clean up sector name
                s_name = vals[0].replace('핵심', '').strip()
                current_sector = s_name
                current_stocks = []
                continue
                
            # If it has more than 2 columns and it's not the header
            if len(vals) >= 3 and current_sector:
                country = vals[0]
                if country == '국가' or country == '국가/시장': # Header row
                    continue
                
                name = vals[1]
                ticker = vals[2]
                desc = vals[3] if len(vals) > 3 else ""
                
                # Format ticker for frontend
                # We append .KS for KR if it's pure numbers, .T for JP if needed
                if country == 'KR' and ticker.isdigit():
                    formatted_ticker = ticker
                elif country == 'JP' and ticker.isdigit():
                    formatted_ticker = f"{ticker}.T"
                else:
                    formatted_ticker = ticker
                    
                current_stocks.append({
                    "country": country,
                    "name": name,
                    "ticker": formatted_ticker,
                    "description": desc
                })
                
        if current_sector:
            sectors.append({"sector": current_sector, "stocks": current_stocks})
            
        return {"sectors": sectors}
        
    except Exception as e:
        print("Sector parser error:", e)
        return {"error": str(e)}

if __name__ == "__main__":
    print(json.dumps(get_sectors_data(), ensure_ascii=False, indent=2))
