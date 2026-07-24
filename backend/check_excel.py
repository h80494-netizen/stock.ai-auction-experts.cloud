import os
import pandas as pd

def analyze_all():
    data_dir = "backend/data"
    files = os.listdir(data_dir)
    for f in files:
        if "RIM" in f or "240808" in f:
            file_path = os.path.join(data_dir, f)
            print(f"--- Analyzing {f} ---")
            try:
                xl = pd.ExcelFile(file_path)
                print("Sheet Names:", xl.sheet_names)
                for sheet in xl.sheet_names:
                    print(f"\nSheet: {sheet}")
                    try:
                        df = xl.parse(sheet, nrows=5)
                        print(df.head())
                        print("Columns:", df.columns.tolist())
                    except Exception as e:
                        print(f"Error reading sheet {sheet}: {e}")
            except Exception as e:
                print(f"Error opening file {f}: {e}")

if __name__ == "__main__":
    analyze_all()
