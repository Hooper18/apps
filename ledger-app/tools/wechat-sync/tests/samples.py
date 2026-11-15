"""脱敏后的「微信支付」服务号消息样例，结构照真实消息抄的，只留解析用得到的节点。"""


def pay_xml(title, des, display_name="", transaction_id="4500000000202601010000000001", url=None):
    if url is None:
        url = (
            "https://tenpay.wechatpay.cn/cgi-bin/mmpayweb-bin/jumpuserroll?"
            f"trans_id={transaction_id}&accid=0000&req_source=1#wechat_pay"
        )
    tx_node = (
        f"<transaction_id><![CDATA[{transaction_id}]]></transaction_id>" if transaction_id else ""
    )
    return (
        '<msg> <appmsg appid="" sdkver="0"> '
        f"<title><![CDATA[{title}]]></title> <des><![CDATA[{des}]]></des> "
        f"<type>5</type> <url><![CDATA[{url}]]></url> "
        '<mmreader> <category type="0" count="1"> <name><![CDATA[微信支付]]></name> '
        f"<item> <title><![CDATA[{title}]]></title> <digest><![CDATA[{des}]]></digest> </item> "
        "</category> <publisher> <username><![CDATA[wxzhifu]]></username> "
        "<nickname><![CDATA[微信支付]]></nickname> </publisher> "
        "<template_header><title><![CDATA[微信支付凭证]]></title> "
        f"<display_name><![CDATA[{display_name}]]></display_name> {tx_node} </template_header> "
        "</mmreader> </appmsg> </msg>"
    )


ZH_BALANCE_MYR = pay_xml(
    "已支付¥6.52",
    "使用零钱支付¥6.52\n标价4.00马来西亚林吉特\n市场汇率 1马来西亚林吉特=1.646495人民币\n"
    "优惠汇率升级卡专享\n1马来西亚林吉特=1.631527人民币\n汇率优惠为你节省约0.06元",
    display_name="Laundro",
    transaction_id="4500000000202601010000000001",
)

ZH_CARD_FULLWIDTH = pay_xml(
    "已支付¥2879.10",
    "使用兴业银行储蓄卡(1234)支付￥2879.10",
    display_name="Example Education Dev",
    transaction_id="4200000001202609290000000001",
)

ZH_USD = pay_xml(
    "已支付¥36.20",
    "使用零钱支付¥36.20\n标价5.00美元",
    display_name="SOME US SHOP",
    transaction_id="4200000001202609290000000002",
)

ZH_PERSONAL = pay_xml(
    "已支付¥15.00",
    "收款方张三\n交易状态支付成功，对方已收款\n使用零钱支付¥15.00",
    display_name="",
    transaction_id="1000050001202609290000000003",
)

EN_CARD_MYR = pay_xml(
    "¥46.35 paid",
    "Paid by CIB Debit Card (1234)¥46.35\nPriceRM28.40\nMarket FX Rate1MYR=1.638553CNY\n"
    "DiscountFX Upgrade Card\n1MYR=1.632098CNY\nFX benefits saved you ¥0.18",
    display_name="DEMO KITCHEN(CITY)SDN.B",
    transaction_id="4200000000202601010000000002",
)

EN_PERSONAL = pay_xml(
    "¥0.01 paid",
    "Payee李四\nPaid by Balance¥0.01",
    display_name="",
    transaction_id="1000050000202601010000000003",
)

DAILY_REPORT = pay_xml(
    "昨日记账日报，点击查看详情",
    "昨日支出¥72.69，共3笔\n昨日入账¥469.13，共5笔",
    display_name="",
    transaction_id="",
    url="",
)

REFUND = pay_xml(
    "退款到账通知",
    "退款金额¥8.50\n商品详情某商品",
    display_name="",
    transaction_id="",
    url="",
)

FX_CARD = pay_xml(
    "汇率卡升级通知",
    "当前星级升级为5星汇率\n卡有效期2026.10.01-2026.10.11",
    display_name="",
    transaction_id="",
    url="",
)

NO_TX_NODE = pay_xml(
    "已支付¥8.50",
    "使用零钱支付¥8.50",
    display_name="MINI MART 01",
    transaction_id="",
    url="https://tenpay.wechatpay.cn/cgi-bin/mmpayweb-bin/jumpuserroll?trans_id=4500000999&accid=0000",
)
