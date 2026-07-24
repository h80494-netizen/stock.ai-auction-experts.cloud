from curl_cffi import requests
import json

headers = {
    'accept': '*/*',
    'accept-language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'origin': 'https://www.etf.com',
    'referer': 'https://www.etf.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

response = requests.get('https://api-prod.etf.com/v2/tool/monitor/drilldown', headers=headers, impersonate="chrome120")
print("Status code:", response.status_code)
if response.status_code == 200:
    data = response.json()
    print("Keys:", data.keys())
    for k in data.keys():
        if isinstance(data[k], list) and len(data[k]) > 0:
            print(f"Sample of {k}:", data[k][0])
        elif isinstance(data[k], dict):
            print(f"Sample of {k}:", list(data[k].keys())[:5])
        else:
            print(f"{k}:", data[k])
else:
    print(response.text[:500])
