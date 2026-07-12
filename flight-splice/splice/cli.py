"""flight-splice CLI：A→B 时间窗内自拼中转最低价搜索。

三阶段控制请求量：
  0. 直搜基准：窗口内每天 origin→dest（单一客票对照）
  1. 枢纽海选：窗口中点日期，每个枢纽查 2 段，按两段最低价之和排序
  2. 入围精查：Top-K 枢纽拉全窗口两段矩阵，组合过滤排序

用法示例：
  python -m splice.cli --from HGH --to KEF --start 2026-09-07 --days 7
"""

import argparse
import math
import sys
from datetime import date, timedelta
from pathlib import Path

from .gflights import GoogleFlightsClient
from .hubs import HUBS, Hub, VisaCat
from .pipeline import build_splices, pick_direct_baseline
from .quotes import Quote
from .report import render_report

DEFAULT_VISA_ALLOWED = {VisaCat.SCHENGEN, VisaCat.VISA_FREE}


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="自拼中转最低价路线搜索")
    p.add_argument("--from", dest="origin", default="HGH", help="出发机场码")
    p.add_argument("--to", dest="dest", default="KEF", help="到达机场码")
    p.add_argument(
        "--start",
        default=(date.today() + timedelta(days=60)).isoformat(),
        help="出发窗口首日（默认 60 天后）",
    )
    p.add_argument("--days", type=int, default=7, help="出发窗口天数")
    p.add_argument("--min-connect", type=float, default=5.0, help="最小衔接小时数")
    p.add_argument("--max-connect", type=float, default=48.0, help="最大衔接小时数")
    p.add_argument("--shortlist", type=int, default=6, help="入围精查的枢纽数")
    p.add_argument("--top", type=int, default=10, help="报告展示方案数")
    p.add_argument(
        "--all-visa",
        action="store_true",
        help="纳入需额外签证的枢纽（英国/土耳其等），默认只搜申根+免签",
    )
    p.add_argument("--cache-ttl", type=float, default=20.0, help="缓存有效小时数")
    p.add_argument("--headed", action="store_true", help="有头模式（调试用）")
    args = p.parse_args(argv)

    if args.days < 1:
        p.error("--days 必须 >= 1")
    try:
        date.fromisoformat(args.start)
    except ValueError:
        p.error(f"--start 不是合法日期: {args.start}")
    if args.min_connect < 0:
        p.error("--min-connect 不能为负")
    if args.max_connect <= args.min_connect:
        p.error("--max-connect 必须大于 --min-connect")
    if args.shortlist < 1 or args.top < 1:
        p.error("--shortlist 和 --top 必须 >= 1")
    return args


def window_dates(start: str, days: int) -> list[str]:
    d0 = date.fromisoformat(start)
    return [(d0 + timedelta(days=i)).isoformat() for i in range(days)]


def leg2_extra_days(max_connect_h: float) -> int:
    """段2 抓取窗口在段1 窗口之后要多抓几天。

    段1 可能次日到达（+1 天），到达后最多等 max_connect 小时（+ceil(h/24) 天）。
    48h 默认值 → +3 天。"""
    return math.ceil(max_connect_h / 24) + 1


def main(argv: list[str] | None = None) -> int:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:  # noqa: BLE001 - 非交互环境可能不支持
        pass
    args = parse_args(argv)

    dates = window_dates(args.start, args.days)
    # 段2 窗口按 --max-connect 推导：次日到达 + 最长衔接等待
    leg2_dates = window_dates(args.start, args.days + leg2_extra_days(args.max_connect))
    hubs = [
        h
        for h in HUBS
        if args.all_visa or h.visa in DEFAULT_VISA_ALLOWED
    ]

    est = args.days + 2 * len(hubs) + args.shortlist * (args.days + len(leg2_dates))
    print(f"出发窗口 {dates[0]} ~ {dates[-1]}，候选枢纽 {len(hubs)} 个")
    print(f"预计最多 {est} 次实时查询（缓存命中会减少），开始…\n")

    with GoogleFlightsClient(
        cache_dir=Path(__file__).resolve().parent.parent / "cache" / "gflights",
        cache_ttl_hours=args.cache_ttl,
        headless=not args.headed,
    ) as client:
        # 阶段 0：直搜基准
        print(f"[0/3] 直搜基准 {args.origin}→{args.dest}（{args.days} 天）")
        direct_quotes: list[Quote] = []
        for d in dates:
            quotes = client.fetch(args.origin, args.dest, d)
            best = min((q.price for q in quotes), default=None)
            print(f"    {d}: {'¥{:,}'.format(best) if best else '无结果'}")
            direct_quotes.extend(quotes)
        baseline = pick_direct_baseline(direct_quotes)

        # 阶段 1：枢纽海选（窗口中点）
        mid = dates[len(dates) // 2]
        mid_next = (date.fromisoformat(mid) + timedelta(days=1)).isoformat()
        print(f"\n[1/3] 枢纽海选（{mid} 出发 / {mid_next} 续段）")
        scores: list[tuple[int, Hub]] = []
        for hub in hubs:
            leg1 = client.fetch(args.origin, hub.code, mid)
            leg2 = client.fetch(hub.code, args.dest, mid_next)
            p1 = min((q.price for q in leg1), default=None)
            p2 = min((q.price for q in leg2), default=None)
            if p1 is None or p2 is None:
                failed = set(client.failed_queries)
                miss = "段1" if p1 is None else "段2"
                key = (
                    (args.origin, hub.code, mid)
                    if p1 is None
                    else (hub.code, args.dest, mid_next)
                )
                reason = "查询失败（未缓存，重跑自愈）" if key in failed else "无结果"
                print(f"    {hub.city}({hub.code}): {miss}{reason}，跳过")
                continue
            scores.append((p1 + p2, hub))
            print(f"    {hub.city}({hub.code}): ¥{p1:,} + ¥{p2:,} = ¥{p1 + p2:,}")
        scores.sort(key=lambda t: t[0])
        shortlist = [hub for _, hub in scores[: args.shortlist]]
        print(f"    入围: {', '.join(f'{h.city}({h.code})' for h in shortlist)}")

        # 阶段 2：入围枢纽全窗口精查
        print(f"\n[2/3] 入围枢纽全窗口精查（{len(shortlist)} 个枢纽）")
        legs_by_hub: dict[Hub, tuple[list[Quote], list[Quote]]] = {}
        for hub in shortlist:
            leg1_all: list[Quote] = []
            leg2_all: list[Quote] = []
            for d in dates:
                leg1_all.extend(client.fetch(args.origin, hub.code, d))
            for d in leg2_dates:
                leg2_all.extend(client.fetch(hub.code, args.dest, d))
            legs_by_hub[hub] = (leg1_all, leg2_all)
            print(f"    {hub.city}({hub.code}): 段1 {len(leg1_all)} 条 / 段2 {len(leg2_all)} 条")

        # 阶段 3：组合 + 报告
        print("\n[3/3] 组合过滤排序")
        options = build_splices(
            legs_by_hub,
            min_connect_h=args.min_connect,
            max_connect_h=args.max_connect,
        )
        report = render_report(
            origin=args.origin,
            dest=args.dest,
            window_start=dates[0],
            window_end=dates[-1],
            baseline=baseline,
            options=options,
            top=args.top,
            live_fetches=client.live_fetches,
            cache_hits=client.cache_hits,
            failed_queries=client.failed_queries,
        )

    print("\n" + report)
    results_dir = Path(__file__).resolve().parent.parent / "results"
    results_dir.mkdir(exist_ok=True)
    out = results_dir / f"{args.origin}-{args.dest}-{dates[0]}.md"
    out.write_text(report, encoding="utf-8")
    print(f"\n报告已存 {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
