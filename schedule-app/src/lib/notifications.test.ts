import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { native, LN } = vi.hoisted(() => ({
  native: { value: true },
  LN: {
    schedule: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    getPending: vi.fn().mockResolvedValue({ notifications: [] }),
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    addListener: vi.fn().mockResolvedValue(undefined),
  },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.value },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: LN,
}))

vi.mock('../i18n', () => ({
  tStatic: (k: string, vars?: Record<string, unknown>) =>
    vars ? `${k}:${JSON.stringify(vars)}` : k,
}))

import {
  getSettings,
  saveSettings,
  isNativeAvailable,
  checkPermission,
  requestPermission,
  syncNotifications,
  cancelAll,
} from './notifications'
import type { Event } from './types'

function makeEvent(over: Partial<Event>): Event {
  return {
    id: 'event-id-1',
    user_id: 'u1',
    semester_id: 's1',
    course_id: null,
    title: 'lab 1',
    type: 'lab_report',
    date: '2027-01-15',
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
  native.value = true
  LN.schedule.mockClear()
  LN.cancel.mockClear()
  LN.getPending.mockClear().mockResolvedValue({ notifications: [] })
  LN.checkPermissions.mockClear().mockResolvedValue({ display: 'granted' })
  LN.requestPermissions.mockClear().mockResolvedValue({ display: 'granted' })
  LN.addListener.mockClear()
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 4, 29, 12, 0))
  // 默认开启
  saveSettings({ enabled: true, advanceMinutes: 30 })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getSettings', () => {
  it('returns defaults when nothing stored', () => {
    localStorage.removeItem('schedule.notification.settings')
    expect(getSettings()).toEqual({ enabled: false, advanceMinutes: 30 })
  })

  it('passes valid stored settings through', () => {
    saveSettings({ enabled: true, advanceMinutes: 60 })
    expect(getSettings()).toEqual({ enabled: true, advanceMinutes: 60 })
  })

  it('clamps advanceMinutes outside [15, 30, 60] back to 30', () => {
    localStorage.setItem(
      'schedule.notification.settings',
      JSON.stringify({ enabled: true, advanceMinutes: 5 }),
    )
    expect(getSettings().advanceMinutes).toBe(30)
  })

  it('returns defaults when storage is corrupt', () => {
    localStorage.setItem('schedule.notification.settings', '{ broken')
    expect(getSettings()).toEqual({ enabled: false, advanceMinutes: 30 })
  })
})

describe('native gating', () => {
  it('isNativeAvailable mirrors Capacitor.isNativePlatform', () => {
    native.value = true
    expect(isNativeAvailable()).toBe(true)
    native.value = false
    expect(isNativeAvailable()).toBe(false)
  })

  it('check/requestPermission return false on web (no LN call)', async () => {
    native.value = false
    expect(await checkPermission()).toBe(false)
    expect(await requestPermission()).toBe(false)
    expect(LN.checkPermissions).not.toHaveBeenCalled()
    expect(LN.requestPermissions).not.toHaveBeenCalled()
  })

  it("checkPermission returns false when display !== 'granted'", async () => {
    native.value = true
    LN.checkPermissions.mockResolvedValueOnce({ display: 'denied' })
    expect(await checkPermission()).toBe(false)
  })
})

describe('syncNotifications', () => {
  it('no-op on web', async () => {
    native.value = false
    await syncNotifications([makeEvent({})])
    expect(LN.schedule).not.toHaveBeenCalled()
    expect(LN.cancel).not.toHaveBeenCalled()
  })

  it('cancels all pending and exits when disabled', async () => {
    saveSettings({ enabled: false, advanceMinutes: 30 })
    LN.getPending.mockResolvedValue({ notifications: [{ id: 1 }, { id: 2 }] })
    await syncNotifications([makeEvent({})])
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }, { id: 2 }] })
    expect(LN.schedule).not.toHaveBeenCalled()
  })

  it("skips schedule when permission not granted", async () => {
    LN.checkPermissions.mockResolvedValue({ display: 'denied' })
    await syncNotifications([makeEvent({})])
    expect(LN.schedule).not.toHaveBeenCalled()
  })

  it('schedules future events with stable id derived from event UUID', async () => {
    await syncNotifications([makeEvent({ id: 'evt-A', title: 'Lab 1' })])
    expect(LN.schedule).toHaveBeenCalled()
    const arg = LN.schedule.mock.calls[0][0]
    const n = arg.notifications[0]
    expect(typeof n.id).toBe('number')
    expect(n.id).toBeGreaterThanOrEqual(0)
    expect(n.extra).toEqual({ eventId: 'evt-A' })
  })

  it('all-day event triggers the previous day at 09:00 local', async () => {
    await syncNotifications([makeEvent({ date: '2027-01-15', time: null })])
    const trigger = LN.schedule.mock.calls[0][0].notifications[0].schedule.at as Date
    expect(trigger.getFullYear()).toBe(2027)
    expect(trigger.getMonth()).toBe(0)
    expect(trigger.getDate()).toBe(14)
    expect(trigger.getHours()).toBe(9)
  })

  it('timed event triggers advanceMinutes before start', async () => {
    saveSettings({ enabled: true, advanceMinutes: 30 })
    await syncNotifications([
      makeEvent({ date: '2027-01-15', time: '14:30:00' }),
    ])
    const trigger = LN.schedule.mock.calls[0][0].notifications[0].schedule.at as Date
    expect(trigger.getHours()).toBe(14)
    expect(trigger.getMinutes()).toBe(0)
  })

  it('skips events whose computed trigger is in the past', async () => {
    await syncNotifications([
      makeEvent({ date: '2026-01-01', time: null }), // past
    ])
    expect(LN.schedule).not.toHaveBeenCalled()
  })

  it('cancels pending notifications no longer in desired set', async () => {
    LN.getPending.mockResolvedValue({
      notifications: [{ id: 9999 }, { id: 8888 }],
    })
    await syncNotifications([makeEvent({ id: 'evt-A' })])
    expect(LN.cancel).toHaveBeenCalled()
    const cancelArg = LN.cancel.mock.calls[0][0]
    expect(cancelArg.notifications.map((n: { id: number }) => n.id))
      .toEqual(expect.arrayContaining([9999, 8888]))
  })

  it('filters out completed / cancelled events', async () => {
    await syncNotifications([
      makeEvent({ id: 'done', status: 'completed' }),
      makeEvent({ id: 'cxl', status: 'cancelled' }),
      makeEvent({ id: 'pending', status: 'pending' }),
    ])
    const scheduled = LN.schedule.mock.calls[0][0].notifications
    expect(scheduled).toHaveLength(1)
    expect(scheduled[0].extra).toEqual({ eventId: 'pending' })
  })
})

describe('cancelAll', () => {
  it('no-op on web', async () => {
    native.value = false
    await cancelAll()
    expect(LN.cancel).not.toHaveBeenCalled()
  })

  it('does nothing when no pending', async () => {
    LN.getPending.mockResolvedValue({ notifications: [] })
    await cancelAll()
    expect(LN.cancel).not.toHaveBeenCalled()
  })

  it('cancels all pending notifications', async () => {
    LN.getPending.mockResolvedValue({
      notifications: [{ id: 1 }, { id: 2 }],
    })
    await cancelAll()
    expect(LN.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }, { id: 2 }] })
  })
})
