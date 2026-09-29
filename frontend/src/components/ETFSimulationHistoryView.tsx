import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

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

export default function ETFSimulationHistoryView({ etfWeights, setEtfWeights }: { etfWeights?: any, setEtfWeights?: any }) {
  const [simData, setSimData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [criteria, setCriteria] = useState<string>('sharpe');
  const [topN, setTopN] = useState<number>(1);
  const [period, setPeriod] = useState<string>('YTD(26.01~)');
  
  // 21 Models Simulator States
  const [models, setModels] = useState<any[]>([]);
  const [runningSimulator, setRunningSimulator] = useState(false);
  const [selectedModelIdx, setSelectedModelIdx] = useState<number>(-1);

  useEffect(() => {
    if (selectedModelIdx !== -1 && models[selectedModelIdx] && setEtfWeights) {
      setEtfWeights(models[selectedModelIdx].weights);
    }
  }, [selectedModelIdx, models, setEtfWeights]);

  const handleRunSimulator = async (currentTopN = topN, currentCriteria = criteria) => {
    setRunningSimulator(true);
    setModels([]);
    setSelectedModelIdx(-1);
    try {
      const res = await fetch(`/api/etf/simulation-models?criteria=${currentCriteria}&top_n=${currentTopN}`);
      if (res.ok) {
        const json = await res.json();
        setModels(json);
      }
    } catch (e) {
      console.error('Simulator fetch error:', e);
    } finally {
      setRunningSimulator(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/etf/simulation?criteria=${criteria}&top_n=${topN}`);
        if (!res.ok) throw new Error('API Error');
        const json = await res.json();
        setSimData(json);
      } catch (err) {
        console.error('Simulation fetch error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    handleRunSimulator(topN, criteria);
  }, [criteria, topN]);

  // Helper to get start date based on period
  const getStartDate = () => {
    let startDate = '1900-01-01';
    const today = new Date();
    if (period === 'YTD(26.01~)' || period === 'YTD') {
      const year = today.getFullYear();
      startDate = `${year}-01-01`;
    } else if (period === '3개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '6개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '1년') {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '전체') {
      startDate = '1900-01-01';
    }
    return startDate;
  };

  // 1. 단일 모델(메인) 히스토리 계산 (기간 필터 및 리베이싱 적용)
  const historyRows = useMemo(() => {
    if (!simData || !simData.dates || simData.dates.length === 0) return [];
    
    const rows = [];
    const { dates, strategy, selected_etf, etfs } = simData;
    const startDate = getStartDate();

    let startIdx = 0;
    for (let i = 0; i < dates.length; i++) {
      if (dates[i] >= startDate) {
        startIdx = i;
        break;
      }
    }
    if (startIdx >= dates.length) startIdx = 0;

    const baseStrategyVal = (strategy && strategy[startIdx] > 0) ? strategy[startIdx] : 100;

    for (let i = startIdx; i < dates.length; i++) {
      let action = "Hold";
      if (selected_etf[i] === "Waiting") {
        action = "Wait";
      } else if (i > startIdx && selected_etf[i] !== selected_etf[i-1] && selected_etf[i-1] !== "Waiting") {
        if (selected_etf[i] === "CASH") {
          action = "Sell (Cash)";
        } else {
          action = "Buy (Switch)";
        }
      } else if (i > startIdx && selected_etf[i-1] === "Waiting" && selected_etf[i] !== "Waiting") {
        action = "Buy (Entry)";
      } else if (i === startIdx) {
        action = "Buy (Entry)";
      }

      const rebasedVal = (strategy[i] / baseStrategyVal) * 100;
      const cumReturn = rebasedVal - 100;
      let dailyReturn = 0;
      if (i > 0 && strategy[i-1] > 0) {
        dailyReturn = ((strategy[i] - strategy[i-1]) / strategy[i-1]) * 100;
      }

      const currentEtfBase = (selected_etf[i] !== "CASH" && selected_etf[i] !== "Waiting" && etfs && etfs[selected_etf[i]]) 
                             ? etfs[selected_etf[i]][i] : 100;

      rows.push({
        date: dates[i],
        selected: selected_etf[i] || "CASH",
        action,
        etfIndex: currentEtfBase,
        dailyReturn: isNaN(dailyReturn) ? 0 : dailyReturn,
        cumReturn: isNaN(cumReturn) ? 0 : cumReturn
      });
    }

    return rows.reverse();
  }, [simData, period]);

  // 2. 다중 차트 데이터 생성 (선택된 기간에 맞추어 리베이싱)
  const multiChartData = useMemo(() => {
    if (!models || models.length === 0) return [];
    const firstModel = models.find(m => m && m.dates && m.dates.length > 0);
    if (!firstModel) return [];

    const startDate = getStartDate();
    
    // Find the starting index for rebasing
    let startIdx = 0;
    for (let i = 0; i < firstModel.dates.length; i++) {
      if (firstModel.dates[i] >= startDate) {
        startIdx = i;
        break;
      }
    }
    
    if (startIdx >= firstModel.dates.length) startIdx = 0;

    const data = [];
    for (let i = startIdx; i < firstModel.dates.length; i++) {
      const row: any = { date: firstModel.dates[i] };
      models.forEach((m, idx) => {
        if (m && m.strategy && m.strategy.length > i) {
          const baseVal = m.strategy[startIdx] || 1;
          const currVal = m.strategy[i] || baseVal;
          row[`model_${idx}`] = baseVal > 0 ? (currVal / baseVal) * 100 : 100; // Base 100
        } else {
          row[`model_${idx}`] = 100;
        }
      });
      data.push(row);
    }
    return data;
  }, [models, period]);

  // 3. 21개 모델의 기간별 지표 동적 계산
  const filteredModels = useMemo(() => {
    if (!models || models.length === 0) return [];
    
    const startDate = getStartDate();

    return models.map((m) => {
      if (!m || !m.dates || m.dates.length === 0) return m;

      // Find start index
      let startIdx = 0;
      for (let i = 0; i < m.dates.length; i++) {
        if (m.dates[i] >= startDate) {
          startIdx = i;
          break;
        }
      }
      if (startIdx >= m.dates.length) startIdx = 0;

      const strategy = (m.strategy || []).slice(startIdx);
      const selected_etf = m.selected_etf ? m.selected_etf.slice(startIdx) : [];

      // Calculate Total Return for this period
      const startVal = strategy.length > 0 && strategy[0] > 0 ? strategy[0] : 1;
      const endVal = strategy.length > 0 ? strategy[strategy.length - 1] : startVal;
      const total_ret = startVal > 0 ? ((endVal / startVal) - 1) * 100 : 0;

      // Calculate Sharpe for this period
      let sharpe_ratio = 0;
      if (strategy.length > 1) {
        const daily_rets = [];
        for (let i = 1; i < strategy.length; i++) {
          if (strategy[i-1] > 0) {
            daily_rets.push((strategy[i] - strategy[i-1]) / strategy[i-1]);
          }
        }
        if (daily_rets.length > 0) {
          const mean_ret = daily_rets.reduce((a, b) => a + b, 0) / daily_rets.length;
          const variance = daily_rets.reduce((a, b) => a + Math.pow(b - mean_ret, 2), 0) / daily_rets.length;
          const std_dev = Math.sqrt(variance);
          if (std_dev > 0) {
            sharpe_ratio = (mean_ret / std_dev) * Math.sqrt(252);
          }
        }
      }

      // Calculate MDD for this period
      let mdd = 0;
      let peak = -999999;
      for (let i = 0; i < strategy.length; i++) {
        if (strategy[i] > peak) {
          peak = strategy[i];
        }
        if (peak > 0) {
          const drawdown = (strategy[i] - peak) / peak;
          if (drawdown < mdd) {
            mdd = drawdown;
          }
        }
      }
      mdd = mdd * 100;

      // Calculate Hitting Ratio (Trades) for this period
      let win_rate = 0;
      let avg_win = 0;
      let avg_loss = 0;
      
      if (selected_etf.length > 0) {
        const trades_returns = [];
        let entry_value = strategy[0] || 1;
        
        for (let j = 1; j < selected_etf.length; j++) {
          if (selected_etf[j] !== selected_etf[j-1]) {
            const exit_value = strategy[j] || entry_value;
            if (entry_value > 0 && selected_etf[j-1] !== "Waiting" && selected_etf[j-1] !== "CASH" && selected_etf[j-1] !== "") {
              trades_returns.push(((exit_value - entry_value) / entry_value) * 100);
            }
            entry_value = exit_value;
          }
        }
        
        // Last open position
        if (selected_etf[selected_etf.length - 1] !== "Waiting" && selected_etf[selected_etf.length - 1] !== "CASH" && selected_etf[selected_etf.length - 1] !== "" && entry_value > 0) {
          const exit_value = strategy[strategy.length - 1] || entry_value;
          trades_returns.push(((exit_value - entry_value) / entry_value) * 100);
        }
        
        const wins = trades_returns.filter(r => r > 0);
        const losses = trades_returns.filter(r => r <= 0);
        
        win_rate = trades_returns.length > 0 ? (wins.length / trades_returns.length) * 100 : 0;
        avg_win = wins.length > 0 ? wins.reduce((a,b)=>a+b, 0) / wins.length : 0;
        avg_loss = losses.length > 0 ? losses.reduce((a,b)=>a+b, 0) / losses.length : 0;
      }

      return {
        ...m,
        total_ret: isNaN(total_ret) ? 0 : total_ret,
        sharpe: isNaN(sharpe_ratio) ? 0 : sharpe_ratio,
        mdd: isNaN(mdd) ? 0 : mdd,
        win_rate: isNaN(win_rate) ? 0 : win_rate,
        avg_win: isNaN(avg_win) ? 0 : avg_win,
        avg_loss: isNaN(avg_loss) ? 0 : avg_loss
      };
    });
  }, [models, period]);


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

  const renderSelectedEtfs = (selectedStr: string) => {
    if (!selectedStr) return null;
    const list = selectedStr.split(',').map(s => s.trim());
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {list.map((item, idx) => (
          <span key={idx} className="flex items-center gap-1 bg-gray-900/80 px-2 py-0.5 rounded border border-gray-700 text-xs font-bold">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: ETF_COLORS[item] || '#888' }} />
            <span style={{ color: ETF_COLORS[item] || '#fff' }}>{item}</span>
            <span className="text-gray-400 font-sans text-[11px]">({ETF_NAMES[item] || item})</span>
          </span>
        ))}
      </div>
    );
  };

  const getLineColor = (idx: number) => {
    if (selectedModelIdx !== -1) {
      return selectedModelIdx === idx ? '#f472b6' : '#374151'; // Highlight selected, dim others
    }
    const hue = (idx * (360 / 21)) % 360;
    return `hsl(${hue}, 70%, 60%)`;
  };

  const periodOptions = ['YTD(26.01~)', '3개월', '6개월', '1년', '전체'];

  if (loading && !simData) return <div className="p-4 animate-pulse text-xl font-bold">시뮬레이션 히스토리 불러오는 중...</div>;

  return (
    <div className="p-4 h-full overflow-y-auto space-y-4">
      <div className="flex flex-col lg:flex-row justify-between items-center bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700 gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">🗓️ 시뮬레이션 히스토리 & 성과 분석</h2>
          <p className="text-sm text-gray-400 mt-1">일자별 선택된 ETF 기록 및 21개 다중 가중치 모델의 성과 비교</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 items-center flex-wrap">
          {/* ETF 선택 개수 (1개, 2개, 3개, 4개) 선택기 */}
          <div className="bg-gray-900 px-3 py-1.5 rounded-lg flex items-center gap-2 border border-gray-700">
            <span className="text-xs font-bold text-teal-400">🎯 ETF 선택 개수:</span>
            {[1, 2, 3, 4].map(n => (
              <button
                key={n}
                onClick={() => setTopN(n)}
                className={`px-2.5 py-1 text-xs font-bold rounded transition-colors ${
                  topN === n
                    ? 'bg-teal-600 text-white shadow'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {n}개
              </button>
            ))}
          </div>

          {/* 선택 기준 토글 */}
          <div className="bg-gray-900 p-1 rounded-lg flex border border-gray-700">
            <button
              onClick={() => setCriteria('momentum')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                criteria === 'momentum' 
                  ? 'bg-blue-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              🔥 모멘텀(단순수익률)
            </button>
            <button
              onClick={() => setCriteria('sharpe')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors ${
                criteria === 'sharpe' 
                  ? 'bg-purple-600 text-white shadow' 
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              🛡️ 샤프지수(위험조정)
            </button>
          </div>

          <button
            onClick={() => handleRunSimulator(topN, criteria)}
            className="bg-teal-600 hover:bg-teal-500 text-white px-3 py-1.5 rounded-lg shadow border border-teal-500 text-xs font-bold flex items-center justify-center gap-2"
          >
            <span>🧪 21개 모델 시뮬레이션</span>
            {runningSimulator && <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent"></span>}
          </button>
        </div>
      </div>

      {/* 기간 선택 버튼 (추가) */}
      <div className="flex flex-wrap gap-2">
        {periodOptions.map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 text-sm font-bold rounded-md transition-colors ${
              period === p 
                ? 'bg-blue-600 text-white shadow' 
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* 21개 모델 다중 차트 영역 */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-teal-500/50 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-xl font-bold text-teal-300">📈 21개 모델 {period} 누적 수익률 비교 차트 (Base = 100)</h3>
            
            {!runningSimulator && filteredModels.length > 0 && (
              <div className="flex gap-2 items-center flex-wrap">
                <div className="flex gap-2 items-center bg-gray-900 px-3 py-1.5 rounded border border-gray-700">
                  <span className="text-sm text-gray-400">선택 모델 비중(1/5/20일):</span>
                  <input type="text" readOnly value={selectedModelIdx !== -1 ? models[selectedModelIdx]?.weights?.w1 : '-'} className="w-8 bg-transparent text-white text-center font-bold outline-none" />
                  <span className="text-gray-600">/</span>
                  <input type="text" readOnly value={selectedModelIdx !== -1 ? models[selectedModelIdx]?.weights?.w5 : '-'} className="w-8 bg-transparent text-white text-center font-bold outline-none" />
                  <span className="text-gray-600">/</span>
                  <input type="text" readOnly value={selectedModelIdx !== -1 ? models[selectedModelIdx]?.weights?.w20 : '-'} className="w-8 bg-transparent text-white text-center font-bold outline-none" />
                </div>
                
                <button 
                  onClick={() => {
                    const sorted = [...filteredModels].sort((a, b) => b.total_ret - a.total_ret); // Highest Return
                    if(sorted.length > 0) {
                      const bestModelStr = sorted[0].model;
                      const idx = models.findIndex(m => m.model === bestModelStr);
                      if (idx !== -1) setSelectedModelIdx(idx);
                    }
                  }}
                  className="bg-yellow-600 hover:bg-yellow-500 text-white text-sm px-3 py-1.5 rounded shadow font-bold"
                >
                  ✨ 최고 수익률 모델 선택
                </button>

                <button 
                  onClick={() => {
                    const sorted = [...filteredModels].sort((a, b) => {
                      if (b.mdd !== a.mdd) return b.mdd - a.mdd; // Highest MDD (closest to 0)
                      if (b.win_rate !== a.win_rate) return b.win_rate - a.win_rate; // Highest Win Rate
                      return b.total_ret - a.total_ret; // Highest Return
                    });
                    if(sorted.length > 0) {
                      const bestModelStr = sorted[0].model;
                      const idx = models.findIndex(m => m.model === bestModelStr);
                      if (idx !== -1) setSelectedModelIdx(idx);
                    }
                  }}
                  className="bg-pink-600 hover:bg-pink-500 text-white text-sm px-3 py-1.5 rounded shadow font-bold"
                >
                  ✨ MDD 방어 최적 모델 추천
                </button>
              </div>
            )}
          </div>
          
          <div className="h-[400px] w-full bg-gray-900/50 rounded-lg p-2">
            {runningSimulator ? (
              <div className="h-full w-full flex items-center justify-center text-gray-500 animate-pulse">시뮬레이션 실행 중...</div>
            ) : multiChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={multiChartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{fill: '#9ca3af'}} minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151' }}
                    itemStyle={{ color: '#e5e7eb' }}
                    labelStyle={{ color: '#9ca3af', fontWeight: 'bold' }}
                  />
                  {models.map((m, idx) => (
                    <Line
                      key={`model_${idx}`}
                      type="monotone"
                      dataKey={`model_${idx}`}
                      name={m.model}
                      stroke={getLineColor(idx)}
                      strokeWidth={selectedModelIdx === idx ? 5 : 1.5}
                      dot={false}
                      opacity={selectedModelIdx === -1 || selectedModelIdx === idx ? 1 : 0.2}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-gray-500">
                <span className="text-3xl mb-3">🧪</span>
                <p className="mb-2">우측 상단의 '21개 모델 시뮬레이션' 버튼을 클릭하여 시뮬레이션을 실행하세요.</p>
                <button onClick={() => handleRunSimulator()} className="mt-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded shadow font-bold">
                  시뮬레이션 시작하기
                </button>
              </div>
            )}
          </div>
          
          <p className="text-sm text-gray-400">선택된 기간({period}) 기준으로 수익률 및 성과 지표가 동적으로 재계산됩니다.</p>
          
          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-900 text-gray-400 text-sm">
                  <th className="p-2 border-b border-gray-700">모델명</th>
                  <th className="p-2 border-b border-gray-700">가중치 (1/5/20일)</th>
                  <th className="p-2 border-b border-gray-700 text-right font-bold text-teal-400">수익률({period})</th>
                  <th className="p-2 border-b border-gray-700 text-right">샤프 지수</th>
                  <th className="p-2 border-b border-gray-700 text-right font-bold text-pink-400">MDD</th>
                  <th className="p-2 border-b border-gray-700 text-right">Hitting Ratio</th>
                  <th className="p-2 border-b border-gray-700 text-right text-green-400">평균 수익</th>
                  <th className="p-2 border-b border-gray-700 text-right text-red-400">평균 손실</th>
                </tr>
              </thead>
              <tbody>
                {filteredModels.map((m, idx) => {
                  const isSelected = selectedModelIdx === idx;
                  return (
                    <tr 
                      key={idx} 
                      onClick={() => setSelectedModelIdx(isSelected ? -1 : idx)}
                      className={`cursor-pointer transition-colors border-b border-gray-800 ${isSelected ? 'bg-teal-900/40 border-l-4 border-l-teal-400' : 'hover:bg-gray-700'}`}
                    >
                      <td className="p-2 font-bold text-gray-300">
                        <span className="inline-block w-3 h-3 rounded-full mr-2" style={{backgroundColor: getLineColor(idx)}}></span>
                        {m.model}
                      </td>
                      <td className="p-2 font-mono text-gray-400">{m.weights.w1}% / {m.weights.w5}% / {m.weights.w20}%</td>
                      <td className={`p-2 text-right font-mono font-bold ${m.total_ret >= 0 ? 'text-teal-400' : 'text-red-400'}`}>{m.total_ret.toFixed(2)}%</td>
                      <td className="p-2 text-right font-mono text-purple-400 font-bold">{m.sharpe.toFixed(2)}</td>
                      <td className="p-2 text-right font-mono font-bold text-pink-400">{m.mdd !== undefined ? m.mdd.toFixed(2) + '%' : '-'}</td>
                      <td className="p-2 text-right font-mono">{m.win_rate !== undefined ? m.win_rate.toFixed(1) + '%' : '-'}</td>
                      <td className="p-2 text-right font-mono text-green-400">{m.avg_win !== undefined ? m.avg_win.toFixed(2) + '%' : '-'}</td>
                      <td className="p-2 text-right font-mono text-red-400">{m.avg_loss !== undefined ? m.avg_loss.toFixed(2) + '%' : '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      {/* 기본 단일 시뮬레이션 히스토리 표 */}
      <div className="bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden">
        <div className="p-4 border-b border-gray-700 bg-gray-800/80">
          <h3 className="text-lg font-bold text-gray-200">단일 메인 모델 히스토리 기록 (표) - {period}</h3>
        </div>
        <div className="overflow-x-auto">
          {historyRows && historyRows.length > 0 ? (
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
                    <td className="p-3">
                      {renderSelectedEtfs(row.selected)}
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
          ) : (
            <div className="p-4 text-center text-gray-500">데이터가 없습니다.</div>
          )}
        </div>
      </div>
    </div>
  );
}
