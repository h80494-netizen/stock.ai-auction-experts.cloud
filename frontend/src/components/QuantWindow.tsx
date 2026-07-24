"use client";

import React, { useState } from 'react';

export default function QuantWindow() {
  const [loading, setLoading] = useState(false);

  const handleAutoBuy = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/quant/auto-buy', {
        method: 'POST'
      });
      if (!res.ok) throw new Error(res.statusText || 'API Error');
      const data = await res.json();
      console.log(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-gray-900 text-white rounded">
      <h2 className="text-xl font-bold mb-4">퀀트 자동매매 (Quant Auto-Buy)</h2>
      <button 
        onClick={handleAutoBuy}
        disabled={loading}
        className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded font-bold"
      >
        {loading ? '실행 중...' : '자동 매수 실행'}
      </button>
    </div>
  );
}
