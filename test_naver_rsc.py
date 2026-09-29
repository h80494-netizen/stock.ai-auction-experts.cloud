import requests
import json
import re

url = "https://finance.naver.com/sise/sise_program.naver"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'RSC': '1',
    'Accept': 'text/x-component'
}

res = requests.get(url, headers=headers)
print("RSC Status:", res.status_code)
if res.status_code == 200:
    text = res.text
    print("Length:", len(text))
    # Search for date pattern YYYY-MM-DD or YYYY.MM.DD
    dates = re.findall(r'20\d{2}[\.\-]0[1-9]|1[0-2][\.\-]0[1-9]|[12]\d|3[01]', text)
    print("Sample dates found:", dates[:10])
    
    # Search for numbers / JSON payloads
    with open("rsc_out.txt", "w", encoding="utf-8") as f:
        f.write(text)
    print("Saved rsc_out.txt")
