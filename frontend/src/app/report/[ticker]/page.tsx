"use client";

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function AnalystReport() {
    const params = useParams();
    const ticker = params.ticker as string;
    
    const [report, setReport] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!ticker) return;
        const fetchReport = async () => {
            try {
                const res = await fetch(`/api/report/${ticker}`);
                if (!res.ok) throw new Error(res.statusText || 'API Error');
                const data = await res.json();
                setReport(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchReport();
    }, [ticker]);

    if (loading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-800 font-sans text-xl">Loading Report...</div>;
    }

    if (!report || report.error) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100 text-red-600 font-sans text-xl">Error loading report.</div>;
    }

    const { name, current_price, target_price, opinion, opinion_text, valuation_dcf, valuation_rim, outlooks } = report;

    return (
        <div className="min-h-screen bg-gray-200 py-10 px-4 font-sans text-gray-900 print:bg-white print:p-0">
            <div className="max-w-4xl mx-auto bg-white shadow-xl min-h-[1100px] border border-gray-300 print:shadow-none print:border-none">
                
                {/* Header */}
                <header className="border-b-4 border-indigo-900 p-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-black text-indigo-900 tracking-tight mb-2">{name} <span className="text-xl font-mono text-gray-500 ml-2">{ticker}</span></h1>
                        <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">AI Analyst Equity Research Report</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">발간일: {new Date().toLocaleDateString('ko-KR')}</div>
                        <div className="text-xs text-gray-500">Stockcoding Terminal AI</div>
                    </div>
                </header>

                {/* Investment Summary */}
                <div className="p-8 pb-4">
                    <div className="flex bg-gray-50 border border-gray-200 rounded p-6 items-center justify-between shadow-sm">
                        <div className="text-center px-6 border-r border-gray-300">
                            <div className="text-sm text-gray-500 font-bold mb-1">투자의견</div>
                            <div className={`text-3xl font-black ${opinion === 'Buy' ? 'text-red-600' : opinion === 'Sell' ? 'text-blue-600' : 'text-gray-700'}`}>
                                {opinion_text}
                            </div>
                        </div>
                        <div className="text-center px-6 border-r border-gray-300">
                            <div className="text-sm text-gray-500 font-bold mb-1">목표주가 (12M)</div>
                            <div className="text-3xl font-black text-indigo-900">{target_price > 0 ? Math.round(target_price).toLocaleString() : '-'} <span className="text-lg">원</span></div>
                        </div>
                        <div className="text-center px-6">
                            <div className="text-sm text-gray-500 font-bold mb-1">현재가 ({new Date().toLocaleDateString('ko-KR')})</div>
                            <div className="text-3xl font-black text-gray-800 flex items-center justify-center gap-2">
                                {current_price > 0 ? Math.round(current_price).toLocaleString() : '-'} <span className="text-lg">원</span>
                                {report?.change !== undefined && (
                                    <span className={`text-base font-bold ${report.change > 0 ? 'text-red-500' : report.change < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                                        ({report.change > 0 ? '+' : ''}{report.change_pct ? report.change_pct.toFixed(2) : ((report.change / (current_price - report.change)) * 100).toFixed(2)}%)
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="text-center px-6 border-l border-gray-300">
                            <div className="text-sm text-gray-500 font-bold mb-1">상승여력</div>
                            <div className="text-3xl font-black text-green-600">
                                {current_price > 0 ? (((target_price / current_price) - 1) * 100).toFixed(1) : '-'}%
                            </div>
                        </div>
                    </div>
                </div>

                {/* Outlooks */}
                <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-8 border-b border-gray-200">
                    <div>
                        <h2 className="text-lg font-black text-indigo-900 mb-3 border-l-4 border-indigo-600 pl-2">영업 및 실적 전망</h2>
                        <p className="text-sm text-gray-700 leading-relaxed text-justify indent-2">
                            {outlooks.business}
                        </p>
                    </div>
                    <div>
                        <h2 className="text-lg font-black text-indigo-900 mb-3 border-l-4 border-indigo-600 pl-2">투자 전략</h2>
                        <p className="text-sm text-gray-700 leading-relaxed text-justify indent-2">
                            {outlooks.investment}
                        </p>
                    </div>
                </div>

                {/* Valuation Section */}
                <div className="p-8">
                    <h2 className="text-lg font-black text-indigo-900 mb-4 border-l-4 border-indigo-600 pl-2">Valuation (이론적 가치 산출)</h2>
                    <p className="text-sm text-gray-700 mb-6">
                        {outlooks.price}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* RIM Model Table */}
                        <div>
                            <h3 className="font-bold text-gray-800 mb-2 border-b-2 border-gray-300 pb-1">1. 초과이익모델 (RIM)</h3>
                            <p className="text-xs text-gray-500 mb-2">COE: {(valuation_rim.coe * 100).toFixed(1)}%, 장기성장률: {(valuation_rim.term_growth * 100).toFixed(1)}% | 기초 BPS: {valuation_rim.bps_current.toLocaleString()}</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-right border-collapse border border-gray-300">
                                    <thead>
                                        <tr className="bg-gray-100 text-gray-600 border-b border-gray-300">
                                            <th className="py-2 px-2 text-left border-r border-gray-300">연도</th>
                                            {valuation_rim.projection?.map((p: any) => <th key={p.year} className="py-2 px-1 border-r border-gray-300">{p.year}E</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-2 text-left font-bold border-r border-gray-300">추정 ROE(%)</td>
                                            {valuation_rim.projection?.map((p: any) => <td key={p.year} className="py-2 px-1 border-r border-gray-200">{p.roe}</td>)}
                                        </tr>
                                        <tr className="border-b border-gray-200 bg-gray-50">
                                            <td className="py-2 px-2 text-left font-bold border-r border-gray-300">잔여이익(RI)</td>
                                            {valuation_rim.projection?.map((p: any) => <td key={p.year} className="py-2 px-1 border-r border-gray-200">{p.ri.toLocaleString()}</td>)}
                                        </tr>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-2 text-left font-bold border-r border-gray-300 text-blue-800">PV of RI</td>
                                            {valuation_rim.projection?.map((p: any) => <td key={p.year} className="py-2 px-1 border-r border-gray-200">{p.pv_ri.toLocaleString()}</td>)}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-2 text-right">
                                <div className="text-xs text-gray-500">RIM 이론가</div>
                                <div className="text-lg font-bold text-indigo-900">{valuation_rim.theoretical_price.toLocaleString(undefined, {maximumFractionDigits: 0})} 원</div>
                            </div>
                        </div>

                        {/* DCF Model Table */}
                        <div>
                            <h3 className="font-bold text-gray-800 mb-2 border-b-2 border-gray-300 pb-1">2. 현금흐름할인 (DCF)</h3>
                            <p className="text-xs text-gray-500 mb-2">WACC: {(valuation_dcf.wacc * 100).toFixed(1)}%, 장기성장률: {(valuation_dcf.term_growth * 100).toFixed(1)}%</p>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs text-right border-collapse border border-gray-300">
                                    <thead>
                                        <tr className="bg-gray-100 text-gray-600 border-b border-gray-300">
                                            <th className="py-2 px-2 text-left border-r border-gray-300">연도</th>
                                            {valuation_dcf.projection?.map((p: any) => <th key={p.year} className="py-2 px-1 border-r border-gray-300">{p.year}E</th>)}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-2 text-left font-bold border-r border-gray-300">추정 EPS</td>
                                            {valuation_dcf.projection?.map((p: any) => <td key={p.year} className="py-2 px-1 border-r border-gray-200">{p.eps.toLocaleString()}</td>)}
                                        </tr>
                                        <tr className="border-b border-gray-200 bg-gray-50">
                                            <td className="py-2 px-2 text-left font-bold border-r border-gray-300">추정 FCF</td>
                                            {valuation_dcf.projection?.map((p: any) => <td key={p.year} className="py-2 px-1 border-r border-gray-200">{p.fcf.toLocaleString()}</td>)}
                                        </tr>
                                        <tr className="border-b border-gray-200">
                                            <td className="py-2 px-2 text-left font-bold border-r border-gray-300 text-blue-800">PV of FCF</td>
                                            {valuation_dcf.projection?.map((p: any) => <td key={p.year} className="py-2 px-1 border-r border-gray-200">{p.pv_fcf.toLocaleString()}</td>)}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div className="mt-2 text-right">
                                <div className="text-xs text-gray-500">DCF 이론가</div>
                                <div className="text-lg font-bold text-indigo-900">{valuation_dcf.theoretical_price.toLocaleString(undefined, {maximumFractionDigits: 0})} 원</div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 bg-indigo-50 border border-indigo-100 rounded p-6 flex flex-col md:flex-row justify-between items-center">
                        <div className="mb-4 md:mb-0">
                            <h3 className="font-bold text-indigo-900 mb-1">최종 목표가 산출 내역</h3>
                            <div className="text-xs text-gray-600">초과이익모델(RIM)과 현금흐름할인모형(DCF)의 산술 평균 적용</div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm font-bold text-gray-700 mb-1">복합 적정 가치 (목표가)</div>
                            <div className="text-2xl font-black text-indigo-900 underline decoration-indigo-300 underline-offset-4">
                                {target_price.toLocaleString(undefined, {maximumFractionDigits: 0})} 원
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Notice */}
                <div className="p-8 pt-20 mt-10">
                    <p className="text-[10px] text-gray-400 text-justify border-t border-gray-200 pt-4 leading-relaxed">
                        Compliance Notice: 본 자료에 게재된 내용은 AI 모델이 재무 데이터를 기반으로 생성한 가상의 분석 및 전망입니다. 투자 참고용으로만 활용 가능하며, 실제 투자의 결과에 대한 법적 책임 소재의 증빙자료로 사용될 수 없습니다. 어떠한 경우에도 본 자료는 주식 투자를 권유하기 위한 목적으로 작성되지 않았습니다.
                    </p>
                </div>
            </div>

            {/* Print Button Wrapper */}
            <div className="max-w-4xl mx-auto mt-4 text-right print:hidden">
                <button onClick={() => window.print()} className="px-6 py-2 bg-gray-800 text-white font-bold rounded shadow hover:bg-gray-700 transition-colors">
                    🖨️ PDF 인쇄 / 저장
                </button>
            </div>
        </div>
    );
}
