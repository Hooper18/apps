import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── supabase mock ───────────────────────────────────────────────────────────
//
// 用 hoisted mock 让 sync.ts import { supabase } from './supabase' 时拿到的就是
// 这里 mock 出的对象。每个测试通过 setSupabaseResult 推一个或多个 result：
//   { error: null }                        ← 推送成功
//   { error: { message: 'Failed to fetch' } } ← 网络层错（保留重试）
//   { error: { code: '23505', message: '...' } } ← 业务错（删队 + toast）
//
// chain 实现：from(table).insert(row) / .update(row).eq(id) / .upsert(row, opts)
// / .delete().eq(id) 都返回 Promise<{ error }>。
const supaState = {
  results: [] as Array<{ error: unknown }>,
  fromCalls: [] as Array<{ table: string; op: string; args: unknown[] }>,
}

function nextResult() {
  if (supaState.results.length === 0) return { error: null }
  return supaState.results.shift()!
}

vi.mock('./supabase', () => {
  function makeChain(table: string) {
    const record = (op: string, args: unknown[]) =>
      supaState.fromCalls.push({ table, op, args })
    // insert/upsert 直接 await 即拿到 result（不带 .eq）
    // update/delete 需要 .eq(...) 后才 await
    return {
      insert(row: unknown) {
        record('insert', [row])
        return Promise.resolve(nextResult())
      },
      upsert(row: unknown, opts?: unknown) {
        record('upsert', [row, opts])
        return Promise.resolve(nextResult())
      },
      update(row: unknown) {
        record('update', [row])
        return {
          eq(_field: string, id: unknown) {
            record('update.eq', [id])
            return Promise.resolve(nextResult())
          },
        }
      },
      delete() {
        record('delete', [])
        return {
          eq(_field: string, id: unknown) {
            record('delete.eq', [id])
            return Promise.resolve(nextResult())
          },
        }
      },
    }
  }
  return { supabase: { from: (t: string) => makeChain(t) } }
})

vi.mock('./toast', () => ({
  showToast: vi.fn(),
}))

import { showToast } from './toast'
import * as outbox from './outbox'
import {
  getSyncState,
  subscribeSyncState,
  subscribeRefresh,
  triggerRefresh,
  pushOutbox,
  pullAll,
  sync,
} from './sync'

// vi.spyOn(navigator, 'onLine', 'get').mockRestore() 在 jsdom 里清不回 prototype
// 的 getter，会出现 navigator.onLine 返回 undefined 让 `!navigator.onLine` 误判
// 为离线。所有依赖 onLine 的用例改用 Object.defineProperty 直接覆盖 + 在
// afterEach 显式还原为 true，避免跨用例污染。
function setOnline(val: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    get: () => val,
  })
}

beforeEach(() => {
  supaState.results = []
  supaState.fromCalls = []
  outbox.clear()
  setOnline(true)
  vi.mocked(showToast).mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
  setOnline(true)
})

describe('sync state machine', () => {
  it('initial state is idle', () => {
    expect(getSyncState()).toBe('idle')
  })

  it('subscribeSyncState observes pushing → idle around pushOutbox', async () => {
    const states: string[] = []
    const unsub = subscribeSyncState((s) => states.push(s))
    await pushOutbox()
    expect(states).toEqual(['pushing', 'idle'])
    unsub()
  })

  it('subscribeSyncState observes pulling → idle around pullAll', async () => {
    const states: string[] = []
    const unsub = subscribeSyncState((s) => states.push(s))
    await pullAll()
    expect(states).toEqual(['pulling', 'idle'])
    unsub()
  })
})

describe('refresh event bus', () => {
  it('triggerRefresh fans out to subscribers', () => {
    const cb = vi.fn()
    const unsub = subscribeRefresh(cb)
    triggerRefresh()
    triggerRefresh()
    expect(cb).toHaveBeenCalledTimes(2)
    unsub()
  })

  it('pullAll calls triggerRefresh internally so hooks reload', async () => {
    const cb = vi.fn()
    const unsub = subscribeRefresh(cb)
    await pullAll()
    expect(cb).toHaveBeenCalledTimes(1)
    unsub()
  })
})

describe('pushOutbox + classifyError', () => {
  it('flushes a successful insert, removes from queue, no toast', async () => {
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 't1', amount: 10 } })
    await pushOutbox()
    expect(outbox.list()).toEqual([])
    expect(supaState.fromCalls).toEqual([{ table: 'transactions', op: 'insert', args: [{ id: 't1', amount: 10 }] }])
    expect(showToast).not.toHaveBeenCalled()
  })

  it('flushes update with .eq(id, rowId) chain', async () => {
    outbox.enqueue({ op: 'update', table: 'transactions', rowId: 't1', row: { amount: 99 } })
    await pushOutbox()
    expect(outbox.list()).toEqual([])
    expect(supaState.fromCalls.find((c) => c.op === 'update')?.args[0]).toEqual({ amount: 99 })
    expect(supaState.fromCalls.find((c) => c.op === 'update.eq')?.args[0]).toBe('t1')
  })

  it('flushes upsert with onConflict option passed through', async () => {
    outbox.enqueue({
      op: 'upsert',
      table: 'budgets',
      row: { id: 'b1', amount: 100 },
      onConflict: 'user_id,period,category_id',
    })
    await pushOutbox()
    const upsert = supaState.fromCalls.find((c) => c.op === 'upsert')
    expect(upsert?.args[1]).toEqual({ onConflict: 'user_id,period,category_id' })
  })

  it('flushes delete with .eq(id, rowId) chain', async () => {
    outbox.enqueue({ op: 'delete', table: 'transactions', rowId: 't9' })
    await pushOutbox()
    expect(supaState.fromCalls.some((c) => c.op === 'delete')).toBe(true)
    expect(supaState.fromCalls.find((c) => c.op === 'delete.eq')?.args[0]).toBe('t9')
    expect(outbox.list()).toEqual([])
  })

  it('network error (Failed to fetch) keeps entry, bumps retries, stops queue', async () => {
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 'a' } })
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 'b' } })
    supaState.results.push({ error: { message: 'Failed to fetch' } })
    await pushOutbox()
    const remaining = outbox.list()
    expect(remaining).toHaveLength(2)
    expect(remaining[0].retries).toBe(1)
    expect(remaining[1].retries).toBe(0) // 第二条因短路从未被尝试
    expect(showToast).not.toHaveBeenCalled()
  })

  it('business error (RLS / 23505) drops entry, fires toast, continues', async () => {
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 'bad' } })
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 'good' } })
    supaState.results.push({ error: { code: '23505', message: 'duplicate key' } })
    supaState.results.push({ error: null })
    await pushOutbox()
    expect(outbox.list()).toEqual([])
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(vi.mocked(showToast).mock.calls[0][0]).toContain('同步被拒')
    expect(vi.mocked(showToast).mock.calls[0][0]).toContain('23505')
  })

  it('thrown fetch exception (not a Supabase error object) is treated as network failure', async () => {
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 'x' } })
    // 模拟 supabase.from(...).insert 抛出 而非返回 { error }
    const origFrom = (await import('./supabase')).supabase.from
    vi.spyOn((await import('./supabase')).supabase, 'from').mockImplementationOnce(() => ({
      insert: () => Promise.reject(new Error('boom')),
    }) as ReturnType<typeof origFrom>)
    await pushOutbox()
    expect(outbox.list()).toHaveLength(1) // 保留重试
    expect(showToast).not.toHaveBeenCalled()
  })

  it('unknown op silently drops entry to avoid head-of-line blocking', async () => {
    // 直接写一条非法 op 到 localStorage（绕过 enqueue 类型守卫）
    localStorage.setItem(
      'ledger:outbox',
      JSON.stringify([
        {
          id: 'weird1',
          op: 'merge',
          table: 'transactions',
          createdAt: new Date().toISOString(),
          retries: 0,
        },
        {
          id: 'normal',
          op: 'insert',
          table: 'transactions',
          row: { id: 'after' },
          createdAt: new Date().toISOString(),
          retries: 0,
        },
      ]),
    )
    await pushOutbox()
    expect(outbox.list()).toEqual([])
    expect(supaState.fromCalls.some((c) => c.op === 'insert')).toBe(true)
  })
})

describe('sync() coalescing', () => {
  it('coalesces concurrent calls: outbox entry pushed only once', async () => {
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 't1' } })
    // 同时启动两个 sync —— inFlight 闸门应让第二次复用第一次的 Promise，
    // outbox 那条 entry 只被发送一次。
    const [p1, p2] = [sync(), sync()]
    await Promise.all([p1, p2])
    const inserts = supaState.fromCalls.filter((c) => c.op === 'insert')
    expect(inserts).toHaveLength(1)
  })

  it('skips push+pull when offline', async () => {
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 't1' } })
    setOnline(false)
    await sync()
    expect(supaState.fromCalls).toEqual([])
    expect(outbox.list()).toHaveLength(1)
  })

  it('runs push then pull when online', async () => {
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 't1' } })
    const refreshCb = vi.fn()
    const unsub = subscribeRefresh(refreshCb)
    await sync()
    expect(supaState.fromCalls.map((c) => c.op)).toContain('insert')
    expect(refreshCb).toHaveBeenCalled()
    unsub()
  })

  it('does not get stuck in inFlight after an offline sync (regression)', async () => {
    // 先离线跑一次 sync —— 历史 bug 会让 inFlight 卡住 resolved Promise
    setOnline(false)
    await sync()
    // 再上线跑一次，应正常推送
    setOnline(true)
    outbox.enqueue({ op: 'insert', table: 'transactions', row: { id: 'recovery' } })
    await sync()
    expect(supaState.fromCalls.some((c) => c.op === 'insert')).toBe(true)
    expect(outbox.list()).toHaveLength(0)
  })
})
