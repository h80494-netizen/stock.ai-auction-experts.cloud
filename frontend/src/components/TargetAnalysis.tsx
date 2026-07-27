import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createChart, ColorType, LineStyle, LineSeries, createSeriesMarkers } from 'lightweight-charts';
import AutocompleteSearch from './AutocompleteSearch';

const targetCache: Record<string, any> = {};

interface TargetAnalysisProps {
  stocks?: any[];
  globalStocks?: any[];
  onNavigateToStock?: (ticker: string) => void;
  globalSearchTicker?: string;
  setGlobalSearchTicker?: (ticker: string) => void;
}

export default function TargetAnalysis({ stocks = [], globalStocks = [], onNavigateToStock, globalSearchTicker, setGlobalSearchTicker }: TargetAnalysisProps) {
  const [targetData, setTargetData] = useState<any[]>([]);
  const [loadingCount, setLoadingCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [filter, setFilter] = useState<'ALL' | 'UP' | 'DOWN'>('ALL');
  const [countryFilter, setCountryFilter] = useState<'ALL' | 'KR' | 'US' | 'JP' | 'CN'>('ALL');
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [cacheLoaded, setCacheLoaded] = useState(false);

  const targetChartRef = useRef<HTMLDivElement>(null);

  // Load cache on mount
  useEffect(() => {
    const loadCache = async () => {
      try {
        const res = await fetch('/api/targets/cache');
        if (!res.ok) throw new Error(res.statusText || 'API Error');
        const data = await res.json();
        if (data && Object.keys(data).length > 0) {
          Object.assign(targetCache, data);
        }
      } catch (e) {
        console.error("Cache load error", e);
      } finally {
        setCacheLoaded(true);
      }
    };
    loadCache();
  }, []);

  const handleSaveCache = async () => {
    setIsSaving(true);
    try {
        await fetch('/api/targets/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(targetCache)
        });
        alert('데이터가 서버에 성공적으로 저장되었습니다.');
    } catch(e) {
        alert('저장에 실패했습니다.');
    } finally {
        setIsSaving(false);
    }
  };

  const handleSearch = async (ticker: string) => {
    if (setGlobalSearchTicker && ticker !== globalSearchTicker) {
      setGlobalSearchTicker(ticker);
    }
    const existing = targetData.find(d => d.ticker === ticker || d.symbol === ticker);
    if (existing) {
      setSelectedStock(existing);
      return;
    }

    try {
      const res = await fetch(`/api/fundamentals/${ticker}`);
      if (!res.ok) {
        alert("서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
      if (!res.ok) throw new Error(res.statusText || 'API Error');
      const fund = await res.json();
      if (fund.error) {
        alert("해당 종목의 데이터가 없습니다.");
        return;
      }
      
      let trend = 'FLAT';
      let target1mAgo = 0;
      let currentTarget = fund.targetMean || 0;
      
      if (fund.target_history && fund.target_history.length > 0) {
        const history = fund.target_history;
        const past = history[history.length - 1].text; // Get oldest target in history
        const match = past.match(/[\d,]+/);
        if (match) {
          target1mAgo = parseInt(match[0].replace(/,/g, ''), 10);
        }
        
        // Also check recent explicit upgrades if currentTarget is 0 or equal to past
        const latest = history[0].text;
        if (latest.includes("상향") || latest.includes("Up") || (target1mAgo > 0 && currentTarget > target1mAgo)) {
            trend = 'UP';
        } else if (latest.includes("하향") || latest.includes("Down") || (target1mAgo > 0 && currentTarget < target1mAgo)) {
            trend = 'DOWN';
        }
      }
      
      // Determine country
      let country = 'US';
      if (ticker.endsWith('.KS') || ticker.endsWith('.KQ') || ticker.startsWith('KRX:') || (!isNaN(Number(ticker)) && ticker.length==6)) {
          country = 'KR';
      } else if (ticker.endsWith('.T')) {
          country = 'JP';
      } else if (ticker.endsWith('.SS') || ticker.endsWith('.SZ') || (!isNaN(Number(ticker)) && ticker.length==6)) {
          country = 'CN';
      }
      
      const cacheData = {
        target1mAgo,
        currentTarget,
        trend,
        country,
        analystCount: fund.analyst_count || 0,
        fundamentals: fund,
        latestTargetDate: fund.target_history?.[0]?.time || ''
      };
      
      targetCache[ticker] = cacheData;
      
      const newEntry = {
        ticker,
        symbol: ticker,
        name: fund.name || ticker,
        ...cacheData
      };
      
      setTargetData(prev => [newEntry, ...prev]);
      setSelectedStock(newEntry);
    } catch (e) {
      alert("데이터를 가져오는 중 오류가 발생했습니다.");
    }
  };

  // Sync with globalSearchTicker
  useEffect(() => {
    if (globalSearchTicker && (!selectedStock || selectedStock.ticker !== globalSearchTicker)) {
      handleSearch(globalSearchTicker);
    }
  }, [globalSearchTicker]);

  // Derive unique combined list
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

  // Progressive fetch
  useEffect(() => {
    if (combinedList.length === 0 || !cacheLoaded) return;
    
    // instantly populate from cache
    const initialData: any[] = [];
    const uncachedStocks: any[] = [];
    
    combinedList.forEach(stock => {
      if (targetCache[stock.ticker]) {
        initialData.push({ ...stock, ...targetCache[stock.ticker] });
      } else {
        uncachedStocks.push(stock);
      }
    });
    
    setTargetData(initialData);
    setTotalCount(combinedList.length);
    setLoadingCount(initialData.length);
    
    let isMounted = true;
    
    const fetchQueue = async () => {
      let results: any[] = [];
      const batchSize = 5;
      
      for (let i = 0; i < uncachedStocks.length; i += batchSize) {
        if (!isMounted) break;
        const batch = uncachedStocks.slice(i, i + batchSize);
        
        const promises = batch.map(async (stock) => {
          try {
            
            const res = await fetch(`/api/fundamentals/${stock.ticker}`);
            if (!res.ok) return null;
            const fund = await res.json();
            
            if (fund.error) return null;
            
            let trend = 'FLAT';
            let target1mAgo = 0;
            let currentTarget = fund.targetMean || 0;
            
            if (fund.target_history && fund.target_history.length > 0) {
              const history = [...fund.target_history].sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime());
              const latest = history[0].text || String(history[0].value || '');
              const past = history.length > 1 ? (history[1].text || String(history[1].value || '')) : null;
              
              const getNum = (text: string) => {
                const parts = text.match(/[\d,]+/g);
                return parts ? parseInt(parts[parts.length - 1].replace(/,/g, ''), 10) : 0;
              };
              
              let targetLatestVal = getNum(latest) || currentTarget;
              target1mAgo = past ? getNum(past) : 0;
              
              if (latest.includes("상향") || latest.includes("Up") || (target1mAgo > 0 && targetLatestVal > target1mAgo)) {
                  trend = 'UP';
              } else if (latest.includes("하향") || latest.includes("Down") || (target1mAgo > 0 && targetLatestVal < target1mAgo)) {
                  trend = 'DOWN';
              }
            }
            
            let country = 'US';
            if (stock.ticker.endsWith('.KS') || stock.ticker.endsWith('.KQ') || stock.ticker.startsWith('KRX:') || (!isNaN(Number(stock.ticker)) && stock.ticker.length==6)) {
                country = 'KR';
            } else if (stock.ticker.endsWith('.T')) {
                country = 'JP';
            } else if (stock.ticker.endsWith('.SS') || stock.ticker.endsWith('.SZ') || (!isNaN(Number(stock.ticker)) && stock.ticker.length==6)) {
                country = 'CN';
            }
            
            const cacheData = {
              target1mAgo,
              currentTarget,
              trend,
              country,
              analystCount: fund.analyst_count || 0,
              fundamentals: fund,
              latestTargetDate: fund.target_history?.[0]?.time || ''
            };
            
            targetCache[stock.ticker] = cacheData;
            
            return {
              ...stock,
              ...cacheData
            };
          } catch (e) {
            return null;
          }
        });
        
        const batchRes = await Promise.all(promises);
        const validRes = batchRes.filter(r => r !== null);
        
        if (isMounted) {
          setTargetData(prev => {
            const newArray = [...prev, ...validRes];
            // Sort them immediately to maintain UI consistency if needed
            return newArray;
          });
          setLoadingCount(prev => prev + batch.length);
        }
      }
    };
    
    fetchQueue();
    return () => { isMounted = false; };
  }, [combinedList]);

  // Filter and sort
  const filteredData = useMemo(() => {
    let data = targetData;
    if (filter === 'UP') data = data.filter(d => d.trend === 'UP');
    else if (filter === 'DOWN') data = data.filter(d => d.trend === 'DOWN');
    
    if (countryFilter !== 'ALL') data = data.filter(d => d.country === countryFilter);
    
    // Sort by latestTargetDate Desc, then by Analyst Count Desc
    return data.sort((a, b) => {
      if (a.latestTargetDate && b.latestTargetDate) {
        const timeDiff = new Date(b.latestTargetDate).getTime() - new Date(a.latestTargetDate).getTime();
        if (timeDiff !== 0) return timeDiff;
      } else if (a.latestTargetDate) return -1;
      else if (b.latestTargetDate) return 1;
      return b.analystCount - a.analystCount || b.currentTarget - a.currentTarget;
    });
  }, [targetData, filter, countryFilter]);

  // Render Target Price Chart for selected
  useEffect(() => {
    if (!selectedStock || !selectedStock.fundamentals) return;
    const fundamentals = selectedStock.fundamentals;
    
    let targetChart: any = null;

    const chartOptions = {
      layout: { background: { type: ColorType.Solid, color: '#000000' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
    };

    const renderChart = async () => {
        let priceData = [];
        if (fundamentals.price_chart && fundamentals.price_chart.length > 0 && typeof fundamentals.price_chart[0].close !== 'undefined') {
          priceData = fundamentals.price_chart.map((d: any) => ({ time: d.time, value: d.close }));
        } else if (fundamentals.price_chart && fundamentals.price_chart.length > 0) {
          priceData = fundamentals.price_chart;
        }

        try {
          const res = await fetch(`/api/kis/chart/${selectedStock.ticker}?period=D&is_overseas=${selectedStock.country !== 'KR'}`);
          if (!res.ok) throw new Error(res.statusText || 'API Error');
          const freshData = await res.json();
          if (freshData && freshData.length > 0) {
              priceData = freshData.map((d: any) => ({ time: d.time, value: d.close !== undefined ? d.close : d.value }));
              fundamentals.price_chart = freshData;
          }
        } catch (e) { console.error("Fresh price fetch failed", e); }

      if (targetChartRef.current && priceData && priceData.length > 0) {
        targetChartRef.current.innerHTML = ''; // clear previous
        targetChart = createChart(targetChartRef.current, { ...chartOptions, width: targetChartRef.current.clientWidth, height: targetChartRef.current.clientHeight });
        const priceSeries = targetChart.addSeries(LineSeries, { color: '#E0E0E0', lineWidth: 2 });
        priceSeries.setData(priceData);
        
        if (selectedStock.currentTarget && selectedStock.currentTarget > 0 && priceData.length > 0) {
          const latestTime = priceData[priceData.length - 1].time;
          const targetSeries = targetChart.addSeries(LineSeries, { 
              color: '#FF5252',
              lineWidth: 0,
              crosshairMarkerVisible: false,
              lastValueVisible: true,
              title: '목표가'
          });
          targetSeries.setData([{ time: latestTime, value: selectedStock.currentTarget }]);
          try {
            createSeriesMarkers(targetSeries, [
                { time: latestTime, position: 'inBar', color: '#FF5252', shape: 'circle', size: 1, text: '목표가' }
            ]);
          } catch(e) { console.error("Marker error", e); }
        }
        targetChart.timeScale().fitContent();
      }
    };
    
    renderChart();

    const handleResize = () => {
      if (targetChart && targetChartRef.current) targetChart.applyOptions({ width: targetChartRef.current.clientWidth });
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (targetChart) targetChart.remove();
    };
  }, [selectedStock]);

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-120px)] w-full bg-black text-gray-300 text-xs overflow-y-auto lg:overflow-hidden">
      {/* Left Sidebar: Data Table */}
      <div className="flex flex-col w-full lg:w-[500px] lg:border-r border-b lg:border-b-0 border-gray-800 h-[400px] lg:h-full bg-[#0a0a0a] shrink-0">
        <div className="p-2 border-b border-gray-800 bg-[#111] flex gap-2">
          <AutocompleteSearch 
            localStocks={combinedList} 
            onSelect={handleSearch} 
            placeholder="목표가 조회할 종목 검색"
          />
        </div>
        <div className="p-3 border-b border-gray-800 bg-[#111] flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-white">목표가 추이 분석</h2>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-500">수집 중: {loadingCount} / {totalCount}</span>
              <button 
                onClick={handleSaveCache} 
                disabled={isSaving}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] px-2 py-0.5 rounded font-bold disabled:bg-gray-700"
              >
                {isSaving ? '저장중...' : '💾 저장'}
              </button>
            </div>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-gray-800 h-1 rounded overflow-hidden">
            <div className="bg-blue-500 h-full transition-all" style={{ width: totalCount > 0 ? `${(loadingCount / totalCount) * 100}%` : '0%' }}></div>
          </div>
          
          <div className="flex gap-2 mt-1">
            <button onClick={() => setFilter('ALL')} className={`flex-1 py-1 px-1 rounded font-bold text-[10px] ${filter === 'ALL' ? 'bg-gray-700 text-white' : 'bg-black text-gray-400 border border-gray-800'}`}>전체</button>
            <button onClick={() => setFilter('UP')} className={`flex-1 py-1 px-1 rounded font-bold text-[10px] ${filter === 'UP' ? 'bg-red-900/50 text-red-400 border border-red-800' : 'bg-black text-gray-400 border border-gray-800'}`}>상승(UP)</button>
            <button onClick={() => setFilter('DOWN')} className={`flex-1 py-1 px-1 rounded font-bold text-[10px] ${filter === 'DOWN' ? 'bg-blue-900/50 text-blue-400 border border-blue-800' : 'bg-black text-gray-400 border border-gray-800'}`}>하락(DOWN)</button>
          </div>
          
          <div className="flex gap-1 mt-1 bg-gray-900 p-1 rounded">
             <span className="text-[10px] text-gray-500 my-auto ml-1 font-bold">국가:</span>
             {['ALL', 'KR', 'US', 'JP', 'CN'].map(c => (
                 <button key={c} onClick={() => setCountryFilter(c as any)} className={`px-2 py-0.5 rounded text-[10px] font-bold ${countryFilter === c ? 'bg-white text-black' : 'text-gray-400 hover:bg-gray-800'}`}>
                     {c}
                 </button>
             ))}
          </div>
        </div>

        {/* Table Header */}
        <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-1 px-2 py-2 border-b border-gray-800 bg-[#1a1a1a] font-bold text-gray-400 text-[10px]">
          <div>종목명</div>
          <div className="text-right">직전 목표가</div>
          <div className="text-right">현재 목표가</div>
          <div className="text-center">추세</div>
          <div className="text-center" title="해당 종목을 커버하는 증권사 수">커버리지</div>
        </div>

        {/* Table Body */}
        <div className="flex-1 overflow-y-auto">
          {filteredData.map((item, i) => {
            const isSelected = selectedStock?.ticker === item.ticker;
            return (
              <div 
                key={item.ticker + i}
                onClick={() => {
                  if (onNavigateToStock) {
                    onNavigateToStock(item.ticker);
                  }
                  setSelectedStock(item);
                }}
                className={`grid grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr_0.5fr] gap-1 px-2 py-2 cursor-pointer border-b border-gray-900/50 hover:bg-gray-800 transition-colors text-[11px]
                  ${isSelected ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : (i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]')}
                `}
              >
                <div className="flex flex-col truncate justify-center">
                  <span className={`font-bold truncate ${isSelected ? 'text-white' : 'text-gray-300'}`}>{item.name}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{item.ticker.replace(/^(KRX:|TSE:|SZSE:|SSE:|HKEX:)/, '').split('.')[0]}</span>
                </div>
                <div className="text-right flex flex-col justify-center">
                  <span className="font-bold text-gray-400">{item.target1mAgo > 0 ? item.target1mAgo.toLocaleString() : '-'}</span>
                </div>
                <div className="text-right flex flex-col justify-center">
                  <span className="font-bold text-gray-200">{item.currentTarget > 0 ? item.currentTarget.toLocaleString() : '-'}</span>
                </div>
                <div className="text-center flex flex-col justify-center text-[10px]">
                  {item.trend === 'UP' ? (
                    <span className="text-red-500 bg-red-900/20 px-1 py-0.5 rounded inline-block">▲ 상승</span>
                  ) : item.trend === 'DOWN' ? (
                    <span className="text-blue-500 bg-blue-900/20 px-1 py-0.5 rounded inline-block">▼ 하락</span>
                  ) : (
                    <span className="text-gray-500">-</span>
                  )}
                </div>
                <div className="text-center flex flex-col justify-center">
                  <span className={`font-bold px-1.5 py-0.5 rounded ${item.analystCount > 10 ? 'bg-yellow-900/30 text-yellow-500' : 'text-gray-400'}`}>
                    {item.analystCount}곳
                  </span>
                </div>
              </div>
            );
          })}
          {loadingCount < totalCount && (
            <div className="text-center py-4 text-gray-500 animate-pulse">데이터를 계속 불러오는 중입니다...</div>
          )}
        </div>
      </div>

      {/* Right Content: Chart */}
      <div className="flex-1 flex flex-col bg-[#050505] p-4 min-h-[500px] lg:min-h-0">
        {selectedStock ? (
          <div className="h-full flex flex-col">
            <div className="mb-4 flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">{selectedStock.name} <span className="text-sm text-gray-500 font-mono ml-2">{selectedStock.ticker}</span></h2>
                <div className="text-gray-400 text-sm flex gap-4">
                  <span>증권사 커버리지: <strong className="text-yellow-500">{selectedStock.analystCount}곳</strong></span>
                  <span>평균 목표가: <strong className="text-white">{selectedStock.currentTarget.toLocaleString()}</strong></span>
                </div>
              </div>
            </div>
            <div className="flex-1 bg-[#111] border border-gray-800 rounded p-4 flex flex-col overflow-hidden">
              <h3 className="text-lg font-bold text-gray-200 mb-2">주가 vs 최고목표가 추이 및 일자별 목표가</h3>
              <div className="h-1/2 relative min-h-[200px]">
                {selectedStock.fundamentals?.price_chart?.length > 0 ? (
                  <div ref={targetChartRef} className="absolute inset-0" />
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-600">차트 데이터가 없습니다.</div>
                )}
              </div>
              
              {/* Target Price History Table */}
              <div className="mt-6 flex-1 overflow-y-auto">
                {selectedStock.fundamentals?.target_history && selectedStock.fundamentals.target_history.length > 0 ? (
                  <table className="w-full text-left border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-700 text-gray-400 bg-[#1a1a1a]">
                        <th className="p-2 font-normal">일자</th>
                        <th className="p-2 text-right font-normal">목표가 및 내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...selectedStock.fundamentals.target_history].sort((a: any, b: any) => new Date(b.time).getTime() - new Date(a.time).getTime()).map((hist: any, idx: number) => (
                        <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-800">
                          <td className="p-2 text-gray-300">{hist.time}</td>
                          <td className="p-2 text-right text-gray-200 font-bold">{hist.text || (hist.value ? hist.value.toLocaleString() : '')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center text-gray-600 mt-4">일자별 목표가 데이터가 없습니다.</div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-600 text-lg">
            좌측 목록에서 종목을 클릭하시면 목표가 차트가 표시됩니다.
          </div>
        )}
      </div>
    </div>
  );
}
