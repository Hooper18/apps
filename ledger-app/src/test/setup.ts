import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// 每个测试后清空 React DOM + localStorage + 移除所有 window 事件监听
// 避免跨用例污染（toast bus / sync 事件 / category-sort-changed 等都走 window event）。
afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  vi.useRealTimers()
})

beforeEach(() => {
  // navigator.onLine 在 jsdom 里默认 true；测试里要切换时用 vi.spyOn。
  // 这里保持默认，不做全局 mock。
})
