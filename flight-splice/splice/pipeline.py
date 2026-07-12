"""两段自拼组合的纯逻辑：组合、转机时间过滤、排序、风险标注。

自拼票价可加（每段独立客票），因此「最低总价」只是逐枢纽求
min(leg1) × min(leg2) 满足转机约束的组合，没有联程运价的历史依赖问题。
"""

from dataclasses import dataclass

from .hubs import Hub, VisaCat
from .quotes import Quote

VISA_NOTES = {
    VisaCat.SCHENGEN: "申根签（去冰岛本就需要，顺路无额外成本）",
    VisaCat.VISA_FREE: "对中国护照免签入境",
    VisaCat.UK: "需额外办英国签证",
    VisaCat.OTHER_VISA: "需额外办第三国签证",
}


@dataclass(frozen=True)
class SpliceOption:
    """一条可行的两段自拼方案。"""

    hub: Hub
    leg1: Quote
    leg2: Quote
    total_price: int
    connect_hours: float
    overnight: bool
    visa_note: str


def build_splices(
    legs_by_hub: dict[Hub, tuple[list[Quote], list[Quote]]],
    *,
    min_connect_h: float = 5.0,
    max_connect_h: float = 48.0,
    top_per_hub: int = 3,
) -> list[SpliceOption]:
    """对每个枢纽组合两段报价，按硬约束过滤后全局按总价排序。

    min_connect_h：自拼要出关、取行李、重新值机，且误机无保护，
    默认 5 小时是行业内自拼的稳妥下限。
    max_connect_h：超过就不是「转机」而是「停留」，默认 48 小时。
    """
    options: list[SpliceOption] = []
    for hub, (leg1_quotes, leg2_quotes) in legs_by_hub.items():
        hub_options: list[SpliceOption] = []
        for q1 in leg1_quotes:
            for q2 in leg2_quotes:
                connect_h = (q2.dep_dt - q1.arr_dt).total_seconds() / 3600
                if not (min_connect_h <= connect_h <= max_connect_h):
                    continue
                hub_options.append(
                    SpliceOption(
                        hub=hub,
                        leg1=q1,
                        leg2=q2,
                        total_price=q1.price + q2.price,
                        connect_hours=round(connect_h, 2),
                        overnight=q2.dep_dt.date() > q1.arr_dt.date(),
                        visa_note=VISA_NOTES[hub.visa],
                    )
                )
        hub_options.sort(key=lambda o: o.total_price)
        # 同一 (段1日期, 段2日期) 组合只留最便宜代表，避免同价多班刷屏
        seen_date_pairs: set[tuple] = set()
        kept: list[SpliceOption] = []
        for opt in hub_options:
            key = (opt.leg1.dep_dt.date(), opt.leg2.dep_dt.date())
            if key in seen_date_pairs:
                continue
            seen_date_pairs.add(key)
            kept.append(opt)
            if len(kept) >= top_per_hub:
                break
        options.extend(kept)
    options.sort(key=lambda o: o.total_price)
    return options


def pick_direct_baseline(quotes: list[Quote]) -> Quote | None:
    """时间窗内直搜（单一客票）最低价，作为对照基准。"""
    if not quotes:
        return None
    return min(quotes, key=lambda q: q.price)
