import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supaState = vi.hoisted(() => ({
  selectResult: { data: null as unknown[] | null, error: null as unknown },
  filters: [] as Array<{ method: string; args: unknown[] }>,
}))

vi.mock('../lib/supabase', () => {
  function makeBuilder() {
    const builder = {
      select(cols: string) {
        supaState.filters.push({ method: 'select', args: [cols] })
        return builder
      },
      eq(field: string, value: unknown) {
        supaState.filters.push({ method: 'eq', args: [field, value] })
        return builder
      },
      order(col: string, opts?: unknown) {
        supaState.filters.push({ method: 'order', args: [col, opts] })
        // 最后一个 .order 之后调用方会 await — 通过把 then 实现为 Promise 桥实现
        return Object.assign(builder, {
          then(resolve: (v: unknown) => unknown) {
            return Promise.resolve(supaState.selectResult).then(resolve)
          },
        })
      },
    }
    return builder
  }
  return {
    supabase: {
      from(table: string) {
        supaState.filters.push({ method: 'from', args: [table] })
        return makeBuilder()
      },
    },
  }
})

const authState = vi.hoisted(() => ({ user: { id: 'user-1' } as { id: string } | null }))

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

vi.mock('../lib/sync', () => ({
  subscribeRefresh: vi.fn(() => () => {}),
  sync: vi.fn(() => Promise.resolve()),
}))

import { useTransactions } from './useTransactions'
import * as outbox from '../lib/outbox'
import { sync as runSync, subscribeRefresh } from '../lib/sync'
import { loadCache } from '../lib/dataCache'

function setOnline(val: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => val,
  })
}

beforeEach(() => {
  supaState.selectResult = { data: [], error: null }
  supaState.filters = []
  authState.user = { id: 'user-1' }
  setOnline(true)
  outbox.clear()
  vi.mocked(runSync).mockClear()
  vi.mocked(subscribeRefresh).mockClear()
})

afterEach(() => {
  setOnline(true)
})

describe('useTransactions: initial load', () => {
  it('reads from Supabase filtered by current user', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 't1',
          user_id: 'user-1',
          type: 'expense',
          amount: 50,
          currency: 'CNY',
          category_id: 'c1',
          description: null,
          date: '2026-05-29',
          exchange_rate: null,
          created_at: '2026-05-29T10:00:00Z',
          updated_at: '2026-05-29T10:00:00Z',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.transactions).toHaveLength(1)
    expect(result.current.transactions[0].id).toBe('t1')
    expect(supaState.filters).toEqual(
      expect.arrayContaining([
        { method: 'from', args: ['transactions'] },
        { method: 'eq', args: ['user_id', 'user-1'] },
      ]),
    )
  })

  it("normalizes legacy 'TWD' → 'NTD' on read", async () => {
    supaState.selectResult = {
      data: [
        {
          id: 't1',
          user_id: 'user-1',
          type: 'expense',
          amount: 100,
          currency: 'TWD',
          category_id: 'c1',
          description: null,
          date: '2026-05-29',
          exchange_rate: null,
          created_at: '2026-05-29T10:00:00Z',
          updated_at: '2026-05-29T10:00:00Z',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.transactions[0].currency).toBe('NTD')
  })

  it('skips network fetch when offline (preserves cached state)', async () => {
    setOnline(false)
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supaState.filters.some((f) => f.method === 'from')).toBe(false)
  })

  it('clears transactions and stops loading when no user', async () => {
    authState.user = null
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.transactions).toEqual([])
  })

  it('surfaces Supabase error via error field', async () => {
    supaState.selectResult = { data: null, error: { message: 'rls denied' } }
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('rls denied')
  })
})

describe('useTransactions: insert', () => {
  it('optimistically prepends row to local state', async () => {
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    let id = ''
    await act(async () => {
      const r = await result.current.insert({
        type: 'expense',
        amount: 25,
        currency: 'CNY',
        category_id: 'c1',
        description: '咖啡',
        date: '2026-05-29',
      })
      id = r.id!
    })
    expect(result.current.transactions[0]).toMatchObject({
      id,
      type: 'expense',
      amount: 25,
      currency: 'CNY',
      description: '咖啡',
    })
  })

  it('enqueues outbox insert and triggers runSync', async () => {
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.insert({
        type: 'expense',
        amount: 25,
        currency: 'CNY',
        category_id: 'c1',
        date: '2026-05-29',
      })
    })
    const queue = outbox.list()
    expect(queue).toHaveLength(1)
    expect(queue[0].op).toBe('insert')
    expect(queue[0].table).toBe('transactions')
    expect(runSync).toHaveBeenCalled()
  })

  it('persists optimistic state to localStorage cache', async () => {
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.insert({
        type: 'expense',
        amount: 25,
        currency: 'CNY',
        category_id: 'c1',
        date: '2026-05-29',
      })
    })
    const cache = loadCache<unknown[]>('transactions')
    expect(cache).toHaveLength(1)
  })

  it('returns error when no user is logged in', async () => {
    authState.user = null
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const r = await act(async () =>
      result.current.insert({
        type: 'expense',
        amount: 1,
        currency: 'CNY',
        category_id: 'c1',
        date: '2026-05-29',
      }),
    )
    expect(r.error).toBe('未登录')
    expect(outbox.list()).toHaveLength(0)
  })
})

describe('useTransactions: update', () => {
  it('mutates row in place and enqueues outbox update with updated_at', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 't1',
          user_id: 'user-1',
          type: 'expense',
          amount: 50,
          currency: 'CNY',
          category_id: 'c1',
          description: null,
          date: '2026-05-29',
          exchange_rate: null,
          created_at: '2026-05-29T10:00:00Z',
          updated_at: '2026-05-29T10:00:00Z',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.update('t1', { amount: 75, description: 'updated' })
    })
    const t = result.current.transactions.find((x) => x.id === 't1')!
    expect(t.amount).toBe(75)
    expect(t.description).toBe('updated')
    const queue = outbox.list()
    expect(queue[0].op).toBe('update')
    expect(queue[0].rowId).toBe('t1')
    expect((queue[0].row as { updated_at?: string }).updated_at).toBeDefined()
    expect(runSync).toHaveBeenCalled()
  })
})

describe('useTransactions: remove', () => {
  it('removes row optimistically and enqueues outbox delete', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 't1',
          user_id: 'user-1',
          type: 'expense',
          amount: 50,
          currency: 'CNY',
          category_id: 'c1',
          description: null,
          date: '2026-05-29',
          exchange_rate: null,
          created_at: '2026-05-29T10:00:00Z',
          updated_at: '2026-05-29T10:00:00Z',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useTransactions())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.remove('t1')
    })
    expect(result.current.transactions.find((x) => x.id === 't1')).toBeUndefined()
    const queue = outbox.list()
    expect(queue[0].op).toBe('delete')
    expect(queue[0].rowId).toBe('t1')
    expect(runSync).toHaveBeenCalled()
  })
})

describe('useTransactions: refresh subscription', () => {
  it('subscribes to refresh bus on mount, unsubscribes on unmount', () => {
    const unsub = vi.fn()
    vi.mocked(subscribeRefresh).mockReturnValueOnce(unsub)
    const { unmount } = renderHook(() => useTransactions())
    expect(subscribeRefresh).toHaveBeenCalledTimes(1)
    unmount()
    expect(unsub).toHaveBeenCalledTimes(1)
  })
})
