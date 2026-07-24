import pandas as pd
import json
import sys

file_path = "c:/Users/llll/Documents/두인경매/주식투자/backend/data/경쟁기업_Total_value21.xlsm"

try:
    xl = pd.ExcelFile(file_path, engine='openpyxl')
    print("Sheet names:", xl.sheet_names)
    
    # Just print the first 5 rows of each sheet to see what it contains
    for sheet in xl.sheet_names[:2]:
        print(f"\n--- Sheet: {sheet} ---")
        df = xl.parse(sheet, nrows=5)
        print(df.to_json(orient='records', force_ascii=False))
except Exception as e:
    print(f"Error: {e}")
