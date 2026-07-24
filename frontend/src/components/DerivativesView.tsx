import React, { useState, useEffect, useRef } from 'react';
import { createChart, ColorType, LineStyle, CrosshairMode, LineSeries, HistogramSeries, CandlestickSeries } from 'lightweight-charts';

export default function DerivativesView() {
  const [basisData, setBasisData] = useState<any[]>([]);
  const [foreignNetBuy, setForeignNetBuy] = useState<any[]>([]);
  const [investors, setInvestors] = useState<any>(null);
  const [program, setProgram] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const basisChartRef = useRef<HTMLDivElement>(null);
  const foreignBuyChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [basisRes, fnbRes, invRes, progRes] = await Promise.allSettled([
          fetch('/api/market/basis-chart').then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText))),
          fetch('/api/market/foreign-net-buy').then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText))),
          fetch('/api/market/investors').then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText))),
          fetch('/api/market/program').then(r => r.ok ? r.json() : Promise.reject(new Error(r.statusText))),
        ]);

        if (basisRes.status === 'fulfilled') setBasisData(basisRes.value);
        if (fnbRes.status === 'fulfilled') setForeignNetBuy(fnbRes.value);
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

  useChartRender(basisChartRef, basisData, foreignBuyChartRef, foreignNetBuy);

  if (loading) {
    return <div className="p-10 text-center text-gray-500">Loading Derivatives Data...</div>;
  }

  return (
    <div className="flex h-full bg-[#0a0a0a] text-gray-200 overflow-y-auto">
      <div className="flex-1 p-6 flex flex-col gap-6">
        <h2 className="text-3xl font-black mb-2 text-teal-400">시장 지수 & 선물 베이시스 (Basis)</h2>
        
        {/* Basis Minute Chart */}
        <div className="bg-[#111] p-4 rounded-lg border border-gray-800 flex flex-col min-h-[350px]">
          <h3 className="text-xl font-bold mb-2">KOSPI 200 현선물 1분봉 및 베이시스 추이</h3>
          <div ref={basisChartRef} className="flex-1 w-full relative" />
        </div>
        
        {/* Foreign Net Buy Daily Chart */}
        <div className="bg-[#111] p-4 rounded-lg border border-gray-800 flex flex-col min-h-[300px]">
          <h3 className="text-xl font-bold mb-2">일자별 외국인 순매수 추이 (최근 30일)</h3>
          <div ref={foreignBuyChartRef} className="flex-1 w-full relative" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
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

// Chart initialization outside component to prevent re-creation loops
function useChartRender(basisChartRef: any, basisData: any[], foreignBuyChartRef: any, foreignNetBuy: any[]) {
  useEffect(() => {
    let basisChart: any = null;
    let fnbChart: any = null;

    const chartOptions = {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#d1d4dc' },
      grid: { vertLines: { color: '#1a1a1a' }, horzLines: { color: '#1a1a1a' } },
      crosshair: { mode: CrosshairMode.Normal },
      timeScale: { timeVisible: true }
    };

    if (basisChartRef.current && basisData.length > 0) {
      basisChartRef.current.innerHTML = '';
      basisChart = createChart(basisChartRef.current, { ...chartOptions, width: basisChartRef.current.clientWidth, height: basisChartRef.current.clientHeight });
      
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

    if (foreignBuyChartRef.current && foreignNetBuy.length > 0) {
      foreignBuyChartRef.current.innerHTML = '';
      fnbChart = createChart(foreignBuyChartRef.current, { ...chartOptions, width: foreignBuyChartRef.current.clientWidth, height: foreignBuyChartRef.current.clientHeight });
      
      const histoSeries = fnbChart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: { type: 'volume' },
        priceScaleId: 'left',
      });
      
      const formattedData = foreignNetBuy.map((d: any) => ({
        time: d.date,
        value: d.daily_net_buy,
        color: d.daily_net_buy > 0 ? 'rgba(239, 83, 80, 0.8)' : 'rgba(38, 166, 154, 0.8)'
      }));
      // Need sorting by date for lightweight-charts
      formattedData.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      
      histoSeries.setData(formattedData);
      
      const lineSeries = fnbChart.addSeries(LineSeries, { color: '#FFD600', title: 'KOSPI 지수', lineWidth: 2 });
      
      const lineData = foreignNetBuy.map((d: any) => ({
        time: d.date,
        value: d.kospi_index
      })).sort((a: any, b: any) => new Date(a.time).getTime() - new Date(b.time).getTime());
      
      lineSeries.setData(lineData);

      fnbChart.priceScale('left').applyOptions({
        visible: true,
        borderColor: '#1a1a1a',
      });
      fnbChart.priceScale('right').applyOptions({
        borderColor: '#1a1a1a',
      });

      fnbChart.timeScale().fitContent();
    }

    const handleResize = () => {
      if (basisChart && basisChartRef.current) basisChart.applyOptions({ width: basisChartRef.current.clientWidth });
      if (fnbChart && foreignBuyChartRef.current) fnbChart.applyOptions({ width: foreignBuyChartRef.current.clientWidth });
    };
    
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (basisChart) basisChart.remove();
      if (fnbChart) fnbChart.remove();
    };
  }, [basisData, foreignNetBuy]);
}
