import threading
import time
import requests
from bs4 import BeautifulSoup
import traceback

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

def get_market_sum_tickers(sosok=0):
    """
    sosok = 0 (KOSPI), 1 (KOSDAQ)
    Returns list of dicts: {'ticker': '005930', 'name': '삼성전자'}
    """
    global scan_status
    market_name = "KOSPI" if sosok == 0 else "KOSDAQ"
    tickers = []
    page = 1
    while True:
        if not scan_status.get("is_running", True):
            break
        scan_status["message"] = f"Fetching {market_name} tickers... (Page {page})"
        url = f"https://finance.naver.com/sise/sise_market_sum.naver?sosok={sosok}&page={page}"
        try:
            res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            res.encoding = 'euc-kr'
            soup = BeautifulSoup(res.text, 'html.parser')
            
            table = soup.find('table', class_='type_2')
            if not table:
                break
                
            tbody = table.find('tbody')
            rows = tbody.find_all('tr')
            
            added_in_page = 0
            for tr in rows:
                if 'onmouseover' not in tr.attrs:
                    continue
                
                a_tag = tr.find('a', class_='tltle')
                if not a_tag:
                    continue
                    
                name = a_tag.text.strip()
                href = a_tag.get('href', '')
                code = href.split('code=')[-1]
                if code and name:
                    tickers.append({'ticker': code, 'name': name})
                    added_in_page += 1
            
            if added_in_page == 0:
                break
                
            if added_in_page < 50:
                break
                
            page += 1
            time.sleep(0.5)
        except Exception as e:
            print(f"Error fetching market sum page {page} for sosok {sosok}: {e}")
            break
            
    return tickers

def safe_float(val_str):
    try:
        if not val_str or val_str.strip() == '-' or val_str.strip() == 'N/A':
            return 0.0
        return float(val_str.strip().replace(',', ''))
    except:
        return 0.0

def fetch_stock_details(ticker):
    url = f"https://finance.naver.com/item/main.naver?code={ticker}"
    res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
    res.encoding = 'euc-kr'
    soup = BeautifulSoup(res.text, 'html.parser')
    
    data = {
        "price": 0.0,
        "market_cap": 0.0,
        "volume": 0.0,
        "foreign_net_buy": 0.0,
        "par_value": 0.0,
        "capital": 0.0,
        "dividend": 0.0,
        "outstanding_shares": 0.0,
        "description": "",
        "financials": []
    }
    
    no_today = soup.find('p', class_='no_today')
    if no_today:
        blind = no_today.find('span', class_='blind')
        if blind:
            data['price'] = safe_float(blind.text)
            
    trade_info_div = soup.find('div', class_='rate_info')
    if trade_info_div:
        info_table = trade_info_div.find('table', class_='no_info')
        if info_table:
            tds = info_table.find_all('td')
            for td in tds:
                text = td.text.replace('\n', '')
                if '거래량' in text:
                    span = td.find('span', class_='blind')
                    if span:
                        data['volume'] = safe_float(span.text)
                        
    tab_con1 = soup.find('div', id='tab_con1')
    if tab_con1:
        first_table = tab_con1.find('table', summary="시가총액 정보")
        if first_table:
            trs = first_table.find_all('tr')
            for tr in trs:
                th = tr.find('th')
                td = tr.find('td')
                if th and td:
                    th_text = th.text.strip()
                    if '상장주식수' in th_text:
                        data['outstanding_shares'] = safe_float(td.text)
                    elif '액면가' in th_text and '자본금' in th_text:
                        em_tags = td.find_all('em')
                        if len(em_tags) >= 2:
                            data['par_value'] = safe_float(em_tags[0].text.replace('원', '').replace('l', ''))
                            data['capital'] = safe_float(em_tags[1].text.replace('억원', '').replace('l', '')) * 100000000
    
    if data['price'] and data['outstanding_shares']:
        data['market_cap'] = data['price'] * data['outstanding_shares']
        
    summary_div = soup.select_one(".summary_info p")
    if summary_div:
        for br in summary_div.find_all("br"):
            br.replace_with("\n")
        data['description'] = summary_div.get_text(separator=" ", strip=True)
        
    cop_table = soup.find('table', class_='tb_type1 tb_num tb_type1_ifrs')
    if cop_table:
        thead_trs = cop_table.find('thead').find_all('tr')
        if len(thead_trs) >= 2:
            date_ths = thead_trs[1].find_all('th')
            yearly_dates = [th.text.strip() for th in date_ths[:4]]
            
            tbody = cop_table.find('tbody')
            rows = tbody.find_all('tr')
            
            def get_vals(tr):
                return [td.text.strip() for td in tr.find_all('td')]
                
            rev_vals, op_vals, np_vals, equity_vals, debt_vals, eps_vals, per_vals, pbr_vals, roe_vals, bps_vals, div_vals = [], [], [], [], [], [], [], [], [], [], []
            
            for tr in rows:
                th = tr.find('th')
                if not th: continue
                title = th.text.strip()
                if '매출액' in title: rev_vals = get_vals(tr)
                elif '영업이익' in title: op_vals = get_vals(tr)
                elif '당기순이익' in title: np_vals = get_vals(tr)
                elif '부채총계' in title: debt_vals = get_vals(tr)
                elif '자본총계' in title: equity_vals = get_vals(tr)
                elif 'EPS' in title: eps_vals = get_vals(tr)
                elif 'PER' in title: per_vals = get_vals(tr)
                elif 'PBR' in title: pbr_vals = get_vals(tr)
                elif 'BPS' in title: bps_vals = get_vals(tr)
                elif 'ROE' in title: roe_vals = get_vals(tr)
                elif '주당배당금' in title: div_vals = get_vals(tr)
                    
            this_year_idx = 3
            for i, d in enumerate(yearly_dates):
                if '(E)' in d:
                    this_year_idx = i - 1 if i > 0 else 0
                    break
                    
            if div_vals and len(div_vals) > this_year_idx:
                data['dividend'] = safe_float(div_vals[this_year_idx])
                
            for i, date_str in enumerate(yearly_dates):
                if i >= len(rev_vals): break
                op = safe_float(op_vals[i]) if op_vals else 0
                np = safe_float(np_vals[i]) if np_vals else 0
                equity = safe_float(equity_vals[i]) if equity_vals else 0
                debt = safe_float(debt_vals[i]) if debt_vals else 0
                eps = safe_float(eps_vals[i]) if eps_vals else 0
                bps = safe_float(bps_vals[i]) if bps_vals else 0
                per = safe_float(per_vals[i]) if per_vals else 0
                pbr = safe_float(pbr_vals[i]) if pbr_vals else 0
                roe = safe_float(roe_vals[i]) if roe_vals else 0
                
                data['financials'].append({
                    "period": date_str.replace('(E)', '').strip(),
                    "operating_profit": op * 100000000,
                    "net_profit": np * 100000000,
                    "equity": equity * 100000000,
                    "total_debt": debt * 100000000,
                    "eps": eps,
                    "bps": bps,
                    "per": per,
                    "pbr": pbr,
                    "roe": roe
                })
    return data


def scan_market_task():
    global scan_status
    scan_status["is_running"] = True
    scan_status["message"] = "Fetching KOSPI & KOSDAQ tickers..."
    scan_status["errors"] = 0
    
    try:
        kospi = get_market_sum_tickers(0)
        kosdaq = get_market_sum_tickers(1)
        all_tickers = kospi + kosdaq
        
        scan_status["total"] = len(all_tickers)
        scan_status["current"] = 0
        scan_status["message"] = "Scanning individual stocks..."
        
        for stock in all_tickers:
            if not scan_status["is_running"]:
                scan_status["message"] = "Stopped by user."
                break
                
            scan_status["current_ticker"] = stock['ticker']
            scan_status["current_name"] = stock['name']
            
            try:
                details = fetch_stock_details(stock['ticker'])
                
                insert_stock(
                    ticker=stock['ticker'],
                    name=stock['name'],
                    price=details['price'],
                    outstanding_shares=details['outstanding_shares'],
                    par_value=details['par_value'],
                    capital=details['capital'],
                    market_cap=details['market_cap'],
                    volume=details['volume'],
                    foreign_net_buy=details['foreign_net_buy'],
                    dividend=details['dividend'],
                    description=details['description']
                )
                
                # We need to upsert financials. The easiest way is to delete old and insert new.
                conn = get_db_connection()
                c = conn.cursor()
                c.execute('DELETE FROM financials WHERE ticker = ?', (stock['ticker'],))
                conn.commit()
                conn.close()
                
                for fin in details['financials']:
                    insert_financials(
                        ticker=stock['ticker'],
                        period=fin['period'],
                        op=fin['operating_profit'],
                        np=fin['net_profit'],
                        equity=fin['equity'],
                        debt=fin['total_debt'],
                        eps=fin['eps'],
                        bps=fin['bps'],
                        per=fin['per'],
                        pbr=fin['pbr'],
                        roe=fin['roe']
                    )
                
            except Exception as e:
                print(f"Error scanning {stock['ticker']} {stock['name']}: {e}")
                traceback.print_exc()
                scan_status["errors"] += 1
                
            scan_status["current"] += 1
            time.sleep(0.5) 
            
        if scan_status["is_running"]:
            scan_status["message"] = "Scan completed successfully."
            
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
