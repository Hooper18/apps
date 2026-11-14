import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeAppHeight, installAppHeight, collectViewportDiag } from './viewport'

// iPhone 15 / 16：393×852，顶部安全区 59。主屏幕模式下 innerHeight 比屏幕矮一截安全区。
const iphone = {
  standalone: true,
  isIPhone: true,
  portrait: true,
  screenWidth: 393,
  screenHeight: 852,
  viewportWidth: 393,
  viewportHeight: 793,
}

// 用户的 iPhone 17 Pro Max：440×956，顶部安全区 62。
const proMax = {
  ...iphone,
  screenWidth: 440,
  screenHeight: 956,
  viewportWidth: 440,
  viewportHeight: 894,
}

describe('computeAppHeight', () => {
  it('uses the full screen height for an iPhone home-screen web app in portrait', () => {
    expect(computeAppHeight(iphone)).toBe(852)
  })

  it('covers the whole 440×956 screen of an iPhone 17 Pro Max', () => {
    expect(computeAppHeight(proMax)).toBe(956)
    expect(
      computeAppHeight({ ...proMax, portrait: false, viewportWidth: 956, viewportHeight: 440 }),
    ).toBe(440)
  })

  it('uses the short edge in landscape (iOS never swaps screen.width/height)', () => {
    expect(
      computeAppHeight({ ...iphone, portrait: false, viewportWidth: 852, viewportHeight: 393 }),
    ).toBe(393)
  })

  // 回归：2026-11-14 用户的手机上网页有约 1.15 倍缩放，CSS 视口是 384×834 而不是 440×956。
  // 旧实现把 screen.height（956，设备点）直接当 CSS 像素用，外壳比屏幕高 122px，
  // 贴底的标签栏整条掉到屏幕外面。
  it('stays in CSS pixels when the web view is zoomed (screen points ≠ CSS px)', () => {
    const h = computeAppHeight({ ...proMax, viewportWidth: 384, viewportHeight: 780 })
    expect(h).toBe(834) // 384 × 956 / 440 = 834.3
    expect(h).not.toBe(956)
  })

  it('works when the web view is zoomed out as well', () => {
    // 85% 页面缩放：CSS 视口比屏幕点数大
    expect(computeAppHeight({ ...proMax, viewportWidth: 518, viewportHeight: 1052 })).toBe(1125)
  })

  it('returns the viewport height unchanged once WebKit reports the full height itself', () => {
    expect(computeAppHeight({ ...proMax, viewportHeight: 956 })).toBe(956)
  })

  it('leaves it to CSS when the result would be far taller than the viewport', () => {
    // 算出来 956，但布局视口只有 600 高 —— 两边对不上，宁可不写
    expect(computeAppHeight({ ...proMax, viewportHeight: 600 })).toBeNull()
  })

  it('leaves it to CSS when the result would be shorter than the viewport', () => {
    // 窗口不是整屏的比例（比如被分屏），不能按屏幕长宽比推
    expect(computeAppHeight({ ...proMax, viewportWidth: 300, viewportHeight: 894 })).toBeNull()
  })

  it('leaves it to CSS when running in a browser tab', () => {
    expect(computeAppHeight({ ...iphone, standalone: false })).toBeNull()
  })

  it('leaves it to CSS on non-iPhone devices (iPad windows are not always full screen)', () => {
    expect(computeAppHeight({ ...iphone, isIPhone: false })).toBeNull()
  })

  it('ignores nonsense screen sizes', () => {
    expect(computeAppHeight({ ...iphone, screenWidth: 0, screenHeight: 0 })).toBeNull()
    expect(computeAppHeight({ ...iphone, screenWidth: NaN, screenHeight: NaN })).toBeNull()
  })

  it('ignores a viewport that has not been measured yet', () => {
    expect(computeAppHeight({ ...iphone, viewportWidth: 0 })).toBeNull()
    expect(computeAppHeight({ ...iphone, viewportHeight: 0 })).toBeNull()
    expect(computeAppHeight({ ...iphone, viewportWidth: NaN })).toBeNull()
  })
})

interface FakeOpts {
  standalone: boolean
  ua: string
  portrait: boolean
  screen: { width: number; height: number }
  innerWidth: number
  innerHeight: number
}

function fakeWindow(opts: FakeOpts) {
  const listeners: Record<string, () => void> = {}
  const win = {
    document,
    navigator: { standalone: opts.standalone, userAgent: opts.ua },
    get screen() { return opts.screen },
    get innerWidth() { return opts.innerWidth },
    get innerHeight() { return opts.innerHeight },
    matchMedia: (q: string) => ({
      matches: q.includes('orientation') ? opts.portrait : opts.standalone,
    }),
    addEventListener: (name: string, cb: () => void) => { listeners[name] = cb },
  }
  return { win: win as unknown as Window, listeners, opts }
}

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X)'

describe('installAppHeight', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--app-h')
    vi.unstubAllGlobals()
  })

  it('writes --app-h in px on an iPhone home-screen web app and follows rotation', () => {
    const f = fakeWindow({
      standalone: true, ua: IPHONE_UA, portrait: true,
      screen: { width: 393, height: 852 }, innerWidth: 393, innerHeight: 793,
    })
    installAppHeight(f.win)
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('852px')

    f.opts.portrait = false
    f.opts.innerWidth = 852
    f.opts.innerHeight = 393
    f.listeners.resize()
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('393px')
  })

  it('writes the zoom-corrected height on a zoomed iPhone 17 Pro Max', () => {
    const f = fakeWindow({
      standalone: true, ua: IPHONE_UA, portrait: true,
      screen: { width: 440, height: 956 }, innerWidth: 384, innerHeight: 780,
    })
    installAppHeight(f.win)
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('834px')
  })

  it('re-measures when the page is shown again (iOS can report a stale size at launch)', () => {
    const f = fakeWindow({
      standalone: true, ua: IPHONE_UA, portrait: true,
      screen: { width: 440, height: 956 }, innerWidth: 0, innerHeight: 0,
    })
    installAppHeight(f.win)
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('')

    f.opts.innerWidth = 384
    f.opts.innerHeight = 780
    f.listeners.pageshow()
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('834px')
  })

  it('does not touch --app-h in a normal browser tab', () => {
    const f = fakeWindow({
      standalone: false, ua: 'Mozilla/5.0 (Linux; Android 15)', portrait: true,
      screen: { width: 393, height: 852 }, innerWidth: 393, innerHeight: 780,
    })
    installAppHeight(f.win)
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('')
  })
})

describe('collectViewportDiag', () => {
  it('reports the numbers needed to debug a real device from a screenshot', () => {
    const f = fakeWindow({
      standalone: true, ua: IPHONE_UA, portrait: true,
      screen: { width: 440, height: 956 }, innerWidth: 384, innerHeight: 780,
    })
    const rows = collectViewportDiag(f.win)
    const byLabel = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(byLabel.screen).toBe('440×956')
    expect(byLabel.inner).toBe('384×780')
    expect(byLabel.standalone).toBe('yes')
    expect(byLabel['app-h(js)']).toBe('834')
    // 每一项都是可以直接显示的字符串
    for (const r of rows) expect(typeof r.value).toBe('string')
  })
})
