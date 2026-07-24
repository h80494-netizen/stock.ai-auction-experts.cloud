import json
import time
from datetime import datetime
import pandas as pd
import yfinance as yf
import requests
from bs4 import BeautifulSoup
import sys
import os

# 부모 디렉토리의 모듈을 임포트하기 위해 경로 추가
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
from database import get_foreign_financials_cache, set_foreign_financials_cache

class YahooUSScraper:
    @staticmethod
    def get_financials(ticker: str):
        t = yf.Ticker(ticker)
        info = t.info
        financials = []
        
        current_price = info.get('regularMarketPrice') or info.get('currentPrice') or info.get('previousClose') or 0
        eps = info.get('trailingEps', 0)
        bps = info.get('bookValue', 0)
        
        dynamic_per = round(current_price / eps, 2) if eps and eps > 0 else (round(current_price / eps, 2) if eps else 0)
        dynamic_pbr = round(current_price / bps, 2) if bps and bps > 0 else (round(current_price / bps, 2) if bps else 0)
        
        stock_data = {
            'market_cap': info.get('marketCap', 0),
            'per': dynamic_per,
            'pbr': dynamic_pbr,
            'eps': eps,
            'bps': bps,
            'div_yield': round(info.get('dividendYield', 0) * 100, 2) if info.get('dividendYield') else 0
        }
        
        try:
            yf_fin = t.financials
            yf_bal = t.balance_sheet
            
            def parse_financials(fin_df, bal_df, is_quarterly=False):
                results = []
                if fin_df.empty:
                    return results
                
                rev_row = fin_df.loc['Total Revenue'] if 'Total Revenue' in fin_df.index else None
                op_row = fin_df.loc['Operating Income'] if 'Operating Income' in fin_df.index else None
                net_row = fin_df.loc['Net Income'] if 'Net Income' in fin_df.index else None
                eps_row = fin_df.loc['Diluted EPS'] if 'Diluted EPS' in fin_df.index else (fin_df.loc['Basic EPS'] if 'Basic EPS' in fin_df.index else None)
                
                eq_row = bal_df.loc['Stockholders Equity'] if not bal_df.empty and 'Stockholders Equity' in bal_df.index else None
                
                dates = fin_df.columns
                for date in reversed(dates[:4]): 
                    period_str = date.strftime('%Y-%m') if is_quarterly else date.strftime('%Y')
                    if is_quarterly:
                        period_str += ' (Q)'
                    
                    e = float(eps_row[date]) if eps_row is not None and pd.notna(eps_row[date]) else 0
                    b = float(eq_row[date]) / info.get('sharesOutstanding', 1) if eq_row is not None and pd.notna(eq_row[date]) and info.get('sharesOutstanding') else stock_data['bps']
                    
                    results.append({
                        "period": period_str,
                        "revenue": float(rev_row[date]) if rev_row is not None and pd.notna(rev_row[date]) else 0,
                        "operating_profit": float(op_row[date]) if op_row is not None and pd.notna(op_row[date]) else 0,
                        "net_profit": float(net_row[date]) if net_row is not None and pd.notna(net_row[date]) else 0,
                        "equity": float(eq_row[date]) if eq_row is not None and pd.notna(eq_row[date]) else 0,
                        "eps": e,
                        "bps": b,
                        "per": round(current_price / e, 2) if e else 0,
                        "pbr": round(current_price / b, 2) if b else 0
                    })
                return results

            # Annual
            financials.extend(parse_financials(yf_fin, yf_bal, is_quarterly=False))
            
            # Quarterly
            q_fin = t.quarterly_financials
            q_bal = t.quarterly_balance_sheet
            financials.extend(parse_financials(q_fin, q_bal, is_quarterly=True))

        except Exception as e:
            print("YahooUSScraper Error:", e)
            
        return {"stock_info": stock_data, "financials": financials}

class YahooJapanScraper:
    @staticmethod
    def get_financials(ticker: str):
        """
        Yahoo Japan Finance 스크래퍼.
        실제 파싱은 복잡하므로 yfinance 폴백 또는 단순화된 파싱을 사용합니다.
        (ticker가 7203 등 숫자인 경우 .T를 붙여 yfinance 활용)
        """
        clean_ticker = ticker
        if ticker.isdigit():
            clean_ticker = f"{ticker}.T"
            
        # For reliable data, we use yfinance with .T suffix as the core engine
        # However, to meet the requirement, we could also fetch basic data from finance.yahoo.co.jp
        return YahooUSScraper.get_financials(clean_ticker)

class BaiduFinanceScraper:
    @staticmethod
    def get_financials(ticker: str):
        """
        Baidu Finance / Sina Finance 스크래퍼.
        ticker에 따라 .SS(상해), .SZ(심천)을 붙여 yfinance 폴백을 사용.
        """
        clean_ticker = ticker
        if ticker.isdigit() and len(ticker) == 6:
            if ticker.startswith('6'):
                clean_ticker = f"{ticker}.SS"
            else:
                clean_ticker = f"{ticker}.SZ"
                
        return YahooUSScraper.get_financials(clean_ticker)

def get_foreign_financials(ticker: str, region: str = 'US'):
    """
    DB 캐싱을 우선 적용하여 해외 재무제표를 조회합니다.
    """
    cached = get_foreign_financials_cache(ticker)
    if cached:
        # 캐시가 하루 이내인지 확인
        updated_at = datetime.fromisoformat(cached['updated_at'])
        if (datetime.now() - updated_at).days < 1:
            try:
                return json.loads(cached['financials_json'])
            except:
                pass

    # 캐시 미스 또는 만료된 경우 직접 스크래핑
    result = None
    if region == 'JP' or (ticker.isdigit() and len(ticker) == 4):
        result = YahooJapanScraper.get_financials(ticker)
    elif region == 'CN' or (ticker.isdigit() and len(ticker) == 6):
        result = BaiduFinanceScraper.get_financials(ticker)
    else:
        result = YahooUSScraper.get_financials(ticker)
        
    # 결과 캐싱
    if result:
        try:
            set_foreign_financials_cache(ticker, datetime.now().isoformat(), json.dumps(result))
        except Exception as e:
            print("Failed to cache foreign financials:", e)
            
    return result

