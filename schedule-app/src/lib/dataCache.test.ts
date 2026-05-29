import { describe, expect, it, vi } from 'vitest'
import { loadCache, saveCache } from './dataCache'

describe('dataCache (schedule-app)', () => {
  it('roundtrips data through schedule:cache: prefix', () => {
    saveCache('events', [{ id: 'e1' }])
    expect(loadCache<unknown[]>('events')).toEqual([{ id: 'e1' }])
    expect(localStorage.getItem('schedule:cache:events')).toContain('e1')
  })

  it('returns null for missing key', () => {
    expect(loadCache('nope')).toBeNull()
  })

  it('returns null for corrupt JSON', () => {
    localStorage.setItem('schedule:cache:bad', '{ not json')
    expect(loadCache('bad')).toBeNull()
  })

  it('saveCache swallows localStorage exceptions', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => saveCache('big', { data: 'value' })).not.toThrow()
    spy.mockRestore()
  })
})
