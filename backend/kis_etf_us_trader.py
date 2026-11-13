import datetime
import json
import math
import os
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

import requests
import yfinance as yf
from dotenv import load_dotenv

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))

from etf_strategy import DATA_DIR, DB_PATH, ETF_TARGETS, get_etf_strategy_results, update_etf_data
from kis_api import KISApiClient
import database as _user_db

CONFIG_PATH = os.path.join(DATA_DIR, "kis_etf_us_config.json")


def _normalize_uid(user_id: Optional[str] = None) -> str:
    u = (user_id or "admin").strip()
    return u if u else "admin"


def _get_user_config_path(user_id: str = "admin") -> str:
    uid = _normalize_uid(user_id)
    if uid == "admin":
        return CONFIG_PATH
    safe_uid = "".join(ch for ch in uid if ch.isalnum() or ch in ("_", "-"))
    return os.path.join(DATA_DIR, f"kis_etf_us_config_{safe_uid}.json")

# KIS 해외주식 미국 거래소 코드 매핑 (주문용 OVRS_EXCG_CD / 시세용 EXCD)
# QQQ는 NASDAQ(NASD), 나머지 글로벌/원자재/지수 ETF(SPY, EWY, EWJ, FXI, INDA, EWZ, EWA, EZU, USO, GLD)는 NYSE Arca(AMEX) 상장
US_ETF_EXCHANGE_MAP: Dict[str, Dict[str, str]] = {
    "QQQ": {"order_excg": "NASD", "quote_excd": "NAS", "fallback_excg": "NASD"},
    "SPY": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
    "EWY": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
    "EWJ": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
    "FXI": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
    "INDA": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
    "EWZ": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
    "EWA": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
    "EZU": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
    "USO": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
    "GLD": {"order_excg": "AMEX", "quote_excd": "AMS", "fallback_excg": "NYSE"},
}

_SHARED_US_KIS_CLIENTS: Dict[str, KISApiClient] = {}
_SHARED_LOCK = threading.Lock()


def _init_etf_kis_tables() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    c = conn.cursor()

    # 1. etf_us_kis_holdings (user_id, ticker 복합 PK 마이그레이션)
    c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='etf_us_kis_holdings'")
    if c.fetchone():
        c.execute("PRAGMA table_info(etf_us_kis_holdings)")
        cols = [r[1] for r in c.fetchall()]
        if "user_id" not in cols:
            c.execute("ALTER TABLE etf_us_kis_holdings RENAME TO etf_us_kis_holdings_old")
            c.execute(
                """
                CREATE TABLE etf_us_kis_holdings (
                    user_id TEXT DEFAULT 'admin',
                    ticker TEXT,
                    name TEXT,
                    exchange_cd TEXT,
                    qty INTEGER,
                    avg_buy_price_usd REAL,
                    curr_price_usd REAL,
                    updated_at_kst TEXT,
                    PRIMARY KEY (user_id, ticker)
                )
                """
            )
            c.execute(
                """
                INSERT OR REPLACE INTO etf_us_kis_holdings
                (user_id, ticker, name, exchange_cd, qty, avg_buy_price_usd, curr_price_usd, updated_at_kst)
                SELECT 'admin', ticker, name, exchange_cd, qty, avg_buy_price_usd, curr_price_usd, updated_at_kst
                FROM etf_us_kis_holdings_old
                """
            )
            c.execute("DROP TABLE etf_us_kis_holdings_old")
    else:
        c.execute(
            """
            CREATE TABLE IF NOT EXISTS etf_us_kis_holdings (
                user_id TEXT DEFAULT 'admin',
                ticker TEXT,
                name TEXT,
                exchange_cd TEXT,
                qty INTEGER,
                avg_buy_price_usd REAL,
                curr_price_usd REAL,
                updated_at_kst TEXT,
                PRIMARY KEY (user_id, ticker)
            )
            """
        )

    # 2. etf_us_kis_order_log (user_id 컬럼 보장)
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS etf_us_kis_order_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT DEFAULT 'admin',
            executed_at_kst TEXT,
            us_trading_date TEXT,
            mode TEXT,
            account_no TEXT,
            ticker TEXT,
            exchange_cd TEXT,
            side TEXT,
            qty INTEGER,
            ord_dvsn TEXT,
            ord_dvsn_label TEXT,
            exec_price_usd REAL,
            prev_holding_tickers TEXT,
            target_holding_tickers TEXT,
            broker_status TEXT,
            broker_order_no TEXT,
            broker_msg TEXT,
            reason TEXT
        )
        """
    )
    c.execute("PRAGMA table_info(etf_us_kis_order_log)")
    log_cols = [r[1] for r in c.fetchall()]
    if "user_id" not in log_cols:
        c.execute("ALTER TABLE etf_us_kis_order_log ADD COLUMN user_id TEXT DEFAULT 'admin'")
        c.execute("UPDATE etf_us_kis_order_log SET user_id = 'admin' WHERE user_id IS NULL OR user_id = ''")

    conn.commit()
    conn.close()


def _get_us_et_now() -> datetime.datetime:
    try:
        return datetime.datetime.now(ZoneInfo("America/New_York"))
    except Exception:
        # Fallback UTC-5
        return datetime.datetime.utcnow() - datetime.timedelta(hours=5)


def _get_kst_now() -> datetime.datetime:
    return datetime.datetime.utcnow() + datetime.timedelta(hours=9)


def get_us_market_session_info() -> Dict[str, Any]:
    """미국 주식시장(ET) 현재 개장/종가체결 시간대 및 장마감 10분 전(15:50 ET) 예약 자동주문 스케줄 정보를 반환합니다."""
    et_now = _get_us_et_now()
    kst_now = _get_kst_now()
    is_dst = bool(et_now.dst())
    is_weekday = et_now.weekday() < 5
    hhmm_et = et_now.hour * 100 + et_now.minute

    if not is_weekday:
        session_state = "CLOSED_WEEKEND"
        session_label = "주말 휴장 — 다음 미국 정규장 마감 10분 전(15:50 ET) 최종 신호로 예약 자동주문 실행 대기"
    elif 930 <= hhmm_et < 1550:
        session_state = "REGULAR_OPEN"
        session_label = "미국 정규장 진행중 (09:30~16:00 ET) — 장마감 10분 전(15:50 ET) 최종 신호 확정 및 동시 매도·매수 대기"
    elif 1550 <= hhmm_et <= 1600:
        session_state = "CLOSING_CROSS"
        session_label = "🔥 미국 장마감 10분 전(15:50~16:00 ET) 최종 신호 확정 및 MOC 종가체결 동시 매도·매수 구간"
    elif 400 <= hhmm_et < 930:
        session_state = "PRE_MARKET"
        session_label = "미국 프리마켓 (04:00~09:30 ET) — 금일 장마감 10분 전(15:50 ET) 최종 신호 예약 자동주문 대기"
    else:
        session_state = "AFTER_HOURS_OR_CLOSED"
        session_label = "미국 정규장 외 시간 — 다가오는 미국장 마감 10분 전(15:50 ET) 최종 신호 기준 예약 자동주문 작동 대기"

    close_kst_str = "05:00 KST (미국 서머타임 적용중)" if is_dst else "06:00 KST (미국 동절기 표준시 적용중)"
    auto_exec_kst_str = (
        "04:50 KST (15:50 ET · 장마감 10분 전 최종신호)"
        if is_dst
        else "05:50 KST (15:50 ET · 장마감 10분 전 최종신호)"
    )

    return {
        "et_time_str": et_now.strftime("%Y-%m-%d %H:%M:%S ET"),
        "kst_time_str": kst_now.strftime("%Y-%m-%d %H:%M:%S KST"),
        "us_trading_date": et_now.strftime("%Y-%m-%d"),
        "is_dst": is_dst,
        "session_state": session_state,
        "session_label": session_label,
        "us_market_close_kst": close_kst_str,
        "auto_close_order_time_kst": auto_exec_kst_str,
        "signal_cutoff_et": "15:50 ET (미국 정규장 마감 10분 전 최종 신호 확정)",
    }


def get_kis_etf_us_config(user_id: str = "admin") -> Dict[str, Any]:
    """
    회원별(user_id) ETF 투자전략의 증권사 계좌 및 미국주식 장마감 10분 전(15:50 ET) 예약 자동매매 설정을 로드합니다.
    - 관리자(admin): 기존 한투 모의계좌(44790516-01), 디폴트 100주, 자동매매 ON 유지
    - 일반회원(user_*): 본인이 직접 연결한 개별 증권사 계좌만 표시 (미연결 시 is_connected=False, 관리자 모의계좌 절대 비노출)
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    uid = _normalize_uid(user_id)
    cfg_path = _get_user_config_path(uid)
    user_acc = _user_db.get_user_trading_account(uid, include_secrets=False)

    if uid == "admin":
        env_acc = os.environ.get("KIS_ACCOUNT_NO", "44790516-01").strip()
        default_cano = env_acc.split("-")[0] if "-" in env_acc else env_acc[:8]
        default_prdt = env_acc.split("-")[1] if "-" in env_acc and len(env_acc.split("-")[1]) == 2 else "01"
        is_connected = True
        broker_code = user_acc.get("broker_code") or "KIS"
        broker_name = user_acc.get("broker_name") or "한국투자증권"
        account_nickname = user_acc.get("account_nickname") or "주인장(관리자) 한투 계좌"
    else:
        is_connected = bool(user_acc.get("is_connected", False))
        default_cano = str(user_acc.get("account_no") or "").strip() if is_connected else ""
        default_prdt = str(user_acc.get("acnt_prdt_cd") or "01").strip() if is_connected else "01"
        broker_code = str(user_acc.get("broker_code") or "KIS")
        broker_name = str(user_acc.get("broker_name") or ("미연결" if not is_connected else "한국투자증권"))
        account_nickname = str(user_acc.get("account_nickname") or "")

    default_cfg: Dict[str, Any] = {
        "user_id": uid,
        "is_connected": is_connected,
        "broker_code": broker_code,
        "broker_name": broker_name,
        "account_nickname": account_nickname,
        "mode": str(user_acc.get("account_mode") or "PAPER").upper(),
        "cano": default_cano,
        "acnt_prdt_cd": default_prdt,
        "order_qty": int(user_acc.get("etf_order_qty") or 100),
        "ord_dvsn": "33",
        "auto_trade_enabled": bool(user_acc.get("etf_auto_trade", True)) if is_connected else False,
        "reservation_active": bool(user_acc.get("etf_auto_trade", True)) if is_connected else False,
        "reserved_at_kst": "",
        "criteria": "sharpe",
        "top_n": 1,
        "weights": {"w1": 0.5, "w5": 0.3, "w20": 0.2},
        "last_auto_traded_us_date": "",
        "default_100_migrated": True,
    }

    need_save_migration = False
    if os.path.exists(cfg_path):
        try:
            with open(cfg_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                if uid == "admin" and not saved.get("default_100_migrated"):
                    if int(saved.get("order_qty") or 1) == 1:
                        saved["order_qty"] = 100
                    saved["default_100_migrated"] = True
                    saved["reservation_active"] = True
                    need_save_migration = True
                default_cfg.update(saved)
        except Exception as e:
            print(f"[KIS_ETF_US] 설정 로드 경고 ({uid}): {e}")
    elif uid == "admin":
        need_save_migration = True

    # 일반회원은 DB(user_trading_accounts)의 계좌 연결 여부를 최우선으로 동기화 (관리자 계좌 노출 원천 차단)
    if uid != "admin":
        default_cfg["user_id"] = uid
        default_cfg["is_connected"] = is_connected
        default_cfg["broker_code"] = broker_code
        default_cfg["broker_name"] = broker_name
        default_cfg["account_nickname"] = account_nickname
        if not is_connected:
            default_cfg["cano"] = ""
            default_cfg["acnt_prdt_cd"] = "01"
            default_cfg["auto_trade_enabled"] = False
            default_cfg["reservation_active"] = False
        else:
            if user_acc.get("account_no"):
                default_cfg["cano"] = str(user_acc["account_no"])
                default_cfg["acnt_prdt_cd"] = str(user_acc.get("acnt_prdt_cd") or "01")
            if user_acc.get("account_mode"):
                default_cfg["mode"] = str(user_acc["account_mode"]).upper()
    else:
        default_cfg["user_id"] = "admin"
        default_cfg["is_connected"] = True
        default_cfg["broker_code"] = broker_code
        default_cfg["broker_name"] = broker_name
        default_cfg["account_nickname"] = account_nickname

    if need_save_migration and uid == "admin":
        try:
            _init_etf_kis_tables()
            conn = sqlite3.connect(DB_PATH, timeout=30.0)
            c = conn.cursor()
            c.execute("UPDATE etf_us_kis_holdings SET qty = 100 WHERE user_id = 'admin' AND qty = 1")
            conn.commit()
            conn.close()
            with open(cfg_path, "w", encoding="utf-8") as f:
                json.dump(default_cfg, f, ensure_ascii=False, indent=2)
        except Exception as mig_err:
            print(f"[KIS_ETF_US] 100주 디폴트 마이그레이션 참고: {mig_err}")

    try:
        default_cfg["order_qty"] = max(1, min(100000, int(default_cfg.get("order_qty") or 100)))
    except Exception:
        default_cfg["order_qty"] = 100

    mode_up = str(default_cfg.get("mode", "PAPER")).upper()
    if mode_up not in ("PAPER", "LIVE"):
        mode_up = "PAPER"
    default_cfg["mode"] = mode_up
    default_cfg["is_mock"] = mode_up != "LIVE"

    if default_cfg["is_connected"] and default_cfg.get("cano"):
        default_cfg["account_display"] = f"{default_cfg['cano']}-{default_cfg['acnt_prdt_cd']}"
    else:
        default_cfg["account_display"] = "미연결 (본인 증권사 계좌 등록 필요)"

    default_cfg["reservation_active"] = (
        bool(default_cfg.get("reservation_active", default_cfg.get("auto_trade_enabled", True)))
        if default_cfg["is_connected"]
        else False
    )

    ord_dvsn = str(default_cfg.get("ord_dvsn", "33"))
    if ord_dvsn == "33":
        default_cfg["ord_dvsn_label"] = "미국장 마감 예약 종가체결 (MOC 33 / 장마감 10분 전 15:50 ET 최종신호)"
    elif ord_dvsn == "34":
        default_cfg["ord_dvsn_label"] = "미국장 마감지정가 (LOC 34 / 장마감 10분 전 15:50 ET 최종신호)"
    else:
        default_cfg["ord_dvsn_label"] = "미국장 마감 10분 전(15:50 ET) 종가동시지정가 (00)"

    return default_cfg


def update_kis_etf_us_config(updates: Dict[str, Any], user_id: str = "admin") -> Dict[str, Any]:
    uid = _normalize_uid(user_id)
    cfg_path = _get_user_config_path(uid)
    cfg = get_kis_etf_us_config(user_id=uid)

    if "mode" in updates and str(updates["mode"]).upper() in ("PAPER", "LIVE"):
        cfg["mode"] = str(updates["mode"]).upper()
    if "cano" in updates and str(updates["cano"]).strip():
        cfg["cano"] = str(updates["cano"]).strip()[:14]
    if "acnt_prdt_cd" in updates and str(updates["acnt_prdt_cd"]).strip():
        cfg["acnt_prdt_cd"] = str(updates["acnt_prdt_cd"]).strip()[:4]
    if "order_qty" in updates and updates["order_qty"] is not None:
        cfg["order_qty"] = max(1, min(100000, int(updates["order_qty"])))
    if "ord_dvsn" in updates and str(updates["ord_dvsn"]) in ("33", "34", "00"):
        cfg["ord_dvsn"] = str(updates["ord_dvsn"])
    if "auto_trade_enabled" in updates:
        cfg["auto_trade_enabled"] = bool(updates["auto_trade_enabled"])
        cfg["reservation_active"] = bool(updates["auto_trade_enabled"])
    if "reservation_active" in updates:
        cfg["reservation_active"] = bool(updates["reservation_active"])
    if "reserved_at_kst" in updates:
        cfg["reserved_at_kst"] = str(updates["reserved_at_kst"])
    if "criteria" in updates and str(updates["criteria"]) in ("sharpe", "momentum"):
        cfg["criteria"] = str(updates["criteria"])
    if "top_n" in updates and updates["top_n"] is not None:
        cfg["top_n"] = max(1, min(3, int(updates["top_n"])))
    if "weights" in updates and isinstance(updates["weights"], dict):
        w = updates["weights"]
        w1 = float(w.get("w1", 0.5))
        w5 = float(w.get("w5", 0.3))
        w20 = float(w.get("w20", 0.2))
        if w1 > 1 or w5 > 1 or w20 > 1:
            w1, w5, w20 = w1 / 100.0, w5 / 100.0, w20 / 100.0
        cfg["weights"] = {"w1": round(w1, 4), "w5": round(w5, 4), "w20": round(w20, 4)}
    if "last_auto_traded_us_date" in updates:
        cfg["last_auto_traded_us_date"] = str(updates["last_auto_traded_us_date"])
    cfg["default_100_migrated"] = True

    # DB(user_trading_accounts)에도 동기화
    try:
        db_sync: Dict[str, Any] = {
            "etf_order_qty": cfg["order_qty"],
            "etf_auto_trade": cfg["auto_trade_enabled"],
            "account_mode": cfg["mode"],
        }
        if "broker_code" in updates:
            db_sync["broker_code"] = updates["broker_code"]
        if "account_nickname" in updates:
            db_sync["account_nickname"] = updates["account_nickname"]
        if "cano" in updates and str(updates["cano"]).strip():
            db_sync["account_no"] = f"{cfg['cano']}-{cfg['acnt_prdt_cd']}"
        if "app_key" in updates:
            db_sync["app_key"] = updates["app_key"]
        if "app_secret" in updates:
            db_sync["app_secret"] = updates["app_secret"]
        _user_db.save_user_trading_account(uid, db_sync)
    except Exception as e:
        print(f"[KIS_ETF_US] user_trading_accounts 동기화 참고 ({uid}): {e}")

    save_keys = [
        "mode",
        "cano",
        "acnt_prdt_cd",
        "order_qty",
        "ord_dvsn",
        "auto_trade_enabled",
        "reservation_active",
        "reserved_at_kst",
        "criteria",
        "top_n",
        "weights",
        "last_auto_traded_us_date",
        "default_100_migrated",
    ]
    to_save = {k: cfg[k] for k in save_keys if k in cfg}
    with open(cfg_path, "w", encoding="utf-8") as f:
        json.dump(to_save, f, ensure_ascii=False, indent=2)

    return get_kis_etf_us_config(user_id=uid)


def _get_kis_client(
    is_mock: bool = True,
    cano: str = "",
    acnt_prdt_cd: str = "01",
    user_id: str = "admin",
) -> Optional[KISApiClient]:
    uid = _normalize_uid(user_id)
    user_acc = _user_db.get_user_trading_account(uid, include_secrets=True)

    if uid == "admin":
        app_key = (user_acc.get("app_key") or os.environ.get("KIS_API_KEY", "PS7qebWyCKOenh2K32vrFUzuFLNguRPtJad2")).strip()
        app_secret = (
            user_acc.get("app_secret")
            or os.environ.get(
                "KIS_APP_SECRET",
                "X4uheemKo6gRCwa6aZjCVcanJlok52HJCLi7yXpAyGMIYZV9ueUcuXT0HKftn4Sx64fdN+/pSOJEiQzei0oi6eM7MpzOYpXIvp2lUqftn60497mGsWaNh5Noe3M4lxrV4qfJ9wChBIKoiyOshWPi2pNFdossVKkP6k80I1GhPXLDN7GJmsQ=",
            )
        ).strip()
        acc_str = f"{cano}-{acnt_prdt_cd}" if cano else os.environ.get("KIS_ACCOUNT_NO", "44790516-01").strip()
    else:
        # 일반회원은 본인이 직접 한국투자증권(KIS) AppKey/AppSecret을 등록한 경우에만 KIS 브로커 API 호출 (관리자 API Key 절대 사용 금지)
        if not user_acc.get("is_connected") or user_acc.get("broker_code") != "KIS":
            return None
        app_key = str(user_acc.get("app_key") or "").strip()
        app_secret = str(user_acc.get("app_secret") or "").strip()
        if not app_key or not app_secret or not cano:
            return None
        acc_str = f"{cano}-{acnt_prdt_cd}"

    cache_key = f"{uid}:{is_mock}:{acc_str}:{app_key[:8]}"
    with _SHARED_LOCK:
        client = _SHARED_US_KIS_CLIENTS.get(cache_key)
        if client is None:
            try:
                client = KISApiClient(app_key, app_secret, acc_str, is_mock=is_mock)
                _SHARED_US_KIS_CLIENTS[cache_key] = client
            except Exception as e:
                print(f"[KIS_ETF_US] KISApiClient 초기화 예외 ({uid}): {e}")
                return None
        return client


def get_us_etf_closing_or_live_price(ticker: str) -> float:
    """
    미국 ETF의 최신 종가/현재가(USD)를 조회합니다.
    1) etf_strategy.db에 저장된 최신 가격 확인
    2) yfinance 실시간/최신 종가 확인
    """
    clean_t = str(ticker).upper().strip()
    price = 0.0
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute(
            "SELECT close FROM etf_daily_prices WHERE ticker = ? AND close > 0 ORDER BY date DESC LIMIT 1",
            (clean_t,),
        )
        row = c.fetchone()
        conn.close()
        if row and row[0] and float(row[0]) > 0:
            price = float(row[0])
    except Exception:
        pass

    try:
        t_obj = yf.Ticker(clean_t)
        fast_p = getattr(t_obj, "fast_info", {}).get("lastPrice")
        if fast_p and not math.isnan(float(fast_p)) and float(fast_p) > 0:
            price = float(fast_p)
        elif price <= 0:
            hist = t_obj.history(period="5d")
            if not hist.empty and "Close" in hist.columns:
                valid = hist["Close"].dropna()
                if not valid.empty:
                    price = float(valid.iloc[-1])
    except Exception:
        pass

    return round(price, 2) if price > 0 else 100.0


def get_current_etf_signal(
    criteria: Optional[str] = None,
    top_n: Optional[int] = None,
    w1: Optional[float] = None,
    w5: Optional[float] = None,
    w20: Optional[float] = None,
    user_id: str = "admin",
) -> Dict[str, Any]:
    """현재 ETF 투자전략 설정 기준 추천 타겟 ETF(들)와 스코어 정보를 반환합니다."""
    uid = _normalize_uid(user_id)
    cfg = get_kis_etf_us_config(user_id=uid)
    use_criteria = criteria or cfg.get("criteria", "sharpe")
    use_top_n = top_n if top_n is not None else int(cfg.get("top_n", 1))
    w_cfg = cfg.get("weights", {"w1": 0.5, "w5": 0.3, "w20": 0.2})
    use_w1 = w1 if w1 is not None else float(w_cfg.get("w1", 0.5))
    use_w5 = w5 if w5 is not None else float(w_cfg.get("w5", 0.3))
    use_w20 = w20 if w20 is not None else float(w_cfg.get("w20", 0.2))

    ranked = get_etf_strategy_results(
        criteria=use_criteria,
        top_n=use_top_n,
        w1=use_w1,
        w5=use_w5,
        w20=use_w20,
    )
    target_tickers: List[str] = []
    target_details: List[Dict[str, Any]] = []
    for item in ranked[:use_top_n]:
        if float(item.get("final_score", 0.0)) > 0.0:
            tkr = item["ticker"]
            target_tickers.append(tkr)
            ex_info = US_ETF_EXCHANGE_MAP.get(tkr, {"order_excg": "AMEX"})
            target_details.append(
                {
                    "ticker": tkr,
                    "name": item.get("name", tkr),
                    "exchange_cd": ex_info["order_excg"],
                    "current_price_usd": round(float(item.get("current_price", 0.0)), 2),
                    "final_score": round(float(item.get("final_score", 0.0)), 3),
                    "momentum_score": round(float(item.get("momentum_score", 0.0)), 3),
                    "sharpe_ratio": round(float(item.get("sharpe_ratio", 0.0)), 3),
                    "order_qty": int(cfg["order_qty"]),
                }
            )

    is_cash_defense = len(target_tickers) == 0
    return {
        "criteria": use_criteria,
        "top_n": use_top_n,
        "weights": {"w1": use_w1, "w5": use_w5, "w20": use_w20},
        "is_cash_defense": is_cash_defense,
        "target_tickers": target_tickers,
        "target_display": ", ".join(target_tickers) if target_tickers else "CASH (현금 방어)",
        "target_details": target_details,
        "last_updated": ranked[0].get("last_updated", "") if ranked else "",
    }


def inquire_kis_etf_us_account(
    criteria: Optional[str] = None,
    top_n: Optional[int] = None,
    w1: Optional[float] = None,
    w5: Optional[float] = None,
    w20: Optional[float] = None,
    user_id: str = "admin",
) -> Dict[str, Any]:
    """
    회원별(user_id) 증권사 해외주식 계좌 잔고 및 내장 원장 보유 현황, 당일 장마감 교체 시그널 여부를 통합 조회합니다.
    - 일반회원(user_id != 'admin')이 아직 본인 계좌를 연결하지 않은 경우(is_connected == False):
      관리자의 한투 모의계좌(44790516-01) 및 보유/주문 내역을 일절 노출하지 않고 빈 상태를 반환합니다.
    """
    _init_etf_kis_tables()
    uid = _normalize_uid(user_id)
    cfg = get_kis_etf_us_config(user_id=uid)
    is_mock = cfg["is_mock"]
    sess = get_us_market_session_info()
    signal = get_current_etf_signal(criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20, user_id=uid)
    default_qty = int(cfg["order_qty"])
    target_disp = signal["target_display"]

    # 일반회원이 아직 본인 증권사 계좌를 등록/연결하지 않은 경우 -> 관리자 계좌 및 잔고 절대 비노출
    if uid != "admin" and not cfg.get("is_connected", False):
        return {
            "config": cfg,
            "market_session": sess,
            "reservation_summary": {
                "active": False,
                "reserved_qty": default_qty,
                "reserved_at_kst": "계좌 미연결",
                "cutoff_time_et": "15:50 ET (미국장 마감 10분 전 최종 신호 확정)",
                "cutoff_time_kst": sess.get("auto_close_order_time_kst", "05:50 KST (15:50 ET)"),
                "current_holding_display": "계좌 미연결",
                "preview_target_display": f"{target_disp} ({default_qty}주)",
                "execution_rule": "본인 증권사 계좌를 연결하면 미국장 마감 10분 전(15:50 ET) 최종 신호로 개별 자동매매가 가동됩니다.",
            },
            "broker_connected": False,
            "broker_code": "",
            "broker_message": "본인 증권사 계좌 미연결 상태입니다. [내 증권사 계좌 연결]에서 본인 계좌를 등록해주세요.",
            "holdings": [],
            "held_tickers": [],
            "HeldDisplay": "계좌 미연결",
            "total_eval_usd": 0.0,
            "total_pnl_usd": 0.0,
            "signal": signal,
            "rotation_needed": False,
            "signal_status_label": "🔒 본인 증권사 계좌 미연결 — 상단 [내 증권사 계좌 연결]에서 개별 계좌를 등록해 운용하세요.",
            "sell_plan": [],
            "buy_plan": [],
            "recent_orders": [],
            "api_spec_info": {
                "endpoint": "/uapi/overseas-stock/v1/trading/order",
                "tr_id_mock": "개별 증권사 계좌 연동 대기",
                "tr_id_live": "개별 증권사 실전/모의계좌 독립 운용",
                "closing_system": "미국 정규장 마감 10분 전(15:50 ET) 최종 신호 확정 → 종가체결 자동매매",
                "default_qty": f"{default_qty}주 (디폴트 100주 · 직접 입력 가능)",
            },
        }

    client = _get_kis_client(is_mock=is_mock, cano=cfg["cano"], acnt_prdt_cd=cfg["acnt_prdt_cd"], user_id=uid)

    broker_connected = False
    broker_code = ""
    broker_message = ""
    kis_holdings: List[Dict[str, Any]] = []

    # 1. KIS 해외주식 잔고조회 API 호출 (모의: VTTS3012R / 실전: TTTS3012R)
    if client is not None:
        tr_id = "VTTS3012R" if is_mock else "TTTS3012R"
        url = f"{client.base_url}/uapi/overseas-stock/v1/trading/inquire-balance"
        for excg_cd in ("NASD", "AMEX", "NYSE"):
            params = {
                "CANO": cfg["cano"],
                "ACNT_PRDT_CD": cfg["acnt_prdt_cd"],
                "OVRS_EXCG_CD": excg_cd,
                "TR_CRCY_CD": "USD",
                "CTX_AREA_FK200": "",
                "CTX_AREA_NK200": "",
            }
            try:
                client.rate_limiter.wait()
                res = requests.get(url, headers=client.get_headers(tr_id), params=params, timeout=3.5)
                if res.status_code == 200:
                    js = res.json()
                    broker_code = str(js.get("msg_cd", ""))
                    broker_message = str(js.get("msg1", "")).strip()
                    if js.get("rt_cd") == "0":
                        broker_connected = True
                        for item in js.get("output1") or []:
                            sym = str(item.get("ovrs_pdno") or "").upper().strip()
                            qty = int(float(item.get("ovrs_cblc_qty") or item.get("ord_psbl_qty") or 0))
                            if not sym or qty <= 0:
                                continue
                            avg_p = float(item.get("pchs_avg_pric") or 0.0)
                            cur_p = float(item.get("now_pric2") or avg_p or get_us_etf_closing_or_live_price(sym))
                            pnl_usd = (cur_p - avg_p) * qty if avg_p > 0 else 0.0
                            pnl_pct = ((cur_p - avg_p) / avg_p) * 100.0 if avg_p > 0 else 0.0
                            if not any(h["ticker"] == sym for h in kis_holdings):
                                kis_holdings.append(
                                    {
                                        "ticker": sym,
                                        "name": ETF_TARGETS.get(sym, item.get("ovrs_item_name", sym)),
                                        "exchange_cd": item.get("ovrs_excg_cd") or excg_cd,
                                        "qty": qty,
                                        "avg_buy_price_usd": round(avg_p, 2),
                                        "curr_price_usd": round(cur_p, 2),
                                        "eval_amount_usd": round(cur_p * qty, 2),
                                        "eval_pnl_usd": round(pnl_usd, 2),
                                        "eval_pnl_pct": round(pnl_pct, 2),
                                        "source": "KIS_BROKER",
                                    }
                                )
            except Exception as e:
                broker_message = f"KIS 해외주식 잔고조회 통신 참고: {e}"

    # 2. 해당 회원(user_id)의 보유 원장 및 체결 로그 조회
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute(
        "SELECT * FROM etf_us_kis_holdings WHERE user_id = ? AND qty > 0 ORDER BY ticker ASC",
        (uid,),
    )
    local_rows = [dict(r) for r in c.fetchall()]
    c.execute(
        "SELECT * FROM etf_us_kis_order_log WHERE user_id = ? ORDER BY id DESC LIMIT 20",
        (uid,),
    )
    order_logs = [dict(r) for r in c.fetchall()]
    conn.close()

    local_holdings: List[Dict[str, Any]] = []
    for r in local_rows:
        sym = r["ticker"]
        qty = int(r["qty"])
        avg_p = float(r.get("avg_buy_price_usd") or 0.0)
        cur_p = get_us_etf_closing_or_live_price(sym)
        pnl_usd = (cur_p - avg_p) * qty if avg_p > 0 else 0.0
        pnl_pct = ((cur_p - avg_p) / avg_p) * 100.0 if avg_p > 0 else 0.0
        local_holdings.append(
            {
                "ticker": sym,
                "name": r.get("name") or ETF_TARGETS.get(sym, sym),
                "exchange_cd": r.get("exchange_cd") or US_ETF_EXCHANGE_MAP.get(sym, {}).get("order_excg", "AMEX"),
                "qty": qty,
                "avg_buy_price_usd": round(avg_p, 2),
                "curr_price_usd": round(cur_p, 2),
                "eval_amount_usd": round(cur_p * qty, 2),
                "eval_pnl_usd": round(pnl_usd, 2),
                "eval_pnl_pct": round(pnl_pct, 2),
                "updated_at_kst": r.get("updated_at_kst", ""),
                "source": "PAPER_LEDGER",
            }
        )

    effective_holdings = kis_holdings if kis_holdings else local_holdings
    held_tickers = [h["ticker"] for h in effective_holdings if h["qty"] > 0]

    # 3. 현재 전략 추천 시그널 및 교체 필요 여부(Delta) 계산
    target_tickers = signal["target_tickers"]

    sell_plan: List[Dict[str, Any]] = []
    buy_plan: List[Dict[str, Any]] = []

    for h in effective_holdings:
        tkr = h["ticker"]
        if tkr not in target_tickers:
            sell_plan.append(
                {
                    "side": "SELL",
                    "ticker": tkr,
                    "name": h["name"],
                    "exchange_cd": h["exchange_cd"],
                    "qty": int(h["qty"]),
                    "est_price_usd": h["curr_price_usd"],
                    "reason": f"교체 시그널 발생 ({tkr} 편출 → {signal['target_display']} 편입)",
                }
            )

    for tgt in signal["target_details"]:
        tkr = tgt["ticker"]
        existing = next((h for h in effective_holdings if h["ticker"] == tkr), None)
        existing_qty = int(existing["qty"]) if existing else 0
        diff_qty = default_qty - existing_qty
        if diff_qty > 0:
            buy_plan.append(
                {
                    "side": "BUY",
                    "ticker": tkr,
                    "name": tgt["name"],
                    "exchange_cd": tgt["exchange_cd"],
                    "qty": diff_qty,
                    "est_price_usd": tgt["current_price_usd"],
                    "reason": (
                        f"신규 1위 진입 ({tkr} {diff_qty}주 종가매수)"
                        if existing_qty == 0 and not held_tickers
                        else f"리밸런싱 교체 매수 ({tkr} {diff_qty}주 종가매수)"
                    ),
                }
            )
        elif diff_qty < 0:
            sell_plan.append(
                {
                    "side": "SELL",
                    "ticker": tkr,
                    "name": tgt["name"],
                    "exchange_cd": tgt["exchange_cd"],
                    "qty": abs(diff_qty),
                    "est_price_usd": tgt["current_price_usd"],
                    "reason": f"목표 수량({default_qty}주) 맞춤 일부 매도",
                }
            )

    rotation_needed = len(sell_plan) > 0 or len(buy_plan) > 0
    if not held_tickers and target_tickers:
        signal_status_label = f"신규 진입 대기 (현재 미보유 → {signal['target_display']} {default_qty}주 종가매수 권장)"
    elif rotation_needed:
        signal_status_label = f"⚡ 교체 시그널 발생! (보유: {', '.join(held_tickers)} ➔ 목표: {signal['target_display']} {default_qty}주)"
    else:
        signal_status_label = f"✅ 포지션 일치·유지중 (보유: {', '.join(held_tickers) if held_tickers else 'CASH'} / 추가 매매 불필요)"

    total_eval_usd = round(sum(h["eval_amount_usd"] for h in effective_holdings), 2)
    total_pnl_usd = round(sum(h["eval_pnl_usd"] for h in effective_holdings), 2)
    held_disp = ", ".join([f"{h['ticker']}({h['qty']}주)" for h in effective_holdings]) if effective_holdings else "미보유 (CASH)"

    reservation_summary = {
        "active": bool(cfg.get("auto_trade_enabled", True)),
        "reserved_qty": default_qty,
        "reserved_at_kst": cfg.get("reserved_at_kst") or "상시 자동예약 가동중",
        "cutoff_time_et": "15:50 ET (미국장 마감 10분 전 최종 신호 확정)",
        "cutoff_time_kst": sess.get("auto_close_order_time_kst", "05:50 KST (15:50 ET)"),
        "current_holding_display": held_disp,
        "preview_target_display": f"{target_disp} ({default_qty}주)" if not signal["is_cash_defense"] else "CASH (현금방어)",
        "execution_rule": (
            f"미국장 마감 10분 전(15:50 ET)까지 집계된 최종 신호로 "
            f"[기존 보유 ETF({held_disp}) 전량 매도 + 신규 추천 1위 ETF({target_disp}) {default_qty}주 동시 종가매수] 자동 집행"
        ),
    }

    return {
        "config": cfg,
        "market_session": sess,
        "reservation_summary": reservation_summary,
        "broker_connected": broker_connected,
        "broker_code": broker_code,
        "broker_message": broker_message,
        "holdings": effective_holdings,
        "held_tickers": held_tickers,
        "HeldDisplay": held_disp,
        "total_eval_usd": total_eval_usd,
        "total_pnl_usd": total_pnl_usd,
        "signal": signal,
        "rotation_needed": rotation_needed,
        "signal_status_label": signal_status_label,
        "sell_plan": sell_plan,
        "buy_plan": buy_plan,
        "recent_orders": order_logs,
        "api_spec_info": {
            "endpoint": "/uapi/overseas-stock/v1/trading/order",
            "tr_id_mock": "VTTT1002U (미국 모의매수) / VTTT1001U (미국 모의매도)",
            "tr_id_live": "TTTT1002U (미국 실전매수) / TTTT1006U (미국 실전매도)",
            "closing_system": "미국 정규장 마감 10분 전(15:50 ET / 한국시간 04:50·05:50) 최종 신호 확정 → MOC 종가체결(33 / 모의지정가 00)",
            "default_qty": f"{default_qty}주 (디폴트 100주 · 직접 입력 가능)",
        },
    }


def _submit_single_kis_us_order(
    ticker: str,
    side: str,
    qty: int,
    ord_dvsn: str = "33",
    prev_tickers_str: str = "",
    target_tickers_str: str = "",
    reason: str = "미국 ETF 종가체결 자동매매",
    user_id: str = "admin",
) -> Dict[str, Any]:
    """
    단일 미국 ETF 종목에 대해 회원별(user_id) 증권사 해외주식 주문을 전송하고 회원 전용 원장을 동기화합니다.
    """
    _init_etf_kis_tables()
    uid = _normalize_uid(user_id)
    cfg = get_kis_etf_us_config(user_id=uid)
    if uid != "admin" and not cfg.get("is_connected", False):
        return {
            "success": False,
            "error": "본인 증권사 계좌가 아직 연결되지 않았습니다. 먼저 [내 증권사 계좌 연결]에서 계좌를 등록해주세요.",
        }

    is_mock = cfg["is_mock"]
    clean_t = str(ticker).upper().strip()
    is_buy = str(side).upper() == "BUY"
    qty = max(1, int(qty))

    ex_info = US_ETF_EXCHANGE_MAP.get(clean_t, {"order_excg": "AMEX", "fallback_excg": "NYSE"})
    order_excg = ex_info["order_excg"]
    fallback_excg = ex_info.get("fallback_excg", "NYSE")

    exec_price_usd = get_us_etf_closing_or_live_price(clean_t)
    marketable_limit_usd = round(exec_price_usd * (1.005 if is_buy else 0.995), 2)

    client = _get_kis_client(is_mock=is_mock, cano=cfg["cano"], acnt_prdt_cd=cfg["acnt_prdt_cd"], user_id=uid)
    tr_id = ("VTTT1002U" if is_buy else "VTTT1001U") if is_mock else ("TTTT1002U" if is_buy else "TTTT1006U")

    now_kst = _get_kst_now()
    now_kst_str = now_kst.strftime("%Y-%m-%d %H:%M:%S")
    us_date_str = _get_us_et_now().strftime("%Y-%m-%d")
    broker_label = cfg.get("broker_name") or "한국투자증권"

    broker_status = "PAPER_MOC_FILLED"
    broker_order_no = f"USMOC-{now_kst.strftime('%H%M%S')}"
    broker_msg = f"{broker_label}({cfg['account_display']}) 미국장 종가체결(${exec_price_usd:.2f}) 처리 완료"
    used_ord_dvsn = ord_dvsn

    if client is not None:
        url = f"{client.base_url}/uapi/overseas-stock/v1/trading/order"
        attempt_list = []
        if is_mock:
            if ord_dvsn in ("33", "34"):
                attempt_list.append((order_excg, ord_dvsn, "0"))
            attempt_list.append((order_excg, "00", f"{exec_price_usd:.2f}"))
            if fallback_excg != order_excg:
                attempt_list.append((fallback_excg, "00", f"{exec_price_usd:.2f}"))
        else:
            unit_p = "0" if ord_dvsn == "33" else f"{marketable_limit_usd:.2f}"
            attempt_list.append((order_excg, ord_dvsn, unit_p))
            if ord_dvsn == "33":
                attempt_list.append((order_excg, "00", f"{marketable_limit_usd:.2f}"))

        last_err_cd = ""
        last_err_msg = ""
        for excg_try, dvsn_try, price_str in attempt_list:
            body = {
                "CANO": cfg["cano"],
                "ACNT_PRDT_CD": cfg["acnt_prdt_cd"],
                "OVRS_EXCG_CD": excg_try,
                "PDNO": clean_t,
                "ORD_QTY": str(qty),
                "OVRS_ORD_UNPR": price_str,
                "ORD_SVR_DVSN_CD": "0",
                "ORD_DVSN": dvsn_try,
            }
            try:
                client.rate_limiter.wait()
                res = requests.post(url, headers=client.get_headers(tr_id), data=json.dumps(body), timeout=4.0)
                if res.status_code == 200:
                    js = res.json()
                    if js.get("rt_cd") == "0":
                        out_d = js.get("output") or {}
                        broker_status = "KIS_BROKER_SUBMITTED"
                        broker_order_no = str(out_d.get("ODNO") or out_d.get("odno") or broker_order_no)
                        used_ord_dvsn = dvsn_try
                        order_excg = excg_try
                        broker_msg = (
                            f"{broker_label} {'모의' if is_mock else '실전'}서버({tr_id}) 미국장 종가주문 접수 완료 "
                            f"[{excg_try}:{clean_t} {qty}주 @ ${exec_price_usd:.2f}] ({js.get('msg1', '')})"
                        )
                        break
                    else:
                        last_err_cd = str(js.get("msg_cd", ""))
                        last_err_msg = str(js.get("msg1", "")).strip()
            except Exception as e:
                last_err_msg = str(e)

        if broker_status != "KIS_BROKER_SUBMITTED":
            if not is_mock:
                return {
                    "success": False,
                    "error": f"[{broker_label} 해외주식 실전주문 거부: {last_err_cd}] {last_err_msg}",
                }
            broker_status = f"PAPER_MOC_FILLED ({last_err_cd or 'SIM'})"
            broker_msg = (
                f"{broker_label} 계좌({cfg['account_display']}) 연동 [{last_err_msg or '미국장 외 시간/모의원장 처리'}] "
                f"→ 미국장 종가체결 시스템(${exec_price_usd:.2f})으로 {clean_t} {qty}주 체결 완료"
            )

    # 회원별 보유 원장(etf_us_kis_holdings) 업데이트
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    c = conn.cursor()
    c.execute(
        "SELECT qty, avg_buy_price_usd FROM etf_us_kis_holdings WHERE user_id = ? AND ticker = ?",
        (uid, clean_t),
    )
    row = c.fetchone()
    old_qty = int(row[0]) if row else 0
    old_avg = float(row[1]) if row else 0.0

    if is_buy:
        new_qty = old_qty + qty
        new_avg = ((old_qty * old_avg) + (qty * exec_price_usd)) / new_qty if new_qty > 0 else exec_price_usd
        c.execute(
            """
            INSERT OR REPLACE INTO etf_us_kis_holdings
            (user_id, ticker, name, exchange_cd, qty, avg_buy_price_usd, curr_price_usd, updated_at_kst)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uid,
                clean_t,
                ETF_TARGETS.get(clean_t, clean_t),
                order_excg,
                new_qty,
                round(new_avg, 4),
                exec_price_usd,
                now_kst_str,
            ),
        )
    else:
        new_qty = max(0, old_qty - qty)
        if new_qty == 0:
            c.execute("DELETE FROM etf_us_kis_holdings WHERE user_id = ? AND ticker = ?", (uid, clean_t))
        else:
            c.execute(
                """
                UPDATE etf_us_kis_holdings
                SET qty = ?, curr_price_usd = ?, updated_at_kst = ?
                WHERE user_id = ? AND ticker = ?
                """,
                (new_qty, exec_price_usd, now_kst_str, uid, clean_t),
            )

    ord_dvsn_label = (
        "MOC 종가체결(33)"
        if used_ord_dvsn == "33"
        else ("LOC 마감지정가(34)" if used_ord_dvsn == "34" else "종가동시지정가(00)")
    )
    side_label = "BUY(매수)" if is_buy else "SELL(매도)"

    c.execute(
        """
        INSERT INTO etf_us_kis_order_log (
            user_id, executed_at_kst, us_trading_date, mode, account_no, ticker, exchange_cd,
            side, qty, ord_dvsn, ord_dvsn_label, exec_price_usd,
            prev_holding_tickers, target_holding_tickers,
            broker_status, broker_order_no, broker_msg, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            uid,
            now_kst_str,
            us_date_str,
            cfg["mode"],
            cfg["account_display"],
            clean_t,
            order_excg,
            side_label,
            qty,
            used_ord_dvsn,
            ord_dvsn_label,
            exec_price_usd,
            prev_tickers_str,
            target_tickers_str,
            broker_status,
            broker_order_no,
            broker_msg,
            reason,
        ),
    )
    conn.commit()
    conn.close()

    return {
        "success": True,
        "user_id": uid,
        "executed_at_kst": now_kst_str,
        "us_trading_date": us_date_str,
        "mode": cfg["mode"],
        "account_no": cfg["account_display"],
        "ticker": clean_t,
        "exchange_cd": order_excg,
        "side": side_label,
        "qty": qty,
        "ord_dvsn": used_ord_dvsn,
        "ord_dvsn_label": ord_dvsn_label,
        "exec_price_usd": exec_price_usd,
        "broker_status": broker_status,
        "broker_order_no": broker_order_no,
        "broker_msg": broker_msg,
        "reason": reason,
    }


def execute_etf_us_rebalance_or_order(
    action: str = "AUTO_ROTATE",
    manual_ticker: Optional[str] = None,
    manual_side: Optional[str] = None,
    manual_qty: Optional[int] = None,
    order_qty: Optional[int] = None,
    criteria: Optional[str] = None,
    top_n: Optional[int] = None,
    w1: Optional[float] = None,
    w5: Optional[float] = None,
    w20: Optional[float] = None,
    force_rebalance: bool = False,
    reason: str = "ETF 투자전략 미국장 마감 10분 전(15:50 ET) 예약 자동주문",
    user_id: str = "admin",
) -> Dict[str, Any]:
    """
    회원별(user_id) ETF 투자전략의 미국장 마감 10분 전(15:50 ET) 최종 신호 기준 예약/종가체결 주문을 실행합니다.
    """
    _init_etf_kis_tables()
    uid = _normalize_uid(user_id)
    cfg = get_kis_etf_us_config(user_id=uid)

    if uid != "admin" and not cfg.get("is_connected", False):
        return {
            "success": False,
            "skipped": True,
            "message": "본인 증권사 계좌가 아직 연결되지 않았습니다. 상단 [내 증권사 계좌 연결]에서 본인 계좌를 먼저 등록해주세요.",
            "executed_orders": [],
            "account_status": inquire_kis_etf_us_account(
                criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20, user_id=uid
            ),
        }

    effective_input_qty = order_qty if order_qty is not None else manual_qty
    if effective_input_qty is not None and int(effective_input_qty) > 0:
        update_kis_etf_us_config({"order_qty": int(effective_input_qty)}, user_id=uid)

    cfg = get_kis_etf_us_config(user_id=uid)
    default_qty = int(cfg["order_qty"])
    ord_dvsn = str(cfg.get("ord_dvsn", "33"))
    broker_label = cfg.get("broker_name") or "한국투자증권"

    status_before = inquire_kis_etf_us_account(
        criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20, user_id=uid
    )
    prev_tickers = status_before.get("held_tickers", [])
    prev_str = ", ".join(prev_tickers) if prev_tickers else "CASH"
    target_str = status_before["signal"]["target_display"]

    # 1) 미국장 마감 10분 전(15:50 ET) 예약 자동주문 등록 모드
    if action == "RESERVE_US_CLOSE":
        now_kst = _get_kst_now()
        now_kst_str = now_kst.strftime("%Y-%m-%d %H:%M:%S")
        et_now = _get_us_et_now()
        us_date_str = et_now.strftime("%Y-%m-%d")
        hhmm_et = et_now.hour * 100 + et_now.minute

        cfg_updates: Dict[str, Any] = {
            "order_qty": default_qty,
            "auto_trade_enabled": True,
            "reservation_active": True,
            "reserved_at_kst": now_kst_str,
        }
        if criteria in ("sharpe", "momentum"):
            cfg_updates["criteria"] = criteria
        if top_n is not None:
            cfg_updates["top_n"] = int(top_n)
        if w1 is not None and w5 is not None and w20 is not None:
            cfg_updates["weights"] = {"w1": w1, "w5": w5, "w20": w20}
        update_kis_etf_us_config(cfg_updates, user_id=uid)

        if et_now.weekday() < 5 and 1550 <= hhmm_et <= 1600:
            return execute_etf_us_rebalance_or_order(
                action="AUTO_ROTATE",
                order_qty=default_qty,
                criteria=criteria,
                top_n=top_n,
                w1=w1,
                w5=w5,
                w20=w20,
                force_rebalance=force_rebalance,
                reason=f"미국장 마감 10분 전({et_now.strftime('%H:%M ET')}) 최종 신호 확정 즉시 집행 ({default_qty}주)",
                user_id=uid,
            )

        est_price = 0.0
        if status_before["signal"].get("target_details"):
            est_price = float(status_before["signal"]["target_details"][0].get("current_price_usd") or 0.0)

        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        c = conn.cursor()
        reserve_order_no = f"RSV1550-{now_kst.strftime('%H%M%S')}"
        reserve_msg = (
            f"[{broker_label}({cfg['account_display']}) 예약 자동주문 등록 완료] 미국장 마감 10분 전(15:50 ET / {status_before['market_session']['auto_close_order_time_kst']}) "
            f"최종 신호 확정 시 [기존 보유({prev_str}) 전량 매도 + 신규 1위 ETF(현재기준 {target_str}) {default_qty}주 종가매수] 자동 실행"
        )
        c.execute(
            """
            INSERT INTO etf_us_kis_order_log (
                user_id, executed_at_kst, us_trading_date, mode, account_no, ticker, exchange_cd,
                side, qty, ord_dvsn, ord_dvsn_label, exec_price_usd,
                prev_holding_tickers, target_holding_tickers,
                broker_status, broker_order_no, broker_msg, reason
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uid,
                now_kst_str,
                us_date_str,
                cfg["mode"],
                cfg["account_display"],
                target_str,
                US_ETF_EXCHANGE_MAP.get(target_str, {}).get("order_excg", "AMEX"),
                "RESERVE(장마감예약)",
                default_qty,
                ord_dvsn,
                "15:50 ET 최종신호 MOC예약",
                est_price,
                prev_str,
                f"{target_str}({default_qty}주)",
                "RESERVED_1550_ET",
                reserve_order_no,
                reserve_msg,
                reason or f"미국장 마감 10분 전(15:50 ET) 최종 신호 기준 {default_qty}주 교체 자동주문 예약",
            ),
        )
        conn.commit()
        conn.close()

        status_after_rsv = inquire_kis_etf_us_account(
            criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20, user_id=uid
        )
        return {
            "success": True,
            "reserved": True,
            "skipped": False,
            "message": reserve_msg,
            "executed_orders": [],
            "account_status": status_after_rsv,
        }

    executed_orders: List[Dict[str, Any]] = []

    if action == "MANUAL_ORDER" and manual_ticker:
        use_qty = max(1, int(manual_qty if manual_qty is not None else default_qty))
        use_side = (manual_side or "BUY").upper()
        res = _submit_single_kis_us_order(
            ticker=manual_ticker,
            side=use_side,
            qty=use_qty,
            ord_dvsn=ord_dvsn,
            prev_tickers_str=prev_str,
            target_tickers_str=manual_ticker if use_side == "BUY" else "CASH",
            reason=reason or f"수동 지정 {manual_ticker} {use_qty}주 종가체결 {use_side}",
            user_id=uid,
        )
        if not res.get("success"):
            return {"success": False, "message": res.get("error", "주문 실패")}
        executed_orders.append(res)

    elif action == "LIQUIDATE_ALL":
        holdings = status_before.get("holdings", [])
        if not holdings:
            return {
                "success": True,
                "skipped": True,
                "message": "현재 보유 중인 미국 ETF가 없어 청산할 내역이 없습니다 (이미 CASH 상태).",
                "executed_orders": [],
                "account_status": status_before,
            }
        for h in holdings:
            if int(h["qty"]) > 0:
                res = _submit_single_kis_us_order(
                    ticker=h["ticker"],
                    side="SELL",
                    qty=int(h["qty"]),
                    ord_dvsn=ord_dvsn,
                    prev_tickers_str=prev_str,
                    target_tickers_str="CASH",
                    reason=reason or f"보유 ETF({h['ticker']}) 전량 종가 청산 (CASH 전환)",
                    user_id=uid,
                )
                executed_orders.append(res)

    else:
        sell_plan = status_before.get("sell_plan", [])
        buy_plan = status_before.get("buy_plan", [])

        if not sell_plan and not buy_plan and not force_rebalance:
            return {
                "success": True,
                "skipped": True,
                "message": f"현재 보유 포지션({status_before.get('HeldDisplay', prev_str)})이 추천 타겟({target_str}, {default_qty}주)과 이미 일치하여 추가 매매 없이 보유를 유지합니다. (다가오는 미국장 마감 10분 전 15:50 ET에 최종 신호 재점검)",
                "executed_orders": [],
                "account_status": status_before,
            }

        for s_item in sell_plan:
            res = _submit_single_kis_us_order(
                ticker=s_item["ticker"],
                side="SELL",
                qty=int(s_item["qty"]),
                ord_dvsn=ord_dvsn,
                prev_tickers_str=prev_str,
                target_tickers_str=target_str,
                reason=s_item.get("reason") or reason,
                user_id=uid,
            )
            executed_orders.append(res)

        for b_item in buy_plan:
            res = _submit_single_kis_us_order(
                ticker=b_item["ticker"],
                side="BUY",
                qty=int(b_item["qty"]),
                ord_dvsn=ord_dvsn,
                prev_tickers_str=prev_str,
                target_tickers_str=target_str,
                reason=b_item.get("reason") or reason,
                user_id=uid,
            )
            executed_orders.append(res)

    us_today = _get_us_et_now().strftime("%Y-%m-%d")
    update_kis_etf_us_config({"last_auto_traded_us_date": us_today}, user_id=uid)

    status_after = inquire_kis_etf_us_account(
        criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20, user_id=uid
    )
    summary_text = (
        " / ".join([f"{o['side']} {o['ticker']} {o['qty']}주(@${o['exec_price_usd']:.2f})" for o in executed_orders])
        if executed_orders
        else "체결 내역 없음"
    )
    return {
        "success": True,
        "skipped": False,
        "message": f"{broker_label}({cfg['account_display']}) 미국장 종가체결 주문 완료: {summary_text}",
        "executed_orders": executed_orders,
        "account_status": status_after,
    }


def get_all_users_etf_us_summary() -> Dict[str, Dict[str, Any]]:
    """관리자(Admin) 전용: 모든 회원(user_id)의 미국 ETF 보유 현황 및 최근 주문내역 요약을 반환합니다."""
    _init_etf_kis_tables()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM etf_us_kis_holdings WHERE qty > 0 ORDER BY user_id ASC, ticker ASC")
    h_rows = [dict(r) for r in c.fetchall()]
    c.execute("SELECT * FROM etf_us_kis_order_log ORDER BY id DESC LIMIT 100")
    o_rows = [dict(r) for r in c.fetchall()]
    conn.close()

    by_user: Dict[str, Dict[str, Any]] = {}
    for hr in h_rows:
        u = hr.get("user_id") or "admin"
        if u not in by_user:
            by_user[u] = {"holdings": [], "recent_orders": [], "total_eval_usd": 0.0}
        cur_p = float(hr.get("curr_price_usd") or hr.get("avg_buy_price_usd") or 0.0)
        qty = int(hr.get("qty") or 0)
        eval_usd = round(cur_p * qty, 2)
        by_user[u]["holdings"].append(
            {
                "ticker": hr["ticker"],
                "name": hr.get("name") or hr["ticker"],
                "qty": qty,
                "avg_buy_price_usd": round(float(hr.get("avg_buy_price_usd") or 0.0), 2),
                "curr_price_usd": round(cur_p, 2),
                "eval_amount_usd": eval_usd,
                "updated_at_kst": hr.get("updated_at_kst") or "",
            }
        )
        by_user[u]["total_eval_usd"] = round(by_user[u]["total_eval_usd"] + eval_usd, 2)

    for orow in o_rows:
        u = orow.get("user_id") or "admin"
        if u not in by_user:
            by_user[u] = {"holdings": [], "recent_orders": [], "total_eval_usd": 0.0}
        if len(by_user[u]["recent_orders"]) < 10:
            by_user[u]["recent_orders"].append(orow)

    return by_user


def run_scheduled_us_market_close_etf_rotation(user_id: str = "admin") -> Dict[str, Any]:
    """
    미국 정규장 마감 10분 전(15:50 ET / 한국시간 동절기 05:50 KST, 서머타임 04:50 KST)에
    1) 장마감 10분 전까지의 최신 미국 ETF 가격을 실시간 동기화하여 최종 신호를 확정하고,
    2) 교체 시그널 발생 시 [기존 보유 ETF 전량 종가 매도 + 신규 1위 추천 ETF 설정 주수(디폴트 100주) 동시 종가 매수]를 자동 집행합니다.
    """
    uid = _normalize_uid(user_id)
    cfg = get_kis_etf_us_config(user_id=uid)
    if not cfg.get("is_connected", False) or not cfg.get("auto_trade_enabled", True):
        return {"success": True, "skipped": True, "reason": "예약 자동매매 비활성화 또는 계좌 미연결 상태"}

    et_now = _get_us_et_now()
    if et_now.weekday() >= 5:
        return {"success": True, "skipped": True, "reason": "미국장 주말 휴장"}

    try:
        from etf_strategy import sync_live_etf_prices
        sync_live_etf_prices(force=True)
    except Exception as e:
        print(f"[KIS_ETF_US] 미국장 마감 10분 전(15:50 ET) ETF 가격 갱신 참고: {e}")

    return execute_etf_us_rebalance_or_order(
        action="AUTO_ROTATE",
        order_qty=int(cfg.get("order_qty", 100)),
        reason=f"미국장 마감 10분 전({et_now.strftime('%Y-%m-%d %H:%M ET')}) 최종 신호 확정 예약 자동주문 집행 ({cfg['order_qty']}주)",
        user_id=uid,
    )


_US_ETF_BG_STARTED = False
_US_ETF_BG_LOCK = threading.Lock()


def _us_etf_closing_background_worker() -> None:
    """
    서버 기동 시 초기 모의계좌 포지션을 점검(미보유 시 현재 1위 추천 ETF 디폴트 100주 자동 초기 편입)하고,
    매 미국 정규장 마감 10분 전(15:50~15:59 ET)에 최종 신호를 확정하여 하루 1회 자동으로 종가체결 교체 주문을 실행하는 데몬 워커.
    """
    time.sleep(5)
    startup_initialized = False

    while True:
        try:
            cfg = get_kis_etf_us_config()
            if not startup_initialized:
                startup_initialized = True
                if cfg.get("auto_trade_enabled", True):
                    acc = inquire_kis_etf_us_account()
                    if not acc.get("holdings") and not acc.get("recent_orders") and acc.get("buy_plan"):
                        execute_etf_us_rebalance_or_order(
                            action="AUTO_ROTATE",
                            order_qty=int(cfg.get("order_qty", 100)),
                            reason=f"한투 모의계좌 초기 세팅 — 추천 1위 ETF {cfg['order_qty']}주 미국장 종가체결 자동 편입",
                        )

            if cfg.get("auto_trade_enabled", True):
                et_now = _get_us_et_now()
                us_date_str = et_now.strftime("%Y-%m-%d")
                hhmm_et = et_now.hour * 100 + et_now.minute
                # 미국 정규장 마감 10분 전(15:50 ~ 15:59 ET)에 당일 최종 신호 기준 예약 자동매매 집행
                if (
                    et_now.weekday() < 5
                    and 1550 <= hhmm_et <= 1559
                    and cfg.get("last_auto_traded_us_date") != us_date_str
                ):
                    run_scheduled_us_market_close_etf_rotation()
        except Exception as e:
            print(f"[KIS_ETF_US] 백그라운드 워커 참고: {e}")

        time.sleep(30)


def ensure_us_etf_auto_trader_worker() -> None:
    global _US_ETF_BG_STARTED
    with _US_ETF_BG_LOCK:
        if not _US_ETF_BG_STARTED:
            t = threading.Thread(target=_us_etf_closing_background_worker, daemon=True)
            t.start()
            _US_ETF_BG_STARTED = True

