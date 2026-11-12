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
import TetrisScreenerView from '@/components/TetrisScreenerView';
import FCFComparisonView from '@/components/FCFComparisonView';
import DartLabFinancialView from '@/components/DartLabFinancialView';
import AnalystReportsView from '@/components/AnalystReportsView';
import FuturesSimulationView from '@/components/FuturesSimulationView';
import PrivateAccessGate from '@/components/PrivateAccessGate';
import AdminApprovalModal from '@/components/AdminApprovalModal';
import ChangePasswordModal from '@/components/ChangePasswordModal';

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authChecked, setAuthChecked] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [userName, setUserName] = useState<string>('');
  const [showAdminModal, setShowAdminModal] = useState<boolean>(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState<boolean>(false);
  const [showMobileMenuDrawer, setShowMobileMenuDrawer] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<'search' | 'price' | 'dartlab' | 'reports' | 'order' | 'competitor' | 'sector' | 'target' | 'heatmap' | 'global' | 'trending' | 'etf' | 'derivatives' | 'futures_sim' | 'scanner' | 'globalnews' | 'etf_strategy' | 'etf_history' | 'tetris' | 'fcf_compare'>('dartlab');
  const [etfWeights, setEtfWeights] = useState({ w1: 0.5, w5: 0.3, w20: 0.2 });
  const [globalSearchTicker, setGlobalSearchTicker] = useState("");
  const [stocks, setStocks] = useState<any[]>([]);
  const [globalData, setGlobalData] = useState<any>({ indices: [], stocks: [] });
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // 초기 인증 상태 확인 (sessionStorage 사용: 브라우저 닫으면 세션 종료)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 레거시 localStorage 데이터 정리
      localStorage.removeItem('stock_terminal_auth');

      const auth = sessionStorage.getItem('stock_terminal_auth');
      if (auth === 'true') {
        setIsAuthenticated(true);
        if (sessionStorage.getItem('stock_terminal_is_admin') === 'true') {
          setIsAdmin(true);
        }
        setUserName(sessionStorage.getItem('stock_terminal_user_name') || '');
      }
    }
    setAuthChecked(true);
  }, []);

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

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070709] text-white font-sans">
        <div className="animate-pulse text-sm text-gray-400">보안 세션 확인 중...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <PrivateAccessGate
        onAuthenticate={() => {
          setIsAuthenticated(true);
          if (typeof window !== 'undefined') {
            if (sessionStorage.getItem('stock_terminal_is_admin') === 'true') {
              setIsAdmin(true);
            } else {
              setIsAdmin(false);
            }
            setUserName(sessionStorage.getItem('stock_terminal_user_name') || '');
          }
        }}
      />
    );
  }

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
      <nav className="h-auto min-h-14 bg-[#0a0a0a] border-b border-gray-800 flex flex-col md:flex-row items-start md:items-center justify-between px-3 md:px-4 py-2 relative z-30">
        <div className="flex items-center justify-between w-full md:w-auto mb-2 md:mb-0 shrink-0 gap-1.5 flex-wrap">
          <h1 className="text-base sm:text-xl font-black tracking-tighter mr-1">
            STOCK<span className="text-red-600">CODING</span> <span className="hidden xs:inline">TERMINAL</span>
          </h1>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* 오직 관리자(주인장)에게만 노출되는 승인 관리 버튼 */}
            {isAdmin && (
              <button
                onClick={() => setShowAdminModal(true)}
                title="회원 가입 및 비밀번호 승인 DB 관리 (관리자 전용)"
                className="px-2 py-1 text-[11px] bg-red-950/80 hover:bg-red-900 border border-red-500 text-red-200 hover:text-white rounded-lg transition-all flex items-center gap-1 shadow cursor-pointer font-bold animate-pulse"
              >
                <span>👑</span>
                <span className="hidden sm:inline">회원 승인 DB 관리</span>
                <span className="sm:hidden">승인관리</span>
              </button>
            )}

            {/* 모든 사용자 비밀번호 변경 버튼 */}
            <button
              onClick={() => setShowChangePasswordModal(true)}
              title="비밀번호 변경"
              className="px-2 py-1 text-[11px] bg-cyan-950/60 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-200 hover:text-white rounded-lg transition-all flex items-center gap-1 shadow-sm cursor-pointer font-semibold"
            >
              <span>🔑</span>
              <span className="hidden sm:inline">비밀번호 변경</span>
              <span className="sm:hidden">비번변경</span>
            </button>

            {/* 로그아웃 버튼 */}
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  sessionStorage.removeItem('stock_terminal_auth');
                  sessionStorage.removeItem('stock_terminal_is_admin');
                  sessionStorage.removeItem('stock_terminal_user_name');
                  localStorage.removeItem('stock_terminal_auth');
                }
                setIsAdmin(false);
                setIsAuthenticated(false);
              }}
              title="세션 종료 및 비밀번호 재인증"
              className="px-2 py-1 text-[11px] bg-gray-900 hover:bg-red-950/80 border border-gray-700 hover:border-red-700/60 text-gray-300 hover:text-red-200 rounded-lg transition-all flex items-center gap-1 shadow-sm cursor-pointer"
            >
              <span>🔒</span>
              <span className="font-semibold">로그아웃</span>
            </button>

            {/* 모바일 전체 메뉴 그리드 토글 버튼 */}
            <button
              onClick={() => setShowMobileMenuDrawer(v => !v)}
              className="md:hidden px-2.5 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 text-white rounded-lg font-extrabold flex items-center gap-1 shadow"
            >
              <span>{showMobileMenuDrawer ? '✕ 닫기' : '☰ 전체메뉴'}</span>
            </button>
          </div>
        </div>

        {/* 모바일 전체메뉴 2열 그리드 드로어 */}
        {showMobileMenuDrawer && (
          <div className="md:hidden w-full bg-[#0d111a] border border-gray-700 rounded-xl p-3 mb-2 shadow-2xl space-y-2">
            <div className="flex items-center justify-between border-b border-gray-800 pb-1.5">
              <span className="text-xs font-extrabold text-indigo-300">📱 전체 메뉴 한눈에 보기 (터치하여 즉시 이동)</span>
              <button
                onClick={() => setShowMobileMenuDrawer(false)}
                className="text-xs text-gray-400 hover:text-white px-2 py-0.5 rounded bg-gray-800"
              >
                닫기 ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-[60vh] overflow-y-auto">
              {[
                { id: 'futures_sim', label: '🚀 선물 10대모델 시뮬레이션', accent: 'border-emerald-500/60 text-emerald-200' },
                { id: 'order', label: '🚨 매수주문 (Orders)', accent: 'border-red-500/60 text-red-300' },
                { id: 'etf_strategy', label: '⚡ ETF 투자전략', accent: 'border-sky-500/50 text-sky-200' },
                { id: 'etf_history', label: '📜 ETF 시뮬레이션 히스토리', accent: 'border-sky-500/50 text-sky-200' },
                { id: 'etf', label: '🗺️ ETF/ETN 맵', accent: 'border-sky-500/50 text-sky-200' },
                { id: 'target', label: '🎯 AI 목표가/수익률', accent: 'border-rose-500/60 text-rose-200' },
                { id: 'dartlab', label: '📊 재무분석 (DartLab)', accent: 'border-indigo-500/60 text-indigo-200' },
                { id: 'reports', label: '📑 증권사 리포트 요약', accent: 'border-indigo-500/50 text-indigo-200' },
                { id: 'price', label: '📈 시세/차트 (Prices)', accent: 'border-gray-600 text-gray-200' },
                { id: 'search', label: '🔍 종목조회 (Search)', accent: 'border-gray-600 text-gray-200' },
                { id: 'heatmap', label: '🟩 AI 힛맵', accent: 'border-emerald-500/50 text-emerald-200' },
                { id: 'trending', label: '🔥 핫 주식 (Trending)', accent: 'border-amber-500/50 text-amber-200' },
                { id: 'globalnews', label: '🌐 글로벌 뉴스 랭킹', accent: 'border-indigo-500/50 text-indigo-200' },
                { id: 'sector', label: '🏭 업종 분석 (Sectors)', accent: 'border-blue-500/50 text-blue-200' },
                { id: 'competitor', label: '⚔️ 경쟁업체 분석', accent: 'border-amber-500/50 text-amber-200' },
                { id: 'fcf_compare', label: '💰 FCF 비교 (SEC/NVDA)', accent: 'border-emerald-500/50 text-emerald-200' },
                { id: 'global', label: '🌍 글로벌 지수', accent: 'border-orange-500/50 text-orange-200' },
                { id: 'derivatives', label: '📊 파생/수급 랩', accent: 'border-teal-500/50 text-teal-200' },
                { id: 'tetris', label: '🧱 종목 필터링 (Tetris)', accent: 'border-purple-500/50 text-purple-200' },
                { id: 'scanner', label: '🕷️ DB크롤링 스캐너', accent: 'border-blue-500/50 text-blue-200' },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    setShowMobileMenuDrawer(false);
                  }}
                  className={`px-3 py-2.5 rounded-lg text-left text-xs font-bold border transition-all truncate ${
                    activeTab === item.id
                      ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg'
                      : `bg-[#141926] ${item.accent} hover:bg-gray-800`
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 w-full md:flex-1 md:min-w-0 overflow-x-auto top-nav-scroll pb-2">
          <button
            onClick={() => setActiveTab('futures_sim')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'futures_sim'
                ? 'bg-emerald-900/50 border-emerald-500 text-emerald-200 shadow-md shadow-emerald-900/40'
                : 'bg-emerald-950/30 border-emerald-800/60 text-emerald-400 hover:text-emerald-200'
            }`}
          >
            🚀 선물 10대모델 시뮬레이션
          </button>
          <button
            onClick={() => setActiveTab('order')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'order' 
                ? 'bg-red-900/40 border-red-600 text-red-300 shadow-md shadow-red-900/30' 
                : 'bg-red-950/25 border-red-800/50 text-red-300 hover:text-red-200'
            }`}
          >
            🚨 매수주문 (Orders)
          </button>
          <button 
            onClick={() => setActiveTab('etf_strategy')} 
            className={`px-3 py-1.5 rounded font-bold text-xs border transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'etf_strategy' ? 'bg-indigo-900/50 border-indigo-400 text-white shadow-md shadow-indigo-900/30' : 'bg-indigo-950/25 border-indigo-800/50 text-indigo-300 hover:text-white'}`}
          >
            ⚡ ETF 투자전략
          </button>
          <button 
            onClick={() => setActiveTab('etf_history')} 
            className={`px-3 py-1.5 rounded font-bold text-xs border transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'etf_history' ? 'bg-indigo-900/40 border-indigo-300 text-white' : 'border-transparent text-gray-300 hover:text-white'}`}
          >
            시뮬레이션 히스토리
          </button>
          <button 
            onClick={() => setActiveTab('etf')} 
            className={`px-3 py-1.5 rounded font-bold text-xs border transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'etf' ? 'bg-indigo-900/40 border-indigo-500 text-white' : 'border-transparent text-gray-300 hover:text-white'}`}
          >
            ETF/ETN 맵
          </button>
          <button
            onClick={() => setActiveTab('target')}
            className={`px-3 py-1.5 rounded font-bold text-xs border transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'target' ? 'bg-rose-900/40 border-red-500 text-white' : 'border-transparent text-gray-300 hover:text-white'
            }`}
          >
            🎯 AI 목표가/수익률
          </button>
          <button
            onClick={() => setActiveTab('dartlab')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'dartlab' 
                ? 'bg-indigo-900/50 border-indigo-500 text-indigo-200 shadow-md shadow-indigo-900/30' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            📊 재무분석 (DartLab)
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'reports' 
                ? 'bg-indigo-900/50 border-indigo-500 text-indigo-200 shadow-md shadow-indigo-900/40' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            📑 증권사 리포트 요약
          </button>
          <button
            onClick={() => setActiveTab('price')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'price' 
                ? 'bg-gray-800 border-gray-600 text-white' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            시세/차트 (Prices)
          </button>
          <button
            onClick={() => setActiveTab('search')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'search' 
                ? 'bg-gray-800 border-gray-600 text-white' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            종목조회 (Search)
          </button>
          <button
            onClick={() => setActiveTab('globalnews')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'globalnews' 
                ? 'bg-indigo-900/40 border-indigo-600 text-indigo-300' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            글로벌 뉴스 중요도 랭킹
          </button>
          <button onClick={() => setActiveTab('heatmap')} className={`px-3 py-1.5 rounded font-bold text-xs border transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'heatmap' ? 'bg-emerald-900/40 border-green-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>AI 힛맵</button>
          <button onClick={() => setActiveTab('trending')} className={`px-3 py-1.5 rounded font-bold text-xs border transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'trending' ? 'bg-amber-900/40 border-yellow-500 text-white' : 'border-transparent text-gray-400 hover:text-white'}`}>🔥 핫 주식 (Trending)</button>
          <button
            onClick={() => setActiveTab('sector')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'sector' 
                ? 'bg-blue-900/30 border-blue-700 text-blue-400' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            업종 분석 (Sectors)
          </button>
          <button
            onClick={() => setActiveTab('competitor')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'competitor' 
                ? 'bg-yellow-900/30 border-yellow-700 text-yellow-400' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            경쟁업체 분석 (Competitors)
          </button>
          <button
            onClick={() => setActiveTab('fcf_compare')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'fcf_compare' 
                ? 'bg-emerald-900/30 border-emerald-700 text-emerald-400' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            FCF 비교 (SEC vs NVDA)
          </button>
          <button
            onClick={() => setActiveTab('global')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'global' 
                ? 'bg-orange-900/30 border-orange-700 text-orange-400' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            글로벌 지수 (Global)
          </button>
          <button
            onClick={() => setActiveTab('derivatives')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'derivatives' 
                ? 'bg-teal-900/30 border-teal-700 text-teal-400' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            파생/수급 랩
          </button>
          <button
            onClick={() => setActiveTab('tetris')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'tetris' 
                ? 'bg-purple-900/30 border-purple-700 text-purple-400' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            종목 필터링 (Tetris)
          </button>
          <button
            onClick={() => setActiveTab('scanner')}
            className={`px-3 py-1.5 rounded font-bold text-xs border whitespace-nowrap flex-shrink-0 ${
              activeTab === 'scanner' 
                ? 'bg-blue-900/30 border-blue-700 text-blue-400' 
                : 'bg-transparent border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            DB크롤링 스캐너
          </button>
          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('stock_terminal_auth');
              }
              setIsAuthenticated(false);
            }}
            title="보안 접속 잠금"
            className="hidden md:flex ml-2 px-3 py-1.5 text-xs bg-gray-900 hover:bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded transition-all items-center gap-1.5 whitespace-nowrap flex-shrink-0 cursor-pointer font-bold"
          >
            <span>🔒</span>
            <span>보안 잠금</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto lg:overflow-hidden relative pb-14 md:pb-0">
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
          <ETFStrategyView etfWeights={etfWeights} setEtfWeights={setEtfWeights} />
        ) : activeTab === 'etf_history' ? (
          <ETFSimulationHistoryView etfWeights={etfWeights} setEtfWeights={setEtfWeights} />
        ) : activeTab === 'derivatives' ? (
          <DerivativesView />
        ) : activeTab === 'futures_sim' ? (
          <FuturesSimulationView />
        ) : activeTab === 'scanner' ? (
          <MarketScannerView />
        ) : activeTab === 'globalnews' ? (
          <GlobalNewsRankingView onNavigateToSearch={(ticker) => { setGlobalSearchTicker(ticker); setActiveTab('search'); }} />
        ) : activeTab === 'tetris' ? (
          <TetrisScreenerView setGlobalSearchTicker={(ticker: string) => { setGlobalSearchTicker(ticker); setActiveTab('search'); }} globalStocks={globalData?.stocks || []} stocks={stocks} />
        ) : activeTab === 'fcf_compare' ? (
          <FCFComparisonView />
        ) : activeTab === 'dartlab' ? (
          <DartLabFinancialView initialTicker={globalSearchTicker || "005930"} onSelectTicker={(tk) => setGlobalSearchTicker(tk)} />
        ) : activeTab === 'reports' ? (
          <AnalystReportsView />
        ) : (
          <HeatmapView />
        )}
      </main>

      {/* 모바일 전용 하단 퀵 내비게이션 탭 바 (스마트폰 한 손 조작 최적화) */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0b0f19]/95 backdrop-blur-md border-t border-gray-800 grid grid-cols-5 h-14 px-1">
        {[
          { id: 'futures_sim', icon: '🚀', label: '선물모델' },
          { id: 'order', icon: '🚨', label: '매수주문' },
          { id: 'etf_strategy', icon: '⚡', label: 'ETF전략' },
          { id: 'target', icon: '🎯', label: 'AI목표가' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              setShowMobileMenuDrawer(false);
            }}
            className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${
              activeTab === tab.id && !showMobileMenuDrawer
                ? 'text-indigo-400 border-t-2 border-indigo-400 bg-indigo-950/30'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            <span className="text-sm leading-none">{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
        <button
          onClick={() => setShowMobileMenuDrawer(v => !v)}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors ${
            showMobileMenuDrawer
              ? 'text-amber-300 border-t-2 border-amber-400 bg-amber-950/30'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          <span className="text-sm leading-none">{showMobileMenuDrawer ? '✕' : '☰'}</span>
          <span>전체메뉴</span>
        </button>
      </div>
      
      {/* Footer Status Bar */}
      <footer className="hidden md:flex h-6 bg-[#111] border-t border-gray-800 items-center justify-between px-4 text-[10px] text-gray-500 font-mono">
        <div>CONNECTED | LIVE DATA</div>
        <div>MARKET OPEN</div>
      </footer>

      {/* 관리자 승인 관리 모달 (오직 관리자일 때만 렌더) */}
      {isAdmin && (
        <AdminApprovalModal
          isOpen={showAdminModal}
          onClose={() => setShowAdminModal(false)}
        />
      )}

      {/* 비밀번호 변경 모달 */}
      <ChangePasswordModal
        isOpen={showChangePasswordModal}
        onClose={() => setShowChangePasswordModal(false)}
        defaultName={userName}
      />
    </div>
  );
}
