import requests
import json

base_urls = [
    "https://api.stock.naver.com/marketindex/programTrend?pageSize=30&page=1",
    "https://api.stock.naver.com/marketindex/program/KOSPI?pageSize=30&page=1",
    "https://api.stock.naver.com/chart/programTrend?pageSize=30&page=1",
    "https://api.stock.naver.com/index/KOSPI/programTrend?pageSize=30&page=1",
    "https://api.stock.naver.com/stock/program/KOSPI?pageSize=30&page=1",
]

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

for u in base_urls:
    res = requests.get(u, headers=headers)
    print(f"URL: {u} | Status: {res.status_code}")
    if res.status_code == 200:
        print("Response Body:", res.text[:300])
