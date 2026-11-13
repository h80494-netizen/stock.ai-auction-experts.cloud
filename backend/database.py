import sqlite3
import os
import json

DB_FILE = os.path.join(os.path.dirname(__file__), "stock_data.sqlite3")

def get_db_connection():
    conn = sqlite3.connect(DB_FILE, timeout=30.0)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
    except Exception:
        pass
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
    
    # 일자별 실현손익 테이블 (회원별 user_id 분리)
    c.execute('''
        CREATE TABLE IF NOT EXISTS pnl_history (
            user_id TEXT DEFAULT 'admin',
            date TEXT,
            realized_pnl REAL,
            PRIMARY KEY (user_id, date)
        )
    ''')
    try:
        c.execute("PRAGMA table_info(pnl_history)")
        pnl_cols = [r[1] for r in c.fetchall()]
        if "user_id" not in pnl_cols:
            c.execute("ALTER TABLE pnl_history RENAME TO pnl_history_legacy")
            c.execute('''
                CREATE TABLE pnl_history (
                    user_id TEXT DEFAULT 'admin',
                    date TEXT,
                    realized_pnl REAL,
                    PRIMARY KEY (user_id, date)
                )
            ''')
            c.execute("INSERT OR IGNORE INTO pnl_history (user_id, date, realized_pnl) SELECT 'admin', date, realized_pnl FROM pnl_history_legacy")
            c.execute("DROP TABLE pnl_history_legacy")
    except Exception as e:
        print("[DB Migration] pnl_history:", e)

    # 사용자 승인 요청 및 비밀번호 관리 테이블
    c.execute('''
        CREATE TABLE IF NOT EXISTS user_access_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            requested_password TEXT NOT NULL,
            status TEXT DEFAULT 'pending',
            created_at TEXT,
            approved_at TEXT
        )
    ''')

    # 회원별 개별 증권사 계좌 연동 및 운용 설정 테이블 (관리자 및 개별 회원 비밀 계좌 분리)
    c.execute('''
        CREATE TABLE IF NOT EXISTS user_trading_accounts (
            user_id TEXT PRIMARY KEY,
            user_name TEXT,
            broker_code TEXT DEFAULT 'KIS',
            broker_name TEXT DEFAULT '한국투자증권',
            account_mode TEXT DEFAULT 'PAPER',
            account_no TEXT DEFAULT '',
            acnt_prdt_cd TEXT DEFAULT '01',
            app_key TEXT DEFAULT '',
            app_secret TEXT DEFAULT '',
            max_total_capital REAL DEFAULT 100000000,
            max_per_stock_capital REAL DEFAULT 5000000,
            etf_order_qty INTEGER DEFAULT 100,
            etf_auto_trade INTEGER DEFAULT 1,
            is_connected INTEGER DEFAULT 0,
            updated_at TEXT
        )
    ''')

    # 보유 잔고 테이블 (회원별 user_id 분리)
    c.execute('''
        CREATE TABLE IF NOT EXISTS holdings (
            user_id TEXT DEFAULT 'admin',
            ticker TEXT,
            name TEXT,
            buy_price REAL,
            qty INTEGER,
            PRIMARY KEY (user_id, ticker)
        )
    ''')
    try:
        c.execute("PRAGMA table_info(holdings)")
        h_cols = [r[1] for r in c.fetchall()]
        if "user_id" not in h_cols:
            c.execute("ALTER TABLE holdings RENAME TO holdings_legacy")
            c.execute('''
                CREATE TABLE holdings (
                    user_id TEXT DEFAULT 'admin',
                    ticker TEXT,
                    name TEXT,
                    buy_price REAL,
                    qty INTEGER,
                    PRIMARY KEY (user_id, ticker)
                )
            ''')
            c.execute("INSERT OR IGNORE INTO holdings (user_id, ticker, name, buy_price, qty) SELECT 'admin', ticker, name, buy_price, qty FROM holdings_legacy")
            c.execute("DROP TABLE holdings_legacy")
    except Exception as e:
        print("[DB Migration] holdings:", e)
    
    # 상세 거래원장 테이블 (회원별 user_id 분리)
    c.execute('''
        CREATE TABLE IF NOT EXISTS trade_ledger (
            user_id TEXT DEFAULT 'admin',
            date TEXT,
            total_buy REAL,
            total_sell REAL,
            fees REAL,
            tax REAL,
            net_pnl REAL,
            return_rate REAL,
            PRIMARY KEY (user_id, date)
        )
    ''')
    try:
        c.execute("PRAGMA table_info(trade_ledger)")
        tl_cols = [r[1] for r in c.fetchall()]
        if "user_id" not in tl_cols:
            c.execute("ALTER TABLE trade_ledger RENAME TO trade_ledger_legacy")
            c.execute('''
                CREATE TABLE trade_ledger (
                    user_id TEXT DEFAULT 'admin',
                    date TEXT,
                    total_buy REAL,
                    total_sell REAL,
                    fees REAL,
                    tax REAL,
                    net_pnl REAL,
                    return_rate REAL,
                    PRIMARY KEY (user_id, date)
                )
            ''')
            c.execute('''
                INSERT OR IGNORE INTO trade_ledger (user_id, date, total_buy, total_sell, fees, tax, net_pnl, return_rate)
                SELECT 'admin', date, total_buy, total_sell, fees, tax, net_pnl, return_rate FROM trade_ledger_legacy
            ''')
            c.execute("DROP TABLE trade_ledger_legacy")
    except Exception as e:
        print("[DB Migration] trade_ledger:", e)
    
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
    # Trading Ledger (회원별 user_id 분리)
    c.execute('''
        CREATE TABLE IF NOT EXISTS trading_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT DEFAULT 'admin',
            trade_date TEXT,
            ticker TEXT,
            name TEXT,
            buy_price REAL,
            sell_price REAL,
            qty INTEGER,
            pnl REAL,
            status TEXT,
            batch_id TEXT,
            created_at TEXT
        )
    ''')
    for extra_col in ["user_id TEXT DEFAULT 'admin'", "batch_id TEXT", "created_at TEXT"]:
        try:
            c.execute(f"ALTER TABLE trading_ledger ADD COLUMN {extra_col}")
        except Exception:
            pass
    try:
        c.execute("UPDATE trading_ledger SET user_id = 'admin' WHERE user_id IS NULL OR user_id = ''")
    except Exception:
        pass
    
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
    
    # 1. 모든 dart_financials 데이터를 ticker별로 조회하여 최신 TTM과 전년 동분기 TTM 매칭
    c.execute("SELECT * FROM dart_financials ORDER BY ticker ASC, year DESC, quarter DESC")
    all_rows = [dict(r) for r in c.fetchall()]
    
    # 만약 dart_financials 데이터가 부족할 경우 기존 financials 및 stocks 테이블에서 fallback 조회
    if not all_rows:
        c.execute('''
            SELECT f.ticker, f.period as year, '11011' as quarter,
                   (f.net_profit * 100000000) as net_profit,
                   (f.operating_profit * 100000000) as operating_profit,
                   (f.equity * 100000000) as equity,
                   (f.net_profit * 100000000) as net_profit_ttm,
                   (f.operating_profit * 100000000) as operating_profit_ttm,
                   (f.net_profit * 10) as revenue_ttm,
                   f.roe as roe_ttm,
                   ((f.operating_profit / NULLIF(f.net_profit*10, 0))*100) as op_margin_ttm
            FROM financials f
            ORDER BY f.ticker ASC, f.id DESC
        ''')
        all_rows = [dict(r) for r in c.fetchall()]

    conn.close()
    
    # ticker별 그룹화
    ticker_map = {}
    for r in all_rows:
        tk = r['ticker']
        if tk not in ticker_map:
            ticker_map[tk] = []
        ticker_map[tk].append(r)
        
    results = []
    for tk, list_rows in ticker_map.items():
        if not list_rows:
            continue
            
        latest = list_rows[0] # 최신 TTM 레코드
        cur_year = int(latest['year']) if str(latest['year']).isdigit() else 2024
        cur_q = latest['quarter']
        
        # 1년 전 동일 분기 레코드 찾기 (예: 2024_11014 -> 2023_11014)
        prev_year_str = str(cur_year - 1)
        prev_item = next((x for x in list_rows if str(x['year']) == prev_year_str and x['quarter'] == cur_q), None)
        if not prev_item and len(list_rows) >= 4:
            prev_item = list_rows[min(4, len(list_rows)-1)]

        # 현재 TTM 실적
        rev_ttm = latest.get('revenue_ttm') or (latest.get('revenue') or 0) * (1.0 if cur_q == '11011' else 4.0)
        op_ttm = latest.get('operating_profit_ttm') or (latest.get('operating_profit') or 0) * (1.0 if cur_q == '11011' else 4.0)
        np_ttm = latest.get('net_profit_ttm') or (latest.get('net_profit') or 0) * (1.0 if cur_q == '11011' else 4.0)
        equity = latest.get('equity') or 0
        assets = latest.get('assets') or 0
        
        roe = latest.get('roe_ttm') or ((np_ttm / equity * 100.0) if equity > 0 else 0)
        op_margin = latest.get('op_margin_ttm') or ((op_ttm / rev_ttm * 100.0) if rev_ttm > 0 else 0)
        
        rev_eok = rev_ttm / 100000000.0
        op_eok = op_ttm / 100000000.0
        np_eok = np_ttm / 100000000.0
        
        # 전년 동분기 TTM 실적
        prev_roe = 0
        prev_rev_ttm = 0
        prev_op_ttm = 0
        prev_np_ttm = 0
        
        if prev_item:
            p_q = prev_item['quarter']
            p_mult = 1.0 if p_q == '11011' else 4.0
            prev_rev_ttm = prev_item.get('revenue_ttm') or (prev_item.get('revenue') or 0) * p_mult
            prev_op_ttm = prev_item.get('operating_profit_ttm') or (prev_item.get('operating_profit') or 0) * p_mult
            prev_np_ttm = prev_item.get('net_profit_ttm') or (prev_item.get('net_profit') or 0) * p_mult
            p_eq = prev_item.get('equity') or 0
            prev_roe = prev_item.get('roe_ttm') or ((prev_np_ttm / p_eq * 100.0) if p_eq > 0 else 0)
            
        # YoY 변화량 계산
        yoy_roe_diff = roe - prev_roe if prev_item else 0
        yoy_rev_growth = ((rev_ttm - prev_rev_ttm) / abs(prev_rev_ttm) * 100.0) if (prev_item and prev_rev_ttm != 0) else 0
        yoy_op_growth = ((op_ttm - prev_op_ttm) / abs(prev_op_ttm) * 100.0) if (prev_item and prev_op_ttm != 0) else 0
        yoy_np_growth = ((np_ttm - prev_np_ttm) / abs(prev_np_ttm) * 100.0) if (prev_item and prev_np_ttm != 0) else 0

        # 절대조건 필터링
        if conditions.get('use_roe', False):
            if roe < float(conditions.get('min_roe', -20)) or roe > float(conditions.get('max_roe', 200)):
                continue
        if conditions.get('use_op_margin', False):
            if op_margin < float(conditions.get('min_op_margin', 0)):
                continue
        if conditions.get('use_revenue', False):
            if rev_eok < float(conditions.get('min_revenue', 0)):
                continue
        if conditions.get('use_op', False):
            if op_eok < float(conditions.get('min_op', 0)):
                continue
        if conditions.get('use_net_profit', False):
            if np_eok < float(conditions.get('min_net_profit', 0)):
                continue
                
        # 전년대비(YoY) 지표 상승 필터링
        if conditions.get('use_yoy_roe_up', False):
            min_diff = float(conditions.get('min_yoy_roe_diff', 0))
            if prev_item and yoy_roe_diff < min_diff:
                continue
            if not prev_item and min_diff > 0:
                continue
                
        if conditions.get('use_yoy_rev_up', False):
            min_rev_g = float(conditions.get('min_yoy_rev_growth', 0))
            if prev_item and yoy_rev_growth < min_rev_g:
                continue
            if not prev_item and min_rev_g > 0:
                continue
                
        if conditions.get('use_yoy_op_up', False):
            min_op_g = float(conditions.get('min_yoy_op_growth', 0))
            if prev_item and yoy_op_growth < min_op_g:
                continue
            if not prev_item and min_op_g > 0:
                continue
                
        if conditions.get('use_yoy_np_up', False):
            min_np_g = float(conditions.get('min_yoy_np_growth', 0))
            if prev_item and yoy_np_growth < min_np_g:
                continue
            if not prev_item and min_np_g > 0:
                continue

        results.append({
            "ticker": tk,
            "year": latest['year'],
            "quarter": latest['quarter'],
            "is_ttm": True,
            "roe": round(roe, 2),
            "operating_margin": round(op_margin, 2),
            "revenue_eok": round(rev_eok, 1),
            "op_profit_eok": round(op_eok, 1),
            "net_profit_eok": round(np_eok, 1),
            "assets_eok": round(assets / 100000000.0, 1),
            "equity_eok": round(equity / 100000000.0, 1),
            # YoY 전년대비 수치
            "has_yoy": prev_item is not None,
            "yoy_roe_diff": round(yoy_roe_diff, 2),
            "yoy_rev_growth": round(yoy_rev_growth, 1),
            "yoy_op_growth": round(yoy_op_growth, 1),
            "yoy_np_growth": round(yoy_np_growth, 1),
        })

    return results

def _norm_uid(user_id: str = "admin") -> str:
    if not user_id or not str(user_id).strip():
        return "admin"
    return str(user_id).strip()


def _ensure_trading_ledger_columns(c):
    for extra_col in ["user_id TEXT DEFAULT 'admin'", "batch_id TEXT", "created_at TEXT"]:
        try:
            c.execute(f"ALTER TABLE trading_ledger ADD COLUMN {extra_col}")
        except Exception:
            pass


def add_realized_pnl(date: str, amount: float, user_id: str = "admin"):
    """일자별 실현손익을 회원별(user_id)로 멱등성 있게 확정 기록(덮어쓰기)하여 중복 합산을 방지합니다."""
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        '''
        INSERT INTO pnl_history (user_id, date, realized_pnl)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET realized_pnl = excluded.realized_pnl
        ''',
        (uid, date, amount),
    )
    conn.commit()
    conn.close()


def get_pnl_history(user_id: str = "admin"):
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM pnl_history WHERE user_id = ? ORDER BY date DESC', (uid,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def can_execute_initial_buy(trade_date: str, ticker: str = "", batch_id: str = "", user_id: str = "admin") -> tuple:
    """
    당일 최초 매수주문만 허용하고 이후 추가 매수를 원천 차단합니다 (회원별 user_id 독립 적용).
    반환값: (허용여부: bool, 사유: str)
    """
    from datetime import datetime, timedelta
    from trading_config import get_trading_config

    uid = _norm_uid(user_id)
    cfg = get_trading_config()
    max_stocks = int(cfg["max_stocks"])
    window_sec = int(cfg["initial_buy_window_sec"])

    conn = get_db_connection()
    c = conn.cursor()
    _ensure_trading_ledger_columns(c)

    # 1) 이미 당일 정산 완료된 기록이 있으면 추가 매수 불가
    c.execute("SELECT 1 FROM trade_ledger WHERE user_id = ? AND date = ?", (uid, trade_date))
    if c.fetchone():
        conn.close()
        return False, "금일 매매 정산이 이미 완료되어 추가 매수가 불가합니다."

    c.execute(
        "SELECT id, ticker, status, batch_id, created_at FROM trading_ledger WHERE user_id = ? AND trade_date = ? ORDER BY id ASC",
        (uid, trade_date),
    )
    ledger_rows = c.fetchall()

    if any(r["status"] == "SELL" for r in ledger_rows):
        conn.close()
        return False, "금일 매도 정산이 이미 진행되어 추가 매수가 불가합니다."

    # 당일 최초 매수 전이라면 전일 보유잔고(holdings)가 남아있더라도 금일 매수를 차단하지 않도록 정리
    if not ledger_rows:
        if ticker or batch_id:
            c.execute("DELETE FROM holdings WHERE user_id = ?", (uid,))
            conn.commit()
        conn.close()
        return True, "OK"

    # 2) 동일 종목 중복/추가 매수 차단
    if ticker:
        pure_t = ticker.split(":")[-1]
        c.execute("SELECT 1 FROM holdings WHERE user_id = ? AND (ticker = ? OR ticker = ?)", (uid, ticker, pure_t))
        if c.fetchone() or any((r["ticker"] or "").split(":")[-1] == pure_t for r in ledger_rows):
            conn.close()
            return False, f"{pure_t} 종목은 금일 이미 매수되어 추가 매수가 불가합니다."

    # 3) 종목 수 한도 검사 (기본 20종목)
    c.execute("SELECT COUNT(*) AS cnt FROM holdings WHERE user_id = ?", (uid,))
    h_cnt = int(c.fetchone()["cnt"] or 0)
    distinct_tickers = set((r["ticker"] or "").split(":")[-1] for r in ledger_rows if r["ticker"])
    if h_cnt >= max_stocks or len(distinct_tickers) >= max_stocks:
        conn.close()
        return False, f"최대 매수 종목 수({max_stocks}종목) 한도에 도달하여 추가 매수가 불가합니다."

    # 4) 당일 최초 매수 세션 여부 검증
    if ledger_rows:
        if not batch_id:
            conn.close()
            return False, "금일 최초 매수주문 이후 추가 매수는 허용되지 않습니다."

        existing_batches = [r["batch_id"] for r in ledger_rows if r["batch_id"]]
        if not existing_batches or batch_id not in existing_batches:
            conn.close()
            return False, "금일 최초 매수주문 이후 추가 매수는 허용되지 않습니다."

        first_ts_str = next((r["created_at"] for r in ledger_rows if r["created_at"]), None)
        if first_ts_str:
            try:
                first_dt = datetime.fromisoformat(first_ts_str)
                now_kst = datetime.utcnow() + timedelta(hours=9)
                if (now_kst - first_dt).total_seconds() > window_sec:
                    conn.close()
                    return False, "금일 최초 매수주문 가능 시간이 경과하여 추가 매수는 허용되지 않습니다."
            except Exception:
                pass

    conn.close()
    return True, "OK"


def get_today_buy_total(trade_date: str, user_id: str = "admin") -> float:
    """당일 누적 매수금액을 회원별(user_id)로 반환합니다."""
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT COALESCE(SUM(buy_price * qty), 0) AS total FROM holdings WHERE user_id = ?", (uid,))
    h_total = float(c.fetchone()["total"] or 0.0)
    c.execute("SELECT COALESCE(SUM(buy_price * qty), 0) AS total FROM trading_ledger WHERE user_id = ? AND trade_date = ?", (uid, trade_date))
    l_total = float(c.fetchone()["total"] or 0.0)
    conn.close()
    return max(h_total, l_total)


def update_holding(ticker: str, name: str, qty: int, price: float, user_id: str = "admin"):
    from trading_config import get_trading_config
    uid = _norm_uid(user_id)
    cfg = get_trading_config()
    max_per_stock = float(cfg["max_per_stock_capital"])

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM holdings WHERE user_id = ? AND ticker = ?', (uid, ticker))
    row = c.fetchone()
    if row:
        if qty > 0:
            # 최초 매수 이후 동일 종목 추가 매수(수량 누적) 원천 차단
            conn.close()
            return
        new_qty = row['qty'] + qty
        if new_qty <= 0:
            c.execute('DELETE FROM holdings WHERE user_id = ? AND ticker = ?', (uid, ticker))
        else:
            c.execute('UPDATE holdings SET qty = ?, buy_price = ? WHERE user_id = ? AND ticker = ?', (new_qty, row['buy_price'], uid, ticker))
    else:
        if qty > 0 and price > 0:
            capped_qty = min(qty, int(max_per_stock // price))
            if capped_qty > 0:
                c.execute('INSERT INTO holdings (user_id, ticker, name, buy_price, qty) VALUES (?, ?, ?, ?, ?)', (uid, ticker, name, price, capped_qty))
    conn.commit()
    conn.close()


def get_holdings(user_id: str = "admin"):
    from datetime import datetime, timedelta
    uid = _norm_uid(user_id)
    now_kst = datetime.utcnow() + timedelta(hours=9)
    today_str = now_kst.strftime("%Y-%m-%d")
    time_val = now_kst.hour * 60 + now_kst.minute

    conn = get_db_connection()
    c = conn.cursor()

    # 1) 당일 이미 종가/일괄 매도 정산(status='SELL' 또는 trade_ledger 정산)이 완료되었거나,
    #    전일 이전 잔고가 남아있는 경우 holdings를 즉시 비움
    c.execute(
        "SELECT COUNT(*) FROM trading_ledger WHERE user_id = ? AND trade_date = ? AND status = 'SELL'",
        (uid, today_str),
    )
    sold_today_cnt = c.fetchone()[0]
    c.execute(
        "SELECT COUNT(*) FROM trading_ledger WHERE user_id = ? AND trade_date = ? AND status = 'BUY'",
        (uid, today_str),
    )
    active_buy_today_cnt = c.fetchone()[0]

    if sold_today_cnt > 0 and active_buy_today_cnt == 0:
        c.execute("DELETE FROM holdings WHERE user_id = ?", (uid,))
        conn.commit()
        conn.close()
        return []

    c.execute('SELECT ticker, name, buy_price as buyPrice, qty FROM holdings WHERE user_id = ?', (uid,))
    rows = c.fetchall()

    # 전일 미정리 잔고가 남아있고 금일 매수 내역이 아예 없는 경우 정리
    if rows and active_buy_today_cnt == 0 and sold_today_cnt == 0:
        c.execute("SELECT MAX(trade_date) FROM trading_ledger WHERE user_id = ?", (uid,))
        latest_td = (c.fetchone() or [None])[0]
        if latest_td and latest_td < today_str:
            c.execute("DELETE FROM holdings WHERE user_id = ?", (uid,))
            conn.commit()
            rows = []

    # 2) 장중(15:30 이전) 금일 매수 상태(status='BUY')인데 holdings가 비어있는 경우에만 자동 복원
    if not rows and time_val < (15 * 60 + 30) and active_buy_today_cnt > 0:
        c.execute(
            "SELECT ticker, name, buy_price, qty FROM trading_ledger WHERE user_id = ? AND trade_date = ? AND status = 'BUY' ORDER BY id ASC",
            (uid, today_str),
        )
        buy_rows = c.fetchall()
        if buy_rows:
            for br in buy_rows:
                tk = br["ticker"]
                nm = br["name"] or tk
                bp = float(br["buy_price"] or 0)
                qt = int(br["qty"] or 0)
                if tk and bp > 0 and qt > 0:
                    c.execute(
                        "INSERT OR IGNORE INTO holdings (user_id, ticker, name, buy_price, qty) VALUES (?, ?, ?, ?, ?)",
                        (uid, tk, nm, bp, qt),
                    )
            conn.commit()
            c.execute('SELECT ticker, name, buy_price as buyPrice, qty FROM holdings WHERE user_id = ?', (uid,))
            rows = c.fetchall()

    conn.close()
    return [dict(row) for row in rows]


def clear_holdings(user_id: str = "admin"):
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('DELETE FROM holdings WHERE user_id = ?', (uid,))
    conn.commit()
    conn.close()


def add_ledger_record(date: str, total_buy: float, total_sell: float, fees: float, tax: float, net_pnl: float, return_rate: float, user_id: str = "admin"):
    """
    당일 일괄 매도 정산 결과를 회원별(user_id)로 trade_ledger에 멱등성 있게 덮어쓰기(UPSERT)합니다.
    """
    from trading_config import get_trading_config, calculate_settlement_metrics
    uid = _norm_uid(user_id)
    cfg = get_trading_config()
    max_total = float(cfg["max_total_capital"])

    if total_buy > max_total and total_buy > 0:
        scale = max_total / total_buy
        total_buy = round(total_buy * scale, 2)
        total_sell = round(total_sell * scale, 2)
        metrics = calculate_settlement_metrics(total_buy, total_sell)
        fees = metrics["fees"]
        tax = metrics["tax"]
        net_pnl = metrics["net_pnl"]
        return_rate = metrics["return_rate"]

    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        '''
        INSERT INTO trade_ledger (user_id, date, total_buy, total_sell, fees, tax, net_pnl, return_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
            total_buy = excluded.total_buy,
            total_sell = excluded.total_sell,
            fees = excluded.fees,
            tax = excluded.tax,
            net_pnl = excluded.net_pnl,
            return_rate = excluded.return_rate
        ''',
        (uid, date, total_buy, total_sell, fees, tax, net_pnl, return_rate),
    )
    conn.commit()
    conn.close()


def record_trading_buy(trade_date: str, ticker: str, name: str, buy_price: float, qty: int, batch_id: str = "", user_id: str = "admin"):
    """
    당일 최초 매수 주문 체결 내역을 회원별(user_id)로 상세 거래원장(trading_ledger)에 단일 기록합니다.
    """
    from datetime import datetime, timedelta
    from trading_config import get_trading_config

    uid = _norm_uid(user_id)
    cfg = get_trading_config()
    max_per_stock = float(cfg["max_per_stock_capital"])
    if buy_price > 0:
        qty = min(qty, int(max_per_stock // buy_price))
    if qty <= 0:
        return

    now_kst_iso = (datetime.utcnow() + timedelta(hours=9)).isoformat(timespec="seconds")

    conn = get_db_connection()
    c = conn.cursor()
    _ensure_trading_ledger_columns(c)
    c.execute("SELECT id FROM trading_ledger WHERE user_id = ? AND trade_date = ? AND ticker = ?", (uid, trade_date, ticker))
    row = c.fetchone()
    if not row:
        c.execute('''
            INSERT INTO trading_ledger (user_id, trade_date, ticker, name, buy_price, qty, status, batch_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'BUY', ?, ?)
        ''', (uid, trade_date, ticker, name, buy_price, qty, batch_id or None, now_kst_iso))
    conn.commit()
    conn.close()


def record_trading_sell_all(trade_date: str, sell_items: list, user_id: str = "admin"):
    """
    일괄 매도시 각 종목의 매도가, 실현손익 및 SELL 상태를 회원별(user_id)로 trading_ledger에 확정 기록합니다.
    """
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    _ensure_trading_ledger_columns(c)
    for item in sell_items:
        t = item['ticker']
        sp = item['sell_price']
        pnl = item['pnl']
        bp = item['buy_price']
        qty = item['qty']
        name = item.get('name', t)

        c.execute("SELECT id FROM trading_ledger WHERE user_id = ? AND trade_date = ? AND ticker = ? ORDER BY id ASC", (uid, trade_date, t))
        rows = c.fetchall()
        if rows:
            keep_id = rows[0]['id']
            c.execute(
                "UPDATE trading_ledger SET name = ?, buy_price = ?, sell_price = ?, qty = ?, pnl = ?, status = 'SELL' WHERE id = ?",
                (name, bp, sp, qty, pnl, keep_id),
            )
            if len(rows) > 1:
                dup_ids = [r['id'] for r in rows[1:]]
                placeholders = ",".join("?" for _ in dup_ids)
                c.execute(f"DELETE FROM trading_ledger WHERE id IN ({placeholders})", dup_ids)
        else:
            c.execute('''
                INSERT INTO trading_ledger (user_id, trade_date, ticker, name, buy_price, sell_price, qty, pnl, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SELL')
            ''', (uid, trade_date, t, name, bp, sp, qty, pnl))
    conn.commit()
    conn.close()


def get_ledger_history(user_id: str = "admin"):
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM trade_ledger WHERE user_id = ? ORDER BY date DESC', (uid,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]


def get_detailed_trading_ledger(date_str: str = None, user_id: str = "admin"):
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    if date_str:
        c.execute('SELECT * FROM trading_ledger WHERE user_id = ? AND trade_date = ? ORDER BY id DESC', (uid, date_str))
    else:
        c.execute('SELECT * FROM trading_ledger WHERE user_id = ? ORDER BY trade_date DESC, id DESC', (uid,))
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

def create_user_request(name: str, phone: str, email: str, requested_password: str):
    import datetime
    conn = get_db_connection()
    c = conn.cursor()
    created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute('''
        INSERT INTO user_access_requests (name, phone, email, requested_password, status, created_at)
        VALUES (?, ?, ?, ?, 'pending', ?)
    ''', (name, phone, email, requested_password, created_at))
    conn.commit()
    req_id = c.lastrowid
    conn.close()
    return req_id

def get_all_user_requests():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT id, name, phone, email, requested_password, status, created_at, approved_at FROM user_access_requests ORDER BY id DESC')
    rows = [dict(row) for row in c.fetchall()]
    conn.close()
    return rows

def update_user_request_status(request_id: int, status: str):
    import datetime
    conn = get_db_connection()
    c = conn.cursor()
    approved_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S") if status == 'approved' else None
    c.execute('''
        UPDATE user_access_requests
        SET status = ?, approved_at = ?
        WHERE id = ?
    ''', (status, approved_at, request_id))
    conn.commit()
    conn.close()

def verify_user_password(password: str):
    import os
    admin_master = os.environ.get("ADMIN_MASTER_PASSWORD", "h80494")
    # 마스터 관리자 비밀번호 (주인장)
    if password == admin_master:
        return {
            "authenticated": True,
            "is_admin": True,
            "user_id": "admin",
            "name": "주인장(관리자)",
        }

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT id, name, requested_password, status FROM user_access_requests
        WHERE requested_password = ? AND status = 'approved'
    ''', (password,))
    row = c.fetchone()
    conn.close()

    if row:
        uid = f"user_{row['id']}"
        return {
            "authenticated": True,
            "is_admin": False,
            "user_id": uid,
            "request_id": row["id"],
            "name": row["name"],
        }

    return {"authenticated": False, "is_admin": False, "user_id": None, "name": None}


SUPPORTED_BROKERS = {
    "KIS": "한국투자증권 (KIS)",
    "KIWOOM": "키움증권 (영웅문)",
    "MIRAE": "미래에셋증권 (M-STOCK)",
    "SAMSUNG": "삼성증권 (mPOP)",
    "NH": "NH투자증권 (나무/QV)",
    "KB": "KB증권 (M-able)",
    "DAISHIN": "대신증권 (크레온)",
    "TOSS": "토스증권",
}


def get_user_trading_account(user_id: str, include_secrets: bool = False) -> dict:
    """
    회원별 개별 증권사 계좌 연동 설정을 조회합니다.
    - 'admin'(주인장): 기존 한투 모의계좌(44790516-01) 설정을 기본값으로 유지
    - 일반 회원('user_<id>'): 주인장의 계좌나 트레이딩 기록이 전혀 노출되지 않으며,
      본인이 직접 연결한 개별 증권사 계좌만 반환 (미연결 시 is_connected=False, 빈 계좌)
    """
    import datetime
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM user_trading_accounts WHERE user_id = ?", (uid,))
    row = c.fetchone()

    if not row:
        now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        if uid == "admin":
            env_acc = os.environ.get("KIS_ACCOUNT_NO", "44790516-01").strip()
            cano = env_acc.split("-")[0] if "-" in env_acc else env_acc[:8]
            prdt = env_acc.split("-")[1] if "-" in env_acc and len(env_acc.split("-")[1]) == 2 else "01"
            app_k = os.environ.get("KIS_API_KEY", "").strip()
            app_s = os.environ.get("KIS_APP_SECRET", "").strip()
            c.execute(
                """
                INSERT OR REPLACE INTO user_trading_accounts (
                    user_id, user_name, broker_code, broker_name, account_mode,
                    account_no, acnt_prdt_cd, app_key, app_secret,
                    max_total_capital, max_per_stock_capital, etf_order_qty, etf_auto_trade,
                    is_connected, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "admin",
                    "주인장(관리자)",
                    "KIS",
                    "한국투자증권 (KIS)",
                    "PAPER",
                    cano,
                    prdt,
                    app_k,
                    app_s,
                    100000000.0,
                    5000000.0,
                    100,
                    1,
                    1,
                    now_str,
                ),
            )
            conn.commit()
            c.execute("SELECT * FROM user_trading_accounts WHERE user_id = ?", ("admin",))
            row = c.fetchone()
        else:
            # 일반 회원의 이름 조회
            u_name = uid
            if uid.startswith("user_") and uid.split("_")[1].isdigit():
                c.execute("SELECT name FROM user_access_requests WHERE id = ?", (int(uid.split("_")[1]),))
                ur = c.fetchone()
                if ur and ur["name"]:
                    u_name = ur["name"]
            conn.close()
            return {
                "user_id": uid,
                "user_name": u_name,
                "broker_code": "KIS",
                "broker_name": SUPPORTED_BROKERS["KIS"],
                "account_mode": "PAPER",
                "account_no": "",
                "acnt_prdt_cd": "01",
                "account_display": "미연결 (계좌 등록 필요)",
                "has_api_keys": False,
                "app_key_masked": "",
                "max_total_capital": 100000000.0,
                "max_per_stock_capital": 5000000.0,
                "etf_order_qty": 100,
                "etf_auto_trade": True,
                "is_connected": False,
                "updated_at": "",
            }

    conn.close()
    d = dict(row)
    b_code = d.get("broker_code") or "KIS"
    acc_no = (d.get("account_no") or "").strip()
    prdt = (d.get("acnt_prdt_cd") or "01").strip()
    app_k = (d.get("app_key") or "").strip()
    app_s = (d.get("app_secret") or "").strip()
    is_conn = bool(d.get("is_connected")) and bool(acc_no)

    res = {
        "user_id": d["user_id"],
        "user_name": d.get("user_name") or d["user_id"],
        "broker_code": b_code,
        "broker_name": SUPPORTED_BROKERS.get(b_code, d.get("broker_name") or b_code),
        "account_mode": d.get("account_mode") or "PAPER",
        "account_no": acc_no,
        "acnt_prdt_cd": prdt,
        "account_display": f"{acc_no}-{prdt}" if acc_no else "미연결 (계좌 등록 필요)",
        "has_api_keys": bool(app_k and app_s),
        "app_key_masked": (app_k[:4] + "••••" + app_k[-4:]) if len(app_k) >= 8 else ("••••" if app_k else ""),
        "max_total_capital": float(d.get("max_total_capital") or 100000000.0),
        "max_per_stock_capital": float(d.get("max_per_stock_capital") or 5000000.0),
        "etf_order_qty": int(d.get("etf_order_qty") or 100),
        "etf_auto_trade": bool(d.get("etf_auto_trade", 1)),
        "is_connected": is_conn,
        "updated_at": d.get("updated_at") or "",
    }
    if include_secrets:
        res["app_key"] = app_k
        res["app_secret"] = app_s
    return res


def save_user_trading_account(user_id: str, payload: dict) -> dict:
    """회원 본인의 개별 증권사 계좌 정보 및 운용 한도를 저장합니다."""
    import datetime
    uid = _norm_uid(user_id)
    current = get_user_trading_account(uid, include_secrets=True)

    b_code = str(payload.get("broker_code") or current.get("broker_code") or "KIS").upper().strip()
    b_name = SUPPORTED_BROKERS.get(b_code, str(payload.get("broker_name") or b_code))
    a_mode = str(payload.get("account_mode") or current.get("account_mode") or "PAPER").upper().strip()
    if a_mode not in ("PAPER", "LIVE"):
        a_mode = "PAPER"

    raw_acc = str(payload.get("account_no") if "account_no" in payload else current.get("account_no") or "").strip()
    prdt = str(payload.get("acnt_prdt_cd") if "acnt_prdt_cd" in payload else current.get("acnt_prdt_cd") or "01").strip()
    if "-" in raw_acc:
        parts = raw_acc.split("-", 1)
        raw_acc = parts[0].strip()
        if len(parts[1].strip()) >= 2:
            prdt = parts[1].strip()[:2]

    app_k = str(payload.get("app_key") if "app_key" in payload and payload.get("app_key") is not None else current.get("app_key") or "").strip()
    app_s = str(payload.get("app_secret") if "app_secret" in payload and payload.get("app_secret") is not None else current.get("app_secret") or "").strip()

    max_cap = float(payload.get("max_total_capital") or current.get("max_total_capital") or 100000000.0)
    max_per = float(payload.get("max_per_stock_capital") or round(max_cap / 20.0, 0) or 5000000.0)
    etf_qty = max(1, min(100000, int(payload.get("etf_order_qty") or current.get("etf_order_qty") or 100)))
    etf_auto = 1 if bool(payload.get("etf_auto_trade", current.get("etf_auto_trade", True))) else 0

    disconnect_flag = bool(payload.get("disconnect", False))
    if disconnect_flag:
        is_conn = 0
        raw_acc = ""
        app_k = ""
        app_s = ""
    else:
        is_conn = 1 if bool(raw_acc) else 0

    u_name = str(payload.get("user_name") or current.get("user_name") or uid).strip()
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        """
        INSERT OR REPLACE INTO user_trading_accounts (
            user_id, user_name, broker_code, broker_name, account_mode,
            account_no, acnt_prdt_cd, app_key, app_secret,
            max_total_capital, max_per_stock_capital, etf_order_qty, etf_auto_trade,
            is_connected, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            uid,
            u_name,
            b_code,
            b_name,
            a_mode,
            raw_acc,
            prdt,
            app_k,
            app_s,
            max_cap,
            max_per,
            etf_qty,
            etf_auto,
            is_conn,
            now_str,
        ),
    )
    conn.commit()
    conn.close()
    return get_user_trading_account(uid, include_secrets=False)


def get_all_users_trading_overview() -> list:
    """
    [관리자 전용] 전체 회원(주인장 포함)의 개별 증권사 계좌 연결 현황, 국내주식 보유종목·누적손익,
    미국 ETF 보유종목 및 최근 트레이딩 내역을 통합 조회합니다.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT id, name, phone, email, status, created_at, approved_at FROM user_access_requests ORDER BY id DESC")
    user_rows = [dict(r) for r in c.fetchall()]
    conn.close()

    # 관리자 + 모든 등록 회원 목록 구성
    targets = [
        {
            "user_id": "admin",
            "request_id": 0,
            "name": "주인장(관리자)",
            "phone": "-",
            "email": "-",
            "status": "approved",
            "is_admin": True,
        }
    ]
    for ur in user_rows:
        targets.append(
            {
                "user_id": f"user_{ur['id']}",
                "request_id": ur["id"],
                "name": ur["name"],
                "phone": ur["phone"],
                "email": ur.get("email") or "-",
                "status": ur["status"],
                "is_admin": False,
            }
        )

    overview = []
    for t in targets:
        uid = t["user_id"]
        acc = get_user_trading_account(uid, include_secrets=False)
        kr_holdings = get_holdings(user_id=uid)
        kr_ledger = get_ledger_history(user_id=uid)
        kr_detailed = get_detailed_trading_ledger(user_id=uid)[:20]
        total_kr_pnl = sum(float(r.get("net_pnl") or 0.0) for r in kr_ledger)

        overview.append(
            {
                **t,
                "account": acc,
                "kr_holdings_count": len(kr_holdings),
                "kr_holdings": kr_holdings,
                "kr_trade_days": len(kr_ledger),
                "kr_total_net_pnl": round(total_kr_pnl, 0),
                "kr_ledger_history": kr_ledger[:15],
                "kr_recent_trades": kr_detailed,
            }
        )
    return overview


def change_user_password(name: str, phone: str, current_password: str, new_password: str):
    import os
    admin_master = os.environ.get("ADMIN_MASTER_PASSWORD", "h80494")
    
    # 관리자 비밀번호 변경 요청인 경우 (마스터 계정)
    if current_password == admin_master and (name == "주인장" or name == "관리자" or not name):
        # 환경변수 메모리 변경
        os.environ["ADMIN_MASTER_PASSWORD"] = new_password
        return {"success": True, "message": "주인장(관리자) 비밀번호가 성공적으로 변경되었습니다."}

    # 일반 회원 비밀번호 변경
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT id, name, phone, requested_password, status FROM user_access_requests
        WHERE name = ? AND phone = ? AND requested_password = ?
    ''', (name.strip(), phone.strip(), current_password.strip()))
    row = c.fetchone()
    
    if not row:
        conn.close()
        return {"success": False, "message": "성함, 연락처 또는 현재 비밀번호가 일치하지 않습니다."}
    
    if row["status"] != "approved":
        conn.close()
        return {"success": False, "message": "아직 관리자 승인이 완료되지 않은 계정입니다."}
    
    # 새 비밀번호로 업데이트
    c.execute('''
        UPDATE user_access_requests
        SET requested_password = ?
        WHERE id = ?
    ''', (new_password.strip(), row["id"]))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"{name} 님의 비밀번호가 성공적으로 변경되었습니다."}

def admin_update_user_password(request_id: int, new_password: str):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        UPDATE user_access_requests
        SET requested_password = ?
        WHERE id = ?
    ''', (new_password.strip(), request_id))
    conn.commit()
    conn.close()
    return {"success": True, "message": "회원 비밀번호가 수정되었습니다."}

# Initialize DB when imported
init_db()

