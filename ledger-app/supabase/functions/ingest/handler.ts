// 自动记账入口的请求处理。数据库访问全部走 Db 接口：线上由 index.ts 用 service role 实现，
// 测试里用内存假库。除了 ./logic.ts 不能有别的 import。

import {
  describeTx,
  learnRules,
  normalizeRequest,
  pickCategory,
  type CategoryLite,
  type TxLite,
} from './logic.ts'

/** 写进 transactions 的一行。 */
export interface IngestRow {
  user_id: string
  type: string
  amount: number
  currency: string
  category_id: string
  description: string | null
  date: string
  exchange_rate: number | null
  source: string
  external_id: string | null
  merchant: string | null
  needs_review: boolean
  created_at: string
  updated_at: string
}

export interface Db {
  findUserByTokenHash(hash: string): Promise<{ user_id: string; token_id: string } | null>
  touchToken(tokenId: string): Promise<void>
  listCategories(userId: string): Promise<CategoryLite[]>
  listRules(userId: string): Promise<Array<{ merchant_key: string; category_id: string }>>
  findExistingExternalIds(userId: string, source: string, ids: string[]): Promise<string[]>
  insertTransaction(row: IngestRow): Promise<{ status: 'inserted' } | { status: 'duplicate' } | { status: 'error'; error: string }>
  listTransactionsBetween(userId: string, from: string, to: string): Promise<TxLite[]>
  upsertRules(userId: string, rules: Array<{ merchant_key: string; category_id: string }>): Promise<void>
  /** 1 人民币 = 多少该币种（和客户端 exchange_rate 的含义一致）。拿不到返回 null。 */
  getRate(currency: string): Promise<number | null>
}

export interface IngestRequest {
  method: string
  header(name: string): string | null
  body: unknown
}

export interface IngestResponse {
  status: number
  body: Record<string, unknown>
}

interface ItemResult {
  external_id: string | null
  status: 'inserted' | 'duplicate' | 'error'
  category?: string
  needs_review?: boolean
  error?: string
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function readToken(req: IngestRequest): string | null {
  const direct = req.header('x-ledger-token')
  if (direct && direct.trim()) return direct.trim()
  const auth = req.header('authorization')
  const m = auth ? auth.match(/^Bearer\s+(.+)$/i) : null
  return m ? m[1].trim() : null
}

function money(amount: number): string {
  return amount.toFixed(2)
}

export async function handleIngest(req: IngestRequest, db: Db, now: Date): Promise<IngestResponse> {
  if (req.method !== 'POST') return { status: 405, body: { ok: false, error: 'method_not_allowed' } }

  const token = readToken(req)
  if (!token) return { status: 401, body: { ok: false, error: 'missing_token' } }
  const who = await db.findUserByTokenHash(await sha256Hex(token))
  if (!who) return { status: 401, body: { ok: false, error: 'bad_token' } }

  const parsed = normalizeRequest(req.body, now)
  if (!parsed.ok) return { status: 400, body: { ok: false, error: parsed.error } }

  await db.touchToken(who.token_id)
  const categories = await db.listCategories(who.user_id)
  const ruleRows = await db.listRules(who.user_id)

  if (parsed.mode === 'learn') {
    const items = parsed.learnItems
    if (items.length === 0) return { status: 200, body: { ok: true, learned: 0 } }
    const dates = items.map((i) => i.date).sort()
    const history = await db.listTransactionsBetween(who.user_id, dates[0], dates[dates.length - 1])
    const learned = learnRules(items, history, categories, new Set(ruleRows.map((r) => r.merchant_key)))
    if (learned.length) await db.upsertRules(who.user_id, learned)
    return { status: 200, body: { ok: true, learned: learned.length } }
  }

  const rules = new Map(ruleRows.map((r) => [r.merchant_key, r.category_id]))
  const categoryName = new Map(categories.map((c) => [c.id, c.name]))

  const ids = parsed.items.flatMap((i) => (i.ok && i.external_id ? [i.external_id] : []))
  const seen = new Set(ids.length ? await db.findExistingExternalIds(who.user_id, parsed.source, ids) : [])

  const rateCache = new Map<string, number | null>()
  async function rateFor(currency: string): Promise<number | null> {
    if (currency === 'CNY') return null // 和本位币相同，不存快照
    if (!rateCache.has(currency)) {
      let rate: number | null = null
      try {
        rate = await db.getRate(currency)
      } catch {
        rate = null
      }
      rateCache.set(currency, rate && rate > 0 ? rate : null)
    }
    return rateCache.get(currency) ?? null
  }

  const results: ItemResult[] = []
  let lastInserted: { category: string; amount: number; currency: string; merchant: string } | null = null

  for (const item of parsed.items) {
    if (!item.ok) {
      results.push({ external_id: item.external_id, status: 'error', error: item.error })
      continue
    }
    if (item.external_id && seen.has(item.external_id)) {
      results.push({ external_id: item.external_id, status: 'duplicate' })
      continue
    }
    const picked = pickCategory({ type: item.type, merchant: item.merchant, hint: item.category_hint }, categories, rules)
    if (!picked) {
      results.push({ external_id: item.external_id, status: 'error', error: 'no_category' })
      continue
    }
    const row: IngestRow = {
      user_id: who.user_id,
      type: item.type,
      amount: item.amount,
      currency: item.currency,
      category_id: picked.category_id,
      description: describeTx(item.merchant, item.note),
      date: item.date,
      exchange_rate: await rateFor(item.currency),
      source: parsed.source,
      external_id: item.external_id,
      merchant: item.merchant || null,
      needs_review: picked.needs_review,
      created_at: item.occurred_at,
      updated_at: now.toISOString(),
    }
    const outcome = await db.insertTransaction(row)
    if (outcome.status === 'error') {
      results.push({ external_id: item.external_id, status: 'error', error: outcome.error })
      continue
    }
    if (item.external_id) seen.add(item.external_id)
    if (outcome.status === 'duplicate') {
      results.push({ external_id: item.external_id, status: 'duplicate' })
      continue
    }
    const category = categoryName.get(picked.category_id) ?? ''
    results.push({ external_id: item.external_id, status: 'inserted', category, needs_review: picked.needs_review })
    lastInserted = { category, amount: item.amount, currency: item.currency, merchant: item.merchant }
  }

  const inserted = results.filter((r) => r.status === 'inserted').length
  const duplicates = results.filter((r) => r.status === 'duplicate').length
  const errors = results.filter((r) => r.status === 'error').length

  let message: string
  if (parsed.items.length === 1) {
    if (lastInserted) {
      message = ['已记', lastInserted.category, `${lastInserted.currency} ${money(lastInserted.amount)}`, lastInserted.merchant]
        .filter((s) => s)
        .join(' ')
    } else if (duplicates) {
      message = '这笔已经记过了'
    } else {
      message = `没记上：${results[0]?.error ?? 'unknown'}`
    }
  } else {
    const parts = [`新入账 ${inserted} 笔`]
    if (duplicates) parts.push(`已存在 ${duplicates} 笔`)
    if (errors) parts.push(`失败 ${errors} 笔`)
    message = parts.join('，')
  }

  return { status: 200, body: { ok: true, inserted, duplicates, errors, results, message } }
}
