"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

function renderFormattedText(text: string) {
    if (!text) return null;
    const parts = text.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
            return (
                <strong key={idx} className="font-extrabold text-slate-900 bg-indigo-50/60 px-0.5 rounded">
                    {part.slice(2, -2)}
                </strong>
            );
        }
        return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
}

export default function AnalystReport() {
    const params = useParams();
    const rawTicker = (params.ticker as string) || '';
    const ticker = decodeURIComponent(rawTicker);

    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [peerInput, setPeerInput] = useState('');
    const [showPrompt, setShowPrompt] = useState(false);
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const loadReport = useCallback(async (customPeers = '', forceRefresh = false) => {
        if (!ticker) return;
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);
        setErrorMsg(null);
        try {
            const qs = new URLSearchParams();
            if (customPeers.trim()) qs.set('peers', customPeers.trim());
            if (forceRefresh) qs.set('refresh', 'true');
            const queryStr = qs.toString() ? `?${qs.toString()}` : '';
            const res = await fetch(`/api/report/${encodeURIComponent(ticker)}${queryStr}`);
            if (!res.ok) throw new Error(res.statusText || '리포트 데이터를 불러오지 못했습니다.');
            const data = await res.json();
            setReport(data);
            if (Array.isArray(data.peer_tickers)) {
                setPeerInput(data.peer_tickers.join(', '));
            }
        } catch (err: any) {
            console.error(err);
            setErrorMsg(err?.message || '리포트 생성 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [ticker]);

    useEffect(() => {
        loadReport('', false);
    }, [loadReport]);

    const handleCopyMarkdown = async () => {
        if (!report?.markdown_report) return;
        try {
            await navigator.clipboard.writeText(report.markdown_report);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch (e) {
            console.error('Copy failed', e);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-slate-800 font-sans gap-3">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <div className="text-lg font-bold">시니어 애널리스트 심층 밸류에이션 & Peer 컨센서스 분석 중...</div>
                <div className="text-xs text-slate-500">대상 기업 및 경쟁사(Peer Group) Forward 멀티플·현금흐름 데이터를 통합 수집하고 있습니다.</div>
            </div>
        );
    }

    if (errorMsg || !report || report.error) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 text-red-600 font-sans gap-4">
                <div className="text-xl font-bold">{errorMsg || report?.error || '리포트 로딩 오류'}</div>
                <button
                    onClick={() => loadReport('', true)}
                    className="px-4 py-2 bg-indigo-700 text-white text-sm font-bold rounded hover:bg-indigo-600"
                >
                    다시 시도
                </button>
            </div>
        );
    }

    const {
        name,
        currency = 'KRW',
        unit_price = '원',
        sector,
        industry,
        as_of_date,
        horizon_label = '2025A, 2026E, 2027E, 2028E',
        peer_label,
        current_price = 0,
        current_price_fmt,
        target_price = 0,
        target_price_fmt,
        target_band,
        upside_pct = 0,
        opinion,
        opinion_text,
        valuation_stance,
        key_multiples,
        financial_health,
        dupont,
        sections = [],
        timeseries_table = [],
        peer_comparison_table = [],
        valuation_dcf,
        valuation_rim,
        ai_executive_insight,
        prompt_used,
    } = report;

    const fmtUnitVal = (val: number) => {
        if (!val || !isFinite(val)) return '-';
        if (currency === 'KRW') return `${Math.round(val).toLocaleString()}원`;
        if (currency === 'USD') return `$${Number(val).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return `${Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${unit_price}`;
    };

    const opinionColor =
        opinion === 'Buy' ? 'text-red-600' : opinion === 'Sell' ? 'text-blue-600' : 'text-slate-700';

    return (
        <div className="min-h-screen bg-slate-200 py-6 px-3 md:px-6 font-sans text-slate-900 print:bg-white print:p-0">
            {/* 상단 컨트롤 바 (인쇄 시 숨김) */}
            <div className="max-w-5xl mx-auto mb-4 bg-slate-900 text-slate-100 rounded-lg p-3.5 shadow-lg flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 print:hidden">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-bold text-indigo-300 whitespace-nowrap">비교 경쟁사(Peer Group) 지정:</span>
                    <input
                        type="text"
                        value={peerInput}
                        onChange={(e) => setPeerInput(e.target.value)}
                        placeholder="예: 000660, MU, 2330.TW (쉼표 구분 2~3개)"
                        className="bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-white w-60 focus:outline-none focus:border-indigo-400 font-mono"
                    />
                    <button
                        onClick={() => loadReport(peerInput, true)}
                        disabled={refreshing}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-700 text-white font-bold rounded transition-colors cursor-pointer"
                    >
                        {refreshing ? '재분석 중...' : '🔄 Peer 반영 재분석'}
                    </button>
                    <button
                        onClick={() => {
                            setPeerInput('');
                            loadReport('', true);
                        }}
                        disabled={refreshing}
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded transition-colors cursor-pointer"
                    >
                        자동 선정 초기화
                    </button>
                </div>

                <div className="flex items-center gap-2 text-xs justify-end">
                    <button
                        onClick={() => setShowPrompt((prev) => !prev)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded font-semibold text-slate-200 cursor-pointer"
                    >
                        {showPrompt ? '프롬프트 닫기' : '📋 분석 기준 프롬프트'}
                    </button>
                    <button
                        onClick={handleCopyMarkdown}
                        className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white font-bold rounded cursor-pointer"
                    >
                        {copied ? '✅ 복사 완료!' : '📑 마크다운 복사'}
                    </button>
                    <button
                        onClick={() => window.print()}
                        className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold rounded cursor-pointer"
                    >
                        🖨️ PDF 인쇄 / 저장
                    </button>
                </div>
            </div>

            {/* 프롬프트 확인 패널 */}
            {showPrompt && prompt_used && (
                <div className="max-w-5xl mx-auto mb-4 bg-slate-950 text-slate-200 border border-indigo-500/40 rounded-lg p-4 text-xs font-mono whitespace-pre-wrap leading-relaxed shadow print:hidden">
                    <div className="text-indigo-400 font-bold mb-2 font-sans text-sm">적용된 시니어 기업분석 애널리스트 리서치 프롬프트</div>
                    {prompt_used}
                </div>
            )}

            {/* 메인 기관급 리포트 본문 */}
            <div className="max-w-5xl mx-auto bg-white shadow-2xl border border-slate-300 print:shadow-none print:border-none">
                {/* 기관 리서치 헤더 */}
                <header className="border-b-4 border-indigo-950 bg-gradient-to-r from-slate-50 to-indigo-50/40 px-8 py-7">
                    <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="px-2.5 py-0.5 bg-indigo-950 text-white text-[11px] font-extrabold uppercase tracking-wider rounded">
                                    Institutional Equity Research
                                </span>
                                {sector && (
                                    <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-900 text-[11px] font-bold rounded">
                                        {sector} · {industry}
                                    </span>
                                )}
                                <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[11px] font-mono font-bold rounded">
                                    통화: {currency}
                                </span>
                            </div>
                            <h1 className="text-3xl md:text-4xl font-black text-indigo-950 tracking-tight">
                                {name}
                                <span className="text-xl font-mono text-slate-500 ml-2.5">({report.ticker})</span>
                            </h1>
                            <p className="text-xs font-bold text-slate-600 mt-1.5">
                                Senior Equity Research Analyst Deep-Dive · Forward Consensus &amp; Peer Multiple Re-rating Analysis
                            </p>
                        </div>
                        <div className="text-left md:text-right text-xs text-slate-600 space-y-0.5">
                            <div><strong>분석 기준일:</strong> {as_of_date || new Date().toISOString().slice(0, 10)} 현재 기준</div>
                            <div><strong>전망 시계열:</strong> {horizon_label}</div>
                            <div className="text-slate-400">Stockcoding Institutional Research Desk</div>
                        </div>
                    </div>

                    {/* 분석 대상 및 기준 메타 바 */}
                    <div className="mt-5 pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs bg-white/80 rounded p-3 border">
                        <div>
                            <span className="font-bold text-slate-500 mr-2">• 분석 대상 기업:</span>
                            <span className="font-extrabold text-slate-900">{name} ({report.ticker})</span>
                        </div>
                        <div>
                            <span className="font-bold text-slate-500 mr-2">• 비교 경쟁사 (Peer Group):</span>
                            <span className="font-bold text-indigo-900">{peer_label || '-'}</span>
                        </div>
                    </div>
                </header>

                {/* 핵심 투자의견 & 컨센서스 목표주가 밴드 카드 */}
                <section className="px-8 pt-6 pb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 border border-slate-300 rounded-lg overflow-hidden bg-slate-50 shadow-sm">
                        <div className="p-4 border-b md:border-b-0 border-r border-slate-200 text-center">
                            <div className="text-xs font-bold text-slate-500 mb-1">투자의견 (Rating)</div>
                            <div className={`text-xl md:text-2xl font-black ${opinionColor}`}>{opinion_text}</div>
                            {valuation_stance && (
                                <div className="mt-1 inline-block px-2 py-0.5 rounded bg-indigo-100 text-indigo-900 text-[11px] font-bold">
                                    {valuation_stance}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-b md:border-b-0 md:border-r border-slate-200 text-center">
                            <div className="text-xs font-bold text-slate-500 mb-1">목표주가 (12M Consensus)</div>
                            <div className="text-xl md:text-2xl font-black text-indigo-950">
                                {target_price_fmt || fmtUnitVal(target_price)}
                            </div>
                            {target_band && (
                                <div className="text-[11px] text-slate-500 mt-1 font-medium">
                                    커버리지 {target_band.analyst_count}개 기관 기준
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-r border-slate-200 text-center">
                            <div className="text-xs font-bold text-slate-500 mb-1">현재 주가</div>
                            <div className="text-xl md:text-2xl font-black text-slate-900">
                                {current_price_fmt || fmtUnitVal(current_price)}
                            </div>
                            {report.change_pct !== undefined && (
                                <div className={`text-xs font-bold mt-1 ${report.change_pct > 0 ? 'text-red-600' : report.change_pct < 0 ? 'text-blue-600' : 'text-slate-500'}`}>
                                    전일대비 {report.change_pct > 0 ? '+' : ''}{Number(report.change_pct).toFixed(2)}%
                                </div>
                            )}
                        </div>

                        <div className="p-4 text-center">
                            <div className="text-xs font-bold text-slate-500 mb-1">기대 상승여력 (Upside)</div>
                            <div className={`text-xl md:text-2xl font-black ${upside_pct >= 0 ? 'text-emerald-600' : 'text-blue-600'}`}>
                                {upside_pct >= 0 ? '+' : ''}{Number(upside_pct).toFixed(1)}%
                            </div>
                            {target_band && (
                                <div className="text-[10px] text-slate-600 mt-1 font-mono">
                                    Bull {target_band.bull_fmt} / Bear {target_band.bear_fmt}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 시나리오 목표가 밴드 & 핵심 Forward 멀티플 요약 바 */}
                    {(target_band || key_multiples) && (
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            {target_band && (
                                <div className="bg-indigo-50/70 border border-indigo-200 rounded p-3 flex items-center justify-between">
                                    <span className="font-extrabold text-indigo-950">🎯 컨센서스 목표주가 밴드</span>
                                    <div className="flex gap-3 font-mono">
                                        <span className="text-red-700 font-bold">Bull: {target_band.bull_fmt} ({target_band.bull_upside_pct >= 0 ? '+' : ''}{target_band.bull_upside_pct}%)</span>
                                        <span className="text-indigo-900 font-extrabold">Mean: {target_band.mean_fmt}</span>
                                        <span className="text-blue-700 font-bold">Bear: {target_band.bear_fmt} ({target_band.bear_upside_pct >= 0 ? '+' : ''}{target_band.bear_upside_pct}%)</span>
                                    </div>
                                </div>
                            )}
                            {key_multiples && (
                                <div className="bg-slate-100 border border-slate-300 rounded p-3 flex items-center justify-between">
                                    <span className="font-extrabold text-slate-800">📊 12M Fwd 멀티플 (vs Peer 평균)</span>
                                    <div className="flex gap-3 font-mono text-[11px]">
                                        <span>PER <strong>{key_multiples.fwd_per}배</strong> <em className="not-italic text-slate-500">({key_multiples.peer_avg_per}배)</em></span>
                                        <span>PBR <strong>{key_multiples.fwd_pbr}배</strong> <em className="not-italic text-slate-500">({key_multiples.peer_avg_pbr}배)</em></span>
                                        <span>EV/EBITDA <strong>{key_multiples.ev_ebitda}배</strong></span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {ai_executive_insight && (
                        <div className="mt-4 bg-amber-50/80 border-l-4 border-amber-500 p-4 rounded-r text-sm text-slate-800 leading-relaxed">
                            <div className="text-xs font-extrabold text-amber-900 uppercase mb-1">Senior Analyst Executive Insight</div>
                            <p className="whitespace-pre-line">{renderFormattedText(ai_executive_insight)}</p>
                        </div>
                    )}
                </section>

                {/* 6대 필수 심층 리포트 본문 섹션 */}
                <div className="px-8 py-4 space-y-8">
                    {sections.map((sec: any) => (
                        <section key={sec.id} className="border-t border-slate-200 pt-6 first:border-t-0 first:pt-2">
                            <h2 className="text-lg md:text-xl font-black text-indigo-950 mb-3.5 border-l-4 border-indigo-700 pl-3 flex items-center justify-between">
                                <span>{sec.title}</span>
                                {sec.id === 3 && financial_health && (
                                    <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300">
                                        이자보상배율 {financial_health.interest_coverage}배 · 조달금리 {financial_health.avg_borrowing_rate}%
                                    </span>
                                )}
                                {sec.id === 4 && dupont && (
                                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                        {dupont.fcf_stage}
                                    </span>
                                )}
                            </h2>

                            <ul className="space-y-3 text-sm text-slate-800 leading-relaxed">
                                {sec.bullets?.map((bullet: string, bIdx: number) => (
                                    <li key={bIdx} className="flex items-start gap-2.5 text-justify">
                                        <span className="text-indigo-700 font-black mt-0.5 select-none">▪</span>
                                        <span className="flex-1 whitespace-pre-line">{renderFormattedText(bullet)}</span>
                                    </li>
                                ))}
                            </ul>

                            {/* 섹션 4 내부: 필수 마크다운/정량 표 2종 (시계열 추이 표 & 경쟁사 멀티플 비교 표) */}
                            {sec.id === 4 && (
                                <div className="mt-6 space-y-6">
                                    {/* 표 1: 시계열 추이 표 */}
                                    {timeseries_table.length > 0 && (
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="text-sm font-extrabold text-slate-900">
                                                    [표 1] 핵심 밸류에이션 및 현금흐름 시계열 추이 표 (최근 1년 실적 ~ 향후 3년 컨센서스 전망치)
                                                </h3>
                                                <span className="text-[11px] text-slate-500 font-mono">통화 기준: {currency}</span>
                                            </div>
                                            <div className="overflow-x-auto border border-slate-300 rounded">
                                                <table className="w-full text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-indigo-950 text-white">
                                                            <th className="py-2.5 px-3 text-left font-bold border-r border-indigo-900">핵심 재무·밸류에이션 지표</th>
                                                            {timeseries_table.map((col: any) => (
                                                                <th
                                                                    key={col.year}
                                                                    className={`py-2.5 px-3 text-right font-bold border-r last:border-r-0 border-indigo-900 ${col.period.includes('E') ? 'bg-indigo-900 text-amber-200' : ''}`}
                                                                >
                                                                    {col.period}
                                                                </th>
                                                            ))}
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200">
                                                        <tr className="hover:bg-slate-50">
                                                            <td className="py-2 px-3 font-bold text-slate-800 border-r border-slate-200">매출액 (YoY 성장률)</td>
                                                            {timeseries_table.map((c: any) => (
                                                                <td key={c.year} className="py-2 px-3 text-right font-mono border-r last:border-r-0 border-slate-200">
                                                                    <div className="font-bold text-slate-900">{c.revenue_fmt}</div>
                                                                    <div className={`text-[10px] ${c.yoy_pct >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                                                                        ({c.yoy_pct >= 0 ? '+' : ''}{c.yoy_pct}%)
                                                                    </div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        <tr className="bg-slate-50/70 hover:bg-slate-100/60">
                                                            <td className="py-2 px-3 font-bold text-slate-800 border-r border-slate-200">매출총이익률 (GPM)</td>
                                                            {timeseries_table.map((c: any) => (
                                                                <td key={c.year} className="py-2 px-3 text-right font-mono border-r last:border-r-0 border-slate-200">
                                                                    {c.gpm_pct?.toFixed(1)}%
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        <tr className="hover:bg-slate-50">
                                                            <td className="py-2 px-3 font-bold text-slate-800 border-r border-slate-200">영업이익 (영업이익률 OPM)</td>
                                                            {timeseries_table.map((c: any) => (
                                                                <td key={c.year} className="py-2 px-3 text-right font-mono border-r last:border-r-0 border-slate-200">
                                                                    <div className="font-bold text-slate-900">{c.op_fmt}</div>
                                                                    <div className="text-[10px] text-indigo-700 font-semibold">OPM {c.opm_pct?.toFixed(2)}%</div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        <tr className="bg-indigo-50/40 hover:bg-indigo-50">
                                                            <td className="py-2 px-3 font-extrabold text-indigo-950 border-r border-slate-200">
                                                                ROE (자기자본이익률)
                                                                {dupont && (
                                                                    <span className="block text-[10px] font-normal text-slate-500">
                                                                        듀폰: 순이익률 {dupont.net_margin_pct}% × 회전율 {dupont.asset_turnover} × 레버리지 {dupont.fin_leverage}
                                                                    </span>
                                                                )}
                                                            </td>
                                                            {timeseries_table.map((c: any) => (
                                                                <td key={c.year} className="py-2 px-3 text-right font-mono font-extrabold text-indigo-900 border-r last:border-r-0 border-slate-200">
                                                                    {c.roe_pct?.toFixed(2)}%
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        <tr className="hover:bg-slate-50">
                                                            <td className="py-2 px-3 font-extrabold text-slate-800 border-r border-slate-200">BPS (주당순자산 / Forward PBR)</td>
                                                            {timeseries_table.map((c: any) => (
                                                                <td key={c.year} className="py-2 px-3 text-right font-mono border-r last:border-r-0 border-slate-200">
                                                                    <div className="font-bold text-slate-900">{c.bps_fmt}</div>
                                                                    <div className="text-[10px] text-slate-600">PBR {c.fwd_pbr?.toFixed(2)}배</div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        <tr className="bg-slate-50/70 hover:bg-slate-100/60">
                                                            <td className="py-2 px-3 font-extrabold text-slate-800 border-r border-slate-200">EBITDA (상각전영업이익 / EV/EBITDA)</td>
                                                            {timeseries_table.map((c: any) => (
                                                                <td key={c.year} className="py-2 px-3 text-right font-mono border-r last:border-r-0 border-slate-200">
                                                                    <div className="font-bold text-slate-900">{c.ebitda_fmt}</div>
                                                                    <div className="text-[10px] text-slate-600">EV/EBITDA {c.ev_ebitda?.toFixed(2)}배</div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        <tr className="hover:bg-slate-50">
                                                            <td className="py-2 px-3 font-semibold text-slate-700 border-r border-slate-200">영업현금흐름 (OCF) / CAPEX</td>
                                                            {timeseries_table.map((c: any) => (
                                                                <td key={c.year} className="py-2 px-3 text-right font-mono text-[11px] border-r last:border-r-0 border-slate-200">
                                                                    <div>OCF: {c.ocf_fmt}</div>
                                                                    <div className="text-slate-500">CAPEX: {c.capex_fmt}</div>
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        <tr className="bg-emerald-50/50 hover:bg-emerald-50">
                                                            <td className="py-2 px-3 font-extrabold text-emerald-950 border-r border-slate-200">
                                                                잉여현금흐름 (Free Cash Flow, FCF)
                                                            </td>
                                                            {timeseries_table.map((c: any) => (
                                                                <td key={c.year} className="py-2 px-3 text-right font-mono font-extrabold text-emerald-800 border-r last:border-r-0 border-slate-200">
                                                                    {c.fcf_fmt}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                        <tr className="hover:bg-slate-50">
                                                            <td className="py-2 px-3 font-bold text-slate-800 border-r border-slate-200">주당배당금 (DPS / 배당수익률)</td>
                                                            {timeseries_table.map((c: any) => (
                                                                <td key={c.year} className="py-2 px-3 text-right font-mono border-r last:border-r-0 border-slate-200">
                                                                    <div className="font-semibold text-slate-800">{c.dps_fmt}</div>
                                                                    {c.div_yield_pct > 0 && (
                                                                        <div className="text-[10px] text-slate-500">
                                                                            수익률 {c.div_yield_pct}% (성향 {c.payout_pct}%)
                                                                        </div>
                                                                    )}
                                                                </td>
                                                            ))}
                                                        </tr>
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* 표 2: 경쟁사(Peer Group) 멀티플 비교 표 */}
                                    {peer_comparison_table.length > 0 && (
                                        <div>
                                            <div className="flex items-center justify-between mb-2">
                                                <h3 className="text-sm font-extrabold text-slate-900">
                                                    [표 2] 경쟁사(Peer Group) 밸류에이션 멀티플 및 수익성 비교 표 (12M Forward 기준)
                                                </h3>
                                                <span className="text-[11px] text-slate-500">할증(Premium) / 할인(Discount) 상대가치 대조</span>
                                            </div>
                                            <div className="overflow-x-auto border border-slate-300 rounded">
                                                <table className="w-full text-xs border-collapse">
                                                    <thead>
                                                        <tr className="bg-slate-900 text-white">
                                                            <th className="py-2.5 px-3 text-left font-bold border-r border-slate-700">기업명 (티커)</th>
                                                            <th className="py-2.5 px-2.5 text-right font-bold border-r border-slate-700">현재가</th>
                                                            <th className="py-2.5 px-2.5 text-right font-bold border-r border-slate-700">시가총액</th>
                                                            <th className="py-2.5 px-2.5 text-right font-bold border-r border-slate-700 text-amber-300">Forward PER</th>
                                                            <th className="py-2.5 px-2.5 text-right font-bold border-r border-slate-700 text-amber-300">Forward PBR</th>
                                                            <th className="py-2.5 px-2.5 text-right font-bold border-r border-slate-700 text-amber-300">Fwd EV/EBITDA</th>
                                                            <th className="py-2.5 px-2.5 text-right font-bold border-r border-slate-700">ROE (%)</th>
                                                            <th className="py-2.5 px-2.5 text-right font-bold border-r border-slate-700">OPM (%)</th>
                                                            <th className="py-2.5 px-3 text-left font-bold">밸류에이션 비고</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-200">
                                                        {peer_comparison_table.map((row: any, rIdx: number) => {
                                                            const rowCls = row.is_target
                                                                ? 'bg-indigo-50/90 font-extrabold text-indigo-950'
                                                                : row.is_average
                                                                ? 'bg-amber-50/90 font-extrabold text-slate-900 border-t-2 border-slate-400'
                                                                : 'hover:bg-slate-50 text-slate-800';
                                                            return (
                                                                <tr key={rIdx} className={rowCls}>
                                                                    <td className="py-2.5 px-3 border-r border-slate-200">{row.name}</td>
                                                                    <td className="py-2.5 px-2.5 text-right font-mono border-r border-slate-200">{row.price_fmt}</td>
                                                                    <td className="py-2.5 px-2.5 text-right font-mono border-r border-slate-200">{row.mcap_fmt}</td>
                                                                    <td className="py-2.5 px-2.5 text-right font-mono border-r border-slate-200">
                                                                        {row.fwd_per > 0 ? `${Number(row.fwd_per).toFixed(2)}배` : '-'}
                                                                    </td>
                                                                    <td className="py-2.5 px-2.5 text-right font-mono border-r border-slate-200">
                                                                        {row.fwd_pbr > 0 ? `${Number(row.fwd_pbr).toFixed(2)}배` : '-'}
                                                                    </td>
                                                                    <td className="py-2.5 px-2.5 text-right font-mono border-r border-slate-200">
                                                                        {row.ev_ebitda > 0 ? `${Number(row.ev_ebitda).toFixed(2)}배` : '-'}
                                                                    </td>
                                                                    <td className="py-2.5 px-2.5 text-right font-mono border-r border-slate-200">
                                                                        {Number(row.roe_pct).toFixed(2)}%
                                                                    </td>
                                                                    <td className="py-2.5 px-2.5 text-right font-mono border-r border-slate-200">
                                                                        {Number(row.opm_pct).toFixed(2)}%
                                                                    </td>
                                                                    <td className="py-2.5 px-3 text-[11px]">{row.status}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </section>
                    ))}
                </div>

                {/* 정량 내재가치 모델 교차검증 부록 (RIM & DCF) */}
                {valuation_rim && valuation_dcf && (
                    <section className="px-8 py-6 mt-4 border-t-2 border-slate-200 bg-slate-50/60">
                        <h2 className="text-base font-black text-slate-800 mb-3 border-l-4 border-slate-600 pl-2.5">
                            [Appendix] 절대가치 평가 모델 교차검증 (RIM 초과이익모형 &amp; DCF 현금흐름할인모형)
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <h3 className="text-xs font-bold text-slate-700 mb-1.5 pb-1 border-b border-slate-300">
                                    1. 잔여이익모델 (RIM) — COE {(valuation_rim.coe * 100).toFixed(1)}%, 영구성장률 {(valuation_rim.term_growth * 100).toFixed(1)}%
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[11px] text-right border-collapse border border-slate-300 bg-white">
                                        <thead>
                                            <tr className="bg-slate-100 text-slate-600 border-b border-slate-300">
                                                <th className="py-1.5 px-2 text-left border-r border-slate-300">연도</th>
                                                {valuation_rim.projection?.map((p: any) => (
                                                    <th key={p.year} className="py-1.5 px-1.5 border-r border-slate-300">{p.year}E</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="border-b border-slate-200">
                                                <td className="py-1.5 px-2 text-left font-bold border-r border-slate-300">추정 ROE(%)</td>
                                                {valuation_rim.projection?.map((p: any) => (
                                                    <td key={p.year} className="py-1.5 px-1.5 font-mono border-r border-slate-200">{p.roe}</td>
                                                ))}
                                            </tr>
                                            <tr className="border-b border-slate-200 bg-slate-50">
                                                <td className="py-1.5 px-2 text-left font-bold border-r border-slate-300">잔여이익(RI)</td>
                                                {valuation_rim.projection?.map((p: any) => (
                                                    <td key={p.year} className="py-1.5 px-1.5 font-mono border-r border-slate-200">{Number(p.ri).toLocaleString()}</td>
                                                ))}
                                            </tr>
                                            <tr>
                                                <td className="py-1.5 px-2 text-left font-bold text-indigo-900 border-r border-slate-300">PV of RI</td>
                                                {valuation_rim.projection?.map((p: any) => (
                                                    <td key={p.year} className="py-1.5 px-1.5 font-mono border-r border-slate-200">{Number(p.pv_ri).toLocaleString()}</td>
                                                ))}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-1.5 text-right text-xs font-bold text-indigo-950">
                                    RIM 내재가치: {fmtUnitVal(valuation_rim.theoretical_price)}
                                </div>
                            </div>

                            <div>
                                <h3 className="text-xs font-bold text-slate-700 mb-1.5 pb-1 border-b border-slate-300">
                                    2. 현금흐름할인모델 (DCF) — WACC {(valuation_dcf.wacc * 100).toFixed(1)}%, 영구성장률 {(valuation_dcf.term_growth * 100).toFixed(1)}%
                                </h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[11px] text-right border-collapse border border-slate-300 bg-white">
                                        <thead>
                                            <tr className="bg-slate-100 text-slate-600 border-b border-slate-300">
                                                <th className="py-1.5 px-2 text-left border-r border-slate-300">연도</th>
                                                {valuation_dcf.projection?.map((p: any) => (
                                                    <th key={p.year} className="py-1.5 px-1.5 border-r border-slate-300">{p.year}E</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr className="border-b border-slate-200">
                                                <td className="py-1.5 px-2 text-left font-bold border-r border-slate-300">추정 EPS</td>
                                                {valuation_dcf.projection?.map((p: any) => (
                                                    <td key={p.year} className="py-1.5 px-1.5 font-mono border-r border-slate-200">{Number(p.eps).toLocaleString()}</td>
                                                ))}
                                            </tr>
                                            <tr className="border-b border-slate-200 bg-slate-50">
                                                <td className="py-1.5 px-2 text-left font-bold border-r border-slate-300">추정 주당 FCF</td>
                                                {valuation_dcf.projection?.map((p: any) => (
                                                    <td key={p.year} className="py-1.5 px-1.5 font-mono border-r border-slate-200">{Number(p.fcf).toLocaleString()}</td>
                                                ))}
                                            </tr>
                                            <tr>
                                                <td className="py-1.5 px-2 text-left font-bold text-indigo-900 border-r border-slate-300">PV of FCF</td>
                                                {valuation_dcf.projection?.map((p: any) => (
                                                    <td key={p.year} className="py-1.5 px-1.5 font-mono border-r border-slate-200">{Number(p.pv_fcf).toLocaleString()}</td>
                                                ))}
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-1.5 text-right text-xs font-bold text-indigo-950">
                                    DCF 내재가치: {fmtUnitVal(valuation_dcf.theoretical_price)}
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* Compliance Footer */}
                <footer className="px-8 py-6 border-t border-slate-200 bg-white">
                    <p className="text-[10px] text-slate-400 text-justify leading-relaxed">
                        Compliance Notice: 본 심층 리포트는 시니어 기업분석 애널리스트 프레임워크에 의거하여 시장 컨센서스(Forward Consensus), 재무제표, 경쟁사(Peer Group) 상대가치 멀티플 및 내재가치 모델(RIM·DCF)을 결합해 산출한 분석 자료입니다. 모든 전망치(E)는 시장 환경 및 기업 실적 발표에 따라 변동될 수 있으며, 본 자료는 투자 판단의 참고자료일 뿐 특정 종목의 매수·매도에 대한 법적 책임의 증빙으로 사용될 수 없습니다.
                    </p>
                </footer>
            </div>
        </div>
    );
}
