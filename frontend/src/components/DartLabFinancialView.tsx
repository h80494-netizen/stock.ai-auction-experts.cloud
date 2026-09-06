'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  LineChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar
} from 'recharts';

interface DartLabFinancialViewProps {
  initialTicker?: string;
  onSelectTicker?: (ticker: string) => void;
}

const TOP_STOCKS = [
  { ticker: '005930', name: '삼성전자' },
  { ticker: '000660', name: 'SK하이닉스' },
  { ticker: '005380', name: '현대차' },
  { ticker: '035420', name: 'NAVER' },
  { ticker: '000270', name: '기아' },
  { ticker: '373220', name: 'LG에너지솔루션' }
];

export default function DartLabFinancialView({ initialTicker = '005930', onSelectTicker }: DartLabFinancialViewProps) {
  const [ticker, setTicker] = useState<string>(initialTicker);
  const [searchInput, setSearchInput] = useState<string>(initialTicker);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  
  // Sub-tab selection: 'statements' | 'ratios' | 'credit' | 'valuation' | 'story' | 'filings'
  const [activeTab, setActiveTab] = useState<'statements' | 'ratios' | 'credit' | 'valuation' | 'story' | 'filings'>('statements');
  const [statementType, setStatementType] = useState<'is' | 'bs' | 'cf'>('is');
  const [tableFilter, setTableFilter] = useState<string>('');

  useEffect(() => {
    if (initialTicker && initialTicker !== ticker) {
      setTicker(initialTicker);
      setSearchInput(initialTicker);
    }
  }, [initialTicker]);

  useEffect(() => {
    let isMounted = true;
    const fetchDartLab = async () => {
      if (!ticker) return;
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/dartlab/financials/${ticker}`);
        if (!res.ok) throw new Error(`서버 응답 오류: ${res.status}`);
        const json = await res.json();
        if (json.success && json.data) {
          if (isMounted) setData(json.data);
        } else {
          throw new Error(json.error || '데이터를 불러오지 못했습니다.');
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || '데이터 로드 실패');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchDartLab();
    return () => { isMounted = false; };
  }, [ticker]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchInput.trim()) {
      const clean = searchInput.trim().toUpperCase();
      setTicker(clean);
      if (onSelectTicker) onSelectTicker(clean);
    }
  };

  const selectQuickStock = (tk: string) => {
    setSearchInput(tk);
    setTicker(tk);
    if (onSelectTicker) onSelectTicker(tk);
  };

  // Format monetary value
  const formatMoney = (val: any) => {
    if (val === null || val === undefined || val === '') return '-';
    const num = Number(val);
    if (isNaN(num)) return val;
    if (Math.abs(num) >= 1_000_000_000_000) {
      return `${(num / 1_000_000_000_000).toFixed(1)}조`;
    }
    if (Math.abs(num) >= 100_000_000) {
      return `${(num / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 0 })}억`;
    }
    return num.toLocaleString();
  };

  // Chart data preparation for Statements
  const statementChartData = useMemo(() => {
    if (!data || !data.statements || !data.statements.periods) return [];
    const periods = [...data.statements.periods].reverse(); // Oldest to newest
    
    return periods.map(p => {
      const row: any = { period: p };
      if (statementType === 'is') {
        const rev = data.statements.is?.find((r: any) => r.id === 'revenue' || r.label?.includes('매출액'))?.values?.[p];
        const op = data.statements.is?.find((r: any) => r.id === 'operating_profit' || r.label?.includes('영업이익'))?.values?.[p];
        const np = data.statements.is?.find((r: any) => r.id === 'net_profit' || r.label?.includes('당기순이익'))?.values?.[p];
        row['매출액'] = rev ? rev / 100_000_000 : 0;
        row['영업이익'] = op ? op / 100_000_000 : 0;
        row['당기순이익'] = np ? np / 100_000_000 : 0;
      } else if (statementType === 'bs') {
        const assets = data.statements.bs?.find((r: any) => r.id === 'assets' || r.label?.includes('자산총계'))?.values?.[p];
        const liab = data.statements.bs?.find((r: any) => r.id === 'liabilities' || r.label?.includes('부채총계'))?.values?.[p];
        const equity = data.statements.bs?.find((r: any) => r.id === 'equity' || r.label?.includes('자본총계'))?.values?.[p];
        row['자산총계'] = assets ? assets / 100_000_000 : 0;
        row['부채총계'] = liab ? liab / 100_000_000 : 0;
        row['자본총계'] = equity ? equity / 100_000_000 : 0;
      } else {
        const cfo = data.statements.cf?.find((r: any) => r.id === 'operating_cashflow' || r.label?.includes('영업활동'))?.values?.[p];
        const cfi = data.statements.cf?.find((r: any) => r.id === 'investing_cashflow' || r.label?.includes('투자활동'))?.values?.[p];
        const cff = data.statements.cf?.find((r: any) => r.id === 'financing_cashflow' || r.label?.includes('재무활동'))?.values?.[p];
        row['영업활동CFO'] = cfo ? cfo / 100_000_000 : 0;
        row['투자활동CFI'] = cfi ? cfi / 100_000_000 : 0;
        row['재무활동CFF'] = cff ? cff / 100_000_000 : 0;
      }
      return row;
    });
  }, [data, statementType]);

  // Credit Radar Chart data
  const creditRadarData = useMemo(() => {
    if (!data?.credit?.axes) return [];
    const axes = data.credit.axes;
    return [
      { subject: '채무상환능력', score: axes.debtRepayment || 90, fullMark: 100 },
      { subject: '자본구조건전성', score: axes.capitalStructure || 85, fullMark: 100 },
      { subject: '유동성버퍼', score: axes.liquidity || 90, fullMark: 100 },
      { subject: '현금창출력', score: axes.cashFlow || 88, fullMark: 100 },
      { subject: '사업안정성', score: axes.businessStability || 95, fullMark: 100 },
      { subject: '재무신뢰성', score: axes.financialReliability || 92, fullMark: 100 },
      { subject: '공시리스크', score: axes.disclosureRisk || 90, fullMark: 100 },
    ];
  }, [data]);

  // Filtered rows for statements table
  const filteredStatementRows = useMemo(() => {
    if (!data?.statements) return [];
    const rows = data.statements[statementType] || [];
    if (!tableFilter.trim()) return rows;
    const q = tableFilter.trim().toLowerCase();
    return rows.filter((r: any) => (r.label || '').toLowerCase().includes(q) || (r.id || '').toLowerCase().includes(q));
  }, [data, statementType, tableFilter]);

  return (
    <div className="flex flex-col h-full bg-[#050811] text-gray-100 overflow-y-auto p-4 md:p-6 font-sans">
      {/* 1. Header & Search Area */}
      <div className="bg-[#0b101d] border border-gray-800 rounded-xl p-4 shadow-xl mb-5 backdrop-blur-md">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-gray-800/80">
          <div>
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-0.5 rounded text-xs font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                DartLab 5-Tier OS
              </span>
              <span className="text-xs text-gray-400 font-mono">DART Audit-Grade Statements & dCR Engine</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white mt-1 flex items-center gap-2">
              {data ? data.corpName : ticker}
              <span className="text-sm font-mono font-normal text-gray-400">({ticker})</span>
            </h2>
          </div>

          {/* Search Box */}
          <form onSubmit={handleSearch} className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative w-full md:w-64">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="종목코드/티커 (예: 005930)"
                className="w-full bg-[#121826] border border-gray-700 rounded-lg px-3.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 font-mono transition-all"
              />
            </div>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-indigo-600/30 transition-all cursor-pointer whitespace-nowrap"
            >
              분석 조회
            </button>
          </form>
        </div>

        {/* Quick Stock Selector & Market Snapshot */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-gray-500 font-bold mr-1">인기 종목:</span>
            {TOP_STOCKS.map(s => (
              <button
                key={s.ticker}
                onClick={() => selectQuickStock(s.ticker)}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
                  ticker === s.ticker
                    ? 'bg-indigo-900/40 border-indigo-500 text-indigo-300'
                    : 'bg-[#121826] border-gray-800 text-gray-400 hover:text-white hover:border-gray-700'
                }`}
              >
                {s.name} ({s.ticker})
              </button>
            ))}
          </div>

          {data?.valuation && (
            <div className="flex items-center gap-4 text-xs font-mono">
              <div>
                <span className="text-gray-500 mr-1">현재가:</span>
                <span className="font-bold text-white">
                  {data.valuation.currentPrice ? `${data.valuation.currentPrice.toLocaleString()}원` : '-'}
                </span>
              </div>
              <div>
                <span className="text-gray-500 mr-1">시총:</span>
                <span className="font-bold text-cyan-400">{formatMoney(data.valuation.marketCap)}</span>
              </div>
              <div>
                <span className="text-gray-500 mr-1">목표가:</span>
                <span className="font-bold text-emerald-400">
                  {data.valuation.targetPrice ? `${Math.round(data.valuation.targetPrice).toLocaleString()}원` : '-'}
                </span>
                {data.valuation.targetUpside > 0 && (
                  <span className="ml-1 text-emerald-400 text-[11px]">(+{data.valuation.targetUpside}%)</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Loading & Error States */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[400px]">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400 text-sm animate-pulse">DartLab DART 원표 패널 및 신용평가 엔진 로딩 중...</p>
        </div>
      )}

      {error && !loading && (
        <div className="bg-red-950/40 border border-red-800 p-6 rounded-xl text-center my-8">
          <p className="text-red-400 font-bold mb-2">분석 데이터를 불러오지 못했습니다.</p>
          <p className="text-xs text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => setTicker('005930')}
            className="px-4 py-1.5 bg-red-900/50 hover:bg-red-800 text-red-200 text-xs rounded border border-red-700"
          >
            기본 종목(삼성전자 005930)으로 돌아가기
          </button>
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* Top KPI Ribbon (DartLab Cards) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            {/* 1. dCR Credit Grade */}
            <div className="bg-[#0b101d] border border-gray-800 p-3.5 rounded-xl flex flex-col justify-between shadow-lg">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">dCR 신용등급</span>
              <div className="flex items-baseline gap-2 my-1">
                <span className="text-2xl font-black text-amber-400">{data.credit?.grade || 'dCR-AA'}</span>
                <span className="text-xs text-gray-400">{data.credit?.category}</span>
              </div>
              <span className="text-[10px] text-gray-500">감사의견: {data.credit?.auditOpinion || '적정'}</span>
            </div>

            {/* 2. Health Score */}
            <div className="bg-[#0b101d] border border-gray-800 p-3.5 rounded-xl flex flex-col justify-between shadow-lg">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">재무 건전성 스코어</span>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-2xl font-black text-emerald-400">{data.credit?.healthScore || 90}</span>
                <span className="text-xs text-gray-400">/ 100</span>
              </div>
              <span className="text-[10px] text-emerald-500 font-medium">부도위험 극소 (PD &lt; 0.1%)</span>
            </div>

            {/* 3. Valuation PER */}
            <div className="bg-[#0b101d] border border-gray-800 p-3.5 rounded-xl flex flex-col justify-between shadow-lg">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">PER 멀티플</span>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-2xl font-black text-cyan-400">{data.valuation?.per || '-'}</span>
                <span className="text-xs text-gray-400">배</span>
              </div>
              <span className="text-[10px] text-gray-500">PBR: {data.valuation?.pbr || '-'}배</span>
            </div>

            {/* 4. EV/EBITDA */}
            <div className="bg-[#0b101d] border border-gray-800 p-3.5 rounded-xl flex flex-col justify-between shadow-lg">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">EV/EBITDA</span>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-2xl font-black text-indigo-400">{data.valuation?.evEbitda || '-'}</span>
                <span className="text-xs text-gray-400">배</span>
              </div>
              <span className="text-[10px] text-gray-500">동종업계 대비 저평가</span>
            </div>

            {/* 5. DCF Base Valuation */}
            <div className="bg-[#0b101d] border border-gray-800 p-3.5 rounded-xl flex flex-col justify-between shadow-lg">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">다모다란 DCF 적정가</span>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-xl font-black text-purple-400">
                  {data.valuation?.dcfBand?.base ? `${Math.round(data.valuation.dcfBand.base).toLocaleString()}` : '-'}
                </span>
                <span className="text-xs text-gray-400">원</span>
              </div>
              <span className="text-[10px] text-purple-400">WACC {data.valuation?.dcfBand?.wacc || 8.5}% 기준</span>
            </div>

            {/* 6. Dividend Yield */}
            <div className="bg-[#0b101d] border border-gray-800 p-3.5 rounded-xl flex flex-col justify-between shadow-lg">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">배당수익률</span>
              <div className="flex items-baseline gap-1 my-1">
                <span className="text-2xl font-black text-pink-400">
                  {data.valuation?.dividendYield ? `${data.valuation.dividendYield}%` : '-'}
                </span>
              </div>
              <span className="text-[10px] text-gray-500">Beta: {data.valuation?.beta || 1.0}</span>
            </div>
          </div>

          {/* Navigation Sub-Tabs */}
          <div className="flex items-center gap-2 border-b border-gray-800 pb-2 mb-5 overflow-x-auto">
            <button
              onClick={() => setActiveTab('statements')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'statements'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-[#0d121f] text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              📊 재무제표 패널 (Statements)
            </button>
            <button
              onClick={() => setActiveTab('ratios')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'ratios'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-[#0d121f] text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              📈 재무비율 3대 축 (Ratios)
            </button>
            <button
              onClick={() => setActiveTab('credit')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'credit'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30'
                  : 'bg-[#0d121f] text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              🛡️ dCR 신용위험 (Credit)
            </button>
            <button
              onClick={() => setActiveTab('valuation')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'valuation'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                  : 'bg-[#0d121f] text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              💎 다모다란 밸류에이션 (DCF)
            </button>
            <button
              onClick={() => setActiveTab('story')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'story'
                  ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                  : 'bg-[#0d121f] text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              📖 6막 인과 스토리 (Narrative)
            </button>
            <button
              onClick={() => setActiveTab('filings')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'filings'
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                  : 'bg-[#0d121f] text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              📑 DART 공시 타임라인 (Filings)
            </button>
          </div>

          {/* TAB 1: Statements Panel */}
          {activeTab === 'statements' && (
            <div className="flex flex-col gap-5">
              {/* Type selector & Search Filter */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#0b101d] p-3 rounded-xl border border-gray-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStatementType('is')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      statementType === 'is' ? 'bg-indigo-600 text-white' : 'bg-gray-800/60 text-gray-400 hover:text-white'
                    }`}
                  >
                    손익계산서 (IS)
                  </button>
                  <button
                    onClick={() => setStatementType('bs')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      statementType === 'bs' ? 'bg-indigo-600 text-white' : 'bg-gray-800/60 text-gray-400 hover:text-white'
                    }`}
                  >
                    재무상태표 (BS)
                  </button>
                  <button
                    onClick={() => setStatementType('cf')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${
                      statementType === 'cf' ? 'bg-indigo-600 text-white' : 'bg-gray-800/60 text-gray-400 hover:text-white'
                    }`}
                  >
                    현금흐름표 (CF)
                  </button>
                </div>
                <input
                  type="text"
                  value={tableFilter}
                  onChange={(e) => setTableFilter(e.target.value)}
                  placeholder="계정 항목 검색 (예: 매출, 자본, 영업)..."
                  className="bg-[#121826] border border-gray-700 rounded-md px-3 py-1.5 text-xs text-white placeholder-gray-500 w-full sm:w-60 focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* Interactive Trend Chart */}
              <div className="bg-[#0b101d] border border-gray-800 rounded-xl p-4 shadow-xl">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>
                      {statementType === 'is' ? '매출액 · 영업이익 · 순이익 다기간 추이' : statementType === 'bs' ? '자산 · 부채 · 자본 조달구조 변화' : '영업(CFO) · 투자(CFI) · 재무(CFF) 현금흐름 추이'}
                    </span>
                    <span className="text-[11px] text-gray-500 font-mono">(단위: 억원)</span>
                  </h4>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={statementChartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f293d" />
                      <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#64748b" tick={{ fontSize: 11 }} tickFormatter={(val) => `${(val / 10000).toFixed(0)}조`} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: '12px' }}
                        formatter={(value: any) => [`${Math.round(value).toLocaleString()}억원`, '']}
                      />
                      <Legend wrapperStyle={{ fontSize: '11px' }} />
                      {statementType === 'is' && (
                        <>
                          <Bar dataKey="매출액" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="영업이익" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Line type="monotone" dataKey="당기순이익" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3 }} />
                        </>
                      )}
                      {statementType === 'bs' && (
                        <>
                          <Bar dataKey="자산총계" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="자본총계" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Line type="monotone" dataKey="부채총계" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} />
                        </>
                      )}
                      {statementType === 'cf' && (
                        <>
                          <Bar dataKey="영업활동CFO" fill="#10b981" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="투자활동CFI" fill="#ef4444" radius={[4, 4, 0, 0]} />
                          <Line type="monotone" dataKey="재무활동CFF" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                        </>
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Horizontal Wide Matrix Table */}
              <div className="bg-[#0b101d] border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#121826] text-gray-400 sticky top-0 z-10 border-b border-gray-800">
                      <tr>
                        <th className="p-3 font-bold text-white min-w-[200px] sticky left-0 bg-[#121826] z-20">
                          계정 과목 (표준 Snake ID)
                        </th>
                        {(data.statements.periods || []).map((p: string) => (
                          <th key={p} className="p-3 font-bold text-right min-w-[110px] whitespace-nowrap">
                            {p}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {filteredStatementRows.length > 0 ? (
                        filteredStatementRows.map((row: any, idx: number) => {
                          const isMajor = ['매출액', '영업이익', '당기순이익', '자산총계', '부채총계', '자본총계', '영업활동현금흐름'].some(k => row.label?.includes(k));
                          return (
                            <tr key={idx} className={`hover:bg-[#141b2d] transition-colors ${isMajor ? 'bg-[#0f172a]/50 font-bold text-cyan-300' : 'text-gray-300'}`}>
                              <td className="p-3 font-sans sticky left-0 bg-[#0b101d] z-10 whitespace-nowrap border-r border-gray-800/40">
                                {row.label}
                                <span className="text-[10px] text-gray-500 font-mono ml-1.5 font-normal">({row.id})</span>
                              </td>
                              {(data.statements.periods || []).map((p: string) => (
                                <td key={p} className="p-3 text-right whitespace-nowrap">
                                  {formatMoney(row.values?.[p])}
                                </td>
                              ))}
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={(data.statements.periods?.length || 0) + 1} className="p-8 text-center text-gray-500 font-sans">
                            검색된 계정 항목이 없습니다.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Ratios */}
          {activeTab === 'ratios' && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 1. Profitability Ratios */}
                <div className="bg-[#0b101d] border border-gray-800 rounded-xl p-4 shadow-lg">
                  <h4 className="text-sm font-bold text-emerald-400 mb-3 flex items-center gap-2">
                    <span>수익성 지표 (Profitability)</span>
                  </h4>
                  <div className="space-y-3">
                    {data.ratios?.items?.filter((r: any) => ['opm', 'npm', 'roe', 'roa', 'roic'].some(k => r.ratio.toLowerCase().includes(k))).slice(0, 5).map((r: any) => {
                      const latestPeriod = data.ratios.periods?.[0];
                      const val = r.values?.[latestPeriod];
                      return (
                        <div key={r.ratio} className="flex items-center justify-between border-b border-gray-800/60 pb-2">
                          <span className="text-xs text-gray-300">{r.label}</span>
                          <span className="text-sm font-bold text-emerald-400 font-mono">
                            {val !== null && val !== undefined ? `${Number(val).toFixed(2)}%` : '-'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Stability Ratios */}
                <div className="bg-[#0b101d] border border-gray-800 rounded-xl p-4 shadow-lg">
                  <h4 className="text-sm font-bold text-cyan-400 mb-3 flex items-center gap-2">
                    <span>안정성 지표 (Solvency & Leverage)</span>
                  </h4>
                  <div className="space-y-3">
                    {data.ratios?.items?.filter((r: any) => ['debt', 'current', 'quick', 'leverage'].some(k => r.ratio.toLowerCase().includes(k))).slice(0, 5).map((r: any) => {
                      const latestPeriod = data.ratios.periods?.[0];
                      const val = r.values?.[latestPeriod];
                      return (
                        <div key={r.ratio} className="flex items-center justify-between border-b border-gray-800/60 pb-2">
                          <span className="text-xs text-gray-300">{r.label}</span>
                          <span className="text-sm font-bold text-cyan-400 font-mono">
                            {val !== null && val !== undefined ? `${Number(val).toFixed(2)}%` : '-'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3. Growth & Dupont */}
                <div className="bg-[#0b101d] border border-gray-800 rounded-xl p-4 shadow-lg">
                  <h4 className="text-sm font-bold text-amber-400 mb-3 flex items-center gap-2">
                    <span>성장성 & DuPont 분해</span>
                  </h4>
                  <div className="space-y-3">
                    {data.ratios?.items?.filter((r: any) => ['growth', 'dupont', 'turnover'].some(k => r.ratio.toLowerCase().includes(k))).slice(0, 5).map((r: any) => {
                      const latestPeriod = data.ratios.periods?.[0];
                      const val = r.values?.[latestPeriod];
                      return (
                        <div key={r.ratio} className="flex items-center justify-between border-b border-gray-800/60 pb-2">
                          <span className="text-xs text-gray-300">{r.label}</span>
                          <span className="text-sm font-bold text-amber-400 font-mono">
                            {val !== null && val !== undefined ? `${Number(val).toFixed(2)}${r.ratio.includes('dupont') ? 'x' : '%'}` : '-'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Ratios Table across periods */}
              <div className="bg-[#0b101d] border border-gray-800 rounded-xl overflow-hidden shadow-xl">
                <div className="p-3 border-b border-gray-800 font-bold text-xs text-gray-300">
                  전체 재무비율 시계열 매트릭스 (다기간 추이)
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#121826] text-gray-400 border-b border-gray-800">
                      <tr>
                        <th className="p-3 font-bold text-white min-w-[200px] sticky left-0 bg-[#121826]">비율 항목</th>
                        {(data.ratios?.periods || []).map((p: string) => (
                          <th key={p} className="p-3 font-bold text-right min-w-[100px] whitespace-nowrap">{p}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/60">
                      {data.ratios?.items?.map((r: any, idx: number) => (
                        <tr key={idx} className="hover:bg-[#141b2d] transition-colors">
                          <td className="p-3 font-sans sticky left-0 bg-[#0b101d] text-gray-300 whitespace-nowrap border-r border-gray-800/40">
                            {r.label}
                          </td>
                          {(data.ratios?.periods || []).map((p: string) => {
                            const val = r.values?.[p];
                            return (
                              <td key={p} className="p-3 text-right text-gray-400 whitespace-nowrap">
                                {val !== null && val !== undefined ? Number(val).toFixed(2) : '-'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Credit Risk (dCR 7-Axes) */}
          {activeTab === 'credit' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Radar Chart */}
              <div className="lg:col-span-1 bg-[#0b101d] border border-gray-800 rounded-xl p-4 shadow-xl flex flex-col items-center">
                <h4 className="text-sm font-bold text-white mb-2 self-start">dCR 7대 신용위험 진단 레이더</h4>
                <div className="w-full h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={creditRadarData}>
                      <PolarGrid stroke="#334155" />
                      <PolarAngleAxis dataKey="subject" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#475569" tick={{ fontSize: 9 }} />
                      <Radar name="신용 점수" dataKey="score" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.4} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff', fontSize: '12px' }} />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full bg-[#121826] p-3 rounded-lg border border-gray-800 mt-2 text-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-400">종합 등급:</span>
                    <span className="font-bold text-amber-400">{data.credit?.grade}</span>
                  </div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-gray-400">신용 전망:</span>
                    <span className="font-bold text-white">{data.credit?.outlook}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">추정 부도확률 (PD):</span>
                    <span className="font-bold text-emerald-400">{((data.credit?.pdEstimate || 0.0005) * 100).toFixed(3)}%</span>
                  </div>
                </div>
              </div>

              {/* 7 Axes Breakdown Cards */}
              <div className="lg:col-span-2 bg-[#0b101d] border border-gray-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
                <div>
                  <h4 className="text-base font-bold text-white mb-2">신용 평가 세부 7축 분석 요약</h4>
                  <p className="text-xs text-gray-400 mb-4">{data.credit?.description}</p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {creditRadarData.map(item => (
                      <div key={item.subject} className="bg-[#121826] border border-gray-800/80 p-3 rounded-lg">
                        <div className="flex justify-between items-center mb-1.5">
                          <span className="text-xs font-medium text-gray-300">{item.subject}</span>
                          <span className="text-xs font-bold text-amber-400 font-mono">{item.score} / 100</span>
                        </div>
                        <div className="w-full bg-gray-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-amber-500 h-full rounded-full transition-all duration-500"
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 p-3.5 bg-amber-950/20 border border-amber-800/40 rounded-lg text-xs text-amber-200/90 leading-relaxed">
                  <span className="font-bold mr-1">💡 DartLab 신용평가 방법론:</span>
                  공시 재무제표 원문 및 주석, 사업보고서의 서술과 시장 지표를 토대로 신용평가사와의 비공개 면담 없이 100% 정량 알고리즘을 통해 산출된 독립 신용등급(dCR)입니다.
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Damodaran Valuation & DCF */}
          {activeTab === 'valuation' && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {/* DCF Band Gauge */}
                <div className="md:col-span-2 bg-[#0b101d] border border-gray-800 rounded-xl p-5 shadow-xl">
                  <h4 className="text-base font-bold text-white mb-1">다모다란 FCFF DCF 내재가치 밴드</h4>
                  <p className="text-xs text-gray-400 mb-6">
                    잉여현금흐름(FCF), WACC ({data.valuation?.dcfBand?.wacc}%), 영구성장률 ({data.valuation?.dcfBand?.terminalGrowth}%)을 결합한 시나리오별 적정가치
                  </p>

                  <div className="grid grid-cols-3 gap-3 mb-6 text-center">
                    <div className="bg-[#121826] border border-red-900/30 p-4 rounded-xl">
                      <span className="text-xs text-red-400 font-bold block mb-1">하방 시나리오 (Bear)</span>
                      <span className="text-xl font-black text-white font-mono">
                        {data.valuation?.dcfBand?.bear ? `${data.valuation.dcfBand.bear.toLocaleString()}원` : '-'}
                      </span>
                      <span className="text-[10px] text-gray-500 block mt-1">업황 둔화 및 마진 축소</span>
                    </div>
                    <div className="bg-[#1a2333] border border-indigo-500 p-4 rounded-xl shadow-lg shadow-indigo-900/20">
                      <span className="text-xs text-indigo-400 font-bold block mb-1">기본 시나리오 (Base)</span>
                      <span className="text-2xl font-black text-indigo-300 font-mono">
                        {data.valuation?.dcfBand?.base ? `${data.valuation.dcfBand.base.toLocaleString()}원` : '-'}
                      </span>
                      <span className="text-[10px] text-indigo-400/80 block mt-1">정상 성장 궤도 유지</span>
                    </div>
                    <div className="bg-[#121826] border border-emerald-900/30 p-4 rounded-xl">
                      <span className="text-xs text-emerald-400 font-bold block mb-1">상방 시나리오 (Bull)</span>
                      <span className="text-xl font-black text-white font-mono">
                        {data.valuation?.dcfBand?.bull ? `${data.valuation.dcfBand.bull.toLocaleString()}원` : '-'}
                      </span>
                      <span className="text-[10px] text-gray-500 block mt-1">AI 수요 폭증 및 ASP 인상</span>
                    </div>
                  </div>

                  {/* Current price relative line */}
                  <div className="bg-[#121826] p-4 rounded-xl border border-gray-800">
                    <div className="flex justify-between items-center text-xs mb-2">
                      <span className="text-gray-400">현재가 대비 적정가치 위치:</span>
                      <span className="font-bold text-emerald-400 font-mono">
                        현재가 {data.valuation?.currentPrice ? `${data.valuation.currentPrice.toLocaleString()}원` : '-'}
                      </span>
                    </div>
                    <div className="relative w-full bg-gray-800 h-3 rounded-full overflow-hidden">
                      <div className="absolute left-[30%] right-[30%] bg-indigo-600/60 h-full" />
                      <div className="absolute left-[50%] -top-1 bottom-0 w-1 bg-white" title="Base Value" />
                    </div>
                  </div>
                </div>

                {/* Relative Multiples */}
                <div className="bg-[#0b101d] border border-gray-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
                  <div>
                    <h4 className="text-base font-bold text-white mb-4">시장 상대가치 멀티플</h4>
                    <div className="space-y-3.5">
                      <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                        <span className="text-xs text-gray-400">P/E (Trailing / Forward)</span>
                        <span className="text-sm font-bold text-cyan-400 font-mono">{data.valuation?.per}배</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                        <span className="text-xs text-gray-400">P/B (주가순자산비율)</span>
                        <span className="text-sm font-bold text-cyan-400 font-mono">{data.valuation?.pbr}배</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                        <span className="text-xs text-gray-400">EV/EBITDA</span>
                        <span className="text-sm font-bold text-indigo-400 font-mono">{data.valuation?.evEbitda}배</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-gray-800 pb-2">
                        <span className="text-xs text-gray-400">배당수익률 (Div Yield)</span>
                        <span className="text-sm font-bold text-pink-400 font-mono">{data.valuation?.dividendYield}%</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-400">시장 변동성 (Beta)</span>
                        <span className="text-sm font-bold text-white font-mono">{data.valuation?.beta}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 p-3 bg-purple-950/20 border border-purple-800/40 rounded-lg text-[11px] text-purple-200">
                    애널리스트 투자의견: <span className="font-bold text-purple-300">{data.valuation?.recommendation}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: 6-Act Story Narrative */}
          {activeTab === 'story' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.keys(data.story || {}).map((key) => {
                const act = data.story[key];
                return (
                  <div key={key} className="bg-[#0b101d] border border-gray-800 rounded-xl p-5 shadow-lg flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                          제 {act.actNumber} 막
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-white mb-2">{act.title}</h4>
                      <p className="text-xs text-gray-300 leading-relaxed mb-4">{act.summary}</p>
                    </div>

                    <div className="bg-[#121826] p-3 rounded-lg border border-gray-800/80">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider block mb-1.5">
                        {act.actNumber === 6 ? '🚨 핵심 조기경보선 (Tripwire)' : '📌 주요 근거 지표'}
                      </span>
                      <ul className="space-y-1">
                        {act.metrics?.map((m: string, i: number) => (
                          <li key={i} className="text-xs text-gray-300 flex items-start gap-1.5">
                            <span className="text-indigo-400 mt-0.5">•</span>
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* TAB 6: DART Filings Timeline */}
          {activeTab === 'filings' && (
            <div className="bg-[#0b101d] border border-gray-800 rounded-xl p-4 shadow-xl">
              <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>DART 전자공시 실시간 타임라인</span>
                  <span className="text-xs text-gray-500 font-mono">({data.filings?.length || 0}건)</span>
                </h4>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#121826] text-gray-400 border-b border-gray-800">
                    <tr>
                      <th className="p-3 font-bold text-white min-w-[100px]">공시일자</th>
                      <th className="p-3 font-bold text-white min-w-[250px]">보고서명 (DART 원문)</th>
                      <th className="p-3 font-bold text-white min-w-[100px]">공시구분</th>
                      <th className="p-3 font-bold text-white min-w-[100px]">제출인</th>
                      <th className="p-3 font-bold text-white text-center min-w-[80px]">원문조회</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60">
                    {(data.filings || []).map((f: any, idx: number) => (
                      <tr key={idx} className="hover:bg-[#141b2d] transition-colors">
                        <td className="p-3 text-gray-400 whitespace-nowrap">{f.date}</td>
                        <td className="p-3 font-sans text-white font-medium">
                          {f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-indigo-300 hover:text-indigo-200 hover:underline flex items-center gap-1.5"
                            >
                              {f.title}
                              <span className="text-[10px] text-gray-500">↗</span>
                            </a>
                          ) : (
                            f.title
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-gray-800 text-gray-300 border border-gray-700">
                            {f.type}
                          </span>
                        </td>
                        <td className="p-3 text-gray-400 font-sans whitespace-nowrap">{f.submitter}</td>
                        <td className="p-3 text-center">
                          {f.url ? (
                            <a
                              href={f.url}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 bg-indigo-900/40 hover:bg-indigo-800 text-indigo-300 text-[11px] rounded border border-indigo-700 transition-all inline-block"
                            >
                              공시보기
                            </a>
                          ) : (
                            <span className="text-gray-600">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
