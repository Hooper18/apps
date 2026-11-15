"""解密微信 4.x 的本地库（WCDB / SQLCipher 4 页格式），只在内存里做，不改原文件。

页格式（2026-11 在微信 4.1.13 上实测）：
  · 页大小 4096，每页最后 80 字节是保留区：前 16 字节是 IV，后 64 字节是 HMAC。
  · 内容用 AES-256-CBC 加密，密钥是每个库各自的 32 字节 enc_key。
  · 第 1 页开头 16 字节是 salt（明文），解密后要换回 "SQLite format 3\\0"。
  · WAL 里的页是同样的加密格式。

这里不校验 HMAC，改为检查解密后的 SQLite 文件头：密钥不对或格式变了，头一定对不上。
"""

import struct

from Crypto.Cipher import AES

PAGE_SIZE = 4096
RESERVE = 80
SALT_SIZE = 16
SQLITE_MAGIC = b"SQLite format 3\x00"
WAL_MAGICS = (0x377F0682, 0x377F0683)
WAL_HEADER = 32
WAL_FRAME_HEADER = 24


class DecryptError(Exception):
    """解密失败：密钥不对、文件不完整，或者微信换了库格式。"""


def _decrypt_page(buf: bytes, pgno: int, key: bytes) -> bytes:
    iv = buf[PAGE_SIZE - RESERVE: PAGE_SIZE - RESERVE + 16]
    reserve = buf[PAGE_SIZE - RESERVE:]
    if pgno == 1:
        body = AES.new(key, AES.MODE_CBC, iv).decrypt(buf[SALT_SIZE: PAGE_SIZE - RESERVE])
        return SQLITE_MAGIC + body + reserve
    body = AES.new(key, AES.MODE_CBC, iv).decrypt(buf[: PAGE_SIZE - RESERVE])
    return body + reserve


def _check_header(page1: bytes) -> None:
    page_size = struct.unpack(">H", page1[16:18])[0]
    if page_size != PAGE_SIZE or page1[20] != RESERVE:
        raise DecryptError(
            "解密后的文件头不对：密钥和这个库不匹配，或者微信升级后换了库格式。"
        )


def _wal_frames(wal: bytes):
    """按顺序产出 WAL 里有效的帧：(页号, 提交后的库页数, 加密页)。遇到旧 salt 的帧就停。"""
    if len(wal) < WAL_HEADER:
        return
    magic, _version, page_size, _ckpt, salt1, salt2 = struct.unpack(">IIIIII", wal[:24])
    if magic not in WAL_MAGICS or page_size != PAGE_SIZE:
        return
    off = WAL_HEADER
    step = WAL_FRAME_HEADER + PAGE_SIZE
    while off + step <= len(wal):
        pgno, db_size, fs1, fs2 = struct.unpack(">IIII", wal[off: off + 16])
        if fs1 != salt1 or fs2 != salt2 or pgno == 0:
            return
        yield pgno, db_size, wal[off + WAL_FRAME_HEADER: off + step]
        off += step


def decrypt_db(raw: bytes, key: bytes, wal: bytes | None = None, expected_salt: bytes | None = None):
    """返回 (明文库字节, 统计)。wal 给了就把里面已提交的页盖上去。"""
    if len(key) != 32:
        raise DecryptError("密钥长度不对，应该是 32 字节。")
    if len(raw) < PAGE_SIZE or len(raw) % PAGE_SIZE != 0:
        raise DecryptError("库文件大小不是 4096 的整数倍，文件可能不完整。")
    if expected_salt is not None and raw[:SALT_SIZE] != expected_salt:
        raise DecryptError("库文件的 salt 和保存的不一致：这个库被微信重建过，需要重新取密钥。")

    count = len(raw) // PAGE_SIZE
    pages = {1: _decrypt_page(raw[:PAGE_SIZE], 1, key)}
    _check_header(pages[1])
    for i in range(1, count):
        pages[i + 1] = _decrypt_page(raw[i * PAGE_SIZE: (i + 1) * PAGE_SIZE], i + 1, key)

    applied = 0
    if wal:
        pending: dict[int, bytes] = {}
        for pgno, db_size, enc in _wal_frames(wal):
            pending[pgno] = enc
            if db_size:  # 提交帧：这一批生效
                for n, page in pending.items():
                    pages[n] = _decrypt_page(page, n, key)
                applied += len(pending)
                pending = {}
                count = db_size
        if applied:
            _check_header(pages[1])

    blank = b"\x00" * PAGE_SIZE
    plain = b"".join(pages.get(n, blank) for n in range(1, count + 1))
    return plain, {"pages": count, "wal_pages_applied": applied}
