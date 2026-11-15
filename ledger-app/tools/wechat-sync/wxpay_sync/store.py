"""从解密后的 biz_message 库里读「微信支付」服务号的消息。只碰这一张表。"""

import hashlib
import sqlite3

import zstandard

PAY_USERNAME = "gh_3dfda90e39d6"  # 「微信支付」服务号，所有账号都一样
_ZSTD_MAGIC = b"\x28\xb5\x2f\xfd"
_MAX_MESSAGE_BYTES = 5_000_000


class StoreError(Exception):
    """库里找不到预期的表或列：多半是微信升级后改了结构。"""


def table_name(username: str = PAY_USERNAME) -> str:
    """微信 4.x 每个会话一张表，表名是 Msg_ + 会话用户名的 md5。"""
    return "Msg_" + hashlib.md5(username.encode("utf-8")).hexdigest()


def decode_content(value) -> str:
    """消息内容可能是明文字符串，也可能是 zstd 压缩的字节。"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    data = bytes(value)
    if data[:4] == _ZSTD_MAGIC:
        try:
            data = zstandard.ZstdDecompressor().decompress(data, max_output_size=_MAX_MESSAGE_BYTES)
        except zstandard.ZstdError:
            return ""
    return data.decode("utf-8", "replace")


def open_plain(plain: bytes) -> sqlite3.Connection:
    """把明文库字节直接载入内存库，磁盘上不落明文文件。

    微信的库是 WAL 模式（文件头第 18、19 字节是 2）。内存库没有 -wal 文件，
    原样载入会报 unable to open database file，所以把这两个字节改回 1（回滚日志模式）。
    WAL 里的内容在解密那一步已经合并进来了。
    """
    if len(plain) >= 20 and plain[18:20] == b"\x02\x02":
        plain = plain[:18] + b"\x01\x01" + plain[20:]
    conn = sqlite3.connect(":memory:")
    conn.deserialize(plain)
    return conn


def read_messages(conn: sqlite3.Connection, since_ts: int) -> list[tuple[int, str]]:
    """返回 create_time 大于 since_ts 的消息 [(时间戳, XML)]，按时间从早到晚。"""
    table = table_name()
    try:
        rows = conn.execute(
            f"select create_time, message_content from {table} where create_time > ? order by create_time, rowid",
            (since_ts,),
        ).fetchall()
    except sqlite3.Error as e:
        raise StoreError(f"读不到「微信支付」会话的表 {table}：{e}") from e
    return [(int(ct), decode_content(content)) for ct, content in rows]
