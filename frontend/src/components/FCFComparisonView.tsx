'use client';

import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import fcfData from '../data/fcf_comparison.json';

export default function FCFComparisonView() {
  // 데이터 포맷팅
  const chartData = fcfData.map((item) => ({
    period: item.period,
    // 삼성전자: 조 단위로 변환 (원래 데이터는 원 단위, 1조 = 1,000,000,000,000)
    samsung: item.samsung_krw / 1000000000000,
    // 엔비디아: 억 달러 단위로 변환 (원래 데이터는 달러 단위, 1억 = 100,000,000)
    nvidia: item.nvidia_usd / 100000000,
  }));

  return (
    <div className="flex flex-col h-full bg-[#111] p-4 text-gray-200">
      <div className="mb-4 pb-2 border-b border-gray-800 flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white">삼성전자 vs 엔비디아 FCF 비교</h2>
          <p className="text-sm text-gray-400 mt-1">잉여현금흐름(Free Cash Flow) 최근 4개년 추이 비교</p>
        </div>
        <div className="text-xs text-gray-500 text-right">
          삼성전자 단위: 조 원 (KRW) <br />
          엔비디아 단위: 억 달러 (USD)
        </div>
      </div>

      <div className="flex-1 w-full min-h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="period" stroke="#888" tick={{ fill: '#aaa' }} />
            
            {/* 좌측 Y축: 삼성전자 (조 원) */}
            <YAxis 
              yAxisId="left" 
              stroke="#888" 
              tick={{ fill: '#aaa' }}
              label={{ value: '삼성전자 (조 원)', angle: -90, position: 'insideLeft', fill: '#888', dx: -10 }}
            />
            
            {/* 우측 Y축: 엔비디아 (억 달러) */}
            <YAxis 
              yAxisId="right" 
              orientation="right" 
              stroke="#888" 
              tick={{ fill: '#aaa' }}
              label={{ value: '엔비디아 (억 달러)', angle: 90, position: 'insideRight', fill: '#888', dx: 10 }}
            />
            
            <Tooltip
              contentStyle={{ backgroundColor: '#222', borderColor: '#444', color: '#fff' }}
              formatter={(value: any, name: any) => {
                if (name === 'samsung') return [`${value.toFixed(2)} 조 원`, '삼성전자'];
                if (name === 'nvidia') return [`${value.toFixed(2)} 억 달러`, '엔비디아'];
                return [value, name];
              }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px' }} />
            
            <Bar 
              yAxisId="left" 
              dataKey="samsung" 
              name="samsung" 
              fill="#1e3a8a" // 짙은 파란색
              radius={[4, 4, 0, 0]}
              animationDuration={1500}
            />
            <Line 
              yAxisId="right" 
              type="monotone" 
              dataKey="nvidia" 
              name="nvidia" 
              stroke="#10b981" // 녹색 (엔비디아 상징색)
              strokeWidth={3} 
              dot={{ r: 6, fill: '#10b981', strokeWidth: 2, stroke: '#111' }} 
              activeDot={{ r: 8 }}
              animationDuration={1500}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 p-4 bg-[#1a1a1a] border border-gray-800 rounded text-sm text-gray-300">
        <h3 className="text-white font-bold mb-2">💡 분석 요약</h3>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong>삼성전자:</strong> 반도체 시황 및 대규모 CAPEX 투자로 인해 FCF의 변동성이 큽니다. 특히 2023년에는 대규모 투자의 여파로 음(-)의 FCF를 기록했으나, 2024년 이후 회복세를 보이고 있습니다.</li>
          <li><strong>엔비디아:</strong> AI 가속기 수요 폭증으로 인해 FCF가 기하급수적으로 상승하는 압도적인 우상향 트렌드를 보여주고 있습니다.</li>
          <li className="text-gray-500 text-xs mt-2">* 데이터 소스: yfinance-mcp (엔비디아의 경우 해당 연도에 대응하는 회계연도 기준)</li>
        </ul>
      </div>
    </div>
  );
}
