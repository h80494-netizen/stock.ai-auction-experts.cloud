import requests

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
        'shares': 'N/A',
        'financials_annual': [], 'financials_quarterly': []
    }
    
    try:
        # 1. Integration (Current Valuation)
        res_int = requests.get(f'https://m.stock.naver.com/api/stock/{clean_code}/integration', headers=headers, timeout=5)
        if res_int.status_code == 200:
            for info in res_int.json().get('totalInfos', []):
                val_str = str(info.get('value', '')).replace(',', '').replace('배', '').replace('원', '').replace('%', '').strip()
                try:
                    v = float(val_str)
                    if info['code'] == 'per': fund_data['per'] = v
                    if info['code'] == 'eps': fund_data['eps'] = v
                    if info['code'] == 'pbr': fund_data['pbr'] = v
                    if info['code'] == 'bps': fund_data['bps'] = v
                    if info['code'] == 'cnsPer': fund_data['per_next'] = v
                    if info['code'] == 'cnsEps': fund_data['eps_next'] = v
                except ValueError: pass
        if fund_data['eps'] != 'N/A' and fund_data['bps'] != 'N/A' and fund_data['bps'] > 0:
            fund_data['roe'] = f"{round((fund_data['eps'] / fund_data['bps']) * 100, 2)}%"

        # 2. Financials Helper
        def parse_financials(period_type):
            res = requests.get(f'https://m.stock.naver.com/api/stock/{clean_code}/finance/{period_type}', headers=headers, timeout=5)
            financials = []
            if res.status_code != 200: return financials
            
            data = res.json().get('financeInfo', {})
            titles = data.get('trTitleList', [])
            row_list = data.get('rowList', [])
            
            # Init empty dicts for each period
            periods = {t['key']: {'period': t['title'].replace('.', '').strip(), 'is_estimate': t['isConsensus'] == 'Y'} for t in titles}
            
            for row in row_list:
                title = row.get('title', '').replace(' ', '')
                for key, col in row.get('columns', {}).items():
                    if key not in periods: continue
                    val_str = str(col.get('value', '')).replace(',', '')
                    try:
                        v = float(val_str)
                    except ValueError:
                        v = 0
                    
                    if '매출액' in title: periods[key]['revenue'] = v * 100000000
                    elif '영업이익' in title: periods[key]['operating_profit'] = v * 100000000
                    elif '당기순이익' in title: periods[key]['net_profit'] = v * 100000000
                    elif title == 'EPS(원)': periods[key]['eps'] = v
                    elif title == 'BPS(원)': periods[key]['bps'] = v
                    elif title == 'PER(배)': periods[key]['per'] = v
                    elif title == 'PBR(배)': periods[key]['pbr'] = v
                    elif title == 'ROE(%)': periods[key]['roe'] = v
            
            sorted_keys = sorted(list(periods.keys()))
            return [periods[k] for k in sorted_keys]

        # 3. Fetch Annual and Quarterly
        fund_data['financials_annual'] = parse_financials('annual')
        fund_data['financials_quarterly'] = parse_financials('quarterly')
        
        # Populate trends
        for ann in fund_data['financials_annual']:
            # time formatting for trend
            dt = ann['period']
            if len(dt) == 6: dt = f"{dt[:4]}-{dt[4:]}-31" # e.g. 202312 -> 2023-12-31
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

print(get_naver_fundamentals('005930'))
