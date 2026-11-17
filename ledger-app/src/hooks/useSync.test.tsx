import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authState = vi.hoisted(() => ({ user: null as { id: string } | null }))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

const syncState = vi.hoisted(() => ({
  syncMock: vi.fn(() => Promise.resolve()),
  subscribers: [] as Array<(s: string) => void>,
}))

vi.mock('../lib/sync', () => ({
  sync: syncState.syncMock,
  subscribeSyncState: (cb: (s: string) => void) => {
    syncState.subscribers.push(cb)
    return () => {
      syncState.subscribers = syncState.subscribers.filter((x) => x !== cb)
    }
  },
}))

import { RESUME_SYNC_MIN_INTERVAL_MS, useSync } from './useSync'
import * as outbox from '../lib/outbox'

beforeEach(() => {
  authState.user = null
  outbox.clear()
  syncState.syncMock.mockClear()
  syncState.subscribers = []
})

afterEach(() => {
  authState.user = null
})

describe('useSync', () => {
  it('does not trigger sync when no user', () => {
    renderHook(() => useSync())
    expect(syncState.syncMock).not.toHaveBeenCalled()
  })

  it('triggers sync on mount when user is logged in', () => {
    authState.user = { id: 'u1' }
    renderHook(() => useSync())
    expect(syncState.syncMock).toHaveBeenCalledTimes(1)
  })

  it('exposes pendingCount that mirrors outbox.count', () => {
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 'x' } })
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 'y' } })
    const { result } = renderHook(() => useSync())
    expect(result.current.pendingCount).toBe(2)
  })

  it('pendingCount updates when outbox mutates', () => {
    const { result } = renderHook(() => useSync())
    expect(result.current.pendingCount).toBe(0)
    act(() => {
      outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 'a' } })
    })
    expect(result.current.pendingCount).toBe(1)
  })

  it('triggerSync calls sync (manual sync button)', () => {
    const { result } = renderHook(() => useSync())
    act(() => result.current.triggerSync())
    expect(syncState.syncMock).toHaveBeenCalled()
  })

  it('reacts to "online" window event by triggering sync (user-gated)', () => {
    authState.user = { id: 'u1' }
    renderHook(() => useSync())
    syncState.syncMock.mockClear()
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(syncState.syncMock).toHaveBeenCalledTimes(1)
  })

  it("does NOT react to 'online' event when no user (no spurious syncs on logout screen)", () => {
    renderHook(() => useSync())
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(syncState.syncMock).not.toHaveBeenCalled()
  })

  it("exposes 'syncing' boolean derived from non-idle state", () => {
    const { result } = renderHook(() => useSync())
    expect(result.current.syncing).toBe(false)
    act(() => {
      for (const cb of syncState.subscribers) cb('pushing')
    })
    expect(result.current.syncing).toBe(true)
    act(() => {
      for (const cb of syncState.subscribers) cb('idle')
    })
    expect(result.current.syncing).toBe(false)
  })

  describe('回到前台', () => {
    function setVisibility(state: 'visible' | 'hidden') {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
      document.dispatchEvent(new Event('visibilitychange'))
    }

    afterEach(() => {
      vi.useRealTimers()
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    })

    it('从后台切回前台时同步一次（自动入账的流水靠这个出现）', () => {
      authState.user = { id: 'u1' }
      renderHook(() => useSync())
      syncState.syncMock.mockClear()
      setVisibility('hidden')
      expect(syncState.syncMock).not.toHaveBeenCalled()
      setVisibility('visible')
      expect(syncState.syncMock).toHaveBeenCalledTimes(1)
    })

    it('短时间内来回切只同步一次，过了间隔才再同步', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-11-15T10:00:00Z'))
      authState.user = { id: 'u1' }
      renderHook(() => useSync())
      syncState.syncMock.mockClear()
      setVisibility('visible')
      setVisibility('hidden')
      setVisibility('visible')
      expect(syncState.syncMock).toHaveBeenCalledTimes(1)
      vi.setSystemTime(new Date(Date.now() + RESUME_SYNC_MIN_INTERVAL_MS + 1))
      setVisibility('visible')
      expect(syncState.syncMock).toHaveBeenCalledTimes(2)
    })

    it('pageshow（从后台恢复的页面）也会触发', () => {
      authState.user = { id: 'u1' }
      renderHook(() => useSync())
      syncState.syncMock.mockClear()
      act(() => {
        window.dispatchEvent(new Event('pageshow'))
      })
      expect(syncState.syncMock).toHaveBeenCalledTimes(1)
    })

    it('没登录时不同步', () => {
      renderHook(() => useSync())
      setVisibility('visible')
      expect(syncState.syncMock).not.toHaveBeenCalled()
    })
  })
})
