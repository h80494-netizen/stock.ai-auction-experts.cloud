import requests
import json
import re
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from database import insert_financials, get_db_connection

def fetch_fnguide_financials(ticker: str):
    """
    Fetches financial consensus data from FnGuide for the given ticker.
    Updates the 'financials' table in the database directly.
    """
    clean_ticker = ticker.split(':')[-1] if ':' in ticker else ticker
    if not clean_ticker.isdigit():
        return False

    url = f"https://comp.fnguide.com/SVO2/ASP/SVD_Main.asp?pGB=1&gicode=A{clean_ticker}&cID=&MenuYn=Y&ReportGB=&NewMenuID=101&stkGb=701"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
    }
    
    try:
        res = requests.get(url, headers=headers, verify=False, timeout=10)
        res.raise_for_status()
    except Exception as e:
        print(f"Error fetching FnGuide for {clean_ticker}: {e}")
        return False

    data_json_str = None
    for line in res.text.splitlines():
        if 'snpFinancial:' in line:
            match = re.search(r'snpFinancial:\s*(\{.*\})', line)
            if match:
                data_json_str = match.group(1)
                if data_json_str.endswith(','):
                    data_json_str = data_json_str[:-1]
                break

    if not data_json_str:
        print(f"Could not find snpFinancial data for {clean_ticker}")
        return False
        
    try:
        fin_data = json.loads(data_json_str)
    except Exception as e:
        print(f"Error parsing JSON for {clean_ticker}: {e}")
        return False
        
    header = fin_data.get('header', [])
    rows = fin_data.get('data', [])
    
    if not header or not rows:
        return False
        
    period_map = {}
    for h in header:
        yymm = h.get('YYMM', '')
        cd = h.get('CD', '')
        ep_chk = h.get('EP_CHK', '')
        if yymm and cd:
            y, m = yymm.split('/')
            q = (int(m) - 1) // 3 + 1
            is_estimate = (ep_chk and 'E' in ep_chk)
            
            val_idx = int(cd.replace('VAL', ''))
            
            if val_idx <= 4:
                period_str = f"{y}" + ("(E)" if is_estimate else "")
            else:
                period_str = f"{y}Q{q}" + ("(E)" if is_estimate else "")
                
            period_map[cd] = period_str
            
    def get_row_values(name1, name2=None):
        row1, row2 = {}, {}
        for r in rows:
            if r.get('NAME'):
                n = r['NAME'].strip()
                if name1 == n:
                    row1 = r
                if name2 and name2 == n:
                    row2 = r
        res = row1.copy()
        if row2:
            for k, v in row2.items():
                if v is not None and str(v).strip() != "":
                    if res.get(k) is None or str(res.get(k)).strip() == "":
                        res[k] = v
        return res
        
    revenue_row = get_row_values("매출액")
    op_row = get_row_values("영업이익", "영업이익(발표기준)")
    np_row = get_row_values("당기순이익", "당기순이익(지배)")
    equity_row = get_row_values("자본총계")
    debt_row = get_row_values("부채총계")
    eps_row = get_row_values("EPS")
    bps_row = get_row_values("BPS")
    per_row = get_row_values("PER")
    pbr_row = get_row_values("PBR")
    roe_row = get_row_values("ROE")

    def safe_float(v):
        if v is None or v == "": return 0.0
        try:
            if isinstance(v, str):
                v = v.replace(',', '')
            return float(v)
        except:
            return 0.0

    conn = get_db_connection()
    c = conn.cursor()

    c.execute('DELETE FROM financials WHERE ticker = ?', (clean_ticker,))
    
    for val_key, period_str in period_map.items():
        rev = safe_float(revenue_row.get(val_key))
        op = safe_float(op_row.get(val_key))
        np = safe_float(np_row.get(val_key))
        eq = safe_float(equity_row.get(val_key))
        debt = safe_float(debt_row.get(val_key))
        eps = safe_float(eps_row.get(val_key))
        bps = safe_float(bps_row.get(val_key))
        per = safe_float(per_row.get(val_key))
        pbr = safe_float(pbr_row.get(val_key))
        roe = safe_float(roe_row.get(val_key))
        
        rev_won = rev * 100000000
        op_won = op * 100000000
        np_won = np * 100000000
        eq_won = eq * 100000000
        debt_won = debt * 100000000
        
        c.execute('''
            INSERT INTO financials 
            (ticker, period, revenue, operating_profit, net_profit, equity, total_debt, eps, bps, per, pbr, roe)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (clean_ticker, period_str, rev_won, op_won, np_won, eq_won, debt_won, eps, bps, per, pbr, roe))

    conn.commit()
    conn.close()
    return True

if __name__ == "__main__":
    success = fetch_fnguide_financials("005930")
    print(f"Scrape success: {success}")
    
    conn = get_db_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM financials WHERE ticker='005930'")
    rows = c.fetchall()
    for r in rows:
        print(dict(r))
    conn.close()
