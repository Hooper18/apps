import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ToastHost from './ToastHost'
import { showToast } from '../../lib/toast'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('ToastHost', () => {
  it('renders nothing initially', () => {
    render(<ToastHost />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('renders toast text when showToast fires', () => {
    render(<ToastHost />)
    act(() => showToast('保存成功'))
    expect(screen.getByRole('status')).toHaveTextContent('保存成功')
  })

  it('clears after default 2000ms duration', () => {
    render(<ToastHost />)
    act(() => showToast('稍后消失'))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('honors custom durationMs', () => {
    render(<ToastHost />)
    act(() => showToast('久一点', { durationMs: 5000 }))
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('status')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(3000))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('subsequent toast replaces the previous one (single-slot)', () => {
    render(<ToastHost />)
    act(() => showToast('first'))
    expect(screen.getByRole('status')).toHaveTextContent('first')
    act(() => showToast('second'))
    expect(screen.getByRole('status')).toHaveTextContent('second')
  })

  it('a later toast resets the lifetime timer', () => {
    render(<ToastHost />)
    act(() => showToast('first'))
    act(() => vi.advanceTimersByTime(1500))
    act(() => showToast('second'))
    // first 已经过了 1.5s，但 second 重置了，再过 1.5s 不会消失
    act(() => vi.advanceTimersByTime(1500))
    expect(screen.getByRole('status')).toHaveTextContent('second')
    act(() => vi.advanceTimersByTime(500))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('uses role=status + aria-live=polite for screen readers', () => {
    render(<ToastHost />)
    act(() => showToast('a11y'))
    const el = screen.getByRole('status')
    expect(el).toHaveAttribute('aria-live', 'polite')
  })

  it('unmount stops listening (subsequent showToast does not throw)', () => {
    const { unmount } = render(<ToastHost />)
    unmount()
    expect(() => showToast('after-unmount')).not.toThrow()
  })
})
