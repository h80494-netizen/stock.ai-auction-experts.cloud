from typing import List, Dict, Any
from .base import BaseScraper
import urllib.parse
from datetime import datetime

class NaverScraper(BaseScraper):
    def __init__(self):
        super().__init__("Naver Finance")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        # Naver news search for the keyword (usually a company name like "삼성전자")
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://search.naver.com/search.naver?where=news&query={encoded_keyword}"
        soup = self.fetch_page(url)
        
        if not soup:
            return []
            
        news_items = []
        # Naver news search results are typically in list items with class 'bx' inside 'list_news'
        articles = soup.find_all('li', class_='bx', limit=10)
        
        for article in articles:
            title_tag = article.find('a', class_='news_tit')
            if not title_tag:
                continue
                
            title = title_tag.get('title') or title_tag.text
            link = title_tag.get('href')
            
            source_tag = article.find('a', class_='info press')
            source = source_tag.text.strip() if source_tag else "Unknown"
            
            # Simple snippet extraction
            snippet_tag = article.find('a', class_='api_txt_lines dsc_txt_wrap')
            snippet = snippet_tag.text.strip() if snippet_tag else ""
            
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "snippet": snippet,
                "language": "ko",
                "timestamp": datetime.now().isoformat() # Naver has relative time, using current time for MVP
            })
            
        return news_items

class InvestingKoreaScraper(BaseScraper):
    def __init__(self):
        super().__init__("Investing.co.kr")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        # Investing.co.kr requires search by ticker or company name. 
        # Using a general search endpoint for now.
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://kr.investing.com/search/?q={encoded_keyword}&tab=news"
        soup = self.fetch_page(url)
        
        if not soup:
            return []
            
        news_items = []
        # Investing.com search results format
        articles = soup.find_all('div', class_='articleItem', limit=10)
        
        for article in articles:
            title_tag = article.find('a', class_='title')
            if not title_tag:
                continue
                
            title = title_tag.text.strip()
            link = "https://kr.investing.com" + title_tag.get('href') if title_tag.get('href', '').startswith('/') else title_tag.get('href')
            
            details = article.find('div', class_='articleDetails')
            source = "Investing.com"
            if details:
                spans = details.find_all('span')
                if len(spans) > 0:
                    source = spans[0].text.strip()
            
            snippet_tag = article.find('p')
            snippet = snippet_tag.text.strip() if snippet_tag else ""
            
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "snippet": snippet,
                "language": "ko",
                "timestamp": datetime.now().isoformat()
            })
            
        return news_items

def get_naver_fundamentals(code: str) -> Dict[str, Any]:
    import requests
    from bs4 import BeautifulSoup
    url = f"https://finance.naver.com/item/main.naver?code={code}"
    try:
        res = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=5)
        soup = BeautifulSoup(res.text, 'html.parser')
        
        fund_data = {
            "per": "N/A", "per_next": "N/A",
            "eps": "N/A", "eps_next": "N/A",
            "bps": "N/A", "bps_next": "N/A",
            "pbr": "N/A", "pbr_next": "N/A",
            "roe": "N/A", "roe_next": "N/A",
            "roa": "N/A",
            "eps_trend": [],
            "net_income_trend": [],
            "payout_ratio": "N/A",
            "shares": "N/A"
        }
        
        # Shares and Par Value
        for th in soup.find_all('th'):
            if '상장주식수' in th.text:
                td = th.find_next('td')
                if td:
                    try:
                        fund_data['shares'] = int(td.text.strip().split()[0].replace(',', ''))
                    except:
                        pass
            elif '액면가' in th.text:
                td = th.find_next('td')
                if td:
                    try:
                        text_val = td.text.strip().split('원')[0].replace(',', '').strip()
                        fund_data['par_value'] = int(text_val)
                    except:
                        pass
        
        cop_table = soup.find('table', class_='tb_type1 tb_num tb_type1_ifrs')
        if not cop_table:
            return fund_data
            
        # Get dates
        thead_trs = cop_table.find('thead').find_all('tr')
        if len(thead_trs) < 2:
            return fund_data
            
        date_ths = thead_trs[1].find_all('th')
        yearly_dates = [th.text.strip() for th in date_ths[:4]]
        
        # Identify "This Year" and "Next Year" indices
        # We look for the last valid year, and check if it has (E)
        this_year_idx = -1
        next_year_idx = -1
        
        for i, d in enumerate(yearly_dates):
            if '(E)' in d:
                if this_year_idx == -1:
                    this_year_idx = i
                elif next_year_idx == -1:
                    next_year_idx = i
        
        # If no (E) is found, use the most recent actuals
        if this_year_idx == -1:
            this_year_idx = 3 # The latest year in the table (4th column)
            
        tbody = cop_table.find('tbody')
        rows = tbody.find_all('tr')
        
        def safe_float(val):
            val = val.strip().replace(',', '')
            try:
                return float(val)
            except:
                return "N/A"
                
        def get_vals(tr):
            return [td.text.strip() for td in tr.find_all('td')]
            
        rev_vals, op_vals, np_vals, eps_vals, per_vals, pbr_vals, bps_vals, roe_vals, po_vals = [], [], [], [], [], [], [], [], []
        
        for tr in rows:
            th = tr.find('th')
            if not th: continue
            title = th.text.strip().upper().replace(' ', '')
            if title == '매출액': rev_vals = get_vals(tr)
            elif title == '영업이익': op_vals = get_vals(tr)
            elif title == '당기순이익': np_vals = get_vals(tr)
            elif title.startswith('EPS'): eps_vals = get_vals(tr)
            elif title.startswith('PER'): per_vals = get_vals(tr)
            elif title.startswith('PBR'): pbr_vals = get_vals(tr)
            elif title.startswith('BPS'): bps_vals = get_vals(tr)
            elif title.startswith('ROE'): roe_vals = get_vals(tr)
            elif '배당성향' in title: po_vals = get_vals(tr)
                
        if np_vals:
            for i, date_str in enumerate(yearly_dates):
                v = safe_float(np_vals[i])
                if v != "N/A":
                    d_clean = date_str.replace('(E)', '').strip().replace('.', '-')
                    if len(d_clean) == 7: d_clean += '-31'
                    fund_data["net_income_trend"].append({"time": d_clean, "value": v * 100000000, "is_estimate": '(E)' in date_str})
                    
        if po_vals:
            for i in range(len(po_vals)-1, -1, -1):
                if po_vals[i].strip() and safe_float(po_vals[i]) != "N/A":
                    fund_data["payout_ratio"] = safe_float(po_vals[i]) / 100.0
                    break
                    
        if eps_vals:
            fund_data["eps"] = safe_float(eps_vals[this_year_idx])
            if next_year_idx != -1: fund_data["eps_next"] = safe_float(eps_vals[next_year_idx])
            for i, date_str in enumerate(yearly_dates):
                v = safe_float(eps_vals[i])
                if v != "N/A":
                    d_clean = date_str.replace('(E)', '').strip().replace('.', '-')
                    if len(d_clean) == 7: d_clean += '-31'
                    fund_data["eps_trend"].append({"time": d_clean, "value": v, "is_estimate": '(E)' in date_str})
                    
        if per_vals:
            fund_data["per"] = safe_float(per_vals[this_year_idx])
            if next_year_idx != -1: fund_data["per_next"] = safe_float(per_vals[next_year_idx])
            
        if pbr_vals:
            fund_data["pbr"] = safe_float(pbr_vals[this_year_idx])
            if next_year_idx != -1: fund_data["pbr_next"] = safe_float(pbr_vals[next_year_idx])
            
        if bps_vals:
            fund_data["bps"] = safe_float(bps_vals[this_year_idx])
            if next_year_idx != -1: fund_data["bps_next"] = safe_float(bps_vals[next_year_idx])
            
        if roe_vals:
            r = safe_float(roe_vals[this_year_idx])
            fund_data["roe"] = f"{r}%" if r != "N/A" else "N/A"
            if next_year_idx != -1:
                rn = safe_float(roe_vals[next_year_idx])
                fund_data["roe_next"] = f"{rn}%" if rn != "N/A" else "N/A"

        # Build full financials array
        financials = []
        quarterly_financials = []
        
        # Annual
        for i, date_str in enumerate(yearly_dates):
            if i >= len(rev_vals): break
            # Naver returns values in 억원 (100 million KRW). Our DB uses raw KRW. 
            # Multiply by 100,000,000
            rev = safe_float(rev_vals[i])
            op = safe_float(op_vals[i]) if op_vals else 0
            np = safe_float(np_vals[i]) if np_vals else 0
            equity = safe_float(bps_vals[i]) # proxy or N/A
            eps = safe_float(eps_vals[i]) if eps_vals else 0
            
            bps = safe_float(bps_vals[i]) if bps_vals else 0
            shares = fund_data.get('shares', 0)
            if shares == "N/A": shares = 0
            
            financials.append({
                "period": date_str.strip(),
                "revenue": rev * 100000000 if rev != "N/A" else 0,
                "operating_profit": op * 100000000 if op != "N/A" else 0,
                "net_profit": np * 100000000 if np != "N/A" else 0,
                "equity": bps * shares,
                "eps": eps if eps != "N/A" else 0,
                "bps": bps,
                "per": safe_float(per_vals[i]) if per_vals else 0
            })
            
        # Quarterly
        quarterly_dates = [th.text.strip() for th in date_ths[4:10]] if len(date_ths) >= 10 else []
        for i, date_str in enumerate(quarterly_dates):
            idx = 4 + i
            if idx >= len(rev_vals): break
            rev = safe_float(rev_vals[idx])
            op = safe_float(op_vals[idx]) if op_vals else 0
            np = safe_float(np_vals[idx]) if np_vals else 0
            eps = safe_float(eps_vals[idx]) if eps_vals else 0
            
            bps = safe_float(bps_vals[idx]) if bps_vals else 0
            shares = fund_data.get('shares', 0)
            if shares == "N/A": shares = 0
            
            quarterly_financials.append({
                "period": date_str.strip(),
                "revenue": rev * 100000000 if rev != "N/A" else 0,
                "operating_profit": op * 100000000 if op != "N/A" else 0,
                "net_profit": np * 100000000 if np != "N/A" else 0,
                "equity": bps * shares,
                "eps": eps if eps != "N/A" else 0,
                "bps": bps,
                "per": safe_float(per_vals[idx]) if per_vals else 0
            })
            
        fund_data["financials_annual"] = financials
        fund_data["financials_quarterly"] = quarterly_financials

        return fund_data
    except Exception as e:
        print(f"Failed to fetch Naver fundamentals for {code}: {e}")
        return {
            "per": "N/A", "per_next": "N/A",
            "eps": "N/A", "eps_next": "N/A",
            "bps": "N/A", "bps_next": "N/A",
            "pbr": "N/A", "pbr_next": "N/A",
            "roe": "N/A", "roe_next": "N/A",
            "roa": "N/A", "eps_trend": [],
            "financials_annual": [], "financials_quarterly": []
        }

def get_naver_target_history(code: str) -> list:
    import requests
    import re
    import json
    from datetime import datetime
    url = f'https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code}'
    try:
        res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        match = re.search(r'var chartData2 = (\{.*?\});', res.text)
        if match:
            data = json.loads(match.group(1))
            target_price = data.get('target_price', [])
            history = []
            for item in target_price:
                y = item.get('y')
                if y is not None:
                    # Convert JS timestamp (ms) to YYYY-MM-DD
                    dt = datetime.fromtimestamp(item['x'] / 1000.0)
                    history.append({
                        "time": dt.strftime("%Y-%m-%d"),
                        "position": "aboveBar",
                        "color": "#ff9800",
                        "shape": "circle",
                        "text": f"목표가: {int(y):,}"
                    })
            # Highlight the most recent target price
            if history:
                history[-1]['color'] = "#26a69a"
                history[-1]['text'] = history[-1]['text'].replace("목표가", "최근 목표가")
            return history
    except Exception as e:
        print(f"Failed to fetch Naver target history for {code}: {e}")
    return []

