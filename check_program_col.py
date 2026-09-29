import pandas as pd

filepath = r"C:\Users\llll\Documents\두인경매\주식투자\data\선물가격업데이트_260917.xlsx"
df = pd.read_excel(filepath, sheet_name="Sheet3")

df['Date'] = pd.to_datetime(df.iloc[:, 0], errors='coerce').dt.strftime('%Y-%m-%d')
df_valid = df.dropna(subset=['Date']).copy()
df_2013 = df_valid[df_valid['Date'] >= '2013-08-13'].copy()

print("Columns around 20~25:")
for col_idx in range(15, 30):
    print(f"Col {col_idx}: {df.columns[col_idx]}")

print("\nSample Data (2013-08-13 to 2013-08-20):")
cols_to_show = ['Date', df.columns[15], df.columns[20], df.columns[22], df.columns[23]]
print(df_2013[cols_to_show].head(10))

print("\nSample Data (Recent 2026):")
print(df_2013[cols_to_show].tail(10))
