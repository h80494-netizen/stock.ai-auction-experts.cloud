"use client";

import React, { useState, useEffect } from 'react';
import TradingViewWidget from './TradingViewWidget';
import ValuationView from './ValuationView';

export default function TickerDetailsModal({ ticker, onClose }: { ticker: string, onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [news, setNews] = useState<any[]>([]);
  const [loadingNews, setLoadingNews] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'valuation'>('summary');

  useEffect(() => {
    const fetchFundamentals = async () => {
      try {
        const res = await fetch(`/api/competitors/stock/${encodeURIComponent(ticker)}/fundamentals`);
        if (!res.ok) throw new Error(res.statusText || 'API Error');
        const json = await res.json();
        setData(json);
        
        // Fetch news using the name
        setLoadingNews(true);
        const name = json.name || '';
        fetch(`/api/competitors/stock/${encodeURIComponent(ticker)}/news?name=${encodeURIComponent(name)}`)
          .then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText)))
          .then(n => {
            setNews(n || []);
            setLoadingNews(false);
          })
          .catch(() => setLoadingNews(false));
      } catch (e) {
        console.error("Error fetching fundamentals", e);
      } finally {
        setLoading(false);
      }
    };
    fetchFundamentals();
  }, [ticker]);

  if (!ticker) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-[#111] border border-gray-700 w-full max-w-3xl rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-gray-800">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold">{data?.name || ticker} <span className="text-gray-500 text-sm ml-2">{ticker}</span></h2>
            <div className="flex bg-gray-900 rounded overflow-hidden border border-gray-700">
              <button 
                onClick={() => setActiveTab('summary')}
                className={`px-4 py-1 text-xs font-bold ${activeTab === 'summary' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
              >
                요약
              </button>
              <button 
                onClick={() => setActiveTab('valuation')}
                className={`px-4 py-1 text-xs font-bold ${activeTab === 'valuation' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
              >
                가치평가(RIM)
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto flex-1">
          {activeTab === 'valuation' ? (
            <ValuationView ticker={ticker} name={data?.name || ticker} />
          ) : loading ? (
            <div className="animate-pulse space-y-4">
              <div className="h-24 bg-gray-800 rounded w-full"></div>
              <div className="h-48 bg-gray-800 rounded w-full"></div>
            </div>
          ) : data?.error ? (
            <div className="text-red-500 p-4 border border-red-800 bg-red-900/20 rounded">
              Error loading data for {ticker}: {data.error}
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Interactive Price Chart */}
              <div className="h-64 md:h-80 w-full mb-6 rounded overflow-hidden">
                <TradingViewWidget symbol={ticker} defaultInterval="1" />
              </div>

              {/* Investment Indicators */}
              <div>
                <h3 className="text-lg font-bold border-b border-gray-800 pb-2 mb-3">투자 지표 (Investment Indicators)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#0a0a0a] p-3 border border-gray-800 rounded text-center">
                    <div className="text-xs text-gray-500 mb-1">ROE</div>
                    <div className="text-lg font-bold text-white">{data.roe}</div>
                  </div>
                  <div className="bg-[#0a0a0a] p-3 border border-gray-800 rounded text-center">
                    <div className="text-xs text-gray-500 mb-1">PER</div>
                    <div className="text-lg font-bold text-white">{data.per}</div>
                  </div>
                  <div className="bg-[#0a0a0a] p-3 border border-gray-800 rounded text-center">
                    <div className="text-xs text-gray-500 mb-1">PBR</div>
                    <div className="text-lg font-bold text-white">{data.pbr}</div>
                  </div>
                  <div className="bg-[#0a0a0a] p-3 border border-gray-800 rounded text-center">
                    <div className="text-xs text-gray-500 mb-1">BPS</div>
                    <div className="text-lg font-bold text-white">{data.bps}</div>
                  </div>
                </div>
              </div>

              {/* Quarterly Financials */}
              <div>
                <h3 className="text-lg font-bold border-b border-gray-800 pb-2 mb-3">최근 실적 (Quarterly Financials)</h3>
                {data.financials && data.financials.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-gray-800/50">
                          <th className="p-2 border-b border-gray-800">Date</th>
                          <th className="p-2 border-b border-gray-800 text-right">Revenue</th>
                          <th className="p-2 border-b border-gray-800 text-right">Net Income</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.financials.map((q: any, i: number) => (
                          <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                            <td className="p-2 text-gray-300">{q.date}</td>
                            <td className="p-2 text-right font-mono">{typeof q.revenue === 'number' ? q.revenue.toLocaleString() : q.revenue}</td>
                            <td className={`p-2 text-right font-mono ${typeof q.netIncome === 'number' && q.netIncome < 0 ? 'text-blue-400' : 'text-red-400'}`}>
                              {typeof q.netIncome === 'number' ? q.netIncome.toLocaleString() : q.netIncome}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-gray-500 text-sm">실적 데이터가 없습니다 (No financial data available).</div>
                )}
              </div>

              {/* Estimates */}
              <div>
                <h3 className="text-lg font-bold border-b border-gray-800 pb-2 mb-3">애널리스트 예측치 (Estimates)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-[#0a0a0a] p-3 border border-gray-800 rounded">
                    <div className="text-xs text-gray-500 mb-1">투자의견 (Rec)</div>
                    <div className="font-bold uppercase text-yellow-500">{data.estimates?.recommendationKey?.replace('_', ' ') || 'N/A'}</div>
                  </div>
                  <div className="bg-[#0a0a0a] p-3 border border-gray-800 rounded">
                    <div className="text-xs text-gray-500 mb-1">목표가 (Mean)</div>
                    <div className="font-bold text-white">{data.estimates?.targetMeanPrice}</div>
                  </div>
                  <div className="bg-[#0a0a0a] p-3 border border-gray-800 rounded">
                    <div className="text-xs text-gray-500 mb-1">최고 목표가 (High)</div>
                    <div className="font-bold text-red-500">{data.estimates?.targetHighPrice}</div>
                  </div>
                  <div className="bg-[#0a0a0a] p-3 border border-gray-800 rounded">
                    <div className="text-xs text-gray-500 mb-1">최저 목표가 (Low)</div>
                    <div className="font-bold text-blue-500">{data.estimates?.targetLowPrice}</div>
                  </div>
                </div>
              </div>

              {/* Target Price History */}
              {data.target_history && data.target_history.length > 0 && (
                <div>
                  <h3 className="text-lg font-bold border-b border-gray-800 pb-2 mb-3">목표가 추이 (Target Price History)</h3>
                  <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead className="sticky top-0 bg-gray-900 shadow">
                        <tr className="bg-gray-800/50">
                          <th className="p-2 border-b border-gray-800">Date</th>
                          <th className="p-2 border-b border-gray-800">Target Price</th>
                          <th className="p-2 border-b border-gray-800">Brokerage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.target_history].reverse().map((t: any, i: number) => {
                          const isSameDay = i > 0 && [...data.target_history].reverse()[i - 1].time === t.time;
                          return (
                            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                              <td className="p-2 text-gray-300">
                                {isSameDay ? <span className="text-gray-600">↳ 동시 발표</span> : t.time}
                              </td>
                              <td className="p-2 font-mono text-yellow-500">
                                {t.text.replace('목표가:', '').replace('최근', '').trim()}
                              </td>
                              <td className="p-2 text-gray-400">
                                {t.broker || 'N/A'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Specific Stock News (Orders, Earnings, Surge) */}
              <div>
                <h3 className="text-lg font-bold border-b border-gray-800 pb-2 mb-3 text-yellow-500">주요 모멘텀 뉴스 (수주, 실적, 급등)</h3>
                {loadingNews ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-16 bg-gray-800 rounded"></div>
                    <div className="h-16 bg-gray-800 rounded"></div>
                  </div>
                ) : news && news.length > 0 ? (
                  <div className="space-y-3">
                    {news.map((n: any, i: number) => {
                      const dateStr = new Date(n.providerPublishTime).toLocaleDateString() !== 'Invalid Date' 
                        ? new Date(n.providerPublishTime).toLocaleDateString() 
                        : n.providerPublishTime;
                      return (
                        <a key={i} href={n.link} target="_blank" rel="noopener noreferrer" className="block bg-[#0a0a0a] border border-gray-800 p-3 rounded hover:border-gray-500 hover:bg-gray-800/50 transition-colors">
                          <div className="text-sm font-bold text-gray-200 mb-1">{n.title}</div>
                          <div className="flex justify-between items-center text-[10px] text-gray-500">
                            <span className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-400">{n.publisher}</span>
                            <span>{dateStr}</span>
                          </div>
                        </a>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-gray-500 text-sm">해당 종목의 최근 수주/실적/급등 뉴스가 없습니다.</div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
