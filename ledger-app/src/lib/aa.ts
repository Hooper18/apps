// AA（均摊）：我垫付了一整笔，账本里只该记我自己那一份。
// 朋友转回来的钱不记，所以把这笔的金额直接改成「总额 ÷ 人数」，总额和人数留在备注里。

const AA_NOTE = /(?:\s*·\s*)?AA \d+人 总额 \S+$/

/** 每人一份的金额，四舍五入到分。人数不是 ≥2 的整数时原样返回。 */
export function splitShare(total: number, people: number): number {
  if (!Number.isInteger(people) || people < 2) return total
  return Math.round((total * 100) / people + Number.EPSILON) / 100
}

/** 记账页金额框里用的字符串：最多两位小数，去掉多余的 0。 */
export function amountText(value: number): string {
  return String(Math.round(value * 100 + Number.EPSILON) / 100)
}

/** 在备注末尾记下「AA N人 总额 X」。已经有一条这样的记录就替换掉。 */
export function withAaNote(note: string, total: number, people: number, symbol: string): string {
  const base = note.trim().replace(AA_NOTE, '').trim()
  const tag = `AA ${people}人 总额 ${symbol}${total.toFixed(2)}`
  return base ? `${base} · ${tag}` : tag
}
