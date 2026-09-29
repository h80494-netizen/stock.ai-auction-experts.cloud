import os
import sys
import requests
import json

backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from kis_instance import kis_client

urls_to_test = [
    "/uapi/domestic-stock/v1/quotations/program-trade-by-daily",
    "/uapi/domestic-stock/v1/quotations/program-trade-trend",
    "/uapi/domestic-stock/v1/quotations/program-trade-by-daily-total",
    "/uapi/domestic-stock/v1/quotations/program-trade-by-market",
    "/uapi/domestic-stock/v1/quotations/inquire-program-trade-by-daily",
    "/uapi/domestic-stock/v1/quotations/inquire-program-trade-trend",
    "/uapi/domestic-stock/v1/quotations/inquire-program-trade-daily",
    "/uapi/domestic-stock/v1/quotations/program-trade",
    "/uapi/domestic-stock/v1/quotations/program-trading-by-daily",
    "/uapi/domestic-stock/v1/quotations/program-trading-trend",
    "/uapi/domestic-stock/v1/quotations/inquire-daily-program-trade",
    "/uapi/domestic-stock/v1/quotations/daily-program-trade",
    "/uapi/domestic-stock/v1/quotations/comp-program-trade-daily",
    "/uapi/domestic-stock/v1/quotations/program-trade-by-stock",
]

tr_ids = ["FHKST01010600", "FHPPG04650100", "FHPPG04650201", "FHKST01010400", "FHKST03010100", "FHKST03010200"]

param_sets = [
    {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": "0001", "FID_INPUT_DATE_1": "20240101", "FID_INPUT_DATE_2": "20240131"},
    {"FID_COND_MRKT_DIV_CODE": "P", "FID_INPUT_ISCD": "0001", "FID_INPUT_DATE_1": "20240101", "FID_INPUT_DATE_2": "20240131"},
    {"FID_COND_MRKT_DIV_CODE": "U", "FID_INPUT_ISCD": "0001", "FID_INPUT_DATE_1": "20240101", "FID_INPUT_DATE_2": "20240131"},
    {"FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": "0001", "FID_PERIOD_DIV_CODE": "D", "FID_INPUT_DATE_1": "20240101", "FID_INPUT_DATE_2": "20240131"},
]

print("=== DEEP SEARCH FOR PROGRAM TRADE ENDPOINTS ===")
for ep in urls_to_test:
    url = f"{kis_client.base_url}{ep}"
    for tr in tr_ids:
        headers = kis_client.get_headers(tr)
        for p in param_sets:
            kis_client.rate_limiter.wait()
            try:
                res = requests.get(url, headers=headers, params=p)
                if res.status_code == 200:
                    data = res.json()
                    rt_cd = data.get("rt_cd", "")
                    msg1 = data.get("msg1", "")
                    output = data.get("output", data.get("output1", []))
                    if isinstance(output, list) and len(output) > 0:
                        first_keys = list(output[0].keys())
                        print(f"[FOUND VALID 200] EP={ep} | TR={tr} | keys={first_keys[:6]}...")
                        # print whole item
                        print("Sample item:", output[0])
                    elif isinstance(output, dict) and len(output) > 0:
                        print(f"[FOUND DICT 200] EP={ep} | TR={tr} | keys={list(output.keys())[:6]}...")
                        print("Sample item:", output)
                    else:
                        pass
                elif res.status_code != 404:
                    pass
            except Exception as e:
                pass
print("=== END OF SEARCH ===")
