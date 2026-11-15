import struct
import unittest

from Crypto.Cipher import AES

from wxpay_sync.decrypt import DecryptError, decrypt_db, PAGE_SIZE, RESERVE

KEY = bytes(range(32))
SALT = b"S" * 16


def plain_pages(n):
    """造 n 个明文页：第 1 页带合法的 SQLite 头（页大小 4096、保留区 80）。"""
    pages = []
    for i in range(n):
        body = bytes([(i * 7 + j) % 251 for j in range(PAGE_SIZE - RESERVE)])
        if i == 0:
            head = bytearray(body)
            head[0:16] = b"SQLite format 3\x00"
            head[16:18] = struct.pack(">H", PAGE_SIZE)
            head[20] = RESERVE
            body = bytes(head)
        pages.append(body)
    return pages


def encrypt_page(body, pgno, key=KEY):
    """和微信库一样的页格式：AES-256-CBC，IV 放在保留区前 16 字节，第 1 页开头是 salt。"""
    iv = bytes([pgno % 256]) * 16
    reserve = iv + b"\x00" * (RESERVE - 16)
    if pgno == 1:
        enc = AES.new(key, AES.MODE_CBC, iv).encrypt(body[16:])
        return SALT + enc + reserve
    return AES.new(key, AES.MODE_CBC, iv).encrypt(body) + reserve


def encrypt_db(pages, key=KEY):
    return b"".join(encrypt_page(p, i + 1, key) for i, p in enumerate(pages))


def wal_bytes(frames, salts=(0x11111111, 0x22222222)):
    """frames: [(pgno, db_size_after_commit, encrypted_page, salts_or_None)]"""
    out = struct.pack(">IIIIII", 0x377F0682, 3007000, PAGE_SIZE, 0, salts[0], salts[1]) + b"\x00" * 8
    for pgno, dbsize, page, fsalts in frames:
        s1, s2 = fsalts or salts
        out += struct.pack(">IIII", pgno, dbsize, s1, s2) + b"\x00" * 8 + page
    return out


class DecryptDbTest(unittest.TestCase):
    def test_round_trip(self):
        pages = plain_pages(3)
        plain, stats = decrypt_db(encrypt_db(pages), KEY)
        self.assertEqual(len(plain), 3 * PAGE_SIZE)
        for i, body in enumerate(pages):
            got = plain[i * PAGE_SIZE:(i + 1) * PAGE_SIZE]
            self.assertEqual(got[: PAGE_SIZE - RESERVE], body)
        self.assertEqual(stats["pages"], 3)
        self.assertEqual(stats["wal_pages_applied"], 0)

    def test_wrong_key_raises_clear_error(self):
        enc = encrypt_db(plain_pages(2))
        with self.assertRaises(DecryptError):
            decrypt_db(enc, bytes(32))

    def test_truncated_file_raises(self):
        with self.assertRaises(DecryptError):
            decrypt_db(b"\x00" * 100, KEY)

    def test_salt_mismatch_raises_when_expected_salt_given(self):
        enc = encrypt_db(plain_pages(1))
        with self.assertRaises(DecryptError):
            decrypt_db(enc, KEY, expected_salt=b"X" * 16)
        decrypt_db(enc, KEY, expected_salt=SALT)  # 一致时不报错

    def test_wal_committed_frames_override_and_extend(self):
        pages = plain_pages(2)
        new2 = bytes([9]) * (PAGE_SIZE - RESERVE)
        new3 = bytes([8]) * (PAGE_SIZE - RESERVE)
        wal = wal_bytes([
            (2, 0, encrypt_page(new2, 2), None),
            (3, 3, encrypt_page(new3, 3), None),  # commit，库变成 3 页
        ])
        plain, stats = decrypt_db(encrypt_db(pages), KEY, wal=wal)
        self.assertEqual(len(plain), 3 * PAGE_SIZE)
        self.assertEqual(plain[PAGE_SIZE: 2 * PAGE_SIZE - RESERVE], new2)
        self.assertEqual(plain[2 * PAGE_SIZE: 3 * PAGE_SIZE - RESERVE], new3)
        self.assertEqual(stats["wal_pages_applied"], 2)

    def test_wal_uncommitted_and_stale_frames_are_ignored(self):
        pages = plain_pages(2)
        junk = bytes([7]) * (PAGE_SIZE - RESERVE)
        wal = wal_bytes([
            (2, 2, encrypt_page(bytes([9]) * (PAGE_SIZE - RESERVE), 2), None),  # 已提交
            (2, 0, encrypt_page(junk, 2), None),                                  # 没提交
            (2, 2, encrypt_page(junk, 2), (0xDEAD, 0xBEEF)),                      # 旧 salt
        ])
        plain, stats = decrypt_db(encrypt_db(pages), KEY, wal=wal)
        self.assertEqual(plain[PAGE_SIZE: 2 * PAGE_SIZE - RESERVE], bytes([9]) * (PAGE_SIZE - RESERVE))
        self.assertEqual(stats["wal_pages_applied"], 1)

    def test_empty_or_header_only_wal_is_fine(self):
        enc = encrypt_db(plain_pages(1))
        decrypt_db(enc, KEY, wal=b"")
        decrypt_db(enc, KEY, wal=wal_bytes([]))


if __name__ == "__main__":
    unittest.main()
