import requests
from bs4 import BeautifulSoup

url = "https://finance.naver.com/sise/sise_group_detail.naver?type=upjong&no=330"
headers = {"User-Agent": "Mozilla/5.0"}

res = requests.get(url, headers=headers)
res.encoding = 'euc-kr' # Naver Finance uses euc-kr
soup = BeautifulSoup(res.text, 'html.parser')

table = soup.find('table', {'class': 'type_5'})
if table:
    rows = table.find_all('tr')
    for row in rows:
        cols = row.find_all('td')
        if len(cols) > 0 and cols[0].find('a'):
            name = cols[0].find('a').text
            href = cols[0].find('a')['href']
            ticker = href.split('code=')[-1]
            print(f"Name: {name}, Ticker: {ticker}")
else:
    print("Table not found")
