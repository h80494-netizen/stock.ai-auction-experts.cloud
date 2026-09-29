import requests
from bs4 import BeautifulSoup
import time

_sector_cache = None
_last_fetch = 0
_kospi_100_cache = None
_kospi_last_fetch = 0
_kosdaq_100_cache = None
_kosdaq_last_fetch = 0

def get_kospi_100():
    global _kospi_100_cache, _kospi_last_fetch
    try:
        if _kospi_100_cache is not None and (time.time() - _kospi_last_fetch) < 3600:
            return _kospi_100_cache
    except NameError:
        pass
        
    try:
        res = requests.get('https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=100', headers={'User-Agent': 'Mozilla/5.0'})
        data = res.json()
        stocks = []
        for item in data.get('stocks', []):
            try:
                price = float(item['closePrice'].replace(',', ''))
                change_val = float(str(item['compareToPreviousClosePrice']).replace(',', ''))
                change_pct = float(item['fluctuationsRatio'])
                
                code = item.get('compareToPreviousPrice', {}).get('code')
                if code in ['4', '5']: # Falling or lower limit
                    change_val = -abs(change_val)
                    change_pct = -abs(change_pct)
                elif code in ['1', '2']: # Rising or upper limit
                    change_val = abs(change_val)
                    change_pct = abs(change_pct)

                mcap_str = item.get('marketValue', '0').replace(',', '')
                mcap = float(mcap_str) if mcap_str else 0.0
                vol_str = item.get('accumulatedTradingVolume', '0').replace(',', '')
                total_vol = int(vol_str) if vol_str else 0
                
                stocks.append({
                    'ticker': f"KRX:{item['itemCode']}",
                    'name': item['stockName'],
                    'price': price,
                    'change': change_val,
                    'changePct': change_pct,
                    'market_cap': mcap,
                    'total_volume': total_vol,
                    'ratio': 0.0,
                    'foreign_net_buy': 0,
                    'categories': []
                })
            except Exception as e:
                pass
                
        _kospi_100_cache = stocks
        _kospi_last_fetch = time.time()
        return stocks
    except Exception as e:
        print("Failed to fetch KOSPI 100:", e)
        try:
            return _kospi_100_cache if _kospi_100_cache else []
        except: return []

def get_kosdaq_100():
    global _kosdaq_100_cache, _kosdaq_last_fetch
    try:
        if _kosdaq_100_cache is not None and (time.time() - _kosdaq_last_fetch) < 3600:
            return _kosdaq_100_cache
    except NameError:
        pass
        
    try:
        res = requests.get('https://m.stock.naver.com/api/stocks/marketValue/KOSDAQ?page=1&pageSize=100', headers={'User-Agent': 'Mozilla/5.0'})
        data = res.json()
        stocks = []
        for item in data.get('stocks', []):
            try:
                price = float(item['closePrice'].replace(',', ''))
                change_val = float(str(item['compareToPreviousClosePrice']).replace(',', ''))
                change_pct = float(item['fluctuationsRatio'])
                
                code = item.get('compareToPreviousPrice', {}).get('code')
                if code in ['4', '5']: # Falling or lower limit
                    change_val = -abs(change_val)
                    change_pct = -abs(change_pct)
                elif code in ['1', '2']: # Rising or upper limit
                    change_val = abs(change_val)
                    change_pct = abs(change_pct)

                mcap_str = item.get('marketValue', '0').replace(',', '')
                mcap = float(mcap_str) if mcap_str else 0.0
                vol_str = item.get('accumulatedTradingVolume', '0').replace(',', '')
                total_vol = int(vol_str) if vol_str else 0
                
                stocks.append({
                    'ticker': f"KRX:{item['itemCode']}",
                    'name': item['stockName'],
                    'price': price,
                    'change': change_val,
                    'changePct': change_pct,
                    'market_cap': mcap,
                    'total_volume': total_vol,
                    'ratio': 0.0,
                    'foreign_net_buy': 0,
                    'categories': []
                })
            except Exception as e:
                pass
                
        _kosdaq_100_cache = stocks
        _kosdaq_last_fetch = time.time()
        return stocks
    except Exception as e:
        print("Failed to fetch KOSDAQ 100:", e)
        try:
            return _kosdaq_100_cache if _kosdaq_100_cache else []
        except: return []

def get_naver_sectors():
    global _sector_cache, _last_fetch
    
    if _sector_cache is not None and (time.time() - _last_fetch) < 3600:
        return _sector_cache
        
    url = "https://finance.naver.com/sise/sise_group.naver?type=upjong"
    headers = {"User-Agent": "Mozilla/5.0"}
    
    try:
        res = requests.get(url, headers=headers, timeout=5)
        res.encoding = 'euc-kr'
        soup = BeautifulSoup(res.text, 'html.parser')
        
        sector_mapping = {}
        
        table = soup.find('table', {'class': 'type_1'})
        if not table:
            return {}
            
        rows = table.find_all('tr')
        
        count = 0
        for row in rows:
            a_tag = row.find('a')
            if a_tag and 'href' in a_tag.attrs:
                sector_name = a_tag.text.strip()
                sector_url = "https://finance.naver.com" + a_tag['href']
                
                try:
                    s_res = requests.get(sector_url, headers=headers, timeout=3)
                    s_res.encoding = 'euc-kr'
                    s_soup = BeautifulSoup(s_res.text, 'html.parser')
                    s_table = s_soup.find('table', {'class': 'type_5'})
                    if s_table:
                        tbody = s_table.find('tbody')
                        for tr in tbody.find_all('tr'):
                            name_div = tr.find('div', {'class': 'name'})
                            if name_div:
                                s_a = name_div.find('a')
                                if s_a and 'code=' in s_a['href']:
                                    ticker = "KRX:" + s_a['href'].split('code=')[-1]
                                    if ticker not in sector_mapping:
                                        sector_mapping[ticker] = {"name": s_a.text.strip(), "categories": []}
                                    sector_mapping[ticker]["categories"].append(sector_name)
                except Exception as inner_e:
                    print(f"Failed to fetch sector {sector_name}: {inner_e}")
                
                count += 1
                if count >= 5: # 시간 단축을 위해 상승률 상위 5개 업종만
                    break
        
        _sector_cache = sector_mapping
        _last_fetch = time.time()
        return _sector_cache
        
    except Exception as e:
        print("Failed to fetch Naver sectors:", e)
        if _sector_cache is not None:
            return _sector_cache
        return {}

def get_sector_news(sector_name: str):
    """
    Scrapes Naver News for the given sector keyword.
    """
    url = f"https://search.naver.com/search.naver?where=news&query={sector_name}"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    news_items = []
    try:
        res = requests.get(url, headers=headers, timeout=5)
        soup = BeautifulSoup(res.text, 'html.parser')
        
        # Naver News items are usually inside a list with class 'list_news'
        articles = soup.find_all('li', class_='bx', limit=5)
        for article in articles:
            a_tag = article.find('a', class_='news_tit')
            if not a_tag:
                continue
                
            title = a_tag.get('title') or a_tag.text.strip()
            link = a_tag.get('href')
            
            info_group = article.find('div', class_='info_group')
            source = "Naver News"
            published = ""
            if info_group:
                source_tag = info_group.find('a', class_='info press')
                if source_tag:
                    source = source_tag.text.replace('언론사 선정', '').strip()
                else:
                    source_tag = info_group.find('span', class_='info press')
                    if source_tag:
                        source = source_tag.text.replace('언론사 선정', '').strip()
                        
                time_tag = info_group.find('span', class_='info')
                if time_tag:
                    published = time_tag.text.strip()
                    
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "published": published
            })
            
    except Exception as e:
        print(f"Failed to fetch news for sector {sector_name}:", e)
        
    return news_items
