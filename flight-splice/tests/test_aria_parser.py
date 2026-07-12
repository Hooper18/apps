"""aria-label 解析器测试——样本来自真实抓取的 Google Flights 页面。"""

from splice.aria_parser import parse_aria

REAL_SAMPLE = (
    "From 4947 Chinese yuan. 1 stop flight with Emirates. "
    "Leaves Hangzhou International Airport at 12:10 AM on Tuesday, September 8 "
    "and arrives at Leonardo da Vinci International Airport at 1:25 PM on "
    "Tuesday, September 8. Total duration 19 hr 15 min.  Layover (1 of 1) is a "
    "4 hr 40 min layover at Dubai International Airport in Dubai. Select flight"
)


def test_real_sample_full_fields():
    q = parse_aria(REAL_SAMPLE, query_date="2026-09-08")
    assert q.price == 4947
    assert q.stops == 1
    assert q.airlines == "Emirates"
    assert q.dep_dt.isoformat() == "2026-09-08T00:10:00"
    assert q.arr_dt.isoformat() == "2026-09-08T13:25:00"
    assert q.duration_min == 19 * 60 + 15


def test_nonstop_and_overnight_arrival():
    aria = (
        "2335 Chinese yuan. Nonstop flight with Icelandair. "
        "Leaves Paris Charles de Gaulle Airport at 10:05 PM on Monday, September 7 "
        "and arrives at Keflavík International Airport at 12:30 AM on Tuesday, "
        "September 8. Total duration 3 hr 25 min. Select flight"
    )
    q = parse_aria(aria, query_date="2026-09-07")
    assert q.price == 2335
    assert q.stops == 0
    assert q.airlines == "Icelandair"
    assert q.dep_dt.isoformat() == "2026-09-07T22:05:00"
    assert q.arr_dt.isoformat() == "2026-09-08T00:30:00"


def test_two_stops_multiple_airlines():
    aria = (
        "From 947 Chinese yuan. 2 stops flight with Ryanair and Wizz Air. "
        "Leaves Rome Fiumicino Airport at 6:00 AM on Wednesday, September 9 "
        "and arrives at Keflavík International Airport at 11:55 PM on Wednesday, "
        "September 9. Total duration 19 hr 55 min. Select flight"
    )
    q = parse_aria(aria, query_date="2026-09-09")
    assert q.price == 947
    assert q.stops == 2
    assert "Ryanair" in q.airlines and "Wizz Air" in q.airlines


def test_year_rollover_arrival():
    aria = (
        "1000 Chinese yuan. Nonstop flight with Test Air. "
        "Leaves A Airport at 11:00 PM on Thursday, December 31 "
        "and arrives at B Airport at 6:00 AM on Friday, January 1. "
        "Total duration 7 hr. Select flight"
    )
    q = parse_aria(aria, query_date="2026-12-31")
    assert q.dep_dt.isoformat() == "2026-12-31T23:00:00"
    assert q.arr_dt.isoformat() == "2027-01-01T06:00:00"


def test_nbsp_and_narrow_space_normalized():
    # 显式注入三种特殊空格：U+202F（时刻分隔真实形态）、U+00A0、U+2009
    aria = (
        REAL_SAMPLE.replace(" AM", chr(0x202F) + "AM")
        .replace("4947 Chinese", "4947\xa0Chinese")
        .replace(" PM", chr(0x2009) + "PM")
    )
    q = parse_aria(aria, query_date="2026-09-08")
    assert q.price == 4947
    assert q.dep_dt.hour == 0 and q.dep_dt.minute == 10
    assert q.arr_dt.hour == 13 and q.arr_dt.minute == 25


def test_westbound_same_day_earlier_arrival_not_year_bumped():
    # 西行跨时区：同日到达但当地时刻早于起飞时刻，绝不能被当成跨年 +1 年
    aria = (
        "5000 Chinese yuan. Nonstop flight with Test Air. "
        "Leaves Shanghai Pudong International Airport at 9:00 PM on Tuesday, "
        "September 8 and arrives at Los Angeles International Airport at 5:00 PM "
        "on Tuesday, September 8. Total duration 12 hr. Select flight"
    )
    q = parse_aria(aria, query_date="2026-09-08")
    assert q.dep_dt.isoformat() == "2026-09-08T21:00:00"
    assert q.arr_dt.isoformat() == "2026-09-08T17:00:00"
    assert q.duration_min == 720  # 时长取自 Total duration，不受本地时刻差影响


def test_leap_day_parses_when_leap_year_in_range():
    aria = (
        "1000 Chinese yuan. Nonstop flight with Test Air. "
        "Leaves A Airport at 8:00 AM on Tuesday, February 29 "
        "and arrives at B Airport at 12:00 PM on Tuesday, February 29. "
        "Total duration 4 hr. Select flight"
    )
    q = parse_aria(aria, query_date="2028-02-28")
    assert q.dep_dt.isoformat() == "2028-02-29T08:00:00"


def test_leap_day_without_leap_candidate_skipped_not_crash():
    # 锚点前后一年都非闰年：该行返回 None 跳过，而不是 ValueError 崩掉整个扫描
    aria = (
        "1000 Chinese yuan. Nonstop flight with Test Air. "
        "Leaves A Airport at 8:00 AM on Monday, February 29 "
        "and arrives at B Airport at 12:00 PM on Monday, February 29. "
        "Total duration 4 hr. Select flight"
    )
    assert parse_aria(aria, query_date="2026-02-28") is None


def test_thousands_separator_price():
    aria = REAL_SAMPLE.replace("From 4947 Chinese yuan", "From 10,810 Chinese yuan")
    q = parse_aria(aria, query_date="2026-09-08")
    assert q.price == 10810


def test_unparseable_returns_none():
    assert parse_aria("Select flight", query_date="2026-09-08") is None
    assert parse_aria("", query_date="2026-09-08") is None
