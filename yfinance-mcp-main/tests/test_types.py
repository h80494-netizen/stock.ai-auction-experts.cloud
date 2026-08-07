from typing import get_args

from yfinance.const import SECTOR_INDUSTY_MAPPING

from yfmcp.types import Sector


def test_sector() -> None:
    for sector in SECTOR_INDUSTY_MAPPING:
        assert sector in get_args(Sector)

    for arg in get_args(Sector):
        assert arg in SECTOR_INDUSTY_MAPPING
