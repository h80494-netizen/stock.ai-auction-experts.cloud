import requests

def get_analyst_reports_new(keyword: str, days: int = 180):
    url = f"https://m.stock.naver.com/api/research/company?page=1&size=50"
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        res = requests.get(url, headers=headers, timeout=5)
        if res.status_code == 200:
            reports = []
            for item in res.json():
                if keyword in item.get('itemName', '') or keyword in item.get('title', '') or keyword in item.get('itemCode', ''):
                    
                    # fetch detail to get pdf url
                    pdf_url = ""
                    try:
                        detail_res = requests.get(f"https://m.stock.naver.com/api/research/company/{item['researchId']}", headers=headers, timeout=5)
                        if detail_res.status_code == 200:
                            pdf_url = detail_res.json().get('researchContent', {}).get('attachUrl', '')
                    except: pass
                    
                    reports.append({
                        "date": item.get('writeDate', ''),
                        "title": item.get('title', ''),
                        "target_price": "-", # Naver mobile list doesn't provide target price directly in the list
                        "opinion": "-", 
                        "author": "-",
                        "broker": item.get('brokerName', ''),
                        "pdf_url": pdf_url
                    })
                    if len(reports) >= 15:
                        break
            return {"items": reports}
    except Exception as e:
        print("Naver reports error:", e)
    return {"items": []}

print(get_analyst_reports_new('삼성전자'))
