// 付款提醒：自动入账时，后端给这台设备发一条系统通知，点开进确认页。
//
// 走标准的 Web Push。iPhone 上只有「添加到主屏幕」的 App 才有这个能力（iOS 16.4 起），
// Safari 标签页里和安卓壳（Capacitor WebView）里没有，pushSupported() 会是 false。
// 通知的显示和点击在 public/push-sw.js 里处理。

import { supabase } from './supabase'

/**
 * VAPID 公钥（65 字节未压缩 P-256 公钥的 base64url）。公开的，写在代码里没问题。
 * 对应的私钥只在后端入口的 secrets 里（VAPID_PRIVATE_JWK）。换密钥要两边一起换，
 * 换了之后所有设备都得重新开一次提醒。
 */
export const VAPID_PUBLIC_KEY =
  'BIAL6GoWUI6CD6Zz8eaQi1IaUPbmWtHenOOsKh5CPPGUOEj98UG2L7P_B1XowAeXxaZmCYo_LlJAlJS6MLvWFXI'

export type EnableResult = 'ok' | 'denied' | 'unsupported' | 'failed'

export function urlBase64ToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function pushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  )
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

/** 这台设备现在是不是开着提醒。 */
export async function isPushEnabled(): Promise<boolean> {
  try {
    const sub = await currentSubscription()
    return !!sub && Notification.permission === 'granted'
  } catch {
    return false
  }
}

/**
 * 开启提醒：要通知权限 → 向浏览器订阅 → 把订阅存进 push_subscriptions。
 * 必须在用户点击里调用（iOS 只在用户手势里弹权限框）。
 */
export async function enablePush(userId: string, label: string): Promise<EnableResult> {
  if (!pushSupported()) return 'unsupported'
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return 'denied'
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToBytes(VAPID_PUBLIC_KEY) as BufferSource,
    })
    const json = sub.toJSON()
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'failed'
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        { user_id: userId, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, label },
        { onConflict: 'endpoint' },
      )
    return error ? 'failed' : 'ok'
  } catch {
    return 'failed'
  }
}

/** 关闭提醒：取消订阅，并删掉库里这台设备的那一行。 */
export async function disablePush(): Promise<void> {
  try {
    const sub = await currentSubscription()
    if (!sub) return
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  } catch {
    // 关不掉就算了：后端下次推送时会发现订阅失效并自己删
  }
}
