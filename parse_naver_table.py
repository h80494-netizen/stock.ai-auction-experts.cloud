import requests
from bs4 import BeautifulSoup
import pandas as pd

url = "https://finance.naver.com/sise/sise_program.naver"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

res = requests.get(url, headers=headers)
soup = BeautifulSoup(res.text, 'html.parser')

table = soup.find('table')
if table:
    rows = table.find_all('tr')
    print(f"Total rows in table: {len(rows)}")
    parsed_data = []
    for r in rows:
        cols = [c.text.strip().replace(',', '') for c in r.find_all(['th', 'td'])]
        if cols:
            parsed_data.append(cols)
    
    print("\nParsed Table Rows:")
    for row in parsed_data:
        print(row)
