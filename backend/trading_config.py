import json
import os
from typing import Any, Dict

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "data", "trading_config.json")

_ENV_MAP = {
    "max_total_capital": ("TRADING_MAX_TOTAL_CAPITAL", float),
    "max_stocks": ("TRADING_MAX_STOCKS", int),
    "max_per_stock_capital": ("TRADING_MAX_PER_STOCK_CAPITAL", float),
    "brokerage_fee_rate": ("TRADING_BROKERAGE_FEE_RATE", float),
    "securities_transaction_tax_rate": ("TRADING_SECURITIES_TAX_RATE", float),
    "initial_buy_window_sec": ("TRADING_INITIAL_BUY_WINDOW_SEC", int),
}


def get_trading_config() -> Dict[str, Any]:
    """동적 설정 레지스트리(JSON 및 환경변수)에서 매매 한도 및 수수료·세율 파라미터를 로드합니다."""
    cfg: Dict[str, Any] = {}
    if os.path.exists(_CONFIG_PATH):
        try:
            with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    cfg.update(loaded)
        except Exception as e:
            print(f"[TradingConfig] 설정 파일 로드 오류: {e}")

    for key, (env_name, cast_fn) in _ENV_MAP.items():
        env_val = os.environ.get(env_name)
        if env_val is not None and env_val != "":
            try:
                cfg[key] = cast_fn(env_val)
            except ValueError:
                pass

    max_total = float(cfg.get("max_total_capital", 100_000_000.0))
    max_stocks = int(cfg.get("max_stocks", 20))
    max_per_stock = float(
        cfg.get("max_per_stock_capital", max_total / max_stocks if max_stocks > 0 else max_total)
    )

    cfg["max_total_capital"] = max_total
    cfg["max_stocks"] = max_stocks
    cfg["max_per_stock_capital"] = max_per_stock
    cfg["brokerage_fee_rate"] = float(cfg.get("brokerage_fee_rate", 0.00015))
    cfg["securities_transaction_tax_rate"] = float(cfg.get("securities_transaction_tax_rate", 0.0020))
    cfg["initial_buy_window_sec"] = int(cfg.get("initial_buy_window_sec", 180))
    return cfg


def calculate_settlement_metrics(total_buy: float, total_sell: float) -> Dict[str, float]:
    """동적 설정 레지스트리의 수수료율·증권거래세율을 참조하여 정산 지표를 산출합니다."""
    cfg = get_trading_config()
    fee_rate = cfg["brokerage_fee_rate"]
    tax_rate = cfg["securities_transaction_tax_rate"]

    fees = (total_buy + total_sell) * fee_rate
    tax = total_sell * tax_rate
    net_pnl = total_sell - total_buy - fees - tax
    return_rate = (net_pnl / total_buy) * 100.0 if total_buy > 0 else 0.0
    return {
        "fees": fees,
        "tax": tax,
        "net_pnl": net_pnl,
        "return_rate": return_rate,
    }
