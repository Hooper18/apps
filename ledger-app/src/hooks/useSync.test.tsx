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

import { useSync } from './useSync'
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
})
