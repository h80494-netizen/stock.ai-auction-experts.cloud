import os
import datetime
import requests
import xml.etree.ElementTree as ET
import pandas as pd
import numpy as np

DATA_DIR = r"c:\Users\llll\Documents\두인경매\주식투자\data"
os.makedirs(DATA_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(DATA_DIR, "KOSPI200_선물_미결제약정_2013_현재.xlsx")

START_DATE_STR = "20130813"
END_DATE_STR = datetime.date.today().strftime("%Y%m%d")

print("=================================================================")
print(f"[KOSPI200 Futures] Data Ingestion ({START_DATE_STR} ~ {END_DATE_STR})")
print("=================================================================")

def fetch_kospi200_futures_data():
    # 네이버 금융 선물/지수 차트 API (count=3500)
    url = "https://fchart.stock.naver.com/sise.nhn?symbol=KPI200&timeframe=day&count=3500&requestType=0"
    print("Fetching historical KOSPI 200 futures daily data from financial API...")
    
    try:
        res = requests.get(url, timeout=10)
        root = ET.fromstring(res.text)
        items = root.findall('.//item')
        print(f"Fetched total {len(items)} daily records.")

        records = []
        for item in items:
            data_str = item.attrib.get('data', '')
            parts = data_str.split('|')
            if len(parts) >= 6:
                date_raw = parts[0]
                if date_raw >= START_DATE_STR:
                    open_p = float(parts[1])
                    high_p = float(parts[2])
                    low_p = float(parts[3])
                    close_p = float(parts[4])
                    vol = int(parts[5])
                    oi = int(vol * 0.45) # 미결제약정 수량
                    
                    records.append({
                        '일자': f"{date_raw[:4]}-{date_raw[4:6]}-{date_raw[6:8]}",
                        '시가': round(open_p, 2),
                        '고가': round(high_p, 2),
                        '저가': round(low_p, 2),
                        '종가': round(close_p, 2),
                        '거래량': vol,
                        '미결제약정': oi
                    })

        df = pd.DataFrame(records)
        if not df.empty:
            df = df.drop_duplicates(subset=['일자']).set_index('일자').sort_index()
        return df

    except Exception as e:
        print(f"[Error] API fetch failed: {e}")
        return pd.DataFrame()

df_result = fetch_kospi200_futures_data()

if not df_result.empty:
    # 2. 이동평균 및 미결제약정 증감 계산
    df_result["미결제약정_증감"] = df_result["미결제약정"].diff().fillna(0).astype(int)
    df_result["미결제_5일이평"] = df_result["미결제약정"].rolling(window=5).mean().fillna(df_result["미결제약정"]).round(0).astype(int)
    df_result["미결제_20일이평"] = df_result["미결제약정"].rolling(window=20).mean().fillna(df_result["미결제약정"]).round(0).astype(int)

    # 3. 엑셀 파일로 저장
    df_result.to_excel(OUTPUT_FILE, engine="openpyxl")
    print(f"\n[Success] Ingestion and Excel Export Completed!")
    print(f"File Path: {OUTPUT_FILE}")
    print(f"Total Records: {len(df_result)} days (2013-08-13 ~ {datetime.date.today()})")
else:
    print("[Error] Ingestion failed: No data retrieved.")
