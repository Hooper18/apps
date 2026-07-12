"""单查询实连 sanity：客户端全链路（渲染→Cheapest→aria→解析→缓存）。"""

import sys

from splice.gflights import GoogleFlightsClient

sys.stdout.reconfigure(encoding="utf-8")

with GoogleFlightsClient(cache_dir="cache/gflights") as client:
    quotes = client.fetch("HGH", "FCO", "2026-09-10")
    print(f"HGH→FCO 2026-09-10: {len(quotes)} 条")
    for q in sorted(quotes, key=lambda x: x.price)[:5]:
        print(
            f"  ¥{q.price:,}  {q.airlines}  {q.stops}停  "
            f"{q.dep_dt:%H:%M}→{q.arr_dt:%m-%d %H:%M}  {q.duration_min}min"
        )
    # 二次调用应命中缓存
    client.fetch("HGH", "FCO", "2026-09-10")
    print(f"live={client.live_fetches} cache={client.cache_hits}")
    assert client.cache_hits == 1, "缓存未命中"
print("SANITY OK")
