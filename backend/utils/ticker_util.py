import re

def is_korean_stock(ticker: str) -> bool:
    """
    주어진 티커가 한국 주식(코스피, 코스닥 등)인지 판별합니다.
    - 6자리 숫자 (예: 005930)
    - .KS 또는 .KQ 접미사 (예: 005930.KS, 035420.KQ)
    - KRX:, KOSPI:, KOSDAQ: 접두사 (예: KRX:005930)
    """
    if not ticker:
        return False
    t = str(ticker).strip().upper()
    if t.startswith(("KRX:", "KOSPI:", "KOSDAQ:")):
        return True
    if t.endswith((".KS", ".KQ")):
        return True
    # 순수 6자리 숫자인지 확인
    clean = re.sub(r'[^0-9A-Za-z]', '', t)
    if clean.isdigit() and len(clean) == 6:
        return True
    return False

def to_pure_ticker(ticker: str) -> str:
    """
    한국 주식의 경우 접두사(KRX:, KOSPI: 등) 및 접미사(.KS, .KQ)를 제거한 순수 6자리 종목코드를 반환합니다.
    해외 주식인 경우 불필요한 접두사만 제거하고 원본 심볼을 반환합니다.
    """
    if not ticker:
        return ""
    t = str(ticker).strip()
    # 접두사 분리
    if ":" in t:
        t = t.split(":")[-1]
    
    # 대소문자 무관하게 .KS, .KQ 제거
    upper_t = t.upper()
    if upper_t.endswith(".KS") or upper_t.endswith(".KQ"):
        t = t[:-3]
        
    return t.strip()

def to_yf_ticker(ticker: str) -> str:
    """
    Yahoo Finance 전용 티커 문자열을 반환합니다.
    - 한국 주식의 경우 반드시 뒤에 .KS (또는 이미 .KQ가 붙어있으면 .KQ)를 붙여줍니다.
    - 미국/해외 주식인 경우 불필요한 .KS가 붙지 않도록 원본 심볼을 유지합니다.
    """
    if not ticker:
        return ""
    t = str(ticker).strip()
    upper_t = t.upper()
    
    # 이미 .KQ가 명시된 경우 유지
    if upper_t.endswith(".KQ"):
        clean = to_pure_ticker(t)
        return f"{clean}.KQ"
    # 이미 .KS가 명시된 경우 유지
    if upper_t.endswith(".KS"):
        clean = to_pure_ticker(t)
        return f"{clean}.KS"
        
    # 접두사 정리
    clean = to_pure_ticker(t)
    
    # 6자리 숫자 한국 주식이면 기본 .KS 부여
    if clean.isdigit() and len(clean) == 6:
        return f"{clean}.KS"
        
    # 해외 지수(^GSPC 등) 또는 환율(=X), 해외 주식(AAPL 등)은 그대로 반환
    return clean

def to_kis_ticker(ticker: str) -> str:
    """
    한국투자증권(KIS API) 전용 티커를 반환합니다.
    국내 주식은 무조건 순수 6자리 숫자여야 합니다.
    """
    return to_pure_ticker(ticker)

def to_naver_code(ticker: str) -> str:
    """
    네이버 증권(Naver Finance) 전용 티커를 반환합니다.
    국내 주식은 무조건 순수 6자리 숫자여야 합니다.
    """
    return to_pure_ticker(ticker)

def to_krx_code(ticker: str) -> str:
    """
    한국거래소 및 공공데이터포털 전용 티커를 반환합니다.
    국내 주식은 무조건 순수 6자리 숫자여야 합니다.
    """
    return to_pure_ticker(ticker)
