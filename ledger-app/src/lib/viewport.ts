/**
 * iPhone 主屏幕 web app 的外壳高度兜底。
 *
 * 背景：iOS 上把站点"添加到主屏幕"后，在 viewport-fit=cover 下 `100%` / `dvh` /
 * `svh` 这些高度会比屏幕矮一截安全区（WebKit bug 254868），底部露出一条 body
 * 背景，看起来像"导航栏下面多了一块空白"。CSS 里 standalone 已经改用 100vh，
 * 这里再算一个确定的像素值，不依赖 WebKit 哪个单位算得对。
 *
 * 怎么算：**视口宽度 × 屏幕长宽比**。
 *  · 宽度不受那个高度 bug 影响，而且本来就是 CSS 像素；
 *  · 长宽比没有单位，网页被缩放多少都成立。
 * 不能直接用 `screen.height`：它的单位是设备点，网页有缩放时（系统的页面缩放 /
 * 放大显示）和 CSS 像素不相等。2026-11-14 用户的 iPhone 17 Pro Max 上 CSS 视口是
 * 384×834、`screen.height` 是 956，当时直接写 956px，外壳比屏幕高 122px，
 * 贴底的标签栏整条掉到屏幕外面。
 *
 * 只在 iPhone + standalone 下生效：iPhone 的 web app 永远铺满整屏；iPad 有分屏 /
 * 台前调度，窗口不一定等于屏幕，所以不碰。
 */

export interface ViewportEnv {
  /** 是否以主屏幕 web app（standalone）方式运行 */
  standalone: boolean
  isIPhone: boolean
  portrait: boolean
  /** screen.width / screen.height（设备点）—— iOS 上这两个值不随横竖屏交换 */
  screenWidth: number
  screenHeight: number
  /** 布局视口的宽 / 高（CSS 像素）。高度就是会偏矮的那个值，只用来做合理性检查。 */
  viewportWidth: number
  viewportHeight: number
}

/** 算出来的高度最多允许比布局视口高出这么多（那个 bug 少掉的是状态栏，约 7%）。 */
const MAX_OVER_VIEWPORT = 1.15
/** 允许比布局视口矮的舍入误差（px）。 */
const ROUNDING_SLACK = 2

function positive(n: number): boolean {
  return Number.isFinite(n) && n > 0
}

/** 返回应写入 --app-h 的像素值（CSS px）；不需要兜底或拿不准时返回 null（交给 CSS）。 */
export function computeAppHeight(env: ViewportEnv): number | null {
  if (!env.standalone || !env.isIPhone) return null
  if (!positive(env.screenWidth) || !positive(env.screenHeight)) return null
  if (!positive(env.viewportWidth) || !positive(env.viewportHeight)) return null

  const long = Math.max(env.screenWidth, env.screenHeight)
  const short = Math.min(env.screenWidth, env.screenHeight)
  const aspect = env.portrait ? long / short : short / long
  const h = Math.round(env.viewportWidth * aspect)

  // 合理性检查：整屏高度只可能等于布局视口高度（没有那个 bug），或者比它高出一截状态栏。
  // 落在这个范围外说明前提不成立（窗口不是整屏、尺寸还没量好……），宁可不写。
  if (h < env.viewportHeight - ROUNDING_SLACK) return null
  if (h > env.viewportHeight * MAX_OVER_VIEWPORT) return null
  return h
}

function readEnv(win: Window): ViewportEnv {
  const nav = win.navigator as Navigator & { standalone?: boolean }
  const mm = typeof win.matchMedia === 'function' ? win.matchMedia.bind(win) : null
  const docEl = win.document?.documentElement
  return {
    standalone: nav.standalone === true || (mm ? mm('(display-mode: standalone)').matches : false),
    isIPhone: /iPhone|iPod/.test(nav.userAgent ?? ''),
    portrait: mm ? mm('(orientation: portrait)').matches : true,
    screenWidth: win.screen?.width ?? 0,
    screenHeight: win.screen?.height ?? 0,
    // clientWidth 是布局宽度；拿不到（0）时退回 innerWidth。
    viewportWidth: docEl?.clientWidth || win.innerWidth || 0,
    viewportHeight: win.innerHeight || 0,
  }
}

/** 启动时调用一次；之后跟随旋转 / 尺寸变化 / 回到前台自动重算。 */
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
  // iOS 冷启动时偶尔先给一个没量好的尺寸，之后也不一定补发 resize。
  win.addEventListener('pageshow', apply)
}

export interface DiagRow {
  label: string
  value: string
}

/** 往页面里放一个看不见的探针，量某个 CSS 长度实际是多少像素。量不了返回 null。 */
function probePx(win: Window, cssLength: string): number | null {
  const doc = win.document
  if (!doc?.body) return null
  const el = doc.createElement('div')
  el.style.cssText = 'position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;'
  el.style.height = cssLength
  // 浏览器不认识这个长度时 height 会保持为空，量出来没有意义
  if (!el.style.height) return null
  doc.body.appendChild(el)
  const h = el.getBoundingClientRect().height
  el.remove()
  return h
}

function num(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return digits ? n.toFixed(digits) : String(Math.round(n * 100) / 100)
}

/**
 * 真机排查用：把和外壳高度 / 安全区有关的数值收集成几行文字（显示在「关于」页最下面）。
 * 手机上没有开发者工具，出了布局问题截这一屏就能判断是哪个值不对。
 */
export function collectViewportDiag(win: Window = window): DiagRow[] {
  const env = readEnv(win)
  const docEl = win.document?.documentElement
  const vv = win.visualViewport
  const short = Math.min(env.screenWidth, env.screenHeight)
  const long = Math.max(env.screenWidth, env.screenHeight)
  const screenAcross = env.portrait ? short : long
  const rootEl = win.document?.getElementById?.('root')
  const jsHeight = computeAppHeight(env)

  return [
    { label: 'standalone', value: env.standalone ? 'yes' : 'no' },
    { label: 'iphone', value: env.isIPhone ? 'yes' : 'no' },
    { label: 'orientation', value: env.portrait ? 'portrait' : 'landscape' },
    { label: 'screen', value: `${num(env.screenWidth)}×${num(env.screenHeight)}` },
    { label: 'inner', value: `${num(win.innerWidth)}×${num(win.innerHeight)}` },
    { label: 'client', value: `${num(docEl?.clientWidth)}×${num(docEl?.clientHeight)}` },
    { label: 'visual', value: vv ? `${num(vv.width)}×${num(vv.height)} @${num(vv.scale, 2)}` : '—' },
    { label: 'dpr', value: num(win.devicePixelRatio, 2) },
    {
      label: 'zoom',
      value: positive(env.viewportWidth) && positive(screenAcross) ? num(screenAcross / env.viewportWidth, 3) : '—',
    },
    { label: '100vh', value: num(probePx(win, '100vh')) },
    { label: '100dvh', value: num(probePx(win, '100dvh')) },
    { label: '100lvh', value: num(probePx(win, '100lvh')) },
    { label: 'fixed 100%', value: num(probePx(win, '100%')) },
    { label: 'safe-top', value: num(probePx(win, 'env(safe-area-inset-top, 0px)')) },
    { label: 'safe-bottom', value: num(probePx(win, 'env(safe-area-inset-bottom, 0px)')) },
    { label: 'app-h(js)', value: jsHeight == null ? 'css' : String(jsHeight) },
    { label: 'app-h(used)', value: num(probePx(win, 'var(--app-h)')) },
    { label: 'root', value: rootEl ? num(rootEl.getBoundingClientRect().height) : '—' },
  ]
}
