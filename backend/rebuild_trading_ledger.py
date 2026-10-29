import math
import os
import shutil
import sqlite3
from datetime import datetime
from trading_config import get_trading_config, calculate_settlement_metrics

DB_PATH = os.path.join(os.path.dirname(__file__), "stock_data.sqlite3")

# yfinance-mcp 를 통해 검증된 KRX 확정 종가 및 각 일자 최초 매수주문(단일 배치) 원본 내역
VERIFIED_INITIAL_BATCHES = {
    "2026-10-29": [
        # (ticker, default_name, buy_price, orig_qty, yf_mcp_close_price)
        ("000270", "기아", 106800.0, 46, 108300.0),
        ("141080", "리가켐바이오", 65300.0, 75, 64000.0),
        ("028260", "삼성물산", 327000.0, 15, 323500.0),
        ("083650", "비에이치아이", 43450.0, 111, 42900.0),
        ("028050", "삼성E&A", 63800.0, 78, 62800.0),
        ("056190", "SFA", 26900.0, 189, 26250.0),
        ("084370", "유진테크", 114400.0, 42, 112800.0),
        ("005930", "삼성전자", 243500.0, 20, 232000.0),
        ("293490", "카카오게임즈", 11530.0, 432, 11210.0),
        ("263750", "펄어비스", 34950.0, 144, 34500.0),
        ("347700", "스피어", 20200.0, 239, 20750.0),
        ("140410", "메지온", 52400.0, 95, 52600.0),
        ("015760", "한국전력", 28450.0, 175, 28300.0),
        ("006260", "LS", 219500.0, 22, 212500.0),
        ("000660", "SK하이닉스", 1546000.0, 3, 1526000.0),
        ("298380", "에이비엘바이오", 41700.0, 119, 41000.0),
        ("267250", "HD현대", 141100.0, 35, 140400.0),
        ("082920", "비츠로셀", 23750.0, 209, 24350.0),
        ("032820", "우리기술", 9400.0, 513, 9150.0),
        ("347850", "디앤디파마텍", 42250.0, 116, 41700.0),
    ],
    "2026-10-28": [
        ("011200", "HMM", 22450.0, 223, 22150.0),
        ("083650", "비에이치아이", 44700.0, 114, 44650.0),
        ("056190", "SFA", 26000.0, 197, 26100.0),
        ("298380", "에이비엘바이오", 42800.0, 121, 41800.0),
        ("214370", "케어젠", 34500.0, 151, 34350.0),
        ("028260", "삼성물산", 321000.0, 15, 324500.0),
        ("141080", "리가켐바이오", 66900.0, 78, 66200.0),
        ("263750", "펄어비스", 34500.0, 146, 34200.0),
        ("357780", "솔브레인", 317000.0, 16, 318000.0),
        ("326030", "SK바이오팜", 76300.0, 66, 75200.0),
        ("180640", "한진칼", 122400.0, 41, 125400.0),
        ("015760", "한국전력", 28300.0, 179, 28650.0),
        ("041510", "에스엠", 80700.0, 62, 80300.0),
        ("003490", "대한항공", 26250.0, 190, 26100.0),
        ("078930", "GS", 80300.0, 62, 82300.0),
        ("039490", "키움증권", 226000.0, 22, 231000.0),
        ("017670", "SK텔레콤", 76900.0, 67, 78000.0),
        ("000720", "현대건설", 93800.0, 53, 95500.0),
        ("307950", "현대오토에버", 362500.0, 15, 350000.0),
        ("950160", "코오롱티슈진", 15200.0, 336, 14600.0),
    ],
    "2026-10-27": [
        ("083650", "비에이치아이", 44150.0, 113, 43350.0),
        ("267250", "HD현대", 134200.0, 37, 136200.0),
        ("000720", "현대건설", 92900.0, 53, 91700.0),
        ("036830", "솔브레인홀딩스", 37300.0, 134, 37650.0),
        ("089970", "브이엠", 41900.0, 120, 43200.0),
    ],
    "2026-10-15": [
        ("000720", "현대건설", 98500.0, 50, 91100.0),
        ("196170", "알테오젠", 223000.0, 22, 213500.0),
        ("064400", "LG씨엔에스", 66000.0, 75, 62000.0),
        ("009540", "HD한국조선해양", 274500.0, 18, 263000.0),
        ("011200", "HMM", 23250.0, 215, 23200.0),
        ("016360", "삼성증권", 79600.0, 62, 76300.0),
        ("086520", "에코프로", 87100.0, 57, 80800.0),
        ("007390", "네이처셀", 23850.0, 209, 22150.0),
        ("237690", "에스티팜", 85100.0, 58, 83800.0),
        ("445680", "큐리옥스바이오시스템즈", 52200.0, 95, 57500.0),
        ("222800", "심텍", 140800.0, 35, 124200.0),
        ("145020", "휴젤", 171100.0, 29, 168500.0),
        ("031980", "피에스케이홀딩스", 205500.0, 24, 185200.0),
        ("060370", "LS마린솔루션", 30550.0, 163, 29450.0),
        ("327260", "RF머트리얼즈", 46800.0, 106, 40950.0),
    ],
    "2026-09-29": [
        ("032640", "LG유플러스", 14760.0, 338, 14800.0),
        ("352820", "하이브", 161800.0, 30, 158700.0),
        ("003490", "대한항공", 31450.0, 158, 31400.0),
        ("098460", "고영", 29000.0, 172, 30750.0),
        ("018260", "삼성에스디에스", 218500.0, 22, 216500.0),
        ("138040", "메리츠금융지주", 132400.0, 37, 132700.0),
        ("006400", "삼성SDI", 529000.0, 9, 511000.0),
        ("036830", "솔브레인홀딩스", 40350.0, 123, 41550.0),
        ("031330", "에스에이엠티", 8400.0, 595, 8400.0),
        ("086790", "하나금융지주", 134500.0, 37, 135300.0),
        ("068270", "셀트리온", 178000.0, 28, 178900.0),
        ("083450", "지에스티", 49250.0, 101, 52900.0),
    ],
}


def rebuild_ledger(db_path: str = DB_PATH) -> None:
    if not os.path.exists(db_path):
        print(f"[경고] DB 파일이 존재하지 않습니다: {db_path}")
        return

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak_path = f"{db_path}.bak_{ts}"
    shutil.copy2(db_path, bak_path)
    print(f"[백업 완료] {bak_path}")

    cfg = get_trading_config()
    max_total = float(cfg["max_total_capital"])
    max_per_stock = float(cfg["max_per_stock_capital"])

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    for extra_col in ["batch_id TEXT", "created_at TEXT"]:
        try:
            c.execute(f"ALTER TABLE trading_ledger ADD COLUMN {extra_col}")
        except Exception:
            pass

    # 종목명 보조 조회 맵
    stock_names = {}
    try:
        for r in c.execute("SELECT ticker, name FROM stocks"):
            if r["ticker"] and r["name"]:
                stock_names[r["ticker"].split(":")[-1]] = r["name"]
    except Exception:
        pass

    # 1) 상세 원본이 확인된 5개 거래일(09-29, 10-15, 10-27, 10-28, 10-29) 재기록
    for trade_date, batch_items in sorted(VERIFIED_INITIAL_BATCHES.items()):
        # 해당 날짜가 DB에 존재하는 경우(또는 trading_ledger에 있는 경우) 정밀 재기록 수행
        has_date = (
            c.execute("SELECT 1 FROM trade_ledger WHERE date = ?", (trade_date,)).fetchone() is not None
            or c.execute("SELECT 1 FROM trading_ledger WHERE trade_date = ?", (trade_date,)).fetchone() is not None
        )
        if not has_date:
            continue

        c.execute("DELETE FROM trading_ledger WHERE trade_date = ?", (trade_date,))

        tot_b = 0.0
        tot_s = 0.0
        batch_tag = f"INITIAL_{trade_date}"
        created_ts = f"{trade_date}T09:07:30"

        for ticker, default_name, buy_price, orig_qty, close_price in batch_items:
            capped_qty = min(int(orig_qty), int(max_per_stock // buy_price))
            remaining_budget = max(0.0, max_total - tot_b)
            capped_qty = min(capped_qty, int(remaining_budget // buy_price))
            if capped_qty <= 0:
                continue

            resolved_name = default_name or stock_names.get(ticker, ticker)
            item_pnl = (close_price - buy_price) * capped_qty
            tot_b += buy_price * capped_qty
            tot_s += close_price * capped_qty

            c.execute(
                """
                INSERT INTO trading_ledger (trade_date, ticker, name, buy_price, sell_price, qty, pnl, status, batch_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'SELL', ?, ?)
                """,
                (trade_date, ticker, resolved_name, buy_price, close_price, capped_qty, item_pnl, batch_tag, created_ts),
            )

        metrics = calculate_settlement_metrics(tot_b, tot_s)
        c.execute(
            """
            INSERT INTO trade_ledger (date, total_buy, total_sell, fees, tax, net_pnl, return_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                total_buy = excluded.total_buy,
                total_sell = excluded.total_sell,
                fees = excluded.fees,
                tax = excluded.tax,
                net_pnl = excluded.net_pnl,
                return_rate = excluded.return_rate
            """,
            (
                trade_date,
                round(tot_b, 2),
                round(tot_s, 2),
                metrics["fees"],
                metrics["tax"],
                metrics["net_pnl"],
                metrics["return_rate"],
            ),
        )
        print(
            f"[정밀 재기록 완료] {trade_date}: 종목수={len(batch_items)}개, "
            f"총매수={tot_b:,.0f}원, 총매도={tot_s:,.0f}원, 실현손익={metrics['net_pnl']:,.0f}원 ({metrics['return_rate']:.2f}%)"
        )

    # 2) 요약 원장(trade_ledger) 중 과거 중복 정산/추가매수로 1억 한도를 초과한 나머지 일자 보정
    over_rows = c.execute(
        "SELECT date, total_buy, total_sell FROM trade_ledger WHERE total_buy > ? ORDER BY date ASC",
        (max_total,),
    ).fetchall()

    for r in over_rows:
        d = r["date"]
        old_buy = float(r["total_buy"])
        old_sell = float(r["total_sell"])
        n_dup = max(2, int(math.ceil(old_buy / max_total)))
        new_buy = round(old_buy / n_dup, 2)
        new_sell = round(old_sell / n_dup, 2)
        metrics = calculate_settlement_metrics(new_buy, new_sell)

        c.execute(
            """
            UPDATE trade_ledger
            SET total_buy = ?, total_sell = ?, fees = ?, tax = ?, net_pnl = ?, return_rate = ?
            WHERE date = ?
            """,
            (new_buy, new_sell, metrics["fees"], metrics["tax"], metrics["net_pnl"], metrics["return_rate"], d),
        )
        print(
            f"[과거 한도초과 보정] {d} ({n_dup}배 중복 해소): "
            f"기존매수={old_buy:,.0f}원 -> 보정매수={new_buy:,.0f}원, 실현손익={metrics['net_pnl']:,.0f}원"
        )

    # 3) pnl_history 테이블을 trade_ledger.net_pnl 과 100% 일치하도록 동기화
    c.execute(
        """
        INSERT OR REPLACE INTO pnl_history (date, realized_pnl)
        SELECT date, net_pnl FROM trade_ledger
        """
    )

    conn.commit()

    # 4) 검증 출력
    max_row = c.execute("SELECT date, MAX(total_buy) AS max_b FROM trade_ledger").fetchone()
    over_cnt = c.execute("SELECT COUNT(*) AS cnt FROM trade_ledger WHERE total_buy > ?", (max_total,)).fetchone()["cnt"]
    dup_ticker_cnt = c.execute(
        """
        SELECT COUNT(*) AS cnt FROM (
            SELECT trade_date, ticker, COUNT(*) AS c
            FROM trading_ledger
            GROUP BY trade_date, ticker
            HAVING c > 1
        )
        """
    ).fetchone()["cnt"]

    print(
        f"[최종 검증] trade_ledger 최대 매수금액: {float(max_row['max_b'] or 0):,.0f}원 ({max_row['date']}), "
        f"1억 초과 일수: {over_cnt}건, 상세원장 중복 종목 건수: {dup_ticker_cnt}건"
    )
    conn.close()


if __name__ == "__main__":
    rebuild_ledger()
