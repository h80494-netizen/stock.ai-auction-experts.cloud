import sqlite3
import pandas as pd
conn = sqlite3.connect('data/etf_strategy.db')
c = conn.cursor()
c.execute("DELETE FROM etf_daily_prices WHERE ticker IN ('MCHI', 'VGK')")
conn.commit()
conn.close()
print("Cleaned!")
