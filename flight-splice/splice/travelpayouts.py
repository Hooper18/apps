"""Travelpayouts/Aviasales 缓存低价矩阵客户端（可选加速器）。

免费注册 https://www.travelpayouts.com 拿 token（环境变量 TP_TOKEN）。
返回的是 Aviasales 用户过去 48 小时搜索到的缓存价，不是实时报价——
只用于粗筛排序枢纽，最终价格一律以 Google Flights 实时结果为准。
注意缓存按 market 分片，中国出发路线密度偏薄（缓存缺失≠没有航班）。
"""

import os
from datetime import datetime, timedelta

import httpx

from .quotes import Quote

API_URL = "https://api.travelpayouts.com/aviasales/v3/prices_for_dates"


def tp_token() -> str | None:
    return os.environ.get("TP_TOKEN") or None


def parse_tp_response(data: dict, currency: str = "CNY") -> list[Quote]:
    """把 prices_for_dates 响应映射成 Quote（缓存价，时刻仅供参考）。"""
    quotes = []
    for item in data.get("data", []):
        dep_dt = datetime.fromisoformat(item["departure_at"].replace("Z", "+00:00"))
        dep_dt = dep_dt.replace(tzinfo=None)
        duration = int(item.get("duration") or 0)
        quotes.append(
            Quote(
                origin=item["origin"],
                dest=item["destination"],
                price=int(item["price"]),
                currency=currency,
                airlines=item.get("airline") or "?",
                stops=int(item.get("transfers") or 0),
                dep_dt=dep_dt,
                arr_dt=dep_dt + timedelta(minutes=duration),
                duration_min=duration,
                source="travelpayouts-cache",
            )
        )
    return quotes


def fetch_month_cheapest(
    origin: str,
    dest: str,
    month: str,
    *,
    token: str,
    currency: str = "CNY",
    market: str = "cn",
) -> list[Quote]:
    """某月每天的缓存最低价（month 形如 2026-09）。"""
    resp = httpx.get(
        API_URL,
        params={
            "origin": origin,
            "destination": dest,
            "departure_at": month,
            "currency": currency.lower(),
            "market": market,
            "one_way": "true",
            "limit": 100,
            "token": token,
        },
        timeout=30,
    )
    resp.raise_for_status()
    return parse_tp_response(resp.json(), currency=currency)
