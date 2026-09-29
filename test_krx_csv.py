import requests
import io
import pandas as pd

def download_krx_program_csv(strt_date, end_date):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd?menuId=MDC0201020401",
    }
    
    # OTP URL
    otp_url = "http://data.krx.co.kr/comm/fileHtml/index.jsp"
    otp_form = {
        "locale": "ko_KR",
        "mktId": "STK",
        "strtDd": strt_date,
        "endDd": end_date,
        "share": "1",
        "money": "1",
        "csv_xls_isNo": "false",
        "name": "fileDown",
        "url": "dbko/MDC/02/0201/0201020401/mdc0201020401_01"
    }
    
    res_otp = requests.post(otp_url, data=otp_form, headers=headers)
    otp_code = res_otp.text.strip()
    print("OTP Code:", otp_code)
    
    # Download URL
    down_url = "http://data.krx.co.kr/comm/b2c/download.cmd"
    down_form = {
        "code": otp_code
    }
    
    res_down = requests.post(down_url, data=down_form, headers=headers)
    print("Download status:", res_down.status_code)
    try:
        # Read CSV with euc-kr or cp949
        df = pd.read_csv(io.BytesIO(res_down.content), encoding="euc-kr")
        print("CSV Columns:", df.columns.tolist())
        print("CSV Shape:", df.shape)
        print(df.head())
        return df
    except Exception as e:
        print("CSV parse error:", e)
        print("Raw content:", res_down.content[:200])
        return None

if __name__ == "__main__":
    download_krx_program_csv("20240101", "20240115")
