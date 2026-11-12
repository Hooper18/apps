import BottomNav from './BottomNav'
import OfflineBanner from './OfflineBanner'
import { useLastSync } from '../../hooks/useLastSync'
import { useSync } from '../../hooks/useSync'
import type { SyncKey } from '../../lib/lastSync'

interface LayoutProps {
  children: React.ReactNode
  hideNav?: boolean
}

const ALL_KEYS: SyncKey[] = ['transactions', 'categories', 'budgets']

export default function Layout({ children, hideNav = false }: LayoutProps) {
  // Layout 是 PWA 内"全局根容器"，把 sync orchestration 挂在这里：
  //  · 用户登录后立刻 push outbox + pull 最新数据
  //  · 监听 online 事件触发同步
  //  · 暴露 pendingCount 让 OfflineBanner 显示
  const { pendingCount, syncing, triggerSync } = useSync()
  const lastSyncedAt = useLastSync(ALL_KEYS)

  return (
    // h-app：外壳高度走 --app-h（见 index.css），iPhone 主屏幕模式下才能铺满整屏。
    // has-tabbar：让页面滚动区的 pb-page 自动多让出一个浮动标签栏的高度。
    <div className={`flex flex-col h-app max-w-md mx-auto bg-gray-50 relative overflow-hidden ${hideNav ? '' : 'has-tabbar'}`}>
      <OfflineBanner
        lastSyncedAt={lastSyncedAt}
        pendingCount={pendingCount}
        syncing={syncing}
        onSync={triggerSync}
      />
      {/* 页面内容铺到屏幕底；标签栏浮在上面，各页滚动区用 pb-page 让出位置 */}
      <main className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
        {children}
      </main>

      {!hideNav && <BottomNav />}
    </div>
  )
}
