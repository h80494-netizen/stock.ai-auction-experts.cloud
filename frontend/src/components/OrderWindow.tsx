import React, { useState, useMemo, useEffect } from 'react';

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

  // Compute live foreign ratios
  const computedStocks = useMemo(() => {
    return stocks.map(stock => {
      // API에서 전달된 실제 순매수량 및 총거래량 사용 (가짜 로직 제거)
      const foreignNetBuy = stock.foreign_net_buy || 0;
      const totalVol = stock.total_volume || stock.volume || 1; 
      
      const foreignRatio = (foreignNetBuy / totalVol) * 100;
      
      return { ...stock, foreignSumCurrent: foreignNetBuy, totalVol, foreignRatio };
    });
  }, [stocks]);

  // 9시 5분 스냅샷 관리
  const [snapshotData, setSnapshotData] = useState<Record<string, number>>({});
  
  // 사용자 지정 임계값 (기본 20%)
  const [threshold, setThreshold] = useState<number>(20);
  
  useEffect(() => {
    if (computedStocks.length === 0) return;
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const isAfter0905 = now.getHours() > 9 || (now.getHours() === 9 && now.getMinutes() >= 5);
    
    // 강제 활성화 모드이거나 9시 5분 이후일 때 스냅샷 생성/불러오기
    if (isAfter0905) {
      const savedDate = localStorage.getItem('snapshot0905_date_v2');
      const savedData = localStorage.getItem('snapshot0905_data_v2');
      
      if (savedDate === todayStr && savedData) {
        // 오늘자 스냅샷이 이미 있으면 로드
        setSnapshotData(JSON.parse(savedData));
      } else {
        // 오늘자 스냅샷이 없으면 현재 상태를 9시 5분 상태로 간주하고 저장
        const newData: Record<string, number> = {};
        computedStocks.forEach(s => {
          newData[s.ticker] = s.foreignRatio;
        });
        setSnapshotData(newData);
        localStorage.setItem('snapshot0905_date_v2', todayStr);
        localStorage.setItem('snapshot0905_data_v2', JSON.stringify(newData));
      }
    }
  }, [computedStocks]);

  // 외국계 증권사 순매수 비중 임계값 초과 종목 필터링 후 상위 20개 추출 (9시 5분 스냅샷 기준)
  const orderStocks = useMemo(() => {
    if (Object.keys(snapshotData).length === 0) {
      // 스냅샷이 없으면 (9시 5분 이전) 실시간 기준으로 보여줌
      return computedStocks
        .filter(s => s.foreignRatio >= threshold)
        .sort((a, b) => b.foreignRatio - a.foreignRatio)
        .slice(0, 20);
    }
    
    // 스냅샷이 있으면 9시 5분 비율 기준으로 고정 및 필터링
    return computedStocks
      .filter(s => snapshotData[s.ticker] >= threshold)
      .map(s => ({ ...s, ratio0905: snapshotData[s.ticker] }))
      .sort((a, b) => b.ratio0905 - a.ratio0905)
      .slice(0, 20);
  }, [computedStocks, snapshotData, threshold]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('orderTotalAmount', totalAmount.toString());
    }
  }, [totalAmount]);

  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  
  // Fetch real-time prices
  useEffect(() => {
    if (orderStocks.length === 0) return;
    const fetchLivePrices = async () => {
      try {
        const tickers = orderStocks.map(s => s.ticker).join(',');
        const res = await fetch(`/api/realtime-prices?tickers=${tickers}`);
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
  }, [orderStocks]);

  // PnL History State
  const [pnlHistory, setPnlHistory] = useState<any[]>([]);
  const [showLedger, setShowLedger] = useState(false);

  // Local state for tracking bought stocks (Holdings)
  const [holdings, setHoldings] = useState<{
    ticker: string;
    name: string;
    buyPrice: number;
    qty: number;
  }[]>([]);

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
      if (!res.ok) throw new Error(res.statusText || 'API Error');
      const data = await res.json();
      setPnlHistory(Array.isArray(data) ? data : []);
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
      const currentStock = stocks.find(s => s.ticker === h.ticker || s.ticker === `KRX:${h.ticker}`);
      const livePrice = livePrices[h.ticker] || livePrices[`KRX:${h.ticker}`];
      const currentPrice = livePrice || currentStock?.price || (h as any).currentPrice || h.buyPrice;
      const buyAmount = h.buyPrice * h.qty;
      const currentAmount = currentPrice * h.qty;
      const pnl = currentAmount - buyAmount;
      
      totalBuyAmount += buyAmount;
      totalCurrentAmount += currentAmount;
      totalPnL += pnl;
    });

    return { totalBuyAmount, totalCurrentAmount, totalPnL };
  }, [holdings, stocks]);

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

  const [forceEnable, setForceEnable] = useState(true);
  const now = new Date();
  const isMarketOpenForStats = forceEnable || (now.getHours() > 9) || (now.getHours() === 9 && now.getMinutes() >= 5);
  
  return (
    <div className="flex h-[calc(100vh-120px)] w-full bg-black text-gray-200">
      <div className="w-full flex flex-col p-2 h-full">
        
        <div className="flex justify-between items-center mb-2 px-2">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-red-500 flex-shrink-0">🚨 매수주문 (외국인 순매수 {threshold}%↑)</h2>
            <select 
              value={threshold} 
              onChange={e => setThreshold(Number(e.target.value))}
              className="bg-gray-800 text-xs text-gray-300 border border-gray-600 rounded px-2 py-1 focus:outline-none focus:border-red-500"
            >
              <option value={20}>20% (기본)</option>
              <option value={15}>15%</option>
              <option value={10}>10%</option>
              <option value={5}>5%</option>
              <option value={1}>1% (테스트)</option>
              <option value={0}>0% (모두보기)</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
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
            <div className="flex items-center ml-2">
               <button 
                  onClick={handleSellAll}
                  disabled={holdings.length === 0}
                  className="bg-blue-900 hover:bg-blue-700 disabled:bg-gray-800 border border-blue-500 text-white font-bold py-3 px-4 rounded text-sm transition-colors whitespace-nowrap h-full"
               >
                 일괄매도<br/>(손익 확정)
               </button>
               <button 
                  onClick={() => setShowLedger(true)}
                  className="bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white font-bold py-3 px-4 ml-2 rounded text-sm transition-colors whitespace-nowrap h-full"
               >
                 매매원장<br/>조회
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
                const cleanTicker = stock.ticker.split(':').pop() || stock.ticker;
                const snap = buySnapshot[cleanTicker];
                
                const liveP = livePrices[stock.ticker] || stock.price || 1;
                const price = snap ? snap.price : liveP; // avoid division by zero
                const qty = snap ? snap.qty : Math.floor(amountPerStock / price);
                const orderTotal = snap ? snap.orderTotal : qty * price;
                const changePctStr = stock.changePct > 0 ? `+${stock.changePct}%` : `${stock.changePct}%`;
                const changeColor = stock.changePct > 0 ? 'text-red-400' : (stock.changePct < 0 ? 'text-blue-400' : 'text-gray-400');

                return (
                  <tr key={stock.ticker} className={`border-b border-gray-800 hover:bg-gray-800/50 ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]'}`}>
                    <td className="px-3 py-3 font-mono text-gray-400">{cleanTicker}</td>
                    <td className="px-3 py-3 font-bold">
                      {stock.name}
                      {snap && <span className="ml-2 text-[10px] bg-green-900/50 text-green-400 px-1 py-0.5 rounded border border-green-800">매입고정 {snap.time ? `(${snap.time})` : ''}</span>}
                    </td>
                    <td className="px-3 py-3 text-right font-mono">{(price || 0).toLocaleString()}</td>
                    <td className={`px-3 py-3 text-right font-mono font-bold ${changeColor}`}>{changePctStr}</td>
                    <td className="px-3 py-3 text-right font-mono text-purple-300">
                      {stock.foreignSumCurrent > 0 ? '+' : ''}{Math.floor(stock.foreignSumCurrent).toLocaleString()}주
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-yellow-400">
                      {stock.ratio0905 !== undefined ? stock.ratio0905.toFixed(2) : stock.foreignRatio.toFixed(2)}%
                    </td>
                    <td className={`px-3 py-3 text-right font-mono font-bold ${stock.foreignRatio >= 5 ? 'text-orange-400' : 'text-gray-500'}`}>
                      {stock.foreignRatio.toFixed(2)}%
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-gray-300">
                      {Math.floor(stock.totalVol).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right font-mono font-bold text-blue-300">{qty.toLocaleString()} 주</td>
                    <td className="px-3 py-3 text-right font-mono text-green-300">{orderTotal.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex justify-center gap-1">
                        <button 
                          onClick={() => handleBuySingle(stock.ticker, stock.name, price, qty)}
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
                    현재 외국계 순매수 비중 20% 이상 종목이 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Holdings / PnL Table */}
        {holdings.length > 0 && (
          <div className="mt-4 flex-none border border-gray-800 rounded bg-[#111]">
            <div className="px-3 py-2 bg-gray-900 border-b border-gray-800 font-bold text-gray-300">
              보유 잔고 및 실시간 손익 (종가시 최종수익)
            </div>
            <div className="max-h-[300px] overflow-y-auto">
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
                  {holdings.map((h, i) => {
                    // Use computedStocks instead of stocks to get foreignRatio
                    const currentStock = computedStocks.find(s => s.ticker === h.ticker || s.ticker === `KRX:${h.ticker}`);
                    const currentPrice = currentStock?.price || h.buyPrice;
                    const netProfit = (currentPrice - h.buyPrice) * h.qty;
                    const finalProfit = netProfit; // Current profit is assumed to be final closing profit estimation

                    const pnlColor = netProfit > 0 ? 'text-red-400' : (netProfit < 0 ? 'text-blue-400' : 'text-gray-400');
                    
                    const ratio0905 = snapshotData[h.ticker];
                    const liveRatio = currentStock ? currentStock.foreignRatio : 0;
                    
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
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ledger Modal */}
        {showLedger && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#111] border border-gray-700 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-[#1a1a1a] rounded-t-xl">
                <h3 className="text-xl font-bold text-gray-200">상세 거래원장 (수수료/거래세 반영 실질수익)</h3>
                <button onClick={() => setShowLedger(false)} className="text-gray-400 hover:text-white transition-colors">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 overflow-y-auto">
                <div className="flex justify-end mb-2">
                  <span className="text-sm font-mono text-gray-400 font-bold bg-[#0a0a0a] px-3 py-1 rounded border border-gray-800">
                    Net Total: <span className="text-green-400">{pnlHistory.reduce((sum, item) => sum + (item.net_pnl || 0), 0).toLocaleString()}</span> 원
                  </span>
                </div>
                {pnlHistory.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 font-bold">기록된 거래원장이 없습니다. 매도 시 자동으로 기록됩니다.</div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="bg-[#1a1a1a] text-gray-400 border-b border-gray-800 sticky top-0">
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
                          <td className="px-3 py-2 font-mono text-gray-300">{item.date}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-400">{Math.floor(item.total_buy || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-400">{Math.floor(item.total_sell || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-500">{Math.floor(item.fees || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-mono text-gray-500">{Math.floor(item.tax || 0).toLocaleString()}</td>
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
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
