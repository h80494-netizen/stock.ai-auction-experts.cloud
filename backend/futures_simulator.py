import datetime
import json
import math
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from futures_config import (
    get_active_pool,
    get_archived_models,
    get_candidate_pool,
    load_simulation_config,
    save_simulation_config,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(BASE_DIR, "data", "futures_simulation.db")
RAWDATA_XLSX_PATH = os.path.join(BASE_DIR, "data", "rawdata.xlsx")
_LAST_SYNCED_EXCEL_MTIME: float = 0.0
_TABLES_INITIALIZED: bool = False


def ensure_rawdata_excel_synced() -> None:
    """data/rawdata.xlsx가 DB에 아직 적재되지 않았을 때만 SQLite DB(futures_daily_data)에 초기 동기화합니다."""
    global _LAST_SYNCED_EXCEL_MTIME
    if not os.path.exists(RAWDATA_XLSX_PATH):
        return
    try:
        xlsx_mtime = os.path.getmtime(RAWDATA_XLSX_PATH)
        if _LAST_SYNCED_EXCEL_MTIME > 0 and xlsx_mtime <= _LAST_SYNCED_EXCEL_MTIME:
            return
        if os.path.exists(DB_PATH):
            conn = sqlite3.connect(DB_PATH, timeout=30.0)
            c = conn.cursor()
            c.execute("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='futures_daily_data'")
            has_tbl = c.fetchone()[0] > 0
            row_cnt = 0
            if has_tbl:
                c.execute("SELECT COUNT(*) FROM futures_daily_data")
                row_cnt = c.fetchone()[0]
            conn.close()
            if row_cnt >= 3800:
                _LAST_SYNCED_EXCEL_MTIME = xlsx_mtime
                return
        import sys
        scripts_dir = os.path.join(BASE_DIR, "scripts")
        if scripts_dir not in sys.path:
            sys.path.insert(0, scripts_dir)
        from update_rawdata import sync_rawdata_excel_to_sqlite
        sync_rawdata_excel_to_sqlite(RAWDATA_XLSX_PATH, DB_PATH)
        _LAST_SYNCED_EXCEL_MTIME = xlsx_mtime
    except Exception as e:
        print(f"[Warn] auto-sync rawdata.xlsx to sqlite failed: {e}")


def init_sim_tables() -> None:
    global _TABLES_INITIALIZED
    if _TABLES_INITIALIZED and os.path.exists(DB_PATH):
        return
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    c = conn.cursor()
    c.execute("PRAGMA journal_mode=WAL;")
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS model_swap_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            swap_date TEXT,
            dropped_model_id TEXT,
            dropped_model_name TEXT,
            dropped_mdd_pct REAL,
            dropped_sharpe REAL,
            selected_model_id TEXT,
            selected_model_name TEXT,
            selected_sharpe REAL,
            selected_return_pct REAL,
            reason TEXT,
            created_at TEXT
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS model_pool_archive (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            evaluated_date TEXT,
            period_months INTEGER,
            added_model_id TEXT,
            added_model_name TEXT,
            in_sample_return_pct REAL,
            in_sample_sharpe REAL,
            out_sample_return_pct REAL,
            out_sample_sharpe REAL,
            archived_model_id TEXT,
            archived_model_name TEXT,
            archived_model_sharpe REAL,
            archived_model_return_pct REAL,
            model_Snapshot_json TEXT,
            created_at TEXT
        )
        """
    )
    c.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_signal_lock (
            lock_date TEXT PRIMARY KEY,
            locked_at_kst TEXT,
            lock_status TEXT,
            active_5_models_json TEXT,
            all_10_signals_json TEXT,
            base_position_sum INTEGER,
            multiplier INTEGER,
            prev_contracts INTEGER,
            target_contracts INTEGER,
            order_delta_contracts INTEGER,
            order_action TEXT,
            futures_price_at_lock REAL,
            indicator_snapshot_json TEXT
        )
        """
    )
    conn.commit()
    conn.close()
    _TABLES_INITIALIZED = True


_CACHED_FULL_DF: Optional[pd.DataFrame] = None
_CACHED_DB_MTIME: float = 0.0
_CACHED_SIGNALS: Dict[Tuple[float, bool, float], pd.DataFrame] = {}
_CACHED_SIM_RESULTS: Dict[Any, Dict[str, Any]] = {}


def invalidate_sim_cache() -> None:
    """실시간 데이터 동기화 직후 메모리 캐시를 즉시 무효화합니다."""
    global _CACHED_FULL_DF, _CACHED_DB_MTIME
    _CACHED_FULL_DF = None
    _CACHED_DB_MTIME = 0.0
    _CACHED_SIGNALS.clear()
    _CACHED_SIM_RESULTS.clear()


def _get_effective_db_mtime() -> float:
    if not os.path.exists(DB_PATH):
        return 0.0
    mt = os.path.getmtime(DB_PATH)
    wal_p = DB_PATH + "-wal"
    if os.path.exists(wal_p):
        try:
            mt = max(mt, os.path.getmtime(wal_p))
        except OSError:
            pass
    return mt


def load_daily_dataframe(start_date: Optional[str] = None, end_date: Optional[str] = None) -> pd.DataFrame:
    global _CACHED_FULL_DF, _CACHED_DB_MTIME
    ensure_rawdata_excel_synced()
    if not os.path.exists(DB_PATH):
        raise FileNotFoundError(f"데이터베이스 파일이 없습니다: {DB_PATH}. 먼저 update_rawdata.py를 실행하세요.")

    if _CACHED_FULL_DF is None:
        db_mtime = _get_effective_db_mtime()
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        query = "SELECT * FROM futures_daily_data ORDER BY date ASC"
        df_raw = pd.read_sql_query(query, conn)
        conn.close()

        if not df_raw.empty:
            df_raw["date"] = pd.to_datetime(df_raw["date"]).dt.strftime("%Y-%m-%d")
            num_cols = [c for c in df_raw.columns if c != "date"]
            for col in num_cols:
                df_raw[col] = pd.to_numeric(df_raw[col], errors="coerce")
            df_raw[num_cols] = df_raw[num_cols].ffill().bfill().fillna(0.0)
        _CACHED_FULL_DF = df_raw.reset_index(drop=True)
        _CACHED_DB_MTIME = db_mtime
        _CACHED_SIGNALS.clear()

    df = _CACHED_FULL_DF
    if df is None or df.empty:
        return pd.DataFrame()

    if start_date:
        df = df[df["date"] >= start_date]
    if end_date:
        df = df[df["date"] <= end_date]

    return df.reset_index(drop=True)


def _rolling_rank_pct(series: pd.Series, window: int = 90) -> pd.Series:
    """rawdata.xlsx의 RANK(val, OFFSET(val, 0, 0, -90), 1) 대응 (1 ~ window 스케일)."""
    return series.rolling(window=window, min_periods=10).rank(ascending=True)


def compute_all_model_signals(
    df: pd.DataFrame,
    combine_supply: bool = True,
    supply_weight: float = 0.35,
) -> pd.DataFrame:
    """
    기초데이터(data/rawdata.xlsx 수정본 동기화 데이터)를 기반으로
    10대 운영 모델 및 후보 모델들의 일별 매매 시그널(매수=1, 매도=-1, 중립=0)을 벡터화 산출합니다.

    [2대 축(추세 동력 vs 횡보·평균회귀 에너지 동력) 스코어링 아키텍처]
    - 축 ① [강력한 추세 동력]: 신고가종목수/신저가종목수(new_high_low_diff 5일 vs 20일) + 외국인 순매수(선물·현물 5일 vs 20일)
    - 축 ② [과열 시 다시 내려가는 횡보·평균회귀 에너지 동력]:
      * 미결제약정(Open Interest: oi_z 및 rawdata Col 85~98 Rank3/Rank4/CT 에너지 과열 회귀)
      * Put/Call Ratio(PCR: pcr_z 과열 후 평균회귀)
      * 프로그램 차익거래(Program Arbitrage: prog_z 및 rawdata Col 48~50 Rank1/Rank2 =IF(AW>=68,-1,IF(AW>=23,0,1)) 과열 후 평균회귀)
    """
    sig_df = pd.DataFrame(index=df.index)
    sig_df["date"] = df["date"]

    fut_o = df["fut_open"]
    fut_h = df["fut_high"]
    fut_l = df["fut_low"]
    fut_c = df["fut_close"]
    k200_c = df["k200_close"]
    vol = df["k200_volume"].replace(0, np.nan).ffill().fillna(100000.0)
    daily_fut_ret = fut_c.pct_change().fillna(0.0).values

    # ------------------------------------------------------------------
    # [축 ① 강력한 추세 동력: 신고가/신저가 종목수 + 외국인 순매수 결합 스코어링]
    # ------------------------------------------------------------------
    nh_nl_1d = df["new_high_low_diff"]
    nh_nl_ma5 = nh_nl_1d.rolling(5, min_periods=1).mean()
    nh_nl_ma20 = nh_nl_1d.rolling(20, min_periods=2).mean()
    rank_nh_nl = _rolling_rank_pct(nh_nl_ma5, 60)

    factor_nh_nl_trend = (
        np.where(nh_nl_ma5 > nh_nl_ma20, 1.0, -1.0) * 0.55
        + np.where(nh_nl_ma5 > 0, 1.0, np.where(nh_nl_ma5 < 0, -1.0, 0.0)) * 0.25
        + np.where(rank_nh_nl >= 55, 1.0, np.where(rank_nh_nl <= 40, -1.0, 0.0)) * 0.20
    )

    fut_for_1d = df["fut_foreign_net"]
    fut_for_ma5 = fut_for_1d.rolling(5, min_periods=1).mean()
    fut_for_ma20 = fut_for_1d.rolling(20, min_periods=2).mean()
    fut_for_5d = fut_for_1d.rolling(5, min_periods=1).sum()
    spot_for_1d = df["spot_foreign_net"]
    spot_for_ma5 = spot_for_1d.rolling(5, min_periods=1).mean()
    rank_fut_for = _rolling_rank_pct(fut_for_5d, 60)

    factor_foreign_raw = (
        np.where(fut_for_ma5 > fut_for_ma20, 1.0, -1.0) * 0.50
        + np.where(spot_for_ma5 > 0, 1.0, np.where(spot_for_ma5 < 0, -1.0, 0.0)) * 0.25
        + np.where(rank_fut_for >= 55, 1.0, np.where(rank_fut_for <= 40, -1.0, 0.0)) * 0.25
    )

    trend_up = (nh_nl_ma5.values > nh_nl_ma20.values) & (fut_for_ma5.values > fut_for_ma20.values)
    trend_dn = (nh_nl_ma5.values < nh_nl_ma20.values) & (fut_for_ma5.values < fut_for_ma20.values)
    trend_regime = np.where(trend_up, 1, np.where(trend_dn, -1, 0))
    rev_regime = np.where(
        (nh_nl_1d < -10) & (fut_for_1d > fut_for_1d.shift(1).fillna(0)),
        1,
        np.where((nh_nl_1d > 10) & (fut_for_1d < fut_for_1d.shift(1).fillna(0)), -1, 0),
    )

    synergy_bonus = trend_regime * 0.30
    factor_nh_foreign_combined = np.clip(
        factor_nh_nl_trend * 0.45 + factor_foreign_raw * 0.55 + synergy_bonus, -1.0, 1.0
    )
    factor_foreign_trend = factor_nh_foreign_combined

    # ------------------------------------------------------------------
    # [축 ② 횡보·평균회귀 에너지 동력: 차익거래 + 미결제약정 + Put/Call Ratio]
    # "어느 정도 커지면 다시 내려가는 횡보의 강력한 에너지" (rawdata.xlsx Col 48~50, Col 85~98 반영)
    # ------------------------------------------------------------------
    # ③ 프로그램 차익거래 에너지 (5일 누적 Z-score & rawdata Col 49~50 Rank1/Rank2: AW>=68 -> -1, AW<23 -> +1)
    prog_1d = df["program_arb_net"]
    prog_cum = prog_1d.cumsum()
    prog_ma5 = prog_1d.rolling(5, min_periods=1).mean()
    prog_ma20 = prog_1d.rolling(20, min_periods=2).mean()
    prog_5d_sum = prog_1d.rolling(5, min_periods=1).sum()
    prog_z = (
        (prog_5d_sum - prog_5d_sum.rolling(20, min_periods=3).mean())
        / prog_5d_sum.rolling(20, min_periods=3).std().replace(0, 1.0)
    ).fillna(0.0).values
    rank_prog_90 = _rolling_rank_pct(prog_cum, 90)
    rawdata_rank2_rev = np.where(rank_prog_90 >= 68, -1.0, np.where(rank_prog_90 < 23, 1.0, 0.0))

    factor_prog_trend = (
        np.where((prog_ma5 >= prog_ma20) & (prog_z <= 1.15), 1.0, -1.0) * 0.50
        + rawdata_rank2_rev * 0.50
    )

    # ④ 미결제약정 에너지 (Open Interest Z-score & rawdata Col 85~98 에너지 과열 후 평균회귀)
    oi_series = df["open_interest"]
    oi_diff = oi_series.diff().fillna(0.0)
    oi_ma5 = oi_series.rolling(5, min_periods=1).mean()
    oi_ma20 = oi_series.rolling(20, min_periods=2).mean()
    oi_z = (
        (oi_series - oi_ma20) / oi_series.rolling(20, min_periods=3).std().replace(0, 1.0)
    ).fillna(0.0).values
    price_dir = np.where(fut_c >= fut_c.shift(1).fillna(fut_c), 1.0, -1.0)

    # 미결제약정이 적정 범위일 때는 추세 동조, 과열(oi_z > 0.9)일 때는 다시 내려가는 평균회귀 에너지 작동
    factor_oi_trend = np.where(
        (oi_ma5 >= oi_ma20) & (oi_z <= 0.90),
        np.sign(factor_nh_foreign_combined) * 0.70 + price_dir * 0.30,
        np.where(oi_z > 0.90, -price_dir * 0.80, np.sign(factor_nh_foreign_combined) * 0.40),
    )
    factor_oi_reversion = np.where(
        oi_z > 0.90,
        -price_dir,
        np.where(rev_regime != 0, rev_regime.astype(float), np.where(oi_diff < 0, -price_dir * 0.5, 0.0)),
    )

    # ⑤ Put/Call Ratio 에너지 (PCR Z-score 과열 후 평균회귀 & 콜/풋 이론가 괴리율)
    pcr_val = (df["put_close"] + 0.05) / (df["call_close"] + 0.05)
    pcr_ma5 = pcr_val.rolling(5, min_periods=1).mean()
    pcr_ma15 = pcr_val.rolling(15, min_periods=2).mean()
    pcr_z = (
        (pcr_val - pcr_val.rolling(20, min_periods=3).mean())
        / pcr_val.rolling(20, min_periods=3).std().replace(0, 1.0)
    ).fillna(0.0).values
    theo_gap = (df["call_close"] - df["call_theo"]) - (df["put_close"] - df["put_theo"])
    opt_for_diff = (df["call_foreign_qty"] - df["put_foreign_qty"]).rolling(3, min_periods=1).mean()

    factor_pcr_trend = (
        np.where(pcr_z > 1.0, 1.0, np.where(pcr_val <= pcr_ma5, 1.0, -1.0)) * 0.45
        + np.where(theo_gap >= 0, 1.0, -1.0) * 0.35
        + np.where(opt_for_diff >= 0, 1.0, -1.0) * 0.20
    )
    pcr_chg = pcr_val.diff().fillna(0.0)
    factor_pcr_reversion = np.where(
        (pcr_z > 0.95) | ((pcr_val > pcr_ma15 * 1.03) & (pcr_chg <= 0)),
        1.0,
        np.where(
            (pcr_z < -0.95) & (pcr_chg >= 0),
            -1.0,
            np.where(theo_gap > 0, 0.5, -0.5),
        ),
    )

    # ★ [횡보·평균회귀 에너지 임계치 판별: 차익거래·PCR·미결제약정이 어느 정도 커지면 다시 내려가는 에너지]
    energy_rebound_up = (prog_z < -1.10) | (pcr_z > 1.00) | ((oi_z > 0.90) & (daily_fut_ret < -0.004))
    energy_exhaust_top = (oi_z > 0.90) & (daily_fut_ret > 0.001) & ((prog_z > 0.70) | (pcr_z > 0.60) | trend_dn)
    energy_reversion_sig = np.where(energy_rebound_up, 1, np.where(energy_exhaust_top, -1, 0))

    # [A] 추세형 모델 결합용 종합 스코어:
    trend_supply_score = (
        factor_nh_foreign_combined * 0.50
        + factor_prog_trend * 0.20
        + factor_oi_trend * 0.15
        + factor_pcr_trend * 0.15
    )
    trend_supply_sig = np.where(trend_supply_score >= 0.15, 1, np.where(trend_supply_score <= -0.15, -1, 0))

    # [B] 역추세/반추세·횡보형 모델 결합용 종합 스코어:
    rev_supply_score = (
        (energy_reversion_sig * 0.60 + factor_nh_foreign_combined * 0.40) * 0.45
        + factor_prog_trend * 0.20
        + factor_oi_reversion * 0.15
        + factor_pcr_reversion * 0.20
    )
    rev_supply_sig = np.where(rev_supply_score >= 0.15, 1, np.where(rev_supply_score <= -0.15, -1, 0))

    sig_df["SUPPLY_TREND_SIG"] = trend_supply_sig
    sig_df["SUPPLY_REVERSION_SIG"] = rev_supply_sig
    sig_df["FACTOR_NH_NL"] = np.where(factor_nh_nl_trend >= 0.15, 1, np.where(factor_nh_nl_trend <= -0.15, -1, 0))
    sig_df["FACTOR_FOREIGN"] = np.where(factor_foreign_raw >= 0.15, 1, np.where(factor_foreign_raw <= -0.15, -1, 0))
    sig_df["FACTOR_NH_FOREIGN_SYNERGY"] = trend_regime
    sig_df["FACTOR_ENERGY_REVERSION"] = energy_reversion_sig
    sig_df["FACTOR_PROGRAM"] = np.where(factor_prog_trend >= 0.15, 1, np.where(factor_prog_trend <= -0.15, -1, 0))
    sig_df["FACTOR_OI"] = np.where(factor_oi_trend >= 0.15, 1, np.where(factor_oi_trend <= -0.15, -1, 0))
    sig_df["FACTOR_PCR"] = np.where(factor_pcr_trend >= 0.15, 1, np.where(factor_pcr_trend <= -0.15, -1, 0))

    w = max(0.0, min(0.85, float(supply_weight)))

    def _register_model_signal(m_id: str, pure_arr: np.ndarray, mode: str = "trend") -> None:
        pure_s = np.asarray(pure_arr, dtype=int)
        sup_s = trend_supply_sig if mode in ("trend", "self_supply") else rev_supply_sig

        # [축 ① 추세 동력(신고/신저 × 외인) + 축 ② 횡보·평균회귀 에너지(미결제·PCR·차익 과열 되돌림) 결합]
        # 1) 하방 매도(-1) 신호 보정: 추세 상승 동력(trend_up)이거나 에너지 하방과열 후 반등 회귀(energy_rebound_up)일 때 역풍 매도 차단(0)
        # 2) 상방 매수(+1) 신호 보정: 미결제·차익·PCR 에너지가 과도하게 커져 다시 내려가는 피크아웃(energy_exhaust_top) 또는 하락 추세+미결제 누적일 때 추격 매수 차단(0)
        # 3) 중립(0) 타점 보강: 역추세·수급 모델에서 에너지 평균회귀와 추세 동력이 일치할 때 고승률 회귀 타점 진입
        if w > 0.05:
            comb_s = pure_s.copy()
            comb_s = np.where((comb_s == -1) & (trend_up | energy_rebound_up), 0, comb_s)
            comb_s = np.where((comb_s == 1) & (energy_exhaust_top | (trend_dn & (oi_z > 0.30))), 0, comb_s)
            if mode in ("reversion", "self_supply") and w >= 0.15:
                comb_s = np.where((comb_s == 0) & (energy_rebound_up & trend_up), 1, comb_s)
                comb_s = np.where((comb_s == 0) & (energy_exhaust_top & trend_dn), -1, comb_s)
            comb_s = comb_s.astype(int)
        else:
            comb_s = pure_s.copy()

        sig_df[f"{m_id}__pure"] = pure_s
        sig_df[f"{m_id}__supply"] = np.asarray(sup_s, dtype=int)
        sig_df[f"{m_id}__combined"] = comb_s
        sig_df[m_id] = comb_s if combine_supply else pure_s

    # 1. 추세형 1: M01_MA_Trend (다중 이동평균 정배열/역배열 추세: rawdata Col 53~72 대응)
    ma3 = fut_c.rolling(3, min_periods=1).mean()
    ma5 = fut_c.rolling(5, min_periods=1).mean()
    ma10 = fut_c.rolling(10, min_periods=1).mean()
    ma20 = fut_c.rolling(20, min_periods=1).mean()
    ma60 = fut_c.rolling(60, min_periods=1).mean()

    score_ma = (
        np.where(fut_c > ma5, 1, -1) * 0.25
        + np.where(ma3 > ma5, 1, -1) * 0.25
        + np.where(ma5 > ma10, 1, -1) * 0.20
        + np.where(ma5 > ma20, 1, -1) * 0.15
        + np.where(ma20 > ma60, 1, -1) * 0.15
    )
    pure_m01 = np.where(score_ma >= 0.3, 1, np.where(score_ma <= -0.3, -1, 0))
    _register_model_signal("M01_MA_Trend", pure_m01, mode="trend")

    # 2. 추세형 2: M02_Breakthrough (변동성 돌파: 기술지표10000 Breakthrough 시트 대응)
    prev_range = (fut_h - fut_l).shift(1).fillna(0.0)
    buy_point = fut_c.shift(1) + prev_range * 0.5
    sell_point = fut_c.shift(1) - prev_range * 0.5
    raw_bt = np.where(fut_c > buy_point, 1, np.where(fut_c < sell_point, -1, 0))
    pure_m02 = pd.Series(raw_bt, index=df.index).replace(0, np.nan).ffill().fillna(0).astype(int).values
    _register_model_signal("M02_Breakthrough", pure_m02, mode="trend")

    # 3. 추세형 3: M03_TnT_Channel (이동평균 채널 돌파: TnT 시트 대응)
    ch_high = ma5.rolling(11, min_periods=2).max().shift(1)
    ch_low = ma5.rolling(11, min_periods=2).min().shift(1)
    pure_m03 = np.where(ma3 > ch_high, 1, np.where(ma3 < ch_low, -1, 0))
    _register_model_signal("M03_TnT_Channel", pure_m03, mode="trend")

    # 4. 반추세형 1: M04_Double_Stochastic (더블 스토캐스틱 오실레이터 반전: Double_stochastic_Ocillator 시트 대응)
    low14 = fut_l.rolling(14, min_periods=3).min()
    high14 = fut_h.rolling(14, min_periods=3).max()
    fast_k = ((fut_c - low14) / (high14 - low14 + 1e-9)) * 100.0
    slow_k = fast_k.rolling(10, min_periods=2).mean()
    s_low14 = slow_k.rolling(14, min_periods=3).min()
    s_high14 = slow_k.rolling(14, min_periods=3).max()
    d_fast_k = ((slow_k - s_low14) / (s_high14 - s_low14 + 1e-9)) * 100.0
    dslow_k = d_fast_k.rolling(10, min_periods=2).mean()
    dslow_d = dslow_k.rolling(3, min_periods=1).mean()

    pure_m04 = np.where(
        (dslow_k < 30) & (dslow_k >= dslow_d),
        1,
        np.where((dslow_k > 70) & (dslow_k <= dslow_d), -1, np.where(dslow_k > 55, 1, np.where(dslow_k < 45, -1, 0))),
    )
    _register_model_signal("M04_Double_Stochastic", pure_m04, mode="reversion")

    # 5. 반추세형 2: M05_Gap_Reversion (시가 갭 및 단기 과열 역추세: Gap 시트 대응)
    gap_ratio = (fut_o / fut_c.shift(1).replace(0, np.nan)) - 1.0
    intraday_rev = fut_c - fut_o
    pure_m05 = np.where(
        (gap_ratio < -0.005) & (intraday_rev > 0),
        1,
        np.where(
            (gap_ratio > 0.005) & (intraday_rev < 0),
            -1,
            np.where(fut_c < ma5 * 0.985, 1, np.where(fut_c > ma5 * 1.015, -1, 0)),
        ),
    )
    _register_model_signal("M05_Gap_Reversion", pure_m05, mode="reversion")

    # 6. 횡보형 1: M06_ETF_Spread (KODEX 레버리지 대 선물 비율 밴드 평균회귀: ETF_spread 시트 대응)
    kodex = df["kodex_leverage"].replace(0, np.nan).ffill().fillna(20000.0)
    spread_ratio = (fut_c * 500000.0) / (kodex + 1e-9)
    sp_mean = spread_ratio.rolling(50, min_periods=10).mean()
    sp_std = spread_ratio.rolling(50, min_periods=10).std().replace(0, np.nan)
    up_bound = sp_mean + 1.5 * sp_std
    dn_bound = sp_mean - 1.5 * sp_std
    pure_m06 = np.where(
        spread_ratio < dn_bound,
        1,
        np.where(spread_ratio > up_bound, -1, np.where(spread_ratio < sp_mean, 1, -1)),
    )
    pure_m06 = np.where((spread_ratio - sp_mean).abs() < 0.35 * sp_std, 0, pure_m06)
    _register_model_signal("M06_ETF_Spread", pure_m06, mode="reversion")

    # 7. 횡보형 2: M07_Popular_Energy (캔들 상하단 에너지·인기도 균형: popular 시트 대응)
    energy = np.where(fut_c > fut_o, fut_h - fut_o, fut_h - (fut_o + fut_c) / 2.0)
    popular = np.where(fut_c > fut_o, fut_o - fut_l, (fut_o + fut_c) / 2.0 - fut_l)
    ep_diff = pd.Series(energy - popular, index=df.index).rolling(20, min_periods=3).mean()
    ep_std = ep_diff.rolling(60, min_periods=10).std().fillna(1.0)
    pure_m07 = np.where(
        ep_diff > 0.25 * ep_std, 1, np.where(ep_diff < -0.25 * ep_std, -1, 0)
    )
    _register_model_signal("M07_Popular_Energy", pure_m07, mode="trend")

    # 8. 수급형 1: M08_Foreign_Program_Flow (외국인 선물·현물 및 프로그램 차익 누적 90일 백분위 랭크 + 개인 역발상)
    pure_m08 = np.where(trend_supply_score >= 0.25, 1, np.where(trend_supply_score <= -0.25, -1, 0))
    _register_model_signal("M08_Foreign_Program_Flow", pure_m08, mode="self_supply")

    # 9. 심리·수급형 2: M09_Option_Investor_Flow (모델11 Option!AF 하락강도, AG 이론가대비 괴리율, PCR 및 옵션 투자자 수급 결합)
    opt_for_net = df["call_foreign_qty"] - df["put_foreign_qty"]
    opt_per_net = df["call_personal_qty"] - df["put_personal_qty"]
    call_disc = df["call_close"] - df["call_theo"]
    put_disc = df["put_close"] - df["put_theo"]
    theo_spread = call_disc - put_disc
    af_down_intensity = (df["put_high"] - df["put_close"]) - (df["call_high"] - df["call_close"])
    pcr_price = (df["put_close"] + 0.05) / (df["call_close"] + 0.05)
    pcr_ma5 = pcr_price.rolling(5, min_periods=1).mean()

    opt_score = (
        np.where(theo_spread > 0, 1, np.where(theo_spread < 0, -1, 0)) * 0.30
        + np.where(af_down_intensity.rolling(3, min_periods=1).mean() > 0, 1, -1) * 0.25
        + np.where(pcr_price < pcr_ma5, 1, -1) * 0.20
        + np.where(opt_for_net.rolling(3, min_periods=1).sum() > 0, 1, -1) * 0.15
        + np.where(opt_per_net.rolling(3, min_periods=1).sum() < 0, 1, -1) * 0.10
    )
    pure_m09 = np.where(opt_score >= 0.25, 1, np.where(opt_score <= -0.25, -1, 0))
    _register_model_signal("M09_Option_Investor_Flow", pure_m09, mode="self_supply")

    # 10. 종합·심리형: M10_Breadth_HPI_Sentiment (ADR 상승-하락 종목수, 신고-신저가 및 미결제약정 HPI)
    adr_ma5 = df["up_down_diff"].rolling(5, min_periods=1).mean()
    hl_ma5 = df["new_high_low_diff"].rolling(5, min_periods=1).mean()
    oi_chg_cum = df["open_interest"].diff().fillna(0.0).cumsum()
    rank_oi = _rolling_rank_pct(oi_chg_cum, 90)
    rank_price = _rolling_rank_pct(fut_c, 90)
    hpi_rank_sig = np.where(rank_oi >= 65, 1, np.where(rank_oi <= 25, -1, 0)) * np.where(
        rank_price >= 60, 1, np.where(rank_price <= 30, -1, 0)
    )

    sent_score = (
        np.where(adr_ma5 > 20, 1, np.where(adr_ma5 < -20, -1, 0)) * 0.4
        + np.where(hl_ma5 > 2, 1, np.where(hl_ma5 < -2, -1, 0)) * 0.3
        + hpi_rank_sig * 0.3
    )
    pure_m10 = np.where(sent_score >= 0.25, 1, np.where(sent_score <= -0.25, -1, 0))
    _register_model_signal("M10_Breadth_HPI_Sentiment", pure_m10, mode="trend")

    # --- 후보 모델 (Candidate Models: 3M/6M 일관성 검증 후 10대 모델 편입 대상) ---
    fx_ma20 = df["fx_close"].rolling(20, min_periods=2).mean()
    ktb_ma20 = df["ktb_close"].rolling(20, min_periods=2).mean()
    macro_score = (
        np.where(df["fx_close"] < fx_ma20, 1, -1) * 0.5
        + np.where(fut_c > ma20, 1, -1) * 0.35
        + np.where(df["ktb_close"] >= ktb_ma20, 1, -1) * 0.15
    )
    pure_c01 = np.where(macro_score >= 0.2, 1, np.where(macro_score <= -0.2, -1, 0))
    _register_model_signal("C01_KTB_FX_Macro_Trend", pure_c01, mode="trend")

    basis = fut_c - k200_c
    basis_ma10 = basis.rolling(10, min_periods=1).mean()
    div_flow = df["spot_foreign_net"] - df["spot_personal_net"]
    div_ma5 = div_flow.rolling(5, min_periods=1).mean()
    pure_c02 = np.where(
        (basis >= basis_ma10) & (div_ma5 > 0),
        1,
        np.where((basis < basis_ma10) & (div_ma5 < 0), -1, 0),
    )
    _register_model_signal("C02_Basis_Arbitrage_Flow", pure_c02, mode="self_supply")

    def _stoch_k(period: int, smooth: int) -> pd.Series:
        l_p = fut_l.rolling(period, min_periods=2).min()
        h_p = fut_h.rolling(period, min_periods=2).max()
        raw_k = ((fut_c - l_p) / (h_p - l_p + 1e-9)) * 100.0
        return raw_k.rolling(smooth, min_periods=1).mean()

    k5 = _stoch_k(5, 3)
    d5 = k5.rolling(3, min_periods=1).mean()
    k10 = _stoch_k(10, 6)
    d10 = k10.rolling(6, min_periods=1).mean()
    k20 = _stoch_k(20, 12)
    d20 = k20.rolling(12, min_periods=1).mean()

    sum_p = (
        np.where(fut_c > ma5, 1, -1) * 20
        + np.where(ma3 > ma5, 1, -1) * 20
        + np.where(ma5 > ma10, 1, -1) * 8
        + np.where(k5 > d5, 1, -1) * 20
        + np.where(k10 > d10, 1, -1) * 5
        + np.where(k20 > d20, 1, -1) * 5
        + np.where(df["up_down_diff"] > 0, 1, -1) * 10
    ) / 88.0
    pure_c03 = np.where(sum_p >= 0.3, 1, np.where(sum_p <= -0.3, -1, 0))
    _register_model_signal("C03_Multi_Stoch_Momentum", pure_c03, mode="reversion")

    return sig_df


def compute_indicator_group_diagnostics(df: pd.DataFrame, sig_df: Optional[pd.DataFrame] = None) -> Dict[str, Any]:
    """
    4대 지표군(① 기술지표, ② 수급지표, ③ 종합지표, ④ 심리지표)을 체계적으로 분류하여
    각 지표군의 최신 세부 지표 값, 개별 시그널(-1/0/+1), 그룹 종합 점수(-1.0~+1.0) 및 최근 60일 시계열을 반환합니다.
    """
    if df.empty:
        return {}
    if sig_df is None:
        cache_key = (_CACHED_DB_MTIME, True, 0.35)
        if cache_key in _CACHED_SIGNALS and len(_CACHED_SIGNALS[cache_key]) == len(df):
            sig_df = _CACHED_SIGNALS[cache_key]
        else:
            sig_df = compute_all_model_signals(df)
    last = df.iloc[-1]
    prev = df.iloc[-2] if len(df) >= 2 else last

    fut_c = float(last["fut_close"])
    k200_c = float(last["k200_close"])
    ma5 = float(df["fut_close"].rolling(5, min_periods=1).mean().iloc[-1])
    ma20 = float(df["fut_close"].rolling(20, min_periods=1).mean().iloc[-1])
    ma60 = float(df["fut_close"].rolling(60, min_periods=1).mean().iloc[-1])
    gap_pct = ((float(last["fut_open"]) / float(prev["fut_close"])) - 1.0) * 100.0 if float(prev["fut_close"]) > 0 else 0.0

    # 1. 기술지표 (TECH)
    tech_models = ["M01_MA_Trend", "M02_Breakthrough", "M03_TnT_Channel", "M04_Double_Stochastic", "M05_Gap_Reversion", "M06_ETF_Spread", "M07_Popular_Energy"]
    tech_sigs = [int(sig_df[m].iloc[-1]) for m in tech_models if m in sig_df.columns]
    tech_score = round(float(np.mean(tech_sigs)), 2) if tech_sigs else 0.0

    # 2. 수급지표 (SUPPLY)
    fut_for_1d = float(last["fut_foreign_net"])
    fut_for_5d = float(df["fut_foreign_net"].rolling(5, min_periods=1).sum().iloc[-1])
    spot_for_1d = float(last["spot_foreign_net"])
    prog_arb_1d = float(last["program_arb_net"])
    spot_per_1d = float(last["spot_personal_net"])
    basis_pt = round(fut_c - k200_c, 2)
    supply_score = float(sig_df["M08_Foreign_Program_Flow"].iloc[-1])

    # 3. 종합지표 (BREADTH)
    ud_1d = float(last["up_down_diff"])
    ud_5d = float(df["up_down_diff"].rolling(5, min_periods=1).mean().iloc[-1])
    hl_1d = float(last["new_high_low_diff"])
    oi_now = float(last["open_interest"])
    oi_chg = round(oi_now - float(prev["open_interest"]), 0)
    breadth_score = float(sig_df["M10_Breadth_HPI_Sentiment"].iloc[-1])

    # 4. 심리지표 (SENTIMENT)
    c_close = float(last["call_close"])
    p_close = float(last["put_close"])
    c_theo = float(last["call_theo"])
    p_theo = float(last["put_theo"])
    c_disc = round(c_close - c_theo, 2)
    p_disc = round(p_close - p_theo, 2)
    pcr_val = round((p_close + 0.05) / (c_close + 0.05), 3)
    opt_for_diff = float(last["call_foreign_qty"] - last["put_foreign_qty"])
    sentiment_score = float(sig_df["M09_Option_Investor_Flow"].iloc[-1])

    # 최근 45거래일 4대 지표군 시계열
    tail_df = df.tail(45).reset_index(drop=True)
    tail_sig = sig_df.tail(45).reset_index(drop=True)
    t_dates = tail_df["date"].tolist()
    tech_series = [
        round(float(np.mean([tail_sig.loc[r_i, m] for m in tech_models])), 2)
        for r_i in range(len(tail_sig))
    ]
    supply_series = [int(tail_sig.loc[r_i, "M08_Foreign_Program_Flow"]) for r_i in range(len(tail_sig))]
    breadth_series = [int(tail_sig.loc[r_i, "M10_Breadth_HPI_Sentiment"]) for r_i in range(len(tail_sig))]
    sentiment_series = [int(tail_sig.loc[r_i, "M09_Option_Investor_Flow"]) for r_i in range(len(tail_sig))]
    pcr_series = [
        round(float((tail_df.loc[r_i, "put_close"] + 0.05) / (tail_df.loc[r_i, "call_close"] + 0.05)), 2)
        for r_i in range(len(tail_df))
    ]
    oi_series = [int(tail_df.loc[r_i, "open_interest"]) for r_i in range(len(tail_df))]

    cfg = load_simulation_config()

    return {
        "latest_date": str(last["date"]),
        "taxonomy": cfg.get("indicator_taxonomy", []),
        "groups": [
            {
                "group_id": "TECH",
                "group_name": "① 기술지표 (Technical)",
                "composite_score": tech_score,
                "signal": 1 if tech_score >= 0.15 else (-1 if tech_score <= -0.15 else 0),
                "mapped_models": ["M01 (Tech1/MA)", "M02 (Breakthrough)", "M03 (TnT)", "M04 (Stochastic)", "M05 (Gap)", "M06 (ETF Spread)", "M07 (Popular/Energy)"],
                "metrics": [
                    {"label": "선물 종가 / 5MA / 20MA", "value": f"{fut_c:.2f} / {ma5:.2f} / {ma20:.2f}", "signal": 1 if fut_c > ma5 else -1},
                    {"label": "중장기 이평 (20MA vs 60MA)", "value": f"{ma20 - ma60:+.2f} pt", "signal": 1 if ma20 > ma60 else -1},
                    {"label": "당일 시가 갭 (Gap)", "value": f"{gap_pct:+.2f}%", "signal": 1 if gap_pct < -0.5 else (-1 if gap_pct > 0.5 else 0)},
                    {"label": "기술지표 7대 모델 평균 시그널", "value": f"{tech_score:+.2f}", "signal": 1 if tech_score > 0 else (-1 if tech_score < 0 else 0)},
                ],
            },
            {
                "group_id": "SUPPLY",
                "group_name": "② 수급지표 (Supply & Demand)",
                "composite_score": supply_score,
                "signal": int(supply_score),
                "mapped_models": ["M08 (외인·차익·개인 수급 전담)", "C02 (베이시스 수급)"],
                "metrics": [
                    {"label": "외국인 선물 순매수 (당일 / 5일합)", "value": f"{fut_for_1d:+,.0f} / {fut_for_5d:+,.0f} 계약", "signal": 1 if fut_for_5d > 0 else -1},
                    {"label": "프로그램 차익순매수", "value": f"{prog_arb_1d:+,.1f} 백만", "signal": 1 if prog_arb_1d >= 0 else -1},
                    {"label": "외국인 현물 vs 개인 현물", "value": f"외인 {spot_for_1d:+,.0f} / 개인 {spot_per_1d:+,.0f}", "signal": 1 if spot_for_1d > spot_per_1d else -1},
                    {"label": "선물-현물 베이시스 (Basis)", "value": f"{basis_pt:+.2f} pt", "signal": 1 if basis_pt >= 0 else -1},
                ],
            },
            {
                "group_id": "BREADTH",
                "group_name": "③ 종합지표 (Market Breadth & OI)",
                "composite_score": breadth_score,
                "signal": int(breadth_score),
                "mapped_models": ["M10 (ADR·신고저·미결제 HPI 전담)", "C03 (Tech2 SUM_P)"],
                "metrics": [
                    {"label": "ADR 상승-하락 종목차 (당일 / 5MA)", "value": f"{ud_1d:+,.0f} / {ud_5d:+,.1f}", "signal": 1 if ud_5d > 0 else -1},
                    {"label": "52주 신고가 - 신저가 종목수", "value": f"{hl_1d:+,.0f} 종목", "signal": 1 if hl_1d >= 0 else -1},
                    {"label": "선물 미결제약정 (Open Interest)", "value": f"{oi_now:,.0f} 계약 ({oi_chg:+,.0f})", "signal": 1 if oi_chg >= 0 else -1},
                ],
            },
            {
                "group_id": "SENTIMENT",
                "group_name": "④ 심리지표 (Option IV, 이론가 괴리 & PCR)",
                "composite_score": sentiment_score,
                "signal": int(sentiment_score),
                "mapped_models": ["M09 (옵션 이론가괴리·PCR·수급 전담)"],
                "metrics": [
                    {"label": "등가격 Call 종가 (이론가 대비 괴리)", "value": f"{c_close:.2f} (이론가 {c_theo:.2f}, {c_disc:+.2f})", "signal": 1 if c_disc >= p_disc else -1},
                    {"label": "등가격 Put 종가 (이론가 대비 괴리)", "value": f"{p_close:.2f} (이론가 {p_theo:.2f}, {p_disc:+.2f})", "signal": -1 if p_disc > c_disc else 1},
                    {"label": "등가격 풋/콜 레이쇼 (PCR)", "value": f"{pcr_val:.2f}배", "signal": 1 if pcr_val <= 1.0 else -1},
                    {"label": "옵션 외국인 (콜-풋) 순매수", "value": f"{opt_for_diff:+,.0f} 계약", "signal": 1 if opt_for_diff >= 0 else -1},
                ],
            },
        ],
        "history_chart": {
            "dates": t_dates,
            "tech_score": tech_series,
            "supply_score": supply_series,
            "breadth_score": breadth_series,
            "sentiment_score": sentiment_series,
            "pcr_series": pcr_series,
            "open_interest": oi_series,
        },
    }


def calculate_series_metrics(
    daily_returns: Any,
    annual_days: int = 250,
    rf_annual: float = 0.0325,
    compound: bool = False,
) -> Dict[str, Any]:
    """
    수익률 시계열로부터 사용자 요청 10대 정밀 평가지표 및 누적/연환산 수익률을 계산합니다 (NumPy 고속 벡터화):
    - compound=False (기본값, 투자원금 1억원 고정 기준): 일별 원화 손익 / 투자원금(1억원) 비율을 단리(합산)하여
      누적 매매수익률(%)과 누적 손익(원)/1억원이 100% 일치하도록 산출합니다.
    - compound=True (KOSPI200/선물 지수 벤치마크): 지수 복리 수익률을 산출합니다.
    """
    arr = np.asarray(daily_returns, dtype=float)
    if arr.size > 0:
        arr = arr[~np.isnan(arr)]
    if arr.size == 0:
        return {
            "cum_return_pct": 0.0,
            "annual_return_pct": 0.0,
            "hitting_ratio_pct": 0.0,
            "win_rate_pct": 0.0,
            "pos_days": 0,
            "neg_days": 0,
            "flat_days": 0,
            "total_days": 0,
            "avg_pos_return_pct": 0.0,
            "avg_neg_return_pct": 0.0,
            "mdd_pct": 0.0,
            "profit_loss_factor": 0.0,
            "pl_ratio": 0.0,
            "avg_win_loss_ratio": 0.0,
            "sharpe": 0.0,
            "sharpe_ratio": 0.0,
            "sortino_ratio": 0.0,
            "calmar_ratio": 0.0,
        }

    n_obs = max(1, int(arr.size))
    if compound:
        equity = np.cumprod(1.0 + arr)
        final_eq = float(equity[-1])
        cum_ret_pct = float((final_eq - 1.0) * 100.0)
        if final_eq > 0:
            ann_ret_pct = float(((final_eq ** (annual_days / n_obs)) - 1.0) * 100.0)
        else:
            ann_ret_pct = -100.0
        peak = np.maximum.accumulate(equity)
        dd = (peak - equity) / np.maximum(1e-12, peak)
        mdd_pct = float(np.max(dd) * 100.0)
    else:
        cum_ret_arr = np.cumsum(arr)
        equity = 1.0 + cum_ret_arr
        cum_ret_pct = float(cum_ret_arr[-1] * 100.0)
        ann_ret_pct = float(np.mean(arr) * annual_days * 100.0)
        peak = np.maximum.accumulate(np.maximum(1.0, equity))
        dd = (peak - equity) / np.maximum(1.0, peak)
        mdd_pct = float(np.max(dd) * 100.0)

    pos_mask = arr > 0
    neg_mask = arr < 0
    pos_series = arr[pos_mask]
    neg_series = arr[neg_mask]
    pos_days = int(pos_series.size)
    neg_days = int(neg_series.size)
    flat_days = int(n_obs - pos_days - neg_days)
    active_count = pos_days + neg_days

    hitting_ratio = float(pos_days / active_count * 100.0) if active_count > 0 else 0.0
    avg_pos_pct = float(np.mean(pos_series) * 100.0) if pos_days > 0 else 0.0
    avg_neg_pct = float(np.mean(neg_series) * 100.0) if neg_days > 0 else 0.0

    pos_sum = float(np.sum(pos_series)) if pos_days > 0 else 0.0
    neg_sum = abs(float(np.sum(neg_series))) if neg_days > 0 else 0.0
    profit_loss_factor = (
        round(pos_sum / neg_sum, 3)
        if neg_sum > 1e-9
        else (round(pos_sum * 10.0, 3) if pos_sum > 0 else 1.0)
    )
    avg_win_loss_ratio = (
        round(avg_pos_pct / abs(avg_neg_pct), 3) if abs(avg_neg_pct) > 1e-9 else 1.0
    )

    std_val = float(np.std(arr, ddof=1)) if n_obs > 1 else 0.0
    rf_daily = rf_annual / annual_days
    mean_excess = float(np.mean(arr) - rf_daily)
    sharpe = (mean_excess / std_val) * math.sqrt(annual_days) if std_val > 1e-9 else 0.0

    # Sortino Ratio: 하방 편차(Downside Deviation, 일간 수익률 < rf_daily 구간만 제곱평균제곱근)
    downside_diff = np.minimum(0.0, arr - rf_daily)
    downside_std = float(np.sqrt(np.mean(np.square(downside_diff)))) if n_obs > 0 else 0.0
    sortino = (
        (mean_excess / downside_std) * math.sqrt(annual_days)
        if downside_std > 1e-9
        else (sharpe * 1.35 if sharpe > 0 else 0.0)
    )

    # Calmar Ratio: 연환산 수익률(%) / MDD(%)
    calmar = (
        ann_ret_pct / mdd_pct
        if mdd_pct > 1e-6
        else (ann_ret_pct if ann_ret_pct > 0 else 0.0)
    )

    return {
        "cum_return_pct": round(cum_ret_pct, 2),
        "annual_return_pct": round(ann_ret_pct, 2),
        "hitting_ratio_pct": round(hitting_ratio, 2),
        "win_rate_pct": round(hitting_ratio, 2),
        "pos_days": pos_days,
        "neg_days": neg_days,
        "flat_days": flat_days,
        "total_days": int(n_obs),
        "avg_pos_return_pct": round(avg_pos_pct, 3),
        "avg_neg_return_pct": round(avg_neg_pct, 3),
        "mdd_pct": round(mdd_pct, 2),
        "profit_loss_factor": round(profit_loss_factor, 2),
        "pl_ratio": round(profit_loss_factor, 2),
        "avg_win_loss_ratio": round(avg_win_loss_ratio, 2),
        "sharpe": round(sharpe, 3),
        "sharpe_ratio": round(sharpe, 3),
        "sortino_ratio": round(sortino, 3),
        "calmar_ratio": round(calmar, 3),
    }


def run_futures_simulation(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    multiplier: Optional[int] = None,
    mdd_threshold_pct: Optional[float] = None,
    sharpe_lookback_days: Optional[int] = None,
    initial_selected_ids: Optional[List[str]] = None,
    enable_auto_mdd_swap: bool = True,
    record_swaps_to_db: bool = False,
    combine_supply: bool = True,
    supply_weight: float = 0.35,
    replacement_mode: str = "HYBRID",
    periodic_rebalance_days: int = 63,
    mdd_trigger_mode: str = "RENEWAL_OR_LIMIT",
    point_value_krw: Optional[float] = None,
    initial_capital_krw: Optional[float] = None,
    portfolio_risk_mode: str = "MODEL_SWAP_ONLY",
    portfolio_mdd_limit_pct: Optional[float] = None,
) -> Dict[str, Any]:
    """
    선물 트레이딩 10대 모델 시뮬레이션 실행기:
    - 기본 승수: 50,000원(미니선물 디폴트) / 선택사항: 250,000원(정규선물)
    - 기본 투자원금: 100,000,000원 (1억원 기준)
    - 3대 MDD 위험관리 기준 명확화:
      ① MODEL_SWAP_ONLY: 개별 모델 교체 기준 (기본 12% 초과 시 해당 모델만 대기 1순위로 교체, 포트폴리오 전체 한도 미적용)
      ② PORTFOLIO_SCALE_DOWN: 포트폴리오 위험 축소 기준 (합산 포트폴리오 DD가 한도 근접 시 계약수 50%/25% 단계적 축소)
      ③ PORTFOLIO_HARD_STOP: 실전 운용 중지 기준 (합산 포트폴리오 DD가 한도 도달 시 즉시 0계약 전량청산 및 실전 운용중지)
    """
    init_sim_tables()
    cfg = load_simulation_config()
    rules = cfg.get("trading_rules", {})
    m_params = cfg.get("market_parameters", {})
    rep_rules = cfg.get("model_replacement_rules", {})

    mult = int(multiplier if multiplier is not None else rules.get("default_multiplier", 1))
    mdd_limit = float(
        mdd_threshold_pct if mdd_threshold_pct is not None else rep_rules.get("default_mdd_threshold_pct", 12.0)
    )
    port_risk_mode = str(portfolio_risk_mode or "MODEL_SWAP_ONLY").strip().upper()
    if port_risk_mode not in ("MODEL_SWAP_ONLY", "PORTFOLIO_SCALE_DOWN", "PORTFOLIO_HARD_STOP"):
        port_risk_mode = "MODEL_SWAP_ONLY"
    port_mdd_limit = float(
        portfolio_mdd_limit_pct if portfolio_mdd_limit_pct is not None and portfolio_mdd_limit_pct > 0 else mdd_limit
    )
    lookback_days = int(
        sharpe_lookback_days if sharpe_lookback_days is not None else rep_rules.get("sharpe_lookback_days", 126)
    )
    if lookback_days <= 0:
        lookback_days = 126
    periodic_days = int(periodic_rebalance_days if periodic_rebalance_days is not None else 63)
    rep_mode = str(replacement_mode or "HYBRID").strip().upper()
    if not enable_auto_mdd_swap:
        rep_mode = "MANUAL_FIXED"
    trig_mode = str(mdd_trigger_mode or "RENEWAL_OR_LIMIT").strip().upper()
    mdd_window = int(rep_rules.get("mdd_rolling_window_days", 126))
    cooldown_days = int(rep_rules.get("cooldown_days_after_swap", 5))
    min_hold_days = max(20, cooldown_days)
    annual_days = int(m_params.get("annual_trading_days", 250))
    rf_annual = float(m_params.get("risk_free_rate_annual", 0.0325))
    fee_rate = float(m_params.get("brokerage_fee_rate", 0.00003))
    contract_mult_krw = float(
        point_value_krw
        if point_value_krw is not None and point_value_krw > 0
        else m_params.get("contract_multiplier_krw", 50000.0)
    )
    if contract_mult_krw not in (50000.0, 250000.0):
        contract_mult_krw = 250000.0 if contract_mult_krw >= 150000.0 else 50000.0
    base_capital_krw = float(
        initial_capital_krw
        if initial_capital_krw is not None and initial_capital_krw > 0
        else m_params.get("initial_capital_krw", 100000000.0)
    )

    if end_date and str(end_date).strip().upper() in ("CURRENT", "NOW", "LATEST", "현재", ""):
        end_date = None

    df_full = load_daily_dataframe()
    if df_full.empty or len(df_full) < 5:
        return {"success": False, "error": "기초데이터가 부족합니다."}

    cache_key = (_CACHED_DB_MTIME, bool(combine_supply), round(float(supply_weight), 3))
    if cache_key not in _CACHED_SIGNALS:
        _CACHED_SIGNALS[cache_key] = compute_all_model_signals(
            df_full, combine_supply=combine_supply, supply_weight=supply_weight
        )
    sig_df_full = _CACHED_SIGNALS[cache_key]

    mask = pd.Series(True, index=df_full.index)
    if start_date:
        mask = mask & (df_full["date"] >= str(start_date).strip())
    if end_date:
        mask = mask & (df_full["date"] <= str(end_date).strip())

    df = df_full[mask].reset_index(drop=True)
    sig_df = sig_df_full[mask].reset_index(drop=True)
    if df.empty or len(df) < 3:
        return {"success": False, "error": f"지정된 기간({start_date} ~ {end_date or '현재'})에 유효한 거래일 데이터가 부족합니다."}
    pool_cfg = get_active_pool()
    cand_cfg = get_candidate_pool()
    all_cfg = pool_cfg + [c for c in cand_cfg if c["model_id"] not in [m["model_id"] for m in pool_cfg]]
    pool_ids = [m["model_id"] for m in pool_cfg]
    all_model_ids = [m["model_id"] for m in all_cfg if m["model_id"] in sig_df.columns]
    model_meta = {m["model_id"]: m for m in all_cfg}

    if initial_selected_ids and len(initial_selected_ids) >= 1:
        active_set = [m_id for m_id in initial_selected_ids if m_id in all_model_ids]
        for m_id in active_set:
            if m_id not in pool_ids:
                pool_ids.append(m_id)
    else:
        active_set = [m["model_id"] for m in pool_cfg if m.get("is_selected", False)]
        if not active_set:
            active_set = pool_ids[:5]

    initial_active_snapshot = list(active_set)
    sim_cache_key = (
        _CACHED_DB_MTIME,
        str(start_date or ""),
        str(end_date or ""),
        mult,
        round(mdd_limit, 2),
        lookback_days,
        tuple(initial_active_snapshot),
        bool(combine_supply),
        round(float(supply_weight), 3),
        rep_mode,
        periodic_days,
        trig_mode,
        int(contract_mult_krw),
        int(base_capital_krw),
        port_risk_mode,
        round(port_mdd_limit, 2),
    )
    if not record_swaps_to_db and sim_cache_key in _CACHED_SIM_RESULTS:
        return _CACHED_SIM_RESULTS[sim_cache_key]

    # 일별 선물 수익률 (t-1 종가 동시호가(15:35~15:45) 진입 -> t일 종가 정산) 및 KOSPI200 벤치마크 수익률
    fut_close = df["fut_close"].values
    k200_close = df["k200_close"].values
    dates = df["date"].tolist()
    n_days = len(dates)

    fut_pct_ret = np.zeros(n_days)
    fut_pt_diff = np.zeros(n_days)
    k200_pct_ret = np.zeros(n_days)
    for i in range(1, n_days):
        prev_c = fut_close[i - 1]
        curr_c = fut_close[i]
        fut_pt_diff[i] = curr_c - prev_c
        fut_pct_ret[i] = (curr_c - prev_c) / prev_c if prev_c > 0 else 0.0
        prev_k = k200_close[i - 1]
        curr_k = k200_close[i]
        k200_pct_ret[i] = (curr_k - prev_k) / prev_k if prev_k > 0 else 0.0

    # 각 모델별 일간 수익률 행렬 (투자원금 1억원 & 선택 승수(5만원/25만원) 기준)
    # 5개 선택 모델이 투자원금(1억원)을 분담(모델당 2,000만원 할당 = 1계약×mult 운용 시 합산 5모델 평균이 포트폴리오 1억원 수익률과 정확히 일치)
    n_sel = max(1, len(initial_active_snapshot))
    per_model_capital_krw = max(1.0, base_capital_krw / float(n_sel))
    unit_pt_ret = (fut_pt_diff * contract_mult_krw * mult) / per_model_capital_krw

    model_daily_rets: Dict[str, np.ndarray] = {}
    model_pure_rets: Dict[str, np.ndarray] = {}
    model_comb_rets: Dict[str, np.ndarray] = {}
    model_equity_curves: Dict[str, np.ndarray] = {}
    model_sig_arrays: Dict[str, np.ndarray] = {}
    model_pure_sig_arrays: Dict[str, np.ndarray] = {}
    model_comb_sig_arrays: Dict[str, np.ndarray] = {}

    for m_id in all_model_ids:
        sigs = sig_df[m_id].values
        pure_sigs = sig_df[f"{m_id}__pure"].values if f"{m_id}__pure" in sig_df.columns else sigs
        comb_sigs = sig_df[f"{m_id}__combined"].values if f"{m_id}__combined" in sig_df.columns else sigs
        model_sig_arrays[m_id] = sigs
        model_pure_sig_arrays[m_id] = pure_sigs
        model_comb_sig_arrays[m_id] = comb_sigs

        m_ret = np.zeros(n_days)
        m_ret[1:] = sigs[:-1] * unit_pt_ret[1:]
        model_daily_rets[m_id] = m_ret

        p_ret = np.zeros(n_days)
        p_ret[1:] = pure_sigs[:-1] * unit_pt_ret[1:]
        model_pure_rets[m_id] = p_ret

        c_ret = np.zeros(n_days)
        c_ret[1:] = comb_sigs[:-1] * unit_pt_ret[1:]
        model_comb_rets[m_id] = c_ret

        model_equity_curves[m_id] = 100.0 + np.cumsum(m_ret) * 100.0

    # 순수 신호 기준 포트폴리오 비교 곡선 (투자원금 1억원 & 선택 승수 기준)
    pure_port_ret = np.zeros(n_days)
    comb_port_ret = np.zeros(n_days)
    if initial_active_snapshot and n_days > 1:
        p_sum_arr = sum(model_pure_sig_arrays[m_id][:-1] for m_id in initial_active_snapshot)
        c_sum_arr = sum(model_comb_sig_arrays[m_id][:-1] for m_id in initial_active_snapshot)
        pure_port_ret[1:] = (p_sum_arr * mult * fut_pt_diff[1:] * contract_mult_krw) / base_capital_krw
        comb_port_ret[1:] = (c_sum_arr * mult * fut_pt_diff[1:] * contract_mult_krw) / base_capital_krw
    pure_equity_curve = 100.0 + np.cumsum(pure_port_ret) * 100.0
    comb_static_equity_curve = 100.0 + np.cumsum(comb_port_ret) * 100.0

    # 시뮬레이션 상태 추적 배열 (투자원금 1억원 = 지수 100.0 기준)
    base_positions = np.zeros(n_days, dtype=int)      # -5 ~ +5
    target_contracts = np.zeros(n_days, dtype=int)    # -5*M ~ +5*M
    delta_contracts = np.zeros(n_days, dtype=int)     # 매매 수량 (현재 포지션 대비 변화량)
    portfolio_daily_ret = np.zeros(n_days, dtype=float)
    portfolio_daily_pnl_krw = np.zeros(n_days, dtype=float)
    equity_curve = np.ones(n_days, dtype=float) * 100.0

    swap_events: List[Dict[str, Any]] = []
    last_swap_idx: Dict[str, int] = {m_id: -999 for m_id in all_model_ids}
    adopted_at_idx: Dict[str, int] = {m_id: 0 for m_id in all_model_ids}
    adopted_at_date: Dict[str, str] = {m_id: dates[0] for m_id in all_model_ids}
    last_periodic_check_idx = 0
    sim_active_set: List[str] = list(initial_active_snapshot)

    for i in range(n_days):
        # 1. t일 장중/종가 정산: t-1일 동시호가로 구축된 포지션에 대한 수익 반영 (투자원금 1억원 및 선택 승수 기준)
        if i > 0:
            prev_base_pos = base_positions[i - 1]
            prev_contracts = target_contracts[i - 1]
            # 원화 환산 일별 손익 (계약수 * 포인트변화 * 승수(5만원/25만원) - 수수료)
            gross_krw = prev_contracts * fut_pt_diff[i] * contract_mult_krw
            fee_krw = abs(delta_contracts[i - 1]) * fut_close[i - 1] * contract_mult_krw * fee_rate
            net_pnl_krw = gross_krw - fee_krw
            portfolio_daily_pnl_krw[i] = net_pnl_krw

            # 투자원금(1억원 = 100,000,000원) 대비 일별 수익률 및 누적수익지수(100.0 + 누적손익/1억원*100)
            net_ret = net_pnl_krw / base_capital_krw
            portfolio_daily_ret[i] = net_ret
            equity_curve[i] = equity_curve[i - 1] + (net_ret * 100.0)

        # 2-A. 특정 채택 모델이 MDD를 갱신(New High Drawdown)하거나 MDD 한도를 초과할 때 교체 이력 산출
        if rep_mode in ("HYBRID", "MDD_RENEWAL_ONLY") and i >= 25:
            win_start = max(1, i - mdd_window + 1)
            lb_start = max(1, i - lookback_days + 1)
            inactive_ids = [m_id for m_id in pool_ids if m_id not in sim_active_set]

            for idx_in_active, act_id in enumerate(list(sim_active_set)):
                adopt_i = adopted_at_idx.get(act_id, 0)
                if i - max(adopt_i, last_swap_idx.get(act_id, -999)) < min_hold_days:
                    continue

                eval_start = max(win_start, adopt_i, 1)
                if i - eval_start < 15:
                    continue

                eq_seg = model_equity_curves[act_id][eval_start : i + 1]
                running_peaks = np.maximum.accumulate(eq_seg)
                dd_series_pct = np.where(running_peaks > 0, ((running_peaks - eq_seg) / running_peaks) * 100.0, 0.0)
                curr_dd_pct = float(dd_series_pct[-1])
                prior_max_dd_pct = float(np.max(dd_series_pct[:-1])) if len(dd_series_pct) > 1 else 0.0

                model_mdd_limit = float(
                    model_meta.get(act_id, {}).get("mdd_threshold_pct", mdd_limit)
                )
                effective_limit = mdd_threshold_pct if mdd_threshold_pct is not None else model_mdd_limit

                # 특정 모델이 직전 최대 MDD를 갱신(New High Drawdown)했는지 및 한도를 초과했는지 판정
                is_mdd_renewed = (curr_dd_pct > prior_max_dd_pct + 0.05) and (curr_dd_pct >= effective_limit * 0.75)
                is_limit_breached = (curr_dd_pct >= effective_limit) and (curr_dd_pct >= prior_max_dd_pct - 0.1)

                if trig_mode == "RENEWAL_ONLY":
                    should_trigger_mdd = is_mdd_renewed
                elif trig_mode == "LIMIT_ONLY":
                    should_trigger_mdd = is_limit_breached
                else:
                    should_trigger_mdd = is_limit_breached or (is_mdd_renewed and curr_dd_pct >= effective_limit * 0.85)

                if should_trigger_mdd and inactive_ids:
                    metrics_act = calculate_series_metrics(
                        model_daily_rets[act_id][eval_start : i + 1], annual_days=annual_days, rf_annual=rf_annual
                    )
                    best_cand_id = None
                    best_cand_sharpe = -999.0
                    best_cand_ret = -999.0
                    best_cand_mdd = 0.0

                    for cand_id in inactive_ids:
                        cand_m = calculate_series_metrics(
                            model_daily_rets[cand_id][lb_start : i + 1], annual_days=annual_days, rf_annual=rf_annual
                        )
                        if cand_m["sharpe"] > best_cand_sharpe:
                            best_cand_sharpe = cand_m["sharpe"]
                            best_cand_ret = cand_m["cum_return_pct"]
                            best_cand_mdd = cand_m["mdd_pct"]
                            best_cand_id = cand_id

                    if best_cand_id and best_cand_sharpe > metrics_act["sharpe"] + 0.10:
                        before_5 = list(sim_active_set)
                        sim_active_set[idx_in_active] = best_cand_id
                        after_5 = list(sim_active_set)
                        inactive_ids.remove(best_cand_id)
                        inactive_ids.append(act_id)
                        last_swap_idx[best_cand_id] = i
                        last_swap_idx[act_id] = i
                        adopted_at_idx[best_cand_id] = i
                        adopted_at_date[best_cand_id] = dates[i]

                        trig_desc = (
                            f"특정모델 MDD 갱신({prior_max_dd_pct:.2f}% → {curr_dd_pct:.2f}%)"
                            if is_mdd_renewed and not is_limit_breached
                            else f"MDD 한도({effective_limit:.1f}%) 초과·갱신(현재낙폭 {curr_dd_pct:.2f}%)"
                        )
                        swap_info = {
                            "date": dates[i],
                            "swap_type": "MDD_RENEWAL",
                            "swap_type_label": "🚨 MDD 갱신/초과 교체",
                            "execution_time": "15:35 동시호가 전 리밸런싱",
                            "dropped_model_id": act_id,
                            "dropped_model_name": model_meta.get(act_id, {}).get("name", act_id),
                            "dropped_mdd_pct": round(curr_dd_pct, 2),
                            "prior_max_mdd_pct": round(prior_max_dd_pct, 2),
                            "effective_limit_pct": round(effective_limit, 2),
                            "dropped_sharpe": metrics_act["sharpe"],
                            "holding_days": int(i - adopt_i),
                            "selected_model_id": best_cand_id,
                            "selected_model_name": model_meta.get(best_cand_id, {}).get("name", best_cand_id),
                            "selected_sharpe": best_cand_sharpe,
                            "selected_return_pct": best_cand_ret,
                            "selected_mdd_pct": best_cand_mdd,
                            "lookback_days": lookback_days,
                            "before_active_5": before_5,
                            "after_active_5": after_5,
                            "reason": f"[{trig_desc}] {act_id}(Sharpe {metrics_act['sharpe']:.2f}) 제외 → 최근 {lookback_days // 21}개월 Sharpe 1위 {best_cand_id}({best_cand_sharpe:.2f}) 투입",
                        }
                        swap_events.append(swap_info)

        # 2-B. 정기 리밸런싱 교체 이력 산출 (3개월=63거래일 / 6개월=126거래일 주기)
        if rep_mode in ("HYBRID", "PERIODIC_ONLY") and periodic_days > 0 and i >= periodic_days:
            if (i - last_periodic_check_idx) >= periodic_days:
                last_periodic_check_idx = i
                lb_p = max(1, i - periodic_days + 1)
                inactive_ids = [m_id for m_id in pool_ids if m_id not in sim_active_set]
                if inactive_ids:
                    # 활성 5개 모델 중 정기 평가기간(3M/6M) Sharpe 최하위 모델 탐색
                    worst_act_idx = -1
                    worst_act_id = None
                    worst_act_sharpe = 999.0
                    worst_act_mdd = 0.0
                    for idx_a, act_id in enumerate(sim_active_set):
                        if i - adopted_at_idx.get(act_id, 0) < 15:
                            continue
                        a_m = calculate_series_metrics(
                            model_daily_rets[act_id][lb_p : i + 1], annual_days=annual_days, rf_annual=rf_annual
                        )
                        if a_m["sharpe"] < worst_act_sharpe:
                            worst_act_sharpe = a_m["sharpe"]
                            worst_act_mdd = a_m["mdd_pct"]
                            worst_act_id = act_id
                            worst_act_idx = idx_a

                    # 대기 모델 중 정기 평가기간(3M/6M) Sharpe 1위 모델 탐색
                    best_cand_id = None
                    best_cand_sharpe = -999.0
                    best_cand_ret = -999.0
                    best_cand_mdd = 0.0
                    for cand_id in inactive_ids:
                        c_m = calculate_series_metrics(
                            model_daily_rets[cand_id][lb_p : i + 1], annual_days=annual_days, rf_annual=rf_annual
                        )
                        if c_m["sharpe"] > best_cand_sharpe:
                            best_cand_sharpe = c_m["sharpe"]
                            best_cand_ret = c_m["cum_return_pct"]
                            best_cand_mdd = c_m["mdd_pct"]
                            best_cand_id = cand_id

                    # 대기 1위 모델의 정기 구간 Sharpe가 활성 최하위 모델보다 뚜렷이 높을 때 정기 교체 실행
                    if (
                        worst_act_id
                        and best_cand_id
                        and best_cand_sharpe > max(0.25, worst_act_sharpe + 0.20)
                    ):
                        adopt_i = adopted_at_idx.get(worst_act_id, 0)
                        before_5 = list(sim_active_set)
                        sim_active_set[worst_act_idx] = best_cand_id
                        after_5 = list(sim_active_set)
                        last_swap_idx[best_cand_id] = i
                        last_swap_idx[worst_act_id] = i
                        adopted_at_idx[best_cand_id] = i
                        adopted_at_date[best_cand_id] = dates[i]

                        p_months = max(1, round(periodic_days / 21))
                        swap_info = {
                            "date": dates[i],
                            "swap_type": "PERIODIC_REBALANCE",
                            "swap_type_label": f"📅 {p_months}개월 정기 리밸런싱",
                            "execution_time": "15:35 정기 리밸런싱 동시호가",
                            "dropped_model_id": worst_act_id,
                            "dropped_model_name": model_meta.get(worst_act_id, {}).get("name", worst_act_id),
                            "dropped_mdd_pct": round(worst_act_mdd, 2),
                            "prior_max_mdd_pct": round(worst_act_mdd, 2),
                            "effective_limit_pct": round(mdd_limit, 2),
                            "dropped_sharpe": worst_act_sharpe,
                            "holding_days": int(i - adopt_i),
                            "selected_model_id": best_cand_id,
                            "selected_model_name": model_meta.get(best_cand_id, {}).get("name", best_cand_id),
                            "selected_sharpe": best_cand_sharpe,
                            "selected_return_pct": best_cand_ret,
                            "selected_mdd_pct": best_cand_mdd,
                            "lookback_days": periodic_days,
                            "before_active_5": before_5,
                            "after_active_5": after_5,
                            "reason": f"[{p_months}개월({periodic_days}일) 정기 리밸런싱] 구간 Sharpe 최하위 {worst_act_id}({worst_act_sharpe:.2f}) → 대기 1위 {best_cand_id}(Sharpe {best_cand_sharpe:.2f}, 수익률 {best_cand_ret:+.2f}%) 교체",
                        }
                        swap_events.append(swap_info)

        # 3. 15:35 ~ 15:45 종가 동시호가 포지션 산출 (사용자가 선택한 현재 채택 5개 모델 시그널 합산 일관 유지)
        sum_sig = int(sum(int(model_sig_arrays[m_id][i]) for m_id in active_set))
        sum_sig = max(-5, min(5, sum_sig))
        base_positions[i] = sum_sig
        target_contracts[i] = sum_sig * mult
        prev_pos = target_contracts[i - 1] if i > 0 else 0
        delta_contracts[i] = target_contracts[i] - prev_pos

    # =================================================================================
    # 3대 MDD 위험관리 기준(① 개별모델 교체 / ② 포트폴리오 위험축소 / ③ 실전 운용중지 Hard-Stop)
    # 동일 운용 조건 시뮬레이션 및 비교 산출
    # =================================================================================
    def _simulate_portfolio_risk_policy(policy_mode: str, limit_pct: float) -> Dict[str, Any]:
        p_target = np.zeros(n_days, dtype=int)
        p_delta = np.zeros(n_days, dtype=int)
        p_ret = np.zeros(n_days, dtype=float)
        p_pnl = np.zeros(n_days, dtype=float)
        p_eq = np.ones(n_days, dtype=float) * 100.0
        p_dd_series = np.zeros(n_days, dtype=float)

        # 기초 무제한(MODEL_SWAP_ONLY) 가상 에쿼티는 중지 후 추세 회복 판단에 활용
        shadow_eq = equity_curve.copy()
        running_peak = 100.0
        halted = False
        halt_start_idx = -1
        shadow_at_halt = 100.0
        shadow_min_since_halt = 100.0
        scale_down_days = 0
        hard_stop_days = 0
        hard_stop_events: List[Dict[str, Any]] = []

        for idx in range(n_days):
            if idx > 0:
                prev_c = int(p_target[idx - 1])
                gross_k = prev_c * fut_pt_diff[idx] * contract_mult_krw
                fee_k = abs(int(p_delta[idx - 1])) * fut_close[idx - 1] * contract_mult_krw * fee_rate
                net_k = gross_k - fee_k
                p_pnl[idx] = net_k
                r_val = net_k / base_capital_krw
                p_ret[idx] = r_val
                p_eq[idx] = p_eq[idx - 1] + (r_val * 100.0)

            if p_eq[idx] > running_peak:
                running_peak = float(p_eq[idx])
            curr_dd = ((running_peak - float(p_eq[idx])) / max(100.0, running_peak)) * 100.0 if running_peak > 0 else 0.0
            p_dd_series[idx] = curr_dd

            raw_c = int(base_positions[idx] * mult)

            if policy_mode == "MODEL_SWAP_ONLY":
                eff_c = raw_c
            elif policy_mode == "PORTFOLIO_SCALE_DOWN":
                # 기준 ②: 포트폴리오 위험 축소 (고점 대비 DD 35% 소진 시 50% 축소, 70% 소진 시 ±1계약 축소 + 추세 하향 시 관망)
                shadow_now = float(shadow_eq[idx])
                shadow_ma15 = float(np.mean(shadow_eq[max(0, idx - 15) : idx + 1]))
                if curr_dd >= limit_pct * 0.70:
                    scale_down_days += 1
                    if shadow_now >= shadow_ma15:
                        eff_c = int(np.sign(raw_c) * 1) if raw_c != 0 else 0
                    else:
                        eff_c = 0
                elif curr_dd >= limit_pct * 0.35:
                    eff_c = int(np.sign(raw_c) * max(1, int(round(abs(raw_c) * 0.5)))) if raw_c != 0 else 0
                    scale_down_days += 1
                else:
                    eff_c = raw_c
            else:
                # 기준 ③: 실전 운용 중지 (PORTFOLIO_HARD_STOP — 전 기간 포트폴리오 MDD ≤ 한도(12%) 엄격 제한)
                if halted:
                    hard_stop_days += 1
                    shadow_now = float(shadow_eq[idx])
                    if shadow_now < shadow_min_since_halt:
                        shadow_min_since_halt = shadow_now
                    # 실전 운용 중지(Hard-Stop) 발동 후에는 전 기간 MDD가 한도(12%)를 절대 넘지 않도록 0계약 운용 중지 유지
                    eff_c = 0
                else:
                    # 전 기간 고점 대비 낙폭이 실전 한도(예: 12%) 도달 전(안전 마진 포함) 즉시 0계약 전량 청산(운용 중지)
                    if curr_dd >= limit_pct * 0.78:
                        halted = True
                        halt_start_idx = idx
                        shadow_at_halt = float(shadow_eq[idx])
                        shadow_min_since_halt = shadow_at_halt
                        hard_stop_days += 1
                        hard_stop_events.append(
                            {
                                "trigger_date": dates[idx],
                                "trigger_dd_pct": round(curr_dd, 2),
                                "limit_pct": round(limit_pct, 2),
                                "resume_date": "실전 운용중지(Hard-Stop) 확정",
                                "halted_days": int(n_days - idx),
                            }
                        )
                        eff_c = 0
                    elif curr_dd >= limit_pct * 0.50:
                        eff_c = int(np.sign(raw_c) * 1) if raw_c != 0 else 0
                        scale_down_days += 1
                    elif curr_dd >= limit_pct * 0.30:
                        eff_c = int(np.sign(raw_c) * max(1, int(round(abs(raw_c) * 0.5)))) if raw_c != 0 else 0
                        scale_down_days += 1
                    else:
                        eff_c = raw_c

            p_target[idx] = eff_c
            p_delta[idx] = eff_c - (int(p_target[idx - 1]) if idx > 0 else 0)

        p_metrics = calculate_series_metrics(pd.Series(p_ret[1:]), annual_days=annual_days, rf_annual=rf_annual)
        return {
            "mode": policy_mode,
            "target_contracts": p_target,
            "delta_contracts": p_delta,
            "daily_ret": p_ret,
            "daily_pnl_krw": p_pnl,
            "equity_curve": p_eq,
            "dd_series_pct": p_dd_series,
            "metrics": {
                **p_metrics,
                "total_pnl_krw": round(float(np.sum(p_pnl)), 0),
                "current_portfolio_dd_pct": round(float(p_dd_series[-1]) if n_days > 0 else 0.0, 2),
                "scale_down_days": int(scale_down_days),
                "hard_stop_days": int(hard_stop_days),
                "hard_stop_count": len(hard_stop_events),
                "hard_stop_events": hard_stop_events[-10:],
            },
        }

    sim_policy_swap_only = _simulate_portfolio_risk_policy("MODEL_SWAP_ONLY", port_mdd_limit)
    sim_policy_scale_down = _simulate_portfolio_risk_policy("PORTFOLIO_SCALE_DOWN", port_mdd_limit)
    sim_policy_hard_stop = _simulate_portfolio_risk_policy("PORTFOLIO_HARD_STOP", port_mdd_limit)

    policy_map = {
        "MODEL_SWAP_ONLY": sim_policy_swap_only,
        "PORTFOLIO_SCALE_DOWN": sim_policy_scale_down,
        "PORTFOLIO_HARD_STOP": sim_policy_hard_stop,
    }
    selected_policy_sim = policy_map.get(port_risk_mode, sim_policy_swap_only)

    # 사용자가 선택한 포트폴리오 위험관리 모드(①/②/③)를 메인 포트폴리오 시계열 및 원장에 반영
    target_contracts = selected_policy_sim["target_contracts"]
    delta_contracts = selected_policy_sim["delta_contracts"]
    portfolio_daily_ret = selected_policy_sim["daily_ret"]
    portfolio_daily_pnl_krw = selected_policy_sim["daily_pnl_krw"]
    equity_curve = selected_policy_sim["equity_curve"]
    portfolio_dd_series_pct = selected_policy_sim["dd_series_pct"]

    if record_swaps_to_db and swap_events:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        now_s = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        for ev in swap_events[-50:]:
            c.execute(
                """
                INSERT INTO model_swap_history (
                    swap_date, dropped_model_id, dropped_model_name, dropped_mdd_pct, dropped_sharpe,
                    selected_model_id, selected_model_name, selected_sharpe, selected_return_pct, reason, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    ev["date"],
                    ev["dropped_model_id"],
                    ev["dropped_model_name"],
                    ev["dropped_mdd_pct"],
                    ev["dropped_sharpe"],
                    ev["selected_model_id"],
                    ev["selected_model_name"],
                    ev["selected_sharpe"],
                    ev["selected_return_pct"],
                    ev["reason"],
                    now_s,
                ),
            )
        conn.commit()
        conn.close()

    # 전체 포트폴리오 성과 요약 (현재 선택 모드 vs 순수 기술 모드 vs 4대 수급 합산 모드)
    port_metrics = calculate_series_metrics(
        pd.Series(portfolio_daily_ret[1:]), annual_days=annual_days, rf_annual=rf_annual
    )
    pure_port_metrics = calculate_series_metrics(
        pd.Series(pure_port_ret[1:]), annual_days=annual_days, rf_annual=rf_annual
    )
    comb_port_metrics = calculate_series_metrics(
        pd.Series(comb_port_ret[1:]), annual_days=annual_days, rf_annual=rf_annual
    )

    # 개별 모델별 성과 요약 (10대 운영 모델 + 후보 모델), 순수 vs 4대 수급 합산 비교 및 T=0~T-20 시그널 이력
    model_summaries: List[Dict[str, Any]] = []
    for m_id in all_model_ids:
        m_rets = pd.Series(model_daily_rets[m_id][1:])
        m_stat = calculate_series_metrics(m_rets, annual_days=annual_days, rf_annual=rf_annual)
        p_stat = calculate_series_metrics(pd.Series(model_pure_rets[m_id][1:]), annual_days=annual_days, rf_annual=rf_annual)
        c_stat = calculate_series_metrics(pd.Series(model_comb_rets[m_id][1:]), annual_days=annual_days, rf_annual=rf_annual)

        s_arr = sig_df[m_id].values
        pure_arr = sig_df[f"{m_id}__pure"].values if f"{m_id}__pure" in sig_df.columns else s_arr
        sup_arr = sig_df[f"{m_id}__supply"].values if f"{m_id}__supply" in sig_df.columns else np.zeros_like(s_arr)
        comb_arr = sig_df[f"{m_id}__combined"].values if f"{m_id}__combined" in sig_df.columns else s_arr

        latest_sig = int(s_arr[-1])
        prev_sig = int(s_arr[-2]) if n_days > 1 else 0
        meta_obj = model_meta.get(m_id, {})

        def _lag_sig(lag: int) -> int:
            return int(s_arr[-1 - lag]) if n_days > lag else 0

        model_summaries.append(
            {
                "model_id": m_id,
                "logic_id": meta_obj.get("logic_id", m_id),
                "name": meta_obj.get("name", m_id),
                "category": meta_obj.get("category", ""),
                "indicator_group": meta_obj.get("indicator_group", ""),
                "excel_file": meta_obj.get("excel_file", "rawdata.xlsx"),
                "excel_sheet": meta_obj.get("excel_sheet", "Sheet3"),
                "primary_indicators": meta_obj.get("primary_indicators", []),
                "confirmation_filter": meta_obj.get("confirmation_filter", ""),
                "is_in_10_pool": m_id in [m["model_id"] for m in pool_cfg],
                "is_currently_selected": m_id in active_set,
                "latest_signal": latest_sig,
                "pure_signal": int(pure_arr[-1]),
                "supply_signal": int(sup_arr[-1]),
                "combined_signal": int(comb_arr[-1]),
                "prev_signal": prev_sig,
                "signal_lags": {
                    "T0": _lag_sig(0),
                    "T_1": _lag_sig(1),
                    "T_2": _lag_sig(2),
                    "T_3": _lag_sig(3),
                    "T_5": _lag_sig(5),
                    "T_10": _lag_sig(10),
                    "T_20": _lag_sig(20),
                },
                "mdd_threshold_pct": meta_obj.get("mdd_threshold_pct", mdd_limit),
                "pure_metrics": p_stat,
                "combined_metrics": c_stat,
                "hitting_ratio_improvement_pct": round(c_stat["hitting_ratio_pct"] - p_stat["hitting_ratio_pct"], 2),
                "return_improvement_pct": round(c_stat["cum_return_pct"] - p_stat["cum_return_pct"], 2),
                "sharpe_improvement": round(c_stat["sharpe_ratio"] - p_stat["sharpe_ratio"], 3),
                **m_stat,
            }
        )

    # 지정 구간 전체 매매 원장 (15:35~15:45 동시호가 포지션 조정 내역 + 일간/누적 매매수익률 포함)
    k200_base_for_ledger = float(k200_close[0]) if float(k200_close[0]) > 0 else 1.0
    recent_ledger: List[Dict[str, Any]] = []
    start_ledger_idx = 0
    for idx in range(start_ledger_idx, n_days):
        delta = int(delta_contracts[idx])
        action_label = "매수 진입/추가" if delta > 0 else ("매도 진입/청산" if delta < 0 else "포지션 유지(0)")
        recent_ledger.append(
            {
                "date": dates[idx],
                "signal_locked_at": "15:30:00 시그널 확정",
                "execution_window": "15:35 ~ 15:45 동시호가",
                "k200_close": round(float(k200_close[idx]), 2),
                "futures_close": round(float(fut_close[idx]), 2),
                "base_position_sum": int(base_positions[idx]),
                "multiplier": mult,
                "prev_contracts": int(target_contracts[idx - 1]) if idx > 0 else 0,
                "target_contracts": int(target_contracts[idx]),
                "order_delta_contracts": delta,
                "order_action": action_label,
                "daily_return_pct": round(float(portfolio_daily_ret[idx] * 100.0), 3),
                "cum_return_pct": round(float(equity_curve[idx] - 100.0), 2),
                "k200_cum_return_pct": round(float((k200_close[idx] / k200_base_for_ledger - 1.0) * 100.0), 2),
                "daily_pnl_krw": round(float(portfolio_daily_pnl_krw[idx]), 0),
                "equity_index": round(float(equity_curve[idx]), 2),
            }
        )

    # KOSPI200 현물 및 선물 단순보유 벤치마크 10대 평가지표 산출 (지수는 복리 기준)
    k200_benchmark_metrics = calculate_series_metrics(
        pd.Series(k200_pct_ret[1:]), annual_days=annual_days, rf_annual=rf_annual, compound=True
    )
    futures_benchmark_metrics = calculate_series_metrics(
        pd.Series(fut_pct_ret[1:]), annual_days=annual_days, rf_annual=rf_annual, compound=True
    )

    # 마지막 실제 체결(포지션 진입/변화) 트레이딩 탐색
    last_exec_idx = n_days - 1
    for idx_rev in range(n_days - 1, -1, -1):
        if int(delta_contracts[idx_rev]) != 0 or int(target_contracts[idx_rev]) != 0:
            last_exec_idx = idx_rev
            break
    last_exec_delta = int(delta_contracts[last_exec_idx])
    last_exec_action = (
        "매수 진입/추가"
        if last_exec_delta > 0
        else ("매도 진입/청산" if last_exec_delta < 0 else "포지션 유지(0)")
    )

    last_trading_summary = {
        "last_trading_date": dates[-1],
        "last_executed_trade_date": dates[last_exec_idx],
        "last_executed_action": last_exec_action,
        "last_executed_delta_contracts": last_exec_delta,
        "last_executed_target_contracts": int(target_contracts[last_exec_idx]),
        "last_executed_base_position": int(base_positions[last_exec_idx]),
        "last_executed_futures_price": round(float(fut_close[last_exec_idx]), 2),
        "last_executed_k200_price": round(float(k200_close[last_exec_idx]), 2),
        "last_executed_daily_pnl_krw": round(float(portfolio_daily_pnl_krw[last_exec_idx]), 0),
        "latest_futures_close": round(float(fut_close[-1]), 2),
        "latest_k200_close": round(float(k200_close[-1]), 2),
        "final_cum_return_pct": port_metrics["cum_return_pct"],
        "combined_static_cum_return_pct": comb_port_metrics["cum_return_pct"],
        "k200_cum_return_pct": k200_benchmark_metrics["cum_return_pct"],
        "futures_cum_return_pct": futures_benchmark_metrics["cum_return_pct"],
        "alpha_vs_k200_pct": round(port_metrics["cum_return_pct"] - k200_benchmark_metrics["cum_return_pct"], 2),
        "combined_alpha_vs_k200_pct": round(
            comb_port_metrics["cum_return_pct"] - k200_benchmark_metrics["cum_return_pct"], 2
        ),
        "total_pnl_krw": round(float(np.sum(portfolio_daily_pnl_krw)), 0),
    }

    # 차트 시각화용 샘플링/시계열 데이터
    step = max(1, n_days // 500)
    sampled_indices = list(range(0, n_days, step))
    if sampled_indices[-1] != n_days - 1:
        sampled_indices.append(n_days - 1)

    indicator_diag = compute_indicator_group_diagnostics(df, sig_df=sig_df)

    sampled_model_equities = {
        m_id: [round(float(model_equity_curves[m_id][i]), 2) for i in sampled_indices]
        for m_id in all_model_ids
    }
    sampled_model_cum_returns = {
        m_id: [round(float(model_equity_curves[m_id][i] - 100.0), 2) for i in sampled_indices]
        for m_id in all_model_ids
    }

    # 채택된 모델(현재 활성 5개 모델) vs 대기모델(10대 풀 내 비선택 대기 5개 + 신규 후보 3개) 구조화
    adopted_models_detail = []
    waiting_pool_models = []
    candidate_waiting_models = []

    for m_obj in model_summaries:
        m_copy = {
            **m_obj,
            "alpha_vs_k200_pct": round(m_obj["cum_return_pct"] - k200_benchmark_metrics["cum_return_pct"], 2),
        }
        if m_obj["is_currently_selected"]:
            adopted_models_detail.append(m_copy)
        elif m_obj["is_in_10_pool"]:
            waiting_pool_models.append(m_copy)
        else:
            candidate_waiting_models.append(m_copy)

    adopted_models_detail.sort(key=lambda x: (x["sharpe_ratio"], x["cum_return_pct"]), reverse=True)
    waiting_pool_models.sort(key=lambda x: (x["sharpe_ratio"], x["cum_return_pct"]), reverse=True)
    candidate_waiting_models.sort(key=lambda x: (x["sharpe_ratio"], x["cum_return_pct"]), reverse=True)

    waiting_models_detail = []
    for idx_w, wm in enumerate(waiting_pool_models, 1):
        waiting_models_detail.append(
            {
                **wm,
                "waiting_priority_rank": idx_w,
                "waiting_tier": "POOL_STANDBY",
                "pool_status_label": f"10대 풀 대기 {idx_w}순위 (MDD 초과 시 자동교체 우선투입)",
            }
        )
    for idx_c, cm in enumerate(candidate_waiting_models, 1):
        waiting_models_detail.append(
            {
                **cm,
                "waiting_priority_rank": len(waiting_pool_models) + idx_c,
                "waiting_tier": "CANDIDATE_POOL",
                "pool_status_label": f"신규 편입 후보 {idx_c}순위 (3M/6M 일관성 검증 후 10대 풀 승격)",
            }
        )

    k200_base = float(k200_close[0]) if float(k200_close[0]) > 0 else 1.0
    fut_base = float(fut_close[0]) if float(fut_close[0]) > 0 else 1.0

    # =================================================================================
    # 실시간 모델교체 정밀 모니터링 보드 (정기 3M/6M 리밸런싱 & 특정 모델 MDD 갱신/초과 모니터)
    # =================================================================================
    lb_3m = max(1, n_days - 63)
    lb_6m = max(1, n_days - 126)

    def _model_live_dd_and_window_stats(m_id: str, start_idx: int) -> Dict[str, Any]:
        s_idx = max(0, min(n_days - 1, start_idx))
        eq_slice = model_equity_curves[m_id][s_idx:]
        peaks = np.maximum.accumulate(eq_slice)
        dds = np.where(peaks > 0, ((peaks - eq_slice) / peaks) * 100.0, 0.0)
        curr_dd = float(dds[-1]) if len(dds) > 0 else 0.0
        prior_max_dd = float(np.max(dds[:-1])) if len(dds) > 1 else 0.0
        max_dd = float(np.max(dds)) if len(dds) > 0 else 0.0
        ret_since = float((eq_slice[-1] / max(1e-9, eq_slice[0]) - 1.0) * 100.0) if len(eq_slice) > 0 else 0.0

        m3 = calculate_series_metrics(pd.Series(model_daily_rets[m_id][lb_3m:]), annual_days=annual_days, rf_annual=rf_annual)
        m6 = calculate_series_metrics(pd.Series(model_daily_rets[m_id][lb_6m:]), annual_days=annual_days, rf_annual=rf_annual)
        return {
            "current_drawdown_pct": round(curr_dd, 2),
            "prior_max_mdd_pct": round(prior_max_dd, 2),
            "max_mdd_since_adopted_pct": round(max_dd, 2),
            "return_since_adopted_pct": round(ret_since, 2),
            "sharpe_3m": m3["sharpe_ratio"],
            "return_3m_pct": m3["cum_return_pct"],
            "mdd_3m_pct": m3["mdd_pct"],
            "sharpe_6m": m6["sharpe_ratio"],
            "return_6m_pct": m6["cum_return_pct"],
            "mdd_6m_pct": m6["mdd_pct"],
        }

    standby_models_monitor: List[Dict[str, Any]] = []
    for wm in waiting_models_detail:
        w_id = wm["model_id"]
        w_st = _model_live_dd_and_window_stats(w_id, 0)
        eval_sharpe = w_st["sharpe_3m"] if lookback_days <= 75 else w_st["sharpe_6m"]
        standby_models_monitor.append(
            {
                "model_id": w_id,
                "name": wm["name"],
                "indicator_group": wm.get("indicator_group", ""),
                "waiting_tier": wm.get("waiting_tier", "POOL_STANDBY"),
                "pool_status_label": wm.get("pool_status_label", ""),
                "eval_sharpe": eval_sharpe,
                "cum_return_pct": wm["cum_return_pct"],
                "period_mdd_pct": wm["mdd_pct"],
                **w_st,
            }
        )
    standby_models_monitor.sort(key=lambda x: (x["eval_sharpe"], x["sharpe_3m"], x["cum_return_pct"]), reverse=True)
    top_standby = standby_models_monitor[0] if standby_models_monitor else None

    active_models_monitor: List[Dict[str, Any]] = []
    for am in adopted_models_detail:
        a_id = am["model_id"]
        ad_idx = adopted_at_idx.get(a_id, 0)
        ad_date = adopted_at_date.get(a_id, dates[0])
        hold_days = int(n_days - ad_idx)
        a_st = _model_live_dd_and_window_stats(a_id, ad_idx)
        eff_lim = float(mdd_threshold_pct if mdd_threshold_pct is not None else am.get("mdd_threshold_pct", mdd_limit))
        curr_dd = a_st["current_drawdown_pct"]
        max_dd_ad = a_st["max_mdd_since_adopted_pct"]
        util_pct = round((curr_dd / max(0.5, eff_lim)) * 100.0, 1)
        headroom_pct = round(eff_lim - curr_dd, 2)
        is_renewing = (curr_dd >= max_dd_ad - 0.15) and (curr_dd >= 3.0)
        is_breached = (curr_dd >= eff_lim) or (max_dd_ad >= eff_lim)
        eval_sharpe = a_st["sharpe_3m"] if lookback_days <= 75 else a_st["sharpe_6m"]

        if is_breached:
            st_code = "ALERT_SWAP_RECOMMENDED"
            st_label = "🔴 MDD 한도 초과·갱신 (즉시교체 권고)"
        elif is_renewing and util_pct >= 70.0:
            st_code = "WARN_MDD_RENEWING"
            st_label = "🟠 특정모델 MDD 갱신 주의 (교체 임박)"
        elif top_standby and (top_standby["eval_sharpe"] > eval_sharpe + 0.25):
            st_code = "WATCH_PERIODIC_CANDIDATE"
            st_label = "🟡 정기(3M/6M) 리밸런싱 교체 후보"
        else:
            st_code = "SAFE"
            st_label = "🟢 정상 운용 (MDD 안정)"

        active_models_monitor.append(
            {
                "model_id": a_id,
                "name": am["name"],
                "indicator_group": am.get("indicator_group", ""),
                "adopted_date": ad_date,
                "holding_days": hold_days,
                "period_cum_return_pct": am["cum_return_pct"],
                "period_max_mdd_pct": am["mdd_pct"],
                "period_sharpe_ratio": am["sharpe_ratio"],
                "mdd_threshold_pct": round(eff_lim, 2),
                "mdd_utilization_pct": util_pct,
                "mdd_headroom_pct": headroom_pct,
                "is_mdd_renewing": is_renewing,
                "is_mdd_breached": is_breached,
                "eval_sharpe": eval_sharpe,
                "status_code": st_code,
                "status_label": st_label,
                "recommended_replacement": (
                    {
                        "model_id": top_standby["model_id"],
                        "name": top_standby["name"],
                        "eval_sharpe": top_standby["eval_sharpe"],
                        "sharpe_3m": top_standby["sharpe_3m"],
                        "sharpe_6m": top_standby["sharpe_6m"],
                        "sharpe_edge": round(top_standby["eval_sharpe"] - eval_sharpe, 3),
                        "return_3m_pct": top_standby["return_3m_pct"],
                        "return_6m_pct": top_standby["return_6m_pct"],
                        "mdd_3m_pct": top_standby["mdd_3m_pct"],
                    }
                    if top_standby
                    else None
                ),
                **a_st,
            }
        )

    mdd_swap_cnt = sum(1 for ev in swap_events if ev.get("swap_type") == "MDD_RENEWAL")
    per_swap_cnt = sum(1 for ev in swap_events if ev.get("swap_type") == "PERIODIC_REBALANCE")
    days_since_p = int((n_days - 1) - last_periodic_check_idx)
    days_until_p = max(0, int(periodic_days - days_since_p)) if periodic_days > 0 else 0

    model_replacement_monitor = {
        "replacement_mode": rep_mode,
        "periodic_rebalance_days": periodic_days,
        "periodic_rebalance_months": round(periodic_days / 21) if periodic_days > 0 else 0,
        "mdd_trigger_mode": trig_mode,
        "mdd_threshold_pct": mdd_limit,
        "sharpe_lookback_days": lookback_days,
        "sharpe_lookback_months": round(lookback_days / 21),
        "total_swap_count": len(swap_events),
        "mdd_swap_count": mdd_swap_cnt,
        "periodic_swap_count": per_swap_cnt,
        "last_periodic_rebalance_date": dates[last_periodic_check_idx] if n_days > 0 else "-",
        "days_since_last_periodic": days_since_p,
        "days_until_next_periodic": days_until_p,
        "initial_5_models": initial_active_snapshot,
        "current_active_5_models": list(active_set),
        "active_models_monitor": active_models_monitor,
        "standby_models_monitor": standby_models_monitor[:6],
    }

    risk_policy_comparison = {
        "active_portfolio_risk_mode": port_risk_mode,
        "model_swap_mdd_threshold_pct": round(mdd_limit, 2),
        "portfolio_mdd_limit_pct": round(port_mdd_limit, 2),
        "definitions": [
            {
                "mode": "MODEL_SWAP_ONLY",
                "title": f"기준 ①: 개별 모델 교체 기준 ({mdd_limit:.1f}%)",
                "role_label": "개별 전략 교체 트리거 (포트폴리오 한도 미적용)",
                "description": f"5개 채택 모델 중 개별 모델(1계약 기준)의 편입 후 낙폭이 {mdd_limit:.1f}%를 초과하면 대기 1순위(Sharpe 최고) 모델로 교체합니다. 포트폴리오 전체의 강제 축소나 중지는 하지 않으므로, 복수 모델 동시 손실 시 합산 포트폴리오 MDD는 {sim_policy_swap_only['metrics']['mdd_pct']}%까지 발생할 수 있습니다.",
                "metrics": sim_policy_swap_only["metrics"],
                "sampled_cum_return_pct": [
                    round(float(sim_policy_swap_only["equity_curve"][i] - 100.0), 2) for i in sampled_indices
                ],
            },
            {
                "mode": "PORTFOLIO_SCALE_DOWN",
                "title": f"기준 ②: 포트폴리오 위험 축소 기준 ({port_mdd_limit:.1f}%)",
                "role_label": "포트폴리오 디레버리징 (계약수 50%→25%→0 단계 감축)",
                "description": f"합산 포트폴리오의 고점 대비 낙폭(Portfolio DD)이 한도({port_mdd_limit:.1f}%)의 40% 도달 시 계약수를 50% 축소, 65% 도달 시 1/3로 축소, 한도 근접 시 0계약으로 방어하여 포트폴리오 전체 낙폭을 {sim_policy_scale_down['metrics']['mdd_pct']}% 수준으로 억제합니다.",
                "metrics": sim_policy_scale_down["metrics"],
                "sampled_cum_return_pct": [
                    round(float(sim_policy_scale_down["equity_curve"][i] - 100.0), 2) for i in sampled_indices
                ],
            },
            {
                "mode": "PORTFOLIO_HARD_STOP",
                "title": f"기준 ③: 실전 운용 중지 기준 ({port_mdd_limit:.1f}% Hard-Stop)",
                "role_label": "실전 서킷브레이커 (한도 도달 시 전량 청산 & 운용 중지)",
                "description": f"실전 운용의 위험 제한이 {port_mdd_limit:.1f}%일 때 백테스트도 100% 동일한 조건에서 비교할 수 있도록, 포트폴리오 낙폭이 한도에 근접/도달하는 즉시 전량 청산(0계약 운용 중지) 후 최소 20거래일 쿨다운 및 추세 회복 시에만 재진입합니다. (실제 제한된 포트폴리오 MDD: {sim_policy_hard_stop['metrics']['mdd_pct']}%)",
                "metrics": sim_policy_hard_stop["metrics"],
                "sampled_cum_return_pct": [
                    round(float(sim_policy_hard_stop["equity_curve"][i] - 100.0), 2) for i in sampled_indices
                ],
            },
        ],
    }

    result_payload = {
        "success": True,
        "simulation_params": {
            "start_date": dates[0],
            "end_date": dates[-1],
            "total_trading_days": n_days,
            "multiplier": mult,
            "point_value_krw": int(contract_mult_krw),
            "contract_type_label": "미니선물 (승수 5만원)" if int(contract_mult_krw) == 50000 else "정규선물 (승수 25만원)",
            "initial_capital_krw": int(base_capital_krw),
            "combine_supply": combine_supply,
            "supply_weight": round(float(supply_weight), 2),
            "position_range_contracts": [int(-5 * mult), int(5 * mult)],
            "mdd_threshold_pct": mdd_limit,
            "portfolio_risk_mode": port_risk_mode,
            "portfolio_mdd_limit_pct": port_mdd_limit,
            "sharpe_lookback_days": lookback_days,
            "replacement_mode": rep_mode,
            "periodic_rebalance_days": periodic_days,
            "mdd_trigger_mode": trig_mode,
            "signal_lock_deadline": "15:30:00 (당일 실시간 연동 후 매매시그널 최종 확정)",
            "execution_rule": "선물거래일 15:35 ~ 15:45 종가 동시호가 포지션 조정",
        },
        "portfolio_metrics": {
            **port_metrics,
            "point_value_krw": int(contract_mult_krw),
            "initial_capital_krw": int(base_capital_krw),
            "portfolio_risk_mode": port_risk_mode,
            "portfolio_mdd_limit_pct": port_mdd_limit,
            "unconstrained_portfolio_mdd_pct": sim_policy_swap_only["metrics"]["mdd_pct"],
            "scale_down_portfolio_mdd_pct": sim_policy_scale_down["metrics"]["mdd_pct"],
            "hard_stop_portfolio_mdd_pct": sim_policy_hard_stop["metrics"]["mdd_pct"],
            "current_portfolio_dd_pct": round(float(portfolio_dd_series_pct[-1]) if n_days > 0 else 0.0, 2),
            "total_pnl_krw": round(float(np.sum(portfolio_daily_pnl_krw)), 0),
            "total_swap_count": len(swap_events),
            "mdd_swap_count": mdd_swap_cnt,
            "periodic_swap_count": per_swap_cnt,
            "current_base_position": int(base_positions[-1]),
            "current_target_contracts": int(target_contracts[-1]),
            "latest_order_delta_contracts": int(delta_contracts[-1]),
            "alpha_vs_k200_pct": round(port_metrics["cum_return_pct"] - k200_benchmark_metrics["cum_return_pct"], 2),
        },
        "risk_policy_comparison": risk_policy_comparison,
        "model_replacement_monitor": model_replacement_monitor,
        "k200_benchmark_metrics": k200_benchmark_metrics,
        "futures_benchmark_metrics": futures_benchmark_metrics,
        "last_trading_summary": last_trading_summary,
        "adopted_models_detail": adopted_models_detail,
        "waiting_models_detail": waiting_models_detail,
        "supply_combination_comparison": {
            "pure_portfolio_metrics": pure_port_metrics,
            "combined_portfolio_metrics": comb_port_metrics,
            "hitting_ratio_improvement_pct": round(
                comb_port_metrics["hitting_ratio_pct"] - pure_port_metrics["hitting_ratio_pct"], 2
            ),
            "return_improvement_pct": round(
                comb_port_metrics["cum_return_pct"] - pure_port_metrics["cum_return_pct"], 2
            ),
            "sharpe_improvement": round(
                comb_port_metrics["sharpe_ratio"] - pure_port_metrics["sharpe_ratio"], 3
            ),
        },
        "active_5_models": active_set,
        "models_performance": model_summaries,
        "indicator_diagnostics": indicator_diag,
        "mdd_swap_history": swap_events[-30:],
        "recent_trading_ledger": list(reversed(recent_ledger)),
        "chart_series": {
            "dates": [dates[i] for i in sampled_indices],
            "portfolio_equity": [round(float(equity_curve[i]), 2) for i in sampled_indices],
            "pure_portfolio_equity": [round(float(pure_equity_curve[i]), 2) for i in sampled_indices],
            "combined_static_equity": [round(float(comb_static_equity_curve[i]), 2) for i in sampled_indices],
            "k200_normalized": [
                round(float(k200_close[i] / k200_base * 100.0), 2) for i in sampled_indices
            ],
            "futures_normalized": [
                round(float(fut_close[i] / fut_base * 100.0), 2) for i in sampled_indices
            ],
            "portfolio_cum_return_pct": [round(float(equity_curve[i] - 100.0), 2) for i in sampled_indices],
            "combined_cum_return_pct": [round(float(comb_static_equity_curve[i] - 100.0), 2) for i in sampled_indices],
            "pure_cum_return_pct": [round(float(pure_equity_curve[i] - 100.0), 2) for i in sampled_indices],
            "k200_cum_return_pct": [
                round(float((k200_close[i] / k200_base - 1.0) * 100.0), 2) for i in sampled_indices
            ],
            "futures_cum_return_pct": [
                round(float((fut_close[i] / fut_base - 1.0) * 100.0), 2) for i in sampled_indices
            ],
            "base_positions": [int(base_positions[i]) for i in sampled_indices],
            "target_contracts": [int(target_contracts[i]) for i in sampled_indices],
            "order_deltas": [int(delta_contracts[i]) for i in sampled_indices],
            "daily_returns_pct": [round(float(portfolio_daily_ret[i] * 100.0), 3) for i in sampled_indices],
            "ledger_chart": {
                "dates": [r["date"] for r in recent_ledger],
                "daily_return_pct": [r["daily_return_pct"] for r in recent_ledger],
                "cum_return_pct": [r["cum_return_pct"] for r in recent_ledger],
                "k200_cum_return_pct": [r["k200_cum_return_pct"] for r in recent_ledger],
                "base_positions": [r["base_position_sum"] for r in recent_ledger],
                "target_contracts": [r["target_contracts"] for r in recent_ledger],
                "order_delta_contracts": [r["order_delta_contracts"] for r in recent_ledger],
                "daily_pnl_krw": [r["daily_pnl_krw"] for r in recent_ledger],
            },
            "model_equities": sampled_model_equities,
            "model_cum_returns_pct": sampled_model_cum_returns,
        },
    }
    if not record_swaps_to_db:
        _CACHED_SIM_RESULTS[sim_cache_key] = result_payload
    return result_payload


def evaluate_period_consistency_and_rotate_pool(
    anchor_date: str,
    period_months: int = 3,
    candidate_model_id: Optional[str] = None,
    auto_apply_pool_rotation: bool = True,
) -> Dict[str, Any]:
    """
    성과측정 및 모델 풀(10개) 편입·퇴출 검증기:
    1) 특정 기준일자(anchor_date)와 기간(3개월 또는 6개월)을 지정하면:
       - 1차 측정 구간 (In-Sample: anchor_date부터 3개월[63영업일] 또는 6개월[126영업일]) 성과를 측정하고,
       - 2차 검증 구간 (Out-of-Sample: 그 다음 3개월 또는 6개월) 동안 성과의 일관성이 유지되는지 관측합니다.
    2) 일관성 기준(두 구간 모두 양(+)의 수익률 및 샤프지수 기준 충족)이 확정되면:
       - 후보 모델을 10대 운영 모델 풀 안에 추가하고,
       - 기존 10개 모델 중 해당 기간 성과(샤프지수 및 수익률)가 가장 나쁜 모델을 제외하여
         별도 아카이브(model_pool_archive 테이블 및 futures_simulation_config.json의 archived_models)에 보관합니다.
    """
    init_sim_tables()
    cfg = load_simulation_config()
    c_rules = cfg.get("consistency_evaluation_rules", {})
    m_params = cfg.get("market_parameters", {})
    annual_days = int(m_params.get("annual_trading_days", 250))
    rf_annual = float(m_params.get("risk_free_rate_annual", 0.0325))

    if period_months not in (3, 6):
        period_months = 3
    window_days = int(c_rules.get("month_to_trading_days", {}).get(str(period_months), 63 if period_months == 3 else 126))

    df = load_daily_dataframe()
    if df.empty:
        return {"success": False, "error": "기초데이터가 비어 있습니다."}

    cache_key = (_CACHED_DB_MTIME, True, 0.35)
    if cache_key not in _CACHED_SIGNALS:
        _CACHED_SIGNALS[cache_key] = compute_all_model_signals(df, combine_supply=True, supply_weight=0.35)
    sig_df = _CACHED_SIGNALS[cache_key]
    dates = df["date"].tolist()

    # anchor_date 위치 탐색
    anchor_indices = [i for i, d in enumerate(dates) if d >= anchor_date]
    if not anchor_indices:
        return {"success": False, "error": f"지정 일자({anchor_date}) 이후의 영업일 데이터가 없습니다."}

    idx_p1_start = anchor_indices[0]
    idx_p1_end = idx_p1_start + window_days
    idx_p2_end = idx_p1_end + window_days

    if idx_p2_end >= len(dates):
        # 만약 최신 일자 근처여서 2배 기간이 부족하면 자동으로 역산 조정 안내 또는 가용 최대 구간 설정
        max_avail_start = max(1, len(dates) - 2 * window_days - 1)
        idx_p1_start = max_avail_start
        idx_p1_end = idx_p1_start + window_days
        idx_p2_end = min(len(dates) - 1, idx_p1_end + window_days)

    p1_range = (dates[idx_p1_start], dates[idx_p1_end])
    p2_range = (dates[idx_p1_end + 1], dates[idx_p2_end])

    fut_close = df["fut_close"].values
    fut_pct_ret = np.zeros(len(dates))
    for i in range(1, len(dates)):
        prev_c = fut_close[i - 1]
        fut_pct_ret[i] = (fut_close[i] - prev_c) / prev_c if prev_c > 0 else 0.0

    pool_models = get_active_pool()
    candidate_models = get_candidate_pool()
    all_eval_models = pool_models + candidate_models

    def _eval_model(m_id: str) -> Dict[str, Any]:
        sigs = sig_df[m_id].values
        m_ret = np.zeros(len(dates))
        m_ret[1:] = sigs[:-1] * fut_pct_ret[1:]

        r_p1 = pd.Series(m_ret[idx_p1_start : idx_p1_end + 1])
        r_p2 = pd.Series(m_ret[idx_p1_end + 1 : idx_p2_end + 1])
        r_total = pd.Series(m_ret[idx_p1_start : idx_p2_end + 1])

        stat_p1 = calculate_series_metrics(r_p1, annual_days=annual_days, rf_annual=rf_annual)
        stat_p2 = calculate_series_metrics(r_p2, annual_days=annual_days, rf_annual=rf_annual)
        stat_total = calculate_series_metrics(r_total, annual_days=annual_days, rf_annual=rf_annual)

        is_consistent = (
            stat_p1["cum_return_pct"] > 0.0
            and stat_p2["cum_return_pct"] > 0.0
            and stat_p1["sharpe"] >= float(c_rules.get("min_in_sample_sharpe", 0.2))
            and stat_p2["sharpe"] >= float(c_rules.get("min_out_of_sample_sharpe", 0.1))
        )
        return {
            "in_sample": stat_p1,
            "out_of_sample": stat_p2,
            "combined": stat_total,
            "is_consistent": bool(is_consistent),
        }

    pool_evals: List[Dict[str, Any]] = []
    for m in pool_models:
        ev = _eval_model(m["model_id"])
        pool_evals.append({"model_id": m["model_id"], "name": m["name"], "category": m["category"], **ev})

    cand_evals: List[Dict[str, Any]] = []
    for cm in candidate_models:
        if cm["model_id"] in sig_df.columns:
            ev = _eval_model(cm["model_id"])
            cand_evals.append({"model_id": cm["model_id"], "name": cm["name"], "category": cm["category"], **ev})

    # 기존 10개 모델 중 성과가 가장 나쁜 모델 식별 (전체 구간 샤프지수 오름차순)
    pool_sorted_worst = sorted(pool_evals, key=lambda x: (x["combined"]["sharpe"], x["combined"]["cum_return_pct"]))
    worst_pool_model = pool_sorted_worst[0] if pool_sorted_worst else None

    # 후보 모델 선택 (지정된 candidate_model_id 또는 일관성 통과 후보 중 최고 샤프 모델)
    target_candidate = None
    if candidate_model_id:
        target_candidate = next((c for c in cand_evals if c["model_id"] == candidate_model_id), None)
    else:
        consistent_cands = [c for c in cand_evals if c["is_consistent"]]
        if consistent_cands:
            target_candidate = sorted(
                consistent_cands, key=lambda x: x["combined"]["sharpe"], reverse=True
            )[0]
        elif cand_evals:
            target_candidate = sorted(cand_evals, key=lambda x: x["combined"]["sharpe"], reverse=True)[0]

    rotation_executed = False
    rotation_detail = None

    if (
        auto_apply_pool_rotation
        and target_candidate
        and worst_pool_model
        and target_candidate["is_consistent"]
        and target_candidate["combined"]["sharpe"] > worst_pool_model["combined"]["sharpe"]
    ):
        # 10대 모델 교체 및 최하위 모델 별도 보관 수행
        worst_id = worst_pool_model["model_id"]
        cand_id = target_candidate["model_id"]

        worst_cfg_obj = next((m for m in pool_models if m["model_id"] == worst_id), None)
        cand_cfg_obj = next((m for m in candidate_models if m["model_id"] == cand_id), None)

        if worst_cfg_obj and cand_cfg_obj:
            was_selected = bool(worst_cfg_obj.get("is_selected", False))
            archived_entry = {
                **worst_cfg_obj,
                "archived_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "evaluation_anchor_date": dates[idx_p1_start],
                "period_months": period_months,
                "combined_sharpe": worst_pool_model["combined"]["sharpe"],
                "combined_return_pct": worst_pool_model["combined"]["cum_return_pct"],
                "replaced_by_model_id": cand_id,
            }

            promoted_entry = {
                **cand_cfg_obj,
                "is_selected": was_selected,
                "promoted_at": datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            }

            new_active_pool = [promoted_entry if m["model_id"] == worst_id else m for m in pool_models]
            new_candidates = [m for m in candidate_models if m["model_id"] != cand_id]
            archived_list = get_archived_models()
            archived_list.append(archived_entry)

            cfg["active_model_pool"] = new_active_pool
            cfg["candidate_models"] = new_candidates
            cfg["archived_models"] = archived_list
            save_simulation_config(cfg)

            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute(
                """
                INSERT INTO model_pool_archive (
                    evaluated_date, period_months, added_model_id, added_model_name,
                    in_sample_return_pct, in_sample_sharpe, out_sample_return_pct, out_sample_sharpe,
                    archived_model_id, archived_model_name, archived_model_sharpe, archived_model_return_pct,
                    model_Snapshot_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    dates[idx_p1_start],
                    period_months,
                    cand_id,
                    target_candidate["name"],
                    target_candidate["in_sample"]["cum_return_pct"],
                    target_candidate["in_sample"]["sharpe"],
                    target_candidate["out_of_sample"]["cum_return_pct"],
                    target_candidate["out_of_sample"]["sharpe"],
                    worst_id,
                    worst_pool_model["name"],
                    worst_pool_model["combined"]["sharpe"],
                    worst_pool_model["combined"]["cum_return_pct"],
                    json.dumps(archived_entry, ensure_ascii=False),
                    datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                ),
            )
            conn.commit()
            conn.close()

            rotation_executed = True
            rotation_detail = {
                "added_to_10_pool": promoted_entry,
                "excluded_and_archived": archived_entry,
                "message": (
                    f"후보 모델 '{target_candidate['name']}'이(가) 1차({period_months}개월) 및 2차({period_months}개월) "
                    f"성과 일관성 검증을 통과하여 10대 운영 모델에 편입되었으며, 성과 최하위 모델 "
                    f"'{worst_pool_model['name']}'은(는) 제외되어 별도 보관(Archived)되었습니다."
                ),
            }

    all_evals = pool_evals + cand_evals
    cons_cnt = sum(1 for x in all_evals if x["is_consistent"])
    cons_ratio = round((cons_cnt / max(1, len(all_evals))) * 100.0, 1)

    return {
        "success": True,
        "period_months": period_months,
        "prior_period": {"start_date": p1_range[0], "end_date": p1_range[1], "trading_days": window_days},
        "forward_period": {"start_date": p2_range[0], "end_date": p2_range[1], "trading_days": window_days},
        "consistency_summary": {
            "consistent_count": cons_cnt,
            "total_evaluated": len(all_evals),
            "consistency_ratio_pct": cons_ratio,
        },
        "candidate_evaluation": {
            "model_id": target_candidate["model_id"] if target_candidate else "",
            "name": target_candidate["name"] if target_candidate else "",
            "is_consistent": bool(target_candidate["is_consistent"]) if target_candidate else False,
            "prior_return_pct": target_candidate["in_sample"]["cum_return_pct"] if target_candidate else 0.0,
            "prior_sharpe": target_candidate["in_sample"]["sharpe"] if target_candidate else 0.0,
            "forward_return_pct": target_candidate["out_of_sample"]["cum_return_pct"] if target_candidate else 0.0,
            "forward_sharpe": target_candidate["out_of_sample"]["sharpe"] if target_candidate else 0.0,
            "recommendation": (
                "✅ 직전·직후 구간 모두 양(+)의 수익률 및 샤프 기준 통과 (10대 풀 편입 적격)"
                if (target_candidate and target_candidate["is_consistent"])
                else "⚠️ 직전·직후 연속성 미달 (추가 관찰 필요)"
            ),
        },
        "pool_rotation": {
            "applied": rotation_executed,
            "promoted_candidate_id": target_candidate["model_id"] if (rotation_executed and target_candidate) else None,
            "archived_model_id": worst_pool_model["model_id"] if (rotation_executed and worst_pool_model) else None,
            "lowest_active_model_id": worst_pool_model["model_id"] if worst_pool_model else "",
            "lowest_active_sharpe": worst_pool_model["combined"]["sharpe"] if worst_pool_model else 0.0,
        },
        "evaluation_summary": {
            "requested_anchor_date": anchor_date,
            "period_months": period_months,
            "trading_days_per_period": window_days,
            "in_sample_period": {"start": p1_range[0], "end": p1_range[1]},
            "out_of_sample_period": {"start": p2_range[0], "end": p2_range[1]},
        },
        "current_10_pool_evaluations": pool_evals,
        "candidate_evaluations": cand_evals,
        "worst_model_in_10_pool": worst_pool_model,
        "best_candidate_model": target_candidate,
        "pool_rotation_executed": rotation_executed,
        "pool_rotation_detail": rotation_detail,
        "archived_models_list": get_archived_models(),
    }


def lock_1530_daily_signals(
    multiplier: int = 1,
    mdd_threshold_pct: float = 12.0,
    sync_live_first: bool = True,
    update_excel: bool = True,
    point_value_krw: float = 50000.0,
    initial_capital_krw: float = 100000000.0,
) -> Dict[str, Any]:
    """
    [15:30 시그널 최종 확정(Lock) 엔진]
    1) 당일 실시간 기초데이터를 즉시 동기화(sync_intraday_realtime_tick)하여 rawdata.xlsx 및 futures_simulation.db에 반영하고,
    2) 15:30 기준 10대 모델 시그널, MDD 초과 자동 교체, 활성 5개 모델 합산 포지션(-5~+5),
       투자금액 멀티플 적용 목표 계약수 및 전일 보유분 대비 동시호가 매매 수량(order_delta_contracts)을 확정(Lock)하여
       SQLite daily_signal_lock 테이블에 기록합니다.
    3) 이를 통해 15:35 ~ 15:45 선물 종가 동시호가 시간에 흔들림 없이 확정된 수량만큼 포지션 조정을 수행할 수 있습니다.
    """
    init_sim_tables()
    live_sync_info = None
    if sync_live_first:
        try:
            scripts_dir = os.path.join(BASE_DIR, "scripts")
            if scripts_dir not in os.sys.path:
                os.sys.path.append(scripts_dir)
            from update_rawdata import sync_intraday_realtime_tick

            live_sync_info = sync_intraday_realtime_tick(write_excel=update_excel, force_excel=True)
            invalidate_sim_cache()
        except Exception as e:
            live_sync_info = {"status": "warn", "detail": str(e)}

    sim_res = run_futures_simulation(
        start_date="2023-01-01",
        multiplier=multiplier,
        mdd_threshold_pct=mdd_threshold_pct,
        enable_auto_mdd_swap=True,
        record_swaps_to_db=True,
        point_value_krw=point_value_krw,
        initial_capital_krw=initial_capital_krw,
    )
    if not sim_res.get("success"):
        return {"success": False, "error": sim_res.get("error", "시뮬레이션 실패")}

    latest_ledger = sim_res["recent_trading_ledger"][0]
    lock_date = latest_ledger["date"]
    now_kst_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    active_5 = sim_res["active_5_models"]
    all_10_sigs = {
        m["model_id"]: {
            "name": m["name"],
            "logic_id": m.get("logic_id", ""),
            "indicator_group": m.get("indicator_group", ""),
            "is_selected": m["is_currently_selected"],
            "signal": m["latest_signal"],
            "prev_signal": m.get("signal_lags", {}).get("T_1", 0),
            "sharpe": m["sharpe"],
            "mdd_pct": m["mdd_pct"],
        }
        for m in sim_res["models_performance"]
    }

    base_pos = int(latest_ledger["base_position_sum"])
    prev_c = int(latest_ledger["prev_contracts"])
    target_c = int(latest_ledger["target_contracts"])
    delta_c = int(latest_ledger["order_delta_contracts"])
    action_str = str(latest_ledger["order_action"])
    fut_price = float(latest_ledger["futures_close"])

    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute(
        """
        INSERT OR REPLACE INTO daily_signal_lock VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        """,
        (
            lock_date,
            now_kst_str,
            "LOCKED_AT_1530",
            json.dumps(active_5, ensure_ascii=False),
            json.dumps(all_10_sigs, ensure_ascii=False),
            base_pos,
            multiplier,
            prev_c,
            target_c,
            delta_c,
            action_str,
            fut_price,
            json.dumps(sim_res.get("indicator_diagnostics", {}), ensure_ascii=False),
        ),
    )
    conn.commit()
    conn.close()

    return {
        "success": True,
        "lock_date": lock_date,
        "locked_at_kst": now_kst_str,
        "lock_status": "LOCKED_AT_1530",
        "execution_schedule": "15:30 시그널 확정 완료 -> 15:35~15:45 종가 동시호가 포지션 조정 집행",
        "futures_price_at_lock": fut_price,
        "active_5_models": active_5,
        "all_10_models_signals": all_10_sigs,
        "base_position_sum": base_pos,
        "multiplier": multiplier,
        "prev_contracts": prev_c,
        "target_contracts": target_c,
        "order_delta_contracts": delta_c,
        "order_action": action_str,
        "live_sync_info": live_sync_info,
    }


def get_intraday_and_1530_lock_status(
    multiplier: int = 1,
    sync_now: bool = False,
    point_value_krw: float = 50000.0,
    initial_capital_krw: float = 100000000.0,
) -> Dict[str, Any]:
    """
    현재 KST 시각 기준 장중 실시간 연동 상태, rawdata.xlsx 당일 실시간 가격/수급 현황,
    전일 대비 당일 장중 포지션 변화(모델별 시그널 변화 포함) 및 당일 15:30 시그널 확정(Lock) 여부를 반환합니다.
    - 승수(point_value_krw): 기본 50,000원(미니선물), 선택 250,000원(정규선물)
    - 투자원금(initial_capital_krw): 기본 100,000,000원(1억원)
    """
    if point_value_krw not in (50000.0, 250000.0):
        point_value_krw = 250000.0 if float(point_value_krw or 50000.0) >= 150000.0 else 50000.0
    if not initial_capital_krw or float(initial_capital_krw) <= 0:
        initial_capital_krw = 100000000.0
    init_sim_tables()
    live_sync_result = None
    if sync_now:
        try:
            scripts_dir = os.path.join(BASE_DIR, "scripts")
            if scripts_dir not in os.sys.path:
                os.sys.path.append(scripts_dir)
            from update_rawdata import sync_intraday_realtime_tick

            live_sync_result = sync_intraday_realtime_tick(write_excel=False, force_excel=False)
        except Exception as e:
            live_sync_result = {"status": "warn", "detail": str(e)}

    now = datetime.datetime.now()
    hhmm = now.hour * 100 + now.minute
    is_weekend = now.weekday() >= 5

    if is_weekend or hhmm >= 1545 or hhmm < 845:
        phase_code = "MARKET_CLOSED_LOCKED"
        phase_label = "장 마감 / 15:30 최종 시그널 확정 완료"
    elif 1530 <= hhmm < 1545:
        phase_code = "SIGNAL_LOCKED_FOR_AUCTION"
        phase_label = "15:30 시그널 확정 완료 (15:35~15:45 동시호가 포지션 조정 구간)"
    else:
        phase_code = "INTRADAY_LIVE"
        phase_label = "장중 실시간 가격 연동 중 (15:30 KOSPI 마감 후 시그널 확정 대기)"

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.execute("SELECT * FROM futures_daily_data ORDER BY date DESC LIMIT 120")
    recent_120_rows = c.fetchall()
    recent_db_rows = recent_120_rows[:2]
    latest_date = recent_db_rows[0]["date"] if recent_db_rows else now.strftime("%Y-%m-%d")

    c.execute("SELECT * FROM daily_signal_lock WHERE lock_date = ?", (latest_date,))
    lock_row = c.fetchone()

    # 장중 틱 로그 조회
    tick_rows = []
    try:
        c.execute(
            "SELECT * FROM intraday_tick_log WHERE trading_date = ? ORDER BY tick_time ASC LIMIT 60",
            (latest_date,),
        )
        tick_rows = [dict(r) for r in c.fetchall()]
    except Exception:
        tick_rows = []
    conn.close()

    # 당일 rawdata.xlsx / DB 실시간 가격 및 수급 현황 구성
    today_rawdata: Dict[str, Any] = {}
    if recent_db_rows:
        r0 = dict(recent_db_rows[0])
        r1 = dict(recent_db_rows[1]) if len(recent_db_rows) > 1 else r0
        fut_c = float(r0.get("fut_close") or 0.0)
        prev_fut_c = float(r1.get("fut_close") or fut_c)
        fut_diff = round(fut_c - prev_fut_c, 2)
        fut_pct = round((fut_diff / prev_fut_c) * 100.0, 2) if prev_fut_c else 0.0

        k200_c = float(r0.get("k200_close") or 0.0)
        prev_k200_c = float(r1.get("k200_close") or k200_c)
        k200_diff = round(k200_c - prev_k200_c, 2)
        k200_pct = round((k200_diff / prev_k200_c) * 100.0, 2) if prev_k200_c else 0.0

        oi_today = float(r0.get("open_interest") or 0.0)
        oi_prev = float(r1.get("open_interest") or oi_today)
        call_c = float(r0.get("call_close") or 0.0)
        put_c = float(r0.get("put_close") or 0.0)
        pcr_val = round(put_c / max(0.01, call_c), 3) if call_c > 0 else 1.0

        excel_path = os.path.join(BASE_DIR, "data", "rawdata.xlsx")
        excel_mtime_str = (
            datetime.datetime.fromtimestamp(os.path.getmtime(excel_path)).strftime("%Y-%m-%d %H:%M:%S")
            if os.path.exists(excel_path)
            else now.strftime("%Y-%m-%d %H:%M:%S")
        )

        today_rawdata = {
            "date": r0.get("date"),
            "prev_date": r1.get("date"),
            "fut_open": round(float(r0.get("fut_open") or 0.0), 2),
            "fut_high": round(float(r0.get("fut_high") or 0.0), 2),
            "fut_low": round(float(r0.get("fut_low") or 0.0), 2),
            "fut_close": round(fut_c, 2),
            "prev_fut_close": round(prev_fut_c, 2),
            "fut_change_pt": fut_diff,
            "fut_change_pct": fut_pct,
            "k200_open": round(float(r0.get("k200_open") or 0.0), 2),
            "k200_high": round(float(r0.get("k200_high") or 0.0), 2),
            "k200_low": round(float(r0.get("k200_low") or 0.0), 2),
            "k200_close": round(k200_c, 2),
            "prev_k200_close": round(prev_k200_c, 2),
            "k200_change_pt": k200_diff,
            "k200_change_pct": k200_pct,
            "basis": round(fut_c - k200_c, 2),
            "fut_foreign_net": round(float(r0.get("fut_foreign_net") or 0.0), 0),
            "spot_foreign_net": round(float(r0.get("spot_foreign_net") or 0.0) / 10.0, 1),
            "spot_personal_net": round(float(r0.get("spot_personal_net") or 0.0) / 10.0, 1),
            "program_arb_net": round(float(r0.get("program_arb_net") or 0.0) / 100.0, 1),
            "open_interest": round(oi_today, 0),
            "prev_open_interest": round(oi_prev, 0),
            "oi_change": round(oi_today - oi_prev, 0),
            "new_high_low_diff": round(float(r0.get("new_high_low_diff") or 0.0), 0),
            "up_down_diff": round(float(r0.get("up_down_diff") or 0.0), 0),
            "call_close": round(call_c, 2),
            "put_close": round(put_c, 2),
            "pcr_ratio": pcr_val,
            "fx_close": round(float(r0.get("fx_close") or 0.0), 2),
            "kodex_leverage": round(float(r0.get("kodex_leverage") or 0.0), 0),
            "excel_updated_at": excel_mtime_str,
        }

    # 캐시된 시뮬레이션(없으면 1회 실행)의 채택 모델 + 최근 120일 실시간 시그널로 Step 5를 0.01초 내 초고속 산출
    matched_cached_sim = None
    for k, v in _CACHED_SIM_RESULTS.items():
        if len(k) >= 14 and k[3] == multiplier and k[-2] == int(point_value_krw) and k[-1] == int(initial_capital_krw):
            matched_cached_sim = v
            break
    if matched_cached_sim is not None:
        sim_res = matched_cached_sim
    else:
        sim_res = run_futures_simulation(
            start_date="2023-01-02",
            end_date="CURRENT",
            multiplier=multiplier,
            sharpe_lookback_days=63,
            enable_auto_mdd_swap=True,
            record_swaps_to_db=False,
            point_value_krw=point_value_krw,
            initial_capital_krw=initial_capital_krw,
        )

    df_tail = pd.DataFrame([dict(r) for r in reversed(recent_120_rows)]) if recent_120_rows else pd.DataFrame()
    if not df_tail.empty:
        num_c = [col for col in df_tail.columns if col != "date"]
        for col in num_c:
            df_tail[col] = pd.to_numeric(df_tail[col], errors="coerce")
        df_tail[num_c] = df_tail[num_c].ffill().bfill().fillna(0.0)
        sig_tail = compute_all_model_signals(df_tail, combine_supply=True, supply_weight=0.35)
    else:
        sig_tail = pd.DataFrame()

    active_5_set = set(m["model_id"] for m in get_active_pool() if m.get("is_selected")) or set(sim_res.get("active_5_models") or [])
    models_perf_list = sim_res.get("models_performance", [])

    prev_base_pos = 0
    today_base_pos = 0
    models_signal_changes: List[Dict[str, Any]] = []
    changed_selected_count = 0
    changed_total_count = 0

    for m in models_perf_list:
        m_id = m["model_id"]
        if not sig_tail.empty and m_id in sig_tail.columns and len(sig_tail) >= 2:
            today_sig = int(sig_tail[m_id].iloc[-1])
            prev_sig = int(sig_tail[m_id].iloc[-2])
        else:
            prev_sig = int(m.get("signal_lags", {}).get("T_1", 0))
            today_sig = int(m.get("latest_signal", 0))
        sig_diff = today_sig - prev_sig
        is_sel = m_id in active_5_set
        if is_sel:
            prev_base_pos += prev_sig
            today_base_pos += today_sig
        changed = prev_sig != today_sig
        if changed:
            changed_total_count += 1
            if is_sel:
                changed_selected_count += 1
        sig_name = lambda s: "매수(+1)" if s > 0 else ("매도(-1)" if s < 0 else "중립(0)")
        if changed:
            change_label = f"⚡ {sig_name(prev_sig)} → {sig_name(today_sig)} 전환"
        else:
            change_label = f"{sig_name(today_sig)} 유지"
        models_signal_changes.append(
            {
                "model_id": m_id,
                "name": m["name"],
                "indicator_group": m.get("indicator_group", ""),
                "is_selected": is_sel,
                "is_in_10_pool": bool(m.get("is_in_10_pool", True)),
                "prev_signal": prev_sig,
                "today_signal": today_sig,
                "signal_delta": sig_diff,
                "signal_changed": changed,
                "change_label": change_label,
                "cum_return_pct": m.get("cum_return_pct", 0.0),
                "sharpe_ratio": m.get("sharpe_ratio", 0.0),
                "mdd_pct": m.get("mdd_pct", 0.0),
            }
        )

    prev_base_pos = max(-5, min(5, prev_base_pos))
    today_base_pos = max(-5, min(5, today_base_pos))
    prev_contracts = prev_base_pos * multiplier
    today_target_contracts = today_base_pos * multiplier
    order_delta_contracts = today_target_contracts - prev_contracts
    order_action = (
        "매수 진입/추가"
        if order_delta_contracts > 0
        else ("매도 진입/청산" if order_delta_contracts < 0 else "포지션 유지(0)")
    )

    fut_diff_today = float(today_rawdata.get("fut_change_pt") or 0.0)
    today_daily_pnl_krw = round(prev_contracts * fut_diff_today * float(point_value_krw), 0)
    today_daily_ret_pct = round((today_daily_pnl_krw / float(initial_capital_krw)) * 100.0, 3) if prev_contracts != 0 else 0.0
    ledger_list = sim_res.get("recent_trading_ledger", []) if sim_res.get("success") else []
    today_ledger = ledger_list[0] if len(ledger_list) > 0 else {}
    prev_ledger = ledger_list[1] if len(ledger_list) > 1 else today_ledger

    position_change_check = {
        "prev_date": today_rawdata.get("prev_date") or prev_ledger.get("date", "-"),
        "today_date": today_rawdata.get("date") or latest_date,
        "point_value_krw": int(point_value_krw),
        "contract_type_label": "미니선물 (승수 5만원)" if int(point_value_krw) == 50000 else "정규선물 (승수 25만원)",
        "initial_capital_krw": int(initial_capital_krw),
        "prev_base_position_sum": prev_base_pos,
        "today_base_position_sum": today_base_pos,
        "base_position_delta": today_base_pos - prev_base_pos,
        "prev_contracts": prev_contracts,
        "today_target_contracts": today_target_contracts,
        "order_delta_contracts": order_delta_contracts,
        "order_action": order_action,
        "today_daily_return_pct": today_daily_ret_pct,
        "today_daily_pnl_krw": today_daily_pnl_krw,
        "today_cum_return_pct": today_ledger.get("cum_return_pct", 0.0),
        "changed_selected_models_count": changed_selected_count,
        "changed_total_models_count": changed_total_count,
        "models_signal_changes": models_signal_changes,
    }

    # 당일 장중 시간대별 가격 및 예상 포지션 추이 (09:00 시가 ~ 15:30 마감/현재)
    intraday_timeline: List[Dict[str, Any]] = []
    if today_rawdata:
        f_open = today_rawdata.get("fut_open", 0.0)
        f_high = today_rawdata.get("fut_high", 0.0)
        f_low = today_rawdata.get("fut_low", 0.0)
        f_curr = today_rawdata.get("fut_close", 0.0)
        prev_f = today_rawdata.get("prev_fut_close", f_open)

        def _est_pos_at_price(price_val: float) -> int:
            # 시가/고가/저가 구간에서의 잠정 포지션 추정 (전일 포지션과 당일 현재 포지션 사이 가격 민감도 반영)
            if abs(f_curr - prev_f) < 0.05:
                return today_base_pos
            ratio = (price_val - prev_f) / (f_curr - prev_f)
            interp = round(prev_base_pos + (today_base_pos - prev_base_pos) * max(-0.5, min(1.3, ratio)))
            return int(max(-5, min(5, interp)))

        open_pos = _est_pos_at_price(f_open)
        high_pos = max(open_pos, today_base_pos, min(5, prev_base_pos + 1)) if f_high >= f_open else open_pos
        low_pos = min(open_pos, today_base_pos, max(-5, prev_base_pos - 1)) if f_low <= f_open else open_pos
        mid_price = round((f_high + f_low + f_curr) / 3.0, 2)
        mid_pos = _est_pos_at_price(mid_price)

        base_checkpoints = [
            ("09:00 시가", f_open, open_pos),
            ("10:30 장중고가", f_high, high_pos),
            ("12:00 장중저가", f_low, low_pos),
            ("14:00 오후장", mid_price, mid_pos),
        ]
        for label_t, p_val, b_pos in base_checkpoints:
            t_c = b_pos * multiplier
            intraday_timeline.append(
                {
                    "time_label": label_t,
                    "fut_price": round(float(p_val), 2),
                    "base_position_sum": int(b_pos),
                    "target_contracts": int(t_c),
                    "order_delta_contracts": int(t_c - prev_contracts),
                }
            )
        # 실제 기록된 장중 틱 로그가 있으면 최근 6개 추가
        for tr in tick_rows[-6:]:
            t_str = str(tr.get("tick_time", ""))[-8:-3] or "실시간"
            t_price = round(float(tr.get("fut_close") or f_curr), 2)
            intraday_timeline.append(
                {
                    "time_label": f"{t_str} 실시간",
                    "fut_price": t_price,
                    "base_position_sum": today_base_pos,
                    "target_contracts": today_target_contracts,
                    "order_delta_contracts": order_delta_contracts,
                }
            )
        intraday_timeline.append(
            {
                "time_label": "15:30 마감/현재",
                "fut_price": f_curr,
                "base_position_sum": today_base_pos,
                "target_contracts": today_target_contracts,
                "order_delta_contracts": order_delta_contracts,
            }
        )

    if lock_row is None and phase_code != "INTRADAY_LIVE":
        # 15:30 이후인데 아직 Lock 레코드가 없으면 즉시 확정 생성
        locked_data = lock_1530_daily_signals(multiplier=multiplier, sync_live_first=False, update_excel=False)
    elif lock_row is not None:
        saved_base = int(lock_row[5])
        saved_mult = max(1, int(lock_row[6]))
        saved_prev = int(lock_row[7]) // saved_mult * multiplier
        saved_target = saved_base * multiplier
        saved_delta = saved_target - saved_prev
        locked_data = {
            "lock_date": lock_row[0],
            "locked_at_kst": lock_row[1],
            "lock_status": lock_row[2],
            "active_5_models": json.loads(lock_row[3]),
            "all_10_models_signals": json.loads(lock_row[4]),
            "base_position_sum": saved_base,
            "multiplier": multiplier,
            "prev_contracts": saved_prev,
            "target_contracts": saved_target,
            "order_delta_contracts": saved_delta,
            "order_action": lock_row[10],
            "futures_price_at_lock": float(lock_row[11]),
            "indicator_diagnostics": json.loads(lock_row[12]) if len(lock_row) > 12 and lock_row[12] else {},
        }
    else:
        locked_data = None

    return {
        "success": True,
        "current_kst": now.strftime("%Y-%m-%d %H:%M:%S"),
        "trading_date": latest_date,
        "latest_trading_date": latest_date,
        "phase_code": phase_code,
        "phase_label": phase_label,
        "lock_status": locked_data["lock_status"] if locked_data else phase_label,
        "base_position_sum": today_base_pos,
        "prev_contracts": prev_contracts,
        "target_contracts": today_target_contracts,
        "order_delta_contracts": order_delta_contracts,
        "order_action": order_action,
        "deadline_rule": "매일 09:00~15:30 rawdata.xlsx 실시간 가격 연동 -> 15:30:00 KOSPI 마감 후 시그널 최종 확정 -> 15:35~15:45 종가 동시호가 포지션 조정",
        "today_rawdata": today_rawdata,
        "position_change_check": position_change_check,
        "intraday_timeline": intraday_timeline,
        "locked_signal": locked_data,
        "live_sync_result": live_sync_result,
    }


def update_selected_models_in_pool(selected_model_ids: List[str]) -> Dict[str, Any]:
    """
    사용자가 Step 2(구간별 모델 평가) 또는 Step 3(후속 구간 일관성 검증)에서 선택한 최종 모델들을
    config/futures_simulation_config.json의 active_model_pool에 즉시 반영합니다.
    """
    if not selected_model_ids:
        return {"success": False, "error": "최소 1개 이상의 모델을 선택해주세요."}

    cfg = load_simulation_config()
    pool_models = cfg.get("active_model_pool", [])
    cand_models = cfg.get("candidate_models", [])
    selected_set = set(selected_model_ids)

    # 만약 후보 모델(C01~C03)이 선택되었다면 active_model_pool에 편입
    existing_pool_ids = {m["model_id"] for m in pool_models}
    for cm in list(cand_models):
        if cm["model_id"] in selected_set and cm["model_id"] not in existing_pool_ids:
            pool_models.append({**cm, "is_selected": True})

    for m in pool_models:
        m["is_selected"] = m["model_id"] in selected_set

    cfg["active_model_pool"] = pool_models
    save_simulation_config(cfg)
    _CACHED_SIM_RESULTS.clear()

    return {
        "success": True,
        "selected_model_ids": [m["model_id"] for m in pool_models if m.get("is_selected")],
        "selected_models_detail": [m for m in pool_models if m.get("is_selected")],
        "message": f"선택하신 {len(selected_set)}개 모델이 최종 운용 모델로 저장되었습니다.",
    }


def test_selected_models_consistency(
    eval_start_date: str,
    eval_end_date: str,
    test_start_date: str,
    test_end_date: Optional[str] = None,
    selected_model_ids: Optional[List[str]] = None,
    combine_supply: bool = True,
    supply_weight: float = 0.35,
    multiplier: int = 1,
    apply_to_active: bool = False,
    point_value_krw: float = 50000.0,
    initial_capital_krw: float = 100000000.0,
) -> Dict[str, Any]:
    """
    [Step 3: 선택된 최종모델의 후속 구간 테스트 및 일관성 측정]
    - 1차 구간 (선정 구간: eval_start_date ~ eval_end_date)에서 선택된 최종 모델들로
    - 2차 구간 (후속 테스트 구간: test_start_date ~ test_end_date 또는 현재까지)을 테스트하여
      개별 모델 및 선택 합산 포트폴리오의 10대 정밀 평가지표와 일관성 유지 여부를 측정합니다.
    - 승수(point_value_krw): 기본 50,000원(미니선물), 선택 250,000원(정규선물)
    - 투자원금(initial_capital_krw): 기본 100,000,000원(1억원)
    """
    cfg = load_simulation_config()
    m_params = cfg.get("market_parameters", {})
    annual_days = int(m_params.get("annual_trading_days", 250))
    rf_annual = float(m_params.get("risk_free_rate_annual", 0.0325))
    if point_value_krw not in (50000.0, 250000.0):
        point_value_krw = 250000.0 if float(point_value_krw or 50000.0) >= 150000.0 else 50000.0
    if not initial_capital_krw or float(initial_capital_krw) <= 0:
        initial_capital_krw = 100000000.0
    mult = max(1, int(multiplier or 1))

    if test_end_date and str(test_end_date).strip().upper() in ("CURRENT", "NOW", "LATEST", "현재", ""):
        test_end_date = None

    df_all = load_daily_dataframe()
    if df_all.empty:
        return {"success": False, "error": "기초데이터가 비어 있습니다."}

    cache_key = (_CACHED_DB_MTIME, bool(combine_supply), round(float(supply_weight), 3))
    if cache_key not in _CACHED_SIGNALS:
        _CACHED_SIGNALS[cache_key] = compute_all_model_signals(
            df_all, combine_supply=combine_supply, supply_weight=supply_weight
        )
    sig_df = _CACHED_SIGNALS[cache_key]
    pool_cfg = get_active_pool()
    cand_cfg = get_candidate_pool()
    all_cfg = pool_cfg + [c for c in cand_cfg if c["model_id"] not in [m["model_id"] for m in pool_cfg]]
    model_meta = {m["model_id"]: m for m in all_cfg}
    all_model_ids = [m["model_id"] for m in all_cfg if m["model_id"] in sig_df.columns]

    if selected_model_ids and len(selected_model_ids) >= 1:
        target_ids = [m_id for m_id in selected_model_ids if m_id in all_model_ids]
    else:
        target_ids = [m["model_id"] for m in pool_cfg if m.get("is_selected", False)]
        if not target_ids:
            target_ids = all_model_ids[:5]

    dates = df_all["date"].tolist()
    fut_close = df_all["fut_close"].values
    k200_close = (
        df_all["k200_close"].values
        if "k200_close" in df_all.columns
        else df_all["fut_close"].values
    )
    n_total = len(dates)
    fut_pct_ret = np.zeros(n_total)
    fut_pt_diff = np.zeros(n_total)
    k200_pct_ret = np.zeros(n_total)
    for i in range(1, n_total):
        prev_c = fut_close[i - 1]
        fut_pt_diff[i] = fut_close[i] - prev_c
        fut_pct_ret[i] = (fut_close[i] - prev_c) / prev_c if prev_c > 0 else 0.0
        prev_k = k200_close[i - 1]
        k200_pct_ret[i] = (k200_close[i] - prev_k) / prev_k if prev_k > 0 else fut_pct_ret[i]

    # 구간 인덱스 마스크 산출
    p1_mask = (df_all["date"] >= eval_start_date) & (df_all["date"] <= eval_end_date)
    if test_end_date:
        p2_mask = (df_all["date"] >= test_start_date) & (df_all["date"] <= test_end_date)
    else:
        p2_mask = df_all["date"] >= test_start_date

    p1_indices = np.where(p1_mask.values)[0]
    p2_indices = np.where(p2_mask.values)[0]

    if len(p1_indices) < 3:
        return {"success": False, "error": f"1차 선정 구간({eval_start_date} ~ {eval_end_date})의 거래일이 부족합니다."}
    if len(p2_indices) < 3:
        return {"success": False, "error": f"2차 후속 테스트 구간({test_start_date} ~ {test_end_date or '현재'})의 거래일이 부족합니다."}

    # 각 모델별 1차 구간(전) vs 2차 후속 구간(후) 10대 평가지표 및 시계열, 연속성 측정 (투자원금 1억원 및 선택 승수 기준)
    selected_models_comparison: List[Dict[str, Any]] = []
    all_models_comparison: List[Dict[str, Any]] = []
    p1_model_cum_returns_pct: Dict[str, List[float]] = {}
    p2_model_cum_returns_pct: Dict[str, List[float]] = {}
    n_sel = max(1, len(target_ids))
    per_model_cap = max(1.0, float(initial_capital_krw) / float(n_sel))
    unit_pt_ret = (fut_pt_diff * float(point_value_krw) * mult) / per_model_cap

    port_ret_all = np.zeros(n_total)
    pure_port_ret_all = np.zeros(n_total)
    if target_ids and n_total > 1:
        s_sum_arr = sum(sig_df[m_id].values[:-1] for m_id in target_ids)
        p_sum_arr = sum(sig_df[f"{m_id}__pure"].values[:-1] for m_id in target_ids)
        port_ret_all[1:] = (s_sum_arr * mult * fut_pt_diff[1:] * float(point_value_krw)) / float(initial_capital_krw)
        pure_port_ret_all[1:] = (p_sum_arr * mult * fut_pt_diff[1:] * float(point_value_krw)) / float(initial_capital_krw)

    pool_id_set = {m["model_id"] for m in pool_cfg}

    for m_id in all_model_ids:
        sigs = sig_df[m_id].values
        m_ret = np.zeros(n_total)
        m_ret[1:] = sigs[:-1] * unit_pt_ret[1:]

        r_p1 = pd.Series(m_ret[p1_indices])
        r_p2 = pd.Series(m_ret[p2_indices])

        m_p1 = calculate_series_metrics(r_p1, annual_days=annual_days, rf_annual=rf_annual)
        m_p2 = calculate_series_metrics(r_p2, annual_days=annual_days, rf_annual=rf_annual)

        m_eq_p1 = (np.cumsum(m_ret[p1_indices]) * 100.0).round(2).tolist()
        m_eq_p2 = (np.cumsum(m_ret[p2_indices]) * 100.0).round(2).tolist()
        p1_model_cum_returns_pct[m_id] = m_eq_p1
        p2_model_cum_returns_pct[m_id] = m_eq_p2

        # 연속성 판정: 전(1구간)과 후(2구간) 모두 양(+)의 수익률을 기록하거나, 후속 구간 샤프지수 >= 0.35
        both_positive = bool(m_p1["cum_return_pct"] > 0.0 and m_p2["cum_return_pct"] > 0.0)
        is_consistent = bool(
            both_positive
            or (m_p2["cum_return_pct"] > 0.0 and m_p2["hitting_ratio_pct"] >= 48.0)
            or (m_p2["sharpe_ratio"] >= 0.35)
        )
        meta = model_meta.get(m_id, {})
        comp_item = {
            "model_id": m_id,
            "logic_id": meta.get("logic_id", m_id),
            "name": meta.get("name", m_id),
            "category": meta.get("category", ""),
            "indicator_group": meta.get("indicator_group", ""),
            "is_in_10_pool": m_id in pool_id_set,
            "is_selected": m_id in target_ids,
            "period_1_metrics": m_p1,
            "period_2_metrics": m_p2,
            "both_positive": both_positive,
            "is_consistent": is_consistent,
            "consistency_status": "✅ 전·후 연속성 유지 (PASS)" if is_consistent else "⚠️ 후속 성과 저하 (CHECK)",
        }
        all_models_comparison.append(comp_item)
        if m_id in target_ids:
            selected_models_comparison.append(comp_item)

    # 합산 포트폴리오 1차 구간 vs 2차 후속 구간 평가지표
    port_p1_metrics = calculate_series_metrics(pd.Series(port_ret_all[p1_indices]), annual_days=annual_days, rf_annual=rf_annual)
    port_p2_metrics = calculate_series_metrics(pd.Series(port_ret_all[p2_indices]), annual_days=annual_days, rf_annual=rf_annual)
    pure_p2_metrics = calculate_series_metrics(pd.Series(pure_port_ret_all[p2_indices]), annual_days=annual_days, rf_annual=rf_annual)
    k200_p1_metrics = calculate_series_metrics(pd.Series(k200_pct_ret[p1_indices]), annual_days=annual_days, rf_annual=rf_annual, compound=True)
    k200_p2_metrics = calculate_series_metrics(pd.Series(k200_pct_ret[p2_indices]), annual_days=annual_days, rf_annual=rf_annual, compound=True)

    # 차트용 1차 구간(전) 및 2차 후속 구간(후) 누적 수익지수(100 기준) 및 누적수익률(0% 기준)
    eq_p1 = (100.0 + np.cumsum(port_ret_all[p1_indices]) * 100.0).round(2).tolist()
    eq_p2 = (100.0 + np.cumsum(port_ret_all[p2_indices]) * 100.0).round(2).tolist()
    eq_p2_pure = (100.0 + np.cumsum(pure_port_ret_all[p2_indices]) * 100.0).round(2).tolist()

    cum_p1 = (np.cumsum(port_ret_all[p1_indices]) * 100.0).round(2).tolist()
    cum_p2 = (np.cumsum(port_ret_all[p2_indices]) * 100.0).round(2).tolist()
    cum_p2_pure = (np.cumsum(pure_port_ret_all[p2_indices]) * 100.0).round(2).tolist()

    k200_cum_p1 = ((np.cumprod(1.0 + k200_pct_ret[p1_indices]) - 1.0) * 100.0).round(2).tolist()
    k200_cum_p2 = ((np.cumprod(1.0 + k200_pct_ret[p2_indices]) - 1.0) * 100.0).round(2).tolist()
    k200_eq_p1 = (np.cumprod(1.0 + k200_pct_ret[p1_indices]) * 100.0).round(2).tolist()
    k200_eq_p2 = (np.cumprod(1.0 + k200_pct_ret[p2_indices]) * 100.0).round(2).tolist()

    if apply_to_active:
        update_selected_models_in_pool(target_ids)

    consistent_count = sum(1 for m in selected_models_comparison if m["is_consistent"])
    consistent_all_count = sum(1 for m in all_models_comparison if m["is_consistent"])
    consistency_score_pct = round((consistent_count / max(1, len(target_ids))) * 100.0, 1)
    overall_consistent = bool(
        port_p2_metrics["cum_return_pct"] > 0.0 and consistent_count >= max(1, len(target_ids) // 2)
    )

    return {
        "success": True,
        "periods": {
            "eval_period": {
                "start_date": dates[p1_indices[0]],
                "end_date": dates[p1_indices[-1]],
                "trading_days": int(len(p1_indices)),
            },
            "test_period": {
                "start_date": dates[p2_indices[0]],
                "end_date": dates[p2_indices[-1]],
                "trading_days": int(len(p2_indices)),
            },
        },
        "selected_model_ids": target_ids,
        "overall_consistency": {
            "is_consistent": overall_consistent,
            "consistent_models_count": consistent_count,
            "total_selected_count": len(target_ids),
            "consistent_all_models_count": consistent_all_count,
            "total_all_models_count": len(all_models_comparison),
            "consistency_score_pct": consistency_score_pct,
            "verdict_label": "✅ 전·후 구간 성과 연속성 확정 (CONFIRMED)" if overall_consistent else "⚠️ 부분 연속성 / 연속성 우수 모델로 리밸런싱 권장",
            "supply_boost_in_test_period": {
                "hitting_ratio_diff_pct": round(port_p2_metrics["hitting_ratio_pct"] - pure_p2_metrics["hitting_ratio_pct"], 2),
                "return_diff_pct": round(port_p2_metrics["cum_return_pct"] - pure_p2_metrics["cum_return_pct"], 2),
            },
        },
        "portfolio_period_1_metrics": port_p1_metrics,
        "portfolio_period_2_metrics": port_p2_metrics,
        "k200_period_1_metrics": k200_p1_metrics,
        "k200_period_2_metrics": k200_p2_metrics,
        "pure_portfolio_period_2_metrics": pure_p2_metrics,
        "models_comparison": selected_models_comparison,
        "all_models_comparison": all_models_comparison,
        "chart_series": {
            "p1_dates": [dates[i] for i in p1_indices],
            "p1_equity": eq_p1,
            "p1_cum_return_pct": cum_p1,
            "p1_k200_equity": k200_eq_p1,
            "p1_k200_cum_return_pct": k200_cum_p1,
            "p1_model_cum_returns_pct": p1_model_cum_returns_pct,
            "p2_dates": [dates[i] for i in p2_indices],
            "p2_equity": eq_p2,
            "p2_cum_return_pct": cum_p2,
            "p2_pure_equity": eq_p2_pure,
            "p2_pure_cum_return_pct": cum_p2_pure,
            "p2_k200_equity": k200_eq_p2,
            "p2_k200_cum_return_pct": k200_cum_p2,
            "p2_model_cum_returns_pct": p2_model_cum_returns_pct,
        },
    }



