import requests
import json
import pandas as pd

def test_krx_program():
    # KRX Data OTP/AJAX endpoint for program trading: [11016] or similar
    url = "http://data.krx.co.kr/comm/b2c/getB2cMarketDailyProg.cmd"
    
    # Alternatively OTP generation
    otp_url = "http://data.krx.co.kr/comm/fileHtml/index.jsp"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020401",
        "X-Requested-With": "XMLHttpRequest"
    }

    # KRX OTP url
    otp_url = "http://data.krx.co.kr/comm/b2c/getB2cMenuOtp.cmd"
    # Or query b2c endpoint directly
    
    # Try direct POST to data.krx.co.kr for Market Program Trade
    # btp_cmp_cd: 1 (KOSPI)
    payload = {
        "b2cMenuId": "MDC0201020401",
        "inqTpCd": "1", # 1: 일자별
        "mktId": "STK", # KOSPI
        "strtDd": "20240101",
        "endDd": "20240131",
        "share": "1",
        "csv_xls_isNo": "false"
    }
    
    res = requests.post("http://data.krx.co.kr/comm/b2c/getB2cMarketDailyProg.cmd", data=payload, headers=headers)
    print("Direct POST status:", res.status_code)
    try:
        data = res.json()
        print("Data keys:", data.keys())
        if "block1" in data:
            print(f"block1 rows: {len(data['block1'])}")
            if len(data["block1"]) > 0:
                print("First row:", data["block1"][0])
    except Exception as e:
        print("Error:", e, res.text[:300])

if __name__ == "__main__":
    test_krx_program()
