// 自动记账入口的纯逻辑：不碰网络、不碰数据库，Deno（线上）和 vitest（本地测试）都能跑。
// 这个文件不能有任何 import。

export type TxType = 'expense' | 'income' | 'transfer'

export interface CategoryLite {
  id: string
  name: string
  type: string
  created_at: string
}

/** 和客户端 src/types/index.ts 的 SUPPORTED_CURRENCIES 保持一致。 */
export const SUPPORTED_CURRENCIES = [
  'CNY', 'MYR', 'SGD', 'USD', 'HKD', 'JPY', 'EUR', 'GBP', 'THB', 'KHR', 'NTD', 'AUD', 'MOP',
] as const

const MAX_ITEMS = 200
const MAX_TEXT = 120
const DEFAULT_TZ_OFFSET_MINUTES = 480 // 北京和吉隆坡都是 UTC+8
const FALLBACK_CATEGORY_NAMES = ['其它', '其他', 'other', 'others']

// 金额文字里的币种写法。顺序有讲究：长的在前，免得 "US$" 被 "$" 或 "S$" 抢先匹配。
const CURRENCY_MARKS: Array<[string, string]> = [
  ['MOP$', 'MOP'], ['NT$', 'NTD'], ['HK$', 'HKD'], ['US$', 'USD'], ['A$', 'AUD'], ['S$', 'SGD'],
  ['RMB', 'CNY'], ['CNY', 'CNY'], ['MYR', 'MYR'], ['SGD', 'SGD'], ['USD', 'USD'], ['HKD', 'HKD'],
  ['JPY', 'JPY'], ['EUR', 'EUR'], ['GBP', 'GBP'], ['THB', 'THB'], ['KHR', 'KHR'], ['NTD', 'NTD'],
  ['TWD', 'NTD'], ['AUD', 'AUD'], ['MOP', 'MOP'],
  ['RM', 'MYR'], ['¥', 'CNY'], ['￥', 'CNY'], ['€', 'EUR'], ['£', 'GBP'], ['฿', 'THB'],
]

function normalizeCurrency(code: unknown): string | null {
  if (typeof code !== 'string') return null
  const up = code.trim().toUpperCase()
  if (!up) return null
  const mapped = up === 'TWD' ? 'NTD' : up === 'RMB' ? 'CNY' : up
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(mapped) ? mapped : null
}

/** '12.345' → 1235（分）。按字符串四舍五入，不经过浮点乘法。 */
function centsFromDigits(digits: string): number {
  const [whole, frac = ''] = digits.split('.')
  const padded = (frac + '000').slice(0, 3)
  let cents = Number(whole) * 100 + Number(padded.slice(0, 2))
  if (Number(padded[2]) >= 5) cents += 1
  return cents
}

/**
 * 解析金额。数字直接用；文字里可以带币种（Wallet 给的是 "RM 12.50" 这种）。
 * 认不出币种时 currency 为 null，由调用方决定默认值；单独一个 "$" 不猜。
 * 金额必须大于 0，负号忽略。无法解析返回 null。
 */
export function parseAmount(input: unknown): { amount: number; currency: string | null } | null {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input === 0) return null
    const cents = centsFromDigits(Math.abs(input).toFixed(6))
    return cents > 0 ? { amount: cents / 100, currency: null } : null
  }
  if (typeof input !== 'string') return null
  const text = input.trim()
  if (!text) return null
  const m = text.replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  if (!m) return null
  const cents = centsFromDigits(m[0])
  if (cents <= 0) return null
  const upper = text.toUpperCase()
  let currency: string | null = null
  for (const [mark, code] of CURRENCY_MARKS) {
    if (upper.includes(mark)) {
      currency = code
      break
    }
  }
  return { amount: cents / 100, currency }
}

// 付款通知的固定句式（手机把通知原文转发过来时用）。只认「我付了钱」这一种，
// 收款、充值、优惠推送都不匹配，宁可不记也不乱记。
//   Touch 'n Go 中文：您已支付了RM12.30给Demo Mall。
//   Touch 'n Go 繁体（按简体句式推的，没见过真实样本）：您已支付了RM12.30給Demo Mall。
//   Touch 'n Go 英文（按中文句式推的，没见过真实样本）：You have paid RM12.30 to Demo Mall.
//   Touch 'n Go DuitNow 转账（2026-11-17 真机看到，扫商户的 DuitNow 码付款也是这句）：您已成功转账 RM 45.00 给 DEMO TRADING。
//     繁体「轉賬 / 轉帳」和英文「You have successfully transferred … to …」是推的，没见过真实样本。
const NOTICE_PATTERNS: RegExp[] = [
  /您已(?:支付了|成功(?:转账|轉賬|轉帳))\s*([A-Za-z$¥￥]{1,4})\s*([\d,]+(?:\.\d+)?)\s*[给給]\s*(.+?)\s*[。.]?\s*$/m,
  /You(?:'ve| have)? (?:paid|successfully transferred)\s*([A-Za-z$¥￥]{1,4})\s*([\d,]+(?:\.\d+)?)\s*to\s*(.+?)\s*\.?\s*$/im,
]

/** 从转发过来的付款通知文字里取金额、币种、商户。不是付款通知返回 null。 */
export function parseNotice(text: unknown): { amount: number; currency: string; merchant: string } | null {
  if (typeof text !== 'string' || !text.trim()) return null
  for (const pattern of NOTICE_PATTERNS) {
    const m = text.match(pattern)
    if (!m) continue
    const parsed = parseAmount(`${m[1]} ${m[2]}`)
    if (!parsed || !parsed.currency) return null
    return { amount: parsed.amount, currency: parsed.currency, merchant: m[3].trim().slice(0, MAX_TEXT) }
  }
  return null
}

/** 商户名归一：用来当 merchant_rules 的键。客户端 src/lib/merchantRules.ts 有同样的实现。 */
export function merchantKey(name: unknown): string {
  if (typeof name !== 'string') return ''
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

function localDate(d: Date, tzOffsetMinutes: number): string {
  return new Date(d.getTime() + tzOffsetMinutes * 60_000).toISOString().slice(0, 10)
}

/** 定下这笔账的日期（本地日）和发生时刻（UTC ISO）。 */
export function resolveWhen(
  item: { date?: unknown; occurred_at?: unknown },
  now: Date,
  tzOffsetMinutes: number = DEFAULT_TZ_OFFSET_MINUTES,
): { date: string; occurred_at: string } {
  let when: Date | null = null
  if (typeof item.occurred_at === 'string' && item.occurred_at.trim()) {
    const t = new Date(item.occurred_at)
    if (!Number.isNaN(t.getTime())) when = t
  }
  const explicit = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? item.date : null
  const moment = when ?? now
  return { date: explicit ?? localDate(moment, tzOffsetMinutes), occurred_at: moment.toISOString() }
}

/**
 * 选类目：商户记忆 → 请求里带的类目名 → 「其它」（没有就用这个类型里最早建的那个）并标待分类。
 * 用户连这个类型的类目都没有时返回 null。
 */
export function pickCategory(
  tx: { type: string; merchant: string; hint: string },
  categories: CategoryLite[],
  rules: Map<string, string>,
): { category_id: string; needs_review: boolean; via: 'rule' | 'hint' | 'fallback' } | null {
  const sameType = categories.filter((c) => c.type === tx.type)
  if (sameType.length === 0) return null

  const key = merchantKey(tx.merchant)
  const ruled = key ? rules.get(key) : undefined
  if (ruled && sameType.some((c) => c.id === ruled)) {
    return { category_id: ruled, needs_review: false, via: 'rule' }
  }

  const hint = tx.hint.trim().toLowerCase()
  if (hint) {
    const hit = sameType.find((c) => c.name.trim().toLowerCase() === hint)
    if (hit) return { category_id: hit.id, needs_review: false, via: 'hint' }
  }

  const other = sameType.find((c) => FALLBACK_CATEGORY_NAMES.includes(c.name.trim().toLowerCase()))
  const oldest = [...sameType].sort((a, b) => a.created_at.localeCompare(b.created_at))[0]
  return { category_id: (other ?? oldest).id, needs_review: true, via: 'fallback' }
}

/** 流水的备注：商户 · 标价。 */
export function describeTx(merchant: string, note: string): string | null {
  const parts = [merchant, note].filter((s) => s)
  return parts.length ? parts.join(' · ') : null
}

export type NormalizedItem =
  | {
      ok: true
      external_id: string | null
      type: TxType
      amount: number
      currency: string
      merchant: string
      note: string
      category_hint: string
      date: string
      occurred_at: string
    }
  | { ok: false; external_id: string | null; error: 'bad_item' | 'bad_amount' | 'unsupported_currency' | 'bad_type' | 'not_a_payment' }

export interface LearnItem {
  merchant: string
  date: string
  amounts: Array<{ cents: number; currency: string }>
}

export type NormalizedRequest =
  | { ok: true; mode: 'ingest'; source: string; items: NormalizedItem[]; learnItems: [] }
  | { ok: true; mode: 'learn'; source: string; items: []; learnItems: LearnItem[] }
  | { ok: false; error: 'bad_body' | 'no_items' | 'too_many_items' | 'bad_source' }

function text(v: unknown): string {
  return typeof v === 'string' ? v.trim().slice(0, MAX_TEXT) : ''
}

// 金额里认不出币种时的默认值。Apple Pay 刷的是用户在马来西亚用的卡，Wallet 给的金额可能只有数字。
const DEFAULT_CURRENCY_BY_SOURCE: Record<string, string> = { applepay: 'MYR' }

function normalizeItem(raw: unknown, now: Date, source: string): NormalizedItem {
  if (typeof raw !== 'object' || raw === null) return { ok: false, external_id: null, error: 'bad_item' }
  const r = raw as Record<string, unknown>
  const external_id = typeof r.external_id === 'string' && r.external_id.trim() ? r.external_id.trim().slice(0, 100) : null

  // 没给 amount 但给了通知原文（text）：从原文里取金额和商户
  const hasAmount = r.amount !== undefined && r.amount !== null && r.amount !== ''
  const notice = !hasAmount && typeof r.text === 'string' ? parseNotice(r.text) : null
  if (!hasAmount && typeof r.text === 'string' && !notice) return { ok: false, external_id, error: 'not_a_payment' }
  const parsed = notice ? { amount: notice.amount, currency: notice.currency } : parseAmount(r.amount)
  if (!parsed) return { ok: false, external_id, error: 'bad_amount' }

  let currency: string | null
  if (typeof r.currency === 'string' && r.currency.trim()) {
    currency = normalizeCurrency(r.currency)
    if (!currency) return { ok: false, external_id, error: 'unsupported_currency' }
  } else {
    currency = parsed.currency ?? DEFAULT_CURRENCY_BY_SOURCE[source] ?? 'CNY'
  }

  const type = r.type === undefined || r.type === null || r.type === '' ? 'expense' : r.type
  if (type !== 'expense' && type !== 'income' && type !== 'transfer') {
    return { ok: false, external_id, error: 'bad_type' }
  }

  const when = resolveWhen(r, now)
  return {
    ok: true,
    external_id,
    type,
    amount: parsed.amount,
    currency,
    merchant: text(r.merchant) || (notice ? notice.merchant : ''),
    note: text(r.note),
    category_hint: text(r.category),
    date: when.date,
    occurred_at: when.occurred_at,
  }
}

function normalizeLearnItem(raw: unknown): LearnItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const merchant = text(r.merchant)
  if (!merchant || typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) return null
  const amounts: LearnItem['amounts'] = []
  for (const [amountKey, currencyKey] of [['amount', 'currency'], ['alt_amount', 'alt_currency']] as const) {
    const parsed = parseAmount(r[amountKey])
    const currency = normalizeCurrency(r[currencyKey])
    if (parsed && currency) amounts.push({ cents: Math.round(parsed.amount * 100), currency })
  }
  return amounts.length ? { merchant, date: r.date, amounts } : null
}

/** 校验并整理请求体。整体不合法返回 ok:false；单条不合法只标在那一条上。 */
export function normalizeRequest(body: unknown, now: Date): NormalizedRequest {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { ok: false, error: 'bad_body' }
  const b = body as Record<string, unknown>

  const source = b.source === undefined || b.source === null || b.source === '' ? 'api' : b.source
  if (typeof source !== 'string' || !/^[a-z0-9_-]{1,24}$/.test(source)) return { ok: false, error: 'bad_source' }

  const rawItems: unknown[] = Array.isArray(b.items) ? b.items : 'items' in b ? [] : [b]
  if (rawItems.length === 0) return { ok: false, error: 'no_items' }

  if (b.mode === 'learn') {
    const learnItems = rawItems.map(normalizeLearnItem).filter((x): x is LearnItem => x !== null)
    return { ok: true, mode: 'learn', source, items: [], learnItems }
  }

  if (rawItems.length > MAX_ITEMS) return { ok: false, error: 'too_many_items' }
  return { ok: true, mode: 'ingest', source, items: rawItems.map((it) => normalizeItem(it, now, source)), learnItems: [] }
}

export interface TxLite {
  date: string
  amount: number
  currency: string
  category_id: string
  type: string
  source: string | null
}

/**
 * 从「历史付款」和「用户手记的流水」里学商户归类：同一天、同金额（实扣或标价任一对上）算同一笔。
 * 一笔付款对上的手记流水如果类目不唯一就不算；一个商户按多数票定类目，平票不学。
 * 已有规则的商户不动。
 */
export function learnRules(
  items: LearnItem[],
  txs: TxLite[],
  categories: CategoryLite[],
  existingKeys: Set<string>,
): Array<{ merchant_key: string; category_id: string }> {
  const expenseCats = new Set(categories.filter((c) => c.type === 'expense').map((c) => c.id))
  const index = new Map<string, Set<string>>()
  for (const t of txs) {
    if (t.type !== 'expense' || t.source !== null || !expenseCats.has(t.category_id)) continue
    const currency = normalizeCurrency(t.currency)
    if (!currency) continue
    const k = `${t.date}|${currency}|${Math.round(t.amount * 100)}`
    if (!index.has(k)) index.set(k, new Set())
    index.get(k)!.add(t.category_id)
  }

  const votes = new Map<string, Map<string, number>>()
  for (const item of items) {
    const key = merchantKey(item.merchant)
    if (!key || existingKeys.has(key)) continue
    const matched = new Set<string>()
    for (const a of item.amounts) {
      for (const c of index.get(`${item.date}|${a.currency}|${a.cents}`) ?? []) matched.add(c)
    }
    if (matched.size !== 1) continue
    const category = [...matched][0]
    if (!votes.has(key)) votes.set(key, new Map())
    const tally = votes.get(key)!
    tally.set(category, (tally.get(category) ?? 0) + 1)
  }

  const out: Array<{ merchant_key: string; category_id: string }> = []
  for (const [key, tally] of votes) {
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1])
    if (ranked.length > 1 && ranked[0][1] === ranked[1][1]) continue
    out.push({ merchant_key: key, category_id: ranked[0][0] })
  }
  return out
}
