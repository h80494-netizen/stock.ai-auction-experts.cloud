"use client";

import React from "react";
import Link from "next/link";
import AnalystReportsView from "@/components/AnalystReportsView";

export default function AnalystReportPage() {
  return (
    <div className="min-h-screen bg-black text-gray-100 flex flex-col">
      {/* Top Simple Navigation */}
      <header className="h-12 bg-[#111] border-b border-gray-800 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-400 hover:text-white text-xs flex items-center gap-1">
            <span>←</span>
            <span>터미널 메인</span>
          </Link>
          <span className="text-gray-600">|</span>
          <span className="font-bold text-sm text-white">
            STOCK<span className="text-red-600">CODING</span> RESEARCH
          </span>
        </div>
        <div className="text-[11px] text-gray-500 font-mono">
          CONSENSUS AI ANALYST
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden">
        <AnalystReportsView />
      </main>
    </div>
  );
}
