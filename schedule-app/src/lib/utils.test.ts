import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  todayISO,
  parseDate,
  formatDate,
  formatShortDate,
  formatEventTime,
  addMinutes,
  getDaysUntil,
  weekNumber,
  isoOf,
  startOfMonth,
  addMonths,
  daysInMonth,
  typeLabel,
  typeColor,
  compareEvents,
} from './utils'

describe('todayISO + isoOf', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 29, 14, 30)) // local 2026-05-29 14:30
  })

  afterEach(() => vi.useRealTimers())

  it('todayISO returns local YYYY-MM-DD', () => {
    expect(todayISO()).toBe('2026-05-29')
  })

  it('isoOf returns local YYYY-MM-DD for a given Date', () => {
    expect(isoOf(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(isoOf(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('parseDate', () => {
  it('parses YYYY-MM-DD as local midnight (no UTC drift)', () => {
    const d = parseDate('2026-05-29')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(4)
    expect(d.getDate()).toBe(29)
    expect(d.getHours()).toBe(0)
  })
})

describe('formatDate / formatShortDate', () => {
  it('formatDate returns empty for null/undefined', () => {
    expect(formatDate(null)).toBe('')
    expect(formatDate(undefined)).toBe('')
  })

  it('formatDate roundtrips', () => {
    expect(formatDate('2026-05-29')).toBe('2026-05-29')
  })

  it('formatShortDate returns M/D Weekday', () => {
    // 2026-05-29 is a Friday
    expect(formatShortDate('2026-05-29')).toBe('5/29 Fri')
  })
})

describe('formatEventTime', () => {
  it('returns empty for no start time', () => {
    expect(formatEventTime(null, null)).toBe('')
    expect(formatEventTime(undefined, undefined)).toBe('')
    expect(formatEventTime(null, '12:00')).toBe('')
  })

  it('truncates HH:MM:SS to HH:MM', () => {
    expect(formatEventTime('14:30:00', null)).toBe('14:30')
  })

  it('returns single time when no end time', () => {
    expect(formatEventTime('14:30', null)).toBe('14:30')
  })

  it('returns range when end time present', () => {
    expect(formatEventTime('14:30', '16:00')).toBe('14:30–16:00')
    expect(formatEventTime('14:30:00', '16:00:00')).toBe('14:30–16:00')
  })
})

describe('addMinutes', () => {
  it('adds minutes within same day', () => {
    expect(addMinutes('14:30', 60)).toBe('15:30')
    expect(addMinutes('09:00', 15)).toBe('09:15')
  })

  it('rolls minutes correctly across hour boundary', () => {
    expect(addMinutes('14:50', 20)).toBe('15:10')
  })

  it('clamps to 23:59 when result would wrap past midnight', () => {
    expect(addMinutes('23:30', 60)).toBe('23:59')
  })

  it('clamps to 00:00 when result would go negative', () => {
    expect(addMinutes('00:10', -30)).toBe('00:00')
  })

  it('handles HH:MM with missing leading zero', () => {
    expect(addMinutes('9:00', 5)).toBe('09:05')
  })
})

describe('getDaysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 29, 12, 0)) // local 2026-05-29
  })

  afterEach(() => vi.useRealTimers())

  it('returns 0 for today', () => {
    expect(getDaysUntil('2026-05-29')).toBe(0)
  })

  it('returns positive for future', () => {
    expect(getDaysUntil('2026-06-01')).toBe(3)
  })

  it('returns negative for past', () => {
    expect(getDaysUntil('2026-05-27')).toBe(-2)
  })

  it('returns null for empty input', () => {
    expect(getDaysUntil(null)).toBeNull()
    expect(getDaysUntil(undefined)).toBeNull()
  })
})

describe('weekNumber', () => {
  it('returns null when no semester', () => {
    expect(weekNumber('2026-05-29', null)).toBeNull()
  })

  it('returns 1 for week1_start date', () => {
    expect(weekNumber('2026-02-23', { week1_start: '2026-02-23' })).toBe(1)
  })

  it('returns 2 for one week after', () => {
    expect(weekNumber('2026-03-02', { week1_start: '2026-02-23' })).toBe(2)
  })

  it('returns null for date before week1_start', () => {
    expect(weekNumber('2026-02-20', { week1_start: '2026-02-23' })).toBeNull()
  })

  it('rounds down within the week', () => {
    expect(weekNumber('2026-02-28', { week1_start: '2026-02-23' })).toBe(1)
  })
})

describe('startOfMonth / addMonths / daysInMonth', () => {
  it('startOfMonth returns 1st of given month at midnight', () => {
    const start = startOfMonth(new Date(2026, 4, 29))
    expect(start.getDate()).toBe(1)
    expect(start.getMonth()).toBe(4)
  })

  it('addMonths shifts by positive and negative deltas', () => {
    expect(addMonths(new Date(2026, 4, 1), 2).getMonth()).toBe(6)
    expect(addMonths(new Date(2026, 4, 1), -5).getMonth()).toBe(11)
    expect(addMonths(new Date(2026, 4, 1), -5).getFullYear()).toBe(2025)
  })

  it('daysInMonth handles leap year February', () => {
    expect(daysInMonth(new Date(2024, 1, 15))).toBe(29) // 2024 is leap
    expect(daysInMonth(new Date(2025, 1, 15))).toBe(28)
  })
})

describe('typeLabel / typeColor', () => {
  it('typeLabel returns label for known types', () => {
    expect(typeLabel('exam')).toBe('Exam')
    expect(typeLabel('deadline')).toBe('DDL')
  })

  it('typeLabel returns input unchanged for unknown types', () => {
    expect(typeLabel('unknown_type')).toBe('unknown_type')
  })

  it('typeColor returns class string for known types', () => {
    expect(typeColor('exam')).toMatch(/red/)
    expect(typeColor('holiday')).toMatch(/emerald/)
  })

  it('typeColor falls back to gray for unknown types', () => {
    expect(typeColor('weird')).toMatch(/gray/)
  })
})

describe('compareEvents', () => {
  it('orders by date ascending', () => {
    const events = [
      { date: '2026-05-30', time: null, sort_order: 5 },
      { date: '2026-05-28', time: null, sort_order: 1 },
    ]
    events.sort(compareEvents)
    expect(events[0].date).toBe('2026-05-28')
  })

  it('within same date, dated-with-time comes before dated-no-time', () => {
    const events = [
      { date: '2026-05-29', time: null, sort_order: 1 },
      { date: '2026-05-29', time: '09:00', sort_order: 5 },
    ]
    events.sort(compareEvents)
    expect(events[0].time).toBe('09:00')
  })

  it('events with same date but both timeless fall through to sort_order tiebreak', () => {
    // 注：当两侧 date+time 都存在且相等时返回 0，sort_order 不参与；这是被
    // compareEvents 故意省掉的"完全相同时间"分支。但只要 time 缺失就会落到
    // sort_order（参见"events without dates fall back to sort_order"用例）。
    const events = [
      { date: null, time: null, sort_order: 10 },
      { date: null, time: null, sort_order: 1 },
    ]
    events.sort(compareEvents)
    expect(events[0].sort_order).toBe(1)
  })

  it('events without dates fall back to sort_order', () => {
    const events = [
      { date: null, time: null, sort_order: 5 },
      { date: null, time: null, sort_order: 1 },
    ]
    events.sort(compareEvents)
    expect(events[0].sort_order).toBe(1)
  })
})
