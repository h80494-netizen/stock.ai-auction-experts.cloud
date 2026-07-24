import requests
import json

headers = {
    'accept': '*/*',
    'accept-language': 'ko-KR,ko;q=0.9,ja-JP;q=0.8,ja;q=0.7,en-US;q=0.6,en;q=0.5',
    'origin': 'https://www.etf.com',
    'priority': 'u=1, i',
    'referer': 'https://www.etf.com/',
    'sec-ch-ua': '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-site',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'
}

response = requests.get('https://api-prod.etf.com/v2/tool/monitor/drilldown', headers=headers)
print("Status code:", response.status_code)
if response.status_code == 200:
    data = response.json()
    print("Keys:", data.keys())
    # print sample of data
    for k in data.keys():
        if isinstance(data[k], list) and len(data[k]) > 0:
            print(f"Sample of {k}:", data[k][0])
        elif isinstance(data[k], dict):
            print(f"Sample of {k}:", list(data[k].keys())[:5])
        else:
            print(f"{k}:", data[k])
