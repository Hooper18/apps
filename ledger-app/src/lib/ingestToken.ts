// 自动记账的个人令牌：电脑同步工具和 iPhone 快捷指令调后端入口时用它证明「我是谁」。
// 数据库里只存 SHA-256，明文只在生成的那一刻给用户看一次。

const PREFIX = 'lgr_'

function base64Url(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 生成一个新令牌：lgr_ + 32 字节随机数（43 个 URL 安全字符）。 */
export function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return PREFIX + base64Url(bytes)
}

/** 令牌的 SHA-256（十六进制小写）。和后端 supabase/functions/ingest/handler.ts 的 sha256Hex 算法一致。 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** 后端入口的完整地址。 */
export function ingestEndpoint(supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL ?? ''): string {
  return supabaseUrl.replace(/\/+$/, '') + '/functions/v1/ingest'
}
