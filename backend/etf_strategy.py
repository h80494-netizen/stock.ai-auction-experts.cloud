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

import threading
import numpy as np
from functools import lru_cache

_DB_INITIALIZED = False
_DB_HAS_HISTORY = False
_LIVE_QUOTE_LOCK = threading.Lock()
_BG_SYNC_RUNNING = False
_LAST_LIVE_SYNC_TS = 0.0
_LAST_LIVE_SYNC_KST = ""
_LAST_KOSPI_FETCH_TS = 0.0
_KOSPI_ALIGNED_CACHE = {}
_SIM_RESULT_CACHE = {}
_BULK_MODELS_CACHE = {}


def _get_cache_key() -> str:
    try:
        p = os.path.join(DATA_DIR, 'last_update.txt')
        if os.path.exists(p):
            with open(p, 'r') as f:
                return f.read().strip() or "0"
    except Exception:
        pass
    return str(int(_LAST_LIVE_SYNC_TS))


def _invalidate_etf_caches():
    try:
        get_cached_etf_df.cache_clear()
    except Exception:
        pass
    try:
        get_cached_etf_pivot.cache_clear()
    except Exception:
        pass
    _SIM_RESULT_CACHE.clear()
    _BULK_MODELS_CACHE.clear()


def init_db():
    global _DB_INITIALIZED
    if _DB_INITIALIZED and os.path.exists(DB_PATH):
        return
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    c = conn.cursor()
    try:
        c.execute("PRAGMA journal_mode=WAL;")
        c.execute("PRAGMA synchronous=NORMAL;")
    except Exception:
        pass
    c.execute('''
        CREATE TABLE IF NOT EXISTS etf_daily_prices (
            ticker TEXT,
            date TEXT,
            close REAL,
            PRIMARY KEY (ticker, date)
        )
    ''')
    c.execute('''
        CREATE TABLE IF NOT EXISTS model_swaps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT,
            from_model TEXT,
            from_weights TEXT,
            from_ret REAL,
            from_sharpe REAL,
            to_model TEXT,
            to_weights TEXT,
            to_ret REAL,
            to_sharpe REAL,
            criteria TEXT,
            top_n INTEGER
        )
    ''')
    conn.commit()
    conn.close()
    _DB_INITIALIZED = True

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

def sync_live_etf_prices(force: bool = False) -> dict:
    """
    11개 글로벌/미국 ETF(EWY, EWJ, SPY, QQQ, FXI, INDA, EWZ, EWA, EZU, USO, GLD)의
    실시간 현재가/최근 종가(USD)를 고속 수집하여 etf_daily_prices DB에 즉시 반영합니다.
    - 60초 캐시 적용 (force=True 시 즉시 강제 조회)
    - 단일 bulk yf.download(5d)로 11개 개별 fast_info 순차 HTTP 병목 제거
    """
    global _LIVE_QUOTE_LOCK, _LAST_LIVE_SYNC_TS, _LAST_LIVE_SYNC_KST, _BG_SYNC_RUNNING
    if _LIVE_QUOTE_LOCK is None:
        _LIVE_QUOTE_LOCK = threading.Lock()

    now_ts = time.time()
    if not force and (now_ts - _LAST_LIVE_SYNC_TS) < 60.0:
        return {"synced": False, "cached": True, "updated_at_kst": _LAST_LIVE_SYNC_KST}

    with _LIVE_QUOTE_LOCK:
        now_ts = time.time()
        if not force and (now_ts - _LAST_LIVE_SYNC_TS) < 60.0:
            return {"synced": False, "cached": True, "updated_at_kst": _LAST_LIVE_SYNC_KST}

        _BG_SYNC_RUNNING = True
        try:
            init_db()
            tickers = list(ETF_TARGETS.keys())
            updated_prices = {}
            latest_us_date = None

            try:
                # 최근 5일 일봉(당일 장중 실시간 현재가 포함) 단일 일괄 다운로드 (약 0.6~1.1초 소요)
                recent_df = yf.download(tickers, period="5d", interval="1d", progress=False, timeout=6)
                if not recent_df.empty:
                    close_df = recent_df["Close"].copy() if isinstance(recent_df.columns, pd.MultiIndex) else recent_df.copy()
                    close_df = close_df.ffill()
                    if not close_df.empty:
                        records_5d = []
                        for dt_idx, row in close_df.iterrows():
                            d_str = dt_idx.strftime("%Y-%m-%d") if hasattr(dt_idx, "strftime") else str(dt_idx)[:10]
                            latest_us_date = d_str
                            for tk in tickers:
                                if tk in row and not pd.isna(row[tk]):
                                    pv = float(row[tk])
                                    if pv > 0 and math.isfinite(pv):
                                        records_5d.append((tk, d_str, round(pv, 4)))
                                        updated_prices[tk] = round(pv, 2)
                        if records_5d:
                            conn = sqlite3.connect(DB_PATH, timeout=20.0)
                            c = conn.cursor()
                            c.executemany(
                                "INSERT OR REPLACE INTO etf_daily_prices (ticker, date, close) VALUES (?, ?, ?)",
                                records_5d,
                            )
                            conn.commit()
                            conn.close()
            except Exception as e:
                print(f"[ETF Live Sync] 5d download notice: {e}")

            kst_now_str = (datetime.utcnow() + timedelta(hours=9)).strftime("%Y-%m-%d %H:%M:%S")
            _LAST_LIVE_SYNC_TS = time.time()
            _LAST_LIVE_SYNC_KST = kst_now_str
            try:
                with open(os.path.join(DATA_DIR, "last_update.txt"), "w") as f:
                    f.write(kst_now_str)
                _invalidate_etf_caches()
            except Exception:
                pass

            return {
                "synced": True,
                "cached": False,
                "latest_us_date": latest_us_date,
                "updated_at_kst": kst_now_str,
                "prices": updated_prices,
            }
        finally:
            _BG_SYNC_RUNNING = False


def _trigger_background_live_sync():
    global _BG_SYNC_RUNNING
    if _BG_SYNC_RUNNING:
        return
    if (time.time() - _LAST_LIVE_SYNC_TS) < 60.0:
        return
    _BG_SYNC_RUNNING = True
    t = threading.Thread(target=sync_live_etf_prices, kwargs={"force": False}, daemon=True)
    t.start()


def check_and_update_etf_data(force_live: bool = False):
    global _DB_HAS_HISTORY, _LAST_LIVE_SYNC_KST, _LAST_LIVE_SYNC_TS
    init_db()

    if not _DB_HAS_HISTORY:
        conn = sqlite3.connect(DB_PATH, timeout=20.0)
        c = conn.cursor()
        c.execute("SELECT count(*) FROM etf_daily_prices")
        row = c.fetchone()
        conn.close()
        count_val = row[0] if row else 0
        if count_val >= 200:
            _DB_HAS_HISTORY = True
            if not _LAST_LIVE_SYNC_KST:
                _LAST_LIVE_SYNC_KST = _get_cache_key()
                _LAST_LIVE_SYNC_TS = time.time() - 30.0
        else:
            update_etf_data()
            _DB_HAS_HISTORY = True
            _invalidate_etf_caches()
            return

    if force_live:
        # 사용자가 명시적으로 [실시간 ETF 현재가 새로고침] 버튼을 클릭한 경우에만 동기 실행
        sync_live_etf_prices(force=True)
    else:
        # 일반 조회 시에는 DB/메모리 캐시에서 1ms 만에 즉시 반환하고, 60초 경과 시 백그라운드 스레드에서 비동기 갱신
        _trigger_background_live_sync()


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


@lru_cache(maxsize=2)
def get_cached_etf_df(cache_key=None):
    init_db()
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    try:
        df = pd.read_sql_query(
            "SELECT ticker, date, close FROM etf_daily_prices WHERE close IS NOT NULL AND close > 0 ORDER BY date ASC",
            conn,
        )
    except Exception:
        conn.close()
        return pd.DataFrame()
    conn.close()
    return df


def get_etf_strategy_results(criteria="momentum", top_n=1, w1=0.5, w5=0.3, w20=0.2, force_refresh=False, cash_threshold=10.0):
    try:
        top_n = max(1, min(3, int(top_n)))
    except (ValueError, TypeError):
        top_n = 1

    try:
        cash_threshold = float(cash_threshold)
    except (ValueError, TypeError):
        cash_threshold = 10.0

    if abs(w1) > 1.0 or abs(w5) > 1.0 or abs(w20) > 1.0:
        w1 = w1 / 100.0
        w5 = w5 / 100.0
        w20 = w20 / 100.0

    weighted_days = max(1.0, 1.0 * abs(w1) + 5.0 * abs(w5) + 20.0 * abs(w20))
    min_req_score = (cash_threshold / 252.0) * weighted_days

    check_and_update_etf_data(force_live=bool(force_refresh))
    cache_key = _get_cache_key()
    df = get_cached_etf_df(cache_key)
    if df is None or df.empty:
        update_etf_data()
        _invalidate_etf_caches()
        df = get_cached_etf_df(_get_cache_key())
        if df is None or df.empty:
            return []

    results = []
    for ticker, name in ETF_TARGETS.items():
        ticker_df = df[df['ticker'] == ticker]
        if len(ticker_df) < 6:
            continue

        closes = ticker_df['close'].to_numpy(dtype=float)
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
            recent_closes = closes[-21:] if len(closes) >= 21 else closes
            if len(recent_closes) >= 2:
                daily_ret = (recent_closes[1:] - recent_closes[:-1]) / recent_closes[:-1] * 100.0
                std_dev = float(np.std(daily_ret, ddof=1)) if len(daily_ret) > 1 else 0.0
                if math.isnan(std_dev) or std_dev == 0:
                    sharpe_ratio = momentum_score
                else:
                    sharpe_ratio = sanitize_val(momentum_score / std_dev)
            else:
                sharpe_ratio = momentum_score

        final_score = sanitize_val(sharpe_ratio if criteria == "sharpe" else momentum_score)
        annualized_return = sanitize_val(momentum_score * (252.0 / weighted_days))

        results.append({
            "ticker": ticker,
            "name": name,
            "current_price": current_price,
            "return_1d": return_1d,
            "return_5d": return_5d,
            "return_20d": return_20d,
            "momentum_score": momentum_score,
            "annualized_return": annualized_return,
            "cash_threshold": cash_threshold,
            "sharpe_ratio": sharpe_ratio,
            "final_score": final_score,
            "last_updated": dates[-1] if dates else "",
            "quote_updated_at": _LAST_LIVE_SYNC_KST or cache_key
        })

    # Sort by final_score descending
    results = sorted(results, key=lambda x: x['final_score'], reverse=True)

    # Assign ranks & recommended weights based on top_n & cash_threshold (연 cash_threshold% 이하 시 ETF 미선택 및 CASH 보유)
    equal_weight = 100.0 if top_n == 1 else (50.0 if top_n == 2 else 33.33)
    for idx, item in enumerate(results):
        item["rank"] = idx + 1
        if idx < top_n and item["final_score"] > 0.0 and item["momentum_score"] > min_req_score:
            item["is_selected"] = True
            item["recommended_weight"] = equal_weight
        else:
            item["is_selected"] = False
            item["recommended_weight"] = 0.0

    return results


@lru_cache(maxsize=2)
def get_cached_etf_pivot(cache_key=None):
    check_and_update_etf_data(force_live=False)
    df = get_cached_etf_df(cache_key or _get_cache_key())
    if df is None or df.empty:
        return None

    df = df[df['ticker'].isin(ETF_TARGETS.keys())]
    pivot = df.pivot(index='date', columns='ticker', values='close')
    pivot = pivot.ffill().dropna()
    return pivot


def get_kospi_aligned_series(dates: list) -> list:
    """
    KOSPI 지수(^KS11) 일별 종가 캐시(kospi_history_cache.json) 및 최신 시세를 로드하여
    시뮬레이션 거래일(dates)에 맞춰 전방/후방 보간(ffill/bfill) 후 Base=100 정규화 배열을 반환합니다.
    - 메모리 캐시 및 10분(600초) yfinance 재조회 쿨다운 적용으로 매 요청마다 ^KS11 HTTP 블로킹 방지
    """
    global _LAST_KOSPI_FETCH_TS, _KOSPI_ALIGNED_CACHE
    if not dates:
        return []

    cache_sig = (dates[0], dates[-1], len(dates))
    now_ts = time.time()
    if cache_sig in _KOSPI_ALIGNED_CACHE and (now_ts - _LAST_KOSPI_FETCH_TS) < 600.0:
        return _KOSPI_ALIGNED_CACHE[cache_sig]

    kospi_cache_path = os.path.join(DATA_DIR, "kospi_history_cache.json")
    kospi_dict = {}
    try:
        if os.path.exists(kospi_cache_path):
            import json
            with open(kospi_cache_path, "r", encoding="utf-8") as f:
                raw_k = json.load(f)
                if isinstance(raw_k, dict):
                    kospi_dict = {str(k)[:10]: float(v) for k, v in raw_k.items() if v is not None and float(v) > 0}
    except Exception as e:
        print(f"[KOSPI Series] Cache read error: {e}")

    # 캐시가 없거나 10분 이상 경과한 경우에만 ^KS11 최신 데이터 보강
    need_fetch = (not kospi_dict) or (min(kospi_dict.keys()) > dates[0]) or (
        max(kospi_dict.keys()) < dates[-1] and (now_ts - _LAST_KOSPI_FETCH_TS) >= 600.0
    )
    if need_fetch:
        _LAST_KOSPI_FETCH_TS = now_ts
        try:
            period_str = "5y" if (not kospi_dict or min(kospi_dict.keys()) > dates[0]) else "5d"
            ks_hist = yf.Ticker("^KS11").history(period=period_str, interval="1d", timeout=5)
            if not ks_hist.empty and "Close" in ks_hist.columns:
                for dt_idx, row in ks_hist.iterrows():
                    d_str = dt_idx.strftime("%Y-%m-%d") if hasattr(dt_idx, "strftime") else str(dt_idx)[:10]
                    c_val = row["Close"]
                    if not pd.isna(c_val) and float(c_val) > 0:
                        kospi_dict[d_str] = round(float(c_val), 2)
                try:
                    import json
                    with open(kospi_cache_path, "w", encoding="utf-8") as f:
                        json.dump(dict(sorted(kospi_dict.items())), f, indent=2)
                except Exception:
                    pass
        except Exception as e:
            print(f"[KOSPI Series] yfinance ^KS11 fetch notice: {e}")
    elif _LAST_KOSPI_FETCH_TS == 0.0:
        _LAST_KOSPI_FETCH_TS = now_ts

    if not kospi_dict:
        return [100.0] * len(dates)

    try:
        all_dates = sorted(set(dates) | set(kospi_dict.keys()))
        s = pd.Series(kospi_dict, dtype=float).reindex(all_dates).sort_index().ffill().bfill()
        aligned = s.reindex(dates).ffill().bfill()
        base_val = float(aligned.iloc[0]) if len(aligned) > 0 and float(aligned.iloc[0]) > 0 else 1.0
        res = [sanitize_val((float(v) / base_val) * 100.0, 100.0) for v in aligned.tolist()]
        _KOSPI_ALIGNED_CACHE[cache_sig] = res
        return res
    except Exception as e:
        print(f"[KOSPI Series] Alignment error: {e}")
        return [100.0] * len(dates)


def get_etf_simulation(criteria="momentum", top_n=1, w1=0.5, w5=0.3, w20=0.2, pivot=None, precalc=None, cash_threshold=10.0):
    try:
        top_n = max(1, min(3, int(top_n)))
    except (ValueError, TypeError):
        top_n = 1

    try:
        cash_threshold = float(cash_threshold)
    except (ValueError, TypeError):
        cash_threshold = 10.0

    if abs(w1) > 1.0 or abs(w5) > 1.0 or abs(w20) > 1.0:
        w1 = w1 / 100.0
        w5 = w5 / 100.0
        w20 = w20 / 100.0

    weighted_days = max(1.0, 1.0 * abs(w1) + 5.0 * abs(w5) + 20.0 * abs(w20))
    min_req_score = (cash_threshold / 252.0) * weighted_days

    cache_key = _get_cache_key()
    sim_cache_sig = (
        cache_key,
        str(criteria),
        int(top_n),
        round(float(w1), 4),
        round(float(w5), 4),
        round(float(w20), 4),
        round(float(cash_threshold), 2),
    )
    if pivot is None and precalc is None and sim_cache_sig in _SIM_RESULT_CACHE:
        return _SIM_RESULT_CACHE[sim_cache_sig]

    if pivot is None:
        check_and_update_etf_data(force_live=False)
        cache_key = _get_cache_key()
        pivot = get_cached_etf_pivot(cache_key)

    if pivot is None:
        return {}

    dates = pivot.index.tolist()
    n_dates = len(dates)
    if n_dates < 6:
        return {}

    cols = list(pivot.columns)
    n_cols = len(cols)
    col_to_idx = {c: idx for idx, c in enumerate(cols)}
    pivot_arr = precalc.get('pivot_arr') if (precalc and 'pivot_arr' in precalc) else pivot.to_numpy(dtype=float)

    etf_normalized = precalc.get('etf_norm') if (precalc and 'etf_norm' in precalc) else None
    if etf_normalized is None:
        etf_normalized = {}
        for c_idx, ticker in enumerate(cols):
            base_price = float(pivot_arr[0, c_idx])
            if base_price > 0:
                norm_arr = (pivot_arr[:, c_idx] / base_price) * 100.0
                etf_normalized[ticker] = [sanitize_val(v, 100.0) for v in norm_arr.tolist()]
            else:
                etf_normalized[ticker] = [100.0] * n_dates

    if precalc:
        r1_arr = precalc.get('r1_arr')
        r5_arr = precalc.get('r5_arr')
        r20_arr = precalc.get('r20_arr')
        rstd_arr = precalc.get('rstd_arr')
    else:
        r1_arr = (pivot.pct_change(1) * 100.0).to_numpy(dtype=float)
        r5_arr = (pivot.pct_change(5) * 100.0).to_numpy(dtype=float)
        r20_arr = (pivot.pct_change(20) * 100.0).to_numpy(dtype=float)
        rstd_arr = ((pivot.pct_change() * 100.0).rolling(window=21).std()).to_numpy(dtype=float) if criteria == "sharpe" else None

    strategy_returns = [100.0] * n_dates
    selected_etf = [""] * n_dates
    selected_etf_lists = [[] for _ in range(n_dates)]
    current_targets = []
    use_sharpe = (criteria == "sharpe" and rstd_arr is not None)

    for i in range(n_dates):
        if i < 21:
            selected_etf[i] = "Waiting"
            selected_etf_lists[i] = ["Waiting"]
            continue

        scores = []
        r1_row = r1_arr[i]
        r5_row = r5_arr[i]
        r20_row = r20_arr[i]
        std_row = rstd_arr[i] if use_sharpe else None

        for c_idx in range(n_cols):
            r1 = r1_row[c_idx]
            r5 = r5_row[c_idx]
            r20 = r20_row[c_idx]
            if math.isnan(r1) or math.isnan(r5) or math.isnan(r20):
                continue

            score = (r1 * w1) + (r5 * w5) + (r20 * w20)
            final_score = score
            if use_sharpe:
                std_dev = std_row[c_idx]
                if not math.isnan(std_dev) and std_dev > 0:
                    final_score = score / std_dev

            scores.append((cols[c_idx], final_score, score))

        scores.sort(key=lambda x: x[1], reverse=True)

        top_candidates = scores[:top_n]
        selected_tickers = []
        for tkr, scr, raw_mom_score in top_candidates:
            if scr <= 0.0 or raw_mom_score <= min_req_score:
                selected_tickers.append("CASH")
            else:
                selected_tickers.append(tkr)

        while len(selected_tickers) < top_n:
            selected_tickers.append("CASH")

        selected_etf[i] = ", ".join(selected_tickers)
        selected_etf_lists[i] = selected_tickers

        if current_targets:
            port_ret = 0.0
            prev_row = pivot_arr[i - 1]
            curr_row = pivot_arr[i]
            for tgt in current_targets:
                c_idx = col_to_idx.get(tgt)
                if c_idx is not None:
                    prev_p = prev_row[c_idx]
                    curr_p = curr_row[c_idx]
                    d_ret = (curr_p - prev_p) / prev_p if prev_p > 0 else 0.0
                    port_ret += d_ret
            avg_daily_ret = port_ret / len(current_targets)
            strategy_returns[i] = sanitize_val(strategy_returns[i - 1] * (1.0 + avg_daily_ret), 100.0)
        else:
            strategy_returns[i] = sanitize_val(strategy_returns[i - 1], 100.0)

        current_targets = selected_tickers

    kospi_series = precalc.get("kospi") if (precalc and "kospi" in precalc) else get_kospi_aligned_series(dates)

    etf_raw_prices = {}
    for c_idx, ticker in enumerate(cols):
        etf_raw_prices[ticker] = [round(sanitize_val(v, 0.0), 2) for v in pivot_arr[:, c_idx].tolist()]

    result_obj = {
        "dates": dates,
        "strategy": strategy_returns,
        "kospi": kospi_series,
        "selected_etf": selected_etf,
        "selected_etf_list": selected_etf_lists,
        "etfs": etf_normalized,
        "etf_prices": etf_raw_prices,
    }
    if len(_SIM_RESULT_CACHE) > 128:
        _SIM_RESULT_CACHE.clear()
    _SIM_RESULT_CACHE[sim_cache_sig] = result_obj
    return result_obj


def run_bulk_simulation(criteria="momentum", top_n=1, cash_threshold=10.0):
    try:
        top_n = max(1, min(3, int(top_n)))
    except (ValueError, TypeError):
        top_n = 1

    try:
        cash_threshold = float(cash_threshold)
    except (ValueError, TypeError):
        cash_threshold = 10.0

    check_and_update_etf_data(force_live=False)
    cache_key = _get_cache_key()
    bulk_cache_sig = (cache_key, str(criteria), int(top_n), round(float(cash_threshold), 2))
    if bulk_cache_sig in _BULK_MODELS_CACHE:
        return _BULK_MODELS_CACHE[bulk_cache_sig]

    pivot = get_cached_etf_pivot(cache_key)
    if pivot is None:
        return []

    dates = pivot.index.tolist()
    kospi_aligned = get_kospi_aligned_series(dates)
    pivot_arr = pivot.to_numpy(dtype=float)
    cols = list(pivot.columns)
    etf_norm = {}
    for c_idx, ticker in enumerate(cols):
        base_price = float(pivot_arr[0, c_idx])
        if base_price > 0:
            norm_arr = (pivot_arr[:, c_idx] / base_price) * 100.0
            etf_norm[ticker] = [sanitize_val(v, 100.0) for v in norm_arr.tolist()]
        else:
            etf_norm[ticker] = [100.0] * len(dates)

    # Pre-calculate NumPy arrays once for all 26 models
    precalc = {
        'pivot_arr': pivot_arr,
        'etf_norm': etf_norm,
        'r1_arr': (pivot.pct_change(1) * 100.0).to_numpy(dtype=float),
        'r5_arr': (pivot.pct_change(5) * 100.0).to_numpy(dtype=float),
        'r20_arr': (pivot.pct_change(20) * 100.0).to_numpy(dtype=float),
        'rstd_arr': ((pivot.pct_change() * 100.0).rolling(window=21).std()).to_numpy(dtype=float) if criteria == "sharpe" else None,
        'kospi': kospi_aligned,
    }

    models = []
    # 1~21번: 추세추종(Momentum / Trend-Following) 모델군 + 22~26번: 역추세(Mean-Reversion)·횡보장(Range-Bound)·저변동 방어 모델군
    model_specs = []
    for i in range(21):
        w1_pct = 50 - i
        w5_pct = 40 - i
        w20_pct = 100 - w1_pct - w5_pct
        model_specs.append({
            "model_id": i + 1,
            "model": f"Model {i+1}",
            "strategy_type": "TREND",
            "strategy_label": "추세추종",
            "strategy_desc": f"단기({w1_pct}%)·중기({w5_pct}%)·장기({w20_pct}%) 정배열 추세추종",
            "w1_pct": w1_pct,
            "w5_pct": w5_pct,
            "w20_pct": w20_pct,
        })

    # 역추세(Mean-Reversion) 및 횡보장(Range-Bound / Low-Vol) 특화 5대 모델 추가
    non_trend_specs = [
        {
            "model_id": 22,
            "model": "Model 22 [역추세: 눌림목반등]",
            "strategy_type": "MEAN_REV",
            "strategy_label": "역추세(눌림목)",
            "strategy_desc": "20일 상승추세(+60%) 내 1일(-40%)·5일(-20%) 단기 과매도 눌림목 저점매수",
            "w1_pct": -40,
            "w5_pct": -20,
            "w20_pct": 60,
        },
        {
            "model_id": 23,
            "model": "Model 23 [역추세: 과매도반전]",
            "strategy_type": "MEAN_REV",
            "strategy_label": "역추세(과매도)",
            "strategy_desc": "단기 1일(-60%)·5일(-40%) 급락 과매도 발생 시 기술적 되돌림(Z-Score 역추세) 포착",
            "w1_pct": -60,
            "w5_pct": -40,
            "w20_pct": 0,
        },
        {
            "model_id": 24,
            "model": "Model 24 [횡보장: 박스권회귀]",
            "strategy_type": "RANGE",
            "strategy_label": "횡보(박스권)",
            "strategy_desc": "20일 추세 중립(0%) 박스권 장세에서 5일 바닥확인(+50%) 후 1일 조정(-50%) 매수",
            "w1_pct": -50,
            "w5_pct": 50,
            "w20_pct": 0,
        },
        {
            "model_id": 25,
            "model": "Model 25 [횡보·방어: 저변동성]",
            "strategy_type": "LOW_VOL",
            "strategy_label": "횡보(저변동방어)",
            "strategy_desc": "1일 단기급등 배제(-20%) 및 5일(+40%)·20일(+80%) 완만한 저변동 우상향 자산 선호",
            "w1_pct": -20,
            "w5_pct": 40,
            "w20_pct": 80,
        },
        {
            "model_id": 26,
            "model": "Model 26 [하이브리드: 추세+역추세]",
            "strategy_type": "HYBRID",
            "strategy_label": "바벨(추세+역추세)",
            "strategy_desc": "20일 핵심 주도주(+85%)를 유지하되 당일 단기조정(-35%) 시점에 진입해 고점 추격 방지",
            "w1_pct": -35,
            "w5_pct": 50,
            "w20_pct": 85,
        },
    ]
    model_specs.extend(non_trend_specs)

    for spec in model_specs:
        w1_pct = spec["w1_pct"]
        w5_pct = spec["w5_pct"]
        w20_pct = spec["w20_pct"]
        
        w1 = w1_pct / 100.0
        w5 = w5_pct / 100.0
        w20 = w20_pct / 100.0
        
        sim_data = get_etf_simulation(criteria, top_n, w1, w5, w20, pivot=pivot, precalc=precalc, cash_threshold=cash_threshold)
        
        if not sim_data or not sim_data.get('dates'):
            continue
            
        dates = sim_data['dates']
        strategy = sim_data['strategy']
        
        if len(dates) < 2:
            continue
            
        current_date = datetime.strptime(dates[-1], "%Y-%m-%d")
        
        def get_idx_for_months_back(months_back):
            target_date = (current_date - timedelta(days=months_back*30)).strftime("%Y-%m-%d")
            start_idx = 0
            for j, d in enumerate(dates):
                if d >= target_date:
                    start_idx = j
                    break
            if start_idx >= len(strategy):
                start_idx = len(strategy) - 1
            return start_idx

        def get_return(months_back):
            start_idx = get_idx_for_months_back(months_back)
            start_val = strategy[start_idx]
            end_val = strategy[-1]
            if start_val == 0: return 0
            return ((end_val / start_val) - 1) * 100

        def get_slice_metrics(idx_start, idx_end):
            sub = strategy[idx_start:idx_end + 1]
            if len(sub) < 2 or sub[0] <= 0:
                return {"ret": 0.0, "sharpe": 0.0, "mdd": 0.0}
            ret_val = ((sub[-1] / sub[0]) - 1.0) * 100.0
            s_ser = pd.Series(sub)
            d_rets = s_ser.pct_change().dropna()
            s_std = d_rets.std()
            s_mean = d_rets.mean()
            sh_val = float((s_mean / s_std) * (252 ** 0.5)) if (s_std and s_std > 0) else 0.0
            c_max = s_ser.cummax()
            dd = (s_ser - c_max) / c_max
            mdd_val = abs(float(dd.min())) * 100.0
            return {"ret": ret_val, "sharpe": sh_val, "mdd": mdd_val}

        idx_6m = get_idx_for_months_back(6)
        idx_3m = get_idx_for_months_back(3)
        idx_now = len(strategy) - 1

        p1_metrics = get_slice_metrics(idx_6m, idx_3m)     # 6개월 전 ~ 3개월 전 (전반기 3개월)
        p2_metrics = get_slice_metrics(idx_3m, idx_now)    # 3개월 전 ~ 현재 (후반기 3개월)

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
        mdd = abs(drawdown.min()) * 100
        
        selected_etf = sim_data['selected_etf']
        trades_returns = []
        trade_count = 0
        entry_value = strategy[0]
        
        for j in range(1, len(selected_etf)):
            if selected_etf[j] != selected_etf[j-1]:
                trade_count += 1
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

        fee_rate = 0.03
        net_ret = total_ret - (trade_count * fee_rate)
            
        def sanitize_float(val):
            if pd.isna(val) or val == float('inf') or val == float('-inf'):
                return 0.0
            return float(val)
            
        models.append({
            "model_id": spec["model_id"],
            "model": spec["model"],
            "strategy_type": spec["strategy_type"],
            "strategy_label": spec["strategy_label"],
            "strategy_desc": spec["strategy_desc"],
            "weights": {"w1": w1_pct, "w5": w5_pct, "w20": w20_pct},
            "ret_6m_to_3m": sanitize_float(p1_metrics["ret"]),
            "sharpe_6m_to_3m": sanitize_float(p1_metrics["sharpe"]),
            "mdd_6m_to_3m": sanitize_float(p1_metrics["mdd"]),
            "ret_3m_to_now": sanitize_float(p2_metrics["ret"]),
            "sharpe_3m_to_now": sanitize_float(p2_metrics["sharpe"]),
            "mdd_3m_to_now": sanitize_float(p2_metrics["mdd"]),
            "ret_3m": sanitize_float(ret_3m),
            "ret_6m": sanitize_float(ret_6m),
            "ret_1y": sanitize_float(ret_1y),
            "total_ret": sanitize_float(total_ret),
            "net_ret": sanitize_float(net_ret),
            "trade_count": trade_count,
            "sharpe": sanitize_float(sharpe_ratio),
            "mdd": sanitize_float(mdd),
            "win_rate": sanitize_float(win_rate),
            "avg_win": sanitize_float(avg_win),
            "avg_loss": sanitize_float(avg_loss),
            "dates": dates,
            "strategy": [sanitize_float(s) for s in strategy],
            "kospi": [sanitize_float(k) for k in sim_data.get("kospi", [])],
            "selected_etf": selected_etf,
            "selected_etf_list": sim_data.get("selected_etf_list", [])
        })
        
    if len(_BULK_MODELS_CACHE) > 16:
        _BULK_MODELS_CACHE.clear()
    _BULK_MODELS_CACHE[bulk_cache_sig] = models
    return models


def save_model_swap(from_model, from_weights, from_ret, from_sharpe, to_model, to_weights, to_ret, to_sharpe, criteria="sharpe", top_n=1):
    init_db()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    c.execute('''
        INSERT INTO model_swaps 
        (timestamp, from_model, from_weights, from_ret, from_sharpe, to_model, to_weights, to_ret, to_sharpe, criteria, top_n)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (
        ts,
        from_model,
        str(from_weights),
        float(from_ret) if from_ret is not None else 0.0,
        float(from_sharpe) if from_sharpe is not None else 0.0,
        to_model,
        str(to_weights),
        float(to_ret) if to_ret is not None else 0.0,
        float(to_sharpe) if to_sharpe is not None else 0.0,
        criteria,
        int(top_n)
    ))
    conn.commit()
    conn.close()
    return {"status": "success", "timestamp": ts}


def get_model_swap_history():
    init_db()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''
        SELECT id, timestamp, from_model, from_weights, from_ret, from_sharpe, to_model, to_weights, to_ret, to_sharpe, criteria, top_n
        FROM model_swaps ORDER BY id DESC LIMIT 50
    ''')
    rows = c.fetchall()
    conn.close()
    
    history = []
    for r in rows:
        history.append({
            "id": r[0],
            "timestamp": r[1],
            "from_model": r[2],
            "from_weights": r[3],
            "from_ret": r[4],
            "from_sharpe": r[5],
            "to_model": r[6],
            "to_weights": r[7],
            "to_ret": r[8],
            "to_sharpe": r[9],
            "criteria": r[10],
            "top_n": r[11]
        })
    return history


