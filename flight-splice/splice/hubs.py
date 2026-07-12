"""候选中转枢纽及签证元数据（中国普通护照视角）。

选取标准：从中国出发有低价干线，且到冰岛 KEF 有低成本/直飞航线的欧洲及中东枢纽。
自拼中转必须离开转机区取行李，法律上等同入境中转国，签证是硬约束：
- SCHENGEN：去冰岛本身就要申根签，申根枢纽顺路零额外成本
- VISA_FREE：对中国护照免签入境（阿联酋/卡塔尔）
- UK：需要额外英国签证
- OTHER_VISA：需要额外第三国签证
"""

from dataclasses import dataclass, field
from enum import Enum


class VisaCat(Enum):
    SCHENGEN = "申根"
    VISA_FREE = "免签"
    UK = "英签"
    OTHER_VISA = "他国签证"


@dataclass(frozen=True)
class Hub:
    code: str
    city: str
    country: str
    visa: VisaCat
    note: str = field(default="")


HUBS: list[Hub] = [
    # 申根区（去冰岛顺路，无额外签证成本）
    Hub("FCO", "罗马", "意大利", VisaCat.SCHENGEN, "用户已验证的低价样例"),
    Hub("MXP", "米兰", "意大利", VisaCat.SCHENGEN, "Wizz/easyJet 基地"),
    Hub("BUD", "布达佩斯", "匈牙利", VisaCat.SCHENGEN, "上海有直飞，Wizz 大本营"),
    Hub("VIE", "维也纳", "奥地利", VisaCat.SCHENGEN, ""),
    Hub("WAW", "华沙", "波兰", VisaCat.SCHENGEN, "Wizz 基地"),
    Hub("PRG", "布拉格", "捷克", VisaCat.SCHENGEN, ""),
    Hub("ATH", "雅典", "希腊", VisaCat.SCHENGEN, ""),
    Hub("BCN", "巴塞罗那", "西班牙", VisaCat.SCHENGEN, "Vueling 基地"),
    Hub("MAD", "马德里", "西班牙", VisaCat.SCHENGEN, ""),
    Hub("CDG", "巴黎", "法国", VisaCat.SCHENGEN, ""),
    Hub("AMS", "阿姆斯特丹", "荷兰", VisaCat.SCHENGEN, ""),
    Hub("FRA", "法兰克福", "德国", VisaCat.SCHENGEN, ""),
    Hub("MUC", "慕尼黑", "德国", VisaCat.SCHENGEN, ""),
    Hub("BER", "柏林", "德国", VisaCat.SCHENGEN, "easyJet 基地"),
    Hub("CPH", "哥本哈根", "丹麦", VisaCat.SCHENGEN, "北欧去 KEF 便宜"),
    Hub("OSL", "奥斯陆", "挪威", VisaCat.SCHENGEN, ""),
    Hub("ARN", "斯德哥尔摩", "瑞典", VisaCat.SCHENGEN, ""),
    Hub("HEL", "赫尔辛基", "芬兰", VisaCat.SCHENGEN, "芬航上海直飞"),
    Hub("ZRH", "苏黎世", "瑞士", VisaCat.SCHENGEN, ""),
    # 免签（对中国护照免签入境，可自拼）
    Hub("DXB", "迪拜", "阿联酋", VisaCat.VISA_FREE, "阿联酋对中国免签"),
    Hub("AUH", "阿布扎比", "阿联酋", VisaCat.VISA_FREE, ""),
    Hub("DOH", "多哈", "卡塔尔", VisaCat.VISA_FREE, "卡塔尔对中国免签"),
    # 需额外签证（默认过滤，--all-visa 才纳入）
    Hub("LGW", "伦敦", "英国", VisaCat.UK, "easyJet 去 KEF 主力机场"),
    Hub("IST", "伊斯坦布尔", "土耳其", VisaCat.OTHER_VISA, "土耳其需电子签"),
]
