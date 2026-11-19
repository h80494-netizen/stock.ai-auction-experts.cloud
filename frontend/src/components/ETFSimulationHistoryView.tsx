import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer
} from 'recharts';

// ETF 색상 및 이름 매핑
const ETF_COLORS: Record<string, string> = {
  EWY: "#3b82f6",
  EWJ: "#ef4444",
  SPY: "#10b981",
  QQQ: "#8b5cf6",
  FXI: "#f97316",
  INDA: "#facc15",
  EWZ: "#14b8a6",
  EWA: "#6366f1",
  EZU: "#ec4899",
  USO: "#78350f",
  GLD: "#eab308",
  CASH: "#9ca3af",
  Waiting: "#6b7280"
};

const ETF_NAMES: Record<string, string> = {
  EWY: "한국",
  EWJ: "일본",
  SPY: "미국 S&P 500",
  QQQ: "미국 나스닥",
  FXI: "중국",
  INDA: "인도",
  EWZ: "브라질",
  EWA: "호주",
  EZU: "유럽",
  USO: "원유",
  GLD: "금",
  CASH: "현금",
  Waiting: "대기중"
};

// 구간 슬라이스 성과 계산 헬퍼
function computeSliceMetrics(
  dates: string[],
  strategy: number[],
  selectedEtf: string[],
  startDate: string,
  endDate: string
) {
  if (!dates || !strategy || dates.length === 0 || strategy.length === 0) {
    return {
      ret: 0,
      sharpe: 0,
      mdd: 0,
      winRate: 0,
      tradeCount: 0,
      startActual: startDate,
      endActual: endDate,
      series: [] as { dayIdx: number; date: string; val: number }[],
    };
  }

  let sIdx = 0;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] >= startDate) {
      sIdx = i;
      break;
    }
  }
  let eIdx = dates.length - 1;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= endDate) {
      eIdx = i;
      break;
    }
  }
  if (eIdx <= sIdx) {
    eIdx = Math.min(dates.length - 1, sIdx + 1);
  }

  const subStrat = strategy.slice(sIdx, eIdx + 1);
  const subDates = dates.slice(sIdx, eIdx + 1);
  const subSel = (selectedEtf || []).slice(sIdx, eIdx + 1);

  if (subStrat.length < 2 || subStrat[0] <= 0) {
    return {
      ret: 0,
      sharpe: 0,
      mdd: 0,
      winRate: 0,
      tradeCount: 0,
      startActual: subDates[0] || startDate,
      endActual: subDates[subDates.length - 1] || endDate,
      series: [],
    };
  }

  const baseVal = subStrat[0];
  const endVal = subStrat[subStrat.length - 1];
  const ret = ((endVal / baseVal) - 1) * 100;

  const dailyRets: number[] = [];
  let peak = subStrat[0];
  let maxDd = 0;
  const series = subStrat.map((v, idx) => {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = (v - peak) / peak;
      if (dd < maxDd) maxDd = dd;
    }
    if (idx > 0 && subStrat[idx - 1] > 0) {
      dailyRets.push((v - subStrat[idx - 1]) / subStrat[idx - 1]);
    }
    return {
      dayIdx: idx + 1,
      date: subDates[idx],
      val: baseVal > 0 ? (v / baseVal) * 100 : 100,
    };
  });

  let sharpe = 0;
  if (dailyRets.length > 1) {
    const mean = dailyRets.reduce((a, b) => a + b, 0) / dailyRets.length;
    const variance = dailyRets.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / dailyRets.length;
    const std = Math.sqrt(variance);
    if (std > 0) {
      sharpe = (mean / std) * Math.sqrt(252);
    }
  }

  let tradeCount = 0;
  const tradeRets: number[] = [];
  let entryVal = subStrat[0];
  for (let j = 1; j < subSel.length; j++) {
    if (subSel[j] !== subSel[j - 1]) {
      tradeCount++;
      const exitVal = subStrat[j] || entryVal;
      if (entryVal > 0 && subSel[j - 1] !== "Waiting" && subSel[j - 1] !== "CASH" && subSel[j - 1] !== "") {
        tradeRets.push(((exitVal - entryVal) / entryVal) * 100);
      }
      entryVal = exitVal;
    }
  }
  if (
    subSel.length > 0 &&
    subSel[subSel.length - 1] !== "Waiting" &&
    subSel[subSel.length - 1] !== "CASH" &&
    subSel[subSel.length - 1] !== "" &&
    entryVal > 0
  ) {
    tradeRets.push(((subStrat[subStrat.length - 1] - entryVal) / entryVal) * 100);
  }
  const wins = tradeRets.filter((r) => r > 0);
  const winRate = tradeRets.length > 0 ? (wins.length / tradeRets.length) * 100 : 0;

  return {
    ret: isFinite(ret) ? ret : 0,
    sharpe: isFinite(sharpe) ? sharpe : 0,
    mdd: isFinite(maxDd) ? maxDd * 100 : 0,
    winRate: isFinite(winRate) ? winRate : 0,
    tradeCount,
    startActual: subDates[0],
    endActual: subDates[subDates.length - 1],
    series,
  };
}

export default function ETFSimulationHistoryView({ etfWeights, setEtfWeights }: { etfWeights?: any, setEtfWeights?: any }) {
  const [simData, setSimData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [criteria, setCriteria] = useState<string>('sharpe');
  // 2종목, 3종목 선택 삭제 -> 단일 1종목(100%) 집중 고정
  const topN = 1;
  const [period, setPeriod] = useState<string>('YTD(26.01~)');
  
  // 26 Models Simulator States (21 추세추종 + 5 역추세·횡보·방어)
  const [models, setModels] = useState<any[]>([]);
  const [runningSimulator, setRunningSimulator] = useState(false);
  const [selectedModelIdx, setSelectedModelIdx] = useState<number>(-1);
  const [modelCategoryFilter, setModelCategoryFilter] = useState<'ALL' | 'TREND' | 'NON_TREND' | 'ROBUST_ONLY'>('ALL');

  // 전진분석(Walk-Forward) 과최적화 검증 기간 설정 (디폴트: 6개월전~3개월전 [3M] vs 3개월전~현재 [3M])
  const [wfPreset, setWfPreset] = useState<'6M_3M_NOW' | '12M_6M_NOW' | '4M_2M_NOW' | 'CUSTOM'>('6M_3M_NOW');
  const [customDates, setCustomDates] = useState<{ p1Start: string; p1End: string; p2End: string }>({
    p1Start: '',
    p1End: '',
    p2End: '',
  });

  useEffect(() => {
    if (selectedModelIdx !== -1 && models[selectedModelIdx] && setEtfWeights) {
      const w = models[selectedModelIdx].weights;
      setEtfWeights({
        w1: Math.abs(w.w1) > 1 ? w.w1 / 100 : w.w1,
        w5: Math.abs(w.w5) > 1 ? w.w5 / 100 : w.w5,
        w20: Math.abs(w.w20) > 1 ? w.w20 / 100 : w.w20,
      });
    }
  }, [selectedModelIdx, models, setEtfWeights]);

  const handleRunSimulator = async (currentCriteria = criteria) => {
    setRunningSimulator(true);
    setModels([]);
    setSelectedModelIdx(-1);
    try {
      const res = await fetch(`/api/etf/simulation-models?criteria=${currentCriteria}&top_n=1`);
      if (res.ok) {
        const json = await res.json();
        setModels(Array.isArray(json) ? json : []);
      }
    } catch (e) {
      console.error('Simulator fetch error:', e);
    } finally {
      setRunningSimulator(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setSimData(null);
      try {
        const w1 = etfWeights?.w1 ?? 0.5;
        const w5 = etfWeights?.w5 ?? 0.3;
        const w20 = etfWeights?.w20 ?? 0.2;
        const res = await fetch(`/api/etf/simulation?criteria=${criteria}&top_n=1&w1=${w1}&w5=${w5}&w20=${w20}&t=${Date.now()}`);
        if (!res.ok) throw new Error('API Error');
        const json = await res.json();
        setSimData(json);
      } catch (err) {
        console.error('Simulation fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    handleRunSimulator(criteria);
  }, [criteria, etfWeights]);

  // 시뮬레이션 데이터의 최신 날짜 기준으로 Walk-Forward 분할 날짜 계산
  const wfDateBounds = useMemo(() => {
    const firstModel = models.find((m) => m && m.dates && m.dates.length > 0);
    const allDates: string[] = firstModel?.dates || simData?.dates || [];
    const latestStr = allDates.length > 0 ? allDates[allDates.length - 1] : new Date().toISOString().split('T')[0];
    const latestDt = new Date(latestStr + 'T00:00:00');

    const shiftMonths = (mBack: number) => {
      const d = new Date(latestDt);
      d.setMonth(d.getMonth() - mBack);
      return d.toISOString().split('T')[0];
    };

    if (wfPreset === '12M_6M_NOW') {
      return {
        p1Start: shiftMonths(12),
        p1End: shiftMonths(6),
        p2End: latestStr,
        labelP1: '전반기 (12개월전 ~ 6개월전 · 6개월)',
        labelP2: '후반기 (6개월전 ~ 현재 · 6개월)',
      };
    }
    if (wfPreset === '4M_2M_NOW') {
      return {
        p1Start: shiftMonths(4),
        p1End: shiftMonths(2),
        p2End: latestStr,
        labelP1: '전반기 (4개월전 ~ 2개월전 · 2개월)',
        labelP2: '후반기 (2개월전 ~ 현재 · 2개월)',
      };
    }
    if (wfPreset === 'CUSTOM' && customDates.p1Start && customDates.p1End && customDates.p2End) {
      return {
        p1Start: customDates.p1Start,
        p1End: customDates.p1End,
        p2End: customDates.p2End,
        labelP1: `전반기 (${customDates.p1Start} ~ ${customDates.p1End})`,
        labelP2: `후반기 (${customDates.p1End} ~ ${customDates.p2End})`,
      };
    }
    // 디폴트: 6개월전 ~ 3개월전 (3개월) vs 3개월전 ~ 현재 (3개월)
    return {
      p1Start: shiftMonths(6),
      p1End: shiftMonths(3),
      p2End: latestStr,
      labelP1: '전반기 (6개월전 ~ 3개월전 · 3개월)',
      labelP2: '후반기 (3개월전 ~ 현재 · 3개월)',
    };
  }, [models, simData, wfPreset, customDates]);

  useEffect(() => {
    if (!customDates.p1Start && wfDateBounds.p1Start) {
      setCustomDates({
        p1Start: wfDateBounds.p1Start,
        p1End: wfDateBounds.p1End,
        p2End: wfDateBounds.p2End,
      });
    }
  }, [wfDateBounds, customDates.p1Start]);

  // 전진분석(Walk-Forward) 과최적화 일관성 분석 결과 계산
  const walkForwardAnalysis = useMemo(() => {
    if (!models || models.length === 0) return [];

    const rawList = models.map((m, idx) => {
      const p1 = computeSliceMetrics(m.dates, m.strategy, m.selected_etf, wfDateBounds.p1Start, wfDateBounds.p1End);
      const p2 = computeSliceMetrics(m.dates, m.strategy, m.selected_etf, wfDateBounds.p1End, wfDateBounds.p2End);
      const combinedRet = ((1 + p1.ret / 100) * (1 + p2.ret / 100) - 1) * 100;
      return {
        ...m,
        modelIdx: idx,
        p1,
        p2,
        combinedRet,
        retDiff: p2.ret - p1.ret,
      };
    });

    // 구간별 순위 산출
    const sortedByP1 = [...rawList].sort((a, b) => b.p1.ret - a.p1.ret);
    const sortedByP2 = [...rawList].sort((a, b) => b.p2.ret - a.p2.ret);
    const rankP1Map = new Map<number, number>();
    const rankP2Map = new Map<number, number>();
    sortedByP1.forEach((item, rIdx) => rankP1Map.set(item.modelIdx, rIdx + 1));
    sortedByP2.forEach((item, rIdx) => rankP2Map.set(item.modelIdx, rIdx + 1));

    const totalCount = rawList.length || 1;

    return rawList.map((item) => {
      const rankP1 = rankP1Map.get(item.modelIdx) || totalCount;
      const rankP2 = rankP2Map.get(item.modelIdx) || totalCount;
      const rankShift = Math.abs(rankP1 - rankP2);

      // 일관성 점수 (0 ~ 100점) 계산:
      // 1) 전·후반기 모두 양(+)의 수익률 달성 여부 (최대 40점)
      // 2) 순위 일관성: 1 - (rankShift / totalCount) (최대 30점)
      // 3) 샤프지수 안정성: min(p1.sharpe, p2.sharpe) 및 평균 샤프 (최대 30점)
      let posScore = 0;
      if (item.p1.ret > 0 && item.p2.ret > 0) {
        posScore = 40;
      } else if (item.p2.ret > 0) {
        posScore = 22;
      } else if (item.p1.ret > 0) {
        posScore = 10;
      }

      const rankConsistencyScore = Math.max(0, (1 - rankShift / totalCount) * 30);
      const minSharpe = Math.min(item.p1.sharpe, item.p2.sharpe);
      const avgSharpe = (item.p1.sharpe + item.p2.sharpe) / 2;
      const sharpeScore = Math.max(0, Math.min(30, (minSharpe * 10) + (avgSharpe * 8)));

      // 만약 전반기 수익률은 높은데(>10%) 후반기 수익률이 마이너스(<0%)이거나 반토막 이상 급락한 경우 과최적화 페널티 부과
      let overfitPenalty = 0;
      if (item.p1.ret >= 8 && item.p2.ret < 0) {
        overfitPenalty = 25;
      } else if (item.p1.ret > 0 && item.p2.ret < item.p1.ret * 0.25) {
        overfitPenalty = 12;
      }

      const consistencyScore = Math.round(Math.max(0, Math.min(100, posScore + rankConsistencyScore + sharpeScore - overfitPenalty)));

      let verdict: 'ROBUST' | 'MODERATE' | 'OVERFIT' = 'MODERATE';
      let verdictLabel = '⚠️ 보통 (장세민감)';
      let verdictDesc = '구간별 성과 편차가 존재하므로 시장 국면에 맞춘 모니터링 필요';

      if (item.p1.ret > 0 && item.p2.ret > 0 && consistencyScore >= 65) {
        verdict = 'ROBUST';
        verdictLabel = '✅ 일관성 우수 (실전적합)';
        verdictDesc = '전반기·후반기 연속 플러스(+) 수익 및 위험대비 성과가 일관되게 유지됨';
      } else if ((item.p1.ret >= 5 && item.p2.ret <= 0) || consistencyScore < 42 || rankShift >= Math.floor(totalCount * 0.55)) {
        verdict = 'OVERFIT';
        verdictLabel = '🚨 과최적화 의심 (주의)';
        verdictDesc = '과거 구간 대비 최근 구간 성과가 급락하거나 순위 괴리가 커 과최적화 가능성 높음';
      }

      return {
        ...item,
        rankP1,
        rankP2,
        rankShift,
        consistencyScore,
        verdict,
        verdictLabel,
        verdictDesc,
      };
    });
  }, [models, wfDateBounds]);

  // 일관성 최우수 모델 & 역추세·횡보 최우수 모델 추출
  const wfSummaryStats = useMemo(() => {
    if (walkForwardAnalysis.length === 0) return null;
    const robustModels = walkForwardAnalysis.filter((m) => m.verdict === 'ROBUST');
    const overfitModels = walkForwardAnalysis.filter((m) => m.verdict === 'OVERFIT');
    const moderateModels = walkForwardAnalysis.filter((m) => m.verdict === 'MODERATE');

    const bestRobust = [...walkForwardAnalysis].sort((a, b) => {
      if (b.consistencyScore !== a.consistencyScore) return b.consistencyScore - a.consistencyScore;
      return b.combinedRet - a.combinedRet;
    })[0];

    const nonTrendModels = walkForwardAnalysis.filter((m) => m.strategy_type && m.strategy_type !== 'TREND');
    const bestNonTrend = [...nonTrendModels].sort((a, b) => {
      if (b.consistencyScore !== a.consistencyScore) return b.consistencyScore - a.consistencyScore;
      return b.combinedRet - a.combinedRet;
    })[0];

    const trendModels = walkForwardAnalysis.filter((m) => !m.strategy_type || m.strategy_type === 'TREND');
    const avgTrendP1 = trendModels.length > 0 ? trendModels.reduce((s, m) => s + m.p1.ret, 0) / trendModels.length : 0;
    const avgTrendP2 = trendModels.length > 0 ? trendModels.reduce((s, m) => s + m.p2.ret, 0) / trendModels.length : 0;
    const avgNonTrendP1 = nonTrendModels.length > 0 ? nonTrendModels.reduce((s, m) => s + m.p1.ret, 0) / nonTrendModels.length : 0;
    const avgNonTrendP2 = nonTrendModels.length > 0 ? nonTrendModels.reduce((s, m) => s + m.p2.ret, 0) / nonTrendModels.length : 0;

    return {
      robustCount: robustModels.length,
      moderateCount: moderateModels.length,
      overfitCount: overfitModels.length,
      bestRobust,
      bestNonTrend,
      avgTrendP1,
      avgTrendP2,
      avgNonTrendP1,
      avgNonTrendP2,
    };
  }, [walkForwardAnalysis]);

  // 선택된(또는 일관성 1위) 모델의 전반기 vs 후반기 일차별(Day 1 ~ Day N) 누적수익률 오버레이 차트 데이터
  const activeWfTargetModel = useMemo(() => {
    if (selectedModelIdx !== -1 && walkForwardAnalysis[selectedModelIdx]) {
      return walkForwardAnalysis[selectedModelIdx];
    }
    return wfSummaryStats?.bestRobust || walkForwardAnalysis[0] || null;
  }, [selectedModelIdx, walkForwardAnalysis, wfSummaryStats]);

  const wfComparisonBarData = useMemo(() => {
    return walkForwardAnalysis.map((m) => ({
      name: m.model.replace(' [', '\n['),
      shortName: `M${m.model_id || m.modelIdx + 1}`,
      fullName: m.model,
      전반기수익률: Number(m.p1.ret.toFixed(2)),
      후반기수익률: Number(m.p2.ret.toFixed(2)),
      일관성점수: m.consistencyScore,
      strategy_type: m.strategy_type || 'TREND',
    }));
  }, [walkForwardAnalysis]);

  // Helper to get start date based on period
  const getStartDate = () => {
    let startDate = '1900-01-01';
    const today = new Date();
    if (period === 'YTD(26.01~)' || period === 'YTD') {
      const year = today.getFullYear();
      startDate = `${year}-01-01`;
    } else if (period === '3개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '6개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '1년') {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '전체') {
      startDate = '1900-01-01';
    }
    return startDate;
  };

  // 0. 단일 메인 모델 차트 데이터 생성 (Rebasing base=100)
  const mainChartData = useMemo(() => {
    if (!simData || !simData.dates || simData.dates.length === 0) return [];
    
    const startDate = getStartDate();
    const { dates, strategy, selected_etf, etfs } = simData;

    let startIdx = 0;
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] >= startDate) {
        startIdx = i;
        break;
      }
    }
    if (startIdx >= dates.length) startIdx = 0;

    const baseStrategy = (strategy && strategy[startIdx] > 0) ? strategy[startIdx] : 100;
    
    const data = [];
    for (let i = startIdx; i < dates.length; i++) {
      const point: any = {
        date: dates[i],
        Selected: selected_etf[i] || 'CASH',
        Strategy: (strategy[i] / baseStrategy) * 100
      };
      if (etfs) {
        Object.keys(etfs).forEach(ticker => {
          const basePrice = etfs[ticker][startIdx] || 100;
          point[ticker] = basePrice > 0 ? (etfs[ticker][i] / basePrice) * 100 : 100;
        });
      }
      data.push(point);
    }
    return data;
  }, [simData, period]);

  // 1. 단일 모델(메인) 히스토리 계산 (기간 필터 및 리베이싱 적용)
  const historyRows = useMemo(() => {
    if (!simData || !simData.dates || simData.dates.length === 0) return [];
    
    const rows = [];
    const { dates, strategy, selected_etf, etfs } = simData;
    const startDate = getStartDate();

    let startIdx = 0;
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] >= startDate) {
        startIdx = i;
        break;
      }
    }
    if (startIdx >= dates.length) startIdx = 0;

    const baseStrategyVal = (strategy && strategy[startIdx] > 0) ? strategy[startIdx] : 100;

    for (let i = startIdx; i < dates.length; i++) {
      let action = "Hold";
      if (selected_etf[i] === "Waiting") {
        action = "Wait";
      } else if (i > startIdx && selected_etf[i] !== selected_etf[i-1] && selected_etf[i-1] !== "Waiting") {
        if (selected_etf[i] === "CASH") {
          action = "Sell (Cash)";
        } else {
          action = "Buy (Switch)";
        }
      } else if (i > startIdx && selected_etf[i-1] === "Waiting" && selected_etf[i] !== "Waiting") {
        action = "Buy (Entry)";
      } else if (i === startIdx) {
        action = "Buy (Entry)";
      }

      const rebasedVal = (strategy[i] / baseStrategyVal) * 100;
      const cumReturn = rebasedVal - 100;
      let dailyReturn = 0;
      if (i > 0 && strategy[i-1] > 0) {
        dailyReturn = ((strategy[i] - strategy[i-1]) / strategy[i-1]) * 100;
      }

      const currentEtfBase = (selected_etf[i] !== "CASH" && selected_etf[i] !== "Waiting" && etfs && etfs[selected_etf[i]]) 
                             ? etfs[selected_etf[i]][i] : 100;

      rows.push({
        date: dates[i],
        selected: selected_etf[i] || "CASH",
        action,
        etfIndex: currentEtfBase,
        dailyReturn: isNaN(dailyReturn) ? 0 : dailyReturn,
        cumReturn: isNaN(cumReturn) ? 0 : cumReturn
      });
    }

    return rows.reverse();
  }, [simData, period]);

  // 2. 다중 차트 데이터 생성 (선택된 기간에 맞추어 리베이싱)
  const multiChartData = useMemo(() => {
    if (!models || models.length === 0) return [];
    const firstModel = models.find(m => m && m.dates && m.dates.length > 0);
    if (!firstModel) return [];

    const startDate = getStartDate();
    
    let startIdx = 0;
    for (let i = 0; i < firstModel.dates.length; i++) {
      if (firstModel.dates[i] >= startDate) {
        startIdx = i;
        break;
      }
    }
    
    if (startIdx >= firstModel.dates.length) startIdx = 0;

    const data = [];
    for (let i = startIdx; i < firstModel.dates.length; i++) {
      const row: any = { date: firstModel.dates[i] };
      models.forEach((m, idx) => {
        if (m && m.strategy && m.strategy.length > i) {
          const baseVal = m.strategy[startIdx] || 1;
          const currVal = m.strategy[i] || baseVal;
          row[`model_${idx}`] = baseVal > 0 ? (currVal / baseVal) * 100 : 100;
        } else {
          row[`model_${idx}`] = 100;
        }
      });
      data.push(row);
    }
    return data;
  }, [models, period]);

  // 3. 26개 모델의 기간별 지표 동적 계산 + Walk-Forward 일관성 데이터 결합
  const filteredModels = useMemo(() => {
    if (!models || models.length === 0) return [];
    
    const startDate = getStartDate();

    return models.map((m, idx) => {
      if (!m || !m.dates || m.dates.length === 0) return m;

      let startIdx = 0;
      for (let i = 0; i < m.dates.length; i++) {
        if (m.dates[i] >= startDate) {
          startIdx = i;
          break;
        }
      }
      if (startIdx >= m.dates.length) startIdx = 0;

      const strategy = (m.strategy || []).slice(startIdx);
      const selected_etf = m.selected_etf ? m.selected_etf.slice(startIdx) : [];

      const startVal = strategy.length > 0 && strategy[0] > 0 ? strategy[0] : 1;
      const endVal = strategy.length > 0 ? strategy[strategy.length - 1] : startVal;
      const total_ret = startVal > 0 ? ((endVal / startVal) - 1) * 100 : 0;

      let sharpe_ratio = 0;
      if (strategy.length > 1) {
        const daily_rets = [];
        for (let i = 1; i < strategy.length; i++) {
          if (strategy[i-1] > 0) {
            daily_rets.push((strategy[i] - strategy[i-1]) / strategy[i-1]);
          }
        }
        if (daily_rets.length > 0) {
          const mean_ret = daily_rets.reduce((a, b) => a + b, 0) / daily_rets.length;
          const variance = daily_rets.reduce((a, b) => a + Math.pow(b - mean_ret, 2), 0) / daily_rets.length;
          const std_dev = Math.sqrt(variance);
          if (std_dev > 0) {
            sharpe_ratio = (mean_ret / std_dev) * Math.sqrt(252);
          }
        }
      }

      let mdd = 0;
      let peak = -999999;
      for (let i = 0; i < strategy.length; i++) {
        if (strategy[i] > peak) {
          peak = strategy[i];
        }
        if (peak > 0) {
          const drawdown = (strategy[i] - peak) / peak;
          if (drawdown < mdd) {
            mdd = drawdown;
          }
        }
      }
      mdd = mdd * 100;

      let win_rate = 0;
      let avg_win = 0;
      let avg_loss = 0;
      
      if (selected_etf.length > 0) {
        const trades_returns = [];
        let entry_value = strategy[0] || 1;
        
        for (let j = 1; j < selected_etf.length; j++) {
          if (selected_etf[j] !== selected_etf[j-1]) {
            const exit_value = strategy[j] || entry_value;
            if (entry_value > 0 && selected_etf[j-1] !== "Waiting" && selected_etf[j-1] !== "CASH" && selected_etf[j-1] !== "") {
              trades_returns.push(((exit_value - entry_value) / entry_value) * 100);
            }
            entry_value = exit_value;
          }
        }
        
        if (selected_etf[selected_etf.length - 1] !== "Waiting" && selected_etf[selected_etf.length - 1] !== "CASH" && selected_etf[selected_etf.length - 1] !== "" && entry_value > 0) {
          const exit_value = strategy[strategy.length - 1] || entry_value;
          trades_returns.push(((exit_value - entry_value) / entry_value) * 100);
        }
        
        const wins = trades_returns.filter(r => r > 0);
        const losses = trades_returns.filter(r => r <= 0);
        
        win_rate = trades_returns.length > 0 ? (wins.length / trades_returns.length) * 100 : 0;
        avg_win = wins.length > 0 ? wins.reduce((a,b)=>a+b, 0) / wins.length : 0;
        avg_loss = losses.length > 0 ? losses.reduce((a,b)=>a+b, 0) / losses.length : 0;
      }

      const wfItem = walkForwardAnalysis[idx];

      return {
        ...m,
        modelIdx: idx,
        total_ret: isNaN(total_ret) ? 0 : total_ret,
        sharpe: isNaN(sharpe_ratio) ? 0 : sharpe_ratio,
        mdd: isNaN(mdd) ? 0 : mdd,
        win_rate: isNaN(win_rate) ? 0 : win_rate,
        avg_win: isNaN(avg_win) ? 0 : avg_win,
        avg_loss: isNaN(avg_loss) ? 0 : avg_loss,
        wf: wfItem,
      };
    });
  }, [models, period, walkForwardAnalysis]);

  const displayedModels = useMemo(() => {
    return filteredModels.filter((m) => {
      if (modelCategoryFilter === 'TREND') return !m.strategy_type || m.strategy_type === 'TREND';
      if (modelCategoryFilter === 'NON_TREND') return m.strategy_type && m.strategy_type !== 'TREND';
      if (modelCategoryFilter === 'ROBUST_ONLY') return m.wf?.verdict === 'ROBUST';
      return true;
    });
  }, [filteredModels, modelCategoryFilter]);

  const renderActionBadge = (action: string) => {
    if (action.includes("Buy")) {
      return <span className="px-2 py-1 bg-red-900/50 text-red-400 border border-red-700 rounded text-xs font-bold">{action}</span>;
    }
    if (action.includes("Sell")) {
      return <span className="px-2 py-1 bg-blue-900/50 text-blue-400 border border-blue-700 rounded text-xs font-bold">{action}</span>;
    }
    if (action === "Hold") {
      return <span className="px-2 py-1 bg-gray-800 text-gray-400 border border-gray-600 rounded text-xs">{action}</span>;
    }
    return <span className="px-2 py-1 bg-gray-800 text-gray-500 rounded text-xs">{action}</span>;
  };

  const renderSelectedEtfs = (selectedStr: string) => {
    if (!selectedStr) return null;
    const list = selectedStr.split(',').map(s => s.trim());
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((item, idx) => (
          <span key={idx} className="flex items-center gap-1 bg-gray-900/80 px-2 py-0.5 rounded border border-gray-700 text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ETF_COLORS[item] || '#888' }} />
            <span style={{ color: ETF_COLORS[item] || '#fff' }}>{item}</span>
            <span className="text-gray-400 font-sans text-[11px]">({ETF_NAMES[item] || item})</span>
          </span>
        ))}
      </div>
    );
  };

  const getLineColor = (idx: number) => {
    if (selectedModelIdx !== -1) {
      return selectedModelIdx === idx ? '#f472b6' : '#374151';
    }
    const m = models[idx];
    if (m?.strategy_type && m.strategy_type !== 'TREND') {
      const nonTrendColors: Record<string, string> = {
        MEAN_REV: '#38bdf8',
        RANGE: '#a855f7',
        LOW_VOL: '#10b981',
        HYBRID: '#f59e0b',
      };
      return nonTrendColors[m.strategy_type] || '#22d3ee';
    }
    const hue = (idx * (360 / 26)) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  };

  const periodOptions = ['YTD(26.01~)', '3개월', '6개월', '1년', '전체'];

  if (loading && !simData) return <div className="p-4 animate-pulse text-xl font-bold">시뮬레이션 히스토리 불러오는 중...</div>;

  return (
    <div className="p-4 h-full overflow-y-auto space-y-5">
      {/* 상단 헤더 바 (2종목·3종목 선택기 삭제 -> 단일 1종목 100% 집중 배지 표시) */}
      <div className="flex flex-col lg:flex-row justify-between items-center bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">🗓️ 시뮬레이션 히스토리 & 과최적화(Walk-Forward) 일관성 검증</h2>
          <p className="text-sm text-gray-400 mt-1">
            추세추종(21개) + 역추세·횡보·저변동 방어(5개) 총 26개 모델의 구간별(6M~3M전 vs 3M전~현재) 성과 일관성 비교
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-center flex-wrap">
          <div className="bg-gray-900 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-teal-500/40">
            <span className="text-xs font-bold text-teal-400">🎯 포트폴리오 기준:</span>
            <span className="px-2 py-0.5 bg-teal-900/70 text-teal-200 border border-teal-500/50 rounded text-xs font-extrabold">
              최상위 1종목 (100% 집중)
            </span>
          </div>

          {/* 선택 기준 토글 */}
          <div className="bg-gray-900 p-1 rounded-lg flex border border-gray-700">
            <button
              onClick={() => setCriteria('momentum')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                criteria === 'momentum' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              🔥 모멘텀(단순수익률)
            </button>
            <button
              onClick={() => setCriteria('sharpe')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                criteria === 'sharpe' 
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              🛡️ 샤프지수(위험조정)
            </button>
          </div>

          <button
            onClick={() => handleRunSimulator(criteria)}
            className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded-lg shadow border border-teal-500 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>🧪 26개 전체 모델 비교 실행</span>
            {runningSimulator && <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></span>}
          </button>
        </div>
      </div>

      {/* 🔬 [핵심 신설] 과최적화(Overfitting) 방지: 전반기(6M전~3M전) vs 후반기(3M전~현재) 운용성과 일관성 검증 시뮬레이션 */}
      <div className="bg-gradient-to-br from-slate-900 via-gray-900 to-indigo-950/60 p-4 sm:p-5 rounded-xl shadow-2xl border-2 border-indigo-500/60 space-y-4">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 border-b border-indigo-500/30 pb-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-xs font-extrabold">
                🔬 Walk-Forward 과최적화 검증
              </span>
              <h3 className="text-lg sm:text-xl font-extrabold text-white">
                전반기(6개월전~3개월전) vs 후반기(3개월전~현재) 운용성과 일관성 시뮬레이션
              </h3>
            </div>
            <p className="text-xs text-indigo-200/80 mt-1">
              특정 과거 구간에만 맞춘 과최적화(Overfitting) 모델을 걸러내기 위해, <strong>{wfDateBounds.labelP1}</strong>과 <strong>{wfDateBounds.labelP2}</strong>의 수익률·샤프지수·순위 유지율을 교차 검증합니다.
            </p>
          </div>

          {/* 기간 분할 프리셋 선택기 */}
          <div className="flex flex-wrap items-center gap-1.5 bg-gray-950/90 p-1.5 rounded-lg border border-indigo-500/40">
            <button
              onClick={() => setWfPreset('6M_3M_NOW')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                wfPreset === '6M_3M_NOW' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              📌 6개월전~3개월전(3M) vs 3개월전~현재(3M) [기본]
            </button>
            <button
              onClick={() => setWfPreset('12M_6M_NOW')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                wfPreset === '12M_6M_NOW' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              12개월전~6개월전(6M) vs 6개월전~현재(6M)
            </button>
            <button
              onClick={() => setWfPreset('4M_2M_NOW')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                wfPreset === '4M_2M_NOW' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              4개월전~2개월전(2M) vs 2개월전~현재(2M)
            </button>
            <button
              onClick={() => setWfPreset('CUSTOM')}
              className={`px-2.5 py-1 rounded text-xs font-bold transition-colors cursor-pointer ${
                wfPreset === 'CUSTOM' ? 'bg-indigo-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              직접 날짜 지정
            </button>
          </div>
        </div>

        {/* 직접 날짜 지정 입력창 */}
        {wfPreset === 'CUSTOM' && (
          <div className="flex flex-wrap items-center gap-3 bg-gray-950/80 p-3 rounded-lg border border-indigo-500/40 text-xs">
            <span className="font-bold text-indigo-300">📅 사용자 정의 비교 구간:</span>
            <label className="flex items-center gap-1 text-gray-300">
              <span>전반기 시작일:</span>
              <input
                type="date"
                value={customDates.p1Start}
                onChange={(e) => setCustomDates((prev) => ({ ...prev, p1Start: e.target.value }))}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white font-mono"
              />
            </label>
            <label className="flex items-center gap-1 text-gray-300">
              <span>기준 분기일(전반기 종료 / 후반기 시작):</span>
              <input
                type="date"
                value={customDates.p1End}
                onChange={(e) => setCustomDates((prev) => ({ ...prev, p1End: e.target.value }))}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white font-mono"
              />
            </label>
            <label className="flex items-center gap-1 text-gray-300">
              <span>후반기 종료일:</span>
              <input
                type="date"
                value={customDates.p2End}
                onChange={(e) => setCustomDates((prev) => ({ ...prev, p2End: e.target.value }))}
                className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white font-mono"
              />
            </label>
          </div>
        )}

        {/* 요약 카드 4종 */}
        {wfSummaryStats && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="bg-emerald-950/30 border border-emerald-500/50 rounded-lg p-3 flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold text-emerald-300 flex items-center justify-between">
                  <span>🏆 전·후반기 일관성 1위 모델</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-800/80 text-white font-mono text-[11px]">
                    일관성 {wfSummaryStats.bestRobust?.consistencyScore}점
                  </span>
                </div>
                <div className="text-base font-extrabold text-white mt-1">
                  {wfSummaryStats.bestRobust?.model}
                </div>
                <div className="text-xs font-mono text-gray-300 mt-1">
                  전반기(6M~3M): <strong className="text-emerald-300">{wfSummaryStats.bestRobust?.p1.ret >= 0 ? '+' : ''}{wfSummaryStats.bestRobust?.p1.ret.toFixed(2)}%</strong>
                  {' '}➔ 후반기(3M~현재): <strong className="text-yellow-300">{wfSummaryStats.bestRobust?.p2.ret >= 0 ? '+' : ''}{wfSummaryStats.bestRobust?.p2.ret.toFixed(2)}%</strong>
                </div>
              </div>
              <button
                onClick={() => {
                  if (wfSummaryStats.bestRobust) setSelectedModelIdx(wfSummaryStats.bestRobust.modelIdx);
                }}
                className="mt-2.5 w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-1.5 px-3 rounded text-xs shadow cursor-pointer"
              >
                ✅ 일관성 1위 모델 즉시 선택·적용
              </button>
            </div>

            <div className="bg-sky-950/30 border border-sky-500/50 rounded-lg p-3 flex flex-col justify-between">
              <div>
                <div className="text-xs font-bold text-sky-300 flex items-center justify-between">
                  <span>🔄 역추세·횡보장 최강 일관성 모델</span>
                  <span className="px-1.5 py-0.5 rounded bg-sky-800/80 text-white font-mono text-[11px]">
                    일관성 {wfSummaryStats.bestNonTrend?.consistencyScore}점
                  </span>
                </div>
                <div className="text-base font-extrabold text-white mt-1">
                  {wfSummaryStats.bestNonTrend?.model || '-'}
                </div>
                <div className="text-xs font-mono text-gray-300 mt-1">
                  전반기: <strong className="text-sky-300">{wfSummaryStats.bestNonTrend ? `${wfSummaryStats.bestNonTrend.p1.ret >= 0 ? '+' : ''}${wfSummaryStats.bestNonTrend.p1.ret.toFixed(2)}%` : '-'}</strong>
                  {' '}➔ 후반기: <strong className="text-yellow-300">{wfSummaryStats.bestNonTrend ? `${wfSummaryStats.bestNonTrend.p2.ret >= 0 ? '+' : ''}${wfSummaryStats.bestNonTrend.p2.ret.toFixed(2)}%` : '-'}</strong>
                </div>
              </div>
              <button
                onClick={() => {
                  if (wfSummaryStats.bestNonTrend) setSelectedModelIdx(wfSummaryStats.bestNonTrend.modelIdx);
                }}
                className="mt-2.5 w-full bg-sky-600 hover:bg-sky-500 text-white font-extrabold py-1.5 px-3 rounded text-xs shadow cursor-pointer"
              >
                🔄 역추세·횡보 최강 모델 선택·적용
              </button>
            </div>

            <div className="bg-gray-900/90 border border-gray-700 rounded-lg p-3">
              <div className="text-xs font-bold text-gray-300">📊 26개 모델 과최적화 진단 요약</div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                <div className="bg-emerald-950/50 border border-emerald-700/60 rounded p-1.5">
                  <div className="text-[11px] text-emerald-300 font-bold">✅ 일관성 우수</div>
                  <div className="text-lg font-extrabold font-mono text-white">{wfSummaryStats.robustCount}개</div>
                </div>
                <div className="bg-amber-950/50 border border-amber-700/60 rounded p-1.5">
                  <div className="text-[11px] text-amber-300 font-bold">⚠️ 주의/보통</div>
                  <div className="text-lg font-extrabold font-mono text-white">{wfSummaryStats.moderateCount}개</div>
                </div>
                <div className="bg-rose-950/50 border border-rose-700/60 rounded p-1.5">
                  <div className="text-[11px] text-rose-300 font-bold">🚨 과최적화 의심</div>
                  <div className="text-lg font-extrabold font-mono text-white">{wfSummaryStats.overfitCount}개</div>
                </div>
              </div>
              <div className="text-[11px] text-gray-400 mt-2">
                구간: <span className="font-mono text-gray-200">{wfDateBounds.p1Start}~{wfDateBounds.p1End}</span> vs <span className="font-mono text-gray-200">{wfDateBounds.p1End}~{wfDateBounds.p2End}</span>
              </div>
            </div>

            <div className="bg-gray-900/90 border border-gray-700 rounded-lg p-3">
              <div className="text-xs font-bold text-purple-300">⚖️ 추세추종(21개) vs 역추세·횡보(5개) 평균 비교</div>
              <div className="mt-2 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between items-center bg-gray-800/80 px-2.5 py-1.5 rounded">
                  <span className="text-gray-300 font-sans font-bold">추세추종 평균:</span>
                  <span>
                    전반기 <strong className={wfSummaryStats.avgTrendP1 >= 0 ? 'text-teal-300' : 'text-rose-400'}>{wfSummaryStats.avgTrendP1 >= 0 ? '+' : ''}{wfSummaryStats.avgTrendP1.toFixed(2)}%</strong>
                    {' / '}
                    후반기 <strong className={wfSummaryStats.avgTrendP2 >= 0 ? 'text-teal-300' : 'text-rose-400'}>{wfSummaryStats.avgTrendP2 >= 0 ? '+' : ''}{wfSummaryStats.avgTrendP2.toFixed(2)}%</strong>
                  </span>
                </div>
                <div className="flex justify-between items-center bg-indigo-950/60 border border-indigo-700/50 px-2.5 py-1.5 rounded">
                  <span className="text-sky-300 font-sans font-bold">역추세·횡보 평균:</span>
                  <span>
                    전반기 <strong className={wfSummaryStats.avgNonTrendP1 >= 0 ? 'text-sky-300' : 'text-rose-400'}>{wfSummaryStats.avgNonTrendP1 >= 0 ? '+' : ''}{wfSummaryStats.avgNonTrendP1.toFixed(2)}%</strong>
                    {' / '}
                    후반기 <strong className={wfSummaryStats.avgNonTrendP2 >= 0 ? 'text-sky-300' : 'text-rose-400'}>{wfSummaryStats.avgNonTrendP2 >= 0 ? '+' : ''}{wfSummaryStats.avgNonTrendP2.toFixed(2)}%</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 모델별 전반기(6M~3M전) vs 후반기(3M전~현재) 수익률 비교 바 차트 */}
        {wfComparisonBarData.length > 0 && (
          <div className="bg-gray-950/80 border border-gray-800 rounded-lg p-3">
            <div className="flex flex-wrap justify-between items-center gap-2 mb-2">
              <span className="text-sm font-bold text-indigo-200">
                📊 26개 전체 모델 전반기({wfDateBounds.p1Start}~{wfDateBounds.p1End}) vs 후반기({wfDateBounds.p1End}~{wfDateBounds.p2End}) 수익률(%) 직관 비교
              </span>
              <span className="text-xs text-gray-400">
                * 두 막대(전반기 파란색 · 후반기 에메랄드색)가 모두 양(+)이고 높이가 비슷할수록 과최적화가 없는 강건한 모델입니다.
              </span>
            </div>
            <div className="h-[270px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wfComparisonBarData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="shortName" stroke="#9ca3af" tick={{ fill: '#d1d5db', fontSize: 11 }} />
                  <YAxis stroke="#9ca3af" tick={{ fill: '#9ca3af', fontSize: 11 }} unit="%" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }}
                    formatter={(value: any, name: any) => [`${Number(value).toFixed(2)}%`, name]}
                    labelFormatter={(label: any, payload: any) => payload?.[0]?.payload?.fullName || label}
                  />
                  <Legend />
                  <ReferenceLine y={0} stroke="#6b7280" />
                  <Bar dataKey="전반기수익률" name="전반기 (6M전~3M전)" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="후반기수익률" name="후반기 (3M전~현재)" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* 💡 [역추세·횡보장 5대 신규 전략 모델 아이디어 및 원클릭 탑재 패널] */}
      <div className="bg-gray-800/95 p-4 rounded-xl shadow-lg border border-sky-500/50 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
          <div>
            <h3 className="text-lg font-extrabold text-sky-300 flex items-center gap-2">
              <span>💡 추세추종 한계 극복을 위한 5대 역추세(Mean-Reversion) · 횡보장(Range-Bound) 신규 모델</span>
              <span className="text-xs bg-sky-900/80 border border-sky-400/50 text-sky-200 px-2 py-0.5 rounded">
                Model 22 ~ Model 26 시뮬레이터 탑재 완료
              </span>
            </h3>
            <p className="text-xs text-gray-300 mt-1">
              기존 Model 1~21은 모두 양(+)의 가중치를 사용하는 순수 추세추종형이라 상승 추세에서는 강하지만 박스권·변동성 장세에서 고점 추격(Whipsaw)이 동시 발생할 수 있습니다. 아래 5개 비추세·역추세 모델을 클릭하면 즉시 시뮬레이션 성과와 일관성을 비교하고 실전 전략으로 선택할 수 있습니다.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5">
          {filteredModels
            .filter((m) => m.strategy_type && m.strategy_type !== 'TREND')
            .map((m) => {
              const isSel = selectedModelIdx === m.modelIdx;
              return (
                <div
                  key={m.model}
                  onClick={() => setSelectedModelIdx(isSel ? -1 : m.modelIdx)}
                  className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                    isSel
                      ? 'bg-sky-900/50 border-sky-400 shadow-lg ring-2 ring-sky-400/40'
                      : 'bg-gray-900/90 border-gray-700 hover:border-sky-500/60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-sky-950 border border-sky-600 text-sky-300 font-bold">
                        {m.strategy_label || '역추세/횡보'}
                      </span>
                      <span className="text-[11px] font-mono text-gray-400">
                        {m.weights.w1}/{m.weights.w5}/{m.weights.w20}%
                      </span>
                    </div>
                    <div className="text-sm font-extrabold text-white mt-1.5">{m.model}</div>
                    <p className="text-[11px] text-gray-400 mt-1 leading-snug">{m.strategy_desc}</p>
                  </div>
                  <div className="mt-2.5 pt-2 border-t border-gray-800 text-[11px] font-mono space-y-0.5">
                    <div className="flex justify-between">
                      <span className="text-gray-400">전반기(6~3M):</span>
                      <span className={m.wf?.p1.ret >= 0 ? 'text-teal-300 font-bold' : 'text-rose-400 font-bold'}>
                        {m.wf ? `${m.wf.p1.ret >= 0 ? '+' : ''}${m.wf.p1.ret.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">후반기(3M~현):</span>
                      <span className={m.wf?.p2.ret >= 0 ? 'text-yellow-300 font-bold' : 'text-rose-400 font-bold'}>
                        {m.wf ? `${m.wf.p2.ret >= 0 ? '+' : ''}${m.wf.p2.ret.toFixed(2)}%` : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">일관성 판정:</span>
                      <span className="text-sky-300 font-bold">{m.wf?.consistencyScore ?? '-'}점</span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* 기간 선택 버튼 */}
      <div className="flex flex-wrap gap-2">
        {periodOptions.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 text-sm font-bold rounded-md transition-colors cursor-pointer ${
              period === p 
                ? 'bg-blue-600 text-white shadow' 
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* 1. 메인 시뮬레이션 히스토리 그래프 (항상 렌더링) */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-yellow-500/40 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="text-xl font-bold text-yellow-400">
            📊 현재 설정 메인 전략 누적 수익률 추이 ({period} · 최상위 1종목 100% 집중)
          </h3>
        </div>
        <div className="h-[380px] w-full min-w-0 bg-gray-900/60 rounded-lg p-2 min-h-[350px]">
          {mainChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={350} minWidth={0}>
              <LineChart data={mainChartData} margin={{ top: 15, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{fill: '#9ca3af'}} minTickGap={30} />
                <YAxis domain={['auto', 'auto']} stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
                  itemStyle={{ color: '#e5e7eb' }}
                  labelStyle={{ color: '#9ca3af', fontWeight: 'bold' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="Strategy" 
                  name="메인 전략 수익률 (Base=100)"
                  stroke="#fbbf24" 
                  strokeWidth={3.5} 
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full flex items-center justify-center text-gray-500">
              시뮬레이션 그래프 데이터를 로딩 중입니다...
            </div>
          )}
        </div>
      </div>

      {/* 26개 모델 다중 차트 & 과최적화 일관성 통합 비교 표 */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-teal-500/50 space-y-4">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
          <h3 className="text-xl font-bold text-teal-300">
            📈 26개 모델 (추세 21 + 역추세·횡보 5) {period} 누적 수익률 & 전·후반기 일관성 비교
          </h3>
          
          {!runningSimulator && filteredModels.length > 0 && (
            <div className="flex gap-2 items-center flex-wrap">
              <div className="flex gap-2 items-center bg-gray-900 px-3 py-1.5 rounded border border-gray-700 text-xs sm:text-sm">
                <span className="text-gray-400">선택 모델 비중(1/5/20일):</span>
                <span className="font-mono font-bold text-white">
                  {selectedModelIdx !== -1 && models[selectedModelIdx]
                    ? `${models[selectedModelIdx].weights.w1}% / ${models[selectedModelIdx].weights.w5}% / ${models[selectedModelIdx].weights.w20}%`
                    : '- / - / -'}
                </span>
              </div>

              <button
                onClick={() => {
                  if (wfSummaryStats?.bestRobust) {
                    setSelectedModelIdx(wfSummaryStats.bestRobust.modelIdx);
                  }
                }}
                className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm px-3 py-1.5 rounded shadow font-bold cursor-pointer"
              >
                🛡️ 전·후반기 일관성 1위 선택
              </button>
              
              <button 
                onClick={() => {
                  const sorted = [...filteredModels].sort((a, b) => b.total_ret - a.total_ret);
                  if(sorted.length > 0) {
                    const bestModelStr = sorted[0].model;
                    const idx = models.findIndex(m => m.model === bestModelStr);
                    if (idx !== -1) setSelectedModelIdx(idx);
                  }
                }}
                className="bg-yellow-600 hover:bg-yellow-500 text-white text-xs sm:text-sm px-3 py-1.5 rounded shadow font-bold cursor-pointer"
              >
                ✨ 최고 수익률 모델 선택
              </button>

              <button 
                onClick={() => {
                  const sorted = [...filteredModels].sort((a, b) => {
                    if (b.mdd !== a.mdd) return b.mdd - a.mdd;
                    if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate;
                    return b.total_ret - a.total_ret;
                  });
                  if(sorted.length > 0) {
                    const bestModelStr = sorted[0].model;
                    const idx = models.findIndex(m => m.model === bestModelStr);
                    if (idx !== -1) setSelectedModelIdx(idx);
                  }
                }}
                className="bg-pink-600 hover:bg-pink-500 text-white text-xs sm:text-sm px-3 py-1.5 rounded shadow font-bold cursor-pointer"
              >
                ✨ MDD 방어 최적 모델 추천
              </button>
            </div>
          )}
        </div>
        
        <div className="h-[400px] w-full min-w-0 bg-gray-900/50 rounded-lg p-2">
          {runningSimulator ? (
            <div className="h-full w-full flex items-center justify-center text-gray-500 animate-pulse">시뮬레이션 실행 중...</div>
          ) : multiChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={360} minWidth={0}>
              <LineChart data={multiChartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9ca3af" tick={{fill: '#9ca3af'}} minTickGap={30} />
                <YAxis domain={['auto', 'auto']} stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
                  itemStyle={{ color: '#e5e7eb' }}
                  labelStyle={{ color: '#9ca3af', fontWeight: 'bold' }}
                />
                {models.map((m, idx) => (
                  <Line
                    key={`model_${idx}`}
                    type="monotone"
                    dataKey={`model_${idx}`}
                    name={m.model}
                    stroke={getLineColor(idx)}
                    strokeWidth={selectedModelIdx === idx ? 5 : (m.strategy_type && m.strategy_type !== 'TREND' ? 2.5 : 1.4)}
                    strokeDasharray={m.strategy_type && m.strategy_type !== 'TREND' && selectedModelIdx !== idx ? '5 3' : undefined}
                    dot={false}
                    opacity={selectedModelIdx === -1 || selectedModelIdx === idx ? 1 : 0.2}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center text-gray-500">
              <span className="text-3xl mb-3">🧪</span>
              <p className="mb-2">우측 상단의 '26개 전체 모델 비교 실행' 버튼을 클릭하여 시뮬레이션을 실행하세요.</p>
              <button onClick={() => handleRunSimulator()} className="mt-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded shadow font-bold">
                시뮬레이션 시작하기
              </button>
            </div>
          )}
        </div>
        
        {/* 모델 카테고리 필터 탭 */}
        <div className="flex flex-wrap justify-between items-center gap-2 pt-2">
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setModelCategoryFilter('ALL')}
              className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                modelCategoryFilter === 'ALL' ? 'bg-teal-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-700'
              }`}
            >
              전체 모델 ({filteredModels.length}개)
            </button>
            <button
              onClick={() => setModelCategoryFilter('TREND')}
              className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                modelCategoryFilter === 'TREND' ? 'bg-blue-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-700'
              }`}
            >
              🔥 추세추종형 (Model 1~21)
            </button>
            <button
              onClick={() => setModelCategoryFilter('NON_TREND')}
              className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                modelCategoryFilter === 'NON_TREND' ? 'bg-sky-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-700'
              }`}
            >
              🔄 역추세·횡보·방어형 (Model 22~26)
            </button>
            <button
              onClick={() => setModelCategoryFilter('ROBUST_ONLY')}
              className={`px-3 py-1.5 rounded text-xs font-bold cursor-pointer ${
                modelCategoryFilter === 'ROBUST_ONLY' ? 'bg-emerald-600 text-white' : 'bg-gray-900 text-gray-400 hover:text-white border border-gray-700'
              }`}
            >
              ✅ 과최적화 없는 일관성 우수 모델만 ({wfSummaryStats?.robustCount || 0}개)
            </button>
          </div>
          <p className="text-xs text-gray-400">
            행(Row)을 클릭하면 해당 모델의 가중치가 메인 전략에 즉시 적용됩니다.
          </p>
        </div>
        
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-left border-collapse whitespace-nowrap text-xs sm:text-sm">
            <thead>
              <tr className="bg-gray-900 text-gray-300 border-b border-gray-700">
                <th className="p-2.5">모델명 / 유형</th>
                <th className="p-2.5">가중치 (1/5/20일)</th>
                <th className="p-2.5 text-right bg-indigo-950/50 text-indigo-300 font-bold">
                  전반기 (6M~3M전)
                </th>
                <th className="p-2.5 text-right bg-indigo-950/50 text-emerald-300 font-bold">
                  후반기 (3M전~현재)
                </th>
                <th className="p-2.5 text-center bg-indigo-950/50 text-yellow-300 font-bold">
                  일관성 점수 / 과최적화 판정
                </th>
                <th className="p-2.5 text-right font-bold text-teal-400">선택기간 수익률({period})</th>
                <th className="p-2.5 text-right">샤프 지수</th>
                <th className="p-2.5 text-right font-bold text-pink-400">MDD</th>
                <th className="p-2.5 text-right">Hitting Ratio</th>
              </tr>
            </thead>
            <tbody>
              {displayedModels.map((m) => {
                const idx = m.modelIdx;
                const isSelected = selectedModelIdx === idx;
                const isNonTrend = m.strategy_type && m.strategy_type !== 'TREND';
                const wf = m.wf;
                return (
                  <tr 
                    key={idx} 
                    onClick={() => setSelectedModelIdx(isSelected ? -1 : idx)}
                    className={`cursor-pointer transition-colors border-b border-gray-800 ${
                      isSelected
                        ? 'bg-teal-900/40 border-l-4 border-l-teal-400'
                        : isNonTrend
                        ? 'bg-sky-950/15 hover:bg-sky-900/30'
                        : 'hover:bg-gray-700/60'
                    }`}
                  >
                    <td className="p-2.5 font-bold text-gray-200">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{backgroundColor: getLineColor(idx)}}></span>
                        <span>{m.model}</span>
                        {isNonTrend && (
                          <span className="px-1.5 py-0.5 rounded bg-sky-900/80 border border-sky-500/50 text-[10px] text-sky-200 font-extrabold">
                            {m.strategy_label}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-2.5 font-mono text-gray-400">
                      {m.weights.w1}% / {m.weights.w5}% / {m.weights.w20}%
                    </td>
                    <td className="p-2.5 text-right font-mono bg-indigo-950/20">
                      {wf ? (
                        <div>
                          <span className={`font-bold ${wf.p1.ret >= 0 ? 'text-blue-300' : 'text-rose-400'}`}>
                            {wf.p1.ret >= 0 ? '+' : ''}{wf.p1.ret.toFixed(2)}%
                          </span>
                          <span className="text-[10px] text-gray-400 ml-1">(#{wf.rankP1}위 · S:{wf.p1.sharpe.toFixed(2)})</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="p-2.5 text-right font-mono bg-indigo-950/20">
                      {wf ? (
                        <div>
                          <span className={`font-bold ${wf.p2.ret >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                            {wf.p2.ret >= 0 ? '+' : ''}{wf.p2.ret.toFixed(2)}%
                          </span>
                          <span className="text-[10px] text-gray-400 ml-1">(#{wf.rankP2}위 · S:{wf.p2.sharpe.toFixed(2)})</span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className="p-2.5 text-center bg-indigo-950/20">
                      {wf ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="font-mono font-extrabold text-white">{wf.consistencyScore}점</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                              wf.verdict === 'ROBUST'
                                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-300'
                                : wf.verdict === 'OVERFIT'
                                ? 'bg-rose-950/90 border-rose-500 text-rose-300'
                                : 'bg-amber-950/90 border-amber-600 text-amber-300'
                            }`}
                          >
                            {wf.verdictLabel}
                          </span>
                        </div>
                      ) : '-'}
                    </td>
                    <td className={`p-2.5 text-right font-mono font-bold ${m.total_ret >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                      {m.total_ret >= 0 ? '+' : ''}{m.total_ret.toFixed(2)}%
                    </td>
                    <td className="p-2.5 text-right font-mono text-purple-400 font-bold">{m.sharpe.toFixed(2)}</td>
                    <td className="p-2.5 text-right font-mono font-bold text-pink-400">{m.mdd !== undefined ? m.mdd.toFixed(2) + '%' : '-'}</td>
                    <td className="p-2.5 text-right font-mono">{m.win_rate !== undefined ? m.win_rate.toFixed(1) + '%' : '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 기본 단일 시뮬레이션 히스토리 표 */}
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 bg-gray-800/80">
          <h3 className="text-lg font-bold text-gray-200">단일 메인 모델 히스토리 기록 (표) - {period}</h3>
        </div>
        <div className="overflow-x-auto">
          {historyRows && historyRows.length > 0 ? (
            <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-sm">
                  <th className="p-3 border-b border-gray-700">일자 (Date)</th>
                  <th className="p-3 border-b border-gray-700 text-center">액션 (Action)</th>
                  <th className="p-3 border-b border-gray-700">선택 ETF</th>
                  <th className="p-3 border-b border-gray-700 text-right">ETF 지수 (Base=100)</th>
                  <th className="p-3 border-b border-gray-700 text-right">일일 수익률</th>
                  <th className="p-3 border-b border-gray-700 text-right">누적 수익률</th>
                </tr>
              </thead>
              <tbody className="font-mono text-sm">
                {historyRows.map((row, idx) => (
                  <tr key={`${row.date}-${idx}`} className="hover:bg-gray-700/50 border-b border-gray-800 transition-colors">
                    <td className="p-3 text-gray-300">{row.date}</td>
                    <td className="p-3 text-center">{renderActionBadge(row.action)}</td>
                    <td className="p-3">
                      {renderSelectedEtfs(row.selected)}
                    </td>
                    <td className="p-3 text-right text-gray-300">
                      {row.etfIndex !== 100 ? row.etfIndex.toFixed(2) : '-'}
                    </td>
                    <td className={`p-3 text-right font-bold ${row.dailyReturn > 0 ? 'text-red-400' : row.dailyReturn < 0 ? 'text-blue-400' : 'text-gray-400'}`}>
                      {row.dailyReturn > 0 ? '+' : ''}{row.dailyReturn.toFixed(2)}%
                    </td>
                    <td className={`p-3 text-right font-bold ${row.cumReturn > 0 ? 'text-red-400' : row.cumReturn < 0 ? 'text-blue-400' : 'text-gray-400'}`}>
                      {row.cumReturn > 0 ? '+' : ''}{row.cumReturn.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-4 text-center text-gray-500">데이터가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
