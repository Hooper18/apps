"""CLI 参数校验与窗口推导测试。"""

import pytest

from splice.cli import leg2_extra_days, parse_args, window_dates


def test_leg2_extra_days_default_48h():
    assert leg2_extra_days(48.0) == 3


def test_leg2_extra_days_72h():
    assert leg2_extra_days(72.0) == 4


def test_leg2_extra_days_short_connect():
    assert leg2_extra_days(10.0) == 2


def test_window_dates():
    assert window_dates("2026-09-07", 3) == [
        "2026-09-07",
        "2026-09-08",
        "2026-09-09",
    ]


@pytest.mark.parametrize(
    "argv",
    [
        ["--days", "0"],
        ["--days", "-3"],
        ["--start", "not-a-date"],
        ["--min-connect", "-1"],
        ["--min-connect", "10", "--max-connect", "5"],
        ["--shortlist", "0"],
        ["--top", "0"],
    ],
)
def test_invalid_args_rejected(argv):
    with pytest.raises(SystemExit):
        parse_args(argv)


def test_valid_args_defaults():
    args = parse_args([])
    assert args.origin == "HGH" and args.dest == "KEF"
    assert args.days == 7 and args.max_connect == 48.0
