'use client';
import React, { useEffect, useMemo, useRef, useState } from 'react';

const SECTOR_PALETTE: string[] = [
  '#10b981', // emerald
  '#38bdf8', // sky
  '#f59e0b', // amber
  '#a855f7', // purple
  '#f43f5e', // rose
  '#2dd4bf', // teal
  '#fb923c', // orange
  '#818cf8', // indigo
  '#facc15', // yellow
  '#ec4899', // pink
  '#4ade80', // green
  '#60a5fa', // blue
  '#c084fc', // violet
  '#f87171', // red
  '#22d3ee', // cyan
  '#a3e635', // lime
];

const getSectorColor = (sectorName: string, indexHint: number = 0) => {
  if (!sectorName) return '#94a3b8';
  let hash = 0;
  for (let i = 0; i < sectorName.length; i++) {
    hash = (hash * 31 + sectorName.charCodeAt(i)) >>> 0;
  }
  return SECTOR_PALETTE[(hash + indexHint) % SECTOR_PALETTE.length];
};

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
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [colorMode, setColorMode] = useState<'SECTOR' | 'ROE_STATUS'>('SECTOR');
  const [sortBy, setSortBy] = useState<string>('ROE_PBR_RATIO');

  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hoveredStock, setHoveredStock] = useState<any | null>(null);
  const [showQoqTrajectory, setShowQoqTrajectory] = useState<boolean>(false);
  const [showTopLabelsOnly, setShowTopLabelsOnly] = useState<boolean>(true);

  // 🔍 산점도 클릭 기준 고정점(Anchor) & 배율(%) 확대 상태 (디폴트 100%)
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [anchorPoint, setAnchorPoint] = useState<{
    pbr: number;
    roe: number;
    label?: string;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // 💾 필터 설정 영구 저장 상태 (서버 DB + 브라우저 localStorage 이중 고정)
  const [configSavedAt, setConfigSavedAt] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string>('');
  const [savingConfig, setSavingConfig] = useState<boolean>(false);

  const getCurrentFilterPayload = () => ({
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
  });

  const applyFilterConfigToState = (cfg: Record<string, any>) => {
    if (!cfg || typeof cfg !== 'object') return;
    if (cfg.roe_filter_mode) setRoeFilterMode(cfg.roe_filter_mode);
    if (cfg.use_roe !== undefined) setUseRoe(Boolean(cfg.use_roe));
    if (cfg.min_roe !== undefined) setMinRoe(Number(cfg.min_roe));
    if (cfg.max_roe !== undefined) setMaxRoe(Number(cfg.max_roe));
    if (cfg.use_qoq_roe !== undefined) setUseQoqRoe(Boolean(cfg.use_qoq_roe));
    if (cfg.min_qoq_roe_diff !== undefined) setMinQoqRoeDiff(Number(cfg.min_qoq_roe_diff));
    if (cfg.min_roe_floor_for_qoq !== undefined) setMinRoeFloorForQoq(Number(cfg.min_roe_floor_for_qoq));
    if (cfg.use_pbr !== undefined) setUsePbr(Boolean(cfg.use_pbr));
    if (cfg.min_pbr !== undefined) setMinPbr(Number(cfg.min_pbr));
    if (cfg.max_pbr !== undefined) setMaxPbr(Number(cfg.max_pbr));
    if (cfg.use_qoq_pbr_limit !== undefined) setUseQoqPbrLimit(Boolean(cfg.use_qoq_pbr_limit));
    if (cfg.max_qoq_pbr_diff !== undefined) setMaxQoqPbrDiff(Number(cfg.max_qoq_pbr_diff));
    if (cfg.max_qoq_pbr_growth_pct !== undefined) setMaxQoqPbrGrowthPct(Number(cfg.max_qoq_pbr_growth_pct));
    if (cfg.use_per !== undefined) setUsePer(Boolean(cfg.use_per));
    if (cfg.min_per !== undefined) setMinPer(Number(cfg.min_per));
    if (cfg.max_per !== undefined) setMaxPer(Number(cfg.max_per));
    if (cfg.use_roe_pbr_ratio !== undefined) setUseRoePbrRatio(Boolean(cfg.use_roe_pbr_ratio));
    if (cfg.min_roe_pbr_ratio !== undefined) setMinRoePbrRatio(Number(cfg.min_roe_pbr_ratio));
    if (cfg.use_price_change !== undefined) setUsePriceChange(Boolean(cfg.use_price_change));
    if (cfg.min_price_change !== undefined) setMinPriceChange(Number(cfg.min_price_change));
    if (cfg.max_price_change !== undefined) setMaxPriceChange(Number(cfg.max_price_change));
    if (cfg.market_filter) setMarketFilter(cfg.market_filter);
    if (cfg.sort_by) setSortBy(cfg.sort_by);
  };

  const saveCurrentFilterConfig = async (applySearchAfterSave: boolean = true) => {
    setSavingConfig(true);
    setSaveMessage('');
    const currentCfg = getCurrentFilterPayload();
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('tetris_roe_pbr_saved_config_v1', JSON.stringify(currentCfg));
      }
      const res = await fetch('/api/dart/screener-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: currentCfg }),
      });
      const data = await res.json();
      if (data.success) {
        setConfigSavedAt(data.updated_at || new Date().toLocaleString());
        setSaveMessage('✅ 현재 필터 설정이 서버 DB에 영구 저장(고정)되었습니다!');
      } else {
        setSaveMessage('✅ 브라우저에 필터 설정이 저장되었습니다.');
      }
      if (applySearchAfterSave) {
        await executeScreener(currentCfg);
      }
    } catch {
      setSaveMessage('✅ 브라우저에 현재 필터 설정이 고정 저장되었습니다.');
      if (applySearchAfterSave) {
        await executeScreener(currentCfg);
      }
    } finally {
      setSavingConfig(false);
      setTimeout(() => setSaveMessage(''), 4000);
    }
  };

  const executeScreener = async (overrideParams?: Record<string, any>) => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        ...getCurrentFilterPayload(),
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
        setZoomPercent(100);
        setAnchorPoint(null);
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
    let mounted = true;
    const initFromSavedConfig = async () => {
      let loadedCfg: Record<string, any> | null = null;
      try {
        const res = await fetch('/api/dart/screener-config');
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.config) {
            loadedCfg = data.config;
            if (mounted && data.updated_at) {
              setConfigSavedAt(data.updated_at);
            }
          }
        }
      } catch {
        // ignore network error and fallback to localStorage
      }
      if (!loadedCfg && typeof window !== 'undefined') {
        try {
          const raw = window.localStorage.getItem('tetris_roe_pbr_saved_config_v1');
          if (raw) loadedCfg = JSON.parse(raw);
        } catch {
          loadedCfg = null;
        }
      }
      if (mounted && loadedCfg) {
        applyFilterConfigToState(loadedCfg);
        await executeScreener(loadedCfg);
      } else if (mounted) {
        await executeScreener();
      }
    };
    initFromSavedConfig();
    return () => {
      mounted = false;
    };
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

  // 섹터별 종목 수 집계 및 섹터 필터링된 결과
  const sectorStats = useMemo(() => {
    const counts: Record<string, number> = {};
    results.forEach((it: any) => {
      const sec = String(it.sector || '기타').trim() || '기타';
      counts[sec] = (counts[sec] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([sector, count], idx) => ({
        sector,
        count,
        color: getSectorColor(sector, idx),
      }))
      .sort((a, b) => b.count - a.count);
  }, [results]);

  const sectorColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    sectorStats.forEach((s) => {
      map[s.sector] = s.color;
    });
    return map;
  }, [sectorStats]);

  const filteredResults = useMemo(() => {
    if (!selectedSector || selectedSector === 'ALL') return results;
    return results.filter((it: any) => (String(it.sector || '기타').trim() || '기타') === selectedSector);
  }, [results, selectedSector]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-200 p-4 sm:p-6 overflow-y-auto space-y-5">
      {/* Header */}
      <div className="border-b border-gray-800 pb-4 flex justify-between items-start sm:items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <span>🧩 ROE · PBR · PER 밸류에이션 갭 종목 필터링 (Tetris Screener)</span>
          </h2>
          <p className="text-xs text-gray-400 mt-1">
            <strong className="text-emerald-300">4분기 롤링 TTM 순이익 &amp; 분기말 자본 기준:</strong> 순이익·EPS는 분기마다 직전 4개 분기 합계(예: 작년 4Q~금년 3Q 합산)로 롤링하고, 자본·자산·BPS는 해당 분기말(예: 3분기말) 시점 잔액(비합산)을 적용해 ROE, PER, PBR 및 전분기 대비 개선폭(ΔROE)을 정밀 산출합니다.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => saveCurrentFilterConfig(true)}
            disabled={savingConfig || loading}
            className="bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold py-2.5 px-4 rounded-xl transition-all shadow-lg border border-amber-300/60 active:scale-95 flex items-center gap-1.5 cursor-pointer text-xs sm:text-sm"
            title="현재 조정한 ROE·PBR·PER 핵심 밸류에이션 필터 값을 서버 DB에 영구 저장하여 고정합니다"
          >
            <span>💾</span>
            <span>{savingConfig ? '필터 고정 저장 중...' : '현재 필터값 저장 (고정)'}</span>
          </button>
          <button
            onClick={() => executeScreener()}
            disabled={loading}
            className="bg-gradient-to-r from-indigo-600 to-emerald-600 hover:from-indigo-500 hover:to-emerald-500 text-white font-extrabold py-2.5 px-6 rounded-xl transition-all shadow-lg border border-emerald-400/40 active:scale-95 flex items-center gap-2 cursor-pointer text-xs sm:text-sm"
          >
            <span>🔍</span>
            <span>{loading ? '종목 발굴 중...' : 'ROE · PBR 조건 검색 실행'}</span>
          </button>
        </div>
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
          <div className="text-sm font-bold text-emerald-300 flex flex-wrap items-center gap-2">
            <span>🎯 ROE · PBR · PER 핵심 밸류에이션 필터</span>
            <span className="text-xs text-gray-400 font-normal">
              (이익: 최근 4분기 롤링합계[TTM] ÷ 자본: 최신 분기말 시점 잔액 기준)
            </span>
            {configSavedAt && (
              <span className="px-2 py-0.5 rounded bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[11px] font-mono">
                📌 저장된 필터 고정됨 ({configSavedAt})
              </span>
            )}
            {saveMessage && (
              <span className="px-2.5 py-0.5 rounded bg-emerald-950 border border-emerald-400 text-emerald-200 text-xs font-extrabold">
                {saveMessage}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
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

            <button
              type="button"
              onClick={() => saveCurrentFilterConfig(true)}
              disabled={savingConfig}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold text-xs cursor-pointer transition shadow border border-amber-300/60 flex items-center gap-1"
            >
              <span>💾</span>
              <span>{savingConfig ? '저장 중...' : '필터 설정 저장 (고정)'}</span>
            </button>
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

      {/* X축: PBR (배), Y축: ROE (%) 사분면 밸류에이션 산점도 (Interactive Zoom & Sector Scatter Plot) */}
      {results.length > 0 && (() => {
        const W = 960;
        const H = 460;
        const padL = 68;
        const padR = 36;
        const padT = 32;
        const padB = 52;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;

        const plotItems = filteredResults.slice(0, 220);

        // 현재 위치(pbr, roe) 기준으로 기본 축 스케일을 잡아서 전분기 극단적 적자(-168% ROE 등) 때문에 점들이 한쪽에 찌그러지는 현상 방지
        const curPbrVals = plotItems.map((it: any) => Number(it.pbr) || 0).filter((v) => v > 0);
        const curRoeVals = plotItems.map((it: any) => Number(it.roe) || 0);

        const minXRaw = curPbrVals.length ? Math.min(...curPbrVals, 0.15) : 0.1;
        const maxXRaw = curPbrVals.length ? Math.max(...curPbrVals, 1.05) : 1.5;
        const defaultXMin = Math.max(0, Number((minXRaw - 0.06).toFixed(2)));
        const defaultXMax = Number((maxXRaw + Math.max(0.1, (maxXRaw - minXRaw) * 0.1)).toFixed(2));

        const minYRaw = curRoeVals.length ? Math.min(...curRoeVals, 4) : 0;
        const maxYRaw = curRoeVals.length ? Math.max(...curRoeVals, 22) : 35;
        const defaultYMin = Number((minYRaw - Math.max(2, (maxYRaw - minYRaw) * 0.1)).toFixed(1));
        const defaultYMax = Number((maxYRaw + Math.max(3, (maxYRaw - minYRaw) * 0.12)).toFixed(1));

        // 종목들의 중앙값(Median)을 기본 앵커(클릭 전 기본 기준점)로 계산
        const sortedPbr = [...curPbrVals].sort((a, b) => a - b);
        const sortedRoe = [...curRoeVals].sort((a, b) => a - b);
        const medianPbr = sortedPbr.length
          ? Number(sortedPbr[Math.floor(sortedPbr.length * 0.45)].toFixed(2))
          : Number(((defaultXMin + defaultXMax) / 2).toFixed(2));
        const medianRoe = sortedRoe.length
          ? Number(sortedRoe[Math.floor(sortedRoe.length * 0.5)].toFixed(1))
          : Number(((defaultYMin + defaultYMax) / 2).toFixed(1));

        const effectiveAnchor = anchorPoint || {
          pbr: medianPbr,
          roe: medianRoe,
          label: '밀집 중심(자동)',
        };

        const baseXSpan = Math.max(0.1, defaultXMax - defaultXMin);
        const baseYSpan = Math.max(4.0, defaultYMax - defaultYMin);
        const safeZoomPct = Math.max(100, Math.min(1000, zoomPercent));
        const scaleFactor = 100 / safeZoomPct;

        let xMin = defaultXMin;
        let xMax = defaultXMax;
        let yMin = defaultYMin;
        let yMax = defaultYMax;

        if (safeZoomPct > 100) {
          const halfX = (baseXSpan * scaleFactor) / 2;
          const halfY = (baseYSpan * scaleFactor) / 2;
          xMin = Math.max(0, Number((effectiveAnchor.pbr - halfX).toFixed(3)));
          xMax = Number((xMin + halfX * 2).toFixed(3));
          yMin = Number((effectiveAnchor.roe - halfY).toFixed(2));
          yMax = Number((effectiveAnchor.roe + halfY).toFixed(2));
        }

        const xRange = Math.max(0.04, xMax - xMin);
        const yRange = Math.max(1.0, yMax - yMin);

        const toX = (pbrVal: number) => padL + ((pbrVal - xMin) / xRange) * plotW;
        const toY = (roeVal: number) => padT + plotH - ((roeVal - yMin) / yRange) * plotH;
        const fromX = (svgX: number) => xMin + ((svgX - padL) / plotW) * xRange;
        const fromY = (svgY: number) => yMin + ((padT + plotH - svgY) / plotH) * yRange;

        const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
          const svg = svgRef.current;
          if (!svg) return;
          const rect = svg.getBoundingClientRect();
          const scaleX = W / Math.max(1, rect.width);
          const scaleY = H / Math.max(1, rect.height);
          const rawX = (e.clientX - rect.left) * scaleX;
          const rawY = (e.clientY - rect.top) * scaleY;
          if (rawX < padL || rawX > padL + plotW || rawY < padT || rawY > padT + plotH) return;
          const clickedPbr = Number(Math.max(0, fromX(rawX)).toFixed(2));
          const clickedRoe = Number(fromY(rawY).toFixed(1));
          setAnchorPoint({
            pbr: clickedPbr,
            roe: clickedRoe,
            label: `클릭 고정 (PBR ${clickedPbr}배, ROE ${clickedRoe}%)`,
          });
        };

        const handleSvgWheel = (e: React.WheelEvent<SVGSVGElement>) => {
          e.preventDefault();
          const step = e.deltaY < 0 ? 50 : -50;
          setZoomPercent((prev) => Math.max(100, Math.min(800, prev + step)));
        };

        const refPbr = 1.0;
        const refRoe = useRoe ? minRoe : 10.0;
        const refX = toX(refPbr);
        const refY = toY(refRoe);

        const xTicks = [0, 0.2, 0.4, 0.6, 0.8, 1.0].map((t) => Number((xMin + t * xRange).toFixed(2)));
        const yTicks = [0, 0.25, 0.5, 0.75, 1.0].map((t) => Number((yMin + t * yRange).toFixed(1)));

        const makeIsoLine = (slope: number) => {
          const pts: string[] = [];
          for (let step = 0; step <= 25; step++) {
            const px = xMin + (step / 25) * xRange;
            const py = slope * px;
            if (py >= yMin && py <= yMax) {
              pts.push(`${toX(px).toFixed(1)},${toY(py).toFixed(1)}`);
            }
          }
          return pts.join(' ');
        };
        const iso10Pts = makeIsoLine(10);
        const iso20Pts = makeIsoLine(20);

        const visibleItems = plotItems.filter((it: any) => {
          const px = Number(it.pbr) || 0;
          const py = Number(it.roe) || 0;
          return px >= xMin - xRange * 0.03 && px <= xMax + xRange * 0.03 && py >= yMin - yRange * 0.03 && py <= yMax + yRange * 0.03;
        });

        const anchorSvgX = toX(effectiveAnchor.pbr);
        const anchorSvgY = toY(effectiveAnchor.roe);
        const ZOOM_PRESETS = [100, 150, 200, 300, 400, 600];

        return (
          <div className="bg-[#111] border border-gray-800 p-5 rounded-xl shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white flex flex-wrap items-center gap-2">
                  <span>🎯 [X축: PBR (배) · Y축: ROE (%)] 섹터별 &amp; 배율 확대(100%~800%) 밸류에이션 산점도</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                    {selectedSector === 'ALL' ? `전체 섹터 (${filteredResults.length}종목)` : `[${selectedSector}] 섹터 단독 (${filteredResults.length}종목)`} · 현재 배율 {safeZoomPct}%
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  💡 <strong>클릭 고정 &amp; 배율 확대 사용법:</strong> 차트 위에서 <strong>확대하고 싶은 위치(또는 종목 점)를 마우스로 클릭해 기준점을 고정</strong>한 뒤, 상단 <strong>배율 버튼(100% ~ 600%)</strong>을 누르면 고정된 기준점을 중심으로 깔끔하게 확대됩니다.
                </p>
              </div>

              {/* 상단 배율(%) 표시 및 원클릭 배율 선택 바 */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1 bg-gray-900 border border-indigo-500/40 rounded-lg p-1.5">
                  <span className="text-indigo-300 font-extrabold px-1.5">🔍 확대 배율:</span>
                  {ZOOM_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setZoomPercent(pct)}
                      className={`px-2.5 py-1 rounded font-mono font-extrabold cursor-pointer transition ${
                        safeZoomPct === pct
                          ? 'bg-indigo-600 text-white shadow border border-indigo-300'
                          : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                  <div className="flex items-center gap-1 pl-1 border-l border-gray-700 ml-1">
                    <button
                      type="button"
                      onClick={() => setZoomPercent((p) => Math.max(100, p - 25))}
                      className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold cursor-pointer"
                      title="25% 축소"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={100}
                      max={800}
                      step={25}
                      value={safeZoomPct}
                      onChange={(e) => setZoomPercent(Math.max(100, Math.min(800, Number(e.target.value) || 100)))}
                      className="w-16 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-center font-mono font-extrabold text-emerald-300"
                    />
                    <span className="text-gray-400 font-mono">%</span>
                    <button
                      type="button"
                      onClick={() => setZoomPercent((p) => Math.min(800, p + 25))}
                      className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold cursor-pointer"
                      title="25% 확대"
                    >
                      +
                    </button>
                  </div>
                  {(safeZoomPct !== 100 || anchorPoint) && (
                    <button
                      type="button"
                      onClick={() => {
                        setZoomPercent(100);
                        setAnchorPoint(null);
                      }}
                      className="ml-1 px-2.5 py-1 rounded bg-amber-700/80 hover:bg-amber-600 text-white font-bold cursor-pointer"
                    >
                      🔄 100% 초기화
                    </button>
                  )}
                </div>

                {/* 현재 클릭 고정된 기준점(Anchor) 표시 배지 */}
                <div className="flex items-center gap-1.5 bg-gray-900 border border-amber-500/40 rounded-lg px-2.5 py-1.5">
                  <span className="text-amber-300 font-extrabold">📌 확대 기준점:</span>
                  <span className="font-mono font-bold text-white">
                    PBR {effectiveAnchor.pbr}배 · ROE {effectiveAnchor.roe}%
                  </span>
                  <span className="text-[11px] text-amber-200/80">
                    ({anchorPoint ? anchorPoint.label : '차트 클릭 시 위치 고정'})
                  </span>
                </div>

                <div className="flex items-center gap-1 bg-gray-900 border border-gray-700 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setColorMode('SECTOR')}
                    className={`px-2 py-1 rounded font-bold cursor-pointer ${
                      colorMode === 'SECTOR'
                        ? 'bg-purple-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    🎨 섹터별 색상구분
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorMode('ROE_STATUS')}
                    className={`px-2 py-1 rounded font-bold cursor-pointer ${
                      colorMode === 'ROE_STATUS'
                        ? 'bg-emerald-600 text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    🟢 ROE상태별 색상
                  </button>
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer text-emerald-300 font-bold">
                  <input
                    type="checkbox"
                    checked={showQoqTrajectory}
                    onChange={(e) => setShowQoqTrajectory(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>전분기 궤적선</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sky-300 font-bold">
                  <input
                    type="checkbox"
                    checked={showTopLabelsOnly}
                    onChange={(e) => setShowTopLabelsOnly(e.target.checked)}
                    className="accent-sky-500"
                  />
                  <span>{showTopLabelsOnly ? '주요 종목명' : '전체 종목명'}</span>
                </label>
              </div>
            </div>

            {/* 🏭 섹터별 필터 & 섹터별 단독 산점도 전환 바 */}
            <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-gray-400">
                <span className="font-bold text-gray-300">
                  🏭 섹터별 산점도 선택 (클릭 시 해당 섹터 종목만 산점도 &amp; 하단 리스트에 단독 플롯):
                </span>
                {selectedSector !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSector('ALL');
                      setZoomPercent(100);
                      setAnchorPoint(null);
                    }}
                    className="text-amber-300 hover:underline font-bold cursor-pointer"
                  >
                    ✕ 섹터 필터 해제 (전체 {results.length}종목 보기)
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSector('ALL');
                    setZoomPercent(100);
                    setAnchorPoint(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer border transition ${
                    selectedSector === 'ALL'
                      ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                      : 'bg-gray-950 text-gray-300 border-gray-700 hover:bg-gray-800'
                  }`}
                >
                  전체 섹터 ({results.length})
                </button>
                {sectorStats.map((sObj) => {
                  const isSel = selectedSector === sObj.sector;
                  return (
                    <button
                      key={sObj.sector}
                      type="button"
                      onClick={() => {
                        const nextSec = isSel ? 'ALL' : sObj.sector;
                        setSelectedSector(nextSec);
                        setZoomPercent(100);
                        setAnchorPoint(null);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer border transition flex items-center gap-1.5 ${
                        isSel
                          ? 'bg-indigo-950 text-white border-white shadow-md ring-1 ring-white/50'
                          : 'bg-gray-950/90 text-gray-200 border-gray-800 hover:border-gray-600 hover:bg-gray-800/80'
                      }`}
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: sObj.color }}
                      />
                      <span>{sObj.sector}</span>
                      <span className="text-[10px] font-mono text-gray-400">({sObj.count})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 범례 & 호버 종목 요약 바 (고정 높이 및 줄바꿈 방지로 마우스 호버 시 차트 위아래 흔들림 원천 차단) */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 text-xs bg-gray-900/80 border border-gray-800 rounded-lg px-3.5 py-2 min-h-[44px]">
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                {colorMode === 'SECTOR' ? (
                  <>
                    <span className="text-purple-300 font-bold">🎨 현재 색상: 섹터별 고유 색상</span>
                    <span className="text-gray-400 text-[11px]">
                      (위 섹터 버튼의 색상 점과 동일한 색으로 각 섹터 종목이 구분 표시됩니다)
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 border border-white/60" />
                      <span className="text-gray-200 font-bold">고ROE &amp; 전분기비 ROE↑</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-sky-400 border border-white/60" />
                      <span className="text-gray-200 font-bold">고ROE 유지</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400 border border-white/60" />
                      <span className="text-gray-200 font-bold">전분기비 ROE 개선주</span>
                    </span>
                  </>
                )}
              </div>

              <div className="h-7 flex items-center justify-end overflow-hidden">
                {hoveredStock ? (
                  <div className="flex items-center gap-2.5 font-mono text-xs bg-indigo-950/90 border border-indigo-400/60 px-3 py-1 rounded-lg whitespace-nowrap overflow-x-auto">
                    <span className="font-sans font-extrabold text-white">
                      {getStockName(hoveredStock)} ({hoveredStock.ticker})
                    </span>
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-sans font-bold text-slate-950"
                      style={{
                        backgroundColor:
                          sectorColorMap[String(hoveredStock.sector || '기타').trim() || '기타'] || '#38bdf8',
                      }}
                    >
                      {hoveredStock.sector || '기타'}
                    </span>
                    <span className="text-sky-300 font-bold">
                      PBR: {hoveredStock.prev_q_pbr}→{hoveredStock.pbr}배 ({hoveredStock.qoq_pbr_diff >= 0 ? `+${hoveredStock.qoq_pbr_diff}` : hoveredStock.qoq_pbr_diff})
                    </span>
                    <span className="text-emerald-300 font-bold">
                      ROE: {hoveredStock.prev_q_roe}→{hoveredStock.roe}% ({hoveredStock.qoq_roe_diff >= 0 ? `+${hoveredStock.qoq_roe_diff}` : hoveredStock.qoq_roe_diff}%p)
                    </span>
                    <span className="text-purple-300 font-bold">PER: {hoveredStock.per}배</span>
                    <span className="text-rose-300 font-bold">ROE/PBR: {hoveredStock.roe_pbr_ratio}</span>
                    {setGlobalSearchTicker && (
                      <button
                        type="button"
                        onClick={() => setGlobalSearchTicker(hoveredStock.ticker)}
                        className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-bold text-[10px] cursor-pointer"
                      >
                        리포트 이동 →
                      </button>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400 whitespace-nowrap">
                    💡 차트에서 원하는 곳(또는 종목 점)을 클릭해 기준점(📌)을 고정하고 상단 배율(100%~600%)로 확대하세요. (화면 내 {visibleItems.length}개 표시)
                  </span>
                )}
              </div>
            </div>

            <div className="relative w-full">
              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                onClick={handleSvgClick}
                onWheel={handleSvgWheel}
                onDoubleClick={() => {
                  setZoomPercent(100);
                  setAnchorPoint(null);
                }}
                className="w-full h-auto bg-[#070b12] rounded-xl border border-gray-800 select-none cursor-crosshair"
              >
                <defs>
                  <clipPath id="tetris-scatter-clip">
                    <rect x={padL} y={padT} width={plotW} height={plotH} />
                  </clipPath>
                </defs>

                {/* 좌상단 황금 사분면 (저PBR <= 1.0배 & 고ROE >= 기준선) 하이라이트 배경 */}
                {refX > padL && refY > padT && (
                  <rect
                    x={padL}
                    y={padT}
                    width={Math.max(0, Math.min(plotW, refX - padL))}
                    height={Math.max(0, Math.min(plotH, refY - padT))}
                    fill="rgba(16, 185, 129, 0.08)"
                    clipPath="url(#tetris-scatter-clip)"
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
                    clipPath="url(#tetris-scatter-clip)"
                  />
                )}
                {iso20Pts && (
                  <polyline
                    fill="none"
                    stroke="rgba(251, 191, 36, 0.32)"
                    strokeWidth="1.2"
                    strokeDasharray="3,3"
                    points={iso20Pts}
                    clipPath="url(#tetris-scatter-clip)"
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
                  ★ Sweet Spot (저PBR · 고ROE 핵심 발굴 영역) {selectedSector !== 'ALL' ? `— [${selectedSector}] 섹터` : ''}
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
                  X축: PBR (주가순자산비율, 배) — 왼쪽일수록 자산대비 저평가 (← 저PBR) [더블클릭 시 줌 초기화]
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
                <g clipPath="url(#tetris-scatter-clip)">
                  {visibleItems.map((it: any, idx: number) => {
                    const curX = toX(Number(it.pbr) || 0);
                    const curY = toY(Number(it.roe) || 0);
                    const prevX = toX(Number(it.prev_q_pbr) || Number(it.pbr) || 0);
                    const prevY = toY(Number(it.prev_q_roe) || Number(it.roe) || 0);

                    const isHovered = hoveredStock?.ticker === it.ticker;
                    const qoqRoe = Number(it.qoq_roe_diff) || 0;
                    const roeVal = Number(it.roe) || 0;
                    const secName = String(it.sector || '기타').trim() || '기타';

                    const dotColor =
                      colorMode === 'SECTOR'
                        ? sectorColorMap[secName] || '#38bdf8'
                        : roeVal >= 10 && qoqRoe >= 1.0
                        ? '#10b981'
                        : roeVal >= 10
                        ? '#38bdf8'
                        : '#f59e0b';

                    const radius = isHovered ? 8.5 : idx < 12 || visibleItems.length <= 35 ? 6.0 : 4.8;
                    const showLabel =
                      isHovered || !showTopLabelsOnly || visibleItems.length <= 40 || idx < 28;

                    return (
                      <g
                        key={it.ticker}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredStock(it)}
                        onMouseLeave={() => setHoveredStock(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          const pbrV = Number((Number(it.pbr) || 0).toFixed(2));
                          const roeV = Number((Number(it.roe) || 0).toFixed(1));
                          setAnchorPoint({
                            pbr: pbrV,
                            roe: roeV,
                            label: `${getStockName(it)} (${it.ticker})`,
                          });
                        }}
                      >
                        {/* 전분기(prev_q) -> 현재(cur) 이동 궤적 점선 */}
                        {(showQoqTrajectory || isHovered) &&
                          (Math.abs(curX - prevX) > 2 || Math.abs(curY - prevY) > 2) && (
                            <g opacity={isHovered ? 0.95 : 0.45} className="pointer-events-none">
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

                        {/* 마우스 히트 영역 고정용 투명 원 */}
                        <circle cx={curX} cy={curY} r={10} fill="transparent" />

                        {/* 현재 종목 위치 원 */}
                        <circle
                          cx={curX}
                          cy={curY}
                          r={radius}
                          fill={dotColor}
                          fillOpacity={isHovered ? 1.0 : 0.86}
                          stroke={isHovered ? '#ffffff' : '#0f172a'}
                          strokeWidth={isHovered ? '2.2' : '1.2'}
                          className="pointer-events-none"
                        />

                        {/* 종목명 라벨 */}
                        {showLabel && (
                          <text
                            x={curX + radius + 3}
                            y={curY + 3}
                            fill={isHovered ? '#ffffff' : idx < 12 ? '#a7f3d0' : '#cbd5e1'}
                            fontSize={isHovered ? '11.5' : '9.5'}
                            fontWeight={isHovered || idx < 12 ? 'bold' : 'normal'}
                            className="pointer-events-none"
                          >
                            {getStockName(it)}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* 클릭하여 고정된 확대 기준점(Anchor) 십자 표적 마커 */}
                  {anchorSvgX >= padL &&
                    anchorSvgX <= padL + plotW &&
                    anchorSvgY >= padT &&
                    anchorSvgY <= padT + plotH && (
                      <g className="pointer-events-none">
                        <line
                          x1={anchorSvgX - 14}
                          y1={anchorSvgY}
                          x2={anchorSvgX + 14}
                          y2={anchorSvgY}
                          stroke="#fbbf24"
                          strokeWidth="1.6"
                        />
                        <line
                          x1={anchorSvgX}
                          y1={anchorSvgY - 14}
                          x2={anchorSvgX}
                          y2={anchorSvgY + 14}
                          stroke="#fbbf24"
                          strokeWidth="1.6"
                        />
                        <circle
                          cx={anchorSvgX}
                          cy={anchorSvgY}
                          r={7}
                          fill="rgba(251, 191, 36, 0.18)"
                          stroke="#fbbf24"
                          strokeWidth="1.6"
                          strokeDasharray="3,2"
                        />
                      </g>
                    )}
                </g>
              </svg>
            </div>
          </div>
        );
      })()}

      {/* 검색 결과 테이블 */}
      <div className="bg-[#111] border border-gray-800 p-5 rounded-xl shadow-xl space-y-4 flex-1">
        <div className="flex flex-wrap justify-between items-center gap-2 border-b border-gray-800 pb-3">
          <h3 className="font-bold text-base text-white flex items-center gap-2">
            <span>📋 ROE/PBR 저평가·실적개선 발굴 종목 리스트 {selectedSector !== 'ALL' ? `([${selectedSector}] 섹터)` : ''}</span>
            <span className="text-xs bg-emerald-900/80 border border-emerald-500/40 text-emerald-200 px-3 py-0.5 rounded-full font-mono">
              총 {filteredResults.length}개 종목 발굴
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
                {filteredResults.map((item: any, idx: number) => {
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
