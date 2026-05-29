import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useOnlineStatus } from './useOnlineStatus'

function setNavigatorOnLine(val: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => val })
}

beforeEach(() => {
  setNavigatorOnLine(true)
})

afterEach(() => {
  setNavigatorOnLine(true)
})

describe('useOnlineStatus (schedule-app: 乐观默认 true)', () => {
  it('initial state is true regardless of navigator.onLine (避免 WebView false-positive)', () => {
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
  })

  it("flips to false after navigator.onLine === false survives 1.5s grace period", () => {
    vi.useFakeTimers()
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(result.current).toBe(false)
    vi.useRealTimers()
  })

  it("does NOT flip to false if navigator.onLine recovers within grace period", () => {
    vi.useFakeTimers()
    setNavigatorOnLine(false)
    const { result } = renderHook(() => useOnlineStatus())
    setNavigatorOnLine(true)
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(result.current).toBe(true)
    vi.useRealTimers()
  })

  it("respects 'online' window event", () => {
    const { result } = renderHook(() => useOnlineStatus())
    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })
})
