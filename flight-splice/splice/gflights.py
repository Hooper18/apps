"""Google Flights 数据源：Playwright 真浏览器渲染 + aria-label 解析。

本机实测（2026-07-10）：Google 对当前出口 IP 不做服务端直出（ds:1 payload
里 payload[3]=None），裸 HTTP 拿不到航班数据，必须真浏览器让 JS 异步加载。

失败语义（审查后收紧）：
- 「确认无航班」（页面明确出无结果文案）→ 返回 [] 并写缓存
- 「查询失败」（超时/拦截页/浏览器崩溃/解析全军覆没=结构漂移嫌疑）→
  返回 [] 但**不写缓存**并记入 failed_queries，重跑可自愈；
  否则一次瞬态失败会以空列表固化 20 小时，把有票日污染成无票日。
"""

import json
import random
import re
import time
from datetime import datetime, timedelta
from pathlib import Path

from fast_flights import FlightQuery, create_query
from playwright.sync_api import Browser, Page, sync_playwright

from .aria_parser import parse_aria
from .quotes import Quote

ROW_SELECTOR = "li.pIav2d"

# 从每行结果里取「完整行程句」的 aria-label：优先 li 自身，其次内层元素
_COLLECT_ARIA_JS = """
(els) => els.map((li) => {
  const own = li.getAttribute('aria-label');
  if (own && own.includes('Leaves')) return own;
  for (const el of li.querySelectorAll('[aria-label]')) {
    const a = el.getAttribute('aria-label');
    if (a && a.includes('Leaves')) return a;
  }
  return '';
})
"""

_NO_FLIGHTS_MARKERS = ["No results returned", "No flights found", "没有找到航班"]


class GoogleFlightsClient:
    """一个浏览器实例复用查所有 (origin, dest, date)，带磁盘缓存与限速。"""

    def __init__(
        self,
        cache_dir: str | Path = "cache/gflights",
        *,
        currency: str = "CNY",
        cache_ttl_hours: float = 20.0,
        headless: bool = True,
        throttle_range: tuple[float, float] = (1.5, 3.5),
    ):
        if currency.upper() != "CNY":
            # aria 解析正则锚定 "Chinese yuan"，改货币必须同步改 aria_parser
            raise ValueError("当前仅支持 currency='CNY'（解析器锚定英文人民币文案）")
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.currency = currency
        self.cache_ttl = timedelta(hours=cache_ttl_hours)
        self.headless = headless
        self.throttle_range = throttle_range
        self._pw = None
        self._browser: Browser | None = None
        self._page: Page | None = None
        self.live_fetches = 0
        self.cache_hits = 0
        self.failed_queries: list[tuple[str, str, str]] = []

    # -- 生命周期 --------------------------------------------------------
    def __enter__(self) -> "GoogleFlightsClient":
        self._pw = sync_playwright().start()
        self._launch()
        return self

    def __exit__(self, *exc_info) -> None:
        if self._browser is not None:
            try:
                self._browser.close()
            except Exception:  # noqa: BLE001
                pass
        if self._pw is not None:
            self._pw.stop()

    def _launch(self) -> None:
        assert self._pw is not None
        self._browser = self._pw.chromium.launch(headless=self.headless)
        ctx = self._browser.new_context(
            locale="en-US", viewport={"width": 1366, "height": 900}
        )
        self._page = ctx.new_page()
        self._page.route(
            "**/*",
            lambda route: route.abort()
            if route.request.resource_type in ("image", "font", "media")
            else route.continue_(),
        )

    def _recover(self) -> None:
        """浏览器/页面崩溃后重建，避免用死掉的 page 重试。"""
        try:
            if self._browser is not None:
                self._browser.close()
        except Exception:  # noqa: BLE001
            pass
        try:
            self._launch()
            print("    !! 浏览器已重启")
        except Exception as e:  # noqa: BLE001
            print(f"    !! 浏览器重启失败: {e}")

    # -- 缓存 -------------------------------------------------------------
    def _cache_path(self, origin: str, dest: str, date: str) -> Path:
        return self.cache_dir / f"{origin}-{dest}-{date}.json"

    def _read_cache(self, path: Path) -> list[Quote] | None:
        """损坏/过期/结构不符一律按未缓存处理（损坏文件顺手删除）。"""
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            cached_at = datetime.fromisoformat(data["cached_at"])
            if datetime.now() - cached_at > self.cache_ttl:
                return None
            return [
                Quote(
                    **{
                        **c,
                        "dep_dt": datetime.fromisoformat(c["dep_dt"]),
                        "arr_dt": datetime.fromisoformat(c["arr_dt"]),
                    }
                )
                for c in data["quotes"]
            ]
        except (json.JSONDecodeError, KeyError, TypeError, ValueError, OSError) as e:
            print(f"    !! 缓存损坏按未缓存处理并删除: {path.name} ({type(e).__name__})")
            try:
                path.unlink()
            except OSError:
                pass
            return None

    def _write_cache(self, path: Path, quotes: list[Quote]) -> None:
        payload = {
            "cached_at": datetime.now().isoformat(),
            "quotes": [
                {
                    **q.__dict__,
                    "dep_dt": q.dep_dt.isoformat(),
                    "arr_dt": q.arr_dt.isoformat(),
                }
                for q in quotes
            ],
        }
        tmp = path.with_suffix(".tmp")
        tmp.write_text(
            json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8"
        )
        tmp.replace(path)

    # -- 查询 -------------------------------------------------------------
    def fetch(self, origin: str, dest: str, date: str) -> list[Quote]:
        """查某天 origin→dest 单程全部结果。

        失败返回 [] 但不写缓存（记入 failed_queries）；只有成功结果
        （含「确认无航班」的空结果）才落盘。
        """
        cache_path = self._cache_path(origin, dest, date)
        cached = self._read_cache(cache_path)
        if cached is not None:
            self.cache_hits += 1
            return cached

        quotes = self._fetch_live(origin, dest, date)
        if quotes is None:
            self.failed_queries.append((origin, dest, date))
            return []
        self._write_cache(cache_path, quotes)
        return quotes

    def _fetch_live(self, origin: str, dest: str, date: str) -> list[Quote] | None:
        """实时查询。返回 None 表示失败（网络/拦截/解析全失），不可当「无航班」。"""
        q = create_query(
            flights=[FlightQuery(date=date, from_airport=origin, to_airport=dest)],
            trip="one-way",
            seat="economy",
            currency=self.currency,
            language="en",
        )
        label = f"{origin}->{dest} {date}"
        self.live_fetches += 1
        time.sleep(random.uniform(*self.throttle_range))

        last_error: Exception | None = None
        for attempt in range(2):
            try:
                aria_labels, row_count = self._navigate_and_collect(q.url(), label)
                break
            except Exception as e:  # noqa: BLE001 - 重建浏览器再试一次
                last_error = e
                if attempt == 0:
                    self._recover()
                    time.sleep(5)
        else:
            print(f"    !! {label} 两次尝试均失败: {last_error}")
            return None

        if row_count == 0:
            return []  # 页面明确无结果文案，可信的「无航班」
        if not aria_labels:
            print(f"    !! {label} 有 {row_count} 行结果但无一含 'Leaves'——疑似页面结构漂移，不缓存")
            return None

        quotes = []
        for aria in aria_labels:
            parsed = parse_aria(aria, query_date=date)
            if parsed is None:
                continue
            quotes.append(
                Quote(
                    origin=origin,
                    dest=dest,
                    price=parsed.price,
                    currency=self.currency,
                    airlines=parsed.airlines,
                    stops=parsed.stops,
                    dep_dt=parsed.dep_dt,
                    arr_dt=parsed.arr_dt,
                    duration_min=parsed.duration_min,
                    source="gflights",
                )
            )
        if not quotes:
            print(f"    !! {label} 抓到 {len(aria_labels)} 行但 0 条解析成功——疑似 aria 措辞漂移，不缓存")
            return None
        dropped = len(aria_labels) - len(quotes)
        if dropped:
            print(f"    .. {label} 有 {dropped}/{len(aria_labels)} 行未解析（措辞变体），已跳过")
        return quotes

    def _navigate_and_collect(self, url: str, label: str) -> tuple[list[str], int]:
        """返回 (aria句子列表, 结果行数)。行数 0 仅在页面明确无结果时出现。"""
        page = self._page
        assert page is not None, "需在 with 块内使用"
        page.goto(url, wait_until="domcontentloaded", timeout=60000)

        if "consent.google.com" in page.url:
            for name in ("Accept all", "I agree"):
                try:
                    page.get_by_role("button", name=name).first.click(timeout=3000)
                    page.wait_for_load_state("domcontentloaded")
                    break
                except Exception:  # noqa: BLE001
                    continue

        try:
            page.wait_for_selector(ROW_SELECTOR, timeout=30000)
        except Exception:  # noqa: BLE001
            body = page.inner_text("body")
            if any(marker in body for marker in _NO_FLIGHTS_MARKERS):
                return [], 0
            raise

        # 切到 Cheapest 排序，保证最低价进入可见行；失败必须出声（结果可能非最低价序）
        try:
            page.get_by_role("tab", name=re.compile("Cheapest")).click(timeout=3000)
            page.wait_for_timeout(2500)
        except Exception as e:  # noqa: BLE001
            print(f"    !! {label} Cheapest 排序切换失败，结果可能未按最低价排序: {type(e).__name__}")

        # 展开 View more，收全候选；中断必须出声（候选集可能被截断）
        for _ in range(3):
            try:
                buttons = page.query_selector_all(
                    'button[aria-label*="View more flights"]'
                )
                visible = [b for b in buttons if b.is_visible()]
                if not visible:
                    break
                visible[0].click()
                page.wait_for_timeout(2000)
            except Exception as e:  # noqa: BLE001
                print(f"    !! {label} View more 展开中断，候选可能截断: {type(e).__name__}")
                break

        rows = page.query_selector_all(ROW_SELECTOR)
        labels = [
            a
            for a in page.eval_on_selector_all(ROW_SELECTOR, _COLLECT_ARIA_JS)
            if a
        ]
        return labels, len(rows)
