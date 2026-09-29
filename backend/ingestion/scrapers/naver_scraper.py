import requests
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

def get_naver_fundamentals(code: str):
    clean_code = str(code).split(':')[-1].replace('.KS', '').replace('.KQ', '').replace('.ks', '').replace('.kq', '').strip()
    headers = {'User-Agent': 'Mozilla/5.0'}
    fund_data = {
        'per': 'N/A', 'per_next': 'N/A',
        'eps': 'N/A', 'eps_next': 'N/A',
        'bps': 'N/A', 'bps_next': 'N/A',
        'pbr': 'N/A', 'pbr_next': 'N/A',
        'roe': 'N/A', 'roe_next': 'N/A',
        'roa': 'N/A', 'eps_trend': [],
        'net_income_trend': [], 'payout_ratio': 'N/A',
        'shares': 'N/A',
        'financials_annual': [], 'financials_quarterly': []
    }
    
    try:
        # 1. Integration (Current Valuation)
        res_int = requests.get(f'https://m.stock.naver.com/api/stock/{clean_code}/integration', headers=headers, timeout=5)
        if res_int.status_code == 200:
            for info in res_int.json().get('totalInfos', []):
                val_str = str(info.get('value', '')).replace(',', '').replace('배', '').replace('원', '').replace('%', '').strip()
                try:
                    v = float(val_str)
                    if info['code'] == 'per': fund_data['per'] = v
                    if info['code'] == 'eps': fund_data['eps'] = v
                    if info['code'] == 'pbr': fund_data['pbr'] = v
                    if info['code'] == 'bps': fund_data['bps'] = v
                    if info['code'] == 'cnsPer': fund_data['per_next'] = v
                    if info['code'] == 'cnsEps': fund_data['eps_next'] = v
                except ValueError: pass
        if fund_data['eps'] != 'N/A' and fund_data['bps'] != 'N/A' and fund_data['bps'] > 0:
            fund_data['roe'] = f"{round((fund_data['eps'] / fund_data['bps']) * 100, 2)}%"

        # 2. Financials Helper
        def parse_financials(period_type):
            res = requests.get(f'https://m.stock.naver.com/api/stock/{clean_code}/finance/{period_type}', headers=headers, timeout=5)
            financials = []
            if res.status_code != 200: return financials
            
            data = res.json().get('financeInfo', {})
            titles = data.get('trTitleList', [])
            row_list = data.get('rowList', [])
            
            # Init empty dicts for each period
            periods = {t['key']: {'period': t['title'].replace('.', '').strip(), 'is_estimate': t['isConsensus'] == 'Y'} for t in titles}
            
            for row in row_list:
                title = row.get('title', '').replace(' ', '')
                for key, col in row.get('columns', {}).items():
                    if key not in periods: continue
                    val_str = str(col.get('value', '')).replace(',', '')
                    try:
                        v = float(val_str)
                    except ValueError:
                        v = 0
                    
                    if '매출액' in title: periods[key]['revenue'] = v * 100000000
                    elif '영업이익' in title: periods[key]['operating_profit'] = v * 100000000
                    elif '당기순이익' in title: periods[key]['net_profit'] = v * 100000000
                    elif title == 'EPS(원)': periods[key]['eps'] = v
                    elif title == 'BPS(원)': periods[key]['bps'] = v
                    elif title == 'PER(배)': periods[key]['per'] = v
                    elif title == 'PBR(배)': periods[key]['pbr'] = v
                    elif title == 'ROE(%)': periods[key]['roe'] = v
            
            sorted_keys = sorted(list(periods.keys()))
            return [periods[k] for k in sorted_keys]

        # 3. Fetch Annual and Quarterly
        fund_data['financials_annual'] = parse_financials('annual')
        fund_data['financials_quarterly'] = parse_financials('quarterly')
        
        # Populate trends
        for ann in fund_data['financials_annual']:
            # time formatting for trend
            dt = ann['period']
            if len(dt) == 6: dt = f"{dt[:4]}-{dt[4:]}-31" # e.g. 202312 -> 2023-12-31
            if 'eps' in ann:
                fund_data['eps_trend'].append({
                    'time': dt,
                    'value': ann['eps'],
                    'is_estimate': ann.get('is_estimate', False)
                })
            if 'net_profit' in ann:
                fund_data['net_income_trend'].append({
                    'time': dt,
                    'value': ann['net_profit'],
                    'is_estimate': ann.get('is_estimate', False)
                })
                
    except Exception as e:
        print(f"Error fetching Naver fundamentals for {code}:", e)
        
    return fund_data


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

