'use client';
import React, { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from 'recharts';

interface FundamentalAnalysisViewProps {
  ticker: string;
}

const getQuarterLabel = (q: string) => {
  if (q === '11013') return '1Q';
  if (q === '11012') return '2Q';
  if (q === '11014') return '3Q';
  if (q === '11011') return '4Q';
  return q;
};

const qOrder: Record<string, number> = {
  '11013': 1,
  '11012': 2,
  '11014': 3,
  '11011': 4
};

export default function FundamentalAnalysisView({ ticker }: FundamentalAnalysisViewProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ticker) return;
    
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/dart/fundamentals/${ticker}`);
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const result = await res.json();
        
        if (result.financials && result.financials.length > 0) {
          // 분기 순서 정렬 (과거 -> 최신)
          const sorted = [...result.financials].sort((a: any, b: any) => {
            const yDiff = parseInt(a.year) - parseInt(b.year);
            if (yDiff !== 0) return yDiff;
            return (qOrder[a.quarter] || 0) - (qOrder[b.quarter] || 0);
          });

          // Format data for Recharts (최근 12분기)
          const recent12 = sorted.slice(-12);
          const chartData = recent12.map((item: any) => ({
            name: `${item.year.slice(2)}.${getQuarterLabel(item.quarter)}`,
            fullName: `${item.year}년 ${getQuarterLabel(item.quarter)}`,
            revenue: Math.round(item.revenue / 100000000), // 억원 단위 (분기*4 연환산)
            operating_profit: Math.round(item.operating_profit / 100000000),
            net_profit: Math.round(item.net_profit / 100000000),
            assets: Math.round(item.assets / 100000000),
            equity: Math.round(item.equity / 100000000),
            liabilities: Math.round(item.liabilities / 100000000),
          }));
          if (isMounted) setData(chartData);
        } else {
          if (isMounted) setError('재무 데이터가 없습니다.');
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || '데이터를 불러오는 중 오류가 발생했습니다.');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchData();
    return () => { isMounted = false; };
  }, [ticker]);

  if (loading) return <div className="p-4 text-gray-500 animate-pulse bg-[#111] rounded border border-gray-800 mt-4">OpenDART 최근 12분기 펀더멘탈 데이터를 분석하는 중...</div>;
  if (error) return <div className="p-4 text-red-400 bg-[#111] rounded border border-gray-800 mt-4">{error}</div>;
  if (data.length === 0) return null;

  const latest = data[data.length - 1];

  return (
    <div className="bg-[#111] border border-gray-800 p-4 rounded-lg mt-4 shadow-lg">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-gray-800 pb-3 mb-4 gap-2">
        <div>
          <h3 className="font-bold text-lg text-white flex items-center gap-2">
            <span className="text-indigo-400">📊 OpenDART 펀더멘탈 분석</span>
            <span className="text-xs bg-indigo-950/80 text-indigo-300 px-2 py-0.5 rounded border border-indigo-700/50">최근 12분기 (분기데이터×4 연환산)</span>
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">최근 3개년 12개 분기 단일 실적을 연환산(Quarterly × 4)하여 실적 추이를 비교합니다.</p>
        </div>
        {latest && (
          <div className="flex items-center gap-3 text-xs bg-black/40 px-3 py-1.5 rounded border border-gray-800">
            <span className="text-gray-400">최신 {latest.fullName}:</span>
            <span className="text-indigo-300 font-semibold">매출 {latest.revenue.toLocaleString()}억</span>
            <span className="text-emerald-400 font-semibold">영업익 {latest.operating_profit.toLocaleString()}억</span>
            <span className="text-amber-400 font-semibold">순익 {latest.net_profit.toLocaleString()}억</span>
          </div>
        )}
      </div>
      
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 30, left: 10, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#222" />
            <XAxis dataKey="name" stroke="#888" tick={{fontSize: 11, fill: '#aaa'}} interval={0} />
            <YAxis yAxisId="left" stroke="#888" tick={{fontSize: 11, fill: '#aaa'}} />
            <YAxis yAxisId="right" orientation="right" stroke="#888" tick={{fontSize: 11, fill: '#aaa'}} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#18181b', borderColor: '#3f3f46', borderRadius: '8px', color: '#fff', fontSize: '12px' }} 
              itemStyle={{ color: '#fff', padding: '2px 0' }}
              labelFormatter={(label, payload) => {
                if (payload && payload.length > 0 && payload[0].payload.fullName) {
                  return payload[0].payload.fullName;
                }
                return label;
              }}
              formatter={(value: any, name?: any) => {
                if (typeof value === 'number') {
                  return [`${value.toLocaleString()}억원`, name || ''];
                }
                return [value, name || ''];
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            <Bar yAxisId="left" dataKey="revenue" name="매출액(분기×4)" fill="#4f46e5" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="left" dataKey="operating_profit" name="영업이익(분기×4)" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Bar yAxisId="left" dataKey="net_profit" name="당기순이익(분기×4)" fill="#f59e0b" radius={[3, 3, 0, 0]} maxBarSize={28} />
            <Line yAxisId="right" type="monotone" dataKey="equity" name="자본총계(분기말)" stroke="#ec4899" strokeWidth={2.5} dot={{ r: 3, fill: '#ec4899' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between items-center text-[11px] text-gray-500 mt-2 px-1">
        <span>* 단위: 억원 (각 분기 순수 실적을 4배한 연환산 규모 기준 / 자본총계는 해당 분기말 시점 잔액)</span>
        <span>최근 12분기 (3년 추이)</span>
      </div>
    </div>
  );
}
