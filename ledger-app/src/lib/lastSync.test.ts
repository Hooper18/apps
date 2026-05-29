import { describe, expect, it, vi } from 'vitest'
import { recordSync, readSync, oldestSync, subscribeSync } from './lastSync'

describe('lastSync', () => {
  it('recordSync writes ISO timestamp under prefix and returns it', () => {
    const ts = recordSync('transactions')
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    expect(localStorage.getItem('ledger:lastSync:transactions')).toBe(ts)
    expect(readSync('transactions')).toBe(ts)
  })

  it('readSync returns null for unrecorded key', () => {
    expect(readSync('budgets')).toBeNull()
  })

  it('oldestSync picks the lexicographically smallest ISO timestamp', () => {
    expect(oldestSync('2026-05-29T10:00:00Z', '2026-05-29T09:00:00Z')).toBe(
      '2026-05-29T09:00:00Z',
    )
  })

  it('oldestSync ignores null/undefined entries', () => {
    expect(oldestSync(null, undefined, '2026-05-29T08:00:00Z')).toBe(
      '2026-05-29T08:00:00Z',
    )
  })

  it('oldestSync returns null when all inputs are empty', () => {
    expect(oldestSync()).toBeNull()
    expect(oldestSync(null, undefined)).toBeNull()
  })

  it('subscribeSync fires on every recordSync and stops after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = subscribeSync(cb)
    recordSync('categories')
    recordSync('categories')
    expect(cb).toHaveBeenCalledTimes(2)
    unsub()
    recordSync('categories')
    expect(cb).toHaveBeenCalledTimes(2)
  })
})
