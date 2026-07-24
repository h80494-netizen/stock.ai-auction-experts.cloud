import os
import pandas as pd
import json
from database import init_db, insert_stock, insert_financials, get_db_connection

def build_db_from_excel():
    init_db()
    data_dir = os.path.join(os.path.dirname(__file__), "data")
    
    # First, load base stocks from krx100.json
    krx_path = os.path.join(data_dir, "krx100.json")
    stocks = []
    if os.path.exists(krx_path):
        with open(krx_path, 'r', encoding='utf-8') as f:
            stocks = json.load(f)
            
    # Try to load excel data
    # In a real environment, we'd parse exact columns. Here we map known structures or mock if unavailable.
    excel_files = [f for f in os.listdir(data_dir) if "240808" in f and f.endswith(".xlsm") and "decrypted" in f]
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM financials")
    c.execute("DELETE FROM stocks")
    conn.commit()
    conn.close()

    print("Building DB from krx100 and generating baseline financials...")
    for s in stocks:
        ticker = s.get("ticker", "")
        name = s.get("name", "")
        if not ticker: continue
        
        # Base values (use simulated price from krx100.json, do not override with yfinance 2024 real data)
        try:
            price = float(str(s.get("price", "50000")).replace(",", ""))
        except:
            price = 50000
            
        try:
            import yfinance as yf
            info = yf.Ticker(f"{ticker.split(':')[-1]}.KS").info
            outstanding_shares = info.get("sharesOutstanding") or 10000000
        except:
            outstanding_shares = 10000000
            
        par_value = 500
        capital = par_value * outstanding_shares
        
        insert_stock(ticker, name, price, outstanding_shares, par_value, capital)
        
        # Insert mock/baseline 4-year financials scaled to the real price
        years = ["2023", "2024", "2025", "2026"]
        
        # 역산하여 대략적인 EPS, BPS 생성
        target_eps = price / 15  # PER 15 가정
        target_bps = price / 1.2 # PBR 1.2 가정
        
        # 역산된 순이익, 자본
        base_np = target_eps * outstanding_shares
        base_equity = target_bps * outstanding_shares
        base_op = base_np * 1.25 # 영업이익은 순이익의 1.25배 가정
        
        for i, y in enumerate(years):
            op = base_op * (1 + (i*0.1))
            np = base_np * (1 + (i*0.1))
            equity = base_equity * (1 + (i*0.05))
            debt = equity * 0.8
            eps = np / outstanding_shares if outstanding_shares > 0 else 0
            bps = equity / outstanding_shares if outstanding_shares > 0 else 0
            per = price / eps if eps > 0 else 0
            pbr = price / bps if bps > 0 else 0
            roe = (np / equity) * 100 if equity > 0 else 0
            
            insert_financials(ticker, y, op, np, equity, debt, eps, bps, per, pbr, roe)
            
    print("Database built successfully.")

if __name__ == "__main__":
    build_db_from_excel()
