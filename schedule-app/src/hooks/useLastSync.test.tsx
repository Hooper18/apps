import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLastSync } from './useLastSync'
import { recordSync, type SyncKey } from '../lib/lastSync'

describe('useLastSync (schedule-app)', () => {
  it('returns null when no keys recorded', () => {
    const { result } = renderHook(() => useLastSync(['events']))
    expect(result.current).toBeNull()
  })

  it('returns the only recorded timestamp', () => {
    localStorage.setItem('schedule:lastSync:events', '2026-05-29T12:00:00Z')
    const { result } = renderHook(() => useLastSync(['events']))
    expect(result.current).toBe('2026-05-29T12:00:00Z')
  })

  it('picks oldest across multiple SyncKey union members', () => {
    localStorage.setItem('schedule:lastSync:events', '2026-05-29T12:00:00Z')
    localStorage.setItem('schedule:lastSync:courses', '2026-05-29T10:00:00Z')
    localStorage.setItem('schedule:lastSync:semester', '2026-05-29T11:00:00Z')
    const { result } = renderHook(() =>
      useLastSync(['events', 'courses', 'semester']),
    )
    expect(result.current).toBe('2026-05-29T10:00:00Z')
  })

  it('updates when recordSync fires for a watched key', () => {
    const { result } = renderHook(() => useLastSync(['events']))
    expect(result.current).toBeNull()
    let stamp = ''
    act(() => {
      stamp = recordSync('events')
    })
    expect(result.current).toBe(stamp)
  })

  it('deps are array-content sensitive (different key list re-resolves)', () => {
    localStorage.setItem('schedule:lastSync:events', '2026-05-29T12:00:00Z')
    localStorage.setItem('schedule:lastSync:courses', '2026-05-29T10:00:00Z')
    const { result, rerender } = renderHook(
      ({ keys }: { keys: SyncKey[] }) => useLastSync(keys),
      { initialProps: { keys: ['events'] as SyncKey[] } },
    )
    expect(result.current).toBe('2026-05-29T12:00:00Z')
    rerender({ keys: ['events', 'courses'] })
    expect(result.current).toBe('2026-05-29T10:00:00Z')
  })

  it('order-agnostic deps (same set in different order does NOT remount effect)', () => {
    localStorage.setItem('schedule:lastSync:events', '2026-05-29T12:00:00Z')
    const { result, rerender } = renderHook(
      ({ keys }: { keys: SyncKey[] }) => useLastSync(keys),
      { initialProps: { keys: ['events', 'courses'] as SyncKey[] } },
    )
    const before = result.current
    rerender({ keys: ['courses', 'events'] })
    expect(result.current).toBe(before)
  })
})
