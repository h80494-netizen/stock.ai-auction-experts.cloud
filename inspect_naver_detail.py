import requests
from bs4 import BeautifulSoup
import json

url = "https://finance.naver.com/sise/sise_program.naver"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}
res = requests.get(url, headers=headers)
soup = BeautifulSoup(res.text, 'html.parser')

# Check if there is __NEXT_DATA__ or json script
scripts = soup.find_all('script')
print(f"Total script tags: {len(scripts)}")
for s in scripts:
    if s.string and ('__NEXT_DATA__' in s.string or 'window.__INITIAL_STATE__' in s.string or 'program' in s.string.lower()):
        print("Found matching script content length:", len(s.string))
        if len(s.string) < 2000:
            print(s.string[:500])

# Inspect table rows
table = soup.find('table')
if table:
    rows = table.find_all('tr')
    print(f"\nTable Rows Count: {len(rows)}")
    for r in rows:
        cells = [c.text.strip() for c in r.find_all(['th', 'td'])]
        print("Row:", cells)
