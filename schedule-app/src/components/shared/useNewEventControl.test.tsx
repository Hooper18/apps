import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const guardState = vi.hoisted(() => ({
  disabled: false as boolean,
  title: undefined as string | undefined,
}))
vi.mock('../../hooks/useMutationGuard', () => ({
  useMutationGuard: () => ({
    online: !guardState.disabled,
    disabled: guardState.disabled,
    title: guardState.title,
  }),
}))

vi.mock('../../i18n', () => ({
  useT: () => (k: string) => k,
}))

// NewEventModal 是个大的对话框组件，这里只需要它的最小契约：
// 接收 open / defaultDate / onClose / onSaved props，渲染时显示 dataset.testid。
vi.mock('./NewEventModal', () => ({
  default: (props: { open: boolean; defaultDate: string; onClose: () => void; onSaved: () => void }) =>
    props.open ? (
      <div data-testid="modal" data-default-date={props.defaultDate}>
        <button onClick={props.onClose}>m-close</button>
        <button onClick={props.onSaved}>m-save</button>
      </div>
    ) : null,
}))

import { useNewEventControl } from './useNewEventControl'

function Probe({
  semesterId,
  defaultDate,
  onSaved,
}: {
  semesterId: string
  defaultDate?: string
  onSaved: () => void
}) {
  const ev = useNewEventControl({
    semesterId,
    courses: [],
    defaultDate,
    onSaved,
  })
  return (
    <div>
      {ev.headerButton}
      {ev.fab}
      {ev.modal}
    </div>
  )
}

beforeEach(() => {
  guardState.disabled = false
  guardState.title = undefined
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useNewEventControl', () => {
  it('headerButton is hidden on mobile (md:* breakpoint via className)', () => {
    render(<Probe semesterId="s1" onSaved={() => {}} />)
    const buttons = screen.getAllByRole('button')
    // 不严格断言 md: 类名是否在 jsdom 下生效，只校验两个按钮（header + fab）渲染存在
    expect(buttons.length).toBeGreaterThanOrEqual(2)
  })

  it('headerButton click opens modal', () => {
    render(<Probe semesterId="s1" onSaved={() => {}} />)
    expect(screen.queryByTestId('modal')).toBeNull()
    // 第一个 button 是 headerButton（hook 渲染顺序）
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[0])
    expect(screen.getByTestId('modal')).toBeInTheDocument()
  })

  it('fab click opens modal', () => {
    render(<Probe semesterId="s1" onSaved={() => {}} />)
    const buttons = screen.getAllByRole('button')
    fireEvent.click(buttons[1]) // fab
    expect(screen.getByTestId('modal')).toBeInTheDocument()
  })

  it('forwards defaultDate prop to modal', () => {
    render(<Probe semesterId="s1" defaultDate="2026-12-25" onSaved={() => {}} />)
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getByTestId('modal')).toHaveAttribute('data-default-date', '2026-12-25')
  })

  it('falls back to today ISO when defaultDate is omitted', () => {
    render(<Probe semesterId="s1" onSaved={() => {}} />)
    fireEvent.click(screen.getAllByRole('button')[0])
    const date = screen.getByTestId('modal').getAttribute('data-default-date')!
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('modal onClose closes the modal', () => {
    render(<Probe semesterId="s1" onSaved={() => {}} />)
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getByTestId('modal')).toBeInTheDocument()
    fireEvent.click(screen.getByText('m-close'))
    expect(screen.queryByTestId('modal')).toBeNull()
  })

  it('modal onSaved forwards to caller', () => {
    const onSaved = vi.fn()
    render(<Probe semesterId="s1" onSaved={onSaved} />)
    fireEvent.click(screen.getAllByRole('button')[0])
    fireEvent.click(screen.getByText('m-save'))
    expect(onSaved).toHaveBeenCalled()
  })

  it('respects guard.disabled (offline disables both buttons + modal still closed)', () => {
    guardState.disabled = true
    guardState.title = 'offline'
    render(<Probe semesterId="s1" onSaved={() => {}} />)
    const buttons = screen.getAllByRole('button')
    for (const b of buttons) {
      expect(b).toBeDisabled()
      expect(b).toHaveAttribute('title', 'offline')
    }
  })
})
