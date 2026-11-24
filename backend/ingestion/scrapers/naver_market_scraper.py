import threading
import time
import re
import requests
from bs4 import BeautifulSoup
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

from database import insert_stock, insert_financials, get_db_connection
from ingestion.scrapers.naver_scraper import get_naver_fundamentals

# Global state to track progress
scan_status = {
    "is_running": False,
    "total": 0,
    "current": 0,
    "current_ticker": "",
    "current_name": "",
    "errors": 0,
    "message": "Not started"
}

EXCLUDE_PATTERNS = [
    r"KODEX", r"TIGER", r"KBSTAR", r"ACE", r"SOL", r"ARIRANG", r"HANARO", r"TIMEFOLIO", r"WOORI",
    r"PLUS", r"FOCUS", r"TRUST", r"ETF", r"ETN", r"ELW", r"스팩", r"SPAC", r"리츠", r"REIT",
    r"채권", r"선물", r"인버스", r"레버리지", r"액티브", r"펀드", r"투자신탁"
]

def _is_excluded_name(name: str) -> bool:
    for pat in EXCLUDE_PATTERNS:
        if re.search(pat, name, re.IGNORECASE):
            return True
    return False

def get_market_sum_tickers(sosok=0, check_running=True):
    """
    sosok = 0 (KOSPI), 1 (KOSDAQ)
    네이버 모바일 시가총액 JSON API (https://m.stock.naver.com/api/stocks/marketValue/{KOSPI|KOSDAQ})를 사용하여
    PC 웹페이지(sise_market_sum.naver) 구조 변경에도 100% 안정적으로 전 상장 종목 리스트를 수집합니다.
    """
    global scan_status
    market_name = "KOSPI" if sosok == 0 else "KOSDAQ"
    tickers = []
    page = 1
    page_size = 100
    headers = {"User-Agent": "Mozilla/5.0"}

    while True:
        if check_running and not scan_status.get("is_running", True):
            break
        scan_status["message"] = f"네이버 {market_name} 상장종목 리스트 수집 중... (Page {page})"
        url = f"https://m.stock.naver.com/api/stocks/marketValue/{market_name}?page={page}&pageSize={page_size}"
        try:
            res = requests.get(url, headers=headers, timeout=8)
            if res.status_code != 200:
                break
            js = res.json()
            stocks = js.get("stocks") or []
            if not stocks:
                break

            added = 0
            for item in stocks:
                code = str(item.get("itemCode") or "").strip()
                name = str(item.get("stockName") or "").strip()
                if not re.match(r"^\d{6}$", code) or not name:
                    continue
                if _is_excluded_name(name):
                    continue
                tickers.append({
                    "ticker": code,
                    "name": name,
                    "market": "코스피" if sosok == 0 else "코스닥",
                    "close_price": str(item.get("closePrice") or "0").replace(",", ""),
                    "market_value_eok": str(item.get("marketValue") or "0").replace(",", ""),
                })
                added += 1

            if len(stocks) < page_size or page >= 30:
                break
            page += 1
            time.sleep(0.1)
        except Exception as e:
            print(f"Error fetching mobile marketValue page {page} for {market_name}: {e}")
            break

    return tickers

def safe_float(val_str):
    try:
        if not val_str or val_str.strip() == '-' or val_str.strip() == 'N/A':
            return 0.0
        return float(val_str.strip().replace(',', ''))
    except:
        return 0.0

def fetch_stock_details(ticker, fallback_price=0.0, fallback_mcap_eok=0.0):
    """
    네이버 모바일 API (integration, finance/annual, finance/quarter) 및 WiseReport 기업개요를 결합하여
    현재가, 시가총액, 상장주식수, 기업개요(description), 연간/분기 재무제표(2026년 3분기까지 포함) 및
    ROE, PBR, PER, EPS, BPS를 고속으로 수집·계산합니다.
    """
    nv = get_naver_fundamentals(ticker)
    price = float(nv.get("current_price") or fallback_price or 0.0)
    mcap = float(nv.get("market_cap") or (float(fallback_mcap_eok or 0.0) * 100_000_000.0) or 0.0)
    shares = float(nv.get("shares") or (int(round(mcap / price)) if (mcap > 0 and price > 0) else 0))
    par_val = float(nv.get("par_value") or 500.0)

    # WiseReport 3줄 핵심 기업개요 수집
    desc = ""
    try:
        wr_url = f"https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={ticker}"
        wr_res = requests.get(wr_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=4)
        if wr_res.status_code == 200:
            wr_soup = BeautifulSoup(wr_res.text, "html.parser")
            dots = [li.get_text(" ", strip=True) for li in wr_soup.select("li.dot_cmp") if li.get_text(strip=True)]
            if dots:
                desc = "• " + "\n• ".join(dots)
    except Exception:
        pass

    fins = []
    for af in (nv.get("financials_annual") or []):
        fins.append({
            "period": str(af.get("period", "")).replace("(E)", "").strip(),
            "operating_profit": float(af.get("operating_profit") or 0.0),
            "net_profit": float(af.get("net_profit") or 0.0),
            "equity": float(af.get("equity") or 0.0),
            "total_debt": 0.0,
            "eps": float(af.get("eps") or 0.0),
            "bps": float(af.get("bps") or 0.0),
            "per": float(af.get("per") or 0.0),
            "pbr": float(af.get("pbr") or 0.0),
            "roe": float(af.get("roe") or 0.0),
        })
    for qf in (nv.get("financials_quarterly") or []):
        p = str(qf.get("period", "")).replace("(E)", "").replace(".", "").strip()
        if len(p) == 6 and p.isdigit():
            mm_to_q = {"03": "1Q", "06": "2Q", "09": "3Q", "12": "4Q"}
            p = f"{p[:4]}.{mm_to_q.get(p[4:6], '4Q')}"
        fins.append({
            "period": p,
            "operating_profit": float(qf.get("operating_profit") or 0.0),
            "net_profit": float(qf.get("net_profit") or 0.0),
            "equity": float(qf.get("equity") or 0.0),
            "total_debt": 0.0,
            "eps": float(qf.get("eps") or 0.0),
            "bps": float(qf.get("bps") or 0.0),
            "per": float(qf.get("per") or 0.0),
            "pbr": float(qf.get("pbr") or 0.0),
            "roe": float(qf.get("roe") or 0.0),
            "raw_ym": str(qf.get("raw_ym") or ""),
        })

    latest_eq = fins[-1]["equity"] if fins and fins[-1].get("equity") else (shares * par_val)
    return {
        "price": price,
        "market_cap": mcap,
        "volume": 0.0,
        "foreign_net_buy": 0.0,
        "par_value": par_val,
        "capital": latest_eq,
        "dividend": 0.0,
        "outstanding_shares": shares,
        "description": desc,
        "financials": fins,
        "quarterly": nv.get("financials_quarterly") or [],
    }


def _process_single_market_stock(stock: dict) -> bool:
    tk = stock["ticker"]
    nm = stock["name"]
    mkt = stock.get("market", "코스피")
    fb_p = safe_float(stock.get("close_price", "0"))
    fb_mc = safe_float(stock.get("market_value_eok", "0"))

    details = fetch_stock_details(tk, fallback_price=fb_p, fallback_mcap_eok=fb_mc)

    insert_stock(
        ticker=tk,
        name=nm,
        price=details["price"],
        outstanding_shares=details["outstanding_shares"],
        par_value=details["par_value"],
        capital=details["capital"],
        market_cap=details["market_cap"],
        volume=details["volume"],
        foreign_net_buy=details["foreign_net_buy"],
        dividend=details["dividend"],
        description=details["description"],
    )

    conn = get_db_connection()
    c = conn.cursor()
    c.execute("DELETE FROM financials WHERE ticker = ?", (tk,))
    for fin in details["financials"]:
        c.execute(
            '''
            INSERT INTO financials (ticker, period, operating_profit, net_profit, equity, total_debt, eps, bps, per, pbr, roe)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                tk,
                fin["period"],
                fin["operating_profit"],
                fin["net_profit"],
                fin["equity"],
                fin["total_debt"],
                fin["eps"],
                fin["bps"],
                fin["per"],
                fin["pbr"],
                fin["roe"],
            ),
        )

    # 최신 분기(2026.2Q / 2026.3Q 등) ROE, PBR, PER을 tetris_roe_pbr_screener 테이블에도 동기화
    q_list = [q for q in (details.get("quarterly") or []) if q.get("roe") is not None or q.get("pbr") is not None]
    if len(q_list) >= 2:
        cur_q = q_list[-1]
        prev_q = q_list[-2]
        cur_roe = float(cur_q.get("roe") or 0.0)
        prev_roe = float(prev_q.get("roe") or cur_roe)
        cur_pbr = float(cur_q.get("pbr") or 0.0)
        prev_pbr = float(prev_q.get("pbr") or cur_pbr)
        cur_per = float(cur_q.get("per") or 0.0)
        prev_per = float(prev_q.get("per") or cur_per)
        if cur_pbr > 0:
            qoq_roe_d = round(cur_roe - prev_roe, 2)
            qoq_pbr_d = round(cur_pbr - prev_pbr, 2)
            qoq_pbr_g = round(((cur_pbr - prev_pbr) / prev_pbr * 100.0) if prev_pbr > 0 else 0.0, 2)
            roe_pbr_r = round(cur_roe / cur_pbr, 2) if cur_pbr >= 0.05 else 0.0
            q_lbl = f"{prev_q.get('period','직전분기')} → {cur_q.get('period','최신분기')}"
            c.execute(
                '''
                UPDATE tetris_roe_pbr_screener
                SET name = ?, market = ?, price = ?, market_cap_eok = ?,
                    roe = ?, prev_q_roe = ?, qoq_roe_diff = ?,
                    pbr = ?, prev_q_pbr = ?, qoq_pbr_diff = ?, qoq_pbr_growth_pct = ?,
                    per = ?, prev_q_per = ?, bps = ?, eps = ?, roe_pbr_ratio = ?, quarter_label = ?
                WHERE ticker = ?
                ''',
                (
                    nm, mkt, round(details["price"], 0), round(details["market_cap"] / 1e8, 1),
                    round(cur_roe, 2), round(prev_roe, 2), qoq_roe_d,
                    round(cur_pbr, 2), round(prev_pbr, 2), qoq_pbr_d, qoq_pbr_g,
                    round(cur_per, 2), round(prev_per, 2),
                    round(float(cur_q.get("bps") or 0), 0), round(float(cur_q.get("eps") or 0), 0),
                    roe_pbr_r, q_lbl, tk
                ),
            )
    conn.commit()
    conn.close()
    return True


def scan_market_task():
    global scan_status
    scan_status["is_running"] = True
    scan_status["message"] = "네이버 모바일 API에서 KOSPI & KOSDAQ 전 종목 리스트 수집 중..."
    scan_status["errors"] = 0
    scan_status["current"] = 0
    scan_status["total"] = 0

    try:
        kospi = get_market_sum_tickers(0)
        kosdaq = get_market_sum_tickers(1)
        all_tickers = kospi + kosdaq

        scan_status["total"] = len(all_tickers)
        scan_status["current"] = 0
        scan_status["message"] = f"총 {len(all_tickers)}개 상장종목 실시간 시세·재무·3분기 실적 고속 수집 시작..."

        with ThreadPoolExecutor(max_workers=6) as executor:
            futures = {executor.submit(_process_single_market_stock, st): st for st in all_tickers}
            for fut in as_completed(futures):
                if not scan_status["is_running"]:
                    scan_status["message"] = "사용자에 의해 중지됨."
                    break
                st = futures[fut]
                scan_status["current"] += 1
                scan_status["current_ticker"] = st["ticker"]
                scan_status["current_name"] = st["name"]
                try:
                    fut.result()
                except Exception as e:
                    print(f"Error scanning {st['ticker']} {st['name']}: {e}")
                    scan_status["errors"] += 1
                if scan_status["current"] % 5 == 0 or scan_status["current"] == scan_status["total"]:
                    scan_status["message"] = f"네이버+3분기 재무 스캔 중: {scan_status['current']}/{scan_status['total']} ({st['name']} {st['ticker']})"

        if scan_status["is_running"]:
            scan_status["message"] = f"네이버 마켓 & 분기 재무 스캔 완료! ({scan_status['current']}/{scan_status['total']}개 종목 DB 저장)"

    except Exception as e:
        scan_status["message"] = f"Fatal error: {e}"
    finally:
        scan_status["is_running"] = False

def start_scan():
    if scan_status["is_running"]:
        return False, "Already running"
    
    thread = threading.Thread(target=scan_market_task, daemon=True)
    thread.start()
    return True, "Started"

def stop_scan():
    if not scan_status["is_running"]:
        return False, "Not running"
    scan_status["is_running"] = False
    return True, "Stopped"

def get_scan_status():
    return scan_status
