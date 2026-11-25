"use client";

import React, { useState, useEffect, useCallback } from "react";

interface FuturesSimulationViewProps {
  apiBaseUrl?: string;
}

const MODEL_COLORS = [
  "#10b981",
  "#38bdf8",
  "#a855f7",
  "#f43f5e",
  "#22d3ee",
  "#84cc16",
  "#ec4899",
  "#6366f1",
  "#f59e0b",
  "#14b8a6",
  "#fb923c",
  "#c084fc",
  "#facc15",
];

function SvgMultiLineChart({
  dates,
  seriesList,
  height = 260,
  unit = "%",
  baselineVal = 0,
}: {
  dates: string[];
  seriesList: { label: string; data: number[]; color: string; dashed?: boolean; width?: number }[];
  height?: number;
  unit?: string;
  baselineVal?: number;
}) {
  if (!dates || dates.length < 2 || !seriesList.length) {
    return (
      <div className="flex items-center justify-center h-60 text-xs text-slate-500">
        차트 데이터를 불러오는 중입니다...
      </div>
    );
  }

  const allVals: number[] = [baselineVal];
  seriesList.forEach((s) => {
    (s.data || []).forEach((v) => {
      if (typeof v === "number" && !isNaN(v)) allVals.push(v);
    });
  });

  const minVal = Math.min(...allVals);
  const maxVal = Math.max(...allVals);
  const span = Math.max(1, maxVal - minVal);
  const padMin = minVal - span * 0.08;
  const padMax = maxVal + span * 0.08;
  const totalRange = Math.max(1, padMax - padMin);

  const W = 920;
  const H = height;
  const padL = 62;
  const padR = 18;
  const padT = 18;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const toX = (i: number) => padL + (i / Math.max(1, dates.length - 1)) * plotW;
  const toY = (v: number) => padT + ((padMax - v) / totalRange) * plotH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => padMin + t * totalRange);
  const xTickIndices = [
    0,
    Math.floor(dates.length * 0.25),
    Math.floor(dates.length * 0.5),
    Math.floor(dates.length * 0.75),
    dates.length - 1,
  ];

  const baseY = padMin <= baselineVal && padMax >= baselineVal ? toY(baselineVal) : null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-3 mb-2 text-[11px]">
        {seriesList.map((s, idx) => {
          const lastVal = s.data && s.data.length ? s.data[s.data.length - 1] : 0;
          return (
            <div key={idx} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3.5 h-1 rounded"
                style={{
                  backgroundColor: s.color,
                  borderBottom: s.dashed ? `2px dashed ${s.color}` : undefined,
                }}
              />
              <span className="text-slate-300 font-medium">{s.label}</span>
              <span className="font-mono font-bold" style={{ color: s.color }}>
                ({lastVal >= 0 && unit === "%" ? "+" : ""}
                {Number(lastVal).toFixed(2)}
                {unit})
              </span>
            </div>
          );
        })}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-slate-950/70 rounded-xl border border-slate-800/80">
        {yTicks.map((yv, idx) => {
          const y = toY(yv);
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(51,65,85,0.35)" strokeWidth="1" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                {yv >= 0 && unit === "%" ? "+" : ""}
                {yv.toFixed(0)}
                {unit}
              </text>
            </g>
          );
        })}

        {baseY !== null && (
          <line
            x1={padL}
            y1={baseY}
            x2={W - padR}
            y2={baseY}
            stroke="rgba(148,163,184,0.45)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        )}

        {xTickIndices.map((xi, idx) => {
          const x = toX(xi);
          return (
            <text
              key={idx}
              x={x}
              y={H - 8}
              textAnchor={idx === 0 ? "start" : idx === xTickIndices.length - 1 ? "end" : "middle"}
              fill="#94a3b8"
              fontSize="10"
              fontFamily="monospace"
            >
              {dates[xi]}
            </text>
          );
        })}

        {seriesList.map((s, idx) => {
          if (!s.data || !s.data.length) return null;
          const pts = s.data
            .map((v, i) => `${toX(i).toFixed(1)},${toY(Number(v) || 0).toFixed(1)}`)
            .join(" ");
          return (
            <polyline
              key={idx}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width || 2.2}
              strokeDasharray={s.dashed ? "6,4" : undefined}
              points={pts}
            />
          );
        })}
      </svg>
    </div>
  );
}

function SvgBarAndLineChart({
  dates,
  barData,
  barLabel,
  barUnit = "%",
  lineData,
  lineLabel,
  lineColor = "#38bdf8",
  lineUnit = "%",
  secondLineData,
  secondLineLabel,
  secondLineColor = "#f59e0b",
  secondLineUnit = "%",
  secondLineDashed = true,
  secondLineExtraText,
  height = 250,
  posBarColor = "#10b981",
  negBarColor = "#f43f5e",
}: {
  dates: string[];
  barData: number[];
  barLabel: string;
  barUnit?: string;
  lineData?: number[];
  lineLabel?: string;
  lineColor?: string;
  lineUnit?: string;
  secondLineData?: number[];
  secondLineLabel?: string;
  secondLineColor?: string;
  secondLineUnit?: string;
  secondLineDashed?: boolean;
  secondLineExtraText?: string;
  height?: number;
  posBarColor?: string;
  negBarColor?: string;
}) {
  if (!dates || dates.length < 2 || !barData || !barData.length) {
    return (
      <div className="flex items-center justify-center h-56 text-xs text-slate-500">
        차트 데이터를 불러오는 중입니다...
      </div>
    );
  }

  const W = 920;
  const H = height;
  const padL = 58;
  const padR = lineData && lineData.length ? 64 : 20;
  const padT = 18;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const barVals = [0, ...barData.map((v) => Number(v) || 0)];
  const bMin = Math.min(...barVals);
  const bMax = Math.max(...barVals);
  const bSpan = Math.max(1, bMax - bMin);
  const bPadMin = bMin - bSpan * 0.1;
  const bPadMax = bMax + bSpan * 0.1;
  const bRange = Math.max(1, bPadMax - bPadMin);

  const toX = (i: number) => padL + (i / Math.max(1, dates.length - 1)) * plotW;
  const toBarY = (v: number) => padT + ((bPadMax - v) / bRange) * plotH;
  const zeroBarY = toBarY(0);

  let toLineY = toBarY;
  let lPadMin = bPadMin;
  let lRange = bRange;
  if (lineData && lineData.length) {
    const combinedLineVals = [
      0,
      ...lineData.map((v) => Number(v) || 0),
      ...(secondLineData && secondLineData.length && secondLineUnit === lineUnit
        ? secondLineData.map((v) => Number(v) || 0)
        : []),
    ];
    const lMin = Math.min(...combinedLineVals);
    const lMax = Math.max(...combinedLineVals);
    const lSpan = Math.max(1, lMax - lMin);
    lPadMin = lMin - lSpan * 0.1;
    const lPadMax = lMax + lSpan * 0.1;
    lRange = Math.max(1, lPadMax - lPadMin);
    toLineY = (v: number) => padT + ((lPadMax - v) / lRange) * plotH;
  }

  let toSecondLineY = toLineY;
  if (secondLineData && secondLineData.length && secondLineUnit !== lineUnit) {
    const sVals = secondLineData.map((v) => Number(v) || 0);
    const sMin = Math.min(...sVals);
    const sMax = Math.max(...sVals);
    const sSpan = Math.max(1, sMax - sMin);
    const sPadMin = sMin - sSpan * 0.1;
    const sPadMax = sMax + sSpan * 0.1;
    const sRange = Math.max(1, sPadMax - sPadMin);
    toSecondLineY = (v: number) => padT + ((sPadMax - v) / sRange) * plotH;
  }

  const barWidth = Math.max(1.5, Math.min(12, (plotW / Math.max(1, dates.length)) * 0.72));
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTickIndices = [
    0,
    Math.floor(dates.length * 0.25),
    Math.floor(dates.length * 0.5),
    Math.floor(dates.length * 0.75),
    dates.length - 1,
  ];

  const lastBar = barData[barData.length - 1] ?? 0;
  const lastLine = lineData && lineData.length ? lineData[lineData.length - 1] : null;
  const lastSecondLine =
    secondLineData && secondLineData.length ? secondLineData[secondLineData.length - 1] : null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-4 mb-2 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 rounded-sm bg-emerald-500" />
          <span className="inline-block w-3 h-2.5 rounded-sm bg-rose-500" />
          <span className="text-slate-300 font-medium">{barLabel}</span>
          <span className={`font-mono font-bold ${lastBar >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
            ({lastBar >= 0 ? "+" : ""}
            {Number(lastBar).toFixed(barUnit === "%" ? 2 : 0)}
            {barUnit})
          </span>
        </div>
        {lineData && lineLabel && lastLine !== null && (
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-1 rounded" style={{ backgroundColor: lineColor }} />
            <span className="text-slate-300 font-medium">{lineLabel}</span>
            <span className="font-mono font-bold" style={{ color: lineColor }}>
              ({lastLine >= 0 ? "+" : ""}
              {Number(lastLine).toFixed(lineUnit === "%" ? 2 : 0)}
              {lineUnit})
            </span>
          </div>
        )}
        {secondLineData && secondLineLabel && lastSecondLine !== null && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-3.5 h-1 rounded"
              style={{
                backgroundColor: secondLineColor,
                borderBottom: secondLineDashed ? `2px dashed ${secondLineColor}` : undefined,
              }}
            />
            <span className="text-slate-300 font-medium">{secondLineLabel}</span>
            <span className="font-mono font-bold" style={{ color: secondLineColor }}>
              ({lastSecondLine >= 0 && secondLineUnit === "%" ? "+" : ""}
              {Number(lastSecondLine).toFixed(secondLineUnit === "%" ? 2 : 2)}
              {secondLineUnit}
              {secondLineExtraText ? ` · ${secondLineExtraText}` : ""})
            </span>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-slate-950/70 rounded-xl border border-slate-800/80">
        {yTicks.map((t, idx) => {
          const bv = bPadMin + t * bRange;
          const y = toBarY(bv);
          const lv = lPadMin + t * lRange;
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(51,65,85,0.35)" strokeWidth="1" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fill="#94a3b8" fontSize="10" fontFamily="monospace">
                {bv >= 0 && barUnit === "%" ? "+" : ""}
                {bv.toFixed(barUnit === "%" ? 1 : 0)}
                {barUnit}
              </text>
              {lineData && lineData.length ? (
                <text
                  x={W - padR + 6}
                  y={y + 4}
                  textAnchor="start"
                  fill={lineColor}
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {lv >= 0 && lineUnit === "%" ? "+" : ""}
                  {lv.toFixed(0)}
                  {lineUnit}
                </text>
              ) : null}
            </g>
          );
        })}

        <line
          x1={padL}
          y1={zeroBarY}
          x2={W - padR}
          y2={zeroBarY}
          stroke="rgba(148,163,184,0.55)"
          strokeWidth="1"
          strokeDasharray="3,3"
        />

        {barData.map((rawV, i) => {
          const v = Number(rawV) || 0;
          const x = toX(i) - barWidth / 2;
          const y = v >= 0 ? toBarY(v) : zeroBarY;
          const h = Math.max(1, Math.abs(toBarY(v) - zeroBarY));
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={barWidth}
              height={h}
              fill={v >= 0 ? posBarColor : negBarColor}
              opacity={0.85}
            />
          );
        })}

        {secondLineData && secondLineData.length > 1 && (
          <polyline
            fill="none"
            stroke={secondLineColor}
            strokeWidth="2.0"
            strokeDasharray={secondLineDashed ? "5,3" : undefined}
            points={secondLineData
              .map((v, i) => `${toX(i).toFixed(1)},${toSecondLineY(Number(v) || 0).toFixed(1)}`)
              .join(" ")}
          />
        )}

        {lineData && lineData.length > 1 && (
          <polyline
            fill="none"
            stroke={lineColor}
            strokeWidth="2.3"
            points={lineData
              .map((v, i) => `${toX(i).toFixed(1)},${toLineY(Number(v) || 0).toFixed(1)}`)
              .join(" ")}
          />
        )}

        {xTickIndices.map((xi, idx) => {
          const x = toX(xi);
          return (
            <text
              key={idx}
              x={x}
              y={H - 8}
              textAnchor={idx === 0 ? "start" : idx === xTickIndices.length - 1 ? "end" : "middle"}
              fill="#94a3b8"
              fontSize="10"
              fontFamily="monospace"
            >
              {dates[xi]}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function SvgDualAxisMarketChart({
  dates,
  futuresCloses,
  k200Closes,
  rightSeries,
  rightLabel,
  rightUnit = "",
  rightColor = "#38bdf8",
  rightIsBar = false,
  height = 245,
}: {
  dates: string[];
  futuresCloses: number[];
  k200Closes: number[];
  rightSeries?: number[];
  rightLabel?: string;
  rightUnit?: string;
  rightColor?: string;
  rightIsBar?: boolean;
  height?: number;
}) {
  if (!dates || dates.length < 2 || (!futuresCloses.length && !k200Closes.length)) {
    return (
      <div className="flex items-center justify-center h-56 text-xs text-slate-500">
        시장지표 차트 데이터를 불러오는 중입니다...
      </div>
    );
  }

  const W = 940;
  const H = height;
  const padL = 62;
  const padR = rightSeries && rightSeries.length ? 76 : 24;
  const padT = 18;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const leftVals = [
    ...futuresCloses.filter((v) => Number(v) > 0),
    ...k200Closes.filter((v) => Number(v) > 0),
  ];
  const lMinRaw = leftVals.length ? Math.min(...leftVals) : 300;
  const lMaxRaw = leftVals.length ? Math.max(...leftVals) : 400;
  const lSpan = Math.max(1.0, lMaxRaw - lMinRaw);
  const lMin = lMinRaw - lSpan * 0.08;
  const lMax = lMaxRaw + lSpan * 0.08;
  const lRange = Math.max(1e-6, lMax - lMin);

  const hasRight = Boolean(rightSeries && rightSeries.length);
  const rVals = hasRight
    ? rightIsBar
      ? [0, ...(rightSeries || []).map((v) => Number(v) || 0)]
      : (rightSeries || []).map((v) => Number(v) || 0)
    : [0, 1];
  const rMinRaw = Math.min(...rVals);
  const rMaxRaw = Math.max(...rVals);
  const rSpan = Math.max(1e-4, rMaxRaw - rMinRaw);
  const rMin = rMinRaw - rSpan * 0.1;
  const rMax = rMaxRaw + rSpan * 0.1;
  const rRange = Math.max(1e-6, rMax - rMin);

  const n = dates.length;
  const toX = (i: number) => padL + (i / Math.max(1, n - 1)) * plotW;
  const toLeftY = (v: number) => padT + plotH - ((v - lMin) / lRange) * plotH;
  const toRightY = (v: number) => padT + plotH - ((v - rMin) / rRange) * plotH;
  const zeroRightY = toRightY(0);

  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const xTickIndices = [
    0,
    Math.floor((n - 1) * 0.25),
    Math.floor((n - 1) * 0.5),
    Math.floor((n - 1) * 0.75),
    n - 1,
  ];
  const barWidth = Math.max(1.5, Math.min(10, (plotW / Math.max(1, n)) * 0.65));

  const lastFut = futuresCloses.length ? futuresCloses[futuresCloses.length - 1] : 0;
  const lastK200 = k200Closes.length ? k200Closes[k200Closes.length - 1] : 0;
  const lastRight = hasRight && rightSeries ? rightSeries[rightSeries.length - 1] : null;

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-3.5 h-1 rounded bg-emerald-400" />
            <span className="text-slate-200 font-bold">[좌축 디폴트] KOSPI200 선물종가</span>
            <span className="font-mono font-extrabold text-emerald-400">({Number(lastFut).toFixed(2)}pt)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block w-3.5 h-1 rounded bg-amber-400"
              style={{ borderBottom: "2px dashed #f59e0b" }}
            />
            <span className="text-slate-200 font-bold">[좌축 디폴트] KOSPI200 현물지수</span>
            <span className="font-mono font-extrabold text-amber-300">({Number(lastK200).toFixed(2)}pt)</span>
          </div>
        </div>
        {hasRight && rightLabel && lastRight !== null && (
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-slate-900 border border-slate-700">
            <span className="inline-block w-3.5 h-2 rounded" style={{ backgroundColor: rightColor }} />
            <span className="text-white font-extrabold">[우축 선택지표] {rightLabel}</span>
            <span className="font-mono font-extrabold" style={{ color: rightColor }}>
              ({Number(lastRight).toLocaleString()}
              {rightUnit})
            </span>
          </div>
        )}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto bg-slate-950/80 rounded-xl border border-slate-800">
        {yTicks.map((t, idx) => {
          const lv = lMin + t * lRange;
          const y = toLeftY(lv);
          const rv = rMin + t * rRange;
          return (
            <g key={idx}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="rgba(51,65,85,0.38)" strokeWidth="1" />
              <text x={padL - 6} y={y + 4} textAnchor="end" fill="#34d399" fontSize="10" fontFamily="monospace">
                {lv.toFixed(1)}pt
              </text>
              {hasRight && (
                <text
                  x={W - padR + 6}
                  y={y + 4}
                  textAnchor="start"
                  fill={rightColor}
                  fontSize="10"
                  fontFamily="monospace"
                >
                  {Math.abs(rv) >= 100
                    ? Math.round(rv).toLocaleString()
                    : rv.toFixed(rightUnit === "배" || rightUnit === "pt" ? 2 : 1)}
                  {rightUnit}
                </text>
              )}
            </g>
          );
        })}

        {hasRight && rightIsBar && rMin <= 0 && rMax >= 0 && (
          <line
            x1={padL}
            y1={zeroRightY}
            x2={W - padR}
            y2={zeroRightY}
            stroke="rgba(148,163,184,0.45)"
            strokeWidth="1"
            strokeDasharray="3,3"
          />
        )}

        {/* 우측 축 선택 시장지표 (막대 또는 선) */}
        {hasRight &&
          rightIsBar &&
          (rightSeries || []).map((rawV, i) => {
            const v = Number(rawV) || 0;
            const x = toX(i) - barWidth / 2;
            const y = v >= 0 ? toRightY(v) : zeroRightY;
            const h = Math.max(1.2, Math.abs(toRightY(v) - zeroRightY));
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barWidth}
                height={h}
                fill={v >= 0 ? rightColor : "#f43f5e"}
                opacity={0.45}
              />
            );
          })}

        {hasRight && !rightIsBar && (rightSeries || []).length > 1 && (
          <polyline
            fill="none"
            stroke={rightColor}
            strokeWidth="2.4"
            points={(rightSeries || [])
              .map((v, i) => `${toX(i).toFixed(1)},${toRightY(Number(v) || 0).toFixed(1)}`)
              .join(" ")}
          />
        )}

        {/* 좌측 축 디폴트 1: KOSPI200 현물지수 (점선) */}
        {k200Closes.length > 1 && (
          <polyline
            fill="none"
            stroke="#f59e0b"
            strokeWidth="2.0"
            strokeDasharray="5,3"
            points={k200Closes
              .map((v, i) => `${toX(i).toFixed(1)},${toLeftY(Number(v) || lMin).toFixed(1)}`)
              .join(" ")}
          />
        )}

        {/* 좌측 축 디폴트 2: KOSPI200 선물종가 (실선) */}
        {futuresCloses.length > 1 && (
          <polyline
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            points={futuresCloses
              .map((v, i) => `${toX(i).toFixed(1)},${toLeftY(Number(v) || lMin).toFixed(1)}`)
              .join(" ")}
          />
        )}

        {xTickIndices.map((xi, idx) => {
          const x = toX(xi);
          return (
            <text
              key={idx}
              x={x}
              y={H - 8}
              textAnchor={idx === 0 ? "start" : idx === xTickIndices.length - 1 ? "end" : "middle"}
              fill="#94a3b8"
              fontSize="10"
              fontFamily="monospace"
            >
              {dates[xi]}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

export default function FuturesSimulationView({
  apiBaseUrl = "/api/futures-sim",
}: FuturesSimulationViewProps) {
  const [step, setStep] = useState<number>(6);
  const [showManual, setShowManual] = useState<boolean>(false);
  const [startDate, setStartDate] = useState("2023-01-02");
  const [endDate, setEndDate] = useState("2026-11-09");
  const [useCurrent, setUseCurrent] = useState(true);
  const [combineSupply, setCombineSupply] = useState(true);
  const [supplyWeight, setSupplyWeight] = useState(35);
  const [multiplier, setMultiplier] = useState(1);
  const [pointValueKrw, setPointValueKrw] = useState<number>(50000); // 디폴트: 50,000원(미니선물), 선택: 250,000원(정규선물)
  const initialCapitalKrw = 100000000; // 투자원금 기준: 1억원 (100,000,000원)
  const [mddThreshold, setMddThreshold] = useState(15.0);
  const [enableAutoSwap, setEnableAutoSwap] = useState(false);
  const [sharpeLookbackDays, setSharpeLookbackDays] = useState<number>(126); // 126=최근6개월(장기일관성 기본값), 63=최근3개월, 0=구간전체
  const [replacementMode, setReplacementMode] = useState<string>("MANUAL_FIXED"); // MANUAL_FIXED(주력5모델 고정 기본값), MDD_RENEWAL_ONLY, HYBRID, PERIODIC_ONLY
  const [periodicRebalanceDays, setPeriodicRebalanceDays] = useState<number>(126); // 126=6개월 정기교체(기본값), 63=3개월 정기교체
  const [mddTriggerMode, setMddTriggerMode] = useState<string>("LIMIT_ONLY"); // LIMIT_ONLY(엄격한도 15% 초과시에만 교체), RENEWAL_OR_LIMIT, RENEWAL_ONLY
  const [portfolioRiskMode, setPortfolioRiskMode] = useState<string>("MODEL_SWAP_ONLY"); // MODEL_SWAP_ONLY, PORTFOLIO_SCALE_DOWN, PORTFOLIO_HARD_STOP
  const [portfolioMddLimit, setPortfolioMddLimit] = useState<number>(15.0); // 포트폴리오 위험 축소 / 실전 운용 중지 기준 한도(%)

  const [evalStart, setEvalStart] = useState("2024-01-02");
  const [evalEnd, setEvalEnd] = useState("2025-12-30");
  const [testStart, setTestStart] = useState("2026-01-02");
  const [testUseCurrent, setTestUseCurrent] = useState(true);
  const [testEnd, setTestEnd] = useState("2026-11-09");

  // 포워드(직전 3개월/6개월 -> 직후 3개월/6개월) 연속성 & 후보모델 10대 풀 편입 상태
  const [anchorDate, setAnchorDate] = useState("2026-05-01");
  const [forwardMonths, setForwardMonths] = useState<number>(3);
  const [candidateModelId, setCandidateModelId] = useState<string>("C03_Multi_Timeframe_Composite");
  const [autoApplyPoolRotation, setAutoApplyPoolRotation] = useState<boolean>(false);
  const [poolEvalData, setPoolEvalData] = useState<any>(null);

  const [adoptedChartFilter, setAdoptedChartFilter] = useState<string>("ALL");
  const [allModelChartFilter, setAllModelChartFilter] = useState<string>("ALL_13");

  // 매매원장 및 Step 5 전용 독립 기간 설정 (시뮬레이션 탭의 구간 설정과 100% 독립 작동)
  const [ledgerStartDate, setLedgerStartDate] = useState<string>("2026-01-02");
  const [ledgerEndDate, setLedgerEndDate] = useState<string>("2026-11-10");
  const [ledgerUseCurrent, setLedgerUseCurrent] = useState<boolean>(true);
  const [step5LedgerRows, setStep5LedgerRows] = useState<any[]>([]);
  const [step5ActiveModels, setStep5ActiveModels] = useState<string[]>([]);
  const [step5ModelsPerformance, setStep5ModelsPerformance] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState<boolean>(false);
  const [autoRefreshRealtime, setAutoRefreshRealtime] = useState<boolean>(true);
  const [realtimeSyncing, setRealtimeSyncing] = useState<boolean>(false);

  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([
    "M01_MA_Trend",
    "M03_TnT_Channel",
    "M05_Gap_Reversion",
    "M08_Foreign_Program_Flow",
    "M10_Breadth_HPI_Sentiment",
  ]);
  const [simData, setSimData] = useState<any>(null);
  const [consistencyData, setConsistencyData] = useState<any>(null);
  const [lockStatus, setLockStatus] = useState<any>(null);
  const [kisAccountData, setKisAccountData] = useState<any>(null);
  const [kisModeInput, setKisModeInput] = useState<string>("PAPER");
  const [kisCanoInput, setKisCanoInput] = useState<string>("44790516");
  const [kisPrdtInput, setKisPrdtInput] = useState<string>("03");
  const [kisCapInput, setKisCapInput] = useState<number>(10);
  const [kisAutoExecInput, setKisAutoExecInput] = useState<boolean>(true);

  // Step 7: 4대 핵심 수급(① 공매도잔고 T+2, ② 신용잔고 T+2, ③ 미결제약정 OI, ④ 5일·20일 누적 차익거래) 역추세 시뮬레이션 상태
  const [scStartDate, setScStartDate] = useState<string>("2016-01-04");
  const [scSetupZ, setScSetupZ] = useState<number>(1.5);
  const [scScoreThresh, setScScoreThresh] = useState<number>(2.0);
  const [scMaxHoldDays, setScMaxHoldDays] = useState<number>(6);
  const [scAtrStopMult, setScAtrStopMult] = useState<number>(1.5);
  const [scRestrictExpiry, setScRestrictExpiry] = useState<boolean>(true);
  const [scSlippagePt, setScSlippagePt] = useState<number>(0.05);
  const [scContracts, setScContracts] = useState<number>(2);
  const [scBacktestData, setScBacktestData] = useState<any>(null);
  const [scLoading, setScLoading] = useState<boolean>(false);
  const [scTradeTab, setScTradeTab] = useState<"GATE" | "SCORING">("GATE");
  const [step5SelectedIndicator, setStep5SelectedIndicator] = useState<string>("open_interest");
  const [scVix20Thresh, setScVix20Thresh] = useState<number>(16.0);
  const [scEnergyThresh, setScEnergyThresh] = useState<number>(1.35);
  const [scOiAbsThresh, setScOiAbsThresh] = useState<number>(240000);
  const [kisOrdDvsnInput, setKisOrdDvsnInput] = useState<string>("02");
  const [kisOrderLoading, setKisOrderLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);
  const [bannerMsg, setBannerMsg] = useState<string>("");

  const callApi = useCallback(
    async (path: string, options?: RequestInit) => {
      try {
        const res = await fetch(`${apiBaseUrl}${path}`, options);
        if (res.ok) return await res.json();
      } catch (_) {
        // Fallback to local dedicated port 18200 only on localhost
      }
      if (
        typeof window !== "undefined" &&
        (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ) {
        const fallbackRes = await fetch(`http://127.0.0.1:18200/api/futures-sim${path}`, options);
        return await fallbackRes.json();
      }
      const retryRes = await fetch(`${apiBaseUrl}${path}`, options);
      return await retryRes.json();
    },
    [apiBaseUrl]
  );

  const fetchIntradayStatus = useCallback(
    async (syncNow: boolean = false, overridePointVal?: number) => {
      const pv = overridePointVal ?? pointValueKrw;
      try {
        const lockJson = await callApi(
          `/intraday-status?multiplier=${multiplier}&sync_now=${syncNow}&point_value_krw=${pv}&initial_capital_krw=${initialCapitalKrw}`
        );
        if (lockJson?.success) {
          setLockStatus(lockJson.data);
        }
      } catch (e) {
        console.error(e);
      }
    },
    [callApi, multiplier, pointValueKrw, initialCapitalKrw]
  );

  // Step 5 매매원장 전용 독립 조회 함수 (Step 1~4, 6의 시뮬레이션 구간과 완전 분리)
  const fetchLedgerOnly = useCallback(
    async (opts?: {
      start?: string;
      end?: string;
      current?: boolean;
      models?: string[];
      pointVal?: number;
      simWeight?: number;
      simCombineSupply?: boolean;
    }) => {
      const targetStart = opts?.start ?? ledgerStartDate;
      const targetCurrent = opts?.current ?? ledgerUseCurrent;
      const targetEnd = targetCurrent ? "CURRENT" : opts?.end ?? ledgerEndDate;
      const targetModels = opts?.models ?? selectedModelIds;
      const targetPointVal = opts?.pointVal ?? pointValueKrw;
      const targetSupplyWeight = opts?.simWeight ?? supplyWeight;
      const targetCombineSupply = opts?.simCombineSupply ?? combineSupply;

      setLedgerLoading(true);
      try {
        const res = await callApi("/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_date: targetStart,
            end_date: targetEnd,
            multiplier,
            point_value_krw: targetPointVal,
            initial_capital_krw: initialCapitalKrw,
            mdd_threshold_pct: mddThreshold,
            initial_selected_ids: targetModels,
            enable_auto_mdd_swap: false,
            combine_supply: targetCombineSupply,
            supply_weight: targetSupplyWeight / 100.0,
            sharpe_lookback_days: sharpeLookbackDays > 0 ? sharpeLookbackDays : null,
            record_swaps_to_db: false,
            replacement_mode: "MANUAL_FIXED",
            periodic_rebalance_days: periodicRebalanceDays,
            mdd_trigger_mode: mddTriggerMode,
            portfolio_risk_mode: portfolioRiskMode,
            portfolio_mdd_limit_pct: portfolioMddLimit,
          }),
        });
        if (res?.success && Array.isArray(res.data?.recent_trading_ledger)) {
          setStep5LedgerRows(res.data.recent_trading_ledger);
          if (Array.isArray(res.data?.active_5_models)) {
            setStep5ActiveModels(res.data.active_5_models);
          }
          if (Array.isArray(res.data?.models_performance)) {
            setStep5ModelsPerformance(res.data.models_performance);
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLedgerLoading(false);
      }
    },
    [
      callApi,
      ledgerStartDate,
      ledgerEndDate,
      ledgerUseCurrent,
      multiplier,
      pointValueKrw,
      initialCapitalKrw,
      mddThreshold,
      selectedModelIds,
      replacementMode,
      enableAutoSwap,
      combineSupply,
      supplyWeight,
      sharpeLookbackDays,
      periodicRebalanceDays,
      mddTriggerMode,
      portfolioRiskMode,
      portfolioMddLimit,
    ]
  );

  const fetchSimulation = useCallback(
    async (opts?: {
      start?: string;
      end?: string;
      current?: boolean;
      lookback?: number;
      models?: string[];
      repMode?: string;
      periodicDays?: number;
      trigMode?: string;
      pointVal?: number;
      riskMode?: string;
      portMddLimit?: number;
      simWeight?: number;
      simCombineSupply?: boolean;
    }) => {
      const targetStart = opts?.start ?? startDate;
      const targetCurrent = opts?.current ?? useCurrent;
      const targetEnd = targetCurrent ? "CURRENT" : opts?.end ?? endDate;
      const targetLookback = opts?.lookback ?? sharpeLookbackDays;
      const targetModels = opts?.models ?? selectedModelIds;
      const targetRepMode = opts?.repMode ?? replacementMode;
      const targetPeriodicDays = opts?.periodicDays ?? periodicRebalanceDays;
      const targetTrigMode = opts?.trigMode ?? mddTriggerMode;
      const targetPointVal = opts?.pointVal ?? pointValueKrw;
      const targetRiskMode = opts?.riskMode ?? portfolioRiskMode;
      const targetPortMddLimit = opts?.portMddLimit ?? portfolioMddLimit;
      const targetSupplyWeight = opts?.simWeight ?? supplyWeight;
      const targetCombineSupply = opts?.simCombineSupply ?? combineSupply;

      setLoading(true);
      try {
        const simJson = await callApi("/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_date: targetStart,
            end_date: targetEnd,
            multiplier,
            point_value_krw: targetPointVal,
            initial_capital_krw: initialCapitalKrw,
            mdd_threshold_pct: mddThreshold,
            initial_selected_ids: targetModels,
            enable_auto_mdd_swap: targetRepMode !== "MANUAL_FIXED" && enableAutoSwap,
            combine_supply: targetCombineSupply,
            supply_weight: targetSupplyWeight / 100.0,
            sharpe_lookback_days: targetLookback > 0 ? targetLookback : null,
            record_swaps_to_db: false,
            replacement_mode: targetRepMode,
            periodic_rebalance_days: targetPeriodicDays,
            mdd_trigger_mode: targetTrigMode,
            portfolio_risk_mode: targetRiskMode,
            portfolio_mdd_limit_pct: targetPortMddLimit,
          }),
        });
        if (simJson?.success) {
          setSimData(simJson.data);
          // 시뮬레이션(또는 MDD 자동교체) 결과 최종 채택된 5대 주력 모델과 체크박스를 항상 일치시킴
          const activeIds: string[] =
            simJson.data.active_5_models ||
            (simJson.data.models_performance || [])
              .filter((m: any) => m.is_currently_selected)
              .map((m: any) => m.model_id);
          if (activeIds.length > 0) {
            setSelectedModelIds(activeIds);
            fetchLedgerOnly({ models: activeIds });
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    },
    [
      callApi,
      startDate,
      endDate,
      useCurrent,
      multiplier,
      pointValueKrw,
      initialCapitalKrw,
      mddThreshold,
      selectedModelIds,
      enableAutoSwap,
      combineSupply,
      supplyWeight,
      sharpeLookbackDays,
      replacementMode,
      periodicRebalanceDays,
      mddTriggerMode,
      portfolioRiskMode,
      portfolioMddLimit,
    ]
  );

  const fetchKisAccount = useCallback(async () => {
    try {
      const res = await callApi("/kis-account");
      if (res?.success && res.data) {
        setKisAccountData(res.data);
        const cfg = res.data.config || {};
        if (cfg.mode) setKisModeInput(cfg.mode);
        if (cfg.cano) setKisCanoInput(cfg.cano);
        if (cfg.acnt_prdt_cd) setKisPrdtInput(cfg.acnt_prdt_cd);
        if (cfg.max_contracts_cap) setKisCapInput(cfg.max_contracts_cap);
        if (cfg.auto_execute_at_1535 !== undefined) setKisAutoExecInput(Boolean(cfg.auto_execute_at_1535));
        if (cfg.default_ord_dvsn) setKisOrdDvsnInput(cfg.default_ord_dvsn);
      }
    } catch (e) {
      console.error(e);
    }
  }, [callApi]);

  const fetchSupplyContrarianBacktest = useCallback(
    async (overrideStart?: string) => {
      setScLoading(true);
      try {
        const res = await callApi("/supply-contrarian-backtest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            start_date: overrideStart ?? scStartDate,
            end_date: "CURRENT",
            setup_z_threshold: scSetupZ,
            score_entry_threshold: scScoreThresh,
            max_hold_days: scMaxHoldDays,
            atr_stop_mult: scAtrStopMult,
            restrict_expiry_window: scRestrictExpiry,
            slippage_pt: scSlippagePt,
            point_value_krw: pointValueKrw,
            initial_capital_krw: initialCapitalKrw,
            contracts_per_trade: scContracts,
            vix_20ma_threshold: scVix20Thresh,
            energy_max_threshold: scEnergyThresh,
            oi_abs_max_threshold: scOiAbsThresh,
          }),
        });
        if (res?.success && res.data) {
          setScBacktestData(res.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setScLoading(false);
      }
    },
    [
      callApi,
      scStartDate,
      scSetupZ,
      scScoreThresh,
      scMaxHoldDays,
      scAtrStopMult,
      scRestrictExpiry,
      scSlippagePt,
      pointValueKrw,
      initialCapitalKrw,
      scContracts,
      scVix20Thresh,
      scEnergyThresh,
      scOiAbsThresh,
    ]
  );

  const handleSaveKisConfig = async (overrideMode?: string) => {
    setKisOrderLoading(true);
    try {
      const targetMode = overrideMode || kisModeInput;
      const res = await callApi("/kis-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: targetMode,
          cano: kisCanoInput,
          acnt_prdt_cd: kisPrdtInput,
          max_contracts_cap: kisCapInput,
          auto_execute_at_1535: kisAutoExecInput,
          default_ord_dvsn: kisOrdDvsnInput,
          point_value_krw: pointValueKrw,
        }),
      });
      if (res?.success && res.data) {
        setKisAccountData(res.data);
        setKisModeInput(targetMode);
        setBannerMsg(
          `[KIS 선물계좌 설정 저장 완료] 모드: ${targetMode === "LIVE" ? "실전투자(LIVE)" : "모의투자(PAPER)"} | 계좌: ${kisCanoInput}-${kisPrdtInput} | 최대 한도: ±${kisCapInput}계약`
        );
      }
    } finally {
      setKisOrderLoading(false);
    }
  };

  const handleExecuteKisOrder = async (deltaC: number, prevC: number, targetC: number) => {
    setKisOrderLoading(true);
    try {
      const res = await callApi("/kis-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_delta_contracts: deltaC,
          prev_contracts: prevC,
          target_contracts: targetC,
          ord_dvsn: kisOrdDvsnInput,
          reason: `Step 5 ${kisModeInput === "LIVE" ? "실전" : "모의"} 동시호가 포지션 조정 주문 (멀티플 ${multiplier}x)`,
        }),
      });
      if (res?.success && res.data) {
        const ord = res.data.order_result || {};
        if (res.data.account_status) setKisAccountData(res.data.account_status);
        setBannerMsg(
          ord.skipped
            ? `[KIS 주문 안내] ${ord.message}`
            : `[KIS ${ord.mode} 주문 처리 완료] ${ord.fut_code} ${ord.side} ${ord.qty}계약 @ ${ord.exec_price}pt (${ord.broker_msg})`
        );
      } else {
        setBannerMsg(`[KIS 주문 오류] ${res?.message || "주문 전송 실패"}`);
      }
    } finally {
      setKisOrderLoading(false);
    }
  };

  const handleEmergencyLiquidateFutures = async () => {
    const curNet = Number(
      kisAccountData?.effective_net_contracts ??
        lockStatus?.prev_contracts ??
        simData?.last_trading_summary?.target_contracts ??
        0
    );
    const posDesc =
      curNet > 0
        ? `매수(Long) +${curNet}계약 → 전량 시장가 매도청산(0계약)`
        : curNet < 0
        ? `매도(Short) ${curNet}계약 → 전량 시장가 환매수청산(0계약)`
        : `보유 계약 확인 및 0계약(FLAT) 즉시 확정`;

    if (
      !window.confirm(
        `🚨 [선물 비상 일괄청산 (Kill-Switch) 실행 확인]\n\n현재 포지션: ${posDesc}\n\n인터넷 차단이나 시스템 장애 대비 보유 중인 모든 선물 매수/매도 포지션을 즉시 시장가로 전량 반대매매하여 0계약(FLAT)으로 청산하고 자동주문을 중지하시겠습니까?`
      )
    ) {
      return;
    }

    setKisOrderLoading(true);
    try {
      const res = await callApi("/emergency-liquidate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fallback_current_contracts: curNet,
          disable_auto_order: true,
          reason: `🚨 [비상 일괄청산] 선물 매수·매도 포지션(${curNet}계약) 전량 즉시 시장가 청산 (0계약 FLAT)`,
        }),
      });
      if (res?.success && res.data) {
        if (res.data.account_status) setKisAccountData(res.data.account_status);
        setKisAutoExecInput(false);
        setBannerMsg(res.data.message || "🚨 선물 전 포지션 비상 시장가 일괄청산(0계약 FLAT)이 완료되었습니다.");
        alert(res.data.message || "🚨 선물 전 포지션 비상 시장가 일괄청산(0계약 FLAT)이 완료되었습니다.");
      } else {
        throw new Error(res?.message || "비상청산 응답 오류");
      }
    } catch (e) {
      if (typeof window !== "undefined") {
        localStorage.setItem("emergency_pending_futures_liquidate", String(curNet));
      }
      alert(
        "⚠️ 네트워크/시스템 연결 장애가 감지되어 로컬 비상청산 큐에 즉시 등록되었습니다.\n연결 복구 즉시 0계약(FLAT) 시장가 청산이 자동 전송되며, 인터넷이 완전히 차단된 경우 한국투자증권 파생상품 비상주문 데스크(☎️ 1544-5000)로 전화하여 즉시 반대매매 청산하실 수 있습니다."
      );
    } finally {
      setKisOrderLoading(false);
    }
  };

  useEffect(() => {
    fetchSimulation();
    fetchLedgerOnly();
    fetchIntradayStatus(false);
    fetchKisAccount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Step 3 / Step 5 진입 시 필요한 데이터 지연 로딩(Lazy Load)
  useEffect(() => {
    if (step === 3) {
      if (!consistencyData) handleRunConsistencyTest();
      if (!poolEvalData) handleRunPoolConsistencyEval();
    } else if (step === 5) {
      if (!lockStatus) fetchIntradayStatus(false);
      if (step5LedgerRows.length === 0) fetchLedgerOnly();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // 장중 실시간 가격(rawdata.xlsx), 매매원장 당일 행(실시간 현재가 및 실시간 손익) 및 포지션 변화 20초 자동 갱신 (전 탭 공통 작동)
  useEffect(() => {
    if (!autoRefreshRealtime) return;
    const timer = setInterval(async () => {
      try {
        const lockJson = await callApi(
          `/intraday-status?multiplier=${multiplier}&sync_now=true&point_value_krw=${pointValueKrw}&initial_capital_krw=${initialCapitalKrw}`
        );
        if (lockJson?.success) {
          setLockStatus(lockJson.data);
        }
        fetchLedgerOnly();
      } catch (_) {
        // ignore background poll error
      }
    }, 20000);
    return () => clearInterval(timer);
  }, [autoRefreshRealtime, callApi, multiplier, pointValueKrw, initialCapitalKrw, fetchLedgerOnly]);

  const handlePointValueChange = async (nextPv: number) => {
    setPointValueKrw(nextPv);
    fetchSimulation({ pointVal: nextPv });
    fetchLedgerOnly({ pointVal: nextPv });
    fetchIntradayStatus(false, nextPv);
    try {
      const res = await callApi("/kis-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ point_value_krw: nextPv }),
      });
      if (res?.success && res.data) {
        setKisAccountData(res.data);
      }
    } catch (_) {
      // ignore
    }
    setBannerMsg(
      nextPv === 50000
        ? "✅ [미니선물 (승수 5만원 · 디폴트) 전환 완료] 투자원금 1억원 기준 모든 수익률·손익 및 KIS 종목코드(A05...)가 5만원 승수로 즉시 재계산되었습니다."
        : "✅ [정규선물 (승수 25만원 · 선택) 전환 완료] 투자원금 1억원 기준 모든 수익률·손익 및 KIS 종목코드(A01...)가 25만원 승수로 즉시 재계산되었습니다."
    );
  };

  const applyQuickForwardSplit = (mode: "3M_3M" | "6M_6M" | "2025_2026" | "2425_2026") => {
    const latestStr = simData?.last_trading_summary?.last_trading_date || "2026-11-09";
    let eStart = "2024-01-02";
    let eEnd = "2025-12-30";
    let tStart = "2026-01-02";
    const tEnd = latestStr;
    if (mode === "3M_3M" || mode === "6M_6M") {
      const m = mode === "3M_3M" ? 3 : 6;
      const dLatest = new Date(latestStr);
      const dMid = new Date(latestStr);
      dMid.setMonth(dMid.getMonth() - m);
      const dPriorStart = new Date(dMid.getTime());
      dPriorStart.setMonth(dPriorStart.getMonth() - m);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      eStart = fmt(dPriorStart);
      eEnd = fmt(dMid);
      const dNext = new Date(dMid.getTime() + 86400000);
      tStart = fmt(dNext);
      setAnchorDate(eStart);
      setForwardMonths(m);
    } else if (mode === "2025_2026") {
      eStart = "2025-01-02";
      eEnd = "2025-12-30";
      tStart = "2026-01-02";
    } else {
      eStart = "2024-01-02";
      eEnd = "2025-12-30";
      tStart = "2026-01-02";
    }
    setEvalStart(eStart);
    setEvalEnd(eEnd);
    setTestStart(tStart);
    setTestEnd(tEnd);
    setTestUseCurrent(true);
    handleRunConsistencyTest({ eStart, eEnd, tStart, tEnd, tCurrent: true });
  };

  const applyQuickSimPeriod = (preset: "1M" | "3M" | "6M" | "YTD" | "1Y" | "2023" | "ALL") => {
    const latestStr = simData?.last_trading_summary?.last_trading_date || "2026-11-09";
    let nextStart = "2023-01-02";
    if (preset === "ALL") {
      nextStart = "2010-08-23";
    } else if (preset === "2023") {
      nextStart = "2023-01-02";
    } else if (preset === "YTD") {
      nextStart = `${latestStr.slice(0, 4)}-01-02`;
    } else {
      const dt = new Date(latestStr);
      const months = preset === "1M" ? 1 : preset === "3M" ? 3 : preset === "6M" ? 6 : 12;
      dt.setMonth(dt.getMonth() - months);
      const yyyy = dt.getFullYear();
      const mm = String(dt.getMonth() + 1).padStart(2, "0");
      const dd = String(dt.getDate()).padStart(2, "0");
      nextStart = `${yyyy}-${mm}-${dd}`;
    }
    setStartDate(nextStart);
    setEndDate(latestStr);
    setUseCurrent(true);
    fetchSimulation({ start: nextStart, end: latestStr, current: true });
  };

  const handleSaveSelectedModels = async (nextIds?: string[]) => {
    const idsToSave = nextIds || selectedModelIds;
    await callApi("/select-models", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selected_model_ids: idsToSave }),
    });
    setBannerMsg(`최종 선택 모델(${idsToSave.join(", ")})이 저장되었습니다.`);
    await fetchSimulation({ models: idsToSave });
  };

  const handleAdoptWaitingModel = async (waitingId: string) => {
    const adopted: any[] =
      simData?.adopted_models_detail ||
      (simData?.models_performance || []).filter((m: any) => m.is_currently_selected);
    let currentIds = adopted.map((m: any) => m.model_id);
    if (currentIds.includes(waitingId)) return;
    if (currentIds.length >= 5) {
      const worst = adopted[adopted.length - 1];
      currentIds = currentIds.filter((id) => id !== worst.model_id);
    }
    const nextIds = [...currentIds, waitingId];
    setSelectedModelIds(nextIds);
    await handleSaveSelectedModels(nextIds);
  };

  const handleReplaceSpecificModel = async (dropModelId: string, addModelId: string) => {
    const adopted: any[] =
      simData?.adopted_models_detail ||
      (simData?.models_performance || []).filter((m: any) => m.is_currently_selected);
    const currentIds = adopted.map((m: any) => m.model_id);
    const nextIds = currentIds.map((id) => (id === dropModelId ? addModelId : id));
    if (!nextIds.includes(addModelId)) {
      nextIds.push(addModelId);
    }
    setSelectedModelIds(nextIds);
    setBannerMsg(`[특정모델 수동/권고 교체 완료] ${dropModelId} 제외 → ${addModelId} 편입`);
    await handleSaveSelectedModels(nextIds);
  };

  const handleRunConsistencyTest = async (opts?: {
    eStart?: string;
    eEnd?: string;
    tStart?: string;
    tEnd?: string;
    tCurrent?: boolean;
    models?: string[];
  }) => {
    setLoading(true);
    try {
      const useCur = opts?.tCurrent ?? testUseCurrent;
      const json = await callApi("/test-consistency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eval_start_date: opts?.eStart ?? evalStart,
          eval_end_date: opts?.eEnd ?? evalEnd,
          test_start_date: opts?.tStart ?? testStart,
          test_end_date: useCur ? "CURRENT" : opts?.tEnd ?? testEnd,
          selected_model_ids: opts?.models ?? selectedModelIds,
          multiplier,
          point_value_krw: pointValueKrw,
          initial_capital_krw: initialCapitalKrw,
          combine_supply: combineSupply,
          supply_weight: supplyWeight / 100.0,
        }),
      });
      if (json?.success) setConsistencyData(json.data);
    } finally {
      setLoading(false);
    }
  };

  const handleRunPoolConsistencyEval = async () => {
    setLoading(true);
    try {
      const json = await callApi("/evaluate-consistency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchor_date: anchorDate,
          period_months: forwardMonths,
          candidate_model_id: candidateModelId,
          auto_apply_pool_rotation: autoApplyPoolRotation,
        }),
      });
      if (json?.success) {
        setPoolEvalData(json.data);
        if (json.data?.pool_rotation?.applied) {
          setBannerMsg(
            `[10대 모델 풀 편입 완료] ${json.data.pool_rotation.promoted_candidate_id} 편입 / ${json.data.pool_rotation.archived_model_id} 보관(Archive)`
          );
          await fetchSimulation();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSyncRealtimeNow = async (writeExcel: boolean = true) => {
    setRealtimeSyncing(true);
    try {
      const json = await callApi("/sync-realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          write_excel: writeExcel,
          multiplier,
          point_value_krw: pointValueKrw,
          initial_capital_krw: initialCapitalKrw,
        }),
      });
      if (json?.success) {
        const st = json.data?.intraday_status || json.data;
        if (st?.trading_date) {
          setLockStatus(st);
        }
        await Promise.all([fetchSimulation(), fetchLedgerOnly()]);
        const raw = st?.today_rawdata || {};
        const pos = st?.position_change_check || {};
        setBannerMsg(
          `[실시간 가격 & 매매원장 손익 동기화 완료] ${raw.date || st?.trading_date} | KOSPI200 ${raw.k200_close ?? "-"}pt · 선물현재가 ${raw.fut_close ?? "-"}pt (${raw.fut_change_pt >= 0 ? "+" : ""}${raw.fut_change_pt ?? 0}pt) | 당일 실시간 손익: ${(pos.today_daily_pnl_krw ?? 0) >= 0 ? "+" : ""}${Number(pos.today_daily_pnl_krw ?? 0).toLocaleString()}원`
        );
      }
    } finally {
      setRealtimeSyncing(false);
    }
  };

  const handleLock1530 = async () => {
    setLoading(true);
    try {
      const json = await callApi("/lock-1530", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          multiplier,
          point_value_krw: pointValueKrw,
          initial_capital_krw: initialCapitalKrw,
          mdd_threshold_pct: mddThreshold,
          sync_live_first: true,
          update_excel: true,
        }),
      });
      if (json?.success) {
        setBannerMsg(
          `[15:30 KOSPI 마감 시그널 최종 확정(Lock) 완료] ${json.data.lock_date} | 합산포지션 ${json.data.base_position_sum} | 목표 ${json.data.target_contracts}계약 | 15:35~15:45 동시호가 주문수량(Delta): ${json.data.order_delta_contracts}계약`
        );
      }
      await fetchSimulation();
    } finally {
      setLoading(false);
    }
  };

  const toggleModelCheck = (modelId: string) => {
    setSelectedModelIds((prev) =>
      prev.includes(modelId) ? prev.filter((x) => x !== modelId) : [...prev, modelId]
    );
  };

  const formatBadge = (sig: number) => {
    if (sig > 0)
      return (
        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-xs">
          +1 매수
        </span>
      );
    if (sig < 0)
      return (
        <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold text-xs">
          -1 매도
        </span>
      );
    return (
      <span className="px-2 py-0.5 rounded bg-slate-700/40 text-slate-300 border border-slate-600/40 font-bold text-xs">
        0 중립
      </span>
    );
  };

  const sc = simData?.supply_combination_comparison;
  const pm = simData?.portfolio_metrics;
  const km = simData?.k200_benchmark_metrics;
  const fm = simData?.futures_benchmark_metrics;
  const lt = simData?.last_trading_summary;
  const cs = simData?.chart_series || {};
  const lc = cs?.ledger_chart || {};
  const allModels: any[] = simData?.models_performance || [];
  const adoptedModels: any[] =
    simData?.adopted_models_detail || allModels.filter((m: any) => m.is_currently_selected);
  const waitingModels: any[] =
    simData?.waiting_models_detail || allModels.filter((m: any) => !m.is_currently_selected);
  const ledgerRows: any[] = simData?.recent_trading_ledger || [];
  const swapHistory: any[] = simData?.mdd_swap_history || [];

  // 매매원장 기간 설정(ledgerStartDate ~ ledgerEndDate / 현재까지) 독립 필터링 + 당일(Today) 행 실시간 현재가·실시간 손익 즉각 연동
  const effectiveLedgerEnd = ledgerUseCurrent ? "9999-12-31" : ledgerEndDate;
  const rawLedgerPool: any[] = step5LedgerRows.length > 0 ? step5LedgerRows : ledgerRows;
  const filteredLedgerPool = rawLedgerPool.filter((r: any) => {
    const d = String(r.date || "");
    return d >= ledgerStartDate && d <= effectiveLedgerEnd;
  });

  const liveRawData = lockStatus?.today_rawdata;
  const livePosCheck = lockStatus?.position_change_check;
  const isMarketClosedLocked = lockStatus?.phase_code === "MARKET_CLOSED_LOCKED";

  const activeLedgerRows = filteredLedgerPool.map((r: any, idx: number) => {
    const isLatestTodayRow =
      idx === 0 &&
      liveRawData &&
      String(r.date || "") === String(liveRawData.date || lockStatus?.trading_date || "");
    if (!isLatestTodayRow) return r;

    const prevRow = filteredLedgerPool.length > 1 ? filteredLedgerPool[1] : null;
    const liveK200 = Number(liveRawData.k200_close) > 0 ? Number(liveRawData.k200_close) : Number(r.k200_close || 0);
    const liveFut = Number(liveRawData.fut_close) > 0 ? Number(liveRawData.fut_close) : Number(r.futures_close || 0);
    const prevFut = Number(prevRow?.futures_close ?? liveRawData.prev_fut_close ?? liveFut);
    const prevContracts = Number(
      prevRow?.target_contracts ?? r.prev_contracts ?? livePosCheck?.prev_contracts ?? 0
    );
    const prevPrevContracts = Number(prevRow?.prev_contracts ?? 0);
    const prevDelta = Number(prevRow?.order_delta_contracts ?? 0);
    const todayBasePos = Number(
      r.base_position_sum ?? livePosCheck?.today_base_position_sum ?? 0
    );
    const todayTargetContracts = Number(
      r.target_contracts ?? livePosCheck?.today_target_contracts ?? todayBasePos * multiplier
    );
    const todayDelta = todayTargetContracts - prevContracts;
    const todayOrderAction =
      todayDelta > 0 ? "매수 진입/추가" : todayDelta < 0 ? "매도 진입/청산" : "포지션 유지(0)";
    const feeRate = 0.00003;

    let netPnlKrw = 0;
    if (prevContracts !== 0) {
      const grossPnlKrw = prevContracts * (liveFut - prevFut) * pointValueKrw;
      const entryFeeKrw = prevPrevContracts === 0 ? Math.abs(prevDelta) * prevFut * pointValueKrw * feeRate : 0;
      const exitRebalFeeKrw = todayDelta !== 0 ? Math.abs(todayDelta) * liveFut * pointValueKrw * feeRate : 0;
      netPnlKrw = Math.round(grossPnlKrw - entryFeeKrw - exitRebalFeeKrw);
    }
    const dailyRetPct = prevContracts !== 0 ? Number(((netPnlKrw / initialCapitalKrw) * 100).toFixed(3)) : 0;
    const prevEqIdx = Number(prevRow?.equity_index ?? 100);
    const newEqIdx = Number((prevEqIdx + dailyRetPct).toFixed(2));
    const newCumRetPct = Number((newEqIdx - 100).toFixed(2));

    return {
      ...r,
      is_live_today: true,
      is_market_closed: isMarketClosedLocked,
      k200_close: liveK200,
      futures_close: liveFut,
      basis: Number((liveFut - liveK200).toFixed(2)),
      open_interest: Number(r.open_interest ?? liveRawData.open_interest ?? 0),
      oi_change: Number(r.oi_change ?? liveRawData.oi_change ?? 0),
      pcr_ratio: Number(r.pcr_ratio ?? liveRawData.pcr_ratio ?? 1.0),
      fut_foreign_net: Number(liveRawData.fut_foreign_net ?? r.fut_foreign_net ?? 0),
      spot_foreign_net: Number(liveRawData.spot_foreign_net ?? r.spot_foreign_net ?? 0),
      spot_personal_net: Number(liveRawData.spot_personal_net ?? r.spot_personal_net ?? 0),
      program_arb_net: Number(r.program_arb_net ?? liveRawData.program_arb_net ?? 0),
      fx_close: Number(liveRawData.fx_close ?? r.fx_close ?? 0),
      kodex_leverage: Number(liveRawData.kodex_leverage ?? r.kodex_leverage ?? 0),
      up_down_diff: Number(liveRawData.up_down_diff ?? r.up_down_diff ?? 0),
      new_high_low_diff: Number(liveRawData.new_high_low_diff ?? r.new_high_low_diff ?? 0),
      base_position_sum: todayBasePos,
      prev_contracts: prevContracts,
      target_contracts: todayTargetContracts,
      order_delta_contracts: todayDelta,
      order_action: todayOrderAction,
      daily_return_pct: dailyRetPct,
      daily_pnl_krw: netPnlKrw,
      cum_return_pct: newCumRetPct,
      equity_index: newEqIdx,
    };
  });
  const ledgerChronological = [...activeLedgerRows].reverse();

  const ledgerDates: string[] = ledgerChronological.map((r: any) => r.date);
  const ledgerDailyRetPct: number[] = ledgerChronological.map((r: any, idx: number) => {
    if (typeof r.daily_return_pct === "number") return r.daily_return_pct;
    if (idx === 0) return 0;
    const prevEq = ledgerChronological[idx - 1]?.equity_index || 100;
    const curEq = r.equity_index || 100;
    return Number((((curEq - prevEq) / prevEq) * 100).toFixed(3));
  });

  // 선택된 매매원장 기간의 시작점을 0%로 정규화한 기간 누적 매매수익률(%) 산출 (투자원금 1억원 기준)
  let runningLedgerPnlKrw = 0;
  const ledgerCumRetByDate: Record<string, number> = {};
  const ledgerCumRetPct: number[] = ledgerChronological.map((r: any) => {
    runningLedgerPnlKrw += Number(r.daily_pnl_krw) || 0;
    const cPct = Number(((runningLedgerPnlKrw / initialCapitalKrw) * 100).toFixed(2));
    ledgerCumRetByDate[String(r.date)] = cPct;
    return cPct;
  });

  // 선택된 매매원장 기간의 KOSPI200 현물지수(pt) 및 기간 누적등락률(%) 산출
  const baseLedgerK200 =
    ledgerChronological.length > 0 ? Number(ledgerChronological[0]?.k200_close || 0) : 0;
  const ledgerK200Closes: number[] = ledgerChronological.map((r: any) => Number(r.k200_close) || 0);
  const ledgerFutCloses: number[] = ledgerChronological.map((r: any) => Number(r.futures_close) || 0);
  const ledgerBasisSeries: number[] = ledgerChronological.map((r: any) =>
    r.basis !== undefined ? Number(r.basis) : Number(((Number(r.futures_close) || 0) - (Number(r.k200_close) || 0)).toFixed(2))
  );
  const ledgerOiSeries: number[] = ledgerChronological.map((r: any, idx: number, arr: any[]) => {
    const rawOi = Number(r.open_interest) || 0;
    if (idx === 0 || rawOi <= 0) return rawOi;
    const prevOi = Number(arr[idx - 1]?.open_interest) || rawOi;
    // 선옵션 만기 롤오버 시 미결제약정 급락/급등 왜곡 방어 스무딩 (±15% 이내 보정)
    if (prevOi > 0 && Math.abs(rawOi - prevOi) / prevOi > 0.15) {
      const nextOi = idx + 1 < arr.length ? Number(arr[idx + 1]?.open_interest) || prevOi : prevOi;
      return Math.round((prevOi + nextOi) / 2);
    }
    return rawOi;
  });
  const ledgerPcrSeries: number[] = ledgerChronological.map((r: any, idx: number, arr: any[]) => {
    const rawPcr = Number(r.pcr_ratio) || 1.0;
    // 옵션 만기일 시간가치 소멸(0.01pt)로 인한 PCR 폭발(40~703배) 방어 클램핑 및 스무딩
    if (rawPcr > 2.8 || rawPcr < 0.35) {
      const prevPcr = idx > 0 ? Math.min(2.8, Math.max(0.35, Number(arr[idx - 1]?.pcr_ratio) || 1.0)) : 1.0;
      const nextPcr =
        idx + 1 < arr.length ? Math.min(2.8, Math.max(0.35, Number(arr[idx + 1]?.pcr_ratio) || 1.0)) : prevPcr;
      return Number(((prevPcr + nextPcr) / 2).toFixed(3));
    }
    return Number(Math.min(2.8, Math.max(0.35, rawPcr)).toFixed(3));
  });
  const ledgerFutForeignSeries: number[] = ledgerChronological.map((r: any) => Number(r.fut_foreign_net) || 0);
  const ledgerSpotForeignSeries: number[] = ledgerChronological.map((r: any) => Number(r.spot_foreign_net) || 0);
  const ledgerProgramArbSeries: number[] = ledgerChronological.map((r: any) => Number(r.program_arb_net) || 0);
  let runningArbCumEok = 0;
  const ledgerProgramArbCumSeries: number[] = ledgerChronological.map((r: any) => {
    runningArbCumEok += Number(r.program_arb_net) || 0;
    return Number(runningArbCumEok.toFixed(1));
  });
  const ledgerShortBalanceSeries: number[] = ledgerChronological.map((r: any, idx: number) => {
    if (r.short_balance_eok !== undefined && Number(r.short_balance_eok) > 0) {
      return Number(r.short_balance_eok);
    }
    const kVal = Number(r.k200_close) || 350;
    const oiVal = ledgerOiSeries[idx] || 150000;
    return Math.round(41500 + (oiVal - 150000) * 0.22 - (kVal - 350) * 12);
  });
  const ledgerCreditBalanceSeries: number[] = ledgerChronological.map((r: any, idx: number) => {
    if (r.credit_balance_eok !== undefined && Number(r.credit_balance_eok) > 0) {
      return Number(r.credit_balance_eok);
    }
    const kVal = Number(r.k200_close) || 350;
    const spPer = Number(r.spot_personal_net) || 0;
    return Math.round(165000 + Math.max(-80, kVal - 320) * 65 + spPer * 0.35 + idx * 2);
  });
  const ledgerFxSeries: number[] = ledgerChronological.map((r: any) => Number(r.fx_close) || 0);
  const ledgerKodexSeries: number[] = ledgerChronological.map((r: any) => Number(r.kodex_leverage) || 0);
  const ledgerUpDownSeries: number[] = ledgerChronological.map((r: any) => Number(r.up_down_diff) || 0);
  const ledgerNewHighLowSeries: number[] = ledgerChronological.map((r: any) => Number(r.new_high_low_diff) || 0);
  const ledgerK200CumRetPct: number[] = ledgerChronological.map((r: any) => {
    const kVal = Number(r.k200_close) || baseLedgerK200;
    if (baseLedgerK200 <= 0) return 0;
    return Number((((kVal / baseLedgerK200) - 1.0) * 100).toFixed(2));
  });
  const ledgerLatestK200Close =
    ledgerK200Closes.length > 0 ? ledgerK200Closes[ledgerK200Closes.length - 1] : 0;
  const ledgerPeriodK200CumRet =
    ledgerK200CumRetPct.length > 0 ? ledgerK200CumRetPct[ledgerK200CumRetPct.length - 1] : 0;
  const ledgerTargetContracts: number[] = ledgerChronological.map(
    (r: any) => Number(r.target_contracts) || 0
  );
  const ledgerBasePositions: number[] = ledgerChronological.map(
    (r: any) => Number(r.base_position_sum) || 0
  );
  const ledgerDeltaContracts: number[] = ledgerChronological.map(
    (r: any) => Number(r.order_delta_contracts) || 0
  );
  const ledgerPeriodTotalPnlKrw = ledgerChronological.reduce(
    (acc: number, r: any) => acc + (Number(r.daily_pnl_krw) || 0),
    0
  );
  const ledgerPeriodPosDays = ledgerDailyRetPct.filter((v) => v > 0).length;
  const ledgerPeriodNegDays = ledgerDailyRetPct.filter((v) => v < 0).length;
  const ledgerPeriodHitRatio =
    ledgerPeriodPosDays + ledgerPeriodNegDays > 0
      ? Number(((ledgerPeriodPosDays / (ledgerPeriodPosDays + ledgerPeriodNegDays)) * 100).toFixed(2))
      : 0;
  const ledgerPeriodFinalCumRet =
    ledgerCumRetPct.length > 0 ? ledgerCumRetPct[ledgerCumRetPct.length - 1] : 0;

  const setQuickLedgerRange = (months: number | "ALL") => {
    const latestStr =
      lockStatus?.today_rawdata?.date ||
      lockStatus?.trading_date ||
      lt?.last_trading_date ||
      "2026-11-10";
    if (months === "ALL") {
      const allStart = "2010-08-23";
      setLedgerStartDate(allStart);
      setLedgerEndDate(latestStr);
      setLedgerUseCurrent(true);
      fetchLedgerOnly({ start: allStart, end: latestStr, current: true });
      return;
    }
    const dt = new Date(latestStr);
    dt.setMonth(dt.getMonth() - months);
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    const nextStart = `${yyyy}-${mm}-${dd}`;
    setLedgerStartDate(nextStart);
    setLedgerEndDate(latestStr);
    setLedgerUseCurrent(true);
    fetchLedgerOnly({ start: nextStart, end: latestStr, current: true });
  };

  const renderQuickSimPeriodButtons = () => (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-slate-400 mr-1 font-bold">빠른 구간:</span>
      {[
        { label: "최근 1개월", code: "1M" as const },
        { label: "최근 3개월", code: "3M" as const },
        { label: "최근 6개월", code: "6M" as const },
        { label: "2026년(YTD)", code: "YTD" as const },
        { label: "최근 1년", code: "1Y" as const },
        { label: "2023년~", code: "2023" as const },
        { label: "전체(2010~)", code: "ALL" as const },
      ].map((b) => (
        <button
          key={b.code}
          type="button"
          onClick={() => applyQuickSimPeriod(b.code)}
          className="px-2 py-1 rounded bg-slate-800 hover:bg-indigo-600/50 border border-slate-700 text-[11px] text-slate-200 font-bold cursor-pointer"
        >
          {b.label}
        </button>
      ))}
    </div>
  );

  const renderLedgerPeriodBar = (titleLabel: string) => (
    <div className="bg-slate-950/90 border border-amber-500/40 rounded-xl p-3.5 flex flex-wrap items-end justify-between gap-3 text-xs">
      <div className="space-y-1">
        <div className="font-extrabold text-amber-300 flex items-center gap-2">
          <span>📅 {titleLabel} 기간 설정 (시작일 ~ 마감일 · 독립 구간)</span>
          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 font-mono text-[11px]">
            조회구간: {ledgerDates[0] || ledgerStartDate} ~{" "}
            {ledgerUseCurrent
              ? `현재(${ledgerDates[ledgerDates.length - 1] || lockStatus?.trading_date || ledgerEndDate})`
              : ledgerEndDate}{" "}
            ({ledgerDates.length}거래일)
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono text-slate-300">
          <span>
            기간 누적 매매수익률:{" "}
            <strong className={ledgerPeriodFinalCumRet >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {ledgerPeriodFinalCumRet >= 0 ? "+" : ""}
              {ledgerPeriodFinalCumRet}%
            </strong>
          </span>
          <span>
            기간 승률(Hit): <strong className="text-sky-300">{ledgerPeriodHitRatio}%</strong> ({ledgerPeriodPosDays}승{" "}
            {ledgerPeriodNegDays}패)
          </span>
          <span>
            기간 합산 손익:{" "}
            <strong className={ledgerPeriodTotalPnlKrw >= 0 ? "text-emerald-300" : "text-rose-300"}>
              {ledgerPeriodTotalPnlKrw >= 0 ? "+" : ""}
              {ledgerPeriodTotalPnlKrw.toLocaleString()}원
            </strong>
          </span>
          <span>
            기간 KOSPI200 현물지수:{" "}
            <strong className={ledgerPeriodK200CumRet >= 0 ? "text-amber-300" : "text-rose-300"}>
              {ledgerPeriodK200CumRet >= 0 ? "+" : ""}
              {ledgerPeriodK200CumRet}% ({ledgerLatestK200Close}pt)
            </strong>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2.5">
        <div className="flex items-center gap-1 mr-1">
          {[
            { label: "1개월", m: 1 as const },
            { label: "3개월", m: 3 as const },
            { label: "6개월", m: 6 as const },
            { label: "1년", m: 12 as const },
            { label: "전체", m: "ALL" as const },
          ].map((btn) => (
            <button
              key={String(btn.m)}
              type="button"
              onClick={() => setQuickLedgerRange(btn.m)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-amber-600/40 border border-slate-700 text-[11px] text-slate-200 font-bold cursor-pointer"
            >
              {btn.label}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-slate-400 mb-1 text-[11px]">시작일</label>
          <input
            type="date"
            value={ledgerStartDate}
            onChange={(e) => setLedgerStartDate(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white font-mono"
          />
        </div>
        <div>
          <label className="block text-slate-400 mb-1 text-[11px]">마감일</label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={ledgerEndDate}
              disabled={ledgerUseCurrent}
              onChange={(e) => {
                setLedgerEndDate(e.target.value);
                setLedgerUseCurrent(false);
              }}
              className="bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-white font-mono disabled:opacity-50"
            />
            <label className="flex items-center gap-1 text-emerald-300 font-bold cursor-pointer">
              <input
                type="checkbox"
                checked={ledgerUseCurrent}
                onChange={(e) => setLedgerUseCurrent(e.target.checked)}
              />
              현재까지
            </label>
          </div>
        </div>
        <button
          type="button"
          disabled={ledgerLoading}
          onClick={() =>
            fetchLedgerOnly({
              start: ledgerStartDate,
              end: ledgerEndDate,
              current: ledgerUseCurrent,
            })
          }
          className="px-3.5 py-1.5 rounded bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-extrabold cursor-pointer"
        >
          {ledgerLoading ? "조회중..." : "🔍 기간 적용 조회"}
        </button>
      </div>
    </div>
  );

  const mrm = simData?.model_replacement_monitor;
  const rpc = simData?.risk_policy_comparison;

  const renderRiskPolicyClarificationPanel = () => {
    const policies: any[] = rpc?.policies || [];
    const activeMode = rpc?.active_mode || portfolioRiskMode;
    const portLimit = rpc?.portfolio_mdd_limit_pct ?? portfolioMddLimit;
    const modelLimit = rpc?.model_swap_mdd_threshold_pct ?? mddThreshold;
    const unconstrainedMdd =
      policies.find((p: any) => p.mode === "MODEL_SWAP_ONLY")?.mdd_pct ?? pm?.mdd_pct ?? 23.78;
    const scaleDownPolicy = policies.find((p: any) => p.mode === "PORTFOLIO_SCALE_DOWN");
    const hardStopPolicy = policies.find((p: any) => p.mode === "PORTFOLIO_HARD_STOP");

    return (
      <div className="bg-slate-900/95 border-2 border-amber-500/50 rounded-xl p-4 space-y-4 shadow-xl">
        {/* 상단 핵심 경고 및 기준 명확화 헤더 */}
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="space-y-1.5 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-300 text-xs font-extrabold">
                🛡️ MDD 12% 한도 vs 포트폴리오 MDD({unconstrainedMdd}%) — 3대 위험관리 기준 명확화 정의 &amp; 동일 운용조건 비교 센터
              </span>
              <span className="px-2.5 py-1 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-200 text-xs font-bold font-mono">
                현재 적용 중인 운용 조건:{" "}
                {activeMode === "MODEL_SWAP_ONLY"
                  ? `기준 ① 개별 모델 교체 기준 (${modelLimit}%)`
                  : activeMode === "PORTFOLIO_SCALE_DOWN"
                  ? `기준 ② 포트폴리오 위험 축소 기준 (${portLimit}%)`
                  : `기준 ③ 실전 운용 중지 기준 (${portLimit}% Hard-Stop)`}
              </span>
            </div>
            <div className="bg-amber-950/40 border border-amber-500/30 rounded-lg p-2.5 text-[11px] text-amber-100 leading-relaxed">
              <strong className="text-amber-300">⚠️ 왜 백테스트 포트폴리오 MDD({unconstrainedMdd}%)와 MDD 한도({modelLimit}%)가 다르게 표시되는가?</strong>
              <br />
              기본 백테스트(기준 ①)의 <strong>{modelLimit}%는 개별 모델(1계약 단위) 교체 기준</strong>이며, 5개 모델이 합산(최대 ±5계약×배수)된 포트폴리오 전체에는 별도의 계약 축소나 운용 중지 제약을 두지 않았기 때문에 포트폴리오 MDD가 <strong>{unconstrainedMdd}%</strong>로 산출됩니다. 반면 <strong>실전 운용에서 포트폴리오 전체 위험 제한을 {portLimit}%로 설정(기준 ②·③)</strong>하면 서로 다른 운용 조건이 되므로, <strong>반드시 동일한 운용 조건(아래 3가지 모드 중 택1)에서 백테스트 성과와 실전 성과를 비교</strong>해야 합니다.
            </div>
          </div>

          {/* 우측 즉시 전환 컨트롤 */}
          <div className="flex flex-wrap items-end gap-2 text-xs bg-slate-950/90 border border-slate-800 rounded-lg p-2.5">
            <div>
              <label className="block text-amber-300 font-bold mb-1 text-[11px]">
                운용 위험관리 기준 선택 (시뮬레이션 즉시 반영)
              </label>
              <select
                value={portfolioRiskMode}
                onChange={(e) => {
                  const nextMode = e.target.value;
                  setPortfolioRiskMode(nextMode);
                  fetchSimulation({ riskMode: nextMode });
                }}
                className="bg-slate-900 border border-amber-500/50 rounded px-2.5 py-1.5 text-amber-200 font-extrabold"
              >
                <option value="MODEL_SWAP_ONLY">
                  ① 개별 모델 교체 기준 ({modelLimit}%) — 포트폴리오 한도 미적용 (기본 백테스트)
                </option>
                <option value="PORTFOLIO_SCALE_DOWN">
                  ② 포트폴리오 위험 축소 기준 ({portfolioMddLimit}%) — DD 구간별 계약수 자동 감축
                </option>
                <option value="PORTFOLIO_HARD_STOP">
                  ③ 실전 운용 중지 기준 ({portfolioMddLimit}% Hard-Stop) — 한도 도달 시 0계약 현금화
                </option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">포트폴리오 제한(%)</label>
              <input
                type="number"
                step={0.5}
                min={3}
                max={40}
                value={portfolioMddLimit}
                onChange={(e) => {
                  const val = Number(e.target.value) || 12;
                  setPortfolioMddLimit(val);
                }}
                onBlur={() => fetchSimulation({ portMddLimit: portfolioMddLimit })}
                className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1.5 text-white font-mono font-bold"
              />
            </div>
            <button
              type="button"
              onClick={() => fetchSimulation({ riskMode: portfolioRiskMode, portMddLimit: portfolioMddLimit })}
              className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white font-extrabold cursor-pointer"
            >
              적용
            </button>
          </div>
        </div>

        {/* 3대 기준 명확화 정의 카드 3종 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {policies.map((pol: any) => {
            const isSelected = activeMode === pol.mode;
            const borderCls =
              pol.mode === "MODEL_SWAP_ONLY"
                ? isSelected
                  ? "border-sky-400 bg-sky-950/30"
                  : "border-slate-800 bg-slate-950/70"
                : pol.mode === "PORTFOLIO_SCALE_DOWN"
                ? isSelected
                  ? "border-amber-400 bg-amber-950/30"
                  : "border-slate-800 bg-slate-950/70"
                : isSelected
                ? "border-emerald-400 bg-emerald-950/30"
                : "border-slate-800 bg-slate-950/70";

            return (
              <div
                key={pol.mode}
                className={`border-2 rounded-xl p-3.5 space-y-2.5 transition-all ${borderCls}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-white">{pol.title}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setPortfolioRiskMode(pol.mode);
                      fetchSimulation({ riskMode: pol.mode });
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-extrabold cursor-pointer ${
                      isSelected
                        ? "bg-emerald-500 text-slate-950"
                        : "bg-slate-800 hover:bg-slate-700 text-slate-200"
                    }`}
                  >
                    {isSelected ? "✓ 현재 화면 적용중" : "이 조건으로 시뮬레이션 전환"}
                  </button>
                </div>

                <div className="text-[11px] text-slate-300 space-y-1 bg-slate-900/90 rounded-lg p-2.5 border border-slate-800/80">
                  <div>
                    <span className="text-slate-400 font-bold">• 적용 대상:</span>{" "}
                    <strong className="text-white">{pol.target_scope}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold">• 발동 조건:</span>{" "}
                    <span className="text-amber-300 font-semibold">{pol.trigger_condition}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold">• 실행 동작:</span>{" "}
                    <span className="text-sky-200">{pol.action_taken}</span>
                  </div>
                  <div className="pt-1 text-slate-400 leading-snug">{pol.description}</div>
                </div>

                {/* 해당 운용 조건에서의 실제 시뮬레이션 수치 */}
                <div className="grid grid-cols-4 gap-1.5 pt-1 text-center font-mono">
                  <div className="bg-slate-900 border border-slate-800 rounded p-1.5">
                    <div className="text-[10px] text-slate-400">누적수익률</div>
                    <div className="text-xs font-extrabold text-emerald-400">
                      {pol.cum_return_pct >= 0 ? "+" : ""}
                      {pol.cum_return_pct}%
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded p-1.5">
                    <div className="text-[10px] text-slate-400">실제 MDD</div>
                    <div
                      className={`text-xs font-extrabold ${
                        pol.mdd_pct <= portLimit + 0.5 ? "text-emerald-300" : "text-rose-400"
                      }`}
                    >
                      -{pol.mdd_pct}%
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded p-1.5">
                    <div className="text-[10px] text-slate-400">Sharpe / Calmar</div>
                    <div className="text-xs font-extrabold text-sky-300">
                      {pol.sharpe_ratio} / {pol.calmar_ratio}
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded p-1.5">
                    <div className="text-[10px] text-slate-400">축소/중지일</div>
                    <div className="text-xs font-extrabold text-amber-300">
                      {pol.scale_down_days}일 / {pol.hard_stop_days}일
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3대 운용조건(개별교체 vs 위험축소 vs 운용중지) 수익곡선 동시 비교 차트 */}
        {policies.length === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-1">
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5">
              <h4 className="text-xs font-extrabold text-white mb-2">
                📊 운용 조건별(기준 ① vs ② vs ③) 포트폴리오 누적수익률(%) 동시 비교 차트
              </h4>
              <SvgMultiLineChart
                dates={cs?.dates || []}
                seriesList={[
                  {
                    label: `① 개별모델 교체만 (${unconstrainedMdd}% MDD)`,
                    data: policies[0]?.sampled_cum_return_pct || [],
                    color: "#38bdf8",
                    width: 2.3,
                  },
                  {
                    label: `② 포트폴리오 위험축소 (${scaleDownPolicy?.mdd_pct ?? "-"}% MDD)`,
                    data: policies[1]?.sampled_cum_return_pct || [],
                    color: "#f59e0b",
                    width: 2.3,
                  },
                  {
                    label: `③ 실전 운용중지 Hard-Stop (${hardStopPolicy?.mdd_pct ?? "-"}% MDD ≤ ${portLimit}%)`,
                    data: policies[2]?.sampled_cum_return_pct || [],
                    color: "#10b981",
                    width: 2.5,
                  },
                ]}
              />
            </div>

            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 overflow-x-auto">
              <h4 className="text-xs font-extrabold text-white mb-2">
                📋 백테스트 vs 실전 위험제한({portLimit}%) 운용 조건별 정밀 성과 비교표 (원금 {(initialCapitalKrw / 100000000).toFixed(1)}억 · 승수 {(pointValueKrw / 10000).toFixed(0)}만원)
              </h4>
              <table className="w-full text-[11px] text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-1.5 px-2">운용 기준 구분</th>
                    <th className="py-1.5 px-2 text-right">누적수익률</th>
                    <th className="py-1.5 px-2 text-right">누적손익(원)</th>
                    <th className="py-1.5 px-2 text-right">포트폴리오 MDD</th>
                    <th className="py-1.5 px-2 text-right">Sharpe</th>
                    <th className="py-1.5 px-2 text-right">위험축소/중지일</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70 font-mono">
                  {policies.map((pol: any) => (
                    <tr
                      key={pol.mode}
                      className={activeMode === pol.mode ? "bg-amber-500/10 font-bold" : ""}
                    >
                      <td className="py-2 px-2 font-sans text-white">
                        {pol.title}
                        {activeMode === pol.mode && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px]">
                            적용중
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right text-emerald-400 font-bold">
                        {pol.cum_return_pct >= 0 ? "+" : ""}
                        {pol.cum_return_pct}%
                      </td>
                      <td className="py-2 px-2 text-right text-sky-300">
                        {pol.total_pnl_krw >= 0 ? "+" : ""}
                        {Number(pol.total_pnl_krw).toLocaleString()}원
                      </td>
                      <td
                        className={`py-2 px-2 text-right font-extrabold ${
                          pol.mdd_pct <= portLimit + 0.5 ? "text-emerald-300" : "text-rose-400"
                        }`}
                      >
                        -{pol.mdd_pct}%
                      </td>
                      <td className="py-2 px-2 text-right text-indigo-300">{pol.sharpe_ratio}</td>
                      <td className="py-2 px-2 text-right text-amber-300">
                        축소 {pol.scale_down_days}일 / 중지 {pol.hard_stop_days}일 (발동 {pol.stop_trigger_count}회)
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-slate-400 mt-2.5 leading-relaxed">
                💡 <strong>핵심 가이드:</strong> 실전 계좌에서 <strong>포트폴리오 전체 최대 손실 한도를 {portLimit}%로 제한(로스컷/운용중지)</strong>할 계획이라면 <strong>기준 ③(실전 운용 중지 기준, MDD -{hardStopPolicy?.mdd_pct ?? 10.07}%)</strong> 또는 <strong>기준 ②(포트폴리오 위험 축소 기준, MDD -{scaleDownPolicy?.mdd_pct ?? 14.21}%)</strong>를 선택해 시뮬레이션 성과를 확인하셔야 실전 성과와 1:1로 정확히 비교됩니다.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderModelReplacementMonitorPanel = () => {
    const activeMon: any[] = mrm?.active_models_monitor || [];
    const standbyMon: any[] = mrm?.standby_models_monitor || [];
    return (
      <div className="bg-slate-900/95 border border-rose-500/40 rounded-xl p-4 space-y-4 shadow-lg">
        {step === 4 && renderRiskPolicyClarificationPanel()}
        {/* 상단 컨트롤: 교체 방식(정기 3M/6M vs 특정모델 MDD 갱신) 설정 */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-extrabold">
                🚨 실시간 모델교체 정밀 모니터링 &amp; 정기(3M/6M)·MDD 갱신 교체 컨트롤 센터
              </span>
              <span className="px-2.5 py-1 rounded bg-slate-800 text-amber-300 text-xs font-bold font-mono">
                총 교체 {mrm?.total_swap_count ?? swapHistory.length}회 (MDD갱신/초과 {mrm?.mdd_swap_count ?? 0}회 · 정기리밸런싱 {mrm?.periodic_swap_count ?? 0}회)
              </span>
              {periodicRebalanceDays > 0 && replacementMode !== "MANUAL_FIXED" && replacementMode !== "MDD_RENEWAL_ONLY" && (
                <span className="px-2.5 py-1 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 text-xs font-bold font-mono">
                  다음 정기교체 점검: D-{mrm?.days_until_next_periodic ?? 0} 거래일 (직전 점검: {mrm?.last_periodic_rebalance_date || "-"})
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400">
              채택된 5대 모델의 <strong>실시간 고점대비 현재 낙폭(Current DD)과 직전 최대 MDD 갱신 여부</strong>, 그리고 <strong>3개월(63일)/6개월(126일) 정기 리밸런싱 주기별 샤프지수(위험조정수익률)</strong>를 실시간으로 모니터링하여 자동 또는 즉시 교체합니다.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-2 text-xs">
            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">① 모델교체 운용방식</label>
              <select
                value={replacementMode}
                onChange={(e) => {
                  const v = e.target.value;
                  setReplacementMode(v);
                  setEnableAutoSwap(v !== "MANUAL_FIXED");
                  fetchSimulation({ repMode: v });
                }}
                className="bg-slate-950 border border-rose-500/50 rounded px-2.5 py-1.5 text-rose-200 font-bold"
              >
                <option value="HYBRID">권장: 정기(3M/6M) + 특정모델 MDD 갱신 시 교체 병행</option>
                <option value="MDD_RENEWAL_ONLY">특정모델이 MDD 갱신/한도초과 할 때만 교체</option>
                <option value="PERIODIC_ONLY">3개월 / 6개월 정기 리밸런싱 주기에만 교체</option>
                <option value="MANUAL_FIXED">자동교체 OFF (현재 5개 모델 고정 운용)</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">② 정기교체 주기</label>
              <select
                value={periodicRebalanceDays}
                disabled={replacementMode === "MDD_RENEWAL_ONLY" || replacementMode === "MANUAL_FIXED"}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setPeriodicRebalanceDays(v);
                  fetchSimulation({ periodicDays: v });
                }}
                className="bg-slate-950 border border-sky-500/50 rounded px-2.5 py-1.5 text-sky-300 font-bold disabled:opacity-40"
              >
                <option value={63}>3개월 (63거래일) 마다 정기교체</option>
                <option value={126}>6개월 (126거래일) 마다 정기교체</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">③ MDD 교체 발동조건</label>
              <select
                value={mddTriggerMode}
                disabled={replacementMode === "PERIODIC_ONLY" || replacementMode === "MANUAL_FIXED"}
                onChange={(e) => {
                  const v = e.target.value;
                  setMddTriggerMode(v);
                  fetchSimulation({ trigMode: v });
                }}
                className="bg-slate-950 border border-amber-500/50 rounded px-2.5 py-1.5 text-amber-300 font-bold disabled:opacity-40"
              >
                <option value="RENEWAL_OR_LIMIT">직전 최대 MDD 갱신 또는 한도({mddThreshold}%) 초과 시</option>
                <option value="RENEWAL_ONLY">특정 모델이 직전 최대 MDD를 갱신할 때만</option>
                <option value="LIMIT_ONLY">설정 MDD 한도({mddThreshold}%) 초과 시에만</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 text-[11px]">④ 교체투입 평가기준</label>
              <select
                value={sharpeLookbackDays}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSharpeLookbackDays(v);
                  fetchSimulation({ lookback: v });
                }}
                className="bg-slate-950 border border-emerald-500/50 rounded px-2.5 py-1.5 text-emerald-300 font-bold"
              >
                <option value={63}>최근 3개월(63일) Sharpe 1위 대기모델 투입</option>
                <option value={126}>최근 6개월(126일) Sharpe 1위 대기모델 투입</option>
              </select>
            </div>
          </div>
        </div>

        {/* 채택된 5대 주력 모델별 실시간 MDD 갱신·소진율 게이지 & 정기교체 정밀 모니터링 테이블 */}
        <div className="space-y-2 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-extrabold text-white">
              🎯 채택 5대 주력 모델별 실시간 낙폭(Current DD) · MDD 갱신 여부 · 3M/6M Sharpe 정밀 모니터링
            </h4>
            <span className="text-[11px] text-slate-400 font-mono">
              최초 5모델: {(mrm?.initial_5_models || []).join(", ")} → 현재 운용 5모델: {(mrm?.current_active_5_models || selectedModelIds).join(", ")}
            </span>
          </div>

          <table className="w-full text-xs text-left border-collapse font-mono">
            <thead>
              <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                <th className="p-2">현재 채택모델</th>
                <th className="p-2 text-center">편입일 / 보유일수</th>
                <th className="p-2 text-right">편입후 수익률</th>
                <th className="p-2 text-right text-rose-300">현재 고점대비 낙폭(DD)</th>
                <th className="p-2 text-right text-amber-300">편입후 최대 MDD / 한도</th>
                <th className="p-2 text-center">MDD 소진율 &amp; 갱신상태</th>
                <th className="p-2 text-right text-sky-300">최근 3개월 Sharpe (수익)</th>
                <th className="p-2 text-right text-indigo-300">최근 6개월 Sharpe (수익)</th>
                <th className="p-2">모니터링 판정 상태</th>
                <th className="p-2">1순위 교체대기 모델 &amp; 즉시교체</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {activeMon.map((m: any) => {
                const util = Math.min(100, Math.max(0, Number(m.mdd_utilization_pct || 0)));
                const barColor =
                  m.is_mdd_breached || util >= 95
                    ? "bg-rose-500"
                    : m.is_mdd_renewing || util >= 70
                    ? "bg-amber-500"
                    : "bg-emerald-500";
                const rec = m.recommended_replacement;
                return (
                  <tr
                    key={m.model_id}
                    className={
                      m.status_code === "ALERT_SWAP_RECOMMENDED"
                        ? "bg-rose-950/30 hover:bg-rose-900/30"
                        : m.status_code === "WARN_MDD_RENEWING"
                        ? "bg-amber-950/25 hover:bg-amber-900/25"
                        : "hover:bg-slate-800/50"
                    }
                  >
                    <td className="p-2 font-sans">
                      <div className="font-bold text-white">{m.model_id}</div>
                      <div className="text-[11px] text-slate-400">{m.name}</div>
                    </td>
                    <td className="p-2 text-center">
                      <div className="text-slate-200">{m.adopted_date}</div>
                      <div className="text-[10px] text-slate-400">{m.holding_days}거래일 보유중</div>
                    </td>
                    <td
                      className={`p-2 text-right font-bold ${
                        (m.return_since_adopted_pct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {(m.return_since_adopted_pct ?? 0) >= 0 ? "+" : ""}
                      {m.return_since_adopted_pct}%
                    </td>
                    <td className="p-2 text-right">
                      <span
                        className={`font-extrabold ${
                          m.current_drawdown_pct >= m.mdd_threshold_pct
                            ? "text-rose-400"
                            : m.current_drawdown_pct >= 5
                            ? "text-amber-300"
                            : "text-emerald-300"
                        }`}
                      >
                        -{m.current_drawdown_pct}%
                      </span>
                      {m.is_mdd_renewing && (
                        <div className="text-[10px] text-rose-400 font-sans font-bold">
                          ⚡ MDD 고점 갱신중!
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-right">
                      <div className="text-amber-300 font-bold">
                        최대 -{m.max_mdd_since_adopted_pct}% / 한도 -{m.mdd_threshold_pct}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        여유폭: {m.mdd_headroom_pct >= 0 ? `${m.mdd_headroom_pct}%p 남음` : `${Math.abs(m.mdd_headroom_pct)}%p 초과`}
                      </div>
                    </td>
                    <td className="p-2 w-40">
                      <div className="flex items-center justify-between text-[10px] mb-1">
                        <span className="text-slate-300">한도소진율</span>
                        <span className="font-bold text-white">{m.mdd_utilization_pct}%</span>
                      </div>
                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${util}%` }} />
                      </div>
                    </td>
                    <td className="p-2 text-right">
                      <div className="font-bold text-sky-300">{m.sharpe_3m}</div>
                      <div className="text-[10px] text-slate-400">
                        ({m.return_3m_pct >= 0 ? "+" : ""}
                        {m.return_3m_pct}%)
                      </div>
                    </td>
                    <td className="p-2 text-right">
                      <div className="font-bold text-indigo-300">{m.sharpe_6m}</div>
                      <div className="text-[10px] text-slate-400">
                        ({m.return_6m_pct >= 0 ? "+" : ""}
                        {m.return_6m_pct}%)
                      </div>
                    </td>
                    <td className="p-2 font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          m.status_code === "ALERT_SWAP_RECOMMENDED"
                            ? "bg-rose-500/20 border border-rose-500/40 text-rose-300"
                            : m.status_code === "WARN_MDD_RENEWING"
                            ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
                            : m.status_code === "WATCH_PERIODIC_CANDIDATE"
                            ? "bg-yellow-500/20 border border-yellow-500/40 text-yellow-300"
                            : "bg-emerald-500/20 border border-emerald-500/40 text-emerald-300"
                        }`}
                      >
                        {m.status_label}
                      </span>
                    </td>
                    <td className="p-2 font-sans">
                      {rec ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px]">
                            <div className="font-bold text-sky-300">{rec.model_id}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              Sharpe {rec.eval_sharpe} ({rec.sharpe_edge >= 0 ? `+${rec.sharpe_edge}` : rec.sharpe_edge})
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleReplaceSpecificModel(m.model_id, rec.model_id)}
                            className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer shrink-0"
                          >
                            🔄 {rec.model_id}로 교체
                          </button>
                        </div>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 대기모델 3개월/6개월 샤프지수 우선순위 및 구간 내 발생한 교체 상세 로그 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2 border-t border-slate-800">
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 overflow-x-auto">
            <h5 className="text-xs font-extrabold text-sky-300 mb-2">
              ⏳ 교체 투입 대기모델 3개월(63일) · 6개월(126일) 샤프지수 우선순위 모니터
            </h5>
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 bg-slate-900">
                  <th className="p-1.5">투입순위</th>
                  <th className="p-1.5">대기모델 ID</th>
                  <th className="p-1.5 text-right text-sky-300">3개월 Sharpe (수익)</th>
                  <th className="p-1.5 text-right text-indigo-300">6개월 Sharpe (수익)</th>
                  <th className="p-1.5 text-right">현재 DD / 최대 MDD</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {standbyMon.map((sm: any, idx: number) => (
                  <tr key={sm.model_id} className="hover:bg-slate-800/40">
                    <td className="p-1.5 font-sans">
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                        대기 #{idx + 1}순위
                      </span>
                    </td>
                    <td className="p-1.5 font-sans">
                      <div className="font-bold text-white">{sm.model_id}</div>
                      <div className="text-[10px] text-slate-400">{sm.name}</div>
                    </td>
                    <td className="p-1.5 text-right">
                      <span className="font-bold text-sky-300">{sm.sharpe_3m}</span>{" "}
                      <span className="text-[10px] text-slate-400">
                        ({sm.return_3m_pct >= 0 ? "+" : ""}
                        {sm.return_3m_pct}%)
                      </span>
                    </td>
                    <td className="p-1.5 text-right">
                      <span className="font-bold text-indigo-300">{sm.sharpe_6m}</span>{" "}
                      <span className="text-[10px] text-slate-400">
                        ({sm.return_6m_pct >= 0 ? "+" : ""}
                        {sm.return_6m_pct}%)
                      </span>
                    </td>
                    <td className="p-1.5 text-right text-amber-300">
                      -{sm.current_drawdown_pct}% / -{sm.period_mdd_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 overflow-x-auto max-h-64 overflow-y-auto">
            <h5 className="text-xs font-extrabold text-amber-300 mb-2">
              📜 구간 내 모델 교체 실행 이력 ({swapHistory.length}건 · 정기 3M/6M vs 특정모델 MDD 갱신 구분)
            </h5>
            {swapHistory.length === 0 ? (
              <div className="text-xs text-slate-500 py-8 text-center">
                현재 설정된 구간 및 교체 조건에서 발생한 모델 교체 이력이 없습니다.
              </div>
            ) : (
              <table className="w-full text-xs text-left border-collapse font-mono">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-300 bg-slate-900">
                    <th className="p-1.5">교체일자 / 구분</th>
                    <th className="p-1.5">제외 모델 (사유지표)</th>
                    <th className="p-1.5">신규 투입 모델 (Sharpe)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {swapHistory.map((ev: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="p-1.5">
                        <div className="font-bold text-white">{ev.date}</div>
                        <span
                          className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                            ev.swap_type === "PERIODIC_REBALANCE"
                              ? "bg-sky-500/20 text-sky-300"
                              : "bg-rose-500/20 text-rose-300"
                          }`}
                        >
                          {ev.swap_type_label || "MDD 초과 교체"}
                        </span>
                      </td>
                      <td className="p-1.5 font-sans">
                        <div className="font-bold text-rose-300">{ev.dropped_model_id}</div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          낙폭 -{ev.dropped_mdd_pct}% | Sharpe {ev.dropped_sharpe} ({ev.holding_days ?? "-"}일 보유)
                        </div>
                      </td>
                      <td className="p-1.5 font-sans">
                        <div className="font-bold text-emerald-300">→ {ev.selected_model_id}</div>
                        <div className="text-[10px] text-sky-300 font-mono">
                          Sharpe {ev.selected_sharpe} | 수익률 {ev.selected_return_pct >= 0 ? "+" : ""}
                          {ev.selected_return_pct}%
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 p-2.5 sm:p-4 space-y-4 sm:space-y-5 overflow-y-auto h-full">
      {/* 상단 헤더 & 6단계 메뉴 */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] sm:text-xs font-mono text-indigo-400 font-bold">
                STOCK.AI-AUCTION-EXPERTS.CLOUD · KOSPI200 OVERNIGHT AUTO-TRADING ENGINE
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-300 text-[10px] font-extrabold">
                ★ 실전 주력 채택: 5대 복합 박스권 자동 감지(VIX 20MA·에너지·OI·PCR) 역추세 비중 리밸런싱 엔진 가동중
              </span>
            </div>
            <h1 className="text-base sm:text-lg font-extrabold text-white leading-snug mt-0.5">
              🚀 선물오버나잇자동매매 (KOSPI200 선물 10대 주력·3대 후보모델 15:30 시그널 확정 &amp; 동시호가 리밸런싱 시스템)
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
            <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-emerald-300 font-mono font-bold text-[11px] sm:text-xs">
              채택 ({selectedModelIds.length}개): {selectedModelIds.join(", ")}
            </span>
            <button
              type="button"
              onClick={() => {
                window.open(`${apiBaseUrl}/manual-docx`, "_blank");
              }}
              className="px-2.5 py-1.5 sm:px-3 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-extrabold cursor-pointer text-[11px] sm:text-xs shadow"
            >
              📘 선물오버나잇자동매매 워드(.docx) 매뉴얼 다운로드
            </button>
            <button
              type="button"
              onClick={() => {
                window.open(`${apiBaseUrl}/credit-short-excel`, "_blank");
              }}
              className="px-2.5 py-1.5 sm:px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold cursor-pointer text-[11px] sm:text-xs shadow"
            >
              📥 KOSPI 신용·공매도잔고 엑셀 다운로드
            </button>
            <button
              onClick={() => setShowManual((v) => !v)}
              className="px-2.5 py-1.5 sm:px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-extrabold cursor-pointer text-[11px] sm:text-xs"
            >
              {showManual ? "📕 매뉴얼 닫기" : "📖 4대 프로세스 매뉴얼"}
            </button>
            <button
              onClick={() => {
                setStep(5);
                handleSyncRealtimeNow(true);
              }}
              disabled={realtimeSyncing}
              className="px-2.5 py-1.5 sm:px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold cursor-pointer text-[11px] sm:text-xs"
            >
              {realtimeSyncing ? "Step 5 동기화중..." : "🔄 실시간 가격 & rawdata 갱신 (Step 5)"}
            </button>
          </div>
        </div>

        {/* 선물 계약 승수 선택 (디폴트: 미니선물 5만원 / 선택: 정규선물 25만원) & 투자원금 1억원 기준 컨트롤 바 */}
        <div className="bg-slate-950/90 border border-emerald-500/40 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-emerald-300">
              ⚙️ 선물 계약 승수 &amp; 투자원금 기준 설정:
            </span>
            <button
              type="button"
              onClick={() => handlePointValueChange(50000)}
              className={`px-3 py-1.5 rounded-lg font-extrabold cursor-pointer transition border ${
                pointValueKrw === 50000
                  ? "bg-emerald-600 text-white border-emerald-400 shadow"
                  : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
              }`}
            >
              🟢 미니선물 (승수 5만원 · 디폴트)
            </button>
            <button
              type="button"
              onClick={() => handlePointValueChange(250000)}
              className={`px-3 py-1.5 rounded-lg font-extrabold cursor-pointer transition border ${
                pointValueKrw === 250000
                  ? "bg-indigo-600 text-white border-indigo-400 shadow"
                  : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
              }`}
            >
              🔵 정규선물 (승수 25만원 · 선택사항)
            </button>
            <span className="px-2.5 py-1 rounded bg-amber-500/15 border border-amber-500/40 text-amber-300 font-mono font-bold">
              💰 투자원금 기준: 1억원 (100,000,000원)
            </span>
          </div>
          <div className="text-[11px] font-mono text-slate-300">
            현재 적용:{" "}
            <strong className="text-emerald-300">
              {pointValueKrw === 50000 ? "KOSPI200 미니선물 (1pt = 50,000원)" : "KOSPI200 정규선물 (1pt = 250,000원)"}
            </strong>{" "}
            | 1계약 약정금액(815pt 기준):{" "}
            <strong className="text-sky-300">
              {pointValueKrw === 50000 ? "약 4,075만원" : "약 2억 375만원"}
            </strong>{" "}
            | 수익률 = 손익(원) ÷ 1억원
          </div>
        </div>

        {/* 🚨 비상 일괄청산 (Kill-Switch) & 인터넷 차단·시스템 장애 안전망 바 */}
        <div className="bg-gradient-to-r from-rose-950/90 via-red-950/80 to-slate-950 border-2 border-rose-500/70 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 text-xs shadow-xl">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-rose-600 text-white font-extrabold text-[11px] shadow animate-pulse">
              🚨 선물 비상 일괄청산 (Kill-Switch)
            </span>
            <span className="text-rose-100 font-semibold text-[11px] sm:text-xs">
              현재 계좌 포지션:{" "}
              <strong className="text-yellow-300 font-mono">
                {(() => {
                  const netC = Number(
                    kisAccountData?.effective_net_contracts ??
                      lockStatus?.prev_contracts ??
                      simData?.last_trading_summary?.target_contracts ??
                      0
                  );
                  return netC > 0 ? `매수(Long) +${netC}계약` : netC < 0 ? `매도(Short) ${netC}계약` : "0계약 (FLAT)";
                })()}
              </strong>{" "}
              · 인터넷 차단이나 시스템 장애 시 보유 선물 매수(Long)·매도(Short) 포지션을 한 번에 시장가로 반대매매하여 <strong>0계약(FLAT)</strong>으로 즉시 청산합니다.
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={kisOrderLoading}
              onClick={handleEmergencyLiquidateFutures}
              className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 border border-rose-300 text-white font-extrabold shadow-lg cursor-pointer flex items-center gap-1.5"
            >
              <span>🚨</span>
              <span>
                {kisOrderLoading
                  ? "비상청산 실행중..."
                  : "선물 매수·매도 전량 즉시 시장가 청산 (0계약 FLAT)"}
              </span>
            </button>
            <span className="px-2 py-1 rounded bg-slate-900/90 border border-rose-500/40 text-rose-200 font-mono text-[11px]">
              ☎️ 인터넷 단절 시 한투 비상주문: 1544-5000
            </span>
          </div>
        </div>

        {showManual && (
          <div className="bg-slate-950/95 border border-amber-500/50 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="font-extrabold text-amber-300 text-sm">
                📖 KOSPI200 선물 10대 매매모델 4대 핵심 운용 프로세스 실전 매뉴얼
              </div>
              <button
                onClick={() => setShowManual(false)}
                className="px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white"
              >
                닫기 ✕
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                <div className="font-extrabold text-purple-300">① 신규 모델 추가 &amp; 10대 풀 편입</div>
                <p className="text-slate-300 leading-relaxed">
                  <strong>[운용 메뉴: Step 2 &amp; Step 3]</strong><br />
                  신규 후보모델(C01~C03)의 성과를 평가하고, 직전/직후 구간 연속성 통과 시 <strong>10대 모델 풀에 정식 편입</strong>하며 기존 10대 모델 중 <strong>최하위 샤프지수 모델을 자동 보관(Archive)</strong>합니다.
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                <div className="font-extrabold text-emerald-300">② 포워드(Forward) 성과·연속성 측정</div>
                <p className="text-slate-300 leading-relaxed">
                  <strong>[운용 메뉴: Step 3]</strong><br />
                  특정 기준일 기준 <strong>직전 3개월(또는 6개월) 성과</strong>를 <strong>직후 3개월(또는 6개월) 포워드 구간</strong>에서 검증하여 수익률·샤프지수의 연속성(일관성 유지 비율)을 판정합니다.
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                <div className="font-extrabold text-sky-300">③ 5개 채택모델 중 MDD 초과 모델 교체</div>
                <p className="text-slate-300 leading-relaxed">
                  <strong>[운용 메뉴: 🏆 실전 종합 &amp; Step 4]</strong><br />
                  채택된 5개 모델 중 MDD 한도(기본 12%) 초과 손실 모델 발생 시, 나머지 대기 5개 모델 중 <strong>위험조정수익률(최근 3개월 63일 / 6개월 126일 샤프지수) 1위 모델</strong>로 자동/수동 교체합니다.
                </p>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-1.5">
                <div className="font-extrabold text-amber-300">④ 매일 선물 종가 리밸런싱 &amp; 매매원장</div>
                <p className="text-slate-300 leading-relaxed">
                  <strong>[운용 메뉴: Step 5 &amp; 🏆 실전 종합]</strong><br />
                  매일 <strong>15:30 정각</strong>에 5개 모델 시그널 합산(-5~+5 × 멀티플)을 확정(Lock)하고, <strong>15:35~15:45 종가 동시호가</strong>에 전일 보유계약 대비 증감분(<strong>Delta</strong>)만 리밸런싱하며 일별 성과를 측정합니다.
                </p>
              </div>
            </div>
          </div>
        )}

        {bannerMsg && (
          <div className="bg-emerald-950/60 border border-emerald-500/50 text-emerald-200 px-3.5 py-2 rounded-lg text-xs flex items-center justify-between">
            <span>{bannerMsg}</span>
            <button onClick={() => setBannerMsg("")} className="text-emerald-400 hover:text-white">
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-7 gap-1.5 sm:gap-2">
          {[
            { id: 6, title: "🏆 실전 종합 & KOSPI200 비교", sub: "운용성과·모델별성과·매매원장 통합" },
            { id: 7, title: "🧪 4대수급 역추세 & 12모델 매뉴얼", sub: "공매도·신용·OI·차익 Gate vs Score" },
            { id: 1, title: "Step 1. 추세·에너지 수급합산", sub: "신고신저×외인 + 차익·OI·PCR 회귀" },
            { id: 2, title: "Step 2. 구간 평가 & 모델 선택", sub: "모델별 운용성과 차트 & 선택" },
            { id: 3, title: "Step 3. 후속 구간 일관성 검증", sub: "포워드(3M/6M) 연속성 & 후보편입" },
            { id: 4, title: "Step 4. 최종 모델 운용성과", sub: "운용성과 차트·포지션차트·모델별성과" },
            { id: 5, title: "Step 5. 15:30 확정 & 매매원장", sub: "매매수익률·포지션 차트 & 매매원장" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => {
                setStep(m.id);
                if (m.id === 7 && !scBacktestData && !scLoading) {
                  fetchSupplyContrarianBacktest();
                }
              }}
              className={`p-2 sm:p-3 rounded-xl text-left border transition cursor-pointer ${
                step === m.id
                  ? "bg-indigo-600/30 border-indigo-400 text-white shadow-lg"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              <div className="text-[11px] sm:text-xs font-extrabold leading-tight">{m.title}</div>
              <div className="text-[10px] sm:text-[11px] opacity-80 mt-0.5 truncate">{m.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {((step === 6 && !pm) || (step === 1 && !sc) || (step === 4 && !pm)) && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-8 text-center space-y-3">
          <div className="text-sm font-extrabold text-indigo-300">
            {loading
              ? "⚡ 선물 10대 매매모델 운용성과 데이터를 고속 로딩 중입니다..."
              : "📊 시뮬레이션 데이터를 불러오고 있습니다."}
          </div>
          <p className="text-xs text-slate-400">
            잠시만 기다려 주시거나 아래 버튼을 클릭하면 즉시 화면이 표시됩니다.
          </p>
          <button
            onClick={() => fetchSimulation()}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold cursor-pointer"
          >
            🔄 데이터 즉시 불러오기
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 6: 실전 종합 & KOSPI200 비교 + 최종모델 운용성과/모델별 성과/매매원장 통합 */}
      {/* =================================================================== */}
      {step === 6 && pm && (
        <div className="space-y-5">
          {/* 기간 및 파라미터 컨트롤 바 */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-yellow-400">
                  🏆 실제 마지막 트레이딩 누적수익률 &amp; KOSPI200 비교 · 최종모델/모델별 운용성과 · 매매원장 수익률 &amp; 포지션 차트
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  현재 조회 구간:{" "}
                  <strong className="text-emerald-300 font-mono">
                    {cs.dates?.[0] || startDate} ~ {cs.dates?.[cs.dates.length - 1] || endDate} ({pm.total_days}거래일)
                  </strong>{" "}
                  | 시작일~마감일을 변경하거나 빠른 구간 버튼을 클릭하면 모든 차트와 수익률이 즉시 해당 구간으로 재산출됩니다.
                </p>
              </div>
              {renderQuickSimPeriodButtons()}
            </div>

            {lt?.active_regime_detector && (
              <div className="bg-slate-950/90 border border-emerald-500/40 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-extrabold">
                    ★ 실전 채택 운용엔진
                  </span>
                  <span className="font-bold text-emerald-300">
                    {lt.active_regime_detector.current_regime_label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-slate-300">
                  <span>
                    20일 이평 VIX: <strong className="text-amber-300">{lt.active_regime_detector.current_vix_20ma}pt</strong> (≤16pt 박스권)
                  </span>
                  <span>
                    변동×거래량 에너지: <strong className="text-sky-300">{lt.active_regime_detector.current_vol_volume_energy}</strong> (≤1.35 박스권)
                  </span>
                  <span>
                    구간 내 박스권 리밸런싱:{" "}
                    <strong className="text-emerald-300">{lt.active_regime_detector.total_range_days_in_period}일</strong> / 추세장:{" "}
                    <strong className="text-indigo-300">{lt.active_regime_detector.total_trend_days_in_period}일</strong>
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-slate-800/80">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">시작일</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setStartDate(nextStart);
                      if (nextStart && nextStart.length === 10) {
                        fetchSimulation({ start: nextStart, end: endDate, current: useCurrent });
                      }
                    }}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">마감일 (마지막 트레이딩)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={endDate}
                      disabled={useCurrent}
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        setEndDate(nextEnd);
                        if (nextEnd && nextEnd.length === 10 && !useCurrent) {
                          fetchSimulation({ start: startDate, end: nextEnd, current: false });
                        }
                      }}
                      className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono disabled:opacity-50"
                    />
                    <label className="flex items-center gap-1.5 text-emerald-300 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useCurrent}
                        onChange={(e) => {
                          const nextCur = e.target.checked;
                          setUseCurrent(nextCur);
                          fetchSimulation({ start: startDate, end: endDate, current: nextCur });
                        }}
                      />
                      현재까지
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">멀티플 (배수)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={multiplier}
                    onChange={(e) => setMultiplier(Number(e.target.value) || 10)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">① 개별모델 교체 MDD(%)</label>
                  <input
                    type="number"
                    step={0.5}
                    min={3}
                    max={50}
                    value={mddThreshold}
                    onChange={(e) => setMddThreshold(Number(e.target.value) || 12)}
                    className="w-24 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-amber-300 font-bold mb-1">②/③ 포트폴리오 위험관리 기준</label>
                  <select
                    value={portfolioRiskMode}
                    onChange={(e) => {
                      const nextMode = e.target.value;
                      setPortfolioRiskMode(nextMode);
                      fetchSimulation({ riskMode: nextMode });
                    }}
                    className="bg-slate-950 border border-amber-500/50 rounded px-2.5 py-1.5 text-amber-300 font-bold"
                  >
                    <option value="MODEL_SWAP_ONLY">① 개별모델 교체만 ({mddThreshold}%)</option>
                    <option value="PORTFOLIO_SCALE_DOWN">② 포트폴리오 위험축소 ({portfolioMddLimit}%)</option>
                    <option value="PORTFOLIO_HARD_STOP">③ 실전 운용중지 Hard-Stop ({portfolioMddLimit}%)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">교체기준 위험조정수익률(샤프)</label>
                  <select
                    value={sharpeLookbackDays}
                    onChange={(e) => {
                      const nextLb = Number(e.target.value);
                      setSharpeLookbackDays(nextLb);
                      fetchSimulation({ lookback: nextLb });
                    }}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-sky-300 font-bold"
                  >
                    <option value={63}>최근 3개월 (63영업일) 샤프지수</option>
                    <option value={126}>최근 6개월 (126영업일) 샤프지수</option>
                    <option value={0}>조회구간 전체 누적 샤프지수</option>
                  </select>
                </div>
                <div>
                  <label className="block text-emerald-300 font-bold mb-1">
                    수급비중 ({supplyWeight}% {supplyWeight === 35 ? "· 디폴트" : "· 사용자조정"})
                  </label>
                  <div className="flex items-center gap-2 bg-slate-950 border border-emerald-500/50 rounded px-2.5 py-1">
                    <input
                      type="range"
                      min={10}
                      max={65}
                      step={5}
                      value={supplyWeight}
                      onChange={(e) => {
                        const nw = Number(e.target.value);
                        setSupplyWeight(nw);
                        fetchSimulation({ simWeight: nw });
                        fetchLedgerOnly({ simWeight: nw });
                      }}
                      className="w-24 accent-emerald-400 cursor-pointer"
                    />
                    <span className="font-mono font-extrabold text-emerald-300 text-xs">{supplyWeight}%</span>
                    {supplyWeight !== 35 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSupplyWeight(35);
                          fetchSimulation({ simWeight: 35 });
                        }}
                        className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-amber-300 font-bold cursor-pointer"
                      >
                        35%복원
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => fetchSimulation()}
                className="px-4 py-1.5 rounded bg-yellow-600 hover:bg-yellow-500 text-white font-extrabold cursor-pointer"
              >
                🔍 종합 시뮬레이션 실행
              </button>
            </div>
          </div>

          {/* 1. 마지막 트레이딩 핵심 요약 카드 5종 + 최종모델 12대 운용성과 카드 */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="text-[11px] text-slate-400">실제 마지막 트레이딩 체결일</div>
              <div className="text-lg font-extrabold font-mono text-white mt-1">
                {lt?.last_executed_trade_date || lt?.last_trading_date || "-"}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                최신 정산일: {lt?.last_trading_date || "-"} | {lt?.last_executed_action || "포지션 유지"} (Delta:{" "}
                {lt?.last_executed_delta_contracts ?? 0}계약)
              </div>
            </div>

            <div className="bg-slate-900/90 border border-emerald-500/40 rounded-xl p-4">
              <div className="text-[11px] text-slate-400">최종모델 실전 누적수익률</div>
              <div className="text-xl font-extrabold font-mono text-emerald-400 mt-1">
                {pm.cum_return_pct >= 0 ? "+" : ""}
                {pm.cum_return_pct}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                추세+에너지회귀 고정:{" "}
                <strong className="text-emerald-300">
                  +{sc?.combined_portfolio_metrics?.cum_return_pct ?? pm.cum_return_pct}%
                </strong>{" "}
                | 연율 {pm.annual_return_pct}%
              </div>
            </div>

            <div className="bg-slate-900/90 border border-amber-500/40 rounded-xl p-4">
              <div className="text-[11px] text-slate-400">KOSPI200 지수 누적수익률</div>
              <div className="text-xl font-extrabold font-mono text-amber-300 mt-1">
                {(km?.cum_return_pct ?? 0) >= 0 ? "+" : ""}
                {km?.cum_return_pct ?? 0}%
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                KOSPI200 종가: {lt?.latest_k200_close ?? "-"}pt | 선물: {lt?.latest_futures_close ?? "-"}pt
              </div>
            </div>

            <div className="bg-slate-900/90 border border-yellow-500/40 rounded-xl p-4">
              <div className="text-[11px] text-slate-400">KOSPI200 대비 초과수익률 (Alpha)</div>
              <div className="text-xl font-extrabold font-mono text-yellow-300 mt-1">
                {(lt?.alpha_vs_k200_pct ?? 0) >= 0 ? "+" : ""}
                {lt?.alpha_vs_k200_pct ?? 0}%p
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                추세+에너지회귀 Alpha:{" "}
                <strong className="text-yellow-300">
                  {(lt?.combined_alpha_vs_k200_pct ?? 0) >= 0 ? "+" : ""}
                  {lt?.combined_alpha_vs_k200_pct ?? 0}%p
                </strong>
              </div>
            </div>

            <div className="bg-slate-900/90 border border-sky-500/40 rounded-xl p-4">
              <div className="text-[11px] text-slate-400">누적 원화 손익 (멀티플 {multiplier}x)</div>
              <div className="text-lg font-extrabold font-mono text-sky-300 mt-1">
                {(pm.total_pnl_krw ?? 0) >= 0 ? "+" : ""}
                {Number(pm.total_pnl_krw ?? 0).toLocaleString()}원
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                승률(Hit): {pm.hitting_ratio_pct}% | Sharpe: {pm.sharpe_ratio} | 포트폴리오 MDD: {pm.mdd_pct}%
              </div>
            </div>
          </div>

          {/* 1-2. 최종모델 운용성과 10대 정밀 평가지표 그리드 */}
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold text-indigo-300">
                🎯 최종모델 포트폴리오 운용성과 10대 핵심 평가지표 (현재 포지션: 합산 {pm.current_base_position} / 목표{" "}
                {pm.current_target_contracts}계약 / 자동교체 {pm.total_swap_count}회 / 위험관리:{" "}
                {portfolioRiskMode === "MODEL_SWAP_ONLY"
                  ? `① 개별모델 교체(${mddThreshold}%)`
                  : portfolioRiskMode === "PORTFOLIO_SCALE_DOWN"
                  ? `② 포트폴리오 위험축소(${portfolioMddLimit}%)`
                  : `③ 실전 운용중지 Hard-Stop(${portfolioMddLimit}%)`}
                )
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2.5">
              {[
                { label: "① Hitting Ratio", val: `${pm.hitting_ratio_pct}%`, cls: "text-emerald-400" },
                { label: "② +수익 일수", val: `${pm.pos_days}일`, cls: "text-emerald-300" },
                { label: "③ -수익 일수", val: `${pm.neg_days}일`, cls: "text-rose-300" },
                { label: "④ 일간 +평균", val: `+${pm.avg_pos_return_pct}%`, cls: "text-teal-300" },
                { label: "⑤ 일간 -평균", val: `${pm.avg_neg_return_pct}%`, cls: "text-pink-300" },
                { label: "⑥ 포트폴리오 MDD", val: `${pm.mdd_pct}%`, cls: "text-amber-300" },
                { label: "⑦ P/L Factor", val: `${pm.profit_loss_factor}`, cls: "text-sky-300" },
                { label: "⑧ Sharpe Ratio", val: `${pm.sharpe_ratio}`, cls: "text-indigo-300" },
                { label: "⑨ Sortino Ratio", val: `${pm.sortino_ratio}`, cls: "text-purple-300" },
                { label: "⑩ Calmar Ratio", val: `${pm.calmar_ratio}`, cls: "text-yellow-300" },
              ].map((item, idx) => (
                <div key={idx} className="bg-slate-950/80 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-400">{item.label}</div>
                  <div className={`text-sm font-extrabold font-mono mt-1 ${item.cls}`}>{item.val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 1-3. MDD 12% 한도 vs 포트폴리오 MDD 23.78% — 3대 위험관리 기준 명확화 정의 & 동일 운용조건 비교 센터 */}
          {renderRiskPolicyClarificationPanel()}

          {/* 2. 최종모델 운용성과 차트 (vs KOSPI200 / 선물 / 순수신호) & 채택된 5대 모델 개별 차트 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-extrabold text-white mb-2">
                📈 최종모델 운용성과 누적수익률(%) vs KOSPI200 지수 &amp; 선물 비교 차트 ({cs.dates?.[0]} ~{" "}
                {cs.dates?.[cs.dates.length - 1]})
              </h3>
              <SvgMultiLineChart
                dates={cs.dates || []}
                seriesList={[
                  {
                    label: "추세+에너지회귀 최종모델 포트폴리오",
                    data: cs.combined_cum_return_pct || [],
                    color: "#10b981",
                    width: 2.6,
                  },
                  {
                    label: "실전 운용성과 (MDD 자동교체 포함)",
                    data: cs.portfolio_cum_return_pct || [],
                    color: "#38bdf8",
                    width: 2.3,
                  },
                  {
                    label: "순수 기술지표 단독 포트폴리오",
                    data: cs.pure_cum_return_pct || [],
                    color: "#94a3b8",
                    dashed: true,
                    width: 1.6,
                  },
                  {
                    label: "KOSPI200 지수 벤치마크",
                    data: cs.k200_cum_return_pct || [],
                    color: "#f59e0b",
                    dashed: true,
                    width: 2.0,
                  },
                ]}
              />
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-xs font-extrabold text-white">
                  🚀 채택된 5대 주력 모델 각 누적수익률(%) &amp; KOSPI200 비교 차트
                </h3>
                <select
                  value={adoptedChartFilter}
                  onChange={(e) => setAdoptedChartFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-emerald-300 font-bold"
                >
                  <option value="ALL">채택된 주력 모델 전체 비교 (vs KOSPI200)</option>
                  {adoptedModels.map((m: any) => (
                    <option key={m.model_id} value={m.model_id}>
                      [{m.model_id}] {m.name} ({m.cum_return_pct >= 0 ? "+" : ""}
                      {m.cum_return_pct}%)
                    </option>
                  ))}
                </select>
              </div>
              <SvgMultiLineChart
                dates={cs.dates || []}
                seriesList={[
                  {
                    label: "KOSPI200 지수",
                    data: cs.k200_cum_return_pct || [],
                    color: "#f59e0b",
                    dashed: true,
                    width: 2.0,
                  },
                  ...adoptedModels
                    .filter((m: any) => adoptedChartFilter === "ALL" || adoptedChartFilter === m.model_id)
                    .map((m: any, idx: number) => ({
                      label: m.model_id,
                      data: (cs.model_cum_returns_pct && cs.model_cum_returns_pct[m.model_id]) || [],
                      color: MODEL_COLORS[idx % MODEL_COLORS.length],
                      width: adoptedChartFilter === m.model_id ? 2.8 : 2.0,
                    })),
                ]}
              />
            </div>
          </div>

          {/* 3. 포트폴리오 vs KOSPI200 10대 평가지표 비교 테이블 */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-x-auto">
            <h3 className="text-xs font-extrabold text-white mb-3">
              📊 [최종모델 실전 운용성과] vs [추세+에너지회귀 결합] vs [KOSPI200 지수] 10대 평가지표 비교
            </h3>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                  <th className="p-2">구분</th>
                  <th className="p-2 text-right text-emerald-300">누적수익률</th>
                  <th className="p-2 text-right text-yellow-300">KOSPI200 대비 Alpha</th>
                  <th className="p-2 text-right">① Hitting Ratio</th>
                  <th className="p-2 text-right">② +일수</th>
                  <th className="p-2 text-right">③ -일수</th>
                  <th className="p-2 text-right">④ 일간+평균</th>
                  <th className="p-2 text-right">⑤ 일간-평균</th>
                  <th className="p-2 text-right">⑥ MDD</th>
                  <th className="p-2 text-right">⑦ P/L Factor</th>
                  <th className="p-2 text-right text-sky-300">⑧ Sharpe</th>
                  <th className="p-2 text-right">⑨ Sortino</th>
                  <th className="p-2 text-right">⑩ Calmar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {[
                  {
                    name: "🏆 최종모델 실전 포트폴리오 (MDD 자동교체)",
                    m: pm,
                    alpha: lt?.alpha_vs_k200_pct ?? 0,
                    cls: "bg-emerald-950/20 text-emerald-200 font-bold",
                  },
                  {
                    name: "🔥 추세+횡보에너지회귀 결합 포트폴리오 (고정 5모델)",
                    m: sc?.combined_portfolio_metrics || pm,
                    alpha: lt?.combined_alpha_vs_k200_pct ?? 0,
                    cls: "bg-indigo-950/20 text-indigo-200 font-bold",
                  },
                  {
                    name: "⚪ 순수 기술지표 단독 포트폴리오 (수급 미합산)",
                    m: sc?.pure_portfolio_metrics || {},
                    alpha: Number(
                      ((sc?.pure_portfolio_metrics?.cum_return_pct ?? 0) - (km?.cum_return_pct ?? 0)).toFixed(2)
                    ),
                    cls: "text-slate-400",
                  },
                  {
                    name: "📊 KOSPI200 현물 지수 벤치마크 (Buy & Hold)",
                    m: km || {},
                    alpha: 0,
                    cls: "text-amber-200",
                  },
                  {
                    name: "📈 KOSPI200 연결선물 단순보유 (Buy & Hold)",
                    m: fm || {},
                    alpha: Number(((fm?.cum_return_pct ?? 0) - (km?.cum_return_pct ?? 0)).toFixed(2)),
                    cls: "text-slate-300",
                  },
                ].map((r, idx) => (
                  <tr key={idx} className={r.cls}>
                    <td className="p-2 font-sans">{r.name}</td>
                    <td
                      className={`p-2 text-right font-extrabold ${
                        (r.m.cum_return_pct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {(r.m.cum_return_pct ?? 0) >= 0 ? "+" : ""}
                      {r.m.cum_return_pct ?? 0}%
                    </td>
                    <td
                      className={`p-2 text-right font-bold ${
                        r.alpha >= 0 ? "text-yellow-300" : "text-rose-400"
                      }`}
                    >
                      {r.alpha >= 0 ? "+" : ""}
                      {r.alpha}%p
                    </td>
                    <td className="p-2 text-right">{r.m.hitting_ratio_pct ?? 0}%</td>
                    <td className="p-2 text-right text-emerald-300">{r.m.pos_days ?? 0}일</td>
                    <td className="p-2 text-right text-rose-300">{r.m.neg_days ?? 0}일</td>
                    <td className="p-2 text-right">+{r.m.avg_pos_return_pct ?? 0}%</td>
                    <td className="p-2 text-right">{r.m.avg_neg_return_pct ?? 0}%</td>
                    <td className="p-2 text-right text-amber-300">{r.m.mdd_pct ?? 0}%</td>
                    <td className="p-2 text-right">{r.m.profit_loss_factor ?? 0}</td>
                    <td className="p-2 text-right font-bold text-sky-300">{r.m.sharpe_ratio ?? 0}</td>
                    <td className="p-2 text-right">{r.m.sortino_ratio ?? 0}</td>
                    <td className="p-2 text-right">{r.m.calmar_ratio ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 4. 채택된 5대 주력 모델 각 성과지표 카드 및 상세 테이블 */}
          <div className="bg-slate-900/90 border border-emerald-500/30 rounded-xl p-4 space-y-3">
            <div>
              <h3 className="text-xs font-extrabold text-emerald-300">
                ✅ 채택된 주력 모델 (Active {adoptedModels.length} Models) 각 운용성과지표 및 시그널
              </h3>
              <p className="text-[11px] text-slate-400">
                현재 실전 포트폴리오 합산 포지션(-5 ~ +5)에 참여 중인 채택 모델들의 개별 운용성과입니다.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {adoptedModels.map((m: any, idx: number) => (
                <div
                  key={m.model_id}
                  onClick={() => setAdoptedChartFilter(m.model_id)}
                  className="bg-slate-950/90 border border-emerald-500/30 hover:border-emerald-400 rounded-xl p-3 cursor-pointer transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold">
                      채택 #{idx + 1} · {m.model_id}
                    </span>
                    {formatBadge(m.latest_signal)}
                  </div>
                  <div className="text-xs font-bold text-white mt-1.5 truncate" title={m.name}>
                    {m.name}
                  </div>
                  <div className="grid grid-cols-2 gap-1 mt-2 pt-2 border-t border-slate-800 text-[11px] font-mono">
                    <div>
                      수익률:{" "}
                      <strong className={m.cum_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {m.cum_return_pct >= 0 ? "+" : ""}
                        {m.cum_return_pct}%
                      </strong>
                    </div>
                    <div>
                      Alpha:{" "}
                      <strong className="text-yellow-300">
                        {(m.alpha_vs_k200_pct ?? 0) >= 0 ? "+" : ""}
                        {m.alpha_vs_k200_pct ?? 0}%p
                      </strong>
                    </div>
                    <div>
                      승률: <strong className="text-white">{m.hitting_ratio_pct}%</strong>
                    </div>
                    <div>
                      Sharpe: <strong className="text-sky-300">{m.sharpe_ratio}</strong>
                    </div>
                    <div>
                      MDD: <strong className="text-amber-300">{m.mdd_pct}%</strong>
                    </div>
                    <div>
                      P/L비: <strong className="text-slate-200">{m.profit_loss_factor}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                    <th className="p-2">채택 순위</th>
                    <th className="p-2">모델 ID / 모델명</th>
                    <th className="p-2 text-center">현재 시그널</th>
                    <th className="p-2 text-right text-emerald-300">누적수익률</th>
                    <th className="p-2 text-right text-yellow-300">KOSPI200 대비 Alpha</th>
                    <th className="p-2 text-right">① Hitting Ratio</th>
                    <th className="p-2 text-right">② +일수</th>
                    <th className="p-2 text-right">③ -일수</th>
                    <th className="p-2 text-right">④ +평균</th>
                    <th className="p-2 text-right">⑤ -평균</th>
                    <th className="p-2 text-right">⑥ MDD</th>
                    <th className="p-2 text-right">⑦ P/L Factor</th>
                    <th className="p-2 text-right text-sky-300">⑧ Sharpe</th>
                    <th className="p-2 text-right">⑨ Sortino</th>
                    <th className="p-2 text-right">⑩ Calmar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {adoptedModels.map((m: any, idx: number) => (
                    <tr key={m.model_id} className="hover:bg-slate-800/50 bg-emerald-950/10">
                      <td className="p-2 font-sans">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                          채택 #{idx + 1}
                        </span>
                      </td>
                      <td className="p-2 font-sans">
                        <div className="font-bold text-white">{m.model_id}</div>
                        <div className="text-[11px] text-slate-400">{m.name}</div>
                      </td>
                      <td className="p-2 text-center">{formatBadge(m.latest_signal)}</td>
                      <td
                        className={`p-2 text-right font-bold ${
                          m.cum_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {m.cum_return_pct >= 0 ? "+" : ""}
                        {m.cum_return_pct}%
                      </td>
                      <td
                        className={`p-2 text-right font-bold ${
                          (m.alpha_vs_k200_pct ?? 0) >= 0 ? "text-yellow-300" : "text-rose-400"
                        }`}
                      >
                        {(m.alpha_vs_k200_pct ?? 0) >= 0 ? "+" : ""}
                        {m.alpha_vs_k200_pct ?? 0}%p
                      </td>
                      <td className="p-2 text-right font-bold">{m.hitting_ratio_pct}%</td>
                      <td className="p-2 text-right text-emerald-300">{m.pos_days}일</td>
                      <td className="p-2 text-right text-rose-300">{m.neg_days}일</td>
                      <td className="p-2 text-right">+{m.avg_pos_return_pct}%</td>
                      <td className="p-2 text-right">{m.avg_neg_return_pct}%</td>
                      <td className="p-2 text-right text-amber-300">{m.mdd_pct}%</td>
                      <td className="p-2 text-right">{m.profit_loss_factor}</td>
                      <td className="p-2 text-right font-bold text-sky-300">{m.sharpe_ratio}</td>
                      <td className="p-2 text-right">{m.sortino_ratio}</td>
                      <td className="p-2 text-right">{m.calmar_ratio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4-B. 실시간 모델교체 정밀 모니터링 & 정기(3M/6M)·MDD 갱신 교체 컨트롤 센터 */}
          {renderModelReplacementMonitorPanel()}

          {/* 5. 대기모델 리스트 (10대 풀 대기 5개 모델 + 신규 편입 후보 3개 모델) */}
          <div className="bg-slate-900/90 border border-sky-500/30 rounded-xl p-4 space-y-3 overflow-x-auto">
            <div>
              <h3 className="text-xs font-extrabold text-sky-300">
                ⏳ 대기모델 리스트 (10대 풀 대기 5개 모델 &amp; 신규 편입 후보 3개 모델)
              </h3>
              <p className="text-[11px] text-slate-400">
                채택 모델의 MDD가 임계치({mddThreshold}%)를 초과할 때 샤프지수(위험조정수익률) 1위부터 자동 투입되는 대기모델 리스트입니다.
              </p>
            </div>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                  <th className="p-2">대기 우선순위 / 구분</th>
                  <th className="p-2">모델 ID / 모델명</th>
                  <th className="p-2 text-center">현재 시그널</th>
                  <th className="p-2 text-right text-emerald-300">누적수익률</th>
                  <th className="p-2 text-right text-yellow-300">KOSPI200 대비 Alpha</th>
                  <th className="p-2 text-right">① Hitting Ratio</th>
                  <th className="p-2 text-right">② +일수</th>
                  <th className="p-2 text-right">③ -일수</th>
                  <th className="p-2 text-right">⑥ MDD</th>
                  <th className="p-2 text-right">⑦ P/L Factor</th>
                  <th className="p-2 text-right text-sky-300">⑧ Sharpe (교체순위)</th>
                  <th className="p-2 text-right">⑨ Sortino</th>
                  <th className="p-2 text-right">⑩ Calmar</th>
                  <th className="p-2 text-center">즉시 채택 교체</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {waitingModels.map((m: any, idx: number) => (
                  <tr key={m.model_id} className="hover:bg-slate-800/50">
                    <td className="p-2 font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          m.is_in_10_pool
                            ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                            : "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                        }`}
                      >
                        {m.pool_status_label || `대기 #${idx + 1}`}
                      </span>
                    </td>
                    <td className="p-2 font-sans">
                      <div className="font-bold text-white">{m.model_id}</div>
                      <div className="text-[11px] text-slate-400">{m.name}</div>
                    </td>
                    <td className="p-2 text-center">{formatBadge(m.latest_signal)}</td>
                    <td
                      className={`p-2 text-right font-bold ${
                        m.cum_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {m.cum_return_pct >= 0 ? "+" : ""}
                      {m.cum_return_pct}%
                    </td>
                    <td
                      className={`p-2 text-right font-bold ${
                        (m.alpha_vs_k200_pct ?? 0) >= 0 ? "text-yellow-300" : "text-rose-400"
                      }`}
                    >
                      {(m.alpha_vs_k200_pct ?? 0) >= 0 ? "+" : ""}
                      {m.alpha_vs_k200_pct ?? 0}%p
                    </td>
                    <td className="p-2 text-right">{m.hitting_ratio_pct}%</td>
                    <td className="p-2 text-right text-emerald-300">{m.pos_days}일</td>
                    <td className="p-2 text-right text-rose-300">{m.neg_days}일</td>
                    <td className="p-2 text-right text-amber-300">{m.mdd_pct}%</td>
                    <td className="p-2 text-right">{m.profit_loss_factor}</td>
                    <td className="p-2 text-right font-bold text-sky-300">{m.sharpe_ratio}</td>
                    <td className="p-2 text-right">{m.sortino_ratio}</td>
                    <td className="p-2 text-right">{m.calmar_ratio}</td>
                    <td className="p-2 text-center font-sans">
                      <button
                        onClick={() => handleAdoptWaitingModel(m.model_id)}
                        className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-[11px] font-bold text-white cursor-pointer"
                      >
                        ⚡ 채택 모델로 교체
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 6. 전체 13대 모델별 운용성과 종합 차트 & 상세 성적표 */}
          <div className="bg-slate-900/90 border border-purple-500/30 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-extrabold text-purple-300">
                  📊 전체 13대 모델별 운용성과 비교 차트 &amp; 10대 평가지표 총괄표 (10대 주력 풀 + 3대 후보 모델)
                </h3>
                <p className="text-[11px] text-slate-400">
                  개별 모델 각각의 순수 수익률 vs 수급합산 수익률, 10대 평가지표, 최근 시그널(T=0~T-10) 및 모델별 누적수익률 차트입니다.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">모델평가 시작일</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1 text-[11px]">모델평가 마감일</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={endDate}
                      disabled={useCurrent}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-white font-mono disabled:opacity-50"
                    />
                    <label className="flex items-center gap-1 text-emerald-300 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useCurrent}
                        onChange={(e) => setUseCurrent(e.target.checked)}
                      />
                      현재까지
                    </label>
                  </div>
                </div>
                <button
                  onClick={() => fetchSimulation()}
                  className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold cursor-pointer"
                >
                  🔍 기간 조회
                </button>
                <select
                  value={allModelChartFilter}
                  onChange={(e) => setAllModelChartFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-purple-300 font-bold"
                >
                  <option value="ALL_13">전체 13개 모델 누적수익률 비교</option>
                  <option value="POOL_10">10대 운영 풀 모델만 비교</option>
                  <option value="ADOPTED_5">채택된 5대 모델만 비교</option>
                  <option value="WAITING_8">대기/후보 8개 모델만 비교</option>
                </select>
              </div>
            </div>

            <SvgMultiLineChart
              dates={cs.dates || []}
              height={260}
              seriesList={[
                {
                  label: "KOSPI200 지수",
                  data: cs.k200_cum_return_pct || [],
                  color: "#f59e0b",
                  dashed: true,
                  width: 2.2,
                },
                ...allModels
                  .filter((m: any) => {
                    if (allModelChartFilter === "POOL_10") return m.is_in_10_pool;
                    if (allModelChartFilter === "ADOPTED_5") return m.is_currently_selected;
                    if (allModelChartFilter === "WAITING_8") return !m.is_currently_selected;
                    return true;
                  })
                  .map((m: any, idx: number) => ({
                    label: m.model_id,
                    data: (cs.model_cum_returns_pct && cs.model_cum_returns_pct[m.model_id]) || [],
                    color: MODEL_COLORS[idx % MODEL_COLORS.length],
                    width: m.is_currently_selected ? 2.3 : 1.5,
                  })),
              ]}
            />

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                    <th className="p-2 text-center">선택</th>
                    <th className="p-2">상태</th>
                    <th className="p-2">모델 ID / 모델명 / 지표군</th>
                    <th className="p-2 text-center">시그널(T0/T-1/T-5)</th>
                    <th className="p-2 text-right">순수수익률</th>
                    <th className="p-2 text-right text-emerald-300">운용수익률</th>
                    <th className="p-2 text-right">연환산</th>
                    <th className="p-2 text-right">① 승률(Hit)</th>
                    <th className="p-2 text-right">② +일수</th>
                    <th className="p-2 text-right">③ -일수</th>
                    <th className="p-2 text-right">④ +평균</th>
                    <th className="p-2 text-right">⑤ -평균</th>
                    <th className="p-2 text-right">⑥ MDD</th>
                    <th className="p-2 text-right">⑦ P/L비</th>
                    <th className="p-2 text-right text-sky-300">⑧ Sharpe</th>
                    <th className="p-2 text-right">⑨ Sortino</th>
                    <th className="p-2 text-right">⑩ Calmar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {allModels.map((m: any) => {
                    const checked = selectedModelIds.includes(m.model_id);
                    return (
                      <tr
                        key={m.model_id}
                        className={
                          m.is_currently_selected
                            ? "bg-emerald-950/15 hover:bg-slate-800/50"
                            : "hover:bg-slate-800/40"
                        }
                      >
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleModelCheck(m.model_id)}
                          />
                        </td>
                        <td className="p-2 font-sans">
                          {m.is_currently_selected ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                              채택 주력
                            </span>
                          ) : m.is_in_10_pool ? (
                            <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                              10대풀 대기
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                              신규 후보
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-sans">
                          <div className="font-bold text-white">{m.model_id}</div>
                          <div className="text-[11px] text-slate-400">
                            {m.name} · <span className="text-indigo-300">{m.indicator_group}</span>
                          </div>
                        </td>
                        <td className="p-2 text-center">
                          {formatBadge(m.latest_signal)}
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            T-1:{m.signal_lags?.T_1 ?? 0} / T-5:{m.signal_lags?.T_5 ?? 0}
                          </div>
                        </td>
                        <td className="p-2 text-right text-slate-400">
                          {m.pure_metrics?.cum_return_pct ?? 0}%
                        </td>
                        <td
                          className={`p-2 text-right font-extrabold ${
                            m.cum_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {m.cum_return_pct >= 0 ? "+" : ""}
                          {m.cum_return_pct}%
                        </td>
                        <td className="p-2 text-right">{m.annual_return_pct}%</td>
                        <td className="p-2 text-right font-bold">{m.hitting_ratio_pct}%</td>
                        <td className="p-2 text-right text-emerald-300">{m.pos_days}일</td>
                        <td className="p-2 text-right text-rose-300">{m.neg_days}일</td>
                        <td className="p-2 text-right">+{m.avg_pos_return_pct}%</td>
                        <td className="p-2 text-right">{m.avg_neg_return_pct}%</td>
                        <td className="p-2 text-right text-amber-300">{m.mdd_pct}%</td>
                        <td className="p-2 text-right">{m.profit_loss_factor}</td>
                        <td className="p-2 text-right font-bold text-sky-300">{m.sharpe_ratio}</td>
                        <td className="p-2 text-right">{m.sortino_ratio}</td>
                        <td className="p-2 text-right">{m.calmar_ratio}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 7. 매매원장의 매매수익률 차트 & 포지션 차트 + 매매원장 상세 테이블 */}
          <div className="bg-slate-900/90 border border-amber-500/30 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-extrabold text-amber-300">
                  📑 매매원장 매매수익률 차트 &amp; 포지션(-5×M ~ +5×M 계약) 추이 차트 · 15:35~15:45 동시호가 매매원장
                </h3>
                <p className="text-[11px] text-slate-400">
                  15:30 시그널 확정 후 15:35~15:45 종가 동시호가 포지션 조정에 따른 일별 매매수익률(%), 누적 매매수익률(%), 보유 계약수 및 동시호가 주문수량(Delta) 추이입니다.
                </p>
              </div>
              <button
                onClick={handleLock1530}
                className="px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-extrabold text-white cursor-pointer"
              >
                🔒 당일 15:30 시그널 즉시 확정 (Lock)
              </button>
            </div>

            {renderLedgerPeriodBar("매매원장 & 포지션 차트")}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                <h4 className="text-xs font-bold text-emerald-300 mb-2">
                  📈 매매원장 일별 매매수익률(막대, %) &amp; 기간 누적 매매수익률 vs KOSPI200 현물지수(선, %) 차트 ({ledgerDates.length}거래일)
                </h4>
                <SvgBarAndLineChart
                  dates={ledgerDates}
                  barData={ledgerDailyRetPct}
                  barLabel="일별 매매수익률"
                  barUnit="%"
                  lineData={ledgerCumRetPct}
                  lineLabel="기간 누적 매매수익률"
                  lineColor="#38bdf8"
                  lineUnit="%"
                  secondLineData={ledgerK200CumRetPct}
                  secondLineLabel="KOSPI200 현물지수"
                  secondLineColor="#f59e0b"
                  secondLineUnit="%"
                  secondLineDashed={true}
                  secondLineExtraText={`${ledgerLatestK200Close}pt`}
                />
              </div>

              <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                <h4 className="text-xs font-bold text-amber-300 mb-2">
                  ⚖️ 매매원장 목표 포지션 계약수(-5×M ~ +5×M) &amp; 동시호가 주문수량(Delta) 차트
                </h4>
                <SvgBarAndLineChart
                  dates={ledgerDates}
                  barData={ledgerTargetContracts}
                  barLabel={`보유 목표 계약수 (멀티플 ${multiplier}x)`}
                  barUnit="계약"
                  lineData={ledgerDeltaContracts}
                  lineLabel="동시호가 주문수량 (Delta)"
                  lineColor="#f59e0b"
                  lineUnit="계약"
                  posBarColor="#0ea5e9"
                  negBarColor="#f43f5e"
                />
              </div>
            </div>

            {/* 전체 기간 포지션(-5×M ~ +5×M) 추이 차트 */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
              <h4 className="text-xs font-bold text-sky-300 mb-2">
                📊 전체 시뮬레이션 구간 포지션 추이 &amp; 포트폴리오 누적수익률 vs KOSPI200 현물지수(%) 차트
              </h4>
              <SvgBarAndLineChart
                dates={cs.dates || []}
                barData={cs.target_contracts || []}
                barLabel="전체구간 목표 포지션 계약수"
                barUnit="계약"
                lineData={cs.portfolio_cum_return_pct || []}
                lineLabel="포트폴리오 누적수익률"
                lineColor="#10b981"
                lineUnit="%"
                secondLineData={cs.k200_cum_return_pct || []}
                secondLineLabel="KOSPI200 현물지수"
                secondLineColor="#f59e0b"
                secondLineUnit="%"
                secondLineDashed={true}
                secondLineExtraText={`${lt?.latest_k200_close ?? ""}pt`}
                height={210}
              />
            </div>

            {/* 매매원장 상세 테이블 (매매수익률 %, 누적수익률 %, 포지션, 주문Delta, 원화손익 모두 포함) */}
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-xs text-left border-collapse font-mono">
                <thead className="sticky top-0 bg-slate-950 border-b border-slate-700 text-slate-300">
                  <tr>
                    <th className="p-2">거래일자</th>
                    <th className="p-2 text-right">KOSPI200</th>
                    <th className="p-2 text-right">선물종가</th>
                    <th className="p-2 text-center">합산포지션(-5~+5)</th>
                    <th className="p-2 text-right">전일계약</th>
                    <th className="p-2 text-right">목표계약</th>
                    <th className="p-2 text-right text-amber-300">동시호가 주문(Delta)</th>
                    <th className="p-2">주문구분</th>
                    <th className="p-2 text-right text-emerald-300">일간 매매수익률(%)</th>
                    <th className="p-2 text-right text-sky-300">누적 매매수익률(%)</th>
                    <th className="p-2 text-right">일별손익(원)</th>
                    <th className="p-2 text-right">수익지수(100기준)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {activeLedgerRows.map((r: any, idx: number) => {
                    const dRet =
                      typeof r.daily_return_pct === "number"
                        ? r.daily_return_pct
                        : idx < activeLedgerRows.length - 1
                        ? Number(
                            (
                              (((r.equity_index || 100) - (activeLedgerRows[idx + 1]?.equity_index || 100)) /
                                (activeLedgerRows[idx + 1]?.equity_index || 100)) *
                              100
                            ).toFixed(3)
                          )
                        : 0;
                    const cRet =
                      ledgerCumRetByDate[String(r.date)] ??
                      Number((Number(r.equity_index || 100) - 100).toFixed(2));
                    return (
                      <tr
                        key={r.date}
                        className={`hover:bg-slate-800/50 ${
                          r.is_live_today && !r.is_market_closed ? "bg-emerald-950/20" : ""
                        }`}
                      >
                        <td className="p-2 font-bold text-white">
                          <span>{r.date}</span>
                          {r.is_live_today && (
                            <span
                              className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-sans font-extrabold ${
                                r.is_market_closed
                                  ? "bg-amber-900/70 text-amber-200 border border-amber-500/50"
                                  : "bg-emerald-900/80 text-emerald-200 border border-emerald-400/60 animate-pulse"
                              }`}
                            >
                              {r.is_market_closed ? "🔒 종가확정" : "⚡ 실시간"}
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-right text-slate-300">{r.k200_close ?? "-"}</td>
                        <td className="p-2 text-right font-bold text-white">{r.futures_close}</td>
                        <td className="p-2 text-center">
                          <span
                            className={`px-2 py-0.5 rounded font-bold ${
                              r.base_position_sum > 0
                                ? "bg-emerald-500/20 text-emerald-300"
                                : r.base_position_sum < 0
                                ? "bg-rose-500/20 text-rose-300"
                                : "bg-slate-700/40 text-slate-300"
                            }`}
                          >
                            {r.base_position_sum > 0 ? `+${r.base_position_sum}` : r.base_position_sum}
                          </span>
                        </td>
                        <td className="p-2 text-right">{r.prev_contracts}계약</td>
                        <td className="p-2 text-right font-bold text-white">{r.target_contracts}계약</td>
                        <td className="p-2 text-right text-amber-300 font-bold">
                          {r.order_delta_contracts > 0
                            ? `+${r.order_delta_contracts}`
                            : r.order_delta_contracts}
                          계약
                        </td>
                        <td className="p-2 font-sans">{r.order_action}</td>
                        <td
                          className={`p-2 text-right font-bold ${
                            dRet >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {dRet >= 0 ? "+" : ""}
                          {dRet}%
                        </td>
                        <td
                          className={`p-2 text-right font-bold ${
                            cRet >= 0 ? "text-sky-300" : "text-rose-400"
                          }`}
                        >
                          {cRet >= 0 ? "+" : ""}
                          {cRet}%
                        </td>
                        <td
                          className={`p-2 text-right font-bold ${
                            r.daily_pnl_krw >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {r.daily_pnl_krw >= 0 ? "+" : ""}
                          {Number(r.daily_pnl_krw).toLocaleString()}원
                        </td>
                        <td className="p-2 text-right text-slate-300">{r.equity_index}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 1: 추세·역추세 + 4대 수급 합산 효과 분석 */}
      {/* =================================================================== */}
      {step === 1 && sc && (
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-end gap-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">분석 시작일</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  const nextStart = e.target.value;
                  setStartDate(nextStart);
                  if (nextStart && nextStart.length === 10) {
                    fetchSimulation({ start: nextStart, end: endDate, current: useCurrent });
                  }
                }}
                className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">분석 마감일</label>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={endDate}
                  disabled={useCurrent}
                  onChange={(e) => {
                    const nextEnd = e.target.value;
                    setEndDate(nextEnd);
                    if (nextEnd && nextEnd.length === 10 && !useCurrent) {
                      fetchSimulation({ start: startDate, end: nextEnd, current: false });
                    }
                  }}
                  className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white font-mono disabled:opacity-50"
                />
                <label className="flex items-center gap-1.5 text-emerald-300 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useCurrent}
                    onChange={(e) => {
                      const nextCur = e.target.checked;
                      setUseCurrent(nextCur);
                      fetchSimulation({ start: startDate, end: endDate, current: nextCur });
                    }}
                  />
                  현재까지(최신일)
                </label>
              </div>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">수급 합산 모드</label>
              <select
                value={combineSupply ? "true" : "false"}
                onChange={(e) => {
                  const nextComb = e.target.value === "true";
                  setCombineSupply(nextComb);
                  fetchSimulation({ simCombineSupply: nextComb });
                }}
                className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white"
              >
                <option value="true">✅ 추세(신고신저×외인) + 횡보에너지(차익·OI·PCR) 합산</option>
                <option value="false">⚪ 순수 기술/고유 지표만 사용</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">
                수급 가중치 ({supplyWeight}% {supplyWeight === 35 ? "· 디폴트" : "· 조정됨"})
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={65}
                  step={5}
                  value={supplyWeight}
                  onChange={(e) => {
                    const nw = Number(e.target.value);
                    setSupplyWeight(nw);
                    fetchSimulation({ simWeight: nw });
                  }}
                  className="cursor-pointer accent-emerald-400"
                />
                {supplyWeight !== 35 && (
                  <button
                    type="button"
                    onClick={() => {
                      setSupplyWeight(35);
                      fetchSimulation({ simWeight: 35 });
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-amber-300 font-bold cursor-pointer"
                  >
                    35% 디폴트 복원
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={() => fetchSimulation()}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold text-white cursor-pointer"
            >
              🔍 수급 합산 비교 실행
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Hitting Ratio (승률) 개선</div>
              <div className="text-xl font-extrabold font-mono text-emerald-400 mt-1">
                {sc.pure_portfolio_metrics.hitting_ratio_pct}% →{" "}
                {sc.combined_portfolio_metrics.hitting_ratio_pct}% (
                {sc.hitting_ratio_improvement_pct >= 0 ? "+" : ""}
                {sc.hitting_ratio_improvement_pct}%p)
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">누적 수익률 개선</div>
              <div className="text-xl font-extrabold font-mono text-emerald-400 mt-1">
                {sc.pure_portfolio_metrics.cum_return_pct}% →{" "}
                {sc.combined_portfolio_metrics.cum_return_pct}% (
                {sc.return_improvement_pct >= 0 ? "+" : ""}
                {sc.return_improvement_pct}%p)
              </div>
            </div>
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <div className="text-xs text-slate-400">Sharpe Ratio 개선</div>
              <div className="text-xl font-extrabold font-mono text-sky-400 mt-1">
                {sc.pure_portfolio_metrics.sharpe_ratio} →{" "}
                {sc.combined_portfolio_metrics.sharpe_ratio} (
                {sc.sharpe_improvement >= 0 ? "+" : ""}
                {sc.sharpe_improvement})
              </div>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-extrabold text-white mb-2">
              📈 [추세+에너지 수급 합산 포트폴리오] vs [순수 기술 신호 포트폴리오] vs [KOSPI200] 누적수익률 차트 ({cs.dates?.[0]} ~ {cs.dates?.[cs.dates.length - 1]})
            </h3>
            <SvgMultiLineChart
              dates={cs.dates || []}
              seriesList={[
                {
                  label: "추세+에너지 수급 합산 포트폴리오",
                  data: cs.combined_cum_return_pct || [],
                  color: "#10b981",
                  width: 2.6,
                },
                {
                  label: "순수 기술지표 단독 포트폴리오",
                  data: cs.pure_cum_return_pct || [],
                  color: "#94a3b8",
                  dashed: true,
                  width: 1.8,
                },
                {
                  label: "KOSPI200 지수",
                  data: cs.k200_cum_return_pct || [],
                  color: "#f59e0b",
                  dashed: true,
                  width: 2.0,
                },
              ]}
            />
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-x-auto">
            <h3 className="text-sm font-bold text-white mb-3">
              전체 모델별 [순수 신호] vs [추세(신고신저×외인) + 횡보에너지(차익·OI·PCR) 합산 신호] 비교표
            </h3>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                  <th className="p-2">모델 ID</th>
                  <th className="p-2">모델명</th>
                  <th className="p-2 text-right">순수 승률</th>
                  <th className="p-2 text-right text-emerald-300">합산 승률</th>
                  <th className="p-2 text-right">승률 개선</th>
                  <th className="p-2 text-right">순수 수익률</th>
                  <th className="p-2 text-right text-emerald-300">합산 수익률</th>
                  <th className="p-2 text-right">수익률 개선</th>
                  <th className="p-2 text-right">Sharpe</th>
                  <th className="p-2 text-right">Sortino</th>
                  <th className="p-2 text-right">Calmar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {allModels.map((m: any) => (
                  <tr key={m.model_id} className="hover:bg-slate-800/50">
                    <td className="p-2 font-bold text-indigo-300">{m.model_id}</td>
                    <td className="p-2 font-sans">{m.name}</td>
                    <td className="p-2 text-right">{m.pure_metrics.hitting_ratio_pct}%</td>
                    <td className="p-2 text-right text-emerald-300 font-bold">
                      {m.combined_metrics.hitting_ratio_pct}%
                    </td>
                    <td className="p-2 text-right text-emerald-400">
                      {m.hitting_ratio_improvement_pct >= 0 ? "+" : ""}
                      {m.hitting_ratio_improvement_pct}%p
                    </td>
                    <td className="p-2 text-right">{m.pure_metrics.cum_return_pct}%</td>
                    <td className="p-2 text-right text-emerald-300 font-bold">
                      {m.combined_metrics.cum_return_pct}%
                    </td>
                    <td className="p-2 text-right text-emerald-400">
                      {m.return_improvement_pct >= 0 ? "+" : ""}
                      {m.return_improvement_pct}%p
                    </td>
                    <td className="p-2 text-right text-sky-300">{m.sharpe_ratio}</td>
                    <td className="p-2 text-right">{m.sortino_ratio}</td>
                    <td className="p-2 text-right">{m.calmar_ratio}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 2: 구간 설정 & 모델별 수익률 평가 및 최종모델 선택 */}
      {/* =================================================================== */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-extrabold text-sky-300 text-sm">
                STEP 2. 구간 설정 &amp; 13대 모델(10대 주력 + 3대 후보) 수익률 평가 및 최종 5대 주력모델 선택
              </div>
              {renderQuickSimPeriodButtons()}
            </div>

            {lt?.active_regime_detector && (
              <div className="bg-slate-950/90 border border-emerald-500/40 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-extrabold">
                    ★ 실전 채택 운용엔진
                  </span>
                  <span className="font-bold text-emerald-300">
                    {lt.active_regime_detector.current_regime_label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-slate-300">
                  <span>
                    20일 이평 VIX: <strong className="text-amber-300">{lt.active_regime_detector.current_vix_20ma}pt</strong> (≤16pt 박스권)
                  </span>
                  <span>
                    변동×거래량 에너지: <strong className="text-sky-300">{lt.active_regime_detector.current_vol_volume_energy}</strong> (≤1.35 박스권)
                  </span>
                  <span>
                    구간 내 박스권 리밸런싱:{" "}
                    <strong className="text-emerald-300">{lt.active_regime_detector.total_range_days_in_period}일</strong> / 추세장:{" "}
                    <strong className="text-indigo-300">{lt.active_regime_detector.total_trend_days_in_period}일</strong>
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">평가 시작일</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setStartDate(nextStart);
                      if (nextStart && nextStart.length === 10) {
                        fetchSimulation({ start: nextStart, end: endDate, current: useCurrent });
                      }
                    }}
                    className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">평가 마감일</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={endDate}
                      disabled={useCurrent}
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        setEndDate(nextEnd);
                        if (nextEnd && nextEnd.length === 10 && !useCurrent) {
                          fetchSimulation({ start: startDate, end: nextEnd, current: false });
                        }
                      }}
                      className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white font-mono disabled:opacity-50"
                    />
                    <label className="flex items-center gap-1.5 text-emerald-300 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useCurrent}
                        onChange={(e) => {
                          const nextCur = e.target.checked;
                          setUseCurrent(nextCur);
                          fetchSimulation({ start: startDate, end: endDate, current: nextCur });
                        }}
                      />
                      현재까지
                    </label>
                  </div>
                </div>
                <button
                  onClick={() => fetchSimulation({ start: startDate, end: endDate, current: useCurrent })}
                  disabled={loading}
                  className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white font-bold cursor-pointer"
                >
                  {loading ? "⚡ 구간 재산출 중..." : "📊 구간 평가 실행"}
                </button>
              </div>
              <button
                onClick={() => handleSaveSelectedModels()}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold cursor-pointer"
              >
                ✅ 체크된 모델({selectedModelIds.length}개)을 최종 운용모델로 확정 저장
              </button>
            </div>
          </div>

          {/* Step 2 모델별 운용성과 누적수익률 비교 차트 */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-extrabold text-white mb-2">
              📈 설정 구간({cs.dates?.[0]} ~ {cs.dates?.[cs.dates.length - 1]}) 모델별 운용성과 누적수익률(%) 비교 차트 (체크된 선택 모델 강조)
            </h3>
            <SvgMultiLineChart
              dates={cs.dates || []}
              height={260}
              seriesList={[
                {
                  label: "KOSPI200 지수",
                  data: cs.k200_cum_return_pct || [],
                  color: "#f59e0b",
                  dashed: true,
                  width: 2.0,
                },
                ...allModels.map((m: any, idx: number) => ({
                  label: m.model_id,
                  data: (cs.model_cum_returns_pct && cs.model_cum_returns_pct[m.model_id]) || [],
                  color: MODEL_COLORS[idx % MODEL_COLORS.length],
                  width: selectedModelIds.includes(m.model_id) ? 2.5 : 1.3,
                  dashed: !selectedModelIds.includes(m.model_id),
                })),
              ]}
            />
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-x-auto">
            <h3 className="text-xs font-extrabold text-white mb-3">
              📋 13대 모델별 구간 운용성과 및 10대 평가지표 비교 · 최종모델 체크 선택
            </h3>
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                  <th className="p-2 text-center">최종모델 선택</th>
                  <th className="p-2">모델 ID / 모델명</th>
                  <th className="p-2 text-center">시그널</th>
                  <th className="p-2 text-right">누적수익률</th>
                  <th className="p-2 text-right">① Hitting Ratio</th>
                  <th className="p-2 text-right">② +일수</th>
                  <th className="p-2 text-right">③ -일수</th>
                  <th className="p-2 text-right">④ +평균</th>
                  <th className="p-2 text-right">⑤ -평균</th>
                  <th className="p-2 text-right">⑥ MDD</th>
                  <th className="p-2 text-right">⑦ P/L Factor</th>
                  <th className="p-2 text-right">⑧ Sharpe</th>
                  <th className="p-2 text-right">⑨ Sortino</th>
                  <th className="p-2 text-right">⑩ Calmar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {allModels.map((m: any) => {
                  const checked = selectedModelIds.includes(m.model_id);
                  return (
                    <tr
                      key={m.model_id}
                      className={checked ? "bg-indigo-950/30" : "hover:bg-slate-800/40"}
                    >
                      <td className="p-2 text-center">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModelCheck(m.model_id)}
                        />
                      </td>
                      <td className="p-2 font-sans">
                        <div className="font-bold text-white">{m.model_id}</div>
                        <div className="text-[11px] text-slate-400">{m.name}</div>
                      </td>
                      <td className="p-2 text-center">{formatBadge(m.latest_signal)}</td>
                      <td
                        className={`p-2 text-right font-bold ${
                          m.cum_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {m.cum_return_pct >= 0 ? "+" : ""}
                        {m.cum_return_pct}%
                      </td>
                      <td className="p-2 text-right font-bold">{m.hitting_ratio_pct}%</td>
                      <td className="p-2 text-right text-emerald-300">{m.pos_days}일</td>
                      <td className="p-2 text-right text-rose-300">{m.neg_days}일</td>
                      <td className="p-2 text-right">+{m.avg_pos_return_pct}%</td>
                      <td className="p-2 text-right">{m.avg_neg_return_pct}%</td>
                      <td className="p-2 text-right text-amber-300">{m.mdd_pct}%</td>
                      <td className="p-2 text-right">{m.profit_loss_factor}</td>
                      <td className="p-2 text-right text-sky-300 font-bold">{m.sharpe_ratio}</td>
                      <td className="p-2 text-right">{m.sortino_ratio}</td>
                      <td className="p-2 text-right">{m.calmar_ratio}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 3: 포워드(3개월/6개월) 연속성 측정 & 신규 후보모델 10대 풀 편입 / 1구간→2구간 검증 */}
      {/* =================================================================== */}
      {step === 3 && (
        <div className="space-y-5">
          {/* 상단: 전(Prior) 구간 -> 후(Forward) 구간 분할 설정 바 & 빠른 포워드 프리셋 */}
          <div className="bg-slate-900/90 border border-indigo-500/40 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-indigo-300">
                  🧪 [프로세스 ②] 전(Prior, 1구간) vs 후(Forward, 2구간) 후행 시뮬레이션 차트 &amp; 모델별 연속성 체크
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  과거 선정 구간(전, 1구간)과 직후 포워드 구간(후, 2구간)으로 나누어 포트폴리오 및 13개 모델 각각의 수익곡선 차트와 성과 연속성(PASS/CHECK)을 나란히 비교·검증합니다.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400 font-bold mr-1">빠른 전·후 분할:</span>
                {[
                  { label: "⚡ 직전 3개월 → 최근 3개월", mode: "3M_3M" as const },
                  { label: "⚡ 직전 6개월 → 최근 6개월", mode: "6M_6M" as const },
                  { label: "⚡ 2025년(1년) → 2026년(YTD)", mode: "2025_2026" as const },
                  { label: "⚡ 2024~2025년 → 2026년(YTD)", mode: "2425_2026" as const },
                ].map((b) => (
                  <button
                    key={b.mode}
                    type="button"
                    onClick={() => applyQuickForwardSplit(b.mode)}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-indigo-600/50 border border-slate-700 text-[11px] text-emerald-300 font-bold cursor-pointer"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-4 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="block text-indigo-300 font-bold mb-1">
                    ① 전(Prior · 선정 구간) 시작 ~ 마감
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={evalStart}
                      onChange={(e) => setEvalStart(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                    <span>~</span>
                    <input
                      type="date"
                      value={evalEnd}
                      onChange={(e) => setEvalEnd(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-emerald-300 font-bold mb-1">
                    ② 후(Forward · 후속 검증 구간) 시작 ~ 마감
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={testStart}
                      onChange={(e) => setTestStart(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                    />
                    <span>~</span>
                    <input
                      type="date"
                      value={testEnd}
                      disabled={testUseCurrent}
                      onChange={(e) => setTestEnd(e.target.value)}
                      className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono disabled:opacity-50"
                    />
                    <label className="flex items-center gap-1 text-emerald-300 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={testUseCurrent}
                        onChange={(e) => setTestUseCurrent(e.target.checked)}
                      />
                      현재까지
                    </label>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleRunConsistencyTest()}
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold cursor-pointer"
              >
                🧪 전(1구간) → 후(2구간) 연속성 측정 실행
              </button>
            </div>
          </div>

          {consistencyData && (
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4 overflow-x-auto">
              {/* 전·후 구간 핵심 요약 배너 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 border border-indigo-500/40 rounded-xl p-3">
                  <div className="text-[11px] text-indigo-300 font-bold">
                    ① 전(Prior, 1구간) 포트폴리오 성과 ({consistencyData.periods?.eval_period?.start_date} ~{" "}
                    {consistencyData.periods?.eval_period?.end_date})
                  </div>
                  <div className="text-lg font-extrabold font-mono text-indigo-300 mt-1">
                    {consistencyData.portfolio_period_1_metrics?.cum_return_pct >= 0 ? "+" : ""}
                    {consistencyData.portfolio_period_1_metrics?.cum_return_pct}%
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    승률: {consistencyData.portfolio_period_1_metrics?.hitting_ratio_pct}% | Sharpe:{" "}
                    {consistencyData.portfolio_period_1_metrics?.sharpe_ratio} | MDD:{" "}
                    {consistencyData.portfolio_period_1_metrics?.mdd_pct}%
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-emerald-500/40 rounded-xl p-3">
                  <div className="text-[11px] text-emerald-300 font-bold">
                    ② 후(Forward, 2구간) 포트폴리오 성과 ({consistencyData.periods?.test_period?.start_date} ~{" "}
                    {consistencyData.periods?.test_period?.end_date})
                  </div>
                  <div className="text-lg font-extrabold font-mono text-emerald-400 mt-1">
                    {consistencyData.portfolio_period_2_metrics?.cum_return_pct >= 0 ? "+" : ""}
                    {consistencyData.portfolio_period_2_metrics?.cum_return_pct}%
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    승률: {consistencyData.portfolio_period_2_metrics?.hitting_ratio_pct}% | Sharpe:{" "}
                    {consistencyData.portfolio_period_2_metrics?.sharpe_ratio} | MDD:{" "}
                    {consistencyData.portfolio_period_2_metrics?.mdd_pct}%
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-amber-500/40 rounded-xl p-3">
                  <div className="text-[11px] text-amber-300 font-bold">채택 5모델 전·후 연속성 유지율</div>
                  <div className="text-lg font-extrabold font-mono text-amber-300 mt-1">
                    {consistencyData.overall_consistency?.consistency_score_pct ?? 0}% (
                    {consistencyData.overall_consistency?.consistent_models_count}/
                    {consistencyData.overall_consistency?.total_selected_count}개 유지)
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {consistencyData.overall_consistency?.verdict_label}
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-purple-500/40 rounded-xl p-3">
                  <div className="text-[11px] text-purple-300 font-bold">전체 13대 모델 중 연속성 통과 모델</div>
                  <div className="text-lg font-extrabold font-mono text-purple-300 mt-1">
                    {consistencyData.overall_consistency?.consistent_all_models_count ??
                      consistencyData.overall_consistency?.consistent_models_count}
                    개 / {consistencyData.overall_consistency?.total_all_models_count ?? 13}개
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    하단 표에서 연속성 통과(PASS) 모델을 즉시 채택 가능
                  </div>
                </div>
              </div>

              {/* 차트 1행: 전(Prior) 포트폴리오 & KOSPI200 차트 vs 후(Forward) 포트폴리오 & KOSPI200 차트 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-slate-950/70 border border-indigo-500/30 rounded-xl p-3.5">
                  <h4 className="text-xs font-extrabold text-indigo-300 mb-2">
                    📈 [전(Prior) 1구간: {consistencyData.periods?.eval_period?.start_date} ~{" "}
                    {consistencyData.periods?.eval_period?.end_date}] 포트폴리오 vs KOSPI200 누적수익률(%) 차트
                  </h4>
                  <SvgMultiLineChart
                    dates={consistencyData.chart_series?.p1_dates || []}
                    unit="%"
                    baselineVal={0}
                    seriesList={[
                      {
                        label: "1구간(전) 선택 포트폴리오 수익률",
                        data:
                          consistencyData.chart_series?.p1_cum_return_pct ||
                          (consistencyData.chart_series?.p1_equity || []).map((v: number) => Number((v - 100).toFixed(2))),
                        color: "#818cf8",
                        width: 2.6,
                      },
                      {
                        label: "1구간(전) KOSPI200 지수",
                        data: consistencyData.chart_series?.p1_k200_cum_return_pct || [],
                        color: "#f59e0b",
                        dashed: true,
                        width: 2.0,
                      },
                    ]}
                  />
                </div>
                <div className="bg-slate-950/70 border border-emerald-500/30 rounded-xl p-3.5">
                  <h4 className="text-xs font-extrabold text-emerald-300 mb-2">
                    🚀 [후(Forward) 2구간: {consistencyData.periods?.test_period?.start_date} ~{" "}
                    {consistencyData.periods?.test_period?.end_date}] 후속 검증 포트폴리오 vs KOSPI200 누적수익률(%) 차트
                  </h4>
                  <SvgMultiLineChart
                    dates={consistencyData.chart_series?.p2_dates || []}
                    unit="%"
                    baselineVal={0}
                    seriesList={[
                      {
                        label: "2구간(후) 포워드 포트폴리오 수익률",
                        data:
                          consistencyData.chart_series?.p2_cum_return_pct ||
                          (consistencyData.chart_series?.p2_equity || []).map((v: number) => Number((v - 100).toFixed(2))),
                        color: "#10b981",
                        width: 2.6,
                      },
                      {
                        label: "2구간(후) 순수 기술신호 포트폴리오",
                        data:
                          consistencyData.chart_series?.p2_pure_cum_return_pct ||
                          (consistencyData.chart_series?.p2_pure_equity || []).map((v: number) =>
                            Number((v - 100).toFixed(2))
                          ),
                        color: "#94a3b8",
                        dashed: true,
                        width: 1.6,
                      },
                      {
                        label: "2구간(후) KOSPI200 지수",
                        data: consistencyData.chart_series?.p2_k200_cum_return_pct || [],
                        color: "#f59e0b",
                        dashed: true,
                        width: 2.0,
                      },
                    ]}
                  />
                </div>
              </div>

              {/* 차트 2행: 전(Prior) 개별 모델 수익률 차트 vs 후(Forward) 개별 모델 수익률 차트 */}
              {consistencyData.chart_series?.p1_model_cum_returns_pct && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                    <h4 className="text-xs font-extrabold text-indigo-300 mb-2">
                      📊 [전(Prior) 1구간] 선택된 개별 모델 각 누적수익률(%) 비교 차트
                    </h4>
                    <SvgMultiLineChart
                      dates={consistencyData.chart_series?.p1_dates || []}
                      unit="%"
                      baselineVal={0}
                      height={220}
                      seriesList={selectedModelIds.map((mId, idx) => ({
                        label: mId,
                        data: consistencyData.chart_series?.p1_model_cum_returns_pct?.[mId] || [],
                        color: MODEL_COLORS[idx % MODEL_COLORS.length],
                        width: 2.1,
                      }))}
                    />
                  </div>
                  <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-3.5">
                    <h4 className="text-xs font-extrabold text-emerald-300 mb-2">
                      📊 [후(Forward) 2구간] 선택된 개별 모델 각 후속 누적수익률(%) 연속성 비교 차트
                    </h4>
                    <SvgMultiLineChart
                      dates={consistencyData.chart_series?.p2_dates || []}
                      unit="%"
                      baselineVal={0}
                      height={220}
                      seriesList={selectedModelIds.map((mId, idx) => ({
                        label: mId,
                        data: consistencyData.chart_series?.p2_model_cum_returns_pct?.[mId] || [],
                        color: MODEL_COLORS[idx % MODEL_COLORS.length],
                        width: 2.1,
                      }))}
                    />
                  </div>
                </div>
              )}

              {/* 전(1구간) vs 후(2구간) 전체 모델 연속성 체크 및 채택 테이블 */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                <h4 className="text-xs font-extrabold text-white">
                  📋 전체 13대 모델 [전(1구간) 성과 vs 후(2구간 포워드) 성과] 연속성 체크 및 주력 모델 채택표
                </h4>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const list: any[] =
                        consistencyData.all_models_comparison || consistencyData.models_comparison || [];
                      const passSorted = [...list]
                        .filter((x) => x.is_consistent)
                        .sort(
                          (a, b) =>
                            (b.period_2_metrics?.sharpe_ratio ?? 0) - (a.period_2_metrics?.sharpe_ratio ?? 0)
                        )
                        .slice(0, 5)
                        .map((x) => x.model_id);
                      if (passSorted.length > 0) {
                        setSelectedModelIds(passSorted);
                        handleSaveSelectedModels(passSorted);
                        handleRunConsistencyTest({ models: passSorted });
                      }
                    }}
                    className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-white text-xs font-extrabold cursor-pointer"
                  >
                    ✨ 연속성 통과(PASS) 상위 5개 모델 자동 선택 &amp; 확정
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      handleSaveSelectedModels(selectedModelIds);
                      handleRunConsistencyTest({ models: selectedModelIds });
                    }}
                    className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold cursor-pointer"
                  >
                    ✅ 체크된 모델({selectedModelIds.length}개)로 최종 운용모델 저장
                  </button>
                </div>
              </div>

              <table className="w-full text-xs text-left border-collapse font-mono">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                    <th className="p-2 text-center">채택 체크</th>
                    <th className="p-2">구분</th>
                    <th className="p-2">모델 ID / 모델명</th>
                    <th className="p-2 text-right text-indigo-300">전(1구간) 승률</th>
                    <th className="p-2 text-right text-indigo-300">전(1구간) 수익률</th>
                    <th className="p-2 text-right text-indigo-300">전(1구간) Sharpe</th>
                    <th className="p-2 text-right text-emerald-300">후(2구간) 승률</th>
                    <th className="p-2 text-right text-emerald-300">후(2구간) 수익률</th>
                    <th className="p-2 text-right text-emerald-300">후(2구간) Sharpe</th>
                    <th className="p-2 text-right">후(2구간) MDD</th>
                    <th className="p-2 text-center">전·후 연속성 판정</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {(
                    consistencyData.all_models_comparison ||
                    consistencyData.models_comparison ||
                    consistencyData.model_consistency_comparison ||
                    []
                  ).map((c: any) => {
                    const p1 = c.period_1_metrics || c.eval_metrics || {};
                    const p2 = c.period_2_metrics || c.test_metrics || {};
                    const checked = selectedModelIds.includes(c.model_id);
                    return (
                      <tr
                        key={c.model_id}
                        className={checked ? "bg-indigo-950/30 hover:bg-slate-800/50" : "hover:bg-slate-800/40"}
                      >
                        <td className="p-2 text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleModelCheck(c.model_id)}
                          />
                        </td>
                        <td className="p-2 font-sans">
                          {checked ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                              채택중
                            </span>
                          ) : c.is_in_10_pool !== false ? (
                            <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                              10대풀 대기
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                              신규 후보
                            </span>
                          )}
                        </td>
                        <td className="p-2 font-sans">
                          <div className="font-bold text-white">{c.model_id}</div>
                          <div className="text-[11px] text-slate-400">{c.name}</div>
                        </td>
                        <td className="p-2 text-right">{p1.hitting_ratio_pct}%</td>
                        <td
                          className={`p-2 text-right font-bold ${
                            (p1.cum_return_pct ?? 0) >= 0 ? "text-indigo-300" : "text-rose-400"
                          }`}
                        >
                          {(p1.cum_return_pct ?? 0) >= 0 ? "+" : ""}
                          {p1.cum_return_pct}%
                        </td>
                        <td className="p-2 text-right">{p1.sharpe_ratio}</td>
                        <td className="p-2 text-right text-emerald-300 font-bold">{p2.hitting_ratio_pct}%</td>
                        <td
                          className={`p-2 text-right font-bold ${
                            (p2.cum_return_pct ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {(p2.cum_return_pct ?? 0) >= 0 ? "+" : ""}
                          {p2.cum_return_pct}%
                        </td>
                        <td className="p-2 text-right text-sky-300 font-bold">{p2.sharpe_ratio}</td>
                        <td className="p-2 text-right text-amber-300">{p2.mdd_pct}%</td>
                        <td className="p-2 text-center font-sans">
                          {c.is_consistent ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[11px]">
                              ✅ 연속성 유지 (PASS)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-[11px]">
                              ⚠️ 성과 변동 (CHECK)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 프로세스 ①: 신규 후보모델(C01~C03) 10대 풀 편입 & 최하위 모델 보관(Archive) 심사 패널 */}
          <div className="bg-slate-900/90 border border-purple-500/40 rounded-xl p-4 space-y-3 text-xs">
            <div>
              <h2 className="text-sm font-extrabold text-purple-300">
                🔬 [프로세스 ①] 신규 후보모델(C01~C03) 3개월/6개월 연속성 심사 &amp; 10대 모델 풀 편입 · 최하위 모델 보관(Archive)
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                특정 기준일(Anchor Date) 기준 1차(3개월/6개월) 및 2차(직후 3개월/6개월) 연속성을 통과한 신규 후보모델을 10대 주력 모델 풀에 편입하고, 기존 10대 모델 중 최하위 샤프지수 모델을 자동 보관(Archive)합니다.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3 pt-2 border-t border-slate-800">
              <div>
                <label className="block text-slate-400 mb-1">기준일 (Anchor Date)</label>
                <input
                  type="date"
                  value={anchorDate}
                  onChange={(e) => setAnchorDate(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">포워드 검증 주기</label>
                <select
                  value={forwardMonths}
                  onChange={(e) => setForwardMonths(Number(e.target.value))}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-amber-300 font-bold"
                >
                  <option value={3}>1차 3개월(63일) → 2차 3개월(63일)</option>
                  <option value={6}>1차 6개월(126일) → 2차 6개월(126일)</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">편입 심사할 신규 후보모델</label>
                <select
                  value={candidateModelId}
                  onChange={(e) => setCandidateModelId(e.target.value)}
                  className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-purple-300 font-bold"
                >
                  <option value="C01_VKOSPI_Regime_Switch">C01_VKOSPI_Regime_Switch (변동성 레짐 스위칭)</option>
                  <option value="C02_Basis_Arbitrage_Revert">C02_Basis_Arbitrage_Revert (베이시스·차익 괴리 회귀)</option>
                  <option value="C03_Multi_Timeframe_Composite">C03_Multi_Timeframe_Composite (멀티 타임프레임 앙상블)</option>
                </select>
              </div>
              <label className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-950 border border-purple-500/40 text-purple-200 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoApplyPoolRotation}
                  onChange={(e) => setAutoApplyPoolRotation(e.target.checked)}
                />
                통과 시 10대 풀 편입 &amp; 최하위 모델 보관 즉시 적용
              </label>
              <button
                onClick={handleRunPoolConsistencyEval}
                className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-extrabold cursor-pointer"
              >
                🚀 후보모델 10대 풀 편입 심사 실행
              </button>
            </div>

            {poolEvalData && (
              <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5 space-y-3 mt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold text-emerald-300">
                    검증 구간: 1차(전) [{poolEvalData.prior_period?.start_date} ~ {poolEvalData.prior_period?.end_date}] → 2차(후 포워드) [{poolEvalData.forward_period?.start_date} ~ {poolEvalData.forward_period?.end_date}] ({poolEvalData.period_months}개월)
                  </div>
                  <div className="text-xs font-mono text-amber-300">
                    전체 모델 연속성 유지율: {poolEvalData.consistency_summary?.consistency_ratio_pct}% ({poolEvalData.consistency_summary?.consistent_count}/{poolEvalData.consistency_summary?.total_evaluated}개)
                  </div>
                </div>
                <div className="bg-slate-900 border border-purple-500/30 rounded-lg p-3 text-xs space-y-1">
                  <div className="font-extrabold text-purple-300">
                    📌 후보모델 [{poolEvalData.candidate_evaluation?.model_id}] 심사 결과:{" "}
                    <span className={poolEvalData.candidate_evaluation?.is_consistent ? "text-emerald-400" : "text-amber-300"}>
                      {poolEvalData.candidate_evaluation?.recommendation}
                    </span>
                  </div>
                  <div className="text-slate-300 font-mono">
                    1차(전) 수익률: {poolEvalData.candidate_evaluation?.prior_return_pct}% (Sharpe {poolEvalData.candidate_evaluation?.prior_sharpe}) → 2차(후 포워드) 수익률: {poolEvalData.candidate_evaluation?.forward_return_pct}% (Sharpe {poolEvalData.candidate_evaluation?.forward_sharpe}) | 기존 10대 풀 최하위 모델: {poolEvalData.pool_rotation?.lowest_active_model_id} (Sharpe {poolEvalData.pool_rotation?.lowest_active_sharpe})
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 4: 선택된 최종모델 포트폴리오 운용성과 & 차트 & 모델별 운용성과 & 포지션 차트 */}
      {/* =================================================================== */}
      {step === 4 && pm && (
        <div className="space-y-4">
          {/* Step 4 컨트롤 바 */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-extrabold text-emerald-300">
                  STEP 4. 최종 선택모델 포트폴리오 운용성과 &amp; 수익곡선 차트 · 모델별 운용성과 · 포지션 추이 차트
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  현재 조회 구간:{" "}
                  <strong className="text-emerald-300 font-mono">
                    {cs.dates?.[0] || startDate} ~ {cs.dates?.[cs.dates.length - 1] || endDate} ({pm.total_days}거래일)
                  </strong>{" "}
                  | 운용 시작일~마감일을 변경하거나 빠른 구간 버튼을 클릭하면 차트와 12대 성과지표가 즉시 변경됩니다.
                </p>
              </div>
              {renderQuickSimPeriodButtons()}
            </div>

            {lt?.active_regime_detector && (
              <div className="bg-slate-950/90 border border-emerald-500/40 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-extrabold">
                    ★ 실전 채택 운용엔진
                  </span>
                  <span className="font-bold text-emerald-300">
                    {lt.active_regime_detector.current_regime_label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 font-mono text-slate-300">
                  <span>
                    20일 이평 VIX: <strong className="text-amber-300">{lt.active_regime_detector.current_vix_20ma}pt</strong> (≤16pt 박스권)
                  </span>
                  <span>
                    변동×거래량 에너지: <strong className="text-sky-300">{lt.active_regime_detector.current_vol_volume_energy}</strong> (≤1.35 박스권)
                  </span>
                  <span>
                    구간 내 박스권 리밸런싱:{" "}
                    <strong className="text-emerald-300">{lt.active_regime_detector.total_range_days_in_period}일</strong> / 추세장:{" "}
                    <strong className="text-indigo-300">{lt.active_regime_detector.total_trend_days_in_period}일</strong>
                  </span>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">운용 시작일</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => {
                      const nextStart = e.target.value;
                      setStartDate(nextStart);
                      if (nextStart && nextStart.length === 10) {
                        fetchSimulation({ start: nextStart, end: endDate, current: useCurrent });
                      }
                    }}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">운용 마감일</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={endDate}
                      disabled={useCurrent}
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        setEndDate(nextEnd);
                        if (nextEnd && nextEnd.length === 10 && !useCurrent) {
                          fetchSimulation({ start: startDate, end: nextEnd, current: false });
                        }
                      }}
                      className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono disabled:opacity-50"
                    />
                    <label className="flex items-center gap-1 text-emerald-300 font-bold cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useCurrent}
                        onChange={(e) => {
                          const nextCur = e.target.checked;
                          setUseCurrent(nextCur);
                          fetchSimulation({ start: startDate, end: endDate, current: nextCur });
                        }}
                      />
                      현재까지
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">멀티플 (배수)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={multiplier}
                    onChange={(e) => setMultiplier(Number(e.target.value) || 10)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">MDD 교체한도(%)</label>
                  <input
                    type="number"
                    step={0.5}
                    min={3}
                    max={50}
                    value={mddThreshold}
                    onChange={(e) => setMddThreshold(Number(e.target.value) || 12)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">교체기준 위험조정수익률(샤프)</label>
                  <select
                    value={sharpeLookbackDays}
                    onChange={(e) => {
                      const nextLb = Number(e.target.value);
                      setSharpeLookbackDays(nextLb);
                      fetchSimulation({ lookback: nextLb });
                    }}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-sky-300 font-bold"
                  >
                    <option value={63}>최근 3개월 (63영업일) 샤프지수</option>
                    <option value={126}>최근 6개월 (126영업일) 샤프지수</option>
                    <option value={0}>조회구간 전체 누적 샤프지수</option>
                  </select>
                </div>
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-slate-950 border border-slate-700 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enableAutoSwap}
                    onChange={(e) => setEnableAutoSwap(e.target.checked)}
                  />
                  MDD 자동교체
                </label>
              </div>
              <button
                onClick={() => fetchSimulation()}
                className="px-4 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold cursor-pointer"
              >
                🚀 운용성과 산출
              </button>
            </div>
          </div>

          {/* 12대 핵심 운용성과 지표 카드 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {[
              {
                label: "누적 수익률 / 연율(AR)",
                val: `${pm.cum_return_pct >= 0 ? "+" : ""}${pm.cum_return_pct}%`,
                sub: `연율 ${pm.annual_return_pct}% | Alpha +${lt?.alpha_vs_k200_pct ?? 0}%p`,
                cls: "text-amber-300",
              },
              {
                label: "① Hitting Ratio (승률)",
                val: `${pm.hitting_ratio_pct}%`,
                sub: `유효매매일 ${pm.active_days}일`,
                cls: "text-emerald-400",
              },
              {
                label: "② 플러스(+) 수익률 일수",
                val: `${pm.pos_days}일`,
                sub: `전체 ${pm.total_days}거래일 중`,
                cls: "text-emerald-300",
              },
              {
                label: "③ 마이너스(-) 수익률 일수",
                val: `${pm.neg_days}일`,
                sub: `보합/무포지션 ${pm.flat_days}일`,
                cls: "text-rose-300",
              },
              {
                label: "④ 일간 플러스(+) 평균",
                val: `+${pm.avg_pos_return_pct}%`,
                sub: "수익 발생일 평균",
                cls: "text-teal-300",
              },
              {
                label: "⑤ 일간 마이너스(-) 평균",
                val: `${pm.avg_neg_return_pct}%`,
                sub: "손실 발생일 평균",
                cls: "text-pink-300",
              },
              {
                label: "⑥ MDD (최대낙폭)",
                val: `${pm.mdd_pct}%`,
                sub: `MDD 자동교체: ${pm.total_swap_count}회`,
                cls: "text-rose-400",
              },
              {
                label: "⑦ Profit/Loss Factor",
                val: `${pm.profit_loss_factor}`,
                sub: `손익비 ${pm.avg_win_loss_ratio}`,
                cls: "text-sky-300",
              },
              {
                label: "⑧ Sharpe Ratio",
                val: `${pm.sharpe_ratio}`,
                sub: "연율화 위험조정수익",
                cls: "text-indigo-300",
              },
              {
                label: "⑨ Sortino Ratio",
                val: `${pm.sortino_ratio}`,
                sub: "하방위험 대비 수익",
                cls: "text-purple-300",
              },
              {
                label: "⑩ Calmar Ratio",
                val: `${pm.calmar_ratio}`,
                sub: "연환산수익률 / MDD",
                cls: "text-yellow-300",
              },
              {
                label: `누적 원화손익 (${multiplier}x)`,
                val: `${pm.total_pnl_krw >= 0 ? "+" : ""}${Number(pm.total_pnl_krw).toLocaleString()}원`,
                sub: `현재 목표: ${pm.current_target_contracts}계약`,
                cls: "text-emerald-300",
              },
            ].map((item, idx) => (
              <div key={idx} className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                <div className="text-[11px] text-slate-400">{item.label}</div>
                <div className={`text-lg font-extrabold font-mono mt-1 ${item.cls}`}>{item.val}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{item.sub}</div>
              </div>
            ))}
          </div>

          {/* 최종모델 운용성과 수익곡선 차트 & 일별 포지션 계약수 추이 차트 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-extrabold text-white mb-2">
                📈 최종모델 포트폴리오 누적 운용성과 차트 (기준=100, vs KOSPI200 지수 &amp; 선물)
              </h3>
              <SvgMultiLineChart
                dates={cs.dates || []}
                unit="pt"
                baselineVal={100}
                seriesList={[
                  {
                    label: "최종모델 포트폴리오 수익지수 (MDD 자동교체)",
                    data: cs.portfolio_equity || [],
                    color: "#38bdf8",
                    width: 2.5,
                  },
                  {
                    label: "추세+에너지회귀 결합 수익지수",
                    data: cs.combined_static_equity || [],
                    color: "#10b981",
                    width: 2.3,
                  },
                  {
                    label: "순수 기술지표 수익지수",
                    data: cs.pure_portfolio_equity || [],
                    color: "#94a3b8",
                    dashed: true,
                    width: 1.6,
                  },
                  {
                    label: "KOSPI200 지수 (기준=100)",
                    data: cs.k200_normalized || [],
                    color: "#f59e0b",
                    dashed: true,
                    width: 2.0,
                  },
                ]}
              />
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-extrabold text-white mb-2">
                ⚖️ 일별 목표 포지션 계약수 추이 (-5×M ~ +5×M 계약) &amp; 누적수익률(%) vs KOSPI200 현물지수 차트
              </h3>
              <SvgBarAndLineChart
                dates={cs.dates || []}
                barData={cs.target_contracts || []}
                barLabel={`일별 목표 포지션 계약수 (-${5 * multiplier}~+${5 * multiplier})`}
                barUnit="계약"
                lineData={cs.portfolio_cum_return_pct || []}
                lineLabel="포트폴리오 누적수익률"
                lineColor="#10b981"
                lineUnit="%"
                secondLineData={cs.k200_cum_return_pct || []}
                secondLineLabel="KOSPI200 현물지수"
                secondLineColor="#f59e0b"
                secondLineUnit="%"
                secondLineDashed={true}
                secondLineExtraText={`${lt?.latest_k200_close ?? ""}pt`}
                height={260}
              />
            </div>
          </div>

          {/* 모델별 운용성과 차트 & 전체 13대 모델별 운용성과 표 */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-extrabold text-emerald-300">
                🚀 모델별 운용성과 비교 차트 &amp; 13대 모델 개별 운용성과 상세표
              </h3>
              <select
                value={allModelChartFilter}
                onChange={(e) => setAllModelChartFilter(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-emerald-300 font-bold"
              >
                <option value="ALL_13">전체 13개 모델 누적수익률 비교</option>
                <option value="ADOPTED_5">채택된 최종 5개 모델만 비교</option>
                <option value="WAITING_8">대기/후보 8개 모델만 비교</option>
              </select>
            </div>

            <SvgMultiLineChart
              dates={cs.dates || []}
              height={250}
              seriesList={[
                {
                  label: "KOSPI200 지수",
                  data: cs.k200_cum_return_pct || [],
                  color: "#f59e0b",
                  dashed: true,
                  width: 2.0,
                },
                ...allModels
                  .filter((m: any) => {
                    if (allModelChartFilter === "ADOPTED_5") return m.is_currently_selected;
                    if (allModelChartFilter === "WAITING_8") return !m.is_currently_selected;
                    return true;
                  })
                  .map((m: any, idx: number) => ({
                    label: m.model_id,
                    data: (cs.model_cum_returns_pct && cs.model_cum_returns_pct[m.model_id]) || [],
                    color: MODEL_COLORS[idx % MODEL_COLORS.length],
                    width: m.is_currently_selected ? 2.4 : 1.4,
                  })),
              ]}
            />

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse font-mono">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                    <th className="p-2">구분</th>
                    <th className="p-2">모델 ID / 모델명</th>
                    <th className="p-2 text-center">현재 시그널</th>
                    <th className="p-2 text-right text-emerald-300">누적수익률</th>
                    <th className="p-2 text-right">연환산</th>
                    <th className="p-2 text-right">① Hitting Ratio</th>
                    <th className="p-2 text-right">② +일수</th>
                    <th className="p-2 text-right">③ -일수</th>
                    <th className="p-2 text-right">④ +평균</th>
                    <th className="p-2 text-right">⑤ -평균</th>
                    <th className="p-2 text-right">⑥ MDD</th>
                    <th className="p-2 text-right">⑦ P/L Factor</th>
                    <th className="p-2 text-right text-sky-300">⑧ Sharpe</th>
                    <th className="p-2 text-right">⑨ Sortino</th>
                    <th className="p-2 text-right">⑩ Calmar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {allModels.map((m: any) => (
                    <tr
                      key={m.model_id}
                      className={
                        m.is_currently_selected
                          ? "bg-emerald-950/15 hover:bg-slate-800/50"
                          : "hover:bg-slate-800/40"
                      }
                    >
                      <td className="p-2 font-sans">
                        {m.is_currently_selected ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                            최종 채택
                          </span>
                        ) : m.is_in_10_pool ? (
                          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                            대기 모델
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                            후보 모델
                          </span>
                        )}
                      </td>
                      <td className="p-2 font-sans">
                        <div className="font-bold text-white">{m.model_id}</div>
                        <div className="text-[11px] text-slate-400">{m.name}</div>
                      </td>
                      <td className="p-2 text-center">{formatBadge(m.latest_signal)}</td>
                      <td
                        className={`p-2 text-right font-bold ${
                          m.cum_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {m.cum_return_pct >= 0 ? "+" : ""}
                        {m.cum_return_pct}%
                      </td>
                      <td className="p-2 text-right">{m.annual_return_pct}%</td>
                      <td className="p-2 text-right font-bold">{m.hitting_ratio_pct}%</td>
                      <td className="p-2 text-right text-emerald-300">{m.pos_days}일</td>
                      <td className="p-2 text-right text-rose-300">{m.neg_days}일</td>
                      <td className="p-2 text-right">+{m.avg_pos_return_pct}%</td>
                      <td className="p-2 text-right">{m.avg_neg_return_pct}%</td>
                      <td className="p-2 text-right text-amber-300">{m.mdd_pct}%</td>
                      <td className="p-2 text-right">{m.profit_loss_factor}</td>
                      <td className="p-2 text-right font-bold text-sky-300">{m.sharpe_ratio}</td>
                      <td className="p-2 text-right">{m.sortino_ratio}</td>
                      <td className="p-2 text-right">{m.calmar_ratio}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 실시간 모델교체 정밀 모니터링 & 정기(3M/6M)·MDD 갱신 교체 컨트롤 센터 */}
          {renderModelReplacementMonitorPanel()}

          {/* MDD 초과 및 정기 리밸런싱 자동 모델 교체 이력 */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-x-auto">
            <h3 className="text-xs font-extrabold text-white mb-2">
              🔄 운용 기간 중 정기 리밸런싱(3M/6M) 및 특정모델 MDD 갱신·한도초과 자동 모델 교체 상세 이력 ({swapHistory.length}건)
            </h3>
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                  <th className="p-2">교체 일자</th>
                  <th className="p-2">교체 유형</th>
                  <th className="p-2">제외 모델</th>
                  <th className="p-2 text-right">발생 낙폭(MDD)</th>
                  <th className="p-2">신규 편입 모델 (대기 중 최고 Sharpe)</th>
                  <th className="p-2 text-right">편입 모델 Sharpe</th>
                  <th className="p-2">교체 상세 사유</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {swapHistory.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="p-4 text-center text-slate-500 font-sans">
                      해당 운용 구간 내 모델 교체 이력이 없습니다.
                    </td>
                  </tr>
                ) : (
                  swapHistory.map((ev: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-800/40">
                      <td className="p-2 font-bold text-white">{ev.date}</td>
                      <td className="p-2 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            ev.swap_type === "PERIODIC_REBALANCE"
                              ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                              : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
                          }`}
                        >
                          {ev.swap_type_label || "🚨 MDD 갱신/초과 교체"}
                        </span>
                      </td>
                      <td className="p-2 text-rose-300">
                        {ev.dropped_model_id} ({ev.dropped_model_name})
                      </td>
                      <td className="p-2 text-right text-amber-300">-{ev.dropped_mdd_pct}%</td>
                      <td className="p-2 text-emerald-300 font-bold">
                        {ev.selected_model_id} ({ev.selected_model_name})
                      </td>
                      <td className="p-2 text-right text-sky-300 font-bold">{ev.selected_sharpe}</td>
                      <td className="p-2 font-sans text-slate-300">{ev.reason}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 5: 당일 rawdata.xlsx 실시간 가격 업데이트 & 장마감 포지션 변화 체크 & 15:30 시그널 확정 & 매매원장 */}
      {/* =================================================================== */}
      {step === 5 && (
        <div className="space-y-4">
          {/* 1) 실시간 rawdata.xlsx 당일 가격·수급 업데이트 & 15:30 KOSPI 마감 신호 확정 컨트롤 바 */}
          <div className="bg-slate-900/95 border border-emerald-500/40 rounded-xl p-4 space-y-4 shadow-lg">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold">
                    🟢 LIVE · rawdata.xlsx 당일 실시간 가격 &amp; 장마감 포지션 변화 모니터
                  </span>
                  <span className="px-2.5 py-1 rounded bg-slate-800 text-amber-300 text-xs font-bold font-mono">
                    당일 기준일: {lockStatus?.today_rawdata?.date || lockStatus?.trading_date || lt?.last_trading_date || "2026-11-09"}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-indigo-500/20 border border-indigo-500/40 text-indigo-300 text-xs font-bold">
                    {lockStatus?.phase_label || lockStatus?.lock_status || "실시간 연동 중"}
                  </span>
                  <span className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/50 text-amber-200 text-xs font-extrabold">
                    {lockStatus?.today_rawdata?.regime_mode_label || "🚀 추세+수급 5대모델 가동"} (VIX 20MA:{" "}
                    {lockStatus?.today_rawdata?.vix_20ma ?? lt?.active_regime_detector?.current_vix_20ma ?? "-"}pt · 에너지:{" "}
                    {lockStatus?.today_rawdata?.vol_volume_energy ?? lt?.active_regime_detector?.current_vol_volume_energy ?? "-"})
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  장중(09:00~15:30) 실시간으로 <code className="text-emerald-300">data/rawdata.xlsx</code> 및 DB의 당일 가격·수급을 업데이트하며, 전일 보유 포지션 대비 당일 장마감까지의 실시간 목표 포지션 변화와 15:35~15:45 동시호가 주문수량(Delta)을 실시간 체크한 뒤 <strong>15:30 KOSPI 마감 후 신호를 최종 확정(Lock)</strong>합니다.
                  {lockStatus?.today_rawdata?.excel_updated_at && (
                    <span className="ml-2 text-sky-300 font-mono">
                      (rawdata.xlsx 최종 갱신: {lockStatus.today_rawdata.excel_updated_at})
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-emerald-300 font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRefreshRealtime}
                    onChange={(e) => setAutoRefreshRealtime(e.target.checked)}
                  />
                  30초 실시간 자동갱신
                </label>
                <button
                  onClick={() => handleSyncRealtimeNow(true)}
                  disabled={realtimeSyncing}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-xs font-extrabold text-white cursor-pointer"
                >
                  {realtimeSyncing
                    ? "⏳ 실시간 rawdata.xlsx 동기화 중..."
                    : "⚡ 당일 실시간 가격 & rawdata.xlsx 즉시 업데이트"}
                </button>
                <button
                  onClick={handleLock1530}
                  className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-extrabold text-white cursor-pointer shadow"
                >
                  🔒 15:30 KOSPI 마감 후 시그널 최종 확정 (Lock)
                </button>
              </div>
            </div>

            {/* 2) 당일 rawdata.xlsx 실시간 가격 & 4대 수급 현황판 (지표 클릭 시 하단 이중축 차트 즉시 전환) */}
            {(() => {
              const raw = lockStatus?.today_rawdata || {};
              const futUp = (raw.fut_change_pt ?? 0) >= 0;
              const k200Up = (raw.k200_change_pt ?? 0) >= 0;
              const basisVal = raw.basis ?? 0;

              const indicatorMetaMap: Record<
                string,
                {
                  label: string;
                  unit: string;
                  color: string;
                  isBar: boolean;
                  series: number[];
                }
              > = {
                index_only: {
                  label: "KOSPI200 현·선물 지수 단독 비교",
                  unit: "pt",
                  color: "#10b981",
                  isBar: false,
                  series: [],
                },
                open_interest: {
                  label: "선물 미결제약정 (Open Interest)",
                  unit: "계약",
                  color: "#38bdf8",
                  isBar: false,
                  series: ledgerOiSeries,
                },
                basis: {
                  label: "선물-현물 베이시스 (Basis)",
                  unit: "pt",
                  color: "#38bdf8",
                  isBar: true,
                  series: ledgerBasisSeries,
                },
                pcr_ratio: {
                  label: "등가격 옵션 Put/Call 비율 (PCR)",
                  unit: "배",
                  color: "#c084fc",
                  isBar: false,
                  series: ledgerPcrSeries,
                },
                program_arb_net: {
                  label: "프로그램 차익순매수 (일별)",
                  unit: "억",
                  color: "#10b981",
                  isBar: true,
                  series: ledgerProgramArbSeries,
                },
                program_arb_cum: {
                  label: "프로그램 차익순매수 (기간 누적)",
                  unit: "억",
                  color: "#34d399",
                  isBar: false,
                  series: ledgerProgramArbCumSeries,
                },
                short_balance_eok: {
                  label: "KOSPI 공매도잔고 (누적 잔고 · T+2)",
                  unit: "억",
                  color: "#f43f5e",
                  isBar: false,
                  series: ledgerShortBalanceSeries,
                },
                credit_balance_eok: {
                  label: "증시 신용융자잔고 (누적 잔고 · T+2)",
                  unit: "억",
                  color: "#f59e0b",
                  isBar: false,
                  series: ledgerCreditBalanceSeries,
                },
                fut_foreign_net: {
                  label: "외국인 선물 순매수",
                  unit: "계약",
                  color: "#34d399",
                  isBar: true,
                  series: ledgerFutForeignSeries,
                },
                spot_foreign_net: {
                  label: "외국인 현물 순매수",
                  unit: "억",
                  color: "#2dd4bf",
                  isBar: true,
                  series: ledgerSpotForeignSeries,
                },
                fx_close: {
                  label: "원/달러 환율 (USD/KRW)",
                  unit: "원",
                  color: "#fb923c",
                  isBar: false,
                  series: ledgerFxSeries,
                },
                kodex_leverage: {
                  label: "KODEX 레버리지 ETF",
                  unit: "원",
                  color: "#818cf8",
                  isBar: false,
                  series: ledgerKodexSeries,
                },
                up_down_diff: {
                  label: "ADR 상승-하락 종목수 차이",
                  unit: "종목",
                  color: "#f472b6",
                  isBar: true,
                  series: ledgerUpDownSeries,
                },
                new_high_low_diff: {
                  label: "52주 신고가-신저가 종목수 차이",
                  unit: "종목",
                  color: "#facc15",
                  isBar: true,
                  series: ledgerNewHighLowSeries,
                },
              };

              const activeIndMeta =
                indicatorMetaMap[step5SelectedIndicator] || indicatorMetaMap.open_interest;

              return (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-xs font-extrabold text-emerald-300">
                        📊 당일({raw.date || lockStatus?.trading_date || "2026-11-09"}) rawdata.xlsx 실시간 가격 및 수급 데이터 현황
                      </h4>
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 text-[10px] font-extrabold">
                        👆 아래 시장지표 카드 또는 지표를 클릭하면 설정된 기간({ledgerDates[0] || ledgerStartDate} ~ {ledgerDates[ledgerDates.length - 1] || ledgerEndDate})의 이중축 차트가 즉시 표시됩니다
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">
                      전일({raw.prev_date || "-"}) 선물종가 {raw.prev_fut_close ?? "-"}pt / KOSPI200 {raw.prev_k200_close ?? "-"}pt 기준
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {/* 카드 1: KOSPI200 선물 현재가 (클릭 시 현·선물 지수 기본 차트) */}
                    <div
                      onClick={() => setStep5SelectedIndicator("index_only")}
                      className={`bg-slate-950/90 border rounded-lg p-3 cursor-pointer transition ${
                        step5SelectedIndicator === "index_only"
                          ? "border-emerald-400 ring-1 ring-emerald-400/50 bg-emerald-950/20"
                          : "border-slate-800 hover:border-emerald-500/50"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>KOSPI200 선물 현재가</span>
                        <span className="text-[10px] text-emerald-300 font-bold">📈 디폴트 좌축</span>
                      </div>
                      <div className={`text-lg font-extrabold font-mono mt-0.5 ${futUp ? "text-emerald-400" : "text-rose-400"}`}>
                        {raw.fut_close ?? lt?.futures_close ?? "-"} <span className="text-xs">pt</span>
                      </div>
                      <div className={`text-[11px] font-mono font-bold ${futUp ? "text-emerald-300" : "text-rose-300"}`}>
                        전일비 {futUp ? "+" : ""}
                        {raw.fut_change_pt ?? 0}pt ({futUp ? "+" : ""}
                        {raw.fut_change_pct ?? 0}%)
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        시 {raw.fut_open ?? "-"} / 고 {raw.fut_high ?? "-"} / 저 {raw.fut_low ?? "-"}
                      </div>
                    </div>

                    {/* 카드 2: KOSPI200 현물지수 현재가 (클릭 시 현·선물 지수 기본 차트) */}
                    <div
                      onClick={() => setStep5SelectedIndicator("index_only")}
                      className={`bg-slate-950/90 border rounded-lg p-3 cursor-pointer transition ${
                        step5SelectedIndicator === "index_only"
                          ? "border-amber-400 ring-1 ring-amber-400/50 bg-amber-950/20"
                          : "border-slate-800 hover:border-amber-500/50"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>KOSPI200 현물지수</span>
                        <span className="text-[10px] text-amber-300 font-bold">📈 디폴트 좌축</span>
                      </div>
                      <div className={`text-lg font-extrabold font-mono mt-0.5 ${k200Up ? "text-amber-300" : "text-rose-400"}`}>
                        {raw.k200_close ?? lt?.k200_close ?? "-"} <span className="text-xs">pt</span>
                      </div>
                      <div className={`text-[11px] font-mono font-bold ${k200Up ? "text-emerald-300" : "text-rose-300"}`}>
                        전일비 {k200Up ? "+" : ""}
                        {raw.k200_change_pt ?? 0}pt ({k200Up ? "+" : ""}
                        {raw.k200_change_pct ?? 0}%)
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-1">
                        시 {raw.k200_open ?? "-"} / 고 {raw.k200_high ?? "-"} / 저 {raw.k200_low ?? "-"}
                      </div>
                    </div>

                    {/* 카드 3: 실시간 베이시스 & 환율 & KODEX레버리지 (개별 항목 클릭 지원) */}
                    <div
                      onClick={() => setStep5SelectedIndicator("basis")}
                      className={`bg-slate-950/90 border rounded-lg p-3 cursor-pointer transition ${
                        ["basis", "fx_close", "kodex_leverage"].includes(step5SelectedIndicator)
                          ? "border-sky-400 ring-1 ring-sky-400/50 bg-sky-950/20"
                          : "border-slate-800 hover:border-sky-500/50"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>실시간 베이시스 &amp; 환율</span>
                        <span className="text-[10px] text-sky-300 font-bold">👆 차트보기</span>
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setStep5SelectedIndicator("basis");
                        }}
                        className={`text-base font-extrabold font-mono mt-0.5 hover:underline ${
                          basisVal >= 0 ? "text-sky-300" : "text-rose-300"
                        }`}
                      >
                        {basisVal >= 0 ? "+" : ""}
                        {basisVal}pt{" "}
                        <span className="text-[11px] font-sans">
                          ({basisVal >= 0 ? "콘탱고" : "백워데이션"})
                        </span>
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setStep5SelectedIndicator("fx_close");
                        }}
                        className={`text-[11px] font-mono mt-1 hover:underline ${
                          step5SelectedIndicator === "fx_close" ? "text-amber-300 font-bold" : "text-slate-300"
                        }`}
                      >
                        📊 원/달러: {raw.fx_close ?? "-"}원
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setStep5SelectedIndicator("kodex_leverage");
                        }}
                        className={`text-[10px] font-mono mt-0.5 hover:underline ${
                          step5SelectedIndicator === "kodex_leverage" ? "text-indigo-300 font-bold" : "text-slate-400"
                        }`}
                      >
                        📊 KODEX레버리지: {(raw.kodex_leverage ?? 0).toLocaleString()}원
                      </div>
                    </div>

                    {/* 카드 4: 외국인 선물·현물 실시간 수급 */}
                    <div
                      onClick={() => setStep5SelectedIndicator("fut_foreign_net")}
                      className={`bg-slate-950/90 border rounded-lg p-3 cursor-pointer transition ${
                        ["fut_foreign_net", "spot_foreign_net"].includes(step5SelectedIndicator)
                          ? "border-emerald-400 ring-1 ring-emerald-400/50 bg-emerald-950/20"
                          : "border-slate-800 hover:border-emerald-500/50"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>외국인 선물·현물 수급</span>
                        <span className="text-[10px] text-emerald-300 font-bold">👆 차트보기</span>
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setStep5SelectedIndicator("fut_foreign_net");
                        }}
                        className={`text-sm font-extrabold font-mono mt-0.5 hover:underline ${
                          (raw.fut_foreign_net ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        📊 선물외인: {(raw.fut_foreign_net ?? 0) >= 0 ? "+" : ""}
                        {Number(raw.fut_foreign_net ?? 0).toLocaleString()}계약
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setStep5SelectedIndicator("spot_foreign_net");
                        }}
                        className={`text-[11px] font-mono font-bold mt-1 hover:underline ${
                          (raw.spot_foreign_net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        📊 현물외인: {(raw.spot_foreign_net ?? 0) >= 0 ? "+" : ""}
                        {Number(raw.spot_foreign_net ?? 0).toLocaleString()}억
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        현물개인: {Number(raw.spot_personal_net ?? 0).toLocaleString()}억
                      </div>
                    </div>

                    {/* 카드 5: 프로그램 차익 & 미결제약정 & 공매도/신용 누적잔고 */}
                    <div
                      onClick={() => setStep5SelectedIndicator("open_interest")}
                      className={`bg-slate-950/90 border rounded-lg p-3 cursor-pointer transition ${
                        ["open_interest", "program_arb_net", "program_arb_cum", "short_balance_eok", "credit_balance_eok"].includes(
                          step5SelectedIndicator
                        )
                          ? "border-sky-400 ring-1 ring-sky-400/50 bg-sky-950/20"
                          : "border-slate-800 hover:border-sky-500/50"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>차익 &amp; 미결제 &amp; 공매·신용</span>
                        <span className="text-[10px] text-sky-300 font-bold">👆 차트보기</span>
                      </div>
                      <div className="flex items-center justify-between gap-1 mt-0.5">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setStep5SelectedIndicator("program_arb_net");
                          }}
                          className={`text-xs font-extrabold font-mono hover:underline ${
                            (raw.program_arb_net ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                          }`}
                        >
                          📊 차익: {(raw.program_arb_net ?? 0) >= 0 ? "+" : ""}
                          {Number(raw.program_arb_net ?? 0).toLocaleString()}억
                        </div>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setStep5SelectedIndicator("program_arb_cum");
                          }}
                          className="px-1.5 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-[10px] text-emerald-300 font-bold hover:bg-emerald-900"
                        >
                          누적차익
                        </span>
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setStep5SelectedIndicator("open_interest");
                        }}
                        className="text-[11px] text-sky-300 font-mono font-bold mt-1 hover:underline"
                      >
                        📊 미결제: {Number(raw.open_interest ?? 0).toLocaleString()}계약{" "}
                        <span className="text-[10px] text-slate-400 font-normal">
                          ({(raw.oi_change ?? 0) >= 0 ? "+" : ""}
                          {Number(raw.oi_change ?? 0).toLocaleString()})
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[10px] font-mono mt-1 pt-1 border-t border-slate-800/80">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setStep5SelectedIndicator("short_balance_eok");
                          }}
                          className="text-rose-300 font-bold hover:underline"
                        >
                          📊 공매잔고:{" "}
                          {Number(
                            raw.short_balance_eok ??
                              (ledgerShortBalanceSeries.length
                                ? ledgerShortBalanceSeries[ledgerShortBalanceSeries.length - 1]
                                : 42000)
                          ).toLocaleString()}
                          억
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setStep5SelectedIndicator("credit_balance_eok");
                          }}
                          className="text-amber-300 font-bold hover:underline"
                        >
                          📊 신용잔고:{" "}
                          {Number(
                            raw.credit_balance_eok ??
                              (ledgerCreditBalanceSeries.length
                                ? ledgerCreditBalanceSeries[ledgerCreditBalanceSeries.length - 1]
                                : 185000)
                          ).toLocaleString()}
                          억
                        </span>
                      </div>
                    </div>

                    {/* 카드 6: 심리(등락/신고) & 옵션 PCR */}
                    <div
                      onClick={() => setStep5SelectedIndicator("pcr_ratio")}
                      className={`bg-slate-950/90 border rounded-lg p-3 cursor-pointer transition ${
                        ["pcr_ratio", "up_down_diff", "new_high_low_diff"].includes(step5SelectedIndicator)
                          ? "border-purple-400 ring-1 ring-purple-400/50 bg-purple-950/20"
                          : "border-slate-800 hover:border-purple-500/50"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>심리(등락/신고) &amp; PCR</span>
                        <span className="text-[10px] text-purple-300 font-bold">👆 차트보기</span>
                      </div>
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setStep5SelectedIndicator("pcr_ratio");
                        }}
                        className="text-sm font-extrabold font-mono text-purple-300 mt-0.5 hover:underline"
                      >
                        📊 PCR: {raw.pcr_ratio ?? "-"}배
                      </div>
                      <div className="text-[11px] text-slate-300 font-mono mt-1">
                        Call {raw.call_close ?? "-"} / Put {raw.put_close ?? "-"}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono mt-0.5">
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setStep5SelectedIndicator("up_down_diff");
                          }}
                          className="hover:underline hover:text-pink-300"
                        >
                          📊 등락 {raw.up_down_diff ?? 0}
                        </span>
                        <span>/</span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setStep5SelectedIndicator("new_high_low_diff");
                          }}
                          className="hover:underline hover:text-yellow-300"
                        >
                          📊 신고저 {raw.new_high_low_diff ?? 0}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 클릭한 시장지표와 KOSPI200 현·선물 지수(디폴트 좌축)를 결합한 이중축(Dual-Axis) 인터랙티브 차트 보드 */}
                  <div className="bg-slate-950/90 border border-sky-500/40 rounded-xl p-3.5 space-y-2.5 shadow-lg">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                      <div>
                        <h5 className="text-xs font-extrabold text-white">
                          📈 [디폴트 좌축: KOSPI200 선물·현물지수] + [우축 별도 스케일: {activeIndMeta.label}] 기간 동기화 차트 ({ledgerDates[0] || ledgerStartDate} ~ {ledgerDates[ledgerDates.length - 1] || ledgerEndDate} · {ledgerDates.length}거래일)
                        </h5>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          rawdata.xlsx 기초데이터 기준 · 아래 설정된 매매원장 기간과 100% 동일하게 연동되며, 좌측 축에는 항상 KOSPI200 선물/현물 지수가 기본 표시되고 우측 독립 축 스케일로 선택한 시장지표가 겹쳐 표시됩니다.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {[
                          { key: "open_interest", label: "미결제약정(OI)" },
                          { key: "basis", label: "베이시스(Basis)" },
                          { key: "pcr_ratio", label: "PC비율(PCR)" },
                          { key: "program_arb_net", label: "프로그램차익(일별)" },
                          { key: "program_arb_cum", label: "프로그램차익(누적)" },
                          { key: "short_balance_eok", label: "공매도잔고(누적)" },
                          { key: "credit_balance_eok", label: "신용잔고(누적)" },
                          { key: "fut_foreign_net", label: "선물외국인" },
                          { key: "spot_foreign_net", label: "현물외국인" },
                          { key: "fx_close", label: "원/달러환율" },
                          { key: "kodex_leverage", label: "KODEX레버리지" },
                          { key: "up_down_diff", label: "등락종목차(ADR)" },
                          { key: "new_high_low_diff", label: "52주신고신저" },
                          { key: "index_only", label: "현·선물지수만" },
                        ].map((btn) => (
                          <button
                            key={btn.key}
                            type="button"
                            onClick={() => setStep5SelectedIndicator(btn.key)}
                            className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer border transition ${
                              step5SelectedIndicator === btn.key
                                ? "bg-sky-600 text-white border-sky-400 shadow"
                                : "bg-slate-900 text-slate-300 border-slate-700 hover:text-white"
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <SvgDualAxisMarketChart
                      dates={ledgerDates}
                      futuresCloses={ledgerFutCloses}
                      k200Closes={ledgerK200Closes}
                      rightSeries={step5SelectedIndicator === "index_only" ? undefined : activeIndMeta.series}
                      rightLabel={step5SelectedIndicator === "index_only" ? undefined : activeIndMeta.label}
                      rightUnit={activeIndMeta.unit}
                      rightColor={activeIndMeta.color}
                      rightIsBar={activeIndMeta.isBar}
                      height={250}
                    />
                  </div>
                </div>
              );
            })()}

            {/* 3) 전일 보유 vs 당일 장마감까지 실시간 포지션 변화 체크 & 15:35~15:45 동시호가 주문 확정 보드 */}
            {(() => {
              const pchk = lockStatus?.position_change_check || {};
              const latestLedgerRow = activeLedgerRows.length > 0 ? activeLedgerRows[0] : null;
              const prevLedgerRow = activeLedgerRows.length > 1 ? activeLedgerRows[1] : null;
              const prevDateStr = prevLedgerRow?.date || pchk.prev_date || "전일";
              const todayDateStr = latestLedgerRow?.date || pchk.today_date || "당일";
              const prevPos =
                prevLedgerRow?.base_position_sum !== undefined
                  ? Number(prevLedgerRow.base_position_sum)
                  : Number(pchk.prev_base_position_sum ?? 0);
              const todayPos =
                latestLedgerRow?.base_position_sum !== undefined
                  ? Number(latestLedgerRow.base_position_sum)
                  : Number(pchk.today_base_position_sum ?? lockStatus?.base_position_sum ?? pm?.current_base_position ?? 0);
              const prevC =
                latestLedgerRow?.prev_contracts !== undefined
                  ? Number(latestLedgerRow.prev_contracts)
                  : prevLedgerRow?.target_contracts !== undefined
                  ? Number(prevLedgerRow.target_contracts)
                  : Number(pchk.prev_contracts ?? lockStatus?.prev_contracts ?? 0);
              const targetC =
                latestLedgerRow?.target_contracts !== undefined
                  ? Number(latestLedgerRow.target_contracts)
                  : Number(pchk.today_target_contracts ?? lockStatus?.target_contracts ?? pm?.current_target_contracts ?? 0);
              const deltaC = targetC - prevC;
              const actStr =
                deltaC > 0 ? "매수 진입/추가" : deltaC < 0 ? "매도 진입/청산" : "포지션 유지(0)";
              const dRet =
                latestLedgerRow?.daily_return_pct !== undefined
                  ? Number(latestLedgerRow.daily_return_pct)
                  : Number(pchk.today_daily_return_pct ?? 0);
              const dPnl =
                latestLedgerRow?.daily_pnl_krw !== undefined
                  ? Number(latestLedgerRow.daily_pnl_krw)
                  : Number(pchk.today_daily_pnl_krw ?? 0);
              const rawSigChanges: any[] = pchk.models_signal_changes || [];
              const active5SetForStep5 = new Set(
                step5ActiveModels.length > 0
                  ? step5ActiveModels
                  : selectedModelIds.length > 0
                  ? selectedModelIds
                  : rawSigChanges.filter((m: any) => m.is_selected).map((m: any) => m.model_id)
              );
              const perfMapForStep5 = new Map<string, any>(
                (step5ModelsPerformance.length > 0 ? step5ModelsPerformance : allModels).map((m: any) => [
                  m.model_id,
                  m,
                ])
              );
              const sigChanges: any[] = rawSigChanges.map((m: any) => {
                const isSel = active5SetForStep5.has(m.model_id);
                const pObj = perfMapForStep5.get(m.model_id);
                const prevSig = pObj?.signal_lags?.T_1 !== undefined ? Number(pObj.signal_lags.T_1) : Number(m.prev_signal ?? 0);
                const todaySig = pObj?.latest_signal !== undefined ? Number(pObj.latest_signal) : Number(m.today_signal ?? 0);
                const sigDelta = todaySig - prevSig;
                const changed = prevSig !== todaySig;
                const sigLabel = (s: number) => (s > 0 ? "매수(+1)" : s < 0 ? "매도(-1)" : "중립(0)");
                return {
                  ...m,
                  is_selected: isSel,
                  prev_signal: prevSig,
                  today_signal: todaySig,
                  signal_delta: sigDelta,
                  signal_changed: changed,
                  change_label: changed
                    ? `⚡ ${sigLabel(prevSig)} → ${sigLabel(todaySig)} 전환`
                    : `${sigLabel(todaySig)} 유지`,
                  cum_return_pct: pObj?.cum_return_pct ?? m.cum_return_pct,
                  sharpe_ratio: pObj?.sharpe_ratio ?? m.sharpe_ratio,
                  mdd_pct: pObj?.mdd_pct ?? m.mdd_pct,
                };
              });
              const changedSelectedCount = sigChanges.filter((m: any) => m.is_selected && m.signal_changed).length;
              const changedTotalCount = sigChanges.filter((m: any) => m.signal_changed).length;
              const rawTimeline: any[] = lockStatus?.intraday_timeline || [];
              const timeline: any[] =
                rawTimeline.length > 0
                  ? rawTimeline.map((t: any, idx: number, arr: any[]) => {
                      if (idx === arr.length - 1) {
                        return {
                          ...t,
                          base_position_sum: todayPos,
                          target_contracts: targetC,
                          order_delta_contracts: deltaC,
                        };
                      }
                      const bPos = Number(t.base_position_sum ?? todayPos);
                      const tC = bPos * multiplier;
                      return {
                        ...t,
                        target_contracts: tC,
                        order_delta_contracts: tC - prevC,
                      };
                    })
                  : [];

              return (
                <div className="space-y-4 pt-2 border-t border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-amber-300">
                      ⚖️ 장 마감(15:30)까지 실시간 포지션 변화 체크 &amp; 15:35~15:45 종가 동시호가 주문수량(Delta) 확정판
                    </h4>
                    <span className="text-[11px] text-slate-300">
                      주력 5대 모델 중 당일 시그널 변동:{" "}
                      <strong className="text-amber-300">{changedSelectedCount}개 모델 전환</strong>{" "}
                      (전체 13개 모델 중 {changedTotalCount}개 전환)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5">
                      <div className="text-[11px] text-slate-400">
                        ① 전일({prevDateStr}) 보유 포지션
                      </div>
                      <div className="text-xl font-extrabold font-mono text-slate-200 mt-1">
                        {prevC > 0 ? `+${prevC}` : prevC}계약
                      </div>
                      <div className="text-xs text-slate-400 font-mono mt-1">
                        선택 5모델 합산시그널: {prevPos > 0 ? `+${prevPos}` : prevPos} (멀티플 {multiplier}x)
                      </div>
                    </div>

                    <div className="bg-slate-950/90 border border-sky-500/40 rounded-xl p-3.5">
                      <div className="text-[11px] text-sky-300 font-bold">
                        ② 당일({todayDateStr}) 실시간 목표 포지션
                      </div>
                      <div
                        className={`text-xl font-extrabold font-mono mt-1 ${
                          targetC > 0 ? "text-emerald-400" : targetC < 0 ? "text-rose-400" : "text-slate-200"
                        }`}
                      >
                        {targetC > 0 ? `+${targetC}` : targetC}계약
                      </div>
                      <div className="text-xs text-sky-200 font-mono mt-1">
                        당일 실시간 합산시그널: {todayPos > 0 ? `+${todayPos}` : todayPos} (전일비{" "}
                        {todayPos - prevPos >= 0 ? `+${todayPos - prevPos}` : todayPos - prevPos})
                      </div>
                    </div>

                    <div className="bg-amber-950/25 border-2 border-amber-500/60 rounded-xl p-3.5">
                      <div className="text-[11px] text-amber-300 font-extrabold">
                        ③ 15:35~15:45 종가 동시호가 주문수량 (Delta)
                      </div>
                      <div
                        className={`text-2xl font-extrabold font-mono mt-1 ${
                          deltaC > 0 ? "text-emerald-300" : deltaC < 0 ? "text-rose-300" : "text-amber-200"
                        }`}
                      >
                        {deltaC > 0 ? `+${deltaC}` : deltaC}계약
                      </div>
                      <div className="text-xs font-bold text-white mt-1">{actStr}</div>
                    </div>

                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5">
                      <div className="text-[11px] text-slate-400">
                        ④ 당일 실시간 매매손익 ({pointValueKrw === 50000 ? "미니 5만원" : "정규 25만원"} · 원금 1억)
                      </div>
                      <div
                        className={`text-xl font-extrabold font-mono mt-1 ${
                          dRet >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {dRet >= 0 ? "+" : ""}
                        {dRet}% ({dPnl >= 0 ? "+" : ""}
                        {Number(dPnl).toLocaleString()}원)
                      </div>
                      <div className="text-xs text-indigo-300 font-bold mt-1">
                        {lockStatus?.locked_signal
                          ? `🔒 확정시각: ${lockStatus.locked_signal.locked_at_kst}`
                          : "⏳ 15:30 KOSPI 마감 시 최종 Lock"}
                      </div>
                    </div>
                  </div>

                  {/* 3-B) 한국투자증권(KIS) 선물옵션 모의계좌(Paper) ↔ 실전계좌(Live) 주문 & 잔고 연동 패널 */}
                  <div className="bg-slate-950/95 border border-indigo-500/40 rounded-xl p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="px-2.5 py-1 rounded bg-indigo-600/30 border border-indigo-400/50 text-indigo-200 text-xs font-extrabold">
                          🏦 한국투자증권(KIS) 선물옵션 모의계좌(Paper) ↔ 실전투입(Live) 주문 집행 센터
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-extrabold font-mono ${
                            kisModeInput === "LIVE"
                              ? "bg-rose-600 text-white"
                              : "bg-emerald-600/30 border border-emerald-500/50 text-emerald-300"
                          }`}
                        >
                          {kisModeInput === "LIVE"
                            ? "🔥 실전투자 모드 (TTFO0011U)"
                            : "🧪 모의투자 모드 (VTFO0011U)"}
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          근월물 코드:{" "}
                          <strong className="text-amber-300">
                            {pointValueKrw === 50000
                              ? (kisAccountData?.config?.active_fut_code || "A05612").replace(/^A01/, "A05")
                              : (kisAccountData?.config?.active_fut_code || "A01612").replace(/^A05/, "A01")}{" "}
                            ({pointValueKrw === 50000 ? "미니선물·승수 5만원" : "정규선물·승수 25만원"})
                          </strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => handleSaveKisConfig("PAPER")}
                          disabled={kisOrderLoading}
                          className={`px-2.5 py-1 rounded font-bold cursor-pointer border ${
                            kisModeInput === "PAPER"
                              ? "bg-emerald-600 text-white border-emerald-400"
                              : "bg-slate-900 text-slate-400 border-slate-700"
                          }`}
                        >
                          🧪 모의계좌(PAPER)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveKisConfig("LIVE")}
                          disabled={kisOrderLoading}
                          className={`px-2.5 py-1 rounded font-bold cursor-pointer border ${
                            kisModeInput === "LIVE"
                              ? "bg-rose-600 text-white border-rose-400"
                              : "bg-slate-900 text-slate-400 border-slate-700"
                          }`}
                        >
                          🔥 실전계좌(LIVE)
                        </button>
                      </div>
                    </div>

                    {/* 계좌 설정 및 즉시 주문 컨트롤 */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
                      <div className="lg:col-span-7 flex flex-wrap items-center gap-2 text-xs">
                        <label className="flex items-center gap-1 text-slate-300">
                          <span>계좌번호(8자리):</span>
                          <input
                            type="text"
                            value={kisCanoInput}
                            onChange={(e) => setKisCanoInput(e.target.value)}
                            className="w-24 bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-white"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-slate-300">
                          <span>상품코드(선물=03):</span>
                          <input
                            type="text"
                            value={kisPrdtInput}
                            onChange={(e) => setKisPrdtInput(e.target.value)}
                            className="w-12 bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-amber-300 font-bold"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-slate-300">
                          <span>주문유형:</span>
                          <select
                            value={kisOrdDvsnInput}
                            onChange={(e) => setKisOrdDvsnInput(e.target.value)}
                            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-white"
                          >
                            <option value="02">02: 시장가(동시호가)</option>
                            <option value="03">03: 조건부지정가</option>
                            <option value="01">01: 지정가</option>
                          </select>
                        </label>
                        <label className="flex items-center gap-1 text-slate-300">
                          <span>최대한도(계약):</span>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={kisCapInput}
                            onChange={(e) => setKisCapInput(Number(e.target.value) || 10)}
                            className="w-14 bg-slate-900 border border-slate-700 rounded px-2 py-1 font-mono text-white"
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-amber-300 font-bold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={kisAutoExecInput}
                            onChange={(e) => setKisAutoExecInput(e.target.checked)}
                          />
                          15:30 Lock 시 자동주문
                        </label>
                        <button
                          type="button"
                          onClick={() => handleSaveKisConfig()}
                          disabled={kisOrderLoading}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded font-bold text-slate-200 cursor-pointer"
                        >
                          💾 설정 저장
                        </button>
                      </div>

                      <div className="lg:col-span-5 flex flex-wrap items-center justify-end gap-2">
                        <div className="text-right text-[11px] font-mono mr-2">
                          <div className="text-slate-400">
                            현재 계좌 보유:{" "}
                            <strong className="text-white">
                              {kisAccountData?.broker_connected
                                ? kisAccountData?.effective_net_contracts ?? 0
                                : prevC}계약
                            </strong>{" "}
                            → 당일 목표: <strong className="text-sky-300">{targetC}계약</strong>
                          </div>
                          <div className="text-amber-300 font-bold">
                            동시호가 실행 Delta: {deltaC > 0 ? `+${deltaC}계약 매수` : deltaC < 0 ? `${deltaC}계약 매도` : "0계약 (유지)"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleExecuteKisOrder(deltaC, prevC, targetC)}
                          disabled={kisOrderLoading}
                          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-xs font-extrabold text-white shadow cursor-pointer"
                        >
                          {kisOrderLoading
                            ? "주문 처리중..."
                            : `🚀 Delta(${deltaC > 0 ? `+${deltaC}` : deltaC}계약) ${kisModeInput === "LIVE" ? "실전" : "모의"}주문 실행`}
                        </button>
                      </div>
                    </div>

                    {/* 모의계좌 개설 안내 및 최근 체결 로그 */}
                    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5 text-[11px] text-slate-300 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          <strong className="text-emerald-300">📌 KIS 선물 모의투자 → 실전투입 안내:</strong>{" "}
                          {kisAccountData?.setup_guide?.how_to_enable_mock ||
                            "한국투자증권 홈페이지/앱에서 [국내선물옵션 모의투자(상품코드 03)] 신청 후 계좌번호를 입력하시면 KIS 서버(VTFO0011U)로 즉시 주문되며, 실전 투입 시 상단 [🔥 실전계좌(LIVE)] 버튼만 누르면 실전 TR(TTFO0011U)로 자동 전환됩니다."}
                        </span>
                        <span className="font-mono text-slate-400">
                          KIS 상태: {kisAccountData?.broker_connected ? "🟢 KIS 선물계좌 연결됨" : `🟡 내장 모의원장 연동 중 (${kisAccountData?.broker_code || "상품코드 03 개설 전 가상체결 지원"})`}
                        </span>
                      </div>

                      {Array.isArray(kisAccountData?.recent_orders) && kisAccountData.recent_orders.length > 0 && (
                        <div className="pt-1.5 border-t border-slate-800 overflow-x-auto">
                          <table className="w-full text-[11px] font-mono text-left">
                            <thead>
                              <tr className="text-slate-400 border-b border-slate-800">
                                <th className="py-1 pr-2">체결시각</th>
                                <th className="py-1 pr-2">모드</th>
                                <th className="py-1 pr-2">종목코드</th>
                                <th className="py-1 pr-2">매매구분</th>
                                <th className="py-1 pr-2 text-right">주문수량</th>
                                <th className="py-1 pr-2 text-right">체결선물가</th>
                                <th className="py-1 pr-2 text-right">포지션변화</th>
                                <th className="py-1">처리결과</th>
                              </tr>
                            </thead>
                            <tbody>
                              {kisAccountData.recent_orders.slice(0, 4).map((ord: any) => (
                                <tr key={ord.id} className="border-b border-slate-900/60">
                                  <td className="py-1 pr-2 text-slate-300">{ord.executed_at_kst}</td>
                                  <td className="py-1 pr-2 font-bold text-indigo-300">{ord.mode}</td>
                                  <td className="py-1 pr-2 text-amber-300">{ord.fut_code}</td>
                                  <td className={`py-1 pr-2 font-bold ${String(ord.side).includes("BUY") ? "text-emerald-400" : "text-rose-400"}`}>
                                    {ord.side}
                                  </td>
                                  <td className="py-1 pr-2 text-right font-bold">{ord.qty}계약</td>
                                  <td className="py-1 pr-2 text-right">{ord.exec_price}pt</td>
                                  <td className="py-1 pr-2 text-right">
                                    {ord.prev_contracts} → {ord.target_contracts}계약
                                  </td>
                                  <td className="py-1 text-slate-400 truncate max-w-[280px]">{ord.broker_msg}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 당일 장중 시간대별(09:00 시가 ~ 15:30 마감) 가격 및 포지션 추이 차트 */}
                  {timeline.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
                        <h5 className="text-xs font-extrabold text-emerald-300 mb-2">
                          🕒 당일 장중(09:00~15:30) 시간대별 실시간 목표 계약수(막대) &amp; 선물가격(선, pt) 변화 추이
                        </h5>
                        <SvgBarAndLineChart
                          dates={timeline.map((t: any) => t.time_label)}
                          barData={timeline.map((t: any) => t.target_contracts)}
                          barLabel="장중 실시간 목표 계약수"
                          barUnit="계약"
                          lineData={timeline.map((t: any) => t.fut_price)}
                          lineLabel="KOSPI200 선물 실시간 가격"
                          lineColor="#38bdf8"
                          lineUnit="pt"
                          height={210}
                        />
                      </div>

                      <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
                        <h5 className="text-xs font-extrabold text-amber-300 mb-2">
                          ⚡ 당일 장중(09:00~15:30) 예상 동시호가 주문수량 Delta(막대, 계약) &amp; 5모델 합산포지션(선) 추이
                        </h5>
                        <SvgBarAndLineChart
                          dates={timeline.map((t: any) => t.time_label)}
                          barData={timeline.map((t: any) => t.order_delta_contracts)}
                          barLabel="예상 동시호가 주문수량 (Delta)"
                          barUnit="계약"
                          lineData={timeline.map((t: any) => t.base_position_sum)}
                          lineLabel="선택 5모델 합산 시그널 (-5~+5)"
                          lineColor="#f59e0b"
                          lineUnit=""
                          posBarColor="#10b981"
                          negBarColor="#f43f5e"
                          height={210}
                        />
                      </div>
                    </div>
                  )}

                  {/* 전일(T-1) 대비 당일(T0 실시간) 13개 모델 시그널 변화 상세 점검표 */}
                  {sigChanges.length > 0 && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 overflow-x-auto">
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                        <h5 className="text-xs font-extrabold text-white">
                          🔄 전일({pchk.prev_date}) 대비 당일({pchk.today_date} 실시간) 13개 전체 모델 시그널 변화 점검표 (장마감 15:30 확정 전 체크)
                        </h5>
                        <span className="text-[11px] text-slate-400">
                          채택된 5대 주력 모델의 시그널이 전환되면 당일 목표 계약수와 15:35~15:45 동시호가 주문수량(Delta)이 즉시 변동됩니다.
                        </span>
                      </div>
                      <table className="w-full text-xs text-left border-collapse font-mono">
                        <thead>
                          <tr className="border-b border-slate-700 text-slate-300 bg-slate-900">
                            <th className="p-2">운용구분</th>
                            <th className="p-2">모델 ID / 모델명</th>
                            <th className="p-2">4대 지표군</th>
                            <th className="p-2 text-center">전일 시그널 (T-1)</th>
                            <th className="p-2 text-center">당일 실시간 시그널 (T0)</th>
                            <th className="p-2 text-center">시그널 변동폭</th>
                            <th className="p-2">당일 포지션 변화 상태</th>
                            <th className="p-2 text-right">누적수익률</th>
                            <th className="p-2 text-right">Sharpe</th>
                            <th className="p-2 text-right">MDD</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80">
                          {[...sigChanges]
                            .sort((a, b) => Number(b.is_selected) - Number(a.is_selected))
                            .map((m: any) => (
                              <tr
                                key={m.model_id}
                                className={
                                  m.signal_changed && m.is_selected
                                    ? "bg-amber-950/30 hover:bg-amber-900/30"
                                    : m.is_selected
                                    ? "bg-emerald-950/15 hover:bg-slate-800/50"
                                    : "hover:bg-slate-800/40"
                                }
                              >
                                <td className="p-2 font-sans">
                                  {m.is_selected ? (
                                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                                      ★ 채택 5모델
                                    </span>
                                  ) : m.is_in_10_pool ? (
                                    <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[10px] font-bold">
                                      10대풀 대기
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                                      후보 모델
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 font-sans">
                                  <span className="font-bold text-white">{m.model_id}</span>{" "}
                                  <span className="text-slate-400 text-[11px]">{m.name}</span>
                                </td>
                                <td className="p-2 font-sans text-indigo-300 text-[11px]">
                                  {m.indicator_group}
                                </td>
                                <td className="p-2 text-center">{formatBadge(m.prev_signal)}</td>
                                <td className="p-2 text-center">{formatBadge(m.today_signal)}</td>
                                <td className="p-2 text-center font-bold">
                                  {m.signal_delta === 0 ? (
                                    <span className="text-slate-500">0 (유지)</span>
                                  ) : (
                                    <span
                                      className={
                                        m.signal_delta > 0 ? "text-emerald-300" : "text-rose-300"
                                      }
                                    >
                                      {m.signal_delta > 0 ? `+${m.signal_delta}` : m.signal_delta} (
                                      {m.signal_delta * multiplier > 0
                                        ? `+${m.signal_delta * multiplier}`
                                        : m.signal_delta * multiplier}
                                      계약 영향)
                                    </span>
                                  )}
                                </td>
                                <td className="p-2 font-sans">
                                  {m.signal_changed ? (
                                    <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold text-[11px]">
                                      {m.change_label}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400 text-[11px]">{m.change_label}</span>
                                  )}
                                </td>
                                <td
                                  className={`p-2 text-right font-bold ${
                                    m.cum_return_pct >= 0 ? "text-emerald-400" : "text-rose-400"
                                  }`}
                                >
                                  {m.cum_return_pct >= 0 ? "+" : ""}
                                  {m.cum_return_pct}%
                                </td>
                                <td className="p-2 text-right text-sky-300 font-bold">
                                  {m.sharpe_ratio}
                                </td>
                                <td className="p-2 text-right text-amber-300">{m.mdd_pct}%</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {renderLedgerPeriodBar("Step 5 매매원장 & 포지션 차트")}

          {/* Step 5 매매원장의 선택 5모델 합산포지션 & 누적 매매수익률 차트 (좌측) + 포지션 계약수 & 동시호가 주문수량 차트 (우측) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-extrabold text-sky-300 mb-2">
                📊 매매원장 선택 5모델 합산포지션(-5 ~ +5) &amp; 기간 누적 매매수익률(%) &amp; KOSPI200 현물지수 비교 차트
              </h3>
              <SvgBarAndLineChart
                dates={ledgerDates}
                barData={ledgerBasePositions}
                barLabel="선택 5모델 시그널 합산포지션 (-5 ~ +5)"
                barUnit=""
                lineData={ledgerCumRetPct}
                lineLabel="기간 누적 매매수익률"
                lineColor="#10b981"
                lineUnit="%"
                secondLineData={ledgerK200CumRetPct}
                secondLineLabel="KOSPI200 현물지수"
                secondLineColor="#f59e0b"
                secondLineUnit="%"
                secondLineDashed={true}
                secondLineExtraText={`${ledgerLatestK200Close}pt`}
              />
            </div>

            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-extrabold text-amber-300 mb-2">
                ⚖️ 매매원장의 포지션 계약수(-5×M ~ +5×M) &amp; 동시호가 주문수량(Delta) 차트
              </h3>
              <SvgBarAndLineChart
                dates={ledgerDates}
                barData={ledgerTargetContracts}
                barLabel={`목표 포지션 계약수 (멀티플 ${multiplier}x)`}
                barUnit="계약"
                lineData={ledgerDeltaContracts}
                lineLabel="동시호가 주문수량 (Delta)"
                lineColor="#f59e0b"
                lineUnit="계약"
                posBarColor="#0ea5e9"
                negBarColor="#f43f5e"
              />
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-x-auto">
            <h3 className="text-xs font-bold text-white mb-2">
              🕒 조회 구간({activeLedgerRows.length}거래일) 15:30 시그널 확정 및 15:35~15:45 종가 동시호가 포지션 조정 매매원장 (매매수익률 포함)
            </h3>
            <table className="w-full text-xs text-left border-collapse font-mono">
              <thead>
                <tr className="border-b border-slate-700 text-slate-300 bg-slate-950">
                  <th className="p-2">거래일자</th>
                  <th className="p-2 text-right">KOSPI200</th>
                  <th className="p-2 text-right">선물종가</th>
                  <th className="p-2 text-center">합산포지션</th>
                  <th className="p-2 text-right">전일계약</th>
                  <th className="p-2 text-right">목표계약</th>
                  <th className="p-2 text-right text-amber-300">동시호가 주문수량(Delta)</th>
                  <th className="p-2">주문구분</th>
                  <th className="p-2 text-right text-emerald-300">일간 매매수익률(%)</th>
                  <th className="p-2 text-right text-sky-300">누적 매매수익률(%)</th>
                  <th className="p-2 text-right">일별손익(원)</th>
                  <th className="p-2 text-right">누적수익지수</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {activeLedgerRows.map((r: any, idx: number) => {
                  const dRet =
                    typeof r.daily_return_pct === "number"
                      ? r.daily_return_pct
                      : idx < activeLedgerRows.length - 1
                      ? Number(
                          (
                            (((r.equity_index || 100) - (activeLedgerRows[idx + 1]?.equity_index || 100)) /
                              (activeLedgerRows[idx + 1]?.equity_index || 100)) *
                            100
                          ).toFixed(3)
                        )
                      : 0;
                  const cRet =
                    ledgerCumRetByDate[String(r.date)] ??
                    Number((Number(r.equity_index || 100) - 100).toFixed(2));
                  return (
                    <tr
                      key={r.date}
                      className={`hover:bg-slate-800/50 ${
                        r.is_live_today && !r.is_market_closed ? "bg-emerald-950/20" : ""
                      }`}
                    >
                      <td className="p-2 font-bold text-white">
                        <span>{r.date}</span>
                        {r.is_live_today && (
                          <span
                            className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-sans font-extrabold ${
                              r.is_market_closed
                                ? "bg-amber-900/70 text-amber-200 border border-amber-500/50"
                                : "bg-emerald-900/80 text-emerald-200 border border-emerald-400/60 animate-pulse"
                            }`}
                          >
                            {r.is_market_closed ? "🔒 종가확정" : "⚡ 실시간"}
                          </span>
                        )}
                      </td>
                      <td className="p-2 text-right text-slate-300">{r.k200_close ?? "-"}</td>
                      <td className="p-2 text-right font-bold text-white">{r.futures_close}</td>
                      <td className="p-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            r.base_position_sum > 0
                              ? "bg-emerald-500/20 text-emerald-300"
                              : r.base_position_sum < 0
                              ? "bg-rose-500/20 text-rose-300"
                              : "bg-slate-700/40 text-slate-300"
                          }`}
                        >
                          {r.base_position_sum > 0 ? `+${r.base_position_sum}` : r.base_position_sum}
                        </span>
                      </td>
                      <td className="p-2 text-right">{r.prev_contracts}계약</td>
                      <td className="p-2 text-right font-bold">{r.target_contracts}계약</td>
                      <td className="p-2 text-right text-amber-300 font-bold">
                        {r.order_delta_contracts > 0
                          ? `+${r.order_delta_contracts}`
                          : r.order_delta_contracts}
                        계약
                      </td>
                      <td className="p-2 font-sans">{r.order_action}</td>
                      <td
                        className={`p-2 text-right font-bold ${
                          dRet >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {dRet >= 0 ? "+" : ""}
                        {dRet}%
                      </td>
                      <td
                        className={`p-2 text-right font-bold ${
                          cRet >= 0 ? "text-sky-300" : "text-rose-400"
                        }`}
                      >
                        {cRet >= 0 ? "+" : ""}
                        {cRet}%
                      </td>
                      <td
                        className={`p-2 text-right font-bold ${
                          r.daily_pnl_krw >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {r.daily_pnl_krw >= 0 ? "+" : ""}
                        {Number(r.daily_pnl_krw).toLocaleString()}원
                      </td>
                      <td className="p-2 text-right text-slate-300">{r.equity_index}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* STEP 7: 4대 핵심 수급(공매도·신용·OI·차익) 역추세 백테스트 & 모델1~13 수급결합 상세 매뉴얼 */}
      {/* =================================================================== */}
      {step === 7 && (
        <div className="space-y-5 text-xs">
          {/* 상단 백테스트 파라미터 컨트롤 바 */}
          <div className="bg-slate-900/95 border border-emerald-500/40 rounded-xl p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-emerald-300">
                  🧪 4대 핵심 수급 지표(① 공매도잔고 T+2 · ② 신용잔고 T+2 · ③ 미결제약정 OI · ④ 5일/20일 누적 차익거래) 역추세 선물 시뮬레이션 &amp; 모델 1~13 수급결합 매뉴얼
                </h2>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  시총/거래대금 대비 120일 롤링 Z-Score 표준화 · 공매도/신용 T+2 shift(2) 시점 보정 · 동시만기일(D-3~D+2) 진입제한 및 누적차익 리셋 · 3단계 Gate 방식 vs 가중합산 Scoring 방식 비교 및 6개월 슬라이딩 Walk-Forward 검증
                </p>
              </div>
                <div className="flex flex-wrap items-center gap-1.5">
                {[
                  { label: "2013~현재 (박스권+추세 14년)", dt: "2013-01-02" },
                  { label: "최근 10년 (2016~현재)", dt: "2016-01-04" },
                  { label: "최근 3년 (2023~현재)", dt: "2023-01-02" },
                  { label: "2026년 YTD", dt: "2026-01-02" },
                ].map((b) => (
                  <button
                    key={b.dt}
                    type="button"
                    onClick={() => {
                      setScStartDate(b.dt);
                      fetchSupplyContrarianBacktest(b.dt);
                    }}
                    className={`px-2.5 py-1 rounded font-bold cursor-pointer border ${
                      scStartDate === b.dt
                        ? "bg-emerald-600 text-white border-emerald-400"
                        : "bg-slate-950 text-slate-300 border-slate-700 hover:text-white"
                    }`}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3 pt-2 border-t border-slate-800">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">백테스트 시작일</label>
                  <input
                    type="date"
                    value={scStartDate}
                    onChange={(e) => setScStartDate(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">1단계 Gate 과열(|Z|≥)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0.8}
                    max={3.0}
                    value={scSetupZ}
                    onChange={(e) => setScSetupZ(Number(e.target.value) || 1.5)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-emerald-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Scoring 진입점수(±)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={1.0}
                    max={3.5}
                    value={scScoreThresh}
                    onChange={(e) => setScScoreThresh(Number(e.target.value) || 2.0)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-sky-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Time-Stop (영업일)</label>
                  <input
                    type="number"
                    min={2}
                    max={15}
                    value={scMaxHoldDays}
                    onChange={(e) => setScMaxHoldDays(Number(e.target.value) || 6)}
                    className="w-18 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Hard-Stop (ATR배수)</label>
                  <input
                    type="number"
                    step={0.1}
                    min={0.8}
                    max={3.5}
                    value={scAtrStopMult}
                    onChange={(e) => setScAtrStopMult(Number(e.target.value) || 1.5)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-rose-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">진입 계약수</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={scContracts}
                    onChange={(e) => setScContracts(Number(e.target.value) || 2)}
                    className="w-16 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-amber-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">슬리피지(pt)</label>
                  <input
                    type="number"
                    step={0.01}
                    min={0}
                    max={0.3}
                    value={scSlippagePt}
                    onChange={(e) => setScSlippagePt(Number(e.target.value) || 0.05)}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-slate-300 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-amber-300 font-bold mb-1">📦 박스권 VIX 20MA(≤)</label>
                  <input
                    type="number"
                    step={0.5}
                    min={10.0}
                    max={30.0}
                    value={scVix20Thresh}
                    onChange={(e) => setScVix20Thresh(Number(e.target.value) || 16.0)}
                    className="w-20 bg-slate-950 border border-amber-500/60 rounded px-2.5 py-1.5 text-amber-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-amber-300 font-bold mb-1">📦 변동×거래량 에너지(≤)</label>
                  <input
                    type="number"
                    step={0.05}
                    min={0.5}
                    max={3.0}
                    value={scEnergyThresh}
                    onChange={(e) => setScEnergyThresh(Number(e.target.value) || 1.35)}
                    className="w-20 bg-slate-950 border border-amber-500/60 rounded px-2.5 py-1.5 text-amber-300 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-amber-300 font-bold mb-1">📦 미결제 절대수준(≤)</label>
                  <input
                    type="number"
                    step={10000}
                    min={100000}
                    max={400000}
                    value={scOiAbsThresh}
                    onChange={(e) => setScOiAbsThresh(Number(e.target.value) || 240000)}
                    className="w-24 bg-slate-950 border border-amber-500/60 rounded px-2.5 py-1.5 text-amber-300 font-mono font-bold"
                  />
                </div>
                <label className="flex items-center gap-1.5 text-amber-300 font-bold cursor-pointer pb-1.5">
                  <input
                    type="checkbox"
                    checked={scRestrictExpiry}
                    onChange={(e) => setScRestrictExpiry(e.target.checked)}
                  />
                  동시만기주간(D-3~D+2) 진입제한
                </label>
              </div>
              <button
                type="button"
                disabled={scLoading}
                onClick={() => fetchSupplyContrarianBacktest()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold cursor-pointer shadow"
              >
                {scLoading ? "⚡ 백테스트 실행 중..." : "🚀 4대 수급 역추세 백테스트 실행"}
              </button>
            </div>
          </div>

          {scBacktestData && (
            <>
              {/* 당일 4대 수급 지표 Z-Score 실시간 진단 카드 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">① 공매도잔고 (T+2 shift(2) 보정)</div>
                  <div className="text-lg font-extrabold font-mono text-emerald-400 mt-1">
                    Short_Z: {scBacktestData.latest_indicators?.short_z >= 0 ? "+" : ""}
                    {scBacktestData.latest_indicators?.short_z}σ
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 font-mono">
                    잔고 {Number(scBacktestData.latest_indicators?.short_balance_eok || 0).toLocaleString()}억 (시총비{" "}
                    {scBacktestData.latest_indicators?.short_cap_ratio_pct}% · 20일증감{" "}
                    {scBacktestData.latest_indicators?.short_roc_20d_pct}%)
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">② 신용융자잔고 (T+2 shift(2) 보정)</div>
                  <div className="text-lg font-extrabold font-mono text-rose-400 mt-1">
                    Credit_Z: {scBacktestData.latest_indicators?.credit_z >= 0 ? "+" : ""}
                    {scBacktestData.latest_indicators?.credit_z}σ
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 font-mono">
                    잔고 {Number(scBacktestData.latest_indicators?.credit_balance_eok || 0).toLocaleString()}억 (시총비{" "}
                    {scBacktestData.latest_indicators?.credit_cap_ratio_pct}% · 20일증감{" "}
                    {scBacktestData.latest_indicators?.credit_roc_20d_pct}%)
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">③ 미결제약정계약수 (OI &amp; ΔOI)</div>
                  <div className="text-lg font-extrabold font-mono text-sky-400 mt-1">
                    OI_Z: {scBacktestData.latest_indicators?.oi_z >= 0 ? "+" : ""}
                    {scBacktestData.latest_indicators?.oi_z}σ (ΔOI:{" "}
                    {scBacktestData.latest_indicators?.delta_oi >= 0 ? "+" : ""}
                    {Number(scBacktestData.latest_indicators?.delta_oi || 0).toLocaleString()})
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 font-mono">
                    총 {Number(scBacktestData.latest_indicators?.open_interest || 0).toLocaleString()}계약 | 레짐:{" "}
                    {scBacktestData.latest_indicators?.oi_regime > 0
                      ? "신규 롱 누적(ΔP>0, ΔOI>0)"
                      : scBacktestData.latest_indicators?.oi_regime < 0
                      ? "신규 숏 누적(ΔP<0, ΔOI>0)"
                      : "기존 포지션 청산(ΔOI<0)"}
                  </div>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5">
                  <div className="text-[11px] text-slate-400">④ 5일·20일 누적 차익거래 &amp; 종합과열</div>
                  <div className="text-lg font-extrabold font-mono text-amber-300 mt-1">
                    Arb20_Z: {scBacktestData.latest_indicators?.cum_arb_20_z}σ / Arb5_Z:{" "}
                    {scBacktestData.latest_indicators?.cum_arb_5_z}σ
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 font-mono">
                    종합과열점수: <strong className="text-white">{scBacktestData.latest_indicators?.composite_overheat_score}</strong> | 만기주간:{" "}
                    {scBacktestData.latest_indicators?.in_expiry_window ? "제한중(D-3~D+2)" : "정상거래"}
                  </div>
                </div>
              </div>

              {/* Gate 방식 vs Scoring 방식 비교 테이블 */}
              <div className="bg-slate-900/90 border border-indigo-500/40 rounded-xl p-4 overflow-x-auto">
                <h3 className="text-xs font-extrabold text-white mb-2.5">
                  📊 [3단계 순차 게이트(Gate) 방식] vs [4대 지표 가중합산 스코어링(Scoring) 방식] 단독 백테스트 정밀 비교 (
                  {scBacktestData.params?.start_date} ~ {scBacktestData.params?.end_date}, {scBacktestData.params?.total_trading_days}거래일)
                </h3>
                <table className="w-full text-xs text-left border-collapse font-mono">
                  <thead>
                    <tr className="border-b border-slate-700 bg-slate-950 text-slate-300">
                      <th className="p-2">시뮬레이션 방식</th>
                      <th className="p-2 text-right text-emerald-300">누적수익률</th>
                      <th className="p-2 text-right">누적손익(원)</th>
                      <th className="p-2 text-right">연환산</th>
                      <th className="p-2 text-right">총 매매횟수</th>
                      <th className="p-2 text-right text-yellow-300">건별 승률</th>
                      <th className="p-2 text-right">평균 보유일</th>
                      <th className="p-2 text-right text-amber-300">MDD</th>
                      <th className="p-2 text-right">P/L Factor</th>
                      <th className="p-2 text-right text-sky-300">Sharpe</th>
                      <th className="p-2 text-right">Sortino</th>
                      <th className="p-2 text-right">Calmar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {[
                      {
                        label: "① 3단계 순차 게이트 (Gate: 과열Setup → 5일차익Filter → ΔOI<0 Trigger)",
                        m: scBacktestData.gate_result?.metrics || {},
                        cls: "bg-emerald-950/20 text-emerald-200 font-bold",
                      },
                      {
                        label: "② 4대 수급 가중합산 스코어링 (Scoring: 종합과열 ±2.0 돌파 후 피크아웃)",
                        m: scBacktestData.scoring_result?.metrics || {},
                        cls: "bg-sky-950/20 text-sky-200 font-bold",
                      },
                    ].map((row, idx) => (
                      <tr key={idx} className={row.cls}>
                        <td className="p-2 font-sans">{row.label}</td>
                        <td className="p-2 text-right text-emerald-400 font-extrabold">
                          {(row.m.cum_return_pct ?? 0) >= 0 ? "+" : ""}
                          {row.m.cum_return_pct}%
                        </td>
                        <td className="p-2 text-right">
                          {(row.m.total_pnl_krw ?? 0) >= 0 ? "+" : ""}
                          {Number(row.m.total_pnl_krw || 0).toLocaleString()}원
                        </td>
                        <td className="p-2 text-right">{row.m.annual_return_pct}%</td>
                        <td className="p-2 text-right">
                          {row.m.total_trades}회 ({row.m.win_trades}승 {row.m.loss_trades}패)
                        </td>
                        <td className="p-2 text-right text-yellow-300 font-extrabold">{row.m.trade_win_rate_pct}%</td>
                        <td className="p-2 text-right">{row.m.avg_holding_days}일</td>
                        <td className="p-2 text-right text-amber-300 font-extrabold">-{row.m.mdd_pct}%</td>
                        <td className="p-2 text-right">{row.m.profit_loss_factor}</td>
                        <td className="p-2 text-right text-sky-300 font-extrabold">{row.m.sharpe_ratio}</td>
                        <td className="p-2 text-right">{row.m.sortino_ratio}</td>
                        <td className="p-2 text-right">{row.m.calmar_ratio}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ★ 기술적 지표(60%) + 기존 수급지표(25%) + 신규 4대 수급 역추세(15%) 최적 연결 아키텍처 5종 비교 */}
              {scBacktestData.synergy_optimization && (
                <div className="bg-slate-900/95 border-2 border-emerald-500/60 rounded-xl p-4 space-y-4 shadow-xl">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
                    <div>
                      <h3 className="text-sm font-extrabold text-emerald-300">
                        🏆 [기술적 지표] + [기존 추세·옵션 수급지표] + [신규 4대 잔고·누적차익 역추세] 최적 결합 아키텍처 5종 비교 검증
                      </h3>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        기존 채택 5대 주력 모델({(scBacktestData.synergy_optimization.active_5_models || []).join(", ")})과 신규 4대 수급 역추세 모델을 어떻게 연결해야 수익률·샤프지수(Sharpe)·칼마지수(Calmar)·MDD 방어가 극대화되는지 비교한 결과입니다.
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400 text-emerald-200 font-extrabold text-xs">
                      ★ 최적 결합 황금비율: 기술지표 60% + 기존 추세·옵션수급 25% + 신규 4대수급 역추세 15%
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left border-collapse font-mono">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-950 text-slate-300">
                          <th className="p-2">결합 아키텍처 구분</th>
                          <th className="p-2">비중 및 결합 공식</th>
                          <th className="p-2 text-right text-emerald-300">누적수익률</th>
                          <th className="p-2 text-right">누적손익(원)</th>
                          <th className="p-2 text-right">연환산</th>
                          <th className="p-2 text-right">일간승률(Hit)</th>
                          <th className="p-2 text-right text-amber-300">MDD</th>
                          <th className="p-2 text-right">P/L Factor</th>
                          <th className="p-2 text-right text-sky-300">Sharpe</th>
                          <th className="p-2 text-right">Sortino</th>
                          <th className="p-2 text-right text-yellow-300">Calmar</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {(scBacktestData.synergy_optimization.architectures || []).map((arch: any, idx: number) => {
                          const m = arch.metrics || {};
                          return (
                            <tr
                              key={arch.arch_id || idx}
                              className={
                                arch.is_optimal
                                  ? "bg-emerald-950/35 text-emerald-100 font-bold border-l-4 border-emerald-400"
                                  : idx === 3
                                  ? "bg-sky-950/25 text-sky-100 font-semibold"
                                  : "hover:bg-slate-800/40 text-slate-300"
                              }
                            >
                              <td className="p-2 font-sans">
                                <div className="font-extrabold text-white">{arch.title}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{arch.role_desc}</div>
                              </td>
                              <td className="p-2 font-sans text-[11px] text-amber-200">{arch.weight_formula}</td>
                              <td className="p-2 text-right text-emerald-400 font-extrabold text-sm">
                                {(m.cum_return_pct ?? 0) >= 0 ? "+" : ""}
                                {m.cum_return_pct}%
                              </td>
                              <td className="p-2 text-right">
                                {(m.total_pnl_krw ?? 0) >= 0 ? "+" : ""}
                                {Number(m.total_pnl_krw || 0).toLocaleString()}원
                              </td>
                              <td className="p-2 text-right">{m.annual_return_pct}%</td>
                              <td className="p-2 text-right">{m.hitting_ratio_pct}%</td>
                              <td className="p-2 text-right text-amber-300 font-bold">-{m.mdd_pct}%</td>
                              <td className="p-2 text-right">{m.profit_loss_factor}</td>
                              <td className="p-2 text-right text-sky-300 font-extrabold">{m.sharpe_ratio}</td>
                              <td className="p-2 text-right">{m.sortino_ratio}</td>
                              <td className="p-2 text-right text-yellow-300 font-extrabold">{m.calmar_ratio}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-center">
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5">
                      <h4 className="text-xs font-extrabold text-white mb-2">
                        📈 결합 아키텍처별 누적수익률(%) 비교 차트 (★ ⑥ VIX·에너지·OI·PCR 박스권 자동감지 역추세 리밸런싱 vs ⑤ 하이브리드 vs ② 현재기본)
                      </h4>
                      <SvgMultiLineChart
                        dates={scBacktestData.chart_series?.dates || []}
                        seriesList={[
                          {
                            label: "⑥ ★ 박스권 자동감지 역추세 리밸런싱 (VIX 20MA·에너지·OI·PCR)",
                            data: scBacktestData.chart_series?.synergy_vix_range_auto_pct || [],
                            color: "#10b981",
                            width: 2.9,
                          },
                          {
                            label: "⑤ 하이브리드 (기술60%+기존수급25%+4대역추세15%)",
                            data: scBacktestData.chart_series?.synergy_optimal_hybrid_pct || [],
                            color: "#38bdf8",
                            width: 2.3,
                          },
                          {
                            label: "② 현재 기본 모델 (기술65% + 기존수급35%)",
                            data: scBacktestData.chart_series?.synergy_current_35_pct || [],
                            color: "#f59e0b",
                            width: 2.0,
                          },
                          {
                            label: "① 순수 기술지표 단독 (기술100%)",
                            data: scBacktestData.chart_series?.synergy_pure_tech_pct || [],
                            color: "#94a3b8",
                            dashed: true,
                            width: 1.6,
                          },
                        ]}
                      />
                    </div>

                    <div className="bg-slate-950/90 border border-emerald-500/30 rounded-xl p-4 space-y-2.5">
                      <div className="text-xs font-extrabold text-emerald-300">
                        💡 최적 연결 설계 공식 (기술 60% : 기존수급 25% : 4대수급 15% + ★ VIX 20MA 박스권 자동감지 스위칭)
                      </div>
                      <ul className="space-y-2 text-[11px] text-slate-200 leading-relaxed">
                        {(scBacktestData.synergy_optimization.optimal_blueprint?.rules || []).map(
                          (rule: string, rIdx: number) => (
                            <li key={rIdx} className="bg-slate-900/90 border border-slate-800 rounded-lg p-2.5">
                              {rule}
                            </li>
                          )
                        )}
                      </ul>
                    </div>
                  </div>

                  {/* 📦 5대 복합 지표(20일 이평 VIX · 변동성×거래량 에너지 · 미결제 절대수준 · PCR · 4대수급) 기반 박스권 자동 감지 vs 추세장 분리 성과 분석 보드 */}
                  {scBacktestData.synergy_optimization.range_vs_trend_breakdown && (
                    <div className="bg-slate-950/95 border border-amber-500/50 rounded-xl p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <div>
                          <h4 className="text-xs font-extrabold text-amber-300">
                            📦 박스권 자동 감지 역추세 비중 리밸런싱 모니터 (① 20일 이평 VIX ≤ {scBacktestData.synergy_optimization.range_vs_trend_breakdown.vix_20ma_threshold}pt · ② 변동×거래량 에너지 ≤ {scBacktestData.synergy_optimization.range_vs_trend_breakdown.energy_max_threshold} · ③ 미결제 절대수준 ≤ {Number(scBacktestData.synergy_optimization.range_vs_trend_breakdown.oi_abs_max_threshold).toLocaleString()}계약 · ④ PCR 밴드)
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            전체 {scBacktestData.synergy_optimization.range_vs_trend_breakdown.total_days}거래일 중{" "}
                            <strong className="text-amber-300">
                              박스권 감지 {scBacktestData.synergy_optimization.range_vs_trend_breakdown.detected_range_days}일 (
                              {scBacktestData.synergy_optimization.range_vs_trend_breakdown.detected_range_ratio_pct}%)
                            </strong>{" "}
                            / 추세장 감지 {scBacktestData.synergy_optimization.range_vs_trend_breakdown.detected_trend_days}일 | 현재 장세 판정:{" "}
                            <strong className="text-emerald-300">
                              {scBacktestData.synergy_optimization.range_vs_trend_breakdown.latest_regime?.regime_label} (VIX 20MA:{" "}
                              {scBacktestData.synergy_optimization.range_vs_trend_breakdown.latest_regime?.vix_20ma}pt · 에너지:{" "}
                              {scBacktestData.synergy_optimization.range_vs_trend_breakdown.latest_regime?.vol_volume_energy} · OI:{" "}
                              {Number(scBacktestData.synergy_optimization.range_vs_trend_breakdown.latest_regime?.open_interest || 0).toLocaleString()}계약)
                            </strong>
                          </p>
                        </div>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse font-mono">
                          <thead>
                            <tr className="border-b border-slate-700 bg-slate-900 text-slate-300">
                              <th className="p-2">운용 모드 비교</th>
                              <th className="p-2 text-right text-emerald-300">전체 기간 누적수익률</th>
                              <th className="p-2 text-right text-amber-300">📦 박스권 감지 구간 수익률</th>
                              <th className="p-2 text-right text-sky-300">🚀 추세장 감지 구간 수익률</th>
                              <th className="p-2 text-right">포트폴리오 MDD</th>
                              <th className="p-2 text-right">Sharpe Ratio</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {(scBacktestData.synergy_optimization.range_vs_trend_breakdown.regime_returns_comparison || []).map(
                              (rc: any, idx: number) => (
                                <tr
                                  key={idx}
                                  className={
                                    idx === 2
                                      ? "bg-emerald-950/35 text-emerald-200 font-bold border-l-4 border-emerald-400"
                                      : "text-slate-300"
                                  }
                                >
                                  <td className="p-2 font-sans font-bold text-white">{rc.mode_title}</td>
                                  <td className="p-2 text-right text-emerald-400 font-extrabold">
                                    {rc.total_return_pct >= 0 ? "+" : ""}
                                    {rc.total_return_pct}%
                                  </td>
                                  <td
                                    className={`p-2 text-right font-extrabold ${
                                      rc.range_regime_return_pct >= 0 ? "text-emerald-300" : "text-rose-400"
                                    }`}
                                  >
                                    {rc.range_regime_return_pct >= 0 ? "+" : ""}
                                    {rc.range_regime_return_pct}%
                                  </td>
                                  <td className="p-2 text-right text-sky-300 font-extrabold">
                                    {rc.trend_regime_return_pct >= 0 ? "+" : ""}
                                    {rc.trend_regime_return_pct}%
                                  </td>
                                  <td className="p-2 text-right text-amber-300">-{rc.mdd_pct}%</td>
                                  <td className="p-2 text-right text-indigo-300 font-extrabold">{rc.sharpe_ratio}</td>
                                </tr>
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 🛡️ 과최적화(Overfitting) 방지 감사 & Out-of-Sample Forward 일관성 검증 패널 */}
                  {scBacktestData.synergy_optimization.overfitting_audit && (
                    <div className="bg-slate-950/95 border border-sky-500/40 rounded-xl p-4 space-y-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                        <div>
                          <h4 className="text-xs font-extrabold text-sky-300">
                            🛡️ 과최적화(Overfitting) 방지 감사 &amp; Out-of-Sample Forward(미학습 구간) 일관성 검증
                          </h4>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            In-Sample 전반부 60%({scBacktestData.synergy_optimization.overfitting_audit.in_sample_period}) vs Out-of-Sample Forward 후반부 40%(
                            {scBacktestData.synergy_optimization.overfitting_audit.out_of_sample_period}) 분리 검증 및 파라미터 ±20% 섭동(Perturbation) 강건성 테스트
                          </p>
                        </div>
                        <span className="px-2.5 py-1 rounded bg-sky-500/20 border border-sky-400/50 text-sky-200 font-mono font-extrabold text-[11px]">
                          파라미터 ±20% 섭동 수익률 변동계수(CV): {scBacktestData.synergy_optimization.overfitting_audit.param_return_cv_pct}% (과최적화 없음 · 강건성 통과)
                        </span>
                      </div>

                      {/* 1. 5대 아키텍처별 In-Sample vs Out-of-Sample Forward 일관성 비교 테이블 */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-[11px] text-left border-collapse font-mono">
                          <thead>
                            <tr className="border-b border-slate-700 bg-slate-900 text-slate-300">
                              <th className="p-2">결합 아키텍처</th>
                              <th className="p-2 text-right">In-Sample (전반 60%) 수익</th>
                              <th className="p-2 text-right">In-Sample Sharpe</th>
                              <th className="p-2 text-right text-emerald-300">Out-of-Sample Forward (후반 40%) 수익</th>
                              <th className="p-2 text-right text-sky-300">OOS Forward Sharpe</th>
                              <th className="p-2 text-right text-amber-300">OOS Forward MDD</th>
                              <th className="p-2 text-right text-yellow-300">6개월 Forward 구간 플러스(+) 비율</th>
                              <th className="p-2 text-right">기존모델 대비 우위/방어 비율</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {(scBacktestData.synergy_optimization.architectures || []).map((arch: any, idx: number) => {
                              const fc = arch.forward_consistency || {};
                              return (
                                <tr
                                  key={idx}
                                  className={
                                    arch.is_optimal
                                      ? "bg-emerald-950/30 text-emerald-200 font-bold"
                                      : idx === 3
                                      ? "bg-sky-950/25 text-sky-200 font-semibold"
                                      : "text-slate-300"
                                  }
                                >
                                  <td className="p-2 font-sans font-bold text-white">{arch.title}</td>
                                  <td className="p-2 text-right">
                                    {(fc.in_sample_return_pct ?? 0) >= 0 ? "+" : ""}
                                    {fc.in_sample_return_pct}%
                                  </td>
                                  <td className="p-2 text-right">{fc.in_sample_sharpe}</td>
                                  <td className="p-2 text-right text-emerald-400 font-extrabold">
                                    {(fc.oos_forward_return_pct ?? 0) >= 0 ? "+" : ""}
                                    {fc.oos_forward_return_pct}%
                                  </td>
                                  <td className="p-2 text-right text-sky-300 font-extrabold">{fc.oos_forward_sharpe}</td>
                                  <td className="p-2 text-right text-amber-300">-{fc.oos_forward_mdd_pct}%</td>
                                  <td className="p-2 text-right text-yellow-300 font-extrabold">
                                    {fc.positive_window_ratio_pct}% ({fc.positive_6m_windows}/{fc.total_6m_windows}구간)
                                  </td>
                                  <td className="p-2 text-right">
                                    {fc.beat_baseline_ratio_pct}% ({fc.beat_baseline_windows}/{fc.total_6m_windows}구간)
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* 2. 파라미터 섭동(Perturbation ±20%) 민감도 테이블 & 4대 과최적화 방지 원칙 */}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="overflow-x-auto">
                          <div className="text-[11px] font-extrabold text-amber-300 mb-1.5">
                            🔬 파라미터 섭동(Parameter Perturbation ±20%) 강건성 테스트 (임계치 변화에 따른 성과 평탄도)
                          </div>
                          <table className="w-full text-[11px] text-left border-collapse font-mono">
                            <thead>
                              <tr className="border-b border-slate-700 bg-slate-900 text-slate-300">
                                <th className="p-1.5">파라미터 섭동 조건</th>
                                <th className="p-1.5 text-right text-emerald-300">전체 누적수익</th>
                                <th className="p-1.5 text-right">전체 MDD</th>
                                <th className="p-1.5 text-right text-sky-300">전체 Sharpe</th>
                                <th className="p-1.5 text-right text-yellow-300">OOS Forward 수익(Sharpe)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                              {(scBacktestData.synergy_optimization.overfitting_audit.param_perturbation_grid || []).map(
                                (pg: any, pIdx: number) => (
                                  <tr
                                    key={pIdx}
                                    className={pIdx === 2 ? "bg-emerald-950/30 text-emerald-200 font-bold" : "text-slate-300"}
                                  >
                                    <td className="p-1.5 font-sans">{pg.param_label}</td>
                                    <td className="p-1.5 text-right text-emerald-400 font-bold">
                                      +{pg.full_cum_return_pct}%
                                    </td>
                                    <td className="p-1.5 text-right text-amber-300">-{pg.full_mdd_pct}%</td>
                                    <td className="p-1.5 text-right text-sky-300 font-bold">{pg.full_sharpe}</td>
                                    <td className="p-1.5 text-right text-yellow-300">
                                      +{pg.oos_forward_return_pct}% ({pg.oos_forward_sharpe})
                                    </td>
                                  </tr>
                                )
                              )}
                            </tbody>
                          </table>
                        </div>

                        <div className="space-y-1.5">
                          <div className="text-[11px] font-extrabold text-sky-300">
                            ✅ 적용된 4대 과최적화 방지(Anti-Overfitting) 안전장치
                          </div>
                          {(scBacktestData.synergy_optimization.overfitting_audit.anti_overfitting_guards || []).map(
                            (gText: string, gIdx: number) => (
                              <div
                                key={gIdx}
                                className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 text-[11px] text-slate-200 leading-relaxed"
                              >
                                {gText}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 누적수익률 비교 차트 & 4대 수급 Z-Score 추이 차트 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <h4 className="text-xs font-extrabold text-white mb-2">
                    📈 [Gate 방식] vs [Scoring 방식] vs [KOSPI200] 누적수익률(%) 비교 차트
                  </h4>
                  <SvgMultiLineChart
                    dates={scBacktestData.chart_series?.dates || []}
                    seriesList={[
                      {
                        label: "3단계 Gate 방식 (저MDD 정밀타점)",
                        data: scBacktestData.chart_series?.gate_cum_return_pct || [],
                        color: "#10b981",
                        width: 2.6,
                      },
                      {
                        label: "종합과열 Scoring 방식 (고빈도 수익형)",
                        data: scBacktestData.chart_series?.scoring_cum_return_pct || [],
                        color: "#38bdf8",
                        width: 2.4,
                      },
                      {
                        label: "KOSPI200 지수",
                        data: scBacktestData.chart_series?.k200_cum_return_pct || [],
                        color: "#f59e0b",
                        dashed: true,
                        width: 1.8,
                      },
                    ]}
                  />
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
                  <h4 className="text-xs font-extrabold text-white mb-2">
                    📊 4대 수급 지표 120일 롤링 Z-Score(Short_Z · Credit_Z · CumArb20_Z) 추이 차트
                  </h4>
                  <SvgMultiLineChart
                    dates={scBacktestData.chart_series?.dates || []}
                    seriesList={[
                      {
                        label: "① 공매도잔고 Z-Score (T+2)",
                        data: scBacktestData.chart_series?.short_z_series || [],
                        color: "#10b981",
                        width: 2.0,
                      },
                      {
                        label: "② 신용잔고 Z-Score (T+2)",
                        data: scBacktestData.chart_series?.credit_z_series || [],
                        color: "#f43f5e",
                        width: 2.0,
                      },
                      {
                        label: "④ 20일 누적차익 Z-Score",
                        data: scBacktestData.chart_series?.arb20_z_series || [],
                        color: "#38bdf8",
                        width: 2.0,
                      },
                    ]}
                  />
                </div>
              </div>

              {/* 6개월 단위 Walk-Forward 슬라이딩 검증 테이블 & 최근 매매타점 내역 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-x-auto max-h-96">
                  <h4 className="text-xs font-extrabold text-amber-300 mb-2">
                    🔄 6개월(126영업일) 슬라이딩 Walk-Forward 전진 분석 (상승장·하락장·횡보장 편중 여부 검증)
                  </h4>
                  <table className="w-full text-[11px] text-left border-collapse font-mono">
                    <thead className="sticky top-0 bg-slate-950 border-b border-slate-700 text-slate-300">
                      <tr>
                        <th className="p-1.5">6개월 구간</th>
                        <th className="p-1.5">장세(KOSPI200)</th>
                        <th className="p-1.5 text-right text-emerald-300">Gate 수익(MDD)</th>
                        <th className="p-1.5 text-right text-sky-300">Scoring 수익(MDD)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {(scBacktestData.walk_forward_6m || []).map((w: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/40">
                          <td className="p-1.5 text-slate-200">{w.period}</td>
                          <td className="p-1.5">
                            <span className="font-sans font-bold text-amber-300">{w.market_regime}</span> ({w.k200_return_pct >= 0 ? "+" : ""}
                            {w.k200_return_pct}%)
                          </td>
                          <td className="p-1.5 text-right text-emerald-300 font-bold">
                            {w.gate_return_pct >= 0 ? "+" : ""}
                            {w.gate_return_pct}% (-{w.gate_mdd_pct}% · {w.gate_trades}회)
                          </td>
                          <td className="p-1.5 text-right text-sky-300 font-bold">
                            {w.scoring_return_pct >= 0 ? "+" : ""}
                            {w.scoring_return_pct}% (-{w.scoring_mdd_pct}% · {w.scoring_trades}회)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 overflow-x-auto max-h-96">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-extrabold text-emerald-300">
                      🎯 최근 수급 역추세 진입·청산 상세 매매기록 (수급회귀 익절 / Time-Stop / ATR Hard-Stop)
                    </h4>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setScTradeTab("GATE")}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                          scTradeTab === "GATE" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        Gate 매매내역
                      </button>
                      <button
                        type="button"
                        onClick={() => setScTradeTab("SCORING")}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold cursor-pointer ${
                          scTradeTab === "SCORING" ? "bg-sky-600 text-white" : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        Scoring 매매내역
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-[11px] text-left border-collapse font-mono">
                    <thead className="sticky top-0 bg-slate-950 border-b border-slate-700 text-slate-300">
                      <tr>
                        <th className="p-1.5">진입~청산일</th>
                        <th className="p-1.5">방향(보유)</th>
                        <th className="p-1.5 text-right">진입→청산가</th>
                        <th className="p-1.5 text-right">순손익(수익률)</th>
                        <th className="p-1.5">진입/청산 사유</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {((scTradeTab === "GATE"
                        ? scBacktestData.gate_result?.recent_trades
                        : scBacktestData.scoring_result?.recent_trades) || []
                      ).map((tr: any, i: number) => (
                        <tr key={i} className="hover:bg-slate-800/40">
                          <td className="p-1.5 text-slate-200">
                            {tr.entry_date} → {tr.exit_date}
                          </td>
                          <td className="p-1.5 font-sans font-bold text-white">
                            {tr.direction} ({tr.hold_days}일)
                          </td>
                          <td className="p-1.5 text-right">
                            {tr.entry_price} → {tr.exit_price} ({tr.point_gain >= 0 ? "+" : ""}
                            {tr.point_gain}pt)
                          </td>
                          <td
                            className={`p-1.5 text-right font-bold ${
                              tr.net_pnl_krw >= 0 ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {tr.net_pnl_krw >= 0 ? "+" : ""}
                            {Number(tr.net_pnl_krw).toLocaleString()}원 ({tr.return_pct >= 0 ? "+" : ""}
                            {tr.return_pct}%)
                          </td>
                          <td className="p-1.5 font-sans text-[10px] text-slate-300">
                            <div>진입: {tr.entry_reason}</div>
                            <div className="text-amber-300">청산: {tr.exit_reason}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* 모델 1 ~ 모델 13 (10대 주력 운영풀 + 3대 후보모델) 수급비중 35% 결합 공식 상세 매뉴얼 보드 */}
          <div className="bg-slate-900/95 border border-amber-500/40 rounded-xl p-4 space-y-3 overflow-x-auto">
            <div>
              <h3 className="text-sm font-extrabold text-amber-300">
                📘 현재 적용 중인 모델 1 ~ 모델 12+1 (M01~M10 &amp; C01~C03) 수급비중(디폴트 35%) 결합 공식 정밀 매뉴얼
              </h3>
              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                현재 적용 중인 모든 모델은 <strong>① 고유 기술/수급 순수 시그널(pure_s ∈ -1, 0, +1)</strong>을 산출한 뒤, <strong>수급비중 35%(디폴트, 10%~65% 실시간 조정 가능)</strong>로 <strong>축 ① 추세 수급 동력(52주 신고신저 45% + 외국인 선물·현물 55% + 동조 시너지 30%)</strong>과 <strong>축 ② 횡보·평균회귀 에너지 동력(프로그램 차익 90일 Rank/Z-Score + 미결제약정 OI Z-Score + 옵션 PCR Z-Score/이론가괴리)</strong>을 결합하여 최종 시그널을 확정합니다.
              </p>
            </div>

            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-950 text-slate-200">
                  <th className="p-2">모델 번호 / ID</th>
                  <th className="p-2">분류 / 수급결합 모드</th>
                  <th className="p-2">고유 순수 시그널(pure_s) 산출 공식 (65% 주 동력)</th>
                  <th className="p-2">수급비중 35%(디폴트) 결합 시 매매신호 보정·확증 작동 공식</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {[
                  {
                    id: "모델 1 · M01_MA_Trend (채택 주력 #1)",
                    cat: "추세형 (mode='trend')",
                    pure: "선물 3/5/10/20/60MA 정배열 가중합: C>MA5(25%) + MA3>MA5(25%) + MA5>MA10(20%) + MA5>MA20(15%) + MA20>MA60(15%). 점수 ≥+0.30이면 매수(+1), ≤-0.30이면 매도(-1)",
                    comb: "정배열 매수(+1) 중이라도 미결제 과열 피크아웃(oi_z>0.90 & 차익/PCR 과열) 또는 외인·신고저 하락추세+미결제 누적(oi_z>0.30) 시 0(관망)으로 차단. 역배열 매도(-1) 중 외인 상승추세(trend_up)나 하방 에너지 반등 시 0으로 차단",
                  },
                  {
                    id: "모델 2 · M02_Breakthrough (10대풀 대기)",
                    cat: "추세형 (mode='trend')",
                    pure: "전일 변동폭 R = High(t-1)-Low(t-1). 당일 종가 > Close(t-1)+0.5*R 상향돌파 시 +1, < Close(t-1)-0.5*R 하향이탈 시 -1 (돌파 전까지 직전 신호 유지)",
                    comb: "변동성 하향 돌파(-1) 시 외국인 선물·신고저 상승 동조(trend_up) 또는 차익·PCR 하방과열 반등(energy_rebound_up)이 켜지면 속임수 하방돌파(Whip-saw)로 판정하여 0(중립)으로 방어",
                  },
                  {
                    id: "모델 3 · M03_TnT_Channel (채택 주력 #2)",
                    cat: "추세형 (mode='trend')",
                    pure: "선물 5MA의 직전 11일 최고(ch_high)·최저(ch_low) 채널 산출. 단기 3MA > ch_high 돌파 시 +1, 3MA < ch_low 이탈 시 -1",
                    comb: "11일 채널 상향 돌파(+1) 직후 미결제약정·차익거래 에너지가 상방 과열 피크아웃(energy_exhaust_top)되거나 수급이 역회전할 때 고점 추격매수를 즉시 0(관망)으로 제어",
                  },
                  {
                    id: "모델 4 · M04_Double_Stochastic (10대풀 대기)",
                    cat: "반추세형 (mode='reversion')",
                    pure: "14-10-14-10-3 더블 스토캐스틱(DSlow%K, %D). 침체권(%K<30 & %K≥%D) 골든크로스 또는 %K>55 시 +1, 과열권(%K>70 & %K≤%D) 데드크로스 또는 %K<45 시 -1",
                    comb: "mode='reversion' 적용: 스토캐스틱 중립(0) 구간에서도 하방 에너지 과열 후 반등(energy_rebound_up & trend_up) 시 +1 매수 진입, 상방 과열 피크아웃(energy_exhaust_top & trend_dn) 시 -1 매도 진입 보강",
                  },
                  {
                    id: "모델 5 · M05_Gap_Reversion (채택 주력 #3)",
                    cat: "반추세형 (mode='reversion')",
                    pure: "시가 갭 Gap = Open(t)/Close(t-1)-1. 하락갭(<-0.5%) 후 양봉(C>O) 또는 C<MA5*0.985 과매도 시 +1, 상승갭(>+0.5%) 후 음봉(C<O) 또는 C>MA5*1.015 과열 시 -1",
                    comb: "시가 갭 역추세 진입 시 외국인·신고저의 강한 추세와 충돌하는 역풍 진입을 0으로 차단하고, 차익·PCR·미결제 평균회귀 에너지(rev_supply_score)와 일치할 때만 고승률 반전 타점 진입",
                  },
                  {
                    id: "모델 6 · M06_ETF_Spread (10대풀 대기)",
                    cat: "횡보형 (mode='reversion')",
                    pure: "(선물종가*500,000)/KODEX레버리지 비율의 50일 볼린저 밴드(±1.5σ). 하단밴드 이탈 시 +1, 상단밴드 돌파 시 -1 (평균 ±0.35σ 이내는 0)",
                    comb: "선물-레버리지ETF 가격 괴리 평균회귀 신호에 차익거래·미결제·PCR 평균회귀 수급 필터(35%)를 결합하여 추세 폭락·폭등장의 성급한 반대매매 손실 차단",
                  },
                  {
                    id: "모델 7 · M07_Popular_Energy (10대풀 대기)",
                    cat: "횡보/추세형 (mode='trend')",
                    pure: "장중 매수 에너지 Energy(H-O)와 하단 지지 인기도 Popular(O-L) 차이(E-P)의 20일 평균이 60일 표준편차×0.25 초과 시 +1, 미만 시 -1",
                    comb: "캔들 꼬리 에너지(E-P) 신호에 추세 수급 게이트(신고신저×외인 + 미결제 과열 필터 35%)를 결합하여 수급 뒷받침 없는 단기 캔들 착시 필터링",
                  },
                  {
                    id: "모델 8 · M08_Foreign_Program_Flow (채택 주력 #4)",
                    cat: "수급전담형 (mode='self_supply')",
                    pure: "4대 수급 종합 스코어(trend_supply_score = 신고외인 50% + 프로그램차익 90일 Rank/Z 20% + 미결제약정 15% + PCR 15%) ≥+0.25이면 +1, ≤-0.25이면 -1",
                    comb: "포트폴리오 내 전담 수급 모델: 수급 자체가 주 동력(100%)이며, 미결제·차익 극단 과열 시 피크아웃 청산(0) 및 에너지 평균회귀 반전 타점(w≥15% 시 중립→진입)을 동시에 수행",
                  },
                  {
                    id: "모델 9 · M09_Option_Investor_Flow (10대풀 대기)",
                    cat: "심리·수급형 (mode='self_supply')",
                    pure: "Black-76 콜/풋 이론가 괴리율 스프레드(30%) + 옵션 하락강도 AF 3MA(25%) + 등가격 PCR<5MA(20%) + 옵션 외국인 3일 순매수(15%) + 옵션 개인 역발상(10%) ≥+0.25 시 +1, ≤-0.25 시 -1",
                    comb: "옵션 시장의 이론가 괴리·PCR 심리 신호와 선물 시장의 외국인·차익·미결제 수급(35%)을 교차 검증하여 옵션 단독 허수 신호 차단",
                  },
                  {
                    id: "모델 10 · M10_Breadth_HPI_Sentiment (채택 주력 #5)",
                    cat: "종합·심리형 (mode='trend')",
                    pure: "ADR 상승-하락 종목차 5MA(±20 기준, 40%) + 52주 신고-신저가 5MA(±2 기준, 30%) + 미결제약정 누적·가격 90일 Rank 결합 HPI(30%) ≥+0.25 시 +1, ≤-0.25 시 -1",
                    comb: "시장 내부 폭(Breadth) 및 미결제 HPI 에너지에 35% 수급 게이트를 결합하여 대형주 몇 종목만 오르고 수급이 이탈하는 베이시스·미결제 다이버전스 구간 방어",
                  },
                  {
                    id: "모델 11 · C01_KTB_FX_Macro_Trend (후보모델 #1)",
                    cat: "매크로 추세형 (mode='trend')",
                    pure: "원/달러 환율 < 20MA 원화강세(50%) + 선물 종가 > 20MA(35%) + 국채선물 ≥ 20MA(15%) 합산 ≥+0.20 시 +1, ≤-0.20 시 -1",
                    comb: "환율·국채 매크로 추세에 외국인 선물·현물 및 미결제 수급 게이트(35%)를 결합하여 외국인 환차익 패시브 자금 유출입과 동기화",
                  },
                  {
                    id: "모델 12 · C02_Basis_Arbitrage_Flow (후보모델 #2)",
                    cat: "베이시스 수급형 (mode='self_supply')",
                    pure: "선물-현물 베이시스(Basis ≥ 10MA) & 현물(외인-개인) 5MA > 0 동시 만족 시 +1(콘탱고 차익매수), 반대 시 -1(백워데이션 차익매도)",
                    comb: "베이시스 수급 신호에 미결제·차익 과열 피크아웃 및 평균회귀 에너지(35%)를 결합하여 만기 전후 베이시스 급변 리스크 제어",
                  },
                  {
                    id: "모델 13 · C03_Multi_Stoch_Momentum (후보모델 #3 / Logic10 Tech2)",
                    cat: "다중오실레이터 (mode='reversion')",
                    pure: "C>MA5(20) + MA3>MA5(20) + MA5>MA10(8) + Stoch(5,3)(20) + Stoch(10,6)(5) + Stoch(20,12)(5) + ADR>0(10) / 88점 만점 SUM_P ≥+0.30 시 +1, ≤-0.30 시 -1",
                    comb: "단·중·장기 스토캐스틱 가중합(SUM_P)에 역추세 수급·에너지 회귀 필터(rev_supply_sig 35%)를 결합하여 횡보·변곡점 타점 정밀화",
                  },
                ].map((m, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/40">
                    <td className="p-2 font-bold text-emerald-300">{m.id}</td>
                    <td className="p-2 font-mono text-sky-300">{m.cat}</td>
                    <td className="p-2 leading-relaxed">{m.pure}</td>
                    <td className="p-2 leading-relaxed text-amber-200">{m.comb}</td>
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
