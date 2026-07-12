"""组合管线纯逻辑测试：两段拼接、转机时间过滤、签证过滤、排序。"""

from datetime import datetime

from splice.hubs import HUBS, Hub, VisaCat
from splice.pipeline import SpliceOption, build_splices, pick_direct_baseline
from splice.quotes import Quote


def mk(origin, dest, dep, arr, price, airlines="Test Air", stops=0):
    return Quote(
        origin=origin,
        dest=dest,
        price=price,
        currency="CNY",
        airlines=airlines,
        stops=stops,
        dep_dt=datetime.fromisoformat(dep),
        arr_dt=datetime.fromisoformat(arr),
        duration_min=int(
            (datetime.fromisoformat(arr) - datetime.fromisoformat(dep)).total_seconds()
            // 60
        ),
        source="test",
    )


ROME = Hub(code="FCO", city="罗马", country="意大利", visa=VisaCat.SCHENGEN)
LONDON = Hub(code="LGW", city="伦敦", country="英国", visa=VisaCat.UK)


def test_basic_splice_combination():
    leg1 = [mk("HGH", "FCO", "2026-09-08T00:10", "2026-09-08T13:25", 2100)]
    leg2 = [mk("FCO", "KEF", "2026-09-09T06:00", "2026-09-09T09:30", 900)]
    opts = build_splices({ROME: (leg1, leg2)}, min_connect_h=5, max_connect_h=48)
    assert len(opts) == 1
    opt = opts[0]
    assert opt.total_price == 3000
    assert opt.hub is ROME
    assert abs(opt.connect_hours - 16.58) < 0.1


def test_min_connect_filters_tight_transfer():
    leg1 = [mk("HGH", "FCO", "2026-09-08T00:10", "2026-09-08T13:25", 2100)]
    # 仅 2 小时衔接：自拼必须拒绝
    leg2 = [mk("FCO", "KEF", "2026-09-08T15:30", "2026-09-08T19:00", 500)]
    assert build_splices({ROME: (leg1, leg2)}, min_connect_h=5, max_connect_h=48) == []


def test_max_connect_filters_week_long_gap():
    leg1 = [mk("HGH", "FCO", "2026-09-08T00:10", "2026-09-08T13:25", 2100)]
    leg2 = [mk("FCO", "KEF", "2026-09-13T06:00", "2026-09-13T09:30", 300)]
    assert build_splices({ROME: (leg1, leg2)}, min_connect_h=5, max_connect_h=48) == []


def test_leg2_before_leg1_arrival_rejected():
    leg1 = [mk("HGH", "FCO", "2026-09-08T00:10", "2026-09-08T13:25", 2100)]
    leg2 = [mk("FCO", "KEF", "2026-09-08T06:00", "2026-09-08T09:30", 500)]
    assert build_splices({ROME: (leg1, leg2)}, min_connect_h=5, max_connect_h=48) == []


def test_cheapest_combo_wins_per_hub_and_sorted_across_hubs():
    leg1_r = [
        mk("HGH", "FCO", "2026-09-08T00:10", "2026-09-08T13:25", 2100),
        mk("HGH", "FCO", "2026-09-09T00:10", "2026-09-09T13:25", 1800),
    ]
    leg2_r = [
        mk("FCO", "KEF", "2026-09-09T06:00", "2026-09-09T09:30", 900),
        mk("FCO", "KEF", "2026-09-10T06:00", "2026-09-10T09:30", 700),
    ]
    leg1_l = [mk("HGH", "LGW", "2026-09-08T01:00", "2026-09-08T14:00", 3000)]
    leg2_l = [mk("LGW", "KEF", "2026-09-09T08:00", "2026-09-09T11:00", 400)]
    opts = build_splices(
        {ROME: (leg1_r, leg2_r), LONDON: (leg1_l, leg2_l)},
        min_connect_h=5,
        max_connect_h=48,
        top_per_hub=1,
    )
    assert [o.total_price for o in opts] == [2500, 3400]
    assert opts[0].hub is ROME  # 1800 + 700


def test_same_date_pair_deduped_keeping_cheapest():
    # 同一天出发的段1 + 同一天多班同价段2：只留最便宜代表，不刷屏
    leg1 = [mk("HGH", "FCO", "2026-09-08T00:10", "2026-09-08T13:25", 2100)]
    leg2 = [
        mk("FCO", "KEF", "2026-09-09T06:00", "2026-09-09T09:30", 950),
        mk("FCO", "KEF", "2026-09-09T10:00", "2026-09-09T13:30", 900),
        mk("FCO", "KEF", "2026-09-09T14:00", "2026-09-09T17:30", 900),
        mk("FCO", "KEF", "2026-09-10T06:00", "2026-09-10T09:30", 990),
    ]
    opts = build_splices(
        {ROME: (leg1, leg2)}, min_connect_h=5, max_connect_h=60, top_per_hub=3
    )
    date_pairs = [(o.leg1.dep_dt.date(), o.leg2.dep_dt.date()) for o in opts]
    assert len(date_pairs) == len(set(date_pairs)) == 2
    assert opts[0].total_price == 3000  # 09-09 组合里最便宜的 900 被保留


def test_visa_annotation_present():
    leg1 = [mk("HGH", "LGW", "2026-09-08T01:00", "2026-09-08T14:00", 3000)]
    leg2 = [mk("LGW", "KEF", "2026-09-09T08:00", "2026-09-09T11:00", 400)]
    opts = build_splices({LONDON: (leg1, leg2)}, min_connect_h=5, max_connect_h=48)
    assert opts[0].hub.visa is VisaCat.UK
    assert "英国签证" in opts[0].visa_note


def test_connect_boundaries_inclusive():
    # 恰好 5.0h 和恰好 48.0h 都算合法衔接（闭区间语义钉住）
    leg1 = [mk("HGH", "FCO", "2026-09-08T00:00", "2026-09-08T12:00", 2000)]
    leg2 = [
        mk("FCO", "KEF", "2026-09-08T17:00", "2026-09-08T20:30", 900),  # 恰 5.0h
        mk("FCO", "KEF", "2026-09-10T12:00", "2026-09-10T15:30", 800),  # 恰 48.0h
        mk("FCO", "KEF", "2026-09-08T16:59", "2026-09-08T20:30", 100),  # 4h59m 拒
        mk("FCO", "KEF", "2026-09-10T12:01", "2026-09-10T15:30", 100),  # 48h01m 拒
    ]
    opts = build_splices(
        {ROME: (leg1, leg2)}, min_connect_h=5, max_connect_h=48, top_per_hub=4
    )
    assert sorted(o.leg2.price for o in opts) == [800, 900]


def test_same_day_connect_not_overnight():
    leg1 = [mk("HGH", "FCO", "2026-09-08T00:10", "2026-09-08T10:00", 2100)]
    leg2 = [mk("FCO", "KEF", "2026-09-08T18:00", "2026-09-08T21:30", 900)]
    opt = build_splices({ROME: (leg1, leg2)}, min_connect_h=5, max_connect_h=48)[0]
    assert opt.overnight is False
    assert abs(opt.connect_hours - 8.0) < 0.01


def test_direct_baseline_picks_min():
    quotes = [
        mk("HGH", "KEF", "2026-09-08T08:00", "2026-09-09T10:00", 11000, stops=2),
        mk("HGH", "KEF", "2026-09-10T08:00", "2026-09-11T10:00", 9800, stops=2),
    ]
    best = pick_direct_baseline(quotes)
    assert best.price == 9800


def test_direct_baseline_empty():
    assert pick_direct_baseline([]) is None


def test_hubs_registry_sanity():
    codes = [h.code for h in HUBS]
    assert len(codes) == len(set(codes)), "枢纽代码不能重复"
    assert any(h.code == "FCO" for h in HUBS)
    schengen = [h for h in HUBS if h.visa is VisaCat.SCHENGEN]
    assert len(schengen) >= 10


def test_splice_option_risk_fields():
    leg1 = [mk("HGH", "FCO", "2026-09-08T00:10", "2026-09-08T13:25", 2100)]
    leg2 = [mk("FCO", "KEF", "2026-09-09T06:00", "2026-09-09T09:30", 900)]
    opt: SpliceOption = build_splices(
        {ROME: (leg1, leg2)}, min_connect_h=5, max_connect_h=48
    )[0]
    assert opt.overnight is True  # 次日起飞=需过夜
    assert opt.leg1.price == 2100 and opt.leg2.price == 900
