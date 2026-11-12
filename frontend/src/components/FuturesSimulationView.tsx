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
  const [mddThreshold, setMddThreshold] = useState(12.0);
  const [enableAutoSwap, setEnableAutoSwap] = useState(true);
  const [sharpeLookbackDays, setSharpeLookbackDays] = useState<number>(63); // 63=최근3개월, 126=최근6개월, 0=구간전체
  const [replacementMode, setReplacementMode] = useState<string>("HYBRID"); // HYBRID, PERIODIC_ONLY, MDD_RENEWAL_ONLY, MANUAL_FIXED
  const [periodicRebalanceDays, setPeriodicRebalanceDays] = useState<number>(63); // 63=3개월 정기교체, 126=6개월 정기교체
  const [mddTriggerMode, setMddTriggerMode] = useState<string>("RENEWAL_OR_LIMIT"); // RENEWAL_OR_LIMIT, RENEWAL_ONLY, LIMIT_ONLY
  const [portfolioRiskMode, setPortfolioRiskMode] = useState<string>("MODEL_SWAP_ONLY"); // MODEL_SWAP_ONLY, PORTFOLIO_SCALE_DOWN, PORTFOLIO_HARD_STOP
  const [portfolioMddLimit, setPortfolioMddLimit] = useState<number>(12.0); // 포트폴리오 위험 축소 / 실전 운용 중지 기준 한도(%)

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
  const [kisAutoExecInput, setKisAutoExecInput] = useState<boolean>(false);
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
    async (opts?: { start?: string; end?: string; current?: boolean; models?: string[]; pointVal?: number }) => {
      const targetStart = opts?.start ?? ledgerStartDate;
      const targetCurrent = opts?.current ?? ledgerUseCurrent;
      const targetEnd = targetCurrent ? "CURRENT" : opts?.end ?? ledgerEndDate;
      const targetModels = opts?.models ?? selectedModelIds;
      const targetPointVal = opts?.pointVal ?? pointValueKrw;

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
            enable_auto_mdd_swap: replacementMode !== "MANUAL_FIXED" && enableAutoSwap,
            combine_supply: combineSupply,
            supply_weight: supplyWeight / 100.0,
            sharpe_lookback_days: sharpeLookbackDays > 0 ? sharpeLookbackDays : null,
            record_swaps_to_db: false,
            replacement_mode: replacementMode,
            periodic_rebalance_days: periodicRebalanceDays,
            mdd_trigger_mode: mddTriggerMode,
            portfolio_risk_mode: portfolioRiskMode,
            portfolio_mdd_limit_pct: portfolioMddLimit,
          }),
        });
        if (res?.success && Array.isArray(res.data?.recent_trading_ledger)) {
          setStep5LedgerRows(res.data.recent_trading_ledger);
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
            combine_supply: combineSupply,
            supply_weight: supplyWeight / 100.0,
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

  // 장중 실시간 가격(rawdata.xlsx) 및 Step 5 포지션 변화 30초 자동 갱신 (Step 5에서만 작동)
  useEffect(() => {
    if (!autoRefreshRealtime || step !== 5) return;
    const timer = setInterval(async () => {
      try {
        const lockJson = await callApi(
          `/intraday-status?multiplier=${multiplier}&sync_now=true&point_value_krw=${pointValueKrw}&initial_capital_krw=${initialCapitalKrw}`
        );
        if (lockJson?.success) {
          setLockStatus(lockJson.data);
        }
      } catch (_) {
        // ignore background poll error
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [autoRefreshRealtime, step, callApi, multiplier, pointValueKrw, initialCapitalKrw]);

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
        const raw = st?.today_rawdata || {};
        const pos = st?.position_change_check || {};
        setBannerMsg(
          `[Step 5 실시간 rawdata.xlsx & 포지션 동기화 완료] ${raw.date || st?.trading_date} | 선물현재가 ${raw.fut_close ?? "-"}pt (${raw.fut_change_pt >= 0 ? "+" : ""}${raw.fut_change_pt ?? 0}pt) | 전일 ${pos.prev_contracts ?? 0}계약 → 당일 목표 ${pos.today_target_contracts ?? 0}계약 (동시호가 예상 Delta: ${pos.order_delta_contracts >= 0 ? "+" : ""}${pos.order_delta_contracts ?? 0}계약)`
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

  // 매매원장 기간 설정(ledgerStartDate ~ ledgerEndDate / 현재까지) 독립 필터링 (2018~ 시뮬레이션 구간과 완전 분리)
  const effectiveLedgerEnd = ledgerUseCurrent ? "9999-12-31" : ledgerEndDate;
  const rawLedgerPool: any[] = step5LedgerRows.length > 0 ? step5LedgerRows : ledgerRows;
  const activeLedgerRows = rawLedgerPool.filter((r: any) => {
    const d = String(r.date || "");
    return d >= ledgerStartDate && d <= effectiveLedgerEnd;
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
        {activeSubTab === "STEP4_MDD" && renderRiskPolicyClarificationPanel()}
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
            <span className="text-[10px] sm:text-xs font-mono text-indigo-400 font-bold">
              STOCK.AI-AUCTION-EXPERTS.CLOUD · KOSPI200 FUTURES 10-MODEL ENGINE
            </span>
            <h1 className="text-base sm:text-lg font-extrabold text-white leading-snug">
              KOSPI200 선물 10대 매매모델 실전 트레이딩 &amp; KOSPI200 비교 운용 시스템
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs">
            <span className="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-emerald-300 font-mono font-bold text-[11px] sm:text-xs">
              채택 ({selectedModelIds.length}개): {selectedModelIds.join(", ")}
            </span>
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

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-1.5 sm:gap-2">
          {[
            { id: 6, title: "🏆 실전 종합 & KOSPI200 비교", sub: "운용성과·모델별성과·매매원장 통합" },
            { id: 1, title: "Step 1. 추세·에너지 수급합산", sub: "신고신저×외인 + 차익·OI·PCR 회귀" },
            { id: 2, title: "Step 2. 구간 평가 & 모델 선택", sub: "모델별 운용성과 차트 & 선택" },
            { id: 3, title: "Step 3. 후속 구간 일관성 검증", sub: "포워드(3M/6M) 연속성 & 후보편입" },
            { id: 4, title: "Step 4. 최종 모델 운용성과", sub: "운용성과 차트·포지션차트·모델별성과" },
            { id: 5, title: "Step 5. 15:30 확정 & 매매원장", sub: "매매수익률·포지션 차트 & 매매원장" },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => setStep(m.id)}
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
                      <tr key={r.date} className="hover:bg-slate-800/50">
                        <td className="p-2 font-bold text-white">{r.date}</td>
                        <td className="p-2 text-right text-slate-300">{r.k200_close ?? "-"}</td>
                        <td className="p-2 text-right">{r.futures_close}</td>
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
                onChange={(e) => setCombineSupply(e.target.value === "true")}
                className="bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-white"
              >
                <option value="true">✅ 추세(신고신저×외인) + 횡보에너지(차익·OI·PCR) 합산</option>
                <option value="false">⚪ 순수 기술/고유 지표만 사용</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1">수급 가중치 ({supplyWeight}%)</label>
              <input
                type="range"
                min={10}
                max={65}
                step={5}
                value={supplyWeight}
                onChange={(e) => setSupplyWeight(Number(e.target.value))}
              />
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

            {/* 2) 당일 rawdata.xlsx 실시간 가격 & 4대 수급 현황판 */}
            {(() => {
              const raw = lockStatus?.today_rawdata || {};
              const futUp = (raw.fut_change_pt ?? 0) >= 0;
              const k200Up = (raw.k200_change_pt ?? 0) >= 0;
              const basisVal = raw.basis ?? 0;
              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-emerald-300">
                      📊 당일({raw.date || lockStatus?.trading_date || "2026-11-09"}) rawdata.xlsx 실시간 가격 및 수급 데이터 현황
                    </h4>
                    <span className="text-[11px] text-slate-400 font-mono">
                      전일({raw.prev_date || "-"}) 선물종가 {raw.prev_fut_close ?? "-"}pt / KOSPI200 {raw.prev_k200_close ?? "-"}pt 기준
                    </span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3">
                      <div className="text-[11px] text-slate-400">KOSPI200 선물 현재가(종가)</div>
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

                    <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3">
                      <div className="text-[11px] text-slate-400">KOSPI200 현물지수 현재가</div>
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

                    <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3">
                      <div className="text-[11px] text-slate-400">실시간 베이시스 &amp; 환율</div>
                      <div className={`text-base font-extrabold font-mono mt-0.5 ${basisVal >= 0 ? "text-sky-300" : "text-rose-300"}`}>
                        {basisVal >= 0 ? "+" : ""}
                        {basisVal}pt{" "}
                        <span className="text-[11px] font-sans">
                          ({basisVal >= 0 ? "콘탱고" : "백워데이션"})
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-300 font-mono mt-1">
                        원/달러: {raw.fx_close ?? "-"}원
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        KODEX레버리지: {(raw.kodex_leverage ?? 0).toLocaleString()}원
                      </div>
                    </div>

                    <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3">
                      <div className="text-[11px] text-slate-400">외국인 선물·현물 실시간 수급</div>
                      <div
                        className={`text-sm font-extrabold font-mono mt-0.5 ${
                          (raw.fut_foreign_net ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        선물외인: {(raw.fut_foreign_net ?? 0) >= 0 ? "+" : ""}
                        {Number(raw.fut_foreign_net ?? 0).toLocaleString()}계약
                      </div>
                      <div
                        className={`text-[11px] font-mono font-bold mt-1 ${
                          (raw.spot_foreign_net ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        현물외인: {(raw.spot_foreign_net ?? 0) >= 0 ? "+" : ""}
                        {Number(raw.spot_foreign_net ?? 0).toLocaleString()}억
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        현물개인: {Number(raw.spot_personal_net ?? 0).toLocaleString()}억
                      </div>
                    </div>

                    <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3">
                      <div className="text-[11px] text-slate-400">프로그램 차익 &amp; 미결제약정</div>
                      <div
                        className={`text-sm font-extrabold font-mono mt-0.5 ${
                          (raw.program_arb_net ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                        }`}
                      >
                        차익: {(raw.program_arb_net ?? 0) >= 0 ? "+" : ""}
                        {Number(raw.program_arb_net ?? 0).toLocaleString()}억
                      </div>
                      <div className="text-[11px] text-sky-300 font-mono font-bold mt-1">
                        미결제: {Number(raw.open_interest ?? 0).toLocaleString()}계약
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        전일비: {(raw.oi_change ?? 0) >= 0 ? "+" : ""}
                        {Number(raw.oi_change ?? 0).toLocaleString()}계약
                      </div>
                    </div>

                    <div className="bg-slate-950/90 border border-slate-800 rounded-lg p-3">
                      <div className="text-[11px] text-slate-400">심리(등락/신고) &amp; 옵션 PCR</div>
                      <div className="text-sm font-extrabold font-mono text-purple-300 mt-0.5">
                        PCR: {raw.pcr_ratio ?? "-"}배
                      </div>
                      <div className="text-[11px] text-slate-300 font-mono mt-1">
                        Call {raw.call_close ?? "-"} / Put {raw.put_close ?? "-"}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        등락가감 {raw.up_down_diff ?? 0} / 신고신저 {raw.new_high_low_diff ?? 0}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* 3) 전일 보유 vs 당일 장마감까지 실시간 포지션 변화 체크 & 15:35~15:45 동시호가 주문 확정 보드 */}
            {(() => {
              const pchk = lockStatus?.position_change_check || {};
              const prevPos = pchk.prev_base_position_sum ?? 0;
              const todayPos = pchk.today_base_position_sum ?? lockStatus?.base_position_sum ?? pm?.current_base_position ?? 0;
              const prevC = pchk.prev_contracts ?? lockStatus?.prev_contracts ?? 0;
              const targetC = pchk.today_target_contracts ?? lockStatus?.target_contracts ?? pm?.current_target_contracts ?? 0;
              const deltaC = pchk.order_delta_contracts ?? lockStatus?.order_delta_contracts ?? lt?.last_executed_delta_contracts ?? 0;
              const actStr = pchk.order_action || lockStatus?.order_action || lt?.last_executed_action || "포지션 유지";
              const dRet = pchk.today_daily_return_pct ?? 0;
              const dPnl = pchk.today_daily_pnl_krw ?? 0;
              const sigChanges: any[] = pchk.models_signal_changes || [];
              const timeline: any[] = lockStatus?.intraday_timeline || [];

              return (
                <div className="space-y-4 pt-2 border-t border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-extrabold text-amber-300">
                      ⚖️ 장 마감(15:30)까지 실시간 포지션 변화 체크 &amp; 15:35~15:45 종가 동시호가 주문수량(Delta) 확정판
                    </h4>
                    <span className="text-[11px] text-slate-300">
                      주력 5대 모델 중 당일 시그널 변동:{" "}
                      <strong className="text-amber-300">{pchk.changed_selected_models_count ?? 0}개 모델 전환</strong>{" "}
                      (전체 13개 모델 중 {pchk.changed_total_models_count ?? 0}개 전환)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-3.5">
                      <div className="text-[11px] text-slate-400">
                        ① 전일({pchk.prev_date || "전일"}) 보유 포지션
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
                        ② 당일({pchk.today_date || "당일"}) 실시간 목표 포지션
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

          {/* Step 5 매매원장의 매매수익률 차트 & 포지션 차트 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-extrabold text-emerald-300 mb-2">
                📈 매매원장의 일별 매매수익률(막대, %) &amp; 누적 매매수익률 vs KOSPI200 현물지수(선, %) 차트
              </h3>
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

          {/* Step 5 전체 구간 합산포지션(-5 ~ +5) 추이 차트 */}
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
              height={220}
            />
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
                    <tr key={r.date} className="hover:bg-slate-800/50">
                      <td className="p-2 font-bold text-white">{r.date}</td>
                      <td className="p-2 text-right text-slate-300">{r.k200_close ?? "-"}</td>
                      <td className="p-2 text-right">{r.futures_close}</td>
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
    </div>
  );
}
