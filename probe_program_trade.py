import os
import sys
import requests

backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from kis_instance import kis_client

endpoints = [
    "/uapi/domestic-stock/v1/quotations/program-trade-by-daily",
    "/uapi/domestic-stock/v1/quotations/program-trade-trend",
    "/uapi/domestic-stock/v1/quotations/program-trade-by-stock",
    "/uapi/domestic-stock/v1/quotations/program-trade-by-stock-daily",
    "/uapi/domestic-stock/v1/quotations/comp-program-trade-daily",
    "/uapi/domestic-stock/v1/quotations/comp-program-trade-today",
    "/uapi/domestic-stock/v1/quotations/program-trade-by-market",
    "/uapi/domestic-stock/v1/quotations/program-trade-by-daily-total",
]

tr_ids = ["FHKST01010600", "FHPPG04650100", "FHPPG04650201", "FHKST01010400"]

print("Starting endpoint probes...")
for ep in endpoints:
    url = f"{kis_client.base_url}{ep}"
    for tr_id in tr_ids:
        headers = kis_client.get_headers(tr_id)
        params = {
            "FID_COND_MRKT_DIV_CODE": "J",
            "FID_INPUT_ISCD": "0001",
            "FID_INPUT_DATE_1": "20240101",
            "FID_INPUT_DATE_2": "20240131"
        }
        kis_client.rate_limiter.wait()
        try:
            res = requests.get(url, headers=headers, params=params)
            if res.status_code != 404:
                print(f"FOUND! EP: {ep}, TR_ID: {tr_id}, Status: {res.status_code}, Body: {res.text[:200]}")
        except Exception as e:
            pass
print("Probe finished.")
