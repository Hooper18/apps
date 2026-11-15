import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./sync', () => ({
  sync: vi.fn(() => Promise.resolve()),
}))

import { merchantKey, rememberMerchant } from './merchantRules'
import * as outbox from './outbox'
import { sync } from './sync'

beforeEach(() => {
  outbox.clear()
  vi.mocked(sync).mockClear()
})

describe('merchantKey', () => {
  it('和后端一样：去首尾空格、合并空白、转大写', () => {
    expect(merchantKey('  Demo  Cafe ')).toBe('DEMO CAFE')
    expect(merchantKey('示例拉面馆')).toBe('示例拉面馆')
    expect(merchantKey(null)).toBe('')
    expect(merchantKey(undefined)).toBe('')
  })
})

describe('rememberMerchant', () => {
  it('把「商户 → 类目」排进离线队列并触发同步', () => {
    const ok = rememberMerchant('user-1', 'Demo Cafe', 'cat-food')
    expect(ok).toBe(true)
    const entries = outbox.list()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      op: 'upsert',
      table: 'merchant_rules',
      onConflict: 'user_id,merchant_key',
      row: { user_id: 'user-1', merchant_key: 'DEMO CAFE', category_id: 'cat-food' },
    })
    expect(typeof entries[0].row?.updated_at).toBe('string')
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('没有商户名或类目时什么都不做', () => {
    expect(rememberMerchant('user-1', '   ', 'cat-food')).toBe(false)
    expect(rememberMerchant('user-1', null, 'cat-food')).toBe(false)
    expect(rememberMerchant('user-1', 'Shop', '')).toBe(false)
    expect(outbox.list()).toHaveLength(0)
    expect(sync).not.toHaveBeenCalled()
  })
})
