import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function OrderWindow({
  stocks,
  userId = 'admin',
  isAdmin = false,
  userName = '',
  onOpenAccountModal,
}: {
  stocks: any[];
  userId?: string;
  isAdmin?: boolean;
  userName?: string;
  onOpenAccountModal?: () => void;
}) {
  const effectiveUserId = (userId || 'admin').trim() || 'admin';
  const [userAccount, setUserAccount] = useState<any>(null);
  const MAX_TOTAL_CAPITAL = 100000000;

  // Default investment amount: 100,000,000 won (최대 1억 원 한도 고정, 회원별 분리)
  const [totalAmount, setTotalAmount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(`orderTotalAmount_${effectiveUserId}`);
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && parsed > 0) return Math.min(MAX_TOTAL_CAPITAL, parsed);
      }
    }
    return MAX_TOTAL_CAPITAL;
  });
  
  // 종목당 한도는 20개 종목 기준 1/N 배정 (예: 1억 / 20 = 500만원 고정)
  const amountPerStock = totalAmount / 20;

  // 사용자 지정 임계값 (기본 5%로 설정)
  const [threshold, setThreshold] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('orderThreshold');
      if (saved) return Number(saved);
    }
    return 5;
  });
  const [thresholdInput, setThresholdInput] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('orderThreshold');
      if (saved) return saved;
    }
    return "5";
  });

  // KOSPI + KOSDAQ 전종목 스캔 결과 상태
  const [foreignOrderStocks, setForeignOrderStocks] = useState<any[]>([]);
  const [isScanning, setIsScanning] = useState(false);

  // Compute live foreign ratios from fallback stocks
  const computedStocks = useMemo(() => {
    return stocks.map(stock => {
      const foreignNetBuy = stock.foreign_net_buy || 0;
      const totalVol = stock.total_volume || stock.volume || 1; 
      const foreignRatio = (foreignNetBuy / totalVol) * 100;
      return { 
        ...stock, 
        foreignSumCurrent: foreignNetBuy, 
        foreign_net_buy: foreignNetBuy,
        totalVol, 
        total_volume: totalVol,
        volume: totalVol,
        foreignRatio,
        foreign_ratio: roundToTwo(foreignRatio)
      };
    });
  }, [stocks]);

  function roundToTwo(num: number) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
  }

  // 9시 5분 스냅샷 관리 (고정된 리스트, KST 기준)
  const [frozenStocks, setFrozenStocks] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];
      const savedDate = localStorage.getItem('frozen_date_0905');
      if (savedDate === today) {
        const savedData = localStorage.getItem('frozen_data_0905');
        if (savedData) {
          try { return JSON.parse(savedData); } catch(e) {}
        }
      }
    }
    return [];
  });

  // 09:05 이전 종목 조회 허용 토글 (추가 매수 우회 불가)
  const [forceEnable, setForceEnable] = useState(false);
  const [reservedSellToday, setReservedSellToday] = useState(false);
  const [serverBoughtToday, setServerBoughtToday] = useState(false);

  // 백엔드 전종목 외국계 순매수 상위 API 호출 함수
  const fetchForeignStocks = useCallback(async (curThreshold: number, force: boolean = false) => {
    setIsScanning(true);
    try {
      const res = await fetch(`/api/order/foreign-top-stocks?threshold=${curThreshold}&limit=20&force_refresh=${force}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setForeignOrderStocks(data);
          
          if (typeof window !== 'undefined') {
            const today = new Date().toISOString().split('T')[0];
            const savedDate = localStorage.getItem('frozen_date_0905');
            
            const now = new Date();
            const canFreeze = forceEnable || (now.getHours() > 9) || (now.getHours() === 9 && now.getMinutes() >= 5);
            
            // 9시 5분 이후이고, 아직 오늘자 고정 스냅샷이 없거나 사용자가 '확정' 버튼으로 강제 갱신(force)한 경우 고정!
            if (canFreeze && (savedDate !== today || force)) {
              const validFrozen = data.filter((s: any) => {
                const r = s.foreign_ratio !== undefined ? s.foreign_ratio : (s.foreignRatio || 0);
                return r >= curThreshold;
              });
              setFrozenStocks(validFrozen);
              localStorage.setItem('frozen_date_0905', today);
              localStorage.setItem('frozen_data_0905', JSON.stringify(validFrozen));
            }
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch foreign order stocks:", err);
    } finally {
      setIsScanning(false);
    }
  }, [forceEnable]);

  // 마운트 시 및 주기적 전종목 스캔 데이터 로드
  useEffect(() => {
    fetchForeignStocks(threshold, false);
    const interval = setInterval(() => {
      fetchForeignStocks(threshold, false);
    }, 15000); // 15초마다 최신 순위 갱신
    return () => clearInterval(interval);
  }, [fetchForeignStocks, threshold]);

  // 9시 5분 시점에 고정된 종목 리스트를 기준으로 UI 표시, 실시간 비중 및 수치(거래량, 순매수, 현재가) 병합
  const orderStocks = useMemo(() => {
    const baseList = frozenStocks.length > 0 ? frozenStocks : foreignOrderStocks;
    if (baseList.length > 0) {
      return baseList.map(fs => {
        const cleanFs = (fs.clean_ticker || fs.ticker || '').split(':').pop() || '';
        const realtimeData = foreignOrderStocks.find(rs => {
          const cleanRs = (rs.clean_ticker || rs.ticker || '').split(':').pop() || '';
          return cleanRs === cleanFs || rs.ticker === fs.ticker;
        });
        const fallbackData = computedStocks.find(cs => {
          const cleanCs = (cs.clean_ticker || cs.ticker || '').split(':').pop() || '';
          return cleanCs === cleanFs || cs.ticker === fs.ticker;
        });
        
        let liveRatio = fs.foreign_ratio !== undefined ? fs.foreign_ratio : (fs.foreignRatio || 0);
        let liveNetBuy = fs.foreign_net_buy !== undefined ? fs.foreign_net_buy : (fs.foreignSumCurrent || 0);
        let liveVol = fs.total_volume || fs.volume || 0;
        let livePrice = fs.price || 0;
        let liveChangePct = fs.changePct || 0;

        if (realtimeData) {
          liveRatio = realtimeData.currentRatio !== undefined ? realtimeData.currentRatio : (realtimeData.foreign_ratio !== undefined ? realtimeData.foreign_ratio : (realtimeData.foreignRatio || liveRatio));
          if (realtimeData.foreign_net_buy !== undefined) liveNetBuy = realtimeData.foreign_net_buy;
          if (realtimeData.total_volume || realtimeData.volume) liveVol = realtimeData.total_volume || realtimeData.volume;
          if (realtimeData.price) livePrice = realtimeData.price;
          if (realtimeData.changePct !== undefined) liveChangePct = realtimeData.changePct;
        } else if (fallbackData) {
          liveRatio = fallbackData.foreignRatio || liveRatio;
          if (fallbackData.foreign_net_buy !== undefined) liveNetBuy = fallbackData.foreign_net_buy;
          if (fallbackData.total_volume || fallbackData.volume) liveVol = fallbackData.total_volume || fallbackData.volume;
          if (fallbackData.price) livePrice = fallbackData.price;
        }

        const ratio0905 = fs.ratio0905 !== undefined ? fs.ratio0905 : (fs.foreign_ratio !== undefined ? fs.foreign_ratio : (fs.foreignRatio || 0));

        return {
          ...fs,
          price: livePrice,
          changePct: liveChangePct,
          foreign_net_buy: liveNetBuy,
          volume: liveVol,
          total_volume: liveVol,
          ratio0905,
          currentRatio: liveRatio,
          foreign_ratio: liveRatio
        };
      })
      .filter(fs => (fs.ratio0905 !== undefined ? fs.ratio0905 : fs.currentRatio) >= threshold)
      .slice(0, 20);
    }
    return [];
  }, [frozenStocks, foreignOrderStocks, computedStocks, threshold]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(`orderTotalAmount_${effectiveUserId}`, totalAmount.toString());
    }
  }, [totalAmount, effectiveUserId]);

  // KST(한국 표준시) 기준 오늘 날짜
  const todayStr = new Date(Date.now() + 9 * 3600 * 1000).toISOString().split('T')[0];

  // Local state for tracking bought stocks (Holdings) — 회원별 localStorage 격리
  const [holdings, setHoldings] = useState<{
    ticker: string;
    name: string;
    buyPrice: number;
    qty: number;
  }[]>(() => {
    if (typeof window !== 'undefined') {
      const savedDate = localStorage.getItem(`saved_holdings_date_${effectiveUserId}`);
      if (savedDate === todayStr) {
        const savedData = localStorage.getItem(`saved_holdings_data_${effectiveUserId}`);
        if (savedData) {
          try {
            const parsed = JSON.parse(savedData);
            if (Array.isArray(parsed) && parsed.length > 0) return parsed;
          } catch (e) {}
        }
      }
    }
    return [];
  });

  const [livePrices, setLivePrices] = useState<Record<string, number>>(() => {
    if (typeof window !== 'undefined') {
      const savedDate = localStorage.getItem('saved_livePrices_date');
      if (savedDate === todayStr) {
        const savedData = localStorage.getItem('saved_livePrices_data');
        if (savedData) {
          try {
            return JSON.parse(savedData) || {};
          } catch (e) {}
        }
      }
    }
    return {};
  });
  const [liveQuotes, setLiveQuotes] = useState<Record<string, { price: number; change: number; changePct: number; volume: number }>>({});
  
  // Fetch real-time prices & quotes (전일대비 등락률 포함)
  useEffect(() => {
    const fetchLivePrices = async () => {
      try {
        const orderTickers = orderStocks.map((s: any) => s.ticker);
        const holdingTickers = holdings.map(h => h.ticker);
        const allTickersSet = new Set([...orderTickers, ...holdingTickers]);
        if (allTickersSet.size === 0) return;

        const tickersStr = Array.from(allTickersSet).join(',');
        const res = await fetch(`/api/realtime-quotes?tickers=${tickersStr}`);
        if (!res.ok) throw new Error(res.statusText || 'API Error');
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setLiveQuotes(prev => ({ ...prev, ...data }));
          const priceMap: Record<string, number> = {};
          Object.keys(data).forEach(k => {
            if (data[k]?.price) priceMap[k] = data[k].price;
          });
          setLivePrices(prev => {
            const next = { ...prev, ...priceMap };
            if (typeof window !== 'undefined') {
              localStorage.setItem('saved_livePrices_date', todayStr);
              localStorage.setItem('saved_livePrices_data', JSON.stringify(next));
            }
            return next;
          });
        }
      } catch (e) { console.error(e); }
    };

    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 4000);
    return () => clearInterval(interval);
  }, [orderStocks, holdings, todayStr]);

  // PnL History & Detailed Ledger & Chart State
  const [pnlHistory, setPnlHistory] = useState<any[]>([]);
  const [detailedLedger, setDetailedLedger] = useState<any[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [showLedger, setShowLedger] = useState(false);

  // 차트 API 지연/일시 오류 시에도 pnlHistory 로부터 즉시 전략 누적수익률을 렌더링하는 폴백 시계열
  const displayChartData = useMemo(() => {
    if (chartData.length > 0) return chartData;
    if (pnlHistory.length === 0) return [];
    const asc = [...pnlHistory].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
    let mult = 1.0;
    return asc.map(item => {
      const rr = Number(item.return_rate) || 0;
      mult *= (1 + rr / 100);
      return {
        date: item.date,
        strategy_return: Number(((mult - 1) * 100).toFixed(2)),
        kospi_return: 0,
        net_pnl: Number(item.net_pnl) || 0,
      };
    });
  }, [chartData, pnlHistory]);
  const [showHoldingsModal, setShowHoldingsModal] = useState(false);

  const fetchUserAccount = useCallback(async () => {
    try {
      const res = await fetch(`/api/user/trading-account?user_id=${encodeURIComponent(effectiveUserId)}`, {
        headers: { 'x-user-id': effectiveUserId },
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.account) setUserAccount(data.account);
      }
    } catch (e) { console.error(e); }
  }, [effectiveUserId]);

  const fetchHoldings = async () => {
    try {
      const res = await fetch(`/api/holdings?user_id=${encodeURIComponent(effectiveUserId)}`, {
        headers: { 'x-user-id': effectiveUserId },
      });
      if (!res.ok) {
        console.warn('fetchHoldings returned status:', res.status);
        return;
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setHoldings(data);
        if (typeof window !== 'undefined') {
          if (data.length > 0) {
            localStorage.setItem(`saved_holdings_date_${effectiveUserId}`, todayStr);
            localStorage.setItem(`saved_holdings_data_${effectiveUserId}`, JSON.stringify(data));
          } else {
            localStorage.removeItem(`saved_holdings_date_${effectiveUserId}`);
            localStorage.removeItem(`saved_holdings_data_${effectiveUserId}`);
          }
        }
      }
    } catch (e) { console.error(e); }
  };

  const fetchLedger = async () => {
    try {
      const res = await fetch(`/api/ledger-history?user_id=${encodeURIComponent(effectiveUserId)}`, {
        headers: { 'x-user-id': effectiveUserId },
      });
      if (res.ok) {
        const data = await res.json();
        const hist = Array.isArray(data) ? data : [];
        setPnlHistory(hist);
      }
    } catch (e) { console.error(e); }

    try {
      const resDetailed = await fetch(`/api/detailed-trading-ledger?user_id=${encodeURIComponent(effectiveUserId)}`, {
        headers: { 'x-user-id': effectiveUserId },
      });
      if (resDetailed.ok) {
        const dataDetailed = await resDetailed.json();
        const rows = Array.isArray(dataDetailed) ? dataDetailed : [];
        setDetailedLedger(rows);
        // 당일 장중 미청산 매수 내역(status === 'BUY')만 보유잔고로 자동 복원 (15:30 청산 완료된 status === 'SELL' 종목은 복원 금지)
        const todayRows = rows.filter((r: any) => r.trade_date === todayStr);
        const activeBuyRows = todayRows.filter((r: any) => r.status === 'BUY');
        const settledSellRows = todayRows.filter((r: any) => r.status === 'SELL');

        if (settledSellRows.length > 0 && activeBuyRows.length === 0) {
          setHoldings([]);
          if (typeof window !== 'undefined') {
            localStorage.removeItem(`saved_holdings_date_${effectiveUserId}`);
            localStorage.removeItem(`saved_holdings_data_${effectiveUserId}`);
          }
        } else if (activeBuyRows.length > 0) {
          setHoldings(prev => {
            if (prev.length > 0) return prev;
            const restored = activeBuyRows.map((r: any) => ({
              ticker: r.ticker,
              name: r.name || r.ticker,
              buyPrice: Number(r.buy_price) || 0,
              qty: Number(r.qty) || 0,
              currentPrice: Number(r.sell_price) || Number(r.buy_price) || 0,
            }));
            if (typeof window !== 'undefined') {
              localStorage.setItem(`saved_holdings_date_${effectiveUserId}`, todayStr);
              localStorage.setItem(`saved_holdings_data_${effectiveUserId}`, JSON.stringify(restored));
            }
            return restored;
          });
        } else {
          setHoldings([]);
        }
      }
    } catch (e) { console.error(e); }

    try {
      const resStatus = await fetch(`/api/kis/order-status?user_id=${encodeURIComponent(effectiveUserId)}`, {
        headers: { 'x-user-id': effectiveUserId },
      });
      if (resStatus.ok) {
        const statusData = await resStatus.json();
        setReservedSellToday(Boolean(statusData.reserved_close_sell));
        setServerBoughtToday(Boolean(statusData.already_bought_today));
      }
    } catch (e) { console.error(e); }

    try {
      const resChart = await fetch(`/api/ledger-chart-data?user_id=${encodeURIComponent(effectiveUserId)}`, {
        headers: { 'x-user-id': effectiveUserId },
      });
      if (resChart.ok) {
        const dataChart = await resChart.json();
        setChartData(Array.isArray(dataChart) ? dataChart : []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    setHoldings([]);
    setPnlHistory([]);
    setDetailedLedger([]);
    setChartData([]);
    fetchUserAccount();
    fetchHoldings();
    fetchLedger();
    const interval = setInterval(() => {
      fetchUserAccount();
      fetchHoldings();
      fetchLedger();
    }, 10000);
    return () => clearInterval(interval);
  }, [effectiveUserId, fetchUserAccount]);

  // 최초 매수 완료 여부 판별 (최초 매수 후 추가 매수 엄격 제한)
  const alreadyBoughtToday =
    serverBoughtToday ||
    pnlHistory.some(h => h.date === todayStr) ||
    detailedLedger.some(r => r.trade_date === todayStr) ||
    holdings.length > 0;

  // 매수 완료된 종목의 매입단가, 매수수량, 주문금액, 체결시간 스냅샷 관리
  const [buySnapshot, setBuySnapshot] = useState<Record<string, {price: number, qty: number, orderTotal: number, time?: string}>>({});

  useEffect(() => {
    if (holdings.length > 0) {
      let existingSnapshot: Record<string, any> = {};
      const savedDate = localStorage.getItem(`buySnapshot_date_${effectiveUserId}`);
      if (savedDate === todayStr) {
        const savedData = localStorage.getItem(`buySnapshot_data_${effectiveUserId}`);
        if (savedData) {
          try { existingSnapshot = JSON.parse(savedData); } catch(e) {}
        }
      }

      const snapshot: Record<string, any> = {};
      const nowTime = new Date().toLocaleTimeString('ko-KR', { hour12: false });
      
      holdings.forEach(h => {
        const cleanTicker = h.ticker.split(':').pop() || h.ticker;
        snapshot[cleanTicker] = {
          price: h.buyPrice,
          qty: h.qty,
          orderTotal: h.buyPrice * h.qty,
          time: existingSnapshot[cleanTicker]?.time || nowTime
        };
      });
      setBuySnapshot(snapshot);
      localStorage.setItem(`buySnapshot_date_${effectiveUserId}`, todayStr);
      localStorage.setItem(`buySnapshot_data_${effectiveUserId}`, JSON.stringify(snapshot));
    } else {
      setBuySnapshot({});
    }
  }, [holdings, todayStr, effectiveUserId]);

  // 금일 15:30 장마감 종가 청산 완료 원장 레코드
  const todaySettledLedger = useMemo(() => {
    return pnlHistory.find((h: any) => h.date === todayStr) || null;
  }, [pnlHistory, todayStr]);

  const isLiquidatedToday = useMemo(() => {
    const todayRows = detailedLedger.filter((r: any) => r.trade_date === todayStr);
    const hasSold = todayRows.some((r: any) => r.status === 'SELL');
    const hasActiveBuy = todayRows.some((r: any) => r.status === 'BUY');
    return holdings.length === 0 && (Boolean(todaySettledLedger) || (hasSold && !hasActiveBuy));
  }, [holdings.length, todaySettledLedger, detailedLedger, todayStr]);

  // Compute portfolio totals
  const portfolioSummary = useMemo(() => {
    let totalBuyAmount = 0;
    let totalCurrentAmount = 0;
    let totalPnL = 0;
    
    if (holdings.length > 0) {
      holdings.forEach(h => {
        const cleanTicker = h.ticker.split(':').pop() || h.ticker;
        const currentStock = stocks.find(s => s.ticker === h.ticker || s.ticker === cleanTicker || s.ticker === `KRX:${cleanTicker}`);
        const livePrice = livePrices[h.ticker] || livePrices[cleanTicker] || livePrices[`KRX:${cleanTicker}`];
        const currentPrice = (livePrice && livePrice > 0) ? livePrice : (currentStock?.price || (h as any).currentPrice || h.buyPrice);
        const buyAmount = h.buyPrice * h.qty;
        const currentAmount = currentPrice * h.qty;
        const pnl = currentAmount - buyAmount;
        
        totalBuyAmount += buyAmount;
        totalCurrentAmount += currentAmount;
        totalPnL += pnl;
      });
    } else if (todaySettledLedger) {
      totalBuyAmount = Number(todaySettledLedger.total_buy) || 0;
      totalCurrentAmount = Number(todaySettledLedger.total_sell) || 0;
      totalPnL = Number(todaySettledLedger.net_pnl) || 0;
    }

    return { totalBuyAmount, totalCurrentAmount, totalPnL };
  }, [holdings, stocks, livePrices, todaySettledLedger]);

  const handleBuyAll = async () => {
    if (orderStocks.length === 0) return;
    if (alreadyBoughtToday) {
      alert("금일 최초 매수주문이 이미 완료되어 추가 매수는 불가합니다.");
      return;
    }
    if (!window.confirm(`총 ${orderStocks.length}종목에 대해 각각 최대 ${amountPerStock.toLocaleString()}원(총 한도 ${totalAmount.toLocaleString()}원)씩 최초 일괄 매수 주문을 전송하시겠습니까?\n\n※ 최초 매수주문 이후 당일 추가 매수는 불가합니다.`)) {
      return;
    }

    const batchId = `BATCH_${todayStr}_${Date.now()}`;
    let successCount = 0;

    // 5종목씩 병렬 처리하여 속도 개선 및 KIS API rate limit 방지
    const batchSize = 5;
    for (let i = 0; i < orderStocks.length; i += batchSize) {
      const batch = orderStocks.slice(i, i + batchSize);
      const promises = batch.map(async (stock) => {
        if (stock.ratio0905 !== undefined && stock.ratio0905 < threshold) return 0;
        const cleanTicker = stock.clean_ticker || stock.ticker.split(':').pop() || stock.ticker;
        let liveP = livePrices[stock.ticker] || livePrices[cleanTicker] || livePrices[`KRX:${cleanTicker}`] || stock.price || 0;

        if (liveP <= 0) {
          try {
            const pRes = await fetch(`/api/realtime-prices?tickers=${cleanTicker}`);
            if (pRes.ok) {
              const pData = await pRes.json();
              liveP = pData[cleanTicker] || pData[`KRX:${cleanTicker}`] || pData[stock.ticker] || 0;
            }
          } catch(e) {}
        }

        const price = liveP > 0 ? liveP : (stock.price || 0);
        if (price <= 0) return 0;

        const qty = Math.floor(amountPerStock / price);
        if (qty <= 0) return 0;

        try {
          const res = await fetch(`/api/kis/order/${cleanTicker}?qty=${qty}&price=${price}&type=buy&name=${encodeURIComponent(stock.name)}&batch_id=${encodeURIComponent(batchId)}&user_id=${encodeURIComponent(effectiveUserId)}`, {
            method: 'POST',
            headers: { 'x-user-id': effectiveUserId },
          });
          if (!res.ok) return 0;
          const data = await res.json();
          return data.success ? 1 : 0;
        } catch (err) {
          console.error(err);
          return 0;
        }
      });
      const results = await Promise.all(promises);
      successCount += results.reduce((sum: number, res) => sum + res, 0);
    }

    await fetchHoldings();
    await fetchLedger();
    alert(`${successCount}종목에 대해 금일 최초 일괄 매수 주문이 완료되었습니다.`);
  };

  const handleBuySingle = async (ticker: string, name: string, price: number, qty: number) => {
    if (alreadyBoughtToday) {
      alert("금일 최초 매수주문 이후 추가 매수는 허용되지 않습니다.");
      return;
    }
    try {
      const cleanTicker = ticker.split(':').pop() || ticker;
      let finalPrice = price;
      if (finalPrice <= 0) {
        try {
          const pRes = await fetch(`/api/realtime-prices?tickers=${cleanTicker}`);
          if (pRes.ok) {
            const pData = await pRes.json();
            finalPrice = pData[cleanTicker] || pData[`KRX:${cleanTicker}`] || pData[ticker] || 0;
          }
        } catch(e) {}
      }
      const singleBatchId = `SINGLE_${todayStr}_${Date.now()}`;
      const res = await fetch(`/api/kis/order/${cleanTicker}?qty=${qty}&type=buy&price=${finalPrice}&name=${encodeURIComponent(name)}&batch_id=${encodeURIComponent(singleBatchId)}&user_id=${encodeURIComponent(effectiveUserId)}`, {
        method: 'POST',
        headers: { 'x-user-id': effectiveUserId },
      });
      if (!res.ok) throw new Error(res.statusText || 'API Error');
      const data = await res.json();
      if (data.success) {
        alert(`${cleanTicker} 종목 ${data.executed_qty || qty}주 매수 주문이 성공적으로 접수되었습니다. (체결단가: ${(data.executed_price || finalPrice).toLocaleString()}원)`);
        await fetchHoldings();
        await fetchLedger();
      } else {
        alert(`${cleanTicker} 매수 주문 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      alert(`네트워크 오류: ${err}`);
    }
  };

  const handleSellSingle = async (ticker: string, qty: number) => {
    try {
      const cleanTicker = ticker.split(':').pop() || ticker;
      const res = await fetch(`/api/kis/order/${cleanTicker}?qty=${qty}&type=sell&user_id=${encodeURIComponent(effectiveUserId)}`, {
        method: 'POST',
        headers: { 'x-user-id': effectiveUserId },
      });
      if (!res.ok) throw new Error(res.statusText || 'API Error');
      const data = await res.json();
      if (data.success) {
        await fetchHoldings();
        alert(`${ticker} 매도 완료 (UI 반영)`);
      } else {
        alert(`${ticker} 매도 주문 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e) {
      console.error(e);
      alert("매도 처리 중 오류가 발생했습니다.");
    }
  };

  const handleSellAll = async () => {
    if (holdings.length === 0) {
      alert("매도할 보유 잔고가 없습니다.");
      return;
    }

    const now = new Date();
    const utcHours = now.getUTCHours();
    const kstHours = (utcHours + 9) % 24;
    const kstMinutes = now.getUTCMinutes();
    const timeValue = kstHours * 60 + kstMinutes;

    if (reservedSellToday && timeValue < 15 * 60 + 30) {
      alert("이미 금일 15시 20분 장마감 동시호가 종가매도가 예약되어 있습니다.");
      return;
    }

    let confirmMsg = "";
    if (timeValue < 15 * 60 + 20) {
      confirmMsg = `[15:20 장마감 동시호가 종가 매도 예약]\n\n현재는 정규 장중입니다.\n15시 20분 장마감 동시호가에 매도주문이 접수되고, 15시 30분을 기준으로 최종 종가에 체결 정산되도록 예약하시겠습니까?\n\n(현재 예상손익: ${portfolioSummary.totalPnL.toLocaleString()}원)`;
    } else if (timeValue < 15 * 60 + 30) {
      confirmMsg = `[15:20 장마감 동시호가 매도 접수]\n\n현재는 장마감 동시호가 시간대(15:20~15:30)입니다.\n시장가 매도 주문을 즉시 전송하며, 15시 30분을 기준으로 최종 종가에 체결 정산됩니다. 진행하시겠습니까?\n\n(현재 예상손익: ${portfolioSummary.totalPnL.toLocaleString()}원)`;
    } else {
      confirmMsg = `[15:30 최종 종가 일괄 매도 정산]\n\n당일 15시 30분 최종 종가를 기준으로 보유 종목을 일괄 매도 정산하시겠습니까?\n\n(예상 확정손익: ${portfolioSummary.totalPnL.toLocaleString()}원)`;
    }

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const res = await fetch(`/api/kis/sell-all?mode=close&user_id=${encodeURIComponent(effectiveUserId)}`, {
        method: 'POST',
        headers: { 'x-user-id': effectiveUserId },
      });
      if (!res.ok) {
        alert("일괄매도 처리 중 서버 오류가 발생했습니다. (상태 코드: " + res.status + ")");
        return;
      }
      const data = await res.json();

      if (data.success) {
        if (data.status === 'RESERVED_1520') {
          setReservedSellToday(true);
          alert(`✅ [예약 접수 완료]\n\n${data.message || '15시 20분 장마감 동시호가에 매도주문이 예약되었습니다.'}`);
        } else if (data.status === 'PENDING_CLOSE_1530') {
          setReservedSellToday(true);
          alert(`✅ [동시호가 접수 완료]\n\n${data.message || '15시 20분 동시호가 시장가 매도 주문이 전송되었습니다.'}`);
        } else {
          setReservedSellToday(false);
          await fetchHoldings();
          await fetchLedger();
          if (typeof window !== 'undefined') {
            localStorage.removeItem(`orderTotalAmount_${effectiveUserId}`);
          }
          setTotalAmount(MAX_TOTAL_CAPITAL);
          alert(`✅ [15:30 종가 일괄매도 완료]\n\n총 확정순이익 ${(data.net_pnl || 0).toLocaleString()}원이 거래원장에 성공적으로 기록되었습니다.`);
        }
      } else {
        alert(`일괄매도 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (e) {
      console.error(e);
      alert("일괄매도 처리 중 오류가 발생했습니다.");
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value.replace(/,/g, ''));
    if (!isNaN(val)) {
      const clamped = Math.min(MAX_TOTAL_CAPITAL, Math.max(0, val));
      setTotalAmount(clamped);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`orderTotalAmount_${effectiveUserId}`, String(clamped));
      }
    }
  };

  const now = new Date();
  const isMarketOpenForStats = forceEnable || (now.getHours() > 9) || (now.getHours() === 9 && now.getMinutes() >= 5);
  
  return (
    <div className="flex h-auto lg:h-[calc(100vh-120px)] w-full bg-black text-gray-200 overflow-y-auto lg:overflow-hidden">
      <div className="w-full flex flex-col p-2 sm:p-3 h-auto lg:h-full">
        {/* 🏦 회원별 독립 트레이딩 계좌 & 프라이버시 상태 바 */}
        <div className="mb-2 px-3 py-2 rounded-lg bg-[#0d121d] border border-emerald-500/40 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-extrabold">
              {effectiveUserId === 'admin'
                ? '👑 관리자(주인장) 전용 트레이딩 원장'
                : `🔒 ${userName || effectiveUserId}님 전용 독립 트레이딩 원장 (타 회원 비밀보장)`}
            </span>
            {effectiveUserId !== 'admin' && !userAccount?.is_connected ? (
              <span className="text-amber-300 font-bold">
                ⚠️ 현재 연결된 증권사 계좌가 없습니다. 본인 증권사 계좌를 연결하여 개별 운용을 시작하세요.
              </span>
            ) : (
              <span className="text-slate-300 font-mono">
                연결 계좌: <strong className="text-emerald-300">{userAccount?.broker_name || '한국투자증권 (KIS)'}</strong> ({userAccount?.account_display || (effectiveUserId === 'admin' ? '44790516-01' : '-')}) · {userAccount?.mode === 'LIVE' ? '🔥 실전계좌' : '🧪 모의계좌'}
              </span>
            )}
          </div>
          {onOpenAccountModal && (
            <button
              type="button"
              onClick={onOpenAccountModal}
              className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold shadow cursor-pointer"
            >
              🏦 {effectiveUserId !== 'admin' && !userAccount?.is_connected ? '내 증권사 계좌 연결하기' : '내 증권사 계좌 설정/변경'}
            </button>
          )}
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 mb-2.5 px-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base sm:text-xl font-extrabold text-red-500 leading-tight">
              🚨 매수주문 <span className="text-xs sm:text-base font-bold text-red-400">(외국계 순매수 {threshold}%↑ 상위 20)</span>
            </h2>
            <div className="flex items-center gap-1">
              <input 
                type="number" 
                value={thresholdInput} 
                onChange={e => setThresholdInput(e.target.value)}
                className="bg-gray-800 text-xs text-gray-300 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-red-500 w-14 text-right font-bold"
              />
              <span className="text-gray-400 text-xs">%</span>
              <button 
                onClick={async () => {
                  const val = Number(thresholdInput);
                  if (isNaN(val) || val <= 0) {
                    alert("1 이상의 올바른 비중(%)을 입력해주세요.");
                    return;
                  }
                  setThreshold(val);
                  if (typeof window !== 'undefined') {
                    localStorage.setItem('orderThreshold', val.toString());
                    // 낡은 로컬스토리지 스냅샷 캐시 삭제
                    localStorage.removeItem('snapshot0905_data_v2');
                    localStorage.removeItem('snapshot0905_date_v2');
                  }
                  await fetchForeignStocks(val, true);
                  alert(`KOSPI 및 KOSDAQ 전종목 기준 외국계 순매수 ${val}% 이상 종목이 비중 상위 순으로 확정되었습니다.`);
                }}
                disabled={isScanning}
                className="bg-red-700 hover:bg-red-600 disabled:bg-gray-700 text-white text-xs font-bold py-1 px-2.5 rounded transition-colors flex items-center gap-1"
              >
                {isScanning ? (
                  <>
                    <span className="inline-block w-2.5 h-2.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    확정 중...
                  </>
                ) : '확정'}
              </button>
            </div>
            {orderStocks.length > 0 && (
              <span className="text-[11px] sm:text-xs text-yellow-400 bg-yellow-950/60 border border-yellow-800/80 px-2 py-0.5 rounded font-bold">
                조건 부합: {orderStocks.length}종목 {orderStocks.length <= 20 ? '(전체)' : '(상위 20)'}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-between md:justify-end">
            <button 
              onClick={() => fetchForeignStocks(threshold, true)}
              disabled={isScanning}
              className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-2.5 py-1.5 rounded text-gray-200 font-bold transition-colors"
            >
              🔄 실시간 전종목 재스캔
            </button>
            <label className="text-xs text-gray-400 cursor-pointer flex items-center">
              <input type="checkbox" className="mr-1" checked={forceEnable} onChange={e => setForceEnable(e.target.checked)} />
              09:05 이전 조회 허용
            </label>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-2.5 mb-3">
          {/* Investment Amount Input */}
          <div className="w-full lg:flex-1 bg-[#1a1a1a] border border-gray-800 rounded-lg p-3 sm:p-4 flex flex-col gap-1.5">
            <label className="text-gray-400 font-bold text-xs sm:text-sm block">전체 투자 금액 (최대 1억 원 한도)</label>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                value={totalAmount.toLocaleString()} 
                onChange={handleAmountChange}
                disabled={alreadyBoughtToday}
                className={`bg-black border border-gray-700 rounded px-3 py-1.5 sm:py-2 text-right font-mono font-bold w-full text-base sm:text-lg focus:outline-none focus:border-yellow-500 transition-colors ${alreadyBoughtToday ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <span className="text-gray-400 font-bold text-sm">원</span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
              <div className="text-xs text-gray-400">
                종목당 배정(1/20): <span className="font-mono font-bold text-gray-200">{Math.floor(amountPerStock).toLocaleString()}</span> 원
              </div>
              <button 
                onClick={handleBuyAll}
                disabled={!isMarketOpenForStats || orderStocks.length === 0 || alreadyBoughtToday}
                className="bg-red-700 hover:bg-red-600 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-2 px-4 rounded transition-colors whitespace-nowrap text-xs sm:text-sm w-full sm:w-auto"
              >
                {alreadyBoughtToday ? '금일 매수 완료 (추가매수 불가)' : '🚀 일괄 매수'}
              </button>
            </div>
          </div>
          
          {/* Portfolio Summary Panel */}
          <div className="w-full lg:flex-[2] bg-[#1a1a1a] border border-gray-800 rounded-lg p-3 sm:p-4 flex flex-col xl:flex-row gap-3 items-stretch xl:items-center justify-between">
            <div className="grid grid-cols-3 gap-2 sm:gap-4 flex-1">
              <div className="border-r border-gray-800 pr-2 sm:pr-4">
                 <label className="text-gray-400 font-bold text-[11px] sm:text-xs mb-1 block truncate">
                   {isLiquidatedToday ? '매입금액 (금일청산)' : '전체 매입금액'}
                 </label>
                 <div className="text-sm sm:text-xl font-mono font-bold text-gray-200 mt-1">
                   {portfolioSummary.totalBuyAmount.toLocaleString()}<span className="text-[11px] sm:text-xs ml-0.5">원</span>
                 </div>
              </div>
              <div className="border-r border-gray-800 px-1 sm:px-3">
                 <label className="text-gray-400 font-bold text-[11px] sm:text-xs mb-1 block truncate">
                   {isLiquidatedToday ? '15:30 청산금액' : '현재 평가액'}
                 </label>
                 <div className="text-sm sm:text-xl font-mono font-bold text-gray-200 mt-1">
                   {portfolioSummary.totalCurrentAmount.toLocaleString()}<span className="text-[11px] sm:text-xs ml-0.5">원</span>
                 </div>
              </div>
              <div className="pl-1 sm:pl-3">
                 <label className="text-gray-400 font-bold text-[11px] sm:text-xs mb-1 block truncate">
                   {isLiquidatedToday ? '금일 확정 순손익' : '전체 손익(예상)'}
                 </label>
                 <div className={`text-sm sm:text-2xl font-mono font-extrabold mt-1 ${portfolioSummary.totalPnL > 0 ? 'text-red-400' : (portfolioSummary.totalPnL < 0 ? 'text-blue-400' : 'text-gray-400')}`}>
                   {portfolioSummary.totalPnL > 0 ? '+' : ''}{Math.floor(portfolioSummary.totalPnL).toLocaleString()}<span className="text-[11px] sm:text-xs ml-0.5">원</span>
                 </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 w-full xl:w-auto shrink-0">
               <button 
                  onClick={() => setShowHoldingsModal(true)}
                  className="bg-emerald-900/90 hover:bg-emerald-700 border border-emerald-500 text-white font-bold py-2 px-2.5 rounded-lg text-xs transition-colors whitespace-nowrap flex flex-col items-center justify-center min-w-[82px]"
               >
                 <span className="text-xs sm:text-sm">📋 보유리스트</span>
                 <span className="text-[10px] sm:text-[11px] text-emerald-300 font-normal">({holdings.length}종목)</span>
               </button>
               <button 
                  onClick={handleSellAll}
                  disabled={holdings.length === 0 || reservedSellToday}
                  className="bg-blue-900/90 hover:bg-blue-700 disabled:bg-gray-800 disabled:border-gray-700 border border-blue-500 text-white font-bold py-2 px-2.5 rounded-lg text-xs transition-colors whitespace-nowrap flex flex-col items-center justify-center min-w-[82px]"
               >
                 <span className="text-xs sm:text-sm">{isLiquidatedToday ? '청산 완료' : (reservedSellToday ? '종가매도 예약됨' : '일괄매도')}</span>
                 <span className="text-[10px] text-blue-300 font-normal">{isLiquidatedToday ? '(매매원장 이관)' : (reservedSellToday ? '(15:30 자동정산)' : '(손익 확정)')}</span>
               </button>
               <button 
                  onClick={() => setShowLedger(true)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold py-2 px-2.5 rounded-lg text-xs transition-colors whitespace-nowrap flex flex-col items-center justify-center min-w-[82px]"
               >
                 <span className="text-xs sm:text-sm">📊 매매원장</span>
                 <span className="text-[10px] text-gray-400 font-normal">(조회)</span>
               </button>
            </div>
          </div>
        </div>
        
        {/* Table Container with Scrollbar */}
        <div className="flex-1 min-h-[260px] max-h-[420px] lg:max-h-none border border-gray-800 rounded-lg bg-[#0a0a0a] overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[780px] text-xs text-left relative whitespace-nowrap">
            <thead className="bg-gray-900 text-gray-400 border-b border-gray-800 sticky top-0 shadow-md z-10">
              <tr>
                <th className="px-2.5 py-2 font-medium w-20">종목코드</th>
                <th className="px-2.5 py-2 font-medium sticky left-0 bg-gray-900 z-20">종목명</th>
                <th className="px-2.5 py-2 font-medium text-right text-white">현재가</th>
                <th className="px-2.5 py-2 font-medium text-right text-yellow-300">등락률</th>
                <th className="px-2.5 py-2 font-medium text-right text-purple-400">외국계순매수</th>
                <th className="px-2.5 py-2 font-medium text-right text-yellow-400">9시5분 비중</th>
                <th className="px-2.5 py-2 font-medium text-right text-orange-400">실시간 비중</th>
                <th className="px-2.5 py-2 font-medium text-right text-gray-400">총거래량</th>
                <th className="px-2.5 py-2 font-medium text-right text-blue-400">매수수량(1/N)</th>
                <th className="px-2.5 py-2 font-medium text-right text-green-400">주문금액</th>
                <th className="px-2.5 py-2 font-medium text-center">개별주문</th>
              </tr>
            </thead>
            <tbody>
              {!isMarketOpenForStats ? (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-gray-500 font-bold text-sm">
                    매수주문 통계는 09:05분 이후에 활성화됩니다.
                  </td>
                </tr>
              ) : orderStocks.length > 0 ? orderStocks.map((stock, i) => {
                const cleanTicker = stock.clean_ticker || stock.ticker.split(':').pop() || stock.ticker;
                const snap = buySnapshot[cleanTicker];
                const quote = liveQuotes[cleanTicker] || liveQuotes[stock.ticker] || liveQuotes[`KRX:${cleanTicker}`];
                
                const liveP = (quote && quote.price > 0) ? quote.price : (livePrices[stock.ticker] || livePrices[cleanTicker] || livePrices[`KRX:${cleanTicker}`] || stock.price || 0);
                const priceForOrder = liveP > 0 ? liveP : (snap ? snap.price : (stock.price || 1));
                const qty = snap ? snap.qty : Math.floor(amountPerStock / priceForOrder);
                const orderTotal = snap ? snap.orderTotal : qty * priceForOrder;
                
                const changePctVal = (quote && quote.changePct !== undefined && quote.changePct !== null)
                  ? Number(quote.changePct)
                  : Number(stock.changePct || 0);
                const changePctStr = changePctVal > 0 ? `+${changePctVal.toFixed(2)}%` : `${changePctVal.toFixed(2)}%`;
                const changeColor = changePctVal > 0 ? 'text-red-400' : (changePctVal < 0 ? 'text-blue-400' : 'text-gray-400');

                const netBuy = stock.foreign_net_buy !== undefined ? stock.foreign_net_buy : (stock.foreignSumCurrent || 0);
                const currentRatio = stock.currentRatio !== undefined ? stock.currentRatio : (stock.foreign_ratio !== undefined ? stock.foreign_ratio : (stock.foreignRatio || 0));
                const snapRatio = stock.ratio0905 !== undefined ? stock.ratio0905 : currentRatio;
                const totalVol = stock.total_volume || stock.volume || stock.totalVol || 0;

                const market = stock.market || (cleanTicker.startsWith('0') ? 'KOSPI' : 'KOSDAQ');
                const rowBg = i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]';

                return (
                  <tr key={stock.ticker} className={`border-b border-gray-800 hover:bg-gray-800/50 ${rowBg}`}>
                    <td className="px-2.5 py-2.5 font-mono text-gray-400">{cleanTicker}</td>
                    <td className={`px-2.5 py-2.5 font-bold sticky left-0 z-10 ${rowBg} flex items-center gap-1.5`}>
                      <span className={`text-[10px] font-mono px-1 py-0.5 rounded border ${
                        market === 'KOSDAQ' 
                          ? 'bg-purple-950/70 border-purple-800 text-purple-300' 
                          : 'bg-blue-950/70 border-blue-800 text-blue-300'
                      }`}>
                        {market}
                      </span>
                      <span className="text-white">{stock.name}</span>
                      {snap && <span className="ml-1 text-[10px] bg-green-900/50 text-green-400 px-1 py-0.5 rounded border border-green-800">매수가 {(snap.price || 0).toLocaleString()}원</span>}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono font-bold text-white">{(liveP || stock.price || priceForOrder || 0).toLocaleString()}</td>
                    <td className={`px-2.5 py-2.5 text-right font-mono font-bold ${changeColor}`}>{changePctStr}</td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-purple-300">
                      {netBuy > 0 ? '+' : ''}{Math.floor(netBuy).toLocaleString()}주
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono font-bold text-yellow-400">
                      {snapRatio.toFixed(2)}%
                    </td>
                    <td className={`px-2.5 py-2.5 text-right font-mono font-bold ${currentRatio >= threshold ? 'text-orange-400' : 'text-gray-500'}`}>
                      {currentRatio.toFixed(2)}%
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-gray-300">
                      {Math.floor(totalVol).toLocaleString()}
                    </td>
                    <td className="px-2.5 py-2.5 text-right font-mono font-bold text-blue-300">{qty.toLocaleString()} 주</td>
                    <td className="px-2.5 py-2.5 text-right font-mono text-green-300">{orderTotal.toLocaleString()}</td>
                    <td className="px-2.5 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        <button 
                          onClick={() => handleBuySingle(stock.ticker, stock.name, priceForOrder, qty)}
                          disabled={alreadyBoughtToday}
                          className="bg-gray-800 border border-gray-600 hover:bg-gray-700 hover:border-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-gray-200 font-bold py-1 px-2 rounded text-xs transition-colors"
                        >
                          {alreadyBoughtToday ? '매수불가' : '매수'}
                        </button>
                        <button 
                          onClick={() => handleSellSingle(stock.ticker, qty)}
                          className="bg-gray-800 border border-gray-600 hover:bg-gray-700 hover:border-blue-500 text-gray-200 font-bold py-1 px-2 rounded text-xs transition-colors"
                        >
                          매도
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={11} className="px-3 py-8 text-center text-gray-500">
                    현재 외국계 창구 순매수 비중 {threshold}% 이상 종목이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Holdings / PnL Table (Always Visible) */}
        <div className="mt-3 flex-none border border-gray-800 rounded-lg bg-[#111]">
          <div className="px-3 py-2 bg-gray-900 border-b border-gray-800 font-bold text-gray-300 flex justify-between items-center text-xs sm:text-sm">
            <span>📋 보유 잔고 및 실시간 손익 (종가시 최종수익)</span>
            <span className="text-xs text-gray-400 font-normal">보유 종목: {holdings.length}개</span>
          </div>
          <div className="max-h-[260px] overflow-x-auto overflow-y-auto">
            <table className="w-full min-w-[680px] text-xs text-left whitespace-nowrap">
              <thead className="bg-[#1a1a1a] text-gray-400 border-b border-gray-800 sticky top-0 z-10">
                <tr>
                  <th className="px-2.5 py-2 font-medium sticky left-0 bg-[#1a1a1a] z-20">종목명</th>
                  <th className="px-2.5 py-2 font-medium text-right text-yellow-400">9시5분 비중</th>
                  <th className="px-2.5 py-2 font-medium text-right text-orange-400">실시간 비중</th>
                  <th className="px-2.5 py-2 font-medium text-right">보유수량</th>
                  <th className="px-2.5 py-2 font-medium text-right">매입단가</th>
                  <th className="px-2.5 py-2 font-medium text-right">현재가</th>
                  <th className="px-2.5 py-2 font-medium text-right text-orange-400">순이익</th>
                  <th className="px-2.5 py-2 font-medium text-right text-green-400">종가시 최종수익(예상)</th>
                  <th className="px-2.5 py-2 font-medium text-center">동작</th>
                </tr>
              </thead>
              <tbody>
                {holdings.length > 0 ? (
                  holdings.map((h, i) => {
                    const cleanTicker = h.ticker.split(':').pop() || h.ticker;
                    const currentStock = stocks.find(s => s.ticker === h.ticker || s.ticker === cleanTicker || s.ticker === `KRX:${cleanTicker}`)
                      || computedStocks.find(s => s.ticker === h.ticker || s.ticker === cleanTicker || s.ticker === `KRX:${cleanTicker}`);
                    
                    const livePrice = livePrices[h.ticker] || livePrices[cleanTicker] || livePrices[`KRX:${cleanTicker}`];
                    const currentPrice = (livePrice && livePrice > 0) ? livePrice : (currentStock?.price || (h as any).currentPrice || h.buyPrice);
                    
                    const netProfit = (currentPrice - h.buyPrice) * h.qty;
                    const finalProfit = netProfit;

                    const pnlColor = netProfit > 0 ? 'text-red-400' : (netProfit < 0 ? 'text-blue-400' : 'text-gray-400');
                    
                    const frozenMatch = frozenStocks.find(fs => 
                      fs.clean_ticker === cleanTicker || 
                      fs.ticker === h.ticker || 
                      fs.ticker === `KRX:${cleanTicker}` ||
                      (fs.ticker && fs.ticker.split(':').pop() === cleanTicker)
                    );
                    const foreignMatch = foreignOrderStocks.find(fs => 
                      fs.clean_ticker === cleanTicker || 
                      fs.ticker === h.ticker || 
                      fs.ticker === `KRX:${cleanTicker}` ||
                      (fs.ticker && fs.ticker.split(':').pop() === cleanTicker)
                    );

                    // 9시 5분 비중 (09:05 당시 고정 스냅샷 수치)
                    let ratio0905: number | undefined = foreignMatch?.ratio0905 !== undefined 
                      ? foreignMatch.ratio0905 
                      : (frozenMatch?.ratio0905 !== undefined 
                        ? frozenMatch.ratio0905 
                        : ((h as any).ratio0905 !== undefined ? (h as any).ratio0905 : undefined));

                    // 실시간 비중 (장중 실시간 외국계 창구 순매수량 / 총거래량 수치)
                    let liveRatio: number = foreignMatch?.currentRatio !== undefined
                      ? foreignMatch.currentRatio
                      : (foreignMatch?.foreign_ratio !== undefined 
                        ? foreignMatch.foreign_ratio 
                        : (foreignMatch?.foreignRatio !== undefined 
                          ? foreignMatch.foreignRatio 
                          : ((h as any).foreign_ratio !== undefined ? (h as any).foreign_ratio 
                            : (currentStock ? (currentStock.foreignRatio || currentStock.foreign_ratio || 0) : 0))));
                    
                    const hRowBg = i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]';
                    return (
                      <tr key={h.ticker} className={`border-b border-gray-800 ${hRowBg}`}>
                        <td className={`px-2.5 py-2.5 font-bold sticky left-0 z-10 ${hRowBg} text-white`}>{h.name}</td>
                        <td className="px-2.5 py-2.5 text-right font-mono font-bold text-yellow-400">
                          {ratio0905 !== undefined ? ratio0905.toFixed(2) : '-'}%
                        </td>
                        <td className={`px-2.5 py-2.5 text-right font-mono font-bold ${liveRatio >= 5 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {liveRatio.toFixed(2)}%
                        </td>
                        <td className="px-2.5 py-2.5 text-right font-mono">{h.qty.toLocaleString()}</td>
                        <td className="px-2.5 py-2.5 text-right font-mono">{Math.floor(h.buyPrice).toLocaleString()}</td>
                        <td className="px-2.5 py-2.5 text-right font-mono">{currentPrice.toLocaleString()}</td>
                        <td className={`px-2.5 py-2.5 text-right font-mono font-bold ${pnlColor}`}>
                          {netProfit > 0 ? '+' : ''}{Math.floor(netProfit).toLocaleString()} 원
                        </td>
                        <td className={`px-2.5 py-2.5 text-right font-mono font-bold ${pnlColor}`}>
                          {finalProfit > 0 ? '+' : ''}{Math.floor(finalProfit).toLocaleString()} 원
                        </td>
                        <td className="px-2.5 py-2 text-center">
                          <button 
                            onClick={() => handleSellSingle(h.ticker, h.qty)}
                            className="bg-gray-800 border border-gray-600 hover:bg-gray-700 hover:border-blue-500 text-gray-200 font-bold py-1 px-2 rounded text-xs transition-colors"
                          >
                            전량매도
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center font-bold whitespace-normal">
                      {isLiquidatedToday ? (
                        <span className="text-emerald-400">
                          ✅ 금일({todayStr}) 15:30 장마감 종가 일괄청산 완료 (보유 잔고 0종목) — 당일 매매내역 및 확정손익은 상단 [매매원장]에서 확인하실 수 있습니다.
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          현재 보유 중인 종목이 없습니다. (상단 일괄매수 또는 종목별 매수 시 보유 잔고에 표시됩니다)
                        </span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Holdings List Modal */}
        {showHoldingsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#111] border border-gray-700 rounded-xl w-full max-w-6xl max-h-[85vh] flex flex-col shadow-2xl">
              <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-xl">
                <div className="flex items-center gap-3">
                  <h3 className="text-xl font-bold text-emerald-400 flex items-center gap-2">
                    <span>📋</span> 매수확정 종목 보유리스트 및 실시간 평가손익
                  </h3>
                  <span className="text-xs text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded">
                    총 {holdings.length}개 종목 보유 중
                  </span>
                </div>
                <button 
                  onClick={() => setShowHoldingsModal(false)} 
                  className="text-gray-400 hover:text-white transition-colors bg-gray-800 hover:bg-gray-700 rounded-lg p-1.5"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Summary Stats Row inside Modal */}
              <div className="grid grid-cols-4 gap-3 p-4 bg-[#0d0d0d] border-b border-gray-800">
                <div className="bg-gray-900/80 border border-gray-800 p-3 rounded-lg">
                  <div className="text-xs text-gray-400">총 매입금액</div>
                  <div className="text-lg font-mono font-bold text-gray-200 mt-1">
                    {portfolioSummary.totalBuyAmount.toLocaleString()} <span className="text-xs text-gray-400">원</span>
                  </div>
                </div>
                <div className="bg-gray-900/80 border border-gray-800 p-3 rounded-lg">
                  <div className="text-xs text-gray-400">현재 평가금액</div>
                  <div className="text-lg font-mono font-bold text-gray-200 mt-1">
                    {portfolioSummary.totalCurrentAmount.toLocaleString()} <span className="text-xs text-gray-400">원</span>
                  </div>
                </div>
                <div className="bg-gray-900/80 border border-gray-800 p-3 rounded-lg">
                  <div className="text-xs text-gray-400">총 평가손익</div>
                  <div className={`text-lg font-mono font-bold mt-1 ${portfolioSummary.totalPnL > 0 ? 'text-red-400' : (portfolioSummary.totalPnL < 0 ? 'text-blue-400' : 'text-gray-400')}`}>
                    {portfolioSummary.totalPnL > 0 ? '+' : ''}{Math.floor(portfolioSummary.totalPnL).toLocaleString()} <span className="text-xs text-gray-400">원</span>
                  </div>
                </div>
                <div className="bg-gray-900/80 border border-gray-800 p-3 rounded-lg">
                  <div className="text-xs text-gray-400">총 수익률</div>
                  {(() => {
                    const retPct = portfolioSummary.totalBuyAmount > 0 
                      ? (portfolioSummary.totalPnL / portfolioSummary.totalBuyAmount) * 100 
                      : 0;
                    return (
                      <div className={`text-lg font-mono font-bold mt-1 ${retPct > 0 ? 'text-red-400' : (retPct < 0 ? 'text-blue-400' : 'text-gray-400')}`}>
                        {retPct > 0 ? '+' : ''}{retPct.toFixed(2)}%
                      </div>
                    );
                  })()}
                </div>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                {holdings.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 font-bold text-base">
                    현재 매수확정된 보유 종목이 없습니다.
                  </div>
                ) : (
                  <div className="border border-gray-800 rounded-lg overflow-hidden bg-[#0a0a0a]">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#1a1a1a] text-gray-300 border-b border-gray-800 sticky top-0">
                        <tr>
                          <th className="px-3 py-3 font-semibold">종목코드</th>
                          <th className="px-3 py-3 font-semibold">종목명</th>
                          <th className="px-3 py-3 font-semibold text-right text-gray-300">매입가격</th>
                          <th className="px-3 py-3 font-semibold text-right text-white">현재가</th>
                          <th className="px-3 py-3 font-semibold text-right text-orange-400">평가손익</th>
                          <th className="px-3 py-3 font-semibold text-right text-yellow-400">외국계 9시5분 비중</th>
                          <th className="px-3 py-3 font-semibold text-right text-orange-400">외국계 현재 비중</th>
                          <th className="px-3 py-3 font-semibold text-right text-blue-300">보유수량</th>
                          <th className="px-3 py-3 font-semibold text-right text-emerald-400">평가금액</th>
                          <th className="px-3 py-3 font-semibold text-center">동작</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800/60">
                        {holdings.map((h, i) => {
                          const cleanTicker = h.ticker.split(':').pop() || h.ticker;
                          
                          // 1. 스냅샷 데이터 match
                          const snap = buySnapshot[cleanTicker];
                          
                          // 2. 9시 5분 확정 리스트 (frozenStocks) match
                          const frozenMatch = frozenStocks.find(fs => 
                            fs.ticker === h.ticker || 
                            fs.ticker === `KRX:${h.ticker}` || 
                            fs.clean_ticker === cleanTicker ||
                            (fs.ticker && fs.ticker.split(':').pop() === cleanTicker)
                          );

                          // 3. 실시간 외국계 스캔 (foreignOrderStocks) match
                          const foreignMatch = foreignOrderStocks.find(fs => 
                            fs.clean_ticker === cleanTicker ||
                            fs.ticker === h.ticker || 
                            fs.ticker === `KRX:${cleanTicker}` || 
                            (fs.ticker && fs.ticker.split(':').pop() === cleanTicker)
                          );

                          // 4. 일반 stocks match
                          const currentStock = stocks.find(s => s.ticker === h.ticker || s.ticker === cleanTicker || s.ticker === `KRX:${cleanTicker}`)
                            || computedStocks.find(s => s.ticker === h.ticker || s.ticker === cleanTicker || s.ticker === `KRX:${cleanTicker}`);
                          
                          const livePrice = livePrices[h.ticker] || livePrices[cleanTicker] || livePrices[`KRX:${cleanTicker}`];
                          const currentPrice = (livePrice && livePrice > 0) ? livePrice : (currentStock?.price || (h as any).currentPrice || h.buyPrice);
                          
                          const evalAmount = currentPrice * h.qty;
                          const netProfit = (currentPrice - h.buyPrice) * h.qty;
                          const profitRatio = h.buyPrice > 0 ? ((currentPrice - h.buyPrice) / h.buyPrice) * 100 : 0;
                          const pnlColor = netProfit > 0 ? 'text-red-400' : (netProfit < 0 ? 'text-blue-400' : 'text-gray-400');
                          
                          // 9시 5분 비중 (09:05 당시 고정 스냅샷 수치)
                          let ratio0905: number | undefined = foreignMatch?.ratio0905 !== undefined 
                            ? foreignMatch.ratio0905 
                            : (frozenMatch?.ratio0905 !== undefined 
                              ? frozenMatch.ratio0905 
                              : ((h as any).ratio0905 !== undefined ? (h as any).ratio0905 : undefined));

                          // 실시간 비중 (장중 실시간 수치)
                          let liveRatio: number = foreignMatch?.foreign_ratio !== undefined 
                            ? foreignMatch.foreign_ratio 
                            : (foreignMatch?.foreignRatio !== undefined 
                              ? foreignMatch.foreignRatio 
                              : ((h as any).foreign_ratio !== undefined ? (h as any).foreign_ratio 
                                : (currentStock ? (currentStock.foreignRatio || currentStock.foreign_ratio || 0) : 0)));

                          const market = cleanTicker.startsWith('0') ? 'KOSPI' : 'KOSDAQ';

                          return (
                            <tr key={h.ticker} className={`hover:bg-gray-800/60 ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]'}`}>
                              <td className="px-3 py-3 font-mono text-gray-400">{cleanTicker}</td>
                              <td className="px-3 py-3 font-bold">
                                <div className="flex items-center gap-1.5">
                                  <span className={`text-[10px] font-mono px-1 py-0.5 rounded border ${
                                    market === 'KOSDAQ' 
                                      ? 'bg-purple-950/70 border-purple-800 text-purple-300' 
                                      : 'bg-blue-950/70 border-blue-800 text-blue-300'
                                  }`}>
                                    {market}
                                  </span>
                                  <span className="text-gray-100">{h.name}</span>
                                  {snap && snap.time && (
                                    <span className="text-[10px] text-gray-400 bg-gray-800 px-1 py-0.5 rounded">
                                      {snap.time} 체결
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono text-gray-300">
                                {Math.floor(h.buyPrice).toLocaleString()} 원
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-white">
                                {currentPrice.toLocaleString()} 원
                              </td>
                              <td className={`px-3 py-3 text-right font-mono font-bold ${pnlColor}`}>
                                <div>{netProfit > 0 ? '+' : ''}{Math.floor(netProfit).toLocaleString()} 원</div>
                                <div className="text-[10px] font-normal">({profitRatio > 0 ? '+' : ''}{profitRatio.toFixed(2)}%)</div>
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-yellow-400">
                                {ratio0905 !== undefined ? `${ratio0905.toFixed(2)}%` : '-'}
                              </td>
                              <td className={`px-3 py-3 text-right font-mono font-bold ${liveRatio >= 5 ? 'text-orange-400' : 'text-gray-400'}`}>
                                {liveRatio.toFixed(2)}%
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-blue-300">
                                {h.qty.toLocaleString()} 주
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-bold text-emerald-400">
                                {Math.floor(evalAmount).toLocaleString()} 원
                              </td>
                              <td className="px-3 py-2 text-center">
                                <button 
                                  onClick={() => handleSellSingle(h.ticker, h.qty)}
                                  className="bg-blue-950 hover:bg-blue-800 border border-blue-600 text-blue-200 font-bold py-1 px-2.5 rounded text-xs transition-colors"
                                >
                                  전량매도
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="p-3 border-t border-gray-800 bg-[#1a1a1a] rounded-b-xl flex justify-between items-center text-xs text-gray-400">
                <span>💡 9시 5분 외국계 순매수 비중과 현재 실시간 순매수 비중이 5초 간격으로 자동 업데이트됩니다.</span>
                <button 
                  onClick={() => setShowHoldingsModal(false)}
                  className="bg-gray-800 hover:bg-gray-700 text-white font-bold py-1.5 px-4 rounded border border-gray-600 transition-colors"
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ledger Modal */}
        {showLedger && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#111] border border-gray-700 rounded-xl w-full max-w-5xl max-h-[85vh] flex flex-col shadow-2xl">
              <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-xl">
                <h3 className="text-xl font-bold text-gray-200">상세 거래원장 (일별 정산 및 종목별 체결 내역)</h3>
                <button onClick={() => setShowLedger(false)} className="text-gray-400 hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 overflow-y-auto space-y-6">
                {/* Comparative Cumulative Return Chart */}
                <div className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-4">
                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-200">📈 누적 수익률 비교 차트 (KOSPI 지수 vs 매수주문 전략)</span>
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                        <span className="w-3 h-0.5 bg-emerald-400 inline-block"></span>
                        매수주문 누적 수익률
                      </span>
                      <span className="flex items-center gap-1.5 text-purple-400 font-bold">
                        <span className="w-3 h-0.5 bg-purple-400 inline-block"></span>
                        KOSPI 지수 누적 수익률
                      </span>
                    </div>
                  </div>
                  {displayChartData.length > 0 ? (
                    <div className="h-56 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={displayChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                          <XAxis dataKey="date" stroke="#666" tick={{ fill: '#888', fontSize: 11 }} />
                          <YAxis stroke="#666" tick={{ fill: '#888', fontSize: 11 }} unit="%" />
                          <Tooltip 
                            content={({ active, payload, label }: any) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                const stratRet = data.strategy_return;
                                const kospiRet = data.kospi_return;
                                const netPnl = data.net_pnl;
                                return (
                                  <div className="bg-[#18181b] border border-gray-700 p-2.5 rounded shadow-xl text-xs font-mono space-y-1 z-50">
                                    <div className="text-gray-400 font-bold border-b border-gray-700 pb-1 mb-1">{label}</div>
                                    <div className="flex justify-between gap-4 text-emerald-400 font-bold">
                                      <span>매수주문 누적:</span>
                                      <span>{stratRet > 0 ? '+' : ''}{stratRet}%</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-purple-400 font-bold">
                                      <span>KOSPI 지수 누적:</span>
                                      <span>{kospiRet > 0 ? '+' : ''}{kospiRet}%</span>
                                    </div>
                                    {netPnl !== undefined && netPnl !== 0 && (
                                      <div className={`flex justify-between gap-4 font-bold border-t border-gray-800 pt-1 mt-1 ${netPnl > 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                        <span>당일 순손익:</span>
                                        <span>{netPnl > 0 ? '+' : ''}{netPnl.toLocaleString()}원</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
                          <Line type="monotone" dataKey="strategy_return" name="매수주문 누적수익률" stroke="#10b981" strokeWidth={2.5} dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
                          <Line type="monotone" dataKey="kospi_return" name="KOSPI 누적수익률" stroke="#a855f7" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2, fill: '#a855f7' }} activeDot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-gray-500 text-xs font-bold">
                      차트를 표시할 거래 내역 또는 KOSPI 지수 데이터를 로딩 중입니다...
                    </div>
                  )}
                </div>

                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold text-gray-300">📊 일별 종합 정산 원장</span>
                  <span className="text-sm font-mono text-gray-400 font-bold bg-[#0a0a0a] px-3 py-1 rounded border border-gray-800">
                    Net Total: <span className="text-green-400">{pnlHistory.reduce((sum, item) => sum + (item.net_pnl || 0), 0).toLocaleString()}</span> 원
                  </span>
                </div>
                {pnlHistory.length === 0 ? (
                  <div className="py-6 text-center text-gray-500 font-bold">기록된 거래원장이 없습니다. 매도 시 자동으로 기록됩니다.</div>
                ) : (
                  <div className="border border-gray-800 rounded bg-[#0a0a0a] overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-[#1a1a1a] text-gray-400 border-b border-gray-800">
                        <tr>
                          <th className="px-3 py-2 font-medium">일자</th>
                          <th className="px-3 py-2 font-medium text-right">매입총액</th>
                          <th className="px-3 py-2 font-medium text-right">매도총액</th>
                          <th className="px-3 py-2 font-medium text-right text-gray-500">수수료(0.015%)</th>
                          <th className="px-3 py-2 font-medium text-right text-gray-500">거래세(0.2%)</th>
                          <th className="px-3 py-2 font-medium text-right text-green-400">실질순이익</th>
                          <th className="px-3 py-2 font-medium text-right text-yellow-400">수익률</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pnlHistory.map((item, i) => (
                          <tr key={item.date} className={`border-b border-gray-800 ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]'}`}>
                            <td className="px-3 py-2 font-mono text-gray-300 font-bold">{item.date}</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-400">{Math.floor(item.total_buy || 0).toLocaleString()} 원</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-400">{Math.floor(item.total_sell || 0).toLocaleString()} 원</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-500">{Math.floor(item.fees || 0).toLocaleString()} 원</td>
                            <td className="px-3 py-2 text-right font-mono text-gray-500">{Math.floor(item.tax || 0).toLocaleString()} 원</td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${(item.net_pnl || 0) > 0 ? 'text-red-400' : ((item.net_pnl || 0) < 0 ? 'text-blue-400' : 'text-gray-400')}`}>
                              {(item.net_pnl || 0) > 0 ? '+' : ''}{Math.floor(item.net_pnl || 0).toLocaleString()} 원
                            </td>
                            <td className={`px-3 py-2 text-right font-mono font-bold ${(item.return_rate || 0) > 0 ? 'text-red-400' : ((item.return_rate || 0) < 0 ? 'text-blue-400' : 'text-gray-400')}`}>
                              {(item.return_rate || 0) > 0 ? '+' : ''}{(item.return_rate || 0).toFixed(2)}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Per-Stock Detailed Breakdown */}
                <div className="pt-2">
                  <div className="text-sm font-bold text-gray-300 mb-2 flex items-center justify-between">
                    <span>📑 종목별 상세 매매 내역</span>
                    <span className="text-xs text-gray-500 font-normal">총 {detailedLedger.length}건 기록됨</span>
                  </div>
                  {detailedLedger.length === 0 ? (
                    <div className="py-6 text-center text-gray-500 text-xs">종목별 상세 매매 내역이 없습니다.</div>
                  ) : (
                    <div className="border border-gray-800 rounded bg-[#0a0a0a] max-h-[300px] overflow-y-auto">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-[#1a1a1a] text-gray-400 border-b border-gray-800 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 font-medium">거래일자</th>
                            <th className="px-3 py-2 font-medium">종목명(코드)</th>
                            <th className="px-3 py-2 font-medium text-right">수량</th>
                            <th className="px-3 py-2 font-medium text-right">매수가</th>
                            <th className="px-3 py-2 font-medium text-right">15:30 종가(매도)</th>
                            <th className="px-3 py-2 font-medium text-right">종목별 실현손익</th>
                            <th className="px-3 py-2 font-medium text-center">정산상태</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailedLedger.map((row, i) => {
                            const pnlVal = row.pnl || 0;
                            const pnlColor = pnlVal > 0 ? 'text-red-400' : (pnlVal < 0 ? 'text-blue-400' : 'text-gray-400');
                            return (
                              <tr key={row.id || i} className={`border-b border-gray-800 ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]'}`}>
                                <td className="px-3 py-2 font-mono text-gray-400">{row.trade_date}</td>
                                <td className="px-3 py-2 font-bold text-gray-200">
                                  {row.name} <span className="text-[10px] text-gray-500 font-mono">({row.ticker})</span>
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-gray-300">{(row.qty || 0).toLocaleString()} 주</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-300">{(row.buy_price || 0).toLocaleString()} 원</td>
                                <td className="px-3 py-2 text-right font-mono text-gray-300">{(row.sell_price || 0).toLocaleString()} 원</td>
                                <td className={`px-3 py-2 text-right font-mono font-bold ${pnlColor}`}>
                                  {pnlVal > 0 ? '+' : ''}{Math.floor(pnlVal).toLocaleString()} 원
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-950 text-green-400 border border-green-800">
                                    {row.status === 'SELL' ? '종가매도완료' : row.status}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
