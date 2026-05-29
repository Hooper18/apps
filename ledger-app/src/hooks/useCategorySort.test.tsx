import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useCategorySort } from './useCategorySort'

interface Cat {
  id: string
  name: string
  icon: string
}

const cats: Cat[] = [
  { id: 'a', name: '三餐', icon: '🍚' },
  { id: 'b', name: '交通', icon: '🚌' },
  { id: 'c', name: '娱乐', icon: '🎮' },
]

describe('useCategorySort', () => {
  it("default mode is 'custom' when nothing in localStorage", () => {
    const { result } = renderHook(() => useCategorySort())
    expect(result.current.mode).toBe('custom')
    expect(result.current.customOrder).toEqual({ expense: [], income: [], transfer: [] })
  })

  it('reads persisted mode from localStorage on mount', () => {
    localStorage.setItem('ledger_category_sort_mode', 'recent')
    const { result } = renderHook(() => useCategorySort())
    expect(result.current.mode).toBe('recent')
  })

  it("falls back to 'custom' when stored mode is invalid", () => {
    localStorage.setItem('ledger_category_sort_mode', 'garbage')
    const { result } = renderHook(() => useCategorySort())
    expect(result.current.mode).toBe('custom')
  })

  it('setMode persists and updates state', () => {
    const { result } = renderHook(() => useCategorySort())
    act(() => result.current.setMode('recent'))
    expect(result.current.mode).toBe('recent')
    expect(localStorage.getItem('ledger_category_sort_mode')).toBe('recent')
  })

  it('broadcasts mode changes across multiple hook instances', () => {
    const a = renderHook(() => useCategorySort())
    const b = renderHook(() => useCategorySort())
    act(() => a.result.current.setMode('recent'))
    expect(a.result.current.mode).toBe('recent')
    expect(b.result.current.mode).toBe('recent')
  })

  it('setCustomOrder persists per-type list', () => {
    const { result } = renderHook(() => useCategorySort())
    act(() => result.current.setCustomOrder('expense', ['c', 'a', 'b']))
    expect(result.current.customOrder.expense).toEqual(['c', 'a', 'b'])
    expect(JSON.parse(localStorage.getItem('ledger_category_custom_order')!)).toEqual({
      expense: ['c', 'a', 'b'],
      income: [],
      transfer: [],
    })
  })

  it("applySort in 'custom' mode honors stored order and pushes unknown IDs to the end", () => {
    const { result } = renderHook(() => useCategorySort())
    act(() => result.current.setCustomOrder('expense', ['c', 'a']))
    const sorted = result.current.applySort(cats, 'expense')
    expect(sorted.map((c) => c.id)).toEqual(['c', 'a', 'b'])
  })

  it("applySort in 'recent' mode orders by lastUsedAt desc, unknown to the end", () => {
    const { result } = renderHook(() => useCategorySort())
    act(() => result.current.setMode('recent'))
    const lastUsed = {
      a: '2026-05-29T10:00:00Z',
      b: '2026-05-28T10:00:00Z',
      // c has never been used
    }
    const sorted = result.current.applySort(cats, 'expense', lastUsed)
    expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it("applySort in 'recent' mode without lastUsedAt preserves input order", () => {
    const { result } = renderHook(() => useCategorySort())
    act(() => result.current.setMode('recent'))
    const sorted = result.current.applySort(cats, 'expense')
    expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it("custom mode with no stored order returns input as-is", () => {
    const { result } = renderHook(() => useCategorySort())
    const sorted = result.current.applySort(cats, 'expense')
    expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c'])
  })

  it('handles empty input gracefully', () => {
    const { result } = renderHook(() => useCategorySort())
    expect(result.current.applySort([], 'expense')).toEqual([])
  })
})
