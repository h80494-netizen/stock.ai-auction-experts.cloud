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
            revenue_ttm REAL DEFAULT 0,
            operating_profit_ttm REAL DEFAULT 0,
            net_profit_ttm REAL DEFAULT 0,
            roe_ttm REAL DEFAULT 0,
            op_margin_ttm REAL DEFAULT 0,
            UNIQUE(ticker, year, quarter)
        )
    ''')
    
    # 동적 컬럼 덧붙이기 (기존 테이블 마이그레이션)
    ttm_cols = [
        ("revenue_ttm", "REAL DEFAULT 0"),
        ("operating_profit_ttm", "REAL DEFAULT 0"),
        ("net_profit_ttm", "REAL DEFAULT 0"),
        ("roe_ttm", "REAL DEFAULT 0"),
        ("op_margin_ttm", "REAL DEFAULT 0")
    ]
    for col_name, col_type in ttm_cols:
        try:
            c.execute(f"ALTER TABLE dart_financials ADD COLUMN {col_name} {col_type}")
        except Exception:
            pass
    
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

def prune_old_dart_financials_12quarters(ticker: str, max_quarters: int = 12):
    """
    개별 기업별로 최신 12개 분기(3년 분량) 데이터만 보관하고,
    12분기를 초과하는 가장 오래된 과거 분기 데이터는 DB에서 자동 삭제합니다.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT id, year, quarter FROM dart_financials
        WHERE ticker = ?
        ORDER BY year DESC, quarter DESC
    ''', (ticker,))
    rows = c.fetchall()
    
    if len(rows) > max_quarters:
        old_ids = [r['id'] for r in rows[max_quarters:]]
        placeholders = ','.join(['?'] * len(old_ids))
        c.execute(f"DELETE FROM dart_financials WHERE id IN ({placeholders})", old_ids)
        conn.commit()
        
    conn.close()

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
    
    # 최신 12분기 보관 유지 (12분기 초과 구 데이터 자동 삭제)
    try:
        prune_old_dart_financials_12quarters(ticker, max_quarters=12)
    except Exception:
        pass

def calculate_and_save_ttm_financials(ticker: str):
    """
    특정 종목의 과거 분기별 누적 재무 데이터에서
    직전 4개 분기 실적 합계(TTM, Trailing 12 Months)를 정교하게 산출하여 DB에 업데이트합니다.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM dart_financials WHERE ticker = ? ORDER BY year ASC, quarter ASC", (ticker,))
    rows = [dict(r) for r in c.fetchall()]
    
    if not rows:
        conn.close()
        return

    # 순수 3개월 분기 실적(Discrete Quarter) 구하기
    year_map = {}
    for r in rows:
        y = r['year']
        if y not in year_map:
            year_map[y] = {}
        year_map[y][r['quarter']] = r

    discrete_quarters = []
    for y in sorted(year_map.keys()):
        q_dict = year_map[y]
        q1 = q_dict.get('11013')
        q2 = q_dict.get('11012')
        q3 = q_dict.get('11014')
        fy = q_dict.get('11011')
        
        for q_code, q_obj in [('11013', q1), ('11012', q2), ('11014', q3), ('11011', fy)]:
            if not q_obj:
                continue
            
            raw_rev = q_obj.get('revenue') or 0
            raw_op = q_obj.get('operating_profit') or 0
            raw_np = q_obj.get('net_profit') or 0
            equity = q_obj.get('equity') or 0
            
            if q_code == '11013':
                s_rev, s_op, s_np = raw_rev, raw_op, raw_np
            elif q_code == '11012':
                prev = q1
                s_rev = raw_rev - (prev.get('revenue', 0) if prev else raw_rev / 2.0)
                s_op = raw_op - (prev.get('operating_profit', 0) if prev else raw_op / 2.0)
                s_np = raw_np - (prev.get('net_profit', 0) if prev else raw_np / 2.0)
            elif q_code == '11014':
                prev = q2
                s_rev = raw_rev - (prev.get('revenue', 0) if prev else raw_rev * 2 / 3.0)
                s_op = raw_op - (prev.get('operating_profit', 0) if prev else raw_op * 2 / 3.0)
                s_np = raw_np - (prev.get('net_profit', 0) if prev else raw_np * 2 / 3.0)
            else: # 11011
                prev = q3
                s_rev = raw_rev - (prev.get('revenue', 0) if prev else raw_rev * 3 / 4.0)
                s_op = raw_op - (prev.get('operating_profit', 0) if prev else raw_op * 3 / 4.0)
                s_np = raw_np - (prev.get('net_profit', 0) if prev else raw_np * 3 / 4.0)

            discrete_quarters.append({
                "id": q_obj['id'],
                "year": y,
                "quarter": q_code,
                "equity": equity,
                "s_rev": s_rev,
                "s_op": s_op,
                "s_np": s_np,
                "raw_rev": raw_rev,
                "raw_op": raw_op,
                "raw_np": raw_np
            })

    # TTM (직전 4개 분기 순수 실적 누적 합산) 계산
    for idx, dq in enumerate(discrete_quarters):
        start_idx = max(0, idx - 3)
        window = discrete_quarters[start_idx : idx + 1]
        
        if len(window) == 4:
            rev_ttm = sum(w['s_rev'] for w in window)
            op_ttm = sum(w['s_op'] for w in window)
            np_ttm = sum(w['s_np'] for w in window)
        else:
            factor = 4.0 / len(window)
            rev_ttm = sum(w['s_rev'] for w in window) * factor
            op_ttm = sum(w['s_op'] for w in window) * factor
            np_ttm = sum(w['s_np'] for w in window) * factor
            
        equity = dq['equity']
        roe_ttm = (np_ttm / equity * 100.0) if equity > 0 else 0
        op_margin_ttm = (op_ttm / rev_ttm * 100.0) if rev_ttm > 0 else 0
        
        c.execute('''
            UPDATE dart_financials SET
                revenue_ttm = ?,
                operating_profit_ttm = ?,
                net_profit_ttm = ?,
                roe_ttm = ?,
                op_margin_ttm = ?
            WHERE id = ?
        ''', (rev_ttm, op_ttm, np_ttm, roe_ttm, op_margin_ttm, dq['id']))
        
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
    
    # 종목별 최신 TTM 재무 데이터 조회
    c.execute('''
        SELECT f.* FROM dart_financials f
        INNER JOIN (
            SELECT ticker, MAX(year || '_' || quarter) as max_yq
            FROM dart_financials
            GROUP BY ticker
        ) latest ON f.ticker = latest.ticker AND (f.year || '_' || f.quarter) = latest.max_yq
    ''')
    rows = c.fetchall()
    conn.close()
    
    results = []
    for r in rows:
        item = dict(r)
        
        # 1. TTM 4분기 누적 연간 실적 우선 사용
        rev_ttm = item.get('revenue_ttm') or 0
        op_ttm = item.get('operating_profit_ttm') or 0
        np_ttm = item.get('net_profit_ttm') or 0
        equity = item.get('equity') or 0
        assets = item.get('assets') or 0
        
        quarter_str = str(item.get('quarter', ''))
        mult = 1.0 if quarter_str == '11011' else 4.0
        
        # TTM 값이 0인 경우 기본 연환산 fallback
        if rev_ttm == 0:
            rev_ttm = (item.get('revenue') or 0) * mult
        if op_ttm == 0:
            op_ttm = (item.get('operating_profit') or 0) * mult
        if np_ttm == 0:
            np_ttm = (item.get('net_profit') or 0) * mult

        roe = item.get('roe_ttm') or ((np_ttm / equity * 100.0) if equity > 0 else 0)
        op_margin = item.get('op_margin_ttm') or ((op_ttm / rev_ttm * 100.0) if rev_ttm > 0 else 0)
        
        rev_eok = rev_ttm / 100000000.0  # 억 원 단위
        op_eok = op_ttm / 100000000.0
        np_eok = np_ttm / 100000000.0
        
        # 다중 중복 조건 (Multi-filtering) 검사
        if conditions.get('use_roe', False):
            min_roe = conditions.get('min_roe')
            max_roe = conditions.get('max_roe')
            if roe is None:
                continue
            if min_roe is not None and roe < float(min_roe):
                continue
            if max_roe is not None and roe > float(max_roe):
                continue
                
        if conditions.get('use_op_margin', False):
            min_op_m = conditions.get('min_op_margin')
            if op_margin is None or op_margin < float(min_op_m):
                continue
                
        if conditions.get('use_revenue', False):
            min_rev = conditions.get('min_revenue')
            if min_rev is not None and rev_eok < float(min_rev):
                continue
                
        if conditions.get('use_op', False):
            min_op = conditions.get('min_op')
            if min_op is not None and op_eok < float(min_op):
                continue
                
        if conditions.get('use_net_profit', False):
            min_np = conditions.get('min_net_profit')
            if min_np is not None and np_eok < float(min_np):
                continue

        results.append({
            "ticker": item['ticker'],
            "year": item['year'],
            "quarter": item['quarter'],
            "is_ttm": True,
            "roe": round(roe, 2),
            "operating_margin": round(op_margin, 2),
            "revenue_eok": round(rev_eok, 1),
            "op_profit_eok": round(op_eok, 1),
            "net_profit_eok": round(np_eok, 1),
            "assets_eok": round(assets / 100000000.0, 1),
            "equity_eok": round(equity / 100000000.0, 1),
        })
        
    return results

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

def recalculate_all_ttm_financials():
    """DB에 수집된 모든 기업의 과거 분기 실적으로부터 TTM 4분기 누적 연간 실적을 일괄 산출 및 업데이트"""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT DISTINCT ticker FROM dart_financials")
    rows = c.fetchall()
    conn.close()
    
    tickers = [r['ticker'] for r in rows if r['ticker']]
    print(f"[TTM Batch] Recalculating TTM 4-quarter cumulative financials for {len(tickers)} companies...")
    for t in tickers:
        try:
            calculate_and_save_ttm_financials(t)
        except Exception:
            pass
    print(f"[TTM Batch] Recalculation complete!")

# Initialize DB when imported
init_db()
