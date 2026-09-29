import requests
import json

headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Referer": "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020401",
}

def get_krx_data(strt_date, end_date):
    # 1. Get OTP
    otp_url = "http://data.krx.co.kr/comm/fileHtml/index.jsp"
    # Actually MDC daily program trade OTP params:
    otp_params = {
        "name": "fileDown",
        "fileKey": "MDC/02/0201/0201020401/mdc0201020401_01",
        "url": "dbko/MDC/02/0201/0201020401/mdc0201020401_01",
        "mktId": "STK",
        "strtDd": strt_date,
        "endDd": end_date,
        "share": "1",
        "csv_xls_isNo": "false",
        "name": "fileDown"
    }
    
    # Or JSON API endpoint:
    # http://data.krx.co.kr/comm/b2c/getB2cMenuOtp.cmd
    # Or http://data.krx.co.kr/comm/b2c/getB2cMenuData.cmd
    
    # Let's test getB2cMenuData.cmd with b2cMenuId
    post_url = "http://data.krx.co.kr/comm/b2c/getB2cMenuData.cmd"
    form_data = {
        "b2cMenuId": "MDC0201020401",
        "mktId": "STK",
        "strtDd": strt_date,
        "endDd": end_date,
        "share": "1",
        "money": "1",
        "csv_xls_isNo": "false"
    }
    res = requests.post(post_url, data=form_data, headers=headers)
    print("Status:", res.status_code)
    try:
        j = res.json()
        print("Keys:", j.keys())
        for k in j.keys():
            if isinstance(j[k], list) and len(j[k]) > 0:
                print(f"Key {k} has {len(j[k])} items. First item: {j[k][0]}")
    except Exception as e:
        print("Fail:", e, res.text[:200])

get_krx_data("20240101", "20240115")
