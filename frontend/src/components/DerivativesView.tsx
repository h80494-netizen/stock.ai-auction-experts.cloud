import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createChart, ColorType, CrosshairMode, LineSeries, HistogramSeries, CandlestickSeries } from 'lightweight-charts';
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from 'recharts';

export default function DerivativesView() {
  const [basisData, setBasisData] = useState<any[]>([]);
  const [foreignNetBuy, setForeignNetBuy] = useState<any[]>([]);
  const [investors, setInvestors] = useState<any>(null);
  const [program, setProgram] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [fnbPeriodDays, setFnbPeriodDays] = useState<30 | 60>(30);
  const [showCumOverlay, setShowCumOverlay] = useState<boolean>(true);

  const basisChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [basisRes, fnbRes, invRes, progRes] = await Promise.allSettled([
          fetch('/api/market/basis-chart').then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText))),
          fetch('/api/market/foreign-net-buy?days=60').then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText))),
          fetch('/api/market/investors').then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText))),
          fetch('/api/market/program').then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText))),
        ]);

        if (basisRes.status === 'fulfilled') setBasisData(Array.isArray(basisRes.value) ? basisRes.value : []);
        if (fnbRes.status === 'fulfilled') setForeignNetBuy(Array.isArray(fnbRes.value) ? fnbRes.value : []);
        if (invRes.status === 'fulfilled') setInvestors(invRes.value);
        if (progRes.status === 'fulfilled') setProgram(progRes.value);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useBasisChartRender(basisChartRef, basisData);

  const displayedForeignSeries = useMemo(() => {
    const sorted = [...foreignNetBuy].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const sliced = sorted.slice(-fnbPeriodDays);
    let runningCum = 0;
    return sliced.map((d) => {
      const dailyEok = Number(d.daily_net_buy_eok ?? d.daily_net_buy ?? 0);
      runningCum = Number((runningCum + dailyEok).toFixed(1));
      return {
        ...d,
        shortDate: String(d.date || '').slice(5),
        daily_net_buy_eok: dailyEok,
        period_cum_eok: runningCum,
        k200_index: Number(d.k200_index || d.kospi_index || 0),
        kospi_index: Number(d.kospi_index || 0),
        futures_foreign_net: Number(d.futures_foreign_net || 0),
      };
    });
  }, [foreignNetBuy, fnbPeriodDays]);

  const fnbStats = useMemo(() => {
    if (!displayedForeignSeries.length) {
      return { latestDaily: 0, latestDate: '-', sumPeriod: 0, buyDays: 0, sellDays: 0, latestFutNet: 0 };
    }
    const last = displayedForeignSeries[displayedForeignSeries.length - 1];
    const sumPeriod = displayedForeignSeries.reduce((acc, r) => acc + r.daily_net_buy_eok, 0);
    const buyDays = displayedForeignSeries.filter((r) => r.daily_net_buy_eok > 0).length;
    const sellDays = displayedForeignSeries.filter((r) => r.daily_net_buy_eok < 0).length;
    return {
      latestDaily: Number(last.daily_net_buy_eok.toFixed(1)),
      latestDate: last.date,
      sumPeriod: Number(sumPeriod.toFixed(1)),
      buyDays,
      sellDays,
      latestFutNet: last.futures_foreign_net,
    };
  }, [displayedForeignSeries]);

  if (loading) {
    return <div className="p-10 text-center text-gray-500">Loading Derivatives Data...</div>;
  }

  return (
    <div className="flex h-full bg-[#0a0a0a] text-gray-200 overflow-y-auto">
      <div className="flex-1 p-6 flex flex-col gap-6">
        <h2 className="text-3xl font-black mb-2 text-teal-400">시장 지수 & 선물 베이시스 (Basis)</h2>

        {/* Basis Minute Chart */}
        <div className="bg-[#111] p-4 rounded-lg border border-gray-800 flex flex-col">
          <h3 className="text-xl font-bold mb-2">KOSPI 200 현선물 1분봉 및 베이시스 추이</h3>
          <div ref={basisChartRef} className="w-full h-[300px] relative" />
        </div>

        {/* Foreign Net Buy Daily Chart */}
        <div className="bg-[#111] p-4 rounded-lg border border-gray-800 flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                <span>일자별 외국인 현물 순매수 추이 (최근 {fnbPeriodDays}거래일)</span>
                <span className="text-xs px-2 py-0.5 rounded bg-teal-950/80 border border-teal-500/50 text-teal-300 font-mono">
                  기준일: {fnbStats.latestDate}
                </span>
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                막대(좌축): 외국인 현물 일별 순매수(억 원, 양수=빨강 순매수 / 음수=청록 순매도) · 노란 실선(우축): KOSPI200 지수 추이
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
              <div className="px-2.5 py-1 rounded bg-gray-900 border border-gray-700">
                당일 외인현물:{' '}
                <strong className={fnbStats.latestDaily >= 0 ? 'text-red-400' : 'text-teal-400'}>
                  {fnbStats.latestDaily >= 0 ? '+' : ''}
                  {fnbStats.latestDaily.toLocaleString()}억
                </strong>
              </div>
              <div className="px-2.5 py-1 rounded bg-gray-900 border border-gray-700">
                {fnbPeriodDays}일 누적:{' '}
                <strong className={fnbStats.sumPeriod >= 0 ? 'text-red-400' : 'text-teal-400'}>
                  {fnbStats.sumPeriod >= 0 ? '+' : ''}
                  {fnbStats.sumPeriod.toLocaleString()}억
                </strong>
                <span className="text-gray-400 ml-1">
                  ({fnbStats.buyDays}승 / {fnbStats.sellDays}패)
                </span>
              </div>
              <div className="flex items-center bg-gray-900 border border-gray-700 rounded p-0.5">
                <button
                  type="button"
                  onClick={() => setFnbPeriodDays(30)}
                  className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                    fnbPeriodDays === 30 ? 'bg-teal-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  최근 30일
                </button>
                <button
                  type="button"
                  onClick={() => setFnbPeriodDays(60)}
                  className={`px-2.5 py-1 rounded font-bold cursor-pointer ${
                    fnbPeriodDays === 60 ? 'bg-teal-600 text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  최근 60일
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowCumOverlay(v => !v)}
                className={`px-2.5 py-1 rounded border font-bold cursor-pointer ${
                  showCumOverlay
                    ? 'bg-purple-950/70 border-purple-500 text-purple-200'
                    : 'bg-gray-900 border-gray-700 text-gray-400'
                }`}
              >
                {showCumOverlay ? '☑ 누적순매수선 표시' : '☐ 누적순매수선 숨김'}
              </button>
            </div>
          </div>

          <div className="w-full h-[320px] text-xs font-mono">
            {displayedForeignSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={displayedForeignSeries} margin={{ top: 12, right: 18, left: 6, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="shortDate" stroke="#9ca3af" tick={{ fontSize: 11 }} minTickGap={16} />
                  <YAxis
                    yAxisId="left"
                    stroke="#9ca3af"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `${Number(v).toLocaleString()}억`}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    domain={['auto', 'auto']}
                    stroke="#facc15"
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload || !payload.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-[#0b101b] border border-gray-700 rounded-xl p-3 shadow-2xl text-xs font-mono space-y-1.5">
                          <div className="font-extrabold text-teal-300 border-b border-gray-800 pb-1">
                            📅 {d.date} 외국인 현·선물 수급 현황
                          </div>
                          <div className={d.daily_net_buy_eok >= 0 ? 'text-red-400 font-bold' : 'text-teal-300 font-bold'}>
                            ■ 외국인 현물 일별 순매수: {d.daily_net_buy_eok >= 0 ? '+' : ''}
                            {d.daily_net_buy_eok.toLocaleString()}억 원
                          </div>
                          <div className="text-purple-300 font-bold">
                            ■ 기간 누적 현물 순매수: {d.period_cum_eok >= 0 ? '+' : ''}
                            {d.period_cum_eok.toLocaleString()}억 원
                          </div>
                          <div className="text-yellow-300 font-bold">
                            ■ KOSPI200 지수: {d.k200_index.toLocaleString()} pt (환산 KOSPI {d.kospi_index.toLocaleString()})
                          </div>
                          <div className="text-gray-300 text-[11px] border-t border-gray-800 pt-1">
                            선물 외국인: {d.futures_foreign_net >= 0 ? '+' : ''}
                            {d.futures_foreign_net.toLocaleString()}계약 · 프로그램차익:{' '}
                            {Number(d.program_arb_eok || 0) >= 0 ? '+' : ''}
                            {Number(d.program_arb_eok || 0).toLocaleString()}억
                          </div>
                        </div>
                      );
                    }}
                  />
                  <Legend />
                  <ReferenceLine yAxisId="left" y={0} stroke="#4b5563" strokeDasharray="3 3" />
                  <Bar
                    yAxisId="left"
                    dataKey="daily_net_buy_eok"
                    name="외국인 현물 일별 순매수(억)"
                    barSize={14}
                  >
                    {displayedForeignSeries.map((entry, idx) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={entry.daily_net_buy_eok >= 0 ? '#ef5350' : '#26a69a'}
                      />
                    ))}
                  </Bar>
                  {showCumOverlay && (
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="period_cum_eok"
                      name="기간 누적 외인 현물순매수(억)"
                      stroke="#c084fc"
                      strokeWidth={2}
                      dot={false}
                    />
                  )}
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="k200_index"
                    name="KOSPI 200 지수(우축)"
                    stroke="#facc15"
                    strokeWidth={2.5}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-500">
                외국인 순매수 데이터를 불러오는 중입니다...
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-2">
          {/* Program Trading */}
          {program && (
            <div className="bg-[#111] p-4 rounded-lg border border-gray-800">
              <h3 className="text-xl font-bold mb-4 text-teal-400">프로그램 매매 동향 (순매수)</h3>
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="py-2 text-left">시장</th>
                    <th className="py-2">차익 순매수</th>
                    <th className="py-2">비차익 순매수</th>
                    <th className="py-2">합계</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {Object.keys(program).map((market) => {
                    const p = program[market];
                    const arb_net = p.arbitrage_buy - p.arbitrage_sell;
                    const non_arb_net = p.non_arbitrage_buy - p.non_arbitrage_sell;
                    const total = arb_net + non_arb_net;
                    return (
                      <tr key={market} className="border-b border-gray-800">
                        <td className="py-3 text-left font-sans font-bold">{market}</td>
                        <td className={arb_net > 0 ? 'text-red-400' : 'text-blue-400'}>{arb_net > 0 ? '+' : ''}{arb_net.toLocaleString()}</td>
                        <td className={non_arb_net > 0 ? 'text-red-400' : 'text-blue-400'}>{non_arb_net > 0 ? '+' : ''}{non_arb_net.toLocaleString()}</td>
                        <td className={`font-bold ${total > 0 ? 'text-red-500' : 'text-blue-500'}`}>{total > 0 ? '+' : ''}{total.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-right text-xs text-gray-500 mt-2">(단위: 백만원)</div>
            </div>
          )}

          {/* Investor Trends */}
          {investors && (
            <div className="bg-[#111] p-4 rounded-lg border border-gray-800">
              <h3 className="text-xl font-bold mb-4 text-teal-400">투자주체별 매매 동향 (순매수)</h3>
              <table className="w-full text-right text-sm">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="py-2 text-left">시장</th>
                    <th className="py-2">개인</th>
                    <th className="py-2">외국인</th>
                    <th className="py-2">기관</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {Object.keys(investors).map((market) => {
                    const inv = investors[market];
                    return (
                      <tr key={market} className="border-b border-gray-800">
                        <td className="py-3 text-left font-sans font-bold">{market}</td>
                        <td className={inv.retail > 0 ? 'text-red-400' : 'text-blue-400'}>{inv.retail > 0 ? '+' : ''}{inv.retail.toLocaleString()}</td>
                        <td className={inv.foreign > 0 ? 'text-red-400' : 'text-blue-400'}>{inv.foreign > 0 ? '+' : ''}{inv.foreign.toLocaleString()}</td>
                        <td className={inv.institutional > 0 ? 'text-red-400' : 'text-blue-400'}>{inv.institutional > 0 ? '+' : ''}{inv.institutional.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="text-right text-xs text-gray-500 mt-2">(단위: 백만원 / 억)</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function useBasisChartRender(basisChartRef: any, basisData: any[]) {
  useEffect(() => {
    let basisChart: any = null;

    const chartOptions = {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true }
    };

    if (basisChartRef.current && basisData.length > 0) {
      basisChartRef.current.innerHTML = '';
      basisChart = createChart(basisChartRef.current, {
        ...chartOptions,
        width: basisChartRef.current.clientWidth || 800,
        height: basisChartRef.current.clientHeight || 300,
      });

      const futuresSeries = basisChart.addSeries(CandlestickSeries, {
        upColor: '#F44336', downColor: '#2196F3', borderVisible: false,
        wickUpColor: '#F44336', wickDownColor: '#2196F3'
      });
      futuresSeries.setData(basisData.map((d: any) => ({
        time: d.time,
        open: d.fut_open,
        high: d.fut_high,
        low: d.fut_low,
        close: d.fut_close
      })));

      const cashSeries = basisChart.addSeries(LineSeries, { color: '#FF6D00', title: '현물(KOSPI200)', lineWidth: 2 });
      cashSeries.setData(basisData.map((d: any) => ({ time: d.time, value: d.cash_close })));

      const basisSeries = basisChart.addSeries(LineSeries, { color: '#00E676', title: '베이시스', lineWidth: 2, priceScaleId: 'left' });
      basisSeries.setData(basisData.map((d: any) => ({ time: d.time, value: d.basis })));

      basisChart.priceScale('left').applyOptions({
        visible: true,
        borderColor: '#1a1a1a',
      });
      basisChart.priceScale('right').applyOptions({
        borderColor: '#1a1a1a',
      });
      basisChart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (basisChart && basisChartRef.current) {
        basisChart.applyOptions({ width: basisChartRef.current.clientWidth });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (basisChart) basisChart.remove();
    };
  }, [basisData]);
}
