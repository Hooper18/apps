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
}))

import { useCategories } from './useCategories'

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
})

afterEach(() => setOnline(true))

describe('useCategories', () => {
  it("normalizes legacy '宠物' → '水果' (with 🍎 icon) on read", async () => {
    supaState.selectResult = {
      data: [
        {
          id: 'c1',
          user_id: 'user-1',
          name: '宠物',
          icon: '🐶',
          type: 'expense',
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'c2',
          user_id: 'user-1',
          name: '三餐',
          icon: '🍚',
          type: 'expense',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))
    const migrated = result.current.categories.find((c) => c.id === 'c1')!
    expect(migrated.name).toBe('水果')
    expect(migrated.icon).toBe('🍎')
    const untouched = result.current.categories.find((c) => c.id === 'c2')!
    expect(untouched.name).toBe('三餐')
  })

  it('orders by created_at ascending in the query', async () => {
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supaState.filters).toEqual(
      expect.arrayContaining([
        { method: 'order', args: ['created_at', { ascending: true }] },
      ]),
    )
  })

  it('skips network fetch when offline', async () => {
    setOnline(false)
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supaState.filters.some((f) => f.method === 'from')).toBe(false)
  })

  it('returns empty categories when no user', async () => {
    authState.user = null
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories).toEqual([])
  })

  it('reload re-fetches and updates categories', async () => {
    supaState.selectResult = { data: [], error: null }
    const { result } = renderHook(() => useCategories())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.categories).toEqual([])

    supaState.selectResult = {
      data: [
        {
          id: 'c1',
          user_id: 'user-1',
          name: '三餐',
          icon: '🍚',
          type: 'expense',
          created_at: '2026-01-01T00:00:00Z',
        },
      ],
      error: null,
    }
    await act(async () => {
      await result.current.reload()
    })
    expect(result.current.categories).toHaveLength(1)
  })
})
