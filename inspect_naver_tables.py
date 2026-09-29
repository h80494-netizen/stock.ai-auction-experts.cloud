import requests
from bs4 import BeautifulSoup

url = "https://finance.naver.com/sise/sise_program.naver"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
res = requests.get(url, headers=headers)
soup = BeautifulSoup(res.text, 'html.parser')

tables = soup.find_all('table')
print(f"Total tables: {len(tables)}")
for i, t in enumerate(tables):
    print(f"Table {i} class: {t.get('class')}")
    rows = t.find_all('tr')
    print(f"   Rows count: {len(rows)}")
    if len(rows) > 1:
        headers_th = [th.text.strip() for th in rows[0].find_all(['th', 'td'])]
        print(f"   Header/First row: {headers_th[:10]}")
