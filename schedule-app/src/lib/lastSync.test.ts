import { describe, expect, it, vi } from 'vitest'
import { recordSync, readSync, oldestSync, subscribeSync } from './lastSync'

describe('lastSync (schedule-app)', () => {
  it('recordSync writes ISO timestamp and dispatches event', () => {
    const cb = vi.fn()
    const unsub = subscribeSync(cb)
    const ts = recordSync('events')
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(localStorage.getItem('schedule:lastSync:events')).toBe(ts)
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })

  it('readSync returns null when nothing recorded', () => {
    expect(readSync('balance')).toBeNull()
  })

  it("oldestSync picks the smallest ISO across the SyncKey union", () => {
    const eventsTs = '2026-05-29T10:00:00Z'
    const coursesTs = '2026-05-29T08:00:00Z'
    expect(oldestSync(eventsTs, coursesTs)).toBe(coursesTs)
  })

  it('oldestSync ignores null/undefined', () => {
    expect(oldestSync(null, '2026-05-29T10:00:00Z', undefined)).toBe('2026-05-29T10:00:00Z')
    expect(oldestSync(null, undefined)).toBeNull()
    expect(oldestSync()).toBeNull()
  })

  it('subscribeSync unsubscribe stops further callbacks', () => {
    const cb = vi.fn()
    const unsub = subscribeSync(cb)
    recordSync('events')
    unsub()
    recordSync('events')
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
