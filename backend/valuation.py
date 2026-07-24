from fastapi import APIRouter
from pydantic import BaseModel
import datetime

router = APIRouter()

class ValuationRequest(BaseModel):
    coe: float = 0.10
    discount_3y: float = 0.50
    term_growth: float = 0.05
    payout_ratio: float = 0.30

def calculate_rim(fund, req: ValuationRequest):
    coe = req.coe
    term_growth = req.term_growth
    
    shares = fund.get("shares")
    try: shares = int(shares)
    except: shares = 0
    
    bps_current = fund.get("bps", 0)
    try: bps_current = float(str(bps_current).replace(',', ''))
    except: bps_current = 0
    
    payout_ratio = req.payout_ratio
    fund_pr = fund.get("payout_ratio", "N/A")
    if fund_pr != "N/A":
        try: payout_ratio = float(fund_pr)
        except: pass
        
    current_equity = bps_current * shares if shares > 0 else 0
    
    net_income_trend = fund.get("net_income_trend", [])
    
    future_ni = []
    current_year = datetime.datetime.now().year
    for item in net_income_trend:
        year_str = str(item.get('time', ''))[:4]
        try:
            y = int(year_str)
            if y > current_year - 1:
                future_ni.append(float(item.get('value', 0)))
        except:
            pass
            
    eps_current = fund.get("eps", 0)
    try: eps_current = float(str(eps_current).replace(',', ''))
    except: eps_current = 0
    
    fallback_ni = eps_current * shares
    if fallback_ni <= 0: fallback_ni = current_equity * 0.05
    
    ni_proj = []
    for i in range(5):
        if i < len(future_ni):
            ni_proj.append(future_ni[i])
        else:
            last_ni = ni_proj[-1] if ni_proj else fallback_ni
            ni_proj.append(last_ni * (1 - req.discount_3y))
            
    years = [current_year + i for i in range(5)]
    
    prev_equity = current_equity
    
    equity_proj = []
    dividends_proj = []
    req_return_proj = []
    ri_proj = []
    pv_ri_proj = []
    roe_proj = []
    
    for i in range(5):
        ni = ni_proj[i]
        div = ni * payout_ratio if ni > 0 else 0
        req_return = prev_equity * coe
        ri = ni - req_return
        pv_ri = ri / ((1 + coe) ** (i + 1))
        roe = (ni / prev_equity * 100) if prev_equity > 0 else 0
        
        equity_proj.append(prev_equity)
        dividends_proj.append(div)
        req_return_proj.append(req_return)
        ri_proj.append(ri)
        pv_ri_proj.append(pv_ri)
        roe_proj.append(roe)
        
        prev_equity = prev_equity + ni - div
        
    tv_ri = ri_proj[-1] * (1 + term_growth) / (coe - term_growth) if coe > term_growth else 0
    pv_tv = tv_ri / ((1 + coe) ** 5)
    
    total_shareholder_value = current_equity + sum(pv_ri_proj) + pv_tv
    theoretical_price = total_shareholder_value / shares if shares > 0 else 0
    
    return {
        "theoretical_price": theoretical_price,
        "current_equity": current_equity,
        "shares": shares,
        "payout_ratio": payout_ratio,
        "projection": [
            {
                "year": years[i],
                "beginning_equity": equity_proj[i],
                "net_income": ni_proj[i],
                "dividends": dividends_proj[i],
                "roe": roe_proj[i],
                "req_return_amount": req_return_proj[i],
                "ri": ri_proj[i],
                "pv_ri": pv_ri_proj[i]
            } for i in range(5)
        ],
        "terminal_value": tv_ri,
        "pv_terminal_value": pv_tv,
        "sum_pv_ri": sum(pv_ri_proj),
        "total_shareholder_value": total_shareholder_value
    }

def calculate_dcf_model(stock: dict, req: ValuationRequest):
    """
    DCF 모델 (Discounted Cash Flow)
    잉여현금흐름(FCF)과 가중평균자본비용(WACC)을 기반으로 기업가치를 산출.
    재무제표 데이터 부재 시, EPS와 추정 재투자율(Reinvestment Rate)을 사용하여 FCF/Share를 추정함.
    """
    wacc = req.coe # 편의상 WACC = COE로 가정
    term_growth = req.term_growth
    
    eps_current = stock.get("eps", 0)
    if not isinstance(eps_current, (int, float)): eps_current = 0
    
    import datetime
    current_year = datetime.datetime.now().year
    
    eps_year0 = eps_current if eps_current != 0 else 1000
    eps_year1 = eps_year0 * 1.10 # 내년 10% 성장 (음수면 적자폭 확대, 주의 필요하나 단순 모델 유지)
    eps_year2 = eps_year1 * 1.08
    
    years = [current_year, current_year + 1, current_year + 2, current_year + 3, current_year + 4]
    
    eps_proj = [
        eps_year0,
        eps_year1,
        eps_year2,
        eps_year2 * (1 + term_growth),
        eps_year2 * (1 + term_growth)**2
    ]
    
    # 2. FCF/Share 추정 (단순화: FCF = EPS * (1 - 재투자율))
    # 재투자율(Reinvestment Rate)은 40%로 가정
    reinvestment_rate = 0.40
    fcf_proj = [eps * (1 - reinvestment_rate) for eps in eps_proj]
    
    pv_fcf_proj = []
    
    for i in range(5):
        pv_fcf = fcf_proj[i] / ((1 + wacc) ** (i + 1))
        pv_fcf_proj.append(pv_fcf)
        
    # 3. 영구 가치(Terminal Value) 산출
    tv_fcf = fcf_proj[-1] * (1 + term_growth) / (wacc - term_growth) if wacc > term_growth else 0
    pv_tv = tv_fcf / ((1 + wacc) ** 5)
    
    theoretical_price = sum(pv_fcf_proj) + pv_tv
    
    return {
        "theoretical_price": theoretical_price,
        "wacc": wacc,
        "term_growth": term_growth,
        "projection": [
            {
                "year": years[i],
                "eps": round(eps_proj[i], 2),
                "fcf": round(fcf_proj[i], 2),
                "pv_fcf": round(pv_fcf_proj[i], 2)
            } for i in range(5)
        ],
        "terminal_value": tv_fcf,
        "pv_terminal_value": pv_tv
    }

def calculate_rim_model(stock: dict, req: ValuationRequest):
    """
    초과이익모델 (Residual Income Model, RIM)
    BPS, 자기자본비용(COE), 예상 ROE를 기반으로 잔여이익을 현가화하여 주주가치를 산출.
    """
    coe = req.coe
    term_growth = req.term_growth
    
    eps_current = stock.get("eps", 0)
    bps_current = stock.get("bps", 0)
    
    if not isinstance(eps_current, (int, float)): eps_current = 0
    if not isinstance(bps_current, (int, float)): bps_current = 0
    
    import datetime
    current_year = datetime.datetime.now().year
    
    eps_year0 = eps_current if eps_current != 0 else 1000
    eps_year1 = eps_year0 * 1.10
    eps_year2 = eps_year1 * 1.08
    
    years = [current_year, current_year + 1, current_year + 2, current_year + 3, current_year + 4]
    
    eps_proj = [
        eps_year0,
        eps_year1,
        eps_year2,
        eps_year2 * (1 + term_growth),
        eps_year2 * (1 + term_growth)**2
    ]
    
    bps_proj = []
    ri_proj = []
    pv_ri_proj = []
    
    prev_bps = bps_current if bps_current > 0 else 10000
    
    for i in range(5):
        eps = eps_proj[i]
        
        # 초과이익(Residual Income) = EPS - (기초 BPS * COE)
        ri = eps - (prev_bps * coe)
        pv_ri = ri / ((1 + coe) ** (i + 1))
        
        bps_proj.append(prev_bps)
        ri_proj.append(ri)
        pv_ri_proj.append(pv_ri)
        
        # 기말 BPS = 기초 BPS + EPS (배당이 없다고 가정하거나, 배당을 감안해 ROE 재조정 가능)
        # 단순화를 위해 전액 재투자 가정
        prev_bps = prev_bps + eps
        
    tv_ri = ri_proj[-1] * (1 + term_growth) / (coe - term_growth) if coe > term_growth else 0
    pv_tv = tv_ri / ((1 + coe) ** 5)
    
    theoretical_price = (bps_current if bps_current > 0 else 10000) + sum(pv_ri_proj) + pv_tv
    
    return {
        "theoretical_price": theoretical_price,
        "coe": coe,
        "term_growth": term_growth,
        "bps_current": bps_current if bps_current > 0 else 10000,
        "projection": [
            {
                "year": years[i],
                "eps": round(eps_proj[i], 2),
                "bps": round(bps_proj[i], 2),
                "roe": round((eps_proj[i] / bps_proj[i]) * 100, 2),
                "ri": round(ri_proj[i], 2),
                "pv_ri": round(pv_ri_proj[i], 2)
            } for i in range(5)
        ],
        "terminal_value": tv_ri,
        "pv_terminal_value": pv_tv
    }
