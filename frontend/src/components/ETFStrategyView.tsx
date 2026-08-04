import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceArea
} from 'recharts';

// ETF 색상 매핑
const ETF_COLORS: Record<string, string> = {
  EWY: "#3b82f6", // blue
  EWJ: "#ef4444", // red
  SPY: "#10b981", // green
  QQQ: "#8b5cf6", // purple
  FXI: "#f97316", // orange
  INDA: "#facc15", // yellow
  EWZ: "#14b8a6", // teal
  EWA: "#6366f1", // indigo
  EZU: "#ec4899", // pink
  USO: "#78350f", // brown
  GLD: "#eab308", // gold
  CASH: "#9ca3af", // gray
};

export default function ETFStrategyView() {
  const [data, setData] = useState<any[]>([]);
  const [simData, setSimData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>('YTD(26.01~)');
  const [criteria, setCriteria] = useState<string>('sharpe');

  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout;

    const fetchData = async () => {
      if (!pollInterval) setLoading(true);
      try {
        const ts = Date.now();
        const [stratRes, simRes] = await Promise.all([
          fetch(`/api/etf/strategy?criteria=${criteria}&t=${ts}`, { cache: 'no-store' }),
          fetch(`/api/etf/simulation?criteria=${criteria}&t=${ts}`, { cache: 'no-store' })
        ]);
        if (!stratRes.ok || !simRes.ok) {
          console.error('ETF Strategy API Error:', stratRes.statusText, simRes.statusText);
          if (isMounted) setLoading(false);
          return;
        }
        const stratJson = await stratRes.json();
        const simJson = await simRes.json();
        
        if (isMounted) {
          setData(stratJson);
          setSimData(simJson);
        }
      } catch (err) {
        console.error('ETF Strategy fetch exception:', String(err));
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    pollInterval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 30000);

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [criteria]);

  const chartData = useMemo(() => {
    if (!simData || !simData.dates) return [];
    
    // 1. 전체 데이터를 객체 배열로 변환
    const allData = simData.dates.map((date: string, i: number) => {
      const point: any = {
        date,
        originalStrategy: simData.strategy[i],
        Selected: simData.selected_etf[i]
      };
      if (simData.etfs) {
        Object.keys(simData.etfs).forEach(ticker => {
          point[`original_${ticker}`] = simData.etfs[ticker][i];
        });
      }
      return point;
    });

    // 2. 선택된 기간에 따른 시작일 계산
    let startDate = '1900-01-01';
    const today = new Date();
    
    if (period === 'YTD(26.01~)') {
      startDate = '2026-01-02';
    } else if (period === '3개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '6개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '12개월') {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().split('T')[0];
    }

    // 3. 데이터 필터링
    const filteredData = allData.filter((d: any) => d.date >= startDate);
    
    if (filteredData.length === 0) return [];

    // 4. Base 100 리베이싱(Re-basing)
    const baseStrategy = filteredData[0].originalStrategy;
    const baseEtfs: any = {};
    if (simData.etfs) {
      Object.keys(simData.etfs).forEach(ticker => {
        baseEtfs[ticker] = filteredData[0][`original_${ticker}`];
      });
    }

    return filteredData.map((d: any) => {
      const newPoint: any = {
        date: d.date,
        Selected: d.Selected,
        Strategy: (d.originalStrategy / baseStrategy) * 100
      };
      Object.keys(baseEtfs).forEach(ticker => {
        if (baseEtfs[ticker] > 0) {
          newPoint[ticker] = (d[`original_${ticker}`] / baseEtfs[ticker]) * 100;
        } else {
          newPoint[ticker] = 100;
        }
      });
      return newPoint;
    });
  }, [simData, period]);

  const referenceAreas = useMemo(() => {
    if (!chartData || chartData.length === 0) return [];
    const areas = [];
    let startIdx = 0;
    for (let i = 1; i < chartData.length; i++) {
      if (chartData[i].Selected !== chartData[i-1].Selected || i === chartData.length - 1) {
        if (chartData[startIdx].Selected && chartData[startIdx].Selected !== "Waiting") {
          areas.push({
            start: chartData[startIdx].date,
            end: chartData[i].date,
            etf: chartData[startIdx].Selected,
            color: ETF_COLORS[chartData[startIdx].Selected] || '#888888'
          });
        }
        startIdx = i;
      }
    }
    return areas;
  }, [chartData]);

  const simMetrics = useMemo(() => {
    if (!simData || !simData.dates || simData.dates.length === 0) {
      return { totalReturn: 0, tradeCount: 0, totalFee: 0, netReturn: 0 };
    }

    let startDate = '1900-01-01';
    const today = new Date();
    
    if (period === 'YTD(26.01~)') {
      startDate = '2026-01-02';
    } else if (period === '3개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 3);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '6개월') {
      const d = new Date(today);
      d.setMonth(d.getMonth() - 6);
      startDate = d.toISOString().split('T')[0];
    } else if (period === '12개월') {
      const d = new Date(today);
      d.setFullYear(d.getFullYear() - 1);
      startDate = d.toISOString().split('T')[0];
    }

    const filtered = [];
    for (let i = 0; i < simData.dates.length; i++) {
      if (simData.dates[i] >= startDate) {
        filtered.push({
          date: simData.dates[i],
          strategy: simData.strategy[i],
          selected: simData.selected_etf[i]
        });
      }
    }

    if (filtered.length < 2) {
      return { totalReturn: 0, tradeCount: 0, totalFee: 0, netReturn: 0 };
    }

    const startVal = filtered[0].strategy;
    const endVal = filtered[filtered.length - 1].strategy;
    const totalReturn = startVal > 0 ? ((endVal / startVal) - 1) * 100 : 0;

    let tradeCount = 0;
    for (let i = 1; i < filtered.length; i++) {
      if (filtered[i].selected !== filtered[i - 1].selected && filtered[i - 1].selected !== 'Waiting') {
        tradeCount++;
      }
    }

    const feeRatePerTrade = 0.03;
    const totalFee = tradeCount * feeRatePerTrade;
    const netReturn = totalReturn - totalFee;

    return { totalReturn, tradeCount, totalFee, netReturn };
  }, [simData, period]);

  if (loading) return <div className="p-4 animate-pulse text-xl font-bold">ETF 전략 분석 및 백테스트 실행 중...</div>;
  if (!data || data.length === 0) return <div className="p-4 text-red-500">Failed to load ETF Strategy data.</div>;

  const topETF = data[0];
  // sharpe 지수 모드일 땐 샤프지수 값으로 현금 보유 여부를 판단하거나, 
  // 기존과 같이 momentum_score가 0.5 이하일 때로 유지할 수 있음.
  // 로직상 criteria에 따라 final_score가 결정되므로 final_score를 이용.
  const isCash = topETF && topETF.final_score <= 0.5;
  const etfTickers = simData && simData.etfs ? Object.keys(simData.etfs) : [];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const selected = payload[0].payload.Selected;
      return (
        <div className="bg-gray-900 border border-gray-700 p-3 rounded shadow-lg text-sm z-50 relative">
          <p className="font-bold mb-1 text-white">{label}</p>
          <p className="text-yellow-400 font-bold mb-2">선택된 ETF: {selected}</p>
          {payload.map((entry: any, index: number) => (
            <p key={`item-${index}`} style={{ color: entry.color }} className={entry.dataKey === 'Strategy' ? 'font-bold' : ''}>
              {entry.name}: {entry.value?.toFixed(2)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const periodOptions = ['YTD(26.01~)', '3개월', '6개월', '12개월'];

  return (
    <div className="p-4 h-full overflow-y-auto space-y-6">
      
      {/* 전략 기준 선택 토글 */}
      <div className="flex justify-center mb-4 sm:mb-6">
        <div className="bg-gray-800 p-1 rounded-lg flex flex-col sm:flex-row shadow-lg border border-gray-700 w-full sm:w-auto">
          <button
            onClick={() => setCriteria('momentum')}
            className={`w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-2 mb-1 sm:mb-0 rounded-md text-sm sm:text-base font-bold transition-colors ${
              criteria === 'momentum' 
                ? 'bg-blue-600 text-white shadow' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            🔥 수익률(모멘텀) 중심
          </button>
          <button
            onClick={() => setCriteria('sharpe')}
            className={`w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-2 rounded-md text-sm sm:text-base font-bold transition-colors ${
              criteria === 'sharpe' 
                ? 'bg-purple-600 text-white shadow' 
                : 'text-gray-400 hover:text-white hover:bg-gray-700'
            }`}
          >
            🛡️ 샤프 지수(안정성) 중심
          </button>
        </div>
      </div>

      {/* 시뮬레이션 기간별 성과 지표 (총수익률, 매매횟수, 수수료, 실질수익률) */}
      <div className="bg-gray-800 p-4 sm:p-5 rounded-lg shadow-lg border border-gray-700 space-y-3">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b border-gray-700">
          <div className="flex items-center space-x-2">
            <span className="text-lg sm:text-xl font-bold text-white">📊 시뮬레이션 기간별 성과 지표</span>
          </div>
          {/* 기간 선택 버튼 (모바일 및 데스크톱 반응형) */}
          <div className="flex flex-wrap gap-1 bg-gray-900 p-1 rounded-lg w-full sm:w-auto">
            {periodOptions.map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 sm:flex-none px-2.5 py-1 text-xs sm:text-sm font-bold rounded-md transition-colors whitespace-nowrap ${
                  period === p 
                    ? 'bg-blue-600 text-white shadow' 
                    : 'text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="bg-gray-900/70 p-3 sm:p-4 rounded-lg border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">총수익률</div>
            <div className={`text-lg sm:text-2xl font-extrabold font-mono mt-1 ${simMetrics.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {simMetrics.totalReturn > 0 ? '+' : ''}{simMetrics.totalReturn.toFixed(2)}%
            </div>
          </div>
          <div className="bg-gray-900/70 p-3 sm:p-4 rounded-lg border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">매매횟수</div>
            <div className="text-lg sm:text-2xl font-extrabold font-mono text-blue-400 mt-1">
              {simMetrics.tradeCount}회
            </div>
          </div>
          <div className="bg-gray-900/70 p-3 sm:p-4 rounded-lg border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">수수료</div>
            <div className="text-lg sm:text-2xl font-extrabold font-mono text-yellow-400 mt-1">
              {simMetrics.totalFee.toFixed(2)}%
            </div>
          </div>
          <div className="bg-gray-900/70 p-3 sm:p-4 rounded-lg border border-gray-700/60">
            <div className="text-xs text-gray-400 font-medium">실질수익률</div>
            <div className={`text-lg sm:text-2xl font-extrabold font-mono mt-1 ${simMetrics.netReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {simMetrics.netReturn > 0 ? '+' : ''}{simMetrics.netReturn.toFixed(2)}%
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-6 bg-gradient-to-r from-blue-900 to-indigo-900 rounded-lg shadow-lg border border-blue-500">
        <h2 className="text-lg sm:text-2xl font-bold mb-2 break-keep">
          🏆 추천 투자 포지션 <span className="text-sm sm:text-base font-normal text-blue-200 block sm:inline mt-1 sm:mt-0">({criteria === 'momentum' ? '1일 50%, 5일 30%, 20일 20% 가중 합산' : '모멘텀 수익률 대비 변동성 리스크 고려'})</span>
        </h2>
        <div className="text-3xl sm:text-4xl font-extrabold text-yellow-400 my-3 sm:my-4">
          {isCash ? (
            <span className="text-gray-300 text-xl sm:text-4xl">CASH <span className="text-sm sm:text-2xl text-gray-400 block sm:inline mt-1 sm:mt-0">(추천 스코어 0.5 이하 - 현금 방어)</span></span>
          ) : (
            <>{topETF.ticker} <span className="text-xl sm:text-2xl text-gray-300">({topETF.name})</span></>
          )}
        </div>
        {!isCash && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-4 mt-4 text-base sm:text-lg">
            <div className="bg-blue-950/40 p-2 sm:p-0 rounded sm:bg-transparent">
              <div className="text-blue-300 text-xs sm:text-sm uppercase">현재가</div>
              <div className="font-mono">${topETF.current_price.toFixed(2)}</div>
            </div>
            <div className="bg-blue-950/40 p-2 sm:p-0 rounded sm:bg-transparent">
              <div className="text-blue-300 text-xs sm:text-sm uppercase">1일 수익률</div>
              <div className={`font-mono font-bold ${topETF.return_1d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {topETF.return_1d > 0 ? '+' : ''}{topETF.return_1d.toFixed(2)}%
              </div>
            </div>
            <div className="bg-blue-950/40 p-2 sm:p-0 rounded sm:bg-transparent">
              <div className="text-blue-300 text-xs sm:text-sm uppercase">5일 수익률</div>
              <div className={`font-mono font-bold ${topETF.return_5d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {topETF.return_5d > 0 ? '+' : ''}{topETF.return_5d.toFixed(2)}%
              </div>
            </div>
            <div className="bg-blue-950/40 p-2 sm:p-0 rounded sm:bg-transparent">
              <div className="text-blue-300 text-xs sm:text-sm uppercase">20일 수익률</div>
              <div className={`font-mono font-bold ${topETF.return_20d >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {topETF.return_20d > 0 ? '+' : ''}{topETF.return_20d?.toFixed(2)}%
              </div>
            </div>
            <div className="bg-blue-950/40 p-2 sm:p-0 rounded sm:bg-transparent col-span-2 md:col-span-1">
              <div className="text-blue-300 text-xs sm:text-sm uppercase">{criteria === 'sharpe' ? '샤프 지수' : '모멘텀 총점'}</div>
              <div className="font-mono text-yellow-300 font-bold text-lg sm:text-base">{topETF.final_score.toFixed(2)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4">
            <h3 className="text-xl font-bold">📈 모멘텀 스위칭 전략 백테스트 (Base = 100)</h3>
            <div className="flex flex-wrap gap-1 mt-3 md:mt-0 bg-gray-900 p-1 rounded-lg w-full md:w-auto">
              {periodOptions.map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`flex-1 md:flex-none px-2.5 py-1.5 md:py-1 text-xs md:text-sm font-bold rounded-md transition-colors whitespace-nowrap ${
                    period === p 
                      ? 'bg-blue-600 text-white shadow' 
                      : 'text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          
          {chartData.length > 0 ? (
            <div className="h-[400px] xl:h-[500px] w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{fill: '#9ca3af'}} minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  
                  {/* 구간별 채택 ETF 배경 표시 */}
                  {referenceAreas.map((area, idx) => (
                    <ReferenceArea 
                      key={idx} 
                      x1={area.start} 
                      x2={area.end} 
                      fill={area.color} 
                      fillOpacity={0.15} 
                      label={{ position: 'insideTop', value: area.etf, fill: '#fff', fontSize: 10, fontWeight: 'bold' }} 
                    />
                  ))}

                  {/* 개별 ETF 라인 (얇게) */}
                  {etfTickers.map((ticker) => (
                    <Line 
                      key={ticker}
                      type="monotone" 
                      dataKey={ticker} 
                      stroke={ETF_COLORS[ticker] || '#8884d8'} 
                      strokeWidth={1}
                      dot={false}
                      opacity={0.4}
                    />
                  ))}

                  {/* 전략 수익률 라인 (두껍게) */}
                  <Line 
                    type="monotone" 
                    dataKey="Strategy" 
                    name="전략 수익률"
                    stroke="#fbbf24" 
                    strokeWidth={4} 
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[400px] xl:h-[500px] w-full flex items-center justify-center text-gray-500">
              데이터가 충분하지 않습니다.
            </div>
          )}
          <p className="text-sm text-gray-400 mt-2 text-center">
            배경 색상 구간은 해당 기간 동안 모멘텀 랭킹 1위로 선정되어 투자된 ETF를 나타냅니다. (시작점 = 100 기준 정규화)
          </p>
        </div>

        {/* 현재 추천 ETF 단독 차트 */}
        <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
          <div className="flex flex-col md:flex-row justify-between items-center mb-4 h-auto md:h-8">
            <h3 className="text-xl font-bold flex items-center flex-wrap gap-2">
              📈 현재 1위 ETF ({topETF.ticker}) 추이
              {isCash && <span className="text-red-400 text-sm whitespace-nowrap bg-red-900/20 px-2 py-0.5 rounded border border-red-900">- 스코어 미달로 CASH 권장</span>}
            </h3>
          </div>
          
          {chartData.length > 0 ? (
            <div className="h-[400px] xl:h-[500px] w-full text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="date" stroke="#9ca3af" tick={{fill: '#9ca3af'}} minTickGap={30} />
                  <YAxis domain={['auto', 'auto']} stroke="#9ca3af" tick={{fill: '#9ca3af'}} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  
                  <Line 
                    type="monotone" 
                    dataKey={topETF.ticker} 
                    name={`${topETF.ticker} 수익률`}
                    stroke={ETF_COLORS[topETF.ticker] || '#3b82f6'} 
                    strokeWidth={4} 
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[400px] xl:h-[500px] w-full flex items-center justify-center text-gray-500">
              데이터가 충분하지 않습니다.
            </div>
          )}
          <p className="text-sm text-gray-400 mt-2 text-center">
            현재 모멘텀 랭킹 1위인 {topETF.ticker}의 해당 기간 단독 수익률(Base=100)입니다.
          </p>
        </div>
      </div>

      <h3 className="text-lg sm:text-xl font-bold mb-4 border-b border-gray-700 pb-2 mt-8">🌐 글로벌 ETF 모멘텀 랭킹 (최신 기준: {topETF.last_updated})</h3>
      <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full min-w-[700px] text-left border-collapse whitespace-nowrap">
          <thead>
            <tr className="bg-gray-800 text-gray-300">
              <th className="p-3 border-b border-gray-700 font-medium">순위</th>
              <th className="p-3 border-b border-gray-700 font-medium">티커</th>
              <th className="p-3 border-b border-gray-700 font-medium">ETF명</th>
              <th className="p-3 border-b border-gray-700 font-medium text-right">현재가 (USD)</th>
              <th className="p-3 border-b border-gray-700 font-medium text-right">1일 수익률</th>
              <th className="p-3 border-b border-gray-700 font-medium text-right">5일 수익률</th>
              <th className="p-3 border-b border-gray-700 font-medium text-right">20일 수익률</th>
              {criteria === 'sharpe' && <th className="p-3 border-b border-gray-700 font-medium text-right">모멘텀 총점</th>}
              <th className="p-3 border-b border-gray-700 font-medium text-right">{criteria === 'sharpe' ? '샤프 지수' : '모멘텀 총점'}</th>
            </tr>
          </thead>
          <tbody className="font-mono text-sm">
            {data.map((etf, index) => (
              <tr key={etf.ticker} className={`hover:bg-gray-800 transition-colors ${index === 0 ? 'bg-indigo-900/30' : 'border-b border-gray-800/50'}`}>
                <td className="p-3 text-center">{index + 1}</td>
                <td className="p-3 font-bold" style={{ color: ETF_COLORS[etf.ticker] || '#fbbf24' }}>{etf.ticker}</td>
                <td className="p-3 text-gray-300 font-sans">{etf.name}</td>
                <td className="p-3 text-right">${etf.current_price.toFixed(2)}</td>
                <td className={`p-3 text-right ${etf.return_1d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {etf.return_1d > 0 ? '+' : ''}{etf.return_1d.toFixed(2)}%
                </td>
                <td className={`p-3 text-right ${etf.return_5d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {etf.return_5d > 0 ? '+' : ''}{etf.return_5d.toFixed(2)}%
                </td>
                <td className={`p-3 text-right ${etf.return_20d >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {etf.return_20d > 0 ? '+' : ''}{etf.return_20d?.toFixed(2)}%
                </td>
                {criteria === 'sharpe' && (
                  <td className="p-3 text-right text-gray-400">
                    {etf.momentum_score.toFixed(2)}
                  </td>
                )}
                <td className="p-3 text-right font-bold text-blue-300">
                  {etf.final_score.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
