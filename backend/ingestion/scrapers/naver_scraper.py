import requests
from typing import List, Dict, Any
from .base import BaseScraper
import urllib.parse
from datetime import datetime

class NaverScraper(BaseScraper):
    def __init__(self):
        super().__init__("Naver Finance")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        # Naver news search for the keyword (usually a company name like "삼성전자")
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://search.naver.com/search.naver?where=news&query={encoded_keyword}"
        soup = self.fetch_page(url)
        
        if not soup:
            return []
            
        news_items = []
        # Naver news search results are typically in list items with class 'bx' inside 'list_news'
        articles = soup.find_all('li', class_='bx', limit=10)
        
        for article in articles:
            title_tag = article.find('a', class_='news_tit')
            if not title_tag:
                continue
                
            title = title_tag.get('title') or title_tag.text
            link = title_tag.get('href')
            
            source_tag = article.find('a', class_='info press')
            source = source_tag.text.strip() if source_tag else "Unknown"
            
            # Simple snippet extraction
            snippet_tag = article.find('a', class_='api_txt_lines dsc_txt_wrap')
            snippet = snippet_tag.text.strip() if snippet_tag else ""
            
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "snippet": snippet,
                "language": "ko",
                "timestamp": datetime.now().isoformat() # Naver has relative time, using current time for MVP
            })
            
        return news_items

class InvestingKoreaScraper(BaseScraper):
    def __init__(self):
        super().__init__("Investing.co.kr")

    def fetch_news(self, keyword: str) -> List[Dict[str, Any]]:
        # Investing.co.kr requires search by ticker or company name. 
        # Using a general search endpoint for now.
        encoded_keyword = urllib.parse.quote(keyword)
        url = f"https://kr.investing.com/search/?q={encoded_keyword}&tab=news"
        soup = self.fetch_page(url)
        
        if not soup:
            return []
            
        news_items = []
        # Investing.com search results format
        articles = soup.find_all('div', class_='articleItem', limit=10)
        
        for article in articles:
            title_tag = article.find('a', class_='title')
            if not title_tag:
                continue
                
            title = title_tag.text.strip()
            link = "https://kr.investing.com" + title_tag.get('href') if title_tag.get('href', '').startswith('/') else title_tag.get('href')
            
            details = article.find('div', class_='articleDetails')
            source = "Investing.com"
            if details:
                spans = details.find_all('span')
                if len(spans) > 0:
                    source = spans[0].text.strip()
            
            snippet_tag = article.find('p')
            snippet = snippet_tag.text.strip() if snippet_tag else ""
            
            news_items.append({
                "title": title,
                "link": link,
                "source": source,
                "snippet": snippet,
                "language": "ko",
                "timestamp": datetime.now().isoformat()
            })
            
        return news_items

def get_naver_fundamentals(code: str):
    clean_code = str(code).split(':')[-1].replace('.KS', '').replace('.KQ', '').replace('.ks', '').replace('.kq', '').strip()
    headers = {'User-Agent': 'Mozilla/5.0'}
    fund_data = {
        'per': 'N/A', 'per_next': 'N/A',
        'eps': 'N/A', 'eps_next': 'N/A',
        'bps': 'N/A', 'bps_next': 'N/A',
        'pbr': 'N/A', 'pbr_next': 'N/A',
        'roe': 'N/A', 'roe_next': 'N/A',
        'roa': 'N/A', 'eps_trend': [],
        'net_income_trend': [], 'payout_ratio': 'N/A',
        'shares': 0,
        'market_cap': 0,
        'current_price': 0,
        'par_value': 500,
        'name': '',
        'financials_annual': [], 'financials_quarterly': []
    }
    
    try:
        import re as _re

        def _parse_krw_eok_str(raw_s: str) -> float:
            # 예: "1,069조 2,844억" -> (1069*10000 + 2844) * 100000000
            if not raw_s:
                return 0.0
            s = str(raw_s).replace(',', '').strip()
            jo = 0.0
            eok = 0.0
            m_jo = _re.search(r'([\d.]+)\s*조', s)
            if m_jo:
                jo = float(m_jo.group(1))
            m_eok = _re.search(r'([\d.]+)\s*억', s)
            if m_eok:
                eok = float(m_eok.group(1))
            if jo > 0 or eok > 0:
                return (jo * 10000.0 + eok) * 100_000_000.0
            try:
                return float(_re.sub(r'[^0-9.]', '', s)) * 100_000_000.0
            except Exception:
                return 0.0

        # 1. Integration (Current Valuation, Price, MarketCap, Shares, StockName)
        res_int = requests.get(f'https://m.stock.naver.com/api/stock/{clean_code}/integration', headers=headers, timeout=5)
        if res_int.status_code == 200:
            int_json = res_int.json()
            if int_json.get('stockName'):
                fund_data['name'] = str(int_json['stockName']).strip()
            for info in int_json.get('totalInfos', []):
                c_key = info.get('code', '')
                raw_v = str(info.get('value', '')).strip()
                if c_key == 'marketValue':
                    mc_won = _parse_krw_eok_str(raw_v)
                    if mc_won > 0:
                        fund_data['market_cap'] = mc_won
                    continue
                val_str = raw_v.replace(',', '').replace('배', '').replace('원', '').replace('%', '').strip()
                try:
                    v = float(val_str)
                    if c_key == 'lastClosePrice' and v > 0: fund_data['current_price'] = v
                    elif c_key == 'per': fund_data['per'] = v
                    elif c_key == 'eps': fund_data['eps'] = v
                    elif c_key == 'pbr': fund_data['pbr'] = v
                    elif c_key == 'bps': fund_data['bps'] = v
                    elif c_key == 'cnsPer': fund_data['per_next'] = v
                    elif c_key == 'cnsEps': fund_data['eps_next'] = v
                except ValueError:
                    pass

        # basic API에서 현재가 보강
        if not fund_data['current_price']:
            try:
                res_b = requests.get(f'https://m.stock.naver.com/api/stock/{clean_code}/basic', headers=headers, timeout=3)
                if res_b.status_code == 200:
                    cp_s = str(res_b.json().get('closePrice', '0')).replace(',', '').strip()
                    if cp_s.replace('.', '').isdigit():
                        fund_data['current_price'] = float(cp_s)
            except Exception:
                pass

        # 발행주식수 산출: 시가총액 / 현재가 (또는 DB/테트리스U 폴백)
        if fund_data['market_cap'] > 0 and fund_data['current_price'] > 0:
            fund_data['shares'] = int(round(fund_data['market_cap'] / fund_data['current_price']))

        # DART 12분기 DB에서 분기별/연간 자본총계(equity), 매출, 영업이익, 순이익 보조 맵 로드 (없으면 실시간 DART 12분기 수집)
        dart_map_by_ym = {}
        latest_dart_equity = 0.0
        try:
            import database as _db
            d_rows = _db.get_dart_financials(clean_code) or []
            has_2026_3q = any(str(r.get('year')) == '2026' and str(r.get('quarter')) == '11014' for r in d_rows)
            if len(d_rows) < 8 or not has_2026_3q:
                try:
                    from ingestion.scrapers.dart_scraper import dart_scraper
                    data_12q = dart_scraper.get_financials_12quarters(clean_code)
                    if data_12q:
                        for d in data_12q:
                            _db.insert_dart_financials(
                                clean_code, d['year'], d['quarter'],
                                d['assets'], d['equity'], d['liabilities'],
                                d['revenue'], d['operating_profit'], d['net_profit']
                            )
                        try:
                            _db.calculate_and_save_ttm_financials(clean_code)
                        except Exception:
                            pass
                        d_rows = _db.get_dart_financials(clean_code) or []
                except Exception:
                    pass
            q_to_mm = {'11013': '03', '11012': '06', '11014': '09', '11011': '12'}
            for dr in d_rows:
                ym = f"{dr.get('year')}{q_to_mm.get(str(dr.get('quarter')), '12')}"
                dart_map_by_ym[ym] = dr
                if (dr.get('equity') or 0) > 0:
                    latest_dart_equity = float(dr['equity'])
        except Exception:
            pass

        # 2. Financials Helper (네이버 모바일 API: annual 및 quarter)
        def parse_financials(period_type: str):
            api_period = 'quarter' if period_type in ('quarterly', 'quarter') else 'annual'
            res = requests.get(f'https://m.stock.naver.com/api/stock/{clean_code}/finance/{api_period}', headers=headers, timeout=5)
            financials = []
            if res.status_code != 200:
                return financials
            try:
                data = res.json().get('financeInfo', {})
            except Exception:
                return financials

            titles = data.get('trTitleList', [])
            row_list = data.get('rowList', [])
            if not titles or not row_list:
                return financials

            periods = {}
            for t in titles:
                k = t.get('key')
                if not k:
                    continue
                raw_title = str(t.get('title', '')).replace('.', '').strip()
                is_est = (t.get('isConsensus') == 'Y')
                periods[k] = {
                    'raw_ym': raw_title[:6],
                    'period': raw_title + ('(E)' if is_est and not raw_title.endswith('(E)') else ''),
                    'is_estimate': is_est,
                }

            for row in row_list:
                title = str(row.get('title', '')).replace(' ', '').strip()
                for key, col in (row.get('columns') or {}).items():
                    if key not in periods or not isinstance(col, dict):
                        continue
                    val_str = str(col.get('value', '')).replace(',', '').strip()
                    if val_str in ('', '-', 'N/A', 'nan', 'None'):
                        continue
                    try:
                        v = float(val_str)
                    except ValueError:
                        continue

                    if '매출액' in title:
                        periods[key]['revenue'] = v * 100_000_000.0
                    elif title in ('영업이익', '영업이익(발표기준)'):
                        periods[key]['operating_profit'] = v * 100_000_000.0
                    elif title == '당기순이익':
                        periods[key]['net_profit'] = v * 100_000_000.0
                    elif title == '지배주주순이익' and 'net_profit' not in periods[key]:
                        periods[key]['net_profit'] = v * 100_000_000.0
                    elif title in ('EPS', 'EPS(원)'):
                        periods[key]['eps'] = v
                    elif title in ('BPS', 'BPS(원)'):
                        periods[key]['bps'] = v
                    elif title in ('PER', 'PER(배)'):
                        periods[key]['per'] = v
                    elif title in ('PBR', 'PBR(배)'):
                        periods[key]['pbr'] = v
                    elif title in ('ROE', 'ROE(%)'):
                        periods[key]['roe'] = v

            shares = float(fund_data.get('shares') or 0)
            cur_price = float(fund_data.get('current_price') or 0)
            top_bps = float(fund_data['bps']) if isinstance(fund_data.get('bps'), (int, float)) else 0.0

            is_q = (api_period == 'quarter')
            annual_mult = 4.0 if is_q else 1.0

            sorted_keys = sorted(list(periods.keys()))
            out_list = []
            for k in sorted_keys:
                p_obj = periods[k]
                ym = p_obj.get('raw_ym', '')
                d_row = dart_map_by_ym.get(ym)

                # DART DB 값(특히 2026년 3분기 202609 등 네이버에서 '-'로 비어있는 확정 공시 분기)으로 영업이익/순이익/자본총계 즉시 보강
                if d_row:
                    # DART 테이블의 revenue, operating_profit, net_profit은 (분기순수실적 * 4 연환산)으로 저장되어 있으므로
                    # 분기 재무제표에서는 1/4(순수 분기 실적)로, 연간에서는 그대로 반영
                    d_div = 4.0 if is_q else 1.0
                    if not p_obj.get('revenue') and d_row.get('revenue'):
                        p_obj['revenue'] = float(d_row['revenue']) / d_div
                    if not p_obj.get('operating_profit') and d_row.get('operating_profit'):
                        p_obj['operating_profit'] = float(d_row['operating_profit']) / d_div
                    if not p_obj.get('net_profit') and d_row.get('net_profit'):
                        p_obj['net_profit'] = float(d_row['net_profit']) / d_div
                    if not p_obj.get('equity') and d_row.get('equity'):
                        p_obj['equity'] = float(d_row['equity'])
                    # DART에 실제 공시된 분기(예: 202609 = 2026.3Q)는 추정치(E) 꼬리표 제거
                    p_obj['is_estimate'] = False
                    p_obj['period'] = ym

                np_val = float(p_obj.get('net_profit') or 0.0)
                eq_val = float(p_obj.get('equity') or 0.0)
                eps_val = float(p_obj.get('eps') or 0.0)
                bps_val = float(p_obj.get('bps') or 0.0)
                per_val = float(p_obj.get('per') or 0.0)
                pbr_val = float(p_obj.get('pbr') or 0.0)
                roe_val = float(p_obj.get('roe') or 0.0)

                # 1) 발행주식수가 아직 0이면 (순이익 / EPS) 또는 (자본총계 / BPS)로 역산
                if shares <= 0:
                    if np_val != 0 and eps_val != 0:
                        shares = abs(np_val / eps_val)
                        fund_data['shares'] = int(round(shares))
                    elif eq_val > 0 and bps_val > 0:
                        shares = eq_val / bps_val
                        fund_data['shares'] = int(round(shares))

                # 2) 자본총계(equity) 직접 계산: BPS * 발행주식수 또는 DART 자본총계
                if eq_val <= 0:
                    if bps_val > 0 and shares > 0:
                        eq_val = bps_val * shares
                    elif latest_dart_equity > 0:
                        eq_val = latest_dart_equity
                    elif top_bps > 0 and shares > 0:
                        eq_val = top_bps * shares
                if eq_val > 0:
                    p_obj['equity'] = eq_val

                # 3) BPS 직접 계산: 자본총계 / 발행주식수 (또는 상단 BPS 폴백)
                if bps_val <= 0:
                    if eq_val > 0 and shares > 0:
                        bps_val = eq_val / shares
                    elif top_bps > 0:
                        bps_val = top_bps
                if bps_val > 0:
                    p_obj['bps'] = round(bps_val, 0)

                # 4) EPS 직접 계산: 당기순이익 / 발행주식수
                if eps_val == 0 and np_val != 0 and shares > 0:
                    eps_val = np_val / shares
                if eps_val != 0:
                    p_obj['eps'] = round(eps_val, 0)

                # 5) 해당 기간 기준 주가(ref_price): 네이버 PBR*BPS 또는 PER*EPS 역산 주가 우선, 없으면 현재주가 반영
                ref_price = cur_price
                if pbr_val > 0 and bps_val > 0:
                    ref_price = pbr_val * bps_val
                elif per_val > 0 and eps_val > 0:
                    ref_price = per_val * (eps_val * annual_mult)

                # 6) PBR 직접 계산: 주가 / BPS
                if pbr_val <= 0 and ref_price > 0 and bps_val > 0:
                    pbr_val = ref_price / bps_val
                if pbr_val > 0:
                    p_obj['pbr'] = round(pbr_val, 2)

                # 7) ROE(%) 직접 계산: (연환산 순이익 / 자본총계)*100 또는 (연환산 EPS / BPS)*100
                if roe_val == 0:
                    if np_val != 0 and eq_val > 0:
                        roe_val = ((np_val * annual_mult) / eq_val) * 100.0
                    elif eps_val != 0 and bps_val > 0:
                        roe_val = ((eps_val * annual_mult) / bps_val) * 100.0
                if roe_val != 0:
                    p_obj['roe'] = round(roe_val, 2)

                # 8) PER 직접 계산: 주가 / 연환산 EPS (또는 PBR / (ROE/100))
                if per_val == 0:
                    if ref_price > 0 and eps_val != 0:
                        per_val = ref_price / (eps_val * annual_mult)
                    elif pbr_val > 0 and roe_val != 0:
                        per_val = pbr_val / (roe_val / 100.0)
                if per_val != 0:
                    p_obj['per'] = round(per_val, 2)

                # 영업이익/순이익/매출/EPS가 실제 존재하는 유효 실적 열만 포함 (미발표 빈 미래 컨센서스 열 제외)
                has_any = any(
                    p_obj.get(fld) not in (None, 0, 0.0)
                    for fld in ('operating_profit', 'net_profit', 'revenue', 'eps')
                )
                if has_any:
                    out_list.append(p_obj)
            return out_list

        # 3. Fetch Annual and Quarterly ('quarter' 엔드포인트 사용!)
        fund_data['financials_annual'] = parse_financials('annual')
        fund_data['financials_quarterly'] = parse_financials('quarter')

        # DART DB에는 존재하지만 네이버 분기 리스트(titles)에 없거나 빠져있는 최신 분기(예: 202609 = 2026년 3/4분기 등)를 자동 병합
        if dart_map_by_ym:
            existing_q_yms = {str(r.get('raw_ym') or str(r.get('period', ''))[:6]) for r in fund_data['financials_quarterly']}
            shares = float(fund_data.get('shares') or 0)
            cur_price = float(fund_data.get('current_price') or 0)
            for ym in sorted(dart_map_by_ym.keys())[-6:]:
                if ym in existing_q_yms:
                    continue
                dr = dart_map_by_ym[ym]
                # DART DB는 분기*4 연환산 저장이므로 분기 단일 실적은 / 4.0
                rev_v = float(dr.get('revenue') or 0.0) / 4.0
                op_v = float(dr.get('operating_profit') or 0.0) / 4.0
                np_v = float(dr.get('net_profit') or 0.0) / 4.0
                eq_v = float(dr.get('equity') or 0.0)
                if rev_v == 0 and op_v == 0 and np_v == 0:
                    continue
                eps_v = (np_v / shares) if (shares > 0 and np_v != 0) else 0.0
                bps_v = (eq_v / shares) if (shares > 0 and eq_v > 0) else 0.0
                pbr_v = (cur_price / bps_v) if (cur_price > 0 and bps_v > 0) else 0.0
                roe_v = ((np_v * 4.0) / eq_v * 100.0) if (eq_v > 0 and np_v != 0) else 0.0
                per_v = (cur_price / (eps_v * 4.0)) if (cur_price > 0 and eps_v != 0) else 0.0
                fund_data['financials_quarterly'].append({
                    'raw_ym': ym,
                    'period': ym,
                    'is_estimate': False,
                    'revenue': rev_v,
                    'operating_profit': op_v,
                    'net_profit': np_v,
                    'equity': eq_v,
                    'eps': round(eps_v, 0),
                    'bps': round(bps_v, 0),
                    'per': round(per_v, 2),
                    'pbr': round(pbr_v, 2),
                    'roe': round(roe_v, 2),
                })
            fund_data['financials_quarterly'].sort(key=lambda x: str(x.get('raw_ym') or x.get('period') or ''))
            fund_data['financials_quarterly'] = fund_data['financials_quarterly'][-6:]

        # 상단 요약 지표(eps, bps, per, pbr, roe)가 N/A인 경우 최신 연간/분기 실적에서 자동 보충
        ref_rows = [r for r in (fund_data['financials_annual'] + fund_data['financials_quarterly']) if r.get('bps') or r.get('eps')]
        if ref_rows:
            latest_r = ref_rows[-1]
            if fund_data['bps'] == 'N/A' and latest_r.get('bps'):
                fund_data['bps'] = latest_r['bps']
            if fund_data['eps'] == 'N/A' and latest_r.get('eps'):
                fund_data['eps'] = latest_r['eps']
            if fund_data['pbr'] == 'N/A' and latest_r.get('pbr'):
                fund_data['pbr'] = latest_r['pbr']
            if fund_data['per'] == 'N/A' and latest_r.get('per'):
                fund_data['per'] = latest_r['per']
            if fund_data['roe'] == 'N/A' and latest_r.get('roe'):
                fund_data['roe'] = latest_r['roe']

        if fund_data['roe'] == 'N/A' and isinstance(fund_data['eps'], (int, float)) and isinstance(fund_data['bps'], (int, float)) and fund_data['bps'] > 0:
            fund_data['roe'] = round((fund_data['eps'] / fund_data['bps']) * 100, 2)

        # Populate trends
        for ann in fund_data['financials_annual']:
            dt = ann['period'].replace('(E)', '')
            if len(dt) == 6:
                dt = f"{dt[:4]}-{dt[4:]}-31"
            if 'eps' in ann:
                fund_data['eps_trend'].append({
                    'time': dt,
                    'value': ann['eps'],
                    'is_estimate': ann.get('is_estimate', False)
                })
            if 'net_profit' in ann:
                fund_data['net_income_trend'].append({
                    'time': dt,
                    'value': ann['net_profit'],
                    'is_estimate': ann.get('is_estimate', False)
                })

    except Exception as e:
        print(f"Error fetching Naver fundamentals for {code}:", e)

    return fund_data


def get_naver_target_history(code: str) -> list:
    import requests
    import re
    import json
    from datetime import datetime
    url = f'https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd={code}'
    try:
        res = requests.get(url, headers={'User-Agent': 'Mozilla/5.0'}, timeout=5)
        match = re.search(r'var chartData2 = (\{.*?\});', res.text)
        if match:
            data = json.loads(match.group(1))
            target_price = data.get('target_price', [])
            history = []
            for item in target_price:
                y = item.get('y')
                if y is not None:
                    # Convert JS timestamp (ms) to YYYY-MM-DD
                    dt = datetime.fromtimestamp(item['x'] / 1000.0)
                    history.append({
                        "time": dt.strftime("%Y-%m-%d"),
                        "position": "aboveBar",
                        "color": "#ff9800",
                        "shape": "circle",
                        "text": f"목표가: {int(y):,}",
                        "value": float(y)
                    })
            # Highlight the most recent target price
            if history:
                history[-1]['color'] = "#26a69a"
                history[-1]['text'] = history[-1]['text'].replace("목표가", "최근 목표가")
            return history
    except Exception as e:
        print(f"Failed to fetch Naver target history for {code}: {e}")
    return []

