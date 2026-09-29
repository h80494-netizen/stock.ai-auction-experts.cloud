import sqlite3
conn = sqlite3.connect('stock_data.sqlite3')
c = conn.cursor()
c.execute("SELECT DISTINCT ticker FROM analyst_targets_history LIMIT 10")
print("Tickers in history:", c.fetchall())
