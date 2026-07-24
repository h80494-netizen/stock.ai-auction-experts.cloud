import React, { useState, useEffect } from 'react';

export default function MarketScannerView() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/market/scan/status');
      if (!res.ok) throw new Error(res.statusText || 'API Error');
      const data = await res.json();
      setStatus(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      await fetch('/api/market/scan/start', { method: 'POST' });
      await fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      await fetch('/api/market/scan/stop', { method: 'POST' });
      await fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const progressPercent = status && status.total > 0 ? Math.round((status.current / status.total) * 100) : 0;

  return (
    <div className="p-6 bg-black text-white min-h-screen">
      <h2 className="text-2xl font-bold mb-6 text-yellow-500">Naver Finance Market Scanner</h2>
      
      <div className="bg-[#1a1a1a] p-6 rounded-lg border border-gray-800 shadow-xl max-w-3xl">
        <p className="mb-4 text-gray-300">
          이 기능은 네이버 증권의 전 종목(코스피/코스닥) 데이터와 개별 종목의 재무 데이터(자기자본, 부채, 순이익, 최근 3개년/향후 2개년)를 백그라운드에서 크롤링합니다. ROE, PBR, PER, EPS를 정밀 계산하기 위해 필요한 최신 데이터를 데이터베이스에 동기화합니다.
        </p>

        <div className="flex gap-4 mb-8">
          <button
            onClick={handleStart}
            disabled={status?.is_running || loading}
            className={`px-6 py-2 rounded font-bold ${status?.is_running || loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white'}`}
          >
            Start Scan
          </button>
          <button
            onClick={handleStop}
            disabled={!status?.is_running || loading}
            className={`px-6 py-2 rounded font-bold ${!status?.is_running || loading ? 'bg-gray-600 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 text-white'}`}
          >
            Stop Scan
          </button>
          <button
            onClick={() => window.location.href = '/api/market/scan/export'}
            className="px-6 py-2 rounded font-bold bg-blue-600 hover:bg-blue-500 text-white ml-auto"
          >
            Download Excel
          </button>
        </div>

        {status && (
          <div className="bg-black p-4 rounded border border-gray-700">
            <h3 className="text-lg font-semibold mb-2">Scan Status</h3>
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>{status.message}</span>
              <span>{status.current} / {status.total} ({progressPercent}%)</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-gray-800 rounded-full h-4 mb-4">
              <div 
                className="bg-blue-500 h-4 rounded-full transition-all duration-500 ease-in-out" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="bg-[#111] p-3 rounded border border-gray-800">
                <div className="text-gray-500">Current Ticker</div>
                <div className="font-mono text-lg text-yellow-400">{status.current_ticker || '-'}</div>
              </div>
              <div className="bg-[#111] p-3 rounded border border-gray-800">
                <div className="text-gray-500">Current Name</div>
                <div className="font-bold text-lg">{status.current_name || '-'}</div>
              </div>
              <div className="bg-[#111] p-3 rounded border border-gray-800">
                <div className="text-gray-500">Running State</div>
                <div className={`font-bold ${status.is_running ? 'text-green-500' : 'text-gray-500'}`}>
                  {status.is_running ? 'RUNNING' : 'IDLE'}
                </div>
              </div>
              <div className="bg-[#111] p-3 rounded border border-gray-800">
                <div className="text-gray-500">Errors</div>
                <div className={`font-bold ${status.errors > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {status.errors}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
