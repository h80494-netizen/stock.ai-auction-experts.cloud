"use client";

import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function ValuationView({ ticker, name }: { ticker: string, name: string }) {
  const [coe, setCoe] = useState<number>(0.10);
  const [discount3y, setDiscount3y] = useState<number>(0.50);
  const [termGrowth, setTermGrowth] = useState<number>(0.05);
  const [payoutRatio, setPayoutRatio] = useState<number>(0.30);
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchValuation = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/valuation/stock/${encodeURIComponent(ticker)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          coe: coe,
          discount_3y: discount3y,
          term_growth: termGrowth,
          payout_ratio: payoutRatio
        })
      });
      if (!res.ok) throw new Error(res.statusText || 'API Error');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValuation();
  }, [ticker, coe, discount3y, termGrowth, payoutRatio]);

  if (loading && !data) {
    return <div className="p-4 text-center text-gray-500 animate-pulse">가치평가 로직 계산 중...</div>;
  }

  if (!data || data.error) {
    return <div className="p-4 text-center text-red-500">{data?.error || "데이터를 불러오지 못했습니다."}</div>;
  }

  // Data for Charts
  const priceData = [
    { name: '주가 비교', '현재 주가': data.current_price, '이론 주가': data.theoretical_price }
  ];

  const projData = data.projection.map((p: any) => ({
    name: `${p.year}E`,
    '초과이익(RI)': p.ri,
    '자기자본(Equity)': p.beginning_equity,
    '현가화된 초과이익(PV of RI)': p.pv_ri
  }));

  const isUndervalued = data.theoretical_price > data.current_price;
  const upside = data.current_price > 0 ? ((data.theoretical_price / data.current_price) - 1) * 100 : 0;

  return (
    <div className="space-y-6 text-sm">
      
      {/* Simulation Controls */}
      <div className="bg-[#111] p-4 rounded border border-gray-800 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-gray-400 mb-1 text-xs font-bold">요구수익률 (COE)</label>
          <div className="flex items-center">
            <input type="range" min="0.05" max="0.20" step="0.01" value={coe} onChange={e => setCoe(parseFloat(e.target.value))} className="flex-1 mr-3" />
            <span className="w-12 text-right font-bold">{(coe * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div>
          <label className="block text-gray-400 mb-1 text-xs font-bold">3년 후 이익 할인율</label>
          <div className="flex items-center">
            <input type="range" min="0.0" max="0.9" step="0.1" value={discount3y} onChange={e => setDiscount3y(parseFloat(e.target.value))} className="flex-1 mr-3" />
            <span className="w-12 text-right font-bold">{(discount3y * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div>
          <label className="block text-gray-400 mb-1 text-xs font-bold">5년 후 영구성장률 (g)</label>
          <div className="flex items-center">
            <input type="range" min="0.01" max="0.09" step="0.01" value={termGrowth} onChange={e => setTermGrowth(parseFloat(e.target.value))} className="flex-1 mr-3" />
            <span className="w-12 text-right font-bold">{(termGrowth * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div>
          <label className="block text-gray-400 mb-1 text-xs font-bold">배당성향 (Payout Ratio)</label>
          <div className="flex items-center">
            <input type="range" min="0.0" max="1.0" step="0.05" value={payoutRatio} onChange={e => setPayoutRatio(parseFloat(e.target.value))} className="flex-1 mr-3" />
            <span className="w-12 text-right font-bold">{(payoutRatio * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {/* Summary Banner */}
      <div className={`p-4 rounded border flex items-center justify-between ${isUndervalued ? 'bg-red-900/20 border-red-800' : 'bg-blue-900/20 border-blue-800'}`}>
        <div>
          <h3 className="text-xl font-bold mb-1">{name} RIM 가치평가 결과</h3>
          <p className="text-gray-400 text-xs">
            {data.eps_2026 && data.eps_2027 ? `26년 EPS(${data.eps_2026.toLocaleString()}), 27년 EPS(${data.eps_2027.toLocaleString()}) 기준` : '최근 실적 기준'}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400">적정주가 대비 상승여력</div>
          <div className={`text-2xl font-bold ${isUndervalued ? 'text-red-500' : 'text-blue-500'}`}>
            {upside > 0 ? '+' : ''}{upside.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* 4 Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* 1. Price vs Value */}
        <div className="bg-[#0a0a0a] p-3 rounded border border-gray-800">
          <h4 className="text-gray-300 font-bold mb-4 text-center border-b border-gray-800 pb-2">현재가 vs 이론가 (RIM)</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priceData} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
                <XAxis type="number" tickFormatter={(v) => v.toLocaleString()} stroke="#666" />
                <YAxis dataKey="name" type="category" stroke="#666" width={1} hide />
                <Tooltip cursor={{fill: '#111'}} formatter={(value: any) => Number(value).toLocaleString() + '원'} />
                <Legend />
                <Bar dataKey="현재 주가" fill="#4B5563" barSize={30} />
                <Bar dataKey="이론 주가" fill={isUndervalued ? "#EF4444" : "#3B82F6"} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 2. EPS Projection */}
        <div className="bg-[#0a0a0a] p-3 rounded border border-gray-800">
          <h4 className="text-gray-300 font-bold mb-4 text-center border-b border-gray-800 pb-2">연도별 자기자본(Equity) 예상 추이</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="name" stroke="#666" />
                <YAxis stroke="#666" tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip cursor={{fill: '#111'}} formatter={(value: any) => Number(value).toLocaleString() + '원'} />
                <Bar dataKey="자기자본(Equity)" fill="#F59E0B" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Discounted RI */}
        <div className="bg-[#0a0a0a] p-3 rounded border border-gray-800">
          <h4 className="text-gray-300 font-bold mb-4 text-center border-b border-gray-800 pb-2">초과이익(RI) 현가 추이</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={projData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="name" stroke="#666" />
                <YAxis stroke="#666" tickFormatter={(v) => v.toLocaleString()} />
                <Tooltip cursor={{fill: '#111'}} formatter={(value: any) => Number(value).toLocaleString() + '원'} />
                <ReferenceLine y={0} stroke="#444" />
                <Bar dataKey="현가화된 초과이익(PV of RI)" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. BPS Projection */}
        <div className="bg-[#0a0a0a] p-3 rounded border border-gray-800">
          <h4 className="text-gray-300 font-bold mb-4 text-center border-b border-gray-800 pb-2">초과이익(RI) 예상 추이</h4>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={projData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                <XAxis dataKey="name" stroke="#666" />
                <YAxis stroke="#666" tickFormatter={(v) => v.toLocaleString()} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{backgroundColor: '#111', borderColor: '#333'}} formatter={(value: any) => Number(value).toLocaleString() + '원'} />
                <Line type="monotone" dataKey="초과이익(RI)" stroke="#10B981" strokeWidth={3} dot={{r: 4}} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* Financial Projection Table */}
      <div className="bg-[#0a0a0a] p-4 rounded border border-gray-800 mt-6">
        <h4 className="text-gray-300 font-bold mb-4 border-b border-gray-800 pb-2">가치평가 추정 테이블 (Total Equity & RIM)</h4>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-[#111] text-gray-400 border-b border-gray-800">
              <tr>
                <th className="px-4 py-2 font-medium">연도</th>
                <th className="px-4 py-2 font-medium text-right">기초 자기자본</th>
                <th className="px-4 py-2 font-medium text-right">당기순이익 (E)</th>
                <th className="px-4 py-2 font-medium text-right">배당금</th>
                <th className="px-4 py-2 font-medium text-right">예상 ROE (%)</th>
                <th className="px-4 py-2 font-medium text-right">요구수익금액</th>
                <th className="px-4 py-2 font-medium text-right">초과이익 (RI)</th>
                <th className="px-4 py-2 font-medium text-right">현가화 초과이익 (PV)</th>
              </tr>
            </thead>
            <tbody>
              {data.projection.map((p: any) => (
                <tr key={p.year} className="border-b border-gray-800 hover:bg-gray-800/50">
                  <td className="px-4 py-3 font-bold text-gray-300">{p.year}년 (E)</td>
                  <td className="px-4 py-3 text-right text-green-400 font-mono">{(p.beginning_equity / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</td>
                  <td className="px-4 py-3 text-right text-yellow-400 font-mono">{(p.net_income / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</td>
                  <td className="px-4 py-3 text-right text-red-400 font-mono">{(p.dividends / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</td>
                  <td className="px-4 py-3 text-right text-blue-300 font-mono">{Number(p.roe).toFixed(2)}%</td>
                  <td className="px-4 py-3 text-right text-gray-400 font-mono">{(p.req_return_amount / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</td>
                  <td className="px-4 py-3 text-right text-purple-300 font-mono">{(p.ri / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</td>
                  <td className="px-4 py-3 text-right text-purple-400 font-bold font-mono">{(p.pv_ri / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      
      {/* Valuation Summary Formula */}
      <div className="bg-[#1a1500] p-4 rounded border border-[#3a3000] mt-6">
        <h4 className="text-yellow-500 font-bold mb-4 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          초과이익모델 (RIM) 주주가치 산출
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3 text-gray-300 font-mono text-sm">
            <div className="flex justify-between border-b border-gray-800 pb-1">
              <span>현재 자기자본 (A):</span>
              <span className="text-green-400">{(data.current_equity / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</span>
            </div>
            <div className="flex justify-between border-b border-gray-800 pb-1">
              <span>초과이익 합계 (B):</span>
              <span className="text-purple-400">{(data.sum_pv_ri / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</span>
            </div>
            <div className="flex justify-between border-b border-gray-800 pb-1">
              <span>영구 초과이익 현가 (C):</span>
              <span className="text-blue-400">{(data.pv_terminal_value / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</span>
            </div>
            <div className="flex justify-between font-bold text-white pt-2">
              <span>총 주주가치 (A+B+C):</span>
              <span className="text-yellow-400">{(data.total_shareholder_value / 100000000).toLocaleString('ko-KR', {maximumFractionDigits:0})}억원</span>
            </div>
          </div>
          <div className="flex flex-col justify-center items-center bg-[#111] p-4 rounded border border-gray-800">
            <div className="text-gray-400 text-xs mb-2">총 주주가치 ÷ 발행주식수({data.shares.toLocaleString()}주)</div>
            <div className="text-3xl font-bold text-blue-500">{data.theoretical_price.toLocaleString('ko-KR', {maximumFractionDigits:0})}원</div>
            <div className="text-gray-500 text-xs mt-2">적정주가 (Target Price)</div>
          </div>
        </div>
      </div>

      {/* Valuation Gap Analysis */}
      <div className="bg-[#1a1500] p-4 rounded border border-[#3a3000] mt-6">
        <h4 className="text-yellow-500 font-bold mb-2 flex items-center">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          이론 주가와 실제 목표주가의 괴리율 분석
        </h4>
        <div className="text-gray-300 text-xs leading-relaxed space-y-2">
          <p>
            현재 RIM/DCF 모델로 산출된 이론 주가(<strong>{data.theoretical_price.toLocaleString()}원</strong>)와 실제 애널리스트 목표주가(또는 현재 주가) 사이에 큰 격차가 발생할 수 있습니다. 
            그 이유는 다음과 같습니다:
          </p>
          <ul className="list-disc list-inside ml-2 space-y-1 text-gray-400">
            <li><strong>추정 EPS의 기저효과:</strong> 증권사 컨센서스의 단기 예상 EPS가 일시적인 호황/불황으로 인해 비정상적으로 높거나 낮을 경우, 영구 성장 모델에서 그 오차가 수십 배 증폭됩니다.</li>
            <li><strong>할인율(COE)과 영구성장률 민감도:</strong> 이론 주가는 할인율(현재 {(coe * 100).toFixed(0)}%)과 영구성장률({(termGrowth * 100).toFixed(0)}%)에 매우 민감하게 반응합니다. 1%의 미세한 변화가 적정주가의 20~30% 변동을 초래할 수 있습니다.</li>
            <li><strong>시장 할인(Korea Discount):</strong> 애널리스트의 목표주가는 기업의 지배구조, 배당 성향, 그리고 한국 시장 고유의 디스카운트를 밸류에이션(PER/PBR 멀티플)에 선반영하여 산출되지만, RIM/DCF 모델은 순수 내재가치만을 반영합니다.</li>
          </ul>
          <p className="mt-2 text-yellow-600 font-bold">
            💡 팁: 위의 시뮬레이션 슬라이더를 통해 '요구수익률'을 높이거나 '영구성장률'을 낮추면 애널리스트 목표주가에 더 근접한 보수적인 가치평가를 도출할 수 있습니다.
          </p>
        </div>
      </div>

    </div>
  );
}
