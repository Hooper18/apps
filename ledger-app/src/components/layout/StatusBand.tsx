/**
 * 状态栏底：一条高度 = 顶部安全区的品牌红色带子，放在页面最上面。
 *
 * 为什么需要：index.html 用的是 `apple-mobile-web-app-status-bar-style=black-translucent`
 * （首页照片要铺到状态栏后面）。这个模式下状态栏的时间 / 信号 / 电量画成什么颜色
 * **不归页面管**：
 *  · 资料普遍说固定白色；用户 2026-11-12 确认浅色页（日历 / 设置）上白字融进浅色底看不清。
 *  · 但同一天用户在 iPhone 17 Pro Max 上的两张首页截图，一张是白字、一张是黑字
 *    （黑字那张系统还在顶部加了一层浅色雾化）—— 说明颜色会变，规律没摸清。
 * 所以不能赌文字颜色：除了首页，其它页面顶部都垫一条**黑字白字都读得出来**的颜色。
 * 品牌红 #e53935 对白字 4.2:1、对黑字 5.0:1，正好在中间；也和首页的红色照片呼应。
 * （别改成黑色或白色：黑底配黑字、白底配白字都会整条消失。）
 *
 * 配套（见 index.css）：
 *  · `.status-band` 的高度取 `--status-band`（= 顶部安全区）；没有安全区的设备上高度为 0，等于不存在。
 *  · `.status-band ~ *` 会把后面兄弟元素里的 `--sat` 置 0 —— 带子已经让出了状态栏，
 *    页面头部的 `pt-safe-*` 不用再让一次。
 *  · 紧跟其后的内容容器加 `rounded-t-band`，做成接在带子下面的圆角面板；
 *    外层容器加 `bg-band`，圆角后面露出来的才是同一个颜色。
 */
export default function StatusBand() {
  return <div aria-hidden className="status-band shrink-0" />
}

/**
 * 不走 Layout 的独立页面（登录 / 重置密码 / 关于）用的外壳：
 * 整屏高度 + 状态栏底 + 圆角内容面板。children 自己负责滚动（写 `h-full overflow-y-auto`）。
 */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-app max-w-md mx-auto flex flex-col bg-band">
      <StatusBand />
      <div className="rounded-t-band flex-1 min-h-0 overflow-hidden bg-gray-50">
        {children}
      </div>
    </div>
  )
}
