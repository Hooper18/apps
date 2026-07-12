"""报价数据模型。"""

from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class Quote:
    """一段行程（一张独立客票）的报价。"""

    origin: str
    dest: str
    price: int
    currency: str
    airlines: str
    stops: int
    dep_dt: datetime
    arr_dt: datetime
    duration_min: int
    source: str
