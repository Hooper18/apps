import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Hook mocks ─────────────────────────────────────────────────────────────
const semesterRef = vi.hoisted(() => ({
  value: { id: 's1', code: 'S1', week1_start: '2026-02-23', exam_start: null, exam_end: null, revision_start: null, end_date: '2026-06-30' } as unknown as Record<string, unknown> | null,
}))
vi.mock('../../hooks/useSemester', () => ({
  useSemester: () => ({ semester: semesterRef.value }),
}))

const coursesRef = vi.hoisted(() => ({
  value: [] as Array<{ id: string; code: string; name: string; color: string }>,
}))
vi.mock('../../hooks/useCourses', () => ({
  useCourses: () => ({ courses: coursesRef.value }),
}))

const eventsRef = vi.hoisted(() => ({
  value: [] as Array<Record<string, unknown>>,
  loading: false,
}))
vi.mock('../../hooks/useEvents', () => ({
  useEvents: () => ({
    events: eventsRef.value,
    loading: eventsRef.loading,
    setStatus: vi.fn(),
    reload: vi.fn(),
  }),
}))

vi.mock('../../i18n', () => ({
  useT: () => (k: string, vars?: Record<string, unknown>) => (vars ? `${k}:${JSON.stringify(vars)}` : k),
}))

// EventCard 简化：只渲染 data-event-id + title 用于断言
vi.mock('../shared/EventCard', () => ({
  default: ({ event }: { event: { id: string; title: string } }) => (
    <div data-event-id={event.id} data-testid={`evt-${event.id}`}>
      {event.title}
    </div>
  ),
}))

// EventModal / ReassignCourseModal 简化
vi.mock('../shared/EventModal', () => ({ default: () => null }))
vi.mock('../ReassignCourseModal', () => ({ default: () => null }))

// FilterBar 简化为 button 组
vi.mock('../shared/FilterBar', () => ({
  default: ({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) => (
    <div data-testid="filter-bar">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          data-active={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  ),
}))

import TimelineView from './TimelineView'

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/todo" element={<TimelineView />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  semesterRef.value = { id: 's1', code: 'S1', week1_start: '2026-02-23', exam_start: null, exam_end: null, revision_start: null, end_date: '2026-06-30' }
  coursesRef.value = [
    { id: 'c1', code: 'COM104', name: 'CS', color: '#3b82f6' },
    { id: 'c2', code: 'BSC124', name: 'Bio', color: '#10b981' },
  ]
  eventsRef.value = []
  eventsRef.loading = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('TimelineView: ByCourse mode', () => {
  function setupTwoCoursesWithEvents() {
    eventsRef.value = [
      { id: 'e-c1-1', course_id: 'c1', title: 'COM104 lab', type: 'lab_report', date: '2026-06-01', time: null, status: 'pending', sort_order: 0 },
      { id: 'e-c2-1', course_id: 'c2', title: 'BSC124 deadline', type: 'deadline', date: '2026-06-02', time: null, status: 'pending', sort_order: 0 },
    ]
  }

  it("groups events by course in 'course' mode", () => {
    setupTwoCoursesWithEvents()
    renderAt('/todo')
    fireEvent.click(screen.getByText('timeline.groupByCourse'))
    expect(screen.getByText(/COM104.*CS/)).toBeInTheDocument()
    expect(screen.getByText(/BSC124.*Bio/)).toBeInTheDocument()
  })

  it("groups default to open (broadcast.defaultOpen=true)", () => {
    setupTwoCoursesWithEvents()
    renderAt('/todo')
    fireEvent.click(screen.getByText('timeline.groupByCourse'))
    // 两个组都展开 → 两个 EventCard 都渲染
    expect(screen.getByTestId('evt-e-c1-1')).toBeInTheDocument()
    expect(screen.getByTestId('evt-e-c2-1')).toBeInTheDocument()
  })

  it("toggleAllGroups collapses every group", () => {
    setupTwoCoursesWithEvents()
    renderAt('/todo')
    fireEvent.click(screen.getByText('timeline.groupByCourse'))
    fireEvent.click(screen.getByText('timeline.collapseAll'))
    expect(screen.queryByTestId('evt-e-c1-1')).toBeNull()
    expect(screen.queryByTestId('evt-e-c2-1')).toBeNull()
  })
})

describe('TimelineView: deep-link auto-expand (新功能 回归)', () => {
  function setupCollapsedThenDeepLink() {
    eventsRef.value = [
      { id: 'e-c1-1', course_id: 'c1', title: 'COM104 lab', type: 'lab_report', date: '2026-06-01', time: null, status: 'pending', sort_order: 0 },
      { id: 'e-c2-1', course_id: 'c2', title: 'BSC124 deadline', type: 'deadline', date: '2026-06-02', time: null, status: 'pending', sort_order: 0 },
    ]
  }

  it('CourseGroup containing the highlighted event is open after mount', () => {
    setupCollapsedThenDeepLink()
    renderAt('/todo?event=e-c2-1')
    fireEvent.click(screen.getByText('timeline.groupByCourse'))
    // 命中事件所在的组应可见——不论默认是否折叠都展开
    expect(screen.getByTestId('evt-e-c2-1')).toBeInTheDocument()
  })

  it("groups that don't contain the highlight are not forced open by it", () => {
    setupCollapsedThenDeepLink()
    renderAt('/todo?event=e-c2-1')
    fireEvent.click(screen.getByText('timeline.groupByCourse'))
    // 全局 collapseAll 之后非命中组应折叠，命中组的 highlight useEffect 已经
    // 在挂载时触发并把 open=true 写过一次；collapse broadcast 之后再次设回 false
    fireEvent.click(screen.getByText('timeline.collapseAll'))
    expect(screen.queryByTestId('evt-e-c1-1')).toBeNull()
  })

  it("does nothing for a highlight ID that doesn't match any event", () => {
    setupCollapsedThenDeepLink()
    expect(() => renderAt('/todo?event=ghost')).not.toThrow()
  })
})

describe('TimelineView: filter', () => {
  beforeEach(() => {
    eventsRef.value = [
      { id: 'e-exam', course_id: 'c1', title: 'midterm', type: 'midterm', date: '2026-06-01', time: null, status: 'pending', sort_order: 0 },
      { id: 'e-ddl', course_id: 'c1', title: 'ddl', type: 'deadline', date: '2026-06-02', time: null, status: 'pending', sort_order: 0 },
    ]
  })

  it("'exam' filter hides non-exam events (deadline)", () => {
    renderAt('/todo')
    fireEvent.click(screen.getByText('filters.exam'))
    expect(screen.getByTestId('evt-e-exam')).toBeInTheDocument()
    expect(screen.queryByTestId('evt-e-ddl')).toBeNull()
  })

  it("'showDone' off hides completed events", () => {
    eventsRef.value = [
      { id: 'e-pending', course_id: 'c1', title: 'open', type: 'deadline', date: '2026-06-01', time: null, status: 'pending', sort_order: 0 },
      { id: 'e-done', course_id: 'c1', title: 'done', type: 'deadline', date: '2026-06-02', time: null, status: 'completed', sort_order: 1 },
    ]
    renderAt('/todo')
    expect(screen.getByTestId('evt-e-pending')).toBeInTheDocument()
    expect(screen.queryByTestId('evt-e-done')).toBeNull()
  })

  it("'cancelled' events are always hidden regardless of showDone", () => {
    eventsRef.value = [
      { id: 'e-cxl', course_id: 'c1', title: 'cancelled', type: 'deadline', date: '2026-06-01', time: null, status: 'cancelled', sort_order: 0 },
    ]
    renderAt('/todo')
    expect(screen.queryByTestId('evt-e-cxl')).toBeNull()
  })
})

describe('TimelineView: no-semester fallback', () => {
  it('renders empty-state message when no semester loaded', () => {
    semesterRef.value = null
    renderAt('/todo')
    expect(screen.getByText('timeline.noSemester')).toBeInTheDocument()
  })
})

describe('TimelineView: loading state', () => {
  it("shows 'common.loading' while events are loading", () => {
    eventsRef.loading = true
    renderAt('/todo')
    expect(screen.getByText('common.loading')).toBeInTheDocument()
  })
})
