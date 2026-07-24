import React, { useState, useEffect } from 'react';
import TradingViewWidget from './TradingViewWidget';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export default function ChartsView({ ticker, stockDetails }: { ticker: string, stockDetails?: any }) {
  const [period, setPeriod] = useState<'m' | 'D' | 'W'>('D');
  const [chartData, setChartData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!ticker) return;
    const fetchChart = async () => {
      setLoading(true);
      try {
        const cleanTicker = ticker.split(':').pop() || ticker;
        const isOverseas = !cleanTicker.endsWith('.KS') && !cleanTicker.endsWith('.KQ') && !/^\d{6}$/.test(cleanTicker);
        
        let excd = 'NYS';
        const upperTicker = cleanTicker.toUpperCase();
        if (upperTicker.endsWith('.T')) excd = 'TSE';
        else if (upperTicker.endsWith('.SS')) excd = 'SHS';
        else if (upperTicker.endsWith('.SZ')) excd = 'SZS';
        else if (upperTicker.endsWith('.HK')) excd = 'HKS';

        const url = isOverseas 
          ? `/api/kis/chart/${cleanTicker.split('.')[0]}?is_overseas=true&excd=${excd}&period=${period}`
          : `/api/kis/chart/${cleanTicker}?period=${period}`;
          
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.statusText || 'API Error');
        const data = await res.json();
        setChartData(data);
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchChart();
  }, [ticker, period]);

  // 동적으로 주가에 맞춰 밴드와 이론가를 생성합니다.
  const latestPrice = chartData && chartData.length > 0 ? chartData[chartData.length - 1].close : (stockDetails?.stock?.price || 50000);
  
  // Real Financial Multiples
  const bps = stockDetails?.stock?.bps || (latestPrice / 1.2);
  const eps = stockDetails?.stock?.eps || (latestPrice / 15);
  // Parse ROE, it might be a percentage string or float
  let roeVal = 0.1;
  const rawRoe = stockDetails?.stock?.roe;
  if (typeof rawRoe === 'string' && rawRoe.includes('%')) {
    roeVal = parseFloat(rawRoe.replace('%', '')) / 100;
  } else if (typeof rawRoe === 'number') {
    roeVal = rawRoe > 1 ? rawRoe / 100 : rawRoe;
  }
  
  // Calculate historical dynamic BPS and EPS assuming constant ROE growth backward
  // For high-growth tech like NVDA, PBR is very high (e.g., 50x).
  // We should anchor the PBR bands to the *current* PBR.
  const currentPbr = stockDetails?.stock?.pbr || (latestPrice / bps) || 1.2;
  const pbrMid = currentPbr;
  const pbrLow = currentPbr * 0.7;
  const pbrHigh = currentPbr * 1.3;

  const currentPer = stockDetails?.stock?.per || (latestPrice / eps) || 15;
  const perMid = currentPer;
  const perLow = currentPer * 0.7;
  const perHigh = currentPer * 1.3;

  const generateData = () => {
    const data = [];
    const baseYear = new Date().getFullYear() - 3;
    for (let i = 0; i <= 3; i++) {
      const year = (baseYear + i).toString();
      // Assume 10% BPS/EPS growth historically just for the shape of the band
      const growthFactor = Math.pow(1 + roeVal, i - 3); 
      const histBps = bps * growthFactor;
      const histEps = eps * growthFactor;
      // Price trends towards current
      const mockPrice = latestPrice * Math.pow(1.1, i - 3) * (0.9 + Math.random() * 0.2); 
      data.push({
        year,
        price: i === 3 ? latestPrice : mockPrice,
        pbr1: histBps * pbrLow,
        pbr2: histBps * pbrMid,
        pbr3: histBps * pbrHigh,
        per1: histEps * perLow,
        per2: histEps * perMid,
        per3: histEps * perHigh,
      });
    }
    return data;
  };

  const generateModelData = () => {
    const data = [];
    const baseYear = new Date().getFullYear() - 3;
    for (let i = 0; i <= 5; i++) {
      const year = i <= 3 ? (baseYear + i).toString() : `${baseYear + i}(E)`;
      const growthFactor = Math.pow(1 + roeVal, i - 3);
      const histEps = eps * growthFactor;
      const histBps = bps * growthFactor;
      
      // RIM: BPS + (BPS * (ROE - Ke) / Ke). Let's assume Ke = 0.08
      const ke = 0.08;
      const rimValue = histBps + (histBps * (roeVal - ke) / ke);
      // DDM: Div / (Ke - g). Just proxy it
      const ddmValue = histEps * 0.3 / (ke - 0.03); 
      
      const mockPrice = i <= 3 ? latestPrice * Math.pow(1.1, i - 3) : null;
      
      data.push({
        year,
        price: i === 3 ? latestPrice : mockPrice,
        rim: Math.max(0, rimValue),
        ddm: Math.max(0, ddmValue),
        eps: histEps * currentPer // EPS chart typically means Target Price based on EPS
      });
    }
    return data;
  };

  const mockBandData = generateData();
  const mockModelData = generateModelData();

  return (
    <div className="flex flex-col gap-4 lg:h-full">
      {/* Top: KIS Chart */}
      <div className="bg-[#111] border border-gray-800 rounded p-4 flex flex-col min-h-[300px] lg:h-1/2">
        <div className="flex justify-between items-center mb-2">
          <h3 className="font-bold text-gray-300">주가 차트</h3>
          <div className="flex gap-2">
            {/* The interval buttons were moved inside TradingViewWidget to work correctly. */}
          </div>
        </div>
        <div className="flex-1 min-h-[250px]">
          {loading ? <div className="flex items-center justify-center h-full text-gray-500">Loading Chart...</div> : 
          <TradingViewWidget symbol={ticker} defaultInterval={period} />}
        </div>
      </div>

      {/* Bottom: Recharts (Bands & Models) */}
      <div className="flex flex-col lg:flex-row gap-4 lg:h-1/2">
        
        {/* PBR/PER Bands */}
        <div className="bg-[#111] border border-gray-800 rounded p-4 flex-1 flex flex-col min-h-[250px]">
          <h3 className="font-bold text-gray-300 mb-2">PBR/PER 밴드</h3>
          <div className="flex-1 min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockBandData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="year" stroke="#888" fontSize={10} />
                <YAxis stroke="#888" fontSize={10} tickFormatter={(val) => `${val/1000}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="price" stroke="#fff" strokeWidth={3} dot={{ r: 3 }} name="주가" />
                <Line type="monotone" dataKey="pbr1" stroke="#ff7300" strokeDasharray="5 5" name="PBR 하단" />
                <Line type="monotone" dataKey="pbr2" stroke="#ff7300" name="PBR 중단" />
                <Line type="monotone" dataKey="pbr3" stroke="#ff7300" strokeDasharray="5 5" name="PBR 상단" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Theoretical Models */}
        <div className="bg-[#111] border border-gray-800 rounded p-4 flex-1 flex flex-col min-h-[250px]">
          <h3 className="font-bold text-gray-300 mb-2">이론가 추정 차트 (RIM/DDM/EPS)</h3>
          <div className="flex-1 min-h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={mockModelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="year" stroke="#888" fontSize={10} />
                <YAxis stroke="#888" fontSize={10} tickFormatter={(val) => `${val/1000}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#111', borderColor: '#333' }} />
                <Legend wrapperStyle={{ fontSize: '10px' }} />
                <Line type="monotone" dataKey="price" stroke="#fff" strokeWidth={3} dot={{ r: 3 }} name="현재주가" />
                <Line type="monotone" dataKey="rim" stroke="#8884d8" strokeWidth={2} name="초과이익모델(RIM)" />
                <Line type="monotone" dataKey="ddm" stroke="#82ca9d" strokeWidth={2} name="배당할인모형(DDM)" />
                <Line type="monotone" dataKey="eps" stroke="#ffc658" strokeWidth={2} name="EPS모델" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}
