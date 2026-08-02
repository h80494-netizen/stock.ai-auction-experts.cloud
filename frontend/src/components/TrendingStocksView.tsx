"use client";

import React, { useState, useEffect } from 'react';

export default function TrendingStocksView() {
  const [activeRegion, setActiveRegion] = useState<'KR' | 'US' | 'JP' | 'CN'>('KR');
  const [trendingData, setTrendingData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedStock, setSelectedStock] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'twitter' | 'reddit' | 'xueqiu'>('twitter');
  const [socialData, setSocialData] = useState<{ [key: string]: any[] }>({});
  const [socialLoading, setSocialLoading] = useState(false);

  const fetchSocialData = (symbol: string, platform: string) => {
    setSocialLoading(true);
    fetch(`/api/social/${platform}/${symbol}`)
      .then(res => res.ok ? res.json() : Promise.reject(new Error(res.statusText)))
      .then(data => {
        setSocialData(prev => ({ ...prev, [platform]: Array.isArray(data) ? data : [] }));
      })
      .catch(e => console.error(e))
      .finally(() => setSocialLoading(false));
  };

  const handleRowClick = (stock: any) => {
    setSelectedStock(stock);
    setSocialData({}); // reset data
    setActiveTab('twitter');
    fetchSocialData(stock.symbol, 'twitter');
  };

  const regionInfo = {
    'KR': { name: '대한민국', source: '네이버 증권 인기검색' },
    'US': { name: '미국', source: 'Yahoo Finance Trending' },
    'JP': { name: '일본', source: 'Yahoo Japan (주요 액티브)' },
    'CN': { name: '중국', source: 'Baidu/Sina (주요 ADR)' }
  };

  useEffect(() => {
    setLoading(true);
    fetch(`/api/trending?region=${activeRegion}`)
      .then(res => res.ok ? res.json() : Promise.reject(res.statusText || 'API Error'))
      .then(data => {
        setTrendingData(Array.isArray(data) ? data : []);
      })
      .catch(e => console.error('Trending API Error:', String(e)))
      .finally(() => setLoading(false));
  }, [activeRegion]);

  return (
    <div className="flex h-[calc(100vh-120px)] w-full bg-black text-gray-200">
      <div className="w-full flex flex-col p-4 h-full">
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-yellow-500 mb-1">🔥 핫 주식 (글로벌 트렌딩)</h2>
          <p className="text-gray-400 text-sm">전일과 오늘 네이버증권, 야후, 바이두 등에 가장 많이 회자된 인기 종목</p>
        </div>

        {/* Region Tabs */}
        <div className="flex gap-2 mb-4 border-b border-gray-800 pb-2">
          {(Object.keys(regionInfo) as Array<keyof typeof regionInfo>).map(region => (
            <button
              key={region}
              onClick={() => setActiveRegion(region)}
              className={`px-6 py-2 font-bold rounded-t-lg transition-colors ${
                activeRegion === region 
                  ? 'bg-gray-800 text-white border-t border-l border-r border-gray-700' 
                  : 'bg-black text-gray-500 hover:text-gray-300'
              }`}
            >
              {regionInfo[region].name}
            </button>
          ))}
        </div>

        {/* Data Table */}
        <div className="flex-1 border border-gray-800 rounded bg-[#0a0a0a] overflow-hidden flex flex-col">
          <div className="px-4 py-3 bg-gray-900 border-b border-gray-800 flex justify-between items-center">
            <span className="font-bold text-gray-300">
              {regionInfo[activeRegion].name} 핫 종목 리스트
            </span>
            <span className="text-xs font-mono text-gray-500 bg-black px-2 py-1 rounded">
              출처: {regionInfo[activeRegion].source}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center items-center h-full text-gray-500">
                <div className="animate-pulse">데이터를 불러오는 중입니다...</div>
              </div>
            ) : trendingData.length > 0 ? (
              <table className="w-full text-sm text-left">
                <thead className="bg-[#1a1a1a] text-gray-400 border-b border-gray-800 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 font-medium w-16 text-center">순위</th>
                    <th className="px-4 py-3 font-medium w-32">심볼</th>
                    <th className="px-4 py-3 font-medium">종목명</th>
                    <th className="px-4 py-3 font-medium text-right">현재가</th>
                    <th className="px-4 py-3 font-medium text-right">등락률</th>
                    <th className="px-4 py-3 font-medium text-right">거래량</th>
                  </tr>
                </thead>
                <tbody>
                  {trendingData.map((item, i) => {
                    const isPositive = item.changePct > 0;
                    const isNegative = item.changePct < 0;
                    const colorClass = isPositive ? 'text-red-400' : (isNegative ? 'text-blue-400' : 'text-gray-400');
                    const sign = isPositive ? '+' : '';

                    return (
                      <tr key={item.symbol + i} 
                          onClick={() => handleRowClick(item)}
                          className={`border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer ${i % 2 === 0 ? 'bg-[#0f0f0f]' : 'bg-[#0a0a0a]'}`}>
                        <td className="px-4 py-3 text-center font-bold text-gray-500">{i + 1}</td>
                        <td className="px-4 py-3 font-mono text-gray-400">{item.symbol}</td>
                        <td className="px-4 py-3 font-bold text-gray-200">{item.name}</td>
                        <td className="px-4 py-3 text-right font-mono text-gray-300">
                          {item.price?.toLocaleString() || '-'}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono font-bold ${colorClass}`}>
                          {sign}{item.changePct !== undefined ? item.changePct : '-'}%
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-gray-400">
                          {item.volume?.toLocaleString() || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="flex justify-center items-center h-full text-gray-500">
                조회된 핫 종목 데이터가 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Social Info Modal */}
      {selectedStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-[#111] border border-gray-800 rounded-xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl">
            
            {/* Header */}
            <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-[#1a1a1a]">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                글로벌 소셜 반응: {selectedStock.name} ({selectedStock.symbol}) 
              </h3>
              <button onClick={() => setSelectedStock(null)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
            </div>
            
            {/* Tabs */}
            <div className="flex border-b border-gray-800 bg-[#0f0f0f]">
              <button 
                onClick={() => { setActiveTab('twitter'); if(!socialData['twitter']) fetchSocialData(selectedStock.symbol, 'twitter'); }}
                className={`flex-1 py-3 font-bold transition-colors ${activeTab === 'twitter' ? 'text-blue-400 border-b-2 border-blue-400 bg-[#1a1a1a]' : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'}`}>
                𝕏 (Twitter)
              </button>
              <button 
                onClick={() => { setActiveTab('reddit'); if(!socialData['reddit']) fetchSocialData(selectedStock.symbol, 'reddit'); }}
                className={`flex-1 py-3 font-bold transition-colors ${activeTab === 'reddit' ? 'text-orange-500 border-b-2 border-orange-500 bg-[#1a1a1a]' : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'}`}>
                🤖 Reddit
              </button>
              <button 
                onClick={() => { setActiveTab('xueqiu'); if(!socialData['xueqiu']) fetchSocialData(selectedStock.symbol, 'xueqiu'); }}
                className={`flex-1 py-3 font-bold transition-colors ${activeTab === 'xueqiu' ? 'text-blue-600 border-b-2 border-blue-600 bg-[#1a1a1a]' : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a1a]'}`}>
                ❄️ Xueqiu (설구)
              </button>
            </div>

            {/* Content Area */}
            <div className="p-4 overflow-y-auto flex-1">
              {socialLoading && (!socialData[activeTab] || socialData[activeTab].length === 0) ? (
                <div className="flex justify-center items-center h-40">
                  <div className="animate-pulse text-gray-400 font-bold">데이터를 불러오는 중...</div>
                </div>
              ) : socialData[activeTab] && socialData[activeTab].length > 0 ? (
                <div className="flex flex-col gap-3">
                  {socialData[activeTab].map((post: any) => (
                    <div key={post.id} className="bg-[#0a0a0a] border border-gray-800 rounded-lg p-4 hover:border-gray-600 transition-colors">
                      <div className="flex justify-between items-center mb-2">
                        <span className={`font-bold ${activeTab === 'reddit' ? 'text-orange-400' : activeTab === 'xueqiu' ? 'text-blue-500' : 'text-gray-200'}`}>
                          @{post.author}
                        </span>
                        <span className="text-xs text-gray-500">{post.timestamp}</span>
                      </div>
                      <p className="text-gray-300 text-sm mb-2 leading-relaxed whitespace-pre-wrap">{post.text}</p>
                      <a href={post.link} target="_blank" rel="noreferrer" className="text-blue-500 text-xs hover:underline">
                        원문 보기
                      </a>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex justify-center items-center h-40 text-gray-500">
                  해당 플랫폼에 조회된 관련 반응이 없습니다.
                </div>
              )}
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
