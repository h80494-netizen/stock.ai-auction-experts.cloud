import React, { useState, useMemo, useEffect, useCallback } from 'react';

export default function OrderWindow({ stocks }: { stocks: any[] }) {
  // Default investment amount: 100,000,000 won (1억 원)
  const [totalAmount, setTotalAmount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('orderTotalAmount');
      if (saved) return Number(saved);
    }
    return 100000000;
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

  // 9시 5분 스냅샷 관리 (고정된 리스트)
  const [frozenStocks, setFrozenStocks] = useState<any[]>(() => {
    if (typeof window !== 'undefined') {
      const today = new Date().toISOString().split('T')[0];
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

  // 강제 활성화 (테스트용)
  const [forceEnable, setForceEnable] = useState(true);

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
              setFrozenStocks(data);
              localStorage.setItem('frozen_date_0905', today);
              localStorage.setItem('frozen_data_0905', JSON.stringify(data));
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

  // 9시 5분 시점에 고정된 종목 리스트를 기준으로 UI 표시, 실시간 비중만 병합
  const orderStocks = useMemo(() => {
    if (frozenStocks.length > 0) {
      return frozenStocks.map(fs => {
        const realtimeData = foreignOrderStocks.find(rs => rs.ticker === fs.ticker);
        const fallbackData = computedStocks.find(cs => cs.ticker === fs.ticker || cs.ticker === `KRX:${fs.ticker}`);
        
        let liveRatio = fs.foreign_ratio !== undefined ? fs.foreign_ratio : (fs.foreignRatio || 0);
        if (realtimeData) {
           liveRatio = realtimeData.foreign_ratio !== undefined ? realtimeData.foreign_ratio : (realtimeData.foreignRatio || 0);
        } else if (fallbackData) {
           liveRatio = fallbackData.foreignRatio || 0;
        }

        return {
          ...fs,
          ratio0905: fs.foreign_ratio !== undefined ? fs.foreign_ratio : (fs.foreignRatio || 0),
          currentRatio: liveRatio
        };
      }).slice(0, 20);
    }
    return [];
  }, [frozenStocks, foreignOrderStocks, computedStocks]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('orderTotalAmount', totalAmount.toString());
    }
  }, [totalAmount]);

  // Local state for tracking bought stocks (Holdings)
  const [holdings, setHoldings] = useState<{
    ticker: string;
    name: string;
    buyPrice: number;
    qty: number;
  }[]>([]);

  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  
  // Fetch real-time prices
  useEffect(() => {
    const fetchLivePrices = async () => {
      try {
        const orderTickers = orderStocks.map((s: any) => s.ticker);
        const holdingTickers = holdings.map(h => h.ticker);
        const allTickersSet = new Set([...orderTickers, ...holdingTickers]);
        if (allTickersSet.size === 0) return;

        const tickersStr = Array.from(allTickersSet).join(',');
        const res = await fetch(`/api/realtime-prices?tickers=${tickersStr}`);
        if (!res.ok) throw new Error(res.statusText || 'API Error');
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setLivePrices(prev => ({ ...prev, ...data }));
        }
      } catch (e) { console.error(e); }
    };

    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 5000);
    return () => clearInterval(interval);
  }, [orderStocks, holdings]);

  // PnL History & Detailed Ledger State
  const [pnlHistory, setPnlHistory] = useState<any[]>([]);
  const [detailedLedger, setDetailedLedger] = useState<any[]>([]);
  const [showLedger, setShowLedger] = useState(false);
  const [showHoldingsModal, setShowHoldingsModal] = useState(false);

  const fetchHoldings = async () => {
    try {
      const res = await fetch('/api/holdings');
      if (!res.ok) {
        console.warn('fetchHoldings returned status:', res.status);
        return;
      }
      const data = await res.json();
      setHoldings(Array.isArray(data) ? data : []);
    } catch (e) { console.error(e); }
  };

  const fetchLedger = async () => {
    try {
      const res = await fetch('/api/ledger-history');
      if (res.ok) {
        const data = await res.json();
        setPnlHistory(Array.isArray(data) ? data : []);
      }
    } catch (e) { console.error(e); }

    try {
      const resDetailed = await fetch('/api/detailed-trading-ledger');
      if (resDetailed.ok) {
        const dataDetailed = await resDetailed.json();
        setDetailedLedger(Array.isArray(dataDetailed) ? dataDetailed : []);
      }
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    fetchHoldings();
    fetchLedger();
    const interval = setInterval(() => {
      fetchHoldings();
      fetchLedger();
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const alreadyBoughtToday = pnlHistory.some(h => h.date === todayStr) || holdings.length > 0;

  // 매수 완료된 종목의 매입단가, 매수수량, 주문금액, 체결시간 스냅샷 관리
  const [buySnapshot, setBuySnapshot] = useState<Record<string, {price: number, qty: number, orderTotal: number, time?: string}>>({});

  useEffect(() => {
    if (holdings.length > 0) {
      let existingSnapshot: Record<string, any> = {};
      const savedDate = localStorage.getItem('buySnapshot_date');
      if (savedDate === todayStr) {
        const savedData = localStorage.getItem('buySnapshot_data');
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
      localStorage.setItem('buySnapshot_date', todayStr);
      localStorage.setItem('buySnapshot_data', JSON.stringify(snapshot));
    } else {
      const savedDate = localStorage.getItem('buySnapshot_date');
      if (savedDate === todayStr) {
        const savedData = localStorage.getItem('buySnapshot_data');
        if (savedData) setBuySnapshot(JSON.parse(savedData));
      }
    }
  }, [holdings, todayStr]);

  // Compute portfolio totals
  const portfolioSummary = useMemo(() => {
    let totalBuyAmount = 0;
    let totalCurrentAmount = 0;
    let totalPnL = 0;
    
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

    return { totalBuyAmount, totalCurrentAmount, totalPnL };
  }, [holdings, stocks, livePrices]);

  const handleBuyAll = async () => {
    if (orderStocks.length === 0) return;
    if (!window.confirm(`총 ${orderStocks.length}종목에 대해 각각 최대 ${amountPerStock.toLocaleString()}원씩 일괄 매수(매도 3호가/시장가) 주문을 전송하시겠습니까?`)) {
      return;
    }
    
    let successCount = 0;
    
    // 5종목씩 병렬 처리하여 속도 개선 및 KIS API rate limit 방지
    const batchSize = 5;
    for (let i = 0; i < orderStocks.length; i += batchSize) {
      const batch = orderStocks.slice(i, i + batchSize);
      const promises = batch.map(async (stock) => {
        const cleanTicker = stock.ticker.split(':').pop() || stock.ticker;
        const liveP = livePrices[stock.ticker] || livePrices[`KRX:${stock.ticker}`] || stock.price || 0;
        const price = liveP; 
        if (price <= 0) return 0; 
        
        const qty = Math.floor(amountPerStock / price);
        if (qty <= 0) return 0;
        
        try {
          const res = await fetch(`/api/kis/order/${cleanTicker}?qty=${qty}&price=${price}&type=buy&name=${encodeURIComponent(stock.name)}`, { method: 'POST' });
          if (!res.ok) return 0;
          const data = await res.json();
          return (data.success || data.error) ? 1 : 0;
        } catch (err) {
          console.error(err);
          return 0;
        }
      });
      const results = await Promise.all(promises);
      successCount += results.reduce((sum: number, res) => sum + res, 0);
    }
    
    await fetchHoldings();
    alert(`${successCount}종목에 대해 일괄 매수 주문이 완료되었습니다.`);
  };

  const handleBuySingle = async (ticker: string, name: string, price: number, qty: number) => {
    try {
      const cleanTicker = ticker.split(':').pop() || ticker;
      const res = await fetch(`/api/kis/order/${cleanTicker}?qty=${qty}&type=buy&price=${price}&name=${encodeURIComponent(name)}`, { method: 'POST' });
      if (!res.ok) throw new Error(res.statusText || 'API Error');
      const data = await res.json();
      if (data.success) {
        alert(`${cleanTicker} 종목 ${qty}주 매수 주문이 한국투자증권(모의투자)에 성공적으로 접수되었습니다.`);
        await fetchHoldings();
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
      const res = await fetch(`/api/kis/order/${cleanTicker}?qty=${qty}&type=sell`, { method: 'POST' });
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

    if (!window.confirm(`전체 보유 종목을 동시호가 시장가로 일괄 매도하시겠습니까? (예상 확정손익 ${portfolioSummary.totalPnL.toLocaleString()}원)`)) {
      return;
    }

    // Let backend handle the individual KIS sell orders via api_kis_sell_all
    // so we don't delete holdings prematurely before recording ledger.

    try {
      const res = await fetch(`/api/kis/sell-all?buy=${portfolioSummary.totalBuyAmount}&sell=${portfolioSummary.totalCurrentAmount}`, { method: 'POST' });
      if (!res.ok) {
        alert("일괄매도 처리 중 서버 오류가 발생했습니다. (상태 코드: " + res.status + ")");
        return;
      }
      const data = await res.json();
      
      if (data.success) {
        await fetchHoldings();
        await fetchLedger();
        if (typeof window !== 'undefined') {
          localStorage.removeItem('orderTotalAmount');
        }
        setTotalAmount(100000000);
        alert(`일괄매도(동시호가 시장가) 완료! 총 확정순이익 ${data.net_pnl.toLocaleString()}원이 거래원장에 기록되었습니다.`);
      } else {
        alert(`일괄매도 실패: ${data.error}`);
      }
    } catch (e) {
      console.error(e);
      alert("일괄매도 처리 중 오류가 발생했습니다.");
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value.replace(/,/g, ''));
    if (!isNaN(val)) {
        setTotalAmount(val);
    }
  };

  const now = new Date();
  const isMarketOpenForStats = forceEnable || (now.getHours() > 9) || (now.getHours() === 9 && now.getMinutes() >= 5);
  
  return (
    <div className="flex h-[calc(100vh-120px)] w-full bg-black text-gray-200">
      <div className="w-full flex flex-col p-2 h-full">
        
        <div className="flex justify-between items-center mb-2 px-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-red-500 flex-shrink-0">
              🚨 매수주문 (외국계 창구 순매수 {threshold}%↑, KOSPI·KOSDAQ 전종목 상위 20)
            </h2>
            <div className="flex items-center gap-1">
              <input 
                type="number" 
                value={thresholdInput} 
                onChange={e => setThresholdInput(e.target.value)}
                className="bg-gray-800 text-xs text-gray-300 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-red-500 w-16 text-right font-bold"
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
              <span className="text-xs text-yellow-400 bg-yellow-950/60 border border-yellow-800/80 px-2 py-0.5 rounded">
                조건 부합: {orderStocks.length}개 종목 {orderStocks.length <= 20 ? '(전체 표시)' : '(상위 20개)'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => fetchForeignStocks(threshold, true)}
              disabled={isScanning}
              className="text-xs bg-gray-800 hover:bg-gray-700 border border-gray-700 px-2 py-1 rounded text-gray-300 transition-colors"
            >
              🔄 실시간 전종목 재스캔
            </button>
            <label className="text-xs text-gray-400 cursor-pointer flex items-center">
              <input type="checkbox" className="mr-1" checked={forceEnable} onChange={e => setForceEnable(e.target.checked)} />
              강제 활성화 (테스트용)
            </label>
          </div>
        </div>

        <div className="flex gap-2 mb-3">
          {/* Investment Amount Input */}
          <div className="flex-1 bg-[#1a1a1a] border border-gray-800 rounded p-4 flex flex-col gap-2">
            <label className="text-gray-400 font-bold text-sm mb-1 block">전체 투자 금액 (총액 설정)</label>
            <div className="flex items-center gap-2">
              <input 
                type="text" 
                value={totalAmount.toLocaleString()} 
                onChange={handleAmountChange}
                disabled={alreadyBoughtToday && !forceEnable}
                className={`bg-black border border-gray-700 rounded px-3 py-2 text-right font-mono font-bold w-full text-lg focus:outline-none focus:border-yellow-500 transition-colors ${alreadyBoughtToday && !forceEnable ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
              <span className="text-gray-400 font-bold">원</span>
            </div>
            <div className="text-xs text-gray-500 mt-1">
              종목당 배정 금액 (1/N): <span className="font-mono text-gray-300">{Math.floor(amountPerStock).toLocaleString()}</span> 원
            </div>
            <div className="flex gap-2 mt-2">
              <button 
                onClick={handleBuyAll}
                disabled={!isMarketOpenForStats || orderStocks.length === 0 || (!forceEnable && alreadyBoughtToday)}
                className="bg-red-700 hover:bg-red-600 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold py-1.5 px-4 rounded transition-colors whitespace-nowrap flex-1"
              >
                {(!forceEnable && alreadyBoughtToday) ? '금일 매수 완료' : '일괄 매수'}
              </button>
            </div>
          </div>
          
          {/* Portfolio Summary Panel */}
          <div className="flex-[2] bg-[#1a1a1a] border border-gray-800 rounded p-4 flex gap-4">
            <div className="flex-1 border-r border-gray-800 pr-4">
               <label className="text-gray-500 font-bold text-sm mb-1 block">전체 매입금액</label>
               <div className="text-xl font-mono text-gray-200 mt-2">{portfolioSummary.totalBuyAmount.toLocaleString()} <span className="text-sm">원</span></div>
            </div>
            <div className="flex-1 border-r border-gray-800 px-4">
               <label className="text-gray-500 font-bold text-sm mb-1 block">현재 평가액</label>
               <div className="text-xl font-mono text-gray-200 mt-2">{portfolioSummary.totalCurrentAmount.toLocaleString()} <span className="text-sm">원</span></div>
            </div>
            <div className="flex-1 pl-4">
               <label className="text-gray-500 font-bold text-sm mb-1 block">전체 손익 (종가시 예상)</label>
               <div className={`text-2xl font-mono font-bold mt-1 ${portfolioSummary.totalPnL > 0 ? 'text-red-400' : (portfolioSummary.totalPnL < 0 ? 'text-blue-400' : 'text-gray-400')}`}>
                 {portfolioSummary.totalPnL > 0 ? '+' : ''}{Math.floor(portfolioSummary.totalPnL).toLocaleString()} <span className="text-sm">원</span>
               </div>
            </div>
            <div className="flex items-center ml-2 gap-2">
               <button 
                  onClick={() => setShowHoldingsModal(true)}
                  className="bg-emerald-900/90 hover:bg-emerald-700 border border-emerald-500 text-white font-bold py-2 px-3 rounded text-xs transition-colors whitespace-nowrap h-full flex flex-col items-center justify-center min-w-[90px]"
               >
                 <span className="text-sm">📋 보유리스트</span>
                 <span className="text-[11px] text-emerald-300 font-normal">({holdings.length}종목)</span>
               </button>
               <button 
                  onClick={handleSellAll}
                  disabled={holdings.length === 0}
                  className="bg-blue-900/90 hover:bg-blue-700 disabled:bg-gray-800 border border-blue-500 text-white font-bold py-2 px-3 rounded text-xs transition-colors whitespace-nowrap h-full flex flex-col items-center justify-center min-w-[80px]"
               >
                 <span>일괄매도</span>
                 <span className="text-[10px] text-blue-300 font-normal">(손익 확정)</span>
               </button>
               <button 
                  onClick={() => setShowLedger(true)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold py-2 px-3 rounded text-xs transition-colors whitespace-nowrap h-full flex flex-col items-center justify-center min-w-[80px]"
               >
                 <span>매매원장</span>
                 <span className="text-[10px] text-gray-400 font-normal">(조회)</span>
               </button>
            </div>
          </div>
        </div>
        
        {/* Table Container with Scrollbar */}
        <div className="flex-1 border border-gray-800 rounded bg-[#0a0a0a] overflow-y-auto">
          <table className="w-full text-xs text-left relative">
            <thead className="bg-gray-900 text-gray-400 border-b border-gray-800 sticky top-0 shadow-md z-10">
              <tr>
                <th className="px-3 py-2 font-medium w-24">종목코드</th>
                <th className="px-3 py-2 font-medium">종목명</th>
                <th className="px-3 py-2 font-medium text-right">현재가</th>
                <th className="px-3 py-2 font-medium text-right">등락률</th>
                <th className="px-3 py-2 font-medium text-right text-purple-400">외국계순매수량</th>
                <th className="px-3 py-2 font-medium text-right text-yellow-400">9시5분 비중</th>
                <th className="px-3 py-2 font-medium text-right text-orange-400">실시간 비중</th>
                <th className="px-3 py-2 font-medium text-right text-gray-400">총거래량</th>
                <th className="px-3 py-2 font-medium text-right text-blue-400">매수수량 (1/N)</th>
                <th className="px-3 py-2 font-medium text-right text-green-400">주문금액</th>
                <th className="px-3 py-2 font-medium text-center">개별주문</th>
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
                
                const liveP = livePrices[stock.ticker] || livePrices[cleanTicker] || livePrices[`KRX:${cleanTicker}`] || stock.price || 0;
                const priceForOrder = liveP > 0 ? liveP : (snap ? snap.price : (stock.price || 1));
                const qty = snap ? snap.qty : Math.floor(amountPerStock / priceForOrder);
                const orderTotal = snap ? snap.orderTotal : qty * priceForOrder;
                const changePctStr = stock.changePct > 0 ? `+${stock.changePct}%` : `${stock.changePct}%`;
                const changeColor = stock.changePct > 0 ? 'text-red-400' : (stock.changePct < 0 ? 'text-blue-400' : 'text-gray-400');

                const netBuy = stock.foreign_net_buy !== undefined ? stock.foreign_net_buy : (stock.foreignSumCurrent || 0);
                const currentRatio = stock.foreign_ratio !== undefined ? stock.foreign_ratio : (stock.foreignRatio || 0);
                const snapRatio = stock.ratio0905 !== undefined ? stock.ratio0905 : currentRatio;
                const totalVol = stock.total_volume || stock.volume || stock.totalVol || 0;

                const market = stock.market || (cleanTicker.startsWith('0') ? 'KOSPI' : 'KOSDAQ');

                return (
                  <tr key={stock.ticker} className={`border-b border-gray-800 hover:bg-gray-800/50 ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]'}`}>
                    <td className="px-3 py-3 font-mono text-gray-400">{cleanTicker}</td>
                    <td className="px-3 py-3 font-bold flex items-center gap-1.5 flex-wrap">
                      <span className={`text-[10px] font-mono px-1 py-0.5 rounded border ${
                        market === 'KOSDAQ' 
                          ? 'bg-purple-950/70 border-purple-800 text-purple-300' 
                          : 'bg-blue-950/70 border-blue-800 text-blue-300'
                      }`}>
                        {market}
                      </span>
                      <span>{stock.name}</span>
                      {snap && <span className="ml-1 text-[10px] bg-green-900/50 text-green-400 px-1 py-0.5 rounded border border-green-800">매수가 {(snap.price || 0).toLocaleString()}원 {snap.time ? `(${snap.time})` : ''}</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-white">{(liveP || stock.price || priceForOrder || 0).toLocaleString()}</td>
                    <td className={`px-3 py-3 text-right font-mono font-bold ${changeColor}`}>{changePctStr}</td>
                    <td className="px-3 py-3 text-right font-mono text-purple-300">
                      {netBuy > 0 ? '+' : ''}{Math.floor(netBuy).toLocaleString()}주
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-yellow-400">
                      {snapRatio.toFixed(2)}%
                    </td>
                    <td className={`px-3 py-3 text-right font-mono font-bold ${currentRatio >= threshold ? 'text-orange-400' : 'text-gray-500'}`}>
                      {currentRatio.toFixed(2)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-300">
                      {Math.floor(totalVol).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-blue-300">{qty.toLocaleString()} 주</td>
                    <td className="px-3 py-3 text-right font-mono text-green-300">{orderTotal.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        <button 
                          onClick={() => handleBuySingle(stock.ticker, stock.name, priceForOrder, qty)}
                          className="bg-gray-800 border border-gray-600 hover:bg-gray-700 hover:border-red-500 text-gray-200 font-bold py-1 px-2 rounded text-xs transition-colors"
                        >
                          매수
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
        <div className="mt-3 flex-none border border-gray-800 rounded bg-[#111]">
          <div className="px-3 py-2 bg-gray-900 border-b border-gray-800 font-bold text-gray-300 flex justify-between items-center">
            <span>📋 보유 잔고 및 실시간 손익 (종가시 최종수익)</span>
            <span className="text-xs text-gray-400 font-normal">보유 종목: {holdings.length}개</span>
          </div>
          <div className="max-h-[220px] overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#1a1a1a] text-gray-400 border-b border-gray-800 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-medium">종목명</th>
                  <th className="px-3 py-2 font-medium text-right text-yellow-400">9시5분 비중</th>
                  <th className="px-3 py-2 font-medium text-right text-orange-400">실시간 비중</th>
                  <th className="px-3 py-2 font-medium text-right">보유수량</th>
                  <th className="px-3 py-2 font-medium text-right">매입단가</th>
                  <th className="px-3 py-2 font-medium text-right">현재가</th>
                  <th className="px-3 py-2 font-medium text-right text-orange-400">순이익</th>
                  <th className="px-3 py-2 font-medium text-right text-green-400">종가시 최종수익(예상)</th>
                  <th className="px-3 py-2 font-medium text-center">동작</th>
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
                    
                    const frozenMatch = frozenStocks.find(fs => fs.ticker === h.ticker || fs.ticker === `KRX:${h.ticker}` || fs.clean_ticker === cleanTicker);
                    const foreignMatch = foreignOrderStocks.find(fs => fs.ticker === h.ticker || fs.ticker === `KRX:${h.ticker}` || fs.clean_ticker === cleanTicker);

                    let ratio0905 = (h as any).ratio0905 !== undefined ? (h as any).ratio0905 
                      : (frozenMatch ? (frozenMatch.foreign_ratio !== undefined ? frozenMatch.foreign_ratio : frozenMatch.foreignRatio) 
                      : ((h as any).foreign_ratio !== undefined ? (h as any).foreign_ratio : undefined));

                    let liveRatio = (h as any).foreign_ratio !== undefined ? (h as any).foreign_ratio 
                      : (foreignMatch ? (foreignMatch.foreign_ratio !== undefined ? foreignMatch.foreign_ratio : (foreignMatch.foreignRatio || 0)) 
                      : (currentStock ? (currentStock.foreignRatio || currentStock.foreign_ratio || 0) : 0));
                    
                    return (
                      <tr key={h.ticker} className={`border-b border-gray-800 ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]'}`}>
                        <td className="px-3 py-3 font-bold">{h.name}</td>
                        <td className="px-3 py-3 text-right font-mono font-bold text-yellow-400">
                          {ratio0905 !== undefined ? ratio0905.toFixed(2) : '-'}%
                        </td>
                        <td className={`px-3 py-3 text-right font-mono font-bold ${liveRatio >= 5 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {liveRatio.toFixed(2)}%
                        </td>
                        <td className="px-3 py-3 text-right font-mono">{h.qty.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-mono">{Math.floor(h.buyPrice).toLocaleString()}</td>
                        <td className="px-3 py-3 text-right font-mono">{currentPrice.toLocaleString()}</td>
                        <td className={`px-3 py-3 text-right font-mono font-bold ${pnlColor}`}>
                          {netProfit > 0 ? '+' : ''}{Math.floor(netProfit).toLocaleString()} 원
                        </td>
                        <td className={`px-3 py-3 text-right font-mono font-bold ${pnlColor}`}>
                          {finalProfit > 0 ? '+' : ''}{Math.floor(finalProfit).toLocaleString()} 원
                        </td>
                        <td className="px-3 py-2 text-center">
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
                    <td colSpan={9} className="px-3 py-6 text-center text-gray-500 font-bold">
                      현재 보유 중인 종목이 없습니다. (상단 일괄매수 또는 종목별 매수 시 보유 잔고에 표시됩니다)
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
                            fs.ticker === h.ticker || 
                            fs.ticker === `KRX:${h.ticker}` || 
                            fs.clean_ticker === cleanTicker ||
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
                          
                          // 9시 5분 비중
                          let ratio0905: number | undefined = (h as any).ratio0905 !== undefined ? (h as any).ratio0905 
                            : (frozenMatch ? (frozenMatch.ratio0905 !== undefined ? frozenMatch.ratio0905 : (frozenMatch.foreign_ratio !== undefined ? frozenMatch.foreign_ratio : frozenMatch.foreignRatio)) 
                            : ((h as any).foreign_ratio !== undefined ? (h as any).foreign_ratio : undefined));

                          // 실시간 비중
                          let liveRatio: number = (h as any).foreign_ratio !== undefined ? (h as any).foreign_ratio 
                            : (foreignMatch ? (foreignMatch.foreign_ratio !== undefined ? foreignMatch.foreign_ratio : (foreignMatch.foreignRatio || 0)) 
                            : (currentStock ? (currentStock.foreignRatio || currentStock.foreign_ratio || 0) : 0));

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
