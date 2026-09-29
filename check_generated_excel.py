import pandas as pd
import os

excel_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "코스피_차익거래_프로그램매매_20130813_현재.xlsx")
if os.path.exists(excel_path):
    df = pd.read_excel(excel_path)
    print("Excel File Loaded Successfully!")
    print("Columns:", df.columns.tolist())
    print("Shape:", df.shape)
    print("\nHead:")
    print(df.head())
    print("\nTail:")
    print(df.tail())
else:
    print("Excel file not found at:", excel_path)
