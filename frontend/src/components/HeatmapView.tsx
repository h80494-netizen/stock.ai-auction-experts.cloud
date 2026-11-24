import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';

interface HeatmapStockItem {
  ticker: string;
  cleanTicker: string;
  name: string;
  sector: string;
  market: 'US_SPX' | 'US_NDX' | 'KR' | 'ETF';
  weight: number; // 시가총액 가중치 (블록 크기용)
  price: number;
  changePct: number;
  currency: 'USD' | 'KRW';
}

// 미국 S&P 500 / NASDAQ 100 핵심 대표 섹터 및 시총 비중 베이스라인 (실시간 시세 API로 즉시 덮어씀)
const US_CORE_UNIVERSE: Omit<HeatmapStockItem, 'price' | 'changePct'>[] = [
  // AI / 반도체 (Semiconductors & AI Hardware)
  { ticker: 'NVDA', cleanTicker: 'NVDA', name: 'NVIDIA', sector: 'AI · 반도체', market: 'US_NDX', weight: 340, currency: 'USD' },
  { ticker: 'AVGO', cleanTicker: 'AVGO', name: 'Broadcom', sector: 'AI · 반도체', market: 'US_NDX', weight: 140, currency: 'USD' },
  { ticker: 'AMD', cleanTicker: 'AMD', name: 'AMD', sector: 'AI · 반도체', market: 'US_NDX', weight: 75, currency: 'USD' },
  { ticker: 'TSM', cleanTicker: 'TSM', name: 'TSMC', sector: 'AI · 반도체', market: 'US_SPX', weight: 150, currency: 'USD' },
  { ticker: 'MU', cleanTicker: 'MU', name: 'Micron', sector: 'AI · 반도체', market: 'US_NDX', weight: 55, currency: 'USD' },
  { ticker: 'QCOM', cleanTicker: 'QCOM', name: 'Qualcomm', sector: 'AI · 반도체', market: 'US_NDX', weight: 65, currency: 'USD' },
  { ticker: 'INTC', cleanTicker: 'INTC', name: 'Intel', sector: 'AI · 반도체', market: 'US_NDX', weight: 45, currency: 'USD' },
  { ticker: 'AMAT', cleanTicker: 'AMAT', name: 'Applied Materials', sector: 'AI · 반도체', market: 'US_NDX', weight: 55, currency: 'USD' },

  // 빅테크 플랫폼 & 클라우드 (Mega-Cap Tech & Cloud)
  { ticker: 'AAPL', cleanTicker: 'AAPL', name: 'Apple', sector: '빅테크 · 클라우드', market: 'US_NDX', weight: 350, currency: 'USD' },
  { ticker: 'MSFT', cleanTicker: 'MSFT', name: 'Microsoft', sector: '빅테크 · 클라우드', market: 'US_NDX', weight: 330, currency: 'USD' },
  { ticker: 'GOOGL', cleanTicker: 'GOOGL', name: 'Alphabet (Google)', sector: '빅테크 · 클라우드', market: 'US_NDX', weight: 230, currency: 'USD' },
  { ticker: 'AMZN', cleanTicker: 'AMZN', name: 'Amazon', sector: '빅테크 · 클라우드', market: 'US_NDX', weight: 220, currency: 'USD' },
  { ticker: 'META', cleanTicker: 'META', name: 'Meta Platforms', sector: '빅테크 · 클라우드', market: 'US_NDX', weight: 170, currency: 'USD' },
  { ticker: 'ORCL', cleanTicker: 'ORCL', name: 'Oracle', sector: '빅테크 · 클라우드', market: 'US_SPX', weight: 95, currency: 'USD' },
  { ticker: 'CRM', cleanTicker: 'CRM', name: 'Salesforce', sector: '빅테크 · 클라우드', market: 'US_SPX', weight: 75, currency: 'USD' },
  { ticker: 'PLTR', cleanTicker: 'PLTR', name: 'Palantir', sector: '빅테크 · 클라우드', market: 'US_NDX', weight: 70, currency: 'USD' },

  // 전기차 · 자율주행 · 소비재 (EV, Consumer & Media)
  { ticker: 'TSLA', cleanTicker: 'TSLA', name: 'Tesla', sector: '전기차 · 소비재 · 미디어', market: 'US_NDX', weight: 165, currency: 'USD' },
  { ticker: 'NFLX', cleanTicker: 'NFLX', name: 'Netflix', sector: '전기차 · 소비재 · 미디어', market: 'US_NDX', weight: 90, currency: 'USD' },
  { ticker: 'COST', cleanTicker: 'COST', name: 'Costco', sector: '전기차 · 소비재 · 미디어', market: 'US_NDX', weight: 95, currency: 'USD' },
  { ticker: 'WMT', cleanTicker: 'WMT', name: 'Walmart', sector: '전기차 · 소비재 · 미디어', market: 'US_SPX', weight: 120, currency: 'USD' },

  // 금융 · 헬스케어 · 에너지 (Finance, Healthcare & Energy)
  { ticker: 'BRK-B', cleanTicker: 'BRK-B', name: 'Berkshire Hathaway', sector: '금융 · 바이오 · 에너지', market: 'US_SPX', weight: 160, currency: 'USD' },
  { ticker: 'JPM', cleanTicker: 'JPM', name: 'JPMorgan Chase', sector: '금융 · 바이오 · 에너지', market: 'US_SPX', weight: 125, currency: 'USD' },
  { ticker: 'V', cleanTicker: 'V', name: 'Visa', sector: '금융 · 바이오 · 에너지', market: 'US_SPX', weight: 110, currency: 'USD' },
  { ticker: 'LLY', cleanTicker: 'LLY', name: 'Eli Lilly', sector: '금융 · 바이오 · 에너지', market: 'US_SPX', weight: 145, currency: 'USD' },
  { ticker: 'UNH', cleanTicker: 'UNH', name: 'UnitedHealth', sector: '금융 · 바이오 · 에너지', market: 'US_SPX', weight: 105, currency: 'USD' },
  { ticker: 'XOM', cleanTicker: 'XOM', name: 'ExxonMobil', sector: '금융 · 바이오 · 에너지', market: 'US_SPX', weight: 100, currency: 'USD' },
];

// 한국 대표 업종별 시총 상위 유니버스
const KR_CORE_UNIVERSE: Omit<HeatmapStockItem, 'price' | 'changePct'>[] = [
  { ticker: 'KRX:005930', cleanTicker: '005930', name: '삼성전자', sector: '반도체 · IT하드웨어', market: 'KR', weight: 360, currency: 'KRW' },
  { ticker: 'KRX:000660', cleanTicker: '000660', name: 'SK하이닉스', sector: '반도체 · IT하드웨어', market: 'KR', weight: 185, currency: 'KRW' },
  { ticker: 'KRX:042700', cleanTicker: '042700', name: '한미반도체', sector: '반도체 · IT하드웨어', market: 'KR', weight: 65, currency: 'KRW' },
  { ticker: 'KRX:373220', cleanTicker: '373220', name: 'LG에너지솔루션', sector: '2차전지 · 친환경', market: 'KR', weight: 140, currency: 'KRW' },
  { ticker: 'KRX:006400', cleanTicker: '006400', name: '삼성SDI', sector: '2차전지 · 친환경', market: 'KR', weight: 65, currency: 'KRW' },
  { ticker: 'KRX:051910', cleanTicker: '051910', name: 'LG화학', sector: '2차전지 · 친환경', market: 'KR', weight: 65, currency: 'KRW' },
  { ticker: 'KRX:247540', cleanTicker: '247540', name: '에코프로비엠', sector: '2차전지 · 친환경', market: 'KR', weight: 55, currency: 'KRW' },
  { ticker: 'KRX:207940', cleanTicker: '207940', name: '삼성바이오로직스', sector: '바이오 · 헬스케어', market: 'KR', weight: 130, currency: 'KRW' },
  { ticker: 'KRX:068270', cleanTicker: '068270', name: '셀트리온', sector: '바이오 · 헬스케어', market: 'KR', weight: 85, currency: 'KRW' },
  { ticker: 'KRX:196170', cleanTicker: '196170', name: '알테오젠', sector: '바이오 · 헬스케어', market: 'KR', weight: 65, currency: 'KRW' },
  { ticker: 'KRX:000270', cleanTicker: '000270', name: '기아', sector: '자동차 · 조선 · 방산', market: 'KR', weight: 95, currency: 'KRW' },
  { ticker: 'KRX:005380', cleanTicker: '005380', name: '현대차', sector: '자동차 · 조선 · 방산', market: 'KR', weight: 115, currency: 'KRW' },
  { ticker: 'KRX:012450', cleanTicker: '012450', name: '한화에어로스페이스', sector: '자동차 · 조선 · 방산', market: 'KR', weight: 75, currency: 'KRW' },
  { ticker: 'KRX:329180', cleanTicker: '329180', name: 'HD현대중공업', sector: '자동차 · 조선 · 방산', market: 'KR', weight: 65, currency: 'KRW' },
  { ticker: 'KRX:105560', cleanTicker: '105560', name: 'KB금융', sector: '금융 · 플랫폼 · 지주', market: 'KR', weight: 85, currency: 'KRW' },
  { ticker: 'KRX:055550', cleanTicker: '055550', name: '신한지주', sector: '금융 · 플랫폼 · 지주', market: 'KR', weight: 75, currency: 'KRW' },
  { ticker: 'KRX:035420', cleanTicker: '035420', name: 'NAVER', sector: '금융 · 플랫폼 · 지주', market: 'KR', weight: 75, currency: 'KRW' },
  { ticker: 'KRX:035720', cleanTicker: '035720', name: '카카오', sector: '금융 · 플랫폼 · 지주', market: 'KR', weight: 55, currency: 'KRW' },
];

// 글로벌 11대 핵심 ETF 유니버스
const ETF_CORE_UNIVERSE: Omit<HeatmapStockItem, 'price' | 'changePct'>[] = [
  { ticker: 'SPY', cleanTicker: 'SPY', name: '미국 S&P 500 (SPY)', sector: '북미 · 선진국 지수 ETF', market: 'ETF', weight: 160, currency: 'USD' },
  { ticker: 'QQQ', cleanTicker: 'QQQ', name: '미국 나스닥 100 (QQQ)', sector: '북미 · 선진국 지수 ETF', market: 'ETF', weight: 150, currency: 'USD' },
  { ticker: 'EZU', cleanTicker: 'EZU', name: '유럽 연합 (EZU)', sector: '북미 · 선진국 지수 ETF', market: 'ETF', weight: 95, currency: 'USD' },
  { ticker: 'EWJ', cleanTicker: 'EWJ', name: '일본 (EWJ)', sector: '북미 · 선진국 지수 ETF', market: 'ETF', weight: 95, currency: 'USD' },
  { ticker: 'EWA', cleanTicker: 'EWA', name: '호주 (EWA)', sector: '북미 · 선진국 지수 ETF', market: 'ETF', weight: 75, currency: 'USD' },
  { ticker: 'EWY', cleanTicker: 'EWY', name: '한국 (EWY)', sector: '신흥국 · 아시아 ETF', market: 'ETF', weight: 110, currency: 'USD' },
  { ticker: 'INDA', cleanTicker: 'INDA', name: '인도 (INDA)', sector: '신흥국 · 아시아 ETF', market: 'ETF', weight: 115, currency: 'USD' },
  { ticker: 'FXI', cleanTicker: 'FXI', name: '중국 대형주 (FXI)', sector: '신흥국 · 아시아 ETF', market: 'ETF', weight: 105, currency: 'USD' },
  { ticker: 'EWZ', cleanTicker: 'EWZ', name: '브라질 (EWZ)', sector: '신흥국 · 아시아 ETF', market: 'ETF', weight: 80, currency: 'USD' },
  { ticker: 'GLD', cleanTicker: 'GLD', name: '금 현물 (GLD)', sector: '원자재 · 안전자산 ETF', market: 'ETF', weight: 130, currency: 'USD' },
  { ticker: 'USO', cleanTicker: 'USO', name: 'WTI 원유 (USO)', sector: '원자재 · 안전자산 ETF', market: 'ETF', weight: 110, currency: 'USD' },
];

export default function HeatmapView({
  stocks = [],
  globalStocks = [],
  onNavigateToStock,
}: {
  stocks?: any[];
  globalStocks?: any[];
  onNavigateToStock?: (ticker: string) => void;
}) {
  const tvContainerRef = useRef<HTMLDivElement>(null);
  const [marketTab, setMarketTab] = useState<'US_ALL' | 'US_NDX' | 'KR' | 'ETF' | 'TV_WIDGET'>('US_ALL');
  const [tvDataSource, setTvDataSource] = useState<'SPX500' | 'NASDAQ100' | 'AllUSA' | 'KOSPI'>('SPX500');
  const [liveMap, setLiveMap] = useState<Record<string, { price: number; changePct: number }>>({});
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastUpdatedStr, setLastUpdatedStr] = useState<string>('');
  const [clickCount, setClickCount] = useState<number>(0);

  // 실시간 시세 및 주가등락률(%) 즉시 조회 함수 (탭/종목/새로고침 클릭 시마다 실시간 호출)
  const fetchRealtimeHeatmapQuotes = useCallback(async (targetTab = marketTab) => {
    setIsRefreshing(true);
    try {
      let targetItems: Omit<HeatmapStockItem, 'price' | 'changePct'>[] = [];
      if (targetTab === 'KR') {
        targetItems = KR_CORE_UNIVERSE;
      } else if (targetTab === 'ETF') {
        targetItems = ETF_CORE_UNIVERSE;
      } else {
        targetItems = US_CORE_UNIVERSE;
      }

      const tickersParam = targetItems.map((it) => it.ticker).join(',');
      const ts = Date.now();

      const requests: Promise<any>[] = [
        fetch(`/api/realtime-quotes?tickers=${encodeURIComponent(tickersParam)}&t=${ts}`, { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
      ];

      if (targetTab === 'ETF') {
        requests.push(
          fetch(`/api/etf/strategy?criteria=sharpe&top_n=1&force_refresh=true&t=${ts}`, { cache: 'no-store' })
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => [])
        );
      }

      const [quotesJson, etfStratJson] = await Promise.all(requests);

      setLiveMap((prev) => {
        const next = { ...prev };
        // 1) 부모로부터 전달된 stocks / globalStocks 반영
        [...(stocks || []), ...(globalStocks || [])].forEach((s: any) => {
          if (!s) return;
          const tk = String(s.ticker || s.symbol || '');
          const clean = tk.split(':').pop() || tk;
          const p = Number(s.price) || 0;
          const cp = Number(s.changePct ?? s.change_pct ?? 0);
          if (p > 0) {
            next[tk] = { price: p, changePct: cp };
            next[clean] = { price: p, changePct: cp };
          }
        });

        // 2) 실시간 쿼트 API 결과 덮어쓰기
        if (quotesJson && typeof quotesJson === 'object') {
          Object.keys(quotesJson).forEach((k) => {
            const q = quotesJson[k];
            if (q && Number(q.price) > 0) {
              const clean = k.split(':').pop() || k;
              next[k] = { price: Number(q.price), changePct: Number(q.changePct ?? 0) };
              next[clean] = { price: Number(q.price), changePct: Number(q.changePct ?? 0) };
            }
          });
        }

        // 3) ETF 실시간 전략 시세 반영
        if (Array.isArray(etfStratJson)) {
          etfStratJson.forEach((row: any) => {
            if (row && row.ticker && Number(row.current_price) > 0) {
              next[row.ticker] = {
                price: Number(row.current_price),
                changePct: Number(row.return_1d ?? 0),
              };
            }
          });
        }
        return next;
      });

      setLastUpdatedStr(new Date().toLocaleTimeString('ko-KR', { hour12: false }));
    } catch (e) {
      console.error('Heatmap realtime fetch error:', e);
    } finally {
      setIsRefreshing(false);
    }
  }, [marketTab, stocks, globalStocks]);

  // 탭 전환 및 주기적 자동 갱신 (클릭 시마다 즉시 실시간 갱신)
  useEffect(() => {
    fetchRealtimeHeatmapQuotes(marketTab);
    const timer = setInterval(() => {
      if (!document.hidden && marketTab !== 'TV_WIDGET') {
        fetchRealtimeHeatmapQuotes(marketTab);
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [marketTab, clickCount, fetchRealtimeHeatmapQuotes]);

  // TradingView 전체 섹터 위젯 모드 (미국 S&P 500 전용 — 불필요하거나 작동하지 않는 한국/기타 중복 버튼 제거)
  useEffect(() => {
    if (marketTab !== 'TV_WIDGET') return;
    if (tvContainerRef.current) {
      tvContainerRef.current.innerHTML = '';
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
      script.type = 'text/javascript';
      script.async = true;

      script.innerHTML = JSON.stringify({
        exchanges: [],
        dataSource: 'SPX500',
        grouping: 'sector',
        blockSize: 'market_cap_basic',
        blockColor: 'change',
        locale: 'kr',
        symbolUrl: '',
        colorTheme: 'dark',
        hasTopBar: false,
        isDataSetEnabled: false,
        isZoomEnabled: true,
        hasSymbolTooltip: true,
        isMonoSize: false,
        width: '100%',
        height: '100%',
      });
      tvContainerRef.current.appendChild(script);
    }
  }, [marketTab, clickCount]);

  // 현재 선택된 마켓의 섹터별 종목 그룹화
  const groupedSectors = useMemo(() => {
    let baseList: Omit<HeatmapStockItem, 'price' | 'changePct'>[] = [];
    if (marketTab === 'KR') {
      baseList = KR_CORE_UNIVERSE;
    } else if (marketTab === 'ETF') {
      baseList = ETF_CORE_UNIVERSE;
    } else if (marketTab === 'US_NDX') {
      baseList = US_CORE_UNIVERSE.filter((it) => it.market === 'US_NDX');
    } else {
      baseList = US_CORE_UNIVERSE;
    }

    const enriched: HeatmapStockItem[] = baseList.map((item) => {
      const matched = liveMap[item.ticker] || liveMap[item.cleanTicker];
      return {
        ...item,
        price: matched?.price ?? 0,
        changePct: matched?.changePct ?? 0,
      };
    });

    const sectorMap = new Map<string, HeatmapStockItem[]>();
    enriched.forEach((item) => {
      if (!sectorMap.has(item.sector)) {
        sectorMap.set(item.sector, []);
      }
      sectorMap.get(item.sector)!.push(item);
    });

    return Array.from(sectorMap.entries()).map(([sectorName, items]) => {
      const totalWeight = items.reduce((acc, it) => acc + it.weight, 0) || 1;
      const weightedChange =
        items.reduce((acc, it) => acc + it.changePct * it.weight, 0) / totalWeight;
      return {
        sectorName,
        items,
        avgChangePct: weightedChange,
      };
    });
  }, [marketTab, liveMap]);

  // 등락률(%)에 따른 실시간 타일 배경색 계산
  const getTileStyle = (changePct: number) => {
    if (changePct >= 3.0) {
      return 'bg-gradient-to-br from-emerald-500 to-green-700 text-white border-emerald-300 shadow-lg shadow-emerald-950/60';
    }
    if (changePct >= 1.2) {
      return 'bg-gradient-to-br from-emerald-600/90 to-green-800/90 text-white border-emerald-400/70';
    }
    if (changePct > 0.05) {
      return 'bg-emerald-900/75 text-emerald-100 border-emerald-600/60';
    }
    if (changePct <= -3.0) {
      return 'bg-gradient-to-br from-rose-600 to-red-800 text-white border-rose-300 shadow-lg shadow-rose-950/60';
    }
    if (changePct <= -1.2) {
      return 'bg-gradient-to-br from-rose-700/90 to-red-900/90 text-white border-rose-400/70';
    }
    if (changePct < -0.05) {
      return 'bg-rose-950/85 text-rose-100 border-rose-700/60';
    }
    return 'bg-gray-800/90 text-gray-200 border-gray-600';
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] w-full bg-[#050505] text-gray-200 overflow-y-auto">
      {/* 상단 컨트롤 헤더 (1시·4시 버튼 완전 제거 & 클릭 시마다 실시간 등락률 즉시 갱신) */}
      <div className="p-4 border-b border-gray-800 bg-[#111] flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3 shrink-0">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl sm:text-2xl font-extrabold text-white">
              🟩 실시간 AI 섹터·시가총액 등락 힛맵 (Real-Time Heatmap)
            </h2>
            <span className="text-xs font-bold text-emerald-300 bg-emerald-950/80 px-2.5 py-1 rounded-full border border-emerald-500/60 flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full bg-emerald-400 ${isRefreshing ? 'animate-ping' : 'animate-pulse'}`} />
              <span>실시간 주가·등락률(%) 연동중 {lastUpdatedStr && `(${lastUpdatedStr} 갱신)`}</span>
            </span>
          </div>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            불필요한 1시·4시 시간 버튼을 제거하고, <strong>마켓 탭이나 종목 타일을 클릭할 때마다 실시간 현재가 및 일간 주가등락률(%)이 즉시 갱신</strong>됩니다.
          </p>
        </div>

        {/* 마켓 선택 탭 및 즉시 갱신 버튼 */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'US_ALL', label: '🇺🇸 미국 S&P 500 · 빅테크 (실시간)' },
            { id: 'US_NDX', label: '🇺🇸 미국 NASDAQ 100 · AI반도체 (실시간)' },
            { id: 'KR', label: '🇰🇷 한국 KOSPI · KOSDAQ 대표주 (실시간)' },
            { id: 'ETF', label: '🌐 글로벌 11대 핵심 ETF (실시간)' },
            { id: 'TV_WIDGET', label: '🗺️ 글로벌 전체 섹터 맵 (일일 등락률)' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setMarketTab(tab.id as any);
                setClickCount((c) => c + 1);
              }}
              className={`px-3 py-2 rounded-lg text-xs font-extrabold transition-all cursor-pointer border ${
                marketTab === tab.id
                  ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg'
                  : 'bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <button
            onClick={() => {
              setClickCount((c) => c + 1);
              fetchRealtimeHeatmapQuotes(marketTab);
            }}
            className="px-3 py-2 rounded-lg text-xs font-extrabold bg-indigo-600 hover:bg-indigo-500 border border-indigo-400 text-white shadow-lg cursor-pointer flex items-center gap-1.5"
          >
            <span className={isRefreshing ? 'animate-spin inline-block' : ''}>⚡</span>
            <span>실시간 등락률 즉시 갱신</span>
          </button>
        </div>
      </div>

      {/* 메인 힛맵 바디 */}
      {marketTab === 'TV_WIDGET' ? (
        <div className="flex-1 flex flex-col w-full h-full p-3 space-y-2 min-h-[520px]">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-gray-900/90 px-3 py-2 rounded-lg border border-gray-800">
            <span className="text-xs text-gray-300 font-bold">
              📌 미국 S&amp;P 500 전체 섹터 트리맵 (한국 대표주 실시간 등락률은 상단 [🇰🇷 한국 KOSPI · KOSDAQ 대표주 (실시간)] 탭에서 실시간 연동됩니다)
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setClickCount((c) => c + 1)}
                className="px-3 py-1 rounded text-xs font-bold bg-blue-600 text-white cursor-pointer"
              >
                🇺🇸 미국 S&amp;P 500 전체
              </button>
            </div>
          </div>
          <div className="flex-1 w-full h-full relative rounded-lg overflow-hidden border border-gray-800" ref={tvContainerRef} />
        </div>
      ) : (
        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          {/* 등락률 범례 바 */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#0d1117] px-3.5 py-2 rounded-lg border border-gray-800 text-xs">
            <span className="text-gray-300 font-bold">
              💡 타일을 클릭하면 즉시 해당 종목의 최신 실시간 시세를 재조회하며, 더블클릭 시 상세 차트로 이동합니다.
            </span>
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-gray-400 mr-1">일간 실시간 등락률 범례:</span>
              <span className="px-2 py-0.5 rounded bg-rose-700 text-white font-bold">-3%↓</span>
              <span className="px-2 py-0.5 rounded bg-rose-900/90 text-rose-200">-1~-3%</span>
              <span className="px-2 py-0.5 rounded bg-gray-800 text-gray-300">0% 보합</span>
              <span className="px-2 py-0.5 rounded bg-emerald-900/90 text-emerald-200">+1~+3%</span>
              <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-bold">+3%↑</span>
            </div>
          </div>

          {/* 섹터별 실시간 트리맵 그리드 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {groupedSectors.map((sec) => {
              const secPos = sec.avgChangePct > 0;
              const secNeg = sec.avgChangePct < 0;
              return (
                <div
                  key={sec.sectorName}
                  className="bg-[#0e131d] border border-gray-800 rounded-xl p-3.5 shadow-xl flex flex-col space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                    <span className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                      <span>📂 {sec.sectorName}</span>
                      <span className="text-xs text-gray-400 font-normal">({sec.items.length}종목)</span>
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded font-mono text-xs font-extrabold border ${
                        secPos
                          ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-300'
                          : secNeg
                          ? 'bg-rose-950/80 border-rose-500/60 text-rose-300'
                          : 'bg-gray-800 border-gray-700 text-gray-300'
                      }`}
                    >
                      섹터 평균: {sec.avgChangePct > 0 ? '+' : ''}
                      {sec.avgChangePct.toFixed(2)}%
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 auto-rows-fr">
                    {sec.items.map((item) => {
                      const isBig = item.weight >= 160;
                      const tileCls = getTileStyle(item.changePct);
                      const priceStr =
                        item.price > 0
                          ? item.currency === 'KRW'
                            ? `${Math.round(item.price).toLocaleString()}원`
                            : `$${item.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '조회중...';

                      return (
                        <div
                          key={item.ticker}
                          onClick={() => {
                            // 클릭할 때마다 즉시 실시간 주가·등락률 재갱신
                            fetchRealtimeHeatmapQuotes(marketTab);
                          }}
                          onDoubleClick={() => {
                            if (onNavigateToStock) {
                              onNavigateToStock(item.cleanTicker);
                            }
                          }}
                          title={`${item.name} (${item.cleanTicker}) — 클릭: 실시간 등락률 즉시 갱신 / 더블클릭: 차트 이동`}
                          className={`${
                            isBig ? 'sm:col-span-2' : 'col-span-1'
                          } ${tileCls} border rounded-xl p-3 flex flex-col justify-between transition-all duration-200 hover:scale-[1.02] active:scale-95 cursor-pointer select-none min-h-[96px]`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <div>
                              <div className="text-xs sm:text-sm font-extrabold tracking-tight leading-snug">
                                {item.name}
                              </div>
                              <div className="text-[11px] font-mono opacity-80">{item.cleanTicker}</div>
                            </div>
                            <span className="px-1.5 py-0.5 rounded bg-black/30 font-mono text-[10px] font-bold">
                              {priceStr}
                            </span>
                          </div>

                          <div className="mt-2 flex items-baseline justify-between">
                            <span className="text-[10px] opacity-75">실시간 등락률</span>
                            <span className="text-base sm:text-xl font-mono font-black tracking-tight">
                              {item.changePct > 0 ? '+' : ''}
                              {item.changePct.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
