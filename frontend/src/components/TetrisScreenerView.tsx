'use client';
import React, { useState } from 'react';

export default function TetrisScreenerView({ setGlobalSearchTicker, globalStocks, stocks }: any) {
  // 필터 조건 활성화 (중복 선택 가능)
  const [useRoe, setUseRoe] = useState<boolean>(true);
  const [minRoe, setMinRoe] = useState<number>(10);
  const [maxRoe, setMaxRoe] = useState<number>(100);

  const [useOpMargin, setUseOpMargin] = useState<boolean>(false);
  const [minOpMargin, setMinOpMargin] = useState<number>(5);

  const [useRevenue, setUseRevenue] = useState<boolean>(false);
  const [minRevenue, setMinRevenue] = useState<number>(500); // 500억 원 이상

  const [useOp, setUseOp] = useState<boolean>(false);
  const [minOp, setMinOp] = useState<number>(50); // 50억 원 이상

  const [useNetProfit, setUseNetProfit] = useState<boolean>(false);
  const [minNetProfit, setMinNetProfit] = useState<number>(30); // 30억 원 이상

  // YoY (전년대비) 개선 조건 필터
  const [useYoyRoeUp, setUseYoyRoeUp] = useState<boolean>(false);
  const [minYoyRoeDiff, setMinYoyRoeDiff] = useState<number>(1.0); // +1.0%p 이상

  const [useYoyRevUp, setUseYoyRevUp] = useState<boolean>(false);
  const [minYoyRevGrowth, setMinYoyRevGrowth] = useState<number>(5.0); // +5.0% 이상

  const [useYoyOpUp, setUseYoyOpUp] = useState<boolean>(false);
  const [minYoyOpGrowth, setMinYoyOpGrowth] = useState<number>(10.0); // +10.0% 이상

  const [useYoyNpUp, setUseYoyNpUp] = useState<boolean>(false);
  const [minYoyNpGrowth, setMinYoyNpGrowth] = useState<number>(10.0); // +10.0% 이상

  const [useYoyPriceUp, setUseYoyPriceUp] = useState<boolean>(false);
  const [minYoyPriceGrowth, setMinYoyPriceGrowth] = useState<number>(0.0); // +0% 이상 (상승)

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const payload: any = {};

      if (useRoe) {
        payload.use_roe = true;
        payload.min_roe = minRoe;
        payload.max_roe = maxRoe;
      }
      if (useOpMargin) {
        payload.use_op_margin = true;
        payload.min_op_margin = minOpMargin;
      }
      if (useRevenue) {
        payload.use_revenue = true;
        payload.min_revenue = minRevenue;
      }
      if (useOp) {
        payload.use_op = true;
        payload.min_op = minOp;
      }
      if (useNetProfit) {
        payload.use_net_profit = true;
        payload.min_net_profit = minNetProfit;
      }

      // YoY 필터 추가
      if (useYoyRoeUp) {
        payload.use_yoy_roe_up = true;
        payload.min_yoy_roe_diff = minYoyRoeDiff;
      }
      if (useYoyRevUp) {
        payload.use_yoy_rev_up = true;
        payload.min_yoy_rev_growth = minYoyRevGrowth;
      }
      if (useYoyOpUp) {
        payload.use_yoy_op_up = true;
        payload.min_yoy_op_growth = minYoyOpGrowth;
      }
      if (useYoyNpUp) {
        payload.use_yoy_np_up = true;
        payload.min_yoy_np_growth = minYoyNpGrowth;
      }
      if (useYoyPriceUp) {
        payload.use_yoy_price_up = true;
        payload.min_yoy_price_growth = minYoyPriceGrowth;
      }

      const res = await fetch('/api/dart/screener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('서버 응답 오류');
      const data = await res.json();
      if (data.success) {
        setResults(data.results || []);
      } else {
        throw new Error(data.error || '필터링 실패');
      }
    } catch (err: any) {
      setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const getStockName = (ticker: string) => {
    const combined = [...(globalStocks || []), ...(stocks || [])];
    const s = combined.find((x: any) => x.ticker === ticker || x.ticker.includes(ticker));
    return s ? s.name : ticker;
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-200 p-4 sm:p-6 overflow-y-auto space-y-6">
      
      {/* Header */}
      <div className="border-b border-gray-800 pb-3 flex justify-between items-center flex-wrap gap-2">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <span>🧩 종목 필터링 (Tetris Screener)</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            DART 재무제표 12분기 TTM 연간 실적 DB 기반 다중 중복 조건 & YoY(전년대비) 성장성 필터링
          </p>
        </div>
        <button
          onClick={handleSearch}
          disabled={loading}
          className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-extrabold py-2.5 px-6 rounded-xl transition-all shadow-lg border border-indigo-400/40 active:scale-95 flex items-center gap-2 cursor-pointer"
        >
          <span>🔍</span>
          <span>{loading ? '필터링 검색 중...' : '조건 중복 검색 실행'}</span>
        </button>
      </div>

      {/* 1. Multi-Filter Condition Control Grid */}
      <div className="bg-[#111] border border-gray-800 p-5 rounded-xl shadow-xl space-y-4">
        <div className="text-sm font-bold text-indigo-300 flex items-center justify-between border-b border-gray-800 pb-2">
          <span>🎯 기본 절대 지표 필터링 (원하는 항목을 체크하여 중복 적용)</span>
          <span className="text-xs text-gray-400 font-normal">※ 12분기 TTM (최근 4분기 누적) 실적 기준 비교</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          
          {/* (1) ROE Filter */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useRoe ? 'bg-indigo-950/40 border-indigo-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useRoe}
                  onChange={(e) => setUseRoe(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span>📈 ROE (%) 범위</span>
              </label>
              <span className="font-mono text-indigo-300 font-bold">{minRoe}% ~ {maxRoe}%</span>
            </div>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-gray-400">최소:</span>
                <input
                  type="range"
                  min="-20" max="50" step="1"
                  value={minRoe}
                  disabled={!useRoe}
                  onChange={(e) => setMinRoe(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <input
                  type="number"
                  value={minRoe}
                  disabled={!useRoe}
                  onChange={(e) => setMinRoe(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 text-xs text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-gray-400">최대:</span>
                <input
                  type="range"
                  min="0" max="200" step="5"
                  value={maxRoe}
                  disabled={!useRoe}
                  onChange={(e) => setMaxRoe(Number(e.target.value))}
                  className="w-full accent-indigo-500"
                />
                <input
                  type="number"
                  value={maxRoe}
                  disabled={!useRoe}
                  onChange={(e) => setMaxRoe(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 text-xs text-white"
                />
              </div>
            </div>
          </div>

          {/* (2) Operating Margin Filter */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useOpMargin ? 'bg-indigo-950/40 border-indigo-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useOpMargin}
                  onChange={(e) => setUseOpMargin(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span>📊 최소 영업이익률 (%)</span>
              </label>
              <span className="font-mono text-purple-300 font-bold">{minOpMargin}% 이상</span>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input
                type="range"
                min="-10" max="40" step="1"
                value={minOpMargin}
                disabled={!useOpMargin}
                onChange={(e) => setMinOpMargin(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <input
                type="number"
                value={minOpMargin}
                disabled={!useOpMargin}
                onChange={(e) => setMinOpMargin(Number(e.target.value))}
                className="w-16 bg-gray-800 border border-gray-700 text-center rounded px-1 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* (3) Annualized Revenue Filter (TTM) */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useRevenue ? 'bg-indigo-950/40 border-indigo-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useRevenue}
                  onChange={(e) => setUseRevenue(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span>💰 TTM 연간 매출액 (억 원)</span>
              </label>
              <span className="font-mono text-blue-300 font-bold">{minRevenue}억 이상</span>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input
                type="range"
                min="0" max="10000" step="100"
                value={minRevenue}
                disabled={!useRevenue}
                onChange={(e) => setMinRevenue(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <input
                type="number"
                value={minRevenue}
                disabled={!useRevenue}
                onChange={(e) => setMinRevenue(Number(e.target.value))}
                className="w-20 bg-gray-800 border border-gray-700 text-center rounded px-1 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* (4) Annualized Operating Profit Filter (TTM) */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useOp ? 'bg-indigo-950/40 border-indigo-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useOp}
                  onChange={(e) => setUseOp(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span>🏢 TTM 연간 영업이익 (억 원)</span>
              </label>
              <span className="font-mono text-emerald-300 font-bold">{minOp}억 이상</span>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input
                type="range"
                min="-100" max="1000" step="10"
                value={minOp}
                disabled={!useOp}
                onChange={(e) => setMinOp(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <input
                type="number"
                value={minOp}
                disabled={!useOp}
                onChange={(e) => setMinOp(Number(e.target.value))}
                className="w-20 bg-gray-800 border border-gray-700 text-center rounded px-1 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* (5) Annualized Net Profit Filter (TTM) */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useNetProfit ? 'bg-indigo-950/40 border-indigo-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useNetProfit}
                  onChange={(e) => setUseNetProfit(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span>💎 TTM 연간 당기순이익 (억 원)</span>
              </label>
              <span className="font-mono text-amber-300 font-bold">{minNetProfit}억 이상</span>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input
                type="range"
                min="-100" max="1000" step="10"
                value={minNetProfit}
                disabled={!useNetProfit}
                onChange={(e) => setMinNetProfit(Number(e.target.value))}
                className="w-full accent-indigo-500"
              />
              <input
                type="number"
                value={minNetProfit}
                disabled={!useNetProfit}
                onChange={(e) => setMinNetProfit(Number(e.target.value))}
                className="w-20 bg-gray-800 border border-gray-700 text-center rounded px-1 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

        </div>

        {/* 2. YoY (전년대비) 성장 지표 필터링 */}
        <div className="text-sm font-bold text-emerald-300 flex items-center justify-between border-b border-gray-800 pt-4 pb-2">
          <span>🚀 전년 동기 대비(YoY) 지표 개선/상승 조건</span>
          <span className="text-xs text-gray-400 font-normal">※ 1년 전 동일 분기 TTM 대비 상승폭 검증</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          
          {/* YoY ROE 상승 */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useYoyRoeUp ? 'bg-emerald-950/40 border-emerald-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useYoyRoeUp}
                  onChange={(e) => setUseYoyRoeUp(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>🔺 YoY ROE 상승폭 (%p)</span>
              </label>
              <span className="font-mono text-emerald-300 font-bold">+{minYoyRoeDiff}%p 이상</span>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input
                type="range"
                min="0" max="20" step="0.5"
                value={minYoyRoeDiff}
                disabled={!useYoyRoeUp}
                onChange={(e) => setMinYoyRoeDiff(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <input
                type="number"
                step="0.1"
                value={minYoyRoeDiff}
                disabled={!useYoyRoeUp}
                onChange={(e) => setMinYoyRoeDiff(Number(e.target.value))}
                className="w-16 bg-gray-800 border border-gray-700 text-center rounded px-1 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* YoY 매출 성장률 */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useYoyRevUp ? 'bg-emerald-950/40 border-emerald-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useYoyRevUp}
                  onChange={(e) => setUseYoyRevUp(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>📈 YoY 매출액 성장률 (%)</span>
              </label>
              <span className="font-mono text-blue-300 font-bold">+{minYoyRevGrowth}% 이상</span>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input
                type="range"
                min="0" max="100" step="5"
                value={minYoyRevGrowth}
                disabled={!useYoyRevUp}
                onChange={(e) => setMinYoyRevGrowth(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <input
                type="number"
                value={minYoyRevGrowth}
                disabled={!useYoyRevUp}
                onChange={(e) => setMinYoyRevGrowth(Number(e.target.value))}
                className="w-16 bg-gray-800 border border-gray-700 text-center rounded px-1 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* YoY 영업이익 성장률 */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useYoyOpUp ? 'bg-emerald-950/40 border-emerald-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useYoyOpUp}
                  onChange={(e) => setUseYoyOpUp(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>💥 YoY 영업이익 성장률 (%)</span>
              </label>
              <span className="font-mono text-emerald-300 font-bold">+{minYoyOpGrowth}% 이상</span>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input
                type="range"
                min="0" max="200" step="5"
                value={minYoyOpGrowth}
                disabled={!useYoyOpUp}
                onChange={(e) => setMinYoyOpGrowth(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <input
                type="number"
                value={minYoyOpGrowth}
                disabled={!useYoyOpUp}
                onChange={(e) => setMinYoyOpGrowth(Number(e.target.value))}
                className="w-16 bg-gray-800 border border-gray-700 text-center rounded px-1 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* YoY 순이익 성장률 */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useYoyNpUp ? 'bg-emerald-950/40 border-emerald-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useYoyNpUp}
                  onChange={(e) => setUseYoyNpUp(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>💎 YoY 당기순이익 성장률 (%)</span>
              </label>
              <span className="font-mono text-amber-300 font-bold">+{minYoyNpGrowth}% 이상</span>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input
                type="range"
                min="0" max="200" step="5"
                value={minYoyNpGrowth}
                disabled={!useYoyNpUp}
                onChange={(e) => setMinYoyNpGrowth(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <input
                type="number"
                value={minYoyNpGrowth}
                disabled={!useYoyNpUp}
                onChange={(e) => setMinYoyNpGrowth(Number(e.target.value))}
                className="w-16 bg-gray-800 border border-gray-700 text-center rounded px-1 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

          {/* YoY 분기말 주가 상승률 */}
          <div className={`p-3 rounded-lg border transition-all space-y-2 ${useYoyPriceUp ? 'bg-emerald-950/40 border-emerald-500/80 text-white' : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'}`}>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useYoyPriceUp}
                  onChange={(e) => setUseYoyPriceUp(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>📊 YoY 분기말 주가 상승률 (%)</span>
              </label>
              <span className="font-mono text-purple-300 font-bold">+{minYoyPriceGrowth}% 이상</span>
            </div>
            <div className="pt-2 flex items-center gap-2">
              <input
                type="range"
                min="-20" max="100" step="5"
                value={minYoyPriceGrowth}
                disabled={!useYoyPriceUp}
                onChange={(e) => setMinYoyPriceGrowth(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <input
                type="number"
                value={minYoyPriceGrowth}
                disabled={!useYoyPriceUp}
                onChange={(e) => setMinYoyPriceGrowth(Number(e.target.value))}
                className="w-16 bg-gray-800 border border-gray-700 text-center rounded px-1 py-1 text-xs text-white font-mono"
              />
            </div>
          </div>

        </div>
      </div>

      {/* 3. Screener Search Results Table */}
      <div className="bg-[#111] border border-gray-800 p-5 rounded-xl shadow-xl space-y-4 flex-1">
        <div className="flex justify-between items-center border-b border-gray-800 pb-3">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <span>📋 필터링 조건 검색 결과</span>
            <span className="text-xs bg-indigo-900/80 border border-indigo-500/40 text-indigo-200 px-2.5 py-0.5 rounded-full font-mono">
              총 {results.length}개 종목 조건 충족
            </span>
          </h3>
          <span className="text-xs text-gray-400">클릭 시 해당 종목 상세 분석 페이지로 이동합니다.</span>
        </div>

        {error && <div className="text-red-400 text-xs p-3 bg-red-950/40 border border-red-800 rounded">{error}</div>}

        {results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse whitespace-nowrap font-mono">
              <thead>
                <tr className="bg-gray-900/90 text-gray-400 border-b border-gray-800">
                  <th className="p-3 font-sans">종목명 (코드)</th>
                  <th className="p-3 text-right text-indigo-300">ROE / YoY</th>
                  <th className="p-3 text-right text-purple-300">영업이익률 (%)</th>
                  <th className="p-3 text-right text-blue-300">TTM 매출 / YoY</th>
                  <th className="p-3 text-right text-emerald-300">TTM 영업이익 / YoY</th>
                  <th className="p-3 text-right text-amber-300">TTM 순이익 / YoY</th>
                  <th className="p-3 text-center">적용 기준</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {results.map((item: any) => (
                  <tr
                    key={item.ticker}
                    onClick={() => {
                      if (setGlobalSearchTicker) setGlobalSearchTicker(item.ticker);
                    }}
                    className="hover:bg-indigo-950/30 transition-colors cursor-pointer group"
                  >
                    <td className="p-3 font-sans font-bold text-white group-hover:text-indigo-300">
                      {getStockName(item.ticker)} <span className="text-gray-500 font-mono text-[11px]">({item.ticker})</span>
                    </td>
                    <td className="p-3 text-right">
                      <div className="font-bold text-indigo-400">{item.roe}%</div>
                      {item.yoy_roe_diff !== undefined && (
                        <div className={`text-[10px] ${item.yoy_roe_diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {item.yoy_roe_diff >= 0 ? `+${item.yoy_roe_diff}%p ▲` : `${item.yoy_roe_diff}%p ▼`}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right text-purple-300 font-bold">
                      {item.operating_margin}%
                    </td>
                    <td className="p-3 text-right">
                      <div className="text-blue-300 font-bold">{item.revenue_eok.toLocaleString()} 억</div>
                      {item.yoy_rev_growth !== undefined && (
                        <div className={`text-[10px] ${item.yoy_rev_growth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {item.yoy_rev_growth >= 0 ? `+${item.yoy_rev_growth}% ▲` : `${item.yoy_rev_growth}% ▼`}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="text-emerald-400 font-bold">{item.op_profit_eok.toLocaleString()} 억</div>
                      {item.yoy_op_growth !== undefined && (
                        <div className={`text-[10px] ${item.yoy_op_growth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {item.yoy_op_growth >= 0 ? `+${item.yoy_op_growth}% ▲` : `${item.yoy_op_growth}% ▼`}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      <div className="text-amber-300 font-bold">{item.net_profit_eok.toLocaleString()} 억</div>
                      {item.yoy_np_growth !== undefined && (
                        <div className={`text-[10px] ${item.yoy_np_growth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {item.yoy_np_growth >= 0 ? `+${item.yoy_np_growth}% ▲` : `${item.yoy_np_growth}% ▼`}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className="px-2.5 py-0.5 text-[10px] rounded font-sans font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
                        TTM 4분기누적 ({item.year}-{item.quarter})
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-500 text-sm">
            {loading ? (
              <div className="animate-pulse space-y-2">
                <div>⏳ DART 12분기 TTM 재무제표 DB에서 조건 검색 중입니다...</div>
              </div>
            ) : (
              '조건 검색 실행 버튼을 누르거나, 필터링 수치를 변경해 보세요.'
            )}
          </div>
        )}
      </div>
    </div>
  );
}
