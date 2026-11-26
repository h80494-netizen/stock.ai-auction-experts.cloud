"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from "recharts";

interface IntegratedPnlSummaryViewProps {
  userId?: string;
  userName?: string;
  isAdmin?: boolean;
  etfWeights?: { w1: number; w5: number; w20: number };
  stocks?: any[];
  onNavigateTab?: (tabId: string) => void;
}

const ETF_COLORS: Record<string, string> = {
  EWY: "#3b82f6",
  EWJ: "#ef4444",
  SPY: "#10b981",
  QQQ: "#8b5cf6",
  FXI: "#f97316",
  INDA: "#facc15",
  EWZ: "#14b8a6",
  EWA: "#6366f1",
  EZU: "#ec4899",
  USO: "#a16207",
  GLD: "#eab308",
  CASH: "#9ca3af",
};

const ETF_NAMES: Record<string, string> = {
  EWY: "한국 (MSCI South Korea)",
  EWJ: "일본 (MSCI Japan)",
  SPY: "미국 S&P 500",
  QQQ: "미국 나스닥 100",
  FXI: "중국 대형주",
  INDA: "인도 (MSCI India)",
  EWZ: "브라질 (MSCI Brazil)",
  EWA: "호주 (MSCI Australia)",
  EZU: "유럽 유로존",
  USO: "WTI 원유 선물",
  GLD: "금 현물 (Gold)",
  CASH: "현금 대피 (CASH)",
};

// 해외주식(미국 상장 ETF) 연간 양도소득세 기준: 기본공제 250만원 초과분에 대해 22% (양도세 20% + 지방소득세 2%)
const US_ANNUAL_DEDUCTION_KRW = 2500000;
const US_CAPITAL_GAINS_TAX_RATE = 0.22;

export default function IntegratedPnlSummaryView({
  userId = "admin",
  userName = "",
  isAdmin = false,
  etfWeights = { w1: 0.5, w5: 0.3, w20: 0.2 },
  stocks = [],
  onNavigateTab,
}: IntegratedPnlSummaryViewProps) {
  const effectiveUserId = (userId || "admin").trim() || "admin";
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<string>("");

  // 기간 필터
  const [periodPreset, setPeriodPreset] = useState<"TODAY" | "1M" | "3M" | "6M" | "YTD" | "ALL">("1M");
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date(Date.now() + 9 * 3600 * 1000);
    d.setDate(d.getDate() - 30);
    return d.toISOString().split("T")[0];
  });
  const [detailFilter, setDetailFilter] = useState<"ALL" | "TRADED_ONLY">("ALL");
  const [expandedDate, setExpandedDate] = useState<string | null>(null);
  const [includeUsCapitalGainsTax, setIncludeUsCapitalGainsTax] = useState<boolean>(true);
  const [compareMetricMode, setCompareMetricMode] = useState<"RETURN_PCT" | "PNL_MAN">("RETURN_PCT");

  // 1) 선물오버나잇자동매매 상태
  const [futuresSim, setFuturesSim] = useState<any>(null);
  const [futuresLock, setFuturesLock] = useState<any>(null);
  const [futuresKis, setFuturesKis] = useState<any>(null);

  // 2) 매수주문 (국내주식 외인수급) 상태
  const [krHoldings, setKrHoldings] = useState<any[]>([]);
  const [krLedgerHistory, setKrLedgerHistory] = useState<any[]>([]);
  const [krDetailedLedger, setKrDetailedLedger] = useState<any[]>([]);
  const [krLivePrices, setKrLivePrices] = useState<Record<string, number>>({});
  const [krOrderStatus, setKrOrderStatus] = useState<any>(null);

  // 3) ETF 투자전략 상태
  const [etfRanking, setEtfRanking] = useState<any[]>([]);
  const [etfSimData, setEtfSimData] = useState<any>(null);
  const [etfKisAccount, setEtfKisAccount] = useState<any>(null);

  const todayStr = useMemo(() => {
    return new Date(Date.now() + 9 * 3600 * 1000).toISOString().split("T")[0];
  }, []);

  const applyPreset = (preset: "TODAY" | "1M" | "3M" | "6M" | "YTD" | "ALL") => {
    setPeriodPreset(preset);
    const baseD = new Date(todayStr + "T00:00:00");
    if (preset === "TODAY") {
      setStartDate(todayStr);
    } else if (preset === "YTD") {
      setStartDate("2026-01-02");
    } else if (preset === "ALL") {
      setStartDate("2025-01-02");
    } else {
      const days = preset === "1M" ? 30 : preset === "3M" ? 90 : 180;
      baseD.setDate(baseD.getDate() - days);
      setStartDate(baseD.toISOString().split("T")[0]);
    }
  };

  const fetchAllIntegratedData = useCallback(
    async (isManual: boolean = false) => {
      if (isManual) setRefreshing(true);
      try {
        const ts = Date.now();
        const w1 = etfWeights?.w1 ?? 0.5;
        const w5 = etfWeights?.w5 ?? 0.3;
        const w20 = etfWeights?.w20 ?? 0.2;
        const cashTh =
          typeof window !== "undefined"
            ? Number(localStorage.getItem("etf_cash_threshold_annual") || 10)
            : 10;

        const [
          futRunRes,
          futLockRes,
          futKisRes,
          holdRes,
          ledHistRes,
          detLedRes,
          ordStRes,
          etfStratRes,
          etfSimRes,
          etfKisRes,
        ] = await Promise.allSettled([
          fetch("/api/futures-sim/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              start_date: "2024-01-02",
              end_date: "CURRENT",
              multiplier: 1,
              point_value_krw: 50000,
              initial_capital_krw: 100000000,
              mdd_threshold_pct: 15.0,
              enable_auto_mdd_swap: false,
              replacement_mode: "MANUAL_FIXED",
              combine_supply: true,
              supply_weight: 0.35,
            }),
          }).then((r) => (r.ok ? r.json() : null)),
          fetch(
            `/api/futures-sim/intraday-status?multiplier=1&sync_now=${isManual ? "true" : "false"}&point_value_krw=50000&initial_capital_krw=100000000`
          ).then((r) => (r.ok ? r.json() : null)),
          fetch("/api/futures-sim/kis-account").then((r) => (r.ok ? r.json() : null)),
          fetch(`/api/holdings?user_id=${encodeURIComponent(effectiveUserId)}`, {
            headers: { "x-user-id": effectiveUserId },
          }).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/ledger-history?user_id=${encodeURIComponent(effectiveUserId)}`, {
            headers: { "x-user-id": effectiveUserId },
          }).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/detailed-trading-ledger?user_id=${encodeURIComponent(effectiveUserId)}`, {
            headers: { "x-user-id": effectiveUserId },
          }).then((r) => (r.ok ? r.json() : [])),
          fetch(`/api/kis/order-status?user_id=${encodeURIComponent(effectiveUserId)}`, {
            headers: { "x-user-id": effectiveUserId },
          }).then((r) => (r.ok ? r.json() : null)),
          fetch(
            `/api/etf/strategy?criteria=sharpe&top_n=1&w1=${w1}&w5=${w5}&w20=${w20}&cash_threshold=${cashTh}&t=${ts}`
          ).then((r) => (r.ok ? r.json() : [])),
          fetch(
            `/api/etf/simulation?criteria=sharpe&top_n=1&w1=${w1}&w5=${w5}&w20=${w20}&cash_threshold=${cashTh}&t=${ts}`
          ).then((r) => (r.ok ? r.json() : null)),
          fetch(
            `/api/etf/kis-account?criteria=sharpe&top_n=1&w1=${w1}&w5=${w5}&w20=${w20}&user_id=${encodeURIComponent(effectiveUserId)}&order_budget_krw=50000000&t=${ts}`,
            { headers: { "x-user-id": effectiveUserId } }
          ).then((r) => (r.ok ? r.json() : null)),
        ]);

        if (futRunRes.status === "fulfilled" && futRunRes.value?.success) {
          setFuturesSim(futRunRes.value.data);
        }
        if (futLockRes.status === "fulfilled" && futLockRes.value?.success) {
          setFuturesLock(futLockRes.value.data);
        }
        if (futKisRes.status === "fulfilled" && futKisRes.value?.success) {
          setFuturesKis(futKisRes.value.data);
        }

        let latestHoldings: any[] = [];
        if (holdRes.status === "fulfilled" && Array.isArray(holdRes.value)) {
          latestHoldings = holdRes.value;
          setKrHoldings(holdRes.value);
        }
        if (ledHistRes.status === "fulfilled" && Array.isArray(ledHistRes.value)) {
          setKrLedgerHistory(ledHistRes.value);
        }
        if (detLedRes.status === "fulfilled" && Array.isArray(detLedRes.value)) {
          setKrDetailedLedger(detLedRes.value);
        }
        if (ordStRes.status === "fulfilled" && ordStRes.value) {
          setKrOrderStatus(ordStRes.value);
        }
        if (etfStratRes.status === "fulfilled" && Array.isArray(etfStratRes.value)) {
          setEtfRanking(etfStratRes.value);
        }
        if (etfSimRes.status === "fulfilled" && etfSimRes.value) {
          setEtfSimData(etfSimRes.value);
        }
        if (etfKisRes.status === "fulfilled" && etfKisRes.value?.success) {
          setEtfKisAccount(etfKisRes.value.data);
        }

        // 보유 중인 국내주식 실시간 현재가 조회
        if (latestHoldings.length > 0) {
          const tickersStr = latestHoldings.map((h: any) => h.ticker).join(",");
          try {
            const qRes = await fetch(`/api/realtime-quotes?tickers=${encodeURIComponent(tickersStr)}`);
            if (qRes.ok) {
              const qData = await qRes.json();
              const pMap: Record<string, number> = {};
              Object.keys(qData || {}).forEach((k) => {
                if (qData[k]?.price > 0) pMap[k] = Number(qData[k].price);
              });
              setKrLivePrices((prev) => ({ ...prev, ...pMap }));
            }
          } catch {
            // ignore
          }
        }

        const nowKst = new Date(Date.now() + 9 * 3600 * 1000)
          .toISOString()
          .replace("T", " ")
          .slice(0, 19);
        setLastSyncedAt(nowKst);
      } catch (err) {
        console.error("Failed to fetch integrated PnL summary:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [effectiveUserId, etfWeights]
  );

  useEffect(() => {
    fetchAllIntegratedData(false);
    const timer = setInterval(() => {
      if (!document.hidden) fetchAllIntegratedData(false);
    }, 20000);
    return () => clearInterval(timer);
  }, [fetchAllIntegratedData]);

  // ============================================================================
  // 0) 일자별 실제 원/달러(USD/KRW) 환율 시계열 및 최신 적용 환율 산출
  // ============================================================================
  const fxByDateMap = useMemo(() => {
    const map: Record<string, number> = {};
    const ledger: any[] = futuresSim?.recent_trading_ledger || [];
    ledger.forEach((r: any) => {
      const d = String(r.date || "");
      const fx = Number(r.fx_close || 0);
      if (d && fx > 800) {
        map[d] = fx;
      }
    });
    const rawFx = Number(futuresLock?.today_rawdata?.fx_close || 0);
    if (rawFx > 800) {
      map[todayStr] = rawFx;
    }
    return map;
  }, [futuresSim, futuresLock, todayStr]);

  const usdKrwRate = useMemo(() => {
    const rawFx = Number(futuresLock?.today_rawdata?.fx_close || 0);
    if (rawFx > 800) return rawFx;
    const kisFx = Number(etfKisAccount?.signal?.usd_krw_rate || etfKisAccount?.config?.usd_krw_rate || 0);
    if (kisFx > 800) return kisFx;
    const dates = Object.keys(fxByDateMap).sort();
    if (dates.length > 0) return fxByDateMap[dates[dates.length - 1]];
    return 1400;
  }, [futuresLock, etfKisAccount, fxByDateMap]);

  // ============================================================================
  // 1) 선물오버나잇자동매매 일별 손익 및 당일 포지션 요약
  // ============================================================================
  const futuresByDate = useMemo(() => {
    const map: Record<
      string,
      {
        date: string;
        prevContracts: number;
        targetContracts: number;
        deltaContracts: number;
        orderAction: string;
        futClose: number;
        k200Close: number;
        dailyPnlKrw: number;
        dailyRetPct: number;
        regimeLabel: string;
      }
    > = {};
    const ledger: any[] = futuresSim?.recent_trading_ledger || [];
    ledger.forEach((r: any) => {
      const d = String(r.date || "");
      if (!d) return;
      map[d] = {
        date: d,
        prevContracts: Number(r.prev_contracts ?? 0),
        targetContracts: Number(r.target_contracts ?? 0),
        deltaContracts: Number(r.order_delta_contracts ?? 0),
        orderAction: String(r.order_action || "포지션 유지(0)"),
        futClose: Number(r.futures_close ?? 0),
        k200Close: Number(r.k200_close ?? 0),
        dailyPnlKrw: Math.round(Number(r.daily_pnl_krw ?? 0)),
        dailyRetPct: Number(r.daily_return_pct ?? 0),
        regimeLabel: String(r.regime_mode_label || "🚀 추세+수급"),
      };
    });

    // 당일 실시간 Lock/포지션 카드 오버라이드
    const pchk = futuresLock?.position_change_check;
    const raw = futuresLock?.today_rawdata;
    const tDate = String(pchk?.today_date || raw?.date || "");
    if (tDate) {
      map[tDate] = {
        date: tDate,
        prevContracts: Number(pchk?.prev_contracts ?? futuresLock?.prev_contracts ?? map[tDate]?.prevContracts ?? 0),
        targetContracts: Number(
          pchk?.today_target_contracts ?? futuresLock?.target_contracts ?? map[tDate]?.targetContracts ?? 0
        ),
        deltaContracts: Number(
          pchk?.order_delta_contracts ?? futuresLock?.order_delta_contracts ?? map[tDate]?.deltaContracts ?? 0
        ),
        orderAction: String(pchk?.order_action ?? futuresLock?.order_action ?? map[tDate]?.orderAction ?? "포지션 유지"),
        futClose: Number(raw?.fut_close ?? map[tDate]?.futClose ?? 0),
        k200Close: Number(raw?.k200_close ?? map[tDate]?.k200Close ?? 0),
        dailyPnlKrw: Math.round(Number(pchk?.today_daily_pnl_krw ?? map[tDate]?.dailyPnlKrw ?? 0)),
        dailyRetPct: Number(pchk?.today_daily_return_pct ?? map[tDate]?.dailyRetPct ?? 0),
        regimeLabel: String(raw?.regime_mode_label ?? map[tDate]?.regimeLabel ?? "🚀 추세+수급 5대모델"),
      };
    }
    return map;
  }, [futuresSim, futuresLock]);

  // ============================================================================
  // 2) 매수주문 (외국계 순매수 상위 국내주식) 일별 손익 및 매수종목 요약
  // ============================================================================
  const krStockLiveSummary = useMemo(() => {
    let buyAmt = 0;
    let evalAmt = 0;
    let livePnl = 0;
    const stockItems: Array<{
      ticker: string;
      name: string;
      qty: number;
      buyPrice: number;
      currPrice: number;
      pnl: number;
      retPct: number;
      status: string;
    }> = [];

    const heldSet = new Set<string>();
    krHoldings.forEach((h: any) => {
      const cleanTk = String(h.ticker || "").split(":").pop() || String(h.ticker || "");
      heldSet.add(cleanTk);
      const stObj = stocks.find(
        (s: any) => s.ticker === h.ticker || s.ticker === cleanTk || s.ticker === `KRX:${cleanTk}`
      );
      const lp =
        krLivePrices[h.ticker] ||
        krLivePrices[cleanTk] ||
        krLivePrices[`KRX:${cleanTk}`] ||
        stObj?.price ||
        h.currentPrice ||
        h.buyPrice ||
        0;
      const bp = Number(h.buyPrice || h.buy_price || 0);
      const q = Number(h.qty || 0);
      const bTotal = bp * q;
      const cTotal = lp * q;
      const diff = cTotal - bTotal;
      buyAmt += bTotal;
      evalAmt += cTotal;
      livePnl += diff;
      stockItems.push({
        ticker: cleanTk,
        name: h.name || cleanTk,
        qty: q,
        buyPrice: bp,
        currPrice: lp,
        pnl: Math.round(diff),
        retPct: bTotal > 0 ? Number(((diff / bTotal) * 100).toFixed(2)) : 0,
        status: "보유중",
      });
    });

    // 당일 장중 매도확정 종목 또는 금일 종가청산 종목 포함
    const todaySold = krDetailedLedger.filter(
      (r: any) => r.trade_date === todayStr && r.status === "SELL"
    );
    const todaySettledHistory = krLedgerHistory.find((h: any) => h.date === todayStr);

    todaySold.forEach((r: any) => {
      const cleanTk = String(r.ticker || "").split(":").pop() || String(r.ticker || "");
      if (heldSet.has(cleanTk)) return;
      const bp = Number(r.buy_price || 0);
      const sp = Number(r.sell_price || bp);
      const q = Number(r.qty || 0);
      const bTotal = bp * q;
      const sTotal = sp * q;
      const pnlVal = r.pnl !== undefined && r.pnl !== null ? Number(r.pnl) : sTotal - bTotal;
      buyAmt += bTotal;
      evalAmt += sTotal;
      livePnl += pnlVal;
      stockItems.push({
        ticker: cleanTk,
        name: r.name || cleanTk,
        qty: q,
        buyPrice: bp,
        currPrice: sp,
        pnl: Math.round(pnlVal),
        retPct: bTotal > 0 ? Number(((pnlVal / bTotal) * 100).toFixed(2)) : 0,
        status: r.sell_type === "INTRADAY" ? "장중매도" : "종가청산",
      });
    });

    if (krHoldings.length === 0 && todaySettledHistory) {
      buyAmt = Number(todaySettledHistory.total_buy) || buyAmt;
      evalAmt = Number(todaySettledHistory.total_sell) || evalAmt;
      livePnl = Number(todaySettledHistory.net_pnl) || livePnl;
    }

    return {
      buyAmt: Math.round(buyAmt),
      evalAmt: Math.round(evalAmt),
      livePnl: Math.round(livePnl),
      retPct: buyAmt > 0 ? Number(((livePnl / buyAmt) * 100).toFixed(2)) : 0,
      stockItems,
    };
  }, [krHoldings, krDetailedLedger, krLedgerHistory, krLivePrices, stocks, todayStr]);

  const krByDate = useMemo(() => {
    const map: Record<
      string,
      {
        date: string;
        totalBuy: number;
        totalSell: number;
        netPnlKrw: number;
        retPct: number;
        stockCount: number;
        stockNamesSummary: string;
        stocksList: Array<{ ticker: string; name: string; qty: number; pnl: number; status: string }>;
        statusLabel: string;
      }
    > = {};

    const detailsByDate: Record<string, any[]> = {};
    krDetailedLedger.forEach((r: any) => {
      const d = String(r.trade_date || "");
      if (!d) return;
      if (!detailsByDate[d]) detailsByDate[d] = [];
      detailsByDate[d].push(r);
    });

    krLedgerHistory.forEach((h: any) => {
      const d = String(h.date || "");
      if (!d) return;
      const dRows = detailsByDate[d] || [];
      const uniqueStocksMap = new Map<string, { ticker: string; name: string; qty: number; pnl: number; status: string }>();
      dRows.forEach((r: any) => {
        const tk = String(r.ticker || "").split(":").pop() || String(r.ticker || "");
        const bp = Number(r.buy_price || 0);
        const sp = Number(r.sell_price || bp);
        const q = Number(r.qty || 0);
        const p = r.pnl !== undefined && r.pnl !== null ? Number(r.pnl) : (sp - bp) * q;
        uniqueStocksMap.set(tk, {
          ticker: tk,
          name: r.name || tk,
          qty: q,
          pnl: Math.round(p),
          status: r.status === "SELL" ? (r.sell_type === "INTRADAY" ? "장중매도" : "종가청산") : "보유중",
        });
      });
      const sList = Array.from(uniqueStocksMap.values());
      const topNames = sList
        .slice(0, 3)
        .map((s) => s.name)
        .join(", ");
      const summaryText =
        sList.length > 3
          ? `${topNames} 외 ${sList.length - 3}종목 (총 ${sList.length}종목)`
          : sList.length > 0
          ? `${topNames} (${sList.length}종목)`
          : "일괄청산 정산완료";

      map[d] = {
        date: d,
        totalBuy: Math.round(Number(h.total_buy || 0)),
        totalSell: Math.round(Number(h.total_sell || 0)),
        netPnlKrw: Math.round(Number(h.net_pnl || 0)),
        retPct: Number(h.return_rate || 0),
        stockCount: sList.length,
        stockNamesSummary: summaryText,
        stocksList: sList,
        statusLabel: "종가청산 완료",
      };
    });

    if (krHoldings.length > 0 || (krStockLiveSummary.stockItems.length > 0 && !map[todayStr])) {
      const sList = krStockLiveSummary.stockItems.map((it) => ({
        ticker: it.ticker,
        name: it.name,
        qty: it.qty,
        pnl: it.pnl,
        status: it.status,
      }));
      const topNames = sList
        .slice(0, 3)
        .map((s) => s.name)
        .join(", ");
      const summaryText =
        sList.length > 3
          ? `${topNames} 외 ${sList.length - 3}종목 (보유 ${krHoldings.length}종목)`
          : sList.length > 0
          ? `${topNames} (${sList.length}종목)`
          : "매수 대기 (0종목)";

      map[todayStr] = {
        date: todayStr,
        totalBuy: krStockLiveSummary.buyAmt,
        totalSell: krStockLiveSummary.evalAmt,
        netPnlKrw: krStockLiveSummary.livePnl,
        retPct: krStockLiveSummary.retPct,
        stockCount: sList.length,
        stockNamesSummary: summaryText,
        stocksList: sList,
        statusLabel: krHoldings.length > 0 ? `장중 보유 (${krHoldings.length}종목)` : "청산 완료",
      };
    }

    return map;
  }, [krLedgerHistory, krDetailedLedger, krHoldings, krStockLiveSummary, todayStr]);

  // ============================================================================
  // 3) ETF 투자전략:
  //    - 국내시간(KST) 기준 오늘 손익에 미국 ETF 최신 거래일 손익을 자동 정렬/합산
  //    - 일자별 적용 원/달러 환율(fxRate) 명시
  //    - 미국의 매년 자본차익세(해외주식 양도소득세: 연간 250만원 기본공제 후 22%)를 감안한 세후 실질 손익/수익률 산출
  // ============================================================================
  const etfBudgetKrw = useMemo(() => {
    return Math.max(100000, Number(etfKisAccount?.config?.order_budget_krw || 50000000));
  }, [etfKisAccount]);

  const etfByDate = useMemo(() => {
    const map: Record<
      string,
      {
        date: string;
        usTradeDate: string;
        prevHeld: string;
        targetEtf: string;
        targetEtfName: string;
        isHolding: boolean;
        tradeStatus: string;
        orderDetail: string;
        fxRate: number;
        grossDailyPnlUsd: number;
        grossDailyPnlKrw: number;
        grossDailyRetPct: number;
        annualTaxAccruedKrw: number;
        dailyTaxKrw: number;
        netDailyPnlKrw: number;
        netDailyRetPct: number;
        dailyPnlKrw: number;
        dailyRetPct: number;
        priceUsd: number;
        qty: number;
      }
    > = {};

    if (!etfSimData || !Array.isArray(etfSimData.dates) || etfSimData.dates.length < 2) {
      return map;
    }

    const rawPricesMap: Record<string, number[]> = etfSimData.etf_prices || {};
    const livePriceMap: Record<string, number> = {};
    etfRanking.forEach((it: any) => {
      if (it?.ticker && Number(it.current_price) > 0) {
        livePriceMap[it.ticker] = Number(it.current_price);
      }
    });

    const getTickerPriceAt = (tkr: string, idx: number) => {
      if (!tkr || tkr === "CASH" || tkr === "Waiting") return 0;
      const arr = rawPricesMap[tkr];
      if (arr && arr[idx] && Number(arr[idx]) > 0) return Number(arr[idx]);
      return livePriceMap[tkr] || 100;
    };

    const dates: string[] = etfSimData.dates;
    const stratArr: number[] = etfSimData.strategy || [];
    const selArr: string[] = etfSimData.selected_etf || [];

    // 국내 거래일 목록 (미국장 마감일 T_US -> 한국시간 익일 아침 06:00 KST 확정이므로, 최신 미국 거래일이 오늘 KST보다 이전이면 국내시간 기준 오늘(todayStr) 손익에 합산)
    const lastValidIdx = dates.length - 1;
    const lastUsDate = String(dates[lastValidIdx] || "");

    // 연도별 누적 세전 양도차익 및 기반영 세액 추적 (매년 250만원 공제 후 22% 과세)
    const yearCumGainMap: Record<string, number> = {};
    const yearCumTaxMap: Record<string, number> = {};

    for (let i = 1; i < dates.length; i++) {
      const usDate = String(dates[i] || "");
      if (!usDate || selArr[i] === "Waiting") continue;

      // 국내시간(KST) 기준 매핑: 최신 미국장 거래일(예: 11/25 미국장 마감 -> 11/26 06:00 KST 확정)을 오늘(todayStr) 행에 정렬하여 오늘 통합손익에 합산
      const kstDate = i === lastValidIdx && lastUsDate < todayStr ? todayStr : usDate;
      const yearKey = kstDate.slice(0, 4);

      const prevRaw = String(selArr[i - 1] || "CASH");
      const prevHeld = prevRaw === "Waiting" || !prevRaw ? "CASH" : prevRaw;
      const tgtRaw = String(selArr[i] || "CASH");
      const targetEtf = tgtRaw === "Waiting" || !tgtRaw ? "CASH" : tgtRaw;

      const fxAtDate = Number(fxByDateMap[kstDate] || fxByDateMap[usDate] || usdKrwRate || 1400);
      const prevVal = Number(stratArr[i - 1]) || 100;
      const curVal = Number(stratArr[i]) || prevVal;
      const grossDailyRetPct = prevVal > 0 ? ((curVal - prevVal) / prevVal) * 100 : 0;
      const grossDailyPnlKrw = Math.round(etfBudgetKrw * (grossDailyRetPct / 100));
      const grossDailyPnlUsd = Number((grossDailyPnlKrw / fxAtDate).toFixed(2));

      // 연간 미국 ETF 자본차익세(양도소득세 22%, 연 250만원 기본공제) 일별 누적 정산
      const prevYearGain = yearCumGainMap[yearKey] || 0;
      const nextYearGain = prevYearGain + grossDailyPnlKrw;
      yearCumGainMap[yearKey] = nextYearGain;

      const prevYearTax = yearCumTaxMap[yearKey] || 0;
      const taxableAnnualGain = Math.max(0, nextYearGain - US_ANNUAL_DEDUCTION_KRW);
      const targetYearTax = Math.round(taxableAnnualGain * US_CAPITAL_GAINS_TAX_RATE);
      const dailyTaxKrw = targetYearTax - prevYearTax;
      yearCumTaxMap[yearKey] = targetYearTax;

      const netDailyPnlKrw = grossDailyPnlKrw - dailyTaxKrw;
      const netDailyRetPct = Number(((netDailyPnlKrw / etfBudgetKrw) * 100).toFixed(2));

      const activeDailyPnlKrw = includeUsCapitalGainsTax ? netDailyPnlKrw : grossDailyPnlKrw;
      const activeDailyRetPct = includeUsCapitalGainsTax ? netDailyRetPct : Number(grossDailyRetPct.toFixed(2));

      const priceUsd = getTickerPriceAt(targetEtf.split(",")[0].trim(), i);
      const qty = priceUsd > 0 ? Math.max(1, Math.floor(etfBudgetKrw / (priceUsd * fxAtDate))) : 0;
      const isSame = prevHeld === targetEtf;

      let tradeStatus = "Holding";
      let orderDetail =
        targetEtf === "CASH"
          ? "CASH 현금 보유 유지"
          : `${targetEtf} ${qty.toLocaleString()}주 ($${priceUsd.toFixed(2)} · 환율 ${fxAtDate.toLocaleString()}원) 계속 보유`;
      if (!isSame) {
        if (prevHeld !== "CASH" && targetEtf !== "CASH") {
          tradeStatus = `교체 (${prevHeld}→${targetEtf})`;
          orderDetail = `매도 ${prevHeld} + 매수 ${targetEtf} ${qty.toLocaleString()}주 ($${priceUsd.toFixed(2)} · 환율 ${fxAtDate.toLocaleString()}원)`;
        } else if (prevHeld === "CASH" && targetEtf !== "CASH") {
          tradeStatus = `신규편입 (${targetEtf})`;
          orderDetail = `신규매수 ${targetEtf} ${qty.toLocaleString()}주 ($${priceUsd.toFixed(2)} · 환율 ${fxAtDate.toLocaleString()}원)`;
        } else {
          tradeStatus = `현금전환 (${prevHeld}→CASH)`;
          orderDetail = `전량매도 ${prevHeld} → CASH 대피`;
        }
      }

      map[kstDate] = {
        date: kstDate,
        usTradeDate: usDate,
        prevHeld,
        targetEtf,
        targetEtfName: ETF_NAMES[targetEtf] || targetEtf,
        isHolding: isSame,
        tradeStatus,
        orderDetail,
        fxRate: fxAtDate,
        grossDailyPnlUsd,
        grossDailyPnlKrw,
        grossDailyRetPct: Number(grossDailyRetPct.toFixed(2)),
        annualTaxAccruedKrw: targetYearTax,
        dailyTaxKrw,
        netDailyPnlKrw,
        netDailyRetPct,
        dailyPnlKrw: activeDailyPnlKrw,
        dailyRetPct: activeDailyRetPct,
        priceUsd,
        qty,
      };
    }

    return map;
  }, [etfSimData, etfRanking, etfBudgetKrw, usdKrwRate, fxByDateMap, todayStr, includeUsCapitalGainsTax]);

  // ============================================================================
  // 4) 전체 일자별 통합 시계열 (직전 1개월/3개월/6개월 비교 및 마스터 요약표 공용)
  // ============================================================================
  const allCombinedChrono = useMemo(() => {
    const allDatesSet = new Set<string>([
      ...Object.keys(futuresByDate),
      ...Object.keys(krByDate),
      ...Object.keys(etfByDate),
    ]);
    const sortedAsc = Array.from(allDatesSet).sort((a, b) => a.localeCompare(b));
    const totalCapitalBase = 100000000 + 100000000 + etfBudgetKrw; // 선물 1억 + 매수주문 1억 + ETF 5천만 = 2.5억

    return sortedAsc.map((d) => {
      const f = futuresByDate[d] || null;
      const k = krByDate[d] || null;
      const e = etfByDate[d] || null;

      const fPnl = f ? f.dailyPnlKrw : 0;
      const kPnl = k ? k.netPnlKrw : 0;
      const ePnl = e ? e.dailyPnlKrw : 0;
      const eGrossPnl = e ? e.grossDailyPnlKrw : 0;
      const eTaxKrw = e ? e.dailyTaxKrw : 0;
      const dayTotalPnl = fPnl + kPnl + ePnl;
      const dayTotalRetPct = Number(((dayTotalPnl / totalCapitalBase) * 100).toFixed(3));

      const hasAnyActivity =
        (f && (f.prevContracts !== 0 || f.targetContracts !== 0 || f.deltaContracts !== 0 || f.dailyPnlKrw !== 0)) ||
        (k && (k.stockCount > 0 || k.netPnlKrw !== 0 || k.totalBuy > 0)) ||
        (e && (e.targetEtf !== "CASH" || !e.isHolding || e.dailyPnlKrw !== 0));

      return {
        date: d,
        futures: f,
        krOrder: k,
        etf: e,
        fPnl,
        kPnl,
        ePnl,
        eGrossPnl,
        eTaxKrw,
        dayTotalPnl,
        dayTotalRetPct,
        hasAnyActivity: Boolean(hasAnyActivity),
      };
    });
  }, [futuresByDate, krByDate, etfByDate, etfBudgetKrw]);

  // 선택된 기간(startDate ~ 현재)의 통합손익관리 마스터 요약표 행 산출
  const integratedRowsDesc = useMemo(() => {
    const filteredAsc = allCombinedChrono.filter((r) => r.date >= startDate);
    let cumFutKrw = 0;
    let cumKrKrw = 0;
    let cumEtfKrw = 0;
    let cumEtfGrossKrw = 0;
    let cumEtfTaxKrw = 0;
    let cumTotalKrw = 0;
    const totalCapitalBase = 100000000 + 100000000 + etfBudgetKrw;

    const withCumAsc = filteredAsc.map((r) => {
      cumFutKrw += r.fPnl;
      cumKrKrw += r.kPnl;
      cumEtfKrw += r.ePnl;
      cumEtfGrossKrw += r.eGrossPnl;
      cumEtfTaxKrw += r.eTaxKrw;
      cumTotalKrw += r.dayTotalPnl;
      const cumTotalRetPct = Number(((cumTotalKrw / totalCapitalBase) * 100).toFixed(2));
      return {
        ...r,
        cumFutKrw,
        cumKrKrw,
        cumEtfKrw,
        cumEtfGrossKrw,
        cumEtfTaxKrw,
        cumTotalKrw,
        cumTotalRetPct,
      };
    });

    const filtered =
      detailFilter === "TRADED_ONLY" ? withCumAsc.filter((r) => r.hasAnyActivity) : withCumAsc;
    return [...filtered].reverse();
  }, [allCombinedChrono, startDate, etfBudgetKrw, detailFilter]);

  // ============================================================================
  // 5) 최근 구간(0 ~ -N일) vs 직전 구간(-N일 ~ -2N일) 오버레이 비교 그래프 데이터
  //    - 1개월: X축 0일 ~ -30일 (최근 1개월 vs 직전 1개월[-30일~-60일])
  //    - 3개월: X축 0일 ~ -90일 (최근 3개월 vs 직전 3개월[-90일~-180일])
  //    - 6개월: X축 0일 ~ -180일 (최근 6개월 vs 직전 6개월[-180일~-360일])
  // ============================================================================
  const periodOverlayComparison = useMemo(() => {
    const windowDays =
      periodPreset === "1M"
        ? 30
        : periodPreset === "3M"
        ? 90
        : periodPreset === "6M"
        ? 180
        : periodPreset === "TODAY"
        ? 30
        : 90;
    const labelName =
      windowDays === 30 ? "1개월(30일)" : windowDays === 90 ? "3개월(90일)" : "6개월(180일)";

    const refToday = new Date(todayStr + "T00:00:00");
    const fmtDate = (dt: Date) => dt.toISOString().split("T")[0];

    const curStartDt = new Date(refToday);
    curStartDt.setDate(curStartDt.getDate() - windowDays);
    const prevStartDt = new Date(refToday);
    prevStartDt.setDate(prevStartDt.getDate() - windowDays * 2);

    const curStartStr = fmtDate(curStartDt);
    const prevStartStr = fmtDate(prevStartDt);

    // 날짜별 일간 손익 및 KOSPI(k200Close) 지수 맵
    const dailyMap = new Map<string, { dayTotalPnl: number; fPnl: number; kPnl: number; ePnl: number; k200Close: number }>();
    let lastValidK200 = 0;
    allCombinedChrono.forEach((r) => {
      const k200 = Number(r.futures?.k200Close || 0);
      if (k200 > 0) lastValidK200 = k200;
      dailyMap.set(r.date, {
        dayTotalPnl: r.dayTotalPnl,
        fPnl: r.fPnl,
        kPnl: r.kPnl,
        ePnl: r.ePnl,
        k200Close: k200 > 0 ? k200 : lastValidK200,
      });
    });

    const totalCapitalBase = 100000000 + 100000000 + etfBudgetKrw;

    // 1) 최근 구간(-windowDays ~ 0일)과 직전 구간(-2*windowDays ~ -windowDays일)을 각각 기준시점(-windowDays)에서 0%로 누적 계산한 뒤
    //    X축을 -windowDays(기준시점)부터 0일(현재시점)까지 오른쪽으로 펼쳐지도록 표시
    const curDailyList: Array<{ offsetFromEnd: number; dateStr: string; pnl: number; k200Close: number }> = [];
    const prevDailyList: Array<{ offsetFromEnd: number; dateStr: string; pnl: number; k200Close: number }> = [];

    let curCarryK200 = 0;
    let prevCarryK200 = 0;
    // 기준시점 이전 가장 가까운 거래일 KOSPI 지수 탐색 (주말/휴일 시작일 보정)
    for (let lookback = windowDays + 7; lookback >= windowDays; lookback--) {
      const dt1 = new Date(refToday);
      dt1.setDate(dt1.getDate() - lookback);
      const obj1 = dailyMap.get(fmtDate(dt1));
      if (obj1 && obj1.k200Close > 0) curCarryK200 = obj1.k200Close;

      const dt2 = new Date(curStartDt);
      dt2.setDate(dt2.getDate() - lookback);
      const obj2 = dailyMap.get(fmtDate(dt2));
      if (obj2 && obj2.k200Close > 0) prevCarryK200 = obj2.k200Close;
    }

    for (let step = windowDays; step >= 0; step--) {
      // step = windowDays (구간 시작일, X축 = -windowDays) -> step = 0 (구간 종료일, X축 = 0)
      const cDt = new Date(refToday);
      cDt.setDate(cDt.getDate() - step);
      const cStr = fmtDate(cDt);
      const cObj = dailyMap.get(cStr);
      if (cObj && cObj.k200Close > 0) curCarryK200 = cObj.k200Close;
      curDailyList.push({
        offsetFromEnd: -step,
        dateStr: cStr,
        pnl: cObj ? cObj.dayTotalPnl : 0,
        k200Close: curCarryK200,
      });

      const pDt = new Date(curStartDt);
      pDt.setDate(pDt.getDate() - step);
      const pStr = fmtDate(pDt);
      const pObj = dailyMap.get(pStr);
      if (pObj && pObj.k200Close > 0) prevCarryK200 = pObj.k200Close;
      prevDailyList.push({
        offsetFromEnd: -step,
        dateStr: pStr,
        pnl: pObj ? pObj.dayTotalPnl : 0,
        k200Close: prevCarryK200,
      });
    }

    const baseCurK200 = curDailyList.find((x) => x.k200Close > 0)?.k200Close || 0;
    const basePrevK200 = prevDailyList.find((x) => x.k200Close > 0)?.k200Close || 0;

    let curCumPnl = 0;
    let prevCumPnl = 0;

    const pointsFromStartToEnd = curDailyList.map((cItem, idx) => {
      const pItem = prevDailyList[idx];
      curCumPnl += cItem.pnl;
      prevCumPnl += pItem.pnl;

      const curRetPct = Number(((curCumPnl / totalCapitalBase) * 100).toFixed(2));
      const prevRetPct = Number(((prevCumPnl / totalCapitalBase) * 100).toFixed(2));
      const curKospiRetPct =
        baseCurK200 > 0 && cItem.k200Close > 0
          ? Number((((cItem.k200Close - baseCurK200) / baseCurK200) * 100).toFixed(2))
          : 0;
      const prevKospiRetPct =
        basePrevK200 > 0 && pItem.k200Close > 0
          ? Number((((pItem.k200Close - basePrevK200) / basePrevK200) * 100).toFixed(2))
          : 0;

      return {
        dayAxisLabel: `${cItem.offsetFromEnd}일`,
        dayOffset: cItem.offsetFromEnd,
        curDate: cItem.dateStr,
        prevDate: pItem.dateStr,
        최근구간_통합수익률: curRetPct,
        직전구간_통합수익률: prevRetPct,
        최근구간_통합손익_만원: Math.round(curCumPnl / 10000),
        직전구간_통합손익_만원: Math.round(prevCumPnl / 10000),
        최근구간_KOSPI상승률: curKospiRetPct,
        직전구간_KOSPI상승률: prevKospiRetPct,
      };
    });

    // 사용자 요청: "통합손익의 오버레이 챠트에서 X축을 기준시점에서 현재시점을 오른쪽으로 펼쳐지도록 해줘"
    // 좌측 -N일(기준시점, 수익률 0% 출발)부터 우측 0일(현재시점, 최종 누적수익률) 순서로 펼쳐지도록 배치
    return {
      windowDays,
      labelName,
      curRangeLabel: `${curStartStr} ~ ${todayStr}`,
      prevRangeLabel: `${prevStartStr} ~ ${curStartStr}`,
      curFinalRetPct: Number(((curCumPnl / totalCapitalBase) * 100).toFixed(2)),
      prevFinalRetPct: Number(((prevCumPnl / totalCapitalBase) * 100).toFixed(2)),
      curFinalPnlKrw: curCumPnl,
      prevFinalPnlKrw: prevCumPnl,
      series: pointsFromStartToEnd,
    };
  }, [allCombinedChrono, periodPreset, todayStr, etfBudgetKrw]);

  const chartSeriesAsc = useMemo(() => {
    return [...integratedRowsDesc].reverse().map((r) => ({
      date: r.date,
      통합누적손익_만원: Math.round(r.cumTotalKrw / 10000),
      선물오버나잇_만원: Math.round(r.cumFutKrw / 10000),
      매수주문_만원: Math.round(r.cumKrKrw / 10000),
      ETF전략_만원: Math.round(r.cumEtfKrw / 10000),
    }));
  }, [integratedRowsDesc]);

  // 상단 요약 KPI 집계
  const summaryStats = useMemo(() => {
    const latestRow = integratedRowsDesc[0] || null;
    const totalFutPnl = latestRow ? latestRow.cumFutKrw : 0;
    const totalKrPnl = latestRow ? latestRow.cumKrKrw : 0;
    const totalEtfPnl = latestRow ? latestRow.cumEtfKrw : 0;
    const totalEtfGrossPnl = latestRow ? latestRow.cumEtfGrossKrw : 0;
    const totalEtfTaxKrw = latestRow ? latestRow.cumEtfTaxKrw : 0;
    const grandTotalPnl = totalFutPnl + totalKrPnl + totalEtfPnl;

    const todayFut = futuresByDate[todayStr] || (integratedRowsDesc[0]?.futures ?? null);
    const todayKr = krByDate[todayStr] || null;
    const latestEtfDate = Object.keys(etfByDate).sort().pop() || "";
    const todayEtf = etfByDate[todayStr] || (latestEtfDate ? etfByDate[latestEtfDate] : null);
    const topRankEtf = etfRanking[0] || null;

    const todayCombinedPnl =
      (todayFut?.dailyPnlKrw ?? 0) + (todayKr?.netPnlKrw ?? 0) + (todayEtf?.dailyPnlKrw ?? 0);

    const posDays = integratedRowsDesc.filter((r) => r.dayTotalPnl > 0).length;
    const negDays = integratedRowsDesc.filter((r) => r.dayTotalPnl < 0).length;
    const winRate =
      posDays + negDays > 0 ? Number(((posDays / (posDays + negDays)) * 100).toFixed(1)) : 0;

    return {
      totalFutPnl,
      totalKrPnl,
      totalEtfPnl,
      totalEtfGrossPnl,
      totalEtfTaxKrw,
      grandTotalPnl,
      todayCombinedPnl,
      todayFut,
      todayKr,
      todayEtf,
      topRankEtf,
      posDays,
      negDays,
      winRate,
      totalDays: integratedRowsDesc.length,
    };
  }, [integratedRowsDesc, futuresByDate, krByDate, etfByDate, etfRanking, todayStr]);

  const formatKrw = (val: number, showPlus: boolean = true) => {
    const v = Math.round(Number(val) || 0);
    const sign = showPlus && v > 0 ? "+" : "";
    return `${sign}${v.toLocaleString()}원`;
  };

  return (
    <div className="min-h-screen bg-[#060a12] text-slate-100 p-3 sm:p-5 space-y-4 overflow-y-auto pb-20">
      {/* 1. 상단 타이틀 & 통합 컨트롤 헤더 */}
      <div className="bg-gradient-to-r from-slate-900 via-[#0e172a] to-slate-900 border border-indigo-500/40 rounded-2xl p-4 shadow-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/60 text-amber-300 text-[11px] font-extrabold">
                👑 MASTER TRADING CONTROL · 3대 핵심 전략 통합 손익·포지션 관제보드
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold font-mono">
                운용계정: {effectiveUserId === "admin" ? "주인장(관리자)" : `${userName || effectiveUserId}님`}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/50 text-sky-200 text-[11px] font-extrabold font-mono">
                💱 원화환산 적용환율: 1 USD = {usdKrwRate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원
              </span>
              <button
                type="button"
                onClick={() => setIncludeUsCapitalGainsTax((v) => !v)}
                className={`px-2.5 py-0.5 rounded-full border text-[11px] font-extrabold cursor-pointer transition ${
                  includeUsCapitalGainsTax
                    ? "bg-purple-600/30 border-purple-400 text-purple-200"
                    : "bg-slate-800 border-slate-700 text-slate-400"
                }`}
                title="미국 ETF 해외주식 양도소득세(연 250만원 기본공제 후 22%) 차감 여부 토글"
              >
                {includeUsCapitalGainsTax
                  ? "🏛️ 미국 ETF 자본차익세(연 250만 공제 후 22%) 반영 ON"
                  : "🏛️ 미국 ETF 세전 수익률 보기 (자본차익세 OFF)"}
              </button>
              {lastSyncedAt && (
                <span className="text-[11px] text-slate-400 font-mono">
                  동기화: {lastSyncedAt} KST
                </span>
              )}
            </div>
            <h1 className="text-lg sm:text-xl font-black text-white mt-1 tracking-tight">
              📋 통합손익관리표 (선물오버나잇 · 매수주문 · ETF투자전략[KST 당일합산 · 환율 · 미국 자본차익세 22% 반영] 총괄표)
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl p-1 gap-1">
              {(
                [
                  { id: "TODAY", label: "당일" },
                  { id: "1M", label: "1개월 (vs 직전1M)" },
                  { id: "3M", label: "3개월 (vs 직전3M)" },
                  { id: "6M", label: "6개월 (vs 직전6M)" },
                  { id: "YTD", label: "금년(2026~)" },
                  { id: "ALL", label: "전체(2025~)" },
                ] as const
              ).map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => applyPreset(btn.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-extrabold cursor-pointer transition ${
                    periodPreset === btn.id
                      ? "bg-indigo-600 text-white shadow"
                      : "text-slate-400 hover:text-white hover:bg-slate-800"
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => fetchAllIntegratedData(true)}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold shadow-lg cursor-pointer flex items-center gap-1.5"
            >
              <span>{refreshing ? "⏳" : "⚡"}</span>
              <span>{refreshing ? "3대 전략 실시간 동기화 중..." : "3대 전략 실시간 손익 새로고침"}</span>
            </button>
          </div>
        </div>

        {/* 상단 통합 누적 손익 & 당일 실시간 합산 손익 배너 (금일 실시간 합산손익을 맨 앞으로 배치) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-800/80">
          <div className="bg-slate-950/90 border-2 border-indigo-500/60 rounded-xl p-3.5 shadow-lg">
            <div className="flex items-center justify-between text-[11px] text-indigo-300 font-extrabold">
              <span>⚡ 당일({todayStr} KST) 3대 전략 합산손익</span>
              <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-[10px]">ETF 당일합산</span>
            </div>
            <div
              className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
                summaryStats.todayCombinedPnl >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatKrw(summaryStats.todayCombinedPnl)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1">
              선물 {formatKrw(summaryStats.todayFut?.dailyPnlKrw ?? 0)} · 주식{" "}
              {formatKrw(summaryStats.todayKr?.netPnlKrw ?? 0)} · ETF{" "}
              {formatKrw(summaryStats.todayEtf?.dailyPnlKrw ?? 0)}
            </div>
          </div>

          <div className="bg-slate-950/90 border-2 border-amber-500/60 rounded-xl p-3.5 shadow-lg">
            <div className="flex items-center justify-between text-[11px] text-amber-300 font-extrabold">
              <span>🏆 3대 전략 통합 누적손익 ({startDate}~)</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-[10px]">
                {includeUsCapitalGainsTax ? "세후 실질" : "세전"} · 2.5억
              </span>
            </div>
            <div
              className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
                summaryStats.grandTotalPnl >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatKrw(summaryStats.grandTotalPnl)}
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1">
              통합 수익률:{" "}
              <strong className={summaryStats.grandTotalPnl >= 0 ? "text-emerald-300" : "text-rose-300"}>
                {summaryStats.grandTotalPnl >= 0 ? "+" : ""}
                {((summaryStats.grandTotalPnl / (200000000 + etfBudgetKrw)) * 100).toFixed(2)}%
              </strong>{" "}
              | 승률 {summaryStats.winRate}% ({summaryStats.posDays}승 {summaryStats.negDays}패)
            </div>
          </div>

          <div
            onClick={() => onNavigateTab && onNavigateTab("futures_sim")}
            className="bg-slate-950/90 border border-emerald-500/40 hover:border-emerald-400 rounded-xl p-3.5 cursor-pointer transition"
          >
            <div className="flex items-center justify-between text-[11px] text-emerald-300 font-extrabold">
              <span>🚀 ① 선물오버나잇 (당일 / 누적)</span>
              <span className="text-[10px] underline">바로가기 →</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 mt-1 font-mono">
              <div>
                <span className="text-[10px] text-slate-400 mr-1">당일:</span>
                <span
                  className={`text-sm font-black ${
                    (summaryStats.todayFut?.dailyPnlKrw ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatKrw(summaryStats.todayFut?.dailyPnlKrw ?? 0)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 mr-1">누적:</span>
                <span
                  className={`text-sm font-black ${
                    summaryStats.totalFutPnl >= 0 ? "text-emerald-300" : "text-rose-400"
                  }`}
                >
                  {formatKrw(summaryStats.totalFutPnl)}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1">
              포지션:{" "}
              <strong className="text-white">
                전일 {summaryStats.todayFut?.prevContracts ?? 0}계약 → 당일 목표{" "}
                {summaryStats.todayFut?.targetContracts ?? 0}계약
              </strong>
            </div>
          </div>

          <div
            onClick={() => onNavigateTab && onNavigateTab("order")}
            className="bg-slate-950/90 border border-rose-500/40 hover:border-rose-400 rounded-xl p-3.5 cursor-pointer transition"
          >
            <div className="flex items-center justify-between text-[11px] text-rose-300 font-extrabold">
              <span>🚨 ② 매수주문 (당일 / 누적)</span>
              <span className="text-[10px] underline">바로가기 →</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 mt-1 font-mono">
              <div>
                <span className="text-[10px] text-slate-400 mr-1">당일:</span>
                <span
                  className={`text-sm font-black ${
                    (summaryStats.todayKr?.netPnlKrw ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatKrw(summaryStats.todayKr?.netPnlKrw ?? 0)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 mr-1">누적:</span>
                <span
                  className={`text-sm font-black ${
                    summaryStats.totalKrPnl >= 0 ? "text-emerald-300" : "text-rose-400"
                  }`}
                >
                  {formatKrw(summaryStats.totalKrPnl)}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 font-mono mt-1 truncate">
              금일 매수:{" "}
              <strong className="text-amber-300">
                {krStockLiveSummary.stockItems.length}종목 (보유 {krHoldings.length}종목)
              </strong>
            </div>
          </div>

          <div
            onClick={() => onNavigateTab && onNavigateTab("etf_strategy")}
            className="bg-slate-950/90 border border-sky-500/40 hover:border-sky-400 rounded-xl p-3.5 cursor-pointer transition"
          >
            <div className="flex items-center justify-between text-[11px] text-sky-300 font-extrabold">
              <span>⚡ ③ ETF전략 ({includeUsCapitalGainsTax ? "세후" : "세전"} 당일/누적)</span>
              <span className="text-[10px] underline">바로가기 →</span>
            </div>
            <div className="flex items-baseline justify-between gap-2 mt-1 font-mono">
              <div>
                <span className="text-[10px] text-slate-400 mr-1">당일:</span>
                <span
                  className={`text-sm font-black ${
                    (summaryStats.todayEtf?.dailyPnlKrw ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatKrw(summaryStats.todayEtf?.dailyPnlKrw ?? 0)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 mr-1">누적:</span>
                <span
                  className={`text-sm font-black ${
                    summaryStats.totalEtfPnl >= 0 ? "text-emerald-300" : "text-rose-400"
                  }`}
                >
                  {formatKrw(summaryStats.totalEtfPnl)}
                </span>
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-mono mt-1 flex items-center justify-between">
              <span>
                환율 <strong className="text-sky-300">{usdKrwRate.toLocaleString()}원</strong>
              </span>
              <span>
                양도세(22%): <strong className="text-purple-300">-{summaryStats.totalEtfTaxKrw.toLocaleString()}원</strong>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. 최근 구간(-N일 ~ 0일) vs 직전 구간(-2N일 ~ -N일) 동시 비교 오버레이 차트 (1개월: -30~0일 / 3개월: -90~0일 / 6개월: -180~0일) */}
      <div className="bg-slate-900/95 border border-amber-500/40 rounded-2xl p-4 shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-amber-300 text-[11px] font-extrabold">
                📊 기간별 수익률 연속성 비교 (X축: -{periodOverlayComparison.windowDays}일[기준시점] → 0일[현재시점])
              </span>
              <span className="text-xs font-mono text-emerald-300 font-bold">
                ■ 최근 {periodOverlayComparison.labelName} ({periodOverlayComparison.curRangeLabel}):{" "}
                {periodOverlayComparison.curFinalRetPct >= 0 ? "+" : ""}
                {periodOverlayComparison.curFinalRetPct}% ({formatKrw(periodOverlayComparison.curFinalPnlKrw)})
              </span>
              <span className="text-xs font-mono text-purple-300 font-bold">
                ■ 직전 {periodOverlayComparison.labelName} ({periodOverlayComparison.prevRangeLabel}):{" "}
                {periodOverlayComparison.prevFinalRetPct >= 0 ? "+" : ""}
                {periodOverlayComparison.prevFinalRetPct}% ({formatKrw(periodOverlayComparison.prevFinalPnlKrw)})
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-extrabold text-white mt-1">
              📈 [최근 {periodOverlayComparison.labelName} vs 직전 {periodOverlayComparison.labelName}] 통합 수익률 오버레이 비교 그래프 (X축: -{periodOverlayComparison.windowDays}일 ~ 0일)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                { id: "1M", label: "1개월 (-30 ~ 0일)" },
                { id: "3M", label: "3개월 (-90 ~ 0일)" },
                { id: "6M", label: "6개월 (-180 ~ 0일)" },
              ] as const
            ).map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => applyPreset(b.id)}
                className={`px-2.5 py-1 rounded-lg font-extrabold cursor-pointer border transition ${
                  periodPreset === b.id
                    ? "bg-amber-600 border-amber-300 text-white shadow"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                }`}
              >
                {b.label}
              </button>
            ))}
            <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5 ml-1">
              <button
                type="button"
                onClick={() => setCompareMetricMode("RETURN_PCT")}
                className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                  compareMetricMode === "RETURN_PCT" ? "bg-indigo-600 text-white" : "text-slate-400"
                }`}
              >
                수익률(%)
              </button>
              <button
                type="button"
                onClick={() => setCompareMetricMode("PNL_MAN")}
                className={`px-2 py-1 rounded text-[11px] font-bold cursor-pointer ${
                  compareMetricMode === "PNL_MAN" ? "bg-indigo-600 text-white" : "text-slate-400"
                }`}
              >
                누적손익(만원)
              </button>
            </div>
          </div>
        </div>

        <div className="h-64 w-full text-xs font-mono">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={periodOverlayComparison.series} margin={{ top: 10, right: 24, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="dayAxisLabel"
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                minTickGap={25}
              />
              <YAxis
                stroke="#94a3b8"
                tick={{ fontSize: 11 }}
                unit={compareMetricMode === "RETURN_PCT" ? "%" : "만"}
              />
              <Tooltip
                content={({ active, payload }: any) => {
                  if (!active || !payload || !payload.length) return null;
                  const pt = payload[0].payload;
                  return (
                    <div className="bg-[#090d16] border border-slate-700 rounded-xl p-3 shadow-2xl text-xs font-mono space-y-1.5">
                      <div className="font-extrabold text-amber-300 border-b border-slate-800 pb-1">
                        경과일: {pt.dayAxisLabel} (-{periodOverlayComparison.windowDays}일=기준시점 → 0일=현재시점)
                      </div>
                      <div className="text-emerald-400 font-bold">
                        ■ 최근 {periodOverlayComparison.labelName} ({pt.curDate}):{" "}
                        {pt.최근구간_통합수익률 >= 0 ? "+" : ""}
                        {pt.최근구간_통합수익률}% ({pt.최근구간_통합손익_만원 >= 0 ? "+" : ""}
                        {pt.최근구간_통합손익_만원.toLocaleString()}만원)
                      </div>
                      <div className="text-purple-300 font-bold">
                        ■ 직전 {periodOverlayComparison.labelName} ({pt.prevDate}):{" "}
                        {pt.직전구간_통합수익률 >= 0 ? "+" : ""}
                        {pt.직전구간_통합수익률}% ({pt.직전구간_통합손익_만원 >= 0 ? "+" : ""}
                        {pt.직전구간_통합손익_만원.toLocaleString()}만원)
                      </div>
                      <div className="text-sky-300 text-[11px] border-t border-slate-800 pt-1">
                        📊 KOSPI 상승률: 최근{" "}
                        {pt.최근구간_KOSPI상승률 >= 0 ? "+" : ""}
                        {pt.최근구간_KOSPI상승률}% vs 직전 {pt.직전구간_KOSPI상승률 >= 0 ? "+" : ""}
                        {pt.직전구간_KOSPI상승률}%
                      </div>
                    </div>
                  );
                }}
              />
              <Legend />
              <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
              {compareMetricMode === "RETURN_PCT" ? (
                <>
                  <Line
                    type="monotone"
                    dataKey="최근구간_통합수익률"
                    name={`■ 최근 ${periodOverlayComparison.labelName} 통합수익률 (${periodOverlayComparison.curRangeLabel})`}
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="직전구간_통합수익률"
                    name={`■ 직전 ${periodOverlayComparison.labelName} 통합수익률 (${periodOverlayComparison.prevRangeLabel})`}
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="최근구간_KOSPI상승률"
                    name={`📊 최근 ${periodOverlayComparison.labelName} KOSPI 상승률 (${periodOverlayComparison.curRangeLabel})`}
                    stroke="#38bdf8"
                    strokeWidth={2}
                    dot={false}
                  />
                </>
              ) : (
                <>
                  <Line
                    type="monotone"
                    dataKey="최근구간_통합손익_만원"
                    name={`■ 최근 ${periodOverlayComparison.labelName} 통합누적손익 (${periodOverlayComparison.curRangeLabel})`}
                    stroke="#10b981"
                    strokeWidth={3}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="직전구간_통합손익_만원"
                    name={`■ 직전 ${periodOverlayComparison.labelName} 통합누적손익 (${periodOverlayComparison.prevRangeLabel})`}
                    stroke="#a855f7"
                    strokeWidth={2.5}
                    strokeDasharray="5 5"
                    dot={false}
                  />
                </>
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. 당일 3대 전략 포지션 · 매수종목 · 선택 ETF 실시간 요약 카드 (3열) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 카드 ①: 선물오버나잇자동매매 실시간 포지션 & 최근 체결 */}
        <div className="bg-slate-900/95 border border-emerald-500/40 rounded-2xl p-4 space-y-3 shadow-xl flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-extrabold">
                  ① 선물오버나잇자동매매
                </span>
                <span className="text-xs font-mono text-slate-400">미니선물(5만원) · 원금 1억</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab("futures_sim")}
                className="px-2.5 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-bold cursor-pointer"
              >
                상세화면 이동 →
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">전일 확정 포지션</div>
                <div className="text-base font-black text-slate-200 mt-0.5">
                  {(summaryStats.todayFut?.prevContracts ?? 0) > 0
                    ? `+${summaryStats.todayFut?.prevContracts}`
                    : summaryStats.todayFut?.prevContracts ?? 0}
                  계약
                </div>
              </div>
              <div className="bg-slate-950 border border-sky-500/40 rounded-xl p-2.5">
                <div className="text-[10px] text-sky-300 font-bold">당일 목표 포지션</div>
                <div
                  className={`text-base font-black mt-0.5 ${
                    (summaryStats.todayFut?.targetContracts ?? 0) > 0
                      ? "text-emerald-400"
                      : (summaryStats.todayFut?.targetContracts ?? 0) < 0
                      ? "text-rose-400"
                      : "text-slate-200"
                  }`}
                >
                  {(summaryStats.todayFut?.targetContracts ?? 0) > 0
                    ? `+${summaryStats.todayFut?.targetContracts}`
                    : summaryStats.todayFut?.targetContracts ?? 0}
                  계약
                </div>
              </div>
              <div className="bg-amber-950/30 border border-amber-500/50 rounded-xl p-2.5">
                <div className="text-[10px] text-amber-300 font-bold">15:35 동시호가 주문</div>
                <div className="text-base font-black text-amber-200 mt-0.5">
                  {(summaryStats.todayFut?.deltaContracts ?? 0) > 0
                    ? `+${summaryStats.todayFut?.deltaContracts}`
                    : summaryStats.todayFut?.deltaContracts ?? 0}
                  계약
                </div>
              </div>
            </div>

            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-400">당일 선물 현재가 / KOSPI200:</span>
                <span className="font-bold text-white">
                  {summaryStats.todayFut?.futClose ?? "-"}pt / {summaryStats.todayFut?.k200Close ?? "-"}pt
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">당일 매매손익 (수익률):</span>
                <span
                  className={`font-extrabold ${
                    (summaryStats.todayFut?.dailyPnlKrw ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatKrw(summaryStats.todayFut?.dailyPnlKrw ?? 0)} (
                  {(summaryStats.todayFut?.dailyRetPct ?? 0) >= 0 ? "+" : ""}
                  {summaryStats.todayFut?.dailyRetPct ?? 0}%)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">주력 채택 5대 모델:</span>
                <span className="text-emerald-300 font-bold truncate max-w-[200px]">
                  {(futuresSim?.active_5_models || ["M01", "M03", "M05", "M08", "M10"])
                    .map((m: string) => m.split("_")[0])
                    .join(" · ")}
                </span>
              </div>
            </div>
          </div>

          {/* 최근 선물 체결 2건 */}
          <div className="pt-2 border-t border-slate-800/80">
            <div className="text-[11px] font-bold text-slate-400 mb-1">최근 15:30 확정 체결 이력</div>
            <div className="space-y-1 text-[11px] font-mono">
              {(futuresKis?.recent_orders || []).slice(0, 2).map((ord: any) => (
                <div
                  key={ord.id}
                  className="flex items-center justify-between bg-slate-950 px-2.5 py-1 rounded border border-slate-800/80"
                >
                  <span className="text-slate-300">{ord.trading_date}</span>
                  <span className={String(ord.side).includes("BUY") ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                    {ord.side} {ord.qty}계약 @ {ord.exec_price}pt
                  </span>
                  <span className="text-amber-300 font-bold">
                    {ord.prev_contracts} → {ord.target_contracts}계약
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 카드 ②: 매수주문 (외국계 순매수 상위 국내주식) 당일 매수종목 & 손익 */}
        <div className="bg-slate-900/95 border border-rose-500/40 rounded-2xl p-4 space-y-3 shadow-xl flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-extrabold">
                  ② 매수주문 (국내주식)
                </span>
                <span className="text-xs font-mono text-slate-400">09:05 외인수급 → 15:20 청산</span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab("order")}
                className="px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-[11px] font-bold cursor-pointer"
              >
                상세화면 이동 →
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center font-mono">
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">금일 매수/보유종목</div>
                <div className="text-base font-black text-amber-300 mt-0.5">
                  {krStockLiveSummary.stockItems.length}종목{" "}
                  <span className="text-[11px] text-slate-400">(보유 {krHoldings.length})</span>
                </div>
              </div>
              <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                <div className="text-[10px] text-slate-400">금일 매입총액</div>
                <div className="text-sm font-black text-slate-200 mt-1">
                  {Math.round(krStockLiveSummary.buyAmt / 10000).toLocaleString()}만원
                </div>
              </div>
              <div className="bg-slate-950 border border-rose-500/40 rounded-xl p-2.5">
                <div className="text-[10px] text-rose-300 font-bold">금일 실시간 손익</div>
                <div
                  className={`text-sm font-black mt-1 ${
                    krStockLiveSummary.livePnl >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {formatKrw(krStockLiveSummary.livePnl)}
                </div>
              </div>
            </div>

            {/* 금일 또는 최근 거래일 매수 종목 배지 목록 */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 font-bold">
                  📌 {krStockLiveSummary.stockItems.length > 0 ? `금일(${todayStr}) 매수·보유 종목` : "최근 거래일 매수 종목"}
                </span>
                <span className="font-mono text-[10px] text-emerald-300">
                  {krOrderStatus?.reserved_close_sell ? "✅ 15:20 동시호가 청산예약됨" : "실시간 시세 연동"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {krStockLiveSummary.stockItems.length > 0 ? (
                  krStockLiveSummary.stockItems.map((st) => (
                    <span
                      key={st.ticker}
                      className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-700 text-[11px] font-mono flex items-center gap-1"
                    >
                      <strong className="text-white font-sans">{st.name}</strong>
                      <span className="text-slate-400">{st.qty}주</span>
                      <span className={st.pnl >= 0 ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                        ({st.retPct >= 0 ? "+" : ""}
                        {st.retPct}%)
                      </span>
                    </span>
                  ))
                ) : krLedgerHistory.length > 0 && krByDate[krLedgerHistory[0].date]?.stocksList?.length ? (
                  krByDate[krLedgerHistory[0].date].stocksList.slice(0, 10).map((st) => (
                    <span
                      key={st.ticker}
                      className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono flex items-center gap-1"
                    >
                      <strong className="text-slate-200 font-sans">{st.name}</strong>
                      <span className={st.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                        {formatKrw(st.pnl)}
                      </span>
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-slate-500 py-2">
                    금일 매수 체결된 종목이 없습니다. (09:05 외인 순매수 스캔 후 매수 집행)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono">
            <span className="text-slate-400">최근 정산일 ({krLedgerHistory[0]?.date || "-"}) 확정손익:</span>
            <span
              className={`font-bold ${
                Number(krLedgerHistory[0]?.net_pnl || 0) >= 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {formatKrw(Number(krLedgerHistory[0]?.net_pnl || 0))} (
              {Number(krLedgerHistory[0]?.return_rate || 0) >= 0 ? "+" : ""}
              {Number(krLedgerHistory[0]?.return_rate || 0).toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* 카드 ③: ETF 투자전략 현재 선택 ETF & 환율/미국 자본차익세(22%) 상세 요약 */}
        <div className="bg-slate-900/95 border border-sky-500/40 rounded-2xl p-4 space-y-3 shadow-xl flex flex-col justify-between">
          <div className="space-y-2.5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 text-xs font-extrabold">
                  ③ 글로벌 ETF 투자전략
                </span>
                <span className="text-xs font-mono text-slate-400">
                  한도 {Math.round(etfBudgetKrw / 10000).toLocaleString()}만원 · 환율 {usdKrwRate.toLocaleString()}원
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab && onNavigateTab("etf_strategy")}
                className="px-2.5 py-1 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-[11px] font-bold cursor-pointer"
              >
                상세화면 이동 →
              </button>
            </div>

            {(() => {
              const curEtf = summaryStats.todayEtf;
              const topRank = summaryStats.topRankEtf;
              const activeTicker = curEtf?.targetEtf || topRank?.ticker || "INDA";
              const activeName = ETF_NAMES[activeTicker] || topRank?.name || activeTicker;
              const priceUsd = Number(topRank?.current_price || curEtf?.priceUsd || 0);
              const fxNow = curEtf?.fxRate || usdKrwRate;
              const qty =
                curEtf?.qty ||
                (priceUsd > 0 ? Math.max(1, Math.floor(etfBudgetKrw / (priceUsd * fxNow))) : 0);

              return (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center font-mono">
                    <div className="bg-slate-950 border border-sky-500/50 rounded-xl p-2.5">
                      <div className="text-[10px] text-sky-300 font-bold">현재 선택 1위 ETF</div>
                      <div
                        className="text-base font-black mt-0.5"
                        style={{ color: ETF_COLORS[activeTicker] || "#facc15" }}
                      >
                        {activeTicker}
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5">
                      <div className="text-[10px] text-slate-400">보유수량 (환율적용)</div>
                      <div className="text-sm font-black text-white mt-1">
                        {activeTicker === "CASH" ? "현금 100%" : `${qty.toLocaleString()}주`}
                      </div>
                    </div>
                    <div className="bg-slate-950 border border-emerald-500/40 rounded-xl p-2.5">
                      <div className="text-[10px] text-emerald-300 font-bold">
                        오늘(KST) {includeUsCapitalGainsTax ? "세후" : "세전"}손익
                      </div>
                      <div
                        className={`text-sm font-black mt-1 ${
                          (curEtf?.dailyPnlKrw ?? 0) >= 0 ? "text-emerald-400" : "text-rose-400"
                        }`}
                      >
                        {formatKrw(curEtf?.dailyPnlKrw ?? 0)}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-xs space-y-1 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">선택 ETF / USD현재가(원화가):</span>
                      <span className="font-bold text-white">
                        {activeName} (${priceUsd.toFixed(2)} = {Math.round(priceUsd * fxNow).toLocaleString()}원)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">원화환산 적용환율 (KST 합산일):</span>
                      <span className="font-bold text-sky-300">
                        1 USD = {fxNow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}원 ({curEtf?.date || todayStr})
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">미국 자본차익세(연 250만 공제 후 22%):</span>
                      <span className="text-purple-300 font-bold">
                        세전 {formatKrw(summaryStats.totalEtfGrossPnl)} → 세후 {formatKrw(summaryStats.totalEtfPnl)}
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <div className="text-[11px] font-bold text-slate-400 mb-1">글로벌 ETF 모멘텀 상위 TOP 3</div>
            <div className="grid grid-cols-3 gap-1.5 text-[11px] font-mono">
              {etfRanking.slice(0, 3).map((item: any, idx: number) => (
                <div
                  key={item.ticker}
                  className="bg-slate-950 px-2 py-1 rounded border border-slate-800 flex items-center justify-between"
                >
                  <span className="font-bold" style={{ color: ETF_COLORS[item.ticker] || "#fff" }}>
                    #{idx + 1} {item.ticker}
                  </span>
                  <span className={Number(item.return_1d || 0) >= 0 ? "text-emerald-400" : "text-rose-400"}>
                    {Number(item.return_1d || 0) >= 0 ? "+" : ""}
                    {Number(item.return_1d || 0).toFixed(2)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. 3대 전략 통합 누적손익 추이 차트 (만원 단위) */}
      {chartSeriesAsc.length > 1 && (
        <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-extrabold text-white">
                📈 3대 전략 통합 누적손익 및 전략별 기여도 추이 차트 ({startDate} ~ 현재 · 단위: 만원 · {includeUsCapitalGainsTax ? "미국 ETF 자본차익세 22% 차감 후" : "세전"})
              </h2>
              <p className="text-xs text-slate-400">
                선물오버나잇(초록) · 매수주문 국내주식(빨강) · 글로벌 ETF 투자전략(하늘)의 일별 누적 손익과 통합 합산 손익(황금색 영역)을 한눈에 비교합니다.
              </p>
            </div>
          </div>

          <div className="h-60 w-full text-xs font-mono">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartSeriesAsc} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="totalPnlGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} minTickGap={35} />
                <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit="만" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#090d16",
                    borderColor: "#334155",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                  formatter={(value: any, name: any) => [
                    `${Number(value) >= 0 ? "+" : ""}${Number(value).toLocaleString()}만원`,
                    name,
                  ]}
                />
                <Legend />
                <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                <Area
                  type="monotone"
                  dataKey="통합누적손익_만원"
                  name="🏆 3대 전략 통합 누적손익"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  fill="url(#totalPnlGrad)"
                />
                <Area
                  type="monotone"
                  dataKey="선물오버나잇_만원"
                  name="🚀 선물오버나잇 누적"
                  stroke="#10b981"
                  strokeWidth={2}
                  fillOpacity={0}
                />
                <Area
                  type="monotone"
                  dataKey="매수주문_만원"
                  name="🚨 매수주문(주식) 누적"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  fillOpacity={0}
                />
                <Area
                  type="monotone"
                  dataKey="ETF전략_만원"
                  name={`⚡ ETF투자전략 누적 (${includeUsCapitalGainsTax ? "세후" : "세전"})`}
                  stroke="#38bdf8"
                  strokeWidth={2}
                  fillOpacity={0}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* 5. 일자별 통합손익관리 마스터 요약표 (당일/누적 통합손익 맨 앞 배치 + 환율 & 미국 자본차익세 표시) */}
      <div className="bg-slate-900/95 border border-indigo-500/40 rounded-2xl p-4 shadow-2xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-white flex flex-wrap items-center gap-2">
              <span>📊 일자별 통합손익관리 요약표 (당일·누적 통합손익 · 선물 포지션 · 매수주문 종목 · 선택 ETF 및 적용환율·자본차익세)</span>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-950 border border-indigo-500/40 text-indigo-300 text-xs font-mono">
                총 {integratedRowsDesc.length}거래일
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              미국 ETF 손익은 <strong>국내시간(KST) 기준 당일 손익에 자동 합산</strong>되며, 적용된 <strong>원/달러 환율(USD/KRW)</strong>과 <strong>미국 연간 자본차익세(250만원 기본공제 후 22%)</strong>가 반영됩니다.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setDetailFilter("ALL")}
              className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer border ${
                detailFilter === "ALL"
                  ? "bg-indigo-600 border-indigo-400 text-white"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              전체 거래일 보기
            </button>
            <button
              type="button"
              onClick={() => setDetailFilter("TRADED_ONLY")}
              className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer border ${
                detailFilter === "TRADED_ONLY"
                  ? "bg-indigo-600 border-indigo-400 text-white"
                  : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
              }`}
            >
              포지션/매매 발생일만 보기
            </button>
          </div>
        </div>

        {loading && integratedRowsDesc.length === 0 ? (
          <div className="py-12 text-center text-sm text-indigo-300 animate-pulse font-bold">
            ⏳ 선물오버나잇 · 매수주문 · ETF투자전략 일별 원장을 통합 집계하고 있습니다...
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[620px] overflow-y-auto">
            <table className="w-full text-xs text-left border-collapse font-mono whitespace-nowrap">
              <thead>
                <tr className="bg-slate-950 text-slate-300 border-b-2 border-slate-700 sticky top-0 z-10">
                  <th className="p-2.5">거래일자 (KST)</th>
                  <th className="p-2.5 border-l border-slate-800 text-right text-amber-300 font-extrabold bg-amber-950/20">
                    🏆 당일 통합 합산손익
                  </th>
                  <th className="p-2.5 text-right text-white font-extrabold bg-amber-950/20">
                    누적 통합손익 (수익률)
                  </th>
                  <th className="p-2.5 border-l border-slate-800 text-emerald-300">
                    ① 선물오버나잇 포지션 (주문)
                  </th>
                  <th className="p-2.5 text-right text-emerald-300">선물 일일손익</th>
                  <th className="p-2.5 border-l border-slate-800 text-rose-300">
                    ② 매수주문 종목 (외인수급 상위)
                  </th>
                  <th className="p-2.5 text-right text-rose-300">매수주문 일일손익</th>
                  <th className="p-2.5 border-l border-slate-800 text-sky-300">
                    ③ ETF전략 선택ETF (적용환율)
                  </th>
                  <th className="p-2.5 text-right text-sky-300">
                    ETF 일일손익 ({includeUsCapitalGainsTax ? "세후 22%" : "세전"})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {integratedRowsDesc.map((row, idx) => {
                  const f = row.futures;
                  const k = row.krOrder;
                  const e = row.etf;
                  const isExpanded = expandedDate === row.date;

                  return (
                    <React.Fragment key={row.date}>
                      <tr
                        onClick={() => setExpandedDate(isExpanded ? null : row.date)}
                        className={`cursor-pointer transition-colors ${
                          idx === 0
                            ? "bg-indigo-950/25 hover:bg-indigo-900/30"
                            : "hover:bg-slate-800/60"
                        }`}
                      >
                        {/* 거래일자 */}
                        <td className="p-2.5 font-bold text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">{isExpanded ? "▼" : "▶"}</span>
                            <span>{row.date}</span>
                            {row.date === todayStr && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-sans font-extrabold">
                                TODAY
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 당일 통합 합산손익 (맨 앞 배치) */}
                        <td
                          className={`p-2.5 border-l border-slate-800/80 text-right font-black text-sm bg-amber-950/10 ${
                            row.dayTotalPnl > 0
                              ? "text-emerald-400"
                              : row.dayTotalPnl < 0
                              ? "text-rose-400"
                              : "text-slate-400"
                          }`}
                        >
                          {formatKrw(row.dayTotalPnl)}
                        </td>

                        {/* 누적 통합손익 (맨 앞 배치) */}
                        <td
                          className={`p-2.5 text-right font-black bg-amber-950/10 ${
                            row.cumTotalKrw >= 0 ? "text-amber-300" : "text-rose-400"
                          }`}
                        >
                          {formatKrw(row.cumTotalKrw)}
                          <span className="text-[10px] text-slate-400 ml-1">
                            ({row.cumTotalRetPct >= 0 ? "+" : ""}
                            {row.cumTotalRetPct}%)
                          </span>
                        </td>

                        {/* ① 선물오버나잇 포지션 */}
                        <td className="p-2.5 border-l border-slate-800/80">
                          {f ? (
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-slate-200 font-bold">
                                {f.prevContracts > 0 ? `+${f.prevContracts}` : f.prevContracts} →{" "}
                                <strong
                                  className={
                                    f.targetContracts > 0
                                      ? "text-emerald-400"
                                      : f.targetContracts < 0
                                      ? "text-rose-400"
                                      : "text-slate-200"
                                  }
                                >
                                  {f.targetContracts > 0 ? `+${f.targetContracts}` : f.targetContracts}계약
                                </strong>
                              </span>
                              {f.deltaContracts !== 0 ? (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                                    f.deltaContracts > 0
                                      ? "bg-emerald-500/20 text-emerald-300"
                                      : "bg-rose-500/20 text-rose-300"
                                  }`}
                                >
                                  {f.deltaContracts > 0 ? `+${f.deltaContracts} 매수` : `${f.deltaContracts} 매도`}
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-sans">유지(0)</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* 선물 일일손익 */}
                        <td
                          className={`p-2.5 text-right font-bold ${
                            row.fPnl > 0 ? "text-emerald-400" : row.fPnl < 0 ? "text-rose-400" : "text-slate-500"
                          }`}
                        >
                          {row.fPnl !== 0 ? (
                            <>
                              {formatKrw(row.fPnl)}
                              <span className="text-[10px] text-slate-400 ml-1">
                                ({f?.dailyRetPct && f.dailyRetPct > 0 ? "+" : ""}
                                {f?.dailyRetPct?.toFixed(2) ?? "0.00"}%)
                              </span>
                            </>
                          ) : (
                            "0원"
                          )}
                        </td>

                        {/* ② 매수주문 종목 */}
                        <td className="p-2.5 border-l border-slate-800/80 font-sans">
                          {k ? (
                            <div className="flex items-center gap-1.5 max-w-[240px] truncate">
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-bold shrink-0">
                                {k.stockCount > 0 ? `${k.stockCount}종목` : "정산"}
                              </span>
                              <span className="text-slate-200 truncate" title={k.stockNamesSummary}>
                                {k.stockNamesSummary}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600 font-mono">매매 없음</span>
                          )}
                        </td>

                        {/* 매수주문 일일손익 */}
                        <td
                          className={`p-2.5 text-right font-bold ${
                            row.kPnl > 0 ? "text-emerald-400" : row.kPnl < 0 ? "text-rose-400" : "text-slate-500"
                          }`}
                        >
                          {row.kPnl !== 0 ? (
                            <>
                              {formatKrw(row.kPnl)}
                              <span className="text-[10px] text-slate-400 ml-1">
                                ({k?.retPct && k.retPct > 0 ? "+" : ""}
                                {k?.retPct?.toFixed(2) ?? "0.00"}%)
                              </span>
                            </>
                          ) : (
                            "0원"
                          )}
                        </td>

                        {/* ③ ETF투자전략 선택 ETF + 적용환율 */}
                        <td className="p-2.5 border-l border-slate-800/80">
                          {e ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="px-2 py-0.5 rounded font-extrabold text-xs"
                                style={{
                                  backgroundColor: `${ETF_COLORS[e.targetEtf] || "#475569"}25`,
                                  color: ETF_COLORS[e.targetEtf] || "#f8fafc",
                                  border: `1px solid ${ETF_COLORS[e.targetEtf] || "#475569"}70`,
                                }}
                              >
                                {e.targetEtf}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold ${
                                  e.isHolding
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-amber-500/25 text-amber-200"
                                }`}
                              >
                                {e.tradeStatus}
                              </span>
                              <span className="text-[10px] text-sky-300/90 font-mono">
                                @{e.fxRate.toLocaleString()}원
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-600">-</span>
                          )}
                        </td>

                        {/* ETF 일일손익 (세후/세전) */}
                        <td
                          className={`p-2.5 text-right font-bold ${
                            row.ePnl > 0 ? "text-emerald-400" : row.ePnl < 0 ? "text-rose-400" : "text-slate-500"
                          }`}
                        >
                          {row.ePnl !== 0 ? (
                            <>
                              {formatKrw(row.ePnl)}
                              <span className="text-[10px] text-slate-400 ml-1">
                                ({e?.dailyRetPct && e.dailyRetPct > 0 ? "+" : ""}
                                {e?.dailyRetPct?.toFixed(2) ?? "0.00"}%)
                              </span>
                            </>
                          ) : (
                            "0원"
                          )}
                        </td>
                      </tr>

                      {/* 행 클릭 시 펼쳐지는 해당 일자 3대 전략 상세 드릴다운 패널 */}
                      {isExpanded && (
                        <tr className="bg-slate-950/95 border-b border-indigo-500/40">
                          <td colSpan={9} className="p-3.5 font-sans">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-xs">
                              {/* 선물 상세 */}
                              <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-3 space-y-1.5">
                                <div className="font-extrabold text-emerald-300">
                                  🚀 [{row.date}] 선물오버나잇자동매매 상세
                                </div>
                                {f ? (
                                  <div className="space-y-1 font-mono text-[11px] text-slate-300">
                                    <div>
                                      • 포지션 변화: 전일 <strong>{f.prevContracts}계약</strong> → 당일 목표{" "}
                                      <strong className="text-emerald-300">{f.targetContracts}계약</strong> (동시호가 주문:{" "}
                                      <strong>{f.deltaContracts > 0 ? `+${f.deltaContracts}` : f.deltaContracts}계약</strong>{" "}
                                      {f.orderAction})
                                    </div>
                                    <div>
                                      • 선물 종가: <strong>{f.futClose}pt</strong> / KOSPI200: <strong>{f.k200Close}pt</strong> ({f.regimeLabel})
                                    </div>
                                    <div>
                                      • 당일 손익: <strong className={row.fPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>{formatKrw(row.fPnl)}</strong> (누적 {formatKrw(row.cumFutKrw)})
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-slate-500">해당 일자 선물 거래 내역 없음</div>
                                )}
                              </div>

                              {/* 매수주문 종목 상세 */}
                              <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-3 space-y-1.5">
                                <div className="font-extrabold text-rose-300">
                                  🚨 [{row.date}] 매수주문(국내주식) 종목별 손익 상세
                                </div>
                                {k ? (
                                  <div className="space-y-1.5">
                                    <div className="text-[11px] font-mono text-slate-300">
                                      매입총액 {k.totalBuy.toLocaleString()}원 → 평가/매도총액 {k.totalSell.toLocaleString()}원 | 순손익{" "}
                                      <strong className={row.kPnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                        {formatKrw(row.kPnl)} ({k.retPct >= 0 ? "+" : ""}
                                        {k.retPct.toFixed(2)}%)
                                      </strong>
                                    </div>
                                    {k.stocksList.length > 0 && (
                                      <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto pt-1">
                                        {k.stocksList.map((st) => (
                                          <span
                                            key={st.ticker}
                                            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono"
                                          >
                                            <strong className="text-white font-sans">{st.name}</strong> ({st.qty}주){" "}
                                            <span className={st.pnl >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                              {formatKrw(st.pnl)}
                                            </span>
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-slate-500">해당 일자 매수주문 체결 종목이 없습니다.</div>
                                )}
                              </div>

                              {/* ETF 투자전략 상세 (환율 및 미국 자본차익세 22% 내역 포함) */}
                              <div className="bg-slate-900 border border-sky-500/30 rounded-xl p-3 space-y-1.5">
                                <div className="font-extrabold text-sky-300">
                                  ⚡ [{row.date} KST] 글로벌 ETF 투자전략 상세 (미국 거래일: {e?.usTradeDate || row.date})
                                </div>
                                {e ? (
                                  <div className="space-y-1 font-mono text-[11px] text-slate-300">
                                    <div>
                                      • 선택 ETF: <strong className="text-yellow-300">{e.targetEtf}</strong> ({e.targetEtfName}) | 적용환율:{" "}
                                      <strong className="text-sky-300">1 USD = {e.fxRate.toLocaleString()}원</strong>
                                    </div>
                                    <div>• 주문/보유 내역: {e.orderDetail}</div>
                                    <div>
                                      • 세전 손익: {formatKrw(e.grossDailyPnlKrw)} ({e.grossDailyPnlUsd >= 0 ? "+" : ""}${e.grossDailyPnlUsd}) | 미국 자본차익세(22%):{" "}
                                      <strong className="text-purple-300">{formatKrw(-e.dailyTaxKrw, false)}</strong>
                                    </div>
                                    <div>
                                      • 세후 실질 손익:{" "}
                                      <strong className={e.netDailyPnlKrw >= 0 ? "text-emerald-400" : "text-rose-400"}>
                                        {formatKrw(e.netDailyPnlKrw)} ({e.netDailyRetPct >= 0 ? "+" : ""}
                                        {e.netDailyRetPct}%)
                                      </strong>{" "}
                                      (누적 {formatKrw(row.cumEtfKrw)})
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-slate-500">해당 일자 미국장 ETF 휴장 또는 데이터 없음</div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
