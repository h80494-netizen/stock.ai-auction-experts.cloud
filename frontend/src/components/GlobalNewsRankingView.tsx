import React, { useState, useEffect } from 'react';

interface ImpactFactor {
  category: string; // e.g., Investment, Demand, Supply, Net Profit, Price Movement
  score: number;
}

interface NewsItem {
  id: string;
  title: string;
  source: string; // The specific media source e.g. "Forbes", "Naver"
  domain: string;
  date: string;
  isRealTime: boolean; // Flag for real-time news
  importance_score: number;
  factors: ImpactFactor[];
  summary: string;
  url: string;
}

interface RankedStock {
  ticker: string;
  name: string;
  market: string; // KR, US, JP, CN
  total_score: number;
  news_count: number;
  decisive_comment?: string;
  top_news: NewsItem[];
}

interface GlobalNewsRankingViewProps {
  onNavigateToSearch?: (ticker: string) => void;
}

export default function GlobalNewsRankingView({ onNavigateToSearch }: GlobalNewsRankingViewProps) {
  const [rankedStocks, setRankedStocks] = useState<RankedStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [expandedStocks, setExpandedStocks] = useState<Record<string, boolean>>({});

  const toggleNews = (ticker: string) => {
    setExpandedStocks(prev => ({...prev, [ticker]: !prev[ticker]}));
  };

  useEffect(() => {
    const fetchRanking = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/news/ranking');
        if (res.ok) {
          const data = await res.json();
          setRankedStocks(data);
        } else {
          console.error("Failed to fetch news ranking");
        }
      } catch (e) {
        console.error("Error fetching news ranking:", e);
      } finally {
        setLastUpdated(new Date().toLocaleTimeString());
        setLoading(false);
      }
    };
    
    fetchRanking();
  }, []);

  const getMarketColor = (market: string) => {
    switch(market) {
      case 'KR': return 'bg-blue-900/40 text-blue-300 border-blue-700/50';
      case 'US': return 'bg-purple-900/40 text-purple-300 border-purple-700/50';
      case 'JP': return 'bg-red-900/40 text-red-300 border-red-700/50';
      case 'CN': return 'bg-orange-900/40 text-orange-300 border-orange-700/50';
      default: return 'bg-gray-800 text-gray-300 border-gray-600';
    }
  };

  return (
    <div className="p-4 bg-[#0a0a0a] min-h-full text-gray-200">
      <div className="flex justify-between items-end border-b border-gray-800 pb-2 mb-4">
        <div>
          <h2 className="text-2xl font-black text-indigo-400">Global News Importance Ranking (Top 100)</h2>
          <p className="text-sm text-gray-500">한국, 미국, 일본, 중국 주식 대상. 실시간 주가 변동성(급등/급락) 가중치 반영.</p>
        </div>
        <div className="text-xs text-gray-500">
          Last Updated: {lastUpdated || 'Loading...'}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-500"></div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 h-full">
          <div className="flex gap-2">
            {['ALL', 'KR', 'US', 'JP', 'CN'].map(market => (
              <button
                key={market}
                onClick={() => setActiveFilter(market)}
                className={`px-4 py-1.5 rounded-full text-sm font-bold transition-colors ${activeFilter === market ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
              >
                {market === 'ALL' ? '전체' : market === 'KR' ? '한국' : market === 'US' ? '미국' : market === 'JP' ? '일본' : '중국'}
              </button>
            ))}
          </div>
          <div className="space-y-6 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
            {rankedStocks.filter(stock => activeFilter === 'ALL' || stock.market === activeFilter).map((stock, idx) => (
            <div key={`${stock.ticker}_${idx}`} className="bg-[#111] border border-gray-800 rounded-lg p-4 shadow-lg hover:border-gray-600 transition-colors">
              <div className="flex justify-between items-center mb-3">
                <div 
                    className="flex items-center gap-3 cursor-pointer hover:bg-gray-800/50 p-1 rounded transition-colors flex-1"
                    onClick={() => onNavigateToSearch && onNavigateToSearch(stock.ticker)}
                  >
                  <div className={`w-10 h-10 flex items-center justify-center rounded font-black text-xl ${idx < 3 ? 'bg-yellow-600/20 text-yellow-500 border border-yellow-600/50' : 'bg-gray-800 text-gray-400'}`}>
                    {idx + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-xl font-bold text-white hover:text-indigo-300">{stock.name}</h3>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getMarketColor(stock.market)} font-bold`}>
                        {stock.market}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500 font-mono">{stock.ticker}</span>
                  </div>
                </div>
                <div className="text-right ml-4">
                  <div className="text-2xl font-bold text-indigo-400">{stock.total_score.toFixed(1)} <span className="text-sm text-gray-500 font-normal">pts</span></div>
                  <div className="text-xs text-gray-500">관련 파급 기사 {stock.news_count}건</div>
                </div>
              </div>
              
              {stock.decisive_comment && (
                <div 
                  className="bg-indigo-900/20 border border-indigo-800/50 rounded p-3 mb-2 cursor-pointer hover:bg-indigo-900/40 transition-colors"
                  onClick={() => toggleNews(stock.ticker)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-indigo-400 font-bold">💡 AI 분석 코멘트:</span>
                    <span className="text-gray-200 text-sm font-medium">{stock.decisive_comment}</span>
                    <span className="ml-auto text-xs text-indigo-500 font-bold">
                      {expandedStocks[stock.ticker] ? '▲ 뉴스 숨기기' : '▼ 관련 뉴스 보기'}
                    </span>
                  </div>
                </div>
              )}

              {expandedStocks[stock.ticker] && (
                <div className="space-y-3 mt-4">
                  {stock.top_news.map(news => (
                    <div key={news.id} className={`bg-[#161616] border ${news.isRealTime ? 'border-red-900/50' : 'border-gray-800'} rounded p-3`}>
                      <div className="flex justify-between items-start">
                        <button 
                          onClick={(e) => {
                            if (onNavigateToSearch) {
                              e.preventDefault();
                              onNavigateToSearch(stock.ticker);
                            }
                          }}
                          className="font-bold text-blue-400 hover:underline flex-1 pr-4 text-left cursor-pointer"
                        >
                        {news.isRealTime && <span className="text-red-500 mr-2 animate-pulse">⚡ BREAKING</span>}
                        {news.title}
                      </button>
                      <div className="text-right whitespace-nowrap">
                        <div className="text-yellow-500 font-bold text-sm bg-yellow-900/20 px-2 py-0.5 rounded border border-yellow-700/30">
                          Score {news.importance_score}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 mt-2 text-xs">
                      <span className="text-gray-400 font-mono bg-[#222] px-1.5 py-0.5 rounded border border-gray-700">Source: {news.source} ({news.domain})</span>
                      <span className="text-gray-500">{new Date(news.date).toLocaleString()}</span>
                    </div>

                    <div className="mt-3 flex gap-4">
                      <div className="flex-1">
                        <div className="text-[10px] text-gray-500 mb-1 font-bold">항목별 영향도 (Impact Factors)</div>
                        <div className="flex gap-2 flex-wrap">
                          {news.factors.map(f => (
                            <span key={f.category} className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${
                              f.category.includes("Real-time") 
                                ? 'bg-red-900/40 text-red-300 border-red-800' 
                                : 'bg-indigo-900/40 text-indigo-300 border-indigo-800/50'
                            }`}>
                              <span>{f.category}</span>
                              <span className="font-bold text-white bg-black/30 px-1 rounded-sm">{f.score}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    
                    <p className="mt-2 text-gray-400 text-xs line-clamp-2 border-l-2 border-gray-700 pl-2">{news.summary}</p>
                  </div>
                ))}
              </div>
              )}
            </div>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}
