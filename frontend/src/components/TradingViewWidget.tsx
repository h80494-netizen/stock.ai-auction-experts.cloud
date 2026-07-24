"use client";

import React, { useEffect, useRef, memo, useState } from "react";

function TradingViewWidget({ symbol, defaultInterval = "D" }: { symbol: string, defaultInterval?: string }) {
  const container = useRef<HTMLDivElement>(null);
  
  const isKrx = symbol.endsWith(".KS") || symbol.endsWith(".KQ") || symbol.startsWith("KRX:") || /^\d{6}$/.test(symbol);
  const isUS = /^[A-Z]+$/.test(symbol) && !symbol.includes(".");
  
  // interval: '1' (1min), 'D' (1 day), 'W' (1 week), 'M' (1 month), '12M' (1 year)
  // Fallback to 'D' if '1' is requested but not supported (e.g. Japanese/Chinese stocks)
  const initialInterval = (defaultInterval === '1' && !isKrx && !isUS) ? 'D' : defaultInterval;
  const [interval, setInterval] = useState<string>(initialInterval);
  
  // For KRX, TradingView free widget does not support intraday ('1' min) charts and falls back to a US stock.
  // We must use Naver Image automatically if interval is '1' for KRX stocks.
  const [useNaverForKrx, setUseNaverForKrx] = useState<boolean>(false);

  const shouldRenderNaver = isKrx;

  const getNaverImageUrl = () => {
    const code = symbol.replace("KRX:", "").replace(".KS", "").replace(".KQ", "");
    // Add timestamp to prevent browser caching of real-time images
    const ts = new Date().getTime();
    if (interval === '1') return `https://ssl.pstatic.net/imgfinance/chart/item/area/day/${code}.png?sidcode=${ts}`;
    if (interval === 'W') return `https://ssl.pstatic.net/imgfinance/chart/item/candle/week/${code}.png?sidcode=${ts}`;
    if (interval === 'M') return `https://ssl.pstatic.net/imgfinance/chart/item/candle/month/${code}.png?sidcode=${ts}`;
    if (interval === '12M') return `https://ssl.pstatic.net/imgfinance/chart/item/area/year/${code}.png?sidcode=${ts}`; // Naver doesn't have candle/year
    return `https://ssl.pstatic.net/imgfinance/chart/item/candle/day/${code}.png?sidcode=${ts}`; // Default (D) is daily candle
  };

  // Convert symbol for TradingView compatibility
  let tvSymbol = symbol.toUpperCase();
  if (tvSymbol.endsWith(".KS") || tvSymbol.endsWith(".KQ")) {
    tvSymbol = "KRX:" + tvSymbol.split(".")[0];
  } else if (/^\d{4}$/.test(tvSymbol)) {
    // TradingView generally uses TSE for Tokyo Stock Exchange, but it can be ambiguous
    tvSymbol = "TSE:" + tvSymbol;
  } else if (/^\d{6}$/.test(tvSymbol)) {
    tvSymbol = tvSymbol.startsWith('6') ? "SSE:" + tvSymbol : "SZSE:" + tvSymbol;
  } else if (tvSymbol.endsWith(".SS")) tvSymbol = "SSE:" + tvSymbol.replace(".SS", "");
  else if (tvSymbol.endsWith(".SZ")) tvSymbol = "SZSE:" + tvSymbol.replace(".SZ", "");
  else if (tvSymbol.endsWith(".T")) tvSymbol = "TSE:" + tvSymbol.replace(".T", ""); // Tokyo Stock Exchange
  else if (tvSymbol.endsWith(".DE")) tvSymbol = "XETR:" + tvSymbol.replace(".DE", "");
  else if (tvSymbol.endsWith(".PA")) tvSymbol = "EURONEXT:" + tvSymbol.replace(".PA", "");
  else if (tvSymbol.endsWith(".AS")) tvSymbol = "EURONEXT:" + tvSymbol.replace(".AS", "");
  else if (tvSymbol.endsWith(".L")) tvSymbol = "LSE:" + tvSymbol.replace(".L", "");
  else if (tvSymbol.endsWith(".HK")) tvSymbol = "HKEX:" + tvSymbol.replace(".HK", "");
  
  if (tvSymbol.startsWith("US:")) tvSymbol = tvSymbol.replace("US:", "");

  const safeContainerId = `tv_${tvSymbol.replace(/[^a-zA-Z0-9]/g, '_')}_${interval}`;

  useEffect(() => {
    if (shouldRenderNaver) return; // Don't load TradingView script if using Naver image

    if (!container.current) return;
    container.current.innerHTML = "";

    const loadWidget = () => {
      if (typeof (window as any).TradingView !== 'undefined') {
        new (window as any).TradingView.widget({
          "autosize": true,
          "symbol": tvSymbol,
          "interval": interval,
          "timezone": "Asia/Seoul",
          "theme": "dark",
          "style": "1",
          "locale": "kr",
          "enable_publishing": false,
          "backgroundColor": "rgba(19, 23, 34, 1)",
          "gridColor": "rgba(42, 46, 57, 1)",
          "hide_top_toolbar": true,
          "hide_legend": true,
          "save_image": false,
          "container_id": safeContainerId
        });
      }
    };

    if (!(document.getElementById('tradingview-widget-script'))) {
      const script = document.createElement("script");
      script.id = 'tradingview-widget-script';
      script.src = "https://s3.tradingview.com/tv.js";
      script.type = "text/javascript";
      script.async = true;
      script.onload = loadWidget;
      document.head.appendChild(script);
    } else {
      loadWidget();
    }
  }, [symbol, interval, shouldRenderNaver, tvSymbol, safeContainerId]);

  const intervals = [
    { label: '분봉', value: '1' },
    { label: '일봉', value: 'D' },
    { label: '주봉', value: 'W' },
    { label: '월봉', value: 'M' },
    { label: '연봉', value: '12M' }
  ];

  return (
    <div className="flex flex-col w-full h-full bg-[#131722] border border-gray-800 rounded overflow-hidden">
      
      {/* Top Toolbar for Interval Selection */}
      <div className="flex items-center justify-between bg-[#1e222d] px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          {intervals.map(intv => {
            const isUS = /^[A-Z]+$/.test(symbol) && !symbol.includes(".");
            // Hide 1-min interval for non-US and non-KRX foreign stocks because free TradingView widget falls back to US stocks
            if (intv.value === '1' && !isKrx && !isUS) return null;
            
            return (
              <button
                key={intv.value}
                onClick={() => setInterval(intv.value)}
                className={`px-3 py-1 text-xs font-bold rounded transition-colors ${
                  interval === intv.value 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-[#2a2e39] text-gray-400 hover:bg-[#363a45] hover:text-gray-200'
                }`}
              >
                {intv.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400">{symbol}</span>
          {(symbol.startsWith("KRX:") || symbol.endsWith(".KS") || symbol.endsWith(".KQ")) && (
            <button
              onClick={() => setUseNaverForKrx(!useNaverForKrx)}
              className="text-[10px] bg-gray-800 text-gray-400 px-2 py-1 rounded hover:bg-gray-700"
            >
              {useNaverForKrx ? '트레이딩뷰 차트로 보기' : '네이버 차트로 보기'}
            </button>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 relative">
        {shouldRenderNaver ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#131722] p-4 group">
            <span className="absolute top-2 left-2 text-[10px] font-bold text-green-500 bg-gray-900 px-2 py-0.5 rounded opacity-50">Naver Finance</span>
            <img 
              src={getNaverImageUrl()} 
              alt={`${symbol} chart`} 
              className="max-w-full max-h-full object-contain filter invert hue-rotate-180 opacity-90" 
            />
          </div>
        ) : (
          <div className="tradingview-widget-container" style={{ height: "100%", width: "100%" }}>
            <div id={`tv_${tvSymbol.replace(/[^a-zA-Z0-9]/g, '_')}_${interval}`} ref={container} className="tradingview-widget-container__widget" style={{ height: "100%", width: "100%" }}></div>
          </div>
        )}
      </div>

    </div>
  );
}

export default memo(TradingViewWidget);
