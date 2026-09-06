from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional
import requests
from bs4 import BeautifulSoup
import pdfplumber
import io
import os
import re
import datetime

router = APIRouter(prefix="/api/reports", tags=["Reports"])

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
}

# Request model for AI Summarization
class SummarizeRequest(BaseModel):
    prompt: Optional[str] = None
    text: Optional[str] = None
    title: Optional[str] = None
    broker: Optional[str] = None

@router.get("/search")
def get_analyst_reports(
    keyword: str = Query(..., description="종목명 또는 코드"),
    days: int = 180
):
    """
    한경 컨센서스에서 기업분석 리포트 목록을 검색합니다.
    """
    try:
        num_days = int(days) if str(days).isdigit() else 180
    except Exception:
        num_days = 180

    now = datetime.datetime.now()
    sdate = (now - datetime.timedelta(days=num_days)).strftime("%Y-%m-%d")
    edate = now.strftime("%Y-%m-%d")

    url = "https://consensus.hankyung.com/analysis/list"
    params = {
        "sdate": sdate,
        "edate": edate,
        "search_type": "title",
        "search_text": keyword,
        "report_type": "CO",
        "now_page": 1
    }

    try:
        res = requests.get(url, params=params, headers=HEADERS, timeout=10)
        res.raise_for_status()
    except Exception as e:
        print(f"[Reports] Hankyung consensus fetch error: {e}")
        return {"items": [], "error": str(e)}

    soup = BeautifulSoup(res.text, "html.parser")
    results = []
    table = soup.find("div", class_="table_style01")
    if not table:
        return {"items": []}

    rows = table.find_all("tr")[1:]
    for row in rows:
        cols = row.find_all("td")
        if len(cols) < 6:
            continue

        # "결과가 없습니다" 예외 처리
        first_td_text = cols[0].get_text(strip=True)
        if "결과가 없습니다" in first_td_text or len(cols) < 5:
            continue

        # PDF 첨부파일 링크 탐색
        pdf_url = ""
        # 1) 전체 a 태그 중 다운로드 링크 확인
        for a in row.find_all("a"):
            href = a.get("href", "")
            if "downpdf" in href or ".pdf" in href or "file_down" in href:
                pdf_url = href if href.startswith("http") else f"https://consensus.hankyung.com{href}"
                break
        
        # 2) cols[8] 첨부파일 칼럼 확인
        if not pdf_url and len(cols) > 8:
            attach = cols[8].find("a")
            if attach and "href" in attach.attrs:
                href = attach["href"]
                pdf_url = href if href.startswith("http") else f"https://consensus.hankyung.com{href}"

        # 컬럼 매핑:
        # cols[0]: 작성일
        # cols[1]: 제목
        # cols[2]: 적정가격(목표주가)
        # cols[3]: 투자의견
        # cols[4]: 작성자
        # cols[5]: 제공출처(증권사)
        title_elem = cols[1].find("a") if len(cols) > 1 and cols[1].find("a") else (cols[1] if len(cols) > 1 else None)
        title = title_elem.get_text(strip=True) if title_elem else ""

        target_price = cols[2].get_text(strip=True) if len(cols) > 2 else "-"
        opinion = cols[3].get_text(strip=True) if len(cols) > 3 else "-"
        author = cols[4].get_text(strip=True) if len(cols) > 4 else "-"
        broker = cols[5].get_text(strip=True) if len(cols) > 5 else "-"

        # 빈 제목인 경우 방지
        if not title and len(cols) > 2:
            title = cols[2].get_text(strip=True)

        results.append({
            "date": first_td_text,
            "title": title,
            "target_price": target_price,
            "opinion": opinion,
            "author": author,
            "broker": broker,
            "pdf_url": pdf_url
        })

    return {"items": results[:15]}

@router.get("/parse-pdf")
def extract_pdf_summary(pdf_url: str):
    """
    지정된 PDF URL에서 첫 1~2페이지 텍스트를 발췌합니다.
    """
    if not pdf_url:
        raise HTTPException(status_code=400, detail="pdf_url is required")

    try:
        res = requests.get(pdf_url, headers=HEADERS, timeout=15)
        res.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to download PDF: {str(e)}")

    text_content = ""
    try:
        with pdfplumber.open(io.BytesIO(res.content)) as pdf:
            # 첫 1~2페이지만 발췌하여 핵심 요약 데이터 수집
            for page in pdf.pages[:2]:
                extracted = page.extract_text()
                if extracted:
                    text_content += extracted + "\n"
    except Exception as e:
        print(f"[Reports] PDF parsing error: {e}")
        text_content = f"PDF 텍스트 추출 중 오류가 발생했습니다: {str(e)}"

    clean_text = text_content[:4000].strip()
    return {"text": clean_text}

def fallback_heuristic_summary(text: str) -> str:
    """
    Gemini API 키가 없거나 호출 불가할 때 사용하는 지능형 규칙 기반 리포트 요약기
    """
    lines = [line.strip() for line in text.split("\n") if line.strip()]
    
    # 1. 투자의견 및 목표주가 탐지
    opinion = "매수 (Buy) 유지 추정"
    target_price = "리포트 본문 참조"

    for line in lines[:30]:
        op_match = re.search(r'(BUY|HOLD|SELL|매수|중립|비중확대|Outperform|Neutral)', line, re.IGNORECASE)
        if op_match and ("투자의견" in line or "Opinion" in line or "Rating" in line):
            opinion = op_match.group(0).upper()
        
        tp_match = re.search(r'(?:목표주가|TP|Target\s*Price)\s*[:：]?\s*([0-9,]{4,10})\s*(?:원)?', line, re.IGNORECASE)
        if tp_match:
            target_price = f"{tp_match.group(1)}원"

    # 2. 투자포인트 문장 발췌 (키워드 매칭)
    key_points = []
    point_keywords = ["성장", "실적", "개선", "수주", "매출", "영업이익", "수혜", "신제품", "호조", "수익성", "수요", "전망", "증가"]
    
    candidate_sentences = []
    for line in lines:
        if len(line) > 20 and len(line) < 140:
            score = sum(1 for kw in point_keywords if kw in line)
            if score >= 1 and not any(skip in line for skip in ["표", "그림", "자료:", "출처:", "Page", "Tel:"]):
                candidate_sentences.append((score, line))

    candidate_sentences.sort(key=lambda x: x[0], reverse=True)
    seen = set()
    for _, sent in candidate_sentences:
        normalized = sent[:20]
        if normalized not in seen:
            seen.add(normalized)
            key_points.append(sent)
        if len(key_points) >= 3:
            break

    while len(key_points) < 3:
        key_points.append("상세 비즈니스 동향 및 부문별 실적 추이는 첨부 리포트 원문을 참조하시기 바랍니다.")

    # 3. 실적 추정치 / EPS 관련 문장
    perf_sentences = []
    perf_keywords = ["EPS", "영업이익", "매출액", "컨센서스", "YoY", "QoQ", "전년동기대비", "상회", "하회", "달성"]
    for line in lines:
        if any(pk in line for pk in perf_keywords) and len(line) > 15:
            perf_sentences.append(line)
            if len(perf_sentences) >= 2:
                break

    perf_summary = " ".join(perf_sentences) if perf_sentences else "주요 사업부문의 외형 성장과 수익성 개선 흐름이 지속될 것으로 추정됩니다."

    summary = (
        f"### 📌 1. 투자의견 및 목표주가\n"
        f"- **투자의견**: {opinion}\n"
        f"- **목표주가**: {target_price}\n\n"
        f"### 💡 2. 핵심 투자포인트 3가지\n"
        f"1. {key_points[0]}\n"
        f"2. {key_points[1]}\n"
        f"3. {key_points[2]}\n\n"
        f"### 📈 3. EPS 및 실적 추정치 변화\n"
        f"- {perf_summary}"
    )
    return summary

def generate_ai_summary_service(prompt_or_text: str) -> str:
    """
    Gemini API가 구성되어 있으면 LLM을 호출하고, 그렇지 않으면 스마트 폴백을 적용합니다.
    """
    gemini_key = os.environ.get("GEMINI_API_KEY", "").strip()
    
    if gemini_key:
        try:
            import google.generativeai as genai
            genai.configure(api_key=gemini_key)
            
            prompt = (
                "당신은 금융투자 및 증권사 리서치 전문 AI 애널리스트입니다.\n"
                "다음 증권사 리포트 본문 또는 요청 내용을 바탕으로 투자자에게 가장 유용한 형태로 명확하게 요약해주세요.\n\n"
                "반드시 아래 3가지 섹션 형식으로 요약해 주세요:\n"
                "### 📌 1. 투자의견 및 목표주가\n"
                "- (투자의견 및 목표주가, 직전 대비 변동 여부)\n\n"
                "### 💡 2. 핵심 투자포인트 3가지\n"
                "1. (포인트 1)\n"
                "2. (포인트 2)\n"
                "3. (포인트 3)\n\n"
                "### 📈 3. EPS 및 실적 추정치 변화\n"
                "- (분기/연간 실적 전망 및 EPS 변화 요약 1~2문장)\n\n"
                f"--- 리포트 본문 ---\n{prompt_or_text}"
            )
            
            # Use gemini-2.5-flash or fallback to 1.5-flash
            try:
                model = genai.GenerativeModel("gemini-2.5-flash")
                response = model.generate_content(prompt)
                if response and response.text:
                    return response.text
            except Exception as e1:
                print(f"[AI Summarize] gemini-2.5-flash failed, trying gemini-1.5-flash: {e1}")
                model = genai.GenerativeModel("gemini-1.5-flash")
                response = model.generate_content(prompt)
                if response and response.text:
                    return response.text
        except Exception as e:
            print(f"[AI Summarize] Gemini API call error: {e}")

    # Fallback heuristic summary
    return fallback_heuristic_summary(prompt_or_text)

@router.post("/summarize")
def summarize_report(req: SummarizeRequest):
    """
    리포트 텍스트 또는 프롬프트를 전달받아 AI 분석 요약을 반환합니다.
    """
    input_text = req.prompt or req.text or ""
    if not input_text:
        raise HTTPException(status_code=400, detail="prompt or text is required")

    result = generate_ai_summary_service(input_text)
    return {"result": result}
