import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useMutationGuard } from './useMutationGuard'

function setOnline(val: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => val,
  })
}

afterEach(() => {
  setOnline(true)
})

describe('useMutationGuard (ledger-app: 离线仍允许写)', () => {
  it('reports online when navigator.onLine is true', () => {
    setOnline(true)
    const { result } = renderHook(() => useMutationGuard())
    expect(result.current.online).toBe(true)
  })

  it('reports offline when navigator.onLine is false', () => {
    setOnline(false)
    const { result } = renderHook(() => useMutationGuard())
    expect(result.current.online).toBe(false)
  })

  it("never disables: ledger-app's outbox lets users write offline", () => {
    setOnline(false)
    const { result } = renderHook(() => useMutationGuard())
    expect(result.current.disabled).toBe(false)
    expect(result.current.title).toBeUndefined()
  })
})
