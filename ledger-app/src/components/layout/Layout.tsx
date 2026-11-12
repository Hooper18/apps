import BottomNav from './BottomNav'
import OfflineBanner from './OfflineBanner'
import StatusBand from './StatusBand'
import { useLastSync } from '../../hooks/useLastSync'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { useSync } from '../../hooks/useSync'
import type { SyncKey } from '../../lib/lastSync'

interface LayoutProps {
  children: React.ReactNode
  hideNav?: boolean
  /**
   * 页面自己把照片铺到状态栏后面（首页），不需要状态栏底。
   * 其它页面都是浅色的，必须垫状态栏底，否则 iOS 状态栏文字是白色时看不见（见 StatusBand）。
   */
  immersive?: boolean
}

const ALL_KEYS: SyncKey[] = ['transactions', 'categories', 'budgets']

export default function Layout({ children, hideNav = false, immersive = false }: LayoutProps) {
  // Layout 是 PWA 内"全局根容器"，把 sync orchestration 挂在这里：
  //  · 用户登录后立刻 push outbox + pull 最新数据
  //  · 监听 online 事件触发同步
  //  · 暴露 pendingCount 让 OfflineBanner 显示
  const { pendingCount, syncing, triggerSync } = useSync()
  const lastSyncedAt = useLastSync(ALL_KEYS)

  // 和 OfflineBanner 自己的显示条件保持一致：横幅是浅灰色的，它出现在最顶上时
  // 同样需要状态栏底，哪怕是 immersive 的首页。
  const online = useOnlineStatus()
  const bannerVisible = !online || pendingCount > 0
  const showBand = !immersive || bannerVisible

  return (
    // h-app：外壳高度走 --app-h（见 index.css），iPhone 主屏幕模式下才能铺满整屏。
    // has-tabbar：让页面滚动区的 pb-page 自动多让出一个浮动标签栏的高度。
    // bg-band：圆角面板两个上角露出来的底色，和状态栏底同色。
    <div className={`flex flex-col h-app max-w-md mx-auto bg-band relative overflow-hidden ${hideNav ? '' : 'has-tabbar'}`}>
      {showBand && <StatusBand />}

      <div className={`flex-1 min-h-0 flex flex-col overflow-hidden bg-gray-50 ${showBand ? 'rounded-t-band' : ''}`}>
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
      </div>

      {!hideNav && <BottomNav />}
    </div>
  )
}
