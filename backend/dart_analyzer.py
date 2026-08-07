import os
import json
import requests
import zipfile
import io
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
DART_API_KEY = os.environ.get("DART_API_KEY", "")

# Configure Gemini if GEMINI_API_KEY is available
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

# Cache paths
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)
CORP_CODE_CACHE_PATH = os.path.join(DATA_DIR, 'corp_codes.json')

def load_corp_codes():
    if os.path.exists(CORP_CODE_CACHE_PATH):
        with open(CORP_CODE_CACHE_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    
    # Fetch from DART if not cached
    if not DART_API_KEY or DART_API_KEY == "YOUR_DART_API_KEY_HERE":
        print("DART_API_KEY is missing. Cannot fetch corp codes.")
        return {}

    try:
        url = f"https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key={DART_API_KEY}"
        res = requests.get(url, stream=True)
        if res.status_code == 200:
            with zipfile.ZipFile(io.BytesIO(res.content)) as z:
                xml_data = z.read("CORPCODE.xml")
            
            tree = ET.fromstring(xml_data)
            corp_map = {}
            for list_tag in tree.findall("list"):
                stock_code = list_tag.findtext("stock_code")
                if stock_code and stock_code.strip():
                    corp_code = list_tag.findtext("corp_code")
                    corp_map[stock_code.strip()] = corp_code.strip()
            
            with open(CORP_CODE_CACHE_PATH, 'w', encoding='utf-8') as f:
                json.dump(corp_map, f, ensure_ascii=False)
            
            return corp_map
    except Exception as e:
        print("Error fetching corp codes:", e)
    
    return {}

def fetch_recent_disclosures(stock_code: str):
    if not DART_API_KEY or DART_API_KEY == "YOUR_DART_API_KEY_HERE":
        return {"error": "DART_API_KEY is missing."}
        
    corp_codes = load_corp_codes()
    clean_code = stock_code.split(':')[-1].replace('.KS', '').replace('.KQ', '')
    corp_code = corp_codes.get(clean_code)
    
    if not corp_code:
        return {"error": "Not found in DART corp code list."}
        
    end_date = datetime.today().strftime("%Y%m%d")
    start_date = (datetime.today() - timedelta(days=90)).strftime("%Y%m%d")
    
    url = f"https://opendart.fss.or.kr/api/list.json?crtfc_key={DART_API_KEY}&corp_code={corp_code}&bgn_de={start_date}&end_de={end_date}&page_no=1&page_count=20"
    
    try:
        res = requests.get(url, timeout=5)
        data = res.json()
        if data.get("status") == "000":
            return {"disclosures": data.get("list", [])}
        else:
            return {"error": data.get("message", "Unknown DART error")}
    except Exception as e:
        print("DART fetch error:", e)
        return {"error": str(e)}

def analyze_dart_with_ai(stock_name: str, stock_code: str):
    # DART data fetching
    dart_data = fetch_recent_disclosures(stock_code)
    
    if "error" in dart_data:
        # Fallback message if no API key or error
        if "DART_API_KEY is missing" in dart_data["error"]:
            return "⚠️ **DART API 연동 필요:** `.env` 파일에 `DART_API_KEY`를 설정해주세요."
        return f"⚠️ **DART 공시 데이터 조회 실패:** {dart_data['error']}"
        
    disclosures = dart_data.get("disclosures", [])
    if not disclosures:
        return "최근 3개월 내 주요 공시 내역이 없습니다."
        
    # Build prompt
    disclosures_text = "\n".join([f"- {d['rcept_dt']}: {d['report_nm']} ({d['flr_nm']})" for d in disclosures])
    
    prompt = f"""
다음은 {stock_name}({stock_code})의 최근 3개월 DART 전자공시 목록입니다.
이 공시 내역들을 분석하여 기업의 재무적 리스크, 주요 경영 사항, 주가에 미칠 영향(호재/악재)을 3~4문장으로 요약해주세요.

공시 목록:
{disclosures_text}

형식:
마크다운 기호(*, # 등)를 절대 사용하지 말고, 자연스러운 문장 형태의 평문(Plain text)으로 작성해주세요.
"""

    if not GEMINI_API_KEY:
        return "⚠️ **Gemini API 연동 필요:** `.env` 파일에 `GEMINI_API_KEY`를 설정해주세요."

    try:
        model = genai.GenerativeModel('gemini-2.5-flash')
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print("Gemini API error:", e)
        return f"⚠️ **AI 분석 중 오류 발생:** {str(e)}"
