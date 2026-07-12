"""Travelpayouts 响应映射测试（fixture 数据，不发真实请求）。"""

from splice.travelpayouts import parse_tp_response

FIXTURE = {
    "success": True,
    "data": [
        {
            "origin": "HGH",
            "destination": "FCO",
            "departure_at": "2026-09-08T00:10:00+08:00",
            "price": 2088,
            "airline": "EK",
            "flight_number": "5423",
            "transfers": 1,
            "duration": 1155,
        },
        {
            "origin": "HGH",
            "destination": "FCO",
            "departure_at": "2026-09-10T09:30:00Z",
            "price": 2350,
            "airline": "MU",
            "flight_number": "787",
            "transfers": 0,
            "duration": 780,
        },
    ],
    "currency": "cny",
}


def test_parse_tp_response_maps_fields():
    quotes = parse_tp_response(FIXTURE, currency="CNY")
    assert len(quotes) == 2
    q = quotes[0]
    assert q.origin == "HGH" and q.dest == "FCO"
    assert q.price == 2088
    assert q.airlines == "EK"
    assert q.stops == 1
    assert q.dep_dt.isoformat() == "2026-09-08T00:10:00"
    assert q.duration_min == 1155
    assert q.arr_dt.isoformat() == "2026-09-08T19:25:00"
    assert q.source == "travelpayouts-cache"


def test_parse_tp_response_empty():
    assert parse_tp_response({"data": []}) == []
    assert parse_tp_response({}) == []
