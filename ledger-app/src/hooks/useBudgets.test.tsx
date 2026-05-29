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

import { useBudgets } from './useBudgets'
import * as outbox from '../lib/outbox'

beforeEach(() => {
  supaState.selectResult = { data: [], error: null }
  supaState.filters = []
  authState.user = { id: 'user-1' }
  outbox.clear()
})

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true })
})

describe('useBudgets', () => {
  it('normalizes TWD → NTD on read', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 'b1',
          user_id: 'user-1',
          category_id: null,
          amount: 1000,
          currency: 'TWD',
          period: 'monthly',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useBudgets())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.budgets[0].currency).toBe('NTD')
  })

  it('upsert: creates new budget when no match exists', async () => {
    const { result } = renderHook(() => useBudgets())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.upsert({
        category_id: 'cat-1',
        amount: 500,
        currency: 'CNY',
        period: 'monthly',
      })
    })
    expect(result.current.budgets).toHaveLength(1)
    const entry = outbox.list()[0]
    expect(entry.op).toBe('upsert')
    expect(entry.onConflict).toBe('user_id,period,category_id')
  })

  it('upsert: replaces existing budget by (period, category_id) keeping created_at', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 'b1',
          user_id: 'user-1',
          category_id: 'cat-1',
          amount: 100,
          currency: 'CNY',
          period: 'monthly',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useBudgets())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.upsert({
        category_id: 'cat-1',
        amount: 999,
        currency: 'CNY',
        period: 'monthly',
      })
    })
    expect(result.current.budgets).toHaveLength(1)
    const b = result.current.budgets[0]
    expect(b.id).toBe('b1') // 复用既有 id
    expect(b.amount).toBe(999)
    expect(b.created_at).toBe('2026-01-01T00:00:00Z')
  })

  it('upsert: total budget (category_id=null) is matched separately from per-category', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 'b-total',
          user_id: 'user-1',
          category_id: null,
          amount: 5000,
          currency: 'CNY',
          period: 'monthly',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useBudgets())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.upsert({
        category_id: 'cat-x',
        amount: 200,
        currency: 'CNY',
        period: 'monthly',
      })
    })
    // 两条共存：总预算 + 类目预算
    expect(result.current.budgets).toHaveLength(2)
  })

  it('remove deletes by id and enqueues outbox delete', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 'b1',
          user_id: 'user-1',
          category_id: null,
          amount: 100,
          currency: 'CNY',
          period: 'monthly',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useBudgets())
    await waitFor(() => expect(result.current.loading).toBe(false))
    await act(async () => {
      await result.current.remove('b1')
    })
    expect(result.current.budgets).toHaveLength(0)
    expect(outbox.list()[0]).toMatchObject({ op: 'delete', rowId: 'b1' })
  })
})
