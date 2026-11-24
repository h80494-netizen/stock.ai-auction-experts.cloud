import React, { useState, useEffect, useMemo } from 'react';
import ChartsView from './ChartsView';
import AutocompleteSearch from './AutocompleteSearch';
import FundamentalAnalysisView from './FundamentalAnalysisView';

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
        const topTickers = new Set(combined.slice(0, 50).map(s => s.ticker));
        if (selectedStock && selectedStock.ticker) {
          topTickers.add(selectedStock.ticker);
        }
        const tickersStr = Array.from(topTickers).join(',');
        const res = await fetch(`/api/realtime-prices?tickers=${encodeURIComponent(tickersStr)}`);
        if (!res.ok) {
          console.error('Failed to fetch live prices:', res.status);
          return;
        }
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          setLivePrices(prev => ({ ...prev, ...data }));
        }
      } catch (e) { console.error('Live price fetch error:', e); }
    };
    fetchLivePrices();
    const interval = setInterval(fetchLivePrices, 15000);
    return () => clearInterval(interval);
  }, [stocks, globalStocks, selectedStock]);
  
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
      if (!res.ok) {
        console.warn('Search API Error:', res.statusText);
        setSearchResults([]);
        setLoading(false);
        return;
      }
      const data = await res.json();
      setSearchResults(data);
    } catch (err) {
      console.warn('Search error:', err);
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
    const rawUpper = String(ticker || "").toUpperCase().trim();
    const pureCode = rawUpper.replace(/^KRX:/, '').replace(/\.KS$/, '').replace(/\.KQ$/, '');
    const isKR = /^\d{6}$/.test(pureCode) || rawUpper.endsWith('.KS') || rawUpper.endsWith('.KQ') || rawUpper.startsWith('KRX:');
    const effectiveTicker = isKR ? pureCode : ticker;

    if (setGlobalSearchTicker && effectiveTicker !== globalSearchTicker) {
      setGlobalSearchTicker(effectiveTicker);
    }
    
    // 빠른 UI 반응성을 위한 Optimistic Update
    const selectedFromList = combinedList.find(s => s.ticker === effectiveTicker || s.ticker === ticker || (isKR && s.ticker?.includes(pureCode)));
    if (selectedFromList) {
      setSelectedStock(selectedFromList);
      setStockDetails({ stock: selectedFromList, financials: [] });
    } else {
      setLoading(true);
    }

    try {
      // First try to fetch from /api/fundamentals/ (more global coverage) or search
      const res = await fetch(`/api/fundamentals/${effectiveTicker}`);
      
      let data;
      if (!res.ok) {
        data = { error: `Server error: ${res.status}` };
      } else {
        try {
          data = await res.json();
        } catch (e) {
          data = { error: 'Invalid JSON response from server' };
        }
      }
      
      if (data.error || data.detail) {
        // Fallback to DB
        const searchRes = await fetch(`/api/db/stock/${effectiveTicker}`);
        let searchData;
        if (!searchRes.ok) {
          searchData = { error: `DB Server error: ${searchRes.status}` };
        } else {
          try {
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
             stock: selectedFromList ? { ...selectedFromList } : { ticker: effectiveTicker, name: ticker, price: 0, currency: isKR ? "KRW" : "USD", change: 0, changePct: 0 }, 
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
        if (!sumRes.ok) {
          console.warn("Summary fetch API error", sumRes.statusText);
        } else {
          const sumData = await sumRes.json();
          setBusinessSummary(sumData.summary || '');
        }
      } catch (e) {
        console.warn("Summary fetch error", e);
      }
    } catch (err) {
      console.warn("Select error:", err);
    }
    setLoading(false);
  };

  const currencyInfo = React.useMemo(() => {
    if (!stockDetails?.stock?.ticker) return { basic: '원', hm: '억원', div: 100000000 };
    const t = String(stockDetails.stock.ticker).toUpperCase().trim();
    const pure = t.replace(/^KRX:/, '').replace(/\.KS$/, '').replace(/\.KQ$/, '');
    if (/^\d{6}$/.test(pure) || t.endsWith('.KS') || t.endsWith('.KQ') || stockDetails?.stock?.currency === 'KRW') {
      return { basic: '원', hm: '억원', div: 100000000 };
    }
    if (t.endsWith('.T')) return { basic: 'YEN', hm: '억엔', div: 100000000 };
    if (t.endsWith('.SS') || t.endsWith('.SZ') || t.endsWith('.CN')) return { basic: 'YUAN', hm: '억위안', div: 100000000 };
    if (t.endsWith('.HK')) return { basic: 'HKD', hm: '억홍콩달러', div: 100000000 };
    return { basic: 'US$', hm: '억달러', div: 100000000 };
  }, [stockDetails?.stock?.ticker, stockDetails?.stock?.currency]);

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
                  const p = livePrices[stockDetails.stock.ticker] || stockDetails.stock.price || 50000;
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
                  <div className="text-center text-white">{(livePrices[stockDetails.stock.ticker] || stockDetails.stock.price || 0).toLocaleString()}</div>
                  <div className="text-right"></div>
                </div>
                {Array.from({length: 5}, (_, i) => {
                  const p = livePrices[stockDetails.stock.ticker] || stockDetails.stock.price || 50000;
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
                  <button onClick={() => setFinancialPeriod('annual')} className={`px-2 py-1 text-xs rounded cursor-pointer ${financialPeriod === 'annual' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>연간</button>
                  <button onClick={() => setFinancialPeriod('quarterly')} className={`px-2 py-1 text-xs rounded cursor-pointer ${financialPeriod === 'quarterly' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}>분기</button>
                </div>
              </div>
              <div className="text-right text-[10px] text-gray-500 mb-1">(단위: 억원, 원, %, 배 · 주가 및 발행주식수 연동 직접 계산)</div>
              {(() => {
                const s = stockDetails.stock || {};
                const curPrice = Number(livePrices[s.ticker] || s.price || s.currentPrice || 0);
                const rawShares = Number(s.outstanding_shares || s.shares || 0);
                const mcap = Number(s.marketCap || s.market_cap || (curPrice * rawShares) || 0);
                const outShares = rawShares > 0 ? rawShares : (mcap > 0 && curPrice > 0 ? Math.floor(mcap / curPrice) : 0);
                const isQuarterly = financialPeriod === 'quarterly';
                const mult = isQuarterly ? 4.0 : 1.0;

                const filteredFins = (stockDetails.financials || [])
                  .filter((f: any) => (isQuarterly ? String(f.period).includes('Q') : !String(f.period).includes('Q')))
                  .map((f: any) => {
                    const op = Number(f.operating_profit ?? 0);
                    const np = Number(f.net_profit ?? 0);
                    let eq = Number(f.equity ?? 0);
                    let eps = Number(f.eps ?? 0);
                    let bps = Number(f.bps ?? 0);
                    let per = Number(f.per ?? 0);
                    let pbr = Number(f.pbr ?? 0);
                    let roe = Number(f.roe ?? 0);

                    // 1) EPS 직접 계산: 순이익 / 발행주식수
                    if (!eps && np !== 0 && outShares > 0) {
                      eps = np / outShares;
                    }
                    // 2) 자본(equity) 및 BPS 상호 역산 계산
                    if (eq <= 0 && bps > 0 && outShares > 0) {
                      eq = bps * outShares;
                    }
                    if (bps <= 0 && eq > 0 && outShares > 0) {
                      bps = eq / outShares;
                    }
                    if (bps <= 0 && Number(s.bps) > 0) {
                      bps = Number(s.bps);
                      if (eq <= 0 && outShares > 0) eq = bps * outShares;
                    }
                    // 3) PBR 직접 계산: 주가 / BPS
                    if (pbr <= 0 && curPrice > 0 && bps > 0) {
                      pbr = curPrice / bps;
                    }
                    // 4) ROE(%) 직접 계산: (연환산 순이익 / 자본)*100 또는 (연환산 EPS / BPS)*100
                    if (!roe) {
                      if (np !== 0 && eq > 0) {
                        roe = ((np * mult) / eq) * 100.0;
                      } else if (eps !== 0 && bps > 0) {
                        roe = ((eps * mult) / bps) * 100.0;
                      }
                    }
                    // 5) PER 직접 계산: 주가 / 연환산 EPS 또는 PBR / (ROE/100)
                    if (!per) {
                      if (curPrice > 0 && eps !== 0) {
                        per = curPrice / (eps * mult);
                      } else if (pbr > 0 && roe !== 0) {
                        per = pbr / (roe / 100.0);
                      }
                    }

                    return {
                      ...f,
                      _op: op,
                      _np: np,
                      _eq: eq,
                      _eps: eps,
                      _bps: bps,
                      _per: per,
                      _pbr: pbr,
                      _roe: roe,
                    };
                  });

                return (
                  <table className="w-full text-xs text-right whitespace-nowrap">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="py-2 text-left">항목</th>
                        {filteredFins.map((f: any) => (
                          <th key={f.period} className="py-2 px-1">{f.period}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      <tr className="border-b border-gray-800">
                        <td className="py-2 text-left text-gray-400">영업이익</td>
                        {filteredFins.map((f: any) => (
                          <td key={f.period} className="px-1">
                            {f._op !== 0 ? (f._op / 100000000).toFixed(1) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 text-left text-gray-400">순이익</td>
                        {filteredFins.map((f: any) => (
                          <td key={f.period} className="px-1">
                            {f._np !== 0 ? (f._np / 100000000).toFixed(1) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 text-left text-gray-400">자본</td>
                        {filteredFins.map((f: any) => (
                          <td key={f.period} className="px-1">
                            {f._eq > 0 ? Math.round(f._eq / 100000000).toLocaleString() : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 text-left text-gray-400">EPS</td>
                        {filteredFins.map((f: any) => (
                          <td key={f.period} className="px-1 text-green-400">
                            {f._eps !== 0 ? Math.round(f._eps).toLocaleString() : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 text-left text-gray-400">BPS</td>
                        {filteredFins.map((f: any) => (
                          <td key={f.period} className="px-1">
                            {f._bps > 0 ? Math.round(f._bps).toLocaleString() : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 text-left text-gray-400">PER</td>
                        {filteredFins.map((f: any) => (
                          <td key={f.period} className="px-1 text-red-400">
                            {f._per !== 0 ? f._per.toFixed(2) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-b border-gray-800">
                        <td className="py-2 text-left text-gray-400">PBR</td>
                        {filteredFins.map((f: any) => (
                          <td key={f.period} className="px-1 text-amber-300">
                            {f._pbr > 0 ? f._pbr.toFixed(2) : '-'}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 text-left text-gray-400">ROE (%)</td>
                        {filteredFins.map((f: any) => (
                          <td key={f.period} className="px-1 text-blue-400">
                            {f._roe !== 0 ? f._roe.toFixed(2) : '-'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                );
              })()}
            </div>
            
          </div>

          {/* Right panel: Charts */}
          <div className="w-full lg:w-2/3 flex flex-col gap-4">
            <ChartsView ticker={stockDetails.stock.ticker} stockDetails={stockDetails} />
            {businessSummary && (
              <div className="bg-[#111] border border-gray-800 p-4 rounded text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                <h3 className="text-white font-bold mb-2">종목 요약 (Naver)</h3>
                {businessSummary}
              </div>
            )}
            <FundamentalAnalysisView ticker={stockDetails.stock.ticker} />
          </div>

        </div>
      )}
    </div>
  );
}
