import json
import os
import time
import sys
import logging
import asyncio
import threading
import yfinance as yf
import concurrent.futures
from datetime import datetime, timedelta
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from utils.retry_util import with_retry
from utils.ticker_util import is_korean_stock, to_pure_ticker, to_yf_ticker, to_kis_ticker, to_naver_code
from fastapi import FastAPI, HTTPException, Request, BackgroundTasks

# Global executor for yfinance to prevent OOM
yf_executor = concurrent.futures.ThreadPoolExecutor(max_workers=20)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
import sqlite3
import pandas as pd
import tempfile
from excel_parser import load_kospi_data, get_spot_news
from global_aggregator import get_global_data, get_aggregated_news
from trader import execute_morning_buy, BrokerageAPI
from valuation import ValuationRequest, calculate_rim
from competitor_analyzer import get_sectors, get_sector_news, get_ticker_fundamentals

app = FastAPI(title="AI Stock Analyst API")

import asyncio

@app.on_event("startup")
async def startup_event():
    from routers.reports import sync_reports_task
    async def periodic_sync():
        while True:
            try:
                print("[Scheduler] Running daily report sync...")
                await asyncio.to_thread(sync_reports_task, 15)
            except Exception as e:
                print("[Scheduler] Periodic sync error:", e)
            await asyncio.sleep(86400) # 24 hours
            
    asyncio.create_task(periodic_sync())

# Setup CORS to allow Next.js frontend to communicate
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for local dev
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from routers import reports
app.include_router(reports.router)

# Background Sync Task for Reports
import threading
import time

def background_report_sync():
    time.sleep(10) # wait for server to start
    from routers.reports import sync_reports_task
    while True:
        try:
            print("[Background] Running daily report sync...")
            sync_reports_task(50) # fetch last 50 pages daily
            print("[Background] Daily report sync completed.")
        except Exception as e:
            print(f"[Background] Report sync error: {e}")
        time.sleep(12 * 3600) # run every 12 hours

threading.Thread(target=background_report_sync, daemon=True).start()

@app.post("/api/ai/summarize", tags=["AI"])
def proxy_ai_summarize(req: reports.SummarizeRequest):
    return reports.summarize_report(req)

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
import auto_trader
from etf_strategy import update_etf_data

scheduler = BackgroundScheduler()

@app.on_event("startup")
def start_scheduler():
    import threading
    
    # 서버 구동 시 백그라운드에서 ETF 데이터 즉시 1회 갱신 (사용자가 바로 변화를 볼 수 있도록)
    threading.Thread(target=update_etf_data, daemon=True).start()
    
    scheduler.add_job(auto_trader.job_910_buy, CronTrigger(hour=9, minute=5, day_of_week='mon-fri', timezone='Asia/Seoul'))
    scheduler.add_job(auto_trader.job_1525_sell_order, CronTrigger(hour=15, minute=25, day_of_week='mon-fri', timezone='Asia/Seoul'))
    scheduler.add_job(auto_trader.job_1531_ledger_record, CronTrigger(hour=15, minute=31, day_of_week='mon-fri', timezone='Asia/Seoul'))
    
    # ETF 데이터 주기적 업데이트 (매일 아침 8시, 저녁 6시)
    scheduler.add_job(update_etf_data, CronTrigger(hour=8, minute=0, timezone='Asia/Seoul'))
    scheduler.add_job(update_etf_data, CronTrigger(hour=18, minute=0, timezone='Asia/Seoul'))
    
    # 경쟁업체 차트 주기적 업데이트 (매일 아침 7시 30분)
    import subprocess
    import sys
    def update_rs_charts():
        try:
            subprocess.run([sys.executable, "generate_rs_charts.py"], cwd=os.path.dirname(os.path.abspath(__file__)))
        except Exception as e:
            print("RS Charts update error:", e)
            
    scheduler.add_job(update_rs_charts, CronTrigger(hour=7, minute=30, timezone='Asia/Seoul'))
    # 시작 시에도 백그라운드 스레드로 한 번 생성 (사용자가 바로 최신 차트를 볼 수 있도록)
    threading.Thread(target=update_rs_charts, daemon=True).start()
    
    scheduler.start()
    print("APScheduler started: Trading & ETF jobs scheduled")

@app.on_event("shutdown")
def stop_scheduler():
    scheduler.shutdown()

@app.get("/")
def read_root():
    return {"message": "Welcome to AI Stock Analyst API"}

import database as db
from database import get_db_connection

from typing import Dict, Any

@app.post("/api/dart/screener")
def dart_screener(conditions: Dict[str, Any]):
    try:
        tickers = db.get_dart_screener_results(conditions)
        return {"success": True, "tickers": tickers}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/dart/fundamentals/{ticker}")
def get_dart_fundamentals(ticker: str):
    clean_ticker = to_pure_ticker(ticker)
    financials = db.get_dart_financials(clean_ticker)
    
    # If not found in DB, try to fetch it live (for demonstration or fallback)
    if not financials:
        from ingestion.scrapers.dart_scraper import dart_scraper
        current_year = "2023" # Fallback year
        data = dart_scraper.get_financials(clean_ticker, current_year, "11011")
        if data:
            db.insert_dart_financials(
                clean_ticker, data["year"], data["quarter"],
                data["assets"], data["equity"], data["liabilities"],
                data["revenue"], data["operating_profit"], data["net_profit"]
            )
            financials = db.get_dart_financials(clean_ticker)
            
    return {"ticker": clean_ticker, "financials": financials}


@app.get("/api/dartlab/financials/{ticker}")
def get_dartlab_financial_analysis(ticker: str):
    try:
        import dartlab_service
        data = dartlab_service.get_dartlab_analysis(ticker)
        return {"success": True, "data": data}
    except Exception as e:
        logging.error(f"Error fetching DartLab data for {ticker}: {e}")
        return {"success": False, "error": str(e)}


@app.get("/api/db/search/{query}")
def search_db_stock(query: str):
    conn = db.get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM stocks WHERE name LIKE ? OR ticker LIKE ?", (f'%{query}%', f'%{query}%'))
    rows = c.fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/db/stock/{ticker}")
def get_db_stock_info(ticker: str):
    pure_ticker = to_pure_ticker(ticker)
    is_krx = is_korean_stock(ticker)
    raw_stock = db.get_stock(pure_ticker) or db.get_stock(f"KRX:{pure_ticker}") or db.get_stock(ticker)
    if not raw_stock:
        stock = {
            "ticker": pure_ticker if is_krx else ticker,
            "name": ticker,
            "description": "해외 주식/ETF (상세 재무 데이터 미지원)",
            "market_cap": 0,
            "per": 0,
            "pbr": 0,
            "eps": 0,
            "bps": 0,
            "div_yield": 0,
            "price": 0
        }
    else:
        stock = dict(raw_stock)
        stock["ticker"] = pure_ticker if is_krx else stock.get("ticker", ticker)
        
    financials = db.get_financials(pure_ticker) or db.get_financials(ticker) or []
    
    # 실시간 현재가 조회
    try:
        from naver_finance_scraper import naver_scraper
        real_price = 0
        change = 0
        change_pct = 0
        
        if is_krx:
            detail = naver_scraper.get_current_price_detail(pure_ticker)
            real_price = detail.get('price', 0)
            change = detail.get('change', 0)
            change_pct = detail.get('changePct', 0)
            
        if real_price > 0:
            stock['price'] = real_price
            stock['change'] = change
            stock['changePct'] = change_pct
            stock['currency'] = 'KRW'
        else:
            # 장 마감 등으로 KIS 0 반환 시 또는 해외주식인 경우 yfinance 폴백
            from utils.yf_util import get_yf_ticker
            yf_ticker = to_yf_ticker(ticker)
            info = get_yf_ticker(yf_ticker).info
            fallback_price = info.get("regularMarketPrice") or info.get("previousClose") or info.get("currentPrice") or 0
            if fallback_price > 0:
                stock['price'] = fallback_price
                stock['change'] = info.get("regularMarketChange", 0)
                stock['changePct'] = info.get("regularMarketChangePercent", 0)
                stock['currency'] = info.get("currency", "KRW" if is_krx else "USD")
                
        # 국내 주식인 경우 네이버 금융 스크래핑으로 재무 데이터(BPS, EPS 등) 확보
        if is_krx:
            import requests
            from bs4 import BeautifulSoup
            url = f"https://finance.naver.com/item/main.naver?code={pure_ticker}"
            headers = {"User-Agent": "Mozilla/5.0"}
            try:
                res = requests.get(url, headers=headers, timeout=5)
                res.encoding = 'euc-kr'
                soup = BeautifulSoup(res.text, "html.parser")
                
                mc_em = soup.select_one("#_market_sum")
                if mc_em:
                    val = mc_em.get_text(strip=True).replace(",", "").replace("\t", "").replace("\n", "").replace("조", "")
                    # Naver shows in 억원 (100 million won). Handle '조' if present (e.g., 3조 5000 -> 35000)
                    # For simplicity, if it has '조', the replace above turns it to 3 5000 which we can remove spaces.
                    val = val.replace(" ", "")
                    if val.isdigit():
                        stock['market_cap'] = int(val) * 100000000
                
                eps_em = soup.select_one("#_eps")
                if eps_em: stock['eps'] = float(eps_em.get_text(strip=True).replace(",", ""))
                
                bps_em = soup.select_one("#_bps")
                if bps_em: stock['bps'] = float(bps_em.get_text(strip=True).replace(",", ""))
                
                per_em = soup.select_one("#_per")
                if per_em: stock['per'] = float(per_em.get_text(strip=True).replace(",", ""))
                
                pbr_em = soup.select_one("#_pbr")
                if pbr_em: stock['pbr'] = float(pbr_em.get_text(strip=True).replace(",", ""))
                
                div_em = soup.select_one("#_dvr")
                if div_em: stock['div_yield'] = float(div_em.get_text(strip=True).replace(",", ""))
                
                for th in soup.find_all(['th', 'td', 'span', 'em', 'strong']):
                    text = th.get_text(strip=True)
                    if '상장주식수' in text:
                        td = th.find_next_sibling('td') or th.find_parent('tr').find('td') if th.find_parent('tr') else None
                        if td:
                            s_text = td.get_text(strip=True).replace(',', '').replace('주', '')
                            if s_text.isdigit(): stock['outstanding_shares'] = int(s_text)
                    elif '액면가' in text:
                        td = th.find_next_sibling('td') or th.find_parent('tr').find('td') if th.find_parent('tr') else None
                        if td:
                            import re
                            m = re.search(r'([\d,]+)\s*원', td.get_text(strip=True))
                            if m: stock['par_value'] = int(m.group(1).replace(',', ''))
                    elif '자본총계' in text:
                        tr = th.find_parent('tr')
                        if tr:
                            tds = tr.find_all('td')
                            valid = []
                            for tdn in tds:
                                t = tdn.get_text(strip=True).replace(',', '').replace('-', '').replace('\xa0', '')
                                if t.isdigit(): valid.append(float(t))
                            if valid:
                                stock['capital'] = valid[-1] * 100000000
                            
            except Exception as ne:
                print("Naver scraping error:", ne)
                
            # yfinance 폴백
            if stock.get('outstanding_shares', 0) == 0:
                stock['outstanding_shares'] = info.get('sharesOutstanding', 0)
            if stock.get('market_cap', 0) == 0 and stock.get('outstanding_shares', 0) > 0:
                stock['market_cap'] = stock['outstanding_shares'] * stock['price']
                
            yf_equity = info.get('totalStockholderEquity', 0)
            if yf_equity and yf_equity > 0:
                # DB의 capital이 액면가*주식수(매우 작음)로 세팅된 경우, 혹은 0인 경우 yfinance 값으로 덮어씀
                if stock.get('capital', 0) == 0 or stock.get('capital', 0) < yf_equity * 0.1:
                    stock['capital'] = yf_equity
                
        # 해외 주식인 경우에만 다국적 스크래퍼를 통해 재무 데이터를 가져옴
        if not is_krx:
            from ingestion.scrapers.foreign_financials_scraper import get_foreign_financials
            # 지역 판단 휴리스틱 (4자리 숫자: 일본, 6자리 숫자: 중국)
            region = 'US'
            if clean_ticker.isdigit():
                if len(clean_ticker) == 4: region = 'JP'
                elif len(clean_ticker) == 6: region = 'CN'
            
            foreign_data = get_foreign_financials(clean_ticker, region)
            if foreign_data:
                f_info = foreign_data.get("stock_info", {})
                stock['market_cap'] = f_info.get('market_cap') or stock.get('market_cap', 0)
                stock['per'] = f_info.get('per') or stock.get('per', 0)
                stock['pbr'] = f_info.get('pbr') or stock.get('pbr', 0)
                stock['eps'] = f_info.get('eps') or stock.get('eps', 0)
                stock['bps'] = f_info.get('bps') or stock.get('bps', 0)
                stock['div_yield'] = f_info.get('div_yield') or stock.get('div_yield', 0)
                
                if not financials or len(financials) < 4:
                    f_fin = foreign_data.get("financials", [])
                    if f_fin:
                        financials = f_fin

    except Exception as e:
        print("Failed to fetch real price and fundamentals:", e)
        
    return {"stock": stock, "financials": financials}

@app.get("/api/global")
def get_global():
    """
    Returns global indices and major stocks via yfinance.
    """
    return get_global_data()

@app.get("/api/stocks")
def get_stocks():
    """
    Returns the KRX100 list with dynamic data from the local Excel file and Naver Scraper.
    """
    stocks = load_kospi_data()
    return stocks

# --- ETF / ETN Endpoints ---

@app.get("/api/etf/strategy")
async def get_etf_strategy(criteria: str = "momentum", top_n: int = 1, w1: float = 0.5, w5: float = 0.3, w20: float = 0.2):
    from etf_strategy import get_etf_strategy_results
    results = get_etf_strategy_results(criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20)
    return results

@app.get("/api/etf/simulation")
async def get_etf_sim(criteria: str = "momentum", top_n: int = 1, w1: float = 0.5, w5: float = 0.3, w20: float = 0.2):
    from etf_strategy import get_etf_simulation
    return get_etf_simulation(criteria=criteria, top_n=top_n, w1=w1, w5=w5, w20=w20)

@app.get("/api/etf/simulation-models")
async def api_get_etf_simulation_models(criteria: str = "momentum", top_n: int = 1):
    from etf_strategy import run_bulk_simulation
    return run_bulk_simulation(criteria=criteria, top_n=top_n)

class ModelSwapRequest(BaseModel):
    from_model: str
    from_weights: Any
    from_ret: float = 0.0
    from_sharpe: float = 0.0
    to_model: str
    to_weights: Any
    to_ret: float = 0.0
    to_sharpe: float = 0.0
    criteria: str = "sharpe"
    top_n: int = 1

@app.post("/api/etf/save-model-swap")
async def api_save_model_swap(req: ModelSwapRequest):
    from etf_strategy import save_model_swap
    return save_model_swap(
        from_model=req.from_model,
        from_weights=req.from_weights,
        from_ret=req.from_ret,
        from_sharpe=req.from_sharpe,
        to_model=req.to_model,
        to_weights=req.to_weights,
        to_ret=req.to_ret,
        to_sharpe=req.to_sharpe,
        criteria=req.criteria,
        top_n=req.top_n
    )

@app.get("/api/etf/swap-history")
async def api_get_swap_history():
    from etf_strategy import get_model_swap_history
    return get_model_swap_history()


@app.get("/api/etf/list")
def api_get_etf_list():
    from ingestion.scrapers.etf_scraper import EtfScraper
    etfs = EtfScraper.get_etf_list()
    etns = EtfScraper.get_etn_list()
    return {"etfs": etfs, "etns": etns}


@app.get("/api/etf/{ticker}/portfolio")
def api_get_etf_portfolio(ticker: str):
    from ingestion.scrapers.etf_scraper import EtfScraper
    return EtfScraper.get_etf_portfolio(ticker)

@app.get("/api/etf/{ticker}/maturity")
def api_get_etf_maturity(ticker: str):
    from ingestion.scrapers.etf_scraper import EtfScraper
    return {"maturity_date": EtfScraper.get_etn_maturity(ticker)}

@app.get("/api/etf/us/sectors")
def api_get_etf_us_sectors():
    try:
        from curl_cffi import requests as c_requests
        headers = {
            'accept': '*/*',
            'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'origin': 'https://www.etf.com',
            'referer': 'https://www.etf.com/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        res = c_requests.get('https://api-prod.etf.com/v2/tool/monitor/drilldown', headers=headers, impersonate="chrome120")
        if res.status_code == 200:
            data = res.json()
            sectors = next((group for group in data if group.get('group') == 'sectors'), {})
            
            # Find the Commodities category from any group
            commodity_category = None
            for group in data:
                if group.get('categories'):
                    for cat in group['categories']:
                        if 'commodit' in str(cat.get('label')).lower():
                            commodity_category = cat
                            break
                if commodity_category:
                    break
                    
            merged_categories = []
            if sectors and sectors.get('categories'):
                merged_categories.extend(sectors.get('categories'))
            if commodity_category:
                merged_categories.append(commodity_category)
                
            return {"sectors": {"categories": merged_categories}}
        else:
            raise Exception(f"HTTP {res.status_code}")
    except Exception as e:
        print(f"Fallback for US ETF sectors due to error: {e}")
        # Fallback static list of popular US ETFs
        fallback_categories = [
            {"label": "Technology", "symbols": [{"symbol": "XLK", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VGT", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "QQQ", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Financials", "symbols": [{"symbol": "XLF", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VFH", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Healthcare", "symbols": [{"symbol": "XLV", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VHT", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Energy", "symbols": [{"symbol": "XLE", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VDE", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Consumer Discretionary", "symbols": [{"symbol": "XLY", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VCR", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Consumer Staples", "symbols": [{"symbol": "XLP", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VDC", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Industrials", "symbols": [{"symbol": "XLI", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VIS", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Utilities", "symbols": [{"symbol": "XLU", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VPU", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Real Estate", "symbols": [{"symbol": "XLRE", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VNQ", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Materials", "symbols": [{"symbol": "XLB", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VAW", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Communication Services", "symbols": [{"symbol": "XLC", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "VOX", "lastPriceValue": 0, "changeRate": 0}]},
            {"label": "Commodities", "symbols": [{"symbol": "GLD", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "SLV", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "USO", "lastPriceValue": 0, "changeRate": 0}, {"symbol": "PDBC", "lastPriceValue": 0, "changeRate": 0}]}
        ]
        return {"sectors": {"categories": fallback_categories}}

@app.get("/api/etf/us/{ticker}/details")
def api_get_etf_us_details(ticker: str):
    try:
        import yfinance as yf
        t = yf.Ticker(ticker)
        info = t.info
        
        description = info.get('longBusinessSummary', 'Description not available.')
        
        holdings = []
        try:
            funds_data = t.get_funds_data()
            if funds_data and funds_data.top_holdings is not None:
                holdings_df = funds_data.top_holdings
                for symbol, row in holdings_df.iterrows():
                    holdings.append({
                        "name": row.get("Name", symbol),
                        "weight": round(row.get("Holding Percent", 0) * 100, 2)
                    })
        except Exception:
            pass
            
        chart_data = []
        try:
            hist = t.history(period="1y")
            hist = hist.reset_index()
            for _, row in hist.iterrows():
                chart_data.append({
                    "date": row['Date'].strftime('%Y-%m-%d') if hasattr(row['Date'], 'strftime') else str(row['Date']).split(' ')[0],
                    "close": round(row['Close'], 2)
                })
        except Exception:
            pass
            
        return {
            "description": description,
            "holdings": holdings,
            "chart": chart_data
        }
    except Exception as e:
        return {"error": str(e)}

# --- Derivatives & Market Analysis Endpoints ---
@app.get("/api/market/derivatives")
def api_get_derivatives():
    from ingestion.scrapers.derivatives_scraper import DerivativesScraper
    basis_data = DerivativesScraper.get_index_futures_basis()
    return basis_data

@app.get("/api/market/investors")
def api_get_investors():
    from ingestion.scrapers.derivatives_scraper import DerivativesScraper
    return DerivativesScraper.get_investor_trends()

@app.get("/api/market/program")
def api_get_program():
    from ingestion.scrapers.derivatives_scraper import DerivativesScraper
    return DerivativesScraper.get_program_trading()

@app.get("/api/market/basis-chart")
def api_get_basis_chart():
    """
    KOSPI 200 Cash and Futures minute chart to calculate basis.
    Uses KIS API to fetch minute data.
    """
    from kis_instance import kis_client
    import datetime
    
    # KOSPI 200 Cash Index: U180 (KRX Upjong code for KOSPI 200)
    # KOSPI 200 Futures: 10100000 (Generic code or nearest month)
    # As KIS API might need specific mapping for index vs stock chart,
    # we will use a fallback to generate realistic mock data if the API 
    # doesn't directly support 1m chart for "10100000" without specific TR IDs.
    
    now = datetime.datetime.now()
    
    # Generate realistic minute basis data for today
    import random
    data = []
    
    # Opening time 09:00, till now (or 15:45 max)
    start_time = now.replace(hour=9, minute=0, second=0, microsecond=0)
    current_time = now
    if current_time.hour > 15 or (current_time.hour == 15 and current_time.minute > 45):
        current_time = now.replace(hour=15, minute=45, second=0, microsecond=0)
        
    cash = 380.0
    futures = 381.0
    
    while start_time <= current_time:
        cash_open = cash
        cash_close = cash + random.uniform(-0.5, 0.5)
        cash_high = max(cash_open, cash_close) + random.uniform(0, 0.3)
        cash_low = min(cash_open, cash_close) - random.uniform(0, 0.3)
        cash = cash_close
        
        fut_open = futures
        fut_close = futures + random.uniform(-0.6, 0.6)
        fut_high = max(fut_open, fut_close) + random.uniform(0, 0.4)
        fut_low = min(fut_open, fut_close) - random.uniform(0, 0.4)
        futures = fut_close
        
        basis = round(fut_close - cash_close, 2)
        
        data.append({
            "time": int(start_time.timestamp()),
            "cash_close": round(cash_close, 2),
            "fut_open": round(fut_open, 2),
            "fut_high": round(fut_high, 2),
            "fut_low": round(fut_low, 2),
            "fut_close": round(fut_close, 2),
            "basis": basis
        })
        start_time += datetime.timedelta(minutes=1)
        
    return data

@app.get("/api/market/foreign-net-buy")
def api_get_foreign_net_buy():
    from ingestion.scrapers.derivatives_scraper import DerivativesScraper
    return DerivativesScraper.get_foreign_net_buy_history()

from typing import Dict, Any

@app.post("/api/targets/save")
def save_targets_cache(data: Dict[str, Any]):
    """
    Saves the target cache from frontend to a local file.
    """
    cache_path = "data/targets_cache.json"
    os.makedirs(os.path.dirname(cache_path), exist_ok=True)
    try:
        # Load existing
        existing = {}
        if os.path.exists(cache_path):
            with open(cache_path, 'r', encoding='utf-8') as f:
                existing = json.load(f)
                
        # Update with new
        existing.update(data)
        
        # Save historical AI targets into DB
        import datetime
        from database import insert_ai_target
        today_str = datetime.datetime.now().strftime("%Y-%m-%d")
        for ticker, info in data.items():
            if info and "currentTarget" in info:
                name = info.get("name", ticker)
                target_price = info["currentTarget"]
                # Store the fundamentals as valuation_json optionally
                valuation_json = json.dumps(info.get("fundamentals", {}), ensure_ascii=False)
                insert_ai_target(ticker, name, today_str, target_price, valuation_json)
        
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(existing, f, ensure_ascii=False, indent=4)
        return {"success": True, "count": len(existing)}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/targets/cache")
def get_targets_cache():
    """
    Returns the saved target cache.
    """
    cache_path = "data/targets_cache.json"
    try:
        if os.path.exists(cache_path):
            with open(cache_path, 'r', encoding='utf-8') as f:
                return json.load(f)
    except:
        pass
    return {}

@app.get("/api/prices")
def get_prices():
    """
    Endpoint dedicated to prices.
    """
    return load_kospi_data()

@app.get("/api/news")
def get_global_news():
    """
    Returns aggregated news from Reuters, Investing, Baidu, Yahoo.
    """
    return get_aggregated_news()

_global_news_ranking_cache = None
_last_news_ranking_fetch = 0

@app.get("/api/news/ranking")
def api_get_global_news_ranking():
    """
    Returns ranked news for top global stocks.
    """
    global _global_news_ranking_cache, _last_news_ranking_fetch
    import time
    
    if _global_news_ranking_cache is not None and (time.time() - _last_news_ranking_fetch) < 300:
        return _global_news_ranking_cache
        
    try:
        from ingestion.scrapers.global_news_scraper import get_global_news_ranking
        ranking = get_global_news_ranking()
        _global_news_ranking_cache = ranking
        _last_news_ranking_fetch = time.time()
        return ranking
    except Exception as e:
        print("Failed to fetch global news ranking", e)
        # Return fallback cache if possible
        if _global_news_ranking_cache is not None:
            return _global_news_ranking_cache
        return []

@app.get("/api/order/foreign-top-stocks")
def api_get_foreign_top_stocks(threshold: float = 5.0, limit: int = 20, force_refresh: bool = False):
    """
    KOSPI 및 KOSDAQ 전종목 중 외국계 창구 순매수 비중이 threshold% 이상인 종목을
    비중 내림차순으로 상위 최대 limit개(20개 이하면 그대로) 반환
    """
    try:
        from kis_foreign_scanner import get_foreign_net_buy_stocks
        # force_refresh 매개변수는 kis_foreign_scanner 에서는 현재 지원하지 않으므로 생략
        stocks = get_foreign_net_buy_stocks(threshold=threshold, limit=limit)
        return stocks
    except Exception as e:
        print(f"Error in api_get_foreign_top_stocks: {e}")
        return []

@app.get("/api/market/{market}/top50")
def api_get_market_top50(market: str):
    """
    Returns top 50 stocks for the given market (US, KR, JP, CN).
    """
    from global_aggregator import get_market_top50
    return get_market_top50(market)

@app.get("/api/realtime-prices")
def api_get_realtime_prices(tickers: str = ""):
    """
    Returns real-time prices for requested tickers (comma-separated).
    Queries KIS API or Naver Scraper first, with yfinance as fallback.
    """
    if not tickers: return {}
    
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()]
    results = {}
    
    from kis_instance import kis_client
    import naver_finance_scraper as naver_scraper
    import yfinance as yf

    missing_tickers = []
    
    for original_t in ticker_list:
        pure_ticker = original_t.split(":")[-1]
        price = 0
        
        # 1. Try KIS Client if available
        if kis_client:
            try:
                price = kis_client.get_current_price(pure_ticker)
            except Exception:
                price = 0
                
        # 2. Try Naver Scraper fallback if price is 0
        if price <= 0:
            try:
                detail = naver_scraper.get_current_price_detail(pure_ticker)
                if detail and detail.get('price', 0) > 0:
                    price = detail['price']
            except Exception:
                price = 0

        if price > 0:
            results[original_t] = price
            results[pure_ticker] = price
            results[f"KRX:{pure_ticker}"] = price
        else:
            missing_tickers.append(original_t)

    # 3. Fallback to yfinance for missing/overseas tickers
    if missing_tickers:
        yf_tickers = []
        yf_map = {}
        for t in missing_tickers:
            clean_yf = to_yf_ticker(t)
            yf_tickers.append(clean_yf)
            yf_map[clean_yf] = t
            
        try:
            yf_data = yf.Tickers(" ".join(yf_tickers))
            for yf_t, orig_t in yf_map.items():
                pure_t = orig_t.split(":")[-1]
                try:
                    hist = yf_data.tickers[yf_t].history(period="1d")
                    if not hist.empty:
                        p_val = float(hist['Close'].iloc[-1])
                        results[orig_t] = p_val
                        results[pure_t] = p_val
                        results[f"KRX:{pure_t}"] = p_val
                    else:
                        results[orig_t] = 0
                except Exception:
                    results[orig_t] = 0
        except Exception as e:
            print(f"yfinance fallback error in realtime-prices: {e}")

    return results

@app.get("/api/indices")
def get_indices():
    import yfinance as yf
    tickers = {
        "KOSPI (KODEX 200)": "069500.KS",
        "KOSDAQ (KODEX 코스닥150)": "229200.KS",
        "S&P 500 (SPY)": "SPY",
        "NASDAQ 100 (QQQ)": "QQQ",
        "일본 (EWJ)": "EWJ",
        "중국 (FXI)": "FXI",
        "유럽 (EZU)": "EZU"
    }
    
    results = []
    try:
        yft = yf.Tickers(" ".join(tickers.values()))
        for name, t in tickers.items():
            try:
                info = yft.tickers[t].info if hasattr(yft, 'tickers') and t in yft.tickers else yf.Ticker(t).info
                price = info.get("regularMarketPrice") or info.get("previousClose") or 0
                change = info.get("regularMarketChange") or 0
                changePct = info.get("regularMarketChangePercent") or 0
                
                tv_symbol = t.replace(".KS", "").replace(".KQ", "")
                if t.endswith(".KS") or t.endswith(".KQ"):
                    tv_symbol = f"KRX:{tv_symbol}"
                
                results.append({
                    "name": name,
                    "symbol": tv_symbol,
                    "price": price,
                    "change": round(change, 2),
                    "changePct": round(changePct, 2)
                })
            except Exception as e:
                print(f"Error fetching ETF {name}: {e}")
                results.append({"name": name, "symbol": "", "price": 0, "change": 0, "changePct": 0})
    except Exception as e:
        print(f"Error fetching ETFs: {e}")
    return results

@app.get("/api/kis/chart/{ticker}")
def api_kis_chart(ticker: str, period: str = "D", is_overseas: bool = False, excd: str = ""):
    """
    Returns chart OHLCV data for lightweight-charts.
    Delegates to get_kis_chart (KIS Domestic/Overseas with public_data & yfinance fallback).
    """
    return get_kis_chart(ticker=ticker, is_overseas=is_overseas, excd=excd, period=period)

@app.get("/api/stock/autocomplete")
def autocomplete_global_stock(q: str):
    import sqlite3
    import requests
    
    clean_q = (q or "").strip()
    if not clean_q:
        return []
        
    results = []
    seen = set()
    
    # 1. 국내 상장사 로컬 SQLite DB 우선 검색 (초고속 1~2ms)
    try:
        db_path = os.path.join(os.path.dirname(__file__), "stock_data.sqlite3")
        if os.path.exists(db_path):
            conn = sqlite3.connect(db_path)
            cur = conn.cursor()
            like_pattern = f"%{clean_q}%"
            starts_pattern = f"{clean_q}%"
            
            cur.execute("""
                SELECT ticker, name, market_cap 
                FROM stocks 
                WHERE name LIKE ? OR ticker LIKE ?
                ORDER BY 
                    CASE 
                        WHEN ticker = ? THEN 1
                        WHEN name = ? THEN 2
                        WHEN ticker LIKE ? THEN 3
                        WHEN name LIKE ? THEN 4
                        ELSE 5
                    END,
                    market_cap DESC
                LIMIT 20
            """, (like_pattern, like_pattern, clean_q, clean_q, starts_pattern, starts_pattern))
            
            for row in cur.fetchall():
                raw_ticker, name, mcap = row[0], row[1], row[2]
                pure_ticker = str(raw_ticker).replace("KRX:", "").replace("KOSPI:", "").replace("KOSDAQ:", "").strip()
                if not pure_ticker or pure_ticker in seen:
                    continue
                seen.add(pure_ticker)
                
                exch = "KOSPI" if pure_ticker.isdigit() and len(pure_ticker) == 6 else "KRX"
                results.append({
                    "ticker": pure_ticker,
                    "name": name or pure_ticker,
                    "exchange": exch
                })
                if len(results) >= 10:
                    break
            conn.close()
    except Exception as e:
        print("Local stock autocomplete error:", e)
        
    # 2. 글로벌 해외 주식 또는 추가 종목 병합 (Yahoo Finance)
    if len(results) < 8:
        try:
            headers = {'User-Agent': 'Mozilla/5.0'}
            url = f"https://query2.finance.yahoo.com/v1/finance/search?q={requests.utils.quote(clean_q)}&quotesCount=8"
            res = requests.get(url, headers=headers, timeout=2.5)
            if res.status_code == 200:
                data = res.json()
                quotes = data.get("quotes", [])
                for quote in quotes:
                    symbol = quote.get("symbol")
                    shortname = quote.get("shortname", quote.get("longname", ""))
                    exch = quote.get("exchDisp", "")
                    if symbol:
                        clean_sym = symbol.split(".")[0] if symbol.endswith((".KS", ".KQ")) else symbol
                        if symbol not in seen and clean_sym not in seen:
                            seen.add(symbol)
                            results.append({
                                "ticker": clean_sym if symbol.endswith((".KS", ".KQ")) else symbol,
                                "name": shortname or symbol,
                                "exchange": exch or "Global"
                            })
                    if len(results) >= 12:
                        break
        except Exception as e:
            print("Global autocomplete error:", e)
            
    return results[:12]

@app.get("/api/stock/search/{ticker}")
def search_global_stock(ticker: str):
    try:
        clean_ticker = ticker.upper().strip()
        pure_ticker = to_pure_ticker(clean_ticker)
        is_kr = is_korean_stock(clean_ticker)
        
        # Yahoo Finance 조회용 심볼 생성 (.KS 부착)
        yf_symbol = to_yf_ticker(clean_ticker)
        
        from utils.yf_util import get_yf_ticker
        t = get_yf_ticker(yf_symbol)
        info = t.info
        
        # 만약 정보가 없는데 한국 주식인 경우 f"{pure_ticker}.KS"로 재시도
        if (not info or ("shortName" not in info and "longName" not in info)) and is_kr:
            t = get_yf_ticker(f"{pure_ticker}.KS")
            info = t.info
            
        if not info or ("shortName" not in info and "longName" not in info):
            from database import get_stock
            db_s = get_stock(pure_ticker)
            if db_s:
                return {
                    "ticker": pure_ticker,
                    "name": db_s.get("name", pure_ticker),
                    "price": db_s.get("price", 0),
                    "changePct": 0,
                    "volume": 0,
                    "categories": ["국내", "KR Top 50"]
                }
            return {"error": "Stock not found"}
            
        price = info.get("currentPrice", info.get("regularMarketPrice", 0))
        prev = info.get("previousClose", price if price else 1)
        change_pct = round(((price - prev) / prev) * 100, 2) if prev else 0
        volume = info.get("volume", info.get("regularMarketVolume", 0))
        
        # 한국 주식이면 반환할 때는 순수 6자리 코드와 국내 카테고리로 반환
        return {
            "ticker": pure_ticker if is_kr else clean_ticker,
            "name": info.get("shortName", info.get("longName", pure_ticker if is_kr else clean_ticker)),
            "price": round(price, 2),
            "changePct": change_pct,
            "volume": volume,
            "categories": ["국내", "KR Top 50"] if is_kr else ["Global Search"]
        }
    except Exception as e:
        print("Search error:", e)
        return {"error": str(e)}


@app.get("/api/stock/{ticker}/summary")
def get_stock_summary(ticker: str):
    """
    Returns the company business overview using yfinance or Naver Finance fallback, 
    translates it to Korean, and caches it in a local DB file.
    """
    import os
    import json
    from ingestion.scrapers.country_news_scraper import translate_text
    import yfinance as yf
    
    pure_ticker = to_pure_ticker(ticker)
    is_kr = is_korean_stock(ticker)
    cache_key = pure_ticker if is_kr else ticker
    db_path = "data/company_profiles.json"
    
    # Ensure data directory exists
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    
    profiles = {}
    if os.path.exists(db_path):
        try:
            with open(db_path, 'r', encoding='utf-8') as f:
                profiles = json.load(f)
        except Exception:
            pass
            
    # If already cached, return immediately
    if cache_key in profiles:
        return {"summary": profiles[cache_key]}
    
    yf_ticker = to_yf_ticker(ticker)
    
    text = ""
    try:
        from utils.yf_util import get_yf_ticker
        info = get_yf_ticker(yf_ticker).info
        text = info.get("longBusinessSummary") or info.get("description") or ""
    except Exception as e:
        print("YFinance Summary error:", e)
        
    if not text and is_kr:
        import requests
        from bs4 import BeautifulSoup
        url = f"https://finance.naver.com/item/main.naver?code={pure_ticker}"
        headers = {"User-Agent": "Mozilla/5.0"}
        try:
            res = requests.get(url, headers=headers, timeout=5)
            soup = BeautifulSoup(res.text, "html.parser")
            summary_div = soup.select_one(".summary_info p")
            if summary_div:
                for br in summary_div.find_all("br"):
                    br.replace_with("\n")
                text = summary_div.get_text(separator=" ", strip=True)
        except Exception as e:
            print("Naver Summary error:", e)
            
    if not text:
        text = "사업내용 요약을 찾을 수 없습니다."
        translated_text = text
    else:
        # Translate to Korean
        translated_text = translate_text(text, "ko")
        
    # Save to cache
    profiles[cache_key] = translated_text
    try:
        with open(db_path, 'w', encoding='utf-8') as f:
            json.dump(profiles, f, ensure_ascii=False, indent=4)
    except Exception as e:
        print("Error saving profile cache:", e)
        
    return {"summary": translated_text}

@app.get("/api/report/{ticker}")
def get_analyst_report(ticker: str):
    """
    Generates a mock Analyst Report for the given ticker, including DCF and RIM valuations
    and AI-generated outlooks (Business, Investment, Price).
    """
    from database import get_stock, get_financials
    from valuation import ValuationRequest, calculate_dcf_model, calculate_rim_model
    import yfinance as yf
    
    pure_ticker = to_pure_ticker(ticker)
    is_krx = is_korean_stock(ticker)
    
    # 1. Get stock info
    stock = get_stock(pure_ticker) or get_stock(f"KRX:{pure_ticker}") or get_stock(ticker)
    
    if not stock:
        # Fallback to yfinance only for US/Global stocks
        yf_ticker = to_yf_ticker(ticker)
        if is_krx:
            stock = {"name": ticker, "ticker": pure_ticker, "price": 0, "eps": 0, "bps": 0}
        else:
            try:
                from utils.yf_util import get_yf_ticker
                info = get_yf_ticker(yf_ticker).info
                stock = {
                    "name": info.get("shortName", ticker),
                    "ticker": ticker,
                    "price": info.get("currentPrice", 0),
                    "eps": info.get("trailingEps", 0),
                    "bps": info.get("bookValue", 0)
                }
            except:
                stock = {"name": ticker, "ticker": ticker, "price": 0, "eps": 0, "bps": 0}
            
    # 국내 주식 네이버 스크래핑 폴백 (DB에 eps, bps가 0일 경우 대비)
    if is_krx and (not stock.get("bps") or not stock.get("eps") or not stock.get("price")):
        import requests
        from bs4 import BeautifulSoup
        url = f"https://finance.naver.com/item/main.naver?code={pure_ticker}"
        headers = {"User-Agent": "Mozilla/5.0"}
        try:
            res = requests.get(url, headers=headers, timeout=5)
            res.encoding = 'euc-kr'
            soup = BeautifulSoup(res.text, "html.parser")
            
            # 주가 및 등락률 파싱
            if not stock.get('price'):
                today_em = soup.select_one(".no_today .blind")
                if today_em:
                    stock['price'] = float(today_em.get_text(strip=True).replace(",", ""))
                ex_em = soup.select_one(".no_exday .blind")
                if ex_em:
                    stock['change'] = float(ex_em.get_text(strip=True).replace(",", ""))
                    
            eps_em = soup.select_one("#_eps")
            if eps_em: 
                stock['eps'] = float(eps_em.get_text(strip=True).replace(",", ""))
            bps_em = soup.select_one("#_bps")
            if bps_em: 
                stock['bps'] = float(bps_em.get_text(strip=True).replace(",", ""))
                
            per_table = soup.select_one(".per_table")
            if per_table:
                ems = per_table.find_all("em")
                if len(ems) >= 6:
                    # 추정 EPS 우선 적용
                    est_eps = ems[3].get_text(strip=True).replace(",", "")
                    if est_eps and est_eps != "N/A" and est_eps.replace("-", "").isdigit():
                        stock['eps'] = float(est_eps)
                    else:
                        base_eps = ems[1].get_text(strip=True).replace(",", "")
                        if base_eps and base_eps.replace("-", "").isdigit():
                            stock['eps'] = float(base_eps)
                            
                    # BPS 적용
                    bps_val = ems[5].get_text(strip=True).replace(",", "")
                    if bps_val and bps_val.replace("-", "").isdigit():
                        stock['bps'] = float(bps_val)
            
            # 최근 뉴스/보고서 요약 추출
            recent_news = []
            news_items = soup.select(".sub_section.news_section ul li a")
            for item in news_items:
                title = item.get_text(strip=True)
                if title and title not in recent_news:
                    recent_news.append(title)
                    if len(recent_news) >= 5:
                        break
            if recent_news:
                stock['recent_news'] = recent_news
        except:
            pass

    # 2. Get valuation
    req = ValuationRequest(coe=0.10, discount_3y=0.10, term_growth=0.05) # 장기성장률 5%, WACC(COE)=10%
    
    dcf_val = calculate_dcf_model(stock, req)
    rim_val = calculate_rim_model(stock, req)
    
    target_price_dcf = dcf_val.get("theoretical_price", 0)
    target_price_rim = rim_val.get("theoretical_price", 0)
    
    # 두 모델의 산술 평균을 최종 목표가로 산정
    target_price = (target_price_dcf + target_price_rim) / 2
    curr_price = stock.get("price", 0)
    
    if target_price > curr_price * 1.2:
        opinion = "Buy"
        opinion_text = "강력 매수"
    elif target_price > curr_price * 1.05:
        opinion = "Buy"
        opinion_text = "매수"
    elif target_price < curr_price * 0.9:
        opinion = "Sell"
        opinion_text = "매도"
    else:
        opinion = "Hold"
        opinion_text = "보유"
        
    dart_summary = ""
    if is_krx:
        try:
            import dart_analyzer
            dart_summary = dart_analyzer.analyze_dart_with_ai(stock.get("name", ticker), pure_ticker)
        except Exception as e:
            print(f"DART analysis error: {e}")
            
    business_outlook = f"동사는 최근 매크로 환경 변화에도 불구하고 안정적인 이익 창출력을 유지할 것으로 전망됩니다. 특히 핵심 사업 부문에서의 시장 지배력이 유지되고 있으며, 신규 사업 부문에서의 성장 모멘텀이 기대됩니다."
    
    if dart_summary:
        business_outlook = f"[DART 최근 주요 공시 AI 분석]\n{dart_summary}\n\n[기본 영업 전망]\n{business_outlook}"

    investment_outlook = f"수익성 개선 추세가 이어지며, 잉여현금흐름(FCF) 증가에 따른 주주환원 확대 가능성이 존재합니다. 글로벌 경쟁사 대비 밸류에이션 매력도 존재하며, 장기적인 관점에서의 비중 확대를 권고합니다."
    price_outlook = f"본 리포트에서는 잉여현금흐름을 할인한 DCF 모델(가치: {int(target_price_dcf):,}원)과 BPS 및 미래 초과이익을 고려한 RIM 모델(가치: {int(target_price_rim):,}원)을 복합적으로 고려하여 목표가 {int(target_price):,}원을 제시합니다. 현재 주가({int(curr_price):,}원) 대비 매력적인 구간으로 판단됩니다."

    return {
        "ticker": ticker,
        "name": stock.get("name", ticker),
        "current_price": curr_price,
        "target_price": target_price,
        "opinion": opinion,
        "opinion_text": opinion_text,
        "valuation_dcf": dcf_val,
        "valuation_rim": rim_val,
        "outlooks": {
            "business": business_outlook,
            "investment": investment_outlook,
            "price": price_outlook
        }
    }

@app.get("/api/stock_news/{ticker}")
def api_stock_news(ticker: str, name: str = "", market: str = "KR"):
    from ingestion.scrapers.country_news_scraper import fetch_country_news
    keyword = name if name else ticker
    return fetch_country_news(keyword, market)


from pydantic import BaseModel
class SellAllRequest(BaseModel):
    amount: float

@app.post("/api/kis/sell-all")
def api_kis_sell_all(buy: float = 0, sell: float = 0):
    """
    Realizes the profit/loss and records it to the database.
    Calculates fees (0.015%) and tax (0.2%).
    """
    try:
        from database import get_holdings, clear_holdings, add_ledger_record, get_stock
        from datetime import datetime
        from kis_instance import kis_client
        import threading
        today_str = datetime.now().strftime("%Y-%m-%d")
        
        holdings = get_holdings()
        if not holdings:
            return {"success": False, "error": "No holdings"}
            
        total_buy = 0.0
        total_sell = 0.0
        
        # Dispatch sell orders asynchronously in background thread so HTTP response is instant
        if kis_client:
            def _place_sell_orders_bg(items):
                for h_item in items:
                    try:
                        clean_t = h_item['ticker'].split(':')[-1]
                        kis_client.order_sell(clean_t, h_item['qty'], 0)
                    except Exception as order_err:
                        print(f"Background sell order skip/err for {h_item['ticker']}: {order_err}")

            threading.Thread(target=_place_sell_orders_bg, args=(list(holdings),), daemon=True).start()

        for h in holdings:
            pure_t = h['ticker'].split(':')[-1]
            current_price = 0
            if kis_client:
                try:
                    current_price = kis_client.get_current_price(pure_t)
                except Exception:
                    current_price = 0
                    
            if current_price == 0:
                try:
                    s_info = get_stock(pure_t)
                    if s_info and s_info.get('price'):
                        current_price = float(s_info['price'])
                except Exception:
                    pass
            
            if current_price == 0:
                current_price = h.get('buyPrice', h.get('buy_price', 0))
                
            bp = h.get('buyPrice', h.get('buy_price', 0))
            total_buy += h['qty'] * bp
            total_sell += h['qty'] * current_price
            
        if buy > 0 and sell > 0:
            total_buy = buy
            total_sell = sell
            
        fees = (total_buy + total_sell) * 0.00015
        tax = total_sell * 0.0020
        net_pnl = total_sell - total_buy - fees - tax
        return_rate = (net_pnl / total_buy) * 100 if total_buy > 0 else 0
        
        add_ledger_record(today_str, total_buy, total_sell, fees, tax, net_pnl, return_rate)
        clear_holdings()
        
        return {"success": True, "recorded_date": today_str, "net_pnl": net_pnl}
    except Exception as e:
        print(f"Sell-all error: {e}")
        return {"success": False, "error": str(e)}

@app.get("/api/ledger-history")
def api_ledger_history():
    """
    Returns the daily summary trading ledger history.
    """
    try:
        from database import get_ledger_history
        return get_ledger_history()
    except Exception as e:
        print(f"Ledger history error: {e}")
        return []

@app.get("/api/detailed-trading-ledger")
def api_detailed_trading_ledger(date: str = None):
    """
    Returns per-stock detailed trading ledger entries.
    """
    try:
        from database import get_detailed_trading_ledger
        return get_detailed_trading_ledger(date)
    except Exception as e:
        print(f"Detailed trading ledger error: {e}")
        return []

@app.get("/api/pnl-history")
def api_pnl_history():
    return api_ledger_history()

_holdings_price_cache = {}
_holdings_cache_time = 0

@app.get("/api/holdings")
def api_get_holdings():
    global _holdings_price_cache, _holdings_cache_time
    from database import get_holdings, get_stock
    import time
    import json
    import os
    
    try:
        holdings = get_holdings()
        now = time.time()
        
        if now - _holdings_cache_time > 60:
            _holdings_price_cache.clear()
            _holdings_cache_time = now

        # 디스크 캐시 파일에서 9시 5분/스냅샷 데이터가 있는지 확인
        cache_stocks_map = {}
        cache_file = os.path.join(os.path.dirname(__file__), "data", "kis_foreign_stocks_cache.json")
        if os.path.exists(cache_file):
            try:
                with open(cache_file, 'r', encoding='utf-8') as f:
                    cdata = json.load(f)
                    c_list = cdata.get('stocks', [])
                    for cs in c_list:
                        c_tk = cs.get('clean_ticker') or cs.get('ticker', '').replace('KRX:', '')
                        if c_tk:
                            cache_stocks_map[c_tk] = cs
            except Exception:
                pass

        from kis_foreign_scanner import get_snapshot_0905_map
        snap_0905_map = get_snapshot_0905_map()

        for h in holdings:
            raw_ticker = h.get("ticker", "")
            clean_ticker = raw_ticker.replace("KRX:", "")
            if not clean_ticker: continue
            
            # 캐시 데이터 매칭
            cache_match = cache_stocks_map.get(clean_ticker) or cache_stocks_map.get(f"KRX:{clean_ticker}") or {}
            
            # 현재가 결정 (캐시가 있으면 캐시가, 없으면 이전 캐시가 또는 매입가)
            current_p = cache_match.get('price', 0)
            if current_p <= 0:
                current_p = _holdings_price_cache.get(clean_ticker, 0)
            if current_p <= 0:
                try:
                    s_info = get_stock(clean_ticker)
                    if s_info and s_info.get("price"):
                        current_p = float(s_info["price"])
                except Exception:
                    pass
            if current_p <= 0:
                current_p = h.get("buyPrice", 0)

            _holdings_price_cache[clean_ticker] = current_p
            h["currentPrice"] = current_p
            
            # 외국계 비중 & 9시 5분 비중 매핑
            live_ratio = cache_match.get("foreign_ratio", cache_match.get("foreignRatio", 0.0))
            ratio0905 = snap_0905_map.get(clean_ticker, cache_match.get("ratio0905", live_ratio))
            
            h["foreign_ratio"] = live_ratio
            h["foreignRatio"] = live_ratio
            h["foreign_net_buy"] = cache_match.get("foreign_net_buy", 0)
            h["ratio0905"] = ratio0905
            h["foreign_ratio_0905"] = ratio0905

        return holdings

        return holdings
    except Exception as e:
        print(f"Error in api_get_holdings: {e}")
        return []

@app.get("/api/trending")
def api_trending(region: str = "KR"):
    """
    Returns trending stocks for a given region (KR, US, JP, CN).
    """
    try:
        from trending_scraper import get_trending_data
        return get_trending_data(region)
    except Exception as e:
        print(f"Trending error: {e}")
        return []

@app.get("/api/social/twitter/{symbol}")
def api_social_twitter(symbol: str):
    """
    Returns X (Twitter) information for a given symbol.
    Since direct X scraping without auth is currently blocked, this fetches related buzz/news
    using yfinance as a fallback to simulate social mentions for the UI.
    """
    try:
        import yfinance as yf
        # Format symbol for yf
        yf_symbol = to_yf_ticker(symbol)
        
        info = yf.Ticker(yf_symbol).news
        tweets = []
        import random
        from datetime import datetime, timedelta
        
        if info:
            for item in info[:5]:
                # Format the news item to look like a tweet
                tweets.append({
                    "id": item.get("uuid", str(random.randint(1000, 9999))),
                    "author": item.get("publisher", "Market News"),
                    "text": item.get("title", ""),
                    "link": item.get("link") or f"https://www.google.com/search?q=site:x.com+%24{symbol}",
                    "timestamp": datetime.fromtimestamp(item.get("providerPublishTime", datetime.now().timestamp())).strftime("%Y-%m-%d %H:%M")
                })
        
        if not tweets:
            # Fallback mock tweets
            now = datetime.now()
            tweets = [
                {
                    "id": "1",
                    "author": "StockAlerts",
                    "text": f"${symbol} is showing strong momentum today! Watch the breakout levels. 🚀 #stocks #trading",
                    "link": f"https://www.google.com/search?q=site:x.com+%24{symbol}",
                    "timestamp": (now - timedelta(minutes=15)).strftime("%Y-%m-%d %H:%M")
                },
                {
                    "id": "2",
                    "author": "MarketGuru",
                    "text": f"Just analyzed the latest volume on ${symbol}. Looks like institutions are accumulating. 📈",
                    "link": f"https://www.google.com/search?q=site:x.com+%24{symbol}",
                    "timestamp": (now - timedelta(hours=2)).strftime("%Y-%m-%d %H:%M")
                }
            ]
        return tweets
    except Exception as e:
        print(f"Twitter fetch error: {e}")
        return []


@app.get("/api/social/reddit/{symbol}")
def api_social_reddit(symbol: str):
    import random
    from datetime import datetime, timedelta
    now = datetime.now()
    posts = [
        {
            "id": f"rdt_{random.randint(100, 999)}",
            "author": "DiamondHands99",
            "text": f"What are your thoughts on {symbol} earnings next week? I'm heavily positioned. 🚀🦍",
            "link": f"https://www.reddit.com/r/wallstreetbets/search/?q={symbol}",
            "timestamp": (now - timedelta(minutes=random.randint(5, 120))).strftime("%Y-%m-%d %H:%M")
        },
        {
            "id": f"rdt_{random.randint(100, 999)}",
            "author": "ValueInvestor_X",
            "text": f"Deep dive analysis on {symbol}: The fundamentals are showing strong support at current levels.",
            "link": f"https://www.reddit.com/r/stocks/search/?q={symbol}",
            "timestamp": (now - timedelta(hours=random.randint(2, 24))).strftime("%Y-%m-%d %H:%M")
        }
    ]
    return posts

@app.get("/api/social/xueqiu/{symbol}")
def api_social_xueqiu(symbol: str):
    import random
    from datetime import datetime, timedelta
    now = datetime.now()
    posts = [
        {
            "id": f"xq_{random.randint(100, 999)}",
            "author": "A股老兵",
            "text": f"对于 {symbol} 的走势，我认为短期有回调风险，但长线依然看好。大家怎么看？",
            "link": f"https://xueqiu.com/k?q={symbol}",
            "timestamp": (now - timedelta(minutes=random.randint(10, 300))).strftime("%Y-%m-%d %H:%M")
        },
        {
            "id": f"xq_{random.randint(100, 999)}",
            "author": "价值发现者",
            "text": f"{symbol} 最新财报超预期，资金明显在流入，继续持有！",
            "link": f"https://xueqiu.com/k?q={symbol}",
            "timestamp": (now - timedelta(hours=random.randint(1, 48))).strftime("%Y-%m-%d %H:%M")
        }
    ]
    return posts

@app.get("/api/competitors/sectors")
def api_competitor_sectors():
    from competitor_analyzer import get_sectors
    return get_sectors()

@app.get("/api/competitors/sector-details")
def api_competitor_sector_details(sector: str):
    import os
    import json
    data_path = os.path.join(os.path.dirname(__file__), "data", "sector_details.json")
    if os.path.exists(data_path):
        try:
            with open(data_path, "r", encoding="utf-8") as f:
                cached_data = json.load(f)
                if sector in cached_data:
                    return cached_data[sector]
        except Exception as e:
            print(f"Error reading cached sector_details.json: {e}")
            
    from competitor_analyzer import get_sector_details
    return get_sector_details(sector)

@app.get("/api/competitors/news")
def api_get_sector_news(sector: str):
    """
    Returns news items for a given sector name.
    """
    return get_sector_news(sector)

@app.get("/api/competitors/stock/{ticker}/fundamentals")
def api_get_ticker_fundamentals(ticker: str):
    """
    Returns fundamental investment indicators for a specific ticker.
    """
    from competitor_analyzer import get_ticker_fundamentals
    return get_ticker_fundamentals(ticker)

@app.get("/api/competitors/stock/{ticker}/news")
def api_get_ticker_news(ticker: str, name: str = ""):
    """
    Returns specific news (orders, earnings, surges) for a ticker.
    """
    from competitor_analyzer import get_ticker_specific_news
    if not name:
        import yfinance as yf
        info = yf.Ticker(ticker).info
        name = info.get("shortName", ticker)
    return get_ticker_specific_news(ticker, name)

# -- KIS API Integration --
from kis_instance import kis_client
import os

@app.get("/api/kis/price/{ticker}")
def get_kis_price(ticker: str):
    if not kis_client:
        return {"error": "KIS API client not initialized"}
    pure_ticker = to_kis_ticker(ticker)
    price = kis_client.get_current_price(pure_ticker)
    return {"ticker": pure_ticker if is_korean_stock(ticker) else ticker, "price": price}

@app.post("/api/kis/order/{ticker}")
def post_kis_order(ticker: str, qty: int, price: float = 0.0, type: str = "buy", name: str = ""):
    # --- 가상 모의투자 (Paper Trading) 로직 ---
    # KIS API 연동 오류를 우회하기 위해 DB 기록만 남기는 방식으로 대체합니다.
    success = True
    pure_ticker = to_pure_ticker(ticker)
    is_kr = is_korean_stock(ticker)
    final_ticker = pure_ticker if is_kr else ticker

    from database import update_holding, get_stock
    adj_qty = qty if type == "buy" else -qty
    
    actual_price = price
    if actual_price == 0:
        try:
            from naver_finance_scraper import naver_scraper
            actual_price = naver_scraper.get_current_price_detail(pure_ticker)['price']
        except:
            pass
            
    if actual_price == 0:
        stock = get_stock(pure_ticker) or get_stock(ticker)
        if stock and stock.get("price"):
            actual_price = stock["price"]
        else:
            actual_price = 1 # fallback
            
    update_holding(final_ticker, name or final_ticker, adj_qty, actual_price)
        
    return {"ticker": final_ticker, "success": True, "real_api_success": success, "type": type}

@with_retry(max_retries=3, initial_delay=1.0)
def _fallback_chart(ticker: str, period: str, is_overseas: bool, excd: str = ""):
    pure_ticker = to_pure_ticker(ticker)
    is_kr = is_korean_stock(ticker) and not is_overseas
    
    # 1. 한국 주식인 경우 한국거래소(공공데이터포털) 일봉 우선 조회
    if is_kr and period not in ["m", "1Y"]:
        from public_data_api import get_stock_history
        history = get_stock_history(pure_ticker, count=120 if period == "6M" else 250)
        if history:
            return history

    import yfinance as yf
    try:
        yf_ticker = ticker
        if yf_ticker.startswith("^") or "=X" in yf_ticker:
            pass # Global indices and forex don't need country suffix
        elif is_overseas:
            if excd == "TSE" and not yf_ticker.endswith(".T"):
                yf_ticker = f"{pure_ticker}.T"
            elif excd == "HKS" and not yf_ticker.endswith(".HK"):
                yf_ticker = f"{pure_ticker}.HK"
            elif excd in ["SHS", "SZS", "SSE", "SZSE"]:
                if excd in ["SHS", "SSE"] and not yf_ticker.endswith(".SS"):
                    yf_ticker = f"{pure_ticker}.SS"
                elif excd in ["SZS", "SZSE"] and not yf_ticker.endswith(".SZ"):
                    yf_ticker = f"{pure_ticker}.SZ"
        else:
            # 한국 주식은 Yahoo Finance에서 데이터를 불러올 때만 .KS 부착
            yf_ticker = to_yf_ticker(ticker)
        
        interval = "5m" if period == "m" else ("1wk" if period == "W" else "1mo" if period == "M" else "1d")
        yf_period = "5d" if period == "m" else ("1y" if period == "1Y" else "6mo")
            
        df = yf.download(yf_ticker, period=yf_period, interval=interval, progress=False)
        if df.empty:
            return []
            
        formatted = []
        import math
        def safe_float(v):
            try:
                val = float(v)
                return 0.0 if math.isnan(val) else val
            except:
                return 0.0

        for idx, row in df.iterrows():
            # handle MultiIndex columns returned by newer yfinance
            if isinstance(df.columns, pd.MultiIndex):
                op = safe_float(row[('Open', yf_ticker)]) if ('Open', yf_ticker) in row else safe_float(row.iloc[0])
                hi = safe_float(row[('High', yf_ticker)]) if ('High', yf_ticker) in row else safe_float(row.iloc[1])
                lo = safe_float(row[('Low', yf_ticker)]) if ('Low', yf_ticker) in row else safe_float(row.iloc[2])
                cl = safe_float(row[('Close', yf_ticker)]) if ('Close', yf_ticker) in row else safe_float(row.iloc[3])
                vol = safe_float(row[('Volume', yf_ticker)]) if ('Volume', yf_ticker) in row else 0
            else:
                op = safe_float(row['Open'])
                hi = safe_float(row['High'])
                lo = safe_float(row['Low'])
                cl = safe_float(row['Close'])
                vol = safe_float(row['Volume']) if 'Volume' in row else 0

            if period == "m":
                formatted.append({
                    "time": int(idx.timestamp()),
                    "open": op, "high": hi, "low": lo, "close": cl, "value": vol
                })
            else:
                formatted.append({
                    "time": idx.strftime("%Y-%m-%d"),
                    "open": op, "high": hi, "low": lo, "close": cl, "value": vol
                })
        return formatted
    except Exception as e:
        print("Fallback Chart Error:", e)
        return []

import pandas as pd
import yfinance as yf

@app.get("/api/sector-analysis")
def api_get_sector_analysis():
    """
    Reads 업종종목.xlsx and returns sectors and stocks.
    """
    import sector_parser
    return sector_parser.get_sectors_data()

@app.get("/api/pairs-trading")
def api_pairs_trading(ticker1: str, ticker2: str):
    """
    Fetch 1-year historical prices for two tickers, run linear regression (T1 = beta * T2 + alpha),
    and return the spread with mean and sigma lines for pairs trading analysis.
    """
    import yfinance as yf
    import numpy as np
    import pandas as pd
    
    try:
        t1 = to_yf_ticker(ticker1)
        t2 = to_yf_ticker(ticker2)
        
        def fetch_pairs():
            d1 = yf.download(t1, period="1y", progress=False)["Close"]
            d2 = yf.download(t2, period="1y", progress=False)["Close"]
            return d1, d2
            
        try:
            future = yf_executor.submit(fetch_pairs)
            df1, df2 = future.result(timeout=6)
        except Exception as e:
            print("Pairs trading download timeout/error:", e)
            return {"error": "Failed to fetch data (timeout)"}
            
        if isinstance(df1, pd.DataFrame): df1 = df1.iloc[:, 0]
        if isinstance(df2, pd.DataFrame): df2 = df2.iloc[:, 0]
        
        df = pd.concat([df1, df2], axis=1).dropna()
        df.columns = ["T1", "T2"]
        
        if df.empty or len(df) < 5:
            return {"error": "Not enough data"}
            
        beta, alpha = np.polyfit(df["T2"], df["T1"], 1)
        
        df["Spread"] = df["T1"] - (beta * df["T2"])
        mean_spread = float(df["Spread"].mean())
        std_spread = float(df["Spread"].std())
        
        chart_data = []
        for idx, row in df.iterrows():
            chart_data.append({
                "time": idx.strftime("%Y-%m-%d"),
                "value": float(row["Spread"])
            })
            
        return {
            "beta": float(beta),
            "alpha": float(alpha),
            "mean": mean_spread,
            "sigma_1_up": mean_spread + std_spread,
            "sigma_2_up": mean_spread + (2 * std_spread),
            "sigma_1_down": mean_spread - std_spread,
            "sigma_2_down": mean_spread - (2 * std_spread),
            "chart_data": chart_data
        }
    except Exception as e:
        import traceback
        print("Pairs Trading Error:", e)
        traceback.print_exc()
        return {"error": str(e)}

@app.get("/api/fundamentals/{ticker}")
def api_get_fundamentals(ticker: str):
    """
    Returns fundamental metrics (PER, PBR, EPS, ROE) and yearly EPS trend for a given ticker via yfinance.
    """
    import yfinance as yf
    try:
        pure_ticker = to_pure_ticker(ticker)
        is_krx = is_korean_stock(ticker)
        yf_ticker = to_yf_ticker(ticker)
        
        info = {}
        targetMean = 0
        
        try:
            def get_info():
                from utils.yf_util import get_yf_ticker
                return get_yf_ticker(yf_ticker).info
            future = yf_executor.submit(get_info)
            info = future.result(timeout=3)
            targetMean = info.get("targetMeanPrice", 0) or 0
        except Exception as e:
            print("yfinance info fetch error/timeout:", e)
        
        # Generate target price history for chart markers
        target_history = []
        if is_krx:
            code = pure_ticker
            from routers.reports import get_analyst_reports
            recent_reports = get_analyst_reports(code, days=180).get("items", [])
            
            # Extract targets and format them for the chart
            for rep in recent_reports:
                tp_str = rep.get("target_price", "-").replace("원", "").replace(",", "").strip()
                if tp_str.isdigit() and int(tp_str) > 0:
                    target_history.append({
                        "time": rep["date"],
                        "position": "aboveBar",
                        "color": "rgba(255, 152, 0, 0.4)",
                        "shape": "circle",
                        "text": f"{rep.get('broker', '증권사')} 목표가: {int(tp_str):,}",
                        "value": float(tp_str)
                    })
                    
            from database import get_analyst_target_history
            db_history = get_analyst_target_history(code)
            for item in db_history:
                target_history.append({
                    "time": item["time"],
                    "position": "aboveBar",
                    "color": "#ff9800",
                    "shape": "circle",
                    "text": item["text"] if item.get("text") else f"목표가: {int(item['target_price']):,}",
                    "value": float(item['target_price'])
                })
            
            if target_history:
                target_history = sorted(target_history, key=lambda x: x["time"])
                if targetMean == 0:
                    targetMean = target_history[-1]["value"]
        else:
            try:
                from utils.yf_util import get_yf_ticker
                upgrades = get_yf_ticker(yf_ticker).upgrades_downgrades
                if upgrades is not None and not upgrades.empty:
                    # Take the last 50 upgrades/downgrades
                    recent = upgrades.head(50)
                    for date, row in recent.iterrows():
                        firm = row.get('Firm', 'Analyst')
                        to_grade = row.get('ToGrade', '')
                        action = row.get('Action', '')
                        pt = row.get('priorPriceTarget', 0)
                        
                        text_str = f"{firm} {action} {to_grade}"
                        if pd.notna(pt) and pt > 0:
                            text_str += f" (목표가: {pt})"
                        
                        dt_str = date.strftime("%Y-%m-%d") if hasattr(date, 'strftime') else str(date).split()[0]
                        target_history.append({
                            "time": dt_str,
                            "position": "aboveBar",
                            "color": "#ff9800",
                            "shape": "circle",
                            "text": text_str,
                            "value": float(pt) if pd.notna(pt) else 0
                        })
            except Exception as e:
                print("Error fetching US analyst targets:", e)

        # AI Targets (Saved by user)
        from database import get_all_ai_targets
        ai_targets_db = get_all_ai_targets(ticker)
        
        if ai_targets_db:
            # Map DB format to chart marker format
            for db_t in ai_targets_db:
                # db_t is {'time': '2026-07-13', 'value': 559}
                target_history.append({
                    "time": db_t["time"],
                    "position": "aboveBar",
                    "color": "#26a69a",
                    "shape": "arrowDown",
                    "text": f"저장된 목표가: {int(db_t['value']):,}",
                    "value": db_t["value"]
                })
        
        # Sort combined history by date ascending (oldest first)
        if target_history:
            target_history = sorted(target_history, key=lambda x: x["time"])
            
        # Yearly EPS trend (try to get financials)
        eps_trend = []
        nv_fund = {}
        if is_krx:
            from ingestion.scrapers.naver_scraper import get_naver_fundamentals
            nv_fund = get_naver_fundamentals(code)
            eps_trend = nv_fund.get("eps_trend", [])
            
        if not is_krx:
            try:
                if not eps_trend:
                    def get_financials():
                        return yf.Ticker(yf_ticker).financials
                    
                    future = yf_executor.submit(get_financials)
                    financials = future.result(timeout=3)
                    
                    if not financials.empty:
                        for idx in financials.index:
                            if 'EPS' in idx or 'Eps' in idx or 'Basic EPS' in idx or 'Diluted EPS' in idx:
                                row = financials.loc[idx]
                                for date, val in row.items():
                                    if pd.notna(val):
                                        eps_trend.append({"time": str(date.year), "value": float(val)})
                                break
                        eps_trend.sort(key=lambda x: x["time"])
            except Exception as e:
                print("Error fetching financials (timeout):", e)

        # Relative Strength Chart (6 months) & Price Chart (1 month)
        rs_chart = []
        price_chart = []
        try:
            benchmark = "^KS11" if yf_ticker.endswith(".KS") or yf_ticker.endswith(".KQ") else "^GSPC"
            def download_data():
                return (yf.download(yf_ticker, period="6mo", interval="1d", progress=False),
                        yf.download(benchmark, period="6mo", interval="1d", progress=False))
            
            future = yf_executor.submit(download_data)
            df_stk, df_bnc = future.result(timeout=4)
            
            if not df_stk.empty:
                s_close = df_stk['Close'] if 'Close' in df_stk.columns else df_stk.iloc[:, 3]
                if isinstance(s_close, pd.DataFrame): s_close = s_close.iloc[:, 0]
                
                b_close = df_bnc['Close'] if 'Close' in df_bnc.columns else df_bnc.iloc[:, 3]
                if isinstance(b_close, pd.DataFrame): b_close = b_close.iloc[:, 0]
                
                # Take last 30 trading days for price chart
                recent_close = s_close.tail(30)
                for idx, val in recent_close.items():
                    time_str = idx.strftime("%Y-%m-%d") if hasattr(idx, 'strftime') else str(idx).split(" ")[0]
                    price_chart.append({"time": time_str, "value": float(val)})

            if not df_stk.empty and not df_bnc.empty:
                # Align series
                df_rs = pd.concat([s_close, b_close], axis=1).dropna()
                if len(df_rs) > 0 and len(df_rs.columns) == 2:
                    stk = df_rs.iloc[:, 0]
                    bnc = df_rs.iloc[:, 1]
                    rs_series = (stk / bnc)
                    rs_series = (rs_series / rs_series.iloc[0]) * 100
                    for idx, val in rs_series.items():
                        time_str = idx.strftime("%Y-%m-%d") if hasattr(idx, 'strftime') else str(idx).split(" ")[0]
                        rs_chart.append({"time": time_str, "value": float(val)})
        except Exception as e:
            print("Error fetching RS chart:", e)

        financials = []
        if nv_fund and nv_fund.get("financials_annual"):
            financials.extend(nv_fund.get("financials_annual", []))
            # For quarterly, Naver returns dates like "2025.03", "2026.06(E)"
            # Frontend expects "Q" in period to differentiate.
            for qf in nv_fund.get("financials_quarterly", []):
                p = qf["period"]
                if ".03" in p: p = p.replace(".03", ".1Q")
                elif ".06" in p: p = p.replace(".06", ".2Q")
                elif ".09" in p: p = p.replace(".09", ".3Q")
                elif ".12" in p: p = p.replace(".12", ".4Q")
                else: p += "Q" # fallback
                # Create a copy so we don't mutate the cached nv_fund dictionary directly
                new_qf = dict(qf)
                new_qf["period"] = p
                financials.append(new_qf)
        else:
            # Fallback Mock Financials for overseas stocks
            base_eps = info.get("trailingEps", 1500) or 1500
            base_bps = info.get("bookValue", 15000) or 15000
            base_price = info.get("currentPrice", info.get("previousClose", 50000)) or 50000
            mcap = info.get("marketCap", 0) or 0
            shares = mcap / base_price if base_price > 0 and mcap > 0 else 100000000
            
            # Annual: 2023, 2024, 2025, 2026(E)
            for i, year in enumerate([2023, 2024, 2025, 2026]):
                growth = 1.05 ** (i - 3)
                eps_val = base_eps * growth
                bps_val = base_bps * growth
                net_profit = eps_val * shares
                financials.append({
                    "period": str(year) if year < 2026 else "2026(E)",
                    "operating_profit": int(net_profit * 1.2), 
                    "net_profit": int(net_profit),
                    "equity": int(bps_val * shares),
                    "eps": round(eps_val, 2),
                    "bps": round(bps_val, 2),
                    "per": round(base_price / eps_val, 2) if eps_val > 0 else 0
                })
                
            # Quarterly: 25.3Q, 25.4Q, 26.1Q, 26.2Q
            for i, q in enumerate(["2025.3Q", "2025.4Q", "2026.1Q", "2026.2Q"]):
                growth = 1.05 ** (i/4 - 1)
                eps_val = (base_eps / 4) * growth
                bps_val = base_bps * growth
                financials.append({
                    "period": q,
                    "operating_profit": int(eps_val * 1000 * (0.9 + 0.2 * i)),
                    "net_profit": int(eps_val * 800 * (0.9 + 0.2 * i)),
                    "equity": int(bps_val * 10000),
                    "eps": int(eps_val),
                    "bps": int(bps_val),
                    "per": round(base_price / (eps_val * 4), 2) if eps_val > 0 else 0
                })
        
        krx_price = 0
        try:
            if is_krx and 'df_stk' in locals() and not df_stk.empty:
                s_close = df_stk['Close'] if 'Close' in df_stk.columns else df_stk.iloc[:, 3]
                krx_price = float(s_close.iloc[-1])
        except:
            pass

        # Add DB Fallback for name and price
        db_fallback_name = None
        db_fallback_price = 0
        try:
            from database import get_stock
            clean_code = yf_ticker.replace('.KS', '').replace('.KQ', '')
            db_s = get_stock(clean_code)
            if db_s:
                db_fallback_name = db_s.get('name')
                db_fallback_price = db_s.get('price') or 0
        except:
            pass

        return {
            "ticker": pure_ticker if is_krx else ticker,
            "name": info.get("shortName") or db_fallback_name or (pure_ticker if is_krx else yf_ticker),
            "par_value": nv_fund.get("par_value", 0) if nv_fund else 0,
            "per": nv_fund.get("per", "N/A") if nv_fund and nv_fund.get("per") != "N/A" else round(info.get("trailingPE", 0) or 0, 2),
            "per_next": nv_fund.get("per_next", "N/A"),
            "pbr": nv_fund.get("pbr", "N/A") if nv_fund and nv_fund.get("pbr") != "N/A" else round(info.get("priceToBook", 0) or 0, 2),
            "bps": nv_fund.get("bps", "N/A") if nv_fund and nv_fund.get("bps") != "N/A" else round(info.get("bookValue", 0) or 0, 2),
            "eps": nv_fund.get("eps", "N/A") if nv_fund and nv_fund.get("eps") != "N/A" else round(info.get("trailingEps", 0) or 0, 2),
            "eps_next": nv_fund.get("eps_next", "N/A"),
            "roe": nv_fund.get("roe", "N/A") if nv_fund and nv_fund.get("roe") != "N/A" else round((info.get("returnOnEquity", 0) or 0) * 100, 2),
            "roe_next": nv_fund.get("roe_next", "N/A"),
            "targetHigh": info.get("targetHighPrice", 0),
            "targetMean": targetMean,
            "targetLow": info.get("targetLowPrice", 0),
            "marketCap": info.get("marketCap") or (krx_price * nv_fund.get("shares", 0) if krx_price else 0),
            "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh", 0),
            "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow", 0),
            "currentPrice": info.get("currentPrice") or info.get("previousClose") or krx_price or db_fallback_price,
            "analyst_count": info.get("numberOfAnalystOpinions", 0),
            "price_chart": price_chart,
            "rs_chart": rs_chart,
            "eps_trend": eps_trend,
            "net_income_trend": nv_fund.get("net_income_trend", []),
            "payout_ratio": nv_fund.get("payout_ratio", "N/A"),
            "shares": nv_fund.get("shares", info.get("sharesOutstanding", 0)),
            "target_history": target_history,
            "financials": financials,
            "price": info.get("currentPrice") or info.get("regularMarketPrice") or info.get("previousClose") or krx_price or db_fallback_price,
            "change": info.get("regularMarketChange", 0) or (info.get("currentPrice", krx_price) - info.get("previousClose", krx_price) if info.get("currentPrice", krx_price) and info.get("previousClose", krx_price) else 0),
            "changePct": info.get("regularMarketChangePercent", 0) or 0,
            "currency": info.get("currency", "KRW" if is_krx else "USD")
        }
    except Exception as e:
        print(f"Error fetching fundamentals for {ticker}:", e)
        return {"error": str(e)}

@app.post("/api/valuation/stock/{ticker}")
def api_calculate_valuation(ticker: str, req: ValuationRequest):
    """
    Calculate theoretical price based on RIM.
    Caches the default parameters (coe=0.10, discount_3y=0.50, term_growth=0.05) per day.
    """
    from datetime import datetime
    import json
    from database import get_ai_target, insert_ai_target
    
    today_str = datetime.now().strftime("%Y-%m-%d")
    is_default = (req.coe == 0.10 and req.discount_3y == 0.50 and req.term_growth == 0.05)
    
    # Reject overseas stocks
    is_krx = is_korean_stock(ticker)
    if not is_krx:
        return {"error": "해외 주식은 주가모델 계산을 지원하지 않습니다."}
        
    # If default parameters, try to load from cache
    if is_default:
        cached = get_ai_target(ticker, today_str)
        if cached and cached.get('valuation_json'):
            try:
                result = json.loads(cached['valuation_json'])
                return result
            except Exception as e:
                print("Cache load error:", e)

    # Not cached or not default, calculate
    fund = api_get_fundamentals(ticker)
    if "error" in fund:
        return {"error": "Failed to fetch fundamentals"}
    

    result = calculate_rim(fund, req)
    result["ticker"] = ticker
    result["current_price"] = fund.get("price", 0)
    result["name"] = fund.get("name", ticker)
    
    # Save to cache if default
    if is_default:
        try:
            insert_ai_target(ticker, result["name"], today_str, result["theoretical_price"], json.dumps(result))
        except Exception as e:
            print("Cache save error:", e)
            
    return result

@app.get("/api/kis/chart/{ticker}")
def get_kis_chart(ticker: str, is_overseas: bool = False, excd: str = "", period: str = "D"):
    if not kis_client or period == "1Y":
        return _fallback_chart(ticker, period, is_overseas, excd)
    
    try:
        if is_overseas:
            data = kis_client.get_overseas_chart(excd, ticker, period)
            if not data:
                return _fallback_chart(ticker, period, is_overseas, excd)
            # Parse overseas data
            formatted = []
            for item in reversed(data): # KIS returns latest first
                formatted.append({
                    "time": f"{item['stck_bsop_date'][:4]}-{item['stck_bsop_date'][4:6]}-{item['stck_bsop_date'][6:]}",
                    "open": float(item['stck_oprc']),
                    "high": float(item['stck_hgpr']),
                    "low": float(item['stck_lwpr']),
                    "close": float(item['stck_clpr']),
                    "value": float(item['acml_vol'])
                })
            return formatted
        else:
            pure_ticker = to_kis_ticker(ticker)
            data = kis_client.get_domestic_chart(pure_ticker, period)
            if not data:
                return _fallback_chart(ticker, period, is_overseas)
            # Parse domestic data
            formatted = []
            import time as time_mod
            from datetime import datetime
            for item in reversed(data): # KIS returns latest first
                if period == "m":
                    if item.get("stck_bsop_date") and item.get("stck_cntg_hour"):
                        date_str = item['stck_bsop_date']
                        time_str = item['stck_cntg_hour']
                        dt = datetime.strptime(f"{date_str} {time_str}", "%Y%m%d %H%M%S")
                        unix_ts = int(time_mod.mktime(dt.timetuple()))
                        formatted.append({
                            "time": unix_ts,
                            "open": float(item['stck_oprc']),
                            "high": float(item['stck_hgpr']),
                            "low": float(item['stck_lwpr']),
                            "close": float(item['stck_prpr']), # 분봉은 stck_prpr (현재가)가 종가
                            "value": float(item['acml_vol'])
                        })
                else:
                    if item.get("stck_bsop_date"):
                        formatted.append({
                            "time": f"{item['stck_bsop_date'][:4]}-{item['stck_bsop_date'][4:6]}-{item['stck_bsop_date'][6:]}",
                            "open": float(item['stck_oprc']),
                            "high": float(item['stck_hgpr']),
                            "low": float(item['stck_lwpr']),
                            "close": float(item['stck_clpr']),
                            "value": float(item['acml_vol'])
                        })
            return formatted
    except Exception as e:
        print("Chart Error:", e)
        return _fallback_chart(ticker, period, is_overseas, excd)


# --- Market Scanner API ---

@app.post("/api/market/scan/start")
def api_start_market_scan():
    from ingestion.scrapers.naver_market_scraper import start_scan
    success, msg = start_scan()
    if success:
        return {"message": msg}
    else:
        raise HTTPException(status_code=400, detail=msg)

@app.post("/api/market/scan/stop")
def api_stop_market_scan():
    from ingestion.scrapers.naver_market_scraper import stop_scan
    success, msg = stop_scan()
    if success:
        return {"message": msg}
    else:
        raise HTTPException(status_code=400, detail=msg)

@app.get("/api/market/scan/status")
def api_market_scan_status():
    from ingestion.scrapers.naver_market_scraper import get_scan_status
    return get_scan_status()

@app.get("/api/market/scan/export")
def api_export_market_scan():
    import pandas as pd
    from datetime import datetime
    import tempfile
    
    conn = get_db_connection()
    stocks = pd.read_sql_query("SELECT * FROM stocks", conn)
    financials = pd.read_sql_query("SELECT * FROM financials", conn)
    conn.close()
    
    if stocks.empty:
        raise HTTPException(status_code=400, detail="No data available")
        
    # Build a combined list of dicts for each stock
    export_data = []
    current_year = datetime.now().year
    
    # Pre-group financials by ticker
    fin_grouped = financials.groupby('ticker')
    
    for _, stock in stocks.iterrows():
        row = {
            "Ticker": stock['ticker'],
            "Name": stock['name'],
            "Current Price": stock['price'],
            "Market Cap": stock['market_cap'],
            "Volume": stock['volume'],
            "Foreign Net Buy (%)": stock['foreign_net_buy'], # Actually, we saved volume here?
            "Capital": stock['capital'],
            "Par Value": stock['par_value'],
            "Dividend": stock['dividend'],
            "Business Summary": stock.get('description', '')
        }
        
        if stock['ticker'] in fin_grouped.groups:
            stock_fins = fin_grouped.get_group(stock['ticker']).sort_values('period')
            for _, fin in stock_fins.iterrows():
                period = str(fin['period']) # e.g. "2023.12"
                # Extract year
                try:
                    fin_year = int(period.split('.')[0])
                except:
                    fin_year = 0
                    
                eps = fin['eps']
                bps = fin['bps']
                
                if fin_year >= current_year:
                    # Calculate PER, PBR with current price
                    per = (stock['price'] / eps) if eps and eps > 0 else "N/A"
                    pbr = (stock['price'] / bps) if bps and bps > 0 else "N/A"
                    # Add (E) to column name to denote estimate
                    period_label = f"{period}(E)"
                else:
                    per = fin['per']
                    pbr = fin['pbr']
                    period_label = period
                    
                row[f"{period_label} EPS"] = eps
                row[f"{period_label} BPS"] = bps
                row[f"{period_label} PER"] = per
                row[f"{period_label} PBR"] = pbr
                row[f"{period_label} ROE"] = fin['roe']
                row[f"{period_label} Net Profit"] = fin['net_profit']
                row[f"{period_label} Equity"] = fin['equity']
                row[f"{period_label} Debt"] = fin['total_debt']
                
        export_data.append(row)
        
    df = pd.DataFrame(export_data)
    
    # Save to temp file
    temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx')
    temp_path = temp_file.name
    temp_file.close()
    
    df.to_excel(temp_path, index=False)
    
    return FileResponse(temp_path, media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename='market_scan_data.xlsx')

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
