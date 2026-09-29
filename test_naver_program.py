import requests
from bs4 import BeautifulSoup
import pandas as pd
import time

def parse_naver_program_page(page=1):
    url = f"https://finance.naver.com/sise/sise_program.naver?&page={page}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    res = requests.get(url, headers=headers)
    soup = BeautifulSoup(res.text, 'html.parser')
    
    tables = soup.find_all('table', class_='type_1')
    if not tables:
        print("No table found")
        return []
    
    table = tables[0]
    rows = table.find_all('tr')
    
    page_data = []
    for tr in rows:
        tds = tr.find_all('td')
        if len(tds) < 5:
            continue
        
        date = tds[0].text.strip()
        if not date or not date.replace('.', '').isdigit():
            continue
            
        # Extract values
        # Naver program table columns: 날짜 | 차익 (매도, 매수, 순매수) | 비차익 (매도, 매수, 순매수) | 전체 (매도, 매수, 순매수)
        row_vals = [td.text.strip().replace(',', '') for td in tds]
        page_data.append(row_vals)
        
    return page_data

print("Testing Naver Finance Program Trade Scraper...")
data_p1 = parse_naver_program_page(1)
print(f"Page 1 items count: {len(data_p1)}")
if len(data_p1) > 0:
    print("Sample row 0:", data_p1[0])
    print("Sample row 1:", data_p1[1])
