import requests
import json

urls_to_test = [
    "https://m.stock.naver.com/api/index/KOSPI/trend/program",
    "https://m.stock.naver.com/front-api/v1/market/program",
    "https://m.stock.naver.com/api/json/sise/sise_program.nhn",
    "https://m.stock.naver.com/api/stock/market/program/trend",
    "https://finance.naver.com/api/sise/program.nhn",
]

headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
}

for u in urls_to_test:
    try:
        res = requests.get(u, headers=headers)
        print(f"URL: {u} | Status: {res.status_code}")
        if res.status_code == 200:
            print("Response:", res.text[:200])
    except Exception as e:
        print(f"Error for {u}: {e}")
