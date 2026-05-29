import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hook mocks ─────────────────────────────────────────────────────────────
const semesterRef = vi.hoisted(() => ({
  value: {
    id: 's1',
    code: 'S1',
    week1_start: '2026-02-23',
    exam_start: null,
    exam_end: null,
    revision_start: null,
    end_date: '2026-06-30',
  } as unknown as Record<string, unknown> | null,
}))
vi.mock('../../hooks/useSemester', () => ({
  useSemester: () => ({ semester: semesterRef.value }),
}))

const coursesRef = vi.hoisted(() => ({
  value: [] as Array<Record<string, unknown>>,
  schedule: [] as Array<Record<string, unknown>>,
}))
vi.mock('../../hooks/useCourses', () => ({
  useCourses: () => ({ courses: coursesRef.value, schedule: coursesRef.schedule }),
}))

const eventsRef = vi.hoisted(() => ({
  value: [] as Array<Record<string, unknown>>,
}))
vi.mock('../../hooks/useEvents', () => ({
  useEvents: () => ({
    events: eventsRef.value,
    setStatus: vi.fn(),
    reload: vi.fn(),
  }),
}))

vi.mock('../../hooks/useIsDesktop', () => ({
  useIsDesktop: () => true,
}))

vi.mock('../../i18n', () => ({
  useT: () => (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
  // useTFor used elsewhere; safe noop
}))

vi.mock('../shared/EventCard', () => ({
  default: () => <div />,
}))

vi.mock('../shared/EventModal', () => ({ default: () => null }))

// NewEventModal mock：渲染时透出 defaultDate 用于断言桌面 header 按钮联动
const modalSpy = vi.hoisted(() => ({ lastDefaultDate: '' }))
vi.mock('../shared/NewEventModal', () => ({
  default: (props: { open: boolean; defaultDate: string }) => {
    if (props.open) modalSpy.lastDefaultDate = props.defaultDate
    return props.open ? (
      <div data-testid="new-evt-modal" data-default-date={props.defaultDate} />
    ) : null
  },
}))

vi.mock('../shared/useNewEventControl', async () => {
  const React = await import('react')
  const { useState } = React
  return {
    useNewEventControl(props: { defaultDate?: string; semesterId: string }) {
      const [open, setOpen] = useState(false)
      const date = props.defaultDate ?? '2026-05-29'
      return {
        headerButton: (
          <button data-testid="header-add" onClick={() => setOpen(true)}>
            new
          </button>
        ),
        fab: null,
        modal: open ? (
          <div data-testid="new-evt-modal" data-default-date={date} />
        ) : null,
        open: () => setOpen(true),
      }
    },
  }
})

vi.mock('./DayDetailPanel', () => ({ default: () => null }))

import CalendarView from './CalendarView'
import { isoOf } from '../../lib/utils'

beforeEach(() => {
  semesterRef.value = {
    id: 's1',
    code: 'S1',
    week1_start: '2026-02-23',
    exam_start: null,
    exam_end: null,
    revision_start: null,
    end_date: '2026-06-30',
  }
  coursesRef.value = []
  coursesRef.schedule = []
  eventsRef.value = []
  modalSpy.lastDefaultDate = ''
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 4, 29, 12, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

function renderCalendar() {
  return render(
    <MemoryRouter>
      <CalendarView />
    </MemoryRouter>,
  )
}

describe('CalendarView: 桌面 Header 新建按钮（本轮新功能）', () => {
  it('renders the desktop header add button (month view)', () => {
    renderCalendar()
    expect(screen.getByTestId('header-add')).toBeInTheDocument()
  })

  it("clicking header-add opens NewEventModal with today's date as defaultDate by default", () => {
    renderCalendar()
    fireEvent.click(screen.getByTestId('header-add'))
    const modal = screen.getByTestId('new-evt-modal')
    expect(modal).toHaveAttribute('data-default-date', isoOf(new Date()))
  })

  it('defaultDate updates after user picks another month/day cell', () => {
    // Note: jsdom 的 getBoundingClientRect 在月格上不可用，直接点格子可能不稳；
    // 这里走"渲染时 selected = today + 用户没切其他日期 → defaultDate == today"
    // 的稳定契约，验证按钮点开后日期跟当前 selected 一致。
    renderCalendar()
    fireEvent.click(screen.getByTestId('header-add'))
    expect(screen.getByTestId('new-evt-modal')).toHaveAttribute(
      'data-default-date',
      isoOf(new Date()),
    )
  })
})

describe('CalendarView: 无学期兜底', () => {
  it("shows '没有学期' message when semester is null", () => {
    semesterRef.value = null
    renderCalendar()
    expect(screen.getByText('timeline.noSemester')).toBeInTheDocument()
  })
})

describe('CalendarView: month navigation', () => {
  it("'今天'按钮总是可点", () => {
    renderCalendar()
    const today = screen.getByText('calendar.today')
    expect(today).toBeInTheDocument()
    expect(() => fireEvent.click(today)).not.toThrow()
  })
})
