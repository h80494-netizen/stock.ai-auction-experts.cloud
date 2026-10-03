import React, { useState, useEffect } from 'react';

export default function MarketScannerView() {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dartScanMsg, setDartScanMsg] = useState<string | null>(null);

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

  const handleStartDartScan = async () => {
    setLoading(true);
    setDartScanMsg('DART 상장기업 전수 DB 수집이 시작되었습니다...');
    try {
      const res = await fetch('/api/dart/scan/start', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setDartScanMsg(data.message || 'DART DB 스캔 시작 완료!');
      }
    } catch (e: any) {
      setDartScanMsg('DART 스캔 시작 오류: ' + String(e));
    } finally {
      setLoading(false);
      setTimeout(() => setDartScanMsg(null), 5000);
    }
  };

  const progressPercent = status && status.total > 0 ? Math.round((status.current / status.total) * 100) : 0;

  return (
    <div className="p-6 bg-black text-white min-h-screen space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-2xl font-bold text-yellow-500 flex items-center gap-2">
          <span>🔍 DB 크롤링 스캐너 (Naver Finance & DART Scanner)</span>
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          네이버 증권 전 종목 및 DART OpenAPI 상장기업(ETF, ETN 등 제외)의 재무제표 데이터를 백그라운드 크롤링하여 DB에 수집 및 동기화합니다.
        </p>
      </div>

      {dartScanMsg && (
        <div className="bg-indigo-950/80 border border-indigo-500 text-indigo-200 p-3 rounded-lg text-xs font-bold animate-bounce">
          💡 {dartScanMsg}
        </div>
      )}

      <div className="bg-[#1a1a1a] p-6 rounded-lg border border-gray-800 shadow-xl max-w-4xl space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-200 mb-2">1. 네이버 증권 & DART 재무 DB 통합 수집 스캔</h3>
          <p className="text-sm text-gray-400">
            상장된 모든 기업의 자기자본, 부채, 순이익, 영업이익, 매출액 데이터를 구하여 DB에 동기화합니다. 종목 필터링(Tetris) 및 다중 조건 스크리너 계산에 실시간 반영됩니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleStart}
            disabled={status?.is_running || loading}
            className={`px-6 py-2.5 rounded-xl font-extrabold text-sm transition-all cursor-pointer ${status?.is_running || loading ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white shadow-lg'}`}
          >
            🚀 네이버 마켓 스캔 시작
          </button>
          
          <button
            onClick={handleStartDartScan}
            disabled={loading}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-extrabold text-sm shadow-lg transition-all border border-blue-400/40 cursor-pointer"
          >
            📡 DART 상장사 재무 DB 수집 시작
          </button>

          <button
            onClick={handleStop}
            disabled={!status?.is_running || loading}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${!status?.is_running || loading ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 text-white'}`}
          >
            🛑 중지
          </button>

          <button
            onClick={() => window.location.href = '/api/market/scan/export'}
            className="px-5 py-2.5 rounded-xl font-bold text-sm bg-gray-800 hover:bg-gray-700 text-blue-300 border border-gray-700 ml-auto cursor-pointer"
          >
            📊 엑셀 다운로드
          </button>
        </div>

        {status && (
          <div className="bg-black p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300">현재 네이버 마켓 스캔 진행 상태</h3>
            <div className="flex justify-between text-xs text-gray-400 font-mono">
              <span>{status.message}</span>
              <span>{status.current} / {status.total} ({progressPercent}%)</span>
            </div>
            
            {/* Progress Bar */}
            <div className="w-full bg-gray-800 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-blue-500 to-indigo-500 h-3 rounded-full transition-all duration-500 ease-in-out" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="bg-[#111] p-3 rounded border border-gray-800">
                <div className="text-gray-500 text-[10px]">Current Ticker</div>
                <div className="font-bold text-blue-400 mt-1">{status.current_ticker || '-'}</div>
              </div>
              <div className="bg-[#111] p-3 rounded border border-gray-800">
                <div className="text-gray-500 text-[10px]">Running Time</div>
                <div className="font-bold text-indigo-300 mt-1">{status.elapsed || '0s'}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
