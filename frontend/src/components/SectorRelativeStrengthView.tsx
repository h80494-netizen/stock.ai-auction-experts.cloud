"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  Cell,
} from "recharts";

const SECTOR_COLOR_PALETTE: string[] = [
  "#10b981", // emerald
  "#f43f5e", // rose
  "#38bdf8", // sky
  "#f59e0b", // amber
  "#a855f7", // purple
  "#22d3ee", // cyan
  "#fb923c", // orange
  "#818cf8", // indigo
  "#4ade80", // green
  "#ec4899", // pink
  "#facc15", // yellow
  "#60a5fa", // blue
];

const getSectorLineColor = (sectorName: string, idx: number = 0) => {
  if (!sectorName) return "#94a3b8";
  let h = 0;
  for (let i = 0; i < sectorName.length; i++) {
    h = (h * 31 + sectorName.charCodeAt(i)) >>> 0;
  }
  return SECTOR_COLOR_PALETTE[(h + idx) % SECTOR_COLOR_PALETTE.length];
};

interface SectorRelativeStrengthViewProps {
  onExploreSectorInTetris?: (sectorName: string) => void;
  onSelectStockTicker?: (ticker: string) => void;
}

export default function SectorRelativeStrengthView({
  onExploreSectorInTetris,
  onSelectStockTicker,
}: SectorRelativeStrengthViewProps) {
  const [periodDays, setPeriodDays] = useState<number>(60);
  const [marketFilter, setMarketFilter] = useState<"ALL" | "KOSPI" | "KOSDAQ">("ALL");
  // 기본 모드를 RS_SPREAD(KOSPI 상승률 = 0 기준 상대강도 + 68%/95%/99% 신뢰구간)로 설정
  const [chartDisplayMode, setChartDisplayMode] = useState<"RS_SPREAD" | "RETURN_PCT" | "INDEX_100">("RS_SPREAD");
  const [chartGroupFilter, setChartGroupFilter] = useState<"LEADERS_TOP5" | "WEAK_BOTTOM5" | "BOTH_EXTREMES" | "CUSTOM">("BOTH_EXTREMES");
  const [customSelectedSectors, setCustomSelectedSectors] = useState<string[]>([]);
  const [focusedSector, setFocusedSector] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const fetchSectorRS = async (pDays = periodDays, mkt = marketFilter) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sector/relative-strength?period_days=${pDays}&market=${mkt}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.success) {
        setData(json);
        if (!customSelectedSectors.length && Array.isArray(json.strongest_top5)) {
          const initSectors = [
            ...(json.strongest_top5 || []).slice(0, 3).map((s: any) => s.sector),
            ...(json.weakest_bottom5 || []).slice(0, 2).map((s: any) => s.sector),
          ];
          setCustomSelectedSectors(initSectors);
        }
      } else {
        setError("섹터 상대강도 데이터를 불러오지 못했습니다.");
      }
    } catch (e: any) {
      setError(e?.message || "네트워크 오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSectorRS(periodDays, marketFilter);
  }, [periodDays, marketFilter]);

  const activeChartSectors = useMemo(() => {
    if (!data || !Array.isArray(data.sectors)) return [];
    const allSectors: any[] = data.sectors;
    if (chartGroupFilter === "LEADERS_TOP5") {
      return (data.strongest_top5 || []).slice(0, 5);
    }
    if (chartGroupFilter === "WEAK_BOTTOM5") {
      return (data.weakest_bottom5 || []).slice(0, 5);
    }
    if (chartGroupFilter === "BOTH_EXTREMES") {
      const top3 = (data.strongest_top5 || []).slice(0, 3);
      const bot3 = (data.weakest_bottom5 || []).slice(0, 3);
      const seen = new Set<string>();
      const combined: any[] = [];
      [...top3, ...bot3].forEach((s) => {
        if (s && !seen.has(s.sector)) {
          seen.add(s.sector);
          combined.push(s);
        }
      });
      return combined;
    }
    return allSectors.filter((s) => customSelectedSectors.includes(s.sector));
  }, [data, chartGroupFilter, customSelectedSectors]);

  const ciInfo = useMemo(() => {
    const ci = data?.confidence_intervals || {};
    return {
      ci68: Number(ci.ci_68_pct ?? 5.0),
      ci95: Number(ci.ci_95_pct ?? 9.8),
      ci99: Number(ci.ci_99_pct ?? 12.9),
      dailySeries: Array.isArray(ci.daily_series) ? ci.daily_series : [],
    };
  }, [data]);

  const multiLineChartData = useMemo(() => {
    if (!data || !Array.isArray(data.dates)) return [];
    const dates: string[] = data.dates;
    const mktBench = data.market_benchmark || {};
    const mktIdx100 = mktBench.index_100_series || [];
    const mktRet = mktBench.cum_return_series || [];
    const ciDaily = ciInfo.dailySeries;

    return dates.map((d, idx) => {
      const ciRow = ciDaily[idx] || {};
      const mktR = Number(mktRet[idx] ?? 0);
      const s68 = Number(ciRow.rs_ci68_upper ?? ciInfo.ci68);
      const s95 = Number(ciRow.rs_ci95_upper ?? ciInfo.ci95);
      const s99 = Number(ciRow.rs_ci99_upper ?? ciInfo.ci99);

      const baseVal =
        chartDisplayMode === "RS_SPREAD"
          ? 0.0
          : chartDisplayMode === "RETURN_PCT"
          ? mktR
          : Number(mktIdx100[idx] ?? 100);

      const row: Record<string, any> = {
        date: d,
        shortDate: d.slice(5),
        KOSPI기준선: baseVal,
        ci68_upper: Number((baseVal + s68).toFixed(2)),
        ci68_lower: Number((baseVal - s68).toFixed(2)),
        ci95_upper: Number((baseVal + s95).toFixed(2)),
        ci95_lower: Number((baseVal - s95).toFixed(2)),
        ci99_upper: Number((baseVal + s99).toFixed(2)),
        ci99_lower: Number((baseVal - s99).toFixed(2)),
      };
      activeChartSectors.forEach((secObj: any) => {
        const sName = secObj.sector;
        if (chartDisplayMode === "RS_SPREAD") {
          row[sName] = Number(secObj.rs_spread_series?.[idx] ?? 0);
        } else if (chartDisplayMode === "RETURN_PCT") {
          row[sName] = Number(secObj.cum_return_series?.[idx] ?? 0);
        } else {
          row[sName] = Number(secObj.index_100_series?.[idx] ?? 100);
        }
      });
      return row;
    });
  }, [data, activeChartSectors, chartDisplayMode, ciInfo]);

  const toggleCustomSector = (secName: string) => {
    setChartGroupFilter("CUSTOM");
    setCustomSelectedSectors((prev) =>
      prev.includes(secName) ? prev.filter((x) => x !== secName) : [...prev, secName]
    );
  };

  const periodLabel =
    periodDays === 5
      ? "최근 1주(5거래일)"
      : periodDays === 20
      ? "최근 1개월(20거래일)"
      : periodDays === 60
      ? "최근 3개월(60거래일)"
      : periodDays === 120
      ? "최근 6개월(120거래일)"
      : "최근 1년(250거래일)";

  return (
    <div className="h-full overflow-y-auto bg-[#070b14] text-slate-100 p-3 sm:p-5 space-y-4">
      {/* 1. 상단 헤더 & 기간/시장 선택 컨트롤 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 border border-indigo-500/40 rounded-2xl p-4 shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-400/50 text-indigo-200 text-[11px] font-extrabold">
                📈 KOSPI 상승률(=0 기준) & 68%·95%·99% 신뢰구간 기반 섹터 상대강도(RS) 판별
              </span>
              {data && (
                <span className="text-xs font-mono text-slate-300">
                  분석 구간: {data.start_date} ~ {data.latest_date} ({periodLabel}) ·{" "}
                  <strong className="text-rose-400">KOSPI 상회 {data.outperform_sector_count}개 업종</strong> vs{" "}
                  <strong className="text-sky-400">KOSPI 하회 {data.underperform_sector_count}개 업종</strong>
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-black text-white mt-1">
              KOSPI 지수 상승률(=0 기준선) & 68%·95%·99% 신뢰구간 섹터 상대강도 →{" "}
              <span className="text-purple-300">종목 필터링(Tetris) 연동 탐색</span>
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              시가총액 가중치(<strong className="text-amber-300">Σ 시총비중 × 섹터수익률 = KOSPI 상승률</strong>) 정합성을 적용하여, 비중이 큰 반도체가 시장보다 더 하락하면 다른 업종들은 자연스럽게 KOSPI 대비 아웃퍼폼(+RS)으로 판별됩니다.{" "}
              <strong className="text-emerald-300">±68%(1σ) · ±95%(2σ) · ±99%(2.58σ) 신뢰구간 라인</strong>을 돌파한 강세/약세 업종을 찾고 즉시{" "}
              <strong className="text-purple-300">🧱 종목 필터링(Tetris)</strong>으로 이동하세요.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* 기간 선택 */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
              {[
                { days: 5, label: "1주(5일)" },
                { days: 20, label: "1개월(20일)" },
                { days: 60, label: "3개월(60일)" },
                { days: 120, label: "6개월(120일)" },
                { days: 250, label: "1년(250일)" },
              ].map((p) => (
                <button
                  key={p.days}
                  type="button"
                  onClick={() => setPeriodDays(p.days)}
                  className={`px-2.5 py-1.5 rounded-lg font-extrabold cursor-pointer transition ${
                    periodDays === p.days
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* 시장 필터 */}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
              {(["ALL", "KOSPI", "KOSDAQ"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMarketFilter(m)}
                  className={`px-2.5 py-1.5 rounded-lg font-extrabold cursor-pointer transition ${
                    marketFilter === m
                      ? "bg-emerald-600 text-white shadow"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {m === "ALL" ? "전체시장" : m}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 2. 최강 주도 섹터 TOP 5 vs 약세 소외 섹터 TOP 5 요약 카드 */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
            {/* 최강 주도 섹터 TOP 5 */}
            <div className="bg-slate-950/90 border border-rose-500/40 rounded-xl p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-400/50 text-rose-300 text-xs font-extrabold">
                  🔥 최근 최강 강세업종 TOP 5 (+68%·+95%·+99% 신뢰구간 상회)
                </span>
                <span className="text-[11px] text-slate-300 font-mono">
                  KOSPI 지수 상승률:{" "}
                  <strong className={data.market_benchmark?.return_pct >= 0 ? "text-rose-400" : "text-sky-400"}>
                    {data.market_benchmark?.return_pct >= 0 ? "+" : ""}
                    {data.market_benchmark?.return_pct}% (상대강도 기준점 = 0.0%p)
                  </strong>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {(data.strongest_top5 || []).map((sec: any, idx: number) => (
                  <div
                    key={sec.sector}
                    onMouseEnter={() => setFocusedSector(sec.sector)}
                    onMouseLeave={() => setFocusedSector(null)}
                    className="bg-gradient-to-b from-rose-950/40 to-slate-900 border border-rose-500/40 hover:border-rose-400 rounded-xl p-2.5 flex flex-col justify-between transition"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-rose-300">
                        <span className="font-extrabold">#{idx + 1} 강세</span>
                        <span>Z={sec.rs_z_score >= 0 ? "+" : ""}{sec.rs_z_score}σ</span>
                      </div>
                      <div className="text-sm font-black text-white mt-0.5 truncate">{sec.sector}</div>
                      <div className="text-xs font-mono font-extrabold text-rose-400 mt-1">
                        RS {sec.rs_spread_pct >= 0 ? "+" : ""}
                        {sec.rs_spread_pct}%p
                      </div>
                      <div className="text-[10px] font-mono text-amber-300 truncate">
                        {sec.ci_zone}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        시총비중 {sec.market_cap_weight_pct}% · 우상향 {sec.tetris_upward_10_count}종목
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onExploreSectorInTetris && onExploreSectorInTetris(sec.sector)}
                      className="mt-2 w-full py-1 px-2 rounded-lg bg-purple-600/90 hover:bg-purple-500 text-white text-[10px] font-extrabold cursor-pointer transition shadow"
                    >
                      🧱 종목 필터링 탐색 →
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 약세 소외 섹터 TOP 5 */}
            <div className="bg-slate-950/90 border border-sky-500/40 rounded-xl p-3.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-300 text-xs font-extrabold">
                  ❄️ 최근 약세/소외업종 TOP 5 (-68%·-95%·-99% 신뢰구간 하회)
                </span>
                <span className="text-[11px] text-slate-300 font-mono">
                  신뢰구간: ±68%({ciInfo.ci68}%p) · ±95%({ciInfo.ci95}%p) · ±99%({ciInfo.ci99}%p)
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {(data.weakest_bottom5 || []).map((sec: any, idx: number) => (
                  <div
                    key={sec.sector}
                    onMouseEnter={() => setFocusedSector(sec.sector)}
                    onMouseLeave={() => setFocusedSector(null)}
                    className="bg-gradient-to-b from-sky-950/40 to-slate-900 border border-sky-500/30 hover:border-sky-400 rounded-xl p-2.5 flex flex-col justify-between transition"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono text-sky-300">
                        <span className="font-extrabold">약세 #{idx + 1}</span>
                        <span>Z={sec.rs_z_score >= 0 ? "+" : ""}{sec.rs_z_score}σ</span>
                      </div>
                      <div className="text-sm font-black text-white mt-0.5 truncate">{sec.sector}</div>
                      <div className="text-xs font-mono font-extrabold text-sky-400 mt-1">
                        RS {sec.rs_spread_pct >= 0 ? "+" : ""}
                        {sec.rs_spread_pct}%p
                      </div>
                      <div className="text-[10px] font-mono text-sky-300 truncate">
                        {sec.ci_zone}
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                        시총비중 {sec.market_cap_weight_pct}% · 우상향 {sec.tetris_upward_10_count}종목
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onExploreSectorInTetris && onExploreSectorInTetris(sec.sector)}
                      className="mt-2 w-full py-1 px-2 rounded-lg bg-slate-800 hover:bg-purple-600 border border-slate-700 text-slate-200 hover:text-white text-[10px] font-extrabold cursor-pointer transition"
                    >
                      🧱 종목 필터링 탐색 →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. 상단 2열 병렬 배치: [좌측: 상대강도(KOSPI=0) & 68%·95%·99% 신뢰구간 추이 멀티라인 차트] + [우측: 전 섹터 상대강도(RS) 막대그래프] */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* 좌측 (7칸): KOSPI 상승률(=0) & 68%/95%/99% 신뢰구간 하의 섹터 상대강도 추이 차트 */}
        <div className="xl:col-span-7 bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between space-y-3">
          <div className="space-y-2.5 border-b border-slate-800 pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                  <span>
                    📊 KOSPI 상승률(=0 기준선) & 68%·95%·99% 신뢰구간 라인 대비 섹터지수 상대강도 추이
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  KOSPI 상승률을 <strong className="text-yellow-300">0%p 기준선(굵은 노란선)</strong>으로 놓고,{" "}
                  <strong className="text-emerald-300">±68%(1σ)</strong> ·{" "}
                  <strong className="text-amber-300">±95%(2σ)</strong> ·{" "}
                  <strong className="text-rose-400">±99%(2.58σ)</strong> 신뢰구간 라인 하에서 각 섹터지수 상승률의 상대 위치를 추적합니다.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              {/* 차트 표시 그룹 선택 */}
              <div className="flex flex-wrap items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
                {[
                  { id: "BOTH_EXTREMES", label: "🔥강세 TOP3 vs ❄️약세 TOP3" },
                  { id: "LEADERS_TOP5", label: "🔥강세업종 TOP 5" },
                  { id: "WEAK_BOTTOM5", label: "❄️약세업종 TOP 5" },
                  { id: "CUSTOM", label: `☑️ 직접 선택 (${customSelectedSectors.length})` },
                ].map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setChartGroupFilter(g.id as any)}
                    className={`px-2 py-1 rounded-lg font-extrabold cursor-pointer transition ${
                      chartGroupFilter === g.id
                        ? "bg-amber-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>

              {/* Y축 지표 모드 */}
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
                {[
                  { id: "RS_SPREAD", label: "상대강도 (KOSPI=0 기준, %p)" },
                  { id: "RETURN_PCT", label: "절대 상승률 (KOSPI+신뢰구간, %)" },
                  { id: "INDEX_100", label: "환산지수 (기준일=100)" },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setChartDisplayMode(m.id as any)}
                    className={`px-2 py-1 rounded-lg font-extrabold cursor-pointer transition ${
                      chartDisplayMode === m.id
                        ? "bg-indigo-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 신뢰구간 범례 배지 */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono bg-slate-950/90 border border-slate-800 rounded-xl px-3 py-1.5">
              <span className="text-yellow-300 font-extrabold">━ KOSPI 상승률 기준선 (0.0%p)</span>
              <span className="text-slate-600">|</span>
              <span className="text-emerald-300 font-bold">--- 68% 신뢰구간 (±1σ = ±{ciInfo.ci68}%p)</span>
              <span className="text-slate-600">|</span>
              <span className="text-amber-300 font-bold">--- 95% 신뢰구간 (±2σ = ±{ciInfo.ci95}%p)</span>
              <span className="text-slate-600">|</span>
              <span className="text-rose-400 font-bold">--- 99% 신뢰구간 (±2.58σ = ±{ciInfo.ci99}%p)</span>
            </div>

            {/* 섹터 빠른 토글 배지 바 */}
            {data && Array.isArray(data.sectors) && (
              <div className="flex flex-wrap items-center gap-1 pt-0.5 max-h-[82px] overflow-y-auto">
                <span className="text-[10px] text-slate-400 font-bold mr-1">차트 업종 토글:</span>
                {data.sectors.map((sec: any, idx: number) => {
                  const isShown = activeChartSectors.some((s: any) => s.sector === sec.sector);
                  const color = getSectorLineColor(sec.sector, idx);
                  return (
                    <button
                      key={sec.sector}
                      type="button"
                      onClick={() => toggleCustomSector(sec.sector)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border cursor-pointer transition flex items-center gap-1 ${
                        isShown
                          ? "bg-slate-800 text-white border-slate-500 shadow"
                          : "bg-slate-950/70 text-slate-500 border-slate-800 hover:text-slate-300"
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span>{sec.sector}</span>
                      <span className={sec.rs_spread_pct >= 0 ? "text-rose-400 font-mono" : "text-sky-400 font-mono"}>
                        {sec.rs_spread_pct >= 0 ? "+" : ""}
                        {sec.rs_spread_pct}%p
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 메인 멀티라인 차트 (신뢰구간 68%, 95%, 99% 라인 포함) */}
          <div className="h-[460px] w-full text-xs font-mono">
            {loading ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                KOSPI 대비 섹터별 상대강도 및 68%·95%·99% 신뢰구간 계산 중...
              </div>
            ) : error ? (
              <div className="h-full flex items-center justify-center text-rose-400">{error}</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={multiLineChartData} margin={{ top: 12, right: 24, left: 4, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="shortDate" stroke="#94a3b8" tick={{ fontSize: 11 }} minTickGap={22} />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fontSize: 11 }}
                    domain={["auto", "auto"]}
                    tickFormatter={(v) =>
                      chartDisplayMode === "RS_SPREAD"
                        ? `${v > 0 ? "+" : ""}${v}%p`
                        : chartDisplayMode === "RETURN_PCT"
                        ? `${v > 0 ? "+" : ""}${v}%`
                        : `${v}`
                    }
                  />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload || !payload.length) return null;
                      const pt = payload[0].payload;
                      const sectorPayloads = payload.filter(
                        (p: any) =>
                          !String(p.dataKey).startsWith("ci") && String(p.dataKey) !== "KOSPI기준선"
                      );
                      const sortedItems = [...sectorPayloads].sort(
                        (a: any, b: any) => Number(b.value) - Number(a.value)
                      );
                      return (
                        <div className="bg-[#080c14] border border-slate-700 rounded-xl p-3 shadow-2xl text-xs font-mono space-y-1">
                          <div className="font-extrabold text-amber-300 border-b border-slate-800 pb-1">
                            📅 {pt.date} | KOSPI 기준선:{" "}
                            {chartDisplayMode === "RS_SPREAD"
                              ? "0.0%p"
                              : chartDisplayMode === "RETURN_PCT"
                              ? `${pt.KOSPI기준선 >= 0 ? "+" : ""}${pt.KOSPI기준선}%`
                              : `${pt.KOSPI기준선}pt`}
                          </div>
                          <div className="text-[10px] text-slate-400 border-b border-slate-800 pb-1">
                            신뢰구간: ±68%({pt.ci68_lower}~+{pt.ci68_upper}) · ±95%({pt.ci95_lower}~+{pt.ci95_upper}) · ±99%({pt.ci99_lower}~+{pt.ci99_upper})
                          </div>
                          {sortedItems.map((item: any) => (
                            <div key={item.name} className="flex items-center justify-between gap-4">
                              <span style={{ color: item.color }} className="font-bold">
                                ■ {item.dataKey}
                              </span>
                              <span className="font-extrabold text-white">
                                {chartDisplayMode !== "INDEX_100" && Number(item.value) > 0 ? "+" : ""}
                                {Number(item.value).toFixed(2)}
                                {chartDisplayMode === "RS_SPREAD"
                                  ? "%p"
                                  : chartDisplayMode === "RETURN_PCT"
                                  ? "%"
                                  : " pt"}
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    }}
                  />
                  <Legend />

                  {/* KOSPI 상승률 = 0 기준선 (또는 절대수익률 기준선) */}
                  <Line
                    type="monotone"
                    dataKey="KOSPI기준선"
                    name={
                      chartDisplayMode === "RS_SPREAD"
                        ? "★ KOSPI 상승률 기준선 (0.0%p)"
                        : "★ KOSPI 지수 상승률 기준선"
                    }
                    stroke="#facc15"
                    strokeWidth={3}
                    dot={false}
                  />

                  {/* 68% 신뢰구간 (±1σ) 상한/하한 라인 */}
                  <Line
                    type="monotone"
                    dataKey="ci68_upper"
                    name="+68% 신뢰구간 (+1σ)"
                    stroke="#34d399"
                    strokeWidth={1.3}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ci68_lower"
                    name="-68% 신뢰구간 (-1σ)"
                    stroke="#34d399"
                    strokeWidth={1.3}
                    strokeDasharray="4 4"
                    dot={false}
                  />

                  {/* 95% 신뢰구간 (±2σ) 상한/하한 라인 */}
                  <Line
                    type="monotone"
                    dataKey="ci95_upper"
                    name="+95% 신뢰구간 (+2σ 강세)"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ci95_lower"
                    name="-95% 신뢰구간 (-2σ 약세)"
                    stroke="#fbbf24"
                    strokeWidth={1.5}
                    strokeDasharray="6 3"
                    dot={false}
                  />

                  {/* 99% 신뢰구간 (±2.58σ) 상한/하한 라인 */}
                  <Line
                    type="monotone"
                    dataKey="ci99_upper"
                    name="+99% 신뢰구간 (+2.58σ 초강세)"
                    stroke="#fb7185"
                    strokeWidth={1.6}
                    strokeDasharray="2 3"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ci99_lower"
                    name="-99% 신뢰구간 (-2.58σ 초약세)"
                    stroke="#38bdf8"
                    strokeWidth={1.6}
                    strokeDasharray="2 3"
                    dot={false}
                  />

                  {/* 선택된 섹터 라인들 */}
                  {activeChartSectors.map((secObj: any, idx: number) => {
                    const color = getSectorLineColor(secObj.sector, idx);
                    const isFocused = focusedSector === secObj.sector;
                    return (
                      <Line
                        key={secObj.sector}
                        type="monotone"
                        dataKey={secObj.sector}
                        name={`${secObj.sector} (${secObj.rs_spread_pct >= 0 ? "+" : ""}${secObj.rs_spread_pct}%p · ${secObj.rs_z_score >= 0 ? "+" : ""}${secObj.rs_z_score}σ)`}
                        stroke={color}
                        strokeWidth={isFocused ? 4.2 : 2.5}
                        dot={false}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* 우측 (5칸): 전 섹터 KOSPI 대비 상대강도(RS Spread, %p) & 68%·95%·99% 신뢰구간 위치 수평 막대그래프 */}
        <div className="xl:col-span-5 bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm sm:text-base font-extrabold text-white">
                📊 전 섹터 KOSPI(=0) 대비 상대강도 & 68%·95%·99% 신뢰구간 위치
              </h3>
              {data && (
                <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-[11px] font-mono text-slate-300">
                  상회 <strong className="text-rose-400">{data.outperform_sector_count}</strong> / 하회{" "}
                  <strong className="text-sky-400">{data.underperform_sector_count}</strong>
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 mb-2">
              기준선 0%p(KOSPI 상승률) 좌우로 <strong className="text-emerald-300">±68%</strong>,{" "}
              <strong className="text-amber-300">±95%</strong>, <strong className="text-rose-400">±99%</strong> 신뢰구간 수직선이 표시됩니다. (막대 클릭 시 즉시 Tetris 이동)
            </p>
          </div>

          <div className="h-[545px] w-full text-xs font-mono">
            {data && Array.isArray(data.sectors) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.sectors}
                  layout="vertical"
                  margin={{ top: 8, right: 22, left: 32, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    type="number"
                    stroke="#94a3b8"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => `${v > 0 ? "+" : ""}${v}%p`}
                  />
                  <YAxis
                    type="category"
                    dataKey="sector"
                    stroke="#e2e8f0"
                    tick={{ fontSize: 11 }}
                    width={76}
                  />
                  <Tooltip
                    content={({ active, payload }: any) => {
                      if (!active || !payload || !payload.length) return null;
                      const s = payload[0].payload;
                      return (
                        <div className="bg-[#090d16] border border-slate-700 rounded-xl p-3 shadow-2xl text-xs font-mono space-y-1">
                          <div className="font-extrabold text-white">
                            #{s.rs_rank}위 {s.sector} (시총비중 {s.market_cap_weight_pct}%)
                          </div>
                          <div className={s.rs_spread_pct >= 0 ? "text-rose-400 font-bold" : "text-sky-400 font-bold"}>
                            KOSPI 대비 상대강도: {s.rs_spread_pct >= 0 ? "+" : ""}
                            {s.rs_spread_pct}%p (Z-Score: {s.rs_z_score >= 0 ? "+" : ""}
                            {s.rs_z_score}σ)
                          </div>
                          <div className="text-amber-300 font-bold">
                            신뢰구간 위치: {s.status_badge}
                          </div>
                          <div className="text-slate-300">
                            섹터 상승률: {s.sector_return_pct >= 0 ? "+" : ""}
                            {s.sector_return_pct}% vs KOSPI {s.market_return_pct >= 0 ? "+" : ""}
                            {s.market_return_pct}%
                          </div>
                          <div className="text-purple-300">
                            🧱 ROE≥10% & 기울기 우상향 종목: {s.tetris_upward_10_count}종목 / 전체 {s.stock_count}종목
                          </div>
                        </div>
                      );
                    }}
                  />
                  {/* KOSPI = 0 기준선 및 ±68%, ±95%, ±99% 신뢰구간 수직 기준선 */}
                  <ReferenceLine x={0} stroke="#facc15" strokeWidth={2} />
                  <ReferenceLine x={ciInfo.ci68} stroke="#34d399" strokeDasharray="4 4" />
                  <ReferenceLine x={-ciInfo.ci68} stroke="#34d399" strokeDasharray="4 4" />
                  <ReferenceLine x={ciInfo.ci95} stroke="#fbbf24" strokeDasharray="6 3" />
                  <ReferenceLine x={-ciInfo.ci95} stroke="#fbbf24" strokeDasharray="6 3" />
                  <ReferenceLine x={ciInfo.ci99} stroke="#fb7185" strokeDasharray="2 3" />
                  <ReferenceLine x={-ciInfo.ci99} stroke="#38bdf8" strokeDasharray="2 3" />

                  <Bar
                    dataKey="rs_spread_pct"
                    name="KOSPI 대비 상대강도(%p)"
                    cursor="pointer"
                    onClick={(barData: any) => {
                      if (barData && barData.sector && onExploreSectorInTetris) {
                        onExploreSectorInTetris(barData.sector);
                      }
                    }}
                  >
                    {data.sectors.map((entry: any, index: number) => {
                      const rs = Number(entry.rs_spread_pct || 0);
                      let fillCol = "#64748b";
                      if (rs >= ciInfo.ci95) fillCol = "#f43f5e"; // +95% 이상 강세 주도 (진한 빨강)
                      else if (rs >= ciInfo.ci68) fillCol = "#fb923c"; // +68% 이상 강세 (주황)
                      else if (rs >= 0) fillCol = "#10b981"; // 0 ~ +68% KOSPI 상회 (에메랄드)
                      else if (rs <= -ciInfo.ci95) fillCol = "#0284c7"; // -95% 이하 약세 소외 (진한 파랑)
                      else if (rs <= -ciInfo.ci68) fillCol = "#38bdf8"; // -68% 이하 약세 (하늘)
                      else fillCol = "#64748b"; // 0 ~ -68% KOSPI 소폭 하회 (슬레이트)

                      return <Cell key={`rs-bar-${index}`} fill={fillCol} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-500">
                데이터 로딩 중...
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. 하단 전체폭 배치: 섹터별 상대강도 · 신뢰구간 위치 · 시총비중 · 펀더멘탈(ROE/ΔROE/PBR) · Tetris 종목필터링 직결 요약표 */}
      {data && Array.isArray(data.sectors) && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-white">
                🧱 섹터별 상대강도(KOSPI=0 기준) & 68%·95%·99% 신뢰구간 등급 · ROE 우상향 종목 요약표 (클릭 시 종목 필터링[Tetris] 즉시 연동)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                상단 차트에서 강세업종(+68%·+95%·+99% 신뢰구간 상회)과 약세업종을 판별한 뒤, 우측{" "}
                <strong className="text-purple-300">[🧱 종목 필터링 탐색 →]</strong> 버튼을 누르면 해당 섹터의 종목들이 Tetris 산점도에 즉시 펼쳐집니다.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded-lg bg-rose-950/70 border border-rose-500/40 text-rose-300 font-bold">
                KOSPI 상회(RS≥0): {data.outperform_sector_count}개 업종
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-sky-950/70 border border-sky-500/40 text-sky-300 font-bold">
                KOSPI 하회(RS&lt;0): {data.underperform_sector_count}개 업종
              </span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[560px] overflow-y-auto">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 bg-slate-950 text-slate-400 border-b border-slate-800 z-10">
                <tr>
                  <th className="py-2.5 px-2.5">순위</th>
                  <th className="py-2.5 px-2.5">섹터명 (종목수 · 시총비중)</th>
                  <th className="py-2.5 px-2.5">68%·95%·99% 신뢰구간 판정</th>
                  <th className="py-2.5 px-2.5 text-right">섹터지수 상승률</th>
                  <th className="py-2.5 px-2.5 text-right">KOSPI 대비 상대강도 (Z-Score)</th>
                  <th className="py-2.5 px-2.5 text-right">상승종목 비율 (Breadth)</th>
                  <th className="py-2.5 px-2.5 text-right">평균 ROE (전분기대비 ΔROE)</th>
                  <th className="py-2.5 px-2.5 text-center">ROE≥10% &amp; 우상향</th>
                  <th className="py-2.5 px-2.5">섹터 내 핵심 우상향/주도 종목</th>
                  <th className="py-2.5 px-2.5 text-right">종목 필터링 연동</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 font-mono">
                {data.sectors.map((sec: any) => (
                  <tr
                    key={sec.sector}
                    onMouseEnter={() => setFocusedSector(sec.sector)}
                    onMouseLeave={() => setFocusedSector(null)}
                    className="hover:bg-slate-800/50 transition"
                  >
                    <td className="py-2.5 px-2.5 font-extrabold">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          sec.rs_spread_pct >= ciInfo.ci68
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                            : sec.rs_spread_pct >= 0
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                            : sec.rs_spread_pct <= -ciInfo.ci68
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        #{sec.rs_rank}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 font-sans">
                      <div className="font-extrabold text-white text-sm">{sec.sector}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {sec.stock_count}종목 · 시총비중 <strong className="text-amber-300">{sec.market_cap_weight_pct}%</strong>
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 font-sans">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-extrabold border ${
                          sec.rs_spread_pct >= ciInfo.ci95
                            ? "bg-rose-950/90 border-rose-500/60 text-rose-300"
                            : sec.rs_spread_pct >= ciInfo.ci68
                            ? "bg-amber-950/90 border-amber-500/60 text-amber-300"
                            : sec.rs_spread_pct >= 0
                            ? "bg-emerald-950/80 border-emerald-500/50 text-emerald-300"
                            : sec.rs_spread_pct <= -ciInfo.ci95
                            ? "bg-sky-950/90 border-sky-500/60 text-sky-300"
                            : sec.rs_spread_pct <= -ciInfo.ci68
                            ? "bg-blue-950/80 border-blue-500/50 text-blue-300"
                            : "bg-slate-900 border-slate-700 text-slate-400"
                        }`}
                      >
                        {sec.status_badge}
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-bold text-slate-200">
                      <div className={sec.sector_return_pct >= 0 ? "text-rose-400" : "text-sky-400"}>
                        {sec.sector_return_pct >= 0 ? "+" : ""}
                        {sec.sector_return_pct}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        (지수 {sec.current_index_100.toFixed(1)}pt)
                      </div>
                    </td>
                    <td
                      className={`py-2.5 px-2.5 text-right font-extrabold ${
                        sec.rs_spread_pct >= 0 ? "text-rose-400" : "text-sky-400"
                      }`}
                    >
                      <div className="text-sm">
                        {sec.rs_spread_pct >= 0 ? "+" : ""}
                        {sec.rs_spread_pct}%p
                      </div>
                      <div className="text-[10px] text-slate-300">
                        Z = {sec.rs_z_score >= 0 ? "+" : ""}
                        {sec.rs_z_score}σ (RS {sec.rs_score}점)
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 text-right text-slate-300 font-bold">
                      {sec.breadth_pct}%
                    </td>
                    <td className="py-2.5 px-2.5 text-right">
                      <div className="text-slate-200 font-bold">{sec.avg_roe}%</div>
                      <div
                        className={`text-[10px] ${
                          sec.avg_qoq_roe_diff >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        ({sec.avg_qoq_roe_diff >= 0 ? "+" : ""}
                        {sec.avg_qoq_roe_diff}%p)
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 text-center">
                      <span className="px-2.5 py-0.5 rounded-full bg-purple-950/80 border border-purple-500/50 text-purple-200 font-extrabold">
                        {sec.tetris_upward_10_count}종목
                      </span>
                    </td>
                    <td className="py-2.5 px-2.5 font-sans">
                      <div className="flex flex-wrap gap-1.5">
                        {(sec.top_stocks || []).slice(0, 4).map((st: any) => (
                          <button
                            key={st.ticker}
                            type="button"
                            onClick={() => onSelectStockTicker && onSelectStockTicker(st.ticker)}
                            title={`${st.name}(${st.ticker}) | ROE ${st.roe}% (Δ${st.qoq_roe_diff >= 0 ? "+" : ""}${st.qoq_roe_diff}%p) | PBR ${st.pbr}배`}
                            className="px-2 py-0.5 rounded bg-slate-950 hover:bg-indigo-950 border border-slate-700 text-[11px] text-slate-200 cursor-pointer truncate"
                          >
                            {st.name}{" "}
                            <span className="text-emerald-400 font-mono">ROE {st.roe}%</span>
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="py-2.5 px-2.5 text-right font-sans">
                      <button
                        type="button"
                        onClick={() => onExploreSectorInTetris && onExploreSectorInTetris(sec.sector)}
                        className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-extrabold cursor-pointer transition shadow whitespace-nowrap"
                      >
                        🧱 종목 필터링 탐색 →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
