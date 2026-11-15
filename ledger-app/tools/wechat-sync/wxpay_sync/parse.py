"""把「微信支付」服务号的一条消息（XML）解析成一笔付款。

只认付款凭证：标题是「已支付¥6.52」（中文界面）或「¥6.52 paid」（英文界面）。
记账日报、汇率卡通知、退款到账等其它消息一律返回 None。

真实消息里用得到的节点：
  <title>            已支付¥6.52 / ¥46.35 paid
  <des>              多行文字：扣款方式、标价、汇率……
  <display_name>     商户名（付给个人收款码时为空）
  <transaction_id>   交易号（唯一）
"""

import re
from datetime import datetime, tzinfo

_YEN = "¥￥"
_AMOUNT = r"([\d,]+(?:\.\d{1,2})?)"
_TITLE_ZH = re.compile(rf"^已支付[{_YEN}]\s*{_AMOUNT}$")
_TITLE_EN = re.compile(rf"^[{_YEN}]\s*{_AMOUNT}\s+paid$", re.IGNORECASE)
_METHOD_ZH = re.compile(rf"^使用(.+?)支付[{_YEN}]\s*{_AMOUNT}?")
_METHOD_EN = re.compile(rf"^Paid by\s*(.+?)\s*[{_YEN}]\s*{_AMOUNT}?", re.IGNORECASE)
# 少数凭证的标题不带金额，金额只在扣款方式那一行里
_RECEIPT_TITLES = ("微信支付凭证", "Weixin Pay Receipt", "WeChat Pay Receipt")
_PAYEE_ZH = re.compile(r"^收款方\s*(.+)$")
_PAYEE_EN = re.compile(r"^Payee\s*(.+)$", re.IGNORECASE)
_PRICE_ZH = re.compile(rf"^标价\s*{_AMOUNT}\s*(.+)$")
_PRICE_EN = re.compile(rf"^Price\s*([^\d\s]+?)\s*{_AMOUNT}$", re.IGNORECASE)
_TRANS_ID_URL = re.compile(r"trans_id=(\d+)")

# 标价币种：消息里的写法 → (币种代码, 备注里用的符号)
_PRICE_CURRENCIES = {
    "马来西亚林吉特": ("MYR", "RM"),
    "RM": ("MYR", "RM"),
    "MYR": ("MYR", "RM"),
    "美元": ("USD", "US$"),
    "US$": ("USD", "US$"),
    "USD": ("USD", "US$"),
    "$": ("USD", "US$"),
    "新加坡元": ("SGD", "S$"),
    "S$": ("SGD", "S$"),
    "SGD": ("SGD", "S$"),
    "港币": ("HKD", "HK$"),
    "港元": ("HKD", "HK$"),
    "HK$": ("HKD", "HK$"),
    "HKD": ("HKD", "HK$"),
    "日元": ("JPY", "JPY "),
    "JPY": ("JPY", "JPY "),
    "泰铢": ("THB", "฿"),
    "THB": ("THB", "฿"),
    "฿": ("THB", "฿"),
    "欧元": ("EUR", "€"),
    "EUR": ("EUR", "€"),
    "€": ("EUR", "€"),
    "英镑": ("GBP", "£"),
    "GBP": ("GBP", "£"),
    "£": ("GBP", "£"),
    "澳元": ("AUD", "A$"),
    "AUD": ("AUD", "A$"),
    "A$": ("AUD", "A$"),
}


def _node(xml: str, tag: str) -> str:
    """取第一个 <tag> 的文字，CDATA 包不包都行。没有就返回空串。"""
    m = re.search(rf"<{tag}>\s*(?:<!\[CDATA\[(.*?)\]\]>|([^<]*))\s*</{tag}>", xml, re.S)
    if not m:
        return ""
    return (m.group(1) if m.group(1) is not None else m.group(2) or "").strip()


def _money(text: str) -> str:
    """'1,234.5' → '1234.50'，保持两位小数的字符串，不经过浮点。"""
    whole, _, frac = text.replace(",", "").partition(".")
    return f"{int(whole)}.{(frac + '00')[:2]}"


def _price(lines: list[str]):
    """从 des 里找标价行，返回 (金额, 币种代码, 备注文字)；没有就全空。"""
    for line in lines:
        m = _PRICE_ZH.match(line)
        if m:
            amount, unit = _money(m.group(1)), m.group(2).strip()
        else:
            m = _PRICE_EN.match(line)
            if not m:
                continue
            unit, amount = m.group(1).strip(), _money(m.group(2))
        known = _PRICE_CURRENCIES.get(unit) or _PRICE_CURRENCIES.get(unit.upper())
        if known:
            code, symbol = known
            return amount, code, f"{symbol}{amount}"
        return amount, "", f"{amount} {unit}"  # 没见过的币种：原样写进备注，不猜代码
    return "", "", ""


def parse_pay_message(xml: str, create_time: int, tz: tzinfo | None = None):
    """返回付款 dict；不是付款凭证或看不懂就返回 None（不抛异常）。"""
    if not xml or "<title>" not in xml:
        return None
    title = _node(xml, "title")
    m = _TITLE_ZH.match(title) or _TITLE_EN.match(title)
    if not m and title not in _RECEIPT_TITLES:
        return None
    amount = _money(m.group(1)) if m else ""

    lines = [ln.strip() for ln in _node(xml, "des").splitlines() if ln.strip()]

    method = ""
    payee = ""
    for line in lines:
        if not method:
            mm = _METHOD_ZH.match(line) or _METHOD_EN.match(line)
            if mm:
                method = mm.group(1).strip()
                if not amount and mm.group(2):
                    amount = _money(mm.group(2))
        if not payee:
            pm = _PAYEE_ZH.match(line) or _PAYEE_EN.match(line)
            if pm:
                payee = pm.group(1).strip()
    if not amount:
        return None

    merchant = _node(xml, "display_name") or payee
    price_amount, price_currency, note = _price(lines)

    external_id = _node(xml, "transaction_id")
    if not external_id:
        um = _TRANS_ID_URL.search(xml)
        external_id = um.group(1) if um else f"t{create_time}-{amount}"

    when = datetime.fromtimestamp(create_time, tz) if tz else datetime.fromtimestamp(create_time).astimezone()
    return {
        "external_id": external_id,
        "type": "expense",
        "amount": amount,
        "currency": "CNY",
        "merchant": merchant,
        "method": method,
        "note": note,
        "price_amount": price_amount,
        "price_currency": price_currency,
        "date": when.strftime("%Y-%m-%d"),
        "occurred_at": when.isoformat(timespec="seconds"),
    }
