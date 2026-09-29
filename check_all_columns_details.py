import os
import openpyxl
import pandas as pd

filepath = r"C:\Users\llll\Documents\두인경매\주식투자\data\선물가격업데이트_260917.xlsx"
df = pd.read_excel(filepath, sheet_name="Sheet3")
print("Sheet3 Columns:")
for i, col in enumerate(df.columns):
    print(f"{i}: {col}")

print("\nShape:", df.shape)
print("\nHead(3):")
print(df.iloc[:3, :10])

# Check date filtering from 2013-08-13
df['Date'] = pd.to_datetime(df.iloc[:, 0], errors='coerce')
df_filtered = df[df['Date'] >= '2013-08-13'].copy()
print(f"\nFiltered rows from 2013-08-13: {len(df_filtered)} rows")
print("Filtered Head:")
print(df_filtered.head(3))
print("Filtered Tail:")
print(df_filtered.tail(3))
