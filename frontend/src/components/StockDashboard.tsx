import React, { useState, useEffect, useMemo } from 'react';
import ChartsView from './ChartsView';
import AutocompleteSearch from './AutocompleteSearch';

interface StockDashboardProps {
  stocks?: any[];
  globalStocks?: any[];
  globalSearchTicker?: string;
  setGlobalSearchTicker?: (ticker: string) => void;
}

export default function StockDashboard({ stocks = [], globalStocks = [], globalSearchTicker, setGlobalSearchTicker }: StockDashboardProps) {
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedStock, setSelectedStock] = useState<any>(null);
  const [stockDetails, setStockDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [businessSummary, setBusinessSummary] = useState<string>('');
  const [financialPeriod, setFinancialPeriod] = useState<'annual'|'quarterly'>('annual');
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});

  useEffect(() => {
    const combined = [...globalStocks, ...stocks];
    if (combined.length === 0) return;
    const fetchLivePrices = async () => {
      try {
        const topStocks = combined.slice(0, 50).map(s => s.ticker).join(',');
        const res = await fetch(`/api/realtime-prices?tickers=${topStocks}`);
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
  }, [stocks, globalStocks]);
  
  // Separate domestic and foreign lists
  const domesticList = stocks.filter((s, idx, self) => 
    s.ticker && self.findIndex(t => t.ticker === s.ticker) === idx
  );
  const foreignList = globalStocks.filter((s, idx, self) => 
    s.ticker && self.findIndex(t => t.ticker === s.ticker) === idx
  );

  // Search DB
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/db/search/${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(res.statusText || 'API Error');
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const combinedList = useMemo(() => {
    const all = [...globalStocks, ...stocks];
    const seen = new Set();
    return all.filter(s => {
      if (!s.ticker) return false;
      if (seen.has(s.ticker)) return false;
      seen.add(s.ticker);
      return true;
    });
  }, [stocks, globalStocks]);

  // Sync with globalSearchTicker
  useEffect(() => {
    if (globalSearchTicker && (!selectedStock || selectedStock.ticker !== globalSearchTicker)) {
      handleSelect(globalSearchTicker);
    }
  }, [globalSearchTicker]);

  const handleSelect = async (ticker: string) => {
    setLoading(true);
    if (setGlobalSearchTicker && ticker !== globalSearchTicker) {
      setGlobalSearchTicker(ticker);
    }
    try {
      // First try to fetch from /api/fundamentals/ (more global coverage) or search
      const res = await fetch(`/api/fundamentals/${ticker}`);
      
      let data;
      if (!res.ok) {
        data = { error: `Server error: ${res.status}` };
      } else {
        try {
          if (!res.ok) throw new Error(res.statusText || 'API Error');
          data = await res.json();
        } catch (e) {
          data = { error: 'Invalid JSON response from server' };
        }
      }
      
      const selectedFromList = combinedList.find(s => s.ticker === ticker);
      
      if (data.error || data.detail) {
        // Fallback to DB
        const searchRes = await fetch(`/api/db/stock/${ticker}`);
        let searchData;
        if (!searchRes.ok) {
          searchData = { error: `DB Server error: ${searchRes.status}` };
        } else {
          try {
            if (!searchRes.ok) throw new Error(searchRes.statusText || 'API Error');
            searchData = await searchRes.json();
          } catch (e) {
            searchData = { error: 'Invalid JSON from DB' };
          }
        }
        
        if (!searchData.error && !searchData.detail && searchData.stock && searchData.stock.ticker) {
           data = searchData; // /api/db/stock/ returns { stock: {}, financials: [] }
        } else {
           // Even fallback failed (not in DB, yfinance failed). Mock it so chart still loads!
           data = { 
             stock: selectedFromList ? { ...selectedFromList } : { ticker, name: ticker, price: 0, currency: "KRW", change: 0, changePct: 0 }, 
             financials: [] 
           };
        }
      } else {
         // Wrap in structure expected by StockDashboard
         if (selectedFromList && selectedFromList.name && data.name && data.name === data.ticker) {
             delete data.name;
         }
         data = { stock: { ...(selectedFromList || {}), ...data }, financials: data.financials || [] };
      }
      
      setSelectedStock(data.stock);
      setStockDetails(data);
      setSearchResults([]); 
      setBusinessSummary('');
      // Fetch summary
      try {
        const sumRes = await fetch(`/api/stock/${ticker}/summary`);
        if (!sumRes.ok) throw new Error(sumRes.statusText || 'API Error');
        const sumData = await sumRes.json();
        setBusinessSummary(sumData.summary || '');
      } catch (e) {
        console.error("Summary fetch error", e);
      }
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  const currencyInfo = React.useMemo(() => {
    if (!stockDetails?.stock?.ticker) return { basic: '원', hm: '억원', div: 100000000 };
    const t = stockDetails.stock.ticker.toUpperCase();
    if (t.endsWith('.KS') || t.endsWith('.KQ')) return { basic: '원', hm: '억원', div: 100000000 };
    if (t.endsWith('.T')) return { basic: 'YEN', hm: '억엔', div: 100000000 };
    if (t.endsWith('.SS') || t.endsWith('.SZ') || t.endsWith('.CN')) return { basic: 'YUAN', hm: '억위안', div: 100000000 };
    if (t.endsWith('.HK')) return { basic: 'HKD', hm: '억홍콩달러', div: 100000000 };
    return { basic: 'US$', hm: '억달러', div: 100000000 };
  }, [stockDetails?.stock?.ticker]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-200 overflow-y-auto">
      <div className="p-4 border-b border-gray-800">
        <div className="flex gap-4 items-center max-w-2xl">
          <label className="text-gray-400 font-bold whitespace-nowrap">종목 검색:</label>
          <AutocompleteSearch 
            localStocks={combinedList} 
            onSelect={handleSelect} 
            placeholder="종목명 또는 티커 검색"
          />
        </div>
      </div>

      {loading && <div className="p-10 text-center text-gray-500">Loading...</div>}

      {stockDetails && !loading && (
        <div className="p-4 flex flex-col lg:flex-row gap-4 h-auto lg:h-full">
          {/* Left panel: Info & Financials & OrderBook */}
          <div className="w-full lg:w-1/3 flex flex-col gap-4 overflow-y-auto">
            
            <div className="bg-[#111] border border-gray-800 p-4 rounded">
              <div className="flex justify-between items-start mb-1">
                  <h2 className="text-2xl font-bold">{stockDetails.stock.name} <span className="text-gray-500 text-sm">{stockDetails.stock.ticker}</span></h2>
                  <button 
                      onClick={() => window.open(`/report/${stockDetails.stock.ticker}`, '_blank')}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded flex items-center gap-1 transition-colors"
                  >
                      📄 애널리스트 리포트
                  </button>
              </div>
              <div className="flex items-end gap-3 mb-4">
                <div className="text-3xl font-mono text-white">{(livePrices[stockDetails.stock.ticker] || stockDetails.stock.price || 0).toLocaleString()} <span className="text-sm text-gray-500">{stockDetails.stock.currency || currencyInfo.basic}</span></div>
                {stockDetails.stock.change !== undefined && (
                  <div className={`text-lg font-bold mb-1 ${stockDetails.stock.change > 0 ? 'text-red-500' : stockDetails.stock.change < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                    {stockDetails.stock.change > 0 ? '▲' : stockDetails.stock.change < 0 ? '▼' : ''} {Math.abs(stockDetails.stock.change).toLocaleString()} 
                    <span className="text-sm ml-1">({stockDetails.stock.change > 0 ? '+' : ''}{Number(stockDetails.stock.changePct).toFixed(2)}%)</span>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-y-2 text-sm font-mono">
                {(() => {
                  const s = stockDetails.stock;
                  const currentPrice = livePrices[s.ticker] || s.price || 1;
                  // If mcap exists (from kospi100 or api), use it. Otherwise, price * outstanding.
                  const s_shares = s.outstanding_shares || s.shares || 0;
                  const mcap = s.marketCap || s.market_cap || (currentPrice * s_shares);
                  // If outstanding is 0 but we have mcap, calculate outstanding.
                  const outShares = s_shares > 0 ? s_shares : (mcap > 0 && currentPrice > 0 ? Math.floor(mcap / currentPrice) : 0);
                  
                  // Get latest annual equity (자본총계)
                  const annualFinancials = (stockDetails.financials || []).filter((f: any) => !f.period.includes('Q'));
                  const latestEquity = annualFinancials.length > 0 ? annualFinancials[annualFinancials.length - 1].equity : 0;
                  const latestBps = annualFinancials.length > 0 ? annualFinancials[annualFinancials.length - 1].bps : s.bps;
                  const calculatedEquity = typeof latestBps === 'number' && latestBps > 0 ? latestBps * outShares : 0;
                  const totalEquity = latestEquity > 0 ? latestEquity : (calculatedEquity > 0 ? calculatedEquity : (s.capital || 0));

                  return (
                    <>
                      <div className="text-gray-500">주식발행수</div><div className="text-right">{outShares.toLocaleString()} 주</div>
                      <div className="text-gray-500">액면가</div><div className="text-right">{(s.par_value || 0).toLocaleString()} {currencyInfo.basic}</div>
                      <div className="text-gray-500">자본(총계)</div><div className="text-right">{(totalEquity / currencyInfo.div).toLocaleString(undefined, {maximumFractionDigits:1})} {currencyInfo.hm}</div>
                      <div className="text-gray-500">시가총액</div><div className="text-right">{(mcap / currencyInfo.div).toLocaleString(undefined, {maximumFractionDigits:0})} {currencyInfo.hm}</div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Virtual OrderBook */}
            <div className="bg-[#111] border border-gray-800 p-4 rounded">
              <h3 className="font-bold mb-3 border-b border-gray-700 pb-2">호가창 (가상)</h3>
              <div className="flex flex-col gap-1 text-sm font-mono">
                <div className="grid grid-cols-3 text-gray-500 mb-1 border-b border-gray-800 pb-1">
                  <div className="text-left">매도잔량</div>
                  <div className="text-center">호가</div>
                  <div className="text-right">매수잔량</div>
                </div>
                {Array.from({length: 5}, (_, i) => {
                  const p = stockDetails.stock.price || 50000;
                  const tick = p >= 500000 ? 1000 : p >= 100000 ? 500 : p >= 50000 ? 100 : p >= 10000 ? 50 : 10;
                  const price = p + tick * (5 - i);
                  return (
                    <div key={`ask-${i}`} className="grid grid-cols-3 bg-blue-900/20 text-blue-300 rounded px-1">
                      <div className="text-left">{Math.floor(Math.random() * 5000 + 100).toLocaleString()}</div>
                      <div className="text-center font-bold">{price.toLocaleString()}</div>
                      <div className="text-right">-</div>
                    </div>
                  );
                })}
                <div className="grid grid-cols-3 my-1 border-y border-gray-800 py-1 font-bold">
                  <div className="text-left"></div>
                  <div className="text-center text-white">{(stockDetails.stock.price || 0).toLocaleString()}</div>
                  <div className="text-right"></div>
                </div>
                {Array.from({length: 5}, (_, i) => {
                  const p = stockDetails.stock.price || 50000;
                  const tick = p >= 500000 ? 1000 : p >= 100000 ? 500 : p >= 50000 ? 100 : p >= 10000 ? 50 : 10;
                  const price = p - tick * (i + 1);
                  return (
                    <div key={`bid-${i}`} className="grid grid-cols-3 bg-red-900/20 text-red-300 rounded px-1">
                      <div className="text-left">-</div>
                      <div className="text-center font-bold">{price.toLocaleString()}</div>
                      <div className="text-right">{Math.floor(Math.random() * 5000 + 100).toLocaleString()}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-[#111] border border-gray-800 p-4 rounded overflow-x-auto">
              <div className="flex justify-between items-center mb-3 border-b border-gray-700 pb-2">
                <h3 className="font-bold">재무제표</h3>
                <div className="flex gap-2">
                  <button onClick={() => setFinancialPeriod('annual')} className={`px-2 py-1 text-xs rounded ${financialPeriod === 'annual' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>연간</button>
                  <button onClick={() => setFinancialPeriod('quarterly')} className={`px-2 py-1 text-xs rounded ${financialPeriod === 'quarterly' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>분기</button>
                </div>
              </div>
              <div className="text-right text-[10px] text-gray-500 mb-1">(단위: 억원, 원, %, 배)</div>
              <table className="w-full text-xs text-right whitespace-nowrap">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="py-2 text-left">항목</th>
                    {(stockDetails.financials || []).filter((f: any) => financialPeriod === 'annual' ? !f.period.includes('Q') : f.period.includes('Q')).map((f: any) => (
                      <th key={f.period} className="py-2 px-1">{f.period}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr className="border-b border-gray-800">
                    <td className="py-2 text-left text-gray-400">영업이익</td>
                    {(stockDetails.financials || []).filter((f: any) => financialPeriod === 'annual' ? !f.period.includes('Q') : f.period.includes('Q')).map((f: any) => <td key={f.period} className="px-1">{typeof f.operating_profit === 'number' ? (f.operating_profit / 100000000).toFixed(1) : (f.operating_profit || '-')}</td>)}
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-2 text-left text-gray-400">순이익</td>
                    {(stockDetails.financials || []).filter((f: any) => financialPeriod === 'annual' ? !f.period.includes('Q') : f.period.includes('Q')).map((f: any) => <td key={f.period} className="px-1">{typeof f.net_profit === 'number' ? (f.net_profit / 100000000).toFixed(1) : (f.net_profit || '-')}</td>)}
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-2 text-left text-gray-400">자본</td>
                    {(stockDetails.financials || []).filter((f: any) => financialPeriod === 'annual' ? !f.period.includes('Q') : f.period.includes('Q')).map((f: any) => <td key={f.period} className="px-1">{typeof f.equity === 'number' ? (f.equity / 100000000).toFixed(1) : (f.equity || '-')}</td>)}
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-2 text-left text-gray-400">EPS</td>
                    {(stockDetails.financials || []).filter((f: any) => financialPeriod === 'annual' ? !f.period.includes('Q') : f.period.includes('Q')).map((f: any) => <td key={f.period} className="px-1 text-green-400">{typeof f.eps === 'number' ? f.eps.toFixed(0) : (f.eps || '-')}</td>)}
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-2 text-left text-gray-400">BPS</td>
                    {(stockDetails.financials || []).filter((f: any) => financialPeriod === 'annual' ? !f.period.includes('Q') : f.period.includes('Q')).map((f: any) => <td key={f.period} className="px-1">{typeof f.bps === 'number' ? f.bps.toFixed(0) : (f.bps || '-')}</td>)}
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-2 text-left text-gray-400">PER</td>
                    {(stockDetails.financials || []).filter((f: any) => financialPeriod === 'annual' ? !f.period.includes('Q') : f.period.includes('Q')).map((f: any) => <td key={f.period} className="px-1 text-red-400">{typeof f.per === 'number' ? f.per.toFixed(2) : (f.per || '-')}</td>)}
                  </tr>
                  <tr className="border-b border-gray-800">
                    <td className="py-2 text-left text-gray-400">PBR</td>
                    {(stockDetails.financials || []).filter((f: any) => financialPeriod === 'annual' ? !f.period.includes('Q') : f.period.includes('Q')).map((f: any) => {
                      const pbr = typeof f.bps === 'number' && f.bps > 0 ? (stockDetails.stock.price || 0) / f.bps : null;
                      return <td key={f.period} className="px-1">{pbr !== null ? pbr.toFixed(2) : '-'}</td>;
                    })}
                  </tr>
                  <tr>
                    <td className="py-2 text-left text-gray-400">ROE (%)</td>
                    {(stockDetails.financials || []).filter((f: any) => financialPeriod === 'annual' ? !f.period.includes('Q') : f.period.includes('Q')).map((f: any) => {
                      const roe = typeof f.bps === 'number' && typeof f.eps === 'number' && f.bps > 0 ? (f.eps / f.bps) * 100 : null;
                      return <td key={f.period} className="px-1 text-blue-400">{roe !== null ? roe.toFixed(2) : '-'}</td>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
            
          </div>

          {/* Right panel: Charts */}
          <div className="w-full lg:w-2/3 flex flex-col gap-4">
            {businessSummary && (
              <div className="bg-[#111] border border-gray-800 p-4 rounded text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                <h3 className="text-white font-bold mb-2">종목 요약 (Naver)</h3>
                {businessSummary}
              </div>
            )}
            <ChartsView ticker={stockDetails.stock.ticker} stockDetails={stockDetails} />
          </div>

        </div>
      )}
    </div>
  );
}
