import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { recordSync, readSync } from '../lib/lastSync'
import { loadCache, saveCache } from '../lib/dataCache'
import { subscribeRefresh, sync as runSync } from '../lib/sync'
import * as outbox from '../lib/outbox'
import {
  CATEGORY_ICONS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TRANSFER_CATEGORIES,
} from '../types'
import type { Database } from '../lib/database.types'

export type DbCategory = Database['public']['Tables']['categories']['Row']

const CACHE_KEY = 'categories'

// 老 DB 行里 name='宠物'（旧版叫法）在读路径统一归一为'水果'/🍎。即便
// 数据库 UPDATE 因为任何原因没跑成（被 RLS 静默吞 / 网络异常），UI 也
// 一定显示新名字 —— 不依赖任何写路径成功。
function normalizePet(rows: DbCategory[]): DbCategory[] {
  let dirty = false
  const out = rows.map((c) => {
    if (c.name === '宠物') {
      dirty = true
      return { ...c, name: '水果', icon: '🍎' }
    }
    return c
  })
  return dirty ? out : rows
}

/**
 * Categories 几乎不会变（注册时由触发器创建好默认分类，用户极少自定义），
 * 主要是为了让 UI 拿到 name + icon 跟 transactions 做 client-side join。
 */
export function useCategories() {
  const { user } = useAuth()
  const cached = normalizePet(loadCache<DbCategory[]>(CACHE_KEY) ?? [])
  const [categories, setCategories] = useState<DbCategory[]>(cached)
  const [loading, setLoading] = useState(cached.length === 0)
  const [error, setError] = useState<string | null>(null)
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() =>
    readSync('categories'),
  )

  const reload = useCallback(async () => {
    if (!user) {
      setCategories([])
      setLoading(false)
      return
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setLoading(false)
      return
    }
    setError(null)
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    if (!error && data) {
      const list = normalizePet(outbox.applyOutboxTo('categories', data as DbCategory[]))
      setCategories(list)
      saveCache(CACHE_KEY, list)
      setLastSyncedAt(recordSync('categories'))
    }
    setLoading(false)
  }, [user])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => subscribeRefresh(reload), [reload])

  /**
   * 把默认分类 seed 到 DB（注册触发器 handle_new_user 只建 profile 不建
   * 分类，所以首次记账要补建一次）。前端生成 UUID + 走 outbox FIFO，离线
   * 也能跑——恢复网络后 outbox 会先推 categories 再推 transactions，FK 不
   * 冲突。已经有同 (name, type) 的真实分类时跳过对应那一条，避免重复 seed。
   *
   * 返回 seed 后的完整 categories 列表（已写进 cache + state），调用方可
   * 立即按 name 匹配到真实 UUID。
   */
  const seedDefaults = useCallback(async (): Promise<DbCategory[]> => {
    if (!user) return categories
    const now = new Date().toISOString()
    // 真实分类（UUID）+ name 集，判断哪些 name 还没建
    const existingNames = new Set(categories.filter((c) => /^[0-9a-f-]{36}$/i.test(c.id)).map((c) => `${c.type}:${c.name}`))
    const toCreate: { names: readonly string[]; type: 'expense' | 'income' | 'transfer' }[] = [
      { names: EXPENSE_CATEGORIES,  type: 'expense' },
      { names: INCOME_CATEGORIES,   type: 'income' },
      { names: TRANSFER_CATEGORIES, type: 'transfer' },
    ]
    const seeded: DbCategory[] = []
    for (const { names, type } of toCreate) {
      for (const name of names) {
        if (existingNames.has(`${type}:${name}`)) continue
        seeded.push({
          id: crypto.randomUUID(),
          user_id: user.id,
          name,
          icon: CATEGORY_ICONS[name] ?? '📦',
          type,
          created_at: now,
        } as DbCategory)
      }
    }
    if (seeded.length === 0) return categories
    // 真实 categories（占位的 '0'/'1'... 不进新列表）+ 新 seed 的
    const real = categories.filter((c) => /^[0-9a-f-]{36}$/i.test(c.id))
    const next = [...real, ...seeded]
    setCategories(next)
    saveCache(CACHE_KEY, next)
    for (const row of seeded) {
      outbox.enqueue({ op: 'insert', table: 'categories', row: row as unknown as Record<string, unknown> })
    }
    // 后台尝试同步，不阻塞返回——transaction 那条会跟在 outbox 后面也被推
    void runSync()
    return next
  }, [user, categories])

  return { categories, loading, error, reload, lastSyncedAt, seedDefaults }
}
