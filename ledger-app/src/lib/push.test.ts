import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supa = vi.hoisted(() => ({
  upserts: [] as Array<{ row: Record<string, unknown>; options: unknown }>,
  deleted: [] as string[],
  upsertError: null as { message: string } | null,
}))

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      if (table !== 'push_subscriptions') throw new Error(`unexpected table ${table}`)
      return {
        upsert: (row: Record<string, unknown>, options: unknown) => {
          supa.upserts.push({ row, options })
          return Promise.resolve({ error: supa.upsertError })
        },
        delete: () => ({
          eq: (_field: string, value: string) => {
            supa.deleted.push(value)
            return Promise.resolve({ error: null })
          },
        }),
      }
    },
  },
}))

import { VAPID_PUBLIC_KEY, disablePush, enablePush, isPushEnabled, pushSupported, urlBase64ToBytes } from './push'

const SUB_JSON = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'P256', auth: 'AUTH' } }

function installFakes(opts: { permission?: NotificationPermission; existing?: boolean; subscribeFails?: boolean } = {}) {
  const sub = {
    endpoint: SUB_JSON.endpoint,
    toJSON: () => SUB_JSON,
    unsubscribe: vi.fn(() => Promise.resolve(true)),
  }
  const pushManager = {
    getSubscription: vi.fn(() => Promise.resolve(opts.existing ? sub : null)),
    subscribe: vi.fn(() => (opts.subscribeFails ? Promise.reject(new Error('nope')) : Promise.resolve(sub))),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', {
    permission: opts.permission ?? 'default',
    requestPermission: vi.fn(() => Promise.resolve(opts.permission ?? 'granted')),
  })
  return { sub, pushManager }
}

beforeEach(() => {
  supa.upserts = []
  supa.deleted = []
  supa.upsertError = null
})

afterEach(() => {
  vi.unstubAllGlobals()
  // @ts-expect-error 清掉测试里装上去的假 serviceWorker
  delete navigator.serviceWorker
})

describe('urlBase64ToBytes', () => {
  it('解出 65 字节的未压缩公钥', () => {
    const bytes = urlBase64ToBytes(VAPID_PUBLIC_KEY)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(4)
  })

  it('处理 URL 安全字符和缺省的补位', () => {
    expect([...urlBase64ToBytes('-_8')]).toEqual([251, 255])
  })
})

describe('pushSupported', () => {
  it('浏览器没有推送能力时是 false', () => {
    expect(pushSupported()).toBe(false)
  })

  it('三样都有才是 true', () => {
    installFakes()
    expect(pushSupported()).toBe(true)
  })
})

describe('enablePush', () => {
  it('不支持时直接说不支持', async () => {
    expect(await enablePush('u1', 'iPhone')).toBe('unsupported')
  })

  it('用户拒绝通知权限', async () => {
    const { pushManager } = installFakes({ permission: 'denied' })
    expect(await enablePush('u1', 'iPhone')).toBe('denied')
    expect(pushManager.subscribe).not.toHaveBeenCalled()
    expect(supa.upserts).toEqual([])
  })

  it('同意后订阅，并把订阅存进库', async () => {
    const { pushManager } = installFakes({ permission: 'granted' })
    expect(await enablePush('u1', 'iPhone')).toBe('ok')
    const arg = (pushManager.subscribe.mock.calls[0] as unknown[])[0] as { userVisibleOnly: boolean; applicationServerKey: Uint8Array }
    expect(arg.userVisibleOnly).toBe(true)
    expect(arg.applicationServerKey.length).toBe(65)
    expect(supa.upserts).toEqual([
      {
        row: { user_id: 'u1', endpoint: SUB_JSON.endpoint, p256dh: 'P256', auth: 'AUTH', label: 'iPhone' },
        options: { onConflict: 'endpoint' },
      },
    ])
  })

  it('订阅或存库失败时报失败', async () => {
    installFakes({ permission: 'granted', subscribeFails: true })
    expect(await enablePush('u1', 'iPhone')).toBe('failed')

    installFakes({ permission: 'granted' })
    supa.upsertError = { message: 'relation does not exist' }
    expect(await enablePush('u1', 'iPhone')).toBe('failed')
  })
})

describe('isPushEnabled / disablePush', () => {
  it('有订阅且权限是 granted 才算开着', async () => {
    installFakes({ permission: 'granted', existing: true })
    expect(await isPushEnabled()).toBe(true)
    installFakes({ permission: 'granted', existing: false })
    expect(await isPushEnabled()).toBe(false)
    installFakes({ permission: 'default', existing: true })
    expect(await isPushEnabled()).toBe(false)
  })

  it('关闭：取消订阅并删掉库里那一行', async () => {
    const { sub } = installFakes({ permission: 'granted', existing: true })
    await disablePush()
    expect(sub.unsubscribe).toHaveBeenCalled()
    expect(supa.deleted).toEqual([SUB_JSON.endpoint])
  })

  it('不支持或没订阅时关闭是空操作', async () => {
    await disablePush()
    installFakes({ permission: 'granted', existing: false })
    await disablePush()
    expect(supa.deleted).toEqual([])
  })
})
