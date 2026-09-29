import React, { useMemo } from 'react';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export default function KISChart({ data, symbol, fundamentals, currentPrice, changePct }: any) {
  const chartData = useMemo(() => {
    if (!data || !Array.isArray(data) || data.length === 0) return [];
    
    // 1. Sort base candlestick data
    let sortedData = [...data].sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));
    
    // filter duplicates and NaN
    sortedData = sortedData.filter((item, index, arr) => 
      item && typeof item.close === 'number' && !isNaN(item.close) &&
      (index === 0 || item.time !== arr[index - 1].time)
    );

    if (sortedData.length === 0) return [];

    // 2. Extract and format target history
    let targets: { time: string, value: number }[] = [];
    if (fundamentals && fundamentals.target_history && Array.isArray(fundamentals.target_history)) {
      const lastPrice = sortedData[sortedData.length - 1].close;
      targets = fundamentals.target_history
        .filter((t: any) => t.value && !isNaN(t.value) && t.value > lastPrice * 0.1)
        .map((t: any) => ({ time: t.time, value: t.value }));
      targets.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));
    }

    // 3. Merge targets into the timeline using forward-fill
    let merged = sortedData.map(d => ({ ...d, targetPrice: null as number | null }));
    
    if (targets.length > 0) {
      let currentTarget = targets[0].value;
      let targetIdx = 0;
      
      merged.forEach(row => {
        // Update target if we passed a target date
        while (targetIdx < targets.length && row.time >= targets[targetIdx].time) {
          currentTarget = targets[targetIdx].value;
          targetIdx++;
        }
        row.targetPrice = currentTarget;
      });
    }

    return merged;
  }, [data, fundamentals]);

  const formattedPrice = currentPrice !== undefined ? currentPrice.toLocaleString() : '';
  const priceColor = changePct !== undefined ? (changePct > 0 ? 'text-red-500' : (changePct < 0 ? 'text-blue-500' : 'text-gray-400')) : 'text-gray-400';
  const sign = changePct !== undefined && changePct > 0 ? '+' : '';

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-gray-800 border border-gray-700 p-3 rounded shadow-lg z-50">
          <p className="text-gray-300 font-bold mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} style={{ color: entry.color }} className="text-sm">
              {entry.name}: {entry.value ? entry.value.toLocaleString() : ''}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  // If no data
  if (!chartData || chartData.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-gray-500">데이터가 없습니다</div>;
  }

  // Calculate dynamic Y-axis domain to add padding
  const allValues = chartData.map(d => d.close).concat(chartData.map(d => d.targetPrice).filter(v => v !== null) as number[]);
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const padding = (maxVal - minVal) * 0.1;
  const domainMin = Math.max(0, minVal - padding);
  const domainMax = maxVal + padding;

  return (
    <div className="w-full h-full relative font-sans">
      <div className="absolute top-2 left-4 z-10 text-gray-300 font-bold bg-black/60 px-3 py-1.5 rounded flex items-center gap-2 text-sm shadow">
        <span>{symbol} (6개월 주가 차트)</span>
        {currentPrice !== undefined && (
          <span className={priceColor}>
            {formattedPrice} {changePct !== undefined ? `(${sign}${changePct.toFixed(2)}%)` : ''}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 50, right: 30, bottom: 10, left: 10 }}
        >
          <CartesianGrid stroke="#1e222d" strokeDasharray="3 3" vertical={false} />
          <XAxis 
            dataKey="time" 
            stroke="#6b7280" 
            tick={{ fill: '#9ca3af', fontSize: 11 }} 
            minTickGap={40}
            tickMargin={10}
          />
          <YAxis 
            yAxisId="right"
            orientation="right"
            stroke="#6b7280" 
            tick={{ fill: '#9ca3af', fontSize: 11 }} 
            domain={[domainMin, domainMax]}
            tickFormatter={(val) => {
              if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
              if (val >= 1000) return (val / 1000).toFixed(0) + 'k';
              return val;
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          
          <Area 
            yAxisId="right"
            type="monotone" 
            dataKey="close" 
            name="종가" 
            stroke="#3b82f6" 
            fill="#3b82f6" 
            fillOpacity={0.15}
            strokeWidth={2}
            isAnimationActive={false}
          />
          
          <Line 
            yAxisId="right"
            type="stepAfter" 
            dataKey="targetPrice" 
            name="목표가" 
            stroke="#ffeb3b" 
            strokeWidth={3} 
            dot={false}
            activeDot={{ r: 6, fill: '#ffeb3b', stroke: '#000', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
