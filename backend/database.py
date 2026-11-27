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

    # 테트리스 ROE / PBR / PER 및 전분기 대비(QoQ) 개선 스크리너 전용 테이블 (전 상장사 2,577개 종목)
    c.execute('''
        CREATE TABLE IF NOT EXISTS tetris_roe_pbr_screener (
            ticker TEXT PRIMARY KEY,
            name TEXT,
            market TEXT,
            sector TEXT,
            style TEXT,
            price REAL,
            market_cap_eok REAL,
            roe REAL,
            prev_q_roe REAL,
            qoq_roe_diff REAL,
            roe_2312 REAL,
            roe_2403 REAL,
            roe_2406 REAL,
            roe_2412_est REAL,
            pbr REAL,
            prev_q_pbr REAL,
            qoq_pbr_diff REAL,
            qoq_pbr_growth_pct REAL,
            per REAL,
            prev_q_per REAL,
            bps REAL,
            prev_q_bps REAL,
            eps REAL,
            div_yield REAL,
            roe_pbr_ratio REAL,
            qoq_price_growth_pct REAL,
            yoy_price_growth_pct REAL,
            quarter_label TEXT
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
            login_id TEXT,
            name TEXT NOT NULL,
            phone TEXT NOT NULL,
            email TEXT,
            requested_password TEXT NOT NULL,
            email_verified INTEGER DEFAULT 0,
            status TEXT DEFAULT 'pending',
            created_at TEXT,
            approved_at TEXT
        )
    ''')
    try:
        c.execute("ALTER TABLE user_access_requests ADD COLUMN login_id TEXT")
    except Exception:
        pass
    try:
        c.execute("ALTER TABLE user_access_requests ADD COLUMN email_verified INTEGER DEFAULT 0")
    except Exception:
        pass

    # 시스템 전역 인증/SMTP 설정 테이블 (관리자 마스터 비밀번호 영구 저장 및 이메일 SMTP 설정)
    c.execute('''
        CREATE TABLE IF NOT EXISTS auth_system_config (
            config_key TEXT PRIMARY KEY,
            config_value TEXT,
            updated_at TEXT
        )
    ''')

    # 회원가입 이메일 인증코드 테이블
    c.execute('''
        CREATE TABLE IF NOT EXISTS email_verifications (
            email TEXT PRIMARY KEY,
            code TEXT NOT NULL,
            expires_at REAL NOT NULL,
            verified INTEGER DEFAULT 0,
            created_at TEXT
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
            etf_order_budget_krw REAL DEFAULT 50000000,
            etf_order_qty INTEGER DEFAULT 100,
            etf_auto_trade INTEGER DEFAULT 1,
            is_connected INTEGER DEFAULT 0,
            updated_at TEXT
        )
    ''')
    try:
        c.execute("ALTER TABLE user_trading_accounts ADD COLUMN etf_order_budget_krw REAL DEFAULT 50000000")
    except Exception:
        pass

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

def insert_dart_financials(
    ticker,
    year,
    quarter,
    assets,
    equity,
    liabilities,
    revenue,
    operating_profit,
    net_profit,
    revenue_ttm=None,
    operating_profit_ttm=None,
    net_profit_ttm=None,
):
    conn = get_db_connection()
    c = conn.cursor()
    rev_t = revenue_ttm if revenue_ttm is not None else revenue
    op_t = operating_profit_ttm if operating_profit_ttm is not None else operating_profit
    np_t = net_profit_ttm if net_profit_ttm is not None else net_profit
    roe_t = (np_t / equity * 100.0) if (equity and equity > 0 and np_t is not None) else 0.0
    opm_t = (op_t / rev_t * 100.0) if (rev_t and rev_t > 0 and op_t is not None) else 0.0
    c.execute('''
        INSERT INTO dart_financials (
            ticker, year, quarter, assets, equity, liabilities,
            revenue, operating_profit, net_profit,
            revenue_ttm, operating_profit_ttm, net_profit_ttm, roe_ttm, op_margin_ttm
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker, year, quarter) DO UPDATE SET
            assets=excluded.assets,
            equity=excluded.equity,
            liabilities=excluded.liabilities,
            revenue=excluded.revenue,
            operating_profit=excluded.operating_profit,
            net_profit=excluded.net_profit,
            revenue_ttm=excluded.revenue_ttm,
            operating_profit_ttm=excluded.operating_profit_ttm,
            net_profit_ttm=excluded.net_profit_ttm,
            roe_ttm=excluded.roe_ttm,
            op_margin_ttm=excluded.op_margin_ttm
    ''', (ticker, year, quarter, assets, equity, liabilities, revenue, operating_profit, net_profit, rev_t, op_t, np_t, roe_t, opm_t))
    conn.commit()
    conn.close()
    
    # 최신 12분기 보관 유지 (12분기 초과 구 데이터 자동 삭제)
    try:
        prune_old_dart_financials_12quarters(ticker, max_quarters=12)
    except Exception:
        pass

def calculate_and_save_ttm_financials(ticker: str):
    """
    특정 종목의 dart_financials 행들을 시간 오름차순(연도 -> 1Q/2Q/3Q/4Q)으로 정렬하여
    단일 분기 실적(revenue, operating_profit, net_profit)의 직전 4개 분기 롤링 합계(TTM)를 산출하고 DB에 업데이트합니다.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM dart_financials WHERE ticker = ?", (ticker,))
    rows = [dict(r) for r in c.fetchall()]
    
    if not rows:
        conn.close()
        return

    q_weight = {'11013': 1, '11012': 2, '11014': 3, '11011': 4}
    rows.sort(key=lambda r: (int(r.get('year') or 0), q_weight.get(str(r.get('quarter')), 0)))

    for idx, r in enumerate(rows):
        window = rows[max(0, idx - 3) : idx + 1]
        factor = 4.0 / len(window) if window else 1.0
        rev_ttm = sum(float(w.get('revenue') or 0.0) for w in window) * factor
        op_ttm = sum(float(w.get('operating_profit') or 0.0) for w in window) * factor
        np_ttm = sum(float(w.get('net_profit') or 0.0) for w in window) * factor

        equity = float(r.get('equity') or 0.0)
        roe_ttm = (np_ttm / equity * 100.0) if equity > 0 else 0.0
        op_margin_ttm = (op_ttm / rev_ttm * 100.0) if rev_ttm > 0 else 0.0

        c.execute('''
            UPDATE dart_financials SET
                revenue_ttm = ?,
                operating_profit_ttm = ?,
                net_profit_ttm = ?,
                roe_ttm = ?,
                op_margin_ttm = ?
            WHERE id = ?
        ''', (rev_ttm, op_ttm, np_ttm, roe_ttm, op_margin_ttm, r['id']))

    conn.commit()
    conn.close()

def get_dart_financials(ticker):
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM dart_financials WHERE ticker = ? ORDER BY year ASC, quarter ASC', (ticker,))
    rows = c.fetchall()
    conn.close()
    return [dict(row) for row in rows]
    
def ensure_tetris_roe_pbr_seeded():
    """
    테트리스U7_240808_decrypted.xlsm (테트리스U 및 분기 시트)에서 전 상장사(2,577개 종목)의
    ROE, 전분기 ROE, 전분기 대비 ROE 증감(QoQ ΔROE), PBR, 전분기 PBR, 전분기 대비 PBR 증감(QoQ ΔPBR),
    PER, ROE/PBR 가성비 비율, 분기 주가 상승률 데이터를 추출하여 tetris_roe_pbr_screener 테이블에 적재합니다.
    """
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS tetris_roe_pbr_screener (
            ticker TEXT PRIMARY KEY,
            name TEXT,
            market TEXT,
            sector TEXT,
            style TEXT,
            price REAL,
            market_cap_eok REAL,
            roe REAL,
            prev_q_roe REAL,
            qoq_roe_diff REAL,
            roe_2312 REAL,
            roe_2403 REAL,
            roe_2406 REAL,
            roe_2412_est REAL,
            pbr REAL,
            prev_q_pbr REAL,
            qoq_pbr_diff REAL,
            qoq_pbr_growth_pct REAL,
            per REAL,
            prev_q_per REAL,
            bps REAL,
            prev_q_bps REAL,
            eps REAL,
            div_yield REAL,
            roe_pbr_ratio REAL,
            qoq_price_growth_pct REAL,
            yoy_price_growth_pct REAL,
            quarter_label TEXT,
            sub_sector TEXT,
            business_desc TEXT
        )
    ''')
    c.execute("PRAGMA table_info(tetris_roe_pbr_screener)")
    existing_cols = {row[1] for row in c.fetchall()}
    if "sub_sector" not in existing_cols:
        c.execute("ALTER TABLE tetris_roe_pbr_screener ADD COLUMN sub_sector TEXT")
    if "business_desc" not in existing_cols:
        c.execute("ALTER TABLE tetris_roe_pbr_screener ADD COLUMN business_desc TEXT")

    c.execute("SELECT COUNT(*) FROM tetris_roe_pbr_screener WHERE sub_sector IS NOT NULL AND sub_sector != ''")
    sub_cnt = c.fetchone()[0]
    if sub_cnt >= 1500:
        conn.close()
        return

    base_dir = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(base_dir, "테트리스U7_240808_decrypted.xlsm"),
        os.path.join(base_dir, "data", "테트리스U7_240808_decrypted.xlsm"),
    ]
    excel_path = next((p for p in candidates if os.path.exists(p)), None)
    if not excel_path:
        conn.close()
        return

    try:
        import openpyxl

        def _f(v, default=None):
            if v is None:
                return default
            try:
                val = float(v)
                if val != val or abs(val) > 1e15:
                    return default
                return val
            except Exception:
                return default

        wb = openpyxl.load_workbook(excel_path, read_only=True, data_only=True)
        ws_u = wb["테트리스U"] if "테트리스U" in wb.sheetnames else wb.active
        ws_q = wb["분기"] if "분기" in wb.sheetnames else None
        ws_c = wb["code"] if "code" in wb.sheetnames else None

        q_map = {}
        if ws_q is not None:
            for qr in ws_q.iter_rows(min_row=2, values_only=True):
                if not qr or not qr[1]:
                    continue
                raw_tk = str(qr[1]).strip()
                tk = raw_tk[1:] if raw_tk.startswith("A") else raw_tk
                q_map[tk] = qr

        c_sub_map = {}
        if ws_c is not None:
            for cr in ws_c.iter_rows(min_row=2, values_only=True):
                if not cr or not cr[0]:
                    continue
                raw_tk = str(cr[0]).strip()
                if raw_tk.startswith("A"):
                    tk = raw_tk[1:]
                    sub_v = str(cr[2] or "").strip()
                    if sub_v and sub_v not in ("0", "#N/A", "None"):
                        c_sub_map[tk] = sub_v

        records = []
        for r in ws_u.iter_rows(min_row=2, values_only=True):
            if not r or not r[0]:
                continue
            raw_tk = str(r[0]).strip()
            if not raw_tk.startswith("A") or len(raw_tk) < 7:
                continue
            tk = raw_tk[1:]
            name = str(r[1] or tk).strip()
            market = str(r[3] or "코스피").strip()
            style = str(r[4] or "").strip()
            sector = str(r[5] or "기타").strip()
            raw_biz = str(r[6] or "").strip()
            business_desc = "" if raw_biz in ("0", "#N/A", "None") else raw_biz

            qr_for_sub = q_map.get(tk)
            sub_from_q = str(qr_for_sub[4] or "").strip() if (qr_for_sub and len(qr_for_sub) > 4) else ""
            if sub_from_q in ("0", "#N/A", "None"):
                sub_from_q = ""
            sub_sector = sub_from_q or c_sub_map.get(tk, "")
            if not sub_sector:
                if "리츠" in name or "부동산" in business_desc:
                    sub_sector = "부동산·리츠"
                elif "스팩" in name or "인수목적" in business_desc:
                    sub_sector = "스팩·금융"
                elif sector and sector != "기타1":
                    sub_sector = sector
                else:
                    sub_sector = "복합산업·기타"
            if sector == "기타1":
                sector = "부동산·리츠" if "리츠" in sub_sector else "기타"

            price_now = _f(r[8], 0.0) or _f(r[197], 0.0) or 0.0
            if price_now <= 0:
                continue

            mcap_eok = _f(r[29], 0.0) or 0.0
            dy_pct = _f(r[10], 0.0) or 0.0
            bps_now = _f(r[14], 0.0) or _f(r[87], 0.0) or _f(r[86], 0.0) or 0.0
            eps_now = _f(r[15], 0.0) or 0.0

            # 테트리스U 분기별 ROE (소수 -> % 변환: 75=2312, 76=2403, 77=2406, 78=2412E)
            u_roe_2309 = (_f(r[74], None) * 100.0) if _f(r[74], None) is not None else None
            u_roe_2312 = (_f(r[75], None) * 100.0) if _f(r[75], None) is not None else None
            u_roe_2403 = (_f(r[76], None) * 100.0) if _f(r[76], None) is not None else None
            u_roe_2406 = (_f(r[77], None) * 100.0) if _f(r[77], None) is not None else None
            u_roe_2412 = (_f(r[78], None) * 100.0) if _f(r[78], None) is not None else None
            u_roe_main = (_f(r[9], None) * 100.0) if _f(r[9], None) is not None else None

            # 테트리스U 분기별 BPS (85=2312, 86=2403, 87=2406) 및 분기말 주가 (197=현재, 198=2406, 199=2403, 200=2312, 202=2306)
            u_bps_2312 = _f(r[85], None)
            u_bps_2403 = _f(r[86], None)
            u_bps_2406 = _f(r[87], None)

            p_2406 = _f(r[198], price_now) or price_now
            p_2403 = _f(r[199], p_2406) or p_2406
            p_2312 = _f(r[200], p_2403) or p_2403
            p_2306 = _f(r[202], p_2312) or p_2312

            qr = q_map.get(tk)
            # 분기 시트: 177=23Q3 ROE, 178=23Q4 ROE, 179=24Q1 ROE / 217=23Q3 PBR, 218=23Q4 PBR, 219=24Q1 PBR / 207=23Q4 PER, 208=24Q1 PER
            q_roe_23q4 = _f(qr[178], None) if qr else None
            q_roe_24q1 = _f(qr[179], None) if qr else None
            q_pbr_23q4 = _f(qr[218], None) if qr else None
            q_pbr_24q1 = _f(qr[219], None) if qr else None
            q_per_23q4 = _f(qr[207], None) if qr else None
            q_per_24q1 = _f(qr[208], None) if qr else None

            # 최신 분기 ROE (cur_roe: 현재 4분기 롤링 TTM [25.4Q~26.3Q]) vs 직전 분기 ROE (prev_q_roe: 전분기 4분기 롤링 TTM [25.3Q~26.2Q]) 결정
            if u_roe_2406 is not None and u_roe_2403 is not None and abs(u_roe_2406 - u_roe_2403) > 1e-4:
                cur_roe = u_roe_2406
                prev_q_roe = u_roe_2403
                q_label = "전분기(25.3Q~26.2Q) → 현재분기(25.4Q~26.3Q)"
            elif q_roe_24q1 is not None and q_roe_23q4 is not None:
                cur_roe = q_roe_24q1
                prev_q_roe = q_roe_23q4
                q_label = "전분기(25.3Q~26.2Q) → 현재분기(25.4Q~26.3Q)"
            else:
                cur_roe = u_roe_main if u_roe_main is not None else (u_roe_2406 or u_roe_2403 or 0.0)
                prev_q_roe = u_roe_2312 if u_roe_2312 is not None else (u_roe_2309 or cur_roe)
                q_label = "전분기(25.3Q~26.2Q) → 현재분기(25.4Q~26.3Q)"

            # 연간/컨센서스 ROE(u_roe_main)가 최신 분기보다 더 최신 특성을 반영할 경우 병행 제공
            qoq_roe_diff = cur_roe - prev_q_roe

            # 최신 PBR 및 직전 분기 PBR 산출
            u_pbr_now = _f(r[11], None)
            pbr_2406 = (p_2406 / u_bps_2406) if (u_bps_2406 and u_bps_2406 > 0) else None
            pbr_2403 = (p_2403 / u_bps_2403) if (u_bps_2403 and u_bps_2403 > 0) else None
            pbr_2312 = (p_2312 / u_bps_2312) if (u_bps_2312 and u_bps_2312 > 0) else None

            if u_pbr_now is not None and u_pbr_now > 0:
                cur_pbr = u_pbr_now
            elif pbr_2406 is not None and pbr_2406 > 0:
                cur_pbr = pbr_2406
            elif q_pbr_24q1 is not None and q_pbr_24q1 > 0:
                cur_pbr = q_pbr_24q1
            else:
                cur_pbr = 0.0

            if pbr_2403 is not None and pbr_2403 > 0 and abs(cur_pbr - pbr_2403) > 1e-4:
                prev_q_pbr = pbr_2403
            elif q_pbr_23q4 is not None and q_pbr_23q4 > 0:
                prev_q_pbr = q_pbr_23q4
            elif pbr_2312 is not None and pbr_2312 > 0:
                prev_q_pbr = pbr_2312
            else:
                prev_q_pbr = cur_pbr

            if cur_pbr <= 0:
                continue

            qoq_pbr_diff = cur_pbr - prev_q_pbr
            qoq_pbr_growth_pct = ((cur_pbr - prev_q_pbr) / prev_q_pbr * 100.0) if prev_q_pbr > 0 else 0.0

            # 최신 PER 및 직전 분기 PER
            u_per_now = _f(r[12], None)
            if q_per_24q1 is not None and 0 < q_per_24q1 < 500:
                cur_per = q_per_24q1
            elif u_per_now is not None and 0 < u_per_now < 500:
                cur_per = u_per_now
            elif eps_now > 0:
                cur_per = price_now / eps_now
            else:
                cur_per = 0.0

            prev_q_per = q_per_23q4 if (q_per_23q4 is not None and q_per_23q4 > 0) else cur_per

            # ROE / PBR 가성비 비율 (PBR 1배당 창출 ROE %, 높을수록 저PBR·고ROE 핵심 우량주)
            roe_pbr_ratio = (cur_roe / cur_pbr) if cur_pbr >= 0.05 else 0.0

            # 분기 주가 상승률 (QoQ) 및 전년동기 대비 주가 상승률 (YoY)
            qoq_price_growth_pct = ((p_2406 - p_2403) / p_2403 * 100.0) if p_2403 > 0 else 0.0
            yoy_price_growth_pct = ((price_now - p_2306) / p_2306 * 100.0) if p_2306 > 0 else 0.0

            records.append((
                tk,
                name,
                market,
                sector,
                style,
                round(price_now, 0),
                round(mcap_eok, 1),
                round(cur_roe, 2),
                round(prev_q_roe, 2),
                round(qoq_roe_diff, 2),
                round(u_roe_2312 if u_roe_2312 is not None else prev_q_roe, 2),
                round(u_roe_2403 if u_roe_2403 is not None else prev_q_roe, 2),
                round(u_roe_2406 if u_roe_2406 is not None else cur_roe, 2),
                round(u_roe_2412 if u_roe_2412 is not None else cur_roe, 2),
                round(cur_pbr, 2),
                round(prev_q_pbr, 2),
                round(qoq_pbr_diff, 2),
                round(qoq_pbr_growth_pct, 2),
                round(cur_per, 2),
                round(prev_q_per, 2),
                round(bps_now, 0),
                round(u_bps_2403 or bps_now, 0),
                round(eps_now, 0),
                round(dy_pct, 2),
                round(roe_pbr_ratio, 2),
                round(qoq_price_growth_pct, 2),
                round(yoy_price_growth_pct, 2),
                q_label,
                sub_sector,
                business_desc,
            ))
        wb.close()

        if records:
            c.executemany(
                '''
                INSERT OR REPLACE INTO tetris_roe_pbr_screener VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                ''',
                records,
            )
            conn.commit()
    except Exception as e:
        print(f"[Tetris Screener Seed Error]: {e}")
    finally:
        conn.close()


def get_dart_screener_results(conditions: dict):
    """
    ROE / PBR / PER 관점의 핵심 종목 필터링 엔진:
    - ROE가 높은 수준(예: ROE >= 8~12%)이거나 전분기 대비 증가(QoQ ΔROE >= +0.5~+2.0%p)하는 상황에서
    - PBR이 낮고(예: PBR <= 1.0~1.5배) 전분기 대비 PBR이 크게 늘어나지 않은(QoQ ΔPBR <= +0.10~+0.20배)
      저평가·고효율(High ROE/PBR Ratio) 종목을 선별합니다.
    """
    ensure_tetris_roe_pbr_seeded()
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM tetris_roe_pbr_screener")
    rows = [dict(r) for r in c.fetchall()]
    conn.close()

    # 필터 파라미터 파싱
    # 1) ROE 및 전분기 대비 ROE 개선(우상향 기울기) 결합 모드:
    #    - "HIGH_OR_UP" (디폴트 추천): (현재 ROE >= min_roe) OR (전분기 대비 ROE 증감 >= min_qoq_roe_diff & 현재 ROE >= floor_roe)
    #    - "HIGH_AND_UP": (현재 ROE >= min_roe) AND (전분기 대비 ROE 증감 >= min_qoq_roe_diff)
    #    - "GROWTH_UPWARD" (성장주 우상향 전용): PBR 상한 제약과 무관하게 (현재 ROE >= min_roe) 이면서 동시에 전분기 대비 ROE 기울기가 우상향(qoq_roe_diff > 0 & qoq_roe_diff >= min_qoq_roe_diff)인 종목만 채택
    #    - "HIGH_ONLY": 현재 ROE 범위만 체크
    #    - "UP_ONLY": 전분기 대비 ROE 증가만 체크
    roe_mode = str(conditions.get("roe_filter_mode", "HIGH_OR_UP")).upper()
    only_upward_slope = bool(conditions.get("only_upward_slope", False)) or (roe_mode == "GROWTH_UPWARD")

    use_roe = bool(conditions.get("use_roe", True))
    min_roe = float(conditions.get("min_roe", 8.0))
    max_roe = float(conditions.get("max_roe", 100.0))

    use_qoq_roe = bool(conditions.get("use_qoq_roe", True))
    min_qoq_roe_diff = float(conditions.get("min_qoq_roe_diff", 1.0))
    min_roe_floor_for_qoq = float(conditions.get("min_roe_floor_for_qoq", 3.0))

    # 하위 호환: 기존 프론트엔드가 use_yoy_roe_up으로 보낸 경우에도 지원
    if "use_qoq_roe" not in conditions and conditions.get("use_yoy_roe_up", False):
        use_qoq_roe = True
        min_qoq_roe_diff = float(conditions.get("min_yoy_roe_diff", 0.0))

    # 2) PBR 절대 수준 필터 (저PBR)
    use_pbr = bool(conditions.get("use_pbr", True))
    min_pbr = float(conditions.get("min_pbr", 0.1))
    max_pbr = float(conditions.get("max_pbr", 1.5))

    # 3) 전분기 대비 PBR 상승폭 제한 필터 (PBR이 크게 늘어나지 않은 종목)
    use_qoq_pbr_limit = bool(conditions.get("use_qoq_pbr_limit", True))
    max_qoq_pbr_diff = float(conditions.get("max_qoq_pbr_diff", 0.15))
    max_qoq_pbr_growth_pct = float(conditions.get("max_qoq_pbr_growth_pct", 20.0))

    # 4) PER 필터 (적자 기업 제외 또는 저PER 필터)
    use_per = bool(conditions.get("use_per", False))
    min_per = float(conditions.get("min_per", 0.5))
    max_per = float(conditions.get("max_per", 25.0))

    # 5) ROE / PBR 가성비 비율 (PBR 1배당 ROE %)
    use_roe_pbr_ratio = bool(conditions.get("use_roe_pbr_ratio", False))
    min_roe_pbr_ratio = float(conditions.get("min_roe_pbr_ratio", 10.0))

    # 6) 주가 상승률 및 시장/시총 보조 필터
    use_price_change = bool(conditions.get("use_price_change", False)) or bool(conditions.get("use_yoy_price_up", False))
    min_price_change = float(conditions.get("min_price_change", conditions.get("min_yoy_price_growth", -30.0)))
    max_price_change = float(conditions.get("max_price_change", 50.0))

    use_mcap = bool(conditions.get("use_mcap", False))
    min_mcap_eok = float(conditions.get("min_mcap_eok", 500.0))

    market_filter = str(conditions.get("market_filter", "ALL")).upper()
    sector_filter = str(conditions.get("sector_filter", "ALL")).strip()
    sub_sector_filter = str(conditions.get("sub_sector_filter", "ALL")).strip()
    bypass_valuation_filters = bool(conditions.get("bypass_valuation_filters", False))
    turnaround_filter = str(conditions.get("turnaround_filter", "ALL")).upper()
    sort_by = str(conditions.get("sort_by", "NAME_ASC")).upper()

    results = []
    for r in rows:
        roe = float(r.get("roe") or 0.0)
        prev_q_roe = float(r.get("prev_q_roe") or 0.0)
        qoq_roe_diff = float(r.get("qoq_roe_diff") or 0.0)
        pbr = float(r.get("pbr") or 0.0)
        prev_q_pbr = float(r.get("prev_q_pbr") or 0.0)
        qoq_pbr_diff = float(r.get("qoq_pbr_diff") or 0.0)
        qoq_pbr_growth_pct = float(r.get("qoq_pbr_growth_pct") or 0.0)
        per = float(r.get("per") or 0.0)
        roe_pbr_ratio = float(r.get("roe_pbr_ratio") or 0.0)
        qoq_price_g = float(r.get("qoq_price_growth_pct") or 0.0)
        yoy_price_g = float(r.get("yoy_price_growth_pct") or 0.0)
        mcap_eok = float(r.get("market_cap_eok") or 0.0)
        mkt = str(r.get("market") or "")
        sec = str(r.get("sector") or "").strip()
        sub_sec = str(r.get("sub_sector") or sec or "기타").strip()
        biz_desc = str(r.get("business_desc") or "").strip()

        # ROE 적자↔흑자 턴어라운드 / 반전 유형 분류:
        if prev_q_roe < 0 and roe > 0:
            roe_turnaround_type = "TURNAROUND_PROFIT"
        elif prev_q_roe > 0 and roe < 0:
            roe_turnaround_type = "TURNAROUND_LOSS"
        elif prev_q_roe >= 0 and roe >= 0:
            roe_turnaround_type = "PROFIT_UP" if qoq_roe_diff >= 0 else "PROFIT_DOWN"
        else:
            roe_turnaround_type = "CONT_LOSS"

        if market_filter == "KOSPI" and "코스피" not in mkt:
            continue
        if market_filter == "KOSDAQ" and "코스닥" not in mkt:
            continue
        if sector_filter and sector_filter != "ALL" and sec != sector_filter and sub_sec != sector_filter:
            continue
        if sub_sector_filter and sub_sector_filter != "ALL" and sub_sec != sub_sector_filter:
            continue

        # ★ 사용자가 '흑자→적자 반전(TURNAROUND_LOSS)' 전용 조회를 선택한 경우에는 적자(roe < 0) 및 PER<=0 종목도 반드시 통과시켜 확인 가능하게 처리
        if turnaround_filter == "TURNAROUND_PROFIT":
            if roe_turnaround_type != "TURNAROUND_PROFIT":
                continue
        elif turnaround_filter == "TURNAROUND_LOSS":
            if roe_turnaround_type != "TURNAROUND_LOSS":
                continue
        elif turnaround_filter == "BOTH_REVERSAL":
            if roe_turnaround_type not in ("TURNAROUND_PROFIT", "TURNAROUND_LOSS"):
                continue
        elif turnaround_filter == "EXCLUDE_TURNAROUND_LOSS":
            if roe_turnaround_type == "TURNAROUND_LOSS":
                continue

        is_loss_reversal_mode = (
            turnaround_filter in ("TURNAROUND_LOSS", "BOTH_REVERSAL")
            and roe_turnaround_type == "TURNAROUND_LOSS"
        ) or bypass_valuation_filters

        # [핵심 조건 1] ROE 수준 & 전분기 대비 ROE 개선(기울기 우상향) 필터
        cond_high_roe = (min_roe <= roe <= max_roe)
        cond_qoq_roe_up = (qoq_roe_diff >= min_qoq_roe_diff) and (roe >= min_roe_floor_for_qoq) and (roe <= max_roe)

        # 성장주 우상향 전용 모드(only_upward_slope / GROWTH_UPWARD):
        # 반드시 현재분기(25.4Q~26.3Q) ROE 절대수준이 기준치(기본 10%) 이상이면서
        # 전분기(25.3Q~26.2Q) 대비 현재분기 ROE 증감폭(기울기 ΔROE = cur_roe - prev_q_roe)이 양수(> 0) 및 최소 증감폭 이상인 우상향 종목만 채택!
        if not is_loss_reversal_mode:
            if only_upward_slope:
                eff_min_roe = min_roe if use_roe else 10.0
                eff_min_slope = max(0.01, min_qoq_roe_diff if (use_qoq_roe and min_qoq_roe_diff > 0) else 0.01)
                if not (eff_min_roe <= roe <= max_roe and qoq_roe_diff >= eff_min_slope and qoq_roe_diff > 0):
                    continue
            elif use_roe and use_qoq_roe:
                if roe_mode in ("HIGH_AND_UP", "GROWTH_UPWARD"):
                    if not (cond_high_roe and cond_qoq_roe_up and qoq_roe_diff > 0):
                        continue
                else:
                    # HIGH_OR_UP: ROE가 이미 높은 수준이거나, 전분기 대비 뚜렷하게 증가하는 종목 모두 포착
                    if not (cond_high_roe or cond_qoq_roe_up):
                        continue
            elif use_roe:
                if not cond_high_roe:
                    continue
            elif use_qoq_roe:
                if not cond_qoq_roe_up:
                    continue

        # [핵심 조건 2] PBR 절대 수준 필터 (저PBR)
        if use_pbr and not is_loss_reversal_mode:
            if pbr < min_pbr or pbr > max_pbr:
                continue

        # [핵심 조건 3] 전분기 대비 PBR이 크게 늘어나지 않은 종목 필터
        if use_qoq_pbr_limit and not is_loss_reversal_mode:
            if qoq_pbr_diff > max_qoq_pbr_diff:
                continue
            if qoq_pbr_growth_pct > max_qoq_pbr_growth_pct:
                continue

        # [핵심 조건 4] PER 범위 필터
        if use_per and not is_loss_reversal_mode:
            if per <= 0 or per < min_per or per > max_per:
                continue

        # [핵심 조건 5] ROE / PBR 가성비 지수 필터 (ROE ÷ PBR)
        if use_roe_pbr_ratio and not is_loss_reversal_mode:
            if roe_pbr_ratio < min_roe_pbr_ratio:
                continue

        # [보조 조건 6] 분기 주가 등락률 범위 필터 (주가가 아직 과열되지 않았거나 상승 전환 중인 종목)
        if use_price_change:
            if qoq_price_g < min_price_change or qoq_price_g > max_price_change:
                continue

        # [보조 조건 7] 최소 시가총액 필터
        if use_mcap:
            if mcap_eok < min_mcap_eok:
                continue

        # 선별 사유 태그 생성
        tags = []
        if roe_turnaround_type == "TURNAROUND_PROFIT":
            tags.append(f"🔥적자→흑자 전환({prev_q_roe:.1f}%→{roe:.1f}%)")
        elif roe_turnaround_type == "TURNAROUND_LOSS":
            tags.append(f"⚠️흑자→적자 반전({prev_q_roe:.1f}%→{roe:.1f}%)")
        if roe >= 12.0:
            tags.append(f"고ROE({roe:.1f}%)")
        if qoq_roe_diff >= 1.0 and roe_turnaround_type != "TURNAROUND_PROFIT":
            tags.append(f"전분기비 ROE +{qoq_roe_diff:.1f}%p↑")
        if pbr <= 0.8:
            tags.append(f"저PBR({pbr:.2f}배)")
        if qoq_pbr_diff <= 0.0:
            tags.append(f"PBR 동결/하락({qoq_pbr_diff:+.2f}배)")
        elif qoq_pbr_diff <= 0.15:
            tags.append(f"PBR 상승억제({qoq_pbr_diff:+.2f}배)")

        results.append({
            "ticker": r["ticker"],
            "name": r["name"],
            "market": mkt,
            "sector": sec,
            "sub_sector": sub_sec,
            "business_desc": biz_desc,
            "style": r["style"],
            "price": int(r.get("price") or 0),
            "market_cap_eok": round(mcap_eok, 1),
            "roe": round(roe, 2),
            "prev_q_roe": round(prev_q_roe, 2),
            "qoq_roe_diff": round(qoq_roe_diff, 2),
            "roe_turnaround_type": roe_turnaround_type,
            "yoy_roe_diff": round(qoq_roe_diff, 2),  # 하위 호환
            "roe_2312": round(float(r.get("roe_2312") or 0.0), 2),
            "roe_2403": round(float(r.get("roe_2403") or 0.0), 2),
            "roe_2406": round(float(r.get("roe_2406") or 0.0), 2),
            "roe_2412_est": round(float(r.get("roe_2412_est") or 0.0), 2),
            "pbr": round(pbr, 2),
            "prev_q_pbr": round(prev_q_pbr, 2),
            "qoq_pbr_diff": round(qoq_pbr_diff, 2),
            "qoq_pbr_growth_pct": round(qoq_pbr_growth_pct, 1),
            "per": round(per, 2),
            "prev_q_per": round(float(r.get("prev_q_per") or 0.0), 2),
            "bps": int(r.get("bps") or 0),
            "eps": int(r.get("eps") or 0),
            "div_yield": round(float(r.get("div_yield") or 0.0), 2),
            "roe_pbr_ratio": round(roe_pbr_ratio, 2),
            "qoq_price_growth_pct": round(qoq_price_g, 2),
            "yoy_price_growth_pct": round(yoy_price_g, 2),
            "quarter_label": "전분기(25.3Q~26.2Q) → 현재분기(25.4Q~26.3Q)",
            "selection_tags": tags,
        })

    if sort_by in ("NAME_ASC", "NAME"):
        results.sort(key=lambda x: str(x.get("name") or ""))
    elif sort_by == "QOQ_ROE_DIFF":
        results.sort(key=lambda x: (x["qoq_roe_diff"], x["roe_pbr_ratio"]), reverse=True)
    elif sort_by == "ROE_DESC":
        results.sort(key=lambda x: (x["roe"], -x["pbr"]), reverse=True)
    elif sort_by == "PBR_ASC":
        results.sort(key=lambda x: (x["pbr"], -x["roe"]))
    elif sort_by == "PER_ASC":
        results.sort(key=lambda x: (x["per"] if x["per"] > 0 else 9999.0, -x["roe"]))
    elif sort_by == "ROE_PBR_RATIO":
        results.sort(key=lambda x: (x["roe_pbr_ratio"], x["qoq_roe_diff"]), reverse=True)
    else:
        # 기본: 종목명 가나다순 정렬
        results.sort(key=lambda x: str(x.get("name") or ""))

    return results


DEFAULT_TETRIS_SCREENER_CONFIG = {
    "roe_filter_mode": "HIGH_OR_UP",
    "only_upward_slope": False,
    "use_roe": True,
    "min_roe": 10.0,
    "max_roe": 80.0,
    "use_qoq_roe": True,
    "min_qoq_roe_diff": 1.0,
    "min_roe_floor_for_qoq": 4.0,
    "use_pbr": True,
    "min_pbr": 0.15,
    "max_pbr": 1.2,
    "use_qoq_pbr_limit": True,
    "max_qoq_pbr_diff": 0.15,
    "max_qoq_pbr_growth_pct": 15.0,
    "use_per": True,
    "min_per": 1.0,
    "max_per": 15.0,
    "use_roe_pbr_ratio": True,
    "min_roe_pbr_ratio": 10.0,
    "use_price_change": False,
    "min_price_change": -20.0,
    "max_price_change": 25.0,
    "market_filter": "ALL",
    "sort_by": "NAME_ASC",
}


def get_saved_tetris_screener_config(user_id: str = "admin") -> dict:
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS tetris_screener_saved_config (
            user_id TEXT PRIMARY KEY,
            config_json TEXT,
            updated_at TEXT
        )
        """
    )
    c.execute("SELECT config_json, updated_at FROM tetris_screener_saved_config WHERE user_id = ?", (uid,))
    row = c.fetchone()
    conn.close()
    cfg = dict(DEFAULT_TETRIS_SCREENER_CONFIG)
    updated_at = None
    if row and row["config_json"]:
        try:
            import json
            loaded = json.loads(row["config_json"])
            if isinstance(loaded, dict):
                cfg.update(loaded)
            updated_at = row["updated_at"]
        except Exception:
            pass
    return {"config": cfg, "updated_at": updated_at}


def save_tetris_screener_config(config_data: dict, user_id: str = "admin") -> dict:
    import json
    from datetime import datetime, timedelta
    uid = _norm_uid(user_id)
    merged = dict(DEFAULT_TETRIS_SCREENER_CONFIG)
    if isinstance(config_data, dict):
        for k in DEFAULT_TETRIS_SCREENER_CONFIG.keys():
            if k in config_data and config_data[k] is not None:
                merged[k] = config_data[k]
    now_str = (datetime.utcnow() + timedelta(hours=9)).strftime("%Y-%m-%d %H:%M:%S")
    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS tetris_screener_saved_config (
            user_id TEXT PRIMARY KEY,
            config_json TEXT,
            updated_at TEXT
        )
        """
    )
    c.execute(
        """
        INSERT INTO tetris_screener_saved_config (user_id, config_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            config_json = excluded.config_json,
            updated_at = excluded.updated_at
        """,
        (uid, json.dumps(merged, ensure_ascii=False), now_str),
    )
    conn.commit()
    conn.close()
    return {"config": merged, "updated_at": now_str}

def _norm_uid(user_id: str = "admin") -> str:
    if not user_id or not str(user_id).strip():
        return "admin"
    u = str(user_id).strip()
    if u in ("user_1", "황의춘", "주인장", "관리자", "주인장(관리자)", "h80494", "guest"):
        return "admin"
    return u


def _ensure_trading_ledger_columns(c):
    for extra_col in ["user_id TEXT DEFAULT 'admin'", "batch_id TEXT", "created_at TEXT", "sell_type TEXT DEFAULT 'CLOSE'", "sold_at TEXT"]:
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
    pure_t = str(ticker).split(":")[-1].strip()
    krx_t = f"KRX:{pure_t}"

    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        'SELECT * FROM holdings WHERE user_id = ? AND (ticker = ? OR ticker = ? OR ticker = ?)',
        (uid, ticker, pure_t, krx_t),
    )
    row = c.fetchone()
    if row:
        matched_t = row['ticker']
        if qty > 0:
            # 최초 매수 이후 동일 종목 추가 매수(수량 누적) 원천 차단
            conn.close()
            return
        new_qty = int(row['qty'] or 0) + qty
        if new_qty <= 0:
            c.execute(
                'DELETE FROM holdings WHERE user_id = ? AND (ticker = ? OR ticker = ? OR ticker = ?)',
                (uid, matched_t, pure_t, krx_t),
            )
        else:
            c.execute(
                'UPDATE holdings SET qty = ?, buy_price = ? WHERE user_id = ? AND ticker = ?',
                (new_qty, row['buy_price'], uid, matched_t),
            )
    else:
        if qty > 0 and price > 0:
            capped_qty = min(qty, int(max_per_stock // price))
            if capped_qty > 0:
                c.execute(
                    'INSERT INTO holdings (user_id, ticker, name, buy_price, qty) VALUES (?, ?, ?, ?, ?)',
                    (uid, pure_t, name, price, capped_qty),
                )
    conn.commit()
    conn.close()


def sell_single_holding(ticker: str, qty: int, sell_price: float = 0.0, name: str = "", user_id: str = "admin") -> dict:
    """
    장중 개별 보유 종목을 즉시 매도 처리하고, holdings 차감/삭제 및 trading_ledger 상태('SELL') 갱신을 원자적으로 수행합니다.
    (get_holdings() 호출 시 이미 매도된 종목이 다시 복원되는 현상을 완벽히 방지합니다.)
    """
    from datetime import datetime, timedelta
    from trading_config import calculate_settlement_metrics

    uid = _norm_uid(user_id)
    pure_t = str(ticker).split(":")[-1].strip()
    krx_t = f"KRX:{pure_t}"
    today_str = (datetime.utcnow() + timedelta(hours=9)).strftime("%Y-%m-%d")

    conn = get_db_connection()
    c = conn.cursor()
    _ensure_trading_ledger_columns(c)

    # 1. holdings 테이블에서 해당 종목 조회
    c.execute(
        "SELECT ticker, name, buy_price, qty FROM holdings WHERE user_id = ? AND (ticker = ? OR ticker = ? OR ticker = ?)",
        (uid, ticker, pure_t, krx_t),
    )
    h_row = c.fetchone()

    # 2. trading_ledger에서 당일 매수 레코드 조회
    c.execute(
        "SELECT id, ticker, name, buy_price, qty, status FROM trading_ledger WHERE user_id = ? AND trade_date = ? AND (ticker = ? OR ticker = ? OR ticker = ?) ORDER BY id ASC",
        (uid, today_str, ticker, pure_t, krx_t),
    )
    l_rows = c.fetchall()

    held_qty = int(h_row["qty"]) if h_row and h_row["qty"] else (int(l_rows[0]["qty"]) if l_rows and l_rows[0]["qty"] else max(1, int(qty or 1)))
    buy_price = float(h_row["buy_price"]) if h_row and h_row["buy_price"] else (float(l_rows[0]["buy_price"]) if l_rows and l_rows[0]["buy_price"] else float(sell_price or 0.0))
    stock_name = (h_row["name"] if h_row and h_row["name"] else (l_rows[0]["name"] if l_rows and l_rows[0]["name"] else (name or pure_t)))

    exec_sell_price = float(sell_price) if (sell_price and float(sell_price) > 0) else buy_price
    sell_qty = min(held_qty, max(1, int(qty))) if qty and int(qty) > 0 else held_qty
    remaining_qty = max(0, held_qty - sell_qty)
    item_pnl = round((exec_sell_price - buy_price) * sell_qty, 0)

    # 3. holdings 업데이트 또는 삭제
    if remaining_qty <= 0:
        c.execute(
            "DELETE FROM holdings WHERE user_id = ? AND (ticker = ? OR ticker = ? OR ticker = ?)",
            (uid, ticker, pure_t, krx_t),
        )
    else:
        c.execute(
            "UPDATE holdings SET qty = ? WHERE user_id = ? AND (ticker = ? OR ticker = ? OR ticker = ?)",
            (remaining_qty, uid, ticker, pure_t, krx_t),
        )

    # 4. trading_ledger 업데이트 (전량 매도 시 status='SELL', sell_type='INTRADAY', 부분 매도 시 잔여 BUY + 매도분 SELL 분리 기록)
    now_kst_iso = (datetime.utcnow() + timedelta(hours=9)).isoformat(timespec="seconds")
    if l_rows:
        primary_id = l_rows[0]["id"]
        if remaining_qty <= 0:
            c.execute(
                "UPDATE trading_ledger SET name = ?, buy_price = ?, sell_price = ?, qty = ?, pnl = ?, status = 'SELL', sell_type = 'INTRADAY', sold_at = ? WHERE id = ?",
                (stock_name, buy_price, exec_sell_price, sell_qty, item_pnl, now_kst_iso, primary_id),
            )
        else:
            c.execute(
                "UPDATE trading_ledger SET qty = ? WHERE id = ?",
                (remaining_qty, primary_id),
            )
            c.execute(
                """
                INSERT INTO trading_ledger (user_id, trade_date, ticker, name, buy_price, sell_price, qty, pnl, status, sell_type, sold_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SELL', 'INTRADAY', ?)
                """,
                (uid, today_str, pure_t, stock_name, buy_price, exec_sell_price, sell_qty, item_pnl, now_kst_iso),
            )
    else:
        c.execute(
            """
            INSERT INTO trading_ledger (user_id, trade_date, ticker, name, buy_price, sell_price, qty, pnl, status, sell_type, sold_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SELL', 'INTRADAY', ?)
            """,
            (uid, today_str, pure_t, stock_name, buy_price, exec_sell_price, sell_qty, item_pnl, now_kst_iso),
        )

    conn.commit()
    conn.close()

    # 5. 장중 개별 종목 매도 즉시 일자별 매매원장(trade_ledger) 및 실현손익(pnl_history)에 차익 누적 반영
    ledger_summary = sync_daily_realized_ledger(today_str, user_id=uid)

    return {
        "ticker": pure_t,
        "name": stock_name,
        "sold_qty": sell_qty,
        "remaining_qty": remaining_qty,
        "buy_price": buy_price,
        "sell_price": exec_sell_price,
        "pnl": item_pnl,
        "daily_realized_net_pnl": ledger_summary.get("net_pnl", item_pnl),
        "daily_realized_return_rate": ledger_summary.get("return_rate", 0.0),
    }


def sync_daily_realized_ledger(trade_date: str, user_id: str = "admin") -> dict:
    """
    당일(trade_date) trading_ledger에서 매도 확정(status='SELL')된 모든 종목(장중 개별매도 + 장마감 일괄매도)을 합산하여
    일자별 요약 매매원장(trade_ledger) 및 실현손익(pnl_history)에 즉시 반영합니다.
    """
    from trading_config import get_trading_config, calculate_settlement_metrics

    uid = _norm_uid(user_id)
    cfg = get_trading_config()
    max_total = float(cfg["max_total_capital"])

    conn = get_db_connection()
    c = conn.cursor()
    _ensure_trading_ledger_columns(c)
    c.execute(
        "SELECT buy_price, sell_price, qty, pnl FROM trading_ledger WHERE user_id = ? AND trade_date = ? AND status = 'SELL'",
        (uid, trade_date),
    )
    sold_rows = c.fetchall()
    if not sold_rows:
        conn.close()
        return {"total_buy": 0.0, "total_sell": 0.0, "net_pnl": 0.0, "return_rate": 0.0, "sold_count": 0}

    tot_b = sum(float(r["buy_price"] or 0) * int(r["qty"] or 0) for r in sold_rows)
    tot_s = sum(float(r["sell_price"] or r["buy_price"] or 0) * int(r["qty"] or 0) for r in sold_rows)
    if tot_b > max_total and tot_b > 0:
        scale = max_total / tot_b
        tot_b = round(tot_b * scale, 2)
        tot_s = round(tot_s * scale, 2)

    metrics = calculate_settlement_metrics(tot_b, tot_s)
    c.execute(
        """
        INSERT INTO trade_ledger (user_id, date, total_buy, total_sell, fees, tax, net_pnl, return_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET
            total_buy = excluded.total_buy,
            total_sell = excluded.total_sell,
            fees = excluded.fees,
            tax = excluded.tax,
            net_pnl = excluded.net_pnl,
            return_rate = excluded.return_rate
        """,
        (uid, trade_date, tot_b, tot_s, metrics["fees"], metrics["tax"], metrics["net_pnl"], metrics["return_rate"]),
    )
    c.execute(
        """
        INSERT INTO pnl_history (user_id, date, realized_pnl)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, date) DO UPDATE SET realized_pnl = excluded.realized_pnl
        """,
        (uid, trade_date, metrics["net_pnl"]),
    )
    conn.commit()
    conn.close()
    return {
        "total_buy": tot_b,
        "total_sell": tot_s,
        "fees": metrics["fees"],
        "tax": metrics["tax"],
        "net_pnl": metrics["net_pnl"],
        "return_rate": metrics["return_rate"],
        "sold_count": len(sold_rows),
    }


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
    (이미 장중 개별매각 sell_type='INTRADAY'로 확정된 종목은 절대 덮어쓰지 않고 보존합니다.)
    """
    from datetime import datetime, timedelta
    uid = _norm_uid(user_id)
    now_kst_iso = (datetime.utcnow() + timedelta(hours=9)).isoformat(timespec="seconds")
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

        c.execute("SELECT id, status, sell_type FROM trading_ledger WHERE user_id = ? AND trade_date = ? AND ticker = ? ORDER BY id ASC", (uid, trade_date, t))
        rows = c.fetchall()
        if rows:
            if rows[0]['status'] == 'SELL' and (rows[0]['sell_type'] or '') == 'INTRADAY':
                continue
            keep_id = rows[0]['id']
            c.execute(
                "UPDATE trading_ledger SET name = ?, buy_price = ?, sell_price = ?, qty = ?, pnl = ?, status = 'SELL', sell_type = 'CLOSE', sold_at = COALESCE(sold_at, ?) WHERE id = ?",
                (name, bp, sp, qty, pnl, now_kst_iso, keep_id),
            )
            if len(rows) > 1:
                dup_ids = [r['id'] for r in rows[1:]]
                placeholders = ",".join("?" for _ in dup_ids)
                c.execute(f"DELETE FROM trading_ledger WHERE id IN ({placeholders})", dup_ids)
        else:
            c.execute('''
                INSERT INTO trading_ledger (user_id, trade_date, ticker, name, buy_price, sell_price, qty, pnl, status, sell_type, sold_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SELL', 'CLOSE', ?)
            ''', (uid, trade_date, t, name, bp, sp, qty, pnl, now_kst_iso))
    conn.commit()
    conn.close()


def get_ledger_history(user_id: str = "admin"):
    from trading_config import calculate_settlement_metrics
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT * FROM trade_ledger WHERE user_id = ? ORDER BY date DESC', (uid,))
    rows = [dict(row) for row in c.fetchall()]

    # trading_ledger에는 내역이 있으나 trade_ledger에 아직 일자별 집계가 없는 날짜가 있다면 즉시 동기화 보강
    existing_dates = {r.get("date") for r in rows}
    c.execute('SELECT DISTINCT trade_date FROM trading_ledger WHERE user_id = ? ORDER BY trade_date DESC', (uid,))
    tl_dates = [r[0] for r in c.fetchall() if r[0]]
    for td in tl_dates:
        if td not in existing_dates:
            c.execute('SELECT buy_price, sell_price, qty, status FROM trading_ledger WHERE user_id = ? AND trade_date = ?', (uid, td))
            d_rows = c.fetchall()
            if d_rows:
                tot_b = sum(float(dr["buy_price"] or 0) * int(dr["qty"] or 0) for dr in d_rows)
                tot_s = sum(float(dr["sell_price"] or dr["buy_price"] or 0) * int(dr["qty"] or 0) for dr in d_rows)
                m = calculate_settlement_metrics(tot_b, tot_s)
                rows.append({
                    "user_id": uid,
                    "date": td,
                    "total_buy": tot_b,
                    "total_sell": tot_s,
                    "fees": m["fees"],
                    "tax": m["tax"],
                    "net_pnl": m["net_pnl"],
                    "return_rate": m["return_rate"],
                })
    conn.close()
    rows.sort(key=lambda x: str(x.get("date") or ""), reverse=True)
    return rows


def get_detailed_trading_ledger(date_str: str = None, user_id: str = "admin"):
    uid = _norm_uid(user_id)
    conn = get_db_connection()
    c = conn.cursor()
    _ensure_trading_ledger_columns(c)
    if date_str:
        c.execute('SELECT * FROM trading_ledger WHERE user_id = ? AND trade_date = ? ORDER BY CASE WHEN sell_type = "INTRADAY" THEN 0 ELSE 1 END, id DESC', (uid, date_str))
    else:
        c.execute('SELECT * FROM trading_ledger WHERE user_id = ? ORDER BY trade_date DESC, CASE WHEN sell_type = "INTRADAY" THEN 0 ELSE 1 END, id DESC', (uid,))
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

def get_system_setting(key: str, default: str = "") -> str:
    try:
        conn = get_db_connection()
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS auth_system_config (
                config_key TEXT PRIMARY KEY,
                config_value TEXT,
                updated_at TEXT
            )
        ''')
        c.execute("SELECT config_value FROM auth_system_config WHERE config_key = ?", (key,))
        row = c.fetchone()
        conn.close()
        if row and row["config_value"] is not None:
            return str(row["config_value"])
    except Exception:
        pass
    return default


def set_system_setting(key: str, value: str):
    import datetime
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('''
        CREATE TABLE IF NOT EXISTS auth_system_config (
            config_key TEXT PRIMARY KEY,
            config_value TEXT,
            updated_at TEXT
        )
    ''')
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    c.execute(
        "INSERT OR REPLACE INTO auth_system_config (config_key, config_value, updated_at) VALUES (?, ?, ?)",
        (key, str(value), now_str),
    )
    conn.commit()
    conn.close()


def get_admin_master_password() -> str:
    import os
    db_pw = get_system_setting("admin_master_password", "").strip()
    if db_pw:
        os.environ["ADMIN_MASTER_PASSWORD"] = db_pw
        return db_pw
    env_pw = os.environ.get("ADMIN_MASTER_PASSWORD", "h80494").strip() or "h80494"
    return env_pw


def set_admin_master_password(new_password: str):
    import os
    clean_pw = new_password.strip()
    set_system_setting("admin_master_password", clean_pw)
    os.environ["ADMIN_MASTER_PASSWORD"] = clean_pw


def get_smtp_config() -> dict:
    import os
    host = get_system_setting("smtp_host", os.environ.get("SMTP_HOST", "smtp.gmail.com")).strip() or "smtp.gmail.com"
    port_str = get_system_setting("smtp_port", os.environ.get("SMTP_PORT", "587")).strip() or "587"
    user = get_system_setting("smtp_user", os.environ.get("SMTP_USER", "")).strip()
    password = get_system_setting("smtp_password", os.environ.get("SMTP_PASSWORD", "")).strip()
    sender_name = get_system_setting("smtp_sender_name", "AI Stock Expert 2.0").strip() or "AI Stock Expert 2.0"
    try:
        port = int(port_str)
    except Exception:
        port = 587
    return {
        "smtp_host": host,
        "smtp_port": port,
        "smtp_user": user,
        "smtp_password": password,
        "smtp_sender_name": sender_name,
        "is_configured": bool(host and user and password),
    }


def save_smtp_config(smtp_host: str, smtp_port: int, smtp_user: str, smtp_password: str = "", smtp_sender_name: str = "AI Stock Expert 2.0") -> dict:
    set_system_setting("smtp_host", smtp_host.strip() or "smtp.gmail.com")
    set_system_setting("smtp_port", str(int(smtp_port or 587)))
    set_system_setting("smtp_user", smtp_user.strip())
    if smtp_password and not smtp_password.startswith("••••"):
        set_system_setting("smtp_password", smtp_password.strip())
    set_system_setting("smtp_sender_name", smtp_sender_name.strip() or "AI Stock Expert 2.0")
    cfg = get_smtp_config()
    return {
        "smtp_host": cfg["smtp_host"],
        "smtp_port": cfg["smtp_port"],
        "smtp_user": cfg["smtp_user"],
        "smtp_sender_name": cfg["smtp_sender_name"],
        "is_configured": cfg["is_configured"],
    }


def send_email_verification_code(email: str) -> dict:
    import datetime
    import random
    import time
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from email.utils import formataddr

    clean_email = (email or "").strip().lower()
    if not clean_email or "@" not in clean_email:
        return {"success": False, "message": "유효한 이메일 주소를 입력해 주세요."}

    code = f"{random.randint(100000, 999999)}"
    now_ts = time.time()
    expires_at = now_ts + 600.0  # 10분 유효
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    conn = get_db_connection()
    c = conn.cursor()
    c.execute(
        "INSERT OR REPLACE INTO email_verifications (email, code, expires_at, verified, created_at) VALUES (?, ?, ?, 0, ?)",
        (clean_email, code, expires_at, now_str),
    )
    conn.commit()
    conn.close()

    smtp_cfg = get_smtp_config()
    if smtp_cfg["is_configured"]:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = f"[AI Stock Expert 2.0] 회원가입 이메일 인증번호 [{code}]"
            msg["From"] = formataddr((smtp_cfg["smtp_sender_name"], smtp_cfg["smtp_user"]))
            msg["To"] = clean_email

            html_body = f"""
            <div style="font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; background: #121318; color: #f3f4f6; border-radius: 16px; border: 1px solid #374151;">
              <h2 style="color: #38bdf8; margin-top: 0;">AI Stock Expert 2.0 이메일 인증</h2>
              <p style="font-size: 14px; color: #d1d5db; line-height: 1.6;">
                안녕하세요. 회원가입을 위한 6자리 이메일 인증번호입니다.<br/>
                아래 인증번호를 회원가입 화면에 입력해 주세요. (유효시간 10분)
              </p>
              <div style="margin: 20px 0; padding: 18px; background: #1f2937; border: 1px solid #6366f1; border-radius: 12px; text-align: center;">
                <span style="font-size: 28px; font-weight: 800; letter-spacing: 6px; color: #ffffff; font-family: monospace;">{code}</span>
              </div>
              <p style="font-size: 12px; color: #9ca3af;">본인이 요청하지 않은 경우 이 메일을 무시하셔도 됩니다.</p>
            </div>
            """
            msg.attach(MIMEText(html_body, "html", "utf-8"))

            if int(smtp_cfg["smtp_port"]) == 465:
                with smtplib.SMTP_SSL(smtp_cfg["smtp_host"], int(smtp_cfg["smtp_port"]), timeout=10) as server:
                    server.login(smtp_cfg["smtp_user"], smtp_cfg["smtp_password"])
                    server.sendmail(smtp_cfg["smtp_user"], [clean_email], msg.as_string())
            else:
                with smtplib.SMTP(smtp_cfg["smtp_host"], int(smtp_cfg["smtp_port"]), timeout=10) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(smtp_cfg["smtp_user"], smtp_cfg["smtp_password"])
                    server.sendmail(smtp_cfg["smtp_user"], [clean_email], msg.as_string())

            return {
                "success": True,
                "smtp_sent": True,
                "message": f"{clean_email} 주소로 6자리 인증번호 메일이 발송되었습니다. (10분 내 입력)",
            }
        except Exception as e:
            print(f"[Email Verification SMTP Error] {e}")
            return {
                "success": True,
                "smtp_sent": False,
                "fallback_code": code,
                "message": f"SMTP 메일 발송 실패({str(e)[:60]})로 인해 화면 즉시 인증코드 [{code}]가 발급되었습니다.",
            }
    else:
        return {
            "success": True,
            "smtp_sent": False,
            "fallback_code": code,
            "message": f"[이메일 인증코드: {code}] (현재 관리자 SMTP 발송 계정이 미등록 상태여서 즉시 인증코드가 표시됩니다. 관리자 센터에서 Gmail/Naver SMTP를 등록하면 실제 메일로 발송됩니다.)",
        }


def verify_email_code(email: str, code: str) -> dict:
    import time
    clean_email = (email or "").strip().lower()
    clean_code = (code or "").strip()
    if not clean_email or not clean_code:
        return {"success": False, "message": "이메일과 인증번호 6자리를 모두 입력해 주세요."}

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT email, code, expires_at, verified FROM email_verifications WHERE email = ?", (clean_email,))
    row = c.fetchone()
    if not row:
        conn.close()
        return {"success": False, "message": "해당 이메일로 발송된 인증번호 내역이 없습니다. [인증번호 발송]을 먼저 눌러주세요."}

    if time.time() > float(row["expires_at"]):
        conn.close()
        return {"success": False, "message": "인증번호 유효시간(10분)이 만료되었습니다. 다시 발송해 주세요."}

    if str(row["code"]).strip() != clean_code:
        conn.close()
        return {"success": False, "message": "인증번호가 일치하지 않습니다. 다시 확인해 주세요."}

    c.execute("UPDATE email_verifications SET verified = 1 WHERE email = ?", (clean_email,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "✅ 이메일 인증이 완료되었습니다."}


def is_email_verified(email: str) -> bool:
    import time
    clean_email = (email or "").strip().lower()
    if not clean_email:
        return False
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT verified, expires_at FROM email_verifications WHERE email = ?", (clean_email,))
    row = c.fetchone()
    conn.close()
    if not row:
        return False
    # 인증 완료 후 30분 이내 가입 허용
    return bool(int(row["verified"] or 0) == 1 and (time.time() <= float(row["expires_at"]) + 1800.0))


def create_user_request(name: str, phone: str, email: str, requested_password: str, login_id: str = "", email_verified: bool = False):
    import datetime
    conn = get_db_connection()
    c = conn.cursor()

    clean_login_id = (login_id or "").strip()
    clean_email = (email or "").strip().lower()
    clean_name = (name or clean_login_id).strip()
    clean_phone = (phone or "-").strip()

    if clean_login_id:
        if clean_login_id.lower() in ("admin", "administrator", "주인장", "관리자"):
            conn.close()
            raise ValueError("해당 아이디(ID)는 관리자 예약어이므로 사용할 수 없습니다.")
        c.execute("SELECT id FROM user_access_requests WHERE lower(login_id) = lower(?)", (clean_login_id,))
        if c.fetchone():
            conn.close()
            raise ValueError(f"이미 사용 중인 아이디({clean_login_id})입니다. 다른 아이디를 입력해 주세요.")

    if clean_email:
        c.execute("SELECT id FROM user_access_requests WHERE lower(email) = lower(?) AND status = 'approved'", (clean_email,))
        if c.fetchone():
            conn.close()
            raise ValueError(f"이미 가입된 이메일({clean_email})입니다.")

    created_at = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    # 이메일 인증을 완료하더라도 반드시 관리자(주인장)가 승인해야만 로그인할 수 있도록 항상 'pending'(승인 대기) 상태로 등록
    status_val = 'pending'
    approved_at = None

    c.execute('''
        INSERT INTO user_access_requests (login_id, name, phone, email, requested_password, email_verified, status, created_at, approved_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (clean_login_id, clean_name, clean_phone, clean_email, requested_password, 1 if email_verified else 0, status_val, created_at, approved_at))
    conn.commit()
    req_id = c.lastrowid
    conn.close()
    return req_id

def get_all_user_requests():
    conn = get_db_connection()
    c = conn.cursor()
    c.execute('SELECT id, login_id, name, phone, email, requested_password, email_verified, status, created_at, approved_at FROM user_access_requests ORDER BY id DESC')
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

def verify_user_password(password: str, login_id: str = ""):
    admin_master = get_admin_master_password()
    clean_id = (login_id or "").strip()
    clean_pw = (password or "").strip()

    # 마스터 관리자 비밀번호 (주인장): ID가 비어있거나 admin/주인장/관리자/황의춘/h80494일 때 마스터 비밀번호 일치 시 로그인
    if clean_pw == admin_master and clean_id.lower() in ("", "admin", "주인장", "관리자", "황의춘", "h80494", "h80494@gmail.com"):
        return {
            "authenticated": True,
            "is_admin": True,
            "user_id": "admin",
            "login_id": "admin",
            "name": "주인장(관리자)",
        }

    conn = get_db_connection()
    c = conn.cursor()
    row = None
    if clean_id:
        c.execute('''
            SELECT id, login_id, name, email, requested_password, status FROM user_access_requests
            WHERE (lower(login_id) = lower(?) OR lower(email) = lower(?) OR name = ?)
              AND requested_password = ? AND status = 'approved'
        ''', (clean_id, clean_id, clean_id, clean_pw))
        row = c.fetchone()
    else:
        c.execute('''
            SELECT id, login_id, name, email, requested_password, status FROM user_access_requests
            WHERE requested_password = ? AND status = 'approved'
        ''', (clean_pw,))
        row = c.fetchone()
    conn.close()

    if row:
        # 1번 계정(황의춘 / h80494@gmail.com)은 주인장(관리자) 본인이므로 user_id='admin'으로 통합 매핑
        if int(row["id"]) == 1 or (row["email"] or "").strip().lower() == "h80494@gmail.com":
            return {
                "authenticated": True,
                "is_admin": True,
                "user_id": "admin",
                "login_id": "admin",
                "request_id": row["id"],
                "name": "주인장(관리자)",
            }
        uid = f"user_{row['id']}"
        return {
            "authenticated": True,
            "is_admin": False,
            "user_id": uid,
            "login_id": row["login_id"] or row["name"],
            "request_id": row["id"],
            "name": row["name"] or row["login_id"],
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
                    max_total_capital, max_per_stock_capital, etf_order_budget_krw, etf_order_qty, etf_auto_trade,
                    is_connected, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    50000000.0,
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
                "etf_order_budget_krw": 50000000,
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
        "etf_order_budget_krw": int(float(d.get("etf_order_budget_krw") or 50000000)),
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
    etf_budget_krw = max(100000, min(10000000000, int(float(payload.get("etf_order_budget_krw") or current.get("etf_order_budget_krw") or 50000000))))
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
            max_total_capital, max_per_stock_capital, etf_order_budget_krw, etf_order_qty, etf_auto_trade,
            is_connected, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            float(etf_budget_krw),
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


def change_user_password(name: str, phone: str, current_password: str, new_password: str, login_id: str = "", is_admin_mode: bool = False):
    admin_master = get_admin_master_password()
    clean_name = (name or "").strip()
    clean_id = (login_id or "").strip()
    clean_curr = (current_password or "").strip()
    clean_new = (new_password or "").strip()

    is_admin_target = (
        is_admin_mode
        or clean_id.lower() in ("admin", "주인장", "관리자")
        or clean_name in ("주인장", "관리자", "주인장(관리자)", "admin", "")
    )

    # 관리자 비밀번호 변경 요청인 경우 (DB에 영구 저장)
    if is_admin_target and clean_curr == admin_master:
        set_admin_master_password(clean_new)
        return {"success": True, "message": "✅ 주인장(관리자) 마스터 비밀번호가 DB에 영구 저장되어 변경되었습니다."}
    elif is_admin_mode and clean_curr != admin_master:
        return {"success": False, "message": "현재 관리자 마스터 비밀번호가 일치하지 않습니다."}

    # 일반 회원 비밀번호 변경 (ID + 현재 비밀번호 또는 성함 + 연락처 + 현재 비밀번호 지원)
    conn = get_db_connection()
    c = conn.cursor()
    row = None
    if clean_id:
        c.execute('''
            SELECT id, login_id, name, phone, requested_password, status FROM user_access_requests
            WHERE (lower(login_id) = lower(?) OR lower(email) = lower(?) OR name = ?)
              AND requested_password = ?
        ''', (clean_id, clean_id, clean_id, clean_curr))
        row = c.fetchone()

    if not row and clean_name and phone.strip():
        c.execute('''
            SELECT id, login_id, name, phone, requested_password, status FROM user_access_requests
            WHERE name = ? AND phone = ? AND requested_password = ?
        ''', (clean_name, phone.strip(), clean_curr))
        row = c.fetchone()

    if not row and clean_name:
        c.execute('''
            SELECT id, login_id, name, phone, requested_password, status FROM user_access_requests
            WHERE (lower(login_id) = lower(?) OR name = ?) AND requested_password = ?
        ''', (clean_name, clean_name, clean_curr))
        row = c.fetchone()

    if not row:
        conn.close()
        return {"success": False, "message": "아이디(또는 성함) 및 현재 비밀번호가 일치하지 않습니다."}

    if row["status"] != "approved":
        conn.close()
        return {"success": False, "message": "아직 승인이 완료되지 않은 계정입니다."}

    c.execute('''
        UPDATE user_access_requests
        SET requested_password = ?
        WHERE id = ?
    ''', (clean_new, row["id"]))
    conn.commit()
    conn.close()
    display_label = row["login_id"] or row["name"]
    return {"success": True, "message": f"✅ {display_label} 님의 비밀번호가 성공적으로 변경되었습니다."}

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


RESTRICTED_MENU_ITEMS = [
    ("integrated_pnl", "📋 통합손익관리표"),
    ("futures_sim", "🚀 선물오버나잇자동매매"),
    ("order", "🚨 매수주문 (Orders)"),
    ("etf_strategy", "⚡ ETF 투자전략"),
    ("etf_history", "📜 시뮬레이션 히스토리"),
]


def get_menu_access_policy() -> dict:
    """
    신규 가입회원 및 일반 회원의 핵심 트레이딩 메뉴(선물오버나잇자동매매, 매수주문, ETF투자전략, 시뮬레이션히스토리)
    이용 권한 정책을 조회합니다.
    - mode:
      * 'ADMIN_ONLY': 관리자 1인만 이용 (일반 회원 전체 차단)
      * 'SELECTED_USERS': 관리자 + 관리자가 지정(허용)한 회원만 이용 (신규 가입회원은 자동 제한)
      * 'ALL_APPROVED': 승인된 정회원 전체 허용
    """
    import json
    raw = get_system_setting("menu_access_policy_json", "")
    default_policy = {
        "mode": "SELECTED_USERS",
        "restricted_menus": [m[0] for m in RESTRICTED_MENU_ITEMS],
        "allowed_user_ids": [],
        "menu_allowed_users": {
            "futures_sim": [],
            "order": [],
            "etf_strategy": [],
            "etf_history": [],
        },
        "notice_message": "현재 [선물오버나잇자동매매 · 매수주문 · ETF투자전략 · 시뮬레이션히스토리] 메뉴는 시스템 운영 정책에 따라 [관리자 및 지정 허용 회원 전용 모드]로 이용이 제한되어 있습니다. 일반/신규 회원분들은 재무분석(DartLab), 증권사 리포트, 시세/차트, 종목조회, AI 목표가, 종목 필터링(Tetris) 등 일반 분석 메뉴를 자유롭게 이용하실 수 있습니다.",
        "updated_at": "",
    }
    if raw:
        try:
            loaded = json.loads(raw)
            if isinstance(loaded, dict):
                default_policy.update(loaded)
        except Exception:
            pass
    mode = str(default_policy.get("mode") or "SELECTED_USERS").upper()
    if mode not in ("ADMIN_ONLY", "SELECTED_USERS", "ALL_APPROVED"):
        mode = "SELECTED_USERS"
    default_policy["mode"] = mode

    allowed_ids = default_policy.get("allowed_user_ids")
    if not isinstance(allowed_ids, list):
        allowed_ids = []
    default_policy["allowed_user_ids"] = list(dict.fromkeys([str(x).strip() for x in allowed_ids if str(x).strip()]))

    menu_map = default_policy.get("menu_allowed_users")
    if not isinstance(menu_map, dict):
        menu_map = {}
    cleaned_menu_map = {}
    for m_id, _ in RESTRICTED_MENU_ITEMS:
        m_list = menu_map.get(m_id)
        if not isinstance(m_list, list):
            m_list = list(default_policy["allowed_user_ids"])
        cleaned_menu_map[m_id] = list(dict.fromkeys([str(x).strip() for x in m_list if str(x).strip()]))
    default_policy["menu_allowed_users"] = cleaned_menu_map
    default_policy["restricted_menus"] = [m[0] for m in RESTRICTED_MENU_ITEMS]
    return default_policy


def save_menu_access_policy(payload: dict) -> dict:
    import json
    import datetime
    current = get_menu_access_policy()
    if isinstance(payload, dict):
        if "mode" in payload and payload["mode"]:
            m = str(payload["mode"]).upper().strip()
            if m in ("ADMIN_ONLY", "SELECTED_USERS", "ALL_APPROVED"):
                current["mode"] = m
        if "allowed_user_ids" in payload and isinstance(payload["allowed_user_ids"], list):
            clean_ids = list(dict.fromkeys([str(x).strip() for x in payload["allowed_user_ids"] if str(x).strip()]))
            current["allowed_user_ids"] = clean_ids
            # 통합 회원 선택 시 4대 제한 메뉴에도 동기화 (개별 메뉴 지정이 함께 오지 않은 경우)
            if "menu_allowed_users" not in payload:
                for m_id, _ in RESTRICTED_MENU_ITEMS:
                    current["menu_allowed_users"][m_id] = list(clean_ids)
        if "menu_allowed_users" in payload and isinstance(payload["menu_allowed_users"], dict):
            for m_id, _ in RESTRICTED_MENU_ITEMS:
                if m_id in payload["menu_allowed_users"] and isinstance(payload["menu_allowed_users"][m_id], list):
                    current["menu_allowed_users"][m_id] = list(
                        dict.fromkeys([str(x).strip() for x in payload["menu_allowed_users"][m_id] if str(x).strip()])
                    )
        if "notice_message" in payload and payload["notice_message"] is not None:
            current["notice_message"] = str(payload["notice_message"]).strip()

    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    current["updated_at"] = now_str
    set_system_setting("menu_access_policy_json", json.dumps(current, ensure_ascii=False))
    return get_menu_access_policy()


def get_user_menu_permissions(user_id: str = "guest", is_admin: bool = False) -> dict:
    policy = get_menu_access_policy()
    uid = _norm_uid(user_id)
    admin_flag = bool(is_admin) or (uid == "admin")
    mode = policy["mode"]
    allowed_global = set(policy.get("allowed_user_ids") or [])
    menu_map = policy.get("menu_allowed_users") or {}

    permissions = {}
    for m_id, _ in RESTRICTED_MENU_ITEMS:
        if admin_flag:
            permissions[m_id] = True
        elif mode == "ALL_APPROVED":
            permissions[m_id] = True
        elif mode == "ADMIN_ONLY":
            permissions[m_id] = False
        else:  # SELECTED_USERS
            m_allowed = set(menu_map.get(m_id) or [])
            permissions[m_id] = (uid in allowed_global) or (uid in m_allowed)

    return {
        "user_id": uid,
        "is_admin": admin_flag,
        "mode": mode,
        "restricted_menus": [m[0] for m in RESTRICTED_MENU_ITEMS],
        "permissions": permissions,
        "allowed_user_ids": policy.get("allowed_user_ids") or [],
        "menu_allowed_users": menu_map,
        "notice_message": policy.get("notice_message") or "",
        "updated_at": policy.get("updated_at") or "",
    }

# Initialize DB when imported
init_db()

