"use client";

import React, { useEffect, useRef, memo, useState } from "react";
import {
  createChart,
  ColorType,
  CrosshairMode,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";

const FUTURES_COMMODITY_SYMBOLS = new Set([
  "CBOT:ZW1!",
  "CBOT:ZS1!",
  "CBOT:ZC1!",
  "ICEUS:SB1!",
  "COMEX:HG1!",
  "LME:ZSD1!",
  "LME:AHD1!",
  "NYMEX:HO1!",
  "NYMEX:RB1!",
]);

function TradingViewWidget({ symbol, defaultInterval = "D" }: { symbol: string; defaultInterval?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const commodityChartRef = useRef<HTMLDivElement>(null);
  const symbolStr = String(symbol);

  const isKrx =
    symbolStr.endsWith(".KS") ||
    symbolStr.endsWith(".KQ") ||
    symbolStr.startsWith("KRX:") ||
    /^\d{6}$/.test(symbolStr);
  const isUS = /^[A-Z]+$/.test(symbolStr) && !symbolStr.includes(".");
  const isFuturesCommodity =
    FUTURES_COMMODITY_SYMBOLS.has(symbolStr.toUpperCase()) ||
    symbolStr.startsWith("CBOT:") ||
    symbolStr.startsWith("ICEUS:") ||
    symbolStr.startsWith("COMEX:") ||
    symbolStr.startsWith("LME:");

  const initialInterval = defaultInterval === "1" && !isKrx && !isUS ? "D" : defaultInterval;
  const [interval, setInterval] = useState<string>(initialInterval);
  const [useNaverForKrx, setUseNaverForKrx] = useState<boolean>(true);
  const [commoditySeries, setCommoditySeries] = useState<any[]>([]);
  const [commodityLoading, setCommodityLoading] = useState<boolean>(false);

  const shouldRenderNaver = isKrx && useNaverForKrx;

  const getNaverImageUrl = () => {
    const code = symbolStr.replace("KRX:", "").replace(".KS", "").replace(".KQ", "");
    const ts = new Date().getTime();
    if (interval === "1") return `https://ssl.pstatic.net/imgfinance/chart/item/area/day/${code}.png?sidcode=${ts}`;
    if (interval === "W") return `https://ssl.pstatic.net/imgfinance/chart/item/candle/week/${code}.png?sidcode=${ts}`;
    if (interval === "M") return `https://ssl.pstatic.net/imgfinance/chart/item/candle/month/${code}.png?sidcode=${ts}`;
    if (interval === "12M") return `https://ssl.pstatic.net/imgfinance/chart/item/area/year/${code}.png?sidcode=${ts}`;
    return `https://ssl.pstatic.net/imgfinance/chart/item/candle/day/${code}.png?sidcode=${ts}`;
  };

  // 1) 곡물/비철금속 등 TradingView 무료 위젯이 차단하여 AAPL로 잘못 폴백되는 선물 심볼은 백엔드 /api/commodity/chart 실데이터로 렌더링
  useEffect(() => {
    if (!isFuturesCommodity) return;
    let mounted = true;
    setCommodityLoading(true);
    fetch(`/api/commodity/chart?symbol=${encodeURIComponent(symbolStr)}&period=${encodeURIComponent(interval)}`)
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((json) => {
        if (!mounted) return;
        setCommoditySeries(Array.isArray(json.data) ? json.data : []);
      })
      .catch(() => {
        if (mounted) setCommoditySeries([]);
      })
      .finally(() => {
        if (mounted) setCommodityLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isFuturesCommodity, symbolStr, interval]);

  useEffect(() => {
    if (!isFuturesCommodity || !commodityChartRef.current || commoditySeries.length === 0) return;

    commodityChartRef.current.innerHTML = "";
    const chart = createChart(commodityChartRef.current, {
      width: commodityChartRef.current.clientWidth || 520,
      height: commodityChartRef.current.clientHeight || 300,
      layout: {
        background: { type: ColorType.Solid, color: "#131722" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "rgba(42, 46, 57, 0.7)" },
        horzLines: { color: "rgba(42, 46, 57, 0.7)" },
      },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { borderColor: "#2a2e39", timeVisible: true },
      rightPriceScale: { borderColor: "#2a2e39" },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    const sorted = [...commoditySeries].sort((a, b) => String(a.time).localeCompare(String(b.time)));
    candleSeries.setData(
      sorted.map((d) => ({
        time: d.time,
        open: Number(d.open),
        high: Number(d.high),
        low: Number(d.low),
        close: Number(d.close),
      }))
    );

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol_scale",
    });
    chart.priceScale("vol_scale").applyOptions({
      scaleMargins: { top: 0.78, bottom: 0 },
    });
    volSeries.setData(
      sorted.map((d) => ({
        time: d.time,
        value: Number(d.volume || 0),
        color: Number(d.close) >= Number(d.open) ? "rgba(38, 166, 154, 0.45)" : "rgba(239, 83, 80, 0.45)",
      }))
    );

    chart.timeScale().fitContent();

    const handleResize = () => {
      if (commodityChartRef.current) {
        chart.applyOptions({
          width: commodityChartRef.current.clientWidth || 520,
          height: commodityChartRef.current.clientHeight || 300,
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [isFuturesCommodity, commoditySeries]);

  // 2) 일반 TradingView 위젯 심볼 변환
  let tvSymbol = symbolStr.toUpperCase();
  if (tvSymbol.endsWith(".KS") || tvSymbol.endsWith(".KQ")) {
    tvSymbol = "KRX:" + tvSymbol.split(".")[0];
  } else if (/^\d{6}$/.test(tvSymbol)) {
    tvSymbol = "KRX:" + tvSymbol;
  } else if (/^\d{4}$/.test(tvSymbol)) {
    tvSymbol = "TSE:" + tvSymbol;
  } else if (tvSymbol.endsWith(".SS")) tvSymbol = "SSE:" + tvSymbol.replace(".SS", "");
  else if (tvSymbol.endsWith(".SZ")) tvSymbol = "SZSE:" + tvSymbol.replace(".SZ", "");
  else if (tvSymbol.endsWith(".T")) tvSymbol = "TSE:" + tvSymbol.replace(".T", "");
  else if (tvSymbol.endsWith(".DE")) tvSymbol = "XETR:" + tvSymbol.replace(".DE", "");
  else if (tvSymbol.endsWith(".PA")) tvSymbol = "EURONEXT:" + tvSymbol.replace(".PA", "");
  else if (tvSymbol.endsWith(".AS")) tvSymbol = "EURONEXT:" + tvSymbol.replace(".AS", "");
  else if (tvSymbol.endsWith(".L")) tvSymbol = "LSE:" + tvSymbol.replace(".L", "");
  else if (tvSymbol.endsWith(".HK")) tvSymbol = "HKEX:" + tvSymbol.replace(".HK", "");

  if (tvSymbol.startsWith("US:")) tvSymbol = tvSymbol.replace("US:", "");

  const [containerId] = useState(() => `tv_${Math.random().toString(36).substring(7)}`);

  useEffect(() => {
    if (shouldRenderNaver || isFuturesCommodity) return;

    if (!container.current) return;
    container.current.innerHTML = "";

    let effectiveSymbol = tvSymbol;
    if (effectiveSymbol === "NYMEX:RB1!") effectiveSymbol = "AMEX:UGA";

    const isYieldOrMacro =
      effectiveSymbol.startsWith("FRED:") ||
      effectiveSymbol.startsWith("TVC:") ||
      effectiveSymbol.includes("10Y") ||
      effectiveSymbol.includes("03Y") ||
      effectiveSymbol.includes("02Y");
    const chartStyle = isYieldOrMacro ? "3" : "1";

    const loadWidget = () => {
      if (typeof (window as any).TradingView !== "undefined") {
        new (window as any).TradingView.widget({
          autosize: true,
          symbol: effectiveSymbol,
          interval: interval,
          timezone: "Asia/Seoul",
          theme: "dark",
          style: chartStyle,
          locale: "kr",
          enable_publishing: false,
          backgroundColor: "rgba(19, 23, 34, 1)",
          gridColor: "rgba(42, 46, 57, 1)",
          hide_top_toolbar: true,
          hide_legend: true,
          save_image: false,
          container_id: containerId,
        });
      }
    };

    if (!document.getElementById("tradingview-widget-script")) {
      const script = document.createElement("script");
      script.id = "tradingview-widget-script";
      script.src = "https://s3.tradingview.com/tv.js";
      script.type = "text/javascript";
      script.async = true;
      script.onload = () => {
        window.dispatchEvent(new Event("tradingview-loaded"));
        loadWidget();
      };
      document.head.appendChild(script);
    } else {
      if (typeof (window as any).TradingView !== "undefined") {
        loadWidget();
      } else {
        const handleScriptLoad = () => {
          loadWidget();
          window.removeEventListener("tradingview-loaded", handleScriptLoad);
        };
        window.addEventListener("tradingview-loaded", handleScriptLoad);
        return () => window.removeEventListener("tradingview-loaded", handleScriptLoad);
      }
    }
  }, [symbolStr, interval, shouldRenderNaver, isFuturesCommodity, tvSymbol, containerId]);

  const intervals = [
    { label: "분봉", value: "1" },
    { label: "일봉", value: "D" },
    { label: "주봉", value: "W" },
    { label: "월봉", value: "M" },
    { label: "연봉", value: "12M" },
  ];

  return (
    <div className="flex flex-col w-full h-full bg-[#131722] border border-gray-800 rounded overflow-hidden">
      {/* Top Toolbar for Interval Selection */}
      <div className="flex items-center justify-between bg-[#1e222d] px-4 py-2 border-b border-gray-800">
        <div className="flex items-center gap-2">
          {intervals.map((intv) => {
            if (intv.value === "1" && !isKrx && !isUS) return null;

            return (
              <button
                key={intv.value}
                onClick={() => setInterval(intv.value)}
                className={`px-3 py-1 text-xs font-bold rounded transition-colors cursor-pointer ${
                  interval === intv.value
                    ? "bg-blue-600 text-white"
                    : "bg-[#2a2e39] text-gray-400 hover:bg-[#363a45] hover:text-gray-200"
                }`}
              >
                {intv.label}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-gray-400">{symbolStr}</span>
          {isKrx && (
            <button
              onClick={() => setUseNaverForKrx(!useNaverForKrx)}
              className="text-[10px] bg-gray-800 text-gray-400 px-2 py-1 rounded hover:bg-gray-700"
            >
              {useNaverForKrx ? "트레이딩뷰 차트로 보기" : "네이버 차트로 보기"}
            </button>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="flex-1 relative">
        {shouldRenderNaver ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-[#131722] p-4 group">
            <span className="absolute top-2 left-2 text-[10px] font-bold text-green-500 bg-gray-900 px-2 py-0.5 rounded opacity-50">
              Naver Finance
            </span>
            <img
              src={getNaverImageUrl()}
              alt={`${symbol} chart`}
              className="max-w-full max-h-full object-contain filter invert hue-rotate-180 opacity-90"
            />
          </div>
        ) : isFuturesCommodity ? (
          <div className="w-full h-full relative bg-[#131722]">
            {commodityLoading && (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-400 z-10 bg-[#131722]/70">
                실시간 원자재 선물 데이터 로딩 중...
              </div>
            )}
            <div ref={commodityChartRef} className="w-full h-full" />
          </div>
        ) : (
          <div className="tradingview-widget-container" style={{ height: "100%", width: "100%" }}>
            <div
              id={containerId}
              ref={container}
              className="tradingview-widget-container__widget"
              style={{ height: "100%", width: "100%" }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TradingViewWidget);
