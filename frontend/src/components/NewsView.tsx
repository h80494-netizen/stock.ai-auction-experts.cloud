import React from 'react';

export default function NewsView({ news }: { news: any[] }) {
  return (
    <div className="w-full flex justify-center p-8">
      <div className="max-w-4xl w-full">
        <h2 className="text-3xl font-black mb-8 text-white">🔥 Spot News</h2>
        <div className="space-y-4">
          {news.map((item, index) => (
            <div 
              key={index} 
              className="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition-all duration-300 transform hover:-translate-y-1"
            >
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold text-green-400 bg-green-400/10 px-3 py-1 rounded-full">
                  {item.keyword}
                </span>
                <span className="text-xs text-gray-500">{item.time}</span>
              </div>
              <h3 className="text-xl font-bold text-gray-200">{item.title}</h3>
            </div>
          ))}
          {news.length === 0 && (
            <div className="text-center text-gray-500 py-12">No spot news available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
