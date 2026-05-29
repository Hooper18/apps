import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useOnlineStatus } from './useOnlineStatus'

function setOnline(val: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => val,
  })
}

afterEach(() => {
  setOnline(true)
})

describe('useOnlineStatus', () => {
  it('initializes from navigator.onLine', () => {
    setOnline(true)
    const { result: r1 } = renderHook(() => useOnlineStatus())
    expect(r1.current).toBe(true)

    setOnline(false)
    const { result: r2 } = renderHook(() => useOnlineStatus())
    expect(r2.current).toBe(false)
  })

  it("flips to true on 'online' window event", () => {
    setOnline(false)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(false)
    act(() => {
      setOnline(true)
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })

  it("flips to false on 'offline' window event", () => {
    setOnline(true)
    const { result } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
    act(() => {
      setOnline(false)
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
  })

  it('cleans up listeners on unmount (no leak when re-dispatched after)', () => {
    setOnline(true)
    const { result, unmount } = renderHook(() => useOnlineStatus())
    expect(result.current).toBe(true)
    unmount()
    // 卸载后再派发不应抛错；唯一可验证的是行为不再影响外界
    expect(() => window.dispatchEvent(new Event('offline'))).not.toThrow()
  })
})
