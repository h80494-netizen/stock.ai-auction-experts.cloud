from fastapi import APIRouter, Query, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional
import requests
import io
import os
import re
import datetime
from database import insert_analyst_report, get_analyst_reports_from_db

router = APIRouter(prefix="/api/reports", tags=["Reports"])

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
}

class SummarizeRequest(BaseModel):
    prompt: Optional[str] = None
    text: Optional[str] = None
    title: Optional[str] = None
    broker: Optional[str] = None

def sync_reports_task(pages=15):
    for page in range(1, pages + 1):
        url = f"https://m.stock.naver.com/api/research/company?page={page}&size=50"
        try:
            res = requests.get(url, headers=HEADERS, timeout=10)
            res.raise_for_status()
            data = res.json()
            if not data:
                break
            for item in data:
                item_name = item.get('itemName', '')
                title = item.get('title', '')
                item_code = item.get('itemCode', '')
                date_str = item.get('writeDate', '')
                broker = item.get('brokerName', '')
                
                target_price = "-"
                opinion = "Buy"
                pdf_url = ""
                try:
                    detail_res = requests.get(f"https://m.stock.naver.com/api/research/company/{item['researchId']}", headers=HEADERS, timeout=5)
                    if detail_res.status_code == 200:
                        detail_data = detail_res.json()
                        content_json = detail_data.get('researchContent', {})
                        pdf_url = content_json.get('attachUrl', '')
                        
                        gp = None
                        op = None
                        for s in detail_data.get('researchSummaries', []):
                            if s.get('itemCode') == item_code:
                                gp = s.get('goalPrice')
                                op = s.get('opinion')
                                break
                        
                        # Fallback to content_json if summary is empty or None
                        if not gp:
                            gp = content_json.get('goalPrice', '')
                        if not op:
                            op = content_json.get('opinion', '')
                        
                        if gp and str(gp).isdigit() and int(gp) > 0:
                            target_price = f"{gp}원"
                        if op:
                            opinion = op
                except: pass

                if target_price == "-":
                    tp_match = re.search(r'([0-9,]+)원', title)
                    if tp_match:
                        target_price = f"{tp_match.group(1)}원"
                
                insert_analyst_report(date_str, title, item_code, item_name, target_price, opinion, broker, pdf_url)
        except Exception as e:
            print(f"[Reports] Sync error on page {page}: {e}")
            break

@router.get("/sync")
def sync_reports(background_tasks: BackgroundTasks, pages: int = 100):
    background_tasks.add_task(sync_reports_task, pages)
    return {"message": f"Sync task started for {pages} pages"}

@router.get("/search")
def get_analyst_reports(
    keyword: str = Query(..., description="종목명 또는 코드"),
    days: int = 180
):
    try:
        num_days = int(days)
    except:
        num_days = 180

    start_date = (datetime.datetime.now() - datetime.timedelta(days=num_days)).strftime("%Y-%m-%d")
    rows = get_analyst_reports_from_db(keyword, start_date)
    return {"items": rows}

@router.post("/summarize")
def summarize_report(req: SummarizeRequest):
    return {"result": "요약 기능이 실행되었습니다."}
