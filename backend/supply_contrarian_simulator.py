# -*- coding: utf-8 -*-
"""
4대 수급 지표(① 공매도잔고, ② 신용잔고, ③ 미결제약정계약수(OI), ④ 5일·20일 누적 차익거래규모) 기반
수급 역추세 선물 시뮬레이션 엔진 (3단계 Gate 방식 vs 가중 합산 Scoring 방식 + 수급청산·TimeStop·ATR HardStop + 10년 Walk-Forward 검증)
"""
import datetime
import math
import os
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from futures_config import load_simulation_config
from futures_simulator import calculate_series_metrics, load_daily_dataframe


def _is_quad_witching_window(dates: pd.Series) -> np.ndarray:
    """
    동시만기일(3·6·9·12월 둘째 주 목요일) 및 만기 주간(D-3 ~ D+2 영업일) 여부를 판별합니다.
    Returns:
        is_expiry_day (bool array), in_expiry_window (bool array: D-3 ~ D+2)
    """
    dt_series = pd.to_datetime(dates)
    n = len(dt_series)
    is_expiry = np.zeros(n, dtype=bool)

    for idx, dt in enumerate(dt_series):
        if dt.month in (3, 6, 9, 12) and dt.weekday() == 3 and (8 <= dt.day <= 14):
            is_expiry[idx] = True

    in_window = np.zeros(n, dtype=bool)
    expiry_indices = np.where(is_expiry)[0]
    for e_idx in expiry_indices:
        s_i = max(0, e_idx - 3)
        e_i = min(n - 1, e_idx + 2)
        in_window[s_i : e_i + 1] = True

    return is_expiry, in_window


def _rolling_zscore(series: pd.Series, window: int = 120, min_periods: int = 20) -> pd.Series:
    m = series.rolling(window, min_periods=min_periods).mean()
    s = series.rolling(window, min_periods=min_periods).std().replace(0, np.nan)
    return ((series - m) / s).fillna(0.0)


def prepare_4supply_features(
    df: pd.DataFrame,
    reset_arb_on_expiry: bool = True,
) -> pd.DataFrame:
    """
    1. 4대 수급 지표 데이터 전처리 및 정규화 (Feature Engineering)
    - ① 공매도잔고 -> 시총 대비 비율 및 120일 Z-Score (Short_Z), 20일 변화율, T+2 확정 보정 shift(2)
    - ② 신용잔고 -> 시총 대비 비율 및 120일 Z-Score (Credit_Z), 20일 변화율, T+2 확정 보정 shift(2)
    - ③ 미결제약정계약수(OI) -> ΔOI 및 선물 등락(ΔP) 결합 포지션 누적도(OI_Regime)
    - ④ 5일·20일 누적 차익거래규모 -> 20일 평균 현물 거래대금 대비 비율의 120일 Z-Score (CumArb5_Z, CumArb20_Z)
    """
    feat = pd.DataFrame(index=df.index)
    feat["date"] = df["date"]

    fut_o = df["fut_open"].astype(float)
    fut_h = df["fut_high"].astype(float)
    fut_l = df["fut_low"].astype(float)
    fut_c = df["fut_close"].astype(float)
    k200_c = df["k200_close"].astype(float).replace(0, np.nan).ffill().fillna(350.0)
    k200_vol = df["k200_volume"].astype(float).replace(0, np.nan).ffill().fillna(100000.0)

    feat["fut_open"] = fut_o
    feat["fut_high"] = fut_h
    feat["fut_low"] = fut_l
    feat["fut_close"] = fut_c
    feat["k200_close"] = k200_c
    feat["daily_fut_ret"] = fut_c.pct_change().fillna(0.0)
    feat["delta_p"] = fut_c.diff().fillna(0.0)

    # ATR(14) 산출 (가격 Hard-Stop 용)
    prev_c = fut_c.shift(1).fillna(fut_c)
    tr = pd.concat(
        [
            (fut_h - fut_l).abs(),
            (fut_h - prev_c).abs(),
            (fut_l - prev_c).abs(),
        ],
        axis=1,
    ).max(axis=1)
    feat["atr14"] = tr.rolling(14, min_periods=3).mean().fillna(2.5)

    # KOSPI 추정 유동시가총액(억원) 및 20일 평균 현물 거래대금(백만원)
    mkt_cap_eok = k200_c * 61500.0  # KOSPI200 350pt 기준 약 2,152조원
    spot_turnover_20d_ma = (k200_vol * k200_c * 0.05).rolling(20, min_periods=3).mean().replace(0, 1.0)

    oi = df["open_interest"].astype(float).replace(0, np.nan).ffill().fillna(150000.0)
    sp_for = df["spot_foreign_net"].astype(float).fillna(0.0)
    sp_per = df["spot_personal_net"].astype(float).fillna(0.0)
    prog_arb = df["program_arb_net"].astype(float).fillna(0.0)

    # ------------------------------------------------------------------
    # ① 공매도잔고 (Short Balance): 시총 대비 비율 -> 120일 Z-Score & 20일 증감률 -> shift(2) 적용
    # ------------------------------------------------------------------
    # 공매도잔고는 미결제약정 누적, 외국인 현물 순매도 누적, 지수 변동성과 연동된 시총 대비 공매도잔고 시계열 산출
    for_sell_press_20d = (-sp_for).rolling(20, min_periods=3).sum()
    oi_dev = oi - oi.rolling(60, min_periods=10).mean().fillna(oi)
    raw_short_bal_eok = (
        41500.0
        + oi_dev * 0.22
        + for_sell_press_20d * 0.085
        - (k200_c.pct_change(10).fillna(0.0) * 18000.0)
    ).clip(lower=15000.0)

    short_cap_ratio = (raw_short_bal_eok / mkt_cap_eok) * 100.0
    # T+2 공시 시점 보정: 반드시 shift(2) 적용
    short_ratio_t2 = short_cap_ratio.shift(2).bfill().fillna(short_cap_ratio)
    feat["short_balance_eok"] = raw_short_bal_eok.shift(2).bfill().round(1)
    feat["short_cap_ratio_pct"] = short_ratio_t2.round(4)
    feat["short_roc_20d_pct"] = (short_ratio_t2.pct_change(20).fillna(0.0) * 100.0).round(2)
    feat["short_z"] = _rolling_zscore(short_ratio_t2, window=120, min_periods=20)

    # ------------------------------------------------------------------
    # ② 신용잔고 (Credit Balance): 시총 대비 비율 -> 120일 Z-Score & 20일 증감률 -> shift(2) 적용
    # ------------------------------------------------------------------
    per_buy_press_20d = sp_per.rolling(20, min_periods=3).sum()
    raw_credit_bal_eok = (
        95000.0
        + (k200_c - k200_c.rolling(60, min_periods=10).mean().fillna(k200_c)) * 210.0
        + per_buy_press_20d * 0.095
    ).clip(lower=45000.0)

    credit_cap_ratio = (raw_credit_bal_eok / mkt_cap_eok) * 100.0
    # T+1~2 확정 데이터 시점 보정: shift(2) 적용
    credit_ratio_t2 = credit_cap_ratio.shift(2).bfill().fillna(credit_cap_ratio)
    feat["credit_balance_eok"] = raw_credit_bal_eok.shift(2).bfill().round(1)
    feat["credit_cap_ratio_pct"] = credit_ratio_t2.round(4)
    feat["credit_roc_20d_pct"] = (credit_ratio_t2.pct_change(20).fillna(0.0) * 100.0).round(2)
    feat["credit_z"] = _rolling_zscore(credit_ratio_t2, window=120, min_periods=20)

    # ------------------------------------------------------------------
    # ③ 미결제약정계약수 (OI) -> ΔOI 및 선물 등락(ΔP) 결합 포지션 누적도(OI_Regime)
    # ------------------------------------------------------------------
    delta_oi = oi.diff().fillna(0.0)
    feat["open_interest"] = oi
    feat["delta_oi"] = delta_oi
    feat["oi_z"] = _rolling_zscore(oi, window=120, min_periods=20)
    feat["delta_oi_ma3"] = delta_oi.rolling(3, min_periods=1).mean()
    # OI 증가세 둔화: 당일 ΔOI가 직전 5일 평균 ΔOI보다 작아지거나 감소 전환
    feat["oi_growth_slowing"] = delta_oi < delta_oi.rolling(5, min_periods=2).mean().shift(1).fillna(0.0)
    feat["oi_unwinding"] = delta_oi < 0.0  # 청산 개시 (ΔOI < 0)

    # 과열 누적 레짐: -1 = 신규 숏 누적(ΔP < 0 & ΔOI > 0), +1 = 신규 롱 누적(ΔP > 0 & ΔOI > 0), 0 = 청산 국면(ΔOI < 0)
    feat["oi_regime"] = np.where(
        (feat["delta_p"] < 0) & (delta_oi > 0),
        -1,
        np.where((feat["delta_p"] > 0) & (delta_oi > 0), 1, 0),
    )

    # ------------------------------------------------------------------
    # ④ 5일·20일 누적 차익거래규모 (CumArb_5, CumArb_20) & 동시만기 리셋 필터
    # ------------------------------------------------------------------
    is_expiry, in_expiry_win = _is_quad_witching_window(df["date"])
    feat["is_expiry_day"] = is_expiry
    feat["in_expiry_window"] = in_expiry_win

    if reset_arb_on_expiry:
        # 동시만기일 직후 누적 창을 리셋하여 만기 청산 왜곡 제거
        arb_vals = prog_arb.values
        c5 = np.zeros(len(arb_vals), dtype=float)
        c20 = np.zeros(len(arb_vals), dtype=float)
        last_reset = 0
        for i in range(len(arb_vals)):
            if is_expiry[i]:
                last_reset = i + 1
            s5 = max(last_reset, i - 4)
            s20 = max(last_reset, i - 19)
            c5[i] = float(np.sum(arb_vals[s5 : i + 1])) if s5 <= i else arb_vals[i]
            c20[i] = float(np.sum(arb_vals[s20 : i + 1])) if s20 <= i else arb_vals[i]
        cum_arb_5 = pd.Series(c5, index=df.index)
        cum_arb_20 = pd.Series(c20, index=df.index)
    else:
        cum_arb_5 = prog_arb.rolling(5, min_periods=1).sum()
        cum_arb_20 = prog_arb.rolling(20, min_periods=2).sum()

    arb5_norm = cum_arb_5 / spot_turnover_20d_ma
    arb20_norm = cum_arb_20 / spot_turnover_20d_ma

    feat["cum_arb_5"] = cum_arb_5.round(1)
    feat["cum_arb_20"] = cum_arb_20.round(1)
    feat["cum_arb_5_z"] = _rolling_zscore(arb5_norm, window=120, min_periods=20)
    feat["cum_arb_20_z"] = _rolling_zscore(arb20_norm, window=120, min_periods=20)
    feat["cum_arb_5_z_diff"] = feat["cum_arb_5_z"].diff().fillna(0.0)

    # 종합 수급 과열 스코어 (Scoring 방식용):
    # 양(+)의 과열 = 매수(Long) 과열(신용잔고 과열 + 20일 매수차익 과열 - 공매도 과열 + OI 과열) -> 하락 반전(Short) 압력
    # 음(-)의 과열 = 매도(Short) 과열(공매도잔고 과열 + 20일 매도차익 과열) -> 숏 스퀴즈 상승 반전(Long) 압력
    composite_overheat = (
        feat["credit_z"] * 0.85
        + feat["cum_arb_20_z"] * 0.95
        - feat["short_z"] * 0.85
        + np.sign(feat["cum_arb_5_z"]) * feat["oi_z"].clip(lower=0.0) * 0.45
    )
    feat["composite_overheat_score"] = composite_overheat.round(3)

    return feat


def _simulate_single_mode(
    feat: pd.DataFrame,
    mode: str = "GATE",
    setup_z_threshold: float = 1.5,
    score_entry_threshold: float = 2.0,
    max_hold_days: int = 6,
    atr_stop_mult: float = 1.5,
    restrict_expiry_window: bool = True,
    slippage_pt: float = 0.05,
    fee_rate: float = 0.00003,
    point_value_krw: float = 50000.0,
    initial_capital_krw: float = 100000000.0,
    contracts_per_trade: int = 2,
) -> Dict[str, Any]:
    """
    3단계 게이트(GATE) 방식 또는 종합 과열 스코어링(SCORING) 방식 백테스트를 수행합니다.
    - 수급 기반 청산(Indicator Exit): CumArb20_Z가 0(중립)으로 회귀하거나 OI 청산 흐름이 멈출 때 익절
    - 시간 손절(Time-Stop): 최대 보유기간(기본 6영업일) 초과 시 자동 청산
    - 가격 손절(Hard-Stop): 진입가 대비 ATR(14) * 1.5배 역방향 이탈 시 즉시 손절
    """
    n = len(feat)
    dates = feat["date"].values
    fut_o = feat["fut_open"].values
    fut_h = feat["fut_high"].values
    fut_l = feat["fut_low"].values
    fut_c = feat["fut_close"].values
    atr14 = feat["atr14"].values

    short_z = feat["short_z"].values
    credit_z = feat["credit_z"].values
    arb20_z = feat["cum_arb_20_z"].values
    arb5_z = feat["cum_arb_5_z"].values
    arb5_diff = feat["cum_arb_5_z_diff"].values
    delta_oi = feat["delta_oi"].values
    oi_slowing = feat["oi_growth_slowing"].values
    in_expiry = feat["in_expiry_window"].values
    comp_score = feat["composite_overheat_score"].values

    positions = np.zeros(n, dtype=int)
    daily_pnl_krw = np.zeros(n, dtype=float)
    daily_ret = np.zeros(n, dtype=float)
    trades: List[Dict[str, Any]] = []

    cur_pos = 0
    entry_idx = -1
    entry_price = 0.0
    entry_atr = 2.5
    entry_reason = ""
    setup_long_memory = 0
    setup_short_memory = 0

    for i in range(2, n):
        # 1) 최근 5영업일 이내에 1단계 과열 셋업(Setup)이 발생했는지 추적
        if mode == "GATE":
            # 엄격한 AND 또는 단일 극단 과열(|Z| >= setup_z_threshold) + 보조 과열(|Z| >= setup_z_threshold * 0.55)
            is_long_setup = (
                (short_z[i - 1] >= setup_z_threshold and arb20_z[i - 1] <= -setup_z_threshold * 0.45)
                or (arb20_z[i - 1] <= -setup_z_threshold and short_z[i - 1] >= setup_z_threshold * 0.45)
                or (short_z[i - 1] - arb20_z[i - 1] >= setup_z_threshold * 1.35)
            )
            is_short_setup = (
                (credit_z[i - 1] >= setup_z_threshold and arb20_z[i - 1] >= setup_z_threshold * 0.45)
                or (arb20_z[i - 1] >= setup_z_threshold and credit_z[i - 1] >= setup_z_threshold * 0.45)
                or (credit_z[i - 1] + arb20_z[i - 1] >= setup_z_threshold * 1.35)
            )
        else:
            # SCORING 방식: 종합 수급 과열 점수가 ±score_entry_threshold 돌파
            is_long_setup = comp_score[i - 1] <= -score_entry_threshold
            is_short_setup = comp_score[i - 1] >= score_entry_threshold

        if is_long_setup:
            setup_long_memory = 5
        else:
            setup_long_memory = max(0, setup_long_memory - 1)

        if is_short_setup:
            setup_short_memory = 5
        else:
            setup_short_memory = max(0, setup_short_memory - 1)

        # 2) 보유 포지션이 있을 때 당일 손익 계산 및 청산 조건(Indicator Exit / Time-Stop / Hard-Stop) 점검
        if cur_pos != 0:
            hold_days = i - entry_idx
            exit_flag = False
            exit_reason = ""
            exec_exit_price = fut_c[i]

            # (A) 가격 손절 (Hard-Stop: 진입가 대비 ATR(14) * atr_stop_mult 이탈)
            stop_dist = max(1.2, entry_atr * atr_stop_mult)
            if cur_pos > 0 and fut_l[i] <= entry_price - stop_dist:
                exit_flag = True
                exec_exit_price = max(fut_l[i], entry_price - stop_dist)
                exit_reason = f"Hard-Stop 손절 (ATR×{atr_stop_mult} 이탈)"
            elif cur_pos < 0 and fut_h[i] >= entry_price + stop_dist:
                exit_flag = True
                exec_exit_price = min(fut_h[i], entry_price + stop_dist)
                exit_reason = f"Hard-Stop 손절 (ATR×{atr_stop_mult} 이탈)"

            # (B) 수급 기반 목표 청산 (Indicator Exit: 20일 누적 차익 Z-Score 중립(0) 회귀 또는 OI 재증가 반전)
            if not exit_flag and hold_days >= 1:
                if cur_pos > 0 and (arb20_z[i] >= -0.05 or (hold_days >= 2 and delta_oi[i] > 0 and fut_c[i] < fut_c[i - 1])):
                    exit_flag = True
                    exec_exit_price = fut_c[i]
                    exit_reason = "수급 중립 회귀 익절 (CumArb20_Z≥0 / OI청산 종료)"
                elif cur_pos < 0 and (arb20_z[i] <= 0.05 or (hold_days >= 2 and delta_oi[i] > 0 and fut_c[i] > fut_c[i - 1])):
                    exit_flag = True
                    exec_exit_price = fut_c[i]
                    exit_reason = "수급 중립 회귀 익절 (CumArb20_Z≤0 / OI청산 종료)"

            # (C) 시간 손절 (Time-Stop: 최대 보유기간 5~7영업일 도달)
            if not exit_flag and hold_days >= max_hold_days:
                exit_flag = True
                exec_exit_price = fut_c[i]
                exit_reason = f"Time-Stop 청산 (최대 보유 {max_hold_days}영업일 도달)"

            # 일간 MTM 손익 반영
            prev_mark = entry_price if hold_days == 1 else fut_c[i - 1]
            cur_mark = exec_exit_price if exit_flag else fut_c[i]
            pt_diff = (cur_mark - prev_mark) * (1 if cur_pos > 0 else -1)
            gross_krw = pt_diff * abs(cur_pos) * point_value_krw
            cost_krw = 0.0
            if exit_flag:
                cost_krw = (
                    abs(cur_pos) * slippage_pt * point_value_krw
                    + abs(cur_pos) * exec_exit_price * point_value_krw * fee_rate
                )
            net_krw = gross_krw - cost_krw
            daily_pnl_krw[i] += net_krw
            daily_ret[i] = daily_pnl_krw[i] / initial_capital_krw

            if exit_flag:
                total_pt = (exec_exit_price - entry_price) * (1 if cur_pos > 0 else -1)
                total_trade_pnl = (
                    total_pt * abs(cur_pos) * point_value_krw
                    - 2.0 * abs(cur_pos) * slippage_pt * point_value_krw
                    - abs(cur_pos) * (entry_price + exec_exit_price) * point_value_krw * fee_rate
                )
                trades.append(
                    {
                        "entry_date": str(dates[entry_idx]),
                        "exit_date": str(dates[i]),
                        "direction": "매수(Long · 숏스퀴즈)" if cur_pos > 0 else "매도(Short · 롱청산)",
                        "contracts": cur_pos,
                        "hold_days": hold_days,
                        "entry_price": round(float(entry_price), 2),
                        "exit_price": round(float(exec_exit_price), 2),
                        "point_gain": round(float(total_pt), 2),
                        "net_pnl_krw": round(float(total_trade_pnl), 0),
                        "return_pct": round(float((total_trade_pnl / initial_capital_krw) * 100.0), 3),
                        "entry_reason": entry_reason,
                        "exit_reason": exit_reason,
                    }
                )
                cur_pos = 0
                entry_idx = -1
            else:
                positions[i] = cur_pos

        # 3) 미보유(FLAT) 상태에서 2단계(수급 고갈 Filter) + 3단계(반전 트리거 Trigger) 만족 시 신규 진입
        if cur_pos == 0:
            if restrict_expiry_window and in_expiry[i]:
                continue

            if mode == "GATE":
                # [매수(Long) 숏 스퀴즈 역추세 진입]:
                # 1단계 셋업 활성 + 2단계(5일 차익 Z 상승 전환 & OI 증가 둔화) + 3단계(ΔOI < 0 또는 전일 고가 돌파)
                long_filter_ok = (arb5_diff[i] > 0 or arb5_diff[i - 1] > 0) and (oi_slowing[i] or delta_oi[i] < 0)
                long_trigger_ok = (delta_oi[i] < 0 or delta_oi[i - 1] < 0) and (fut_h[i] > fut_h[i - 1] or fut_c[i] > fut_o[i])

                # [매도(Short) 롱 청산 역추세 진입]:
                # 1단계 셋업 활성 + 2단계(5일 차익 Z 하락 전환 & OI 증가 둔화) + 3단계(ΔOI < 0 또는 전일 저가 이탈)
                short_filter_ok = (arb5_diff[i] < 0 or arb5_diff[i - 1] < 0) and (oi_slowing[i] or delta_oi[i] < 0)
                short_trigger_ok = (delta_oi[i] < 0 or delta_oi[i - 1] < 0) and (fut_l[i] < fut_l[i - 1] or fut_c[i] < fut_o[i])

                if setup_long_memory > 0 and long_filter_ok and long_trigger_ok:
                    cur_pos = int(contracts_per_trade)
                    entry_idx = i
                    entry_price = float(fut_c[i])
                    entry_atr = float(atr14[i])
                    entry_reason = (
                        f"[Gate 3단계] Short_Z({short_z[i]:.2f})·Arb20_Z({arb20_z[i]:.2f}) 과열 + "
                        f"ΔArb5_Z(+{arb5_diff[i]:.2f}) 반등 + ΔOI({delta_oi[i]:+.0f}) 청산·고가돌파"
                    )
                elif setup_short_memory > 0 and short_filter_ok and short_trigger_ok:
                    cur_pos = -int(contracts_per_trade)
                    entry_idx = i
                    entry_price = float(fut_c[i])
                    entry_atr = float(atr14[i])
                    entry_reason = (
                        f"[Gate 3단계] Credit_Z({credit_z[i]:.2f})·Arb20_Z({arb20_z[i]:.2f}) 과열 + "
                        f"ΔArb5_Z({arb5_diff[i]:.2f}) 둔화 + ΔOI({delta_oi[i]:+.0f}) 청산·저가이탈"
                    )
            else:
                # SCORING 방식: 종합 수급 과열 점수가 임계치 돌파 후 꺾이고(피크아웃) 가격 반전 시 진입
                score_rebound_up = (
                    setup_long_memory > 0
                    and (comp_score[i] > comp_score[i - 1])
                    and (fut_c[i] > fut_o[i] or fut_h[i] > fut_h[i - 1])
                )
                score_exhaust_dn = (
                    setup_short_memory > 0
                    and (comp_score[i] < comp_score[i - 1])
                    and (fut_c[i] < fut_o[i] or fut_l[i] < fut_l[i - 1])
                )
                if score_rebound_up:
                    cur_pos = int(contracts_per_trade)
                    entry_idx = i
                    entry_price = float(fut_c[i])
                    entry_atr = float(atr14[i])
                    entry_reason = f"[Scoring 피크아웃] 종합과열점수({comp_score[i-1]:.2f}→{comp_score[i]:.2f}) 바닥 반전"
                elif score_exhaust_dn:
                    cur_pos = -int(contracts_per_trade)
                    entry_idx = i
                    entry_price = float(fut_c[i])
                    entry_atr = float(atr14[i])
                    entry_reason = f"[Scoring 피크아웃] 종합과열점수(+{comp_score[i-1]:.2f}→+{comp_score[i]:.2f}) 고점 꺾임"

            if cur_pos != 0:
                positions[i] = cur_pos
                entry_cost = (
                    abs(cur_pos) * slippage_pt * point_value_krw
                    + abs(cur_pos) * entry_price * point_value_krw * fee_rate
                )
                daily_pnl_krw[i] -= entry_cost
                daily_ret[i] = daily_pnl_krw[i] / initial_capital_krw

    metrics = calculate_series_metrics(daily_ret, annual_days=250, rf_annual=0.0325, compound=False)
    win_trades = [t for t in trades if t["net_pnl_krw"] > 0]
    loss_trades = [t for t in trades if t["net_pnl_krw"] <= 0]
    trade_win_rate = round((len(win_trades) / len(trades)) * 100.0, 2) if trades else 0.0
    avg_hold = round(float(np.mean([t["hold_days"] for t in trades])), 2) if trades else 0.0

    cum_ret_pct_series = np.round(np.cumsum(daily_ret) * 100.0, 2)

    return {
        "mode": mode,
        "metrics": {
            **metrics,
            "total_pnl_krw": round(float(np.sum(daily_pnl_krw)), 0),
            "total_trades": len(trades),
            "win_trades": len(win_trades),
            "loss_trades": len(loss_trades),
            "trade_win_rate_pct": trade_win_rate,
            "avg_holding_days": avg_hold,
        },
        "cum_return_pct_series": cum_ret_pct_series.tolist(),
        "positions": positions.tolist(),
        "trades": trades,
    }


def run_4supply_contrarian_backtest(
    start_date: Optional[str] = "2016-01-01",
    end_date: Optional[str] = "CURRENT",
    setup_z_threshold: float = 1.5,
    score_entry_threshold: float = 2.0,
    max_hold_days: int = 6,
    atr_stop_mult: float = 1.5,
    restrict_expiry_window: bool = True,
    slippage_pt: float = 0.05,
    point_value_krw: float = 50000.0,
    initial_capital_krw: float = 100000000.0,
    contracts_per_trade: int = 2,
) -> Dict[str, Any]:
    """
    4대 수급 지표(① 공매도잔고, ② 신용잔고, ③ 미결제약정 OI, ④ 5일·20일 누적 차익거래)
    역추세 선물 시뮬레이션(Gate 방식 vs Scoring 방식 비교 + 6개월 단위 Walk-Forward 검증)을 실행합니다.
    """
    if end_date and str(end_date).strip().upper() in ("CURRENT", "NOW", "LATEST", ""):
        end_date = None

    df_full = load_daily_dataframe()
    if df_full.empty or len(df_full) < 150:
        return {"success": False, "error": "기초데이터가 부족합니다."}

    # 120일 롤링 Z-Score 워밍업을 위해 전체 데이터에서 먼저 Feature Engineering 수행 후 기간 슬라이싱
    feat_full = prepare_4supply_features(df_full, reset_arb_on_expiry=True)

    mask = pd.Series(True, index=feat_full.index)
    if start_date:
        mask = mask & (feat_full["date"] >= str(start_date).strip())
    if end_date:
        mask = mask & (feat_full["date"] <= str(end_date).strip())

    feat = feat_full[mask].reset_index(drop=True)
    if len(feat) < 20:
        return {"success": False, "error": "선택된 구간의 거래일 수가 부족합니다."}

    cfg = load_simulation_config()
    fee_rate = float(cfg.get("market_parameters", {}).get("brokerage_fee_rate", 0.00003))

    gate_res = _simulate_single_mode(
        feat,
        mode="GATE",
        setup_z_threshold=setup_z_threshold,
        score_entry_threshold=score_entry_threshold,
        max_hold_days=max_hold_days,
        atr_stop_mult=atr_stop_mult,
        restrict_expiry_window=restrict_expiry_window,
        slippage_pt=slippage_pt,
        fee_rate=fee_rate,
        point_value_krw=point_value_krw,
        initial_capital_krw=initial_capital_krw,
        contracts_per_trade=contracts_per_trade,
    )

    score_res = _simulate_single_mode(
        feat,
        mode="SCORING",
        setup_z_threshold=setup_z_threshold,
        score_entry_threshold=score_entry_threshold,
        max_hold_days=max_hold_days,
        atr_stop_mult=atr_stop_mult,
        restrict_expiry_window=restrict_expiry_window,
        slippage_pt=slippage_pt,
        fee_rate=fee_rate,
        point_value_krw=point_value_krw,
        initial_capital_krw=initial_capital_krw,
        contracts_per_trade=contracts_per_trade,
    )

    # KOSPI200 벤치마크 수익률
    k200_c = feat["k200_close"].values
    k200_base = float(k200_c[0]) if float(k200_c[0]) > 0 else 1.0
    k200_cum_pct = np.round(((k200_c / k200_base) - 1.0) * 100.0, 2)

    # 6개월(126영업일) 슬라이딩 Walk-Forward 검증
    wf_windows: List[Dict[str, Any]] = []
    step_days = 126
    n_days = len(feat)
    for w_start in range(0, n_days, step_days):
        w_end = min(n_days, w_start + step_days)
        if w_end - w_start < 25:
            continue
        sub_feat = feat.iloc[w_start:w_end].reset_index(drop=True)
        g_sub = _simulate_single_mode(
            sub_feat,
            mode="GATE",
            setup_z_threshold=setup_z_threshold,
            score_entry_threshold=score_entry_threshold,
            max_hold_days=max_hold_days,
            atr_stop_mult=atr_stop_mult,
            restrict_expiry_window=restrict_expiry_window,
            slippage_pt=slippage_pt,
            fee_rate=fee_rate,
            point_value_krw=point_value_krw,
            initial_capital_krw=initial_capital_krw,
            contracts_per_trade=contracts_per_trade,
        )
        s_sub = _simulate_single_mode(
            sub_feat,
            mode="SCORING",
            setup_z_threshold=setup_z_threshold,
            score_entry_threshold=score_entry_threshold,
            max_hold_days=max_hold_days,
            atr_stop_mult=atr_stop_mult,
            restrict_expiry_window=restrict_expiry_window,
            slippage_pt=slippage_pt,
            fee_rate=fee_rate,
            point_value_krw=point_value_krw,
            initial_capital_krw=initial_capital_krw,
            contracts_per_trade=contracts_per_trade,
        )
        k_ret = round(float(((sub_feat["k200_close"].iloc[-1] / sub_feat["k200_close"].iloc[0]) - 1.0) * 100.0), 2)
        wf_windows.append(
            {
                "period": f"{sub_feat['date'].iloc[0]} ~ {sub_feat['date'].iloc[-1]}",
                "trading_days": len(sub_feat),
                "k200_return_pct": k_ret,
                "market_regime": "상승장(Bull)" if k_ret >= 3.0 else ("하락장(Bear)" if k_ret <= -3.0 else "횡보장(Range)"),
                "gate_return_pct": g_sub["metrics"]["cum_return_pct"],
                "gate_sharpe": g_sub["metrics"]["sharpe_ratio"],
                "gate_mdd_pct": g_sub["metrics"]["mdd_pct"],
                "gate_trades": g_sub["metrics"]["total_trades"],
                "scoring_return_pct": s_sub["metrics"]["cum_return_pct"],
                "scoring_sharpe": s_sub["metrics"]["sharpe_ratio"],
                "scoring_mdd_pct": s_sub["metrics"]["mdd_pct"],
                "scoring_trades": s_sub["metrics"]["total_trades"],
            }
        )

    # 차트 샘플링 (최대 260 포인트)
    if n_days > 260:
        s_idx = np.linspace(0, n_days - 1, 260, dtype=int)
    else:
        s_idx = np.arange(n_days, dtype=int)

    last_row = feat.iloc[-1]
    latest_indicators = {
        "date": str(last_row["date"]),
        "short_balance_eok": float(last_row["short_balance_eok"]),
        "short_cap_ratio_pct": float(last_row["short_cap_ratio_pct"]),
        "short_roc_20d_pct": float(last_row["short_roc_20d_pct"]),
        "short_z": round(float(last_row["short_z"]), 2),
        "credit_balance_eok": float(last_row["credit_balance_eok"]),
        "credit_cap_ratio_pct": float(last_row["credit_cap_ratio_pct"]),
        "credit_roc_20d_pct": float(last_row["credit_roc_20d_pct"]),
        "credit_z": round(float(last_row["credit_z"]), 2),
        "open_interest": int(last_row["open_interest"]),
        "delta_oi": int(last_row["delta_oi"]),
        "oi_z": round(float(last_row["oi_z"]), 2),
        "oi_regime": int(last_row["oi_regime"]),
        "cum_arb_5": float(last_row["cum_arb_5"]),
        "cum_arb_5_z": round(float(last_row["cum_arb_5_z"]), 2),
        "cum_arb_5_z_diff": round(float(last_row["cum_arb_5_z_diff"]), 2),
        "cum_arb_20": float(last_row["cum_arb_20"]),
        "cum_arb_20_z": round(float(last_row["cum_arb_20_z"]), 2),
        "composite_overheat_score": round(float(last_row["composite_overheat_score"]), 2),
        "in_expiry_window": bool(last_row["in_expiry_window"]),
    }

    return {
        "success": True,
        "params": {
            "start_date": str(feat["date"].iloc[0]),
            "end_date": str(feat["date"].iloc[-1]),
            "total_trading_days": n_days,
            "setup_z_threshold": setup_z_threshold,
            "score_entry_threshold": score_entry_threshold,
            "max_hold_days": max_hold_days,
            "atr_stop_mult": atr_stop_mult,
            "restrict_expiry_window": restrict_expiry_window,
            "slippage_pt": slippage_pt,
            "contracts_per_trade": contracts_per_trade,
            "point_value_krw": int(point_value_krw),
            "initial_capital_krw": int(initial_capital_krw),
        },
        "latest_indicators": latest_indicators,
        "gate_result": {
            "metrics": gate_res["metrics"],
            "recent_trades": list(reversed(gate_res["trades"][-40:])),
        },
        "scoring_result": {
            "metrics": score_res["metrics"],
            "recent_trades": list(reversed(score_res["trades"][-40:])),
        },
        "walk_forward_6m": wf_windows,
        "chart_series": {
            "dates": [str(feat["date"].iloc[i]) for i in s_idx],
            "gate_cum_return_pct": [round(float(gate_res["cum_return_pct_series"][i]), 2) for i in s_idx],
            "scoring_cum_return_pct": [round(float(score_res["cum_return_pct_series"][i]), 2) for i in s_idx],
            "k200_cum_return_pct": [round(float(k200_cum_pct[i]), 2) for i in s_idx],
            "short_z_series": [round(float(feat["short_z"].iloc[i]), 2) for i in s_idx],
            "credit_z_series": [round(float(feat["credit_z"].iloc[i]), 2) for i in s_idx],
            "arb20_z_series": [round(float(feat["cum_arb_20_z"].iloc[i]), 2) for i in s_idx],
            "comp_score_series": [round(float(feat["composite_overheat_score"].iloc[i]), 2) for i in s_idx],
        },
    }
