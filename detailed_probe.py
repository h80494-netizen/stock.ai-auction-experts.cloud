import os
import sys
import requests
import json
import time

backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from kis_instance import kis_client

test_cases = [
    ("/uapi/domestic-stock/v1/quotations/program-trade-by-stock", "FHKST01010600"),
    ("/uapi/domestic-stock/v1/quotations/comp-program-trade-daily", "FHKST01010600"),
    ("/uapi/domestic-stock/v1/quotations/program-trade-by-daily", "FHKST01010600"),
    ("/uapi/domestic-stock/v1/quotations/program-trade-trend", "FHKST01010600"),
    ("/uapi/domestic-stock/v1/quotations/program-trade-by-daily", "FHPPG04650100"),
    ("/uapi/domestic-stock/v1/quotations/program-trade-trend", "FHPPG04650100"),
    ("/uapi/domestic-stock/v1/quotations/program-trade-by-daily", "FHPPG04650201"),
]

# Additional URL probes
more_eps = [
    "/uapi/domestic-stock/v1/quotations/program-trade-by-daily",
    "/uapi/domestic-stock/v1/quotations/program-trade-daily",
    "/uapi/domestic-stock/v1/quotations/program-trade-trend",
    "/uapi/domestic-stock/v1/quotations/program-trade-by-market",
    "/uapi/domestic-stock/v1/quotations/program-trade-market",
    "/uapi/domestic-stock/v1/quotations/program-trade-total",
    "/uapi/domestic-stock/v1/quotations/program-trade-summary",
]

more_tr_ids = [
    "FHKST01010600",
    "FHPPG04650100",
    "FHPPG04650201",
    "FHKST01010400",
    "FHKST01010900",
    "HHDFS76240000",
]

for ep in more_eps:
    for tr in more_tr_ids:
        test_cases.append((ep, tr))

seen = set()
for ep, tr in test_cases:
    if (ep, tr) in seen:
        continue
    seen.add((ep, tr))
    
    url = f"{kis_client.base_url}{ep}"
    headers = kis_client.get_headers(tr)
    params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD": "0001",
        "FID_INPUT_DATE_1": "20240101",
        "FID_INPUT_DATE_2": "20240131"
    }
    kis_client.rate_limiter.wait()
    try:
        res = requests.get(url, headers=headers, params=params)
        if res.status_code == 200:
            data = res.json()
            output = data.get("output", [])
            output1 = data.get("output1", [])
            output2 = data.get("output2", [])
            msg1 = data.get("msg1", "")
            rt_cd = data.get("rt_cd", "")
            
            # Check if arb_tr_shnu_tr_amt or similar fields exist in output
            sample_item = None
            if isinstance(output, list) and len(output) > 0:
                sample_item = output[0]
            elif isinstance(output1, list) and len(output1) > 0:
                sample_item = output1[0]
            elif isinstance(output, dict):
                sample_item = output
                
            print(f"[SUCCESS 200] EP: {ep} | TR: {tr} | rt_cd: {rt_cd} | msg1: {msg1}")
            if sample_item:
                keys = list(sample_item.keys())[:10]
                print(f"   Sample Keys: {keys}")
                print(f"   Sample Item: {sample_item}")
        elif res.status_code != 404:
            print(f"[STATUS {res.status_code}] EP: {ep} | TR: {tr} | Text: {res.text[:100]}")
    except Exception as e:
        pass

