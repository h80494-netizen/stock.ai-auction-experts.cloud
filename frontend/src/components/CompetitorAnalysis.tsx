"use client";

import React, { useState, useEffect } from 'react';
import TickerDetailsModal from './TickerDetailsModal';

const SECTOR_CHARTS: Record<string, string> = {
  "1. AI S/W": "1._AI_S_W_rs.png",
  "2. AI H/W": "2._AI_H_W_rs.png",
  "3. Physical AI & Robotics": "3._Physical_AI_and_Robotics_rs.png",
  "4. Semiconductor Equipment": "4._Semiconductor_Equipment_rs.png",
  "5. Secondary Batteries": "5._Secondary_Batteries_rs.png",
  "6. Defense & Aerospace": "6._Defense_and_Aerospace_rs.png",
  "7. Smartphones": "7._Smartphones_rs.png",
  "8. Financial Services": "8._Financial_Services_rs.png",
  "9. Basic Materials": "9._Basic_Materials_rs.png",
  "10. Utilities & Infrastructure": "10._Utilities_and_Infrastructure_rs.png"
};

function getStars(item: any, idx: number) {
  // Simple mock to generate stars (3 to 5 stars)
  const titleLength = item?.title?.length || 0;
  const score = (titleLength + idx) % 3;
  if (score === 0) return "★★★☆☆";
  if (score === 1) return "★★★★☆";
  return "★★★★★";
}

export default function CompetitorAnalysis({ onNavigateToStock }: { onNavigateToStock?: (ticker: string) => void }) {
  const [sectors, setSectors] = useState<Record<string, any[]>>({});
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [news, setNews] = useState<any[]>([]);
  const [loadingNews, setLoadingNews] = useState(false);
  
  const [sectorDetails, setSectorDetails] = useState<any[]>([]);
  const [loadingTickers, setLoadingTickers] = useState(false);

  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/competitors/sectors')
      .then(res => res.ok ? res.json() : Promise.reject(new Error(res.statusText)))
      .then(data => {
        setSectors(data);
        const keys = Object.keys(data);
        if (keys.length > 0) {
          setSelectedSector(keys[0]);
        }
      })
      .catch(err => console.error("Error fetching sectors", err));
  }, []);

  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const fetchDetails = () => {
      if (!selectedSector) return;

      if (!pollInterval) {
        setLoadingNews(true);
        setLoadingTickers(true);
        setSectorDetails([]);
      }

      fetch(`/api/competitors/news?sector=${encodeURIComponent(selectedSector)}`)
        .then(res => res.ok ? res.json() : Promise.reject(new Error(res.statusText)))
        .then(data => {
          if (isMounted) {
            setNews(data);
            setLoadingNews(false);
          }
        })
        .catch(err => {
          console.error("Error fetching news", err);
          if (isMounted) setLoadingNews(false);
        });

      fetch(`/api/competitors/sector-details?sector=${encodeURIComponent(selectedSector)}`)
        .then(res => res.ok ? res.json() : Promise.reject(new Error(res.statusText)))
        .then(data => {
          if (isMounted) {
            setSectorDetails(data);
            setLoadingTickers(false);
          }
        })
        .catch(err => {
          console.error("Error fetching sector details", err);
          if (isMounted) setLoadingTickers(false);
        });
    };

    fetchDetails();
    pollInterval = setInterval(() => {
      if (!document.hidden) fetchDetails();
    }, 60000); // 1 minute poll

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [selectedSector]);

  return (
    <div className="h-auto lg:h-full flex flex-col lg:flex-row gap-4 p-4 overflow-y-auto bg-black text-gray-200">
      
      {/* 1. Left Sidebar: Sector Select */}
      <div className="w-full lg:w-[15%] flex flex-col gap-4 shrink-0 h-[250px] lg:h-full overflow-y-auto">
        <div className="bg-[#111] border border-gray-800 rounded p-4 shadow h-full flex flex-col">
          <h2 className="text-lg font-bold mb-3 text-white border-b border-gray-800 pb-2">경쟁업종 (Sector)</h2>
          <div className="flex-1 overflow-y-auto pr-2 space-y-2">
            {Object.keys(sectors).map(sec => (
              <button
                key={sec}
                onClick={() => setSelectedSector(sec)}
                className={`w-full text-left p-3 rounded border transition-colors ${
                  selectedSector === sec 
                    ? 'bg-yellow-900/30 border-yellow-600 text-yellow-500 font-bold' 
                    : 'bg-[#0a0a0a] border-gray-800 hover:border-gray-500 text-gray-300'
                }`}
              >
                {sec}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Center Main: Chart & Fundamentals Table */}
      <div className="flex-1 flex flex-col gap-4 h-auto lg:h-full overflow-y-auto min-w-0 lg:min-w-[400px]">
        
        {/* Relative Strength Chart */}
        {selectedSector && SECTOR_CHARTS[selectedSector] && (
          <div className="bg-[#111] border border-gray-800 rounded p-4 shadow shrink-0">
            <h2 className="text-lg font-bold mb-3 text-white border-b border-gray-800 pb-2">섹터별 상대강도 (Relative Strength)</h2>
            <div className="w-full h-64 lg:h-80 relative bg-[#0a0a0a] rounded flex items-center justify-center p-2 border border-gray-800">
              <img 
                src={`/charts/${SECTOR_CHARTS[selectedSector]}?v=${Date.now()}`} 
                alt={`${selectedSector} Chart`}
                className="max-w-full max-h-full object-contain rounded"
              />
            </div>
          </div>
        )}

        {/* Fundamentals Table */}
        <div className="bg-[#111] border border-gray-800 rounded p-4 shadow flex-1 min-h-[300px]">
          <h2 className="text-lg font-bold mb-3 text-white border-b border-gray-800 pb-2">기본 재무정보 (금년 예상)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-gray-900 text-gray-400 border-b border-gray-800 sticky top-0">
                <tr>
                  <th className="px-3 py-2 font-medium">종목</th>
                  <th className="px-3 py-2 font-medium text-right">현재가</th>
                  <th className="px-3 py-2 font-medium text-right text-blue-300">전일대비</th>
                  <th className="px-3 py-2 font-medium text-right text-red-400">1년 수익률</th>
                  <th className="px-3 py-2 font-medium text-right text-purple-400">PER</th>
                  <th className="px-3 py-2 font-medium text-right text-purple-400">EPS</th>
                  <th className="px-3 py-2 font-medium text-right text-blue-400">BPS</th>
                  <th className="px-3 py-2 font-medium text-right text-green-400">ROE</th>
                  <th className="px-3 py-2 font-medium text-right text-green-400">ROA</th>
                  <th className="px-3 py-2 font-medium text-right text-yellow-400">배당수익률</th>
                </tr>
              </thead>
              <tbody>
                {loadingTickers ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-10 text-center text-gray-500 animate-pulse">실시간 재무정보 로딩 중...</td>
                  </tr>
                ) : sectorDetails.length > 0 ? (
                  sectorDetails.map((t, i) => (
                    <tr 
                      key={t.ticker} 
                      onClick={() => {
                        if (onNavigateToStock) {
                          onNavigateToStock(t.ticker);
                        } else {
                          setSelectedTicker(t.ticker);
                        }
                      }}
                      className={`border-b border-gray-800 hover:bg-gray-800 cursor-pointer transition-colors ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]'}`}
                    >
                      <td className="px-3 py-3">
                        <div className="font-bold text-yellow-500">{t.ticker}</div>
                        <div className="text-xs text-gray-400">{t.name}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-gray-200">
                        {t.price !== 'N/A' && typeof t.price === 'number' ? t.price.toLocaleString() : t.price}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <div className={`font-mono font-bold ${typeof t.change === 'number' && t.change > 0 ? 'text-red-500' : typeof t.change === 'number' && t.change < 0 ? 'text-blue-500' : 'text-gray-500'}`}>
                          {typeof t.change === 'number' ? `${t.change > 0 ? '▲ ' : t.change < 0 ? '▼ ' : ''}${Math.abs(t.change)}%` : 'N/A'}
                        </div>
                      </td>
                      <td className={`px-3 py-3 text-right font-mono font-bold ${t.return_1y !== 'N/A' && String(t.return_1y).startsWith('-') ? 'text-blue-400' : 'text-red-400'}`}>
                        {t.return_1y || 'N/A'}
                      </td>
                      <td className="px-3 py-3 text-right font-mono text-purple-300">{t.per || 'N/A'}</td>
                      <td className="px-3 py-3 text-right font-mono text-purple-300">{t.eps || 'N/A'}</td>
                      <td className="px-3 py-3 text-right font-mono text-blue-300">{t.bps || 'N/A'}</td>
                      <td className="px-3 py-3 text-right font-mono text-green-300">{t.roe || 'N/A'}</td>
                      <td className="px-3 py-3 text-right font-mono text-green-300">{t.roa || 'N/A'}</td>
                      <td className="px-3 py-3 text-right font-mono text-yellow-300">{t.div_yield || 'N/A'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-gray-500">종목 데이터가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* 3. Right Sidebar: News Briefing */}
      <div className="w-full lg:w-[25%] flex flex-col gap-4 shrink-0 h-[400px] lg:h-full overflow-y-auto">
        <div className="bg-[#111] border border-gray-800 rounded p-4 shadow flex flex-col h-full">
          <h2 className="text-lg font-bold mb-3 text-white border-b border-gray-800 pb-2 flex justify-between items-center">
            <span>뉴스 브리핑</span>
            <span className="text-xs font-normal text-gray-400">중요도(★)순</span>
          </h2>
          <div className="flex-1 overflow-y-auto pr-2">
            {loadingNews ? (
              <div className="animate-pulse space-y-4 mt-2">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} className="h-20 bg-gray-800 rounded w-full"></div>
                ))}
              </div>
            ) : news.length > 0 ? (
              <div className="space-y-3 mt-2">
                {news.map((item, idx) => (
                  <a 
                    key={idx} 
                    href={item.link} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block bg-[#0a0a0a] border border-gray-800 hover:border-gray-600 p-3 rounded transition-colors group"
                  >
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-yellow-600 bg-yellow-900/20 px-2 py-0.5 rounded">
                          {item.related_ticker}
                        </span>
                        <span className="text-xs text-yellow-500 tracking-widest">{getStars(item, idx)}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded group-hover:bg-gray-700">
                        {item.publisher || 'News'}
                      </span>
                    </div>
                    <h3 className="text-sm font-semibold text-gray-200 line-clamp-3 leading-snug mt-2">
                      {item.title}
                    </h3>
                  </a>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-sm mt-2 text-center py-10">해당 섹터의 뉴스가 없습니다.</div>
            )}
          </div>
        </div>
      </div>

      {/* Ticker Modal */}
      {selectedTicker && (
        <TickerDetailsModal 
          ticker={selectedTicker} 
          onClose={() => setSelectedTicker(null)} 
        />
      )}
    </div>
  );
}
