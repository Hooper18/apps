"""中文结果报告渲染。"""

from datetime import datetime

from .pipeline import SpliceOption
from .quotes import Quote


def _fmt_duration(minutes: int) -> str:
    h, m = divmod(minutes, 60)
    return f"{h}h{m:02d}m" if h else f"{m}m"


def _fmt_leg(q: Quote) -> str:
    stops = "直飞" if q.stops == 0 else f"{q.stops} 停"
    return (
        f"{q.dep_dt.strftime('%m-%d %H:%M')} → {q.arr_dt.strftime('%m-%d %H:%M')}  "
        f"{q.origin}→{q.dest}  ¥{q.price:,}  {q.airlines}（{stops}，"
        f"{_fmt_duration(q.duration_min)}）"
    )


def render_report(
    *,
    origin: str,
    dest: str,
    window_start: str,
    window_end: str,
    baseline: Quote | None,
    options: list[SpliceOption],
    top: int = 10,
    live_fetches: int = 0,
    cache_hits: int = 0,
    failed_queries: list[tuple[str, str, str]] | None = None,
) -> str:
    lines: list[str] = []
    lines.append(f"══════ {origin} → {dest} 自拼中转最低价搜索 ══════")
    lines.append(
        f"出发窗口 {window_start} ~ {window_end}（一周内出发，不限自拼中转）"
    )
    lines.append(
        f"数据源 Google Flights 实时渲染 | 实际请求 {live_fetches} 次 / 缓存命中 {cache_hits} 次"
    )
    lines.append(f"生成时间 {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    lines.append("")

    if baseline is not None:
        stops = "直飞" if baseline.stops == 0 else f"{baseline.stops} 次转机"
        lines.append(
            f"【直搜基准·单一客票】¥{baseline.price:,}  "
            f"{baseline.dep_dt.strftime('%m-%d')} 出发  {baseline.airlines}（{stops}，"
            f"{_fmt_duration(baseline.duration_min)}）"
        )
    else:
        lines.append("【直搜基准·单一客票】时间窗内未找到可用直搜结果")
    lines.append("")

    if not options:
        lines.append("未找到满足转机约束的自拼方案。")
        return "\n".join(lines)

    lines.append(f"【自拼方案 Top {min(top, len(options))}】")
    for i, opt in enumerate(options[:top], start=1):
        if baseline is not None and baseline.price > 0:
            saving = baseline.price - opt.total_price
            pct = round(saving / baseline.price * 100)
            saving_txt = f"（比直搜省 ¥{saving:,} / {pct}%）" if saving > 0 else "（不比直搜便宜）"
        else:
            saving_txt = ""
        overnight_txt = "，含过夜" if opt.overnight else ""
        lines.append(
            f"#{i}  总价 ¥{opt.total_price:,}{saving_txt}  "
            f"经由 {opt.hub.city}({opt.hub.code})"
        )
        lines.append(f"    段1  {_fmt_leg(opt.leg1)}")
        lines.append(f"    衔接  {opt.connect_hours:.1f} 小时{overnight_txt}")
        lines.append(f"    段2  {_fmt_leg(opt.leg2)}")
        lines.append(f"    签证  {opt.visa_note}")
        lines.append("")

    if failed_queries:
        lines.append(f"⚠ 本次运行有 {len(failed_queries)} 条查询失败（未写缓存，重跑可自愈），结果可能不完整：")
        for o, d, day in failed_queries[:10]:
            lines.append(f"    {o}→{d} {day}")
        if len(failed_queries) > 10:
            lines.append(f"    …另 {len(failed_queries) - 10} 条")
        lines.append("")

    lines.append("──── 风险提示（自拼 = 每段独立客票）────")
    lines.append("· 前段延误导致误机时，后段航司无改签义务，票款自担；衔接时间宁长勿短")
    lines.append("· 行李需在中转地提取后重新托运，轻装（仅手提）可显著降低风险")
    lines.append("· 自拼必须入境中转国，务必确认签证；上表已按枢纽标注")
    lines.append("· 价格为查询时点 Google Flights 报价，出票前请以航司/OTA 实时价为准")
    return "\n".join(lines)
