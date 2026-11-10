import React, { useMemo, useState } from 'react';
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
  const [twoScale, setTwoScale] = useState(true);

  const currency = fundamentals?.currency || 'KRW';
  const formatVal = (v: number) => {
    if (v === null || v === undefined || isNaN(v)) return '-';
    if (currency === 'USD') {
      return `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (currency !== 'KRW' && v < 1000) {
      return `${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
    }
    return `${Math.round(Number(v)).toLocaleString()}원`;
  };

  const roundSmart = (v: number) => (Math.abs(v) >= 500 ? Math.round(v) : Number(v.toFixed(2)));

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

    const lastPrice = sortedData[sortedData.length - 1].close;

    // 2. Extract and format target history (7/13 더미 배제 및 당일 평균 보장)
    const targetMap: Record<string, { value: number; text: string; count: number }> = {};

    if (fundamentals && fundamentals.target_history && Array.isArray(fundamentals.target_history)) {
      const parseTargetVal = (t: any): number => {
        if (t.value && !isNaN(t.value) && Number(t.value) > 0) {
          return Number(t.value);
        }
        if (typeof t.text === 'string') {
          const matches = t.text.match(/[\d,.]+/g);
          if (matches && matches.length > 0) {
            const numStr = matches[matches.length - 1].replace(/,/g, '');
            const val = parseFloat(numStr);
            if (!isNaN(val) && val > 0) return val;
          }
        }
        return 0;
      };

      // 동일 일자 그룹화 및 당일 평균 집계
      const groupedByDate: Record<string, { values: number[]; texts: string[] }> = {};

      for (const t of fundamentals.target_history) {
        if (!t || !t.time) continue;
        if (t.time === '2026-07-13' && (String(t.text || '').includes('저장된 목표가') || t.broker === '저장')) {
          continue;
        }

        const val = parseTargetVal(t);
        if (val <= 0 || val <= lastPrice * 0.05) continue;

        if (!groupedByDate[t.time]) {
          groupedByDate[t.time] = { values: [], texts: [] };
        }
        groupedByDate[t.time].values.push(val);
        if (t.text) groupedByDate[t.time].texts.push(t.text);
      }

      for (const [dateStr, info] of Object.entries(groupedByDate)) {
        const avgVal = roundSmart(info.values.reduce((a, b) => a + b, 0) / info.values.length);
        let summaryText = info.texts[0] || `목표가: ${avgVal.toLocaleString()}`;
        if (info.values.length > 1) {
          summaryText = `당일 평균: ${avgVal.toLocaleString()} (${info.values.length}개사 목표가)`;
        }
        targetMap[dateStr] = {
          value: avgVal,
          text: summaryText,
          count: info.values.length
        };
      }
    }

    const targetDates = Object.keys(targetMap).sort();

    // 3. 일자별 목표가 및 5일 이동평균(MA5) 스무딩 계산
    let lastValidTarget: number | null = null;
    let targetIdx = 0;

    for (const dt of targetDates) {
      if (sortedData.length > 0 && dt <= sortedData[0].time) {
        lastValidTarget = targetMap[dt].value;
      }
    }

    if (lastValidTarget === null && targetDates.length > 0) {
      lastValidTarget = targetMap[targetDates[0]].value;
    } else if (lastValidTarget === null && fundamentals?.targetMean && fundamentals.targetMean > 0) {
      lastValidTarget = roundSmart(Number(fundamentals.targetMean));
    }

    const windowSize = 5;
    const targetBuffer: number[] = [];
    if (lastValidTarget !== null) {
      targetBuffer.push(lastValidTarget);
    }

    return sortedData.map(row => {
      let isTargetDay = false;
      let dailyTargetVal: number | null = null;
      let dailyTargetText: string | null = null;

      while (targetIdx < targetDates.length && row.time >= targetDates[targetIdx]) {
        const dt = targetDates[targetIdx];
        lastValidTarget = targetMap[dt].value;
        if (dt === row.time) {
          isTargetDay = true;
          dailyTargetVal = targetMap[dt].value;
          dailyTargetText = targetMap[dt].text;
        }
        targetIdx++;
      }

      if (lastValidTarget !== null) {
        targetBuffer.push(lastValidTarget);
        if (targetBuffer.length > windowSize) {
          targetBuffer.shift();
        }
      }

      const ma5 = targetBuffer.length > 0
        ? roundSmart(targetBuffer.reduce((a, b) => a + b, 0) / targetBuffer.length)
        : null;

      return {
        ...row,
        targetDaily: isTargetDay ? dailyTargetVal : null,
        targetDailyText: isTargetDay ? dailyTargetText : null,
        targetPriceMA5: ma5,
        targetPrice: ma5
      };
    });
  }, [data, fundamentals]);

  const formattedPrice = currentPrice !== undefined ? Number(currentPrice).toLocaleString() : '';
  const priceColor = changePct !== undefined ? (changePct > 0 ? 'text-red-500' : (changePct < 0 ? 'text-blue-500' : 'text-gray-400')) : 'text-gray-400';
  const sign = changePct !== undefined && changePct > 0 ? '+' : '';

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload || {};
      const closeVal = Number(dataPoint.close || 0);
      const targetVal = dataPoint.targetPriceMA5 !== null && dataPoint.targetPriceMA5 !== undefined
        ? Number(dataPoint.targetPriceMA5)
        : 0;
      const gapPct = closeVal > 0 && targetVal > 0 ? ((targetVal / closeVal) - 1) * 100 : null;

      return (
        <div className="bg-gray-900/95 border border-gray-700 p-3 rounded shadow-xl z-50 text-xs min-w-[220px]">
          <p className="text-gray-300 font-bold mb-2 pb-1 border-b border-gray-800">{label}</p>
          {dataPoint.close !== undefined && (
            <p className="text-blue-400 flex justify-between py-0.5 gap-4">
              <span>종가 (좌축):</span>
              <strong className="font-mono">{formatVal(dataPoint.close)}</strong>
            </p>
          )}
          {dataPoint.targetPriceMA5 !== undefined && dataPoint.targetPriceMA5 !== null && (
            <p className="text-yellow-400 flex justify-between py-0.5 gap-4">
              <span>목표가 5일 이평 (우축):</span>
              <strong className="font-mono">{formatVal(dataPoint.targetPriceMA5)}</strong>
            </p>
          )}
          {gapPct !== null && (
            <p className="text-emerald-400 flex justify-between py-0.5 gap-4 border-t border-gray-800/70 mt-1 pt-1">
              <span>목표가 괴리율:</span>
              <strong className="font-mono">{gapPct >= 0 ? '+' : ''}{gapPct.toFixed(1)}%</strong>
            </p>
          )}
          {dataPoint.targetDaily !== undefined && dataPoint.targetDaily !== null && (
            <div className="mt-1 pt-1 border-t border-gray-800 text-orange-400">
              <div className="flex justify-between font-bold gap-4">
                <span>당일 발표 목표가:</span>
                <span className="font-mono">{formatVal(dataPoint.targetDaily)}</span>
              </div>
              {dataPoint.targetDailyText && (
                <div className="text-[10px] text-gray-400 mt-0.5">{dataPoint.targetDailyText}</div>
              )}
            </div>
          )}
        </div>
      );
    }
    return null;
  };

  if (!chartData || chartData.length === 0) {
    return <div className="w-full h-full flex items-center justify-center text-gray-500">데이터가 없습니다</div>;
  }

  // 1) 좌측 Y축 전용 스케일 (종가 변화 극대화)
  const priceValues = chartData.map(d => d.close).filter((v): v is number => typeof v === 'number' && isFinite(v));
  const minP = Math.min(...priceValues);
  const maxP = Math.max(...priceValues);
  const spreadP = maxP - minP;
  const padP = spreadP > 0 ? Math.max(spreadP * 0.08, minP * 0.004) : Math.max(minP * 0.03, 1);
  const priceDomain: [number, number] = [
    Number(Math.max(0, minP - padP).toFixed(2)),
    Number((maxP + padP).toFixed(2))
  ];

  // 2) 우측 Y축 전용 스케일 (주가와 갭이 커도 목표가 변화를 화면 전체 높이로 크게 확대)
  const targetValues = chartData
    .flatMap(d => [d.targetPriceMA5, d.targetDaily])
    .filter((v): v is number => v !== null && v !== undefined && typeof v === 'number' && isFinite(v) && v > 0);

  let targetDomain: [number, number] = priceDomain;
  if (targetValues.length > 0) {
    const minT = Math.min(...targetValues);
    const maxT = Math.max(...targetValues);
    const spreadT = maxT - minT;
    const padT = spreadT > 0 ? Math.max(spreadT * 0.12, minT * 0.003) : Math.max(minT * 0.03, 1);
    targetDomain = [
      Number(Math.max(0, minT - padT).toFixed(2)),
      Number((maxT + padT).toFixed(2))
    ];
  }

  // 단일 스케일 토글용 통합 도메인
  const allValues = priceValues.concat(targetValues);
  const minAll = Math.min(...allValues);
  const maxAll = Math.max(...allValues);
  const padAll = Math.max((maxAll - minAll) * 0.1, minAll * 0.02, 1);
  const combinedDomain: [number, number] = [
    Number(Math.max(0, minAll - padAll).toFixed(2)),
    Number((maxAll + padAll).toFixed(2))
  ];

  const formatAxisTick = (val: number) => {
    if (val >= 1000000) return (val / 1000000).toFixed(2) + 'M';
    if (val >= 10000) return (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'k';
    if (val >= 1000) return Math.round(val).toLocaleString();
    if (val < 100) return Number(val).toFixed(1);
    return Math.round(val).toString();
  };

  return (
    <div className="w-full h-full relative font-sans">
      <div className="absolute top-1.5 left-3 right-3 z-10 text-gray-300 font-bold bg-black/80 px-3 py-1.5 rounded flex flex-wrap items-center justify-between gap-2 text-xs shadow border border-gray-800">
        <div className="flex flex-wrap items-center gap-3">
          <span>{symbol} (6개월 주가 vs 목표가 추이)</span>
          {currentPrice !== undefined && (
            <span className={priceColor}>
              {formattedPrice} {changePct !== undefined ? `(${sign}${changePct.toFixed(2)}%)` : ''}
            </span>
          )}
          <div className="flex items-center gap-2.5 text-[11px] font-normal text-gray-300">
            <span className="flex items-center gap-1 text-blue-400">
              <span className="w-2.5 h-0.5 bg-blue-500 inline-block"></span> 종가 (좌축)
            </span>
            <span className="flex items-center gap-1 text-yellow-300">
              <span className="w-2.5 h-0.5 bg-yellow-400 inline-block"></span> 5일 이평 목표가 (우축)
            </span>
            <span className="flex items-center gap-1 text-orange-400">
              <span className="w-2 h-2 rounded-full bg-orange-500 inline-block"></span> 증권사 목표가
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setTwoScale(prev => !prev)}
          className={`px-2.5 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer ${
            twoScale
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30'
              : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
          }`}
          title="주가와 목표가의 Y축 스케일을 분리하여 변화를 뚜렷하게 확대 표시합니다"
        >
          {twoScale ? '⚡ Two Scale ON (좌:주가 / 우:목표가)' : '단일 축 보기'}
        </button>
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={chartData}
          margin={{ top: 52, right: 12, bottom: 8, left: 8 }}
        >
          <CartesianGrid stroke="#1e222d" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            stroke="#6b7280"
            tick={{ fill: '#9ca3af', fontSize: 11 }}
            minTickGap={40}
            tickMargin={8}
          />
          {/* 좌측 Y축: 주가(종가) 전용 스케일 */}
          <YAxis
            yAxisId="left"
            orientation="left"
            width={56}
            stroke="#3b82f6"
            tick={{ fill: '#60a5fa', fontSize: 11, fontWeight: 600 }}
            domain={twoScale ? priceDomain : combinedDomain}
            tickCount={6}
            tickFormatter={formatAxisTick}
          />
          {/* 우측 Y축: AI/증권사 목표가 전용 스케일 */}
          <YAxis
            yAxisId="right"
            orientation="right"
            width={58}
            stroke="#eab308"
            tick={{ fill: '#facc15', fontSize: 11, fontWeight: 700 }}
            domain={twoScale ? targetDomain : combinedDomain}
            tickCount={6}
            tickFormatter={formatAxisTick}
          />
          <Tooltip content={<CustomTooltip />} />

          {/* 종가 영역 차트 (좌측 Y축) */}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="close"
            name="종가"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.16}
            strokeWidth={2}
            isAnimationActive={false}
          />

          {/* 5일 이동평균 스무딩 목표가 라인 (우측 Y축) */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="targetPriceMA5"
            name="목표가 (5일 이평)"
            stroke="#ffeb3b"
            strokeWidth={2.8}
            dot={false}
            activeDot={{ r: 5, fill: '#ffeb3b', stroke: '#000', strokeWidth: 2 }}
            isAnimationActive={false}
          />

          {/* 당일 증권사 발표 목표가 점 마커 (우측 Y축) */}
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="targetDaily"
            name="증권사 목표가"
            stroke="transparent"
            strokeWidth={0}
            dot={{ r: 4.5, fill: '#ff9800', stroke: '#ffffff', strokeWidth: 1.5 }}
            activeDot={{ r: 7, fill: '#e65100', stroke: '#ffffff', strokeWidth: 2 }}
            isAnimationActive={false}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
