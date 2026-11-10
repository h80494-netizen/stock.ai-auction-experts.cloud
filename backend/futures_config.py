import json
import os
from typing import Any, Dict, List

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_CONFIG_PATH = os.environ.get(
    "FUTURES_SIM_CONFIG_PATH",
    os.path.join(_BASE_DIR, "config", "futures_simulation_config.json"),
)

_ENV_OVERRIDES = {
    "FUTURES_DEFAULT_MULTIPLIER": ("trading_rules", "default_multiplier", int),
    "FUTURES_CONTRACT_MULTIPLIER_KRW": ("market_parameters", "contract_multiplier_krw", float),
    "FUTURES_BROKERAGE_FEE_RATE": ("market_parameters", "brokerage_fee_rate", float),
    "FUTURES_SLIPPAGE_POINTS": ("market_parameters", "slippage_points", float),
    "FUTURES_RISK_FREE_RATE": ("market_parameters", "risk_free_rate_annual", float),
    "FUTURES_DEFAULT_MDD_THRESHOLD": ("model_replacement_rules", "default_mdd_threshold_pct", float),
}


def load_simulation_config() -> Dict[str, Any]:
    """동적 설정 레지스트리(JSON 및 환경변수)에서 선물 시뮬레이션 설정 및 세율·수수료 파라미터를 로드합니다."""
    cfg: Dict[str, Any] = {}
    if os.path.exists(_CONFIG_PATH):
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            loaded = json.load(f)
            if isinstance(loaded, dict):
                cfg = loaded

    for env_key, (section, field, cast_fn) in _ENV_OVERRIDES.items():
        val = os.environ.get(env_key)
        if val is not None and val != "":
            try:
                cfg.setdefault(section, {})[field] = cast_fn(val)
            except ValueError:
                pass

    return cfg


def save_simulation_config(cfg: Dict[str, Any]) -> None:
    """변경된 모델 풀(10대 모델, 후보 모델, 아카이브 보관 모델 등) 설정을 동적 레지스트리에 저장합니다."""
    os.makedirs(os.path.dirname(_CONFIG_PATH), exist_ok=True)
    with open(_CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)


def get_active_pool() -> List[Dict[str, Any]]:
    cfg = load_simulation_config()
    return cfg.get("active_model_pool", [])


def get_candidate_pool() -> List[Dict[str, Any]]:
    cfg = load_simulation_config()
    return cfg.get("candidate_models", [])


def get_archived_models() -> List[Dict[str, Any]]:
    cfg = load_simulation_config()
    return cfg.get("archived_models", [])

