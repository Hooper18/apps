// 轻量全局 toast 通道：window event bus + 顶层一个渲染宿主。
//
// 模块代码（如 sync.ts）不在 React 树内，没法用 hook。通过 window event
// 派发消息让顶层 ToastHost 接收并渲染，避免在每个调用点散落本地 toast。
//
// 仅用于"用户应该感知但非阻塞"的偶发提示（同步被拒、汇率拉取失败等）。
// 单一队列，后者覆盖前者。

const EVENT = 'ledger:toast'

export interface ToastPayload {
  message: string
  durationMs?: number
}

export function showToast(message: string, opts?: { durationMs?: number }): void {
  if (typeof window === 'undefined') return
  const detail: ToastPayload = { message, durationMs: opts?.durationMs }
  window.dispatchEvent(new CustomEvent(EVENT, { detail }))
}

export function subscribeToast(cb: (p: ToastPayload) => void): () => void {
  const handler = (e: Event) => cb((e as CustomEvent).detail as ToastPayload)
  window.addEventListener(EVENT, handler)
  return () => window.removeEventListener(EVENT, handler)
}
