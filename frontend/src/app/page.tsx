"use client";

import React, { useState, useEffect } from 'react';
import PriceView from '@/components/PriceView';
import OrderWindow from '@/components/OrderWindow';
import CompetitorAnalysis from '@/components/CompetitorAnalysis';

import SectorAnalysis from '@/components/SectorAnalysis';
import TargetAnalysis from '@/components/TargetAnalysis';
import HeatmapView from '@/components/HeatmapView';
import StockDashboard from '@/components/StockDashboard';
import GlobalIndicesView from '@/components/GlobalIndicesView';
import ETFView from '@/components/ETFView';
import DerivativesView from '@/components/DerivativesView';
import MarketScannerView from '@/components/MarketScannerView';
import TrendingStocksView from '@/components/TrendingStocksView';
import GlobalNewsRankingView from '@/components/GlobalNewsRankingView';
import ETFStrategyView from '@/components/ETFStrategyView';
import ETFSimulationHistoryView from '@/components/ETFSimulationHistoryView';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'search' | 'price' | 'order' | 'competitor' | 'sector' | 'target' | 'heatmap' | 'global' | 'trending' | 'etf' | 'derivatives' | 'scanner' | 'globalnews' | 'etf_strategy' | 'etf_history'>('search');
  const [globalSearchTicker, setGlobalSearchTicker] = useState("");
  const [stocks, setStocks] = useState<any[]>([]);
  const [globalData, setGlobalData] = useState<any>({ indices: [], stocks: [] });
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;
    
    const fetchData = async () => {
      // Fetch prices and global quickly to unlock UI
      try {
        const [pricesRes, globalRes] = await Promise.allSettled([
          fetch('/api/prices').then(r => r.ok ? r.json() : []),
          fetch('/api/global').then(r => r.ok ? r.json() : { indices: [], stocks: [] })
        ]);
        
        if (!isMounted) return;

        if (pricesRes.status === 'fulfilled') {
          const rawStocks = pricesRes.value;
          setStocks(Array.isArray(rawStocks) ? rawStocks.sort((a: any, b: any) => b.market_cap - a.market_cap) : []);
        }
        if (globalRes.status === 'fulfilled') setGlobalData(globalRes.value);
        
      } catch (e) {
        console.error("Failed to fetch fast data", e);
      } finally {
        if (isMounted) setLoading(false);
      }
      
      // Start polling for real-time prices every 5 seconds
      pollInterval = setInterval(async () => {
        if (!document.hidden) {
          try {
            const [pRes, gRes] = await Promise.allSettled([
              fetch('/api/prices').then(r => r.ok ? r.json() : []),
              fetch('/api/global').then(r => r.ok ? r.json() : { indices: [], stocks: [] })
            ]);
            if (!isMounted) return;
            if (pRes.status === 'fulfilled') {
              const rawStocks = pRes.value;
              setStocks(Array.isArray(rawStocks) ? rawStocks.sort((a: any, b: any) => b.market_cap - a.market_cap) : []);
            }
            if (gRes.status === 'fulfilled') setGlobalData(gRes.value);
          } catch (e) {
            console.error("Polling error", e);
          }
        }
      }, 5000);
      
      // Fetch news in background as it takes ~10s
      try {
        const newsData = await fetch('/api/news').then(r => r.ok ? r.json() : []);
        if (isMounted) setNews(newsData);
      } catch (e) {
        console.error("Failed to fetch news", e);
      }
    };
    fetchData();
    return () => { 
      isMounted = false; 
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  const [forceCategory, setForceCategory] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white font-sans">
        <div className="animate-pulse text-2xl font-bold">Loading Global Terminal...</div>
      </div>
    );
  }

  const handleIndexClick = async (idxName: string) => {
    let market = "KR";
    if (idxName.includes("S&P") || idxName.includes("NASDAQ")) market = "US";
    else if (idxName.includes("Nikkei")) market = "JP";
    else if (idxName.includes("Shanghai")) market = "CN";
    else if (idxName.includes("KOSDAQ")) market = "KOSDAQ";
    
    try {
      const res = await fetch(`/api/market/${market}/top50`);
      const top50 = res.ok ? await res.json() : [];
      
      setGlobalData((prev: any) => {
         const existing = prev.stocks.filter((s: any) => !(s.categories || []).includes(`${market} Top 50`));
         return { ...prev, stocks: [...top50, ...existing] };
      });
      setForceCategory(`${market} Top 50`);
      setActiveTab('price');
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="min-h-screen bg-black text-gray-100 font-sans flex flex-col text-sm overflow-hidden">
      {/* Global Marquee Bar */}
      <div className="h-8 bg-[#111] border-b border-gray-800 flex items-center px-4 overflow-hidden text-xs font-mono">
        <span className="font-bold text-yellow-500 mr-4 whitespace-nowrap">GLOBAL MARKETS</span>
        <div className="flex animate-marquee whitespace-nowrap">
          {/* Exchange Rates First */}
          {[...(globalData.indices || [])].filter((idx: any) => idx.name.includes('/KRW')).map((idx: any, i: number) => {
            const label = idx.name === "USD/KRW" ? "원/달러" : (idx.name === "JPY/KRW" ? "원/엔(100)" : "원/위안");
            return (
              <div key={`fx-${i}`} className="flex mx-4 items-center bg-[#1a1a1a] px-3 py-0.5 rounded border border-gray-700">
                <span className="text-gray-400 mr-2">{label}</span>
                <span className="font-bold text-yellow-400 mr-2">{idx.price.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                <span className={idx.change > 0 ? 'text-red-500' : 'text-blue-500'}>
                  {idx.change > 0 ? '▲' : '▼'}{Math.abs(idx.change).toFixed(2)} ({idx.change > 0 ? '+' : ''}{idx.changePct.toFixed(2)}%)
                </span>
              </div>
            );
          })}
          
          {/* Indices Second */}
          {[...(globalData.indices || [])].filter((idx: any) => !idx.name.includes('/KRW')).sort((a: any, b: any) => {
            const isAKR = a.name.includes("KOSPI") || a.name.includes("KOSDAQ");
            const isBKR = b.name.includes("KOSPI") || b.name.includes("KOSDAQ");
            if (isAKR && !isBKR) return -1;
            if (!isAKR && isBKR) return 1;
            return 0;
          }).map((idx: any, i: number) => (
            <div 
              key={i} 
              className="flex mx-4 cursor-pointer hover:bg-gray-800 px-2 rounded items-center"
              onClick={() => handleIndexClick(idx.name)}
              title={`${idx.name} 클릭 시 시총 상위 50 종목 조회`}
            >
              <span className="text-gray-400 mr-2">{idx.name}</span>
              <span className="font-bold text-gray-200 mr-2">{idx.price.toLocaleString()}</span>
              <span className={idx.change > 0 ? 'text-red-500' : 'text-blue-500'}>
                {idx.change > 0 ? '▲' : '▼'}{Math.abs(idx.changePct)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Main Navbar */}
      <nav className="h-auto min-h-14 bg-[#0a0a0a] border-b border-gray-800 flex flex-col md:flex-row items-start md:items-center justify-between px-4 py-2">
        <h1 className="text-xl font-black tracking-tighter mb-2 md:mb-0 shrink-0">
          STOCK<span className="text-red-600">CODING</span> TERMINAL
        </h1>
        <div className="flex gap-1 w-full md:w-auto overflow-x-auto hide-scrollbar pb-1">
          <button
            onClick={() => setActiveTab('globalnews')}
            className={`px-4 py-1 font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'globalnews' 
                ? 'bg-indigo-900/30 border-indigo-700 text-indigo-400' 
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            글로벌 뉴스 중요도 랭킹
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-4 py-1 font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'search' 
                ? 'bg-gray-800 border-gray-600 text-white' 
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            종목조회 (Search)
          </button>
          <button
            onClick={() => setActiveTab('price')}
            className={`px-4 py-1 font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'price' 
                ? 'bg-gray-800 border-gray-600 text-white' 
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            시세/차트 (Prices)
          </button>
          <button
            onClick={() => setActiveTab('scanner')}
            className={`px-4 py-1 font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'scanner' 
                ? 'bg-blue-900/30 border-blue-700 text-blue-400' 
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            DB크롤링 스캐너
          </button>
          <button 
            onClick={() => setActiveTab('etf')} 
            className={`px-4 py-3 font-bold transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'etf' ? 'text-white border-b-2 border-indigo-500' : 'text-gray-400 hover:text-white'}`}
          >
            ETF/ETN 맵
          </button>
          <button 
            onClick={() => setActiveTab('etf_strategy')} 
            className={`px-4 py-3 font-bold transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'etf_strategy' ? 'text-white border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'}`}
          >
            ETF 투자전략
          </button>
          <button 
            onClick={() => setActiveTab('etf_history')} 
            className={`px-4 py-3 font-bold transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'etf_history' ? 'text-white border-b-2 border-indigo-300' : 'text-gray-400 hover:text-white'}`}
          >
            시뮬레이션 히스토리
          </button>
          <button onClick={() => setActiveTab('target')} className={`px-4 py-3 font-bold transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'target' ? 'text-white border-b-2 border-red-500' : 'text-gray-400 hover:text-white'}`}>AI 목표가/수익률</button>
          <button onClick={() => setActiveTab('heatmap')} className={`px-4 py-3 font-bold transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'heatmap' ? 'text-white border-b-2 border-green-500' : 'text-gray-400 hover:text-white'}`}>AI 힛맵</button>
          <button onClick={() => setActiveTab('trending')} className={`px-4 py-3 font-bold transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'trending' ? 'text-white border-b-2 border-yellow-500' : 'text-gray-400 hover:text-white'}`}>🔥 핫 주식 (Trending)</button>
          <button
            onClick={() => setActiveTab('sector')}
            className={`px-4 py-1 font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'sector' 
                ? 'bg-blue-900/30 border-blue-700 text-blue-500' 
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            업종 분석 (Sectors)
          </button>
          <button
            onClick={() => setActiveTab('order')}
            className={`px-4 py-1 font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'order' 
                ? 'bg-red-900/30 border-red-700 text-red-500' 
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            매수주문 (Orders)
          </button>
          <button
            onClick={() => setActiveTab('competitor')}
            className={`px-4 py-1 font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'competitor' 
                ? 'bg-yellow-900/30 border-yellow-700 text-yellow-500' 
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            경쟁업체 분석 (Competitors)
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`px-4 py-1 font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'global' 
                ? 'bg-orange-900/30 border-orange-700 text-orange-500' 
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            글로벌 지수 (Global)
          </button>
          <button
            onClick={() => setActiveTab('derivatives')}
            className={`px-4 py-1 font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'derivatives' 
                ? 'bg-teal-900/30 border-teal-700 text-teal-400' 
                : 'bg-transparent border-transparent text-gray-500 hover:text-gray-300'
            }`}
          >
            파생/수급 랩
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto lg:overflow-hidden relative">
        {activeTab === 'search' ? (
          <StockDashboard stocks={stocks} globalStocks={globalData?.stocks || []} globalSearchTicker={globalSearchTicker} setGlobalSearchTicker={setGlobalSearchTicker} />
        ) : activeTab === 'price' ? (
          <PriceView stocks={stocks} globalStocks={globalData.stocks} news={news} forceCategory={forceCategory} globalSearchTicker={globalSearchTicker} setGlobalSearchTicker={setGlobalSearchTicker} />
        ) : activeTab === 'sector' ? (
          <SectorAnalysis />
        ) : activeTab === 'target' ? (
          <TargetAnalysis stocks={stocks} globalStocks={globalData.stocks} globalSearchTicker={globalSearchTicker} setGlobalSearchTicker={setGlobalSearchTicker} />
        ) : activeTab === 'order' ? (
          <OrderWindow stocks={stocks} />
        ) : activeTab === 'competitor' ? (
          <CompetitorAnalysis />
        ) : activeTab === 'global' ? (
          <GlobalIndicesView />
        ) : activeTab === 'trending' ? (
          <TrendingStocksView />
        ) : activeTab === 'etf' ? (
          <ETFView />
        ) : activeTab === 'etf_strategy' ? (
          <ETFStrategyView />
        ) : activeTab === 'etf_history' ? (
          <ETFSimulationHistoryView />
        ) : activeTab === 'derivatives' ? (
          <DerivativesView />
        ) : activeTab === 'scanner' ? (
          <MarketScannerView />
        ) : activeTab === 'globalnews' ? (
          <GlobalNewsRankingView onNavigateToSearch={(ticker) => { setGlobalSearchTicker(ticker); setActiveTab('search'); }} />
        ) : (
          <HeatmapView />
        )}
      </main>
      
      {/* Footer Status Bar */}
      <footer className="h-6 bg-[#111] border-t border-gray-800 flex items-center justify-between px-4 text-[10px] text-gray-500 font-mono">
        <div>CONNECTED | LIVE DATA</div>
        <div>MARKET OPEN</div>
      </footer>
    </div>
  );
}
