import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea
} from 'recharts';

// ETF 색상 매핑
const ETF_COLORS: Record<string, string> = {
  EWY: "#3b82f6", // blue
  EWJ: "#ef4444", // red
  SPY: "#10b981", // green
  QQQ: "#8b5cf6", // purple
  FXI: "#f97316", // orange
  INDA: "#facc15", // yellow
  EWZ: "#14b8a6", // teal
  EWA: "#6366f1", // indigo
  EZU: "#ec4899", // pink
  USO: "#78350f", // brown
  GLD: "#eab308", // gold
  CASH: "#9ca3af", // gray
};

export default function ETFStrategyView({ etfWeights, setEtfWeights }: { etfWeights?: any, setEtfWeights?: any }) {
  const [data, setData] = useState<any[]>([]);
  const [simData, setSimData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('YTD(26.01~)');
  const [criteria, setCriteria] = useState<string>('sharpe');
  const [topN, setTopN] = useState<number>(1);
  
  // Use props if available, otherwise fallback to local state (for standalone usage if any)
  const [localWeights, setLocalWeights] = useState({ w1: 0.5, w5: 0.3, w20: 0.2 });
  
  const [showModelSwap, setShowModelSwap] = useState(false);
  const [modelsList, setModelsList] = useState<any[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedSwapModel, setSelectedSwapModel] = useState<any>(null);
  const [previousModel, setPreviousModel] = useState<any>(null);
  const [swapHistory, setSwapHistory] = useState<any[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // 한국투자증권(KIS) 모의계좌 & 미국장 마감 10분 전(15:50 ET) 예약 자동매매(디폴트 100주, 주수 직접 입력) 상태
  const [kisAccount, setKisAccount] = useState<any>(null);
  const [kisMode, setKisMode] = useState<string>('PAPER');
  const [kisCano, setKisCano] = useState<string>('44790516');
  const [kisPrdt, setKisPrdt] = useState<string>('01');
  const [kisOrderQty, setKisOrderQty] = useState<number>(100);
  const [kisOrdDvsn, setKisOrdDvsn] = useState<string>('33');
  const [kisAutoTrade, setKisAutoTrade] = useState<boolean>(true);
  const [kisLoading, setKisLoading] = useState<boolean>(false);
  const [priceRefreshing, setPriceRefreshing] = useState<boolean>(false);

  const activeWeights = etfWeights || localWeights;
  const updateWeights = setEtfWeights || setLocalWeights;

  const fetchKisEtfAccount = async (syncConfigState: boolean = false) => {
    try {
      const ts = Date.now();
      const query = `?criteria=${criteria}&top_n=${topN}&w1=${activeWeights.w1}&w5=${activeWeights.w5}&w20=${activeWeights.w20}&t=${ts}`;
      const res = await fetch(`/api/etf/kis-account${query}`, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json.data) {
          setKisAccount(json.data);
          if (syncConfigState && json.data.config) {
            const cfg = json.data.config;
            if (cfg.mode) setKisMode(cfg.mode);
            if (cfg.cano) setKisCano(cfg.cano);
            if (cfg.acnt_prdt_cd) setKisPrdt(cfg.acnt_prdt_cd);
            if (cfg.order_qty !== undefined) setKisOrderQty(Number(cfg.order_qty) || 100);
            if (cfg.ord_dvsn) setKisOrdDvsn(cfg.ord_dvsn);
            if (cfg.auto_trade_enabled !== undefined) setKisAutoTrade(Boolean(cfg.auto_trade_enabled));
          }
        }
      }
    } catch (e) {
      console.error('Failed to fetch KIS ETF account:', e);
    }
  };

  const handleSaveKisEtfConfig = async (overrides?: Record<string, any>) => {
    setKisLoading(true);
    try {
      const payload = {
        mode: overrides?.mode ?? kisMode,
        cano: overrides?.cano ?? kisCano,
        acnt_prdt_cd: overrides?.acnt_prdt_cd ?? kisPrdt,
        order_qty: overrides?.order_qty ?? kisOrderQty,
        ord_dvsn: overrides?.ord_dvsn ?? kisOrdDvsn,
        auto_trade_enabled: overrides?.auto_trade_enabled ?? kisAutoTrade,
        criteria,
        top_n: topN,
        weights: {
          w1: activeWeights.w1 > 1 ? activeWeights.w1 / 100 : activeWeights.w1,
          w5: activeWeights.w5 > 1 ? activeWeights.w5 / 100 : activeWeights.w5,
          w20: activeWeights.w20 > 1 ? activeWeights.w20 / 100 : activeWeights.w20,
        },
      };
      const res = await fetch('/api/etf/kis-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json.data) {
          setKisAccount(json.data);
          setToastMessage(
            `✅ [한투 ${payload.mode === 'LIVE' ? '실전' : '모의'}계좌 설정 저장] 계좌: ${payload.cano}-${payload.acnt_prdt_cd} | 주문수량: ${payload.order_qty}주 | 미국장 마감 10분 전(15:50 ET) 예약 자동매매: ${payload.auto_trade_enabled ? 'ON' : 'OFF'}`
          );
          setTimeout(() => setToastMessage(null), 4500);
        }
      }
    } catch (e) {
      console.error('Failed to save KIS ETF config:', e);
    } finally {
      setKisLoading(false);
    }
  };

  const handleExecuteKisEtfOrder = async (
    action: 'RESERVE_US_CLOSE' | 'AUTO_ROTATE' | 'LIQUIDATE_ALL' | 'MANUAL_ORDER',
    opts?: { ticker?: string; side?: 'BUY' | 'SELL'; qty?: number; force?: boolean }
  ) => {
    setKisLoading(true);
    try {
      const targetQty = Math.max(1, Number(opts?.qty ?? kisOrderQty) || 100);
      const res = await fetch('/api/etf/kis-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          manual_ticker: opts?.ticker,
          manual_side: opts?.side,
          manual_qty: targetQty,
          order_qty: targetQty,
          criteria,
          top_n: topN,
          w1: activeWeights.w1,
          w5: activeWeights.w5,
          w20: activeWeights.w20,
          force_rebalance: Boolean(opts?.force),
          reason:
            action === 'RESERVE_US_CLOSE'
              ? `미국장 마감 10분 전(15:50 ET) 최종 신호 기준 [기존 ETF 매도 + 신규 ETF ${targetQty}주 종가매수] 예약 자동주문`
              : action === 'AUTO_ROTATE'
              ? `미국장 종가체결(MOC) 전략 추천 ETF ${targetQty}주 즉시 교체/매수`
              : action === 'LIQUIDATE_ALL'
              ? '미국장 종가체결 보유 ETF 전량 청산 (CASH 전환)'
              : `미국장 종가체결 수동 주문 (${opts?.ticker} ${targetQty}주 ${opts?.side})`,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.account_status) {
          setKisAccount(json.account_status);
        } else {
          await fetchKisEtfAccount(false);
        }
        setToastMessage(`🚀 ${json?.message || '한투 모의계좌 미국장 예약/종가체결 주문이 처리되었습니다.'}`);
        setTimeout(() => setToastMessage(null), 5500);
      }
    } catch (e) {
      console.error('Failed to execute KIS ETF order:', e);
    } finally {
      setKisLoading(false);
    }
  };

  const handleForceRefreshEtfPrices = async () => {
    setPriceRefreshing(true);
    try {
      await fetch('/api/etf/refresh-prices', { method: 'POST' });
      const ts = Date.now();
      const query = `?criteria=${criteria}&top_n=${topN}&w1=${activeWeights.w1}&w5=${activeWeights.w5}&w20=${activeWeights.w20}&force_refresh=true&t=${ts}`;
      const [stratRes, simRes] = await Promise.all([
        fetch(`/api/etf/strategy${query}`, { cache: 'no-store' }),
        fetch(`/api/etf/simulation${query}`, { cache: 'no-store' }),
      ]);
      if (stratRes.ok && simRes.ok) {
        const stratJson = await stratRes.json();
        const simJson = await simRes.json();
        if (Array.isArray(stratJson) && stratJson.length > 0) {
          setData(stratJson);
          setSimData(simJson);
        }
      }
      await fetchKisEtfAccount(false);
      setToastMessage('⚡ 11개 글로벌/미국 ETF 실시간 현재가(USD) 및 모멘텀·샤프 시그널이 최신 시세로 즉시 업데이트되었습니다!');
      setTimeout(() => setToastMessage(null), 4000);
    } catch (e) {
      console.error('Failed to refresh ETF prices:', e);
    } finally {
      setPriceRefreshing(false);
    }
  };

  const fetchSwapHistory = async () => {
    try {
      const res = await fetch('/api/etf/swap-history');
      if (res.ok) {
        const history = await res.json();
        setSwapHistory(history);
      }
    } catch (e) {
      console.error('Failed to fetch swap history:', e);
    }
  };

  useEffect(() => {
    fetchSwapHistory();
    fetchKisEtfAccount(true);
  }, []);

  useEffect(() => {
    setModelsLoading(true);
    fetch(`/api/etf/simulation-models?criteria=${criteria}&top_n=${topN}`)
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json) && json.length > 0) {
          setModelsList(json);
          setSelectedSwapModel((prev: any) => {
            if (prev) {
              const found = json.find((m: any) => m.model === prev.model);
              if (found) return found;
            }
            const curW1 = Math.round(activeWeights.w1 > 1 ? activeWeights.w1 : activeWeights.w1 * 100);
            const curW5 = Math.round(activeWeights.w5 > 1 ? activeWeights.w5 : activeWeights.w5 * 100);
            const curW20 = Math.round(activeWeights.w20 > 1 ? activeWeights.w20 : activeWeights.w20 * 100);
            const matchedIdx = json.findIndex((m: any) => 
              Math.abs(m.weights.w1 - curW1) <= 1 &&
              Math.abs(m.weights.w5 - curW5) <= 1 &&
              Math.abs(m.weights.w20 - curW20) <= 1
            );
            if (matchedIdx !== -1 && matchedIdx + 1 < json.length) {
              return json[matchedIdx + 1];
            }
            return json.length > 1 ? json[1] : json[0];
          });
        }
      })
      .catch(err => console.error('Error fetching simulation models:', err))
      .finally(() => setModelsLoading(false));
  }, [criteria, topN]);

  // Determine current active model matching activeWeights
  const currentModel = useMemo(() => {
    if (!modelsList || modelsList.length === 0) return null;
    const w1_pct = Math.round(activeWeights.w1 > 1 ? activeWeights.w1 : activeWeights.w1 * 100);
    const w5_pct = Math.round(activeWeights.w5 > 1 ? activeWeights.w5 : activeWeights.w5 * 100);
    const w20_pct = Math.round(activeWeights.w20 > 1 ? activeWeights.w20 : activeWeights.w20 * 100);

    const matched = modelsList.find((m: any) =>
      Math.abs(m.weights.w1 - w1_pct) <= 1 &&
      Math.abs(m.weights.w5 - w5_pct) <= 1 &&
      Math.abs(m.weights.w20 - w20_pct) <= 1
    );
    return matched || modelsList[0];
  }, [modelsList, activeWeights]);

  // Effective model comparison target (if selected in modal use selectedSwapModel, otherwise fallback to previousModel)
  const displaySwapTarget = useMemo(() => {
    if (selectedSwapModel) return selectedSwapModel;
    if (previousModel && currentModel && previousModel.model !== currentModel.model) return previousModel;
    if (modelsList.length > 1 && currentModel) {
      return modelsList.find((m: any) => m.model !== currentModel.model) || modelsList[1];
    }
    return null;
  }, [selectedSwapModel, previousModel, currentModel, modelsList]);

  const compareChartData = useMemo(() => {
    const target = selectedSwapModel || displaySwapTarget;
    if (!currentModel || !target || !currentModel.dates) return [];
    const dates = currentModel.dates;
    const currStrat = currentModel.strategy;
    const swapStrat = target.strategy;

    return dates.map((d: string, idx: number) => ({
      date: d,
      [currentModel.model || '현재 모델']: currStrat ? currStrat[idx] : 100,
      [target.model || '비교/교체 모델']: swapStrat ? swapStrat[idx] : 100
    }));
  }, [currentModel, selectedSwapModel, displaySwapTarget]);

  const handleApplyModelSwap = async () => {
    if (!selectedSwapModel) return;
    
    const fromModelName = currentModel ? currentModel.model : '적용 모델';
    const fromW = currentModel ? `${currentModel.weights.w1}/${currentModel.weights.w5}/${currentModel.weights.w20}` : `${activeWeights.w1*100}/${activeWeights.w5*100}/${activeWeights.w20*100}`;
    const fromRet = currentModel ? currentModel.total_ret : 0;
    const fromSharpe = currentModel ? currentModel.sharpe : 0;

    const toModelName = selectedSwapModel.model;
    const toW = `${selectedSwapModel.weights.w1}/${selectedSwapModel.weights.w5}/${selectedSwapModel.weights.w20}`;
    const toRet = selectedSwapModel.total_ret;
    const toSharpe = selectedSwapModel.sharpe;

    // 1. Save to Backend DB
    try {
      await fetch('/api/etf/save-model-swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_model: fromModelName,
          from_weights: fromW,
          from_ret: fromRet,
          from_sharpe: fromSharpe,
          to_model: toModelName,
          to_weights: toW,
          to_ret: toRet,
          to_sharpe: toSharpe,
          criteria: criteria,
          top_n: topN
        })
      });
      fetchSwapHistory();
    } catch (err) {
      console.error('Failed to save model swap:', err);
    }

    // 2. Track previous model state before update
    if (currentModel) {
      setPreviousModel({ ...currentModel });
    }

    // 3. Update weights
    const normWeights = {
      w1: selectedSwapModel.weights.w1 > 1 ? selectedSwapModel.weights.w1 / 100 : selectedSwapModel.weights.w1,
      w5: selectedSwapModel.weights.w5 > 1 ? selectedSwapModel.weights.w5 / 100 : selectedSwapModel.weights.w5,
      w20: selectedSwapModel.weights.w20 > 1 ? selectedSwapModel.weights.w20 / 100 : selectedSwapModel.weights.w20,
    };
    updateWeights(normWeights);
    setShowModelSwap(false);

    // 4. Show Notification Toast
    setToastMessage(`✅ 모델이 성공적으로 저장 및 교체되었습니다! (${fromModelName} ➔ ${toModelName})`);
    setTimeout(() => setToastMessage(null), 4000);
  };


  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const fetchData = async () => {
      if (!pollInterval) setLoading(true);
      try {
        const ts = Date.now();
        const query = `?criteria=${criteria}&top_n=${topN}&w1=${activeWeights.w1}&w5=${activeWeights.w5}&w20=${activeWeights.w20}&t=${ts}`;
        const [stratRes, simRes] = await Promise.all([
          fetch(`/api/etf/strategy${query}`, { cache: 'no-store' }),
          fetch(`/api/etf/simulation${query}`, { cache: 'no-store' })
        ]);
        if (!stratRes.ok || !simRes.ok) {
          console.error('ETF Strategy API Error:', stratRes.statusText, simRes.statusText);
          if (isMounted) setLoading(false);
          return;
        }
        const stratJson = await stratRes.json();
        const simJson = await simRes.json();
        
        if (isMounted && Array.isArray(stratJson) && stratJson.length > 0) {
          setData(stratJson);
          setSimData(simJson);
        }
        if (isMounted) {
          fetchKisEtfAccount(false);
        }
      } catch (err) {
        console.error('ETF Strategy fetch exception:', String(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    pollInterval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 30000);

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [criteria, topN, activeWeights]);



  const chartData = useMemo(() => {
    if (!simData || !simData.dates) return [];
    
    // 1. 전체 데이터를 객체 배열로 변환
    const allData = simData.dates.map((date: string, i: number) => {
      const point: any = {
        date,
        originalStrategy: simData.strategy[i],
        Selected: simData.selected_etf[i]
      };
      if (simData.etfs) {
        Object.keys(simData.etfs).forEach(ticker => {
          point[`original_${ticker}`] = simData.etfs[ticker][i];
        });
      }
      return point;
    });

    // 2. 선택된 기간에 따른 시작일 계산
    let startDate = '1900-01-01';
    const today = new Date();
    
    if (period === 'YTD(26.01~)') {
      startDate = '2026-01-02';
    } else if (period === '3개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '6개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '12개월') {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().split('T')[0];
    }

    // 3. 데이터 필터링
    const filteredData = allData.filter((d: any) => d.date >= startDate);
    
    if (filteredData.length === 0) return [];

    // 4. Base 100 리베이싱(Re-basing)
    const baseStrategy = filteredData[0].originalStrategy;
    const baseEtfs: any = {};
    if (simData.etfs) {
      Object.keys(simData.etfs).forEach(ticker => {
        baseEtfs[ticker] = filteredData[0][`original_${ticker}`];
      });
    }

    return filteredData.map((d: any) => {
      const newPoint: any = {
        date: d.date,
        Selected: d.Selected,
        Strategy: (d.originalStrategy / baseStrategy) * 100
      };
      Object.keys(baseEtfs).forEach(ticker => {
        if (baseEtfs[ticker] > 0) {
          newPoint[ticker] = (d[`original_${ticker}`] / baseEtfs[ticker]) * 100;
        } else {
          newPoint[ticker] = 100;
        }
      });
      return newPoint;
    });
  }, [simData, period]);

  const referenceAreas = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const areas = [];
    let startIdx = 0;
    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i].Selected !== chartData[i-1].Selected || i === chartData.length - 1) {
        if (chartData[startIdx].Selected && chartData[startIdx].Selected !== "Waiting") {
          areas.push({
            start: chartData[startIdx].date,
            end: chartData[i].date,
            etf: chartData[startIdx].Selected,
            color: ETF_COLORS[chartData[startIdx].Selected] || '#888888'
          });
        }
        startIdx = i;
      }
    }
    return areas;
  }, [chartData]);

  const simMetrics = useMemo(() => {
    if (!simData || !simData.dates || simData.dates.length === 0) {
      return { 
        totalReturn: 0, tradeCount: 0, totalFee: 0, netReturn: 0,
        hittingRatio: 0, mddPct: 0, calmarRatio: 0, sortinoRatio: 0, dailyAvgPct: 0, sharpeRatio: 0
      };
    }

    let startDate = '1900-01-01';
    const today = new Date();
    
    if (period === 'YTD(26.01~)') {
      startDate = '2026-01-02';
    } else if (period === '3개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '6개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '12개월') {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().split('T')[0];
    }

    const filtered = [];
    for (let i = 0; i < simData.dates.length; i++) {
      if (simData.dates[i] >= startDate) {
        filtered.push({
          date: simData.dates[i],
          strategy: simData.strategy[i],
          selected: simData.selected_etf[i]
        });
      }
    }

    if (filtered.length < 2) {
      return { 
        totalReturn: 0, tradeCount: 0, totalFee: 0, netReturn: 0,
        hittingRatio: 0, mddPct: 0, calmarRatio: 0, sortinoRatio: 0, dailyAvgPct: 0, sharpeRatio: 0
      };
    }

    const startVal = filtered[0].strategy;
    const endVal = filtered[filtered.length - 1].strategy;
    const totalReturn = startVal > 0 ? ((endVal / startVal) - 1) * 100 : 0;

    let tradeCount = 0;
    let winCount = 0;
    
    let peak = startVal;
    let mdd = 0;
    const dailyReturns = [];

    for (let i = 1; i < filtered.length; i++) {
      if (filtered[i].selected !== filtered[i - 1].selected && filtered[i - 1].selected !== 'Waiting') {
        tradeCount++;
      }
      
      if (filtered[i].strategy > peak) peak = filtered[i].strategy;
      const drawdown = peak > 0 ? (peak - filtered[i].strategy) / peak : 0;
      if (drawdown > mdd) mdd = drawdown;
      
      if (filtered[i-1].strategy > 0) {
        const dRet = (filtered[i].strategy - filtered[i-1].strategy) / filtered[i-1].strategy;
        dailyReturns.push(dRet);
        if (dRet > 0) winCount++;
      }
    }

    const feeRatePerTrade = 0.03;
    const totalFee = tradeCount * feeRatePerTrade;
    const netReturn = totalReturn - totalFee;

    // Advanced Metrics
    const avgDailyReturn = dailyReturns.length > 0 ? dailyReturns.reduce((a,b) => a+b, 0) / dailyReturns.length : 0;
    const stdDev = dailyReturns.length > 0 ? Math.sqrt(dailyReturns.reduce((sq, val) => sq + Math.pow(val - avgDailyReturn, 2), 0) / dailyReturns.length) : 0;
    
    const annRet = avgDailyReturn * 252;
    const annStdDev = stdDev * Math.sqrt(252);
    
    const sharpeRatio = annStdDev > 0 ? annRet / annStdDev : 0; 
    
    const negativeReturns = dailyReturns.filter(r => r < 0);
    const downsideStdDev = negativeReturns.length > 0 ? Math.sqrt(negativeReturns.reduce((sq, val) => sq + Math.pow(val - avgDailyReturn, 2), 0) / negativeReturns.length) : 0;
    const annDownsideStdDev = downsideStdDev * Math.sqrt(252);
    const sortinoRatio = annDownsideStdDev > 0 ? annRet / annDownsideStdDev : 0;
    
    const calmarRatio = mdd > 0 ? annRet / mdd : 0;
    const hittingRatio = dailyReturns.length > 0 ? (winCount / dailyReturns.length) * 100 : 0;
    const mddPct = mdd * 100;
    const dailyAvgPct = avgDailyReturn * 100;

    return { 
      totalReturn, tradeCount, totalFee, netReturn,
      hittingRatio, mddPct, calmarRatio, sortinoRatio, dailyAvgPct, sharpeRatio
    };
  }, [simData, period]);

  if (loading) return <div className="p-4 animate-pulse text-xl font-bold">ETF 전략 분석 및 백테스트 실행 중...</div>;
  if (!data || data.length === 0) return <div className="p-4 text-red-500">Failed to load ETF Strategy data.</div>;

  const topETF = data[0];
  // sharpe 지수 모드일 땐 샤프지수 값으로 현금 보유 여부를 판단하거나, 
  // 기존과 같이 momentum_score가 0.5 이하일 때로 유지할 수 있음.
  // 로직상 criteria에 따라 final_score가 결정되므로 final_score를 이용.
  const isCash = topETF && topETF.final_score <= 0.0;
  const etfTickers = simData && simData.etfs ? Object.keys(simData.etfs) : [];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const selected = payload[0].payload.Selected;
      return (
        <div className="bg-gray-900 border border-gray-700 p-3 rounded shadow-lg text-sm z-50 relative">
          <p className="font-bold mb-1 text-white">{label}</p>
          <p className="text-yellow-400 font-bold mb-2">선택된 ETF: {selected}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }} className={entry.dataKey === 'Strategy' ? 'font-bold' : ''}>
              {entry.name}: {entry.value?.toFixed(2)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const periodOptions = ['YTD(26.01~)', '3개월', '6개월', '12개월'];

  return (
    <div className="p-4 h-full overflow-y-auto space-y-6">
      
      {/* 알림 토스트 (Model Swap Saved Toast) */}
      {toastMessage && (
        <div className="bg-emerald-900/90 border border-emerald-500 text-emerald-100 px-4 py-3 rounded-xl shadow-2xl flex justify-between items-center animate-bounce">
          <span className="font-extrabold text-sm">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-emerald-300 font-bold hover:text-white ml-3">✕</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mb-4 sm:mb-6 flex-wrap">
        {/* ETF 선택 개수 (1개, 2개, 3개) 선택기 및 입력칸 */}
        <div className="bg-gray-800 p-1.5 rounded-lg flex items-center gap-2 shadow-lg border border-gray-700 flex-wrap">
          <span className="text-xs sm:text-sm font-bold text-teal-400 ml-1">🎯 종목 채택 수:</span>
          <div className="flex items-center gap-1 bg-gray-900 px-2 py-1 rounded border border-gray-600">
            <input
              type="number"
              min={1}
              max={3}
              value={topN}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val)) {
                  setTopN(Math.max(1, Math.min(3, val)));
                }
              }}
              className="w-10 bg-transparent text-center font-extrabold text-teal-300 outline-none text-sm"
            />
            <span className="text-xs text-gray-400 font-bold">개</span>
          </div>
          <div className="flex gap-1">
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setTopN(n)}
                className={`px-2.5 py-1 text-xs sm:text-sm font-bold rounded-md transition-colors ${
                  topN === n
                    ? 'bg-teal-600 text-white shadow'
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {n}개 ({n === 1 ? '100%' : n === 2 ? '50%' : '33.33%'})
              </button>
            ))}
          </div>
        </div>

        {/* 선택 기준 토글 */}
        <div className="bg-gray-800 p-1 rounded-lg flex flex-col sm:flex-row shadow-lg border border-gray-700 w-full sm:w-auto">
          <button
            onClick={() => setCriteria('momentum')}
            className={`w-full sm:w-auto px-4 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-bold transition-colors ${
              criteria === 'momentum' 
                ? 'bg-blue-600 text-white shadow' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            🔥 단순수익률(모멘텀)
          </button>
          <button
            onClick={() => setCriteria('sharpe')}
            className={`w-full sm:w-auto px-4 sm:px-5 py-2 rounded-md text-xs sm:text-sm font-bold transition-colors ${
              criteria === 'sharpe' 
                ? 'bg-purple-600 text-white shadow' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            🛡️ 위험조정수익률(샤프지수)
          </button>
        </div>
      </div>


      {/* 시뮬레이션 기간별 성과 지표 (총수익률, 매매횟수, 수수료, 실질수익률) */}
      <div className="bg-gray-800 p-4 sm:p-5 rounded-lg shadow-lg border border-gray-700 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <span className="text-lg sm:text-xl font-bold text-white">📊 시뮬레이션 기간별 성과 지표</span>
          </div>
          {/* 기간 선택 버튼 (모바일 및 데스크톱 반응형) */}
          <div className="flex flex-wrap gap-1 bg-gray-900 p-1 rounded-lg w-full sm:w-auto">
            {periodOptions.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 sm:flex-none px-2.5 py-1 text-xs sm:text-sm font-bold rounded-md transition-colors whitespace-nowrap ${
                  period === p 
                    ? 'bg-blue-600 text-white shadow' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="bg-gray-900/70 p-3 sm:p-4 rounded-lg border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">총수익률</div>
            <div className={`text-lg sm:text-2xl font-extrabold font-mono mt-1 ${simMetrics.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {simMetrics.totalReturn > 0 ? '+' : ''}{simMetrics.totalReturn.toFixed(2)}%
            </div>
          </div>
          <div className="bg-gray-900/70 p-3 sm:p-4 rounded-lg border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">매매횟수</div>
            <div className="text-lg sm:text-2xl font-extrabold font-mono text-blue-400 mt-1">
              {simMetrics.tradeCount}회
            </div>
          </div>
          <div className="bg-gray-900/70 p-3 sm:p-4 rounded-lg border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">수수료</div>
            <div className="text-lg sm:text-2xl font-extrabold font-mono text-yellow-400 mt-1">
              {simMetrics.totalFee.toFixed(2)}%
            </div>
          </div>
          <div className="bg-gray-900/70 p-3 sm:p-4 rounded-lg border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">실질수익률</div>
            <div className={`text-lg sm:text-2xl font-extrabold font-mono mt-1 ${simMetrics.netReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {simMetrics.netReturn > 0 ? '+' : ''}{simMetrics.netReturn.toFixed(2)}%
            </div>
          </div>
        </div>

        {/* 고급 성과 지표 (Advanced Metrics) */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 sm:gap-4">
          <div className="bg-gray-900/70 p-2 sm:p-3 rounded-lg border border-gray-700/60">
            <div className="text-[10px] sm:text-xs text-gray-400 font-medium">일평균수익률</div>
            <div className={`text-base sm:text-lg font-extrabold font-mono mt-1 ${simMetrics.dailyAvgPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {simMetrics.dailyAvgPct > 0 ? '+' : ''}{simMetrics.dailyAvgPct.toFixed(2)}%
            </div>
          </div>
          <div className="bg-gray-900/70 p-2 sm:p-3 rounded-lg border border-gray-700/60">
            <div className="text-[10px] sm:text-xs text-gray-400 font-medium">승률 (Hitting Ratio)</div>
            <div className="text-base sm:text-lg font-extrabold font-mono text-blue-400 mt-1">
              {simMetrics.hittingRatio.toFixed(1)}%
            </div>
          </div>
          <div className="bg-gray-900/70 p-2 sm:p-3 rounded-lg border border-gray-700/60">
            <div className="text-[10px] sm:text-xs text-gray-400 font-medium">MDD (최대낙폭)</div>
            <div className="text-base sm:text-lg font-extrabold font-mono text-red-400 mt-1">
              -{simMetrics.mddPct.toFixed(2)}%
            </div>
          </div>
          <div className="bg-gray-900/70 p-2 sm:p-3 rounded-lg border border-gray-700/60">
            <div className="text-[10px] sm:text-xs text-gray-400 font-medium">샤프 지수 (Sharpe)</div>
            <div className="text-base sm:text-lg font-extrabold font-mono text-purple-400 mt-1">
              {simMetrics.sharpeRatio.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-900/70 p-2 sm:p-3 rounded-lg border border-gray-700/60">
            <div className="text-[10px] sm:text-xs text-gray-400 font-medium">소르티노 (Sortino)</div>
            <div className="text-base sm:text-lg font-extrabold font-mono text-indigo-400 mt-1">
              {simMetrics.sortinoRatio.toFixed(2)}
            </div>
          </div>
          <div className="bg-gray-900/70 p-2 sm:p-3 rounded-lg border border-gray-700/60">
            <div className="text-[10px] sm:text-xs text-gray-400 font-medium">칼마 지수 (Calmar)</div>
            <div className="text-base sm:text-lg font-extrabold font-mono text-pink-400 mt-1">
              {simMetrics.calmarRatio.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 bg-gradient-to-r from-blue-900 to-indigo-900 rounded-lg shadow-lg border border-blue-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-3 gap-3">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold break-keep flex flex-wrap items-center gap-2">
              <span>🏆 추천 투자 포지션</span>
              {currentModel && (
                <span className="bg-blue-950/90 text-blue-200 text-xs sm:text-sm px-3 py-1 rounded-full border border-blue-400/50 font-mono shadow-md">
                  📌 현재 운용 모델: <strong className="text-white font-extrabold">{currentModel.model}</strong> (1일 <span className="text-blue-300 font-bold">{currentModel.weights.w1}%</span>, 5일 <span className="text-purple-300 font-bold">{currentModel.weights.w5}%</span>, 20일 <span className="text-amber-300 font-bold">{currentModel.weights.w20}%</span>)
                </span>
              )}
            </h2>
            <p className="text-xs text-blue-200 mt-1">
              모멘텀 수익률 대비 변동성 리스크 고려 포트폴리오
            </p>
          </div>
          <div className="mt-2 md:mt-0 w-full md:w-auto flex flex-wrap items-center gap-2">
            {/* 주문 주수 직접 입력창 (디폴트 100주) */}
            <div className="flex items-center gap-1.5 bg-slate-950/90 border border-emerald-400/60 px-3 py-1.5 rounded-xl shadow-lg">
              <span className="text-xs font-extrabold text-emerald-300 whitespace-nowrap">주문 주수:</span>
              <input
                type="number"
                min={1}
                max={100000}
                value={kisOrderQty}
                onChange={(e) => {
                  const val = Math.max(1, parseInt(e.target.value, 10) || 1);
                  setKisOrderQty(val);
                }}
                onBlur={() => handleSaveKisEtfConfig({ order_qty: kisOrderQty })}
                className="w-20 bg-slate-900 border border-emerald-500/50 rounded px-2 py-1 text-center font-mono font-extrabold text-white text-sm outline-none focus:border-emerald-300"
              />
              <span className="text-xs font-bold text-emerald-200">주 (디폴트 100주)</span>
            </div>

            {/* 미국장 마감 10분 전(15:50 ET) 최종신호 예약 자동주문 등록 버튼 */}
            <button
              type="button"
              disabled={kisLoading}
              onClick={() => handleExecuteKisEtfOrder('RESERVE_US_CLOSE', { qty: kisOrderQty })}
              className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold shadow-xl transition-all flex items-center justify-center gap-1.5 border border-emerald-400/50 active:scale-95 cursor-pointer"
            >
              <span>📅</span>
              <span>
                {kisLoading
                  ? '예약/주문 처리중...'
                  : `미국장 마감 10분전(15:50 ET) 교체 자동주문 예약 (${kisOrderQty}주)`}
              </span>
              <span className="bg-black/40 px-2 py-0.5 text-[11px] rounded text-emerald-200 border border-emerald-400/30 font-mono">
                보유: {kisAccount?.HeldDisplay || 'CASH'} → 타겟: {kisAccount?.signal?.target_display || topETF?.ticker}({kisOrderQty}주)
              </span>
            </button>

            {/* 현재 시그널로 즉시 모의체결 실행 버튼 */}
            <button
              type="button"
              disabled={kisLoading}
              onClick={() => handleExecuteKisEtfOrder('AUTO_ROTATE', { qty: kisOrderQty, force: true })}
              className="px-3.5 py-2.5 rounded-xl text-xs font-extrabold shadow-lg bg-amber-600/90 hover:bg-amber-500 text-white border border-amber-400/50 transition-all cursor-pointer"
            >
              ⚡ 즉시 모의체결 ({kisOrderQty}주)
            </button>

            {/* 예약 자동매매 ON/OFF 토글 */}
            <button
              type="button"
              onClick={() => {
                const nextVal = !kisAutoTrade;
                setKisAutoTrade(nextVal);
                handleSaveKisEtfConfig({ auto_trade_enabled: nextVal, order_qty: kisOrderQty });
              }}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-extrabold shadow-lg border transition-all cursor-pointer ${
                kisAutoTrade
                  ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                  : 'bg-gray-900 border-gray-600 text-gray-400'
              }`}
            >
              🤖 장마감 10분전 자동예약: {kisAutoTrade ? `ON (${kisOrderQty}주)` : 'OFF'}
            </button>

            <button 
              onClick={() => setShowModelSwap(true)}
              className="w-full sm:w-auto bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold shadow-xl transition-all flex items-center justify-center gap-2 border border-blue-400/40 active:scale-95 cursor-pointer"
            >
              <span className="text-base">🔄</span>
              <span>모델 교체 & 리밸런싱</span>
              {currentModel && (
                <span className="bg-black/40 px-2 py-0.5 text-xs rounded text-blue-200 border border-blue-400/30 font-mono">
                  {currentModel.model} ({currentModel.weights.w1}/{currentModel.weights.w5}/{currentModel.weights.w20}%)
                </span>
              )}
            </button>
          </div>
        </div>

        {/* 모델 교체 및 성과 비교 모달 (Comparison Modal) */}
        {showModelSwap && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6 overflow-y-auto">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto flex flex-col my-auto">
              
              {/* Modal Header */}
              <div className="p-4 sm:p-5 border-b border-gray-800 flex justify-between items-center bg-gray-900/90 sticky top-0 z-20">
                <div>
                  <h3 className="text-xl font-extrabold text-white flex items-center gap-2">
                    🔄 ETF 투자전략 모델 교체 & 성과 비교
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    현재 운용 중인 모델과 교체 후보 모델의 가중치 및 백테스트 성과 지표를 실시간 비교합니다.
                  </p>
                </div>
                <button
                  onClick={() => setShowModelSwap(false)}
                  className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors text-lg font-bold"
                >
                  ✕
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-4 sm:p-6 space-y-6">
                
                {/* 1. Model Selector Ribbon & Dropdown */}
                <div className="space-y-2">
                  <div className="text-xs font-bold text-gray-300 flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-sm font-extrabold text-blue-300">
                      <span>🎯</span> 교체할 후보 모델 선택 (총 21개 모델 제공)
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-gray-400">모델 바로 선택:</span>
                      <select
                        value={selectedSwapModel?.model || ''}
                        onChange={(e) => {
                          const target = modelsList.find((m: any) => m.model === e.target.value);
                          if (target) setSelectedSwapModel(target);
                        }}
                        className="bg-gray-800 border border-gray-600 text-white text-xs rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:border-blue-400 cursor-pointer"
                      >
                        {modelsList.map((m: any) => (
                          <option key={m.model} value={m.model}>
                            {m.model} (1일:{m.weights.w1}% | 5일:{m.weights.w5}% | 20일:{m.weights.w20}%) — 수익률: {m.total_ret >= 0 ? '+' : ''}{m.total_ret.toFixed(1)}%
                          </option>
                        ))}
                      </select>
                      {modelsLoading && <span className="text-xs text-blue-400 animate-pulse">⏳ 로딩중...</span>}
                    </div>
                  </div>
                  
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-700">
                    {modelsList.map((m: any) => {
                      const isCurrent = currentModel && currentModel.model === m.model;
                      const isSelected = selectedSwapModel && selectedSwapModel.model === m.model;
                      return (
                        <button
                          key={m.model}
                          onClick={() => setSelectedSwapModel(m)}
                          className={`flex-shrink-0 px-3 py-2 rounded-xl text-left border transition-all min-w-[125px] cursor-pointer ${
                            isSelected
                              ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-900/50 scale-105 font-bold'
                              : isCurrent
                              ? 'bg-indigo-900/60 border-indigo-400 text-indigo-100'
                              : 'bg-gray-800/80 border-gray-700 text-gray-300 hover:bg-gray-700'
                          }`}
                        >
                          <div className="flex justify-between items-center">
                            <span className="font-bold text-xs">{m.model}</span>
                            {isCurrent && <span className="text-[10px] bg-indigo-500 text-white px-1 rounded font-bold">현재</span>}
                          </div>
                          <div className="text-[10px] opacity-90 mt-1 font-mono">
                            {m.weights.w1}/{m.weights.w5}/{m.weights.w20}%
                          </div>
                          <div className="text-[11px] font-extrabold mt-1 font-mono text-emerald-400">
                            {m.total_ret >= 0 ? '+' : ''}{m.total_ret.toFixed(1)}%
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Side-by-Side Comparison Cards */}
                {currentModel && selectedSwapModel && (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      
                      {/* Current Model Card */}
                      <div className="bg-gray-800/90 border border-gray-700 p-4 rounded-xl shadow space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-indigo-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                          현재 적용 중인 모델
                        </div>
                        
                        <div className="text-lg font-bold text-indigo-300 flex items-center gap-2">
                          📌 {currentModel.model}
                        </div>

                        <div className="bg-gray-900/80 p-2.5 rounded-lg border border-gray-800 text-xs space-y-1">
                          <div className="text-gray-400">모멘텀 가중치 비율</div>
                          <div className="font-mono text-white font-bold flex gap-3 text-sm">
                            <span>1일: <strong className="text-blue-400">{currentModel.weights.w1}%</strong></span>
                            <span>5일: <strong className="text-purple-400">{currentModel.weights.w5}%</strong></span>
                            <span>20일: <strong className="text-amber-400">{currentModel.weights.w20}%</strong></span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                            <span className="text-gray-400 text-[10px]">총수익률</span>
                            <div className={`font-bold text-sm ${currentModel.total_ret >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {currentModel.total_ret > 0 ? '+' : ''}{currentModel.total_ret.toFixed(2)}%
                            </div>
                          </div>
                          <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                            <span className="text-gray-400 text-[10px]">실질수익률</span>
                            <div className={`font-bold text-sm ${currentModel.net_ret >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {currentModel.net_ret > 0 ? '+' : ''}{currentModel.net_ret.toFixed(2)}%
                            </div>
                          </div>
                          <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                            <span className="text-gray-400 text-[10px]">샤프 지수 (Sharpe)</span>
                            <div className="font-bold text-sm text-purple-300">
                              {currentModel.sharpe.toFixed(2)}
                            </div>
                          </div>
                          <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                            <span className="text-gray-400 text-[10px]">MDD (최대낙폭)</span>
                            <div className="font-bold text-sm text-red-400">
                              -{currentModel.mdd.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Selected Target Swap Model Card */}
                      <div className="bg-gradient-to-br from-blue-950/70 to-indigo-950/70 border border-blue-500/60 p-4 rounded-xl shadow space-y-3 relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                          교체할 후보 모델
                        </div>
                        
                        <div className="text-lg font-bold text-blue-300 flex items-center gap-2">
                          🔄 {selectedSwapModel.model}
                        </div>

                        <div className="bg-gray-900/80 p-2.5 rounded-lg border border-blue-900/50 text-xs space-y-1">
                          <div className="text-gray-400">모멘텀 가중치 비율</div>
                          <div className="font-mono text-white font-bold flex gap-3 text-sm">
                            <span>1일: <strong className="text-blue-400">{selectedSwapModel.weights.w1}%</strong></span>
                            <span>5일: <strong className="text-purple-400">{selectedSwapModel.weights.w5}%</strong></span>
                            <span>20일: <strong className="text-amber-400">{selectedSwapModel.weights.w20}%</strong></span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                          <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 text-[10px]">총수익률</span>
                              {(() => {
                                const diff = selectedSwapModel.total_ret - currentModel.total_ret;
                                return (
                                  <span className={`text-[10px] font-bold px-1 rounded ${diff >= 0 ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'}`}>
                                    {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                                  </span>
                                );
                              })()}
                            </div>
                            <div className={`font-bold text-sm ${selectedSwapModel.total_ret >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {selectedSwapModel.total_ret > 0 ? '+' : ''}{selectedSwapModel.total_ret.toFixed(2)}%
                            </div>
                          </div>

                          <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 text-[10px]">실질수익률</span>
                              {(() => {
                                const diff = selectedSwapModel.net_ret - currentModel.net_ret;
                                return (
                                  <span className={`text-[10px] font-bold px-1 rounded ${diff >= 0 ? 'bg-emerald-900/60 text-emerald-300' : 'bg-rose-900/60 text-rose-300'}`}>
                                    {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                                  </span>
                                );
                              })()}
                            </div>
                            <div className={`font-bold text-sm ${selectedSwapModel.net_ret >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {selectedSwapModel.net_ret > 0 ? '+' : ''}{selectedSwapModel.net_ret.toFixed(2)}%
                            </div>
                          </div>

                          <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 text-[10px]">샤프 지수</span>
                              {(() => {
                                const diff = selectedSwapModel.sharpe - currentModel.sharpe;
                                return (
                                  <span className={`text-[10px] font-bold px-1 rounded ${diff >= 0 ? 'bg-purple-900/60 text-purple-300' : 'bg-red-900/60 text-red-300'}`}>
                                    {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="font-bold text-sm text-purple-300">
                              {selectedSwapModel.sharpe.toFixed(2)}
                            </div>
                          </div>

                          <div className="bg-gray-900/60 p-2 rounded border border-gray-800">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-400 text-[10px]">MDD</span>
                              {(() => {
                                const diff = selectedSwapModel.mdd - currentModel.mdd;
                                return (
                                  <span className={`text-[10px] font-bold px-1 rounded ${diff <= 0 ? 'bg-green-900/60 text-green-300' : 'bg-red-900/60 text-red-300'}`}>
                                    {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="font-bold text-sm text-red-400">
                              -{selectedSwapModel.mdd.toFixed(2)}%
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>

                    {/* 3. Detailed Metrics Comparison Table */}
                    <div className="bg-gray-800/80 rounded-xl p-4 border border-gray-700 space-y-2">
                      <h4 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                        📊 항목별 교체 전후 성과 세부 비교
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse font-mono whitespace-nowrap">
                          <thead>
                            <tr className="bg-gray-900 text-gray-400 border-b border-gray-700">
                              <th className="p-2 font-sans">성과 항목</th>
                              <th className="p-2 text-right">현재 ({currentModel.model})</th>
                              <th className="p-2 text-right text-blue-300">교체후 ({selectedSwapModel.model})</th>
                              <th className="p-2 text-right">성과 변화량 (Diff)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-800">
                            <tr>
                              <td className="p-2 font-sans font-medium text-gray-300">가중치 (1일 / 5일 / 20일)</td>
                              <td className="p-2 text-right">{currentModel.weights.w1}% / {currentModel.weights.w5}% / {currentModel.weights.w20}%</td>
                              <td className="p-2 text-right text-blue-300 font-bold">{selectedSwapModel.weights.w1}% / {selectedSwapModel.weights.w5}% / {selectedSwapModel.weights.w20}%</td>
                              <td className="p-2 text-right text-gray-400 font-sans">가중치 변경</td>
                            </tr>
                            <tr>
                              <td className="p-2 font-sans font-medium text-gray-300">백테스트 총 수익률</td>
                              <td className="p-2 text-right font-bold">{currentModel.total_ret.toFixed(2)}%</td>
                              <td className="p-2 text-right font-bold text-blue-300">{selectedSwapModel.total_ret.toFixed(2)}%</td>
                              <td className="p-2 text-right">
                                {(() => {
                                  const diff = selectedSwapModel.total_ret - currentModel.total_ret;
                                  return (
                                    <span className={`font-bold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                            <tr>
                              <td className="p-2 font-sans font-medium text-gray-300">실질 수익률 (수수료 반영)</td>
                              <td className="p-2 text-right font-bold text-emerald-400">{currentModel.net_ret.toFixed(2)}%</td>
                              <td className="p-2 text-right font-bold text-emerald-300">{selectedSwapModel.net_ret.toFixed(2)}%</td>
                              <td className="p-2 text-right">
                                {(() => {
                                  const diff = selectedSwapModel.net_ret - currentModel.net_ret;
                                  return (
                                    <span className={`font-bold ${diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                            <tr>
                              <td className="p-2 font-sans font-medium text-gray-300">샤프 지수 (Sharpe Ratio)</td>
                              <td className="p-2 text-right">{currentModel.sharpe.toFixed(2)}</td>
                              <td className="p-2 text-right text-purple-300 font-bold">{selectedSwapModel.sharpe.toFixed(2)}</td>
                              <td className="p-2 text-right">
                                {(() => {
                                  const diff = selectedSwapModel.sharpe - currentModel.sharpe;
                                  return (
                                    <span className={`font-bold ${diff >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                            <tr>
                              <td className="p-2 font-sans font-medium text-gray-300">MDD (최대 낙폭)</td>
                              <td className="p-2 text-right text-red-400">-{currentModel.mdd.toFixed(2)}%</td>
                              <td className="p-2 text-right text-red-400 font-bold">-{selectedSwapModel.mdd.toFixed(2)}%</td>
                              <td className="p-2 text-right">
                                {(() => {
                                  const diff = selectedSwapModel.mdd - currentModel.mdd;
                                  return (
                                    <span className={`font-bold ${diff <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                            <tr>
                              <td className="p-2 font-sans font-medium text-gray-300">매매 승률 (Win Rate)</td>
                              <td className="p-2 text-right">{currentModel.win_rate.toFixed(1)}%</td>
                              <td className="p-2 text-right text-blue-300 font-bold">{selectedSwapModel.win_rate.toFixed(1)}%</td>
                              <td className="p-2 text-right">
                                {(() => {
                                  const diff = selectedSwapModel.win_rate - currentModel.win_rate;
                                  return (
                                    <span className={`font-bold ${diff >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                                      {diff >= 0 ? '+' : ''}{diff.toFixed(1)}%p
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                            <tr>
                              <td className="p-2 font-sans font-medium text-gray-300">최근 3개월 수익률</td>
                              <td className="p-2 text-right">{currentModel.ret_3m.toFixed(2)}%</td>
                              <td className="p-2 text-right text-blue-300 font-bold">{selectedSwapModel.ret_3m.toFixed(2)}%</td>
                              <td className="p-2 text-right">
                                {(() => {
                                  const diff = selectedSwapModel.ret_3m - currentModel.ret_3m;
                                  return (
                                    <span className={`font-bold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                            <tr>
                              <td className="p-2 font-sans font-medium text-gray-300">최근 6개월 수익률</td>
                              <td className="p-2 text-right">{currentModel.ret_6m.toFixed(2)}%</td>
                              <td className="p-2 text-right text-blue-300 font-bold">{selectedSwapModel.ret_6m.toFixed(2)}%</td>
                              <td className="p-2 text-right">
                                {(() => {
                                  const diff = selectedSwapModel.ret_6m - currentModel.ret_6m;
                                  return (
                                    <span className={`font-bold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                                    </span>
                                  );
                                })()}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* 4. Strategy Return Comparison Chart */}
                    {compareChartData.length > 0 && (
                      <div className="bg-gray-800/80 rounded-xl p-4 border border-gray-700 space-y-2">
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-bold text-gray-200">
                            📈 모델간 누적 수익률 추이 비교 (Base = 100)
                          </h4>
                          <div className="flex gap-4 text-xs font-bold">
                            <span className="text-indigo-400">■ 현재: {currentModel.model}</span>
                            <span className="text-amber-400">■ 교체: {selectedSwapModel.model}</span>
                          </div>
                        </div>
                        <div className="h-[240px] w-full text-xs">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={compareChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis dataKey="date" stroke="#9ca3af" minTickGap={40} />
                              <YAxis domain={['auto', 'auto']} stroke="#9ca3af" />
                              <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }} />
                              <Line type="monotone" dataKey={currentModel.model} stroke="#818cf8" strokeWidth={2.5} dot={false} />
                              <Line type="monotone" dataKey={selectedSwapModel.model} stroke="#fbbf24" strokeWidth={2.5} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Modal Footer Actions */}
              <div className="p-4 sm:p-5 border-t border-gray-800 bg-gray-900/95 flex flex-col sm:flex-row justify-between items-center gap-4 sticky bottom-0 z-20 shadow-2xl">
                <div className="text-xs text-gray-300 text-center sm:text-left space-y-1">
                  {selectedSwapModel && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="bg-blue-900/60 border border-blue-500/40 text-blue-200 px-2.5 py-1 rounded font-mono font-bold">
                        🎯 교체 대상: <strong>{selectedSwapModel.model}</strong>
                      </span>
                      <span className="text-gray-300 font-mono">
                        (비중 1일: <strong className="text-blue-400">{selectedSwapModel.weights.w1}%</strong> | 5일: <strong className="text-purple-400">{selectedSwapModel.weights.w5}%</strong> | 20일: <strong className="text-amber-400">{selectedSwapModel.weights.w20}%</strong>)
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex gap-3 w-full sm:w-auto">
                  <button
                    onClick={() => setShowModelSwap(false)}
                    className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm font-bold transition-colors cursor-pointer"
                  >
                    취소
                  </button>
                  <button
                    disabled={!selectedSwapModel}
                    onClick={handleApplyModelSwap}
                    className="flex-1 sm:flex-none px-6 py-2.5 bg-gradient-to-r from-blue-600 via-emerald-600 to-teal-600 hover:from-blue-500 hover:to-teal-500 text-white rounded-xl text-sm font-extrabold shadow-xl transition-all disabled:opacity-50 active:scale-95 flex items-center justify-center gap-2 border border-emerald-400/40 cursor-pointer"
                  >
                    <span>💾</span>
                    <span>{selectedSwapModel?.model || '선택 모델'} 교체 저장 & 시뮬레이션 재계산</span>
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}
        {/* 상위 Top N 추천 포트폴리오 리스트 */}
        <div className="my-4">
          <div className="text-sm font-bold text-blue-200 mb-2 flex items-center gap-2">
            <span>🎯 상위 {topN}개 분산 투자 추천 포트폴리오</span>
            <span className="text-xs text-blue-300 font-normal">(동등 비중 각 {(100 / topN).toFixed(1)}%)</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {data.slice(0, topN).map((item: any, idx: number) => {
              const isItemCash = item.final_score <= 0.0;
              return (
                <div key={item.ticker || idx} className="bg-gray-900/90 border border-blue-400/40 p-3.5 rounded-lg shadow space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-600 text-white">
                      RANK #{idx + 1} ({isItemCash ? '0.0%' : `${(100 / topN).toFixed(1)}%`})
                    </span>
                    <span className="text-xs font-mono text-purple-300 font-bold">
                      {criteria === 'sharpe' ? `Sharpe: ${item.sharpe_ratio.toFixed(2)}` : `Score: ${item.momentum_score.toFixed(2)}`}
                    </span>
                  </div>

                  <div className="text-2xl font-extrabold text-yellow-400 flex items-center gap-2">
                    {isItemCash ? (
                      <span className="text-gray-400 text-lg">CASH <span className="text-xs text-gray-500 font-normal">(현금 방어)</span></span>
                    ) : (
                      <>
                        <span>{item.ticker}</span>
                        <span className="text-xs font-normal text-gray-300">({item.name})</span>
                      </>
                    )}
                  </div>

                  {!isItemCash && (
                    <>
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1 border-t border-gray-800">
                        <div>
                          <span className="text-gray-400 block text-[10px]">실시간 현재가 (USD)</span>
                          <span className="text-white font-bold">${item.current_price.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">1일 수익률</span>
                          <span className={`font-bold ${item.return_1d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {item.return_1d > 0 ? '+' : ''}{item.return_1d.toFixed(2)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">5일 수익률</span>
                          <span className={`font-bold ${item.return_5d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {item.return_5d > 0 ? '+' : ''}{item.return_5d.toFixed(2)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-400 block text-[10px]">20일 수익률</span>
                          <span className={`font-bold ${item.return_20d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {item.return_20d > 0 ? '+' : ''}{item.return_20d.toFixed(2)}%
                          </span>
                        </div>
                      </div>
                      <div className="pt-2 space-y-2 border-t border-gray-800/80">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                          <div className="flex items-center gap-1">
                            <span className="text-emerald-300 font-bold">주문 주수:</span>
                            <input
                              type="number"
                              min={1}
                              max={100000}
                              value={kisOrderQty}
                              onChange={(e) => setKisOrderQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                              onBlur={() => handleSaveKisEtfConfig({ order_qty: kisOrderQty })}
                              className="w-16 bg-slate-950 border border-emerald-500/60 rounded px-1.5 py-0.5 text-center font-extrabold text-white"
                            />
                            <span className="text-emerald-200">주</span>
                          </div>
                          <span className="text-yellow-300 font-bold">
                            예상금액: ${(item.current_price * kisOrderQty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1.5">
                          <button
                            type="button"
                            disabled={kisLoading}
                            onClick={() =>
                              handleExecuteKisEtfOrder('RESERVE_US_CLOSE', {
                                qty: kisOrderQty,
                              })
                            }
                            className="flex-1 px-2 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-extrabold shadow cursor-pointer"
                          >
                            📅 장마감 10분전 예약 ({kisOrderQty}주)
                          </button>
                          <button
                            type="button"
                            disabled={kisLoading}
                            onClick={() =>
                              handleExecuteKisEtfOrder('MANUAL_ORDER', {
                                ticker: item.ticker,
                                side: 'BUY',
                                qty: kisOrderQty,
                              })
                            }
                            className="px-2.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-extrabold shadow cursor-pointer"
                          >
                            🇺🇸 즉시 종가매수
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 🏦 한국투자증권(KIS) 모의계좌 연동 & 미국장 마감 10분 전(15:50 ET) 최종신호 예약 자동주문 센터 (디폴트 100주) */}
        <div className="mt-4 bg-slate-950/95 border-2 border-emerald-500/50 rounded-xl p-4 space-y-4 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold">
                  🏦 한국투자증권(KIS) 모의계좌 연동 · 미국장 마감 10분 전(15:50 ET) 예약 자동주문 센터
                </span>
                <span className="px-2.5 py-1 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-xs font-mono font-bold">
                  TR_ID: {kisMode === 'LIVE' ? 'TTTT1002U(매수) / TTTT1006U(매도)' : 'VTTT1002U(모의매수) / VTTT1001U(모의매도)'}
                </span>
                <span className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
                  주문수량: ETF {kisOrderQty}주 (디폴트 100주 · 직접입력) | 장마감 10분 전({kisAccount?.market_session?.auto_close_order_time_kst || '15:50 ET'}) 예약자동주문 {kisAutoTrade ? 'ON' : 'OFF'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                미국 주식시장 정규장 마감 <strong>10분 전(15:50 ET / 한국시간 동절기 05:50·서머타임 04:50)</strong>까지 집계된 최종 시그널로 <strong>기존 보유 ETF는 전량 매도(SELL)하고, 새로 선정된 1위 ETF는 입력한 주수({kisOrderQty}주, 디폴트 100주)만큼 미국장 종가체결 시스템(MOC 33 / 모의계좌 종가지정가 00 자동연동)으로 동시 예약 자동매수(BUY)</strong>합니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={priceRefreshing}
                onClick={handleForceRefreshEtfPrices}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-extrabold shadow cursor-pointer flex items-center gap-1.5"
              >
                <span>⚡</span>
                <span>{priceRefreshing ? '시세 갱신중...' : '실시간 ETF 현재가 즉시 업데이트'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextMode = 'PAPER';
                  setKisMode(nextMode);
                  handleSaveKisEtfConfig({ mode: nextMode });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                  kisMode === 'PAPER'
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🧪 한투 모의계좌 (PAPER · 기본)
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextMode = 'LIVE';
                  setKisMode(nextMode);
                  handleSaveKisEtfConfig({ mode: nextMode });
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer ${
                  kisMode === 'LIVE'
                    ? 'bg-rose-600 text-white shadow'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🔥 한투 실전계좌 (LIVE)
              </button>
            </div>
          </div>

          {/* 1. 현재 보유 포지션 vs 당일 추천 타겟 vs 미국장 마감 10분 전(15:50 ET) 예약 교체 판정 3단 요약 카드 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>① 현재 한투 모의계좌 보유 ETF (교체 시 전량 매도 대상)</span>
                <span className="font-mono text-emerald-300">
                  계좌: {kisCano}-{kisPrdt}
                </span>
              </div>
              <div className="text-lg font-extrabold text-white font-mono">
                {kisAccount?.HeldDisplay || '미보유 (CASH)'}
              </div>
              {kisAccount?.holdings && kisAccount.holdings.length > 0 ? (
                <div className="space-y-1 pt-1 border-t border-slate-800 font-mono text-[11px]">
                  {kisAccount.holdings.map((h: any) => (
                    <div key={h.ticker} className="flex items-center justify-between">
                      <span className="text-yellow-300 font-bold">
                        {h.ticker} ({h.exchange_cd}) · {h.qty}주
                      </span>
                      <span className="text-slate-300">
                        평단 ${Number(h.avg_buy_price_usd).toFixed(2)} → 현재{' '}
                        <strong className="text-white">${Number(h.curr_price_usd).toFixed(2)}</strong> (
                        <strong className={h.eval_pnl_usd >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {h.eval_pnl_usd >= 0 ? '+' : ''}${Number(h.eval_pnl_usd).toFixed(2)} /{' '}
                          {h.eval_pnl_pct >= 0 ? '+' : ''}
                          {Number(h.eval_pnl_pct).toFixed(2)}%
                        </strong>
                        )
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">
                  현재 보유 중인 미국 ETF가 없습니다. 예약 또는 즉시 실행 시 추천 1위 ETF {kisOrderQty}주가 편입됩니다.
                </div>
              )}
            </div>

            <div className="bg-slate-900/90 border border-blue-500/40 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>② 장마감 10분 전(15:50 ET) 매수 타겟 ETF ({kisOrderQty}주)</span>
                <span className="font-mono text-sky-300">
                  시세기준: {topETF?.quote_updated_at || topETF?.last_updated || '-'}
                </span>
              </div>
              <div className="text-lg font-extrabold text-yellow-300 font-mono">
                {kisAccount?.signal?.target_display
                  ? `${kisAccount.signal.target_display} (${kisOrderQty}주)`
                  : isCash
                  ? 'CASH (현금 방어)'
                  : `${topETF?.ticker} (${kisOrderQty}주)`}
              </div>
              <div className="text-[11px] text-slate-300 font-mono">
                {kisAccount?.signal?.target_details && kisAccount.signal.target_details.length > 0 ? (
                  kisAccount.signal.target_details.map((t: any) => (
                    <div key={t.ticker}>
                      • <strong>{t.ticker}</strong> ({t.exchange_cd}): 실시간 현재가{' '}
                      <strong className="text-emerald-300">${Number(t.current_price_usd).toFixed(2)}</strong> | 예약/주문수량:{' '}
                      <strong className="text-amber-300">{kisOrderQty}주</strong> (약 $
                      {(Number(t.current_price_usd) * kisOrderQty).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                    </div>
                  ))
                ) : (
                  <span>모멘텀/샤프 스코어 0 이하로 전량 현금(CASH) 방어 구간입니다.</span>
                )}
              </div>
            </div>

            <div className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>③ 장마감 10분 전(15:50 ET) 최종신호 예약 &amp; 교체 판정</span>
                <span className="font-mono text-amber-300">
                  {kisAccount?.market_session?.et_time_str || 'US Market'}
                </span>
              </div>
              <div
                className={`text-sm font-extrabold ${
                  kisAccount?.rotation_needed ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {kisAccount?.signal_status_label || '시그널 상태 조회 중...'}
              </div>
              <div className="text-[11px] text-slate-300 leading-snug">
                • <strong>예약 실행 시각:</strong> {kisAccount?.market_session?.auto_close_order_time_kst || '05:50 KST (15:50 ET · 장마감 10분 전)'}
                <br />• <strong>예약 실행 규칙:</strong> 기존 보유({kisAccount?.HeldDisplay || 'CASH'}) 전량 매도 + 장마감 10분 전 최종 1위 ETF <strong>{kisOrderQty}주</strong> 동시 종가매수
              </div>
            </div>
          </div>

          {/* 2. 계좌번호 · 주문 주수 입력(디폴트 100주) · 미국장 종가체결 방식 · 장마감 10분 전 예약 자동주문 컨트롤 바 */}
          <div className="flex flex-wrap items-end justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">한투 계좌번호(8자리)</label>
                <input
                  type="text"
                  maxLength={8}
                  value={kisCano}
                  onChange={(e) => setKisCano(e.target.value)}
                  className="w-28 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">상품코드(종합=01)</label>
                <input
                  type="text"
                  maxLength={2}
                  value={kisPrdt}
                  onChange={(e) => setKisPrdt(e.target.value)}
                  className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-emerald-300 font-bold mb-1 text-[11px]">
                  매수/교체 주문 주수 입력 (디폴트 100주)
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={kisOrderQty}
                    onChange={(e) => setKisOrderQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-24 bg-slate-950 border-2 border-emerald-500/70 rounded px-2.5 py-1.5 text-emerald-300 font-mono font-extrabold text-sm"
                  />
                  <span className="text-slate-200 font-bold mr-1">주</span>
                  {[10, 50, 100, 200, 500].map((qPreset) => (
                    <button
                      key={qPreset}
                      type="button"
                      onClick={() => {
                        setKisOrderQty(qPreset);
                        handleSaveKisEtfConfig({ order_qty: qPreset });
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-mono font-bold cursor-pointer border ${
                        kisOrderQty === qPreset
                          ? 'bg-emerald-600 text-white border-emerald-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {qPreset}주{qPreset === 100 ? '(기본)' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-amber-300 font-bold mb-1 text-[11px]">
                  미국주식 종가체결 주문유형
                </label>
                <select
                  value={kisOrdDvsn}
                  onChange={(e) => setKisOrdDvsn(e.target.value)}
                  className="bg-slate-950 border border-amber-500/50 rounded px-2.5 py-1.5 text-amber-200 font-bold"
                >
                  <option value="33">33: 미국장 종가체결 (MOC · 장마감 10분전 15:50 ET 최종신호)</option>
                  <option value="34">34: 미국장 마감지정가 (LOC · 유리한 종가체결)</option>
                  <option value="00">00: 미국장 현재가/종가 지정가 체결</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 text-emerald-300 font-extrabold cursor-pointer pb-1.5">
                <input
                  type="checkbox"
                  checked={kisAutoTrade}
                  onChange={(e) => {
                    const nextVal = e.target.checked;
                    setKisAutoTrade(nextVal);
                    handleSaveKisEtfConfig({ auto_trade_enabled: nextVal, order_qty: kisOrderQty });
                  }}
                />
                <span>미국장 마감 10분 전(15:50 ET) 최종신호 예약 자동매매 ({kisOrderQty}주)</span>
              </label>
              <button
                type="button"
                disabled={kisLoading}
                onClick={() => handleSaveKisEtfConfig()}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold cursor-pointer"
              >
                💾 주수/설정 저장
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={kisLoading}
                onClick={() =>
                  handleExecuteKisEtfOrder('RESERVE_US_CLOSE', {
                    qty: kisOrderQty,
                  })
                }
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-extrabold shadow-lg cursor-pointer"
              >
                {kisLoading
                  ? '처리중...'
                  : `📅 미국장 마감 10분전(15:50 ET) 교체 자동주문 예약 등록 (${kisOrderQty}주)`}
              </button>
              <button
                type="button"
                disabled={kisLoading}
                onClick={() =>
                  handleExecuteKisEtfOrder('AUTO_ROTATE', {
                    qty: kisOrderQty,
                    force: true,
                  })
                }
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-extrabold shadow-lg cursor-pointer"
              >
                ⚡ 현재 시그널로 즉시 모의체결 ({kisOrderQty}주)
              </button>
              <button
                type="button"
                disabled={kisLoading}
                onClick={() => handleExecuteKisEtfOrder('LIQUIDATE_ALL')}
                className="px-3 py-2 rounded-lg bg-rose-700/80 hover:bg-rose-600 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                📤 보유 ETF 전량 종가청산 (CASH)
              </button>
            </div>
          </div>

          {/* 3. 최근 미국장 종가체결 주문 실행 이력 (etf_us_kis_order_log) */}
          {kisAccount?.recent_orders && kisAccount.recent_orders.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-emerald-300">
                  📜 한투 모의계좌 미국 ETF 종가체결 주문 실행 원장 (최근 {kisAccount.recent_orders.length}건)
                </span>
                <span className="text-[11px] text-slate-400 font-mono">
                  마지막 자동매매 점검일(US): {kisAccount.config?.last_auto_traded_us_date || '-'}
                </span>
              </div>
              <div className="overflow-x-auto max-h-44 overflow-y-auto">
                <table className="w-full text-[11px] text-left border-collapse font-mono whitespace-nowrap">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 bg-slate-950 sticky top-0">
                      <th className="py-1.5 px-2">체결일시(KST)</th>
                      <th className="py-1.5 px-2">계좌/모드</th>
                      <th className="py-1.5 px-2">구분</th>
                      <th className="py-1.5 px-2">종목(거래소)</th>
                      <th className="py-1.5 px-2 text-right">주문수량</th>
                      <th className="py-1.5 px-2 text-right">종가/체결단가(USD)</th>
                      <th className="py-1.5 px-2">종가체결방식</th>
                      <th className="py-1.5 px-2">포지션 전환</th>
                      <th className="py-1.5 px-2">한투 API 응답 / 처리상태</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {kisAccount.recent_orders.map((ord: any) => (
                      <tr key={ord.id} className="hover:bg-slate-800/40">
                        <td className="py-1.5 px-2 text-slate-300">{ord.executed_at_kst}</td>
                        <td className="py-1.5 px-2 text-slate-400">
                          {ord.mode} ({ord.account_no})
                        </td>
                        <td
                          className={`py-1.5 px-2 font-bold ${
                            String(ord.side).includes('BUY')
                              ? 'text-emerald-400'
                              : String(ord.side).includes('RESERVE')
                              ? 'text-sky-400'
                              : 'text-rose-400'
                          }`}
                        >
                          {ord.side}
                        </td>
                        <td className="py-1.5 px-2 font-bold text-yellow-300">
                          {ord.ticker} <span className="text-slate-400 font-normal">({ord.exchange_cd})</span>
                        </td>
                        <td className="py-1.5 px-2 text-right font-extrabold text-white">{ord.qty}주</td>
                        <td className="py-1.5 px-2 text-right text-sky-300">
                          ${Number(ord.exec_price_usd || 0).toFixed(2)}
                        </td>
                        <td className="py-1.5 px-2 text-amber-300">{ord.ord_dvsn_label}</td>
                        <td className="py-1.5 px-2 text-slate-300">
                          {ord.prev_holding_tickers || 'CASH'} ➔ {ord.target_holding_tickers || '-'}
                        </td>
                        <td className="py-1.5 px-2 text-slate-300 font-sans">{ord.broker_msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 📊 모델 교체 전 vs 교체 후 수익률 동시 비교 차트 섹션 (Main Comparison Chart) */}
      <div className="bg-gradient-to-r from-gray-900 via-indigo-950/60 to-gray-900 p-4 sm:p-5 rounded-xl border border-indigo-500/50 shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-3 border-b border-gray-800">
          <div>
            <h3 className="text-lg sm:text-xl font-extrabold text-white flex items-center gap-2">
              📊 모델 교체 전 vs 교체 후 수익률 동시 비교 차트
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              현재 적용 모델({currentModel?.model || '현재'})과 비교/교체 모델({displaySwapTarget?.model || '비교 대상'})의 누적 수익률 추이를 Base 100 기준 동일 선상에서 겹쳐서 비교합니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowModelSwap(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow border border-indigo-400/40 flex items-center gap-1"
            >
              🔄 모델 변경 & 성과 선택
            </button>
          </div>
        </div>

        {compareChartData.length > 0 && currentModel && displaySwapTarget ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs font-mono">
              <div className="bg-indigo-900/40 p-2.5 rounded-lg border border-indigo-500/40">
                <span className="text-indigo-300 font-bold block text-[11px]">📌 현재 적용: {currentModel.model}</span>
                <span className="text-gray-400 text-[10px]">1/5/20일: {currentModel.weights.w1}/{currentModel.weights.w5}/{currentModel.weights.w20}%</span>
                <div className="font-extrabold text-sm text-indigo-200 mt-0.5">총수익: {currentModel.total_ret.toFixed(2)}% | Sharpe: {currentModel.sharpe.toFixed(2)}</div>
              </div>
              <div className="bg-amber-900/40 p-2.5 rounded-lg border border-amber-500/40">
                <span className="text-amber-300 font-bold block text-[11px]">🔄 비교/교체: {displaySwapTarget.model}</span>
                <span className="text-gray-400 text-[10px]">1/5/20일: {displaySwapTarget.weights.w1}/{displaySwapTarget.weights.w5}/{displaySwapTarget.weights.w20}%</span>
                <div className="font-extrabold text-sm text-amber-200 mt-0.5">총수익: {displaySwapTarget.total_ret.toFixed(2)}% | Sharpe: {displaySwapTarget.sharpe.toFixed(2)}</div>
              </div>
              <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
                <span className="text-gray-400 text-[10px]">수익률 격차 (Diff)</span>
                {(() => {
                  const diff = displaySwapTarget.total_ret - currentModel.total_ret;
                  return (
                    <div className={`font-bold text-sm ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                    </div>
                  );
                })()}
                <span className="text-[10px] text-gray-500">교체 시 예상 변동</span>
              </div>
              <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
                <span className="text-gray-400 text-[10px]">샤프지수 격차 (Diff)</span>
                {(() => {
                  const diff = displaySwapTarget.sharpe - currentModel.sharpe;
                  return (
                    <div className={`font-bold text-sm ${diff >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                    </div>
                  );
                })()}
                <span className="text-[10px] text-gray-500">위험조정 성과 격차</span>
              </div>
            </div>

            <div className="h-[280px] w-full text-xs bg-gray-900/90 p-2 rounded-xl border border-gray-800">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={compareChartData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" minTickGap={35} />
                  <YAxis domain={['auto', 'auto']} stroke="#9ca3af" />
                  <Tooltip contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }} />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey={currentModel.model} 
                    name={`[교체 전/현재] ${currentModel.model}`} 
                    stroke="#818cf8" 
                    strokeWidth={3} 
                    dot={false} 
                  />
                  <Line 
                    type="monotone" 
                    dataKey={displaySwapTarget.model} 
                    name={`[교체 후/비교] ${displaySwapTarget.model}`} 
                    stroke="#fbbf24" 
                    strokeWidth={3} 
                    dot={false} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="text-center py-6 text-gray-500 text-xs">
            비교 모델 데이터를 불러오는 중입니다...
          </div>
        )}

        {/* 📜 모델 교체 저장 이력 히스토리 (Swap History Log Table) */}
        {swapHistory.length > 0 && (
          <div className="pt-2 border-t border-gray-800 space-y-2">
            <h4 className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
              <span>📜 저장된 최근 모델 교체 이력 ({swapHistory.length}건)</span>
            </h4>
            <div className="overflow-x-auto max-h-[160px] overflow-y-auto scrollbar-thin">
              <table className="w-full text-[11px] text-left border-collapse font-mono whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-900 text-gray-400 border-b border-gray-800 sticky top-0">
                    <th className="p-1.5">교체 일시</th>
                    <th className="p-1.5">교체 전 모델</th>
                    <th className="p-1.5">교체 전 가중치</th>
                    <th className="p-1.5 text-right">교체 전 수익률</th>
                    <th className="p-1.5 text-center">➔</th>
                    <th className="p-1.5 text-blue-300">교체 후 모델</th>
                    <th className="p-1.5 text-blue-300">교체 후 가중치</th>
                    <th className="p-1.5 text-right text-emerald-300">교체 후 수익률</th>
                    <th className="p-1.5 text-right">수익률 변동</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {swapHistory.slice(0, 10).map((h: any) => {
                    const diff = h.to_ret - h.from_ret;
                    return (
                      <tr key={h.id} className="hover:bg-gray-800/50 transition-colors">
                        <td className="p-1.5 text-gray-400">{h.timestamp}</td>
                        <td className="p-1.5 font-bold text-indigo-300">{h.from_model}</td>
                        <td className="p-1.5 text-gray-300">{h.from_weights}</td>
                        <td className="p-1.5 text-right text-gray-300">{h.from_ret.toFixed(2)}%</td>
                        <td className="p-1.5 text-center text-blue-400 font-bold">➔</td>
                        <td className="p-1.5 font-bold text-blue-300">{h.to_model}</td>
                        <td className="p-1.5 text-blue-200">{h.to_weights}</td>
                        <td className="p-1.5 text-right font-bold text-emerald-300">{h.to_ret.toFixed(2)}%</td>
                        <td className="p-1.5 text-right">
                          <span className={`font-bold ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>


      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4">
            <h3 className="text-xl font-bold">📈 모멘텀 스위칭 전략 백테스트 (Base = 100)</h3>
            <div className="flex flex-wrap gap-1 mt-3 md:mt-0 bg-gray-900 p-1 rounded-lg w-full md:w-auto">
              {periodOptions.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`flex-1 md:flex-none px-2.5 py-1.5 md:py-1 text-xs md:text-sm font-bold rounded-md transition-colors whitespace-nowrap ${
                    period === p 
                      ? 'bg-blue-600 text-white shadow' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          
          {chartData.length > 0 ? (
            <div className="h-[400px] xl:h-[500px] w-full min-w-0 text-xs">
              <ResponsiveContainer width="100%" height={450} minWidth={0}>
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{fill: '#9ca3af'}} minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  
                  {/* 구간별 채택 ETF 배경 표시 */}
                  {referenceAreas.map((area, idx) => (
                    <ReferenceArea 
                      key={idx} 
                      x1={area.start} 
                      x2={area.end} 
                      fill={area.color} 
                      fillOpacity={0.15} 
                      label={{ position: 'insideTop', value: area.etf, fill: '#fff', fontSize: 10, fontWeight: 'bold' }} 
                    />
                  ))}

                  {/* 개별 ETF 라인 (얇게) */}
                  {etfTickers.map((ticker) => (
                    <Line 
                      key={ticker}
                      type="monotone" 
                      dataKey={ticker} 
                      stroke={ETF_COLORS[ticker] || '#8884d8'} 
                      strokeWidth={1}
                      dot={false}
                      opacity={0.4}
                    />
                  ))}

                  {/* 전략 수익률 라인 (두껍게) */}
                  <Line 
                    type="monotone" 
                    dataKey="Strategy" 
                    name="전략 수익률"
                    stroke="#fbbf24" 
                    strokeWidth={4} 
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[400px] xl:h-[500px] w-full flex items-center justify-center text-gray-500">
              데이터가 충분하지 않습니다.
            </div>
          )}
          <p className="text-sm text-gray-400 mt-2 text-center">
            배경 색상 구간은 해당 기간 동안 모멘텀 랭킹 1위로 선정되어 투자된 ETF를 나타냅니다. (시작점 = 100 기준 정규화)
          </p>
        </div>

        {/* 현재 추천 ETF 단독 차트 */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 h-auto md:h-8">
            <h3 className="text-xl font-bold flex items-center flex-wrap gap-2">
              📈 현재 1위 ETF ({topETF.ticker}) 추이
              {isCash && <span className="text-red-400 text-sm whitespace-nowrap bg-red-900/20 px-2 py-0.5 rounded border border-red-900">- 스코어 미달로 CASH 권장</span>}
            </h3>
          </div>
          
          {chartData.length > 0 ? (
            <div className="h-[400px] xl:h-[500px] w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{fill: '#9ca3af'}} minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  
                  <Line 
                    type="monotone" 
                    dataKey={topETF.ticker} 
                    name={`${topETF.ticker} 수익률`}
                    stroke={ETF_COLORS[topETF.ticker] || '#3b82f6'} 
                    strokeWidth={4} 
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[400px] xl:h-[500px] w-full flex items-center justify-center text-gray-500">
              데이터가 충분하지 않습니다.
            </div>
          )}
          <p className="text-sm text-gray-400 mt-2 text-center">
            현재 모멘텀 랭킹 1위인 {topETF.ticker}의 해당 기간 단독 수익률(Base=100)입니다.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 border-b border-gray-700 pb-2 mt-8">
        <h3 className="text-lg sm:text-xl font-bold">
          🌐 글로벌 ETF 모멘텀 랭킹 (최신 거래일: {topETF.last_updated} · 실시간 시세 동기화: {topETF.quote_updated_at || '실시간'})
        </h3>
        <button
          onClick={handleForceRefreshEtfPrices}
          disabled={priceRefreshing}
          className="px-3 py-1 bg-cyan-950/80 hover:bg-cyan-800/80 border border-cyan-500/40 rounded text-xs font-bold text-cyan-200 transition-colors cursor-pointer"
        >
          {priceRefreshing ? '⏳ 시세 조회중...' : '⚡ 실시간 ETF 현재가 새로고침'}
        </button>
      </div>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full min-w-[700px] text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-gray-800 text-gray-300">
              <th className="p-3 border-b border-gray-700 font-medium">순위</th>
              <th className="p-3 border-b border-gray-700 font-medium">티커</th>
              <th className="p-3 border-b border-gray-700 font-medium">ETF명</th>
              <th className="p-3 border-b border-gray-700 font-medium text-right">실시간 현재가 (USD)</th>
              <th className="p-3 border-b border-gray-700 font-medium text-right">1일 수익률</th>
              <th className="p-3 border-b border-gray-700 font-medium text-right">5일 수익률</th>
              <th className="p-3 border-b border-gray-700 font-medium text-right">20일 수익률</th>
              {criteria === 'sharpe' && <th className="p-3 border-b border-gray-700 font-medium text-right">모멘텀 총점</th>}
              <th className="p-3 border-b border-gray-700 font-medium text-right">{criteria === 'sharpe' ? '샤프 지수' : '모멘텀 총점'}</th>
              <th className="p-3 border-b border-gray-700 font-medium text-center">한투 모의주문 ({kisOrderQty || 100}주)</th>
            </tr>
          </thead>
          <tbody className="font-mono text-sm">
            {data.map((etf, index) => (
              <tr key={etf.ticker} className={`hover:bg-gray-800 transition-colors ${index === 0 ? 'bg-indigo-900/30' : 'border-b border-gray-800/50'}`}>
                <td className="p-3 text-center">{index + 1}</td>
                <td className="p-3 font-bold" style={{ color: ETF_COLORS[etf.ticker] || '#fbbf24' }}>{etf.ticker}</td>
                <td className="p-3 text-gray-300 font-sans">{etf.name}</td>
                <td className="p-3 text-right font-bold text-white">${etf.current_price.toFixed(2)}</td>
                <td className={`p-3 text-right ${etf.return_1d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {etf.return_1d > 0 ? '+' : ''}{etf.return_1d.toFixed(2)}%
                </td>
                <td className={`p-3 text-right ${etf.return_5d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {etf.return_5d > 0 ? '+' : ''}{etf.return_5d.toFixed(2)}%
                </td>
                <td className={`p-3 text-right ${etf.return_20d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {etf.return_20d > 0 ? '+' : ''}{etf.return_20d?.toFixed(2)}%
                </td>
                {criteria === 'sharpe' && (
                  <td className="p-3 text-right text-gray-400">
                    {etf.momentum_score.toFixed(2)}
                  </td>
                )}
                <td className="p-3 text-right font-bold text-blue-300">
                  {etf.final_score.toFixed(2)}
                </td>
                <td className="p-3 text-center font-sans">
                  <button
                    onClick={() =>
                      handleExecuteKisEtfOrder('MANUAL_ORDER', {
                        ticker: etf.ticker,
                        side: 'BUY',
                        qty: kisOrderQty || 100,
                      })
                    }
                    disabled={kisLoading}
                    className="px-2 py-1 bg-emerald-900/70 hover:bg-emerald-700/80 border border-emerald-500/40 rounded text-[11px] font-bold text-emerald-200 transition-colors cursor-pointer"
                  >
                    종가매수 ({kisOrderQty || 100}주)
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
