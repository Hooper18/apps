import { describe, expect, it } from 'vitest'
import {
  describeTx,
  learnRules,
  merchantKey,
  normalizeRequest,
  parseAmount,
  parseNotice,
  pickCategory,
  resolveWhen,
  type CategoryLite,
} from './logic.ts'

const cats: CategoryLite[] = [
  { id: 'c-food', name: '三餐', type: 'expense', created_at: '2026-01-01T00:00:00Z' },
  { id: 'c-daily', name: '日用品', type: 'expense', created_at: '2026-01-02T00:00:00Z' },
  { id: 'c-other', name: '其它', type: 'expense', created_at: '2026-01-03T00:00:00Z' },
  { id: 'c-salary', name: '工资', type: 'income', created_at: '2026-01-04T00:00:00Z' },
]

describe('parseAmount', () => {
  it('takes plain numbers', () => {
    expect(parseAmount(30.84)).toEqual({ amount: 30.84, currency: null })
    expect(parseAmount('46.35')).toEqual({ amount: 46.35, currency: null })
  })

  it('reads the currency out of Wallet-style text', () => {
    expect(parseAmount('RM 12.50')).toEqual({ amount: 12.5, currency: 'MYR' })
    expect(parseAmount('RM12.50')).toEqual({ amount: 12.5, currency: 'MYR' })
    expect(parseAmount('MYR 1,234.00')).toEqual({ amount: 1234, currency: 'MYR' })
    expect(parseAmount('¥30.84')).toEqual({ amount: 30.84, currency: 'CNY' })
    expect(parseAmount('￥30.84')).toEqual({ amount: 30.84, currency: 'CNY' })
    expect(parseAmount('12.00 SGD')).toEqual({ amount: 12, currency: 'SGD' })
    expect(parseAmount('S$ 8')).toEqual({ amount: 8, currency: 'SGD' })
    expect(parseAmount('US$5.00')).toEqual({ amount: 5, currency: 'USD' })
    expect(parseAmount('HK$ 20')).toEqual({ amount: 20, currency: 'HKD' })
  })

  it('leaves a bare dollar sign undecided', () => {
    expect(parseAmount('$5.00')).toEqual({ amount: 5, currency: null })
  })

  it('treats a negative amount as its size', () => {
    expect(parseAmount('-RM 12.50')).toEqual({ amount: 12.5, currency: 'MYR' })
  })

  it('rounds to cents', () => {
    expect(parseAmount('12.345')).toEqual({ amount: 12.35, currency: null })
  })

  it('rejects zero, empty and non-numeric input', () => {
    expect(parseAmount(0)).toBeNull()
    expect(parseAmount('RM 0.00')).toBeNull()
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('abc')).toBeNull()
    expect(parseAmount(null)).toBeNull()
    expect(parseAmount(Number.NaN)).toBeNull()
  })
})

describe('parseNotice', () => {
  it('reads a Touch n Go payment notice in Chinese', () => {
    expect(parseNotice('您已支付了RM12.30给Demo Mall。')).toEqual({ amount: 12.30, currency: 'MYR', merchant: 'Demo Mall' })
    expect(parseNotice('  您已支付了 RM 1,234.00 给 Demo Shop Sdn Bhd。 ')).toEqual({
      amount: 1234,
      currency: 'MYR',
      merchant: 'Demo Shop Sdn Bhd',
    })
  })

  it('reads the Traditional Chinese wording', () => {
    // 按简体句式推的（给 → 給），没见过真实样本
    expect(parseNotice('您已支付了RM12.30給Demo Mall。')).toEqual({ amount: 12.30, currency: 'MYR', merchant: 'Demo Mall' })
    expect(parseNotice('自動付款\n您已支付了 RM 5.00 給 Demo Cafe。')).toEqual({ amount: 5, currency: 'MYR', merchant: 'Demo Cafe' })
  })

  it('reads a DuitNow transfer notice (QR payments to shops arrive as transfers)', () => {
    // 2026-11-17 真机看到的句式（标题「DuitNow转账成功！」，正文如下），商户名已换成假的
    expect(parseNotice('您已成功转账 RM 45.00 给 DEMO TRADING。')).toEqual({ amount: 45, currency: 'MYR', merchant: 'DEMO TRADING' })
    expect(parseNotice('DuitNow转账成功！\n您已成功转账 RM 45.00 给 DEMO TRADING。')).toEqual({
      amount: 45,
      currency: 'MYR',
      merchant: 'DEMO TRADING',
    })
    // 繁体和英文按上面推的，没见过真实样本
    expect(parseNotice('您已成功轉賬 RM 8.50 給 Demo Cafe。')).toEqual({ amount: 8.5, currency: 'MYR', merchant: 'Demo Cafe' })
    expect(parseNotice('您已成功轉帳 RM 8.50 給 Demo Cafe。')).toEqual({ amount: 8.5, currency: 'MYR', merchant: 'Demo Cafe' })
    expect(parseNotice('You have successfully transferred RM 8.50 to Demo Cafe.')).toEqual({
      amount: 8.5,
      currency: 'MYR',
      merchant: 'Demo Cafe',
    })
  })

  it('ignores the points / promo notices TNG sends', () => {
    expect(parseNotice('快来看看今天你的积分能兑换什么好礼吧！')).toBeNull()
  })

  it('reads the English wording', () => {
    expect(parseNotice('You have paid RM12.30 to Demo Mall.')).toEqual({ amount: 12.30, currency: 'MYR', merchant: 'Demo Mall' })
    expect(parseNotice("You've paid RM 5.00 to Demo Cafe")).toEqual({ amount: 5, currency: 'MYR', merchant: 'Demo Cafe' })
  })

  it('reads a title and body joined by a line break', () => {
    expect(parseNotice('自动付款\n您已支付了RM12.30给Demo Mall。')).toEqual({ amount: 12.30, currency: 'MYR', merchant: 'Demo Mall' })
  })

  it('returns null for anything that is not a payment', () => {
    expect(parseNotice('您已收到了RM10.00来自张三。')).toBeNull()
    expect(parseNotice('充值成功 RM50.00')).toBeNull()
    expect(parseNotice('迪拜机场免税店累计可享1500迪拉姆惊喜满减')).toBeNull()
    expect(parseNotice('您已支付了RM0.00给Demo Mall。')).toBeNull()
    expect(parseNotice('')).toBeNull()
    expect(parseNotice(undefined)).toBeNull()
  })
})

describe('merchantKey', () => {
  it('trims, collapses whitespace and uppercases', () => {
    expect(merchantKey('  Demo  Cafe ')).toBe('DEMO CAFE')
    expect(merchantKey('示例拉面馆')).toBe('示例拉面馆')
    expect(merchantKey('')).toBe('')
    expect(merchantKey(undefined)).toBe('')
  })
})

describe('resolveWhen', () => {
  const now = new Date('2026-11-15T18:30:00Z') // 北京 / 吉隆坡时间 11-16 02:30

  it('uses the given local date as-is', () => {
    const r = resolveWhen({ date: '2026-11-14', occurred_at: '2026-11-14T13:15:15+08:00' }, now)
    expect(r.date).toBe('2026-11-14')
    expect(r.occurred_at).toBe('2026-11-14T05:15:15.000Z')
  })

  it('derives the date from occurred_at in UTC+8', () => {
    expect(resolveWhen({ occurred_at: '2026-11-14T17:30:00Z' }, now).date).toBe('2026-11-15')
  })

  it('falls back to now in UTC+8', () => {
    const r = resolveWhen({}, now)
    expect(r.date).toBe('2026-11-16')
    expect(r.occurred_at).toBe('2026-11-15T18:30:00.000Z')
  })

  it('ignores a malformed date or timestamp', () => {
    const r = resolveWhen({ date: '14/11/2026', occurred_at: 'yesterday' }, now)
    expect(r.date).toBe('2026-11-16')
  })

  it('honours a custom offset', () => {
    expect(resolveWhen({ occurred_at: '2026-11-14T17:30:00Z' }, now, 0).date).toBe('2026-11-14')
  })
})

describe('pickCategory', () => {
  const rules = new Map([['DEMO CAFE', 'c-food']])

  it('prefers the remembered merchant', () => {
    expect(pickCategory({ type: 'expense', merchant: 'demo cafe', hint: '日用品' }, cats, rules)).toEqual({
      category_id: 'c-food',
      needs_review: false,
      via: 'rule',
    })
  })

  it('then the category name sent with the request', () => {
    expect(pickCategory({ type: 'expense', merchant: 'NEW SHOP', hint: ' 日用品 ' }, cats, rules)).toEqual({
      category_id: 'c-daily',
      needs_review: false,
      via: 'hint',
    })
  })

  it('falls back to 其它 and flags it for review', () => {
    expect(pickCategory({ type: 'expense', merchant: 'NEW SHOP', hint: '不存在' }, cats, rules)).toEqual({
      category_id: 'c-other',
      needs_review: true,
      via: 'fallback',
    })
  })

  it('ignores a rule pointing at a deleted or wrong-type category', () => {
    const stale = new Map([['X', 'c-gone'], ['Y', 'c-salary']])
    expect(pickCategory({ type: 'expense', merchant: 'x', hint: '' }, cats, stale)?.via).toBe('fallback')
    expect(pickCategory({ type: 'expense', merchant: 'y', hint: '' }, cats, stale)?.via).toBe('fallback')
  })

  it('uses the oldest category of that type when there is no 其它', () => {
    expect(pickCategory({ type: 'income', merchant: '', hint: '' }, cats, rules)).toEqual({
      category_id: 'c-salary',
      needs_review: true,
      via: 'fallback',
    })
  })

  it('returns null when the user has no category of that type', () => {
    expect(pickCategory({ type: 'transfer', merchant: '', hint: '' }, cats, rules)).toBeNull()
  })
})

describe('describeTx', () => {
  it('joins merchant and note', () => {
    expect(describeTx('DEMO CAFE', 'RM18.90')).toBe('DEMO CAFE · RM18.90')
    expect(describeTx('DEMO CAFE', '')).toBe('DEMO CAFE')
    expect(describeTx('', 'RM18.90')).toBe('RM18.90')
    expect(describeTx('', '')).toBeNull()
  })
})

describe('normalizeRequest', () => {
  const now = new Date('2026-11-15T02:00:00Z')

  it('accepts a batch', () => {
    const r = normalizeRequest(
      {
        source: 'wechat',
        items: [
          {
            external_id: 'tx1',
            amount: '30.84',
            currency: 'CNY',
            merchant: 'DEMO CAFE',
            note: 'RM18.90',
            date: '2026-11-14',
            occurred_at: '2026-11-14T13:15:15+08:00',
            type: 'expense',
          },
        ],
      },
      now,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mode).toBe('ingest')
    expect(r.source).toBe('wechat')
    expect(r.items).toEqual([
      {
        ok: true,
        external_id: 'tx1',
        type: 'expense',
        amount: 30.84,
        currency: 'CNY',
        merchant: 'DEMO CAFE',
        note: 'RM18.90',
        category_hint: '',
        date: '2026-11-14',
        occurred_at: '2026-11-14T05:15:15.000Z',
      },
    ])
  })

  it('accepts a single flat item (Shortcuts) and reads currency from the amount text', () => {
    const r = normalizeRequest({ source: 'applepay', amount: 'RM 12.50', merchant: 'Shell', category: '交通' }, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({
      ok: true,
      external_id: null,
      type: 'expense',
      amount: 12.5,
      currency: 'MYR',
      merchant: 'Shell',
      category_hint: '交通',
      date: '2026-11-15',
    })
  })

  it('lets an explicit currency win over the symbol and maps TWD to NTD', () => {
    const r = normalizeRequest({ source: 'shot', amount: '$5', currency: 'usd' }, now)
    expect(r.ok && r.items[0]).toMatchObject({ currency: 'USD' })
    const t = normalizeRequest({ source: 'shot', amount: '50', currency: 'TWD' }, now)
    expect(t.ok && t.items[0]).toMatchObject({ currency: 'NTD' })
  })

  it('defaults to CNY when no currency can be found', () => {
    const r = normalizeRequest({ source: 'shot', amount: '5' }, now)
    expect(r.ok && r.items[0]).toMatchObject({ currency: 'CNY' })
  })

  it('reports bad items one by one without failing the batch', () => {
    const r = normalizeRequest(
      { source: 'wechat', items: [{ amount: 'abc' }, { amount: 5, currency: 'XXX' }, { amount: 5, type: 'gift' }, { amount: 5 }] },
      now,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.items.map((i) => i.ok)).toEqual([false, false, false, true])
    expect(r.items[0]).toMatchObject({ ok: false, error: 'bad_amount' })
    expect(r.items[1]).toMatchObject({ ok: false, error: 'unsupported_currency' })
    expect(r.items[2]).toMatchObject({ ok: false, error: 'bad_type' })
  })

  it('rejects a malformed request as a whole', () => {
    expect(normalizeRequest(null, now)).toMatchObject({ ok: false, error: 'bad_body' })
    expect(normalizeRequest({ source: 'wechat', items: [] }, now)).toMatchObject({ ok: false, error: 'no_items' })
    expect(normalizeRequest({ source: 'We Chat!', amount: 5 }, now)).toMatchObject({ ok: false, error: 'bad_source' })
    const many = { source: 'wechat', items: Array.from({ length: 201 }, () => ({ amount: 1 })) }
    expect(normalizeRequest(many, now)).toMatchObject({ ok: false, error: 'too_many_items' })
  })

  it('defaults the source and trims long text', () => {
    const r = normalizeRequest({ amount: 5, merchant: 'M'.repeat(300), note: 'N'.repeat(300) }, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.source).toBe('api')
    const item = r.items[0]
    expect(item.ok && item.merchant.length).toBe(120)
    expect(item.ok && item.note.length).toBe(120)
  })

  it('takes amount and merchant out of a forwarded notification text', () => {
    const r = normalizeRequest({ source: 'tng', text: '您已支付了RM12.30给Demo Mall。' }, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.items[0]).toMatchObject({ ok: true, amount: 12.30, currency: 'MYR', merchant: 'Demo Mall', type: 'expense' })
  })

  it('prefers explicit fields over the notification text', () => {
    const r = normalizeRequest({ source: 'tng', text: '您已支付了RM12.30给Demo Mall。', amount: 'RM 12.00', merchant: 'Other' }, now)
    expect(r.ok && r.items[0]).toMatchObject({ amount: 12, currency: 'MYR', merchant: 'Other' })
  })

  it('refuses a forwarded notification that is not a payment', () => {
    const r = normalizeRequest({ source: 'tng', text: '您已收到了RM10.00来自张三。' }, now)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.items[0]).toMatchObject({ ok: false, error: 'not_a_payment' })
  })

  it('recognises learn mode', () => {
    const r = normalizeRequest(
      { mode: 'learn', items: [{ merchant: 'Laundro', date: '2026-10-03', amount: '6.52', currency: 'CNY', alt_amount: '4.00', alt_currency: 'MYR' }] },
      now,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.mode).toBe('learn')
    expect(r.learnItems).toEqual([
      { merchant: 'Laundro', date: '2026-10-03', amounts: [{ cents: 652, currency: 'CNY' }, { cents: 400, currency: 'MYR' }] },
    ])
  })
})

describe('learnRules', () => {
  const tx = (date: string, amount: number, currency: string, category_id: string, extra: object = {}) => ({
    date,
    amount,
    currency,
    category_id,
    type: 'expense',
    source: null,
    ...extra,
  })
  const item = (merchant: string, date: string, cny: number, myr?: number) => ({
    merchant,
    date,
    amounts: [{ cents: Math.round(cny * 100), currency: 'CNY' }, ...(myr ? [{ cents: Math.round(myr * 100), currency: 'MYR' }] : [])],
  })

  it('learns from a hand-entered record with the same day and amount', () => {
    const rules = learnRules([item('Laundro', '2026-10-03', 6.52, 4)], [tx('2026-10-03', 6.52, 'CNY', 'c-daily')], cats, new Set())
    expect(rules).toEqual([{ merchant_key: 'LAUNDRO', category_id: 'c-daily' }])
  })

  it('also matches on the listed foreign price', () => {
    const rules = learnRules([item('Laundro', '2026-10-03', 6.52, 4)], [tx('2026-10-03', 4, 'MYR', 'c-daily')], cats, new Set())
    expect(rules).toEqual([{ merchant_key: 'LAUNDRO', category_id: 'c-daily' }])
  })

  it('takes the majority across several payments to the same merchant', () => {
    const items = [item('MINI MART', '2026-10-01', 2.3), item('MINI MART', '2026-10-02', 5), item('MINI MART', '2026-10-03', 7)]
    const txs = [tx('2026-10-01', 2.3, 'CNY', 'c-food'), tx('2026-10-02', 5, 'CNY', 'c-daily'), tx('2026-10-03', 7, 'CNY', 'c-daily')]
    expect(learnRules(items, txs, cats, new Set())).toEqual([{ merchant_key: 'MINI MART', category_id: 'c-daily' }])
  })

  it('skips a tie', () => {
    const items = [item('MINI MART', '2026-10-01', 2.3), item('MINI MART', '2026-10-02', 5)]
    const txs = [tx('2026-10-01', 2.3, 'CNY', 'c-food'), tx('2026-10-02', 5, 'CNY', 'c-daily')]
    expect(learnRules(items, txs, cats, new Set())).toEqual([])
  })

  it('skips a payment that matches records in different categories', () => {
    const txs = [tx('2026-10-03', 6.52, 'CNY', 'c-daily'), tx('2026-10-03', 6.52, 'CNY', 'c-food')]
    expect(learnRules([item('Laundro', '2026-10-03', 6.52)], txs, cats, new Set())).toEqual([])
  })

  it('does not match on a different day, amount, type, or an auto-recorded row', () => {
    const items = [item('Laundro', '2026-10-03', 6.52)]
    expect(learnRules(items, [tx('2026-10-04', 6.52, 'CNY', 'c-daily')], cats, new Set())).toEqual([])
    expect(learnRules(items, [tx('2026-10-03', 6.53, 'CNY', 'c-daily')], cats, new Set())).toEqual([])
    expect(learnRules(items, [tx('2026-10-03', 6.52, 'CNY', 'c-salary', { type: 'income' })], cats, new Set())).toEqual([])
    expect(learnRules(items, [tx('2026-10-03', 6.52, 'CNY', 'c-daily', { source: 'wechat' })], cats, new Set())).toEqual([])
  })

  it('keeps existing rules and ignores deleted categories', () => {
    const items = [item('Laundro', '2026-10-03', 6.52), item('Ghost', '2026-10-03', 9)]
    const txs = [tx('2026-10-03', 6.52, 'CNY', 'c-daily'), tx('2026-10-03', 9, 'CNY', 'c-gone')]
    expect(learnRules(items, txs, cats, new Set(['LAUNDRO']))).toEqual([])
  })
})
