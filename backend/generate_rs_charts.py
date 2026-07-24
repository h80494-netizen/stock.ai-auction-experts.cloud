import yfinance as yf
import matplotlib.pyplot as plt
import os
import matplotlib
import datetime

# Set Korean font
matplotlib.rcParams['font.family'] = 'Malgun Gothic'
matplotlib.rcParams['axes.unicode_minus'] = False

OUTPUT_DIR = '../frontend/public/charts'
if not os.path.exists(OUTPUT_DIR):
    os.makedirs(OUTPUT_DIR)

from competitor_analyzer import SECTORS

def get_historical_prices(ticker_list):
    # Fetch 6 months of data
    end = datetime.datetime.now()
    start = end - datetime.timedelta(days=180)
    data = yf.download(ticker_list, start=start, end=end)['Close']
    return data

def generate_rs_chart(sector_name, stocks):
    print(f"Generating RS chart for {sector_name}...")
    tickers = [s["ticker"] for s in stocks]
    # For KRX stocks in yfinance, we need to add .KS or .KQ if not present and they are numbers
    yf_tickers = []
    for t in tickers:
        if t.startswith("KRX:"): t = t.replace("KRX:", "") + ".KS"
        elif t.isdigit(): t = t + ".KS"
        yf_tickers.append(t)
    
    # Also fetch S&P 500 for baseline
    all_tickers = yf_tickers + ["^GSPC"]
    data = get_historical_prices(all_tickers)
    
    if data.empty:
        print(f"No data for {sector_name}")
        return
        
    # Forward fill missing data
    data = data.ffill().bfill()
    
    # Calculate Relative Strength (RS) = Stock Price / S&P 500 Price
    # Then normalize to 100 at the start of the period
    rs_data = pd.DataFrame(index=data.index)
    for i, t in enumerate(yf_tickers):
        if t in data.columns and "^GSPC" in data.columns:
            rs = data[t] / data["^GSPC"]
            rs_normalized = (rs / rs.iloc[0]) * 100
            rs_data[stocks[i]["name"]] = rs_normalized
            
    # Plot
    plt.figure(figsize=(10, 5))
    plt.style.use('dark_background')
    
    for col in rs_data.columns:
        plt.plot(rs_data.index, rs_data[col], label=col, linewidth=2)
        
    plt.axhline(y=100, color='white', linestyle='--', alpha=0.5)
    plt.title(f"{sector_name} - Relative Strength (vs S&P 500, Base=100)", color='white')
    plt.legend(loc='upper left', bbox_to_anchor=(1, 1), frameon=False)
    plt.grid(color='#333333', linestyle='-', linewidth=0.5)
    
    # Formatting
    plt.gca().spines['top'].set_visible(False)
    plt.gca().spines['right'].set_visible(False)
    plt.gca().spines['bottom'].set_color('#555555')
    plt.gca().spines['left'].set_color('#555555')
    
    filename = sector_name.replace(" ", "_").replace("&", "and").replace("/", "_") + "_rs.png"
    filepath = os.path.join(OUTPUT_DIR, filename)
    plt.tight_layout()
    plt.savefig(filepath, dpi=120, transparent=True)
    plt.close()
    print(f"Saved {filepath}")

import pandas as pd
if __name__ == "__main__":
    for sector_name, stocks in SECTORS.items():
        if "AI H/W" in sector_name:
            generate_rs_chart(sector_name, stocks)
