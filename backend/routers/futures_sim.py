import datetime
import os
import sqlite3
import sys
import threading
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND_DIR not in sys.path:
    sys.path.append(_BACKEND_DIR)

from futures_config import (
    get_active_pool,
    get_archived_models,
    get_candidate_pool,
    load_simulation_config,
)
from futures_simulator import (
    DB_PATH,
    compute_indicator_group_diagnostics,
    evaluate_period_consistency_and_rotate_pool,
    get_intraday_and_1530_lock_status,
    invalidate_sim_cache,
    load_daily_dataframe,
    lock_1530_daily_signals,
    run_futures_simulation,
    test_selected_models_consistency,
    update_selected_models_in_pool,
)

router = APIRouter(prefix="/api/futures-sim", tags=["KOSPI200 Futures Simulation"])


class SimulationRunRequest(BaseModel):
    start_date: Optional[str] = "2023-01-01"
    end_date: Optional[str] = "CURRENT"
    multiplier: int = 1
    point_value_krw: float = 50000.0
    initial_capital_krw: float = 100000000.0
    mdd_threshold_pct: float = 12.0
    sharpe_lookback_days: Optional[int] = 126
    initial_selected_ids: Optional[List[str]] = None
    enable_auto_mdd_swap: bool = True
    record_swaps_to_db: bool = False
    combine_supply: bool = True
    supply_weight: float = 0.35
    replacement_mode: str = "HYBRID"
    periodic_rebalance_days: int = 63
    mdd_trigger_mode: str = "RENEWAL_OR_LIMIT"


class SelectModelsRequest(BaseModel):
    selected_model_ids: List[str]


class CustomConsistencyTestRequest(BaseModel):
    eval_start_date: str
    eval_end_date: str
    test_start_date: str
    test_end_date: Optional[str] = "CURRENT"
    selected_model_ids: Optional[List[str]] = None
    combine_supply: bool = True
    supply_weight: float = 0.35
    multiplier: int = 1
    point_value_krw: float = 50000.0
    initial_capital_krw: float = 100000000.0
    apply_to_active: bool = False


class ConsistencyEvaluationRequest(BaseModel):
    anchor_date: str
    period_months: int = 3
    candidate_model_id: Optional[str] = None
    auto_apply_pool_rotation: bool = False


class Lock1530Request(BaseModel):
    multiplier: int = 1
    point_value_krw: float = 50000.0
    initial_capital_krw: float = 100000000.0
    mdd_threshold_pct: float = 12.0
    sync_live_first: bool = True
    update_excel: bool = True


class RealtimeSyncRequest(BaseModel):
    write_excel: bool = True
    multiplier: int = 1
    point_value_krw: float = 50000.0
    initial_capital_krw: float = 100000000.0


class KISConfigUpdateRequest(BaseModel):
    mode: Optional[str] = None
    cano: Optional[str] = None
    acnt_prdt_cd: Optional[str] = None
    max_contracts_cap: Optional[int] = None
    auto_execute_at_1535: Optional[bool] = None
    default_ord_dvsn: Optional[str] = None
    point_value_krw: Optional[int] = None


class KISOrderExecuteRequest(BaseModel):
    order_delta_contracts: int
    prev_contracts: int = 0
    target_contracts: int = 0
    ord_dvsn: Optional[str] = "02"
    limit_price: float = 0.0
    reason: Optional[str] = "Step 5 수동/동시호가 주문 실행"


@router.get("/data-status")
def api_get_data_status() -> Dict[str, Any]:
    """기초데이터(rawdata.xlsx 및 futures_simulation.db) 최신 적재 상태를 반환합니다."""
    try:
        if not os.path.exists(DB_PATH):
            return {
                "success": False,
                "error_code": "DB_NOT_FOUND",
                "message": "선물 시뮬레이션 기초데이터 DB가 존재하지 않습니다. 데이터 업데이트를 먼저 실행해주세요.",
            }
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT COUNT(*), MIN(date), MAX(date) FROM futures_daily_data")
        row = c.fetchone()
        c.execute("SELECT date, k200_close, fut_close, fut_foreign_net, program_arb_net, open_interest, up_down_diff, new_high_low_diff FROM futures_daily_data ORDER BY date DESC LIMIT 5")
        recent_rows = [
            {
                "date": r[0],
                "k200_close": r[1],
                "fut_close": r[2],
                "fut_foreign_net": r[3],
                "program_arb_net": r[4],
                "open_interest": r[5],
                "up_down_diff": r[6],
                "new_high_low_diff": r[7],
            }
            for r in c.fetchall()
        ]
        conn.close()
        return {
            "success": True,
            "data": {
                "total_trading_days": row[0] if row else 0,
                "start_date": row[1] if row else None,
                "end_date": row[2] if row else None,
                "latest_records": recent_rows,
            },
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": "DATA_STATUS_ERROR",
            "message": f"기초데이터 상태 조회 중 오류가 발생했습니다: {str(e)}",
        }


@router.post("/update-data")
def api_trigger_data_update() -> Dict[str, Any]:
    """rawdata.xlsx 및 futures_simulation.db를 최신 영업일까지 업데이트합니다."""
    try:
        scripts_dir = os.path.join(os.path.dirname(_BACKEND_DIR), "scripts")
        if scripts_dir not in sys.path:
            sys.path.append(scripts_dir)
        from update_rawdata import update_rawdata_excel_and_db

        summary = update_rawdata_excel_and_db()
        invalidate_sim_cache()
        return {"success": True, "data": summary}
    except Exception as e:
        return {
            "success": False,
            "error_code": "DATA_UPDATE_FAILED",
            "message": f"기초데이터 업데이트 중 오류가 발생했습니다: {str(e)}",
        }


@router.get("/models")
def api_get_models_registry() -> Dict[str, Any]:
    """10대 운영 모델(선택된 5개 + 대기 5개), 후보 모델, 제외되어 보관된(Archived) 모델 목록을 반환합니다."""
    try:
        cfg = load_simulation_config()
        return {
            "success": True,
            "data": {
                "trading_rules": cfg.get("trading_rules", {}),
                "active_10_pool": get_active_pool(),
                "candidate_models": get_candidate_pool(),
                "archived_models": get_archived_models(),
            },
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": "MODELS_FETCH_ERROR",
            "message": f"모델 레지스트리 조회 중 오류가 발생했습니다: {str(e)}",
        }


@router.get("/run")
def api_run_simulation_get(
    start_date: Optional[str] = "2023-01-01",
    end_date: Optional[str] = "CURRENT",
    multiplier: int = 1,
    point_value_krw: float = 50000.0,
    initial_capital_krw: float = 100000000.0,
    mdd_threshold_pct: float = 12.0,
    sharpe_lookback_days: int = 126,
    enable_auto_mdd_swap: bool = True,
    combine_supply: bool = True,
    supply_weight: float = 0.35,
) -> Dict[str, Any]:
    return api_run_simulation(
        SimulationRunRequest(
            start_date=start_date,
            end_date=end_date,
            multiplier=multiplier,
            point_value_krw=point_value_krw,
            initial_capital_krw=initial_capital_krw,
            mdd_threshold_pct=mdd_threshold_pct,
            sharpe_lookback_days=sharpe_lookback_days,
            enable_auto_mdd_swap=enable_auto_mdd_swap,
            combine_supply=combine_supply,
            supply_weight=supply_weight,
        )
    )


@router.post("/run")
def api_run_simulation(req: SimulationRunRequest) -> Dict[str, Any]:
    """
    10개 모델 중 선택된 모델들의 합산 포지션(-5~+5 * 멀티플),
    추세·역추세 4대 수급(외국인순매수, 프로그램차익 추세, 미결제약정, PCR) 합산,
    15:35~15:45 종가 동시호가 매매, MDD 초과 시 자동 교체 시뮬레이션을 실행합니다.
    """
    try:
        res = run_futures_simulation(
            start_date=req.start_date,
            end_date=req.end_date,
            multiplier=req.multiplier,
            mdd_threshold_pct=req.mdd_threshold_pct,
            sharpe_lookback_days=req.sharpe_lookback_days,
            initial_selected_ids=req.initial_selected_ids,
            enable_auto_mdd_swap=req.enable_auto_mdd_swap,
            record_swaps_to_db=req.record_swaps_to_db,
            combine_supply=req.combine_supply,
            supply_weight=req.supply_weight,
            replacement_mode=req.replacement_mode,
            periodic_rebalance_days=req.periodic_rebalance_days,
            mdd_trigger_mode=req.mdd_trigger_mode,
            point_value_krw=req.point_value_krw,
            initial_capital_krw=req.initial_capital_krw,
        )
        if not res.get("success"):
            return {
                "success": False,
                "error_code": "SIMULATION_EXEC_ERROR",
                "message": res.get("error", "시뮬레이션 실행 실패"),
            }
        return {"success": True, "data": res}
    except Exception as e:
        return {
            "success": False,
            "error_code": "SIMULATION_EXCEPTION",
            "message": f"시뮬레이션 계산 중 오류가 발생했습니다: {str(e)}",
        }


@router.post("/select-models")
def api_select_models(req: SelectModelsRequest) -> Dict[str, Any]:
    """
    Step 2(구간별 모델 수익률 평가)에서 사용자가 선택한 모델들을 최종 운용 모델로 저장합니다.
    """
    try:
        res = update_selected_models_in_pool(req.selected_model_ids)
        if not res.get("success"):
            return {
                "success": False,
                "error_code": "SELECT_MODELS_ERROR",
                "message": res.get("error", "모델 선택 저장 실패"),
            }
        return {"success": True, "data": res}
    except Exception as e:
        return {
            "success": False,
            "error_code": "SELECT_MODELS_EXCEPTION",
            "message": f"최종 모델 저장 중 오류가 발생했습니다: {str(e)}",
        }


@router.post("/test-consistency")
def api_test_custom_consistency(req: CustomConsistencyTestRequest) -> Dict[str, Any]:
    """
    Step 3: 1차 선정 구간(eval_start_date ~ eval_end_date)에서 선택된 최종 모델들로
    그 이후 구간(test_start_date ~ test_end_date 또는 현재까지)을 테스트하고 10대 평가지표 일관성을 측정합니다.
    """
    try:
        res = test_selected_models_consistency(
            eval_start_date=req.eval_start_date,
            eval_end_date=req.eval_end_date,
            test_start_date=req.test_start_date,
            test_end_date=req.test_end_date,
            selected_model_ids=req.selected_model_ids,
            combine_supply=req.combine_supply,
            supply_weight=req.supply_weight,
            multiplier=req.multiplier,
            apply_to_active=req.apply_to_active,
            point_value_krw=req.point_value_krw,
            initial_capital_krw=req.initial_capital_krw,
        )
        if not res.get("success"):
            return {
                "success": False,
                "error_code": "CONSISTENCY_TEST_ERROR",
                "message": res.get("error", "후속 구간 일관성 테스트 실패"),
            }
        return {"success": True, "data": res}
    except Exception as e:
        return {
            "success": False,
            "error_code": "CONSISTENCY_TEST_EXCEPTION",
            "message": f"후속 구간 일관성 테스트 중 오류가 발생했습니다: {str(e)}",
        }


@router.post("/evaluate-consistency")
def api_evaluate_consistency(req: ConsistencyEvaluationRequest) -> Dict[str, Any]:
    """
    특정 일자(anchor_date)와 3개월/6개월 기간을 지정하여 해당 기간 성과를 측정하고,
    그 다음 3개월/6개월 동안 성과의 일관성이 유지되는지 검증한 뒤 확정 시 10대 모델에 편입하고
    성과가 가장 나쁜 모델을 제외하여 따로 보관합니다.
    """
    try:
        res = evaluate_period_consistency_and_rotate_pool(
            anchor_date=req.anchor_date,
            period_months=req.period_months,
            candidate_model_id=req.candidate_model_id,
            auto_apply_pool_rotation=req.auto_apply_pool_rotation,
        )
        if not res.get("success"):
            return {
                "success": False,
                "error_code": "EVALUATION_ERROR",
                "message": res.get("error", "성과 일관성 검증 실패"),
            }
        return {"success": True, "data": res}
    except Exception as e:
        return {
            "success": False,
            "error_code": "EVALUATION_EXCEPTION",
            "message": f"성과 일관성 검증 중 오류가 발생했습니다: {str(e)}",
        }


@router.get("/intraday-status")
def api_get_intraday_status(
    multiplier: int = 1,
    sync_now: bool = False,
    point_value_krw: float = 50000.0,
    initial_capital_krw: float = 100000000.0,
) -> Dict[str, Any]:
    """당일 실시간 연동 상태, rawdata.xlsx 당일 실시간 가격/수급, 장중 포지션 변화 및 15:30 최종 확정(Lock) 시그널을 조회합니다."""
    try:
        res = get_intraday_and_1530_lock_status(
            multiplier=multiplier,
            sync_now=sync_now,
            point_value_krw=point_value_krw,
            initial_capital_krw=initial_capital_krw,
        )
        return {"success": True, "data": res}
    except Exception as e:
        return {
            "success": False,
            "error_code": "INTRADAY_STATUS_ERROR",
            "message": f"당일 실시간 상태 및 15:30 확정 시그널 조회 중 오류가 발생했습니다: {str(e)}",
        }


@router.post("/sync-realtime")
def api_sync_realtime(req: RealtimeSyncRequest) -> Dict[str, Any]:
    """당일 실시간 시장 데이터를 즉시 연동하여 futures_simulation.db 및 rawdata.xlsx 당일 행을 갱신하고 최신 Step 5 포지션 변화 상태를 반환합니다."""
    try:
        scripts_dir = os.path.join(os.path.dirname(_BACKEND_DIR), "scripts")
        if scripts_dir not in sys.path:
            sys.path.append(scripts_dir)
        from update_rawdata import sync_intraday_realtime_tick

        sync_res = sync_intraday_realtime_tick(write_excel=req.write_excel, force_excel=True)
        status_res = get_intraday_and_1530_lock_status(
            multiplier=req.multiplier,
            sync_now=False,
            point_value_krw=req.point_value_krw,
            initial_capital_krw=req.initial_capital_krw,
        )
        return {
            "success": True,
            "data": {
                "sync_result": sync_res,
                "intraday_status": status_res,
            },
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": "REALTIME_SYNC_ERROR",
            "message": f"당일 실시간 데이터 연동 중 오류가 발생했습니다: {str(e)}",
        }


@router.get("/kis-account")
def api_get_kis_futures_account() -> Dict[str, Any]:
    """한투증권(KIS) 선물옵션 모의/실전 계좌 잔고, 보유 포지션 및 주문 실행 내역을 조회합니다."""
    try:
        from kis_futures_trader import inquire_kis_futures_balance

        return {"success": True, "data": inquire_kis_futures_balance()}
    except Exception as e:
        return {
            "success": False,
            "error_code": "KIS_ACCOUNT_ERROR",
            "message": f"KIS 선물옵션 계좌 조회 중 오류가 발생했습니다: {str(e)}",
        }


@router.post("/kis-config")
def api_update_kis_futures_config(req: KISConfigUpdateRequest) -> Dict[str, Any]:
    """한투증권(KIS) 선물옵션 모의(PAPER)/실전(LIVE) 모드, 계좌번호, 상품코드(03), 자동주문 옵션을 저장합니다."""
    try:
        from kis_futures_trader import inquire_kis_futures_balance, update_kis_futures_trading_config

        updates = {k: v for k, v in req.dict().items() if v is not None}
        update_kis_futures_trading_config(updates)
        return {"success": True, "data": inquire_kis_futures_balance()}
    except Exception as e:
        return {
            "success": False,
            "error_code": "KIS_CONFIG_ERROR",
            "message": f"KIS 선물옵션 설정 저장 중 오류가 발생했습니다: {str(e)}",
        }


@router.post("/kis-order")
def api_execute_kis_futures_order(req: KISOrderExecuteRequest) -> Dict[str, Any]:
    """한투증권(KIS) 선물옵션 모의(VTFO0011U)/실전(TTFO0011U) 주문을 실행합니다."""
    try:
        from kis_futures_trader import execute_kis_futures_order, inquire_kis_futures_balance

        order_res = execute_kis_futures_order(
            order_delta_contracts=req.order_delta_contracts,
            prev_contracts=req.prev_contracts,
            target_contracts=req.target_contracts,
            ord_dvsn=req.ord_dvsn,
            limit_price=req.limit_price,
            reason=req.reason or "Step 5 수동/동시호가 주문 실행",
        )
        if not order_res.get("success"):
            return {
                "success": False,
                "error_code": "KIS_ORDER_REJECTED",
                "message": order_res.get("error", "선물 주문 실패"),
            }
        return {
            "success": True,
            "data": {
                "order_result": order_res,
                "account_status": inquire_kis_futures_balance(),
            },
        }
    except Exception as e:
        return {
            "success": False,
            "error_code": "KIS_ORDER_EXCEPTION",
            "message": f"KIS 선물옵션 주문 실행 중 오류가 발생했습니다: {str(e)}",
        }


@router.post("/lock-1530")
def api_lock_1530_signals(req: Lock1530Request) -> Dict[str, Any]:
    """
    15:30 시점의 실시간 데이터를 기준으로 10대 모델 시그널과 선택된 5개 모델 합산 포지션 및
    15:35~15:45 동시호가 매매 수량(Delta)을 최종 확정(Lock)합니다.
    """
    try:
        res = lock_1530_daily_signals(
            multiplier=req.multiplier,
            mdd_threshold_pct=req.mdd_threshold_pct,
            sync_live_first=req.sync_live_first,
            update_excel=req.update_excel,
            point_value_krw=req.point_value_krw,
            initial_capital_krw=req.initial_capital_krw,
        )
        if not res.get("success"):
            return {
                "success": False,
                "error_code": "LOCK_1530_FAILED",
                "message": res.get("error", "15:30 시그널 확정 실패"),
            }
        return {"success": True, "data": res}
    except Exception as e:
        return {
            "success": False,
            "error_code": "LOCK_1530_EXCEPTION",
            "message": f"15:30 매매시그널 확정 중 오류가 발생했습니다: {str(e)}",
        }


@router.get("/indicator-diagnostics")
def api_get_indicator_diagnostics() -> Dict[str, Any]:
    """4대 지표군(① 기술지표, ② 수급지표, ③ 종합지표, ④ 심리지표) 체계적 분류 및 최신 진단 데이터를 반환합니다."""
    try:
        df = load_daily_dataframe(start_date="2023-01-01")
        diag = compute_indicator_group_diagnostics(df)
        return {"success": True, "data": diag}
    except Exception as e:
        return {
            "success": False,
            "error_code": "DIAGNOSTICS_ERROR",
            "message": f"4대 지표군 진단 조회 중 오류가 발생했습니다: {str(e)}",
        }


_BG_WORKER_STARTED = False
_BG_WORKER_LOCK = threading.Lock()


def _realtime_and_daily_background_worker() -> None:
    """
    장중(평일 09:00~15:30 KST) 60초마다 rawdata.xlsx 및 futures_simulation.db에 당일 실시간 가격을 업데이트하고,
    15:30 KOSPI 마감 직후 자동으로 15:30 시그널을 확정(Lock)하며,
    새로운 영업일 데이터를 매일 자동으로 누적 적재하는 백그라운드 데몬 워커.
    """
    scripts_dir = os.path.join(os.path.dirname(_BACKEND_DIR), "scripts")
    if scripts_dir not in sys.path:
        sys.path.append(scripts_dir)

    last_locked_date = ""
    last_eod_synced_date = ""
    startup_synced = False

    while True:
        try:
            from update_rawdata import sync_intraday_realtime_tick

            now_kst = datetime.datetime.utcnow() + datetime.timedelta(hours=9)
            today_str = now_kst.strftime("%Y-%m-%d")
            hhmm = now_kst.hour * 100 + now_kst.minute
            is_weekday = now_kst.weekday() < 5

            if not startup_synced:
                # 서버 기동 시 최신 영업일 데이터를 즉시 동기화하고 기본 시뮬레이션 캐시를 워밍업
                sync_intraday_realtime_tick(write_excel=False)
                invalidate_sim_cache()
                run_futures_simulation(
                    start_date="2023-01-02",
                    end_date="CURRENT",
                    multiplier=1,
                    sharpe_lookback_days=63,
                    enable_auto_mdd_swap=True,
                )
                startup_synced = True

            if is_weekday and 900 <= hhmm <= 1530:
                # 장중(09:00 ~ 15:30) Step 5용 실시간 가격 및 수급을 DB에 고속 업데이트 (전체 시뮬레이션 캐시 유지, 엑셀 재저장으로 인한 GIL 블로킹 방지)
                sync_intraday_realtime_tick(write_excel=False)

            if is_weekday and 1530 <= hhmm <= 1535 and last_locked_date != today_str:
                # 15:30 KOSPI 마감 직후 시그널 자동 확정(Lock)
                cfg = load_simulation_config()
                default_mult = int(cfg.get("trading_rules", {}).get("default_multiplier", 1))
                lock_res = lock_1530_daily_signals(
                    multiplier=default_mult,
                    mdd_threshold_pct=12.0,
                    sync_live_first=True,
                    update_excel=True,
                )
                last_locked_date = today_str
                # 15:35 동시호가 자동주문 옵션이 켜져 있으면 확정된 Delta만큼 자동 주문 집행
                try:
                    from kis_futures_trader import execute_kis_futures_order, get_kis_futures_trading_config

                    k_cfg = get_kis_futures_trading_config()
                    if k_cfg.get("auto_execute_at_1535") and lock_res.get("success"):
                        delta_c = int(lock_res.get("order_delta_contracts", 0))
                        if delta_c != 0:
                            execute_kis_futures_order(
                                order_delta_contracts=delta_c,
                                prev_contracts=int(lock_res.get("prev_contracts", 0)),
                                target_contracts=int(lock_res.get("target_contracts", 0)),
                                ord_dvsn=k_cfg.get("default_ord_dvsn", "02"),
                                reason="15:30 시그널 Lock 직후 동시호가 자동주문 집행",
                            )
                except Exception as auto_ord_err:
                    print(f"[Warn] 15:30 auto order notice: {auto_ord_err}")

            if is_weekday and hhmm >= 1546 and last_eod_synced_date != today_str:
                # 15:45 선물 종가 동시호가 마감 직후 최종 종가 확정 반영
                sync_intraday_realtime_tick(write_excel=True)
                invalidate_sim_cache()
                last_eod_synced_date = today_str

        except Exception:
            pass

        time.sleep(60)


def _ensure_background_worker() -> None:
    global _BG_WORKER_STARTED
    with _BG_WORKER_LOCK:
        if not _BG_WORKER_STARTED:
            t = threading.Thread(target=_realtime_and_daily_background_worker, daemon=True)
            t.start()
            _BG_WORKER_STARTED = True


_ensure_background_worker()



