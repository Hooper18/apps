// Web Push：给浏览器 / 主屏幕 Web App 发推送。只用 WebCrypto，Deno 和 Node 都能跑。
// 这个文件不能有任何 import。
//
// 两个标准：
//   · RFC 8291  消息加密（aes128gcm）：只有订阅它的那台设备解得开
//   · RFC 8292  VAPID：用我们自己的 P-256 私钥签一个短期 JWT，向推送服务证明「我是这个应用的服务器」
//
// encryptPayload 用 RFC 8291 第 5 节的官方样例逐字节校验过（见 webpush.test.ts）。

export function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function b64urlDecode(text: string): Uint8Array {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

const utf8 = (s: string) => new TextEncoder().encode(s)

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, data as BufferSource))
}

/** HKDF（RFC 5869），这里要的长度都不超过 32 字节，所以只展开一轮。 */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmac(salt, ikm)
  const okm = await hmac(prk, concat(info, new Uint8Array([1])))
  return okm.slice(0, length)
}

export interface EncryptOptions {
  /** 测试用：固定 salt（16 字节）。 */
  salt?: Uint8Array
  /** 测试用：固定本端的临时 ECDH 密钥（带私钥 d 的 JWK）。 */
  localKeyJwk?: JsonWebKey
}

/**
 * 按 RFC 8291 加密一条推送消息，返回可以直接当请求体发出去的字节。
 * p256dh / auth 是浏览器订阅里给的两把钥匙（base64url）。
 */
export async function encryptPayload(
  payload: Uint8Array,
  p256dh: string,
  auth: string,
  options: EncryptOptions = {},
): Promise<Uint8Array> {
  const uaPublic = b64urlDecode(p256dh)
  const authSecret = b64urlDecode(auth)
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('bad p256dh key')
  if (authSecret.length < 16) throw new Error('bad auth secret')

  const ecdh = { name: 'ECDH', namedCurve: 'P-256' }
  let localPrivate: CryptoKey
  let localPublicRaw: Uint8Array
  if (options.localKeyJwk) {
    localPrivate = await crypto.subtle.importKey('jwk', options.localKeyJwk, ecdh, false, ['deriveBits'])
    const { x, y } = options.localKeyJwk
    localPublicRaw = concat(new Uint8Array([4]), b64urlDecode(x!), b64urlDecode(y!))
  } else {
    const pair = (await crypto.subtle.generateKey(ecdh, true, ['deriveBits'])) as CryptoKeyPair
    localPrivate = pair.privateKey
    localPublicRaw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  }

  const uaKey = await crypto.subtle.importKey('raw', uaPublic as BufferSource, ecdh, false, [])
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, localPrivate, 256))

  const ikm = await hkdf(authSecret, shared, concat(utf8('WebPush: info\0'), uaPublic, localPublicRaw), 32)
  const salt = options.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const cek = await hkdf(salt, ikm, utf8('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, utf8('Content-Encoding: nonce\0'), 12)

  // 只有一条记录：明文后面跟一个 0x02 表示「这是最后一条」
  const aes = await crypto.subtle.importKey('raw', cek as BufferSource, 'AES-GCM', false, ['encrypt'])
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce as BufferSource },
      aes,
      concat(payload, new Uint8Array([2])) as BufferSource,
    ),
  )

  // 头：salt(16) | 记录大小(4, 大端) | 公钥长度(1) | 本端公钥(65)
  const recordSize = new Uint8Array([0, 0, 0x10, 0])
  return concat(salt, recordSize, new Uint8Array([localPublicRaw.length]), localPublicRaw, cipher)
}

/** 签一个 VAPID JWT（ES256），有效期 12 小时。audience 是推送服务的 origin。 */
export async function signVapidJwt(
  privateJwk: JsonWebKey,
  audience: string,
  subject: string,
  nowSeconds: number,
): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
  const header = b64urlEncode(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })))
  const claims = b64urlEncode(utf8(JSON.stringify({ aud: audience, exp: nowSeconds + 12 * 3600, sub: subject })))
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(`${header}.${claims}`) as BufferSource),
  )
  return `${header}.${claims}.${b64urlEncode(signature)}`
}

export interface PushTarget {
  endpoint: string
  p256dh: string
  auth: string
}

export interface VapidConfig {
  /** P-256 私钥（JWK，带 d）。只放在后端的密钥配置里。 */
  privateJwk: JsonWebKey
  /** 对应的公钥：65 字节未压缩格式的 base64url，和客户端订阅时用的是同一个。 */
  publicKey: string
  /** 联系方式，推送服务出问题时找得到人：mailto:… 或 https://… */
  subject: string
}

export interface PushRequest {
  url: string
  method: 'POST'
  headers: Record<string, string>
  body: Uint8Array
}

/** 组装一条推送请求（不发送）。 */
export async function buildPushRequest(
  target: PushTarget,
  text: string,
  vapid: VapidConfig,
  nowSeconds: number,
): Promise<PushRequest> {
  const jwt = await signVapidJwt(vapid.privateJwk, new URL(target.endpoint).origin, vapid.subject, nowSeconds)
  return {
    url: target.endpoint,
    method: 'POST',
    headers: {
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '86400',
      Urgency: 'high',
    },
    body: await encryptPayload(utf8(text), target.p256dh, target.auth),
  }
}
