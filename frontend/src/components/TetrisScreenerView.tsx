'use client';
import React, { useEffect, useState } from 'react';

export default function TetrisScreenerView({ setGlobalSearchTicker, globalStocks, stocks }: any) {
  // 1. ROE 및 전분기 대비(QoQ) ROE 증가 결합 모드
  // HIGH_OR_UP: ROE가 높은 수준이거나(OR) 전분기 대비 ROE가 증가하는 종목
  // HIGH_AND_UP: ROE도 높고(AND) 전분기 대비 ROE도 증가하는 종목
  const [roeFilterMode, setRoeFilterMode] = useState<'HIGH_OR_UP' | 'HIGH_AND_UP'>('HIGH_OR_UP');

  // (1) 고ROE 수준 필터
  const [useRoe, setUseRoe] = useState<boolean>(true);
  const [minRoe, setMinRoe] = useState<number>(10);
  const [maxRoe, setMaxRoe] = useState<number>(80);

  // (2) 전분기 대비(QoQ) ROE 증가 필터
  const [useQoqRoe, setUseQoqRoe] = useState<boolean>(true);
  const [minQoqRoeDiff, setMinQoqRoeDiff] = useState<number>(1.0); // 전분기 대비 +1.0%p 이상 증가
  const [minRoeFloorForQoq, setMinRoeFloorForQoq] = useState<number>(4.0); // 최소 흑자 ROE 바닥(4% 이상)

  // (3) 저PBR 절대 수준 필터
  const [usePbr, setUsePbr] = useState<boolean>(true);
  const [minPbr, setMinPbr] = useState<number>(0.15);
  const [maxPbr, setMaxPbr] = useState<number>(1.2);

  // (4) 전분기 대비(QoQ) PBR 상승 억제 필터 ("PBR이 크게 늘어나지 않은 종목")
  const [useQoqPbrLimit, setUseQoqPbrLimit] = useState<boolean>(true);
  const [maxQoqPbrDiff, setMaxQoqPbrDiff] = useState<number>(0.15); // 전분기 대비 PBR 증가폭 +0.15배 이하
  const [maxQoqPbrGrowthPct, setMaxQoqPbrGrowthPct] = useState<number>(15); // 전분기 대비 PBR 상승률 +15% 이하

  // (5) PER 밸류에이션 필터
  const [usePer, setUsePer] = useState<boolean>(true);
  const [minPer, setMinPer] = useState<number>(1.0);
  const [maxPer, setMaxPer] = useState<number>(15.0);

  // (6) ROE / PBR 가성비 지수 (PBR 1배당 ROE %)
  const [useRoePbrRatio, setUseRoePbrRatio] = useState<boolean>(true);
  const [minRoePbrRatio, setMinRoePbrRatio] = useState<number>(10.0); // ROE/PBR >= 10 (예: ROE 10%, PBR 1.0배)

  // (7) 분기 주가 상승률 & 시장/정렬 옵션
  const [usePriceChange, setUsePriceChange] = useState<boolean>(false);
  const [minPriceChange, setMinPriceChange] = useState<number>(-20);
  const [maxPriceChange, setMaxPriceChange] = useState<number>(25);

  const [marketFilter, setMarketFilter] = useState<'ALL' | 'KOSPI' | 'KOSDAQ'>('ALL');
  const [sortBy, setSortBy] = useState<string>('ROE_PBR_RATIO');

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hoveredStock, setHoveredStock] = useState<any | null>(null);
  const [showQoqTrajectory, setShowQoqTrajectory] = useState<boolean>(true);
  const [showTopLabelsOnly, setShowTopLabelsOnly] = useState<boolean>(true);

  const executeScreener = async (overrideParams?: Record<string, any>) => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        roe_filter_mode: roeFilterMode,
        use_roe: useRoe,
        min_roe: minRoe,
        max_roe: maxRoe,
        use_qoq_roe: useQoqRoe,
        min_qoq_roe_diff: minQoqRoeDiff,
        min_roe_floor_for_qoq: minRoeFloorForQoq,
        use_pbr: usePbr,
        min_pbr: minPbr,
        max_pbr: maxPbr,
        use_qoq_pbr_limit: useQoqPbrLimit,
        max_qoq_pbr_diff: maxQoqPbrDiff,
        max_qoq_pbr_growth_pct: maxQoqPbrGrowthPct,
        use_per: usePer,
        min_per: minPer,
        max_per: maxPer,
        use_roe_pbr_ratio: useRoePbrRatio,
        min_roe_pbr_ratio: minRoePbrRatio,
        use_price_change: usePriceChange,
        min_price_change: minPriceChange,
        max_price_change: maxPriceChange,
        market_filter: marketFilter,
        sort_by: sortBy,
        ...(overrideParams || {}),
      };

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

  useEffect(() => {
    executeScreener();
  }, []);

  const applyPreset = (preset: 'CORE_ROE_PBR' | 'QOQ_TURNAROUND' | 'DEEP_VALUE' | 'STRICT_BOTH') => {
    if (preset === 'CORE_ROE_PBR') {
      // 핵심 기본: ROE 높거나(>=10%) 전분기 대비 증가(+1%p↑) & PBR 낮고(<=1.2배) 전분기 대비 PBR 미상승(<=+0.15배)
      setRoeFilterMode('HIGH_OR_UP');
      setUseRoe(true);
      setMinRoe(10);
      setMaxRoe(80);
      setUseQoqRoe(true);
      setMinQoqRoeDiff(1.0);
      setMinRoeFloorForQoq(4.0);
      setUsePbr(true);
      setMinPbr(0.15);
      setMaxPbr(1.2);
      setUseQoqPbrLimit(true);
      setMaxQoqPbrDiff(0.15);
      setMaxQoqPbrGrowthPct(15);
      setUsePer(true);
      setMinPer(1.0);
      setMaxPer(15.0);
      setUseRoePbrRatio(true);
      setMinRoePbrRatio(10.0);
      executeScreener({
        roe_filter_mode: 'HIGH_OR_UP',
        use_roe: true,
        min_roe: 10,
        max_roe: 80,
        use_qoq_roe: true,
        min_qoq_roe_diff: 1.0,
        min_roe_floor_for_qoq: 4.0,
        use_pbr: true,
        min_pbr: 0.15,
        max_pbr: 1.2,
        use_qoq_pbr_limit: true,
        max_qoq_pbr_diff: 0.15,
        max_qoq_pbr_growth_pct: 15,
        use_per: true,
        min_per: 1.0,
        max_per: 15.0,
        use_roe_pbr_ratio: true,
        min_roe_pbr_ratio: 10.0,
      });
    } else if (preset === 'QOQ_TURNAROUND') {
      // 전분기 대비 ROE 급증(+2.5%p↑)했는데 PBR은 오히려 동결/하락(<=+0.05배)한 저평가 종목
      setRoeFilterMode('HIGH_OR_UP');
      setUseRoe(false);
      setUseQoqRoe(true);
      setMinQoqRoeDiff(2.5);
      setMinRoeFloorForQoq(5.0);
      setUsePbr(true);
      setMinPbr(0.15);
      setMaxPbr(1.5);
      setUseQoqPbrLimit(true);
      setMaxQoqPbrDiff(0.05);
      setMaxQoqPbrGrowthPct(10);
      setUsePer(true);
      setMinPer(0.5);
      setMaxPer(20.0);
      setUseRoePbrRatio(true);
      setMinRoePbrRatio(8.0);
      setSortBy('QOQ_ROE_DIFF');
      executeScreener({
        roe_filter_mode: 'HIGH_OR_UP',
        use_roe: false,
        use_qoq_roe: true,
        min_qoq_roe_diff: 2.5,
        min_roe_floor_for_qoq: 5.0,
        use_pbr: true,
        min_pbr: 0.15,
        max_pbr: 1.5,
        use_qoq_pbr_limit: true,
        max_qoq_pbr_diff: 0.05,
        max_qoq_pbr_growth_pct: 10,
        use_per: true,
        min_per: 0.5,
        max_per: 20.0,
        use_roe_pbr_ratio: true,
        min_roe_pbr_ratio: 8.0,
        sort_by: 'QOQ_ROE_DIFF',
      });
    } else if (preset === 'DEEP_VALUE') {
      // 초저PBR(<=0.8배) + 고ROE(>=12%) + 저PER(<=10배)
      setRoeFilterMode('HIGH_OR_UP');
      setUseRoe(true);
      setMinRoe(12);
      setMaxRoe(80);
      setUseQoqRoe(false);
      setUsePbr(true);
      setMinPbr(0.15);
      setMaxPbr(0.8);
      setUseQoqPbrLimit(true);
      setMaxQoqPbrDiff(0.10);
      setMaxQoqPbrGrowthPct(12);
      setUsePer(true);
      setMinPer(0.5);
      setMaxPer(10.0);
      setUseRoePbrRatio(true);
      setMinRoePbrRatio(15.0);
      setSortBy('ROE_PBR_RATIO');
      executeScreener({
        roe_filter_mode: 'HIGH_OR_UP',
        use_roe: true,
        min_roe: 12,
        max_roe: 80,
        use_qoq_roe: false,
        use_pbr: true,
        min_pbr: 0.15,
        max_pbr: 0.8,
        use_qoq_pbr_limit: true,
        max_qoq_pbr_diff: 0.10,
        max_qoq_pbr_growth_pct: 12,
        use_per: true,
        min_per: 0.5,
        max_per: 10.0,
        use_roe_pbr_ratio: true,
        min_roe_pbr_ratio: 15.0,
        sort_by: 'ROE_PBR_RATIO',
      });
    } else if (preset === 'STRICT_BOTH') {
      // ROE >= 10% 이면서 동시에(AND) 전분기 대비 ROE +1.5%p 이상 상승 + PBR <= 1.0배 + PBR 증가 <= +0.10배
      setRoeFilterMode('HIGH_AND_UP');
      setUseRoe(true);
      setMinRoe(10);
      setMaxRoe(80);
      setUseQoqRoe(true);
      setMinQoqRoeDiff(1.5);
      setMinRoeFloorForQoq(10.0);
      setUsePbr(true);
      setMinPbr(0.15);
      setMaxPbr(1.0);
      setUseQoqPbrLimit(true);
      setMaxQoqPbrDiff(0.10);
      setMaxQoqPbrGrowthPct(10);
      setUsePer(true);
      setMinPer(1.0);
      setMaxPer(12.0);
      setUseRoePbrRatio(true);
      setMinRoePbrRatio(12.0);
      executeScreener({
        roe_filter_mode: 'HIGH_AND_UP',
        use_roe: true,
        min_roe: 10,
        max_roe: 80,
        use_qoq_roe: true,
        min_qoq_roe_diff: 1.5,
        min_roe_floor_for_qoq: 10.0,
        use_pbr: true,
        min_pbr: 0.15,
        max_pbr: 1.0,
        use_qoq_pbr_limit: true,
        max_qoq_pbr_diff: 0.10,
        max_qoq_pbr_growth_pct: 10,
        use_per: true,
        min_per: 1.0,
        max_per: 12.0,
        use_roe_pbr_ratio: true,
        min_roe_pbr_ratio: 12.0,
      });
    }
  };

  const getStockName = (item: any) => {
    if (item?.name && item.name !== item.ticker) return item.name;
    const combined = [...(globalStocks || []), ...(stocks || [])];
    const s = combined.find((x: any) => x.ticker === item.ticker || x.ticker?.includes(item.ticker));
    return s ? s.name : item.ticker;
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-200 p-4 sm:p-6 overflow-y-auto space-y-5">
      {/* Header */}
      <div className="border-b border-gray-800 pb-4 flex justify-between items-start sm:items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <span>🧩 ROE · PBR · PER 밸류에이션 갭 종목 필터링 (Tetris Screener)</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            <strong className="text-emerald-300">ROE/PBR 관점 핵심 전략:</strong> ROE가 높은 수준이거나 전분기 대비(QoQ) 증가하는 상황에서, 아직 주가(PBR)가 크게 늘어나지 않은 저평가 종목을 정밀 발굴합니다. (전 상장사 2,577개 종목 DB 연동)
          </p>
        </div>
        <button
          onClick={() => executeScreener()}
          disabled={loading}
          className="bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-extrabold py-2.5 px-6 rounded-xl transition-all shadow-lg border border-emerald-400/40 active:scale-95 flex items-center gap-2 cursor-pointer"
        >
          <span>🔍</span>
          <span>{loading ? '종목 발굴 중...' : 'ROE · PBR 조건 검색 실행'}</span>
        </button>
      </div>

      {/* 원클릭 전략 프리셋 & 시장/정렬 바 */}
      <div className="bg-[#111] border border-gray-800 p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-gray-400 font-bold">⚡ 원클릭 ROE/PBR 전략 프리셋:</span>
          <button
            type="button"
            onClick={() => applyPreset('CORE_ROE_PBR')}
            className="px-3 py-1.5 rounded-lg bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/50 text-emerald-200 font-bold cursor-pointer transition"
          >
            🎯 [추천] 고ROE(≥10%) 또는 전분기 ROE↑ + 저PBR(≤1.2배) &amp; PBR 상승억제
          </button>
          <button
            type="button"
            onClick={() => applyPreset('QOQ_TURNAROUND')}
            className="px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/50 text-indigo-200 font-bold cursor-pointer transition"
          >
            🚀 전분기 대비 ROE 급증(+2.5%p↑) + PBR 미반영(ΔPBR ≤ +0.05배)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('DEEP_VALUE')}
            className="px-3 py-1.5 rounded-lg bg-amber-950/80 hover:bg-amber-900 border border-amber-500/50 text-amber-200 font-bold cursor-pointer transition"
          >
            💎 초저PBR(≤0.8배) · 고ROE(≥12%) · 저PER(≤10배)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('STRICT_BOTH')}
            className="px-3 py-1.5 rounded-lg bg-purple-950/80 hover:bg-purple-900 border border-purple-500/50 text-purple-200 font-bold cursor-pointer transition"
          >
            🔥 엄격 교집합(ROE≥10% AND 전분기 +1.5%p↑ AND PBR≤1.0배)
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={marketFilter}
            onChange={(e) => {
              const m = e.target.value as 'ALL' | 'KOSPI' | 'KOSDAQ';
              setMarketFilter(m);
              executeScreener({ market_filter: m });
            }}
            className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-white font-bold"
          >
            <option value="ALL">전체 시장 (KOSPI + KOSDAQ)</option>
            <option value="KOSPI">KOSPI (유가증권)</option>
            <option value="KOSDAQ">KOSDAQ (코스닥)</option>
          </select>

          <select
            value={sortBy}
            onChange={(e) => {
              const s = e.target.value;
              setSortBy(s);
              executeScreener({ sort_by: s });
            }}
            className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-emerald-300 font-bold"
          >
            <option value="ROE_PBR_RATIO">정렬: ROE/PBR 가성비 높은 순 (고ROE·저PBR)</option>
            <option value="QOQ_ROE_DIFF">정렬: 전분기 대비 ROE 증가폭(ΔROE) 큰 순</option>
            <option value="ROE_DESC">정렬: 절대 ROE 높은 순</option>
            <option value="PBR_ASC">정렬: PBR 낮은 순</option>
            <option value="PER_ASC">정렬: PER 낮은 순</option>
          </select>
        </div>
      </div>

      {/* 핵심 ROE / PBR / PER 6대 필터링 컨트롤 그리드 */}
      <div className="bg-[#111] border border-gray-800 p-5 rounded-xl shadow-xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
          <div className="text-sm font-bold text-emerald-300 flex items-center gap-2">
            <span>🎯 ROE · PBR · PER 핵심 밸류에이션 필터</span>
            <span className="text-xs text-gray-400 font-normal">
              (ROE가 높거나 전분기 대비 상승하는데 PBR이 낮고 크게 늘어나지 않은 종목 추출)
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-1">
            <span className="text-gray-300 font-bold">ROE 조건 결합방식:</span>
            <label className="flex items-center gap-1 cursor-pointer text-emerald-300 font-bold">
              <input
                type="radio"
                name="roeMode"
                checked={roeFilterMode === 'HIGH_OR_UP'}
                onChange={() => setRoeFilterMode('HIGH_OR_UP')}
                className="accent-emerald-500"
              />
              <span>고ROE 이거나(OR) 전분기 대비 ROE 증가</span>
            </label>
            <span className="text-gray-600">|</span>
            <label className="flex items-center gap-1 cursor-pointer text-indigo-300 font-bold">
              <input
                type="radio"
                name="roeMode"
                checked={roeFilterMode === 'HIGH_AND_UP'}
                onChange={() => setRoeFilterMode('HIGH_AND_UP')}
                className="accent-indigo-500"
              />
              <span>고ROE 이면서 동시에(AND) 전분기 대비 증가</span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
          {/* ① 현재 ROE 수준 (%) */}
          <div
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${
              useRoe
                ? 'bg-indigo-950/40 border-indigo-500/80 text-white'
                : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useRoe}
                  onChange={(e) => setUseRoe(e.target.checked)}
                  className="w-4 h-4 accent-indigo-500 rounded"
                />
                <span>① 고ROE 수준 (%) 범위</span>
              </label>
              <span className="font-mono text-indigo-300 font-bold">
                {minRoe}% ~ {maxRoe}%
              </span>
            </div>
            <p className="text-[11px] text-gray-400">자기자본이익률(ROE)이 높은 우량 수익성 종목 기준</p>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-gray-400">최소:</span>
                <input
                  type="range"
                  min="-20"
                  max="50"
                  step="1"
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
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-gray-400">최대:</span>
                <input
                  type="range"
                  min="10"
                  max="150"
                  step="5"
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
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* ② 전분기 대비(QoQ) ROE 증가폭 (%p) */}
          <div
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${
              useQoqRoe
                ? 'bg-emerald-950/40 border-emerald-500/80 text-white'
                : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useQoqRoe}
                  onChange={(e) => setUseQoqRoe(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>② 전분기 대비(QoQ) ROE 증가폭</span>
              </label>
              <span className="font-mono text-emerald-300 font-bold">
                +{minQoqRoeDiff}%p 이상 ↑
              </span>
            </div>
            <p className="text-[11px] text-gray-400">직전 분기 대비 ROE가 개선·상승 전환하는 종목 포착</p>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] text-gray-400">ΔROE 최소:</span>
                <input
                  type="range"
                  min="-5"
                  max="20"
                  step="0.5"
                  value={minQoqRoeDiff}
                  disabled={!useQoqRoe}
                  onChange={(e) => setMinQoqRoeDiff(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <input
                  type="number"
                  step="0.5"
                  value={minQoqRoeDiff}
                  disabled={!useQoqRoe}
                  onChange={(e) => setMinQoqRoeDiff(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] text-gray-400">최소 ROE:</span>
                <input
                  type="range"
                  min="0"
                  max="20"
                  step="1"
                  value={minRoeFloorForQoq}
                  disabled={!useQoqRoe}
                  onChange={(e) => setMinRoeFloorForQoq(Number(e.target.value))}
                  className="w-full accent-emerald-500"
                />
                <input
                  type="number"
                  value={minRoeFloorForQoq}
                  disabled={!useQoqRoe}
                  onChange={(e) => setMinRoeFloorForQoq(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* ③ PBR 절대 수준 (배) */}
          <div
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${
              usePbr
                ? 'bg-sky-950/40 border-sky-500/80 text-white'
                : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={usePbr}
                  onChange={(e) => setUsePbr(e.target.checked)}
                  className="w-4 h-4 accent-sky-500 rounded"
                />
                <span>③ 저PBR 수준 (배) 범위</span>
              </label>
              <span className="font-mono text-sky-300 font-bold">
                {minPbr}배 ~ {maxPbr}배 이하
              </span>
            </div>
            <p className="text-[11px] text-gray-400">순자산(BPS) 대비 주가가 저평가된 종목 필터</p>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-gray-400">최소:</span>
                <input
                  type="range"
                  min="0.05"
                  max="1.5"
                  step="0.05"
                  value={minPbr}
                  disabled={!usePbr}
                  onChange={(e) => setMinPbr(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />
                <input
                  type="number"
                  step="0.05"
                  value={minPbr}
                  disabled={!usePbr}
                  onChange={(e) => setMinPbr(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-gray-400">최대:</span>
                <input
                  type="range"
                  min="0.2"
                  max="5.0"
                  step="0.1"
                  value={maxPbr}
                  disabled={!usePbr}
                  onChange={(e) => setMaxPbr(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />
                <input
                  type="number"
                  step="0.1"
                  value={maxPbr}
                  disabled={!usePbr}
                  onChange={(e) => setMaxPbr(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* ④ 전분기 대비(QoQ) PBR 상승폭 제한 ("PBR이 크게 늘어나지 않은 종목") */}
          <div
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${
              useQoqPbrLimit
                ? 'bg-amber-950/40 border-amber-500/80 text-white'
                : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useQoqPbrLimit}
                  onChange={(e) => setUseQoqPbrLimit(e.target.checked)}
                  className="w-4 h-4 accent-amber-500 rounded"
                />
                <span>④ 전분기 대비 PBR 증가폭 상한</span>
              </label>
              <span className="font-mono text-amber-300 font-bold">
                ΔPBR ≤ +{maxQoqPbrDiff}배 (≤+{maxQoqPbrGrowthPct}%)
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              ROE 개선에도 아직 PBR이 크게 늘어나지 않은(멀티플 미확장) 종목만 선별
            </p>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] text-gray-400">ΔPBR 상한:</span>
                <input
                  type="range"
                  min="-0.5"
                  max="1.0"
                  step="0.05"
                  value={maxQoqPbrDiff}
                  disabled={!useQoqPbrLimit}
                  onChange={(e) => setMaxQoqPbrDiff(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <input
                  type="number"
                  step="0.05"
                  value={maxQoqPbrDiff}
                  disabled={!useQoqPbrLimit}
                  onChange={(e) => setMaxQoqPbrDiff(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-16 text-[11px] text-gray-400">상승률 상한:</span>
                <input
                  type="range"
                  min="-20"
                  max="50"
                  step="5"
                  value={maxQoqPbrGrowthPct}
                  disabled={!useQoqPbrLimit}
                  onChange={(e) => setMaxQoqPbrGrowthPct(Number(e.target.value))}
                  className="w-full accent-amber-500"
                />
                <input
                  type="number"
                  value={maxQoqPbrGrowthPct}
                  disabled={!useQoqPbrLimit}
                  onChange={(e) => setMaxQoqPbrGrowthPct(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* ⑤ PER 범위 (배) */}
          <div
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${
              usePer
                ? 'bg-purple-950/40 border-purple-500/80 text-white'
                : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={usePer}
                  onChange={(e) => setUsePer(e.target.checked)}
                  className="w-4 h-4 accent-purple-500 rounded"
                />
                <span>⑤ PER (주가수익비율) 범위</span>
              </label>
              <span className="font-mono text-purple-300 font-bold">
                {minPer}배 ~ {maxPer}배 이하
              </span>
            </div>
            <p className="text-[11px] text-gray-400">이익 대비 주가 멀티플(PER = PBR ÷ ROE) 저평가 검증</p>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-gray-400">최소:</span>
                <input
                  type="range"
                  min="0.5"
                  max="15"
                  step="0.5"
                  value={minPer}
                  disabled={!usePer}
                  onChange={(e) => setMinPer(Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <input
                  type="number"
                  step="0.5"
                  value={minPer}
                  disabled={!usePer}
                  onChange={(e) => setMinPer(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-gray-400">최대:</span>
                <input
                  type="range"
                  min="3"
                  max="50"
                  step="1"
                  value={maxPer}
                  disabled={!usePer}
                  onChange={(e) => setMaxPer(Number(e.target.value))}
                  className="w-full accent-purple-500"
                />
                <input
                  type="number"
                  value={maxPer}
                  disabled={!usePer}
                  onChange={(e) => setMaxPer(Number(e.target.value))}
                  className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* ⑥ ROE / PBR 가성비 지수 (ROE ÷ PBR) 및 분기 주가 상승률 */}
          <div
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${
              useRoePbrRatio || usePriceChange
                ? 'bg-rose-950/40 border-rose-500/80 text-white'
                : 'bg-gray-900/40 border-gray-800 text-gray-400 opacity-60'
            }`}
          >
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer font-bold">
                <input
                  type="checkbox"
                  checked={useRoePbrRatio}
                  onChange={(e) => setUseRoePbrRatio(e.target.checked)}
                  className="w-4 h-4 accent-rose-500 rounded"
                />
                <span>⑥ 최소 ROE/PBR 가성비 (ROE÷PBR)</span>
              </label>
              <span className="font-mono text-rose-300 font-bold">{minRoePbrRatio} 이상</span>
            </div>
            <div className="flex items-center gap-2 pt-0.5">
              <input
                type="range"
                min="0"
                max="35"
                step="1"
                value={minRoePbrRatio}
                disabled={!useRoePbrRatio}
                onChange={(e) => setMinRoePbrRatio(Number(e.target.value))}
                className="w-full accent-rose-500"
              />
              <input
                type="number"
                value={minRoePbrRatio}
                disabled={!useRoePbrRatio}
                onChange={(e) => setMinRoePbrRatio(Number(e.target.value))}
                className="w-14 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
              />
            </div>

            <div className="pt-2 border-t border-gray-800/80 flex items-center justify-between">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold text-gray-300">
                <input
                  type="checkbox"
                  checked={usePriceChange}
                  onChange={(e) => setUsePriceChange(e.target.checked)}
                  className="w-3.5 h-3.5 accent-rose-500 rounded"
                />
                <span>전분기 주가등락률 범위 제한</span>
              </label>
              <span className="font-mono text-[11px] text-rose-200">
                {minPriceChange}% ~ +{maxPriceChange}%
              </span>
            </div>
            {usePriceChange && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={minPriceChange}
                  onChange={(e) => setMinPriceChange(Number(e.target.value))}
                  className="w-16 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
                <span className="text-gray-400">~</span>
                <input
                  type="number"
                  value={maxPriceChange}
                  onChange={(e) => setMaxPriceChange(Number(e.target.value))}
                  className="w-16 bg-gray-800 border border-gray-700 text-center rounded px-1 py-0.5 text-xs text-white font-mono"
                />
                <span className="text-gray-400 text-[11px]">% 이내</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* X축: PBR (배), Y축: ROE (%) 사분면 밸류에이션 산점도 (Interactive Scatter Plot) */}
      {results.length > 0 && (() => {
        const W = 960;
        const H = 430;
        const padL = 64;
        const padR = 36;
        const padT = 32;
        const padB = 50;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;

        const plotItems = results.slice(0, 150);
        const pbrVals = plotItems.flatMap((it: any) => [
          Number(it.pbr) || 0,
          showQoqTrajectory ? Number(it.prev_q_pbr) || Number(it.pbr) || 0 : Number(it.pbr) || 0,
        ]).filter((v) => v > 0);
        const roeVals = plotItems.flatMap((it: any) => [
          Number(it.roe) || 0,
          showQoqTrajectory ? Number(it.prev_q_roe) || Number(it.roe) || 0 : Number(it.roe) || 0,
        ]);

        const minXRaw = pbrVals.length ? Math.min(...pbrVals, 0.1) : 0;
        const maxXRaw = pbrVals.length ? Math.max(...pbrVals, 1.2) : 2.0;
        const xMin = Math.max(0, Number((minXRaw - 0.08).toFixed(2)));
        const xMax = Number((maxXRaw + Math.max(0.15, (maxXRaw - minXRaw) * 0.12)).toFixed(2));
        const xRange = Math.max(0.1, xMax - xMin);

        const minYRaw = roeVals.length ? Math.min(...roeVals, 0) : 0;
        const maxYRaw = roeVals.length ? Math.max(...roeVals, 20) : 30;
        const yMin = Number((minYRaw - Math.max(2, (maxYRaw - minYRaw) * 0.08)).toFixed(1));
        const yMax = Number((maxYRaw + Math.max(4, (maxYRaw - minYRaw) * 0.12)).toFixed(1));
        const yRange = Math.max(1, yMax - yMin);

        const toX = (pbrVal: number) => {
          const clamped = Math.min(xMax, Math.max(xMin, pbrVal));
          return padL + ((clamped - xMin) / xRange) * plotW;
        };
        const toY = (roeVal: number) => {
          const clamped = Math.min(yMax, Math.max(yMin, roeVal));
          return padT + plotH - ((clamped - yMin) / yRange) * plotH;
        };

        const refPbr = 1.0;
        const refRoe = useRoe ? minRoe : 10.0;
        const refX = toX(refPbr);
        const refY = toY(refRoe);

        const xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((t) => Number((xMin + t * xRange).toFixed(2)));
        const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((t) => Number((yMin + t * yRange).toFixed(1)));

        // 등가성비 대각선 (ROE = slope * PBR -> ROE/PBR = 10, 20)
        const makeIsoLine = (slope: number) => {
          const pts: string[] = [];
          for (let step = 0; step <= 20; step++) {
            const px = xMin + (step / 20) * xRange;
            const py = slope * px;
            if (py >= yMin && py <= yMax) {
              pts.push(`${toX(px).toFixed(1)},${toY(py).toFixed(1)}`);
            }
          }
          return pts.join(' ');
        };
        const iso10Pts = makeIsoLine(10);
        const iso20Pts = makeIsoLine(20);

        return (
          <div className="bg-[#111] border border-gray-800 p-5 rounded-xl shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                  <span>🎯 [X축: PBR (배) · Y축: ROE (%)] 선택 종목 밸류에이션 매트릭스 산점도 (Scatter Plot)</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                    좌상단(↖) = 저PBR · 고ROE 핵심 저평가 구간
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  원을 클릭하면 해당 종목 상세 분석 페이지로 이동하며, 마우스를 올리면 전분기 대비 ROE·PBR 이동 궤적과 상세 지표를 확인할 수 있습니다.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer text-emerald-300 font-bold">
                  <input
                    type="checkbox"
                    checked={showQoqTrajectory}
                    onChange={(e) => setShowQoqTrajectory(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>전분기 → 현재 (ΔPBR, ΔROE) 궤적 화살표 표시</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sky-300 font-bold">
                  <input
                    type="checkbox"
                    checked={showTopLabelsOnly}
                    onChange={(e) => setShowTopLabelsOnly(e.target.checked)}
                    className="accent-sky-500"
                  />
                  <span>{showTopLabelsOnly ? '상위 25개 핵심 종목명 표시' : '전체 종목명 표시'}</span>
                </label>
              </div>
            </div>

            {/* 범례 & 호버 종목 요약 바 */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-gray-900/80 border border-gray-800 rounded-lg px-3.5 py-2">
              <div className="flex flex-wrap items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-emerald-400 border border-white/60" />
                  <span className="text-gray-200 font-bold">고ROE &amp; 전분기비 ROE 증가 (ΔROE ≥ +1%p)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-sky-400 border border-white/60" />
                  <span className="text-gray-200 font-bold">고ROE 유지 (ΔROE 보합/소폭변동)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full bg-amber-400 border border-white/60" />
                  <span className="text-gray-200 font-bold">전분기비 ROE 턴어라운드 개선주</span>
                </span>
              </div>

              {hoveredStock ? (
                <div className="flex flex-wrap items-center gap-3 font-mono text-xs bg-indigo-950/90 border border-indigo-400/60 px-3 py-1 rounded-lg">
                  <span className="font-sans font-extrabold text-white">
                    {getStockName(hoveredStock)} ({hoveredStock.ticker})
                  </span>
                  <span className="text-sky-300 font-bold">
                    PBR: {hoveredStock.prev_q_pbr}배 → {hoveredStock.pbr}배 ({hoveredStock.qoq_pbr_diff >= 0 ? `+${hoveredStock.qoq_pbr_diff}` : hoveredStock.qoq_pbr_diff}배)
                  </span>
                  <span className="text-emerald-300 font-bold">
                    ROE: {hoveredStock.prev_q_roe}% → {hoveredStock.roe}% ({hoveredStock.qoq_roe_diff >= 0 ? `+${hoveredStock.qoq_roe_diff}` : hoveredStock.qoq_roe_diff}%p)
                  </span>
                  <span className="text-purple-300 font-bold">PER: {hoveredStock.per}배</span>
                  <span className="text-rose-300 font-bold">ROE/PBR: {hoveredStock.roe_pbr_ratio}</span>
                </div>
              ) : (
                <span className="text-gray-400">
                  💡 차트 위의 종목 점(Dot)에 마우스를 올리면 전분기 대비(QoQ) PBR·ROE 상세 수치가 표시됩니다.
                </span>
              )}
            </div>

            <div className="relative w-full">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                className="w-full h-auto bg-[#070b12] rounded-xl border border-gray-800 select-none"
              >
                {/* 좌상단 황금 사분면 (저PBR <= 1.0배 & 고ROE >= 기준선) 하이라이트 배경 */}
                {refX > padL && refY > padT && (
                  <rect
                    x={padL}
                    y={padT}
                    width={Math.max(0, Math.min(plotW, refX - padL))}
                    height={Math.max(0, Math.min(plotH, refY - padT))}
                    fill="rgba(16, 185, 129, 0.08)"
                  />
                )}

                {/* 격자선 및 X축(PBR) / Y축(ROE) 눈금 */}
                {xTicks.map((xv, i) => {
                  const x = toX(xv);
                  return (
                    <g key={`xt-${i}`}>
                      <line x1={x} y1={padT} x2={x} y2={padT + plotH} stroke="rgba(55,65,81,0.35)" strokeWidth="1" />
                      <text
                        x={x}
                        y={padT + plotH + 18}
                        textAnchor="middle"
                        fill="#38bdf8"
                        fontSize="11"
                        fontFamily="monospace"
                      >
                        {xv.toFixed(2)}배
                      </text>
                    </g>
                  );
                })}

                {yTicks.map((yv, i) => {
                  const y = toY(yv);
                  return (
                    <g key={`yt-${i}`}>
                      <line x1={padL} y1={y} x2={padL + plotW} y2={y} stroke="rgba(55,65,81,0.35)" strokeWidth="1" />
                      <text
                        x={padL - 8}
                        y={y + 4}
                        textAnchor="end"
                        fill="#a5b4fc"
                        fontSize="11"
                        fontFamily="monospace"
                      >
                        {yv.toFixed(1)}%
                      </text>
                    </g>
                  );
                })}

                {/* PBR = 1.0배 수직 기준선 & ROE = minRoe(10%) 수평 기준선 */}
                {refPbr >= xMin && refPbr <= xMax && (
                  <g>
                    <line
                      x1={refX}
                      y1={padT}
                      x2={refX}
                      y2={padT + plotH}
                      stroke="rgba(56, 189, 248, 0.55)"
                      strokeWidth="1.4"
                      strokeDasharray="4,4"
                    />
                    <text
                      x={refX + 5}
                      y={padT + 14}
                      fill="#38bdf8"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      PBR 1.0배 기준선
                    </text>
                  </g>
                )}

                {refRoe >= yMin && refRoe <= yMax && (
                  <g>
                    <line
                      x1={padL}
                      y1={refY}
                      x2={padL + plotW}
                      y2={refY}
                      stroke="rgba(16, 185, 129, 0.55)"
                      strokeWidth="1.4"
                      strokeDasharray="4,4"
                    />
                    <text
                      x={padL + plotW - 6}
                      y={refY - 6}
                      textAnchor="end"
                      fill="#34d399"
                      fontSize="10"
                      fontWeight="bold"
                    >
                      ROE {refRoe}% 기준선
                    </text>
                  </g>
                )}

                {/* ROE/PBR 가성비 가이드 대각선 (ROE/PBR = 10, ROE/PBR = 20) */}
                {iso10Pts && (
                  <polyline
                    fill="none"
                    stroke="rgba(244, 63, 94, 0.28)"
                    strokeWidth="1.2"
                    strokeDasharray="3,3"
                    points={iso10Pts}
                  />
                )}
                {iso20Pts && (
                  <polyline
                    fill="none"
                    stroke="rgba(251, 191, 36, 0.32)"
                    strokeWidth="1.2"
                    strokeDasharray="3,3"
                    points={iso20Pts}
                  />
                )}

                {/* 좌상단 사분면 워터마크 라벨 */}
                <text
                  x={padL + 10}
                  y={padT + 20}
                  fill="#10b981"
                  fontSize="11"
                  fontWeight="bold"
                >
                  ★ Sweet Spot (저PBR · 고ROE 핵심 발굴 영역)
                </text>

                {/* 축 제목 */}
                <text
                  x={padL + plotW / 2}
                  y={H - 10}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="12"
                  fontWeight="bold"
                >
                  X축: PBR (주가순자산비율, 배) — 왼쪽일수록 자산대비 저평가 (← 저PBR)
                </text>
                <text
                  x={16}
                  y={padT + plotH / 2}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="12"
                  fontWeight="bold"
                  transform={`rotate(-90, 16, ${padT + plotH / 2})`}
                >
                  Y축: ROE (자기자본이익률, %) — 위쪽일수록 고수익 (고ROE ↑)
                </text>

                {/* 종목별 전분기 -> 현재 이동 궤적선 & 현재 위치 점(Point) 렌더링 */}
                {plotItems.map((it: any, idx: number) => {
                  const curX = toX(Number(it.pbr) || 0);
                  const curY = toY(Number(it.roe) || 0);
                  const prevX = toX(Number(it.prev_q_pbr) || Number(it.pbr) || 0);
                  const prevY = toY(Number(it.prev_q_roe) || Number(it.roe) || 0);

                  const isHovered = hoveredStock?.ticker === it.ticker;
                  const qoqRoe = Number(it.qoq_roe_diff) || 0;
                  const roeVal = Number(it.roe) || 0;

                  const dotColor =
                    roeVal >= 10 && qoqRoe >= 1.0
                      ? '#10b981' // 고ROE + 전분기 대비 상승 (에메랄드)
                      : roeVal >= 10
                      ? '#38bdf8' // 고ROE 유지 (스카이블루)
                      : '#f59e0b'; // 전분기 대비 ROE 개선 턴어라운드 (앰버)

                  const radius = isHovered ? 8.5 : idx < 10 ? 6.0 : 4.6;
                  const showLabel = isHovered || !showTopLabelsOnly || idx < 25;

                  return (
                    <g
                      key={it.ticker}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredStock(it)}
                      onMouseLeave={() => setHoveredStock(null)}
                      onClick={() => {
                        if (setGlobalSearchTicker) setGlobalSearchTicker(it.ticker);
                      }}
                    >
                      {/* 전분기(prev_q) -> 현재(cur) 이동 궤적 점선 */}
                      {showQoqTrajectory && (Math.abs(curX - prevX) > 2 || Math.abs(curY - prevY) > 2) && (
                        <g opacity={isHovered ? 0.95 : 0.4}>
                          <circle cx={prevX} cy={prevY} r={2.2} fill="#94a3b8" />
                          <line
                            x1={prevX}
                            y1={prevY}
                            x2={curX}
                            y2={curY}
                            stroke={qoqRoe >= 0 ? '#34d399' : '#f87171'}
                            strokeWidth={isHovered ? '2.0' : '1.1'}
                            strokeDasharray="2,2"
                          />
                        </g>
                      )}

                      {/* 현재 종목 위치 원 */}
                      <circle
                        cx={curX}
                        cy={curY}
                        r={radius}
                        fill={dotColor}
                        fillOpacity={isHovered ? 1.0 : 0.82}
                        stroke={isHovered ? '#ffffff' : '#0f172a'}
                        strokeWidth={isHovered ? '2.2' : '1.2'}
                      />

                      {/* 종목명 라벨 */}
                      {showLabel && (
                        <text
                          x={curX + radius + 3}
                          y={curY + 3}
                          fill={isHovered ? '#ffffff' : idx < 10 ? '#a7f3d0' : '#cbd5e1'}
                          fontSize={isHovered ? '11.5' : '9.5'}
                          fontWeight={isHovered || idx < 10 ? 'bold' : 'normal'}
                        >
                          {getStockName(it)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        );
      })()}

      {/* 검색 결과 테이블 */}
      <div className="bg-[#111] border border-gray-800 p-5 rounded-xl shadow-xl space-y-4 flex-1">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-gray-800 pb-3">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <span>📋 ROE/PBR 저평가·실적개선 발굴 종목 리스트</span>
            <span className="text-xs bg-emerald-900/80 border border-emerald-500/40 text-emerald-200 px-3 py-0.5 rounded-full font-mono">
              총 {results.length}개 종목 발굴
            </span>
          </h3>
          <span className="text-xs text-gray-400">
            종목 클릭 시 상단 종목 상세 분석 리포트로 즉시 연동됩니다.
          </span>
        </div>

        {error && (
          <div className="text-red-400 text-xs p-3 bg-red-950/40 border border-red-800 rounded">
            {error}
          </div>
        )}

        {results.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse whitespace-nowrap font-mono">
              <thead>
                <tr className="bg-gray-900/90 text-gray-300 border-b border-gray-800">
                  <th className="p-2.5 font-sans">순위 / 종목명 (코드)</th>
                  <th className="p-2.5 font-sans">시장 / 업종</th>
                  <th className="p-2.5 text-right">현재가 (시총)</th>
                  <th className="p-2.5 text-right text-indigo-300">전분기 → 현재 ROE (%)</th>
                  <th className="p-2.5 text-right text-emerald-300">전분기비 ΔROE</th>
                  <th className="p-2.5 text-right text-sky-300">전분기 → 현재 PBR (배)</th>
                  <th className="p-2.5 text-right text-amber-300">전분기비 ΔPBR (변동률)</th>
                  <th className="p-2.5 text-right text-purple-300">PER (배)</th>
                  <th className="p-2.5 text-right text-rose-300">ROE / PBR 가성비</th>
                  <th className="p-2.5 text-right">분기 주가상승률</th>
                  <th className="p-2.5 font-sans">ROE/PBR 핵심 포착 사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80">
                {results.map((item: any, idx: number) => {
                  const roeUp = (item.qoq_roe_diff ?? 0) >= 0;
                  const pbrStable = (item.qoq_pbr_diff ?? 0) <= 0.15;
                  const qPriceG = Number(item.qoq_price_growth_pct ?? 0);
                  return (
                    <tr
                      key={item.ticker}
                      onClick={() => {
                        if (setGlobalSearchTicker) setGlobalSearchTicker(item.ticker);
                      }}
                      className="hover:bg-indigo-950/35 transition-colors cursor-pointer group"
                    >
                      <td className="p-2.5 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono text-[10px]">
                            #{idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-white group-hover:text-emerald-300">
                              {getStockName(item)}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono">{item.ticker}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-2.5 font-sans">
                        <div className="text-gray-200 font-semibold">{item.market || '코스피'}</div>
                        <div className="text-[10px] text-gray-400">{item.sector || '-'}</div>
                      </td>

                      <td className="p-2.5 text-right">
                        <div className="text-white font-bold">
                          {Number(item.price || 0).toLocaleString()}원
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {Number(item.market_cap_eok || 0).toLocaleString()}억
                        </div>
                      </td>

                      <td className="p-2.5 text-right">
                        <div className="font-extrabold text-indigo-300 text-sm">{item.roe}%</div>
                        <div className="text-[10px] text-gray-400">
                          전분기 {item.prev_q_roe}% → 현재 {item.roe}%
                        </div>
                      </td>

                      <td className="p-2.5 text-right">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            roeUp
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {roeUp ? `+${item.qoq_roe_diff}%p ▲` : `${item.qoq_roe_diff}%p ▼`}
                        </span>
                      </td>

                      <td className="p-2.5 text-right">
                        <div className="font-extrabold text-sky-300 text-sm">{item.pbr}배</div>
                        <div className="text-[10px] text-gray-400">
                          전분기 {item.prev_q_pbr}배 → 현재 {item.pbr}배
                        </div>
                      </td>

                      <td className="p-2.5 text-right">
                        <div
                          className={`font-bold ${
                            (item.qoq_pbr_diff ?? 0) <= 0
                              ? 'text-emerald-300'
                              : pbrStable
                              ? 'text-amber-300'
                              : 'text-rose-400'
                          }`}
                        >
                          {(item.qoq_pbr_diff ?? 0) >= 0 ? `+${item.qoq_pbr_diff}배` : `${item.qoq_pbr_diff}배`}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          ({(item.qoq_pbr_growth_pct ?? 0) >= 0 ? '+' : ''}
                          {item.qoq_pbr_growth_pct}%)
                        </div>
                      </td>

                      <td className="p-2.5 text-right">
                        <div className="font-bold text-purple-300">
                          {item.per > 0 ? `${item.per}배` : '-'}
                        </div>
                        {item.div_yield > 0 && (
                          <div className="text-[10px] text-gray-400">배당 {item.div_yield}%</div>
                        )}
                      </td>

                      <td className="p-2.5 text-right">
                        <div className="font-extrabold text-rose-300 text-sm">
                          {item.roe_pbr_ratio}
                        </div>
                        <div className="text-[10px] text-gray-400">ROE÷PBR</div>
                      </td>

                      <td className="p-2.5 text-right">
                        <div className={`font-bold ${qPriceG >= 0 ? 'text-emerald-400' : 'text-sky-400'}`}>
                          {qPriceG >= 0 ? `+${qPriceG}%` : `${qPriceG}%`}
                        </div>
                        <div className="text-[10px] text-gray-500">
                          YoY {(item.yoy_price_growth_pct ?? 0) >= 0 ? '+' : ''}
                          {item.yoy_price_growth_pct ?? 0}%
                        </div>
                      </td>

                      <td className="p-2.5 font-sans">
                        <div className="flex flex-wrap gap-1">
                          {(item.selection_tags || []).map((tag: string, tIdx: number) => (
                            <span
                              key={tIdx}
                              className="px-2 py-0.5 text-[10px] rounded font-bold bg-gray-800/90 text-emerald-300 border border-emerald-500/30"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16 text-gray-400 text-sm space-y-2">
            {loading ? (
              <div className="animate-pulse">
                ⏳ 전 상장사(2,577개) ROE · PBR · PER 데이터베이스에서 조건에 맞는 종목을 탐색 중입니다...
              </div>
            ) : (
              <div>
                현재 설정된 조건을 만족하는 종목이 없습니다. 상단 <strong>[원클릭 ROE/PBR 전략 프리셋]</strong>을 클릭하거나 PBR/ROE 범위를 조금 넓혀보세요.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
