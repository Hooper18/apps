"""解析 Google Flights 结果行的 aria-label（hl=en 锁定英文格式）。

真实样例：
    "From 4947 Chinese yuan. 1 stop flight with Emirates. Leaves Hangzhou
    International Airport at 12:10 AM on Tuesday, September 8 and arrives at
    Leonardo da Vinci International Airport at 1:25 PM on Tuesday, September 8.
    Total duration 19 hr 15 min.  Layover (1 of 1) is a 4 hr 40 min layover at
    Dubai International Airport in Dubai. Select flight"
"""

import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta

MONTHS = {
    "January": 1, "February": 2, "March": 3, "April": 4,
    "May": 5, "June": 6, "July": 7, "August": 8,
    "September": 9, "October": 10, "November": 11, "December": 12,
}

_PRICE_RE = re.compile(r"(?:From )?([\d,]+) Chinese yuan")
_STOPS_RE = re.compile(r"(?:(Nonstop)|(\d+) stops?) flight with (.+?)\.\s*Leaves")
_LEAVES_RE = re.compile(
    r"Leaves .+? at (\d{1,2}:\d{2} [AP]M) on \w+, (\w+) (\d{1,2})"
)
_ARRIVES_RE = re.compile(
    r"arrives at .+? at (\d{1,2}:\d{2} [AP]M) on \w+, (\w+) (\d{1,2})"
)
_DURATION_RE = re.compile(r"Total duration (?:(\d+) hr)?\s*(?:(\d+) min)?")


@dataclass(frozen=True)
class AriaQuote:
    price: int
    stops: int
    airlines: str
    dep_dt: datetime
    arr_dt: datetime
    duration_min: int


def _normalize(text: str) -> str:
    # aria 里混有 nbsp / 窄不换行空格，全部归一成普通空格
    return re.sub('[\\u00a0\\u202f\\u2009]', ' ', text)


def _clock(clock: str) -> tuple[int, int]:
    hm, ampm = clock.split(" ")
    hour, minute = (int(x) for x in hm.split(":"))
    if ampm == "PM" and hour != 12:
        hour += 12
    if ampm == "AM" and hour == 12:
        hour = 0
    return hour, minute


def _nearest_date(month: int, day: int, anchor: date) -> date | None:
    """aria 只给月/日，年份取离 anchor 最近的候选（处理跨年）。

    2 月 29 日只在闰年合法：逐候选构造，非法年份跳过而不是崩溃；
    三个候选都非法（现实中不会发生）返回 None，由调用方跳过该行。
    """
    candidates = []
    for year in (anchor.year - 1, anchor.year, anchor.year + 1):
        try:
            candidates.append(date(year, month, day))
        except ValueError:
            continue
    if not candidates:
        return None
    return min(candidates, key=lambda d: abs((d - anchor).days))


def parse_aria(aria: str, query_date: str) -> AriaQuote | None:
    """解析一条结果行。解析不出关键字段返回 None（调用方跳过该行）。"""
    text = _normalize(aria or "")
    price_m = _PRICE_RE.search(text)
    stops_m = _STOPS_RE.search(text)
    leaves_m = _LEAVES_RE.search(text)
    arrives_m = _ARRIVES_RE.search(text)
    if not (price_m and stops_m and leaves_m and arrives_m):
        return None

    anchor = date.fromisoformat(query_date)

    def build_dt(m: re.Match[str]) -> datetime | None:
        clock, month_name, day = m.group(1), m.group(2), int(m.group(3))
        month = MONTHS.get(month_name)
        if month is None:
            return None
        hour, minute = _clock(clock)
        d = _nearest_date(month, day, anchor)
        if d is None:
            return None
        return datetime(d.year, d.month, d.day, hour, minute)

    dep_dt = build_dt(leaves_m)
    arr_dt = build_dt(arrives_m)
    if dep_dt is None or arr_dt is None:
        return None
    # 注意：不做 arr<dep 的“跨年修正”——跨年由 _nearest_date 按锚点正确解析，
    # 而西行跨时区航班到达当地时间早于起飞当地时间是合法现实（如 PVG→LAX 同日早到）。

    stops = 0 if stops_m.group(1) else int(stops_m.group(2))

    dur_m = _DURATION_RE.search(text)
    hours = int(dur_m.group(1)) if dur_m and dur_m.group(1) else 0
    minutes = int(dur_m.group(2)) if dur_m and dur_m.group(2) else 0
    duration_min = hours * 60 + minutes
    if duration_min == 0:
        duration_min = int((arr_dt - dep_dt) / timedelta(minutes=1))

    return AriaQuote(
        price=int(price_m.group(1).replace(",", "")),
        stops=stops,
        airlines=stops_m.group(3).strip(),
        dep_dt=dep_dt,
        arr_dt=arr_dt,
        duration_min=duration_min,
    )
