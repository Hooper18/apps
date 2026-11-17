// Supabase Edge Function：自动记账入口（线上跑在 Deno）。
//
// 部署时要关掉平台自带的 JWT 校验，鉴权靠个人令牌（App 的 设置 → 自动记账 里生成）：
//   supabase functions deploy ingest --no-verify-jwt
//
// 这个文件只做三件事：读请求、用 service role 实现 Db 接口、把结果写回去。
// 业务规则都在 handler.ts / logic.ts，本地用 vitest 测。

import { createClient } from 'npm:@supabase/supabase-js@2'
import { handleIngest, type Db, type IngestRow, type PushSubscriptionRow } from './handler.ts'
import type { CategoryLite, TxLite } from './logic.ts'
import { buildPushRequest, type VapidConfig } from './webpush.ts'

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const PAGE = 1000

// 推送用的 VAPID 密钥。私钥只在函数的 secrets 里（supabase secrets set），公钥和客户端订阅时用的是同一个。
// 没配置时不发推送，入账照常。
function loadVapid(): VapidConfig | null {
  const privateJwk = Deno.env.get('VAPID_PRIVATE_JWK')
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  if (!privateJwk || !publicKey) return null
  try {
    return {
      privateJwk: JSON.parse(privateJwk),
      publicKey,
      subject: Deno.env.get('VAPID_SUBJECT') ?? 'https://ledger.tuchenguang.com',
    }
  } catch {
    console.error('[ingest] VAPID_PRIVATE_JWK is not valid JSON')
    return null
  }
}
const vapid = loadVapid()

const db: Db = {
  async findUserByTokenHash(hash) {
    const { data, error } = await supabase.from('ingest_tokens').select('id, user_id').eq('token_hash', hash).maybeSingle()
    if (error) throw new Error(`ingest_tokens: ${error.message}`)
    return data ? { user_id: data.user_id as string, token_id: data.id as string } : null
  },

  async touchToken(tokenId) {
    // 记不上最后使用时间不影响入账
    await supabase.from('ingest_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tokenId)
  },

  async listCategories(userId) {
    const { data, error } = await supabase.from('categories').select('id, name, type, created_at').eq('user_id', userId)
    if (error) throw new Error(`categories: ${error.message}`)
    return (data ?? []) as CategoryLite[]
  },

  async listRules(userId) {
    const { data, error } = await supabase.from('merchant_rules').select('merchant_key, category_id').eq('user_id', userId)
    if (error) throw new Error(`merchant_rules: ${error.message}`)
    return (data ?? []) as Array<{ merchant_key: string; category_id: string }>
  },

  async findExistingExternalIds(userId, source, ids) {
    const { data, error } = await supabase
      .from('transactions')
      .select('external_id')
      .eq('user_id', userId)
      .eq('source', source)
      .in('external_id', ids)
    if (error) throw new Error(`transactions: ${error.message}`)
    return (data ?? []).map((r) => r.external_id as string)
  },

  async insertTransaction(row: IngestRow) {
    const { error } = await supabase.from('transactions').insert(row)
    if (!error) return { status: 'inserted' }
    if (error.code === '23505') return { status: 'duplicate' } // 唯一索引兜底：并发时另一条先写进去了
    return { status: 'error', error: `${error.code ?? 'db'}: ${error.message}` }
  },

  async listTransactionsBetween(userId, from, to) {
    const out: TxLite[] = []
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await supabase
        .from('transactions')
        .select('date, amount, currency, category_id, type, source')
        .eq('user_id', userId)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error) throw new Error(`transactions: ${error.message}`)
      const rows = (data ?? []) as Array<Record<string, unknown>>
      for (const r of rows) {
        out.push({
          date: r.date as string,
          amount: Number(r.amount),
          currency: r.currency as string,
          category_id: r.category_id as string,
          type: r.type as string,
          source: (r.source as string | null) ?? null,
        })
      }
      if (rows.length < PAGE) return out
    }
  },

  async upsertRules(userId, rules) {
    const { error } = await supabase
      .from('merchant_rules')
      .upsert(
        rules.map((r) => ({ user_id: userId, merchant_key: r.merchant_key, category_id: r.category_id })),
        { onConflict: 'user_id,merchant_key', ignoreDuplicates: true },
      )
    if (error) throw new Error(`merchant_rules: ${error.message}`)
  },

  async getRate(currency) {
    // 和客户端用同一个汇率源：以人民币为基准，rates[X] = 1 人民币换多少 X
    const res = await fetch('https://api.exchangerate-api.com/v4/latest/CNY', { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const json = (await res.json()) as { rates?: Record<string, number> }
    const code = currency === 'NTD' ? 'TWD' : currency
    const rate = json.rates?.[code]
    return typeof rate === 'number' && rate > 0 ? rate : null
  },

  async listPushSubscriptions(userId) {
    const { data, error } = await supabase.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId)
    if (error) throw new Error(`push_subscriptions: ${error.message}`)
    return (data ?? []) as PushSubscriptionRow[]
  },

  async sendPush(sub, text) {
    if (!vapid) return 'error'
    const req = await buildPushRequest(sub, text, vapid, Math.floor(Date.now() / 1000))
    const res = await fetch(req.url, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      signal: AbortSignal.timeout(8000),
    })
    if (res.ok) return 'ok'
    if (res.status === 404 || res.status === 410) return 'gone'
    console.error('[ingest] push rejected', res.status, (await res.text()).slice(0, 200))
    return 'error'
  },

  async deletePushSubscription(id) {
    await supabase.from('push_subscriptions').delete().eq('id', id)
  },
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

Deno.serve(async (req) => {
  let body: unknown = null
  if (req.method === 'POST') {
    try {
      body = await req.json()
    } catch {
      body = null
    }
  }
  try {
    const res = await handleIngest({ method: req.method, header: (name) => req.headers.get(name), body }, db, new Date())
    return json(res.status, res.body)
  } catch (e) {
    console.error('[ingest] failed', e)
    return json(500, { ok: false, error: 'server_error' })
  }
})
