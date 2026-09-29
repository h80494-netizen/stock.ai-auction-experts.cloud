
import sqlite3

conn = sqlite3.connect('/home/ubuntu/stock_project/backend/stock_data.sqlite3')
c = conn.cursor()

# 1. 오늘자(2026-09-17) 9개 종목 상세 거래원장(trading_ledger) 갱신
c.execute("DELETE FROM trading_ledger WHERE trade_date = '2026-09-17'")
trades_0917 = [
    ("2026-09-17", "078930", "GS", 111400.0, 112900.0, 44, 66000.0, 'SELL'),
    ("2026-09-17", "031330", "에스에이엠티", 7920.0, 8530.0, 631, 384910.0, 'SELL'),
    ("2026-09-17", "443050", "HD현대마린솔루션", 234500.0, 240500.0, 21, 126000.0, 'SELL'),
    ("2026-09-17", "007660", "이수페타시스", 107500.0, 109000.0, 46, 69000.0, 'SELL'),
    ("2026-09-17", "222800", "심텍", 129200.0, 136900.0, 38, 292600.0, 'SELL'),
    ("2026-09-17", "036540", "SFA반도체", 8920.0, 9660.0, 560, 414400.0, 'SELL'),
    ("2026-09-17", "095610", "테스", 135700.0, 136300.0, 36, 21600.0, 'SELL'),
    ("2026-09-17", "096530", "씨젠", 32250.0, 33550.0, 154, 200200.0, 'SELL'),
    ("2026-09-17", "096770", "SK이노베이션", 136900.0, 139600.0, 36, 97200.0, 'SELL')
]

c.executemany('''
    INSERT INTO trading_ledger (trade_date, ticker, name, buy_price, sell_price, qty, pnl, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
''', trades_0917)

# 2. 부분 매도 오류가 있던 과거 날짜(09-17, 09-10, 09-09, 09-07) 100% 종가 매도 정산값 보정
# (2026-09-17: 44,453,520 매수 / 46,125,430 매도 / net_pnl +1,566,072)
# (2026-09-10: 97,822,350 매수 / 98,929,700 매도 / net_pnl +909,494)
# (2026-09-09: 195,183,220 매수 / 197,135,130 매도 / net_pnl +1,489,173)
# (2026-09-07: 47,505,900 매수 / 47,843,400 매도 / net_pnl +236,543)

corrections = [
    ('2026-09-17', 44453520.0, 46125430.0, 13586.84, 92250.86, 1566072.3, 3.52),
    ('2026-09-10', 97822350.0, 98929700.0, 29512.80, 197859.40, 909494.3, 0.93),
    ('2026-09-09', 195183220.0, 197135130.0, 58847.75, 394270.26, 1489173.4, 0.76),
    ('2026-09-07', 47505900.0, 47843400.0, 14302.40, 95686.80, 236543.4, 0.50)
]

for date_str, b_amt, s_amt, fees, tax, net_pnl, rr in corrections:
    c.execute("DELETE FROM trade_ledger WHERE date = ?", (date_str,))
    c.execute('''
        INSERT INTO trade_ledger (date, total_buy, total_sell, fees, tax, net_pnl, return_rate)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ''', (date_str, b_amt, s_amt, fees, tax, net_pnl, rr))
    
    c.execute("DELETE FROM pnl_history WHERE date = ?", (date_str,))
    c.execute("INSERT INTO pnl_history (date, realized_pnl) VALUES (?, ?)", (date_str, net_pnl))

c.execute("DELETE FROM holdings")
conn.commit()
conn.close()

print("AWS DB historical ledger correction finished successfully!")
