'use client';
import React, { useState } from 'react';

export default function TetrisScreenerView({ setGlobalSearchTicker, globalStocks, stocks }: any) {
  const [minRoe, setMinRoe] = useState<number>(10);
  const [results, setResults] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dart/screener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ min_roe: minRoe }),
      });
      if (!res.ok) throw new Error('서버 응답 오류');
      const data = await res.json();
      if (data.success) {
        setResults(data.tickers || []);
      } else {
        throw new Error(data.error || '필터링 실패');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  const getStockName = (ticker: string) => {
    const combined = [...(globalStocks || []), ...(stocks || [])];
    const s = combined.find((x: any) => x.ticker === ticker || x.ticker.includes(ticker));
    return s ? s.name : ticker;
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] text-gray-200 p-6 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-6 text-white border-b border-gray-800 pb-2">종목 필터링 (Tetris)</h2>
      
      <div className="bg-[#111] border border-gray-800 p-6 rounded mb-6 flex flex-col md:flex-row gap-6 items-center">
        <div className="flex flex-col gap-2 flex-1 w-full">
          <label className="text-gray-400 font-bold">최소 ROE (%)</label>
          <div className="flex items-center gap-2">
            <input 
              type="range" 
              min="-20" max="50" step="1" 
              value={minRoe} 
              onChange={(e) => setMinRoe(Number(e.target.value))} 
              className="w-full accent-indigo-500"
            />
            <span className="font-mono bg-gray-800 px-3 py-1 rounded w-16 text-center">{minRoe}%</span>
          </div>
        </div>
        
        <div className="flex flex-col gap-2 flex-1 w-full text-gray-500 text-sm">
          <p>※ 추가 필터 조건 (PBR, PER, EPS 성장률 등)은 향후 DB 데이터 연동 시 확장될 예정입니다.</p>
        </div>

        <button 
          onClick={handleSearch}
          disabled={loading}
          className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-8 rounded transition-colors whitespace-nowrap shadow-lg shadow-indigo-900/20"
        >
          {loading ? '검색 중...' : '조건 검색'}
        </button>
      </div>

      <div className="bg-[#111] border border-gray-800 p-4 rounded flex-1">
        <h3 className="font-bold mb-4 border-b border-gray-800 pb-2 flex justify-between">
          <span>검색 결과</span>
          <span className="text-indigo-400">{results.length} 종목</span>
        </h3>
        
        {error && <div className="text-red-400 mb-4">{error}</div>}
        
        {results.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {results.map((ticker) => (
              <div 
                key={ticker} 
                onClick={() => {
                  if (setGlobalSearchTicker) setGlobalSearchTicker(ticker);
                }}
                className="bg-gray-800/50 hover:bg-indigo-900/40 border border-gray-700 hover:border-indigo-500 p-3 rounded cursor-pointer transition-all flex flex-col gap-1 items-center justify-center text-center group"
              >
                <div className="font-bold text-white group-hover:text-indigo-300">{getStockName(ticker)}</div>
                <div className="text-xs text-gray-500">{ticker}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-600">
            {loading ? '데이터를 불러오는 중입니다...' : '검색 결과가 없습니다. 조건을 변경해보세요.'}
          </div>
        )}
      </div>
    </div>
  );
}
