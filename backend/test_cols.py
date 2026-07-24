import pandas as pd
file_path = "c:/Users/llll/Documents/두인경매/주식투자/backend/data/경쟁기업_Total_value21.xlsm"
try:
    xl = pd.ExcelFile(file_path, engine='openpyxl')
    df = xl.parse('Total value', nrows=1)
    cols = list(df.columns)
    print("Number of columns:", len(cols))
    print("Sample columns:", cols[:20])
except Exception as e:
    print(e)
