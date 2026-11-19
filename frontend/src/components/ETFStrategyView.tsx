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

export default function ETFStrategyView({
  etfWeights,
  setEtfWeights,
  userId,
  isAdmin,
  userName,
  onOpenAccountModal,
}: {
  etfWeights?: any;
  setEtfWeights?: any;
  userId?: string;
  isAdmin?: boolean;
  userName?: string;
  onOpenAccountModal?: () => void;
}) {
  const effectiveUserId = useMemo(() => {
    if (userId && userId.trim()) return userId.trim();
    if (typeof window !== 'undefined') {
      const savedUid = sessionStorage.getItem('stock_terminal_user_id');
      if (savedUid && savedUid.trim()) return savedUid.trim();
      const savedAdmin = sessionStorage.getItem('stock_terminal_is_admin') === 'true';
      return savedAdmin ? 'admin' : 'guest';
    }
    return 'admin';
  }, [userId]);

  const effectiveIsAdmin = useMemo(() => {
    if (typeof isAdmin === 'boolean') return isAdmin;
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('stock_terminal_is_admin') === 'true';
    }
    return effectiveUserId === 'admin';
  }, [isAdmin, effectiveUserId]);

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

  // 회원별 개별 증권사 계좌 & 미국장 마감 10분 전(15:50 ET) 예약 자동매매 상태 (디폴트 주문금액: 5,000만 원 한도 내 ETF 가격별 수량 산출)
  const [kisAccount, setKisAccount] = useState<any>(null);
  const [kisBrokerCode, setKisBrokerCode] = useState<string>('KIS');
  const [kisMode, setKisMode] = useState<string>('PAPER');
  const [kisCano, setKisCano] = useState<string>(effectiveUserId === 'admin' ? '44790516' : '');
  const [kisPrdt, setKisPrdt] = useState<string>('01');
  const [kisOrderBudgetKrw, setKisOrderBudgetKrw] = useState<number>(50000000);
  const [kisOrderQty, setKisOrderQty] = useState<number>(100);
  const [kisOrdDvsn, setKisOrdDvsn] = useState<string>('33');
  const [kisAutoTrade, setKisAutoTrade] = useState<boolean>(effectiveUserId === 'admin');
  const [kisLoading, setKisLoading] = useState<boolean>(false);
  const [priceRefreshing, setPriceRefreshing] = useState<boolean>(false);
  const [cashThreshold, setCashThreshold] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('etf_cash_threshold_annual');
      if (saved !== null && !isNaN(Number(saved))) return Number(saved);
    }
    return 10;
  });
  const [cashThresholdInput, setCashThresholdInput] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('etf_cash_threshold_annual');
      if (saved !== null && !isNaN(Number(saved))) return String(Number(saved));
    }
    return '10';
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('etf_cash_threshold_annual', String(cashThreshold));
    }
  }, [cashThreshold]);

  const activeWeights = etfWeights || localWeights;
  const updateWeights = setEtfWeights || setLocalWeights;

  const usdKrwRate = Number(
    kisAccount?.signal?.usd_krw_rate || kisAccount?.config?.usd_krw_rate || 1400
  );

  // 선택된 ETF 개수(activeCount)와 총 주문 한도 금액(kisOrderBudgetKrw, 디폴트 5천만원)을 넘지 않도록 각 ETF 가격으로 나눈 수량 계산 (연 cashThreshold% 이하 시 CASH)
  const activeTargetItems = useMemo(() => {
    return data.slice(0, topN).filter((it: any) =>
      it?.is_selected !== undefined ? Boolean(it.is_selected) : Number(it?.final_score || 0) > 0
    );
  }, [data, topN]);

  const calcEtfOrderFromBudget = (priceUsd: number, targetCount?: number) => {
    const n = Math.max(1, targetCount ?? (activeTargetItems.length || topN || 1));
    const budget = Math.max(100000, Number(kisOrderBudgetKrw) || 50000000);
    const allocKrw = Math.floor(budget / n);
    const pUsd = Math.max(0.01, Number(priceUsd) || 0);
    const pKrw = pUsd * usdKrwRate;
    let qty = pKrw > 0 ? Math.max(0, Math.floor(allocKrw / pKrw)) : 0;
    let estKrw = Math.round(qty * pKrw);
    if (estKrw > allocKrw && qty > 0) {
      qty -= 1;
      estKrw = Math.round(qty * pKrw);
    }
    const estUsd = Number((qty * pUsd).toFixed(2));
    return {
      qty,
      allocKrw,
      priceKrw: Math.round(pKrw),
      estKrw,
      estUsd,
    };
  };

  const formatKrwMan = (krw: number) => {
    const v = Math.round(Number(krw) || 0);
    if (v >= 100000000 && v % 100000000 === 0) return `${(v / 100000000).toLocaleString()}억원`;
    if (v >= 10000 && v % 10000 === 0) return `${(v / 10000).toLocaleString()}만원`;
    return `${v.toLocaleString()}원`;
  };

  const fetchKisEtfAccount = async (syncConfigState: boolean = false) => {
    try {
      const ts = Date.now();
      const query = `?criteria=${criteria}&top_n=${topN}&w1=${activeWeights.w1}&w5=${activeWeights.w5}&w20=${activeWeights.w20}&user_id=${encodeURIComponent(effectiveUserId)}&order_budget_krw=${kisOrderBudgetKrw}&t=${ts}`;
      const res = await fetch(`/api/etf/kis-account${query}`, {
        cache: 'no-store',
        headers: { 'x-user-id': effectiveUserId },
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json.data) {
          setKisAccount(json.data);
          if (syncConfigState && json.data.config) {
            const cfg = json.data.config;
            if (cfg.broker_code) setKisBrokerCode(cfg.broker_code);
            if (cfg.mode) setKisMode(cfg.mode);
            setKisCano(cfg.cano || '');
            setKisPrdt(cfg.acnt_prdt_cd || '01');
            if (cfg.order_budget_krw !== undefined) {
              setKisOrderBudgetKrw(Number(cfg.order_budget_krw) || 50000000);
            }
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
      const nextBudgetKrw = Math.max(
        100000,
        Number(overrides?.order_budget_krw ?? kisOrderBudgetKrw) || 50000000
      );
      const payload = {
        user_id: effectiveUserId,
        broker_code: overrides?.broker_code ?? kisBrokerCode,
        mode: overrides?.mode ?? kisMode,
        cano: overrides?.cano ?? kisCano,
        acnt_prdt_cd: overrides?.acnt_prdt_cd ?? kisPrdt,
        order_budget_krw: nextBudgetKrw,
        order_qty: overrides?.order_qty ?? kisOrderQty,
        ord_dvsn: overrides?.ord_dvsn ?? kisOrdDvsn,
        auto_trade_enabled: overrides?.auto_trade_enabled ?? kisAutoTrade,
        criteria,
        top_n: topN,
        weights: {
          w1: Math.abs(activeWeights.w1) > 1 ? activeWeights.w1 / 100 : activeWeights.w1,
          w5: Math.abs(activeWeights.w5) > 1 ? activeWeights.w5 / 100 : activeWeights.w5,
          w20: Math.abs(activeWeights.w20) > 1 ? activeWeights.w20 / 100 : activeWeights.w20,
        },
      };
      const res = await fetch('/api/etf/kis-config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': effectiveUserId,
        },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.success && json.data) {
          setKisAccount(json.data);
          const bName = json.data.config?.broker_name || '증권사';
          const tgtSummary = json.data.signal?.target_with_qty_display || '-';
          setToastMessage(
            `✅ [${bName} ${payload.mode === 'LIVE' ? '실전' : '모의'}계좌 설정 저장] 계좌: ${payload.cano}-${payload.acnt_prdt_cd} | 총 주문 한도: ${nextBudgetKrw.toLocaleString()}원 (${tgtSummary}) | 장마감 10분 전(15:50 ET) 예약 자동매매: ${payload.auto_trade_enabled ? 'ON' : 'OFF'}`
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
    opts?: { ticker?: string; side?: 'BUY' | 'SELL'; qty?: number; budgetKrw?: number; force?: boolean }
  ) => {
    if (effectiveUserId !== 'admin' && !kisAccount?.config?.is_connected) {
      if (onOpenAccountModal) {
        onOpenAccountModal();
      } else {
        setToastMessage('🔒 먼저 본인 증권사 계좌를 연결해 주세요.');
        setTimeout(() => setToastMessage(null), 4000);
      }
      return;
    }

    setKisLoading(true);
    try {
      const targetBudgetKrw = Math.max(
        100000,
        Number(opts?.budgetKrw ?? kisOrderBudgetKrw) || 50000000
      );
      const targetQty = opts?.qty !== undefined ? Math.max(1, Number(opts.qty)) : undefined;
      const res = await fetch('/api/etf/kis-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': effectiveUserId,
        },
        body: JSON.stringify({
          user_id: effectiveUserId,
          action,
          manual_ticker: opts?.ticker,
          manual_side: opts?.side,
          manual_qty: targetQty,
          order_qty: targetQty,
          order_budget_krw: targetBudgetKrw,
          criteria,
          top_n: topN,
          w1: activeWeights.w1,
          w5: activeWeights.w5,
          w20: activeWeights.w20,
          force_rebalance: Boolean(opts?.force),
          reason:
            action === 'RESERVE_US_CLOSE'
              ? `미국장 마감 10분 전(15:50 ET) 최종 신호 기준 [기존 ETF 매도 + 총 ${formatKrwMan(targetBudgetKrw)} 한도 내 신규 ETF 종가매수] 예약 자동주문`
              : action === 'AUTO_ROTATE'
              ? `미국장 종가체결(MOC) 총 ${formatKrwMan(targetBudgetKrw)} 한도 내 전략 추천 ETF 즉시 교체/매수`
              : action === 'LIQUIDATE_ALL'
              ? '미국장 종가체결 보유 ETF 전량 청산 (CASH 전환)'
              : `미국장 종가체결 수동 주문 (${opts?.ticker} ${targetQty || ''}주 ${opts?.side})`,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.account_status) {
          setKisAccount(json.account_status);
        } else {
          await fetchKisEtfAccount(false);
        }
        setToastMessage(`🚀 ${json?.message || '미국장 예약/종가체결 주문이 처리되었습니다.'}`);
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
      const query = `?criteria=${criteria}&top_n=${topN}&w1=${activeWeights.w1}&w5=${activeWeights.w5}&w20=${activeWeights.w20}&cash_threshold=${cashThreshold}&force_refresh=true&t=${ts}`;
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
      const res = await fetch(`/api/etf/swap-history?user_id=${encodeURIComponent(effectiveUserId)}`, {
        headers: { 'x-user-id': effectiveUserId },
      });
      if (res.ok) {
        const history = await res.json();
        setSwapHistory(Array.isArray(history) ? history : []);
      }
    } catch (e) {
      console.error('Failed to fetch swap history:', e);
    }
  };

  useEffect(() => {
    fetchSwapHistory();
    fetchKisEtfAccount(true);
  }, [effectiveUserId]);

  useEffect(() => {
    setModelsLoading(true);
    fetch(`/api/etf/simulation-models?criteria=${criteria}&top_n=${topN}&cash_threshold=${cashThreshold}`)
      .then(res => res.json())
      .then(json => {
        if (Array.isArray(json) && json.length > 0) {
          setModelsList(json);
          setSelectedSwapModel((prev: any) => {
            if (prev) {
              const found = json.find((m: any) => m.model === prev.model);
              if (found) return found;
            }
            const curW1 = Math.round(Math.abs(activeWeights.w1) > 1 ? activeWeights.w1 : activeWeights.w1 * 100);
            const curW5 = Math.round(Math.abs(activeWeights.w5) > 1 ? activeWeights.w5 : activeWeights.w5 * 100);
            const curW20 = Math.round(Math.abs(activeWeights.w20) > 1 ? activeWeights.w20 : activeWeights.w20 * 100);
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
  }, [criteria, topN, cashThreshold]);

  // Determine current active model matching activeWeights
  const currentModel = useMemo(() => {
    if (!modelsList || modelsList.length === 0) return null;
    const w1_pct = Math.round(Math.abs(activeWeights.w1) > 1 ? activeWeights.w1 : activeWeights.w1 * 100);
    const w5_pct = Math.round(Math.abs(activeWeights.w5) > 1 ? activeWeights.w5 : activeWeights.w5 * 100);
    const w20_pct = Math.round(Math.abs(activeWeights.w20) > 1 ? activeWeights.w20 : activeWeights.w20 * 100);

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

  const { compareChartData, comparePeriodStats } = useMemo(() => {
    const target = selectedSwapModel || displaySwapTarget;
    const defaultStats = {
      currRet: currentModel?.total_ret ?? 0,
      currSharpe: currentModel?.sharpe ?? 0,
      swapRet: target?.total_ret ?? 0,
      swapSharpe: target?.sharpe ?? 0,
      kospiRet: 0,
      kospiSharpe: 0,
      startDateLabel: '',
      endDateLabel: '',
    };
    if (!currentModel || !target || !currentModel.dates || currentModel.dates.length === 0) {
      return { compareChartData: [], comparePeriodStats: defaultStats };
    }

    const dates: string[] = currentModel.dates;
    const currStrat: number[] = currentModel.strategy || [];
    const swapStrat: number[] = target.strategy || [];
    const kospiSeries: number[] =
      (currentModel.kospi && currentModel.kospi.length === dates.length
        ? currentModel.kospi
        : simData?.kospi && simData.kospi.length === dates.length
        ? simData.kospi
        : simData?.etfs?.EWY && simData.etfs.EWY.length === dates.length
        ? simData.etfs.EWY
        : []) || [];

    // 상단 선택된 기간(period)에 맞춰 시작일 계산
    let startDate = '1900-01-01';
    const latestDateStr = dates[dates.length - 1];
    const refDate = latestDateStr ? new Date(latestDateStr + 'T00:00:00') : new Date();

    if (period === 'YTD(26.01~)') {
      startDate = '2026-01-02';
    } else if (period === '3개월') {
      const d = new Date(refDate);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '6개월') {
      const d = new Date(refDate);
      d.setMonth(d.getMonth() - 6);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '12개월') {
      const d = new Date(refDate);
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().split('T')[0];
    }

    const indices: number[] = [];
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] >= startDate) {
        indices.push(i);
      }
    }
    if (indices.length === 0) {
      for (let i = 0; i < dates.length; i++) indices.push(i);
    }

    const firstIdx = indices[0];
    const lastIdx = indices[indices.length - 1];

    const baseCurr = currStrat[firstIdx] && currStrat[firstIdx] > 0 ? currStrat[firstIdx] : 100;
    const baseSwap = swapStrat[firstIdx] && swapStrat[firstIdx] > 0 ? swapStrat[firstIdx] : 100;
    const baseKospi = kospiSeries[firstIdx] && kospiSeries[firstIdx] > 0 ? kospiSeries[firstIdx] : 100;

    const currKey = currentModel.model || '현재 모델';
    const swapKey = target.model || '비교/교체 모델';

    const rows = indices.map((idx) => {
      const cVal = currStrat[idx] ? (currStrat[idx] / baseCurr) * 100 : 100;
      const sVal = swapStrat[idx] ? (swapStrat[idx] / baseSwap) * 100 : 100;
      const kVal = kospiSeries[idx] ? (kospiSeries[idx] / baseKospi) * 100 : 100;
      return {
        date: dates[idx],
        [currKey]: Number(cVal.toFixed(2)),
        [swapKey]: Number(sVal.toFixed(2)),
        KOSPI: Number(kVal.toFixed(2)),
      };
    });

    const calcSharpe = (arr: number[]) => {
      const rets: number[] = [];
      for (let k = 1; k < indices.length; k++) {
        const prev = arr[indices[k - 1]];
        const cur = arr[indices[k]];
        if (prev && prev > 0 && cur !== undefined) {
          rets.push((cur - prev) / prev);
        }
      }
      if (rets.length < 2) return 0;
      const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
      const std = Math.sqrt(rets.reduce((sq, v) => sq + Math.pow(v - mean, 2), 0) / rets.length);
      return std > 0 ? (mean / std) * Math.sqrt(252) : 0;
    };

    const currEnd = currStrat[lastIdx] || baseCurr;
    const swapEnd = swapStrat[lastIdx] || baseSwap;
    const kospiEnd = kospiSeries[lastIdx] || baseKospi;

    return {
      compareChartData: rows,
      comparePeriodStats: {
        currRet: ((currEnd / baseCurr) - 1) * 100,
        currSharpe: calcSharpe(currStrat),
        swapRet: ((swapEnd / baseSwap) - 1) * 100,
        swapSharpe: calcSharpe(swapStrat),
        kospiRet: ((kospiEnd / baseKospi) - 1) * 100,
        kospiSharpe: calcSharpe(kospiSeries),
        startDateLabel: dates[firstIdx] || '',
        endDateLabel: dates[lastIdx] || '',
      },
    };
  }, [currentModel, selectedSwapModel, displaySwapTarget, period, simData]);

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
      w1: Math.abs(selectedSwapModel.weights.w1) > 1 ? selectedSwapModel.weights.w1 / 100 : selectedSwapModel.weights.w1,
      w5: Math.abs(selectedSwapModel.weights.w5) > 1 ? selectedSwapModel.weights.w5 / 100 : selectedSwapModel.weights.w5,
      w20: Math.abs(selectedSwapModel.weights.w20) > 1 ? selectedSwapModel.weights.w20 / 100 : selectedSwapModel.weights.w20,
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
        const query = `?criteria=${criteria}&top_n=${topN}&w1=${activeWeights.w1}&w5=${activeWeights.w5}&w20=${activeWeights.w20}&cash_threshold=${cashThreshold}&t=${ts}`;
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
  }, [criteria, topN, activeWeights, cashThreshold]);



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
    const latestDateStr = simData.dates[simData.dates.length - 1];
    const today = latestDateStr ? new Date(latestDateStr + 'T00:00:00') : new Date();
    
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
    const latestDateStr = simData.dates[simData.dates.length - 1];
    const today = latestDateStr ? new Date(latestDateStr + 'T00:00:00') : new Date();
    
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
  // 연환산 기대수익률이 cashThreshold%(디폴트 연 10%) 이하이거나 final_score <= 0일 때 ETF를 선택하지 않고 CASH 보유
  const isCash = !topETF || topETF.is_selected === false || topETF.final_score <= 0.0;
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
      
      {/* 🚨 비상 일괄청산 (Kill-Switch) & 인터넷 차단·시스템 장애 대비 안전망 바 */}
      <div className="bg-gradient-to-r from-rose-950/90 via-red-950/80 to-slate-950 border-2 border-rose-500/70 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-xl">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white font-extrabold text-[11px] shadow animate-pulse">
            🚨 비상 일괄청산 & 장애보호 안전망
          </span>
          <span className="text-rose-100 font-semibold text-[11px] sm:text-xs">
            현재 보유: <strong className="text-yellow-300 font-mono">{kisAccount?.HeldDisplay || '미보유 (CASH)'}</strong>
            {' '}· 인터넷 차단이나 시스템 장애 시에도 AWS 클라우드 서버가 단독으로 예약을 관리하며, 우측 버튼으로 <strong>보유 ETF 전량 즉시 청산(CASH 전환) 및 자동예약 즉시 중지</strong>가 가능합니다.
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={kisLoading}
            onClick={async () => {
              if (
                !window.confirm(
                  '🚨 [비상 전량청산 & 예약중지 확인]\n\n현재 보유 중인 모든 미국 ETF를 즉시 전량 매도 청산(CASH 전환)하고, 장마감 자동매수 예약을 즉시 중지하시겠습니까?\n\n※ 인터넷이 일시 불안정한 경우에도 복구 즉시 최우선으로 청산 명령이 자동 재전송됩니다.'
                )
              ) {
                return;
              }
              setKisAutoTrade(false);
              try {
                await handleSaveKisEtfConfig({ auto_trade_enabled: false });
                await handleExecuteKisEtfOrder('LIQUIDATE_ALL');
              } catch (e) {
                if (typeof window !== 'undefined') {
                  localStorage.setItem('emergency_pending_etf_liquidate', 'true');
                }
                alert('⚠️ 네트워크 연결 불안정이 감지되어 로컬 비상청산 큐에 등록되었습니다. 인터넷 복구 즉시 자동 전량청산이 실행되며, 긴급 시 한국투자증권 해외주식 데스크(02-3276-5300 / 1544-5000)로 즉시 전화 청산이 가능합니다.');
              }
            }}
            className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 border border-rose-300 text-white font-extrabold shadow-lg cursor-pointer flex items-center gap-1.5"
          >
            <span>🚨</span>
            <span>비상 보유 ETF 전량 즉시청산 & 예약중지 (CASH)</span>
          </button>
          <span className="px-2 py-1 rounded bg-slate-900/90 border border-rose-500/40 text-rose-200 font-mono text-[11px]">
            ☎️ 장애 시 한투 비상주문: 1544-5000 (해외데스크 02-3276-5300)
          </span>
        </div>
      </div>

      {/* 알림 토스트 (Model Swap Saved Toast) */}
      {toastMessage && (
        <div className="bg-emerald-900/90 border border-emerald-500 text-emerald-100 px-4 py-3 rounded-xl shadow-2xl flex justify-between items-center animate-bounce">
          <span className="font-extrabold text-sm">{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="text-emerald-300 font-bold hover:text-white ml-3">✕</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-center items-center gap-3 mb-4 sm:mb-6 flex-wrap">
        {/* 단일 1종목(100%) 집중 배지 (2종목·3종목 선택 삭제) */}
        <div className="bg-gray-800 px-3 py-2 rounded-lg flex items-center gap-2 shadow-lg border border-teal-500/40">
          <span className="text-xs sm:text-sm font-bold text-teal-400">🎯 포트폴리오 기준:</span>
          <span className="px-2.5 py-0.5 bg-teal-900/70 border border-teal-500/50 text-teal-200 rounded text-xs sm:text-sm font-extrabold">
            최상위 1종목 (100% 집중)
          </span>
        </div>

        {/* CASH 보유 기준 연수익률(%) 입력창 (디폴트 연 10% 이하 시 CASH 보유) */}
        <div className="bg-gray-800 px-3 py-2 rounded-lg flex items-center gap-1.5 shadow-lg border border-amber-500/50">
          <span className="text-xs sm:text-sm font-extrabold text-amber-400 whitespace-nowrap">🛡️ CASH 보유 기준: 연</span>
          <input
            type="number"
            step="1"
            value={cashThresholdInput}
            onChange={(e) => {
              setCashThresholdInput(e.target.value);
              const num = parseFloat(e.target.value);
              if (!isNaN(num)) {
                setCashThreshold(num);
              }
            }}
            onBlur={() => {
              const num = parseFloat(cashThresholdInput);
              const valid = isNaN(num) ? 10 : num;
              setCashThreshold(valid);
              setCashThresholdInput(String(valid));
            }}
            className="w-16 bg-gray-950 border border-amber-500/60 rounded px-2 py-0.5 text-center font-mono font-extrabold text-amber-200 text-xs sm:text-sm outline-none focus:border-amber-300"
          />
          <span className="text-xs sm:text-sm font-bold text-amber-200 whitespace-nowrap">% 이하 시 CASH 보유</span>
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
            {(() => {
              const targetSummaryList = activeTargetItems.map((it: any) => {
                const qc = calcEtfOrderFromBudget(it.current_price);
                return { ticker: it.ticker, qty: qc.qty, estKrw: qc.estKrw };
              });
              const totalConvertedQty = targetSummaryList.reduce((acc, x) => acc + x.qty, 0);
              const convertedTargetLabel =
                targetSummaryList.length > 0
                  ? targetSummaryList.map((x) => `${x.ticker}(${x.qty.toLocaleString()}주)`).join(', ')
                  : 'CASH';
              const shortQtyLabel =
                targetSummaryList.length === 1
                  ? `${targetSummaryList[0].qty.toLocaleString()}주`
                  : targetSummaryList.length > 1
                  ? `총 ${totalConvertedQty.toLocaleString()}주`
                  : 'CASH';

              return (
                <>
                  {/* 주문 금액 직접 입력창 (디폴트 5,000만 원 · 가격대비 환산 주수 자동 계산) */}
                  <div className="flex flex-wrap items-center gap-1.5 bg-slate-950/90 border border-emerald-400/60 px-3 py-1.5 rounded-xl shadow-lg">
                    <span className="text-xs font-extrabold text-emerald-300 whitespace-nowrap">주문 금액:</span>
                    <input
                      type="text"
                      value={kisOrderBudgetKrw.toLocaleString()}
                      onChange={(e) => {
                        const raw = Number(e.target.value.replace(/[^0-9]/g, ''));
                        setKisOrderBudgetKrw(Math.max(0, raw));
                      }}
                      onBlur={() => {
                        const validBudget = Math.max(100000, kisOrderBudgetKrw || 50000000);
                        setKisOrderBudgetKrw(validBudget);
                        handleSaveKisEtfConfig({ order_budget_krw: validBudget });
                      }}
                      className="w-32 bg-slate-900 border border-emerald-500/50 rounded px-2.5 py-1 text-right font-mono font-extrabold text-white text-sm outline-none focus:border-emerald-300"
                    />
                    <span className="text-xs font-bold text-emerald-200 whitespace-nowrap">
                      원 (디폴트 5천만원 · 환산 <strong className="text-yellow-300 font-mono">{shortQtyLabel}</strong>)
                    </span>
                  </div>

                  {/* 미국장 마감 10분 전(15:50 ET) 최종신호 예약 자동주문 등록 버튼 */}
                  <button
                    type="button"
                    disabled={kisLoading}
                    onClick={() => handleExecuteKisEtfOrder('RESERVE_US_CLOSE', { budgetKrw: kisOrderBudgetKrw })}
                    className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold shadow-xl transition-all flex flex-wrap items-center justify-center gap-1.5 border border-emerald-400/50 active:scale-95 cursor-pointer"
                  >
                    <span>📅</span>
                    <span>
                      {kisLoading
                        ? '예약/주문 처리중...'
                        : `미국장 마감 10분전(15:50 ET) 교체 자동주문 예약 (${formatKrwMan(kisOrderBudgetKrw)} · ${shortQtyLabel})`}
                    </span>
                    <span className="bg-black/40 px-2 py-0.5 text-[11px] rounded text-emerald-200 border border-emerald-400/30 font-mono">
                      보유: {kisAccount?.HeldDisplay || 'CASH'} → 타겟: {convertedTargetLabel}
                    </span>
                  </button>

                  {/* 현재 시그널로 즉시 모의체결 실행 버튼 */}
                  <button
                    type="button"
                    disabled={kisLoading}
                    onClick={() => handleExecuteKisEtfOrder('AUTO_ROTATE', { budgetKrw: kisOrderBudgetKrw, force: true })}
                    className="px-3.5 py-2.5 rounded-xl text-xs font-extrabold shadow-lg bg-amber-600/90 hover:bg-amber-500 text-white border border-amber-400/50 transition-all cursor-pointer"
                  >
                    ⚡ 즉시 모의체결 ({formatKrwMan(kisOrderBudgetKrw)} · {shortQtyLabel})
                  </button>

                  {/* 예약 자동매매 ON/OFF 토글 */}
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !kisAutoTrade;
                      setKisAutoTrade(nextVal);
                      handleSaveKisEtfConfig({ auto_trade_enabled: nextVal, order_budget_krw: kisOrderBudgetKrw });
                    }}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-extrabold shadow-lg border transition-all cursor-pointer ${
                      kisAutoTrade
                        ? 'bg-emerald-950/90 border-emerald-400 text-emerald-300'
                        : 'bg-gray-900 border-gray-600 text-gray-400'
                    }`}
                  >
                    🤖 장마감 10분전 자동예약: {kisAutoTrade ? `ON (${formatKrwMan(kisOrderBudgetKrw)} · ${shortQtyLabel})` : 'OFF'}
                  </button>
                </>
              );
            })()}

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
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <h4 className="text-sm font-bold text-gray-200">
                            📈 모델간 누적 수익률 추이 & KOSPI 비교 ({period} · Base = 100)
                          </h4>
                          <div className="flex flex-wrap gap-3 text-xs font-bold">
                            <span className="text-indigo-400">■ 현재: {currentModel.model}</span>
                            <span className="text-amber-400">■ 교체: {selectedSwapModel.model}</span>
                            <span className="text-emerald-400">■ 벤치마크: KOSPI 지수</span>
                          </div>
                        </div>
                        <div className="h-[240px] w-full text-xs">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={compareChartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                              <XAxis dataKey="date" stroke="#9ca3af" minTickGap={40} />
                              <YAxis domain={['auto', 'auto']} stroke="#9ca3af" />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }}
                                formatter={(val: any, name: any) => [
                                  `${Number(val).toFixed(2)} (${Number(val) >= 100 ? '+' : ''}${(Number(val) - 100).toFixed(2)}%)`,
                                  name,
                                ]}
                              />
                              <Line type="monotone" dataKey={currentModel.model} name={`[현재] ${currentModel.model}`} stroke="#818cf8" strokeWidth={2.5} dot={false} />
                              <Line type="monotone" dataKey={selectedSwapModel.model} name={`[교체] ${selectedSwapModel.model}`} stroke="#fbbf24" strokeWidth={2.5} dot={false} />
                              <Line type="monotone" dataKey="KOSPI" name="[벤치마크] KOSPI 지수" stroke="#10b981" strokeWidth={2} strokeDasharray="5 5" dot={false} />
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
                        {(() => {
                          const qCalc = calcEtfOrderFromBudget(item.current_price);
                          return (
                            <>
                              <div className="bg-slate-950/90 border border-emerald-500/40 rounded-lg p-2 space-y-1 text-[11px] font-mono">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">배정 한도 ({(100 / topN).toFixed(0)}%):</span>
                                  <span className="text-emerald-300 font-bold">
                                    {qCalc.allocKrw.toLocaleString()}원
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-400">산출 주문수량 (초과금지):</span>
                                  <span className="text-yellow-300 font-extrabold text-xs">
                                    {qCalc.qty.toLocaleString()}주 <span className="text-[10px] text-slate-400 font-normal">(1주≈{qCalc.priceKrw.toLocaleString()}원)</span>
                                  </span>
                                </div>
                                <div className="flex items-center justify-between border-t border-slate-800 pt-1">
                                  <span className="text-slate-400">실제 주문금액:</span>
                                  <span className="text-white font-bold">
                                    {qCalc.estKrw.toLocaleString()}원 <span className="text-sky-300">(${qCalc.estUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>
                                  </span>
                                </div>
                              </div>
                              <div className="flex items-center justify-between gap-1.5">
                                <button
                                  type="button"
                                  disabled={kisLoading || qCalc.qty <= 0}
                                  onClick={() =>
                                    handleExecuteKisEtfOrder('RESERVE_US_CLOSE', {
                                      budgetKrw: kisOrderBudgetKrw,
                                    })
                                  }
                                  className="flex-1 px-2 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-extrabold shadow cursor-pointer"
                                >
                                  📅 장마감 10분전 예약 ({qCalc.qty.toLocaleString()}주)
                                </button>
                                <button
                                  type="button"
                                  disabled={kisLoading || qCalc.qty <= 0}
                                  onClick={() =>
                                    handleExecuteKisEtfOrder('MANUAL_ORDER', {
                                      ticker: item.ticker,
                                      side: 'BUY',
                                      qty: qCalc.qty,
                                      budgetKrw: kisOrderBudgetKrw,
                                    })
                                  }
                                  className="px-2.5 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-extrabold shadow cursor-pointer"
                                >
                                  🇺🇸 즉시 종가매수 ({qCalc.qty.toLocaleString()}주)
                                </button>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 🏦 회원별 개별 증권사 계좌 연동 & 미국장 마감 10분 전(15:50 ET) 최종신호 예약 자동주문 센터 (디폴트 100주) */}
        {effectiveUserId !== 'admin' && !kisAccount?.config?.is_connected ? (
          <div className="mt-4 bg-slate-950/95 border-2 border-indigo-500/60 rounded-xl p-5 space-y-4 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-extrabold">
                    🔒 개인별 독립 증권사 계좌 운용 센터 ({userName || effectiveUserId}님 전용 · 타 회원 비공개)
                  </span>
                  <span className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold">
                    현재 상태: 증권사 계좌 미연결
                  </span>
                </div>
                <p className="text-xs text-slate-300">
                  회원님의 트레이딩 기록과 증권사 계좌는 <strong>다른 회원에게 절대 노출되지 않으며 본인과 관리자만 확인 가능</strong>합니다. 본인 명의의 증권사 계좌(한국투자증권·키움·미래에셋·삼성·NH·KB·토스 등 모의/실전계좌)를 연결하면 미국 주식시장 마감 10분 전(15:50 ET) 자동 교체매매 및 개별 수익률 원장을 독립적으로 운용하실 수 있습니다.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={priceRefreshing}
                  onClick={handleForceRefreshEtfPrices}
                  className="px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-extrabold shadow cursor-pointer"
                >
                  ⚡ {priceRefreshing ? '시세 갱신중...' : '실시간 ETF 현재가 업데이트'}
                </button>
                {onOpenAccountModal && (
                  <button
                    type="button"
                    onClick={onOpenAccountModal}
                    className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-extrabold shadow-lg cursor-pointer"
                  >
                    🏦 내 증권사 계좌 연결 및 API 설정 열기
                  </button>
                )}
              </div>
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 flex flex-wrap items-end justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">내 증권사 선택</label>
                  <select
                    value={kisBrokerCode}
                    onChange={(e) => setKisBrokerCode(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-bold"
                  >
                    <option value="KIS">한국투자증권 (KIS)</option>
                    <option value="KIWOOM">키움증권 (영웅문)</option>
                    <option value="MIRAE">미래에셋증권 (M-STOCK)</option>
                    <option value="SAMSUNG">삼성증권 (mPOP)</option>
                    <option value="NH">NH투자증권 (나무/QV)</option>
                    <option value="KB">KB증권 (M-able)</option>
                    <option value="DAISHIN">대신증권 (크레온)</option>
                    <option value="TOSS">토스증권</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">운용 구분</label>
                  <select
                    value={kisMode}
                    onChange={(e) => setKisMode(e.target.value as 'PAPER' | 'LIVE')}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-emerald-300 font-bold"
                  >
                    <option value="PAPER">🧪 모의계좌 (PAPER)</option>
                    <option value="LIVE">🔥 실전계좌 (LIVE)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">내 계좌번호 (8~12자리)</label>
                  <input
                    type="text"
                    maxLength={12}
                    placeholder="예: 50123456"
                    value={kisCano}
                    onChange={(e) => setKisCano(e.target.value)}
                    className="w-36 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">상품코드</label>
                  <input
                    type="text"
                    maxLength={4}
                    value={kisPrdt}
                    onChange={(e) => setKisPrdt(e.target.value)}
                    className="w-16 bg-slate-950 border border-slate-700 rounded px-2 py-1.5 text-white font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-emerald-300 font-bold mb-1 text-[11px]">총 주문 한도 금액 (디폴트 5,000만 원)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={kisOrderBudgetKrw.toLocaleString()}
                      onChange={(e) => {
                        const raw = Number(e.target.value.replace(/[^0-9]/g, ''));
                        setKisOrderBudgetKrw(Math.max(0, raw));
                      }}
                      className="w-32 bg-slate-950 border border-emerald-500/70 rounded px-2.5 py-1.5 text-emerald-300 font-mono font-extrabold text-right"
                    />
                    <span className="text-slate-300 font-bold">원</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={kisLoading}
                  onClick={() => {
                    if (!kisCano.trim()) {
                      alert('연결하실 본인 증권사 계좌번호를 입력해주세요.');
                      return;
                    }
                    handleSaveKisEtfConfig({
                      broker_code: kisBrokerCode,
                      mode: kisMode,
                      cano: kisCano.trim(),
                      acnt_prdt_cd: kisPrdt.trim() || '01',
                      order_budget_krw: Math.max(100000, kisOrderBudgetKrw || 50000000),
                      is_connected: true,
                    });
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow cursor-pointer"
                >
                  🔗 내 개별 트레이딩 계좌 즉시 연결하기
                </button>
              </div>
            </div>
          </div>
        ) : (
        <div className="mt-4 bg-slate-950/95 border-2 border-emerald-500/50 rounded-xl p-4 space-y-4 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold">
                  🏦 {kisAccount?.config?.broker_name || '한국투자증권 (KIS)'} {kisMode === 'LIVE' ? '실전계좌' : '모의계좌'} 연동 · 미국장 마감 10분 전(15:50 ET) 예약 자동주문 센터
                </span>
                <span className="px-2.5 py-1 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-xs font-mono font-bold">
                  계좌: {kisCano}-{kisPrdt} ({effectiveUserId === 'admin' ? '관리자 전용' : `${userName || effectiveUserId}님 독립계좌 · 비공개`})
                </span>
                <span className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-mono font-bold">
                  총 주문 한도: {kisOrderBudgetKrw.toLocaleString()}원 (디폴트 5,000만 원 · 초과 금지) | 환율: {usdKrwRate.toLocaleString()}원/$ | 장마감 10분 전({kisAccount?.market_session?.auto_close_order_time_kst || '15:50 ET'}) 예약자동주문 {kisAutoTrade ? 'ON' : 'OFF'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                미국 주식시장 정규장 마감 <strong>10분 전(15:50 ET / 한국시간 동절기 05:50·서머타임 04:50)</strong>까지 집계된 최종 시그널로 <strong>기존 보유 ETF는 전량 매도(SELL)하고, 새로 선정된 추천 ETF는 총 주문 한도 금액({kisOrderBudgetKrw.toLocaleString()}원, 디폴트 5,000만 원)을 넘지 않도록 각 ETF 가격으로 나눈 수량만큼 미국장 종가체결 시스템(MOC 33 / 모의계좌 종가지정가 00 자동연동)으로 동시 예약 자동매수(BUY)</strong>합니다.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {onOpenAccountModal && (
                <button
                  type="button"
                  onClick={onOpenAccountModal}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold shadow cursor-pointer flex items-center gap-1"
                >
                  <span>🏦</span>
                  <span>내 증권사 계좌/API 설정</span>
                </button>
              )}
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
                🧪 모의계좌 (PAPER)
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
                🔥 실전계좌 (LIVE)
              </button>
            </div>
          </div>

          {/* 1. 현재 보유 포지션 vs 당일 추천 타겟 vs 미국장 마감 10분 전(15:50 ET) 예약 교체 판정 3단 요약 카드 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>① 현재 내 계좌 보유 ETF (교체 시 전량 매도 대상)</span>
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
                        {h.ticker} ({h.exchange_cd}) · {h.qty.toLocaleString()}주
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
                  현재 보유 중인 미국 ETF가 없습니다. 예약 또는 즉시 실행 시 총 {formatKrwMan(kisOrderBudgetKrw)} 한도 내 추천 ETF가 편입됩니다.
                </div>
              )}
            </div>

            <div className="bg-slate-900/90 border border-blue-500/40 rounded-xl p-3.5 space-y-1.5">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span>② 장마감 10분 전(15:50 ET) 매수 타겟 ({formatKrwMan(kisOrderBudgetKrw)} 한도 내 수량 산출)</span>
                <span className="font-mono text-sky-300">
                  시세기준: {topETF?.quote_updated_at || topETF?.last_updated || '-'}
                </span>
              </div>
              <div className="text-lg font-extrabold text-yellow-300 font-mono">
                {activeTargetItems.length > 0
                  ? activeTargetItems
                      .map((it: any) => `${it.ticker}(${calcEtfOrderFromBudget(it.current_price).qty.toLocaleString()}주)`)
                      .join(', ')
                  : 'CASH (현금 방어)'}
              </div>
              <div className="text-[11px] text-slate-300 font-mono space-y-0.5">
                {activeTargetItems.length > 0 ? (
                  activeTargetItems.map((t: any) => {
                    const qc = calcEtfOrderFromBudget(t.current_price);
                    return (
                      <div key={t.ticker}>
                        • <strong>{t.ticker}</strong>: 현재가{' '}
                        <strong className="text-emerald-300">${Number(t.current_price).toFixed(2)}</strong> (≈{qc.priceKrw.toLocaleString()}원) ➔ 주문수량{' '}
                        <strong className="text-amber-300">{qc.qty.toLocaleString()}주</strong> ({qc.estKrw.toLocaleString()}원 / ${qc.estUsd.toLocaleString()})
                      </div>
                    );
                  })
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
                <br />• <strong>예약 실행 규칙:</strong> 기존 보유({kisAccount?.HeldDisplay || 'CASH'}) 전량 매도 + 총 <strong>{formatKrwMan(kisOrderBudgetKrw)}</strong> 한도 내 최종 추천 ETF 가격별 산출 수량 동시 종가매수
              </div>
            </div>
          </div>

          {/* 2. 계좌번호 · 총 주문 한도 금액 입력(디폴트 5천만원) · 미국장 종가체결 방식 · 장마감 10분 전 예약 자동주문 컨트롤 바 */}
          <div className="flex flex-wrap items-end justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3 text-xs">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-slate-400 mb-1 text-[11px]">내 계좌번호(8~12자리)</label>
                <input
                  type="text"
                  maxLength={12}
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
                  총 주문 한도 금액 입력 (디폴트 5,000만 원 · 한도 내 ETF 가격으로 나눠 수량 주문)
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    value={kisOrderBudgetKrw.toLocaleString()}
                    onChange={(e) => {
                      const raw = Number(e.target.value.replace(/[^0-9]/g, ''));
                      setKisOrderBudgetKrw(Math.max(0, raw));
                    }}
                    className="w-36 bg-slate-950 border-2 border-emerald-500/70 rounded px-2.5 py-1.5 text-emerald-300 font-mono font-extrabold text-sm text-right"
                  />
                  <span className="text-slate-200 font-bold mr-1">원</span>
                  {[
                    { label: '1,000만', val: 10000000 },
                    { label: '3,000만', val: 30000000 },
                    { label: '5,000만(기본)', val: 50000000 },
                    { label: '1억', val: 100000000 },
                    { label: '2억', val: 200000000 },
                  ].map((bPreset) => (
                    <button
                      key={bPreset.val}
                      type="button"
                      onClick={() => {
                        setKisOrderBudgetKrw(bPreset.val);
                        handleSaveKisEtfConfig({ order_budget_krw: bPreset.val });
                      }}
                      className={`px-2 py-1 rounded text-[11px] font-mono font-bold cursor-pointer border ${
                        kisOrderBudgetKrw === bPreset.val
                          ? 'bg-emerald-600 text-white border-emerald-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      }`}
                    >
                      {bPreset.label}
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
                    handleSaveKisEtfConfig({ auto_trade_enabled: nextVal, order_budget_krw: kisOrderBudgetKrw });
                  }}
                />
                <span>미국장 마감 10분 전(15:50 ET) 최종신호 예약 자동매매 ({formatKrwMan(kisOrderBudgetKrw)} 한도)</span>
              </label>
              <button
                type="button"
                disabled={kisLoading}
                onClick={() => handleSaveKisEtfConfig({ order_budget_krw: kisOrderBudgetKrw })}
                className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-bold cursor-pointer"
              >
                💾 금액/설정 저장
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={kisLoading}
                onClick={() =>
                  handleExecuteKisEtfOrder('RESERVE_US_CLOSE', {
                    budgetKrw: kisOrderBudgetKrw,
                  })
                }
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-extrabold shadow-lg cursor-pointer"
              >
                {kisLoading
                  ? '처리중...'
                  : `📅 미국장 마감 10분전(15:50 ET) 교체 자동주문 예약 등록 (${formatKrwMan(kisOrderBudgetKrw)} 한도)`}
              </button>
              <button
                type="button"
                disabled={kisLoading}
                onClick={() =>
                  handleExecuteKisEtfOrder('AUTO_ROTATE', {
                    budgetKrw: kisOrderBudgetKrw,
                    force: true,
                  })
                }
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-extrabold shadow-lg cursor-pointer"
              >
                ⚡ 현재 시그널로 즉시 체결 ({formatKrwMan(kisOrderBudgetKrw)} 한도)
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
                  📜 내 계좌 미국 ETF 종가체결 주문 실행 원장 (최근 {kisAccount.recent_orders.length}건)
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
                      <th className="py-1.5 px-2">주문 응답 / 처리상태</th>
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
        )}
      </div>

      {/* 📊 모델 교체 전 vs 교체 후 수익률 동시 비교 차트 섹션 (Main Comparison Chart) */}
      <div className="bg-gradient-to-r from-gray-900 via-indigo-950/60 to-gray-900 p-4 sm:p-5 rounded-xl border border-indigo-500/50 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 pb-3 border-b border-gray-800">
          <div>
            <h3 className="text-lg sm:text-xl font-extrabold text-white flex flex-wrap items-center gap-2">
              <span>📊 모델 교체 전 vs 교체 후 & KOSPI 수익률 동시 비교 차트</span>
              <span className="text-xs font-mono bg-blue-950/80 border border-blue-500/40 text-blue-300 px-2.5 py-0.5 rounded-full">
                조회 기간: {period} ({comparePeriodStats.startDateLabel} ~ {comparePeriodStats.endDateLabel})
              </span>
            </h3>
            <p className="text-xs text-gray-400 mt-1">
              상단 기간 설정({period})에 맞춰 현재 모델({currentModel?.model || '현재'}), 비교/교체 모델({displaySwapTarget?.model || '비교 대상'}), 그리고 <strong className="text-emerald-300">KOSPI 지수(^KS11)</strong>의 누적 수익률을 시작점 Base 100 기준으로 동시에 비교합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-between lg:justify-end">
            {/* 상단 기간 선택과 100% 연동되는 기간 버튼 그룹 */}
            <div className="flex gap-1 bg-gray-950/90 p-1 rounded-lg border border-gray-700/80">
              {periodOptions.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    period === p
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowModelSwap(true)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all shadow border border-indigo-400/40 flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              🔄 모델 변경 & 성과 선택
            </button>
          </div>
        </div>

        {compareChartData.length > 0 && currentModel && displaySwapTarget ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs font-mono">
              <div className="bg-indigo-900/40 p-2.5 rounded-lg border border-indigo-500/40">
                <span className="text-indigo-300 font-bold block text-[11px]">📌 현재 적용: {currentModel.model} ({period})</span>
                <span className="text-gray-400 text-[10px]">1/5/20일: {currentModel.weights.w1}/{currentModel.weights.w5}/{currentModel.weights.w20}%</span>
                <div className="font-extrabold text-sm text-indigo-200 mt-0.5">
                  수익: {comparePeriodStats.currRet >= 0 ? '+' : ''}{comparePeriodStats.currRet.toFixed(2)}% | Sharpe: {comparePeriodStats.currSharpe.toFixed(2)}
                </div>
              </div>
              <div className="bg-amber-900/40 p-2.5 rounded-lg border border-amber-500/40">
                <span className="text-amber-300 font-bold block text-[11px]">🔄 비교/교체: {displaySwapTarget.model} ({period})</span>
                <span className="text-gray-400 text-[10px]">1/5/20일: {displaySwapTarget.weights.w1}/{displaySwapTarget.weights.w5}/{displaySwapTarget.weights.w20}%</span>
                <div className="font-extrabold text-sm text-amber-200 mt-0.5">
                  수익: {comparePeriodStats.swapRet >= 0 ? '+' : ''}{comparePeriodStats.swapRet.toFixed(2)}% | Sharpe: {comparePeriodStats.swapSharpe.toFixed(2)}
                </div>
              </div>
              <div className="bg-emerald-950/50 p-2.5 rounded-lg border border-emerald-500/40">
                <span className="text-emerald-300 font-bold block text-[11px]">🇰🇷 벤치마크: KOSPI 지수 ({period})</span>
                <span className="text-gray-400 text-[10px]">
                  현재모델 대비 초과수익: {(comparePeriodStats.currRet - comparePeriodStats.kospiRet) >= 0 ? '+' : ''}
                  {(comparePeriodStats.currRet - comparePeriodStats.kospiRet).toFixed(2)}%p
                </span>
                <div className="font-extrabold text-sm text-emerald-200 mt-0.5">
                  수익: {comparePeriodStats.kospiRet >= 0 ? '+' : ''}{comparePeriodStats.kospiRet.toFixed(2)}% | Sharpe: {comparePeriodStats.kospiSharpe.toFixed(2)}
                </div>
              </div>
              <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
                <span className="text-gray-400 text-[10px]">모델간 수익률 격차 ({period})</span>
                {(() => {
                  const diff = comparePeriodStats.swapRet - comparePeriodStats.currRet;
                  return (
                    <div className={`font-bold text-sm ${diff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}%p
                    </div>
                  );
                })()}
                <span className="text-[10px] text-gray-500">교체 시 구간 수익 변동</span>
              </div>
              <div className="bg-gray-900 p-2.5 rounded-lg border border-gray-800">
                <span className="text-gray-400 text-[10px]">샤프지수 격차 ({period})</span>
                {(() => {
                  const diff = comparePeriodStats.swapSharpe - comparePeriodStats.currSharpe;
                  return (
                    <div className={`font-bold text-sm ${diff >= 0 ? 'text-purple-400' : 'text-red-400'}`}>
                      {diff >= 0 ? '+' : ''}{diff.toFixed(2)}
                    </div>
                  );
                })()}
                <span className="text-[10px] text-gray-500">위험조정 성과 격차</span>
              </div>
            </div>

            <div className="h-[300px] w-full text-xs bg-gray-900/90 p-2 rounded-xl border border-gray-800">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={compareChartData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" minTickGap={35} />
                  <YAxis domain={['auto', 'auto']} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }}
                    formatter={(val: any, name: any) => [
                      `${Number(val).toFixed(2)} (${Number(val) >= 100 ? '+' : ''}${(Number(val) - 100).toFixed(2)}%)`,
                      name,
                    ]}
                  />
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
                  <Line 
                    type="monotone" 
                    dataKey="KOSPI" 
                    name="[벤치마크] KOSPI 지수" 
                    stroke="#10b981" 
                    strokeWidth={2.5} 
                    strokeDasharray="5 5"
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
