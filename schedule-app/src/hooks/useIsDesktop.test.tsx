import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useIsDesktop } from './useIsDesktop'

interface MqlInstance {
  matches: boolean
  trigger: (matches: boolean) => void
}

function mockMatchMedia(initial: boolean) {
  const listeners: Array<(e: MediaQueryListEvent) => void> = []
  const mql: MqlInstance = {
    matches: initial,
    trigger(matches: boolean) {
      this.matches = matches
      for (const l of listeners) l({ matches } as MediaQueryListEvent)
    },
  }
  // jsdom 默认没有 window.matchMedia，所以这里直接 stubGlobal 而不是 spyOn。
  vi.stubGlobal(
    'matchMedia',
    (_q: string) =>
      ({
        matches: mql.matches,
        media: _q,
        onchange: null,
        addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
          listeners.push(cb)
        },
        removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
          const i = listeners.indexOf(cb)
          if (i >= 0) listeners.splice(i, 1)
        },
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      } as unknown as MediaQueryList),
  )
  return mql
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useIsDesktop', () => {
  it('initializes from matchMedia(min-width: 768px).matches', () => {
    mockMatchMedia(true)
    const { result: r1 } = renderHook(() => useIsDesktop())
    expect(r1.current).toBe(true)

    mockMatchMedia(false)
    const { result: r2 } = renderHook(() => useIsDesktop())
    expect(r2.current).toBe(false)
  })

  it('reacts to matchMedia change events', () => {
    const mql = mockMatchMedia(false)
    const { result } = renderHook(() => useIsDesktop())
    expect(result.current).toBe(false)
    act(() => mql.trigger(true))
    expect(result.current).toBe(true)
    act(() => mql.trigger(false))
    expect(result.current).toBe(false)
  })
})
