import sqlite3
import os
import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta

DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
DB_PATH = os.path.join(DATA_DIR, 'etf_strategy.db')

ETF_TARGETS = {
    "EWY": "한국 (South Korea)",
    "EWJ": "일본 (Japan)",
    "SPY": "미국 S&P 500 (US S&P 500)",
    "QQQ": "미국 나스닥 (US Nasdaq)",
    "FXI": "중국 (China)",
    "INDA": "인도 (India)",
    "EWZ": "브라질 (Brazil)",
    "EWA": "호주 (Australia)",
    "EZU": "유럽 (Europe)",
    "USO": "원유 (US Oil)",
    "GLD": "금 (Gold)"
}

def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS etf_daily_prices (
            ticker TEXT,
            date TEXT,
            close REAL,
            PRIMARY KEY (ticker, date)
        )
    ''')
    conn.commit()
    conn.close()

def update_etf_data():
    init_db()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    end_date = datetime.now()
    start_date = end_date - timedelta(days=730)
    
    for ticker in ETF_TARGETS.keys():
        try:
            df = yf.download(ticker, start=start_date.strftime('%Y-%m-%d'), end=end_date.strftime('%Y-%m-%d'), progress=False)
            if df.empty: continue
            
            for index, row in df.iterrows():
                date_str = index.strftime('%Y-%m-%d')
                # yfinance returns multi-index columns sometimes in recent versions, handle properly
                close_val = row['Close'].iloc[0] if isinstance(row['Close'], pd.Series) else row['Close']
                
                c.execute('''
                    INSERT OR REPLACE INTO etf_daily_prices (ticker, date, close) 
                    VALUES (?, ?, ?)
                ''', (ticker, date_str, float(close_val)))
        except Exception as e:
            print(f"Failed to fetch ETF data for {ticker}: {e}")
            
    conn.commit()
    conn.close()
    
    with open(os.path.join(DATA_DIR, 'last_update.txt'), 'w') as f:
        f.write(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

def check_and_update_etf_data():
    last_update_file = os.path.join(DATA_DIR, 'last_update.txt')
    needs_update = True
    if os.path.exists(last_update_file):
        with open(last_update_file, 'r') as f:
            last_time_str = f.read().strip()
            try:
                last_time = datetime.strptime(last_time_str, '%Y-%m-%d %H:%M:%S')
                if (datetime.now() - last_time).total_seconds() < 12 * 3600:
                    needs_update = False
            except:
                pass
                
    if needs_update:
        update_etf_data()

def get_etf_strategy_results(criteria="momentum"):
    check_and_update_etf_data()
    init_db()
    conn = sqlite3.connect(DB_PATH)
    
    results = []
    try:
        # Load all prices into a dataframe
        df = pd.read_sql_query("SELECT * FROM etf_daily_prices ORDER BY date ASC", conn)
        if df.empty:
            update_etf_data()
            df = pd.read_sql_query("SELECT * FROM etf_daily_prices ORDER BY date ASC", conn)
    except:
        conn.close()
        return []
    
    conn.close()
    
    if df.empty:
        return []
        
    for ticker, name in ETF_TARGETS.items():
        ticker_df = df[df['ticker'] == ticker].copy()
        if len(ticker_df) < 6:
            continue # Need at least a few days of data
            
        ticker_df = ticker_df.sort_values(by='date', ascending=True)
        closes = ticker_df['close'].tolist()
        dates = ticker_df['date'].tolist()
        
        current_price = closes[-1]
        prev_1d_price = closes[-2]
        prev_5d_price = closes[-6] if len(closes) >= 6 else closes[0]
        prev_20d_price = closes[-21] if len(closes) >= 21 else closes[0]
        
        return_1d = ((current_price - prev_1d_price) / prev_1d_price) * 100
        return_5d = ((current_price - prev_5d_price) / prev_5d_price) * 100
        return_20d = ((current_price - prev_20d_price) / prev_20d_price) * 100
        
        momentum_score = (return_1d * 0.5) + (return_5d * 0.3) + (return_20d * 0.2) # 5:3:2 weight
        
        sharpe_ratio = 0
        if criteria == "sharpe":
            recent_20 = ticker_df.tail(21).copy() # 21 rows for 20 returns
            recent_20['daily_ret'] = recent_20['close'].pct_change() * 100
            std_dev = recent_20['daily_ret'].std()
            if pd.isna(std_dev) or std_dev == 0:
                sharpe_ratio = momentum_score
            else:
                sharpe_ratio = momentum_score / std_dev
                
        final_score = sharpe_ratio if criteria == "sharpe" else momentum_score
        
        results.append({
            "ticker": ticker,
            "name": name,
            "current_price": current_price,
            "return_1d": return_1d,
            "return_5d": return_5d,
            "return_20d": return_20d,
            "momentum_score": momentum_score,
            "sharpe_ratio": sharpe_ratio,
            "final_score": final_score,
            "last_updated": dates[-1]
        })
        
    # Sort by final_score descending
    results = sorted(results, key=lambda x: x['final_score'], reverse=True)
    return results

def get_etf_simulation(criteria="momentum"):
    check_and_update_etf_data()
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
        
    df = df[df['ticker'].isin(ETF_TARGETS.keys())]
        
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
        if i < 21:
            # Need at least 21 days for 20-day return calculation
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
                prev_20d_p = pivot[ticker].iloc[i-20]
                
                ret_1d = ((curr_p - prev_1d_p) / prev_1d_p) * 100
                ret_5d = ((curr_p - prev_5d_p) / prev_5d_p) * 100
                ret_20d = ((curr_p - prev_20d_p) / prev_20d_p) * 100
                score = (ret_1d * 0.5) + (ret_5d * 0.3) + (ret_20d * 0.2)
                
                final_score = score
                if criteria == "sharpe":
                    slice_20 = pivot[ticker].iloc[i-20:i+1]
                    daily_rets = slice_20.pct_change() * 100
                    std_dev = daily_rets.std()
                    if not pd.isna(std_dev) and std_dev > 0:
                        final_score = score / std_dev
                
                if final_score > best_score:
                    best_score = final_score
                    best_ticker = ticker
            except:
                pass
                
        # 현금(CASH) 방어 로직: 가장 높은 모멘텀 점수가 0.5 이하면 투자하지 않음
        if best_score <= 0.5:
            best_ticker = "CASH"
            
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
