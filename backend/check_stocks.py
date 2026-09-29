import sqlite3
conn = sqlite3.connect('stock_data.sqlite3')
c = conn.cursor()
c.execute("SELECT count(*) FROM stocks WHERE ticker LIKE '%005930%'")
print("Samsung in stocks:", c.fetchone()[0])
