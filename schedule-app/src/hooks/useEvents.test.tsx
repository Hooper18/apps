import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supaState = vi.hoisted(() => ({
  selectResult: { data: null as unknown[] | null, error: null as unknown },
  updateError: null as unknown,
  deleteError: null as unknown,
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
        // 终止 chain：返回带 .then 的 thenable
        return Object.assign(builder, {
          then(resolve: (v: unknown) => unknown) {
            return Promise.resolve(supaState.selectResult).then(resolve)
          },
        })
      },
      update(_row: unknown) {
        return {
          eq(_field: string, _id: unknown) {
            return Promise.resolve({ error: supaState.updateError })
          },
        }
      },
      delete() {
        return {
          eq(_field: string, _id: unknown) {
            return Promise.resolve({ error: supaState.deleteError })
          },
        }
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

const authState = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

const sideEffects = vi.hoisted(() => ({
  syncNotifications: vi.fn(() => Promise.resolve()),
  syncWidget: vi.fn(() => Promise.resolve()),
}))

vi.mock('../lib/notifications', () => ({
  syncNotifications: sideEffects.syncNotifications,
}))

vi.mock('../lib/widgetSync', () => ({
  syncWidget: sideEffects.syncWidget,
}))

import { useEvents } from './useEvents'

beforeEach(() => {
  supaState.selectResult = { data: [], error: null }
  supaState.updateError = null
  supaState.deleteError = null
  supaState.filters = []
  authState.user = { id: 'u1' }
  sideEffects.syncNotifications.mockClear()
  sideEffects.syncWidget.mockClear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useEvents: initial load', () => {
  it('queries events filtered by user_id + semester_id', async () => {
    const { result } = renderHook(() => useEvents('sem-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(supaState.filters).toEqual(
      expect.arrayContaining([
        { method: 'from', args: ['events'] },
        { method: 'eq', args: ['user_id', 'u1'] },
        { method: 'eq', args: ['semester_id', 'sem-1'] },
      ]),
    )
  })

  it('orders by date asc, time asc, sort_order', async () => {
    renderHook(() => useEvents('sem-1'))
    await waitFor(() => {
      expect(
        supaState.filters.some((f) => f.method === 'order' && f.args[0] === 'date'),
      ).toBe(true)
    })
    expect(
      supaState.filters.filter((f) => f.method === 'order').map((f) => f.args[0]),
    ).toEqual(['date', 'time', 'sort_order'])
  })

  it('returns empty events when no semester', async () => {
    const { result } = renderHook(() => useEvents(null))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toEqual([])
  })

  it('returns empty events when no user', async () => {
    authState.user = null
    const { result } = renderHook(() => useEvents('sem-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.events).toEqual([])
  })

  it('fires syncNotifications + syncWidget after successful load', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 'e1',
          user_id: 'u1',
          semester_id: 'sem-1',
          title: 'Lab',
          type: 'lab_report',
          date: '2026-06-01',
          time: null,
          status: 'pending',
        },
      ],
      error: null,
    }
    renderHook(() => useEvents('sem-1'))
    await waitFor(() => {
      expect(sideEffects.syncNotifications).toHaveBeenCalled()
      expect(sideEffects.syncWidget).toHaveBeenCalled()
    })
  })

  it('surfaces Supabase error via error field', async () => {
    supaState.selectResult = { data: null, error: { message: 'rls denied' } }
    const { result } = renderHook(() => useEvents('sem-1'))
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('rls denied')
  })

  it("does NOT fire syncNotifications / Widget on load error", async () => {
    supaState.selectResult = { data: null, error: { message: 'boom' } }
    renderHook(() => useEvents('sem-1'))
    await waitFor(() => expect(sideEffects.syncNotifications).not.toHaveBeenCalled())
    expect(sideEffects.syncWidget).not.toHaveBeenCalled()
  })
})

describe('useEvents: setStatus', () => {
  it('updates the event status in local state and broadcasts to notifications + widget', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 'e1',
          user_id: 'u1',
          semester_id: 'sem-1',
          title: 'Lab',
          type: 'lab_report',
          date: '2026-06-01',
          time: null,
          status: 'pending',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useEvents('sem-1'))
    await waitFor(() => expect(result.current.events).toHaveLength(1))
    sideEffects.syncNotifications.mockClear()
    sideEffects.syncWidget.mockClear()
    await act(async () => {
      await result.current.setStatus('e1', 'completed')
    })
    expect(result.current.events[0].status).toBe('completed')
    expect(sideEffects.syncNotifications).toHaveBeenCalled()
    expect(sideEffects.syncWidget).toHaveBeenCalled()
  })

  it('does not mutate state when supabase returns error', async () => {
    supaState.selectResult = {
      data: [
        {
          id: 'e1',
          user_id: 'u1',
          semester_id: 'sem-1',
          title: 'Lab',
          type: 'lab_report',
          date: '2026-06-01',
          time: null,
          status: 'pending',
        },
      ],
      error: null,
    }
    const { result } = renderHook(() => useEvents('sem-1'))
    await waitFor(() => expect(result.current.events).toHaveLength(1))
    supaState.updateError = { message: 'no perm' }
    await act(async () => {
      await result.current.setStatus('e1', 'completed')
    })
    expect(result.current.events[0].status).toBe('pending')
    expect(result.current.error).toBe('no perm')
  })
})

describe('useEvents: remove', () => {
  it('removes event from local state and rebroadcasts to notifications + widget', async () => {
    supaState.selectResult = {
      data: [
        { id: 'e1', user_id: 'u1', semester_id: 'sem-1', title: 'A', type: 'deadline', date: '2026-06-01', time: null, status: 'pending' },
        { id: 'e2', user_id: 'u1', semester_id: 'sem-1', title: 'B', type: 'deadline', date: '2026-06-02', time: null, status: 'pending' },
      ],
      error: null,
    }
    const { result } = renderHook(() => useEvents('sem-1'))
    await waitFor(() => expect(result.current.events).toHaveLength(2))
    sideEffects.syncNotifications.mockClear()
    sideEffects.syncWidget.mockClear()
    await act(async () => {
      await result.current.remove('e1')
    })
    expect(result.current.events).toHaveLength(1)
    expect(result.current.events[0].id).toBe('e2')
    expect(sideEffects.syncNotifications).toHaveBeenCalled()
    expect(sideEffects.syncWidget).toHaveBeenCalled()
  })

  it('keeps state intact when supabase returns error', async () => {
    supaState.selectResult = {
      data: [{ id: 'e1', user_id: 'u1', semester_id: 'sem-1', title: 'A', type: 'deadline', date: '2026-06-01', time: null, status: 'pending' }],
      error: null,
    }
    const { result } = renderHook(() => useEvents('sem-1'))
    await waitFor(() => expect(result.current.events).toHaveLength(1))
    supaState.deleteError = { message: 'rls' }
    await act(async () => {
      await result.current.remove('e1')
    })
    expect(result.current.events).toHaveLength(1)
    expect(result.current.error).toBe('rls')
  })
})
