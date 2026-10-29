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
            status TEXT,
            batch_id TEXT,
            created_at TEXT
        )
    ''')
    for extra_col in ["batch_id TEXT", "created_at TEXT"]:
        try:
            c.execute(f"ALTER TABLE trading_ledger ADD COLUMN {extra_col}")
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

def _ensure_trading_ledger_columns(c):
    for extra_col in ["batch_id TEXT", "created_at TEXT"]:
        try:
            c.execute(f"ALTER TABLE trading_ledger ADD COLUMN {extra_col}")
        except Exception:
            pass


def add_realized_pnl(date: str, amount: float):
    """일자별 실현손익을 멱등성 있게 확정 기록(덮어쓰기)하여 중복 합산을 방지합니다."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        '''
        INSERT INTO pnl_history (date, realized_pnl)
        VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET realized_pnl = excluded.realized_pnl
        ''',
        (date, amount),
    )
    conn.commit()
    conn.close()

def get_pnl_history():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM pnl_history ORDER BY date DESC')
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]

def can_execute_initial_buy(trade_date: str, ticker: str = "", batch_id: str = "") -> tuple:
    """
    당일 최초 매수주문만 허용하고 이후 추가 매수를 원천 차단합니다.
    반환값: (허용여부: bool, 사유: str)
    """
    from datetime import datetime, timedelta
    from trading_config import get_trading_config

    cfg = get_trading_config()
    max_stocks = int(cfg["max_stocks"])
    window_sec = int(cfg["initial_buy_window_sec"])

    conn = get_db_connection()
    c = conn.cursor()
    _ensure_trading_ledger_columns(c)

    # 1) 이미 당일 정산 완료된 기록이 있으면 추가 매수 불가
    c.execute("SELECT 1 FROM trade_ledger WHERE date = ?", (trade_date,))
    if c.fetchone():
        conn.close()
        return False, "금일 매매 정산이 이미 완료되어 추가 매수가 불가합니다."

    c.execute("SELECT id, ticker, status, batch_id, created_at FROM trading_ledger WHERE trade_date = ? ORDER BY id ASC", (trade_date,))
    ledger_rows = c.fetchall()

    if any(r["status"] == "SELL" for r in ledger_rows):
        conn.close()
        return False, "금일 매도 정산이 이미 진행되어 추가 매수가 불가합니다."

    # 2) 동일 종목 중복/추가 매수 차단
    if ticker:
        pure_t = ticker.split(":")[-1]
        c.execute("SELECT 1 FROM holdings WHERE ticker = ? OR ticker = ?", (ticker, pure_t))
        if c.fetchone() or any((r["ticker"] or "").split(":")[-1] == pure_t for r in ledger_rows):
            conn.close()
            return False, f"{pure_t} 종목은 금일 이미 매수되어 추가 매수가 불가합니다."

    # 3) 종목 수 한도 검사 (기본 20종목)
    c.execute("SELECT COUNT(*) AS cnt FROM holdings")
    h_cnt = int(c.fetchone()["cnt"] or 0)
    distinct_tickers = set((r["ticker"] or "").split(":")[-1] for r in ledger_rows if r["ticker"])
    if h_cnt >= max_stocks or len(distinct_tickers) >= max_stocks:
        conn.close()
        return False, f"최대 매수 종목 수({max_stocks}종목) 한도에 도달하여 추가 매수가 불가합니다."

    # 4) 당일 최초 매수 세션 여부 검증
    if ledger_rows or h_cnt > 0:
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

def get_today_buy_total(trade_date: str) -> float:
    """당일 누적 매수금액을 반환합니다."""
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT COALESCE(SUM(buy_price * qty), 0) AS total FROM holdings")
    h_total = float(c.fetchone()["total"] or 0.0)
    c.execute("SELECT COALESCE(SUM(buy_price * qty), 0) AS total FROM trading_ledger WHERE trade_date = ?", (trade_date,))
    l_total = float(c.fetchone()["total"] or 0.0)
    conn.close()
    return max(h_total, l_total)

def update_holding(ticker: str, name: str, qty: int, price: float):
    from trading_config import get_trading_config
    cfg = get_trading_config()
    max_per_stock = float(cfg["max_per_stock_capital"])

    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM holdings WHERE ticker = ?', (ticker,))
    row = c.fetchone()
    if row:
        if qty > 0:
            # 최초 매수 이후 동일 종목 추가 매수(수량 누적) 원천 차단
            conn.close()
            return
        new_qty = row['qty'] + qty
        if new_qty <= 0:
            c.execute('DELETE FROM holdings WHERE ticker = ?', (ticker,))
        else:
            c.execute('UPDATE holdings SET qty = ?, buy_price = ? WHERE ticker = ?', (new_qty, row['buy_price'], ticker))
    else:
        if qty > 0 and price > 0:
            capped_qty = min(qty, int(max_per_stock // price))
            if capped_qty > 0:
                c.execute('INSERT INTO holdings (ticker, name, buy_price, qty) VALUES (?, ?, ?, ?)', (ticker, name, price, capped_qty))
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
    """
    당일 일괄 매도 정산 결과를 trade_ledger에 멱등성 있게 덮어쓰기(UPSERT)합니다.
    기존에 중복 스레드가 합산(+)하면서 1억 원 한도를 초과하던 문제를 원천 방지합니다.
    """
    from trading_config import get_trading_config, calculate_settlement_metrics
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
        INSERT INTO trade_ledger (date, total_buy, total_sell, fees, tax, net_pnl, return_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET
            total_buy = excluded.total_buy,
            total_sell = excluded.total_sell,
            fees = excluded.fees,
            tax = excluded.tax,
            net_pnl = excluded.net_pnl,
            return_rate = excluded.return_rate
        ''',
        (date, total_buy, total_sell, fees, tax, net_pnl, return_rate),
    )
    conn.commit()
    conn.close()

def record_trading_buy(trade_date: str, ticker: str, name: str, buy_price: float, qty: int, batch_id: str = ""):
    """
    당일 최초 매수 주문 체결 내역을 상세 거래원장(trading_ledger)에 단일 기록합니다. (추가 매수 누적 금지)
    """
    from datetime import datetime, timedelta
    from trading_config import get_trading_config

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
    c.execute("SELECT id FROM trading_ledger WHERE trade_date = ? AND ticker = ?", (trade_date, ticker))
    row = c.fetchone()
    if not row:
        c.execute('''
            INSERT INTO trading_ledger (trade_date, ticker, name, buy_price, qty, status, batch_id, created_at)
            VALUES (?, ?, ?, ?, ?, 'BUY', ?, ?)
        ''', (trade_date, ticker, name, buy_price, qty, batch_id or None, now_kst_iso))
    conn.commit()
    conn.close()

def record_trading_sell_all(trade_date: str, sell_items: list):
    """
    일괄 매도시 각 종목의 매도가, 실현손익 및 SELL 상태를 trading_ledger에 멱등성 있게 확정 기록합니다.
    sell_items: list of dict(ticker, name, qty, buy_price, sell_price, pnl)
    """
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

        c.execute("SELECT id FROM trading_ledger WHERE trade_date = ? AND ticker = ? ORDER BY id ASC", (trade_date, t))
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
                INSERT INTO trading_ledger (trade_date, ticker, name, buy_price, sell_price, qty, pnl, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'SELL')
            ''', (trade_date, t, name, bp, sp, qty, pnl))
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
        return {"authenticated": True, "is_admin": True, "name": "주인장(관리자)"}
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        SELECT id, name, requested_password, status FROM user_access_requests
        WHERE requested_password = ? AND status = 'approved'
    ''', (password,))
    row = c.fetchone()
    conn.close()
    
    if row:
        return {"authenticated": True, "is_admin": False, "name": row["name"]}
    
    return {"authenticated": False, "is_admin": False, "name": None}

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

