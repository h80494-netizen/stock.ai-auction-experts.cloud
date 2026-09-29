import os
import sys
import time
import json
import pandas as pd

# Add backend directory to sys.path
backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend")
if backend_dir not in sys.path:
    sys.path.append(backend_dir)

from kis_instance import kis_client

def test_program_trade_api():
    if not kis_client:
        print("KIS Client initialization failed.")
        return

    print("Testing KIS Program Trade API (TR: FHKST01010600)...")
    
    url = f"{kis_client.base_url}/uapi/domestic-stock/v1/quotations/program-trade-by-daily"
    headers = kis_client.get_headers("FHKST01010600")
    
    params = {
        "FID_COND_MRKT_DIV_CODE": "J",
        "FID_INPUT_ISCD": "0001",
        "FID_INPUT_DATE_1": "20240101",
        "FID_INPUT_DATE_2": "20240131"
    }
    
    kis_client.rate_limiter.wait()
    import requests
    res = requests.get(url, headers=headers, params=params)
    print("Status Code:", res.status_code)
    try:
        data = res.json()
        print("Response Keys:", data.keys())
        if "msg1" in data:
            print("msg1:", data.get("msg1"))
        if "msg_cd" in data:
            print("msg_cd:", data.get("msg_cd"))
        if "output" in data:
            output = data["output"]
            print(f"Output count: {len(output)}")
            if len(output) > 0:
                print("First record:", output[0])
                print("Last record:", output[-1])
        else:
            print("Response raw:", data)
    except Exception as e:
        print("Error parsing json:", e, res.text)

if __name__ == "__main__":
    test_program_trade_api()
