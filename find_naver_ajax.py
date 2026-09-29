import requests
import re

url = "https://finance.naver.com/sise/sise_program.naver"
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
}

res = requests.get(url, headers=headers)
# Find all js script URLs inside
js_urls = re.findall(r'src="([^"]+\.js[^"]*)"', res.text)
print(f"Found {len(js_urls)} JS files.")

api_urls = set()
for js_path in js_urls[:15]:
    if js_path.startswith('/'):
        full_js = f"https://finance.naver.com{js_path}"
    else:
        full_js = js_path
    try:
        r = requests.get(full_js, headers=headers)
        # Find api endpoint patterns inside js
        found = re.findall(r'/(?:api|front-api|sise)/[a-zA-Z0-9_/-]+', r.text)
        for f in found:
            if 'program' in f.lower() or 'trend' in f.lower():
                api_urls.add(f)
    except Exception as e:
        pass

print("Discovered API candidate URLs from JS files:")
for a in api_urls:
    print(a)
