"use client";

import React, { useState } from 'react';
import TradingViewWidget from './TradingViewWidget';

export default function GlobalIndicesView() {
  const [activeCategory, setActiveCategory] = useState<'주가' | '채권' | '원자재'>('주가');
  const [activeSubCategory, setActiveSubCategory] = useState<string>('귀금속');

  const [indicesData, setIndicesData] = useState<any[]>([]);

  React.useEffect(() => {
    fetch('/api/indices')
      .then(res => res.json())
      .then(data => setIndicesData(data))
      .catch(err => console.error('Failed to fetch indices:', err));
  }, []);

  const categories = {
    '주가': [
      { name: "KOSPI (KODEX 200)", symbol: "KRX:069500" },
      { name: "KOSDAQ (KODEX 코스닥150)", symbol: "KRX:229200" },
      { name: "S&P 500 (SPY)", symbol: "SPY" },
      { name: "NASDAQ 100 (QQQ)", symbol: "QQQ" },
      { name: "일본 (EWJ)", symbol: "EWJ" },
      { name: "중국 (FXI)", symbol: "FXI" },
      { name: "유럽 (EZU)", symbol: "EZU" }
    ],
    '채권': [
      { name: "한국 10년물 국채", symbol: "TVC:KR10Y", link: "https://kr.tradingview.com/symbols/TVC-KR10Y/" },
      { name: "한국 3년물 국채", symbol: "TVC:KR03Y", link: "https://kr.tradingview.com/symbols/TVC-KR03Y/" },
      { name: "미국 10년물 국채", symbol: "TVC:US10Y", link: "https://kr.tradingview.com/symbols/TVC-US10Y/" },
      { name: "미국 2년물 국채", symbol: "TVC:US02Y", link: "https://kr.tradingview.com/symbols/TVC-US02Y/" }
    ]
  };

  const commoditySubCategories: Record<string, {name: string, symbol: string, link?: string}[]> = {
    '귀금속': [
      { name: "금 (Gold)", symbol: "XAUUSD" },
      { name: "은 (Silver)", symbol: "XAGUSD" },
      { name: "플래티넘 (Platinum)", symbol: "XPTUSD" }
    ],
    '에너지': [
      { name: "WTI 원유 (Crude Oil)", symbol: "USOIL", link: "https://kr.tradingview.com/symbols/TVC-USOIL/" },
      { name: "천연가스 (Natural Gas)", symbol: "NATGAS", link: "https://kr.tradingview.com/symbols/TVC-NATGAS/" },
      { name: "가솔린 (RBOB Gasoline)", symbol: "NYMEX:RB1!", link: "https://kr.tradingview.com/symbols/NYMEX-RB1!/" },
      { name: "난방유 (Heating Oil)", symbol: "NYMEX:HO1!", link: "https://kr.tradingview.com/symbols/NYMEX-HO1!/" }
    ],
    '비철/희토류': [
      { name: "구리 (Copper)", symbol: "COMEX:HG1!" },
      { name: "아연 (Zinc)", symbol: "LME:ZSD1!" },
      { name: "알루미늄 (Aluminum)", symbol: "LME:AHD1!" },
      { name: "리튬 (Lithium ETF proxy)", symbol: "LIT" },
      { name: "희토류 (Rare Earth ETF proxy)", symbol: "REMX" }
    ],
    '곡물': [
      { name: "소맥 (Wheat)", symbol: "CBOT:ZW1!" },
      { name: "대두 (Soybeans)", symbol: "CBOT:ZS1!" },
      { name: "옥수수 (Corn)", symbol: "CBOT:ZC1!" },
      { name: "설탕 (Sugar)", symbol: "ICEUS:SB1!" }
    ]
  };

  const getActiveItems = () => {
    if (activeCategory === '원자재') {
      return commoditySubCategories[activeSubCategory] || [];
    }
    return categories[activeCategory] || [];
  };

  return (
    <div className="h-full w-full bg-[#0a0a0a] text-gray-200 overflow-y-auto p-4 flex flex-col gap-4">
      {/* Header & Main Tabs */}
      <div className="bg-[#111] border border-gray-800 rounded p-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold mb-1">글로벌 시장지수 (Global Indices)</h2>
          <p className="text-xs text-gray-400">주가, 채권, 원자재 및 다양한 자산군의 실시간 차트</p>
        </div>
        <div className="flex bg-gray-900 border border-gray-700 rounded overflow-hidden">
          {(['주가', '채권', '원자재'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-6 py-2 text-sm font-bold transition-colors ${
                activeCategory === cat ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>
      
      {/* Sub Tabs for Commodities */}
      {activeCategory === '원자재' && (
        <div className="flex gap-2 overflow-x-auto hide-scrollbar">
          {Object.keys(commoditySubCategories).map(sub => (
            <button
              key={sub}
              onClick={() => setActiveSubCategory(sub)}
              className={`px-4 py-1.5 text-xs font-bold border rounded-full whitespace-nowrap transition-colors ${
                activeSubCategory === sub 
                  ? 'bg-yellow-900/30 border-yellow-600 text-yellow-500' 
                  : 'bg-[#111] border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}
      
      {/* Grid of Charts */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 pb-10">
        {getActiveItems().map(item => {
          const apiInfo = indicesData.find(d => d.symbol === item.symbol);
          const displayPrice = apiInfo?.price ? apiInfo.price.toLocaleString() : null;
          const displayChange = apiInfo?.changePct !== undefined ? apiInfo.changePct : null;
          const changeColor = displayChange !== null && displayChange > 0 ? 'text-red-400' : (displayChange !== null && displayChange < 0 ? 'text-blue-400' : 'text-gray-400');
          
          return (
          <div key={item.symbol} className="bg-[#111] border border-gray-800 rounded p-4 flex flex-col h-[400px]">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-bold text-gray-200">
                {item.name}
                {displayPrice && (
                   <span className="ml-3 font-mono">
                     {displayPrice} 
                     <span className={`ml-2 text-sm ${changeColor}`}>
                       ({displayChange > 0 ? '+' : ''}{displayChange}%)
                     </span>
                   </span>
                )}
              </h3>
              {('link' in item) && (item as any).link && (
                <a href={(item as any).link} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  TradingView에서 지수 원본 보기 ↗
                </a>
              )}
            </div>
            <div className="flex-1 rounded overflow-hidden">
              <TradingViewWidget symbol={item.symbol} />
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
