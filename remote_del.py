
import sqlite3

conn = sqlite3.connect('/home/ubuntu/stock_project/backend/stock_data.sqlite3')
c = conn.cursor()
c.execute("DELETE FROM trade_ledger WHERE date = '2026-07-03'")
c.execute("DELETE FROM trading_ledger WHERE trade_date = '2026-07-03'")
c.execute("DELETE FROM pnl_history WHERE date = '2026-07-03'")
conn.commit()
conn.close()
print("AWS DB 2026-07-03 deleted successfully!")
