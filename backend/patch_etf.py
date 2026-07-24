import sqlite3
import pandas as pd
import sys

with open('etf_strategy.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('timedelta(days=30)', 'timedelta(days=365)')

sim_code = """
def get_etf_simulation():
    init_db()
    conn = sqlite3.connect(DB_PATH)
    
    try:
        df = pd.read_sql_query("SELECT * FROM etf_daily_prices ORDER BY date ASC", conn)
    except:
        conn.close()
        return {}
    conn.close()
    
    if df.empty:
        return {}
        
    # Pivot so index=date, columns=ticker, values=close
    pivot = df.pivot(index='date', columns='ticker', values='close')
    pivot = pivot.ffill().dropna()
    
    dates = pivot.index.tolist()
    if len(dates) < 6:
        return {}
        
    etf_normalized = {ticker: [100.0] * len(dates) for ticker in pivot.columns}
    strategy_returns = [100.0] * len(dates)
    selected_etf = [""] * len(dates)
    
    # Calculate ETF individual normalized base 100
    for ticker in pivot.columns:
        base_price = pivot[ticker].iloc[0]
        for i, date in enumerate(dates):
            etf_normalized[ticker][i] = (pivot[ticker].iloc[i] / base_price) * 100.0
            
    # Simulation Logic
    current_target = None
    
    for i in range(len(dates)):
        if i < 6:
            # Need at least 6 days for 5-day return calculation
            selected_etf[i] = "Waiting"
            continue
            
        # Calculate momentum for all ETFs at day i
        best_ticker = None
        best_score = -9999
        
        for ticker in pivot.columns:
            try:
                curr_p = pivot[ticker].iloc[i]
                prev_1d_p = pivot[ticker].iloc[i-1]
                prev_5d_p = pivot[ticker].iloc[i-5]
                
                ret_1d = ((curr_p - prev_1d_p) / prev_1d_p) * 100
                ret_5d = ((curr_p - prev_5d_p) / prev_5d_p) * 100
                score = ret_1d + ret_5d
                
                if score > best_score:
                    best_score = score
                    best_ticker = ticker
            except:
                pass
                
        selected_etf[i] = best_ticker
        
        # Apply return from current_target (which was selected at i-1)
        if current_target and current_target in pivot.columns:
            prev_p = pivot[current_target].iloc[i-1]
            curr_p = pivot[current_target].iloc[i]
            daily_ret = (curr_p - prev_p) / prev_p
            strategy_returns[i] = strategy_returns[i-1] * (1 + daily_ret)
        else:
            strategy_returns[i] = strategy_returns[i-1]
            
        # Update target for next day
        current_target = best_ticker

    # Format response
    return {
        "dates": dates,
        "strategy": strategy_returns,
        "selected_etf": selected_etf,
        "etfs": etf_normalized
    }
"""

if "def get_etf_simulation(" not in content:
    content += sim_code

with open('etf_strategy.py', 'w', encoding='utf-8') as f:
    f.write(content)

print("Patch successful!")
