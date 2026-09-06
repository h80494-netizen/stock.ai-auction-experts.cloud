"use client";

import React, { useState, useEffect } from "react";

interface ReportItem {
  date: string;
  title: string;
  target_price: string;
  opinion: string;
  author: string;
  broker: string;
  pdf_url: string;
}

export default function AnalystReportsView() {
  const [keyword, setKeyword] = useState("삼성전자");
  const [days, setDays] = useState(180);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportItem | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [summarizing, setSummarizing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  const quickKeywords = ["삼성전자", "SK하이닉스", "현대차", "NAVER", "카카오", "셀트리온", "한화에어로스페이스", "두산에너빌리티"];

  const handleSearch = async (targetKeyword?: string) => {
    const searchTarget = targetKeyword !== undefined ? targetKeyword : keyword;
    if (!searchTarget.trim()) return;

    setLoading(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/reports/search?keyword=${encodeURIComponent(searchTarget)}&days=${days}`);
      if (!res.ok) throw new Error("리포트 목록을 불러오는데 실패했습니다.");
      const data = await res.json();
      const items: ReportItem[] = data.items || [];
      setReports(items);
      if (items.length > 0) {
        setSelectedReport(null);
        setSummary("");
      } else {
        setErrorMsg(`'${searchTarget}' 관련 최근 리서치 리포트가 없습니다.`);
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e.message || "오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleSearch("삼성전자");
  }, []);

  const handleSummarize = async (report: ReportItem) => {
    if (!report.pdf_url) {
      alert("해당 리포트는 첨부된 PDF 원문이 없습니다.");
      return;
    }

    setSelectedReport(report);
    setSummarizing(true);
    setSummary("");
    setCopied(false);

    try {
      // 1. PDF 텍스트 추출
      const parseRes = await fetch(`/api/reports/parse-pdf?pdf_url=${encodeURIComponent(report.pdf_url)}`);
      if (!parseRes.ok) throw new Error("리포트 PDF 다운로드/텍스트 추출에 실패했습니다.");
      const { text } = await parseRes.json();

      // 2. AI 요약 호출
      const aiRes = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `종목/제목: ${report.title}\n증권사: ${report.broker} (${report.author})\n\n다음 증권사 리포트 본문에서 (1) 투자의견 및 목표주가 (2) 핵심 투자포인트 3가지 (3) EPS/실적 추정치 변화를 3줄 요약해줘:\n\n${text}`
        })
      });

      if (!aiRes.ok) throw new Error("AI 요약 요청 처리에 실패했습니다.");
      const aiData = await aiRes.json();
      setSummary(aiData.result || "요약 데이터를 수신하지 못했습니다.");
    } catch (e: any) {
      console.error(e);
      setSummary(`⚠️ 분석 중 오류가 발생했습니다: ${e.message}`);
    } finally {
      setSummarizing(false);
    }
  };

  const handleCopy = () => {
    if (!summary) return;
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getOpinionBadge = (opinion: string) => {
    const op = opinion.toUpperCase();
    if (op.includes("BUY") || op.includes("매수")) {
      return <span className="px-2 py-0.5 text-xs font-bold bg-red-950 text-red-400 border border-red-800 rounded">매수 (BUY)</span>;
    }
    if (op.includes("HOLD") || op.includes("중립")) {
      return <span className="px-2 py-0.5 text-xs font-bold bg-yellow-950 text-yellow-400 border border-yellow-800 rounded">중립 (HOLD)</span>;
    }
    if (op.includes("SELL") || op.includes("매도")) {
      return <span className="px-2 py-0.5 text-xs font-bold bg-blue-950 text-blue-400 border border-blue-800 rounded">매도 (SELL)</span>;
    }
    return <span className="px-2 py-0.5 text-xs bg-gray-800 text-gray-300 border border-gray-700 rounded">{opinion || "-"}</span>;
  };

  return (
    <div className="h-full flex flex-col p-4 bg-[#0a0a0a] text-gray-200 overflow-y-auto">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-4 border-b border-gray-800 gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📑</span>
            <h1 className="text-xl font-black tracking-tight text-white">
              증권사 리서치 리포트 컨센서스 & AI 심층 분석
            </h1>
            <span className="text-xs px-2 py-0.5 bg-indigo-950 text-indigo-300 border border-indigo-800 rounded font-mono">
              HANKYUNG CONSENSUS
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            주요 증권사 애널리스트의 최신 기업분석 리포트 원문(PDF)을 실시간 수집하고, AI를 통해 3대 핵심 투자포인트와 목표주가를 3초 만에 요약합니다.
          </p>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-[#141414] border border-gray-700 text-xs text-gray-300 rounded px-2.5 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value={90}>최근 3개월</option>
            <option value={180}>최근 6개월</option>
            <option value={365}>최근 1년</option>
          </select>
          <div className="relative">
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="종목명 입력 (예: 삼성전자, 005930)"
              className="bg-[#141414] border border-gray-700 text-sm text-white rounded px-3 py-2 w-56 focus:outline-none focus:border-indigo-500 font-medium placeholder-gray-500"
            />
          </div>
          <button
            onClick={() => handleSearch()}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-sm font-bold rounded shadow transition-colors flex items-center gap-1 shrink-0 disabled:opacity-50"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>검색중</span>
              </>
            ) : (
              <>
                <span>🔍</span>
                <span>리포트 조회</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Quick Keywords */}
      <div className="flex items-center gap-1.5 mb-4 overflow-x-auto pb-1 text-xs">
        <span className="text-gray-500 whitespace-nowrap mr-1">인기 종목:</span>
        {quickKeywords.map((kw) => (
          <button
            key={kw}
            onClick={() => {
              setKeyword(kw);
              handleSearch(kw);
            }}
            className="px-2.5 py-1 bg-[#141414] hover:bg-[#202020] border border-gray-800 hover:border-gray-700 text-gray-300 rounded whitespace-nowrap transition-colors"
          >
            {kw}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div className="mb-4 p-3 bg-red-950/40 border border-red-800 rounded text-red-300 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Main Grid: 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">
        {/* Left Column: Report List (7 cols) */}
        <div className="lg:col-span-7 flex flex-col bg-[#111] border border-gray-800 rounded-lg overflow-hidden shadow-lg">
          <div className="p-3 bg-[#181818] border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">최신 리서치 리포트 목록</span>
              <span className="text-xs text-indigo-400 font-mono bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-900">
                {reports.length}건
              </span>
            </div>
            <span className="text-[11px] text-gray-500">한경 컨센서스 실시간 연동</span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-gray-800/60 p-2 space-y-2">
            {loading ? (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400 text-xs space-y-2">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
                <div>증권사 리포트 데이터를 불러오는 중입니다...</div>
              </div>
            ) : reports.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-500 text-xs">
                조회된 증권사 리포트가 없습니다. 종목명을 변경해 보세요.
              </div>
            ) : (
              reports.map((r, idx) => {
                const isSelected = selectedReport?.title === r.title && selectedReport?.date === r.date;
                return (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border transition-all ${
                      isSelected
                        ? "bg-indigo-950/30 border-indigo-600 shadow-md"
                        : "bg-[#141414] hover:bg-[#1a1a1a] border-gray-800/80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-mono text-gray-400">{r.date}</span>
                          <span className="text-xs font-bold text-indigo-300">{r.broker}</span>
                          {r.author && <span className="text-xs text-gray-400">({r.author})</span>}
                          {getOpinionBadge(r.opinion)}
                          {r.target_price && r.target_price !== "-" && (
                            <span className="text-xs font-bold text-amber-400 font-mono bg-amber-950/40 px-1.5 py-0.5 rounded border border-amber-900/60">
                              목표가 {r.target_price}원
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-gray-100 hover:text-white leading-snug break-words">
                          {r.title}
                        </h3>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 shrink-0 self-center">
                        {r.pdf_url && (
                          <a
                            href={r.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs rounded border border-gray-700 transition-colors flex items-center gap-1"
                            title="PDF 원문 새 창으로 보기"
                          >
                            <span>📥</span>
                            <span className="hidden sm:inline">PDF</span>
                          </a>
                        )}
                        <button
                          onClick={() => handleSummarize(r)}
                          disabled={summarizing}
                          className={`px-3 py-1.5 text-xs font-bold rounded text-white shadow transition-all flex items-center gap-1 ${
                            isSelected && summarizing
                              ? "bg-indigo-700 animate-pulse"
                              : "bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700"
                          }`}
                        >
                          <span>⚡</span>
                          <span>AI 분석</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: AI Deep Analysis Panel (5 cols) */}
        <div className="lg:col-span-5 flex flex-col bg-[#111] border border-gray-800 rounded-lg overflow-hidden shadow-lg">
          <div className="p-3 bg-[#181818] border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white">🤖 리포트 AI 심층 분석</span>
              {selectedReport && (
                <span className="text-[11px] text-gray-400 truncate max-w-[160px]">
                  {selectedReport.broker} · {selectedReport.title}
                </span>
              )}
            </div>
            {summary && (
              <button
                onClick={handleCopy}
                className="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs rounded border border-gray-700 flex items-center gap-1 transition-colors"
              >
                {copied ? <span>✓ 복사됨</span> : <span>📋 요약 복사</span>}
              </button>
            )}
          </div>

          <div className="flex-1 p-4 overflow-y-auto bg-[#0d0d0d]">
            {summarizing ? (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 space-y-3">
                <div className="relative">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-900 border-t-indigo-500"></div>
                  <span className="absolute inset-0 flex items-center justify-center text-sm">⚡</span>
                </div>
                <div className="text-sm font-bold text-indigo-400">PDF 본문 추출 및 AI 분석 진행 중...</div>
                <div className="text-xs text-gray-500 max-w-xs leading-relaxed">
                  리포트 원문에서 투자의견, 목표주가, 3대 투자포인트, 실적 추정치 변화를 정리하고 있습니다.
                </div>
              </div>
            ) : summary ? (
              <div className="space-y-4 text-xs leading-relaxed">
                {/* Header Summary Card */}
                {selectedReport && (
                  <div className="p-3 bg-[#161616] border border-gray-800 rounded-lg">
                    <div className="flex justify-between items-center text-gray-400 mb-1">
                      <span>{selectedReport.broker} ({selectedReport.author})</span>
                      <span className="font-mono">{selectedReport.date}</span>
                    </div>
                    <div className="font-bold text-white text-sm">{selectedReport.title}</div>
                  </div>
                )}

                {/* Analysis Body */}
                <div className="p-4 bg-[#141414] border border-gray-800/80 rounded-lg text-gray-200 whitespace-pre-wrap font-sans text-xs leading-relaxed space-y-2">
                  {summary}
                </div>

                <div className="p-2.5 bg-indigo-950/30 border border-indigo-900/60 rounded text-[11px] text-indigo-300 flex items-start gap-2">
                  <span>💡</span>
                  <span>
                    본 요약은 증권사 발간 리서치 리포트를 바탕으로 AI가 생성한 참고 정보이며, 투자 권유나 결과에 대한 법적 책임이 없습니다.
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-full min-h-[300px] flex flex-col items-center justify-center text-center p-6 text-gray-500 text-xs space-y-3">
                <span className="text-3xl">📊</span>
                <div className="font-bold text-gray-400">리포트를 선택하고 'AI 분석'을 클릭하세요.</div>
                <div className="max-w-xs leading-relaxed">
                  좌측 리포트 목록에서 원하는 종목의 리포트 우측 <strong>[AI 분석]</strong> 버튼을 누르면
                  수십 페이지의 리포트를 핵심 3줄로 즉시 요약해 드립니다.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
