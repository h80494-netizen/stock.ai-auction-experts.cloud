import requests
import time

def get_kospi_100():
    global _kospi_100_cache, _kospi_last_fetch
    try:
        if _kospi_100_cache is not None and (time.time() - _kospi_last_fetch) < 3600:
            return _kospi_100_cache
    except NameError:
        pass
        
    try:
        res = requests.get('https://m.stock.naver.com/api/stocks/marketValue/KOSPI?page=1&pageSize=100', headers={'User-Agent': 'Mozilla/5.0'})
        data = res.json()
        stocks = []
        for item in data.get('stocks', []):
            try:
                price = float(item['closePrice'].replace(',', ''))
                change_val = float(str(item['compareToPreviousClosePrice']).replace(',', ''))
                if item.get('compareToPreviousPrice', {}).get('code') == '5': # Falling
                    change_val = -abs(change_val)
                change_pct = float(item['fluctuationsRatio'])
                mcap_str = item.get('marketValue', '0').replace(',', '')
                mcap = float(mcap_str) if mcap_str else 0.0
                vol_str = item.get('accumulatedTradingVolume', '0').replace(',', '')
                total_vol = int(vol_str) if vol_str else 0
                
                stocks.append({
                    'ticker': f"KRX:{item['itemCode']}",
                    'name': item['stockName'],
                    'price': price,
                    'change': change_val,
                    'changePct': change_pct,
                    'market_cap': mcap,
                    'total_volume': total_vol,
                    'ratio': 0.0,
                    'foreign_net_buy': 0,
                    'categories': []
                })
            except Exception as e:
                pass
                
        _kospi_100_cache = stocks
        _kospi_last_fetch = time.time()
        return stocks
    except Exception as e:
        print("Failed to fetch KOSPI 100:", e)
        try:
            return _kospi_100_cache if _kospi_100_cache else []
        except: return []

def get_kosdaq_100():
    global _kosdaq_100_cache, _kosdaq_last_fetch
    try:
        if _kosdaq_100_cache is not None and (time.time() - _kosdaq_last_fetch) < 3600:
            return _kosdaq_100_cache
    except NameError:
        pass
        
    try:
        res = requests.get('https://m.stock.naver.com/api/stocks/marketValue/KOSDAQ?page=1&pageSize=100', headers={'User-Agent': 'Mozilla/5.0'})
        data = res.json()
        stocks = []
        for item in data.get('stocks', []):
            try:
                price = float(item['closePrice'].replace(',', ''))
                change_val = float(str(item['compareToPreviousClosePrice']).replace(',', ''))
                if item.get('compareToPreviousPrice', {}).get('code') == '5': # Falling
                    change_val = -abs(change_val)
                change_pct = float(item['fluctuationsRatio'])
                mcap_str = item.get('marketValue', '0').replace(',', '')
                mcap = float(mcap_str) if mcap_str else 0.0
                vol_str = item.get('accumulatedTradingVolume', '0').replace(',', '')
                total_vol = int(vol_str) if vol_str else 0
                
                stocks.append({
                    'ticker': f"KRX:{item['itemCode']}",
                    'name': item['stockName'],
                    'price': price,
                    'change': change_val,
                    'changePct': change_pct,
                    'market_cap': mcap,
                    'total_volume': total_vol,
                    'ratio': 0.0,
                    'foreign_net_buy': 0,
                    'categories': []
                })
            except Exception as e:
                pass
                
        _kosdaq_100_cache = stocks
        _kosdaq_last_fetch = time.time()
        return stocks
    except Exception as e:
        print("Failed to fetch KOSDAQ 100:", e)
        try:
            return _kosdaq_100_cache if _kosdaq_100_cache else []
        except: return []
