import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Capacitor mocks — vi.mock 工厂运行时机被 hoist 到模块顶部，那时普通 const
// 尚未初始化。用 vi.hoisted 把 state + mock 函数也提升上去。
const { native, LocalNotificationsMock } = vi.hoisted(() => ({
  native: { value: false },
  LocalNotificationsMock: {
    schedule: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    checkPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
    requestPermissions: vi.fn().mockResolvedValue({ display: 'granted' }),
  },
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.value,
  },
}))

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: LocalNotificationsMock,
}))

import {
  getReminderSettings,
  saveReminderSettings,
  isNativeAvailable,
  checkPermission,
  requestPermission,
  syncReminder,
} from './notifications'

beforeEach(() => {
  native.value = false
  LocalNotificationsMock.schedule.mockClear()
  LocalNotificationsMock.cancel.mockClear()
  LocalNotificationsMock.checkPermissions.mockClear()
  LocalNotificationsMock.requestPermissions.mockClear()
  LocalNotificationsMock.checkPermissions.mockResolvedValue({ display: 'granted' })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getReminderSettings', () => {
  it('returns defaults (disabled, 22:00) when nothing stored', () => {
    expect(getReminderSettings()).toEqual({ enabled: false, hour: 22, minute: 0 })
  })

  it('parses valid stored settings', () => {
    localStorage.setItem(
      'ledger.reminder.settings',
      JSON.stringify({ enabled: true, hour: 9, minute: 30 }),
    )
    expect(getReminderSettings()).toEqual({ enabled: true, hour: 9, minute: 30 })
  })

  it('sanitizes out-of-range hour back to default 22', () => {
    localStorage.setItem(
      'ledger.reminder.settings',
      JSON.stringify({ enabled: true, hour: 25, minute: 0 }),
    )
    expect(getReminderSettings()).toEqual({ enabled: true, hour: 22, minute: 0 })
  })

  it('sanitizes out-of-range minute back to default 0', () => {
    localStorage.setItem(
      'ledger.reminder.settings',
      JSON.stringify({ enabled: true, hour: 9, minute: 99 }),
    )
    expect(getReminderSettings()).toEqual({ enabled: true, hour: 9, minute: 0 })
  })

  it('returns defaults when stored JSON is corrupt', () => {
    localStorage.setItem('ledger.reminder.settings', '{')
    expect(getReminderSettings()).toEqual({ enabled: false, hour: 22, minute: 0 })
  })

  it("coerces non-boolean 'enabled' to boolean", () => {
    localStorage.setItem(
      'ledger.reminder.settings',
      JSON.stringify({ enabled: 1, hour: 9, minute: 30 }),
    )
    expect(getReminderSettings().enabled).toBe(true)
  })
})

describe('saveReminderSettings', () => {
  it('persists to the same localStorage key getReminderSettings reads', () => {
    saveReminderSettings({ enabled: true, hour: 8, minute: 15 })
    expect(getReminderSettings()).toEqual({ enabled: true, hour: 8, minute: 15 })
  })
})

describe('native gating', () => {
  it('isNativeAvailable mirrors Capacitor.isNativePlatform', () => {
    native.value = false
    expect(isNativeAvailable()).toBe(false)
    native.value = true
    expect(isNativeAvailable()).toBe(true)
  })

  it('checkPermission/requestPermission return false when not native', async () => {
    native.value = false
    expect(await checkPermission()).toBe(false)
    expect(await requestPermission()).toBe(false)
    expect(LocalNotificationsMock.checkPermissions).not.toHaveBeenCalled()
  })

  it('checkPermission returns true when Capacitor says granted', async () => {
    native.value = true
    expect(await checkPermission()).toBe(true)
  })

  it('checkPermission returns false when Capacitor denies', async () => {
    native.value = true
    LocalNotificationsMock.checkPermissions.mockResolvedValueOnce({ display: 'denied' })
    expect(await checkPermission()).toBe(false)
  })
})

describe('syncReminder', () => {
  const strings = { title: '记账时间到', body: '今天还没记账哦' }

  it('no-op on web (not native)', async () => {
    native.value = false
    saveReminderSettings({ enabled: true, hour: 9, minute: 0 })
    await syncReminder(strings)
    expect(LocalNotificationsMock.cancel).not.toHaveBeenCalled()
    expect(LocalNotificationsMock.schedule).not.toHaveBeenCalled()
  })

  it('cancels previous and does not schedule when disabled', async () => {
    native.value = true
    saveReminderSettings({ enabled: false, hour: 9, minute: 0 })
    await syncReminder(strings)
    expect(LocalNotificationsMock.cancel).toHaveBeenCalledWith({
      notifications: [{ id: 10001 }],
    })
    expect(LocalNotificationsMock.schedule).not.toHaveBeenCalled()
  })

  it('schedules with allowWhileIdle when enabled + permission granted', async () => {
    native.value = true
    saveReminderSettings({ enabled: true, hour: 8, minute: 30 })
    await syncReminder(strings)
    expect(LocalNotificationsMock.schedule).toHaveBeenCalledTimes(1)
    const arg = LocalNotificationsMock.schedule.mock.calls[0][0]
    expect(arg).toEqual({
      notifications: [
        {
          id: 10001,
          title: '记账时间到',
          body: '今天还没记账哦',
          schedule: {
            on: { hour: 8, minute: 30 },
            allowWhileIdle: true,
          },
        },
      ],
    })
  })

  it('does not schedule when permission denied', async () => {
    native.value = true
    LocalNotificationsMock.checkPermissions.mockResolvedValueOnce({ display: 'denied' })
    saveReminderSettings({ enabled: true, hour: 8, minute: 30 })
    await syncReminder(strings)
    expect(LocalNotificationsMock.schedule).not.toHaveBeenCalled()
  })
})
