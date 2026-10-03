import React, { useState, useEffect } from 'react';

export default function MarketScannerView() {
  const [status, setStatus] = useState<any>(null);
  const [dartStatus, setDartStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dartScanMsg, setDartScanMsg] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      const [marketRes, dartRes] = await Promise.all([
        fetch('/api/market/scan/status'),
        fetch('/api/dart/scan/status')
      ]);
      if (marketRes.ok) {
        const data = await marketRes.json();
        setStatus(data);
      }
      if (dartRes.ok) {
        const dData = await dartRes.json();
        setDartStatus(dData);
      }
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
    setDartScanMsg('전체 상장기업 (약 1,800개) DART 수집이 시작되었습니다...');
    try {
      const res = await fetch('/api/dart/scan/start', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setDartScanMsg(data.message || 'DART 전체 수집 시작!');
      }
    } catch (e: any) {
      setDartScanMsg('DART 스캔 시작 오류: ' + String(e));
    } finally {
      setLoading(false);
      setTimeout(() => setDartScanMsg(null), 5000);
    }
  };

  const progressPercent = status && status.total > 0 ? Math.round((status.current / status.total) * 100) : 0;
  const dartProgressPercent = dartStatus && dartStatus.total > 0 ? Math.round((dartStatus.current / dartStatus.total) * 100) : 0;

  return (
    <div className="p-6 bg-black text-white min-h-screen space-y-6">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-2xl font-bold text-yellow-500 flex items-center gap-2">
          <span>🔍 DB 크롤링 스캐너 (Naver & DART 전체 상장사 수집)</span>
        </h2>
        <p className="text-xs text-gray-400 mt-1">
          네이버 증권 전 종목 및 DART OpenAPI 상장기업 전체(약 1,800여 개 종목, ETF/ETN 제외)의 재무제표 데이터를 백그라운드 멀티스레딩으로 전수 크롤링하여 DB에 수집합니다.
        </p>
      </div>

      {dartScanMsg && (
        <div className="bg-indigo-950/80 border border-indigo-500 text-indigo-200 p-3.5 rounded-xl text-xs font-bold animate-bounce">
          💡 {dartScanMsg}
        </div>
      )}

      <div className="bg-[#1a1a1a] p-6 rounded-2xl border border-gray-800 shadow-xl max-w-4xl space-y-6">
        <div>
          <h3 className="text-lg font-bold text-gray-200 mb-1">1. 국내 전체 상장사 (약 1,800개) DART 재무 DB 수집 & 12분기 롤링 관리</h3>
          <p className="text-xs text-gray-400">
            상장된 모든 기업의 자산, 자본, 부채, 순이익, 영업이익, 매출액 데이터를 전수 수집하며, <strong className="text-yellow-400 font-mono">최신 12분기 (3년) 분량만 항시 유지</strong>합니다. 신규 분기 추가 시 12분기를 초과하는 가장 오래된 분기는 DB에서 자동 삭제됩니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleStartDartScan}
            disabled={dartStatus?.is_running || loading}
            className={`px-6 py-2.5 rounded-xl font-extrabold text-sm shadow-xl transition-all flex items-center gap-2 border border-blue-400/40 cursor-pointer ${dartStatus?.is_running ? 'bg-indigo-950 text-indigo-300 border-indigo-500 animate-pulse' : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white'}`}
          >
            <span>📡</span>
            <span>{dartStatus?.is_running ? 'DART 전수 수집 중...' : 'DART 전체 상장사 (1,800+ 개) 재무 DB 수집 시작'}</span>
          </button>

          <button
            onClick={handleStart}
            disabled={status?.is_running || loading}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${status?.is_running || loading ? 'bg-gray-700 text-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-500 text-white shadow-lg'}`}
          >
            🚀 네이버 마켓 스캔
          </button>

          <button
            onClick={handleStop}
            disabled={!status?.is_running || loading}
            className={`px-4 py-2.5 rounded-xl font-bold text-sm transition-all cursor-pointer ${!status?.is_running || loading ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-red-600 hover:bg-red-500 text-white'}`}
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

        {/* DART 전체 상장사 수집 진행 상태 카운터 */}
        {dartStatus && (
          <div className="bg-gray-900/90 p-4 rounded-xl border border-indigo-900/80 space-y-3 shadow-inner">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-extrabold text-indigo-300 flex items-center gap-2">
                <span>📡 DART 전체 상장사 (1,800+ 개) 재무 DB 수집 현황</span>
                {dartStatus.is_running && <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-mono animate-pulse">수집 중</span>}
              </h3>
              <span className="font-mono text-xs text-indigo-200 font-bold">
                {dartStatus.current || 0} / {dartStatus.total || 0} 개 ({dartProgressPercent}%) — DB 저장: <strong className="text-emerald-400">{dartStatus.saved_count || 0}개 기업</strong>
              </span>
            </div>
            
            {/* DART Progress Bar */}
            <div className="w-full bg-gray-800 rounded-full h-3.5 border border-gray-700">
              <div 
                className="bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 h-3.5 rounded-full transition-all duration-500 ease-in-out shadow" 
                style={{ width: `${dartProgressPercent}%` }}
              ></div>
            </div>

            <div className="text-xs text-gray-400 font-mono flex justify-between">
              <span>{dartStatus.message || '수집 준비 완료'}</span>
              <span>최종 수집시각: {dartStatus.timestamp || '-'}</span>
            </div>
          </div>
        )}

        {/* 네이버 마켓 스캔 진행 상태 */}
        {status && (
          <div className="bg-black p-4 rounded-xl border border-gray-800 space-y-3">
            <h3 className="text-sm font-semibold text-gray-300">네이버 마켓 실시간 시세 스캔 상태</h3>
            <div className="flex justify-between text-xs text-gray-400 font-mono">
              <span>{status.message}</span>
              <span>{status.current} / {status.total} ({progressPercent}%)</span>
            </div>
            
            <div className="w-full bg-gray-800 rounded-full h-3">
              <div 
                className="bg-gradient-to-r from-emerald-500 to-teal-500 h-3 rounded-full transition-all duration-500 ease-in-out" 
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
