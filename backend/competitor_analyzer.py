import yfinance as yf
import pandas as pd
import json

SECTORS = {
    "1. AI S/W": [
        {"ticker": "GOOGL", "name": "알파벳 Class A"},
        {"ticker": "META", "name": "메타 플랫폼스"},
        {"ticker": "AMZN", "name": "아마존닷컴"},
        {"ticker": "9888.HK", "name": "바이두"},
        {"ticker": "9988.HK", "name": "알리바바"}
    ],
    "2. AI H/W": [
        {"ticker": "005930.KS", "name": "삼성전자"},
        {"ticker": "000660.KS", "name": "SK하이닉스"},
        {"ticker": "NVDA", "name": "엔비디아"},
        {"ticker": "2330.TW", "name": "TSMC"},
        {"ticker": "ARM", "name": "ARM 홀딩스"},
        {"ticker": "MU", "name": "마이크론"},
        {"ticker": "INTC", "name": "인텔"},
        {"ticker": "AMD", "name": "AMD"}
    ],
    "3. Physical AI & Robotics": [
        {"ticker": "005380.KS", "name": "현대자동차"},
        {"ticker": "079550.KS", "name": "LIG넥스원"},
        {"ticker": "6954.T", "name": "화낙"},
        {"ticker": "6506.T", "name": "야스카와전기"}
    ],
    "4. Semiconductor Equipment": [
        {"ticker": "8035.T", "name": "도쿄일렉트론"},
        {"ticker": "6857.T", "name": "아드반테스트"},
        {"ticker": "ASML", "name": "ASML"},
        {"ticker": "036930.KQ", "name": "주성엔지니어링"}
    ],
    "5. Secondary Batteries": [
        {"ticker": "373220.KS", "name": "LG에너지솔루션"},
        {"ticker": "006400.KS", "name": "삼성SDI"},
        {"ticker": "300750.SZ", "name": "CATL"},
        {"ticker": "1211.HK", "name": "BYD"},
        {"ticker": "6674.T", "name": "GS유아사"},
        {"ticker": "6752.T", "name": "파나소닉 홀딩스"}
    ],
    "6. Defense & Aerospace": [
        {"ticker": "012450.KS", "name": "한화에어로스페이스"},
        {"ticker": "064350.KS", "name": "현대로템"},
        {"ticker": "079550.KS", "name": "LIG넥스원"},
        {"ticker": "047810.KS", "name": "한국항공우주(KAI)"},
        {"ticker": "RHM.DE", "name": "라인메탈"},
        {"ticker": "HO.PA", "name": "탈레스"},
        {"ticker": "BA", "name": "보잉"},
        {"ticker": "LMT", "name": "록히드 마틴"}
    ],
    "7. Smartphones": [
        {"ticker": "AAPL", "name": "애플"},
        {"ticker": "005930.KS", "name": "삼성전자"},
        {"ticker": "1810.HK", "name": "샤오미"}
    ],
    "8. Financial Services": [
        {"ticker": "105560.KS", "name": "KB금융지주"},
        {"ticker": "055550.KS", "name": "신한지주"},
        {"ticker": "JPM", "name": "제이피모건 체이스"},
        {"ticker": "BAC", "name": "뱅크오브아메리카"},
        {"ticker": "8306.T", "name": "미쓰비시UFJ"}
    ],
    "9. Basic Materials": [
        {"ticker": "005490.KS", "name": "POSCO홀딩스"},
        {"ticker": "051910.KS", "name": "LG화학"},
        {"ticker": "010130.KS", "name": "고려아연"},
        {"ticker": "4063.T", "name": "신에츠화학"},
        {"ticker": "5401.T", "name": "일본제철"}
    ],
    "10. Utilities & Infrastructure": [
        {"ticker": "015760.KS", "name": "한국전력"},
        {"ticker": "051600.KS", "name": "한전KPS"},
        {"ticker": "NEE", "name": "넥스트에라 에너지"},
        {"ticker": "9531.T", "name": "도쿄가스"},
        {"ticker": "1071.HK", "name": "화전국제전력"}
    ]
}

def get_sectors():
    return SECTORS

def get_sector_news(sector_name: str):
    # 업종 이름 정리 및 키워드 매핑
    keyword_map = {
        "1. AI S/W": "AI 인공지능 소프트웨어",
        "2. AI H/W": "AI 반도체 하드웨어",
        "3. Physical AI & Robotics": "로봇 인공지능",
        "4. Semiconductor Equipment": "반도체 장비",
        "5. Secondary Batteries": "이차전지 배터리",
        "6. Defense & Aerospace": "방산 우주항공",
        "7. Smartphones": "스마트폰 모바일",
        "8. Financial Services": "금융 은행",
        "9. Basic Materials": "철강 화학 소재",
        "10. Utilities & Infrastructure": "전력 발전 인프라"
    }
    
    search_keyword = keyword_map.get(sector_name, sector_name)
    
    import requests
    import urllib.parse
    import xml.etree.ElementTree as ET
    
    encoded_keyword = urllib.parse.quote(search_keyword)
    url = f"https://news.google.com/rss/search?q={encoded_keyword}&hl=ko&gl=KR&ceid=KR:ko"
    
    formatted_news = []
    try:
        res = requests.get(url, timeout=5)
        root = ET.fromstring(res.content)
        
        for idx, item in enumerate(root.findall('.//item')):
            if idx >= 15: # 최대 15개까지만 가져오기
                break
                
            title = item.find('title')
            link = item.find('link')
            pubDate = item.find('pubDate')
            source = item.find('source')
            
            title_text = title.text if title is not None else "No Title"
            # 구글 뉴스 제목 끝에 언론사 이름이 붙어 있는 경우가 많음 ("제목 - 언론사")
            if source is not None and source.text:
                pub_name = source.text
            else:
                parts = title_text.rsplit(' - ', 1)
                pub_name = parts[-1] if len(parts) > 1 else "Google News"
                if len(parts) > 1:
                    title_text = parts[0]
                    
            formatted_news.append({
                "title": title_text,
                "publisher": pub_name,
                "link": link.text if link is not None else "",
                "providerPublishTime": pubDate.text if pubDate is not None else "",
                "related_ticker": sector_name
            })
    except Exception as e:
        print(f"Google News RSS 에러 ({sector_name}):", e)
        
    return formatted_news

def get_ticker_specific_news(ticker: str, name: str):
    import requests
    import urllib.parse
    import xml.etree.ElementTree as ET
    
    # 쿼리: 종목명 + (수주 OR 실적 OR 급등 OR 계약)
    search_keyword = f"{name} (수주 OR 실적 OR 급등 OR 계약)"
    encoded_keyword = urllib.parse.quote(search_keyword)
    url = f"https://news.google.com/rss/search?q={encoded_keyword}&hl=ko&gl=KR&ceid=KR:ko"
    
    formatted_news = []
    try:
        res = requests.get(url, timeout=5)
        root = ET.fromstring(res.content)
        
        for idx, item in enumerate(root.findall('.//item')):
            if idx >= 10: # 최대 10개
                break
                
            title = item.find('title')
            link = item.find('link')
            pubDate = item.find('pubDate')
            source = item.find('source')
            
            title_text = title.text if title is not None else "No Title"
            if source is not None and source.text:
                pub_name = source.text
            else:
                parts = title_text.rsplit(' - ', 1)
                pub_name = parts[-1] if len(parts) > 1 else "Google News"
                if len(parts) > 1:
                    title_text = parts[0]
                    
            formatted_news.append({
                "title": title_text,
                "publisher": pub_name,
                "link": link.text if link is not None else "",
                "providerPublishTime": pubDate.text if pubDate is not None else "",
                "related_ticker": ticker
            })
    except Exception as e:
        print(f"Google News RSS 에러 ({ticker}):", e)
        
    return formatted_news

def get_sector_details(sector_name: str):
    import concurrent.futures
    tickers = SECTORS.get(sector_name, [])
    if not tickers:
        return []
    
    def fetch_detail(t_obj):
        ticker = t_obj["ticker"]
        try:
            t = yf.Ticker(ticker)
            t_info = t.info
            
            price = t_info.get("currentPrice", t_info.get("regularMarketPrice", "N/A"))
            change = t_info.get("regularMarketChangePercent", "N/A")
            if change != "N/A" and change is not None:
                try:
                    change = round(float(change), 2)
                except ValueError:
                    change = "N/A"
            else:
                change = "N/A"
                
            per = t_info.get("forwardPE", t_info.get("trailingPE", "N/A"))
            eps = t_info.get("forwardEps", t_info.get("trailingEps", "N/A"))
            bps = t_info.get("bookValue", "N/A")
            roe = t_info.get("returnOnEquity", "N/A")
            roa = t_info.get("returnOnAssets", "N/A")
            div_yield = t_info.get("dividendYield", "N/A")
            return_1y = t_info.get("52WeekChange", "N/A")
            
            is_korean = ticker.startswith("KRX:") or ticker.endswith(".KS") or ticker.endswith(".KQ")
            if is_korean:
                code = ticker.split(":")[-1].split(".")[0]
                try:
                    from naver_finance_scraper import naver_scraper
                    rt_detail = naver_scraper.get_current_price_detail(code)
                    if rt_detail.get('price'): price = rt_detail['price']
                    if rt_detail.get('changePct') is not None: change = rt_detail['changePct']
                except Exception:
                    pass
                
                if per == "N/A" or eps == "N/A" or bps == "N/A" or roe == "N/A" or per is None or eps is None:
                    try:
                        from ingestion.scrapers.naver_scraper import get_naver_fundamentals
                        nv_fund = get_naver_fundamentals(code)
                        if (per == "N/A" or per is None) and nv_fund.get("per") != "N/A": per = nv_fund["per"]
                        if (eps == "N/A" or eps is None) and nv_fund.get("eps") != "N/A": eps = nv_fund["eps"]
                        if (bps == "N/A" or bps is None) and nv_fund.get("bps") != "N/A": bps = nv_fund["bps"]
                        if (roe == "N/A" or roe is None) and nv_fund.get("roe") != "N/A": 
                            roe = nv_fund["roe"]
                    except Exception:
                        pass
            
            if per != "N/A" and per is not None: per = round(float(per), 2) if isinstance(per, (int, float)) else per
            else: per = "N/A"
            if eps != "N/A" and eps is not None: eps = round(float(eps), 2) if isinstance(eps, (int, float)) else eps
            else: eps = "N/A"
            if bps != "N/A" and bps is not None: bps = round(float(bps), 2) if isinstance(bps, (int, float)) else bps
            else: bps = "N/A"
            
            if roe != "N/A" and roe is not None and isinstance(roe, (int, float)): roe = f"{round(roe * 100, 2)}%"
            elif roe is None: roe = "N/A"
            
            if roa != "N/A" and roa is not None and isinstance(roa, (int, float)): roa = f"{round(roa * 100, 2)}%"
            elif roa is None: roa = "N/A"
            
            if div_yield != "N/A" and div_yield is not None and isinstance(div_yield, (int, float)): div_yield = f"{round(div_yield * 100, 2)}%"
            elif div_yield is None: div_yield = "N/A"
            
            if return_1y != "N/A" and return_1y is not None and isinstance(return_1y, (int, float)): return_1y = f"{round(return_1y * 100, 2)}%"
            elif return_1y is None: return_1y = "N/A"
            
            return {
                "ticker": ticker,
                "name": t_obj["name"],
                "price": price,
                "change": change,
                "per": per,
                "eps": eps,
                "bps": bps,
                "roe": roe,
                "roa": roa,
                "div_yield": div_yield,
                "return_1y": return_1y
            }
        except Exception as e:
            print(f"Error fetching detail for {ticker}: {e}")
            return {
                "ticker": ticker, "name": t_obj["name"], "price": "N/A", "change": "N/A",
                "per": "N/A", "eps": "N/A", "bps": "N/A", "roe": "N/A", "roa": "N/A", 
                "div_yield": "N/A", "return_1y": "N/A"
            }

    try:
        details = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
            future_to_ticker = {executor.submit(fetch_detail, t): t for t in tickers}
            for future in concurrent.futures.as_completed(future_to_ticker):
                res = future.result()
                if res:
                    details.append(res)
        
        details.sort(key=lambda x: [t["ticker"] for t in tickers].index(x["ticker"]))
        return details
    except Exception as e:
        print(f"get_sector_details parallel error for {sector_name}: {e}")
        return tickers

def get_ticker_fundamentals(ticker: str):
    try:
        t = yf.Ticker(ticker)
        info = t.info
        
        # Investment indicators
        roe = info.get('returnOnEquity', 'N/A')
        if roe != 'N/A': roe = f"{roe * 100:.2f}%"
        
        per = info.get('trailingPE', 'N/A')
        if per != 'N/A': per = round(per, 2)
            
        pbr = info.get('priceToBook', 'N/A')
        if pbr != 'N/A': pbr = round(pbr, 2)
            
        bps = info.get('bookValue', 'N/A')
        
        # Financials (Quarterly Revenue & Net Income)
        # Convert pandas dataframe to dict for JSON serialization
        financials = t.quarterly_financials
        fin_data = []
        if not financials.empty:
            # yfinance index might contain 'Total Revenue' and 'Net Income'
            rev_row = financials.loc['Total Revenue'] if 'Total Revenue' in financials.index else None
            net_row = financials.loc['Net Income'] if 'Net Income' in financials.index else None
            
            dates = financials.columns
            for i, date in enumerate(dates):
                if i >= 4: break # Only show last 4 quarters
                fin_data.append({
                    "date": date.strftime('%Y-%m-%d'),
                    "revenue": rev_row[date] if rev_row is not None and pd.notna(rev_row[date]) else 'N/A',
                    "netIncome": net_row[date] if net_row is not None and pd.notna(net_row[date]) else 'N/A'
                })
        fin_data.reverse() # chronological
        
        # Estimates (if available)
        # Using recommendation mean or target price
        estimates = {
            "targetMeanPrice": info.get('targetMeanPrice', 'N/A'),
            "targetHighPrice": info.get('targetHighPrice', 'N/A'),
            "targetLowPrice": info.get('targetLowPrice', 'N/A'),
            "recommendationKey": info.get('recommendationKey', 'N/A')
        }
        
        target_history = []
        eps_trend = []
        per_next = 'N/A'
        pbr_next = 'N/A'
        roe_next = 'N/A'
        eps_next = 'N/A'
        
        if ticker.endswith(".KS") or ticker.endswith(".KQ") or ticker.isdigit():
            code = ticker.split('.')[0]
            if ticker.isdigit(): code = ticker
            from ingestion.scrapers.naver_scraper import get_naver_fundamentals
            from database import get_analyst_target_history
            target_history = get_analyst_target_history(code)
            nv_fund = get_naver_fundamentals(code)
            
            # Override with Naver data
            if nv_fund.get('per') != 'N/A': per = nv_fund['per']
            if nv_fund.get('pbr') != 'N/A': pbr = nv_fund['pbr']
            if nv_fund.get('roe') != 'N/A': roe = nv_fund['roe']
            if nv_fund.get('bps') != 'N/A': bps = nv_fund['bps']
            
            per_next = nv_fund.get('per_next', 'N/A')
            pbr_next = nv_fund.get('pbr_next', 'N/A')
            roe_next = nv_fund.get('roe_next', 'N/A')
            eps_next = nv_fund.get('eps_next', 'N/A')
            eps_trend = nv_fund.get('eps_trend', [])
            
            # If Naver has eps_trend, use it, otherwise fallback to yahoo
            if eps_trend:
                # We already have eps_trend in correct format, replace the EPS chart
                pass
        
        # If no eps_trend from Naver, build from YFinance financials
        if not eps_trend and not financials.empty:
            eps_row = financials.loc['Diluted EPS'] if 'Diluted EPS' in financials.index else (
                      financials.loc['Basic EPS'] if 'Basic EPS' in financials.index else None)
            if eps_row is not None:
                for date in reversed(financials.columns[:4]):
                    val = eps_row[date]
                    if pd.notna(val):
                        eps_trend.append({"time": date.strftime('%Y-%m-%d'), "value": val, "is_estimate": False})

        return {
            "ticker": ticker,
            "name": info.get("shortName", ticker),
            "currentPrice": info.get("currentPrice", "N/A"),
            "currency": info.get("currency", "N/A"),
            "roe": roe, "roe_next": roe_next,
            "per": per, "per_next": per_next,
            "pbr": pbr, "pbr_next": pbr_next,
            "bps": bps,
            "eps": nv_fund.get('eps', 'N/A') if 'nv_fund' in locals() and nv_fund.get('eps') != 'N/A' else info.get('trailingEps', 'N/A'),
            "eps_next": eps_next,
            "eps_trend": eps_trend,
            "financials": fin_data,
            "estimates": estimates,
            "target_history": target_history
        }
    except Exception as e:
        print(f"Error fetching fundamentals for {ticker}: {e}")
        return {
            "ticker": ticker,
            "error": str(e)
        }
