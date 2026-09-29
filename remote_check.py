
import sqlite3, json

conn = sqlite3.connect('/home/ubuntu/stock_project/backend/stock_data.sqlite3')
conn.row_factory = sqlite3.Row
c = conn.cursor()

c.execute('SELECT * FROM trade_ledger ORDER BY date DESC')
trade_rows = [dict(r) for r in c.fetchall()]

c.execute('SELECT * FROM trading_ledger ORDER BY trade_date DESC, id DESC')
trading_rows = [dict(r) for r in c.fetchall()]

print("=== TRADE_LEDGER ===")
for r in trade_rows:
    print(r)

print("=== TRADING_LEDGER COUNT ===")
print(len(trading_rows))
if trading_rows:
    print("Sample:", trading_rows[0])
