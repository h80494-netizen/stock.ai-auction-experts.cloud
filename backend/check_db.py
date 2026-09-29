import sqlite3
conn = sqlite3.connect('stock_data.sqlite3')
c = conn.cursor()
c.execute("SELECT count(*) FROM analyst_reports WHERE item_code='005930'")
print("Reports:", c.fetchone()[0])
c.execute("SELECT count(*) FROM analyst_targets_history WHERE ticker='005930'")
print("History:", c.fetchone()[0])
