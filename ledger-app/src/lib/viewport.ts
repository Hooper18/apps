/**
 * iPhone 主屏幕 web app 的外壳高度兜底。
 *
 * 背景：iOS 上把站点"添加到主屏幕"后，在 viewport-fit=cover 下 `100%` / `dvh` /
 * `svh` 这些高度会比屏幕矮一截安全区（WebKit bug 254868），底部露出一条 body
 * 背景，看起来像"导航栏下面多了一块空白"。CSS 里 standalone 已经改用 100vh，
 * 这里再用屏幕尺寸写一个确定的像素值，不依赖 WebKit 哪个单位算得对。
 *
 * 只在 iPhone + standalone 下生效：iPhone 的 web app 永远铺满整屏；iPad 有分屏 /
 * 台前调度，窗口不一定等于屏幕，所以不碰。
 */

export interface ViewportEnv {
  /** 是否以主屏幕 web app（standalone）方式运行 */
  standalone: boolean
  isIPhone: boolean
  portrait: boolean
  /** screen.width / screen.height —— iOS 上这两个值不随横竖屏交换 */
  screenWidth: number
  screenHeight: number
}

/** 返回应写入 --app-h 的像素值；不需要兜底时返回 null（交给 CSS）。 */
export function computeAppHeight(env: ViewportEnv): number | null {
  if (!env.standalone || !env.isIPhone) return null
  const long = Math.max(env.screenWidth, env.screenHeight)
  const short = Math.min(env.screenWidth, env.screenHeight)
  const h = env.portrait ? long : short
  if (!Number.isFinite(h) || h <= 0) return null
  return h
}

function readEnv(win: Window): ViewportEnv {
  const nav = win.navigator as Navigator & { standalone?: boolean }
  const mm = typeof win.matchMedia === 'function' ? win.matchMedia.bind(win) : null
  return {
    standalone: nav.standalone === true || (mm ? mm('(display-mode: standalone)').matches : false),
    isIPhone: /iPhone|iPod/.test(nav.userAgent ?? ''),
    portrait: mm ? mm('(orientation: portrait)').matches : true,
    screenWidth: win.screen?.width ?? 0,
    screenHeight: win.screen?.height ?? 0,
  }
}

/** 启动时调用一次；之后跟随旋转 / 尺寸变化自动更新。 */
export function installAppHeight(win: Window = window): void {
  const root = win.document.documentElement
  const apply = () => {
    const h = computeAppHeight(readEnv(win))
    if (h == null) root.style.removeProperty('--app-h')
    else root.style.setProperty('--app-h', `${h}px`)
  }
  apply()
  win.addEventListener('resize', apply)
  win.addEventListener('orientationchange', apply)
}
