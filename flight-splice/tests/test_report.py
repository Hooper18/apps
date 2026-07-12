"""报告渲染 smoke 测试。"""

from datetime import datetime

from splice.hubs import Hub, VisaCat
from splice.pipeline import SpliceOption
from splice.quotes import Quote
from splice.report import render_report

ROME = Hub(code="FCO", city="罗马", country="意大利", visa=VisaCat.SCHENGEN)


def mk_quote(origin, dest, price, dep, arr):
    return Quote(
        origin=origin,
        dest=dest,
        price=price,
        currency="CNY",
        airlines="Test Air",
        stops=1,
        dep_dt=datetime.fromisoformat(dep),
        arr_dt=datetime.fromisoformat(arr),
        duration_min=795,
        source="test",
    )


def mk_option(total=3000):
    leg1 = mk_quote("HGH", "FCO", 2100, "2026-09-08T00:10", "2026-09-08T13:25")
    leg2 = mk_quote("FCO", "KEF", total - 2100, "2026-09-09T06:00", "2026-09-09T09:30")
    return SpliceOption(
        hub=ROME,
        leg1=leg1,
        leg2=leg2,
        total_price=total,
        connect_hours=16.58,
        overnight=True,
        visa_note="申根签（去冰岛本就需要，顺路无额外成本）",
    )


BASELINE = mk_quote("HGH", "KEF", 5165, "2026-09-10T08:00", "2026-09-11T10:00")
COMMON = dict(
    origin="HGH", dest="KEF", window_start="2026-09-07", window_end="2026-09-13"
)


def test_full_report_contains_key_facts():
    text = render_report(baseline=BASELINE, options=[mk_option()], **COMMON)
    assert "¥5,165" in text
    assert "¥3,000" in text
    assert "罗马(FCO)" in text
    assert "比直搜省 ¥2,165 / 42%" in text
    assert "风险提示" in text
    assert "申根" in text


def test_no_baseline_no_crash():
    text = render_report(baseline=None, options=[mk_option()], **COMMON)
    assert "未找到可用直搜结果" in text


def test_no_options_message():
    text = render_report(baseline=BASELINE, options=[], **COMMON)
    assert "未找到满足转机约束的自拼方案" in text


def test_splice_worse_than_direct_labeled():
    text = render_report(baseline=BASELINE, options=[mk_option(total=6000)], **COMMON)
    assert "不比直搜便宜" in text


def test_failed_queries_section():
    failed = [("HGH", "FCO", "2026-09-08")] + [
        ("A", "B", f"2026-09-{d:02d}") for d in range(1, 13)
    ]
    text = render_report(
        baseline=BASELINE, options=[mk_option()], failed_queries=failed, **COMMON
    )
    assert "13 条查询失败" in text
    assert "HGH→FCO 2026-09-08" in text
    assert "另 3 条" in text


def test_top_truncation():
    options = [mk_option(total=3000 + i) for i in range(15)]
    text = render_report(baseline=BASELINE, options=options, top=5, **COMMON)
    assert "#5" in text and "#6" not in text
