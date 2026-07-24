import React, { useEffect, useRef, useState } from 'react';

export default function HeatmapView({ onNavigateToStock }: { onNavigateToStock?: (ticker: string) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [market, setMarket] = useState("US");

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = ''; // Clear previous widget
      const script = document.createElement('script');
      script.src = "https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js";
      script.type = "text/javascript";
      script.async = true;
      let dataSource = market;
      let exchanges: string[] = [];

      if (market === "KOSPI" || market === "KOSDAQ") {
        dataSource = undefined as any;
        exchanges = ["KRX"];
      } else if (market === "US") {
        dataSource = undefined as any;
        exchanges = ["NYSE", "NASDAQ", "AMEX"];
      }

      script.innerHTML = JSON.stringify({
        "exchanges": exchanges,
        "dataSource": dataSource,
        "grouping": "sector",
        "blockSize": "market_cap_basic",
        "blockColor": "change",
        "locale": "kr",
        "symbolUrl": "",
        "colorTheme": "dark",
        "hasTopBar": true,
        "isTransparent": true,
        "width": "100%",
        "height": "100%",
        "onWidgetClick": (ticker: string) => {
          if (onNavigateToStock) {
            onNavigateToStock(ticker);
          }
        }
      });
      containerRef.current.appendChild(script);
    }
  }, [market, onNavigateToStock]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] w-full bg-[#050505] text-gray-300">
      <div className="p-4 border-b border-gray-800 bg-[#111] flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">
            글로벌 업종별 시가총액 등락 맵 (Heatmap)
            <span className="ml-3 text-xs font-normal text-green-400 bg-green-900/30 px-2 py-0.5 rounded border border-green-800">● 실시간(정규장) / 장마감(종가) 반영</span>
          </h2>
          <p className="text-sm text-gray-400">선택한 시장의 섹터별 실시간 자금 흐름과 장마감 후 종가 기준 등락을 한눈에 파악할 수 있습니다.</p>
        </div>
        <select 
          value={market} 
          onChange={(e) => setMarket(e.target.value)}
          className="bg-black border border-gray-700 rounded px-4 py-2 text-white font-bold outline-none focus:border-blue-500"
        >
          <option value="SPX500">🇺🇸 미국 (S&P 500)</option>
          <option value="NDX">🇺🇸 미국 (NASDAQ 100)</option>
          <option value="US">🇺🇸 미국 (전체 - 실시간)</option>
        </select>
      </div>
      <div className="flex-1 w-full h-full relative p-2" ref={containerRef}>
      </div>
    </div>
  );
}
