import sqlite3
import os
import json

DB_FILE = os.path.join(os.path.dirname(__file__), "stock_data.sqlite3")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    c = conn.cursor()
    
    # 주식 기본 정보 테이블
    c.execute('''
        CREATE TABLE IF NOT EXISTS stocks (
            ticker TEXT PRIMARY KEY,
            name TEXT,
            price REAL,
            outstanding_shares REAL,
            par_value REAL,
            capital REAL,
            market_cap REAL,
            volume REAL,
            foreign_net_buy REAL,
            dividend REAL,
            description TEXT
        )
    ''')
    
    for col in ['market_cap REAL', 'volume REAL', 'foreign_net_buy REAL', 'dividend REAL', 'description TEXT']:
        try:
            c.execute(f'ALTER TABLE stocks ADD COLUMN {col}')
        except sqlite3.OperationalError:
            pass # Column already exists
    
    # 재무 정보 테이블 (연도별/분기별 혼합 사용 가능하도록 period 필드 사용. 예: "2023", "2024Q1")
    c.execute('''
        CREATE TABLE IF NOT EXISTS financials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT,
            period TEXT,
            operating_profit REAL,
            net_profit REAL,
            equity REAL,
            total_debt REAL,
            eps REAL,
            bps REAL,
            per REAL,
            pbr REAL,
            roe REAL,
            FOREIGN KEY(ticker) REFERENCES stocks(ticker)
        )
    ''')
    
    # DART 재무 정보 테이블
    c.execute('''
        CREATE TABLE IF NOT EXISTS dart_financials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT,
            year TEXT,
            quarter TEXT,
            assets REAL,
            equity REAL,
            liabilities REAL,
            revenue REAL,
            operating_profit REAL,
            net_profit REAL,
            UNIQUE(ticker, year, quarter)
        )
    ''')
    
    # 일자별 실현손익 테이블
    c.execute('''
        CREATE TABLE IF NOT EXISTS pnl_history (
            date TEXT PRIMARY KEY,
            realized_pnl REAL
        )
    ''')
    
    # 보유 잔고 테이블
    c.execute('''
        CREATE TABLE IF NOT EXISTS holdings (
            ticker TEXT PRIMARY KEY,
            name TEXT,
            buy_price REAL,
            qty INTEGER
        )
    ''')
    
    # 상세 거래원장 테이블
    c.execute('''
        CREATE TABLE IF NOT EXISTS trade_ledger (
            date TEXT PRIMARY KEY,
            total_buy REAL,
            total_sell REAL,
            fees REAL,
            tax REAL,
            net_pnl REAL,
            return_rate REAL
        )
    ''')
    
    # AI 목표가 일자별 테이블
    c.execute('''
        CREATE TABLE IF NOT EXISTS ai_targets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            ticker TEXT,
            name TEXT,
            target_price REAL,
            valuation_json TEXT,
            UNIQUE(date, ticker)
        )
    ''')
    
    # 애널리스트 목표가 추이 (네이버 파이낸스 등)
    c.execute('''
        CREATE TABLE IF NOT EXISTS analyst_targets_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker TEXT,
            date TEXT,
            target_price REAL,
            text TEXT,
            UNIQUE(ticker, date)
        )
    ''')
    
    # 해외주식 재무제표 캐시
    c.execute('''
        CREATE TABLE IF NOT EXISTS foreign_financials_cache (
            ticker TEXT PRIMARY KEY,
            updated_at TEXT,
            financials_json TEXT
        )
    ''')
    

    # Analyst Reports Cache
    c.execute('''
        CREATE TABLE IF NOT EXISTS analyst_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            title TEXT,
            item_code TEXT,
            item_name TEXT,
            target_price TEXT,
            opinion TEXT,
            broker TEXT,
            pdf_url TEXT,
            UNIQUE(date, title)
        )
    ''')
    # Trading Ledger
    c.execute('''
        CREATE TABLE IF NOT EXISTS trading_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trade_date TEXT,
            ticker TEXT,
            name TEXT,
            buy_price REAL,
            sell_price REAL,
            qty INTEGER,
            pnl REAL,
            status TEXT
        )
    ''')
    
    conn.commit()
    conn.close()

def insert_analyst_report(date, title, item_code, item_name, target_price, opinion, broker, pdf_url):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT OR IGNORE INTO analyst_reports (date, title, item_code, item_name, target_price, opinion, broker, pdf_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ''', (date, title, item_code, item_name, target_price, opinion, broker, pdf_url))
    conn.commit()
    conn.close()

def get_analyst_reports_from_db(keyword: str, start_date: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT * FROM analyst_reports 
        WHERE (item_code = ? OR item_name = ?) AND date >= ? 
        ORDER BY date DESC
    ''', (keyword, keyword, start_date))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def insert_stock(ticker, name, price, outstanding_shares, par_value, capital, market_cap=None, volume=None, foreign_net_buy=None, dividend=None, description=None):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT INTO stocks (ticker, name, price, outstanding_shares, par_value, capital, market_cap, volume, foreign_net_buy, dividend, description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
            name=excluded.name,
            price=excluded.price,
            outstanding_shares=excluded.outstanding_shares,
            par_value=excluded.par_value,
            capital=excluded.capital,
            market_cap=COALESCE(excluded.market_cap, stocks.market_cap),
            volume=COALESCE(excluded.volume, stocks.volume),
            foreign_net_buy=COALESCE(excluded.foreign_net_buy, stocks.foreign_net_buy),
            dividend=COALESCE(excluded.dividend, stocks.dividend),
            description=COALESCE(excluded.description, stocks.description)
    ''', (ticker, name, price, outstanding_shares, par_value, capital, market_cap, volume, foreign_net_buy, dividend, description))
    conn.commit()
    conn.close()

def insert_financials(ticker, period, op, np, equity, debt, eps, bps, per, pbr, roe):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT INTO financials (ticker, period, operating_profit, net_profit, equity, total_debt, eps, bps, per, pbr, roe)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (ticker, period, op, np, equity, debt, eps, bps, per, pbr, roe))
    conn.commit()
    conn.close()

def get_stock(ticker):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM stocks WHERE ticker = ?', (ticker,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def get_financials(ticker):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM financials WHERE ticker = ? ORDER BY period ASC', (ticker,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def insert_dart_financials(ticker, year, quarter, assets, equity, liabilities, revenue, operating_profit, net_profit):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT INTO dart_financials (ticker, year, quarter, assets, equity, liabilities, revenue, operating_profit, net_profit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker, year, quarter) DO UPDATE SET
            assets=excluded.assets,
            equity=excluded.equity,
            liabilities=excluded.liabilities,
            revenue=excluded.revenue,
            operating_profit=excluded.operating_profit,
            net_profit=excluded.net_profit
    ''', (ticker, year, quarter, assets, equity, liabilities, revenue, operating_profit, net_profit))
    conn.commit()
    conn.close()

def get_dart_financials(ticker):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM dart_financials WHERE ticker = ? ORDER BY year ASC, quarter ASC', (ticker,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]
    
def get_dart_screener_results(conditions: dict):
    conn = get_db_connection()
    c = conn.cursor()
    
    # 간단한 조건부 필터링 쿼리 예시
    # 실제로는 조건을 바탕으로 동적 쿼리를 생성해야 합니다.
    query = 'SELECT DISTINCT ticker FROM dart_financials WHERE 1=1'
    params = []
    
    # 임시 조건 예시
    if 'min_roe' in conditions:
        # ROE = net_profit / equity * 100
        query += ' AND (net_profit / equity * 100) >= ?'
        params.append(conditions['min_roe'])
        
    c.execute(query, params)
    rows = c.fetchall()
    tickers = [row['ticker'] for row in rows]
    conn.close()
    
    return tickers

def add_realized_pnl(date: str, amount: float):
    conn = get_db_connection()
    c = conn.cursor()
    # Check if date exists
    c.execute('SELECT realized_pnl FROM pnl_history WHERE date = ?', (date,))
    row = c.fetchone()
    if row:
        new_amount = row['realized_pnl'] + amount
        c.execute('UPDATE pnl_history SET realized_pnl = ? WHERE date = ?', (new_amount, date))
    else:
        c.execute('INSERT INTO pnl_history (date, realized_pnl) VALUES (?, ?)', (date, amount))
    conn.commit()
    conn.close()

def get_pnl_history():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM pnl_history ORDER BY date DESC')
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def update_holding(ticker: str, name: str, qty: int, price: float):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM holdings WHERE ticker = ?', (ticker,))
    row = c.fetchone()
    if row:
        new_qty = row['qty'] + qty
        if new_qty <= 0:
            c.execute('DELETE FROM holdings WHERE ticker = ?', (ticker,))
        else:
            if qty > 0:
                new_price = ((row['buy_price'] * row['qty']) + (price * qty)) / new_qty
            else:
                new_price = row['buy_price']
            c.execute('UPDATE holdings SET qty = ?, buy_price = ? WHERE ticker = ?', (new_qty, new_price, ticker))
    else:
        if qty > 0:
            c.execute('INSERT INTO holdings (ticker, name, buy_price, qty) VALUES (?, ?, ?, ?)', (ticker, name, price, qty))
    conn.commit()
    conn.close()

def get_holdings():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT ticker, name, buy_price as buyPrice, qty FROM holdings')
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def clear_holdings():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('DELETE FROM holdings')
    conn.commit()
    conn.close()

def add_ledger_record(date: str, total_buy: float, total_sell: float, fees: float, tax: float, net_pnl: float, return_rate: float):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM trade_ledger WHERE date = ?', (date,))
    row = c.fetchone()
    if row:
        new_buy = row['total_buy'] + total_buy
        new_sell = row['total_sell'] + total_sell
        new_fees = row['fees'] + fees
        new_tax = row['tax'] + tax
        new_pnl = row['net_pnl'] + net_pnl
        new_rr = (new_pnl / new_buy) * 100 if new_buy > 0 else 0
        c.execute('UPDATE trade_ledger SET total_buy=?, total_sell=?, fees=?, tax=?, net_pnl=?, return_rate=? WHERE date=?',
                  (new_buy, new_sell, new_fees, new_tax, new_pnl, new_rr, date))
    else:
        c.execute('INSERT INTO trade_ledger (date, total_buy, total_sell, fees, tax, net_pnl, return_rate) VALUES (?, ?, ?, ?, ?, ?, ?)',
                  (date, total_buy, total_sell, fees, tax, net_pnl, return_rate))
    conn.commit()
    conn.close()

def get_ledger_history():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM trade_ledger ORDER BY date DESC')
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_detailed_trading_ledger(date_str: str = None):
    conn = get_db_connection()
    c = conn.cursor()
    if date_str:
        c.execute('SELECT * FROM trading_ledger WHERE trade_date = ? ORDER BY id DESC', (date_str,))
    else:
        c.execute('SELECT * FROM trading_ledger ORDER BY trade_date DESC, id DESC')
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def get_ai_target(ticker: str, date_str: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT target_price, valuation_json FROM ai_targets WHERE ticker = ? AND date = ?', (ticker, date_str))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

def get_all_ai_targets(ticker: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT date as time, target_price as value FROM ai_targets WHERE ticker = ? ORDER BY date ASC', (ticker,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def insert_ai_target(ticker: str, name: str, date_str: str, target_price: float, valuation_json: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT OR REPLACE INTO ai_targets (date, ticker, name, target_price, valuation_json)
        VALUES (?, ?, ?, ?, ?)
    ''', (date_str, ticker, name, target_price, valuation_json))
    conn.commit()
    conn.close()

def insert_analyst_target_history(ticker: str, date: str, target_price: float, text: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT OR REPLACE INTO analyst_targets_history (ticker, date, target_price, text)
        VALUES (?, ?, ?, ?)
    ''', (ticker, date, target_price, text))
    conn.commit()
    conn.close()

def get_analyst_target_history(ticker: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT date as time, target_price, text FROM analyst_targets_history WHERE ticker = ? ORDER BY date ASC', (ticker,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def set_foreign_financials_cache(ticker: str, updated_at: str, financials_json: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        INSERT OR REPLACE INTO foreign_financials_cache (ticker, updated_at, financials_json)
        VALUES (?, ?, ?)
    ''', (ticker, updated_at, financials_json))
    conn.commit()
    conn.close()

def get_foreign_financials_cache(ticker: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT updated_at, financials_json FROM foreign_financials_cache WHERE ticker = ?', (ticker,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None

# Initialize DB when imported
init_db()
