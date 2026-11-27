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

export default function TetrisScreenerView({
  setGlobalSearchTicker,
  globalStocks,
  stocks,
  initialSector,
  onNavigateSectorRS,
}: any) {
  // 1. ROE 및 전분기 대비(QoQ) ROE 증가(기울기 우상향) 결합 모드
  // HIGH_OR_UP: ROE가 높은 수준이거나(OR) 전분기 대비 ROE가 증가하는 종목
  // HIGH_AND_UP: ROE도 높고(AND) 전분기 대비 ROE도 증가하는 종목
  // GROWTH_UPWARD: 성장주 전용 — PBR 고평가 여부와 무관하게 ROE가 높은 수준이고 증감폭(기울기 ΔROE > 0)이 우상향인 종목만 채택하여 플롯
  const [roeFilterMode, setRoeFilterMode] = useState<'HIGH_OR_UP' | 'HIGH_AND_UP' | 'GROWTH_UPWARD'>('HIGH_OR_UP');
  const [onlyUpwardSlope, setOnlyUpwardSlope] = useState<boolean>(false);

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
  const [selectedSector, setSelectedSector] = useState<string>(initialSector || 'ALL');
  const [sectorTaxonomyMode, setSectorTaxonomyMode] = useState<'MAJOR' | 'SUB_SECTOR'>('MAJOR');
  const [bypassValuationFilters, setBypassValuationFilters] = useState<boolean>(false);
  const [stockSearchQuery, setStockSearchQuery] = useState<string>('');
  const [colorMode, setColorMode] = useState<'SECTOR' | 'ROE_STATUS'>('SECTOR');
  const [useMcapBubbleSize, setUseMcapBubbleSize] = useState<boolean>(true);
  const [sortBy, setSortBy] = useState<string>('NAME_ASC');
  const [turnaroundFilter, setTurnaroundFilter] = useState<
    'ALL' | 'TURNAROUND_PROFIT' | 'TURNAROUND_LOSS' | 'BOTH_REVERSAL'
  >('ALL');
  const [chartSizePct, setChartSizePct] = useState<number>(100); // 그래프 박스 크기 축소/확대 비율 (60% ~ 100%)

  type TableSortKey =
    | 'NAME'
    | 'SECTOR'
    | 'MARKET_CAP'
    | 'ROE'
    | 'QOQ_ROE_DIFF'
    | 'PBR'
    | 'QOQ_PBR_DIFF'
    | 'PER'
    | 'ROE_PBR_RATIO'
    | 'PRICE_GROWTH'
    | 'TAGS';
  const [tableSortKey, setTableSortKey] = useState<TableSortKey | null>('NAME');
  const [tableSortDir, setTableSortDir] = useState<'asc' | 'desc'>('asc');

  const handleTableSort = (key: TableSortKey) => {
    if (tableSortKey === key) {
      setTableSortDir((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setTableSortKey(key);
      // PBR, ΔPBR, PER, 종목명, 업종은 기본 오름차순(낮은 밸류/가나다 우선)이 직관적이나,
      // 사용자가 한 번씩 클릭할 때마다 내림차순/오름차순이 즉시 토글되도록 명확히 설정
      const defaultAscKeys: TableSortKey[] = ['NAME', 'SECTOR', 'PBR', 'PER'];
      setTableSortDir(defaultAscKeys.includes(key) ? 'asc' : 'desc');
    }
  };

  useEffect(() => {
    if (initialSector) {
      setSelectedSector(initialSector);
      setZoomPercent(100);
      setAnchorPoint(null);
    }
  }, [initialSector]);

  const [results, setResults] = useState<any[]>([]);
  const [universeResults, setUniverseResults] = useState<any[]>([]);
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
    only_upward_slope: onlyUpwardSlope || roeFilterMode === 'GROWTH_UPWARD',
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
    turnaround_filter: turnaroundFilter,
    bypass_valuation_filters: bypassValuationFilters,
    sort_by: sortBy,
  });

  const applyFilterConfigToState = (cfg: Record<string, any>) => {
    if (!cfg || typeof cfg !== 'object') return;
    if (cfg.roe_filter_mode) setRoeFilterMode(cfg.roe_filter_mode);
    if (cfg.only_upward_slope !== undefined) {
      setOnlyUpwardSlope(Boolean(cfg.only_upward_slope) || cfg.roe_filter_mode === 'GROWTH_UPWARD');
    }
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
    if (cfg.max_qoq_pbr_diff !== undefined) {
      // ΔPBR 상한이 음수(예: -0.5배)로 잘못 저장되어 있으면 96%의 종목이 사라지므로 최소 0.15배 이상으로 자동 보정
      const rawDiff = Number(cfg.max_qoq_pbr_diff);
      setMaxQoqPbrDiff(rawDiff < 0 ? 0.15 : rawDiff);
    }
    if (cfg.max_qoq_pbr_growth_pct !== undefined) {
      const rawGrowth = Number(cfg.max_qoq_pbr_growth_pct);
      setMaxQoqPbrGrowthPct(rawGrowth < 0 ? 15 : rawGrowth);
    }
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
      if (mounted) {
        // 전체 상장종목(2,473개) 유니버스를 백그라운드에서 함께 로드하여 64개 세부업종/31개 중분류 버튼과 전체 업종 종목수를 항상 누락 없이 표시
        fetch('/api/dart/screener', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bypass_valuation_filters: true, sort_by: 'NAME_ASC' }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((uData) => {
            if (mounted && uData?.success && Array.isArray(uData.results)) {
              setUniverseResults(uData.results);
            }
          })
          .catch(() => {});
      }
      if (mounted && loadedCfg) {
        // 사용자 요청: 디폴트 정렬을 종목명 가나다순(NAME_ASC)으로 유지하고, 음수 ΔPBR 상한(-0.5배 등)이 저장되어 82종목만 나오는 현상 자동 복구
        const fixedMaxPbrDiff =
          loadedCfg.max_qoq_pbr_diff !== undefined && Number(loadedCfg.max_qoq_pbr_diff) < 0
            ? 0.15
            : loadedCfg.max_qoq_pbr_diff;
        const cfgWithAlphabetDefault = {
          ...loadedCfg,
          max_qoq_pbr_diff: fixedMaxPbrDiff,
          sort_by: 'NAME_ASC',
        };
        applyFilterConfigToState(cfgWithAlphabetDefault);
        setTableSortKey('NAME');
        setTableSortDir('asc');
        await executeScreener(cfgWithAlphabetDefault);
      } else if (mounted) {
        setTableSortKey('NAME');
        setTableSortDir('asc');
        await executeScreener({ sort_by: 'NAME_ASC' });
      }
    };
    initFromSavedConfig();
    return () => {
      mounted = false;
    };
  }, []);

  const applyPreset = (
    preset: 'CORE_ROE_PBR' | 'QOQ_TURNAROUND' | 'DEEP_VALUE' | 'STRICT_BOTH' | 'GROWTH_UPWARD_SLOPE'
  ) => {
    if (preset === 'CORE_ROE_PBR') {
      // 핵심 기본: ROE 높거나(>=10%) 전분기 대비 증가(+1%p↑) & PBR 낮고(<=1.2배) 전분기 대비 PBR 미상승(<=+0.15배)
      setRoeFilterMode('HIGH_OR_UP');
      setOnlyUpwardSlope(false);
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
        only_upward_slope: false,
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
    } else if (preset === 'GROWTH_UPWARD_SLOPE') {
      // ★ 성장주 우상향 체크 모드:
      // PBR이 높다는 것은 시장에서 프리미엄 평가를 받는 것이므로 PBR 상한 및 ΔPBR 상한을 해제하고,
      // 하나의 기업에 대해 전분기(2025.3Q~2026.2Q 4Q합) 점과 현재분기(2025.4Q~2026.3Q 4Q합) 점을 동시에 표시하며
      // 절대 ROE가 10% 이상이면서 기울기(ΔROE = 현재분기 ROE - 전분기 ROE > 0)가 우상향인 종목만 추출하여 플로팅!
      setRoeFilterMode('GROWTH_UPWARD');
      setOnlyUpwardSlope(true);
      setUseRoe(true);
      setMinRoe(10);
      setMaxRoe(100);
      setUseQoqRoe(true);
      setMinQoqRoeDiff(0.1);
      setMinRoeFloorForQoq(10.0);
      setUsePbr(false);
      setMinPbr(0.15);
      setMaxPbr(20.0);
      setUseQoqPbrLimit(false);
      setUsePer(false);
      setUseRoePbrRatio(false);
      setShowQoqTrajectory(true);
      setSortBy('QOQ_ROE_DIFF');
      executeScreener({
        roe_filter_mode: 'GROWTH_UPWARD',
        only_upward_slope: true,
        use_roe: true,
        min_roe: 10,
        max_roe: 100,
        use_qoq_roe: true,
        min_qoq_roe_diff: 0.1,
        min_roe_floor_for_qoq: 10.0,
        use_pbr: false,
        min_pbr: 0.15,
        max_pbr: 20.0,
        use_qoq_pbr_limit: false,
        use_per: false,
        use_roe_pbr_ratio: false,
        sort_by: 'QOQ_ROE_DIFF',
      });
    } else if (preset === 'QOQ_TURNAROUND') {
      // 전분기 대비 ROE 급증(+2.5%p↑)했는데 PBR은 오히려 동결/하락(<=+0.05배)한 저평가 종목
      setRoeFilterMode('HIGH_OR_UP');
      setOnlyUpwardSlope(false);
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
        only_upward_slope: false,
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
      setOnlyUpwardSlope(false);
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
        only_upward_slope: false,
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
      setOnlyUpwardSlope(true);
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
        only_upward_slope: true,
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

  // 섹터(중분류 31개 vs 거래소 세부업종 64개) 기준 종목 수 집계 및 섹터 필터링된 결과
  const getItemSectorLabel = (it: any) => {
    if (sectorTaxonomyMode === 'SUB_SECTOR') {
      return String(it?.sub_sector || it?.sector || '기타').trim() || '기타';
    }
    return String(it?.sector || '기타').trim() || '기타';
  };

  const sectorStats = useMemo(() => {
    const matchedCounts: Record<string, number> = {};
    const totalCounts: Record<string, number> = {};

    const universeSource = universeResults.length > 0 ? universeResults : results;
    universeSource.forEach((it: any) => {
      const sec = getItemSectorLabel(it);
      totalCounts[sec] = (totalCounts[sec] || 0) + 1;
    });
    results.forEach((it: any) => {
      const sec = getItemSectorLabel(it);
      matchedCounts[sec] = (matchedCounts[sec] || 0) + 1;
    });

    const allSectors = Array.from(new Set([...Object.keys(totalCounts), ...Object.keys(matchedCounts)]));
    return allSectors
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((sector, idx) => ({
        sector,
        count: matchedCounts[sector] || 0,
        totalCount: totalCounts[sector] || matchedCounts[sector] || 0,
        color: getSectorColor(sector, idx),
      }));
  }, [results, universeResults, sectorTaxonomyMode]);

  const sectorColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    sectorStats.forEach((s) => {
      map[s.sector] = s.color;
    });
    return map;
  }, [sectorStats]);

  const filteredResults = useMemo(() => {
    let base = [...results];
    if (selectedSector && selectedSector !== 'ALL') {
      base = base.filter(
        (it: any) =>
          getItemSectorLabel(it) === selectedSector ||
          String(it.sector || '').trim() === selectedSector ||
          String(it.sub_sector || '').trim() === selectedSector
      );
    }
    if (stockSearchQuery.trim()) {
      const q = stockSearchQuery.trim().toLowerCase();
      base = base.filter(
        (it: any) =>
          String(getStockName(it) || '').toLowerCase().includes(q) ||
          String(it.ticker || '').toLowerCase().includes(q) ||
          String(it.sub_sector || '').toLowerCase().includes(q) ||
          String(it.business_desc || '').toLowerCase().includes(q)
      );
    }
    if (turnaroundFilter === 'TURNAROUND_PROFIT') {
      base = base.filter(
        (it: any) =>
          it.roe_turnaround_type === 'TURNAROUND_PROFIT' ||
          (Number(it.prev_q_roe) < 0 && Number(it.roe) > 0)
      );
    } else if (turnaroundFilter === 'TURNAROUND_LOSS') {
      base = base.filter(
        (it: any) =>
          it.roe_turnaround_type === 'TURNAROUND_LOSS' ||
          (Number(it.prev_q_roe) > 0 && Number(it.roe) < 0)
      );
    } else if (turnaroundFilter === 'BOTH_REVERSAL') {
      base = base.filter(
        (it: any) =>
          it.roe_turnaround_type === 'TURNAROUND_PROFIT' ||
          it.roe_turnaround_type === 'TURNAROUND_LOSS' ||
          (Number(it.prev_q_roe) < 0 && Number(it.roe) > 0) ||
          (Number(it.prev_q_roe) > 0 && Number(it.roe) < 0)
      );
    }
    if (
      !bypassValuationFilters &&
      (onlyUpwardSlope || roeFilterMode === 'GROWTH_UPWARD') &&
      turnaroundFilter !== 'TURNAROUND_LOSS' &&
      turnaroundFilter !== 'BOTH_REVERSAL'
    ) {
      const floorRoe = useRoe ? minRoe : 10.0;
      const minSlope = useQoqRoe && minQoqRoeDiff > 0 ? minQoqRoeDiff : 0.01;
      base = base.filter(
        (it: any) =>
          Number(it.roe || 0) >= floorRoe &&
          Number(it.qoq_roe_diff || 0) >= minSlope &&
          Number(it.qoq_roe_diff || 0) > 0
      );
    }

    if (tableSortKey) {
      const dir = tableSortDir === 'asc' ? 1 : -1;
      base.sort((a: any, b: any) => {
        switch (tableSortKey) {
          case 'NAME':
            return String(getStockName(a) || '').localeCompare(String(getStockName(b) || ''), 'ko') * dir;
          case 'SECTOR': {
            const sa = `${a.market || ''} ${a.sector || ''}`;
            const sb = `${b.market || ''} ${b.sector || ''}`;
            return sa.localeCompare(sb, 'ko') * dir;
          }
          case 'MARKET_CAP':
            return (Number(a.market_cap_eok ?? a.price ?? 0) - Number(b.market_cap_eok ?? b.price ?? 0)) * dir;
          case 'ROE':
            return (Number(a.roe ?? -9999) - Number(b.roe ?? -9999)) * dir;
          case 'QOQ_ROE_DIFF':
            return (Number(a.qoq_roe_diff ?? -9999) - Number(b.qoq_roe_diff ?? -9999)) * dir;
          case 'PBR':
            return (Number(a.pbr ?? 9999) - Number(b.pbr ?? 9999)) * dir;
          case 'QOQ_PBR_DIFF':
            return (Number(a.qoq_pbr_diff ?? 9999) - Number(b.qoq_pbr_diff ?? 9999)) * dir;
          case 'PER': {
            const pa = Number(a.per) > 0 ? Number(a.per) : 999999;
            const pb = Number(b.per) > 0 ? Number(b.per) : 999999;
            return (pa - pb) * dir;
          }
          case 'ROE_PBR_RATIO':
            return (Number(a.roe_pbr_ratio ?? -9999) - Number(b.roe_pbr_ratio ?? -9999)) * dir;
          case 'PRICE_GROWTH':
            return (Number(a.qoq_price_growth_pct ?? -9999) - Number(b.qoq_price_growth_pct ?? -9999)) * dir;
          case 'TAGS': {
            const ta = (a.selection_tags || []).join(' ');
            const tb = (b.selection_tags || []).join(' ');
            return ta.localeCompare(tb, 'ko') * dir;
          }
          default:
            return 0;
        }
      });
    }

    return base;
  }, [
    results,
    selectedSector,
    turnaroundFilter,
    onlyUpwardSlope,
    roeFilterMode,
    useRoe,
    minRoe,
    useQoqRoe,
    minQoqRoeDiff,
    tableSortKey,
    tableSortDir,
    sectorTaxonomyMode,
    bypassValuationFilters,
    stockSearchQuery,
  ]);

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
          {onNavigateSectorRS && (
            <button
              type="button"
              onClick={() => onNavigateSectorRS()}
              className="bg-rose-950/90 hover:bg-rose-900 text-rose-200 font-extrabold py-2.5 px-4 rounded-xl transition-all shadow-lg border border-rose-400/60 active:scale-95 flex items-center gap-1.5 cursor-pointer text-xs sm:text-sm"
              title="시장지수 대비 섹터별 지수 추이 및 최강 주도 섹터 / 약세 섹터 상대강도를 먼저 판별합니다"
            >
              <span>📈</span>
              <span>섹터 상대강도(RS) 추이 차트 보기</span>
            </button>
          )}
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
            🎯 [저평가 가치주] 고ROE(≥10%) 또는 전분기 ROE↑ + 저PBR(≤1.2배)
          </button>
          <button
            type="button"
            onClick={() => applyPreset('GROWTH_UPWARD_SLOPE')}
            className="px-3 py-1.5 rounded-lg bg-rose-950/90 hover:bg-rose-900 border border-rose-400/70 text-rose-200 font-extrabold cursor-pointer transition shadow-md"
          >
            📈 [성장주 우상향 전용] 전분기(25.3Q~26.2Q)→현재(25.4Q~26.3Q) 동시표시 · ROE≥10% &amp; 기울기 우상향(ΔROE&gt;0)만 추출
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
              if (s === 'NAME_ASC') {
                setTableSortKey('NAME');
                setTableSortDir('asc');
              } else if (s === 'ROE_PBR_RATIO') {
                setTableSortKey('ROE_PBR_RATIO');
                setTableSortDir('desc');
              } else if (s === 'QOQ_ROE_DIFF') {
                setTableSortKey('QOQ_ROE_DIFF');
                setTableSortDir('desc');
              } else if (s === 'ROE_DESC') {
                setTableSortKey('ROE');
                setTableSortDir('desc');
              } else if (s === 'PBR_ASC') {
                setTableSortKey('PBR');
                setTableSortDir('asc');
              } else if (s === 'PER_ASC') {
                setTableSortKey('PER');
                setTableSortDir('asc');
              }
              executeScreener({ sort_by: s });
            }}
            className="bg-gray-900 border border-gray-700 rounded-lg px-2.5 py-1.5 text-emerald-300 font-bold"
          >
            <option value="NAME_ASC">정렬: 종목명 가나다순 (기본)</option>
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
            <div className="flex flex-wrap items-center gap-2 text-xs bg-gray-900/90 border border-gray-700 rounded-lg px-3 py-1">
              <span className="text-gray-300 font-bold">ROE 조건 결합방식:</span>
              <label className="flex items-center gap-1 cursor-pointer text-emerald-300 font-bold">
                <input
                  type="radio"
                  name="roeMode"
                  checked={roeFilterMode === 'HIGH_OR_UP' && !onlyUpwardSlope}
                  onChange={() => {
                    setRoeFilterMode('HIGH_OR_UP');
                    setOnlyUpwardSlope(false);
                  }}
                  className="accent-emerald-500"
                />
                <span>고ROE 이거나(OR) 전분기 대비 ROE 증가</span>
              </label>
              <span className="text-gray-600">|</span>
              <label className="flex items-center gap-1 cursor-pointer text-indigo-300 font-bold">
                <input
                  type="radio"
                  name="roeMode"
                  checked={roeFilterMode === 'HIGH_AND_UP' && !onlyUpwardSlope}
                  onChange={() => {
                    setRoeFilterMode('HIGH_AND_UP');
                    setOnlyUpwardSlope(false);
                  }}
                  className="accent-indigo-500"
                />
                <span>고ROE 이면서 동시에(AND) 전분기 대비 증가</span>
              </label>
              <span className="text-gray-600">|</span>
              <label
                className="flex items-center gap-1 cursor-pointer text-rose-300 font-extrabold"
                title="PBR이 높은 성장주도 시장 평가를 인정하여 PBR 상한을 해제하고, 오직 ROE가 높은 수준이고 증감폭(기울기 ΔROE)이 우상향인 종목만 채택하여 산점도에 플롯합니다."
              >
                <input
                  type="radio"
                  name="roeMode"
                  checked={roeFilterMode === 'GROWTH_UPWARD' || onlyUpwardSlope}
                  onChange={() => {
                    setRoeFilterMode('GROWTH_UPWARD');
                    setOnlyUpwardSlope(true);
                    setUseRoe(true);
                    setMinRoe(10);
                    setUseQoqRoe(true);
                    setMinQoqRoeDiff(0.1);
                    setMinRoeFloorForQoq(10.0);
                    setUsePbr(false);
                    setUseQoqPbrLimit(false);
                    setUsePer(false);
                    setUseRoePbrRatio(false);
                    setShowQoqTrajectory(true);
                    executeScreener({
                      roe_filter_mode: 'GROWTH_UPWARD',
                      only_upward_slope: true,
                      use_roe: true,
                      min_roe: 10,
                      use_qoq_roe: true,
                      min_qoq_roe_diff: 0.1,
                      min_roe_floor_for_qoq: 10.0,
                      use_pbr: false,
                      use_qoq_pbr_limit: false,
                      use_per: false,
                      use_roe_pbr_ratio: false,
                    });
                  }}
                  className="accent-rose-500"
                />
                <span>📈 [성장주 우상향] 전분기(25.3Q~26.2Q)→현재(25.4Q~26.3Q) 동시표시 · ROE≥10% &amp; 우상향(ΔROE&gt;0)만 추출</span>
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
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${useRoe
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
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${useQoqRoe
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
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${usePbr
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
                <span>③ PBR 수준 (배) 범위 {onlyUpwardSlope ? '(고PBR 성장주 허용)' : ''}</span>
              </label>
              <span className="font-mono text-sky-300 font-bold">
                {usePbr ? `${minPbr}배 ~ ${maxPbr}배 이하` : '제한 없음 (전 구간)'}
              </span>
            </div>
            <p className="text-[11px] text-gray-400">
              {onlyUpwardSlope
                ? '성장주 우상향 모드에서는 고PBR 프리미엄 종목도 모두 포함됩니다 (원할 때만 체크)'
                : '순자산(BPS) 대비 주가 멀티플(PBR) 범위 필터'}
            </p>
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="w-12 text-[11px] text-gray-400">최소:</span>
                <input
                  type="range"
                  min="0.05"
                  max="3.0"
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
                  max="20.0"
                  step="0.2"
                  value={maxPbr}
                  disabled={!usePbr}
                  onChange={(e) => setMaxPbr(Number(e.target.value))}
                  className="w-full accent-sky-500"
                />
                <input
                  type="number"
                  step="0.2"
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
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${useQoqPbrLimit
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
                  min="0"
                  max="3.0"
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
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${usePer
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
            className={`p-3.5 rounded-lg border transition-all space-y-2 ${useRoePbrRatio || usePriceChange
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
        const H = 500;
        const padL = 68;
        const padR = 36;
        const padT = 76; // 차트 내부 상단에 데이터 포인트와 절대 겹치지 않는 전용 호버 정보 표시 영역 확보
        const padB = 50;
        const plotW = W - padL - padR;
        const plotH = H - padT - padB;

        const plotItems = filteredResults.slice(0, 220);
        const isDualTrajectoryActive = showQoqTrajectory || onlyUpwardSlope || roeFilterMode === 'GROWTH_UPWARD';

        // 현재분기(25.4Q~26.3Q) 위치(pbr, roe)와 전분기(25.3Q~26.2Q) 위치(prev_q_pbr, prev_q_roe)를 동시에 표시하되,
        // 전분기 극단적 적자(-168% ROE 등) 때문에 축이 찌그러지지 않도록 정상 범위(-15% 이상)의 전분기 점을 기본 축에 함께 포함
        const curPbrVals = plotItems.map((it: any) => Number(it.pbr) || 0).filter((v) => v > 0);
        const prevPbrVals = isDualTrajectoryActive
          ? plotItems.map((it: any) => Number(it.prev_q_pbr) || 0).filter((v) => v > 0 && v <= 25)
          : [];
        const allXForAxis = [...curPbrVals, ...prevPbrVals];

        const curRoeVals = plotItems.map((it: any) => Number(it.roe) || 0);
        const prevRoeVals = isDualTrajectoryActive
          ? plotItems.map((it: any) => Number(it.prev_q_roe) || 0).filter((v) => v >= -15 && v <= 120)
          : [];
        const allYForAxis = [...curRoeVals, ...prevRoeVals];

        const minXRaw = allXForAxis.length ? Math.min(...allXForAxis, 0.15) : 0.1;
        const maxXRaw = allXForAxis.length ? Math.max(...allXForAxis, 1.05) : 1.5;
        const defaultXMin = Math.max(0, Number((minXRaw - 0.06).toFixed(2)));
        const defaultXMax = Number((maxXRaw + Math.max(0.1, (maxXRaw - minXRaw) * 0.1)).toFixed(2));

        const minYRaw = allYForAxis.length ? Math.min(...allYForAxis, 4) : 0;
        const maxYRaw = allYForAxis.length ? Math.max(...allYForAxis, 22) : 35;
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
        const safeZoomPct = Math.max(40, Math.min(1000, zoomPercent));
        const scaleFactor = 100 / safeZoomPct;

        let xMin = defaultXMin;
        let xMax = defaultXMax;
        let yMin = defaultYMin;
        let yMax = defaultYMax;

        if (safeZoomPct !== 100) {
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

        const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
          const svg = svgRef.current;
          if (!svg || visibleItems.length === 0) return;
          const rect = svg.getBoundingClientRect();
          const scaleX = W / Math.max(1, rect.width);
          const scaleY = H / Math.max(1, rect.height);
          const mx = (e.clientX - rect.left) * scaleX;
          const my = (e.clientY - rect.top) * scaleY;
          if (mx < padL || mx > padL + plotW || my < padT || my > padT + plotH) {
            if (hoveredStock !== null) setHoveredStock(null);
            return;
          }

        // 🔵 시가총액(억원) 크기에 비례하는 원(버블) 반지름 계산 함수 (로그 스케일 + 제곱근 보정으로 500억~500조 전 구간 직관적 구분)
        const getBubbleRadius = (it: any, isHov: boolean, isSpecial: boolean, idxHint: number) => {
          if (!useMcapBubbleSize) {
            return isHov
              ? 9.0
              : isSpecial
                ? 6.8
                : idxHint < 12 || visibleItems.length <= 35
                  ? 6.0
                  : 4.8;
          }
          const mcapEok = Math.max(100, Number(it?.market_cap_eok) || 500);
          // log10(100억=2.0) ~ log10(1,000,000억[100조]=6.0)
          const logVal = Math.log10(mcapEok);
          const norm = Math.max(0, Math.min(1, (logVal - 2.3) / 3.4)); // 200억(0.0) ~ 50조+(1.0)
          const baseR = 4.2 + Math.pow(norm, 1.15) * 16.5; // 반지름 4.2px ~ 20.7px
          return isHov ? baseR + 2.5 : baseR;
        };

        let nearest: any = null;
        let minDistSq = 24 * 24; // 버블 반경 및 중심 기준 가장 가까운 종목 탐색
        for (let i = 0; i < visibleItems.length; i++) {
          const it = visibleItems[i];
          const cx = toX(Number(it.pbr) || 0);
          const cy = toY(Number(it.roe) || 0);
          const rBub = getBubbleRadius(it, false, false, i);
          const hitRadius = Math.max(18, rBub + 4);
          const dSq = (mx - cx) * (mx - cx) + (my - cy) * (my - cy);
          if (dSq <= hitRadius * hitRadius && dSq < minDistSq) {
            minDistSq = dSq;
            nearest = it;
          }
        }

          // 히스테리시스(Hysteresis): 이미 호버 중인 종목이 반경 20px 이내에 있고 새 종목과의 거리 차이가 미세하면 기존 종목을 유지하여 떨림(Jitter) 방지
          if (hoveredStock && nearest && hoveredStock.ticker !== nearest.ticker) {
            const curHovX = toX(Number(hoveredStock.pbr) || 0);
            const curHovY = toY(Number(hoveredStock.roe) || 0);
            const curDistSq = (mx - curHovX) * (mx - curHovX) + (my - curHovY) * (my - curHovY);
            if (curDistSq <= 20 * 20 && Math.sqrt(curDistSq) - Math.sqrt(minDistSq) < 3.5) {
              return;
            }
          }

          if ((nearest?.ticker || null) !== (hoveredStock?.ticker || null)) {
            setHoveredStock(nearest);
          }
        };

        const handleSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
          const svg = svgRef.current;
          if (!svg) return;
          const rect = svg.getBoundingClientRect();
          const scaleX = W / Math.max(1, rect.width);
          const scaleY = H / Math.max(1, rect.height);
          const rawX = (e.clientX - rect.left) * scaleX;
          const rawY = (e.clientY - rect.top) * scaleY;
          if (rawX < padL || rawX > padL + plotW || rawY < padT || rawY > padT + plotH) return;

          // 클릭 시점의 마우스 좌표에서 가장 가까운 종목(반경 20px 이내) 또는 현재 호버 종목이 있으면 종목조회(search) 화면으로 즉시 이동
          let clickedStock = hoveredStock;
          if (!clickedStock && visibleItems.length > 0) {
            let minDistSq = 20 * 20;
            for (let i = 0; i < visibleItems.length; i++) {
              const it = visibleItems[i];
              const cx = toX(Number(it.pbr) || 0);
              const cy = toY(Number(it.roe) || 0);
              const dSq = (rawX - cx) * (rawX - cx) + (rawY - cy) * (rawY - cy);
              if (dSq < minDistSq) {
                minDistSq = dSq;
                clickedStock = it;
              }
            }
          }

          if (clickedStock) {
            if (setGlobalSearchTicker) {
              setGlobalSearchTicker(clickedStock.ticker);
            }
            return;
          }

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
          const step = e.deltaY < 0 ? 25 : -25;
          setZoomPercent((prev) => Math.max(40, Math.min(800, prev + step)));
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

        // 🔵 시가총액 원(버블) 반지름 계산 (마우스 호버, 라벨 충돌 검사, SVG 원 렌더링 공용)
        const calcStockRadius = (it: any, isHov: boolean, isSpecial: boolean, idxHint: number) => {
          if (!useMcapBubbleSize) {
            return isHov
              ? 9.0
              : isSpecial
                ? 6.8
                : idxHint < 12 || visibleItems.length <= 35
                  ? 6.0
                  : 4.8;
          }
          const mcapEok = Math.max(100, Number(it?.market_cap_eok) || 500);
          const logVal = Math.log10(mcapEok);
          const norm = Math.max(0, Math.min(1, (logVal - 2.3) / 3.4)); // 200억(0.0) ~ 50조+(1.0)
          const baseR = 4.2 + Math.pow(norm, 1.15) * 16.5; // 반지름 4.2px ~ 20.7px
          return Number((isHov ? baseR + 2.5 : baseR).toFixed(1));
        };

        // 🚫 차트 내 주요 종목 라벨 글씨 겹침 방지 충돌 검사 (시가총액 큰 종목 또는 상위 종목 우선 라벨 배치)
        const placedLabelBoxes: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
        const nonOverlappingLabelTickers = new Set<string>();
        const labelCandidates = useMcapBubbleSize
          ? [...visibleItems].sort((a: any, b: any) => (Number(b.market_cap_eok) || 0) - (Number(a.market_cap_eok) || 0))
          : visibleItems;
        labelCandidates.forEach((it: any, idx: number) => {
          const isCandidate = !showTopLabelsOnly || visibleItems.length <= 28 || idx < 26;
          if (!isCandidate) return;
          const cx = toX(Number(it.pbr) || 0);
          const cy = toY(Number(it.roe) || 0);
          const rBub = calcStockRadius(it, false, false, idx);
          const nameStr = getStockName(it);
          const estW = Math.max(54, nameStr.length * 12.5 + 16);
          const estH = 18;
          const bx1 = cx + rBub + 5;
          const by1 = cy - 10;
          const bx2 = bx1 + estW;
          const by2 = by1 + estH;
          const hasCollision = placedLabelBoxes.some(
            (b) => !(bx2 < b.x1 || bx1 > b.x2 || by2 < b.y1 || by1 > b.y2)
          );
          if (!hasCollision) {
            placedLabelBoxes.push({ x1: bx1, y1: by1, x2: bx2, y2: by2 });
            nonOverlappingLabelTickers.add(it.ticker);
          }
        });

        // 큰 시가총액 버블이 작은 버블을 가리지 않도록 큰 원부터 먼저 그리고 작은 원을 위에 그리되, 호버된 종목은 맨 위에 렌더링
        const renderOrderedItems = [...visibleItems].sort((a: any, b: any) => {
          if (hoveredStock?.ticker === a.ticker) return 1;
          if (hoveredStock?.ticker === b.ticker) return -1;
          if (useMcapBubbleSize) {
            return (Number(b.market_cap_eok) || 0) - (Number(a.market_cap_eok) || 0);
          }
          return 0;
        });

        const anchorSvgX = toX(effectiveAnchor.pbr);
        const anchorSvgY = toY(effectiveAnchor.roe);
        const ZOOM_PRESETS = [50, 75, 100, 150, 200, 300, 400, 600];
        const SIZE_PRESETS = [65, 75, 85, 100];

        return (
          <div className="bg-[#111] border border-gray-800 p-5 rounded-xl shadow-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 pb-3">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-white flex flex-wrap items-center gap-2">
                  <span>🎯 [X축: PBR (배) · Y축: ROE (%)] 섹터별 &amp; 배율 축소·확대(40%~800%) 밸류에이션 산점도</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-300 text-xs font-mono">
                    {selectedSector === 'ALL' ? `전체 섹터 (${filteredResults.length}종목)` : `[${selectedSector}] 섹터 단독 (${filteredResults.length}종목)`} · 배율 {safeZoomPct}% · 그래프크기 {chartSizePct}%
                  </span>
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  💡 <strong>축소/확대 &amp; 그래프 크기 조정:</strong> <strong>축소/확대 배율(50% ~ 600%)</strong>로 좌표 시야를 넓히거나 확대할 수 있으며, 우측 <strong>[📐 그래프 크기: 65%~100%]</strong>로 차트 화면 자체의 크기를 한눈에 들어오게 줄일 수 있습니다.
                </p>
              </div>

              {/* 상단 배율(%) 축소·확대 및 그래프 화면 크기 선택 바 */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1 bg-gray-900 border border-indigo-500/40 rounded-lg p-1.5">
                  <span className="text-indigo-300 font-extrabold px-1.5">🔍 축소/확대 배율:</span>
                  {ZOOM_PRESETS.map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setZoomPercent(pct)}
                      className={`px-2 py-1 rounded font-mono font-extrabold cursor-pointer transition ${safeZoomPct === pct
                        ? 'bg-indigo-600 text-white shadow border border-indigo-300'
                        : pct < 100
                          ? 'bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-500/30'
                          : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                        }`}
                    >
                      {pct}%
                    </button>
                  ))}
                  <div className="flex items-center gap-1 pl-1 border-l border-gray-700 ml-1">
                    <button
                      type="button"
                      onClick={() => setZoomPercent((p) => Math.max(40, p - 15))}
                      className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold cursor-pointer"
                      title="15% 축소"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={40}
                      max={800}
                      step={10}
                      value={safeZoomPct}
                      onChange={(e) => setZoomPercent(Math.max(40, Math.min(800, Number(e.target.value) || 100)))}
                      className="w-16 bg-gray-950 border border-gray-700 rounded px-1.5 py-0.5 text-center font-mono font-extrabold text-emerald-300"
                    />
                    <span className="text-gray-400 font-mono">%</span>
                    <button
                      type="button"
                      onClick={() => setZoomPercent((p) => Math.min(800, p + 15))}
                      className="px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 text-gray-200 font-bold cursor-pointer"
                      title="15% 확대"
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
                      className="ml-1 px-2 py-1 rounded bg-amber-700/80 hover:bg-amber-600 text-white font-bold cursor-pointer"
                    >
                      🔄 100% 초기화
                    </button>
                  )}
                </div>

                {/* 📐 그래프 화면 크기(박스 비율) 축소/확대 컨트롤 */}
                <div className="flex items-center gap-1 bg-gray-900 border border-teal-500/40 rounded-lg p-1.5">
                  <span className="text-teal-300 font-extrabold px-1">📐 그래프 크기:</span>
                  {SIZE_PRESETS.map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      onClick={() => setChartSizePct(sz)}
                      className={`px-2 py-1 rounded font-mono font-extrabold cursor-pointer transition ${chartSizePct === sz
                        ? 'bg-teal-600 text-white shadow border border-teal-300'
                        : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
                        }`}
                    >
                      {sz}%
                    </button>
                  ))}
                  <input
                    type="number"
                    min={50}
                    max={100}
                    step={5}
                    value={chartSizePct}
                    onChange={(e) => setChartSizePct(Math.max(50, Math.min(100, Number(e.target.value) || 100)))}
                    className="w-14 bg-gray-950 border border-gray-700 rounded px-1 py-0.5 text-center font-mono font-extrabold text-teal-300 ml-0.5"
                    title="그래프 화면 표시 크기 비율 (50%~100%)"
                  />
                  <span className="text-gray-400 font-mono">%</span>
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
                    className={`px-2 py-1 rounded font-bold cursor-pointer ${colorMode === 'SECTOR'
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    🎨 섹터별 색상구분
                  </button>
                  <button
                    type="button"
                    onClick={() => setColorMode('ROE_STATUS')}
                    className={`px-2 py-1 rounded font-bold cursor-pointer ${colorMode === 'ROE_STATUS'
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    🟢 ROE상태별 색상
                  </button>
                </div>

                <label
                  className="flex items-center gap-1.5 cursor-pointer text-amber-200 font-extrabold bg-amber-950/60 border border-amber-500/50 rounded-lg px-2.5 py-1"
                  title="각 종목 원(●)의 크기를 시가총액(억원) 규모에 비례하는 버블 크기로 표시합니다"
                >
                  <input
                    type="checkbox"
                    checked={useMcapBubbleSize}
                    onChange={(e) => setUseMcapBubbleSize(e.target.checked)}
                    className="accent-amber-400"
                  />
                  <span>🔵 시가총액 크기 원(버블)</span>
                </label>
                {useMcapBubbleSize && (
                  <div className="hidden 2xl:flex items-center gap-2 text-[11px] text-gray-300 bg-gray-900/90 border border-gray-700 rounded-lg px-2.5 py-1 font-mono">
                    <span className="text-amber-300 font-sans font-bold">원 크기(시총):</span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-sky-400/80 border border-white/60" />
                      <span>1천억</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-3 h-3 rounded-full bg-sky-400/80 border border-white/60" />
                      <span>1조</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="inline-block w-4 h-4 rounded-full bg-sky-400/80 border border-white/60" />
                      <span>10조+</span>
                    </span>
                  </div>
                )}

                <label className="flex items-center gap-1.5 cursor-pointer text-rose-300 font-extrabold bg-rose-950/60 border border-rose-500/50 rounded-lg px-2.5 py-1">
                  <input
                    type="checkbox"
                    checked={onlyUpwardSlope || roeFilterMode === 'GROWTH_UPWARD'}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setOnlyUpwardSlope(checked);
                      if (checked) {
                        setRoeFilterMode('GROWTH_UPWARD');
                        setShowQoqTrajectory(true);
                      } else {
                        setRoeFilterMode('HIGH_OR_UP');
                      }
                    }}
                    className="accent-rose-500"
                  />
                  <span>📈 고ROE &amp; 기울기 우상향(ΔROE&gt;0)만 플롯</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-emerald-300 font-bold">
                  <input
                    type="checkbox"
                    checked={showQoqTrajectory}
                    onChange={(e) => setShowQoqTrajectory(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>전분기→현재 기울기 화살표</span>
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

                {/* 🔥 ROE 기울기 적자↔흑자 반전 전용 차별화 필터 버튼 그룹 */}
                <div className="flex flex-wrap items-center gap-1 bg-gray-900 border border-amber-500/40 rounded-lg p-1">
                  <span className="text-amber-300 font-extrabold px-1.5">⚡ ROE 흑자·적자 반전 구분:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTurnaroundFilter('ALL');
                      executeScreener({ turnaround_filter: 'ALL' });
                    }}
                    className={`px-2 py-1 rounded font-bold cursor-pointer transition ${turnaroundFilter === 'ALL'
                      ? 'bg-gray-700 text-white border border-gray-400'
                      : 'text-gray-400 hover:text-white'
                      }`}
                  >
                    전체
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = turnaroundFilter === 'TURNAROUND_PROFIT' ? 'ALL' : 'TURNAROUND_PROFIT';
                      setTurnaroundFilter(next);
                      setShowQoqTrajectory(true);
                      executeScreener({ turnaround_filter: next });
                    }}
                    className={`px-2.5 py-1 rounded font-extrabold cursor-pointer transition flex items-center gap-1 ${turnaroundFilter === 'TURNAROUND_PROFIT'
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-md ring-1 ring-yellow-200'
                      : 'bg-amber-950/80 text-amber-300 border border-amber-500/50 hover:bg-amber-900'
                      }`}
                    title="전분기 적자(ROE < 0)에서 현재분기 흑자(ROE > 0)로 돌아선 턴어라운드 종목만 필터링합니다"
                  >
                    <span>🔥 적자→흑자 전환</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = turnaroundFilter === 'TURNAROUND_LOSS' ? 'ALL' : 'TURNAROUND_LOSS';
                      setTurnaroundFilter(next);
                      setShowQoqTrajectory(true);
                      executeScreener({ turnaround_filter: next });
                    }}
                    className={`px-2.5 py-1 rounded font-extrabold cursor-pointer transition flex items-center gap-1 ${turnaroundFilter === 'TURNAROUND_LOSS'
                      ? 'bg-gradient-to-r from-fuchsia-600 to-rose-600 text-white shadow-md ring-1 ring-fuchsia-300'
                      : 'bg-fuchsia-950/80 text-fuchsia-300 border border-fuchsia-500/50 hover:bg-fuchsia-900'
                      }`}
                    title="전분기 흑자(ROE > 0)에서 현재분기 적자(ROE < 0)로 반전한 실적 악화 주의 종목만 필터링합니다"
                  >
                    <span>⚠️ 흑자→적자 반전</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next = turnaroundFilter === 'BOTH_REVERSAL' ? 'ALL' : 'BOTH_REVERSAL';
                      setTurnaroundFilter(next);
                      setShowQoqTrajectory(true);
                      executeScreener({ turnaround_filter: next });
                    }}
                    className={`px-2 py-1 rounded font-bold cursor-pointer transition ${turnaroundFilter === 'BOTH_REVERSAL'
                      ? 'bg-indigo-600 text-white border border-indigo-300'
                      : 'bg-gray-800 text-indigo-300 hover:bg-gray-700'
                      }`}
                    title="적자→흑자 전환 및 흑자→적자 반전 종목을 한눈에 비교합니다"
                  >
                    🔄 흑·적 반전 모두
                  </button>
                </div>
              </div>
            </div>

            {/* 🏭 섹터별 필터 & 거래소 세부업종(64개) / 중분류(31개) 전환 & 전종목 보기 바 */}
            <div className="bg-gray-900/90 border border-gray-800 rounded-xl p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold text-gray-200">
                    🏭 업종 분류 기준 선택:
                  </span>
                  <div className="flex items-center bg-gray-950 border border-indigo-500/40 rounded-lg p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSectorTaxonomyMode('MAJOR');
                        setSelectedSector('ALL');
                      }}
                      className={`px-2.5 py-1 rounded-md font-extrabold cursor-pointer transition ${
                        sectorTaxonomyMode === 'MAJOR'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      중분류 섹터 (31개)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSectorTaxonomyMode('SUB_SECTOR');
                        setSelectedSector('ALL');
                      }}
                      className={`px-2.5 py-1 rounded-md font-extrabold cursor-pointer transition ${
                        sectorTaxonomyMode === 'SUB_SECTOR'
                          ? 'bg-indigo-600 text-white shadow'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      거래소/WICS 세부업종 (64개 · 개인생활용품/화장품 등)
                    </button>
                  </div>

                  {/* ★ 핵심: ΔPBR·PER·가성비 부가필터 때문에 한국콜마·코스맥스 등이 가려지지 않도록 원클릭 전종목 해제 토글 */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextBypass = !bypassValuationFilters;
                      setBypassValuationFilters(nextBypass);
                      if (nextBypass) {
                        setOnlyUpwardSlope(false);
                        setUseQoqPbrLimit(false);
                        setUsePer(false);
                        setUseRoePbrRatio(false);
                        setUsePbr(false);
                        setUseRoe(false);
                        setUseQoqRoe(false);
                      }
                      executeScreener({
                        bypass_valuation_filters: nextBypass,
                        only_upward_slope: false,
                        use_qoq_pbr_limit: nextBypass ? false : useQoqPbrLimit,
                        use_per: nextBypass ? false : usePer,
                        use_roe_pbr_ratio: nextBypass ? false : useRoePbrRatio,
                        use_pbr: nextBypass ? false : usePbr,
                        use_roe: nextBypass ? false : useRoe,
                        use_qoq_roe: nextBypass ? false : useQoqRoe,
                      });
                    }}
                    className={`px-3 py-1 rounded-lg font-extrabold cursor-pointer border transition flex items-center gap-1.5 ${
                      bypassValuationFilters
                        ? 'bg-amber-500 text-slate-950 border-yellow-200 shadow-lg ring-1 ring-amber-300'
                        : 'bg-amber-950/70 text-amber-200 border-amber-500/50 hover:bg-amber-900'
                    }`}
                    title="④ΔPBR 상승폭 제한, ⑤PER 상한, ⑥ROE/PBR 가성비 등 모든 밸류에이션 필터를 해제하여 한국콜마·코스맥스 등 업종 내 전종목(2,473개)을 빠짐없이 차트에 표시합니다"
                  >
                    <span>{bypassValuationFilters ? '🔓 전종목 제한해제 ON (필터 없이 업종 내 전종목 표시중)' : '🔓 업종 내 전종목 모두 보기 (④ΔPBR·⑤PER·⑥가성비 제한 일괄해제)'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={stockSearchQuery}
                    onChange={(e) => setStockSearchQuery(e.target.value)}
                    placeholder="종목명/코드/사업내용 빠른 검색 (예: 콜마, 코스맥스)"
                    className="bg-gray-950 border border-gray-700 focus:border-emerald-400 rounded-lg px-2.5 py-1 text-xs text-white w-64 outline-none"
                  />
                  {stockSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setStockSearchQuery('')}
                      className="text-xs text-gray-400 hover:text-white cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
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
                      ✕ 섹터 필터 해제 (전체 {results.length}종목)
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 max-h-28 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSector('ALL');
                    setZoomPercent(100);
                    setAnchorPoint(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer border transition ${selectedSector === 'ALL'
                    ? 'bg-emerald-600 text-white border-emerald-400 shadow'
                    : 'bg-gray-950 text-gray-300 border-gray-700 hover:bg-gray-800'
                    }`}
                >
                  전체 섹터 (필터통과 {results.length} / 전체 {universeResults.length || results.length}종목)
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
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer border transition flex items-center gap-1.5 ${isSel
                        ? 'bg-indigo-950 text-white border-white shadow-md ring-1 ring-white/50'
                        : sObj.count > 0
                          ? 'bg-gray-950/90 text-gray-200 border-gray-800 hover:border-gray-600 hover:bg-gray-800/80'
                          : 'bg-gray-950/40 text-gray-500 border-gray-800/60 hover:text-gray-300'
                        }`}
                      title={`${sObj.sector}: 현재 필터 통과 ${sObj.count}종목 / 업종 전체 ${sObj.totalCount}종목`}
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: sObj.color }}
                      />
                      <span>{sObj.sector}</span>
                      <span className="text-[10px] font-mono text-gray-400">
                        ({sObj.count}/{sObj.totalCount})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div
              className="relative mx-auto transition-all duration-200"
              style={{ width: `${chartSizePct}%` }}
            >
              {/* 🎯 차트 내부 최상단 전용 HUD 오버레이 (padT=76 영역에 위치하여 아래 차트 데이터 포인트와 절대 겹치지 않으며 큰 글씨로 선명하게 표시) */}
              <div className="absolute top-2.5 left-3 right-3 z-10 pointer-events-none flex items-center justify-between gap-3 bg-[#0b1324]/95 border border-indigo-400/50 rounded-xl px-4 py-2.5 shadow-lg min-h-[48px]">
                {hoveredStock ? (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:text-base font-mono pointer-events-auto">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white font-sans font-extrabold text-xs sm:text-sm">
                        🎯 선택 종목
                      </span>
                      <span className="font-sans font-black text-white text-base sm:text-lg tracking-tight">
                        {getStockName(hoveredStock)}{' '}
                        <span className="text-gray-300 font-mono text-sm">({hoveredStock.ticker})</span>
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-md text-xs sm:text-sm font-sans font-extrabold text-slate-950"
                        style={{
                          backgroundColor:
                            sectorColorMap[getItemSectorLabel(hoveredStock)] || '#38bdf8',
                        }}
                      >
                        {hoveredStock.sector || '기타'}
                        {hoveredStock.sub_sector && hoveredStock.sub_sector !== hoveredStock.sector
                          ? ` (${hoveredStock.sub_sector})`
                          : ''}
                      </span>
                      {(hoveredStock.roe_turnaround_type === 'TURNAROUND_PROFIT' ||
                        (Number(hoveredStock.prev_q_roe) < 0 && Number(hoveredStock.roe) > 0)) && (
                          <span className="px-2.5 py-0.5 rounded-md bg-gradient-to-r from-amber-400 to-yellow-300 text-slate-950 font-sans font-black text-xs sm:text-sm shadow">
                            🔥 적자→흑자 전환
                          </span>
                        )}
                      {(hoveredStock.roe_turnaround_type === 'TURNAROUND_LOSS' ||
                        (Number(hoveredStock.prev_q_roe) > 0 && Number(hoveredStock.roe) < 0)) && (
                          <span className="px-2.5 py-0.5 rounded-md bg-gradient-to-r from-fuchsia-600 to-rose-600 text-white font-sans font-black text-xs sm:text-sm shadow">
                            ⚠️ 흑자→적자 반전
                          </span>
                        )}
                    </div>

                    <span className="text-amber-300 font-extrabold text-sm sm:text-base">
                      시총:{' '}
                      <strong className="text-white">
                        {Number(hoveredStock.market_cap_eok || 0) >= 10000
                          ? `${(Number(hoveredStock.market_cap_eok) / 10000).toFixed(2)}조`
                          : `${Number(hoveredStock.market_cap_eok || 0).toLocaleString()}억`}
                      </strong>
                    </span>

                    <span className="text-sky-300 font-extrabold text-sm sm:text-base">
                      PBR: {hoveredStock.prev_q_pbr} → <strong className="text-white underline">{hoveredStock.pbr}배</strong>{' '}
                      <span className="text-xs sm:text-sm">
                        ({hoveredStock.qoq_pbr_diff >= 0 ? `+${hoveredStock.qoq_pbr_diff}` : hoveredStock.qoq_pbr_diff})
                      </span>
                    </span>

                    <span className="text-emerald-300 font-extrabold text-sm sm:text-base">
                      ROE(25.3Q~26.2Q→25.4Q~26.3Q): {hoveredStock.prev_q_roe}% →{' '}
                      <strong className="text-yellow-300 underline">{hoveredStock.roe}%</strong>{' '}
                      <span className={hoveredStock.qoq_roe_diff >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
                        ({hoveredStock.qoq_roe_diff >= 0 ? `+${hoveredStock.qoq_roe_diff}` : hoveredStock.qoq_roe_diff}%p{' '}
                        {hoveredStock.qoq_roe_diff >= 0 ? '↗' : '↘'})
                      </span>
                    </span>

                    <span className="text-purple-300 font-extrabold text-sm sm:text-base">
                      PER: <strong className="text-white">{hoveredStock.per}배</strong>
                    </span>

                    <span className="text-rose-300 font-extrabold text-sm sm:text-base">
                      ROE/PBR: <strong className="text-rose-200">{hoveredStock.roe_pbr_ratio}</strong>
                    </span>

                    {setGlobalSearchTicker && (
                      <button
                        type="button"
                        onClick={() => setGlobalSearchTicker(hoveredStock.ticker)}
                        className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-sans font-extrabold text-xs sm:text-sm cursor-pointer shadow"
                      >
                        상세 리포트 →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between w-full gap-3 text-xs sm:text-sm text-gray-300 font-sans">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="px-2 py-0.5 rounded bg-indigo-600/40 border border-indigo-400/50 text-indigo-200 font-extrabold">
                        💡 차트 포인트 안내
                      </span>
                      <span>
                        차트의 점(●)에 마우스를 대면 이 상단 영역에 <strong className="text-white">종목명 · PBR · ROE(전분기→현재) · PER · 가성비</strong>가 큰 글씨로 표시됩니다. (점 클릭 시 상세 리포트 이동)
                      </span>
                    </span>
                    <div className="hidden lg:flex items-center gap-4 text-xs text-gray-300 shrink-0">
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full border-2 border-emerald-400 bg-transparent" />
                        <span>빈 원(○): 전분기(25.3Q~26.2Q)</span>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="inline-block w-3 h-3 rounded-full bg-emerald-400" />
                        <span>채운 원(●): 현재분기(25.4Q~26.3Q)</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <svg
                ref={svgRef}
                viewBox={`0 0 ${W} ${H}`}
                onMouseMove={handleSvgMouseMove}
                onMouseLeave={() => {
                  if (hoveredStock !== null) setHoveredStock(null);
                }}
                onClick={handleSvgClick}
                onWheel={handleSvgWheel}
                onDoubleClick={() => {
                  setZoomPercent(100);
                  setAnchorPoint(null);
                }}
                className={`w-full h-auto bg-[#070b12] rounded-xl border border-gray-800 select-none ${hoveredStock ? 'cursor-pointer' : 'cursor-crosshair'
                  }`}
              >
                <defs>
                  <clipPath id="tetris-scatter-clip">
                    <rect x={padL} y={padT} width={plotW} height={plotH} />
                  </clipPath>
                  <marker
                    id="arrow-upward-green"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#34d399" />
                  </marker>
                  <marker
                    id="arrow-downward-red"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="5"
                    markerHeight="5"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 1 L 10 5 L 0 9 z" fill="#f87171" />
                  </marker>
                  <marker
                    id="arrow-turnaround-gold"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0.5 L 10 5 L 0 9.5 z" fill="#facc15" />
                  </marker>
                  <marker
                    id="arrow-reversal-purple"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0.5 L 10 5 L 0 9.5 z" fill="#e879f9" />
                  </marker>
                </defs>

                {/* 성장주 우상향 모드일 때는 PBR > 1.0배 고PBR 영역까지 전체 상단(고ROE >= 기준선)을 하이라이트하고, 일반 가치주 모드일 때는 좌상단(저PBR <= 1.0배 & 고ROE) 하이라이트 */}
                {(onlyUpwardSlope || roeFilterMode === 'GROWTH_UPWARD') ? (
                  refY > padT && (
                    <rect
                      x={padL}
                      y={padT}
                      width={plotW}
                      height={Math.max(0, Math.min(plotH, refY - padT))}
                      fill="rgba(244, 63, 94, 0.07)"
                      clipPath="url(#tetris-scatter-clip)"
                    />
                  )
                ) : (
                  refX > padL && refY > padT && (
                    <rect
                      x={padL}
                      y={padT}
                      width={Math.max(0, Math.min(plotW, refX - padL))}
                      height={Math.max(0, Math.min(plotH, refY - padT))}
                      fill="rgba(16, 185, 129, 0.08)"
                      clipPath="url(#tetris-scatter-clip)"
                    />
                  )
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

                {/* 상단 사분면 워터마크 라벨 */}
                <text
                  x={padL + 10}
                  y={padT + 20}
                  fill={onlyUpwardSlope || roeFilterMode === 'GROWTH_UPWARD' ? '#fb7185' : '#10b981'}
                  fontSize="11"
                  fontWeight="bold"
                >
                  {onlyUpwardSlope || roeFilterMode === 'GROWTH_UPWARD'
                    ? `📈 성장주 우상향 영역 (고PBR 시장프리미엄 허용 · 고ROE ≥ ${refRoe}% & 전분기비 기울기 ΔROE > 0 우상향만 채택)`
                    : '★ Sweet Spot (저PBR · 고ROE 핵심 발굴 영역)'}{' '}
                  {selectedSector !== 'ALL' ? `— [${selectedSector}] 섹터` : ''}
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

                {/* 종목별 전분기 -> 현재 이동 궤적선 & 현재 위치 시가총액 비례 원(Bubble) 렌더링 */}
                <g clipPath="url(#tetris-scatter-clip)">
                  {renderOrderedItems.map((it: any, idx: number) => {
                    const curX = toX(Number(it.pbr) || 0);
                    const curY = toY(Number(it.roe) || 0);
                    const prevX = toX(Number(it.prev_q_pbr) || Number(it.pbr) || 0);
                    const prevY = toY(Number(it.prev_q_roe) || Number(it.roe) || 0);

                    const isHovered = hoveredStock?.ticker === it.ticker;
                    const qoqRoe = Number(it.qoq_roe_diff) || 0;
                    const roeVal = Number(it.roe) || 0;
                    const prevRoeVal = Number(it.prev_q_roe) || 0;
                    const isTurnaroundProfit =
                      it.roe_turnaround_type === 'TURNAROUND_PROFIT' || (prevRoeVal < 0 && roeVal > 0);
                    const isTurnaroundLoss =
                      it.roe_turnaround_type === 'TURNAROUND_LOSS' || (prevRoeVal > 0 && roeVal < 0);
                    const secName = getItemSectorLabel(it);

                    const dotColor =
                      colorMode === 'SECTOR'
                        ? sectorColorMap[secName] || '#38bdf8'
                        : isTurnaroundProfit
                          ? '#facc15'
                          : isTurnaroundLoss
                            ? '#e879f9'
                            : roeVal >= 10 && qoqRoe >= 1.0
                              ? '#10b981'
                              : roeVal >= 10
                                ? '#38bdf8'
                                : '#f59e0b';

                    const radius = calcStockRadius(it, isHovered, isTurnaroundProfit || isTurnaroundLoss, idx);
                    const showLabel =
                      isHovered || isTurnaroundProfit || isTurnaroundLoss || nonOverlappingLabelTickers.has(it.ticker);

                    const vectorColor = isTurnaroundProfit
                      ? '#facc15'
                      : isTurnaroundLoss
                        ? '#e879f9'
                        : qoqRoe >= 0
                          ? '#34d399'
                          : '#f87171';
                    const vectorMarker = isTurnaroundProfit
                      ? 'url(#arrow-turnaround-gold)'
                      : isTurnaroundLoss
                        ? 'url(#arrow-reversal-purple)'
                        : qoqRoe >= 0
                          ? 'url(#arrow-upward-green)'
                          : 'url(#arrow-downward-red)';

                    return (
                      <g
                        key={it.ticker}
                        className="pointer-events-none"
                      >
                        {/* 하나의 기업에 대해 전분기(2025.3Q~2026.2Q, 빈 원 ○) 점과 현재분기(2025.4Q~2026.3Q, 채운 원 ●) 점을 동시에 표시하고 우상향 기울기 벡터 화살표로 연결 */}
                        {(showQoqTrajectory ||
                          isHovered ||
                          isTurnaroundProfit ||
                          isTurnaroundLoss ||
                          onlyUpwardSlope ||
                          roeFilterMode === 'GROWTH_UPWARD') && (
                            <g opacity={isHovered || isTurnaroundProfit || isTurnaroundLoss ? 0.96 : 0.78}>
                              {/* 전분기(25.3Q~2026.2Q) 시작점: 테두리가 있는 빈 원(○) */}
                              <circle
                                cx={prevX}
                                cy={prevY}
                                r={isHovered ? 5.2 : 3.8}
                                fill="#070b12"
                                stroke={vectorColor}
                                strokeWidth={isHovered || isTurnaroundProfit || isTurnaroundLoss ? '2.2' : '1.6'}
                              />
                              {/* 전분기 -> 현재분기 기울기 연결 벡터 화살표 (적자->흑자: 골드 실선, 흑자->적자: 마젠타 경고선) */}
                              {(Math.abs(curX - prevX) > 1.5 || Math.abs(curY - prevY) > 1.5) && (
                                <line
                                  x1={prevX}
                                  y1={prevY}
                                  x2={curX}
                                  y2={curY}
                                  stroke={vectorColor}
                                  strokeWidth={
                                    isHovered
                                      ? '2.8'
                                      : isTurnaroundProfit || isTurnaroundLoss
                                        ? '2.2'
                                        : '1.5'
                                  }
                                  strokeDasharray={
                                    isTurnaroundProfit
                                      ? undefined
                                      : isTurnaroundLoss
                                        ? '6,3'
                                        : isHovered
                                          ? undefined
                                          : '4,2'
                                  }
                                  markerEnd={vectorMarker}
                                />
                              )}
                            </g>
                          )}

                        {/* 적자->흑자 전환(골드 이중 링) 및 흑자->적자 반전(보라/크림슨 경고 링) 특수 외곽 후광 */}
                        {isTurnaroundProfit && (
                          <circle
                            cx={curX}
                            cy={curY}
                            r={radius + 3.2}
                            fill="none"
                            stroke="#facc15"
                            strokeWidth="2.0"
                          />
                        )}
                        {isTurnaroundLoss && (
                          <circle
                            cx={curX}
                            cy={curY}
                            r={radius + 3.2}
                            fill="none"
                            stroke="#e879f9"
                            strokeWidth="2.0"
                            strokeDasharray="3,2"
                          />
                        )}

                        {/* 현재 종목 위치 시가총액 비례 원(Bubble) */}
                        <circle
                          cx={curX}
                          cy={curY}
                          r={radius}
                          fill={dotColor}
                          fillOpacity={isHovered ? 0.98 : useMcapBubbleSize ? 0.68 : 0.88}
                          stroke={
                            isHovered
                              ? '#ffffff'
                              : isTurnaroundProfit
                                ? '#fef08a'
                                : isTurnaroundLoss
                                  ? '#f5d0fe'
                                  : 'rgba(255,255,255,0.45)'
                          }
                          strokeWidth={isHovered || isTurnaroundProfit || isTurnaroundLoss ? '2.4' : '1.2'}
                        />

                        {/* 차트 내부에서는 서로 겹치지 않는(Collision-Free) 종목명을 크고 선명한 글씨로 표시 */}
                        {showLabel && (
                          <text
                            x={curX + radius + 6}
                            y={curY + 4}
                            fill={
                              isHovered
                                ? '#fde047'
                                : isTurnaroundProfit
                                  ? '#fde047'
                                  : isTurnaroundLoss
                                    ? '#f0abfc'
                                    : idx < 12
                                      ? '#a7f3d0'
                                      : '#e2e8f0'
                            }
                            fontSize={isHovered ? '14' : isTurnaroundProfit || isTurnaroundLoss ? '12.5' : '11.5'}
                            fontWeight={isHovered || isTurnaroundProfit || isTurnaroundLoss || idx < 15 ? 'bold' : '600'}
                            className="pointer-events-none"
                          >
                            {isTurnaroundProfit ? '🔥' : isTurnaroundLoss ? '⚠️' : ''}
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
                <tr className="bg-gray-900/90 text-gray-300 border-b border-gray-800 select-none">
                  <th
                    onClick={() => handleTableSort('NAME')}
                    title="클릭하여 종목명 오름차순/내림차순 정렬"
                    className="p-2.5 font-sans cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    순위 / 종목명 (코드){' '}
                    <span className={tableSortKey === 'NAME' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'NAME' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('SECTOR')}
                    title="클릭하여 시장/업종 오름차순/내림차순 정렬"
                    className="p-2.5 font-sans cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    시장 / 업종{' '}
                    <span className={tableSortKey === 'SECTOR' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'SECTOR' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('MARKET_CAP')}
                    title="클릭하여 시가총액 오름차순/내림차순 정렬"
                    className="p-2.5 text-right cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    현재가 (시총){' '}
                    <span className={tableSortKey === 'MARKET_CAP' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'MARKET_CAP' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('ROE')}
                    title="클릭하여 현재 ROE 오름차순/내림차순 정렬"
                    className="p-2.5 text-right text-indigo-300 cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    전분기(25.3Q~26.2Q) → 현재(25.4Q~26.3Q) ROE{' '}
                    <span className={tableSortKey === 'ROE' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'ROE' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('QOQ_ROE_DIFF')}
                    title="클릭하여 기울기(전분기비 ΔROE) 오름차순/내림차순 정렬"
                    className="p-2.5 text-right text-emerald-300 cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    기울기 (전분기비 ΔROE){' '}
                    <span className={tableSortKey === 'QOQ_ROE_DIFF' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'QOQ_ROE_DIFF' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('PBR')}
                    title="클릭하여 현재 PBR 오름차순/내림차순 정렬"
                    className="p-2.5 text-right text-sky-300 cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    전분기 → 현재 PBR (배){' '}
                    <span className={tableSortKey === 'PBR' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'PBR' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('QOQ_PBR_DIFF')}
                    title="클릭하여 전분기비 ΔPBR 오름차순/내림차순 정렬"
                    className="p-2.5 text-right text-amber-300 cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    전분기비 ΔPBR (변동률){' '}
                    <span className={tableSortKey === 'QOQ_PBR_DIFF' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'QOQ_PBR_DIFF' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('PER')}
                    title="클릭하여 PER 오름차순/내림차순 정렬"
                    className="p-2.5 text-right text-purple-300 cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    PER (배){' '}
                    <span className={tableSortKey === 'PER' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'PER' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('ROE_PBR_RATIO')}
                    title="클릭하여 ROE/PBR 가성비 오름차순/내림차순 정렬"
                    className="p-2.5 text-right text-rose-300 cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    ROE / PBR 가성비{' '}
                    <span className={tableSortKey === 'ROE_PBR_RATIO' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'ROE_PBR_RATIO' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('PRICE_GROWTH')}
                    title="클릭하여 분기 주가상승률 오름차순/내림차순 정렬"
                    className="p-2.5 text-right cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    분기 주가상승률{' '}
                    <span className={tableSortKey === 'PRICE_GROWTH' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'PRICE_GROWTH' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                  <th
                    onClick={() => handleTableSort('TAGS')}
                    title="클릭하여 핵심 포착 사유 정렬"
                    className="p-2.5 font-sans cursor-pointer hover:bg-gray-800/80 transition-colors"
                  >
                    ROE/PBR 핵심 포착 사유{' '}
                    <span className={tableSortKey === 'TAGS' ? 'text-amber-400 font-extrabold' : 'text-gray-600'}>
                      {tableSortKey === 'TAGS' ? (tableSortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800/80">
                {filteredResults.map((item: any, idx: number) => {
                  const roeUp = (item.qoq_roe_diff ?? 0) >= 0;
                  const prevRoe = Number(item.prev_q_roe ?? 0);
                  const curRoe = Number(item.roe ?? 0);
                  const isTurnaroundProfit =
                    item.roe_turnaround_type === 'TURNAROUND_PROFIT' || (prevRoe < 0 && curRoe > 0);
                  const isTurnaroundLoss =
                    item.roe_turnaround_type === 'TURNAROUND_LOSS' || (prevRoe > 0 && curRoe < 0);
                  const pbrStable = (item.qoq_pbr_diff ?? 0) <= 0.15;
                  const qPriceG = Number(item.qoq_price_growth_pct ?? 0);
                  return (
                    <tr
                      key={item.ticker}
                      onClick={() => {
                        if (setGlobalSearchTicker) setGlobalSearchTicker(item.ticker);
                      }}
                      className={`hover:bg-indigo-950/35 transition-colors cursor-pointer group ${isTurnaroundProfit
                        ? 'bg-amber-950/20'
                        : isTurnaroundLoss
                          ? 'bg-fuchsia-950/20'
                          : ''
                        }`}
                    >
                      <td className="p-2.5 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-mono text-[10px]">
                            #{idx + 1}
                          </span>
                          <div>
                            <div className="font-bold text-white group-hover:text-emerald-300 flex items-center gap-1.5">
                              <span>{getStockName(item)}</span>
                              {isTurnaroundProfit && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[10px] font-extrabold">
                                  🔥흑자전환
                                </span>
                              )}
                              {isTurnaroundLoss && (
                                <span className="px-1.5 py-0.2 rounded bg-fuchsia-600 text-white text-[10px] font-extrabold">
                                  ⚠️적자반전
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-gray-500 font-mono">{item.ticker}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-2.5 font-sans">
                        <div className="text-gray-200 font-semibold">
                          {item.market || '코스피'} · <span className="text-emerald-300">{item.sector || '-'}</span>
                        </div>
                        <div className="text-[10px] text-indigo-300 font-semibold">
                          세부: {item.sub_sector || item.sector || '-'}
                        </div>
                        {item.business_desc && (
                          <div className="text-[10px] text-gray-500 max-w-[180px] truncate" title={item.business_desc}>
                            {item.business_desc}
                          </div>
                        )}
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
                        <div
                          className={`font-extrabold text-sm ${isTurnaroundProfit
                            ? 'text-amber-300'
                            : isTurnaroundLoss
                              ? 'text-fuchsia-300'
                              : 'text-indigo-300'
                            }`}
                        >
                          {item.roe}%
                        </div>
                        <div className="text-[10px] text-gray-400">
                          <span className={prevRoe < 0 ? 'text-rose-400 font-bold' : ''}>
                            25.3Q~26.2Q ({item.prev_q_roe}%)
                          </span>{' '}
                          →{' '}
                          <span className={curRoe < 0 ? 'text-rose-400 font-bold' : 'text-emerald-300 font-bold'}>
                            25.4Q~26.3Q ({item.roe}%)
                          </span>
                        </div>
                      </td>

                      <td className="p-2.5 text-right">
                        {isTurnaroundProfit ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span className="px-2.5 py-0.5 rounded-md font-extrabold bg-gradient-to-r from-amber-500/90 to-yellow-400/90 text-slate-950 border border-yellow-200 shadow">
                              🔥 적자→흑자 +{item.qoq_roe_diff}%p ⏫
                            </span>
                            <span className="text-[10px] text-amber-300 font-sans font-bold">
                              턴어라운드 ({item.prev_q_roe}% → +{item.roe}%)
                            </span>
                          </div>
                        ) : isTurnaroundLoss ? (
                          <div className="inline-flex flex-col items-end gap-0.5">
                            <span className="px-2.5 py-0.5 rounded-md font-extrabold bg-gradient-to-r from-fuchsia-700 to-rose-700 text-white border border-fuchsia-300 shadow">
                              ⚠️ 흑자→적자 {item.qoq_roe_diff}%p ⏬
                            </span>
                            <span className="text-[10px] text-fuchsia-300 font-sans font-bold">
                              적자반전 주의 (+{item.prev_q_roe}% → {item.roe}%)
                            </span>
                          </div>
                        ) : (
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${roeUp
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                              : 'bg-rose-950/60 text-rose-300 border border-rose-500/30'
                              }`}
                          >
                            {roeUp ? `+${item.qoq_roe_diff}%p ▲` : `${item.qoq_roe_diff}%p ▼`}
                          </span>
                        )}
                      </td>

                      <td className="p-2.5 text-right">
                        <div className="font-extrabold text-sky-300 text-sm">{item.pbr}배</div>
                        <div className="text-[10px] text-gray-400">
                          전분기 {item.prev_q_pbr}배 → 현재 {item.pbr}배
                        </div>
                      </td>

                      <td className="p-2.5 text-right">
                        <div
                          className={`font-bold ${(item.qoq_pbr_diff ?? 0) <= 0
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
