import { describe, it, expect, vi, afterEach } from 'vitest'
import { computeAppHeight, installAppHeight } from './viewport'

const iphone = {
  standalone: true,
  isIPhone: true,
  portrait: true,
  screenWidth: 393,
  screenHeight: 852,
}

describe('computeAppHeight', () => {
  it('uses the full screen height for an iPhone home-screen web app in portrait', () => {
    expect(computeAppHeight(iphone)).toBe(852)
  })

  it('uses the short edge in landscape (iOS never swaps screen.width/height)', () => {
    expect(computeAppHeight({ ...iphone, portrait: false })).toBe(393)
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
})

describe('installAppHeight', () => {
  afterEach(() => {
    document.documentElement.style.removeProperty('--app-h')
    vi.unstubAllGlobals()
  })

  function fakeWindow(opts: { standalone: boolean; ua: string; portrait: boolean }) {
    const listeners: Record<string, () => void> = {}
    const win = {
      document,
      navigator: { standalone: opts.standalone, userAgent: opts.ua },
      screen: { width: 393, height: 852 },
      matchMedia: (q: string) => ({
        matches: q.includes('orientation') ? opts.portrait : opts.standalone,
      }),
      addEventListener: (name: string, cb: () => void) => { listeners[name] = cb },
    }
    return { win: win as unknown as Window, listeners, opts }
  }

  it('writes --app-h in px on an iPhone home-screen web app and follows rotation', () => {
    const f = fakeWindow({ standalone: true, ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1)', portrait: true })
    installAppHeight(f.win)
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('852px')

    f.opts.portrait = false
    f.listeners.resize()
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('393px')
  })

  it('does not touch --app-h in a normal browser tab', () => {
    const f = fakeWindow({ standalone: false, ua: 'Mozilla/5.0 (Linux; Android 15)', portrait: true })
    installAppHeight(f.win)
    expect(document.documentElement.style.getPropertyValue('--app-h')).toBe('')
  })
})
