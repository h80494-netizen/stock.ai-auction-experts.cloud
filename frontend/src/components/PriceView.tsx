import React, { useState, useEffect, useMemo } from 'react';
import KISChart from './KISChart';
import AutocompleteSearch from './AutocompleteSearch';

interface PriceViewProps {
  stocks?: any[];
  globalStocks?: any[];
  news?: any[];
  forceCategory?: string | null;
  globalSearchTicker?: string;
  setGlobalSearchTicker?: (ticker: string) => void;
}

export default function PriceView({ stocks = [], globalStocks = [], news = [], forceCategory = null, globalSearchTicker, setGlobalSearchTicker }: PriceViewProps) {
  const [activeCategory, setActiveCategory] = useState("전체");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [selectedStock, setSelectedStock] = useState<any>(globalStocks.length > 0 ? globalStocks[0] : (stocks.length > 0 ? stocks[0] : null));
  const [chartData, setChartData] = useState<any[]>([]);
  const [loadingChart, setLoadingChart] = useState(false);
  const [indices, setIndices] = useState<any[]>([]);
  const [realtimeNews, setRealtimeNews] = useState<any[]>(news);
  const [fetchedAdditionalStocks, setFetchedAdditionalStocks] = useState<any[]>([]);
  const [isExecuting, setIsExecuting] = useState(false);
  const [fundamentals, setFundamentals] = useState<any>(null);
  const [stockNews, setStockNews] = useState<any[]>([]);
  const [stockSummary, setStockSummary] = useState<any>(null);
  const [searchTicker, setSearchTicker] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const executeSearch = async (ticker: string) => {
    if (!ticker.trim()) return;
    setIsSearching(true);
    if (setGlobalSearchTicker && ticker !== globalSearchTicker) {
      setGlobalSearchTicker(ticker);
    }
    try {
      const res = await fetch(`/api/stock/search/${ticker.trim()}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      if (data.error) {
        alert("종목을 찾을 수 없습니다.");
      } else {
        setFetchedAdditionalStocks(prev => [data, ...prev.filter(s => s.ticker !== data.ticker)]);
        setSelectedStock(data);
        setActiveCategory("전체");
        setSearchTicker("");
      }
    } catch (err) {
      alert("검색 중 오류가 발생했습니다.");
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    await executeSearch(searchTicker);
  };

  useEffect(() => {
    if (forceCategory) {
      setActiveCategory(forceCategory);
    }
  }, [forceCategory]);

  useEffect(() => {
    if (globalSearchTicker && (!selectedStock || selectedStock.ticker !== globalSearchTicker)) {
      executeSearch(globalSearchTicker);
    }
  }, [globalSearchTicker]);

  useEffect(() => {
    fetch('/api/indices')
      .then(res => res.ok ? res.json() : [])
      .then(data => setIndices(data))
      .catch(err => console.error(err));

    const interval = setInterval(() => {
      fetch('/api/news')
        .then(res => res.ok ? res.json() : [])
        .then(data => setRealtimeNews(data))
        .catch(err => console.error(err));
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Combine Global Stocks, KOSPI 100, and newly fetched stocks
  const combinedList = [...globalStocks, ...stocks, ...fetchedAdditionalStocks];

  // Filter only KR, US, JP, CN
  const validCategories = ["KR Top 50", "US Top 50", "JP Top 50", "CN Top 50", "Global Search"];
  
  let filteredStocks = combinedList.filter(s => {
    if (!s.categories) return false;
    return validCategories.some(vc => s.categories.includes(vc)) || s.categories.includes("국내");
  });

  if (activeCategory !== "전체") {
    filteredStocks = filteredStocks.filter(s => s.categories && s.categories.includes(activeCategory));
  }
  
  // Sort Alphabetically by name
  filteredStocks.sort((a, b) => {
    const nameA = a.name || "";
    const nameB = b.name || "";
    return sortOrder === "desc" ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
  });

  // Remove exact duplicates (if KR appears in both 국내 and KR Top 50)
  const seen = new Set();
  filteredStocks = filteredStocks.filter(s => {
    if (seen.has(s.ticker)) return false;
    seen.add(s.ticker);
    return true;
  });

  if (!selectedStock && filteredStocks.length > 0) {
    setSelectedStock(filteredStocks[0]);
  }

  const latestSelectedStock = selectedStock ? (combinedList.find(s => s.ticker === selectedStock.ticker) || selectedStock) : null;

  const [period, setPeriod] = useState("D"); // "m" (분봉), "D" (일봉), "W" (주봉), "M" (월봉)

  useEffect(() => {
    if (selectedStock) {
      setLoadingChart(true);
      const isGlobal = selectedStock.categories?.some((c: string) => c.includes("Global Major") || (c.includes("Top 50") && !c.includes("KR")));
      let cleanTicker = selectedStock.ticker;
      let excd = "";
      
      if (isGlobal) {
        if (cleanTicker.includes(".T") || cleanTicker === "7203" || cleanTicker === "9984") excd = "TSE";
        else if (cleanTicker.includes(".HK") || cleanTicker === "0700") excd = "HKS";
        else if (cleanTicker.includes(".SS") || cleanTicker === ".SZ") excd = "SHS";
        else if (cleanTicker === "BABA") excd = "NYS";
        else excd = "NAS";
      } else {
        cleanTicker = cleanTicker.split(':').pop() || cleanTicker;
      }
      
      const query = isGlobal ? `?is_overseas=true&excd=${excd}&period=${period}` : `?period=${period}`;
      
      let market = "KR";
      if (selectedStock.categories?.includes("US Top 50") || selectedStock.name.includes("(US)")) market = "US";
      if (selectedStock.categories?.includes("JP Top 50") || selectedStock.name.includes("(JP)")) market = "JP";
      if (selectedStock.categories?.includes("CN Top 50") || selectedStock.name.includes("(CN)")) market = "CN";

      const safeFetch = async (url: string) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch {
          throw new Error("Invalid JSON");
        }
      };

      Promise.all([
        safeFetch(`/api/kis/chart/${cleanTicker}${query}`),
        safeFetch(`/api/fundamentals/${selectedStock.ticker}`),
        safeFetch(`/api/stock_news/${cleanTicker}?name=${encodeURIComponent(selectedStock.name)}&market=${market}`),
        safeFetch(`/api/stock/${cleanTicker}/summary`)
      ])
        .then(([chartDataRes, fundData, newsData, summaryData]) => {
          if (Array.isArray(chartDataRes)) {
            setChartData(chartDataRes);
          } else {
            setChartData([]);
          }
          if (!fundData.error) setFundamentals(fundData);
          else setFundamentals(null);
          
          if (Array.isArray(newsData)) setStockNews(newsData);
          else setStockNews([]);
          
          if (summaryData && summaryData.summary) setStockSummary(summaryData);
          else setStockSummary(null);
          
          setLoadingChart(false);
        })
        .catch(err => {
          console.error("Fetch error", err);
          setChartData([]);
          setFundamentals(null);
          setStockNews([]);
          setStockSummary(null);
          setLoadingChart(false);
        });
    }
  }, [selectedStock, period]);

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-120px)] w-full bg-black text-gray-300 text-xs overflow-y-auto lg:overflow-hidden">
      {/* Left Sidebar: Dense Stock List */}
      <div className="w-full lg:w-[350px] bg-[#0a0a0a] lg:border-r border-b lg:border-b-0 border-gray-800 flex flex-col h-[300px] lg:h-full shrink-0">
        <div className="p-2 border-b border-gray-800 bg-[#111] flex gap-2">
          <AutocompleteSearch 
            localStocks={combinedList} 
            onSelect={(ticker) => {
              setSearchTicker(ticker);
              // Instead of manually handling, just call handleSearch manually
              // We refactor handleSearch to take ticker as argument
              executeSearch(ticker);
            }} 
          />
        </div>
        <div className="p-2 border-b border-gray-800 bg-[#111] flex gap-2">
          <select 
            value={activeCategory} 
            onChange={(e) => setActiveCategory(e.target.value)}
            className="flex-1 bg-black border border-gray-700 rounded px-2 py-1 text-xs text-white outline-none focus:border-blue-500"
          >
            <option value="전체">전체 (All) (200종목)</option>
            <option value="KR Top 50">한국 K50</option>
            <option value="US Top 50">미국 U50</option>
            <option value="JP Top 50">일본 J50</option>
            <option value="CN Top 50">중국 C50</option>
          </select>
          <button 
            onClick={async () => {
              let market = "";
              if (activeCategory.includes("US")) market = "US";
              else if (activeCategory.includes("JP")) market = "JP";
              else if (activeCategory.includes("CN")) market = "CN";
              
              if (activeCategory === "전체") {
                setIsExecuting(true);
                try {
                  const [us, jp, cn] = await Promise.all([
                    fetch('/api/market/US/top50').then(res => res.ok ? res.json() : []),
                    fetch('/api/market/JP/top50').then(res => res.ok ? res.json() : []),
                    fetch('/api/market/CN/top50').then(res => res.ok ? res.json() : [])
                  ]);
                  setFetchedAdditionalStocks(prev => {
                    const newStocks = [...us, ...jp, ...cn];
                    const existingTickers = new Set(prev.map(s => s.ticker));
                    return [...prev, ...newStocks.filter(s => !existingTickers.has(s.ticker))];
                  });
                } catch (e) { console.error(e); }
                setIsExecuting(false);
                return;
              }

              if (!market) return; // KR is already loaded

              setIsExecuting(true);
              try {
                const res = await fetch(`/api/market/${market}/top50`);
                if (!res.ok) throw new Error("Failed to fetch");
                const data = await res.json();
                setFetchedAdditionalStocks(prev => {
                  const existingTickers = new Set(prev.map(s => s.ticker));
                  const filtered = data.filter((s: any) => !existingTickers.has(s.ticker));
                  return [...prev, ...filtered];
                });
              } catch (err) {
                console.error(err);
              }
              setIsExecuting(false);
            }}
            disabled={isExecuting}
            className="px-3 py-1 bg-blue-600 rounded text-white font-bold hover:bg-blue-500 disabled:bg-gray-700"
          >
            {isExecuting ? "로딩중..." : "실행"}
          </button>
          <button 
            onClick={() => setSortOrder(prev => prev === "desc" ? "asc" : "desc")}
            className="px-2 py-1 bg-gray-800 rounded text-gray-300 hover:bg-gray-700"
            title="이름 정렬"
          >
            {sortOrder === "desc" ? "▼" : "▲"} 이름정렬
          </button>
        </div>
        
        {/* Dense Table Header */}
        <div className="grid grid-cols-[1fr_2fr_2fr_1.5fr] gap-1 px-2 py-1 border-b border-gray-800 bg-[#1a1a1a] font-bold text-gray-400">
          <div>코드</div>
          <div>종목명</div>
          <div className="text-right">현재가</div>
          <div className="text-right">등락률</div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {filteredStocks.map((stock, i) => {
            const isSelected = selectedStock?.ticker === stock.ticker;
            const isUp = stock.change > 0;
            const isDown = stock.change < 0;
            
            return (
              <div 
                key={stock.ticker}
                onClick={() => setSelectedStock(stock)}
                className={`grid grid-cols-[1fr_2fr_2fr_1.5fr] gap-1 px-2 py-1 cursor-pointer border-b border-gray-900/50 hover:bg-gray-800 transition-colors
                  ${isSelected ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : (i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]')}
                `}
              >
                <div className="font-mono text-gray-500 truncate">{stock.ticker.replace(/^(KRX:|TSE:|SZSE:|SSE:|HKEX:)/, '').split('.')[0]}</div>
                <div className={`font-bold truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>{stock.name}</div>
                <div className={`text-right font-mono ${isUp ? 'text-red-500' : (isDown ? 'text-blue-500' : 'text-gray-400')}`}>
                  {(() => {
                    const amt = stock.price || 0;
                    if (stock.currency === "USD") return "$" + amt.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
                    if (stock.currency === "JPY") return "¥" + amt.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:2});
                    if (stock.currency === "CNY") return "¥" + amt.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
                    
                    // Fallback to previous heuristic if currency isn't defined
                    let mkt = "KR";
                    if (stock.categories?.includes("US Top 50") || (stock.categories?.includes("Global Major") && stock.name.includes("(US)"))) mkt = "US";
                    if (stock.categories?.includes("JP Top 50") || stock.name.includes("(JP)")) mkt = "JP";
                    if (stock.categories?.includes("CN Top 50") || stock.name.includes("(CN)")) mkt = "CN";
                    
                    if (mkt === "US") return "$" + amt.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
                    if (mkt === "JP") return "¥" + amt.toLocaleString(undefined, {minimumFractionDigits:0, maximumFractionDigits:2});
                    if (mkt === "CN") return "¥" + amt.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
                    return amt.toLocaleString() + "원";
                  })()}
                </div>
                <div className={`text-right font-mono ${isUp ? 'text-red-500' : (isDown ? 'text-blue-500' : 'text-gray-400')}`}>
                  {isUp ? '▲' : (isDown ? '▼' : '')}{Math.abs(stock.changePct || 0)}%
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Detail Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#050505]">
        {/* Indices Banner */}
        {indices.length > 0 && (
          <div className="flex bg-[#0f0f0f] border-b border-gray-800 px-4 py-1 overflow-x-auto hide-scrollbar">
            {indices.map((idx, i) => (
              <div 
                key={i} 
                className="flex items-center mx-2 cursor-pointer hover:bg-gray-800 px-3 py-1 rounded transition-colors"
                onClick={() => setActiveCategory("국내")}
                title="클릭 시 한국 주요 종목 표시"
              >
                <span className="text-gray-400 font-bold mr-2">{idx.name}</span>
                <span className="font-bold text-gray-200 mr-2">{idx.price.toLocaleString()}</span>
                <span className={idx.change > 0 ? 'text-red-500' : 'text-blue-500'}>
                  {idx.change > 0 ? '▲' : '▼'}{Math.abs(idx.changePct)}%
                </span>
              </div>
            ))}
          </div>
        )}
        
        {selectedStock ? (
          <>
            {/* Top Row: Stock Info & Chart (h-[60%]) */}
            <div className="h-[60%] flex flex-col border-b border-gray-800">
              <div className="px-2 py-1 bg-[#111] flex items-end justify-between border-b border-gray-800">
                <div className="flex items-end gap-2">
                  <h2 className="text-xl font-bold text-white">{selectedStock.name}</h2>
                  <span className="text-xs text-gray-400 font-mono">{selectedStock.ticker.replace(/^(KRX:|TSE:|SZSE:|SSE:|HKEX:)/, '').split('.')[0]}</span>
                  <div className="flex gap-1 ml-2 mb-0.5">
                    {(selectedStock.categories || []).map((c: string) => (
                      <span key={c} className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded text-[10px]">{c}</span>
                    ))}
                  </div>
                </div>
                
                {/* Period Buttons */}
                <div className="flex bg-black border border-gray-800 rounded overflow-hidden">
                  {[
                    { val: "m", label: "1분봉" },
                    { val: "D", label: "일봉" },
                    { val: "W", label: "주봉" },
                    { val: "M", label: "월봉" }
                  ].map(p => (
                    <button
                      key={p.val}
                      onClick={() => setPeriod(p.val)}
                      className={`px-3 py-1 text-xs font-bold transition-colors ${
                        period === p.val 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-transparent text-gray-400 hover:bg-gray-800 hover:text-white'
                      } ${p.val !== "M" ? 'border-r border-gray-800' : ''}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* KIS API Chart & Fundamentals Table */}
              <div className="flex-1 w-full bg-black relative flex">
                <div className="w-1/2 h-full relative flex flex-col items-center justify-center border-r border-gray-800">
                  {loadingChart ? (
                    <div className="text-gray-500">KIS API 차트 데이터 로딩 중...</div>
                  ) : (
                    <KISChart data={chartData} symbol={latestSelectedStock?.name} fundamentals={fundamentals} currentPrice={latestSelectedStock?.price} changePct={latestSelectedStock?.changePct} />
                  )}
                </div>
                <div className="w-1/2 h-full p-2 flex flex-col justify-center bg-[#0a0a0a] overflow-y-auto">
                  {fundamentals ? (
                    <div className="bg-[#111] border border-gray-800 rounded p-2 shadow-lg mx-auto w-full max-w-md">
                      <h3 className="text-sm font-bold text-white mb-2 border-b border-gray-800 pb-1">주요 재무 요약</h3>
                      <table className="w-full text-left text-[10px]">
                        <tbody>
                          <tr className="border-b border-gray-800">
                            <td className="py-1 text-gray-500 font-bold w-1/2">시가총액</td>
                            <td className="py-1 text-white font-mono text-right">
                              {(() => {
                                if (!fundamentals.marketCap) return 'N/A';
                                let mkt = "KR";
                                if (selectedStock?.categories?.includes("US Top 50") || selectedStock?.name.includes("(US)")) mkt = "US";
                                if (selectedStock?.categories?.includes("JP Top 50") || selectedStock?.name.includes("(JP)")) mkt = "JP";
                                if (selectedStock?.categories?.includes("CN Top 50") || selectedStock?.name.includes("(CN)")) mkt = "CN";
                                
                                if (mkt === "KR") return (fundamentals.marketCap / 100000000).toLocaleString(undefined, {maximumFractionDigits:0}) + " 억원";
                                if (mkt === "US") return "$" + fundamentals.marketCap.toLocaleString();
                                if (mkt === "JP" || mkt === "CN") return "¥" + fundamentals.marketCap.toLocaleString();
                                return fundamentals.marketCap.toLocaleString();
                              })()}
                            </td>
                          </tr>
                          <tr className="border-b border-gray-800">
                            <td className="py-1 text-gray-500 font-bold">52주 최고가</td>
                            <td className="py-1 text-red-400 font-mono text-right">{fundamentals.fiftyTwoWeekHigh ? fundamentals.fiftyTwoWeekHigh.toLocaleString() : 'N/A'}</td>
                          </tr>
                          <tr className="border-b border-gray-800">
                            <td className="py-1 text-gray-500 font-bold">52주 최저가</td>
                            <td className="py-1 text-blue-400 font-mono text-right">{fundamentals.fiftyTwoWeekLow ? fundamentals.fiftyTwoWeekLow.toLocaleString() : 'N/A'}</td>
                          </tr>
                          <tr className="border-b border-gray-800">
                            <td className="py-1 text-gray-500 font-bold">현재가</td>
                            <td className="py-1 text-white font-mono font-bold text-sm text-right">
                              {fundamentals.currentPrice ? fundamentals.currentPrice.toLocaleString() : 'N/A'}
                              {selectedStock && selectedStock.changePct !== undefined && (
                                <span className={`ml-1 text-[10px] ${selectedStock.changePct > 0 ? 'text-red-500' : (selectedStock.changePct < 0 ? 'text-blue-500' : 'text-gray-400')}`}>
                                  ({selectedStock.changePct > 0 ? '+' : ''}{selectedStock.changePct}%)
                                </span>
                              )}
                            </td>
                          </tr>
                          <tr className="border-b border-gray-800">
                            <td className="py-1 text-gray-500 font-bold">Trailing EPS</td>
                            <td className="py-1 text-white font-mono text-right">{fundamentals.eps ? fundamentals.eps.toLocaleString() : 'N/A'}</td>
                          </tr>
                        </tbody>
                      </table>
                      
                      {/* Company Overview (Korean Only, from DB) */}
                      {stockSummary && (
                        <div className="mt-2 pt-2 border-t border-gray-800">
                          <h4 className="text-gray-400 font-bold mb-1 text-[10px]">기업 개요</h4>
                          <div className="max-h-32 overflow-y-auto pr-1 text-[10px] leading-relaxed text-gray-300 custom-scrollbar">
                            {stockSummary.summary}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center flex items-center justify-center h-full">재무 데이터 로딩 중...</div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Row: Spot News Integrated Panel (h-[40%]) */}
            <div className="h-[40%] flex flex-col bg-[#0a0a0a]">
              <div className="px-4 py-1 bg-[#1a1a1a] border-b border-gray-800 font-bold text-yellow-500 flex justify-between">
                <span>📰 {selectedStock.name} 종목 뉴스 (Stock News)</span>
                <span className="text-gray-500 font-normal">Source: Naver, Yahoo JP, Google News, Baidu</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                <table className="w-full text-left border-collapse">
                  <tbody>
                    {stockNews.map((item, index) => (
                      <tr key={index} className="border-b border-gray-800 hover:bg-gray-800/50">
                        <td className="w-24 py-3 px-2">
                          <span className="bg-gray-800 text-[10px] px-1.5 py-0.5 rounded text-gray-400 whitespace-nowrap">
                            {item.source}
                          </span>
                        </td>
                        <td className="w-24 py-3 px-2 text-gray-500 text-[10px]">{item.published}</td>
                        <td className="py-3 px-2">
                          <a href={item.link} target="_blank" rel="noreferrer" className="text-gray-300 hover:text-blue-400 font-medium">
                            {item.title}
                          </a>
                        </td>
                      </tr>
                    ))}
                    {stockNews.length === 0 && (
                      <tr>
                        <td colSpan={3} className="text-center py-4 text-gray-500">뉴스가 없습니다.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600">종목을 선택해주세요.</div>
        )}
      </div>
    </div>
  );
}
