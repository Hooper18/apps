import json
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timezone, timedelta

import zstandard

from tests import samples
from tests.test_decrypt import KEY, SALT
from wxpay_sync import store
from wxpay_sync.sync import (
    OVERLAP_SECONDS,
    SyncError,
    build_learn_payload,
    build_payload,
    collect_payments,
    run,
)

TZ8 = timezone(timedelta(hours=8))


def ts(day, hour=12, minute=0):
    return int(datetime(2026, 11, day, hour, minute, tzinfo=TZ8).timestamp())


def make_conn(rows):
    """rows: [(create_time, xml 或 None, 是否压缩)]，建一张和微信一样名字的表。"""
    conn = sqlite3.connect(":memory:")
    conn.execute(
        f"create table {store.table_name()} (local_id integer primary key, create_time integer, message_content)"
    )
    c = zstandard.ZstdCompressor()
    for create_time, xml, compressed in rows:
        value = c.compress(xml.encode("utf-8")) if compressed else xml
        conn.execute(
            f"insert into {store.table_name()} (create_time, message_content) values (?, ?)",
            (create_time, value),
        )
    conn.commit()
    return conn


class StoreTest(unittest.TestCase):
    def test_table_name_is_md5_of_the_pay_account(self):
        self.assertEqual(store.table_name(), "Msg_c156d1a38aa55c427b37494e8f31104c")

    def test_reads_compressed_and_plain_rows_after_since_in_time_order(self):
        conn = make_conn([
            (ts(14, 18), samples.EN_CARD_MYR, True),
            (ts(10), samples.ZH_BALANCE_MYR, False),
            (ts(12), samples.DAILY_REPORT, True),
        ])
        rows = store.read_messages(conn, since_ts=ts(11))
        self.assertEqual([r[0] for r in rows], [ts(12), ts(14, 18)])
        self.assertIn("DEMO KITCHEN", rows[1][1])

    def test_open_plain_accepts_a_wal_mode_database(self):
        # 微信的库是 WAL 模式；这种库的字节直接载入内存会报 unable to open database file。
        d = tempfile.mkdtemp()
        path = os.path.join(d, "wal.db")
        try:
            disk = sqlite3.connect(path)
            disk.execute("pragma journal_mode=wal")
            disk.execute("create table t (x)")
            disk.execute("insert into t values (42)")
            disk.commit()
            disk.execute("pragma wal_checkpoint(truncate)")
            disk.close()
            with open(path, "rb") as f:
                raw = f.read()
            self.assertEqual(raw[18:20], b"\x02\x02")  # 确认样本真的是 WAL 模式
            conn = store.open_plain(raw)
            self.assertEqual(conn.execute("select x from t").fetchone()[0], 42)
            conn.close()
        finally:
            for name in os.listdir(d):
                os.remove(os.path.join(d, name))
            os.rmdir(d)

    def test_missing_table_raises_store_error(self):
        conn = sqlite3.connect(":memory:")
        with self.assertRaises(store.StoreError):
            store.read_messages(conn, since_ts=0)


class PayloadTest(unittest.TestCase):
    def setUp(self):
        self.payments = collect_payments(
            [
                (ts(14, 13, 15), samples.EN_CARD_MYR),
                (ts(14, 9), samples.DAILY_REPORT),
                (ts(15, 1, 57), samples.EN_PERSONAL),
            ],
            tz=TZ8,
        )

    def test_collect_drops_non_payments(self):
        self.assertEqual(len(self.payments), 2)

    def test_build_payload_shape(self):
        payload = build_payload(self.payments)
        self.assertEqual(payload["source"], "wechat")
        item = payload["items"][0]
        self.assertEqual(
            item,
            {
                "external_id": "4200000000202601010000000002",
                "amount": "46.35",
                "currency": "CNY",
                "merchant": "DEMO KITCHEN(CITY)SDN.B",
                "note": "RM28.40",
                "date": "2026-11-14",
                "occurred_at": "2026-11-14T13:15:00+08:00",
                "type": "expense",
            },
        )

    def test_build_learn_payload_carries_price_as_alternative_amount(self):
        payload = build_learn_payload(self.payments)
        self.assertEqual(payload["mode"], "learn")
        self.assertEqual(
            payload["items"][0],
            {
                "merchant": "DEMO KITCHEN(CITY)SDN.B",
                "date": "2026-11-14",
                "amount": "46.35",
                "currency": "CNY",
                "alt_amount": "28.40",
                "alt_currency": "MYR",
            },
        )
        self.assertNotIn("alt_amount", payload["items"][1])


class RunTest(unittest.TestCase):
    """run() 的解密环节用 open_db 参数换成内存库：解密本身在 test_decrypt 里单独测。"""

    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.db_path = os.path.join(self.dir, "biz_message_0.db")
        self.keys_path = os.path.join(self.dir, "all_keys.json")
        self.state_path = os.path.join(self.dir, "state.json")
        with open(self.db_path, "wb") as f:
            f.write(b"encrypted-bytes")
        with open(self.keys_path, "w", encoding="utf-8") as f:
            json.dump({"message\\biz_message_0.db": {"enc_key": KEY.hex(), "salt": SALT.hex()}}, f)
        self.config = {
            "db_path": self.db_path,
            "keys_path": self.keys_path,
            "key_name": "message\\biz_message_0.db",
            "endpoint": "https://example.test/functions/v1/ingest",
            "token": "lgr_test",
            "state_path": self.state_path,
        }
        self.posts = []
        self.conn = make_conn([
            (ts(10), samples.ZH_BALANCE_MYR, True),
            (ts(14, 13, 15), samples.EN_CARD_MYR, True),
            (ts(14, 9), samples.DAILY_REPORT, True),
            (ts(15, 1, 57), samples.EN_PERSONAL, True),
        ])

    def tearDown(self):
        for name in os.listdir(self.dir):
            os.remove(os.path.join(self.dir, name))
        os.rmdir(self.dir)

    def post(self, url, token, payload):
        self.posts.append((url, token, payload))
        return {"ok": True, "inserted": len(payload["items"]), "duplicates": 0}

    def open_db(self, config):
        return self.conn

    def go(self, **kw):
        kw.setdefault("post", self.post)
        kw.setdefault("open_db", self.open_db)
        kw.setdefault("tz", TZ8)
        kw.setdefault("log", lambda *_: None)
        return run(self.config, **kw)

    def state(self):
        with open(self.state_path, encoding="utf-8") as f:
            return json.load(f)

    def test_first_run_only_sets_the_starting_point(self):
        summary = self.go(now=ts(15, 2))
        self.assertEqual(self.posts, [])
        self.assertEqual(summary["sent"], 0)
        self.assertEqual(self.state(), {"start": ts(15, 2), "cursor": ts(15, 2)})

    def test_later_run_sends_payments_after_start_and_advances_cursor(self):
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump({"start": ts(14, 0), "cursor": ts(14, 0)}, f)
        summary = self.go(now=ts(15, 3))
        self.assertEqual(len(self.posts), 1)
        url, token, payload = self.posts[0]
        self.assertEqual(url, "https://example.test/functions/v1/ingest")
        self.assertEqual(token, "lgr_test")
        self.assertEqual(
            [i["merchant"] for i in payload["items"]],
            ["DEMO KITCHEN(CITY)SDN.B", "李四"],
        )
        self.assertEqual(summary["sent"], 2)
        self.assertEqual(self.state()["cursor"], ts(15, 1, 57))
        self.assertEqual(self.state()["start"], ts(14, 0))

    def test_overlap_resends_recent_payments_but_never_before_start(self):
        # 游标已经走到 15 号，但 14 号那笔可能是后来才同步进电脑的：重发，由后端去重。
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump({"start": ts(14, 0), "cursor": ts(15, 1, 57)}, f)
        self.assertGreater(OVERLAP_SECONDS, 24 * 3600)
        self.go(now=ts(15, 3))
        merchants = [i["merchant"] for i in self.posts[0][2]["items"]]
        self.assertEqual(merchants, ["DEMO KITCHEN(CITY)SDN.B", "李四"])  # 10 号那笔在 start 之前，不发

    def test_since_overrides_start(self):
        self.go(now=ts(15, 3), since=ts(9))
        merchants = [i["merchant"] for i in self.posts[0][2]["items"]]
        self.assertEqual(merchants[0], "Laundro")
        self.assertEqual(len(merchants), 3)

    def test_dry_run_posts_nothing_and_keeps_state(self):
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump({"start": ts(14, 0), "cursor": ts(14, 0)}, f)
        lines = []
        summary = self.go(now=ts(15, 3), dry_run=True, log=lines.append)
        self.assertEqual(self.posts, [])
        self.assertEqual(self.state()["cursor"], ts(14, 0))
        self.assertEqual(summary["found"], 2)
        self.assertTrue(any("DEMO KITCHEN" in line for line in lines))

    def test_failed_post_raises_and_does_not_advance_cursor(self):
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump({"start": ts(14, 0), "cursor": ts(14, 0)}, f)

        def boom(url, token, payload):
            raise SyncError("HTTP 500")

        with self.assertRaises(SyncError):
            self.go(now=ts(15, 3), post=boom)
        self.assertEqual(self.state()["cursor"], ts(14, 0))

    def test_server_rejection_raises(self):
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump({"start": ts(14, 0), "cursor": ts(14, 0)}, f)
        with self.assertRaises(SyncError):
            self.go(now=ts(15, 3), post=lambda *a: {"ok": False, "error": "bad token"})

    def test_learn_sends_all_history_in_learn_mode_without_touching_state(self):
        with open(self.state_path, "w", encoding="utf-8") as f:
            json.dump({"start": ts(14, 0), "cursor": ts(14, 0)}, f)
        self.go(now=ts(15, 3), learn=True)
        payload = self.posts[0][2]
        self.assertEqual(payload["mode"], "learn")
        self.assertEqual(len(payload["items"]), 3)
        self.assertEqual(self.state()["cursor"], ts(14, 0))

    def test_missing_config_field_is_reported(self):
        del self.config["token"]
        with self.assertRaises(SyncError) as ctx:
            self.go(now=ts(15, 3))
        self.assertIn("token", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
