import { beforeEach, describe, expect, it } from 'vitest'
import { handleIngest, sha256Hex, type Db, type IngestRow } from './handler.ts'
import type { CategoryLite, TxLite } from './logic.ts'

const TOKEN = 'lgr_test-token'
const NOW = new Date('2026-11-15T02:00:00Z')

const cats: CategoryLite[] = [
  { id: 'c-food', name: '三餐', type: 'expense', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-daily', name: '日用品', type: 'expense', created_at: '2026-01-02T00:00:00Z' },
  { id: 'c-other', name: '其它', type: 'expense', created_at: '2026-01-03T00:00:00Z' },
]

class FakeDb implements Db {
  tokenHash = ''
  touched: string[] = []
  categories = cats
  rules: Array<{ merchant_key: string; category_id: string }> = [{ merchant_key: 'DEMO CAFE', category_id: 'c-food' }]
  rows: IngestRow[] = []
  history: TxLite[] = []
  rates: Record<string, number> = { MYR: 0.61 }
  failInsert: string | null = null
  historyRange: [string, string] | null = null

  async findUserByTokenHash(hash: string) {
    return hash === this.tokenHash ? { user_id: 'u1', token_id: 'tok1' } : null
  }
  async touchToken(id: string) {
    this.touched.push(id)
  }
  async listCategories() {
    return this.categories
  }
  async listRules() {
    return this.rules
  }
  async findExistingExternalIds(_user: string, source: string, ids: string[]) {
    return this.rows.filter((r) => r.source === source && r.external_id && ids.includes(r.external_id)).map((r) => r.external_id!)
  }
  async insertTransaction(row: IngestRow) {
    if (this.failInsert) return { status: 'error' as const, error: this.failInsert }
    if (row.external_id && this.rows.some((r) => r.source === row.source && r.external_id === row.external_id)) {
      return { status: 'duplicate' as const }
    }
    this.rows.push(row)
    return { status: 'inserted' as const }
  }
  async listTransactionsBetween(_user: string, from: string, to: string) {
    this.historyRange = [from, to]
    return this.history
  }
  async upsertRules(_user: string, rules: Array<{ merchant_key: string; category_id: string }>) {
    this.rules = [...this.rules, ...rules]
  }
  async getRate(currency: string) {
    return this.rates[currency] ?? null
  }
}

let db: FakeDb

function req(body: unknown, headers: Record<string, string> = { authorization: `Bearer ${TOKEN}` }, method = 'POST') {
  return { method, header: (name: string) => headers[name.toLowerCase()] ?? null, body }
}

beforeEach(async () => {
  db = new FakeDb()
  db.tokenHash = await sha256Hex(TOKEN)
})

describe('sha256Hex', () => {
  it('matches the known digest', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('auth', () => {
  it('rejects a missing or wrong token', async () => {
    expect((await handleIngest(req({ amount: 5 }, {}), db, NOW)).status).toBe(401)
    expect((await handleIngest(req({ amount: 5 }, { authorization: 'Bearer lgr_nope' }), db, NOW)).status).toBe(401)
    expect(db.rows).toHaveLength(0)
  })

  it('accepts the token in x-ledger-token', async () => {
    const res = await handleIngest(req({ amount: 5 }, { 'x-ledger-token': TOKEN }), db, NOW)
    expect(res.status).toBe(200)
    expect(db.touched).toEqual(['tok1'])
  })

  it('only allows POST', async () => {
    expect((await handleIngest(req(null, {}, 'GET'), db, NOW)).status).toBe(405)
  })

  it('answers 400 for a malformed body', async () => {
    const res = await handleIngest(req({ source: 'wechat', items: [] }), db, NOW)
    expect(res.status).toBe(400)
    expect(res.body).toMatchObject({ ok: false, error: 'no_items' })
  })
})

describe('ingest', () => {
  const wechatItem = {
    external_id: 'tx-1',
    amount: '30.84',
    currency: 'CNY',
    merchant: 'DEMO CAFE',
    note: 'RM18.90',
    date: '2026-11-14',
    occurred_at: '2026-11-14T13:15:15+08:00',
    type: 'expense',
  }

  it('writes a row with the remembered category', async () => {
    const res = await handleIngest(req({ source: 'wechat', items: [wechatItem] }), db, NOW)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, inserted: 1, duplicates: 0, errors: 0 })
    expect(db.rows).toEqual([
      {
        user_id: 'u1',
        type: 'expense',
        amount: 30.84,
        currency: 'CNY',
        category_id: 'c-food',
        description: 'DEMO CAFE · RM18.90',
        date: '2026-11-14',
        exchange_rate: null,
        source: 'wechat',
        external_id: 'tx-1',
        merchant: 'DEMO CAFE',
        needs_review: false,
        created_at: '2026-11-14T05:15:15.000Z',
        updated_at: NOW.toISOString(),
      },
    ])
  })

  it('does not write the same payment twice', async () => {
    await handleIngest(req({ source: 'wechat', items: [wechatItem] }), db, NOW)
    const res = await handleIngest(req({ source: 'wechat', items: [wechatItem, { ...wechatItem, external_id: 'tx-2' }] }), db, NOW)
    expect(res.body).toMatchObject({ ok: true, inserted: 1, duplicates: 1 })
    expect(db.rows.map((r) => r.external_id)).toEqual(['tx-1', 'tx-2'])
  })

  it('treats a repeated id inside one request as a duplicate', async () => {
    const res = await handleIngest(req({ source: 'wechat', items: [wechatItem, wechatItem] }), db, NOW)
    expect(res.body).toMatchObject({ inserted: 1, duplicates: 1 })
  })

  it('flags an unknown merchant for review under 其它', async () => {
    const res = await handleIngest(req({ source: 'wechat', items: [{ ...wechatItem, merchant: 'NEW SHOP' }] }), db, NOW)
    expect(db.rows[0]).toMatchObject({ category_id: 'c-other', needs_review: true })
    expect(res.body).toMatchObject({ results: [{ external_id: 'tx-1', status: 'inserted', category: '其它', needs_review: true }] })
  })

  it('snapshots the exchange rate for a foreign-currency payment', async () => {
    await handleIngest(req({ source: 'applepay', amount: 'RM 12.50', merchant: 'Shell', category: '日用品' }), db, NOW)
    expect(db.rows[0]).toMatchObject({
      amount: 12.5,
      currency: 'MYR',
      exchange_rate: 0.61,
      category_id: 'c-daily',
      source: 'applepay',
      external_id: null,
      date: '2026-11-15',
    })
  })

  it('leaves the rate empty when it cannot be fetched', async () => {
    db.rates = {}
    await handleIngest(req({ source: 'applepay', amount: 'RM 12.50' }), db, NOW)
    expect(db.rows[0].exchange_rate).toBeNull()
  })

  it('reports per-item problems and still writes the good ones', async () => {
    const res = await handleIngest(req({ source: 'wechat', items: [{ amount: 'abc', external_id: 'bad' }, wechatItem] }), db, NOW)
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, inserted: 1, errors: 1 })
    expect((res.body as { results: unknown[] }).results[0]).toMatchObject({ external_id: 'bad', status: 'error', error: 'bad_amount' })
  })

  it('reports a database failure on the item', async () => {
    db.failInsert = 'boom'
    const res = await handleIngest(req({ source: 'wechat', items: [wechatItem] }), db, NOW)
    expect(res.body).toMatchObject({ ok: true, inserted: 0, errors: 1 })
    expect((res.body as { results: unknown[] }).results[0]).toMatchObject({ status: 'error', error: 'boom' })
  })

  it('says so when the user has no category to file under', async () => {
    db.categories = []
    const res = await handleIngest(req({ source: 'wechat', items: [wechatItem] }), db, NOW)
    expect((res.body as { results: unknown[] }).results[0]).toMatchObject({ status: 'error', error: 'no_category' })
  })

  it('gives a one-line message for a single item', async () => {
    const res = await handleIngest(req({ source: 'applepay', amount: 'RM 12.50', merchant: 'Shell', category: '日用品' }), db, NOW)
    expect((res.body as { message: string }).message).toBe('已记 日用品 MYR 12.50 Shell')
  })

  it('summarises a batch', async () => {
    const res = await handleIngest(req({ source: 'wechat', items: [wechatItem, { ...wechatItem, external_id: 'tx-2' }] }), db, NOW)
    expect((res.body as { message: string }).message).toBe('新入账 2 笔')
  })
})

describe('learn', () => {
  it('writes rules learned from hand-entered history and inserts nothing', async () => {
    db.history = [
      { date: '2026-10-03', amount: 4, currency: 'MYR', category_id: 'c-daily', type: 'expense', source: null },
      { date: '2026-10-02', amount: 24.47, currency: 'CNY', category_id: 'c-food', type: 'expense', source: null },
    ]
    const res = await handleIngest(
      req({
        mode: 'learn',
        items: [
          { merchant: 'Laundro', date: '2026-10-03', amount: '6.52', currency: 'CNY', alt_amount: '4.00', alt_currency: 'MYR' },
          { merchant: 'NOODLE BAR', date: '2026-10-02', amount: '24.47', currency: 'CNY' },
          { merchant: 'DEMO CAFE', date: '2026-10-02', amount: '24.47', currency: 'CNY' },
          { merchant: 'Nobody', date: '2026-09-01', amount: '1.00', currency: 'CNY' },
        ],
      }),
      db,
      NOW,
    )
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, learned: 2 })
    expect(db.rows).toHaveLength(0)
    expect(db.rules).toEqual([
      { merchant_key: 'DEMO CAFE', category_id: 'c-food' },
      { merchant_key: 'LAUNDRO', category_id: 'c-daily' },
      { merchant_key: 'NOODLE BAR', category_id: 'c-food' },
    ])
    expect(db.historyRange).toEqual(['2026-09-01', '2026-10-03'])
  })

  it('handles a learn request with nothing usable', async () => {
    const res = await handleIngest(req({ mode: 'learn', items: [{ merchant: '', date: 'x' }] }), db, NOW)
    expect(res.body).toMatchObject({ ok: true, learned: 0 })
  })
})
