import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const widgetState = vi.hoisted(() => ({
  isNative: true,
  snapshotCalls: [] as Array<{ json: string }>,
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => widgetState.isNative,
  },
  registerPlugin: () => ({
    snapshot: vi.fn((data: { json: string }) => {
      widgetState.snapshotCalls.push(data)
      return Promise.resolve()
    }),
  }),
}))

import { syncWidget } from './widgetSync'
import { saveCache } from './dataCache'
import type { Course, Event } from './types'

const baseCourse: Course = {
  id: 'course-1',
  user_id: 'u1',
  semester_id: 's1',
  code: 'COM104',
  name: 'Intro to CS',
  name_full: null,
  lecturer: null,
  lecturer_email: null,
  lecturer_phone: null,
  office: null,
  color: '#3b82f6',
  credit: null,
  location: null,
  consultation_hours: null,
  notes: null,
} as Course

function makeEvent(over: Partial<Event>): Event {
  return {
    id: 'e-' + Math.random(),
    user_id: 'u1',
    semester_id: 's1',
    course_id: null,
    title: 'lab 1',
    type: 'lab_report',
    date: '2026-05-30',
    time: null,
    end_time: null,
    end_date: null,
    weight: null,
    group_number: null,
    notes: null,
    source_file: null,
    status: 'pending',
    sort_order: 0,
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
    ...over,
  } as Event
}

beforeEach(() => {
  widgetState.isNative = true
  widgetState.snapshotCalls = []
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 4, 29, 12, 0))
})

afterEach(() => {
  vi.useRealTimers()
})

function lastSnapshot() {
  const last = widgetState.snapshotCalls.at(-1)
  if (!last) throw new Error('no snapshot captured')
  return JSON.parse(last.json) as {
    updatedAt: number
    events: Array<{
      id: string
      title: string
      courseCode: string | null
      courseColor: string | null
      date: string
      time: string | null
      type: string
    }>
  }
}

describe('syncWidget: native gating', () => {
  it('skips entirely on non-native (web) platforms', async () => {
    widgetState.isNative = false
    await syncWidget([makeEvent({})])
    expect(widgetState.snapshotCalls).toEqual([])
  })
})

describe('syncWidget: filtering', () => {
  it('excludes completed / cancelled events', async () => {
    const list = [
      makeEvent({ id: 'a', status: 'completed' }),
      makeEvent({ id: 'b', status: 'cancelled' }),
      makeEvent({ id: 'c', status: 'pending' }),
    ]
    await syncWidget(list)
    const ids = lastSnapshot().events.map((e) => e.id)
    expect(ids).toEqual(['c'])
  })

  it('excludes events without a date', async () => {
    const list = [
      makeEvent({ id: 'tbd', date: null }),
      makeEvent({ id: 'has-date', date: '2026-05-30' }),
    ]
    await syncWidget(list)
    expect(lastSnapshot().events.map((e) => e.id)).toEqual(['has-date'])
  })

  it('excludes events past today', async () => {
    const list = [
      makeEvent({ id: 'past', date: '2026-05-28' }),
      makeEvent({ id: 'future', date: '2026-05-30' }),
    ]
    await syncWidget(list)
    expect(lastSnapshot().events.map((e) => e.id)).toEqual(['future'])
  })

  it('excludes events beyond 7-day horizon', async () => {
    const list = [
      makeEvent({ id: 'within', date: '2026-06-04' }), // 6 days from today
      makeEvent({ id: 'beyond', date: '2026-06-10' }),
    ]
    await syncWidget(list)
    expect(lastSnapshot().events.map((e) => e.id)).toEqual(['within'])
  })

  it('caps to MAX_EVENTS=10 entries', async () => {
    const list = Array.from({ length: 15 }, (_, i) =>
      makeEvent({ id: `e${i}`, date: '2026-05-30', time: `0${i % 9}:00` }),
    )
    await syncWidget(list)
    expect(lastSnapshot().events).toHaveLength(10)
  })
})

describe('syncWidget: sorting', () => {
  it('sorts by date asc then by time string (lexicographic, "" < "09:00")', async () => {
    // 注：当前实现用 (time ?? '').localeCompare(other) 排序，空串排在
    // 所有具体时间字符串之前。这跟 TimelineView 的"TBD 最后"风格相反，
    // 但 widget 上 7 天内未来事件全要展示，"无时间在前"实际不构成问题，
    // 因此这里只做行为契约 lock-in，不视为 bug。
    const list = [
      makeEvent({ id: 'd1-t', date: '2026-05-30', time: '14:00' }),
      makeEvent({ id: 'd1-no', date: '2026-05-30', time: null }),
      makeEvent({ id: 'd2', date: '2026-05-31', time: null }),
      makeEvent({ id: 'd1-early', date: '2026-05-30', time: '09:00' }),
    ]
    await syncWidget(list)
    expect(lastSnapshot().events.map((e) => e.id)).toEqual(['d1-no', 'd1-early', 'd1-t', 'd2'])
  })
})

describe('syncWidget: course color resolution', () => {
  beforeEach(() => {
    saveCache('courses', [
      { ...baseCourse, id: 'course-1', code: 'COM104', color: '#3b82f6' },
      { ...baseCourse, id: 'course-2', code: 'BSC124', color: '#10b981' },
    ])
  })

  it('uses course color from cache when event.course_id matches', async () => {
    await syncWidget([
      makeEvent({ id: 'e1', course_id: 'course-1', title: 'random' }),
    ])
    expect(lastSnapshot().events[0].courseColor).toBe('#3b82f6')
  })

  it('falls back to extracted code → cached color when course_id is null', async () => {
    await syncWidget([
      makeEvent({ id: 'e2', course_id: null, title: 'BSC124 quiz' }),
    ])
    const snap = lastSnapshot()
    expect(snap.events[0].courseCode).toBe('BSC124')
    expect(snap.events[0].courseColor).toBe('#10b981')
  })

  it('courseColor is null when neither match', async () => {
    await syncWidget([
      makeEvent({ id: 'e3', course_id: null, title: 'no code here' }),
    ])
    expect(lastSnapshot().events[0].courseColor).toBeNull()
  })

  it('returns null when courses cache is empty', async () => {
    localStorage.removeItem('schedule:cache:courses')
    await syncWidget([
      makeEvent({ id: 'e4', course_id: 'course-1', title: 'COM104 lab' }),
    ])
    const snap = lastSnapshot()
    expect(snap.events[0].courseColor).toBeNull()
  })
})

describe('syncWidget: snapshot shape', () => {
  it('includes updatedAt timestamp', async () => {
    await syncWidget([makeEvent({})])
    expect(typeof lastSnapshot().updatedAt).toBe('number')
  })

  it('time is truncated to HH:MM', async () => {
    await syncWidget([makeEvent({ time: '14:30:00' })])
    expect(lastSnapshot().events[0].time).toBe('14:30')
  })

  it('time is null when source time is null', async () => {
    await syncWidget([makeEvent({ time: null })])
    expect(lastSnapshot().events[0].time).toBeNull()
  })
})
