import React, { useState, useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, LineSeries, HistogramSeries, createSeriesMarkers } from 'lightweight-charts';

export default function SectorAnalysis() {
  const [sectors, setSectors] = useState<any[]>([]);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);
  const [selectedStocks, setSelectedStocks] = useState<any[]>([]);
  const [fundamentalsData, setFundamentalsData] = useState<any>({});
  const [loading, setLoading] = useState(false);
  
  const chartsCache = useRef<any>({});

  // Load Sectors on mount
  useEffect(() => {
    fetch('/api/sector-analysis')
      .then(res => res.ok ? res.json() : Promise.reject(new Error(res.statusText)))
      .then(data => {
        if (data.sectors) {
          setSectors(data.sectors);
          if (data.sectors.length > 0) {
            setExpandedSector(data.sectors[0].sector);
            if (data.sectors[0].stocks.length > 0) {
              setSelectedStocks([data.sectors[0].stocks[0]]);
            }
          }
        }
      })
      .catch(err => console.error(err));
  }, []);

  // Fetch Fundamentals when stocks are selected
  useEffect(() => {
    if (selectedStocks.length === 0) return;
    
    selectedStocks.forEach(stock => {
      setFundamentalsData((prev: any) => {
        // If already fetched or currently loading, skip
        if (prev[stock.ticker]) return prev;
        
        // Start fetch
        fetch(`/api/fundamentals/${stock.ticker}`)
          .then(res => res.ok ? res.json() : Promise.reject(new Error(res.statusText)))
          .then(data => {
            setFundamentalsData((p: any) => ({ ...p, [stock.ticker]: data }));
          })
          .catch(err => {
            setFundamentalsData((p: any) => ({ ...p, [stock.ticker]: { error: 'Failed to fetch' } }));
          });
          
        // Mark as loading
        return { ...prev, [stock.ticker]: { loading: true } };
      });
    });
  }, [selectedStocks]);

  const handleSelectStock = (stock: any) => {
    if (selectedStocks.find(s => s.ticker === stock.ticker)) {
      setSelectedStocks(selectedStocks.filter(s => s.ticker !== stock.ticker));
    } else {
      if (selectedStocks.length >= 2) {
        setSelectedStocks([selectedStocks[1], stock]); // Replace the oldest one
      } else {
        setSelectedStocks([...selectedStocks, stock]);
      }
    }
  };

  const renderStockView = (stock: any) => {
    const fundamentals = fundamentalsData[stock.ticker];
    if (!fundamentals || fundamentals.loading) return <div className="animate-pulse text-gray-500 h-full flex items-center justify-center text-lg">데이터를 불러오는 중입니다...</div>;
    if (fundamentals.error) return <div className="text-red-500 h-full flex items-center justify-center">데이터 로드 실패: {fundamentals.error}</div>;

    return (
      <div className="flex flex-col gap-4 h-full">
        {/* Info Header */}
        <div className="mb-2">
          <h2 className="text-2xl font-bold text-white mb-1">{stock.name} <span className="text-sm text-gray-500 font-mono ml-2">{stock.ticker}</span></h2>
          <p className="text-gray-400 text-sm truncate">{stock.description}</p>
        </div>
        
        {/* Fundamental Cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#111] border border-gray-800 p-4 rounded flex flex-col">
            <span className="text-gray-500 font-bold mb-1 text-[10px]">PER (주가수익비율)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white">{fundamentals.per !== 'N/A' && fundamentals.per > 0 ? fundamentals.per : 'N/A'}</span>
            </div>
          </div>
          <div className="bg-[#111] border border-gray-800 p-4 rounded flex flex-col">
            <span className="text-gray-500 font-bold mb-1 text-[10px]">PBR (주가순자산비율)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white">{fundamentals.pbr !== 'N/A' && fundamentals.pbr > 0 ? fundamentals.pbr : 'N/A'}</span>
            </div>
          </div>
          <div className="bg-[#111] border border-gray-800 p-4 rounded flex flex-col">
            <span className="text-gray-500 font-bold mb-1 text-[10px]">예상 EPS (올해)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white">{fundamentals.eps != null && fundamentals.eps !== 'N/A' ? fundamentals.eps.toLocaleString() : 'N/A'}</span>
            </div>
          </div>
          <div className="bg-[#111] border border-gray-800 p-4 rounded flex flex-col">
            <span className="text-gray-500 font-bold mb-1 text-[10px]">ROE (올해)</span>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-white">{fundamentals.roe !== 'N/A' ? fundamentals.roe : 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Charts Container */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Target Price Chart */}
          <div className="bg-[#111] border border-gray-800 rounded p-4 flex flex-col overflow-hidden h-[300px]">
            <h3 className="text-sm font-bold text-gray-200 mb-2">목표가 추이 분석</h3>
            <div className="flex-1 relative">
              <ChartRenderer id={`target-${stock.ticker}`} data={fundamentals.price_chart} type="target" fundamentals={fundamentals} />
            </div>
          </div>

          {/* RS Chart */}
          <div className="bg-[#111] border border-gray-800 rounded p-4 flex flex-col h-[200px]">
            <h3 className="text-sm font-bold text-gray-200 mb-2">상대강도 (RS) 차트</h3>
            <div className="flex-1 relative">
              <ChartRenderer id={`rs-${stock.ticker}`} data={fundamentals.rs_chart} type="rs" fundamentals={fundamentals} />
            </div>
          </div>

          {/* EPS Chart */}
          <div className="bg-[#111] border border-gray-800 rounded p-4 flex flex-col h-[200px]">
            <h3 className="text-sm font-bold text-gray-200 mb-2">연도별 EPS 추이</h3>
            <div className="flex-1 relative">
              <ChartRenderer id={`eps-${stock.ticker}`} data={fundamentals.eps_trend} type="eps" fundamentals={fundamentals} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col lg:flex-row h-auto lg:h-[calc(100vh-120px)] w-full bg-black text-gray-300 text-xs overflow-y-auto lg:overflow-hidden">
      {/* Left Sidebar: Sectors */}
      <div className="w-full lg:w-[300px] bg-[#0a0a0a] lg:border-r border-b lg:border-b-0 border-gray-800 flex flex-col h-[300px] lg:h-full overflow-y-auto hide-scrollbar shrink-0">
        <div className="p-3 border-b border-gray-800 bg-[#111] text-gray-400">
          비교할 종목을 최대 2개 선택하세요
        </div>
        {sectors.map((sec, i) => (
          <div key={i} className="border-b border-gray-800">
            <div 
              className="p-3 bg-[#111] hover:bg-gray-800 cursor-pointer font-bold text-gray-200 flex justify-between"
              onClick={() => setExpandedSector(expandedSector === sec.sector ? null : sec.sector)}
            >
              <span>{sec.sector}</span>
              <span>{expandedSector === sec.sector ? '▼' : '▶'}</span>
            </div>
            
            {expandedSector === sec.sector && (
              <div className="bg-[#050505]">
                {sec.stocks.map((stock: any, j: number) => {
                  const isSelected = selectedStocks.some(s => s.ticker === stock.ticker);
                  return (
                    <div 
                      key={j} 
                      className={`p-2 pl-6 cursor-pointer border-l-2 flex justify-between items-center hover:bg-gray-800 transition-colors ${
                        isSelected ? 'border-l-blue-500 bg-blue-900/20 text-white' : 'border-l-transparent text-gray-400'
                      }`}
                      onClick={() => handleSelectStock(stock)}
                    >
                      <div className="flex flex-col">
                        <span className="font-bold">{stock.name}</span>
                        <span className="text-[10px] text-gray-500">{stock.ticker}</span>
                      </div>
                      <span className="text-[10px] px-1 py-0.5 rounded bg-gray-800">{stock.country}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Main Content (Split View if 2 stocks) */}
      <div className="flex-1 flex flex-col lg:flex-row bg-[#050505] overflow-y-auto lg:overflow-x-auto min-h-[600px] lg:min-h-0">
        {selectedStocks.length > 0 ? (
          selectedStocks.map((stock, i) => (
            <div key={stock.ticker} className={`flex-1 p-4 overflow-y-auto lg:border-l ${i > 0 ? 'border-t lg:border-t-0 border-gray-800' : 'border-transparent'}`}>
              {renderStockView(stock)}
            </div>
          ))
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-600 text-lg">좌측에서 종목을 선택해주세요.</div>
        )}
      </div>
    </div>
  );
}

// Subcomponent to handle individual charts
function ChartRenderer({ id, data, type, fundamentals }: { id: string, data: any, type: string, fundamentals: any }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !data || data.length === 0) return;

    const chartOptions = {
      layout: { background: { type: ColorType.Solid, color: '#000000' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
    };

    const chart = createChart(containerRef.current, { 
      ...chartOptions, 
      width: containerRef.current.clientWidth, 
      height: containerRef.current.clientHeight 
    });

    if (type === 'target') {
      const priceSeries = chart.addSeries(LineSeries, { color: '#E0E0E0', lineWidth: 2 });
      priceSeries.setData(data);
      if (fundamentals.targetHigh && fundamentals.targetHigh > 0) {
        priceSeries.createPriceLine({
          price: fundamentals.targetHigh,
          color: '#FF5252',
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: '최고목표가',
        });
      }
      if (fundamentals.target_history && fundamentals.target_history.length > 0) {
        const validMarkers = [...fundamentals.target_history]
          .filter(m => m.time && m.time.length >= 10)
          .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())
          .filter((v, i, a) => i === 0 || v.time !== a[i-1].time);
        if (validMarkers.length > 0) {
          try {
            createSeriesMarkers(priceSeries, validMarkers);
          } catch(e) { console.error("Marker error", e); }
        }
      }
    } else if (type === 'rs') {
      const rsSeries = chart.addSeries(LineSeries, { color: '#2962FF', lineWidth: 2 });
      rsSeries.setData(data);
    } else if (type === 'eps') {
      const epsSeries = chart.addSeries(HistogramSeries, { color: '#26a69a' });
      const epsData = data.map((item: any) => {
        let timeStr = item.time;
        if (timeStr.length === 4) timeStr = `${timeStr}-12-31`;
        let color = item.value >= 0 ? '#26a69a' : '#ef5350';
        if (item.is_estimate) color = item.value >= 0 ? '#81c784' : '#e57373';
        return { time: timeStr, value: item.value, color: color };
      });
      epsSeries.setData(epsData);
    }

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (containerRef.current) chart.applyOptions({ width: containerRef.current.clientWidth });
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, type, fundamentals]);

  if (!data || data.length === 0) return <div className="flex h-full items-center justify-center text-gray-600">데이터 없음</div>;
  
  return <div ref={containerRef} className="absolute inset-0" />;
}
