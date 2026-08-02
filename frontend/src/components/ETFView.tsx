import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function ETFView() {
  const [country, setCountry] = useState<'KR' | 'US'>('KR');
  const [etfs, setEtfs] = useState<any[]>([]);
  const [etns, setEtns] = useState<any[]>([]);
  const [usSectors, setUsSectors] = useState<any[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<'ETF' | 'ETN'>('ETF');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL'); // used for both KR brand and US category
  const [selectedItem, setSelectedItem] = useState<any>(null);
  
  // Detail states
  const [portfolio, setPortfolio] = useState<any[]>([]);
  const [maturity, setMaturity] = useState<string>('');
  const [usDetail, setUsDetail] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const fetchList = async () => {
      try {
        const res = await fetch('/api/etf/list');
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setEtfs(data.etfs || []);
            setEtns(data.etns || []);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchList();
    
    pollInterval = setInterval(() => {
      if (!document.hidden) fetchList();
    }, 15000);

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  useEffect(() => {
    const fetchUsSectors = async () => {
      try {
        const res = await fetch('/api/etf/us/sectors');
        if (res.ok) {
          const data = await res.json();
          if (data.sectors && data.sectors.categories) {
            setUsSectors(data.sectors.categories);
          }
        }
      } catch (e) {
        console.error(e);
      }
    };
    fetchUsSectors();
  }, []);

  const handleSelect = async (item: any) => {
    setSelectedItem(item);
    setDetailLoading(true);
    
    if (country === 'US') {
      setUsDetail(null);
      try {
        const res = await fetch(`/api/etf/us/${item.symbol}/details`);
        if (res.ok) {
          const data = await res.json();
          setUsDetail(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setDetailLoading(false);
      }
      return;
    }

    // For KR ETFs/ETNs
    setPortfolio([]);
    setMaturity('');
    
    try {
      const portRes = await fetch(`/api/etf/${item.itemcode}/portfolio`);
      if (portRes.ok) {
        const portData = await portRes.json();
        setPortfolio(portData || []);
      }
      
      if (activeType === 'ETN') {
        const matRes = await fetch(`/api/etf/${item.itemcode}/maturity`);
        if (matRes.ok) {
          const matData = await matRes.json();
          setMaturity(matData.maturity_date || '');
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const fetchDetail = async () => {
      if (!selectedItem) return;
      
      if (country === 'US') {
        try {
          const res = await fetch(`/api/etf/us/${selectedItem.symbol}/details`);
          if (res.ok) {
            const data = await res.json();
            if (isMounted) setUsDetail(data);
          }
        } catch (e) {
          console.error(e);
        }
        return;
      }

      // For KR
      try {
        const portRes = await fetch(`/api/etf/${selectedItem.itemcode}/portfolio`);
        if (portRes.ok) {
          const portData = await portRes.json();
          if (isMounted) setPortfolio(portData || []);
        }
        
        if (activeType === 'ETN') {
          const matRes = await fetch(`/api/etf/${selectedItem.itemcode}/maturity`);
          if (matRes.ok) {
            const matData = await matRes.json();
            if (isMounted) setMaturity(matData.maturity_date || '');
          }
        }
      } catch (e) {
        console.error(e);
      }
    };

    if (selectedItem) {
      pollInterval = setInterval(() => {
        if (!document.hidden) fetchDetail();
      }, 15000);
    }

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [selectedItem, country, activeType]);

  if (loading) {
    return <div className="p-10 text-center text-gray-500">Loading ETF/ETN Data...</div>;
  }

  const isKR = country === 'KR';

  // KR List Preparation
  const krList = activeType === 'ETF' ? etfs : etns;
  const krBrands = Array.from(new Set(krList.map(item => item.itemname.split(' ')[0]))).sort();
  const filteredKrList = selectedCategory === 'ALL' ? krList : krList.filter(item => item.itemname.startsWith(selectedCategory));

  // US List Preparation
  const usList = usSectors.flatMap(c => c.symbols.map((s: any) => ({ ...s, category: c.label })));
  const usCategories = Array.from(new Set(usSectors.map(c => c.label))).sort();
  const filteredUsList = selectedCategory === 'ALL' ? usList : usList.filter(item => item.category === selectedCategory);

  const displayList = isKR ? filteredKrList : filteredUsList;
  const filterOptions = isKR ? krBrands : usCategories;

  return (
    <div className="flex h-full bg-[#0a0a0a] text-gray-200">
      {/* Left Panel: List */}
      <div className="w-1/2 md:w-1/3 border-r border-gray-800 flex flex-col h-full">
        <div className="p-4 border-b border-gray-800 flex gap-2">
          <button 
            className={`flex-1 py-2 font-bold rounded ${country === 'KR' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}
            onClick={() => { setCountry('KR'); setSelectedCategory('ALL'); setSelectedItem(null); }}
          >
            한국
          </button>
          <button 
            className={`flex-1 py-2 font-bold rounded ${country === 'US' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'}`}
            onClick={() => { setCountry('US'); setSelectedCategory('ALL'); setSelectedItem(null); }}
          >
            미국 (Sector)
          </button>
        </div>

        {isKR && (
          <div className="p-4 border-b border-gray-800 flex gap-2 pt-0 mt-4">
            <button 
              className={`flex-1 py-2 font-bold rounded ${activeType === 'ETF' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              onClick={() => { setActiveType('ETF'); setSelectedCategory('ALL'); setSelectedItem(null); }}
            >
              ETF
            </button>
            <button 
              className={`flex-1 py-2 font-bold rounded ${activeType === 'ETN' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400'}`}
              onClick={() => { setActiveType('ETN'); setSelectedCategory('ALL'); setSelectedItem(null); }}
            >
              ETN
            </button>
          </div>
        )}

        <div className="px-4 py-2 bg-[#111] border-b border-gray-800">
          <select 
            className="w-full bg-black border border-gray-700 text-white px-3 py-2 rounded text-sm outline-none"
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value); setSelectedItem(null); }}
          >
            <option value="ALL">{isKR ? '전체 운용사 / 발행사' : '전체 섹터'}</option>
            {filterOptions.map(b => <option key={b as string} value={b as string}>{b}</option>)}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayList.map((item, idx) => {
            const isSelected = isKR ? selectedItem?.itemcode === item.itemcode : selectedItem?.symbol === item.symbol;
            
            return (
              <div 
                key={idx} 
                className={`p-3 border-b border-gray-800 cursor-pointer hover:bg-gray-800 ${isSelected ? 'bg-gray-800 border-l-4 border-l-purple-500' : ''}`}
                onClick={() => handleSelect(item)}
              >
                <div className="font-bold">{isKR ? item.itemname : item.label}</div>
                <div className="flex justify-between mt-1 text-sm">
                  <span className="font-mono text-white">{isKR ? `${item.nowVal?.toLocaleString()} 원` : item.lastPriceValue}</span>
                  {isKR ? (
                    <span className={item.changeRate > 0 ? 'text-red-500' : item.changeRate < 0 ? 'text-blue-500' : 'text-gray-500'}>
                      {item.changeRate > 0 ? '▲' : item.changeRate < 0 ? '▼' : ''} {Math.abs(item.changeRate)}%
                    </span>
                  ) : (
                    <span className={parseFloat(item.priceTr1Day) > 0 ? 'text-green-500' : parseFloat(item.priceTr1Day) < 0 ? 'text-red-500' : 'text-gray-500'}>
                      {parseFloat(item.priceTr1Day) > 0 ? '▲ ' : parseFloat(item.priceTr1Day) < 0 ? '▼ ' : ''}{item.priceTr1Day}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Panel: Detail */}
      <div className="flex-1 p-6 overflow-y-auto">
        {!selectedItem ? (
          <div className="h-full flex items-center justify-center text-gray-600">
            좌측에서 종목을 선택해주세요.
          </div>
        ) : isKR ? (
          <div>
            <h2 className="text-3xl font-black mb-2">{selectedItem.itemname} <span className="text-gray-500 text-lg ml-2">{selectedItem.itemcode}</span></h2>
            <div className="flex items-end gap-4 mb-6 pb-6 border-b border-gray-800">
              <div className="text-4xl font-mono text-white">{selectedItem.nowVal?.toLocaleString()}</div>
              <div className={`text-xl font-bold ${selectedItem.changeRate > 0 ? 'text-red-500' : selectedItem.changeRate < 0 ? 'text-blue-500' : 'text-gray-400'}`}>
                {selectedItem.changeRate > 0 ? '▲' : selectedItem.changeRate < 0 ? '▼' : ''} {Math.abs(selectedItem.changeVal).toLocaleString()} ({selectedItem.changeRate}%)
              </div>
            </div>

            {detailLoading ? (
              <div className="text-gray-500 animate-pulse">데이터를 불러오는 중입니다...</div>
            ) : (
              <div>
                <div>
                  <h3 className="text-xl font-bold mb-4 text-purple-400">포트폴리오 (구성 종목 Top)</h3>
                  {portfolio.length > 0 ? (
                    <div className="bg-[#111] p-4 rounded border border-gray-800 mb-6">
                      {portfolio.map((p, i) => (
                        <div key={i} className="flex justify-between py-2 border-b border-gray-800 last:border-0">
                          <span className="text-gray-300">{p.name}</span>
                          <span className="font-mono text-yellow-500">{p.weight}%</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-gray-500 mb-6 bg-[#111] p-4 rounded border border-gray-800">포트폴리오 정보를 제공하지 않는 종목이거나 파싱에 실패했습니다.</div>
                  )}
                </div>

                {activeType === 'ETN' && (
                  <div>
                    <h3 className="text-xl font-bold mb-4 text-purple-400">만기 정보</h3>
                    <div className="bg-red-900/20 border border-red-800 p-6 rounded-lg text-center">
                      <div className="text-gray-400 mb-2">상장지수증권 만기일</div>
                      <div className="text-3xl font-black text-red-500">{maturity || '만기일 정보 없음'}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div>
            <h2 className="text-3xl font-black mb-2">{selectedItem.label} <span className="text-gray-500 text-lg ml-2">{selectedItem.symbol}</span></h2>
            <div className="flex items-end gap-4 mb-6 pb-6 border-b border-gray-800">
              <div className="text-4xl font-mono text-white">{selectedItem.lastPriceValue}</div>
              <div className={`text-xl font-bold ${parseFloat(selectedItem.priceTr1Day) > 0 ? 'text-green-500' : parseFloat(selectedItem.priceTr1Day) < 0 ? 'text-red-500' : 'text-gray-400'}`}>
                {parseFloat(selectedItem.priceTr1Day) > 0 ? '▲' : parseFloat(selectedItem.priceTr1Day) < 0 ? '▼' : ''} {selectedItem.lastPriceChange?.replace('-','')} ({selectedItem.priceTr1Day?.replace('-','')})
              </div>
            </div>
            
            <div className="flex gap-4 mb-6">
              <div className="flex-1 bg-[#111] p-4 rounded border border-gray-800 flex justify-between items-center">
                <span className="text-gray-400">카테고리</span>
                <span className="font-bold text-white">{selectedItem.category}</span>
              </div>
              <div className="flex-1 bg-[#111] p-4 rounded border border-gray-800 flex justify-between items-center">
                <span className="text-gray-400">1년 수익률 (1Yr)</span>
                <span className={`font-bold ${parseFloat(selectedItem.priceTr1Yr) > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {parseFloat(selectedItem.priceTr1Yr) > 0 ? '▲ ' : parseFloat(selectedItem.priceTr1Yr) < 0 ? '▼ ' : ''}{selectedItem.priceTr1Yr?.replace('-','')}
                </span>
              </div>
            </div>

            {detailLoading ? (
              <div className="text-gray-500 animate-pulse mt-8">데이터를 불러오는 중입니다...</div>
            ) : usDetail ? (
              <div className="mt-8 space-y-8">
                {/* Description */}
                {usDetail.description && usDetail.description !== 'Description not available.' && (
                  <div>
                    <h3 className="text-xl font-bold mb-4 text-purple-400">설명 (Description)</h3>
                    <div className="bg-[#111] p-4 rounded border border-gray-800 text-gray-300 text-sm leading-relaxed max-h-48 overflow-y-auto">
                      {usDetail.description}
                    </div>
                  </div>
                )}

                {/* Chart */}
                {usDetail.chart && usDetail.chart.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold mb-4 text-purple-400">1년 주가 차트 (1Yr Chart)</h3>
                    <div className="bg-[#111] p-4 rounded border border-gray-800 h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={usDetail.chart}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                          <XAxis 
                            dataKey="date" 
                            stroke="#666" 
                            tick={{fill: '#666', fontSize: 12}}
                            tickFormatter={(val) => val.substring(5)}
                          />
                          <YAxis 
                            domain={['auto', 'auto']} 
                            stroke="#666" 
                            tick={{fill: '#666', fontSize: 12}}
                            tickFormatter={(val) => `$${val}`}
                          />
                          <Tooltip 
                            contentStyle={{backgroundColor: '#111', borderColor: '#333', borderRadius: '4px'}}
                            itemStyle={{color: '#fff'}}
                            labelStyle={{color: '#999'}}
                          />
                          <Line type="monotone" dataKey="close" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Portfolio Holdings */}
                {usDetail.holdings && usDetail.holdings.length > 0 && (
                  <div>
                    <h3 className="text-xl font-bold mb-4 text-purple-400">포트폴리오 (구성 종목 Top)</h3>
                    <div className="bg-[#111] p-4 rounded border border-gray-800">
                      {usDetail.holdings.map((p: any, i: number) => (
                        <div key={i} className="flex justify-between py-2 border-b border-gray-800 last:border-0">
                          <span className="text-gray-300">{p.name}</span>
                          <span className="font-mono text-yellow-500">{p.weight}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
