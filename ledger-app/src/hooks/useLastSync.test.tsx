import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLastSync } from './useLastSync'
import { recordSync } from '../lib/lastSync'
import type { SyncKey } from '../lib/lastSync'

describe('useLastSync', () => {
  it('returns null when no keys are recorded yet', () => {
    const { result } = renderHook(() => useLastSync(['transactions']))
    expect(result.current).toBeNull()
  })

  it('returns the only recorded timestamp', () => {
    localStorage.setItem('ledger:lastSync:transactions', '2026-05-29T12:00:00Z')
    const { result } = renderHook(() => useLastSync(['transactions']))
    expect(result.current).toBe('2026-05-29T12:00:00Z')
  })

  it('picks the oldest among multiple keys', () => {
    localStorage.setItem('ledger:lastSync:transactions', '2026-05-29T12:00:00Z')
    localStorage.setItem('ledger:lastSync:categories', '2026-05-29T10:00:00Z')
    localStorage.setItem('ledger:lastSync:budgets', '2026-05-29T11:00:00Z')
    const { result } = renderHook(() =>
      useLastSync(['transactions', 'categories', 'budgets']),
    )
    expect(result.current).toBe('2026-05-29T10:00:00Z')
  })

  it('updates when recordSync fires for a watched key', () => {
    const { result } = renderHook(() => useLastSync(['transactions']))
    expect(result.current).toBeNull()
    let stamp = ''
    act(() => {
      stamp = recordSync('transactions')
    })
    expect(result.current).toBe(stamp)
  })

  it('updates when recordSync fires for a sibling key that lowers the floor', () => {
    localStorage.setItem('ledger:lastSync:transactions', '2026-05-29T12:00:00Z')
    const { result } = renderHook(() =>
      useLastSync(['transactions', 'categories']),
    )
    expect(result.current).toBe('2026-05-29T12:00:00Z')
    act(() => {
      localStorage.setItem('ledger:lastSync:categories', '2026-05-29T08:00:00Z')
      // recordSync 派发事件触发 recompute；直接 setItem 不会派发，要手动派发
      window.dispatchEvent(
        new CustomEvent('ledger:sync-recorded', {
          detail: { key: 'categories', ts: '2026-05-29T08:00:00Z' },
        }),
      )
    })
    expect(result.current).toBe('2026-05-29T08:00:00Z')
  })

  it('does not thrash when the same key list (different array reference) is passed across renders', () => {
    const { result, rerender } = renderHook(
      ({ keys }: { keys: SyncKey[] }) => useLastSync(keys),
      { initialProps: { keys: ['transactions', 'budgets'] as SyncKey[] } },
    )
    const initial = result.current
    rerender({ keys: ['budgets', 'transactions'] as SyncKey[] })
    expect(result.current).toBe(initial)
  })
})
