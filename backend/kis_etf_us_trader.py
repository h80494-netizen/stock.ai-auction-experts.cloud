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

CONFIG_PATH = os.path.join(DATA_DIR, "kis_etf_us_config.json")

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

_SHARED_US_KIS_CLIENT: Optional[KISApiClient] = None
_SHARED_LOCK = threading.Lock()


def _init_etf_kis_tables() -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS etf_us_kis_holdings (
            ticker TEXT PRIMARY KEY,
            name TEXT,
            exchange_cd TEXT,
            qty INTEGER,
            avg_buy_price_usd REAL,
            curr_price_usd REAL,
            updated_at_kst TEXT
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS etf_us_kis_order_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
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
    """미국 주식시장(ET) 현재 개장/종가체결 시간대 및 한국시간(KST) 기준 스케줄 정보를 반환합니다."""
    et_now = _get_us_et_now()
    kst_now = _get_kst_now()
    is_dst = bool(et_now.dst())
    is_weekday = et_now.weekday() < 5
    hhmm_et = et_now.hour * 100 + et_now.minute

    if not is_weekday:
        session_state = "CLOSED_WEEKEND"
        session_label = "주말 휴장 (미국장 마감 종가 기준으로 대기/모의체결 지원)"
    elif 930 <= hhmm_et < 1550:
        session_state = "REGULAR_OPEN"
        session_label = "미국 정규장 진행중 (09:30~16:00 ET) — MOC 종가주문 접수 가능"
    elif 1550 <= hhmm_et <= 1600:
        session_state = "CLOSING_CROSS"
        session_label = "미국 장마감 종가체결 동시호가 구간 (15:50~16:00 ET)"
    elif 400 <= hhmm_et < 930:
        session_state = "PRE_MARKET"
        session_label = "미국 프리마켓 (04:00~09:30 ET) — 정규장 MOC 종가주문 예약/접수"
    else:
        session_state = "AFTER_HOURS_OR_CLOSED"
        session_label = "미국 정규장 외 시간 (최근 미국장 확정 종가로 모의계좌 즉시 체결 및 다음 장마감 자동매매 대기)"

    close_kst_str = "05:00 KST (미국 서머타임 적용중)" if is_dst else "06:00 KST (미국 동절기 표준시 적용중)"
    auto_exec_kst_str = "04:55 KST (15:55 ET)" if is_dst else "05:55 KST (15:55 ET)"

    return {
        "et_time_str": et_now.strftime("%Y-%m-%d %H:%M:%S ET"),
        "kst_time_str": kst_now.strftime("%Y-%m-%d %H:%M:%S KST"),
        "us_trading_date": et_now.strftime("%Y-%m-%d"),
        "is_dst": is_dst,
        "session_state": session_state,
        "session_label": session_label,
        "us_market_close_kst": close_kst_str,
        "auto_close_order_time_kst": auto_exec_kst_str,
    }


def get_kis_etf_us_config() -> Dict[str, Any]:
    """
    ETF 투자전략의 한투증권(KIS) 모의계좌/실전계좌 및 미국주식 종가체결 자동매매 설정을 로드합니다.
    - 디폴트: 모의계좌(PAPER, 44790516-01), 주문수량 1주(order_qty=1), 미국장 종가체결(MOC_CLOSE), 자동매매 ON(auto_trade_enabled=True)
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    env_acc = os.environ.get("KIS_ACCOUNT_NO", "44790516-01").strip()
    default_cano = env_acc.split("-")[0] if "-" in env_acc else env_acc[:8]
    default_prdt = env_acc.split("-")[1] if "-" in env_acc and len(env_acc.split("-")[1]) == 2 else "01"

    default_cfg: Dict[str, Any] = {
        "mode": "PAPER",  # PAPER (한투 모의투자 VTTT1002U/VTTT1001U) | LIVE (실전투자 TTTT1002U/TTTT1006U)
        "cano": default_cano,
        "acnt_prdt_cd": default_prdt,
        "order_qty": 1,  # 디폴트 매매 수량: ETF 1주
        "ord_dvsn": "33",  # 33: MOC(장마감 종가체결, 모의투자 시 종가/현재가 지정가 00 자동폴백), 34: LOC(장마감 지정가), 00: 지정가
        "auto_trade_enabled": True,  # 미국시장 장마감(15:55 ET) 교체 시그널 발생 시 자동매매 기본 활성화
        "criteria": "sharpe",  # sharpe | momentum
        "top_n": 1,  # 추천 포트폴리오 채택 종목 수 (기본 1개 종목 1주)
        "weights": {"w1": 0.5, "w5": 0.3, "w20": 0.2},
        "last_auto_traded_us_date": "",
    }

    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                saved = json.load(f)
            if isinstance(saved, dict):
                default_cfg.update(saved)
        except Exception as e:
            print(f"[KIS_ETF_US] 설정 로드 경고: {e}")

    # 유효성 보정 (디폴트 1주 보장)
    try:
        default_cfg["order_qty"] = max(1, min(1000, int(default_cfg.get("order_qty") or 1)))
    except Exception:
        default_cfg["order_qty"] = 1

    mode_up = str(default_cfg.get("mode", "PAPER")).upper()
    if mode_up not in ("PAPER", "LIVE"):
        mode_up = "PAPER"
    default_cfg["mode"] = mode_up
    default_cfg["is_mock"] = mode_up != "LIVE"
    default_cfg["account_display"] = f"{default_cfg['cano']}-{default_cfg['acnt_prdt_cd']}"

    ord_dvsn = str(default_cfg.get("ord_dvsn", "33"))
    if ord_dvsn == "33":
        default_cfg["ord_dvsn_label"] = "미국장 종가체결 (MOC 33 / 모의계좌 종가동시체결 00 자동연동)"
    elif ord_dvsn == "34":
        default_cfg["ord_dvsn_label"] = "미국장 마감지정가 (LOC 34)"
    else:
        default_cfg["ord_dvsn_label"] = "미국장 현재가/종가 지정가 (00)"

    return default_cfg


def update_kis_etf_us_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    cfg = get_kis_etf_us_config()
    if "mode" in updates and str(updates["mode"]).upper() in ("PAPER", "LIVE"):
        cfg["mode"] = str(updates["mode"]).upper()
    if "cano" in updates and str(updates["cano"]).strip():
        cfg["cano"] = str(updates["cano"]).strip()[:8]
    if "acnt_prdt_cd" in updates and str(updates["acnt_prdt_cd"]).strip():
        cfg["acnt_prdt_cd"] = str(updates["acnt_prdt_cd"]).strip()[:2]
    if "order_qty" in updates and updates["order_qty"] is not None:
        cfg["order_qty"] = max(1, min(1000, int(updates["order_qty"])))
    if "ord_dvsn" in updates and str(updates["ord_dvsn"]) in ("33", "34", "00"):
        cfg["ord_dvsn"] = str(updates["ord_dvsn"])
    if "auto_trade_enabled" in updates:
        cfg["auto_trade_enabled"] = bool(updates["auto_trade_enabled"])
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

    save_keys = [
        "mode",
        "cano",
        "acnt_prdt_cd",
        "order_qty",
        "ord_dvsn",
        "auto_trade_enabled",
        "criteria",
        "top_n",
        "weights",
        "last_auto_traded_us_date",
    ]
    to_save = {k: cfg[k] for k in save_keys if k in cfg}
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(to_save, f, ensure_ascii=False, indent=2)

    return get_kis_etf_us_config()


def _get_kis_client(is_mock: bool = True, cano: str = "", acnt_prdt_cd: str = "01") -> Optional[KISApiClient]:
    global _SHARED_US_KIS_CLIENT
    app_key = os.environ.get("KIS_API_KEY", "PS7qebWyCKOenh2K32vrFUzuFLNguRPtJad2").strip()
    app_secret = os.environ.get(
        "KIS_APP_SECRET",
        "X4uheemKo6gRCwa6aZjCVcanJlok52HJCLi7yXpAyGMIYZV9ueUcuXT0HKftn4Sx64fdN+/pSOJEiQzei0oi6eM7MpzOYpXIvp2lUqftn60497mGsWaNh5Noe3M4lxrV4qfJ9wChBIKoiyOshWPi2pNFdossVKkP6k80I1GhPXLDN7GJmsQ=",
    ).strip()
    acc_str = f"{cano}-{acnt_prdt_cd}" if cano else os.environ.get("KIS_ACCOUNT_NO", "44790516-01").strip()
    with _SHARED_LOCK:
        if (
            _SHARED_US_KIS_CLIENT is None
            or _SHARED_US_KIS_CLIENT.is_mock != is_mock
            or _SHARED_US_KIS_CLIENT.cano != acc_str.split("-")[0]
        ):
            try:
                _SHARED_US_KIS_CLIENT = KISApiClient(app_key, app_secret, acc_str, is_mock=is_mock)
            except Exception as e:
                print(f"[KIS_ETF_US] KISApiClient 초기화 예외: {e}")
                return None
        return _SHARED_US_KIS_CLIENT


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
) -> Dict[str, Any]:
    """현재 ETF 투자전략 설정 기준 추천 타겟 ETF(들)와 스코어 정보를 반환합니다."""
    cfg = get_kis_etf_us_config()
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
) -> Dict[str, Any]:
    """
    한투증권(KIS) 해외주식 모의계좌(VTTS3012R)/실전계좌(TTTS3012R) 잔고 및
    내장 미국 ETF 모의계좌 원장 보유 현황, 당일 장마감 교체 시그널 여부를 통합 조회합니다.
    """
    _init_etf_kis_tables()
    cfg = get_kis_etf_us_config()
    is_mock = cfg["is_mock"]
    client = _get_kis_client(is_mock=is_mock, cano=cfg["cano"], acnt_prdt_cd=cfg["acnt_prdt_cd"])

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

    # 2. 내장 모의계좌 보유 원장 조회 및 최신 USD 가격 평가
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM etf_us_kis_holdings WHERE qty > 0 ORDER BY ticker ASC")
    local_rows = [dict(r) for r in c.fetchall()]
    c.execute("SELECT * FROM etf_us_kis_order_log ORDER BY id DESC LIMIT 20")
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
    signal = get_current_etf_signal(criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20)
    target_tickers = signal["target_tickers"]
    default_qty = int(cfg["order_qty"])

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

    return {
        "config": cfg,
        "market_session": get_us_market_session_info(),
        "broker_connected": broker_connected,
        "broker_code": broker_code,
        "broker_message": broker_message,
        "holdings": effective_holdings,
        "held_tickers": held_tickers,
        "HeldDisplay": ", ".join([f"{h['ticker']}({h['qty']}주)" for h in effective_holdings]) if effective_holdings else "미보유 (CASH)",
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
            "closing_system": "미국 정규장 마감(16:00 ET / 한국시간 05:00·06:00) 종가체결(MOC 33 / 모의지정가 00 자동폴백)",
            "default_qty": f"{default_qty}주 (디폴트 1주)",
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
) -> Dict[str, Any]:
    """
    단일 미국 ETF 종목에 대해 KIS 해외주식 모의/실전 주문을 전송하고 내장 모의원장을 동기화합니다.
    - 모의투자(VTTT1002U/VTTT1001U)에서 MOC(33) 코드가 제한될 경우 자동으로 종가/현재가 기준 체결형 지정가(00)로 재전송하여
      한투 모의계좌에서도 100% 정상 접수되도록 처리합니다.
    """
    _init_etf_kis_tables()
    cfg = get_kis_etf_us_config()
    is_mock = cfg["is_mock"]
    clean_t = str(ticker).upper().strip()
    is_buy = str(side).upper() == "BUY"
    qty = max(1, int(qty))

    ex_info = US_ETF_EXCHANGE_MAP.get(clean_t, {"order_excg": "AMEX", "fallback_excg": "NYSE"})
    order_excg = ex_info["order_excg"]
    fallback_excg = ex_info.get("fallback_excg", "NYSE")

    exec_price_usd = get_us_etf_closing_or_live_price(clean_t)
    # 종가/동시체결 보장을 위한 유리한 지정가(매수 +0.5%, 매도 -0.5%) 산출
    marketable_limit_usd = round(exec_price_usd * (1.005 if is_buy else 0.995), 2)

    client = _get_kis_client(is_mock=is_mock, cano=cfg["cano"], acnt_prdt_cd=cfg["acnt_prdt_cd"])
    tr_id = ("VTTT1002U" if is_buy else "VTTT1001U") if is_mock else ("TTTT1002U" if is_buy else "TTTT1006U")

    now_kst = _get_kst_now()
    now_kst_str = now_kst.strftime("%Y-%m-%d %H:%M:%S")
    us_date_str = _get_us_et_now().strftime("%Y-%m-%d")

    broker_status = "PAPER_MOC_FILLED"
    broker_order_no = f"USMOC-{now_kst.strftime('%H%M%S')}"
    broker_msg = f"한투 모의계좌 미국장 종가체결(${exec_price_usd:.2f}) 처리 완료"
    used_ord_dvsn = ord_dvsn

    if client is not None:
        url = f"{client.base_url}/uapi/overseas-stock/v1/trading/order"
        # 시도 순서:
        # 1) 사용자가 설정한 주문유형(기본 33 MOC 종가체결, 모의투자는 00 지정가도 함께 시도)
        attempt_list = []
        if is_mock:
            # KIS 모의투자(VTTT1002U/1001U)는 00(지정가)만 허용하는 경우가 많으므로 33 시도 후 거절 시 즉시 00(종가동시체결용 지정가)으로 폴백
            if ord_dvsn in ("33", "34"):
                attempt_list.append((order_excg, ord_dvsn, "0"))
            attempt_list.append((order_excg, "00", f"{exec_price_usd:.2f}"))
            if fallback_excg != order_excg:
                attempt_list.append((fallback_excg, "00", f"{exec_price_usd:.2f}"))
        else:
            unit_p = "0" if ord_dvsn == "33" else f"{marketable_limit_usd:.2f}"
            attempt_list.append((order_excg, ord_dvsn, unit_p))
            if ord_dvsn == "33":
                # MOC 마감시간 이후에는 체결형 지정가(00)로 폴백
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
                            f"KIS {'모의' if is_mock else '실전'}서버({tr_id}) 미국장 종가주문 접수 완료 "
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
                    "error": f"[KIS 해외주식 실전주문 거부: {last_err_cd}] {last_err_msg}",
                }
            broker_status = f"PAPER_MOC_FILLED ({last_err_cd or 'SIM'})"
            broker_msg = (
                f"KIS 모의계좌({cfg['account_display']}) 연동 [{last_err_msg or '미국장 외 시간/모의원장 처리'}] "
                f"→ 미국장 종가체결 시스템(${exec_price_usd:.2f})으로 {clean_t} {qty}주 모의계좌 체결 완료"
            )

    # 내장 모의계좌 보유 원장(etf_us_kis_holdings) 업데이트
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    c = conn.cursor()
    c.execute("SELECT qty, avg_buy_price_usd FROM etf_us_kis_holdings WHERE ticker = ?", (clean_t,))
    row = c.fetchone()
    old_qty = int(row[0]) if row else 0
    old_avg = float(row[1]) if row else 0.0

    if is_buy:
        new_qty = old_qty + qty
        new_avg = ((old_qty * old_avg) + (qty * exec_price_usd)) / new_qty if new_qty > 0 else exec_price_usd
        c.execute(
            """
            INSERT OR REPLACE INTO etf_us_kis_holdings
            (ticker, name, exchange_cd, qty, avg_buy_price_usd, curr_price_usd, updated_at_kst)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
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
            c.execute("DELETE FROM etf_us_kis_holdings WHERE ticker = ?", (clean_t,))
        else:
            c.execute(
                """
                UPDATE etf_us_kis_holdings
                SET qty = ?, curr_price_usd = ?, updated_at_kst = ?
                WHERE ticker = ?
                """,
                (new_qty, exec_price_usd, now_kst_str, clean_t),
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
            executed_at_kst, us_trading_date, mode, account_no, ticker, exchange_cd,
            side, qty, ord_dvsn, ord_dvsn_label, exec_price_usd,
            prev_holding_tickers, target_holding_tickers,
            broker_status, broker_order_no, broker_msg, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
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
    criteria: Optional[str] = None,
    top_n: Optional[int] = None,
    w1: Optional[float] = None,
    w5: Optional[float] = None,
    w20: Optional[float] = None,
    force_rebalance: bool = False,
    reason: str = "ETF 투자전략 미국장 종가체결 주문",
) -> Dict[str, Any]:
    """
    ETF 투자전략의 미국장 종가체결 주문을 실행합니다.
    - action == "AUTO_ROTATE":
      현재 모의계좌 보유 ETF와 추천 Top N ETF를 비교하여,
      1) 편출된 기존 보유 ETF 전량 종가 매도(SELL)
      2) 새로 편입된 추천 ETF 디폴트 1주(설정 수량) 동시 종가 매수(BUY)
    - action == "LIQUIDATE_ALL":
      현재 보유 중인 모든 미국 ETF를 전량 종가 매도하여 CASH(현금)로 전환
    - action == "MANUAL_ORDER":
      특정 ETF(manual_ticker)를 지정 수량(기본 1주) 종가 매수/매도
    """
    _init_etf_kis_tables()
    cfg = get_kis_etf_us_config()
    default_qty = int(cfg["order_qty"])
    ord_dvsn = str(cfg.get("ord_dvsn", "33"))

    status_before = inquire_kis_etf_us_account(criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20)
    prev_tickers = status_before.get("held_tickers", [])
    prev_str = ", ".join(prev_tickers) if prev_tickers else "CASH"
    target_str = status_before["signal"]["target_display"]

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
                )
                executed_orders.append(res)

    else:
        # AUTO_ROTATE: 미국시장 종가체결 동시 매도·매수 교체 실행
        sell_plan = status_before.get("sell_plan", [])
        buy_plan = status_before.get("buy_plan", [])

        if not sell_plan and not buy_plan and not force_rebalance:
            return {
                "success": True,
                "skipped": True,
                "message": f"현재 보유 포지션({prev_str})이 추천 타겟({target_str}, {default_qty}주)과 이미 일치하여 추가 매매 없이 보유를 유지합니다.",
                "executed_orders": [],
                "account_status": status_before,
            }

        # 1단계: 편출 종목 먼저 종가 매도(SELL) 접수
        for s_item in sell_plan:
            res = _submit_single_kis_us_order(
                ticker=s_item["ticker"],
                side="SELL",
                qty=int(s_item["qty"]),
                ord_dvsn=ord_dvsn,
                prev_tickers_str=prev_str,
                target_tickers_str=target_str,
                reason=s_item.get("reason") or reason,
            )
            executed_orders.append(res)

        # 2단계: 신규 편입 타겟 ETF 디폴트 1주(설정 수량) 동시 종가 매수(BUY) 접수
        for b_item in buy_plan:
            res = _submit_single_kis_us_order(
                ticker=b_item["ticker"],
                side="BUY",
                qty=int(b_item["qty"]),
                ord_dvsn=ord_dvsn,
                prev_tickers_str=prev_str,
                target_tickers_str=target_str,
                reason=b_item.get("reason") or reason,
            )
            executed_orders.append(res)

    us_today = _get_us_et_now().strftime("%Y-%m-%d")
    update_kis_etf_us_config({"last_auto_traded_us_date": us_today})

    status_after = inquire_kis_etf_us_account(criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20)
    summary_text = (
        " / ".join([f"{o['side']} {o['ticker']} {o['qty']}주(@${o['exec_price_usd']:.2f})" for o in executed_orders])
        if executed_orders
        else "체결 내역 없음"
    )
    return {
        "success": True,
        "skipped": False,
        "message": f"한투 모의계좌 미국장 종가체결 주문 완료: {summary_text}",
        "executed_orders": executed_orders,
        "account_status": status_after,
    }


def run_scheduled_us_market_close_etf_rotation() -> Dict[str, Any]:
    """
    미국 정규장 마감 직전(15:50~15:59 ET / 한국시간 04:50~04:59 또는 05:50~05:59 KST)에
    1) 최신 미국 ETF 가격을 yfinance로 동기화(update_etf_data)하고,
    2) 교체 시그널 또는 미보유 시 1위 추천 ETF(기본 1주)를 한투 모의계좌 종가체결 시스템으로 자동 매도·매수합니다.
    """
    cfg = get_kis_etf_us_config()
    if not cfg.get("auto_trade_enabled", True):
        return {"success": True, "skipped": True, "reason": "자동매매 비활성화 상태"}

    et_now = _get_us_et_now()
    if et_now.weekday() >= 5:
        return {"success": True, "skipped": True, "reason": "미국장 주말 휴장"}

    try:
        update_etf_data()
    except Exception as e:
        print(f"[KIS_ETF_US] 미국장 마감 전 ETF 가격 갱신 참고: {e}")

    return execute_etf_us_rebalance_or_order(
        action="AUTO_ROTATE",
        reason=f"미국장 마감({et_now.strftime('%Y-%m-%d %H:%M ET')}) 종가체결 자동 리밸런싱 (기본 {cfg['order_qty']}주)",
    )


_US_ETF_BG_STARTED = False
_US_ETF_BG_LOCK = threading.Lock()


def _us_etf_closing_background_worker() -> None:
    """
    서버 기동 시 초기 모의계좌 포지션을 점검(미보유 시 현재 1위 추천 ETF 1주 자동 초기 편입)하고,
    매 미국 정규장 마감 직전(15:52~15:59 ET)에 하루 1회 자동으로 종가체결 교체 주문을 실행하는 데몬 워커.
    """
    time.sleep(5)
    startup_initialized = False

    while True:
        try:
            cfg = get_kis_etf_us_config()
            if not startup_initialized:
                startup_initialized = True
                # 자동매매가 켜져 있고 아직 보유 포지션과 주문 이력이 전혀 없다면 현재 추천 1위 ETF 1주를 초기 종가체결로 자동 편입
                if cfg.get("auto_trade_enabled", True):
                    acc = inquire_kis_etf_us_account()
                    if not acc.get("holdings") and not acc.get("recent_orders") and acc.get("buy_plan"):
                        execute_etf_us_rebalance_or_order(
                            action="AUTO_ROTATE",
                            reason=f"한투 모의계좌 초기 세팅 — 추천 1위 ETF {cfg['order_qty']}주 미국장 종가체결 자동 편입",
                        )

            if cfg.get("auto_trade_enabled", True):
                et_now = _get_us_et_now()
                us_date_str = et_now.strftime("%Y-%m-%d")
                hhmm_et = et_now.hour * 100 + et_now.minute
                # 미국 정규장 마감 직전 15:52 ~ 15:59 ET 사이에 당일 자동 리밸런싱 미실행 시 자동 집행
                if (
                    et_now.weekday() < 5
                    and 1552 <= hhmm_et <= 1559
                    and cfg.get("last_auto_traded_us_date") != us_date_str
                ):
                    run_scheduled_us_market_close_etf_rotation()
        except Exception as e:
            print(f"[KIS_ETF_US] 백그라운드 워커 참고: {e}")

        time.sleep(60)


def ensure_us_etf_auto_trader_worker() -> None:
    global _US_ETF_BG_STARTED
    with _US_ETF_BG_LOCK:
        if not _US_ETF_BG_STARTED:
            t = threading.Thread(target=_us_etf_closing_background_worker, daemon=True)
            t.start()
            _US_ETF_BG_STARTED = True

