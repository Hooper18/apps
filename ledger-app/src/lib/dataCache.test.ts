import { describe, expect, it, vi } from 'vitest'
import { loadCache, saveCache, clearCache } from './dataCache'

describe('dataCache', () => {
  it('roundtrips arbitrary JSON data through localStorage', () => {
    interface Row { id: string; name: string; n: number }
    const rows: Row[] = [
      { id: 'a', name: 'foo', n: 1 },
      { id: 'b', name: 'bar', n: 2 },
    ]
    saveCache('demo', rows)
    expect(loadCache<Row[]>('demo')).toEqual(rows)
  })

  it('returns null when key absent', () => {
    expect(loadCache<unknown>('does-not-exist')).toBeNull()
  })

  it('clearCache removes only the targeted key', () => {
    saveCache('keep', { ok: true })
    saveCache('drop', { ok: false })
    clearCache('drop')
    expect(loadCache<{ ok: boolean }>('drop')).toBeNull()
    expect(loadCache<{ ok: boolean }>('keep')).toEqual({ ok: true })
  })

  it('namespace prefix is ledger:cache:', () => {
    saveCache('x', 42)
    expect(localStorage.getItem('ledger:cache:x')).toBe('42')
  })

  it('returns null when stored JSON is corrupt', () => {
    localStorage.setItem('ledger:cache:bad', 'not{json')
    expect(loadCache<unknown>('bad')).toBeNull()
  })

  it('saveCache silently swallows localStorage quota errors', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded')
    })
    expect(() => saveCache('x', { big: 'data' })).not.toThrow()
    spy.mockRestore()
  })
})
