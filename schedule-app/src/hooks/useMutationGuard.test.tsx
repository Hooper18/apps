import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const onlineState = vi.hoisted(() => ({ value: true }))

vi.mock('./useOnlineStatus', () => ({
  useOnlineStatus: () => onlineState.value,
}))

vi.mock('../i18n', () => ({
  useT: () => (k: string) => k,
}))

import { useMutationGuard } from './useMutationGuard'

afterEach(() => {
  onlineState.value = true
})

describe('useMutationGuard (schedule-app: 离线禁写)', () => {
  it('online → disabled=false, title=undefined', () => {
    onlineState.value = true
    const { result } = renderHook(() => useMutationGuard())
    expect(result.current.online).toBe(true)
    expect(result.current.disabled).toBe(false)
    expect(result.current.title).toBeUndefined()
  })

  it('offline → disabled=true, title=guard.offlineTitle', () => {
    onlineState.value = false
    const { result } = renderHook(() => useMutationGuard())
    expect(result.current.online).toBe(false)
    expect(result.current.disabled).toBe(true)
    expect(result.current.title).toBe('guard.offlineTitle')
  })
})
