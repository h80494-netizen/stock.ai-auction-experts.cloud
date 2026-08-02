import React, { useState, useEffect, useMemo } from 'react';

// ETF 색상 및 이름 매핑
const ETF_COLORS: Record<string, string> = {
  EWY: "#3b82f6",
  EWJ: "#ef4444",
  SPY: "#10b981",
  QQQ: "#8b5cf6",
  FXI: "#f97316",
  INDA: "#facc15",
  EWZ: "#14b8a6",
  EWA: "#6366f1",
  EZU: "#ec4899",
  USO: "#78350f",
  GLD: "#eab308",
  CASH: "#9ca3af",
  Waiting: "#6b7280"
};

const ETF_NAMES: Record<string, string> = {
  EWY: "한국",
  EWJ: "일본",
  SPY: "미국 S&P 500",
  QQQ: "미국 나스닥",
  FXI: "중국",
  INDA: "인도",
  EWZ: "브라질",
  EWA: "호주",
  EZU: "유럽",
  USO: "원유",
  GLD: "금",
  CASH: "현금",
  Waiting: "대기중"
};

export default function ETFSimulationHistoryView() {
  const [simData, setSimData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [criteria, setCriteria] = useState<string>('sharpe');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/etf/simulation?criteria=${criteria}`);
        if (!res.ok) throw new Error('API Error');
        const json = await res.json();
        setSimData(json);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [criteria]);

  const historyRows = useMemo(() => {
    if (!simData || !simData.dates || simData.dates.length === 0) return [];
    
    const rows = [];
    const { dates, strategy, selected_etf, etfs } = simData;

    for (let i = 0; i < dates.length; i++) {
      // Calculate Action
      let action = "Hold";
      if (selected_etf[i] === "Waiting") {
        action = "Wait";
      } else if (i > 0 && selected_etf[i] !== selected_etf[i-1] && selected_etf[i-1] !== "Waiting") {
        if (selected_etf[i] === "CASH") {
          action = "Sell (Cash)";
        } else {
          action = "Buy (Switch)";
        }
      } else if (i > 0 && selected_etf[i-1] === "Waiting" && selected_etf[i] !== "Waiting") {
        action = "Buy (Entry)";
      } else if (i === 0) {
        action = "Buy (Entry)";
      }

      // Cumulative Return
      const cumReturn = strategy[i] - 100;

      // Daily Return
      let dailyReturn = 0;
      if (i > 0 && strategy[i-1] > 0) {
        dailyReturn = ((strategy[i] - strategy[i-1]) / strategy[i-1]) * 100;
      }

      // ETF Current Index (Base 100)
      const currentEtfBase = (selected_etf[i] !== "CASH" && selected_etf[i] !== "Waiting" && etfs[selected_etf[i]]) 
                             ? etfs[selected_etf[i]][i] : 100;

      rows.push({
        date: dates[i],
        selected: selected_etf[i],
        action,
        etfIndex: currentEtfBase,
        dailyReturn,
        cumReturn
      });
    }

    // 최신 날짜가 위로 오도록 역순 정렬
    return rows.reverse();
  }, [simData]);

  if (loading) return <div className="p-4 animate-pulse text-xl font-bold">시뮬레이션 히스토리 불러오는 중...</div>;
  if (!historyRows || historyRows.length === 0) return <div className="p-4 text-red-500">Failed to load ETF Simulation data.</div>;

  const renderActionBadge = (action: string) => {
    if (action.includes("Buy")) {
      return <span className="px-2 py-1 bg-red-900/50 text-red-400 border border-red-700 rounded text-xs font-bold">{action}</span>;
    }
    if (action.includes("Sell")) {
      return <span className="px-2 py-1 bg-blue-900/50 text-blue-400 border border-blue-700 rounded text-xs font-bold">{action}</span>;
    }
    if (action === "Hold") {
      return <span className="px-2 py-1 bg-gray-800 text-gray-400 border border-gray-600 rounded text-xs">{action}</span>;
    }
    return <span className="px-2 py-1 bg-gray-800 text-gray-500 rounded text-xs">{action}</span>;
  };

  return (
    <div className="p-4 h-full overflow-y-auto space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
        <div>
          <h2 className="text-2xl font-bold text-white">🗓️ 시뮬레이션 히스토리</h2>
          <p className="text-sm text-gray-400 mt-1">일자별 선택된 ETF와 매매 상태 및 수익률 기록</p>
        </div>
        
        <div className="bg-gray-900 p-1 rounded-lg flex mt-4 sm:mt-0 border border-gray-700">
          <button
            onClick={() => setCriteria('momentum')}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
              criteria === 'momentum' 
                ? 'bg-blue-600 text-white shadow' 
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            🔥 모멘텀 중심
          </button>
          <button
            onClick={() => setCriteria('sharpe')}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
              criteria === 'sharpe' 
                ? 'bg-purple-600 text-white shadow' 
                : 'text-gray-400 hover:text-white hover:bg-gray-800'
            }`}
          >
            🛡️ 샤프 지수 중심
          </button>
        </div>
      </div>

      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap min-w-[700px]">
            <thead>
              <tr className="bg-gray-900 text-gray-400 text-sm">
                <th className="p-3 border-b border-gray-700">일자 (Date)</th>
                <th className="p-3 border-b border-gray-700 text-center">액션 (Action)</th>
                <th className="p-3 border-b border-gray-700">선택 ETF</th>
                <th className="p-3 border-b border-gray-700 text-right">ETF 지수 (Base=100)</th>
                <th className="p-3 border-b border-gray-700 text-right">일일 수익률</th>
                <th className="p-3 border-b border-gray-700 text-right">누적 수익률</th>
              </tr>
            </thead>
            <tbody className="font-mono text-sm">
              {historyRows.map((row, idx) => (
                <tr key={`${row.date}-${idx}`} className="hover:bg-gray-700/50 border-b border-gray-800 transition-colors">
                  <td className="p-3 text-gray-300">{row.date}</td>
                  <td className="p-3 text-center">{renderActionBadge(row.action)}</td>
                  <td className="p-3 font-bold flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: ETF_COLORS[row.selected] || '#888' }}
                    />
                    <span style={{ color: ETF_COLORS[row.selected] || '#fff' }}>{row.selected}</span>
                    <span className="text-gray-500 font-sans text-xs">({ETF_NAMES[row.selected] || row.selected})</span>
                  </td>
                  <td className="p-3 text-right text-gray-300">
                    {row.etfIndex !== 100 ? row.etfIndex.toFixed(2) : '-'}
                  </td>
                  <td className={`p-3 text-right font-bold ${row.dailyReturn > 0 ? 'text-red-400' : row.dailyReturn < 0 ? 'text-blue-400' : 'text-gray-400'}`}>
                    {row.dailyReturn > 0 ? '+' : ''}{row.dailyReturn.toFixed(2)}%
                  </td>
                  <td className={`p-3 text-right font-bold ${row.cumReturn > 0 ? 'text-red-400' : row.cumReturn < 0 ? 'text-blue-400' : 'text-gray-400'}`}>
                    {row.cumReturn > 0 ? '+' : ''}{row.cumReturn.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
