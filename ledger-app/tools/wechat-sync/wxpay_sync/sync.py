"""把电脑微信里「微信支付」的新付款推到口袋记账的后端入口。

用法（在 tools/wechat-sync 目录下）：
    .venv\\Scripts\\python -m wxpay_sync.sync              # 正常同步
    .venv\\Scripts\\python -m wxpay_sync.sync --dry-run    # 只打印要发什么，不发、不动游标
    .venv\\Scripts\\python -m wxpay_sync.sync --since 2026-11-01   # 从这天起补发
    .venv\\Scripts\\python -m wxpay_sync.sync --learn      # 把全部历史付款发去「学习商户归类」，不入账
    .venv\\Scripts\\python -m wxpay_sync.sync --watch      # 常驻：盯着微信的库文件，一有变化就同步

只读：原库文件只读取、不修改；解密在内存里完成，磁盘上不落明文。
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, tzinfo

from . import store
from .decrypt import DecryptError, decrypt_db
from .parse import parse_pay_message

# 每次都把游标之前这么久的付款重发一遍，由后端按交易号去重。
# 原因：电脑关机期间的付款是开机后才同步进本地库的，时间戳却是付款当时，可能早于游标。
OVERLAP_SECONDS = 7 * 24 * 3600
CHUNK = 50
# 已经被后端确认过（新入账或已存在）的交易号记在 state.json 里，下次不再重发。只留最近这么多个。
SENT_KEEP = 1000
REQUIRED = ("db_path", "keys_path", "key_name")
REQUIRED_TO_SEND = ("endpoint", "token")
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class SyncError(Exception):
    """同步失败，信息可以直接给人看。"""


def collect_payments(messages, tz: tzinfo | None = None) -> list[dict]:
    out = []
    for create_time, xml in messages:
        p = parse_pay_message(xml, create_time, tz=tz)
        if p:
            out.append(p)
    return out


def build_payload(payments: list[dict], source: str = "wechat") -> dict:
    keys = ("external_id", "amount", "currency", "merchant", "note", "date", "occurred_at", "type")
    return {"source": source, "items": [{k: p[k] for k in keys} for p in payments]}


def build_learn_payload(payments: list[dict]) -> dict:
    items = []
    for p in payments:
        if not p["merchant"]:
            continue
        item = {
            "merchant": p["merchant"],
            "date": p["date"],
            "amount": p["amount"],
            "currency": p["currency"],
        }
        if p["price_amount"] and p["price_currency"]:
            item["alt_amount"] = p["price_amount"]
            item["alt_currency"] = p["price_currency"]
        items.append(item)
    return {"mode": "learn", "items": items}


def http_post(url: str, token: str, payload: dict) -> dict:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "Authorization": f"Bearer {token}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")[:300]
        raise SyncError(f"后端返回 HTTP {e.code}：{body}") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise SyncError(f"连不上后端：{e}") from e
    except json.JSONDecodeError as e:
        raise SyncError("后端返回的不是 JSON") from e


def open_wechat_db(config: dict):
    """读原库（和 WAL）→ 内存里解密 → 内存 SQLite 连接。"""
    try:
        with open(config["keys_path"], encoding="utf-8") as f:
            entry = json.load(f)[config["key_name"]]
        key = bytes.fromhex(entry["enc_key"])
        salt = bytes.fromhex(entry["salt"]) if entry.get("salt") else None
    except (OSError, KeyError, ValueError) as e:
        raise SyncError(f"读不到密钥（{config['keys_path']} 里的 {config['key_name']}）：{e}") from e
    try:
        with open(config["db_path"], "rb") as f:
            raw = f.read()
    except OSError as e:
        raise SyncError(f"读不到微信库文件 {config['db_path']}：{e}") from e
    wal = None
    try:
        with open(config["db_path"] + "-wal", "rb") as f:
            wal = f.read()
    except OSError:
        pass  # 没有 WAL 很正常
    try:
        plain, _stats = decrypt_db(raw, key, wal=wal, expected_salt=salt)
        conn = store.open_plain(plain)
        if conn.execute("pragma quick_check").fetchone()[0] != "ok":
            raise DecryptError("带上 WAL 后库不一致")
        return conn
    except Exception as first:
        # WAL 正在被微信写入时可能读到半截，退一步只用主库文件。
        if wal is None:
            raise SyncError(f"解密失败：{first}") from first
        try:
            plain, _stats = decrypt_db(raw, key, wal=None, expected_salt=salt)
            return store.open_plain(plain)
        except Exception as second:
            raise SyncError(f"解密失败：{second}") from second


def _read_payments(open_db, config: dict, since_ts: int, tz: tzinfo | None) -> list[dict]:
    """打开库 → 读出付款 → 关库。连接一定要关：整个明文库都在内存里，常驻模式下不关会越攒越多。"""
    try:
        conn = open_db(config)
        try:
            return collect_payments(store.read_messages(conn, since_ts), tz=tz)
        finally:
            conn.close()
    except (store.StoreError, DecryptError) as e:
        raise SyncError(str(e)) from e


def _load_state(path: str):
    try:
        with open(path, encoding="utf-8") as f:
            s = json.load(f)
        state = {"start": int(s["start"]), "cursor": int(s["cursor"])}
        if isinstance(s.get("sent"), list):
            state["sent"] = [str(x) for x in s["sent"]]
        return state
    except (OSError, ValueError, KeyError, TypeError):
        return None


def _save_state(path: str, state: dict) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(state, f)
    os.replace(tmp, path)


def _describe(p: dict) -> str:
    note = f"（{p['note']}）" if p["note"] else ""
    return f"  {p['occurred_at'][:16].replace('T', ' ')}  ¥{p['amount']}{note}  {p['merchant'] or '（无商户名）'}"


def run(
    config: dict,
    *,
    now: int | None = None,
    post=http_post,
    open_db=open_wechat_db,
    dry_run: bool = False,
    since: int | None = None,
    learn: bool = False,
    tz: tzinfo | None = None,
    log=print,
    quiet_when_idle: bool = False,
) -> dict:
    needed = REQUIRED if dry_run else REQUIRED + REQUIRED_TO_SEND
    missing = [k for k in needed if not config.get(k)]
    if missing:
        raise SyncError("config.json 缺少：" + "、".join(missing))
    now = int(time.time()) if now is None else now
    state_path = config.get("state_path") or os.path.join(HERE, "state.json")
    state = _load_state(state_path)

    if learn:
        payments = _read_payments(open_db, config, 0, tz)
        payload = build_learn_payload(payments)
        log(f"历史付款 {len(payments)} 笔，其中带商户名的 {len(payload['items'])} 笔")
        if dry_run:
            return {"found": len(payments), "sent": 0}
        learned = 0
        for i in range(0, len(payload["items"]), 500):
            result = post(config["endpoint"], config["token"], {"mode": "learn", "items": payload["items"][i:i + 500]})
            if not result.get("ok"):
                raise SyncError(f"后端拒绝了学习请求：{result.get('error')}")
            learned += int(result.get("learned", 0))
        log(f"学到 {learned} 条「商户 → 类目」")
        return {"found": len(payments), "sent": len(payload["items"]), "learned": learned}

    if state is None and since is None:
        # 第一次运行：从现在开始记，不把历史付款灌进账本。
        state = {"start": now, "cursor": now}
        if not dry_run:
            _save_state(state_path, state)
        log("首次运行：起点定在现在，之前的付款不入账。之后的付款下次运行开始同步。")
        return {"found": 0, "sent": 0, "inserted": 0, "duplicates": 0}

    start = since if since is not None else state["start"]
    cursor = state["cursor"] if state else start
    read_from = max(start, cursor - OVERLAP_SECONDS) if since is None else since

    payments = _read_payments(open_db, config, read_from, tz)

    if dry_run:
        log(f"找到 {len(payments)} 笔付款（演练，不发送）：")
        for p in payments:
            log(_describe(p))
        return {"found": len(payments), "sent": 0, "inserted": 0, "duplicates": 0}

    # 重发窗口里的付款大多上次已经发过、后端也确认过了：跳过，只发没见过的
    acknowledged = list(state.get("sent", [])) if state else []
    known = set(acknowledged)
    fresh = [p for p in payments if p["external_id"] not in known]

    inserted = duplicates = 0
    for i in range(0, len(fresh), CHUNK):
        chunk = fresh[i:i + CHUNK]
        result = post(config["endpoint"], config["token"], build_payload(chunk))
        if not result.get("ok"):
            raise SyncError(f"后端拒绝了请求：{result.get('error')}")
        inserted += int(result.get("inserted", 0))
        duplicates += int(result.get("duplicates", 0))
        acknowledged.extend(p["external_id"] for p in chunk)

    newest = max(
        [cursor] + [int(datetime.fromisoformat(p["occurred_at"]).timestamp()) for p in payments]
    )
    new_state = {"start": min(start, state["start"]) if state else start, "cursor": newest}
    if acknowledged:
        new_state["sent"] = acknowledged[-SENT_KEEP:]
    _save_state(state_path, new_state)
    if fresh or not quiet_when_idle:
        log(f"发送 {len(fresh)} 笔：新入账 {inserted}，已存在 {duplicates}")
    return {"found": len(payments), "sent": len(fresh), "inserted": inserted, "duplicates": duplicates}


def watch(
    config: dict,
    *,
    run_once,
    mtime=os.path.getmtime,
    sleep=time.sleep,
    clock=time.time,
    log=print,
    poll: float = 2.0,
    settle: float = 1.5,
    min_gap: float = 5.0,
    heartbeat: float = 600.0,
    max_loops: int | None = None,
) -> None:
    """常驻：微信的库文件（或它的 WAL）一变就同步一次。

    · poll      每隔多久看一眼文件修改时间
    · settle    发现变化后等一小会儿再读，让微信把这一批写完
    · min_gap   两次同步之间至少隔这么久（这个库里还有别的服务号消息，变得很勤）
    · heartbeat 文件一直没变也至少每隔这么久同步一次，兜底
    同步出错只记日志，不退出。
    """
    paths = [config["db_path"], config["db_path"] + "-wal"]

    def stamp():
        out = []
        for p in paths:
            try:
                out.append(mtime(p))
            except OSError:
                out.append(0)
        return tuple(out)

    last_stamp = None
    last_run = None
    loops = 0
    while True:
        now = clock()
        current = stamp()
        changed = current != last_stamp
        due = last_run is None or now - last_run >= heartbeat
        waited = last_run is None or now - last_run >= min_gap
        if (changed and waited) or due:
            if changed and last_stamp is not None:
                sleep(settle)
                current = stamp()
            try:
                run_once()
            except SyncError as e:
                log(f"失败：{e}")
            except Exception as e:  # 常驻进程不能因为一次意外就退出
                log(f"意外错误：{type(e).__name__}: {e}")
            last_stamp = current
            last_run = clock()
        loops += 1
        if max_loops is not None and loops >= max_loops:
            return
        sleep(poll)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="把电脑微信里的微信支付付款同步到口袋记账")
    ap.add_argument("--config", default=os.path.join(HERE, "config.json"))
    ap.add_argument("--dry-run", action="store_true", help="只打印，不发送，不动游标")
    ap.add_argument("--since", help="从这一天起（YYYY-MM-DD），覆盖起点")
    ap.add_argument("--learn", action="store_true", help="把历史付款发去学习商户归类，不入账")
    ap.add_argument("--watch", action="store_true", help="常驻：盯着微信的库文件，一有变化就同步")
    args = ap.parse_args(argv)

    log_path = os.path.join(HERE, "sync.log")

    def log(line: str) -> None:
        print(line)
        try:
            with open(log_path, "a", encoding="utf-8") as f:
                f.write(f"{datetime.now().isoformat(timespec='seconds')} {line}\n")
        except OSError:
            pass

    try:
        try:
            with open(args.config, encoding="utf-8") as f:
                config = json.load(f)
        except (OSError, ValueError) as e:
            raise SyncError(f"读不到配置文件 {args.config}：{e}") from e
        since = None
        if args.since:
            try:
                since = int(datetime.strptime(args.since, "%Y-%m-%d").astimezone().timestamp())
            except ValueError as e:
                raise SyncError("--since 要写成 YYYY-MM-DD") from e
        if args.watch:
            if args.dry_run or args.learn or since is not None:
                raise SyncError("--watch 不能和 --dry-run / --learn / --since 一起用")
            log("开始盯着微信的库文件，变了就同步。Ctrl+C 退出。")
            try:
                watch(config, run_once=lambda: run(config, log=log, quiet_when_idle=True), log=log)
            except KeyboardInterrupt:
                log("已停止。")
            return 0
        run(config, dry_run=args.dry_run, since=since, learn=args.learn, log=log)
        return 0
    except SyncError as e:
        log(f"失败：{e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
