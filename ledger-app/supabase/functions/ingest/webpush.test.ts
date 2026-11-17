import { describe, expect, it } from 'vitest'
import { b64urlDecode, b64urlEncode, buildPushRequest, encryptPayload, signVapidJwt } from './webpush.ts'

// RFC 8291 第 5 节和附录 A 的官方样例
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml' +
    'mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT' +
    'pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

/** 把「原始公钥 + 原始私钥」拼成 WebCrypto 认识的 JWK。 */
function jwkFromRaw(publicRaw: string, privateRaw: string): JsonWebKey {
  const pub = b64urlDecode(publicRaw)
  return {
    kty: 'EC',
    crv: 'P-256',
    x: b64urlEncode(pub.slice(1, 33)),
    y: b64urlEncode(pub.slice(33, 65)),
    d: privateRaw,
    ext: true,
  }
}

describe('base64url', () => {
  it('round-trips without padding', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])
    const text = b64urlEncode(bytes)
    expect(text).not.toMatch(/[+/=]/)
    expect([...b64urlDecode(text)]).toEqual([...bytes])
  })
})

describe('encryptPayload', () => {
  it('reproduces the RFC 8291 example byte for byte', async () => {
    const body = await encryptPayload(new TextEncoder().encode(RFC.plaintext), RFC.uaPublic, RFC.auth, {
      salt: b64urlDecode(RFC.salt),
      localKeyJwk: jwkFromRaw(RFC.asPublic, RFC.asPrivate),
    })
    expect(b64urlEncode(body)).toBe(RFC.body)
  })

  it('uses a fresh salt and key each time by default', async () => {
    const data = new TextEncoder().encode('hi')
    const a = await encryptPayload(data, RFC.uaPublic, RFC.auth)
    const b = await encryptPayload(data, RFC.uaPublic, RFC.auth)
    expect(b64urlEncode(a)).not.toBe(b64urlEncode(b))
    expect(a.length).toBe(16 + 4 + 1 + 65 + 2 + 1 + 16) // 头 86 字节 + 明文 2 + 结束符 1 + GCM 标签 16
  })

  it('rejects a malformed subscription key', async () => {
    await expect(encryptPayload(new Uint8Array([1]), 'AAAA', RFC.auth)).rejects.toThrow()
  })
})

describe('signVapidJwt', () => {
  it('produces an ES256 token the public key verifies, with the right claims', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const now = 1_800_000_000
    const jwt = await signVapidJwt(privateJwk, 'https://web.push.apple.com', 'mailto:a@example.com', now)

    const [h, p, s] = jwt.split('.')
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(h)))).toEqual({ typ: 'JWT', alg: 'ES256' })
    expect(JSON.parse(new TextDecoder().decode(b64urlDecode(p)))).toEqual({
      aud: 'https://web.push.apple.com',
      exp: now + 12 * 3600,
      sub: 'mailto:a@example.com',
    })
    const ok = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      b64urlDecode(s),
      new TextEncoder().encode(`${h}.${p}`),
    )
    expect(ok).toBe(true)
  })
})

describe('buildPushRequest', () => {
  it('assembles endpoint, headers and encrypted body', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
    const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const publicRaw = b64urlEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)))

    const req = await buildPushRequest(
      { endpoint: 'https://web.push.apple.com/abc/def', p256dh: RFC.uaPublic, auth: RFC.auth },
      JSON.stringify({ title: '已记一笔' }),
      { privateJwk, publicKey: publicRaw, subject: 'mailto:a@example.com' },
      1_800_000_000,
    )
    expect(req.url).toBe('https://web.push.apple.com/abc/def')
    expect(req.method).toBe('POST')
    expect(req.headers['Content-Encoding']).toBe('aes128gcm')
    expect(req.headers['Content-Type']).toBe('application/octet-stream')
    expect(req.headers.TTL).toBe('86400')
    expect(req.headers.Urgency).toBe('high')
    expect(req.headers.Authorization).toMatch(new RegExp(`^vapid t=[\\w-]+\\.[\\w-]+\\.[\\w-]+, k=${publicRaw}$`))
    expect(req.body.length).toBeGreaterThan(86)
  })
})
