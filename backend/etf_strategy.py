import sqlite3
import os
import requests
import time
import math
import pandas as pd
import yfinance as yf
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

FINNHUB_API_KEY = os.environ.get("FINNHUB_API_KEY")

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
    
    tickers = list(ETF_TARGETS.keys())
    success = False
    try:
        raw_df = yf.download(tickers, period="2y", progress=False)
        if isinstance(raw_df.columns, pd.MultiIndex):
            df = raw_df["Close"].copy()
        else:
            df = raw_df.copy()
            
        if not df.empty:
            df = df.ffill()
            last_date = df.index[-1]
            
            # Fetch real latest prices using fast_info / ticker object to replace NaN or stale ffill prices on last_date
            for ticker in tickers:
                try:
                    t_obj = yf.Ticker(ticker)
                    last_price = t_obj.fast_info.get('lastPrice')
                    if last_price and not math.isnan(last_price) and float(last_price) > 0:
                        df.loc[last_date, ticker] = float(last_price)
                    else:
                        hist = t_obj.history(period="5d", interval="15m")
                        if not hist.empty:
                            valid_closes = hist['Close'].dropna()
                            if not valid_closes.empty:
                                df.loc[last_date, ticker] = float(valid_closes.iloc[-1])
                except Exception as ex:
                    print(f"Fetch real price failed for {ticker}: {ex}")
                        
            df = df.ffill().bfill()
            
            c.execute("DELETE FROM etf_daily_prices")
            records = []
            for date_idx, row in df.iterrows():
                date_str = date_idx.strftime('%Y-%m-%d')
                for ticker in tickers:
                    if ticker in row and not pd.isna(row[ticker]):
                        c_val = float(row[ticker])
                        if c_val > 0 and not math.isnan(c_val) and not math.isinf(c_val):
                            records.append((ticker, date_str, c_val))
            
            c.executemany('''
                INSERT OR REPLACE INTO etf_daily_prices (ticker, date, close) 
                VALUES (?, ?, ?)
            ''', records)
            conn.commit()
            success = True
    except Exception as e:
        print(f"Failed to fetch ETF data from yfinance bulk download: {e}")
        
    c.execute("DELETE FROM etf_daily_prices WHERE close IS NULL OR close <= 0")
    conn.commit()
    conn.close()
    
    if success:
        with open(os.path.join(DATA_DIR, 'last_update.txt'), 'w') as f:
            f.write(datetime.now().strftime('%Y-%m-%d %H:%M:%S'))

def check_and_update_etf_data():
    last_update_file = os.path.join(DATA_DIR, 'last_update.txt')
    needs_update = True
    
    init_db()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("SELECT count(*), max(date) FROM etf_daily_prices")
    row = c.fetchone()
    conn.close()
    
    count_val = row[0] if row else 0
    max_db_date = row[1] if row and row[1] else ""
    today_str = datetime.now().strftime('%Y-%m-%d')
    
    if os.path.exists(last_update_file):
        with open(last_update_file, 'r') as f:
            last_time_str = f.read().strip()
            try:
                last_time = datetime.strptime(last_time_str, '%Y-%m-%d %H:%M:%S')
                if (datetime.now() - last_time).total_seconds() < 2 * 3600 and max_db_date >= today_str:
                    needs_update = False
            except:
                pass
                
    if needs_update:
        if count_val > 0:
            # DB has existing data: trigger update in a background thread so API call is fast & non-blocking
            import threading
            threading.Thread(target=update_etf_data, daemon=True).start()
        else:
            # DB is empty: must fetch initial data synchronously
            update_etf_data()

def sanitize_val(val, default=0.0):
    if val is None:
        return default
    try:
        val_f = float(val)
        if math.isnan(val_f) or math.isinf(val_f):
            return default
        return val_f
    except (ValueError, TypeError):
        return default

def get_etf_strategy_results(criteria="momentum", top_n=1, w1=0.5, w5=0.3, w20=0.2):
    try:
        top_n = max(1, min(4, int(top_n)))
    except (ValueError, TypeError):
        top_n = 1

    check_and_update_etf_data()
    init_db()
    conn = sqlite3.connect(DB_PATH)
    
    results = []
    try:
        # Load all prices into a dataframe
        df = pd.read_sql_query("SELECT * FROM etf_daily_prices WHERE close IS NOT NULL AND close > 0 ORDER BY date ASC", conn)
        if df.empty:
            update_etf_data()
            df = pd.read_sql_query("SELECT * FROM etf_daily_prices WHERE close IS NOT NULL AND close > 0 ORDER BY date ASC", conn)
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
        
        current_price = sanitize_val(closes[-1])
        prev_1d_price = sanitize_val(closes[-2])
        prev_5d_price = sanitize_val(closes[-6] if len(closes) >= 6 else closes[0])
        prev_20d_price = sanitize_val(closes[-21] if len(closes) >= 21 else closes[0])
        
        return_1d = sanitize_val(((current_price - prev_1d_price) / prev_1d_price) * 100) if prev_1d_price > 0 else 0.0
        return_5d = sanitize_val(((current_price - prev_5d_price) / prev_5d_price) * 100) if prev_5d_price > 0 else 0.0
        return_20d = sanitize_val(((current_price - prev_20d_price) / prev_20d_price) * 100) if prev_20d_price > 0 else 0.0
        
        momentum_score = sanitize_val((return_1d * w1) + (return_5d * w5) + (return_20d * w20))
        
        sharpe_ratio = 0.0
        if criteria == "sharpe":
            recent_20 = ticker_df.tail(21).copy() # 21 rows for 20 returns
            recent_20['daily_ret'] = recent_20['close'].pct_change() * 100
            std_dev = recent_20['daily_ret'].std()
            if pd.isna(std_dev) or std_dev == 0:
                sharpe_ratio = momentum_score
            else:
                sharpe_ratio = sanitize_val(momentum_score / std_dev)
                
        final_score = sanitize_val(sharpe_ratio if criteria == "sharpe" else momentum_score)
        
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
            "last_updated": dates[-1] if dates else ""
        })
        
    # Sort by final_score descending
    results = sorted(results, key=lambda x: x['final_score'], reverse=True)
    
    # Assign ranks & recommended weights based on top_n
    equal_weight = round(100.0 / top_n, 1)
    for idx, item in enumerate(results):
        item["rank"] = idx + 1
        if idx < top_n and item["final_score"] > 0.5:
            item["is_selected"] = True
            item["recommended_weight"] = equal_weight
        else:
            item["is_selected"] = False
            item["recommended_weight"] = 0.0
            
    return results

from functools import lru_cache

@lru_cache(maxsize=1)
def get_cached_etf_pivot(cache_key=None):
    check_and_update_etf_data()
    init_db()
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql_query("SELECT * FROM etf_daily_prices WHERE close IS NOT NULL AND close > 0 ORDER BY date ASC", conn)
    except:
        conn.close()
        return None
    conn.close()
    
    if df.empty:
        return None
        
    df = df[df['ticker'].isin(ETF_TARGETS.keys())]
    pivot = df.pivot(index='date', columns='ticker', values='close')
    pivot = pivot.ffill().dropna()
    return pivot

def get_etf_simulation(criteria="momentum", top_n=1, w1=0.5, w5=0.3, w20=0.2):
    try:
        top_n = max(1, min(4, int(top_n)))
    except (ValueError, TypeError):
        top_n = 1

    check_and_update_etf_data()
    
    try:
        with open(os.path.join(DATA_DIR, 'last_update.txt'), 'r') as f:
            cache_key = f.read().strip()
    except:
        cache_key = "0"
        
    pivot = get_cached_etf_pivot(cache_key)
    
    if pivot is None:
        return {}
        
    dates = pivot.index.tolist()
    if len(dates) < 6:
        return {}
        
    etf_normalized = {ticker: [100.0] * len(dates) for ticker in pivot.columns}
    strategy_returns = [100.0] * len(dates)
    selected_etf = [""] * len(dates)
    selected_etf_lists = [[] for _ in range(len(dates))]
    
    # Calculate ETF individual normalized base 100
    for ticker in pivot.columns:
        base_price = float(pivot[ticker].iloc[0])
        for i, date in enumerate(dates):
            val = (pivot[ticker].iloc[i] / base_price) * 100.0 if base_price > 0 else 100.0
            etf_normalized[ticker][i] = sanitize_val(val, 100.0)
    ret_1d_df = pivot.pct_change(1) * 100
    ret_5d_df = pivot.pct_change(5) * 100
    ret_20d_df = pivot.pct_change(20) * 100
    
    if criteria == "sharpe":
        daily_rets = pivot.pct_change() * 100
        rolling_std_df = daily_rets.rolling(window=21).std()
    
    current_targets = []
    
    for i in range(len(dates)):
        if i < 21:
            selected_etf[i] = "Waiting"
            selected_etf_lists[i] = ["Waiting"]
            continue
            
        scores = []
        for ticker in pivot.columns:
            try:
                r1 = ret_1d_df[ticker].iloc[i]
                r5 = ret_5d_df[ticker].iloc[i]
                r20 = ret_20d_df[ticker].iloc[i]
                
                if pd.isna(r1) or pd.isna(r5) or pd.isna(r20):
                    continue
                    
                score = (r1 * w1) + (r5 * w5) + (r20 * w20)
                final_score = score
                
                if criteria == "sharpe":
                    std_dev = rolling_std_df[ticker].iloc[i]
                    if not pd.isna(std_dev) and std_dev > 0:
                        final_score = score / std_dev
                
                scores.append((ticker, final_score))
            except:
                continue
                
        # Sort by final_score descending
        scores.sort(key=lambda x: x[1], reverse=True)
        
        # Select top_n tickers
        top_candidates = scores[:top_n]
        selected_tickers = []
        for tkr, scr in top_candidates:
            if scr <= 0.5:
                selected_tickers.append("CASH")
            else:
                selected_tickers.append(tkr)
                
        # If no valid tickers or less than top_n, fill remaining with CASH
        while len(selected_tickers) < top_n:
            selected_tickers.append("CASH")
            
        selected_etf[i] = ", ".join(selected_tickers)
        selected_etf_lists[i] = selected_tickers
        
        # Apply return from current_targets (selected at i-1)
        if current_targets:
            port_ret = 0.0
            for tgt in current_targets:
                if tgt in pivot.columns:
                    prev_p = float(pivot[tgt].iloc[i-1])
                    curr_p = float(pivot[tgt].iloc[i])
                    d_ret = (curr_p - prev_p) / prev_p if prev_p > 0 else 0.0
                    port_ret += d_ret
                else:
                    # CASH or Waiting: 0 return
                    port_ret += 0.0
            avg_daily_ret = port_ret / len(current_targets)
            strategy_returns[i] = sanitize_val(strategy_returns[i-1] * (1 + avg_daily_ret), 100.0)
        else:
            strategy_returns[i] = sanitize_val(strategy_returns[i-1], 100.0)
            
        current_targets = selected_tickers

    return {
        "dates": dates,
        "strategy": strategy_returns,
        "selected_etf": selected_etf,
        "selected_etf_list": selected_etf_lists,
        "etfs": etf_normalized
    }

def run_bulk_simulation(criteria="momentum", top_n=1):
    try:
        top_n = max(1, min(4, int(top_n)))
    except (ValueError, TypeError):
        top_n = 1

    models = []
    # Generate 21 models
    for i in range(21):
        w1_pct = 50 - i
        w5_pct = 40 - i
        w20_pct = 100 - w1_pct - w5_pct
        
        w1 = w1_pct / 100.0
        w5 = w5_pct / 100.0
        w20 = w20_pct / 100.0
        
        sim_data = get_etf_simulation(criteria, top_n, w1, w5, w20)
        
        if not sim_data or not sim_data.get('dates'):
            continue
            
        dates = sim_data['dates']
        strategy = sim_data['strategy']
        
        if len(dates) < 2:
            continue
            
        current_date = datetime.strptime(dates[-1], "%Y-%m-%d")
        
        def get_return(months_back):
            target_date = (current_date - timedelta(days=months_back*30)).strftime("%Y-%m-%d")
            start_idx = 0
            for j, d in enumerate(dates):
                if d >= target_date:
                    start_idx = j
                    break
            if start_idx >= len(strategy):
                start_idx = len(strategy) - 1
            
            start_val = strategy[start_idx]
            end_val = strategy[-1]
            if start_val == 0: return 0
            return ((end_val / start_val) - 1) * 100

        ret_3m = get_return(3)
        ret_6m = get_return(6)
        ret_1y = get_return(12)
        
        total_ret = ((strategy[-1] / strategy[0]) - 1) * 100
        
        strategy_series = pd.Series(strategy)
        daily_rets = strategy_series.pct_change().dropna()
        std_dev = daily_rets.std()
        mean_ret = daily_rets.mean()
        if std_dev > 0:
            sharpe_ratio = (mean_ret / std_dev) * (252 ** 0.5)
        else:
            sharpe_ratio = 0
            
        cum_max = strategy_series.cummax()
        drawdown = (strategy_series - cum_max) / cum_max
        mdd = drawdown.min() * 100
        
        selected_etf = sim_data['selected_etf']
        trades_returns = []
        entry_value = strategy[0]
        
        for j in range(1, len(selected_etf)):
            if selected_etf[j] != selected_etf[j-1]:
                exit_value = strategy[j]
                if entry_value > 0 and "Waiting" not in selected_etf[j-1] and "CASH" not in selected_etf[j-1] and selected_etf[j-1] != "":
                    trade_ret = ((exit_value - entry_value) / entry_value) * 100
                    trades_returns.append(trade_ret)
                entry_value = exit_value
                
        if "Waiting" not in selected_etf[-1] and "CASH" not in selected_etf[-1] and selected_etf[-1] != "" and entry_value > 0:
            exit_value = strategy[-1]
            trade_ret = ((exit_value - entry_value) / entry_value) * 100
            trades_returns.append(trade_ret)
            
        wins = [r for r in trades_returns if r > 0]
        losses = [r for r in trades_returns if r <= 0]
        
        win_rate = (len(wins) / len(trades_returns)) * 100 if trades_returns else 0
        avg_win = sum(wins) / len(wins) if wins else 0
        avg_loss = sum(losses) / len(losses) if losses else 0
            
        def sanitize_float(val):
            if pd.isna(val) or val == float('inf') or val == float('-inf'):
                return 0.0
            return float(val)
            
        models.append({
            "model": f"Model {i+1}",
            "weights": {"w1": w1_pct, "w5": w5_pct, "w20": w20_pct},
            "ret_3m": sanitize_float(ret_3m),
            "ret_6m": sanitize_float(ret_6m),
            "ret_1y": sanitize_float(ret_1y),
            "total_ret": sanitize_float(total_ret),
            "sharpe": sanitize_float(sharpe_ratio),
            "mdd": sanitize_float(mdd),
            "win_rate": sanitize_float(win_rate),
            "avg_win": sanitize_float(avg_win),
            "avg_loss": sanitize_float(avg_loss),
            "dates": dates,
            "strategy": [sanitize_float(s) for s in strategy],
            "selected_etf": selected_etf,
            "selected_etf_list": sim_data.get("selected_etf_list", [])
        })
        
    return models

