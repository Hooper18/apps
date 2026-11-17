import unittest
from datetime import datetime, timezone, timedelta

from wxpay_sync.parse import parse_pay_message
from tests import samples

TZ8 = timezone(timedelta(hours=8))
# 2026-11-14 18:02:14 +08:00
CT = int(datetime(2026, 11, 14, 18, 2, 14, tzinfo=TZ8).timestamp())


class ParsePayMessageTest(unittest.TestCase):
    def test_chinese_balance_payment_with_myr_price(self):
        p = parse_pay_message(samples.ZH_BALANCE_MYR, CT, tz=TZ8)
        self.assertEqual(p["external_id"], "4500000000202601010000000001")
        self.assertEqual(p["amount"], "6.52")
        self.assertEqual(p["currency"], "CNY")
        self.assertEqual(p["merchant"], "Laundro")
        self.assertEqual(p["note"], "RM4.00")
        self.assertEqual(p["method"], "零钱")
        self.assertEqual(p["date"], "2026-11-14")
        self.assertEqual(p["occurred_at"], "2026-11-14T18:02:14+08:00")
        self.assertEqual(p["type"], "expense")

    def test_chinese_card_payment_with_fullwidth_yen_and_no_price_line(self):
        p = parse_pay_message(samples.ZH_CARD_FULLWIDTH, CT, tz=TZ8)
        self.assertEqual(p["amount"], "2879.10")
        self.assertEqual(p["merchant"], "Example Education Dev")
        self.assertEqual(p["method"], "兴业银行储蓄卡(1234)")
        self.assertEqual(p["note"], "")

    def test_chinese_usd_price(self):
        p = parse_pay_message(samples.ZH_USD, CT, tz=TZ8)
        self.assertEqual(p["note"], "US$5.00")

    def test_chinese_personal_payee_becomes_merchant(self):
        p = parse_pay_message(samples.ZH_PERSONAL, CT, tz=TZ8)
        self.assertEqual(p["merchant"], "张三")
        self.assertEqual(p["amount"], "15.00")
        self.assertEqual(p["method"], "零钱")

    def test_english_card_payment_with_myr_price(self):
        p = parse_pay_message(samples.EN_CARD_MYR, CT, tz=TZ8)
        self.assertEqual(p["external_id"], "4200000000202601010000000002")
        self.assertEqual(p["amount"], "46.35")
        self.assertEqual(p["merchant"], "DEMO KITCHEN(CITY)SDN.B")
        self.assertEqual(p["note"], "RM28.40")
        self.assertEqual(p["method"], "CIB Debit Card (1234)")

    def test_english_personal_payee(self):
        p = parse_pay_message(samples.EN_PERSONAL, CT, tz=TZ8)
        self.assertEqual(p["merchant"], "李四")
        self.assertEqual(p["amount"], "0.01")
        self.assertEqual(p["method"], "Balance")

    def test_non_payment_messages_are_skipped(self):
        for xml in (samples.DAILY_REPORT, samples.REFUND, samples.FX_CARD):
            self.assertIsNone(parse_pay_message(xml, CT, tz=TZ8))

    def test_garbage_is_skipped_not_raised(self):
        self.assertIsNone(parse_pay_message("", CT, tz=TZ8))
        self.assertIsNone(parse_pay_message("not xml at all", CT, tz=TZ8))

    def test_transaction_id_falls_back_to_url(self):
        p = parse_pay_message(samples.NO_TX_NODE, CT, tz=TZ8)
        self.assertEqual(p["external_id"], "4500000999")

    def test_receipt_titled_variant_takes_amount_from_the_method_line(self):
        # 少数凭证的标题是「微信支付凭证」，金额只出现在扣款方式那一行，也没有交易号。
        xml = samples.pay_xml(
            "微信支付凭证",
            "使用中国银行储蓄卡(5678)支付￥144.00",
            display_name="示例拉面馆",
            transaction_id="",
            url="",
        )
        p = parse_pay_message(xml, CT, tz=TZ8)
        self.assertEqual(p["amount"], "144.00")
        self.assertEqual(p["merchant"], "示例拉面馆")
        self.assertEqual(p["method"], "中国银行储蓄卡(5678)")
        self.assertEqual(p["external_id"], f"t{CT}-144.00")

    def test_receipt_titled_variant_without_amount_is_skipped(self):
        xml = samples.pay_xml("微信支付凭证", "一些别的说明", display_name="X", transaction_id="", url="")
        self.assertIsNone(parse_pay_message(xml, CT, tz=TZ8))

    def test_auto_deduction_takes_merchant_and_method_from_the_body(self):
        # 先购后付这类自动扣款：标题「已扣费」，没有 display_name
        xml = samples.pay_xml(
            "已扣费¥19.90",
            "扣费金额￥19.90\n优惠金额省钱卡1元立减金优惠￥1.00\n扣费服务示例小店\n扣费内容先购后付\n支付方式建设银行储蓄卡(1234)",
            display_name="",
            transaction_id="4200000000202601010000000009",
        )
        p = parse_pay_message(xml, CT, tz=TZ8)
        self.assertEqual(p["amount"], "19.90")
        self.assertEqual(p["merchant"], "示例小店")
        self.assertEqual(p["method"], "建设银行储蓄卡(1234)")
        self.assertEqual(p["external_id"], "4200000000202601010000000009")

    def test_subscription_renewal(self):
        xml = samples.pay_xml(
            "已续费¥99.00",
            "续费金额￥99.00\n续费项目示例健身会员卡每季度自动续费\n续费方式招商银行储蓄卡(5678)\n备注续费成功",
            display_name="",
            transaction_id="4200000000202601010000000010",
        )
        p = parse_pay_message(xml, CT, tz=TZ8)
        self.assertEqual(p["amount"], "99.00")
        self.assertEqual(p["merchant"], "示例健身会员卡每季度自动续费")
        self.assertEqual(p["method"], "招商银行储蓄卡(5678)")

    def test_thousands_separator_in_amount(self):
        xml = samples.pay_xml("已支付¥1,234.50", "使用零钱支付¥1,234.50", display_name="X")
        p = parse_pay_message(xml, CT, tz=TZ8)
        self.assertEqual(p["amount"], "1234.50")


if __name__ == "__main__":
    unittest.main()
