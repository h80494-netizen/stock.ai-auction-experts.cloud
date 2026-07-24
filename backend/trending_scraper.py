import requests
from bs4 import BeautifulSoup
import yfinance as yf
import concurrent.futures

def get_trending_kr():
    """
    네이버 증권 '시가총액' 크롤링 (상위 100개, ETF/ETN 등 제외)
    """
    try:
        results = []
        headers = {'User-Agent': 'Mozilla/5.0'}
        # 상위 100개를 얻기 위해 대략 3페이지(150개)까지 크롤링
        for page in range(1, 4):
            res = requests.get(f'https://finance.naver.com/sise/sise_market_sum.naver?sosok=0&page={page}', headers=headers, timeout=5)
            res.encoding = 'euc-kr'
            soup = BeautifulSoup(res.text, 'html.parser')
            rows = soup.select('table.type_2 tbody tr')
            
            for row in rows:
                a_tag = row.select_one('a.tltle')
                if not a_tag: continue
                name = a_tag.text.strip()
                
                # Exclude ETFs/ETNs
                excludes = ['KODEX', 'TIGER', 'KBSTAR', 'ARIRANG', 'KOSEF', 'HANARO', 'KINDEX', 'TIMEFOLIO', 'ETN', '스팩', '선물', '인버스', '레버리지', 'KODEX']
                if any(ext in name for ext in excludes): continue
                
                code = a_tag['href'].split('code=')[-1]
                tds = row.select('td')
                if len(tds) < 10: continue
                
                try:
                    price = float(tds[2].text.replace(',', ''))
                    change_str = tds[4].text.replace('%', '').replace('+', '').replace('-', '').strip()
                    change_pct = float(change_str) if change_str else 0
                    if '하락' in tds[3].text or '-' in tds[3].text:
                        change_pct = -change_pct
                    volume = int(tds[9].text.replace(',', ''))
                except:
                    continue
                    
                results.append({
                    "symbol": code,
                    "name": name,
                    "price": price,
                    "changePct": change_pct,
                    "volume": volume,
                    "source": "Naver Finance"
                })
                
                if len(results) >= 100:
                    break
            if len(results) >= 100:
                break
        return results
    except Exception as e:
        print("KR Trending error:", e)
        return []

def _fetch_yf_batch(symbols, names, source_label):
    results = []
    
    def fetch_single(idx, sym):
        try:
            ticker = yf.Ticker(sym)
            # Use fast_info when possible for speed
            price = ticker.fast_info.get("last_price", 0)
            prev = ticker.fast_info.get("previous_close", price if price else 1)
            volume = ticker.fast_info.get("last_volume", 0)
            
            if price == 0: # fallback
                info = ticker.info
                if info:
                    price = info.get("currentPrice", info.get("regularMarketPrice", 0))
                    prev = info.get("previousClose", price if price else 1)
                    volume = info.get("volume", info.get("regularMarketVolume", 0))
            
            change_pct = round(((price - prev) / prev) * 100, 2) if prev else 0
            
            # remove .T, .HK etc for frontend display
            clean_sym = sym.split('.')[0] if not sym.endswith('.KS') else sym
            
            return {
                "symbol": clean_sym,
                "name": names[idx] if idx < len(names) else clean_sym,
                "price": round(price, 2),
                "changePct": change_pct,
                "volume": volume,
                "source": source_label
            }
        except:
            return None

    # Fetch concurrently
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as executor:
        future_to_sym = {executor.submit(fetch_single, i, sym): sym for i, sym in enumerate(symbols)}
        for future in concurrent.futures.as_completed(future_to_sym):
            res = future.result()
            if res:
                results.append(res)
                
    # Re-sort to match original order
    sym_order = {sym.split('.')[0]: i for i, sym in enumerate(symbols)}
    results.sort(key=lambda x: sym_order.get(x['symbol'], 999))
    return results

def get_trending_us():
    """
    US Top 100 by Market Cap (Approximation)
    """
    symbols = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'BRK-B', 'TSLA', 'UNH', 'JNJ', 'JPM', 'V', 'LLY', 'PG', 'MA', 'HD', 'CVX', 'ABBV', 'MRK', 'PEP', 'KO', 'AVGO', 'BAC', 'COST', 'TMO', 'MCD', 'CSCO', 'ABT', 'CRM', 'DHR', 'ACN', 'LIN', 'NKE', 'ADBE', 'TXN', 'WMT', 'VZ', 'DIS', 'NEE', 'CMCSA', 'PFE', 'PM', 'INTC', 'COP', 'WFC', 'AMD', 'SPGI', 'INTU', 'HON', 'QCOM', 'CAT', 'IBM', 'UNP', 'AMAT', 'BA', 'GE', 'NOW', 'ISRG', 'LMT', 'SYK', 'T', 'DE', 'GS', 'MS', 'BKNG', 'GILD', 'SBUX', 'MDT', 'BLK', 'PLD', 'EL', 'ADI', 'ZTS', 'TJX', 'C', 'CI', 'BDX', 'REGN', 'MMC', 'CB', 'PGR', 'MDLZ', 'SO', 'CVS', 'SLB', 'EOG', 'BSX', 'VRTX', 'ITW', 'TGT', 'DUK', 'AON', 'NOC', 'KLAC', 'WM', 'PNC', 'CL', 'EQIX', 'CSX', 'ICE']
    names = symbols # For US, ticker is usually fine for name, or we can use yfinance shortName.
    return _fetch_yf_batch(symbols, names, "Yahoo Finance (US)")

def get_trending_jp():
    """
    JP Top 100 by Market Cap (Approximation TOPIX Large70 + Core30)
    """
    symbols = ['7203.T', '6758.T', '6861.T', '9984.T', '8306.T', '9432.T', '6098.T', '4063.T', '8035.T', '9433.T', '8058.T', '4568.T', '6954.T', '7974.T', '4502.T', '6902.T', '6501.T', '6981.T', '8316.T', '8766.T', '8001.T', '8031.T', '4519.T', '7741.T', '4661.T', '6594.T', '6367.T', '4543.T', '8002.T', '3382.T', '7267.T', '6702.T', '9022.T', '8801.T', '9020.T', '4901.T', '7751.T', '7269.T', '6146.T', '6502.T', '6752.T', '8591.T', '1925.T', '2502.T', '8802.T', '6920.T', '7201.T', '4523.T', '2914.T', '5108.T', '7309.T', '8053.T', '9434.T', '6301.T', '6273.T', '4452.T', '6723.T', '8411.T', '6503.T', '2802.T', '1928.T', '3402.T', '2503.T', '9101.T', '4307.T', '4689.T', '8604.T', '3407.T', '4503.T', '6753.T', '9009.T', '7733.T', '6971.T', '9843.T', '5020.T', '5401.T', '4704.T', '9021.T', '7270.T', '3281.T', '4507.T', '9735.T', '7912.T', '4528.T', '8725.T', '4188.T', '8015.T', '6988.T', '8309.T', '7731.T', '6479.T', '1911.T', '8953.T', '7182.T', '9104.T', '9202.T', '5802.T', '3092.T', '7202.T', '9733.T']
    return _fetch_yf_batch(symbols, symbols, "Yahoo Japan")

def get_trending_cn():
    """
    CN Top by Market Cap (Approximation ADRs + HK)
    """
    symbols = ['BABA', 'TCEHY', 'TSM', 'PDD', 'JD', 'BIDU', 'NTES', 'YUMC', 'TCOM', 'LI', 'NIO', 'XPEV', 'BILI', 'ZTO', 'EDU', 'TAL', 'TME', 'VIPS', 'HTHT', 'IQ', 'BZUN', 'LU', 'MOMO', 'HUYA', 'DOYU', 'FINV', 'QFIN', 'HNP', 'PTR', 'SNOA', 'ZNH', 'CEA', 'LFC', 'GSH', 'HCHO', 'ACH', 'SHI', 'SY']
    return _fetch_yf_batch(symbols, symbols, "Yahoo CN/HK")

def get_trending_data(region: str):
    if region == 'KR':
        return get_trending_kr()
    elif region == 'US':
        return get_trending_us()
    elif region == 'JP':
        return get_trending_jp()
    elif region == 'CN':
        return get_trending_cn()
