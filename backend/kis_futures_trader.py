import datetime
import json
import os
import sqlite3
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_BASE_DIR = os.path.dirname(_BACKEND_DIR)
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))

from futures_config import load_simulation_config, save_simulation_config
from kis_api import KISApiClient

DB_PATH = os.path.join(_BASE_DIR, "data", "futures_simulation.db")

_SHARED_KIS_CLIENT: Optional[KISApiClient] = None


def get_second_thursday_date(year: int, month: int) -> datetime.date:
    first_day = datetime.date(year, month, 1)
    offset = (3 - first_day.weekday()) % 7
    return first_day + datetime.timedelta(days=offset + 7)


def get_active_kospi200_futures_code(ref_date: Optional[datetime.date] = None) -> str:
    """
    기준일(ref_date) 기준 최근월물 KOSPI200 선물 KRX 표준 단축코드(예: 2026년 12월물 -> A01612)를 자동 산출합니다.
    - 만기월: 3, 6, 9, 12월 (각 월 두 번째 목요일이 최종거래일)
    - KRX 신 표준단축코드 체계: 'A01' + 연도끝자리(예: 2026 -> '6') + 월2자리('03','06','09','12')
    """
    if ref_date is None:
        ref_date = (datetime.datetime.utcnow() + datetime.timedelta(hours=9)).date()

    quarter_months = [3, 6, 9, 12]
    target_year = ref_date.year
    target_month = 12

    found = False
    for qm in quarter_months:
        if ref_date.month < qm:
            target_month = qm
            found = True
            break
        elif ref_date.month == qm:
            exp_dt = get_second_thursday_date(ref_date.year, qm)
            if ref_date <= exp_dt:
                target_month = qm
                found = True
                break

    if not found:
        target_year += 1
        target_month = 3

    yr_digit = str(target_year)[-1]
    return f"A01{yr_digit}{target_month:02d}"


def _get_shared_kis_client(is_mock: bool = True) -> Optional[KISApiClient]:
    global _SHARED_KIS_CLIENT
    app_key = os.environ.get("KIS_API_KEY", "").strip()
    app_secret = os.environ.get("KIS_APP_SECRET", "").strip()
    acc_no = os.environ.get("KIS_ACCOUNT_NO", "00000000-01").strip()
    if not app_key or not app_secret:
        return None
    if _SHARED_KIS_CLIENT is None or _SHARED_KIS_CLIENT.is_mock != is_mock:
        try:
            _SHARED_KIS_CLIENT = KISApiClient(app_key, app_secret, acc_no, is_mock=is_mock)
        except Exception as e:
            print(f"[KISFutures] KISApiClient 초기화 오류: {e}")
            return None
    return _SHARED_KIS_CLIENT


def fetch_kis_realtime_futures_and_index() -> Dict[str, Any]:
    """
    한국투자증권(KIS) Open API를 통해 지연 없는(0초) 실시간 KOSPI200 선물(FHMIF10000000) 및
    KOSPI200 현물지수(FHPUP02100000) 시세·등락률·미결제약정·베이시스를 동시에 수집합니다.
    """
    client = _get_shared_kis_client(is_mock=True)
    if client is None:
        return {"success": False, "error": "KIS API 키 미설정"}

    now_kst = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
    fut_code = get_active_kospi200_futures_code(now_kst.date())
    out: Dict[str, Any] = {
        "success": False,
        "source": "KIS_OPEN_API_REALTIME",
        "fut_code": fut_code,
        "trading_date": now_kst.strftime("%Y-%m-%d"),
    }

    # 1. 선물옵션 시세 조회 (FHMIF10000000) -> output1(선물), output3(KOSPI200 현물)
    try:
        client.rate_limiter.wait()
        url_fut = f"{client.base_url}/uapi/domestic-futureoption/v1/quotations/inquire-price"
        res_fut = requests.get(
            url_fut,
            headers=client.get_headers("FHMIF10000000"),
            params={"FID_COND_MRKT_DIV_CODE": "F", "FID_INPUT_ISCD": fut_code},
            timeout=3.5,
        )
        if res_fut.status_code == 200:
            js = res_fut.json()
            o1 = js.get("output1") or {}
            o3 = js.get("output3") or {}
            if o1 and float(o1.get("futs_prpr") or 0) > 0:
                fut_close = float(o1.get("futs_prpr") or 0.0)
                fut_open = float(o1.get("futs_oprc") or fut_close)
                fut_high = float(o1.get("futs_hgpr") or max(fut_open, fut_close))
                fut_low = float(o1.get("futs_lwpr") or min(fut_open, fut_close))
                prev_fut_close = float(o1.get("futs_prdy_clpr") or o1.get("futs_sdpr") or fut_close)

                sign_f = str(o1.get("prdy_vrss_sign", "3"))
                raw_diff_f = abs(float(o1.get("futs_prdy_vrss") or (fut_close - prev_fut_close)))
                fut_change_pt = -raw_diff_f if sign_f in ("4", "5") else raw_diff_f
                fut_change_pct = float(o1.get("futs_prdy_ctrt") or 0.0)
                if sign_f in ("4", "5") and fut_change_pct > 0:
                    fut_change_pct = -fut_change_pct

                oi_qty = float(o1.get("hts_otst_stpl_qty") or 0.0)
                oi_icdc = float(o1.get("otst_stpl_qty_icdc") or 0.0)

                out.update(
                    {
                        "success": True,
                        "fut_name": o1.get("hts_kor_isnm", f"F {fut_code}"),
                        "fut_open": round(fut_open, 2),
                        "fut_high": round(fut_high, 2),
                        "fut_low": round(fut_low, 2),
                        "fut_close": round(fut_close, 2),
                        "prev_fut_close": round(prev_fut_close, 2),
                        "fut_change_pt": round(fut_change_pt, 2),
                        "fut_change_pct": round(fut_change_pct, 2),
                        "fut_volume": float(o1.get("acml_vol") or 0.0),
                        "open_interest": round(oi_qty, 0),
                        "oi_change": round(oi_icdc, 0),
                        "mrkt_basis": round(float(o1.get("mrkt_basis") or 0.0), 2),
                        "theo_price": round(float(o1.get("hts_thpr") or fut_close), 2),
                    }
                )

            if o3 and float(o3.get("bstp_nmix_prpr") or 0) > 0:
                k_close = float(o3.get("bstp_nmix_prpr") or 0.0)
                sign_k = str(o3.get("prdy_vrss_sign", "3"))
                raw_diff_k = abs(float(o3.get("bstp_nmix_prdy_vrss") or 0.0))
                k_change_pt = -raw_diff_k if sign_k in ("4", "5") else raw_diff_k
                k_change_pct = float(o3.get("bstp_nmix_prdy_ctrt") or 0.0)
                if sign_k in ("4", "5") and k_change_pct > 0:
                    k_change_pct = -k_change_pct
                prev_k_close = round(k_close - k_change_pt, 2)
                out.update(
                    {
                        "k200_close": round(k_close, 2),
                        "prev_k200_close": prev_k_close,
                        "k200_change_pt": round(k_change_pt, 2),
                        "k200_change_pct": round(k_change_pct, 2),
                    }
                )
    except Exception as e:
        print(f"[KISFutures] 선물 실시간 시세 조회 예외: {e}")

    # 2. 국내업종 현재지수 조회 (FHPUP02100000, KOSPI200='2001') -> 시가/고가/저가/거래량 정밀 보강
    try:
        client.rate_limiter.wait()
        url_idx = f"{client.base_url}/uapi/domestic-stock/v1/quotations/inquire-index-price"
        res_idx = requests.get(
            url_idx,
            headers=client.get_headers("FHPUP02100000"),
            params={"FID_COND_MRKT_DIV_CODE": "U", "FID_INPUT_ISCD": "2001"},
            timeout=3.5,
        )
        if res_idx.status_code == 200:
            js_i = res_idx.json()
            oi = js_i.get("output") or {}
            if oi and float(oi.get("bstp_nmix_prpr") or 0) > 0:
                k_c = float(oi.get("bstp_nmix_prpr") or 0.0)
                k_o = float(oi.get("bstp_nmix_oprc") or k_c)
                k_h = float(oi.get("bstp_nmix_hgpr") or max(k_o, k_c))
                k_l = float(oi.get("bstp_nmix_lwpr") or min(k_o, k_c))
                k_v = float(oi.get("acml_vol") or 100000.0)
                sign_k = str(oi.get("prdy_vrss_sign", "3"))
                raw_diff_k = abs(float(oi.get("bstp_nmix_prdy_vrss") or 0.0))
                k_diff = -raw_diff_k if sign_k in ("4", "5") else raw_diff_k
                k_pct = float(oi.get("bstp_nmix_prdy_ctrt") or 0.0)
                if sign_k in ("4", "5") and k_pct > 0:
                    k_pct = -k_pct
                out.update(
                    {
                        "k200_open": round(k_o, 2),
                        "k200_high": round(k_h, 2),
                        "k200_low": round(k_l, 2),
                        "k200_close": round(k_c, 2),
                        "prev_k200_close": round(k_c - k_diff, 2),
                        "k200_change_pt": round(k_diff, 2),
                        "k200_change_pct": round(k_pct, 2),
                        "k200_volume": round(k_v, 0),
                    }
                )
    except Exception as e:
        print(f"[KISFutures] KOSPI200 업종지수 조회 예외: {e}")

    return out


def _init_futures_order_tables() -> None:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    c = conn.cursor()
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS futures_order_execution_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            executed_at_kst TEXT,
            trading_date TEXT,
            mode TEXT,
            account_no TEXT,
            fut_code TEXT,
            side TEXT,
            qty INTEGER,
            ord_dvsn TEXT,
            exec_price REAL,
            prev_contracts INTEGER,
            target_contracts INTEGER,
            broker_status TEXT,
            broker_order_no TEXT,
            broker_msg TEXT,
            reason TEXT
        )
        """
    )
    conn.commit()
    conn.close()


def get_kis_futures_trading_config() -> Dict[str, Any]:
    """동적 설정 레지스트리(futures_simulation_config.json) 및 .env에서 KIS 선물 모의/실전 설정을 로드합니다."""
    cfg = load_simulation_config()
    k_cfg = cfg.get("kis_futures_trading", {})

    env_acc = os.environ.get("KIS_FUTURES_ACCOUNT_NO") or os.environ.get("KIS_ACCOUNT_NO", "44790516-03")
    default_cano = env_acc.split("-")[0] if "-" in env_acc else env_acc[:8]

    mode = os.environ.get("KIS_FUTURES_MODE") or k_cfg.get("mode", "PAPER")
    cano = k_cfg.get("cano") or default_cano
    acnt_prdt_cd = k_cfg.get("acnt_prdt_cd") or "03"
    max_contracts_cap = int(k_cfg.get("max_contracts_cap", 10))
    auto_execute_1535 = bool(k_cfg.get("auto_execute_at_1535", False))
    default_ord_dvsn = str(k_cfg.get("default_ord_dvsn", "02"))  # 02: 시장가(동시호가), 01: 지정가, 03: 조건부지정가

    return {
        "mode": mode.upper(),  # "PAPER" (모의계좌) or "LIVE" (실전계좌)
        "is_mock": mode.upper() != "LIVE",
        "cano": cano,
        "acnt_prdt_cd": acnt_prdt_cd,
        "account_display": f"{cano}-{acnt_prdt_cd}",
        "max_contracts_cap": max_contracts_cap,
        "auto_execute_at_1535": auto_execute_1535,
        "default_ord_dvsn": default_ord_dvsn,
        "active_fut_code": get_active_kospi200_futures_code(),
    }


def update_kis_futures_trading_config(updates: Dict[str, Any]) -> Dict[str, Any]:
    cfg = load_simulation_config()
    cur = cfg.get("kis_futures_trading", {})
    if "mode" in updates and updates["mode"] in ("PAPER", "LIVE"):
        cur["mode"] = updates["mode"]
    if "cano" in updates and str(updates["cano"]).strip():
        cur["cano"] = str(updates["cano"]).strip()[:8]
    if "acnt_prdt_cd" in updates and str(updates["acnt_prdt_cd"]).strip():
        cur["acnt_prdt_cd"] = str(updates["acnt_prdt_cd"]).strip()[:2]
    if "max_contracts_cap" in updates:
        cur["max_contracts_cap"] = max(1, min(100, int(updates["max_contracts_cap"])))
    if "auto_execute_at_1535" in updates:
        cur["auto_execute_at_1535"] = bool(updates["auto_execute_at_1535"])
    if "default_ord_dvsn" in updates:
        cur["default_ord_dvsn"] = str(updates["default_ord_dvsn"])

    cfg["kis_futures_trading"] = cur
    save_simulation_config(cfg)
    return get_kis_futures_trading_config()


def inquire_kis_futures_balance() -> Dict[str, Any]:
    """
    KIS 선물옵션 잔고현황(모의: VTFO6118R / 실전: TTFO6118R) 및 최근 주문 실행 로그를 조회합니다.
    """
    _init_futures_order_tables()
    t_cfg = get_kis_futures_trading_config()
    is_mock = t_cfg["is_mock"]
    client = _get_shared_kis_client(is_mock=is_mock)

    positions: List[Dict[str, Any]] = []
    net_contracts = 0
    deposit_krw = 0
    eval_pnl_krw = 0
    broker_connected = False
    broker_code = ""
    broker_message = ""

    if client is not None:
        tr_id = "VTFO6118R" if is_mock else "TTFO6118R"
        url = f"{client.base_url}/uapi/domestic-futureoption/v1/trading/inquire-balance"
        params = {
            "CANO": t_cfg["cano"],
            "ACNT_PRDT_CD": t_cfg["acnt_prdt_cd"],
            "MGNA_DVSN": "01",
            "EXCC_STAT_CD": "1",
            "CTX_AREA_FK200": "",
            "CTX_AREA_NK200": "",
        }
        try:
            client.rate_limiter.wait()
            res = requests.get(url, headers=client.get_headers(tr_id), params=params, timeout=4.0)
            if res.status_code == 200:
                js = res.json()
                broker_code = str(js.get("msg_cd", ""))
                broker_message = str(js.get("msg1", "")).strip()
                if js.get("rt_cd") == "0":
                    broker_connected = True
                    o1 = js.get("output1") or []
                    o2 = js.get("output2") or {}
                    if isinstance(o2, dict):
                        deposit_krw = int(float(o2.get("dncl_amt") or o2.get("tot_dncl_amt") or 0))
                        eval_pnl_krw = int(float(o2.get("evlu_pfls_smtl_amt") or 0))
                    for item in o1:
                        pdno = item.get("shtn_pdno") or item.get("pdno") or ""
                        qty = int(float(item.get("cblc_qty") or item.get("ord_psbl_qty") or 0))
                        if qty <= 0:
                            continue
                        side_cd = str(item.get("sll_buy_dvsn_cd", ""))
                        side_name = str(item.get("sll_buy_dvsn_name", ""))
                        is_short = side_cd == "01" or "매도" in side_name
                        signed_qty = -qty if is_short else qty
                        if pdno.startswith("A01") or pdno.startswith("101"):
                            net_contracts += signed_qty
                        positions.append(
                            {
                                "fut_code": pdno,
                                "name": item.get("prdt_name", pdno),
                                "side": "SHORT(매도)" if is_short else "LONG(매수)",
                                "qty": qty,
                                "signed_qty": signed_qty,
                                "avg_price": float(item.get("ccld_avg_unpr1") or item.get("pchs_avg_pric") or 0.0),
                                "curr_price": float(item.get("prpr") or 0.0),
                                "eval_pnl_krw": int(float(item.get("evlu_pfls_amt") or 0)),
                            }
                        )
        except Exception as e:
            broker_message = f"KIS 잔고조회 통신 예외: {e}"

    # 로컬 주문 실행 원장 조회 (모의계좌 상품코드 03 개설 전에도 시뮬레이션 주문 체결 내역 추적 가능)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM futures_order_execution_log ORDER BY id DESC LIMIT 15")
    order_logs = [dict(r) for r in c.fetchall()]
    conn.close()

    virtual_net_contracts = order_logs[0]["target_contracts"] if order_logs else 0

    return {
        "config": t_cfg,
        "broker_connected": broker_connected,
        "broker_code": broker_code,
        "broker_message": broker_message,
        "deposit_krw": deposit_krw,
        "eval_pnl_krw": eval_pnl_krw,
        "kis_net_contracts": net_contracts,
        "virtual_net_contracts": virtual_net_contracts,
        "effective_net_contracts": net_contracts if broker_connected else virtual_net_contracts,
        "positions": positions,
        "recent_orders": order_logs,
        "setup_guide": {
            "tr_id_order": "VTFO0011U (모의) / TTFO0011U (실전)",
            "tr_id_balance": "VTFO6118R (모의) / TTFO6118R (실전)",
            "account_product_code": "03 (선물옵션 계좌 상품코드)",
            "how_to_enable_mock": (
                "한국투자증권 홈페이지/앱 → [모의투자] → [국내선물옵션 상시모의투자 신청] 완료 후 "
                "발급된 8자리 계좌번호와 상품코드 '03'을 설정하시면 KIS 모의투자 서버(VTFO0011U)로 실제 주문이 전송됩니다. "
                "선물옵션 모의계좌 개설 전에도 아래 [주문 실행]을 누르시면 내장 모의원장에 실시간 선물 현재가로 즉시 가상 체결 기록됩니다."
            ),
        },
    }


def execute_kis_futures_order(
    order_delta_contracts: int,
    prev_contracts: int = 0,
    target_contracts: int = 0,
    ord_dvsn: Optional[str] = None,
    limit_price: float = 0.0,
    reason: str = "Step 5 15:35~15:45 동시호가 포지션 조정 주문",
) -> Dict[str, Any]:
    """
    KIS 선물옵션 주문 API(모의: VTFO0011U / 실전: TTFO0011U)를 호출하여 선물 매수/매도 주문을 집행합니다.
    - order_delta_contracts > 0: 매수 주문 (SLL_BUY_DVSN_CD = "02")
    - order_delta_contracts < 0: 매도 주문 (SLL_BUY_DVSN_CD = "01")
    """
    _init_futures_order_tables()
    t_cfg = get_kis_futures_trading_config()
    now_kst = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
    now_str = now_kst.strftime("%Y-%m-%d %H:%M:%S")
    today_str = now_kst.strftime("%Y-%m-%d")

    if order_delta_contracts == 0:
        return {
            "success": True,
            "skipped": True,
            "message": "주문 수량(Delta)이 0계약이므로 추가 매매 없이 기존 포지션을 유지합니다.",
        }

    cap = t_cfg["max_contracts_cap"]
    if abs(target_contracts) > cap:
        return {
            "success": False,
            "error": f"목표 계약수({target_contracts}계약)가 안전 한도(최대 ±{cap}계약)를 초과하여 주문이 차단되었습니다. 설정에서 최대 계약수 한도를 조정해주세요.",
        }

    is_buy = order_delta_contracts > 0
    qty = abs(int(order_delta_contracts))
    side_label = "BUY(매수)" if is_buy else "SELL(매도)"
    sll_buy_dvsn_cd = "02" if is_buy else "01"
    use_ord_dvsn = ord_dvsn or t_cfg["default_ord_dvsn"] or "02"  # "02": 시장가(동시호가), "01": 지정가
    fut_code = t_cfg["active_fut_code"]

    # 현재 실시간 선물 가격 확보
    rt = fetch_kis_realtime_futures_and_index()
    exec_price = float(rt.get("fut_close") or limit_price or 0.0)
    unit_price_str = "0" if use_ord_dvsn == "02" else str(round(limit_price if limit_price > 0 else exec_price, 2))

    is_mock = t_cfg["is_mock"]
    client = _get_shared_kis_client(is_mock=is_mock)
    tr_id = "VTFO0011U" if is_mock else "TTFO0011U"

    broker_status = "VIRTUAL_PAPER_FILLED"
    broker_order_no = f"SIM-{now_kst.strftime('%H%M%S')}"
    broker_msg = "내장 선물 모의원장 가상 체결 완료 (실시간 KIS 선물가 기준)"

    if client is not None:
        url = f"{client.base_url}/uapi/domestic-futureoption/v1/trading/order"
        body = {
            "ORD_PRCS_DVSN_CD": "02",
            "CANO": t_cfg["cano"],
            "ACNT_PRDT_CD": t_cfg["acnt_prdt_cd"],
            "SHTN_PDNO": fut_code,
            "ORD_DVSN_CD": use_ord_dvsn,
            "SLL_BUY_DVSN_CD": sll_buy_dvsn_cd,
            "ORD_QTY": str(qty),
            "UNIT_PRICE": unit_price_str,
            "NMPR_TYPE_CD": "",
            "KRX_NMPR_CNDT_CD": "",
            "CTAC_TLNO": "",
            "FUOP_ITEM_DVSN_CD": "",
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
                    broker_msg = f"KIS {'모의' if is_mock else '실전'}서버 주문 전송 성공 ({js.get('msg1', '')})"
                else:
                    msg_cd = js.get("msg_cd", "")
                    msg1 = js.get("msg1", "")
                    if not is_mock:
                        # 실전투자 모드에서는 브로커 에러 시 가상 체결로 넘기지 않고 즉시 에러 반환
                        return {
                            "success": False,
                            "error": f"[KIS 실전주문 거부: {msg_cd}] {msg1}",
                        }
                    broker_status = f"VIRTUAL_FILLED ({msg_cd})"
                    broker_msg = f"KIS 모의계좌({t_cfg['account_display']}) 응답[{msg1}] → 내장 모의원장에 실시간 가격({exec_price}pt)으로 가상 체결 기록됨"
        except Exception as e:
            if not is_mock:
                return {"success": False, "error": f"KIS 실전주문 통신 오류: {e}"}
            broker_msg = f"내장 모의원장 체결 기록 ({e})"

    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    c = conn.cursor()
    c.execute(
        """
        INSERT INTO futures_order_execution_log (
            executed_at_kst, trading_date, mode, account_no, fut_code, side, qty,
            ord_dvsn, exec_price, prev_contracts, target_contracts,
            broker_status, broker_order_no, broker_msg, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            now_str,
            today_str,
            t_cfg["mode"],
            t_cfg["account_display"],
            fut_code,
            side_label,
            qty,
            use_ord_dvsn,
            exec_price,
            prev_contracts,
            target_contracts,
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
        "executed_at_kst": now_str,
        "mode": t_cfg["mode"],
        "account_no": t_cfg["account_display"],
        "fut_code": fut_code,
        "side": side_label,
        "qty": qty,
        "exec_price": exec_price,
        "prev_contracts": prev_contracts,
        "target_contracts": target_contracts,
        "broker_status": broker_status,
        "broker_order_no": broker_order_no,
        "broker_msg": broker_msg,
    }
