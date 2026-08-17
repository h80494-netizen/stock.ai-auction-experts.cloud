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
          // Format data for Recharts
          const chartData = result.financials.map((item: any) => ({
            name: `${item.year}-${item.quarter === '11011' ? '4Q(Year)' : item.quarter}`,
            revenue: item.revenue / 100000000, // 억원 단위
            operating_profit: item.operating_profit / 100000000,
            net_profit: item.net_profit / 100000000,
            assets: item.assets / 100000000,
            equity: item.equity / 100000000,
            liabilities: item.liabilities / 100000000,
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

  if (loading) return <div className="p-4 text-gray-500 animate-pulse">펀더멘탈 데이터를 불러오는 중...</div>;
  if (error) return <div className="p-4 text-red-400">{error}</div>;
  if (data.length === 0) return null;

  return (
    <div className="bg-[#111] border border-gray-800 p-4 rounded mt-4">
      <h3 className="font-bold mb-4 border-b border-gray-700 pb-2 text-white">OpenDART 펀더멘탈 분석</h3>
      
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="name" stroke="#888" tick={{fontSize: 12}} />
            <YAxis yAxisId="left" stroke="#888" tick={{fontSize: 12}} />
            <YAxis yAxisId="right" orientation="right" stroke="#888" tick={{fontSize: 12}} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }} 
              itemStyle={{ color: '#fff' }}
              formatter={(value: any) => {
                if (typeof value === 'number') {
                  return [`${value.toLocaleString(undefined, {maximumFractionDigits:0})}억`, ''];
                }
                return [value, ''];
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar yAxisId="left" dataKey="revenue" name="매출액" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="left" dataKey="operating_profit" name="영업이익" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar yAxisId="left" dataKey="net_profit" name="당기순이익" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="equity" name="자본총계" stroke="#ec4899" strokeWidth={2} dot={{ r: 4 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <div className="text-right text-[10px] text-gray-500 mt-2">*단위: 억원 (최근 분기 기준)</div>
    </div>
  );
}
