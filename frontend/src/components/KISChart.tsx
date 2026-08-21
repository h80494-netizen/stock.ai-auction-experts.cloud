import React, { useEffect, useRef, memo } from 'react';
import { createChart, ColorType, CandlestickSeries, LineStyle, createSeriesMarkers } from 'lightweight-charts';

function KISChart({ data, symbol, fundamentals, currentPrice, changePct }: { data: any[], symbol: string, fundamentals?: any, currentPrice?: number, changePct?: number }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#1e222d' },
        horzLines: { color: '#1e222d' },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#ef5350',
      downColor: '#26a69a',
      borderVisible: false,
      wickUpColor: '#ef5350',
      wickDownColor: '#26a69a',
    });
    
    // Validate data format (time must be unique and sorted)
    if (data && Array.isArray(data) && data.length > 0) {
      try {
        // Ensure data is sorted ascending by time (works for both string and number)
        const sortedData = [...data].sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));
        
        // Remove duplicates and invalid items (NaNs)
        const validData = sortedData.filter((item) => 
          item && 
          item.time !== undefined && item.time !== null &&
          typeof item.open === 'number' && !isNaN(item.open) && 
          typeof item.high === 'number' && !isNaN(item.high) && 
          typeof item.low === 'number' && !isNaN(item.low) && 
          typeof item.close === 'number' && !isNaN(item.close)
        );
        
        const uniqueData = validData.filter((item, index, arr) => 
          index === 0 || item.time !== arr[index - 1].time
        );
        
        if (uniqueData.length > 0) {
          candlestickSeries.setData(uniqueData);
          
          if (fundamentals && fundamentals.target_history && fundamentals.target_history.length > 0) {
            const availableTimes = uniqueData.map(d => d.time);
            const targetLineData: any[] = [];
            
            // Map target history to specific times and create a line series
            fundamentals.target_history.forEach((marker: any) => {
              if (marker.value && !isNaN(marker.value)) {
                let matchTime = null;
                const exactMatch = availableTimes.find(t => t === marker.time);
                if (exactMatch) {
                   matchTime = exactMatch;
                } else {
                   const targetTime = typeof marker.time === 'string' ? new Date(marker.time).getTime() : marker.time * 1000;
                   let closestTime = null;
                   for (let i = availableTimes.length - 1; i >= 0; i--) {
                     const dataTime = typeof availableTimes[i] === 'string' ? new Date(availableTimes[i]).getTime() : availableTimes[i] * 1000;
                     if (dataTime <= targetTime) {
                        closestTime = availableTimes[i];
                        break;
                     }
                   }
                   if (closestTime) matchTime = closestTime;
                }
                
                if (matchTime) {
                   // Ensure no duplicate times for line series
                   if (!targetLineData.find(d => d.time === matchTime)) {
                      targetLineData.push({ time: matchTime, value: marker.value });
                   }
                }
              }
            });
            
            if (targetLineData.length > 0) {
               targetLineData.sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0));
               // Create Line Series for Target Prices
               const targetSeries = chart.addLineSeries({
                   color: '#ff9800',
                   lineWidth: 2,
                   lineStyle: 1, // Dotted
                   title: '목표가',
               });
               targetSeries.setData(targetLineData);
            }
          }
        }
      } catch (err) {
        console.error("Chart data formatting error:", err);
      }
    }

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(chartContainerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [data]);

  const formattedPrice = currentPrice !== undefined ? currentPrice.toLocaleString() : '';
  const priceColor = changePct !== undefined ? (changePct > 0 ? 'text-red-500' : (changePct < 0 ? 'text-blue-500' : 'text-gray-400')) : 'text-gray-400';
  const sign = changePct !== undefined && changePct > 0 ? '+' : '';

  return (
    <div className="w-full h-full relative">
      <div className="absolute top-2 left-4 z-10 text-gray-400 font-bold bg-black/50 px-2 py-1 rounded flex items-center gap-2">
        <span>{symbol} (KIS API 실시간 차트)</span>
        {currentPrice !== undefined && (
          <span className={`ml-2 text-lg ${priceColor}`}>
            {formattedPrice}원 <span className="text-sm">({sign}{changePct}%)</span>
          </span>
        )}
      </div>
      <div ref={chartContainerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

export default memo(KISChart);
