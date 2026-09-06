#!/usr/bin/env python3
"""
Antigravity IDE MCP Server for Analyst Reports (JSON-RPC 2.0 over stdio)
"""
import sys
import os
import json
import traceback

# Ensure backend root is in sys.path
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from routers.reports import get_analyst_reports, extract_pdf_summary, generate_ai_summary_service

TOOLS = [
    {
        "name": "search_analyst_reports",
        "description": "한경 컨센서스에서 특정 종목(또는 코드)의 최신 증권사 기업분석 리포트 목록을 검색합니다.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "keyword": {
                    "type": "string",
                    "description": "검색할 종목명 또는 종목코드 (예: 삼성전자, SK하이닉스, 005930)"
                },
                "days": {
                    "type": "integer",
                    "description": "검색 기간 일수 (기본 180일)",
                    "default": 180
                }
            },
            "required": ["keyword"]
        }
    },
    {
        "name": "parse_pdf_report",
        "description": "지정된 증권사 리포트 PDF URL에서 핵심 텍스트(첫 1~2페이지)를 추출합니다.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pdf_url": {
                    "type": "string",
                    "description": "분석할 증권사 리포트의 PDF 다운로드 URL"
                }
            },
            "required": ["pdf_url"]
        }
    },
    {
        "name": "summarize_analyst_report",
        "description": "증권사 리포트 PDF를 다운로드 및 파싱하여 (1) 투자의견 및 목표주가 (2) 핵심 투자포인트 3가지 (3) 실적/EPS 추정치를 AI 3줄 요약 리포트로 생성합니다.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "pdf_url": {
                    "type": "string",
                    "description": "요약할 증권사 리포트의 PDF 다운로드 URL"
                },
                "keyword": {
                    "type": "string",
                    "description": "종목명 또는 추가 컨텍스트 (선택사항)",
                    "default": ""
                }
            },
            "required": ["pdf_url"]
        }
    }
]

def send_response(response: dict):
    line = json.dumps(response, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()

def handle_request(req: dict):
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params", {})

    # Notification (no id)
    if req_id is None:
        return

    if method == "initialize":
        send_response({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": {}
                },
                "serverInfo": {
                    "name": "stock-analyst-reports",
                    "version": "1.0.0"
                }
            }
        })
        return

    if method == "ping":
        send_response({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {}
        })
        return

    if method == "tools/list":
        send_response({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "tools": TOOLS
            }
        })
        return

    if method == "tools/call":
        tool_name = params.get("name")
        args = params.get("arguments", {})

        try:
            if tool_name == "search_analyst_reports":
                keyword = args.get("keyword", "")
                days = int(args.get("days", 180))
                res = get_analyst_reports(keyword=keyword, days=days)
                text_out = json.dumps(res, ensure_ascii=False, indent=2)

            elif tool_name == "parse_pdf_report":
                pdf_url = args.get("pdf_url", "")
                res = extract_pdf_summary(pdf_url=pdf_url)
                text_out = json.dumps(res, ensure_ascii=False, indent=2)

            elif tool_name == "summarize_analyst_report":
                pdf_url = args.get("pdf_url", "")
                keyword = args.get("keyword", "")
                pdf_res = extract_pdf_summary(pdf_url=pdf_url)
                pdf_text = pdf_res.get("text", "")
                prompt = f"종목: {keyword}\n\n다음 증권사 리포트 본문에서 (1) 투자의견 및 목표주가 (2) 핵심 투자포인트 3가지 (3) EPS/실적 추정치 변화를 3줄 요약해줘:\n\n{pdf_text}"
                text_out = generate_ai_summary_service(prompt)

            else:
                send_response({
                    "jsonrpc": "2.0",
                    "id": req_id,
                    "error": {
                        "code": -32601,
                        "message": f"Method/Tool not found: {tool_name}"
                    }
                })
                return

            send_response({
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [
                        {
                            "type": "text",
                            "text": text_out
                        }
                    ]
                }
            })

        except Exception as e:
            traceback.print_exc(file=sys.stderr)
            send_response({
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32000,
                    "message": str(e)
                }
            })
        return

    # Unhandled method
    send_response({
        "jsonrpc": "2.0",
        "id": req_id,
        "error": {
            "code": -32601,
            "message": f"Method not found: {method}"
        }
    })

def main():
    # Configure UTF-8 for stdin/stdout in Windows
    if sys.platform == "win32":
        import io
        sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding='utf-8')
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            handle_request(req)
        except Exception as e:
            traceback.print_exc(file=sys.stderr)

if __name__ == "__main__":
    main()
