// 商户 → 类目的记忆。自动入账时后端先查这张表（merchant_rules）决定类目；
// 用户在 App 里改过一次自动流水的类目，这里就把「这个商户以后归这一类」记下来。

import * as outbox from './outbox'
import { sync as runSync } from './sync'

/**
 * 商户名归一，当 merchant_rules 的键。
 * 必须和后端 supabase/functions/ingest/logic.ts 的 merchantKey 保持一致，否则记了也查不到。
 */
export function merchantKey(name: string | null | undefined): string {
  if (typeof name !== 'string') return ''
  return name.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * 记住「这个商户归这个类目」。走离线队列，没网时先存着。
 * 返回是否真的记了（没有商户名或类目时不记）。
 */
export function rememberMerchant(
  userId: string,
  merchant: string | null | undefined,
  categoryId: string,
): boolean {
  const key = merchantKey(merchant)
  if (!key || !categoryId) return false
  outbox.enqueue({
    op: 'upsert',
    table: 'merchant_rules',
    onConflict: 'user_id,merchant_key',
    row: {
      user_id: userId,
      merchant_key: key,
      category_id: categoryId,
      updated_at: new Date().toISOString(),
    },
  })
  void runSync()
  return true
}
