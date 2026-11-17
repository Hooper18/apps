import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { sync as runSync, subscribeSyncState, type SyncState } from '../lib/sync'
import * as outbox from '../lib/outbox'

/** 回到前台触发同步的最小间隔。 */
export const RESUME_SYNC_MIN_INTERVAL_MS = 10_000

/**
 * App 级别的 sync 编排：
 *  · 用户登录后立刻 push + pull 一次
 *  · 网络从 offline 切到 online 时 push + pull
 *  · App 从后台回到前台时 push + pull（自动入账的流水是别处写进库的，不重新拉就看不到）
 *  · 暴露手动 trigger 用于"立即同步"按钮
 *  · 暴露 pendingCount + state 给 banner 显示
 *
 * 这个 hook 只在 App 顶层挂一次，避免多处调用导致重复同步。
 */
export function useSync() {
  const { user } = useAuth()
  const [pendingCount, setPendingCount] = useState(() => outbox.count())
  const [state, setState] = useState<SyncState>('idle')

  // 监听 outbox 变化，更新待同步条数
  useEffect(() => {
    const update = () => setPendingCount(outbox.count())
    update()
    return outbox.subscribe(update)
  }, [])

  useEffect(() => subscribeSyncState(setState), [])

  // 用户登录 / 切换用户：立即同步一次
  useEffect(() => {
    if (!user) return
    void runSync()
  }, [user])

  // 监听 online 事件
  useEffect(() => {
    if (!user) return
    const onOnline = () => void runSync()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [user])

  // 回到前台：重新同步一次。限频，免得来回切 App 时连着打请求。
  useEffect(() => {
    if (!user) return
    let last = 0
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - last < RESUME_SYNC_MIN_INTERVAL_MS) return
      last = now
      void runSync()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [user])

  const triggerSync = useCallback(() => {
    void runSync()
  }, [])

  return { pendingCount, state, syncing: state !== 'idle', triggerSync }
}
