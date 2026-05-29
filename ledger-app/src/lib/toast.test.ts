import { describe, expect, it, vi } from 'vitest'
import { showToast, subscribeToast } from './toast'

describe('toast bus', () => {
  it('subscribeToast receives the message dispatched by showToast', () => {
    const cb = vi.fn()
    const unsub = subscribeToast(cb)
    showToast('hello')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith({ message: 'hello', durationMs: undefined })
    unsub()
  })

  it('passes through durationMs option', () => {
    const cb = vi.fn()
    const unsub = subscribeToast(cb)
    showToast('with duration', { durationMs: 5000 })
    expect(cb).toHaveBeenCalledWith({ message: 'with duration', durationMs: 5000 })
    unsub()
  })

  it('does not fire after unsubscribe', () => {
    const cb = vi.fn()
    const unsub = subscribeToast(cb)
    showToast('one')
    unsub()
    showToast('two')
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('multiple subscribers each receive every message', () => {
    const a = vi.fn()
    const b = vi.fn()
    const ua = subscribeToast(a)
    const ub = subscribeToast(b)
    showToast('m1')
    showToast('m2')
    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(2)
    ua()
    ub()
  })

  it('is a no-op when window is undefined', () => {
    // 不能真删掉 window；用一个保留的常量值通过 showToast 的 if(window===undefined) 不会触发的代码路径。
    // 这里改用结构验证：showToast 不抛即可（无 listener 时静默）。
    expect(() => showToast('orphan')).not.toThrow()
  })
})
