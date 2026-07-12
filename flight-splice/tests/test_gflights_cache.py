"""GoogleFlightsClient 缓存语义测试（离线，不起浏览器）。

核心不变量（审查后收紧的失败语义）：
- 成功结果（含确认无航班的空列表）→ 写缓存
- 失败（_fetch_live 返回 None）→ 不写缓存 + 记入 failed_queries
- 损坏缓存 → 按未缓存处理且删除，不崩溃
"""

import json
from datetime import datetime, timedelta

import pytest

from splice.gflights import GoogleFlightsClient
from splice.quotes import Quote


def mk_quote(price=1000):
    return Quote(
        origin="HGH",
        dest="FCO",
        price=price,
        currency="CNY",
        airlines="Test Air",
        stops=1,
        dep_dt=datetime(2026, 9, 8, 0, 10),
        arr_dt=datetime(2026, 9, 8, 13, 25),
        duration_min=795,
        source="gflights",
    )


@pytest.fixture
def client(tmp_path):
    return GoogleFlightsClient(cache_dir=tmp_path, throttle_range=(0, 0))


def test_success_roundtrip_and_cache_hit(client, monkeypatch):
    monkeypatch.setattr(client, "_fetch_live", lambda *a: [mk_quote(1234)])
    first = client.fetch("HGH", "FCO", "2026-09-08")
    assert first[0].price == 1234
    # 二次调用换掉 _fetch_live，若走网络会炸——必须命中缓存
    monkeypatch.setattr(
        client, "_fetch_live", lambda *a: pytest.fail("不应发起实时请求")
    )
    second = client.fetch("HGH", "FCO", "2026-09-08")
    assert second[0].price == 1234
    assert second[0].dep_dt == first[0].dep_dt
    assert client.cache_hits == 1


def test_confirmed_empty_is_cached(client, monkeypatch):
    monkeypatch.setattr(client, "_fetch_live", lambda *a: [])
    assert client.fetch("HGH", "FCO", "2026-09-08") == []
    assert client._cache_path("HGH", "FCO", "2026-09-08").exists()
    assert client.failed_queries == []


def test_failure_not_cached_and_recorded(client, monkeypatch):
    monkeypatch.setattr(client, "_fetch_live", lambda *a: None)
    assert client.fetch("HGH", "FCO", "2026-09-08") == []
    assert not client._cache_path("HGH", "FCO", "2026-09-08").exists()
    assert client.failed_queries == [("HGH", "FCO", "2026-09-08")]
    # 失败后重跑会再次发起实时请求（自愈路径）
    monkeypatch.setattr(client, "_fetch_live", lambda *a: [mk_quote()])
    assert client.fetch("HGH", "FCO", "2026-09-08")[0].price == 1000


def test_expired_cache_refetches(client, monkeypatch):
    monkeypatch.setattr(client, "_fetch_live", lambda *a: [mk_quote(1111)])
    client.fetch("HGH", "FCO", "2026-09-08")
    # 手动把 cached_at 拨回 TTL 之外
    path = client._cache_path("HGH", "FCO", "2026-09-08")
    data = json.loads(path.read_text(encoding="utf-8"))
    data["cached_at"] = (datetime.now() - timedelta(hours=21)).isoformat()
    path.write_text(json.dumps(data), encoding="utf-8")
    monkeypatch.setattr(client, "_fetch_live", lambda *a: [mk_quote(2222)])
    assert client.fetch("HGH", "FCO", "2026-09-08")[0].price == 2222


def test_corrupt_cache_treated_as_miss_and_deleted(client, monkeypatch):
    path = client._cache_path("HGH", "FCO", "2026-09-08")
    path.write_text("{ 这不是合法 JSON", encoding="utf-8")
    monkeypatch.setattr(client, "_fetch_live", lambda *a: [mk_quote(3333)])
    assert client.fetch("HGH", "FCO", "2026-09-08")[0].price == 3333


def test_schema_mismatch_cache_treated_as_miss(client, monkeypatch):
    path = client._cache_path("HGH", "FCO", "2026-09-08")
    path.write_text(
        json.dumps({"cached_at": datetime.now().isoformat(), "quotes": [{"bad": 1}]}),
        encoding="utf-8",
    )
    monkeypatch.setattr(client, "_fetch_live", lambda *a: [mk_quote(4444)])
    assert client.fetch("HGH", "FCO", "2026-09-08")[0].price == 4444


def test_non_cny_currency_rejected(tmp_path):
    with pytest.raises(ValueError, match="CNY"):
        GoogleFlightsClient(cache_dir=tmp_path, currency="USD")


def test_zero_parse_drift_returns_failure(client, monkeypatch):
    """抓到行但全部解析失败=结构漂移嫌疑，按失败处理不缓存。"""
    monkeypatch.setattr(
        client,
        "_navigate_and_collect",
        lambda *a: (["Gibberish aria that does not parse"], 5),
    )
    assert client._fetch_live("HGH", "FCO", "2026-09-08") is None


def test_marker_empty_is_trusted_no_flights(client, monkeypatch):
    monkeypatch.setattr(client, "_navigate_and_collect", lambda *a: ([], 0))
    assert client._fetch_live("HGH", "FCO", "2026-09-08") == []


def test_rows_without_leaves_is_failure(client, monkeypatch):
    """有结果行但没有一行含 'Leaves'——采集选择器漂移，按失败处理。"""
    monkeypatch.setattr(client, "_navigate_and_collect", lambda *a: ([], 8))
    assert client._fetch_live("HGH", "FCO", "2026-09-08") is None
