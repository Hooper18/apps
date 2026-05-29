import { useEffect, useState } from 'react'
import { subscribeToast } from '../../lib/toast'

const DEFAULT_DURATION_MS = 2000

export default function ToastHost() {
  const [msg, setMsg] = useState('')
  const [duration, setDuration] = useState(DEFAULT_DURATION_MS)
  const [token, setToken] = useState(0)

  useEffect(() => {
    return subscribeToast((p) => {
      setMsg(p.message)
      setDuration(p.durationMs ?? DEFAULT_DURATION_MS)
      setToken((n) => n + 1)
    })
  }, [])

  useEffect(() => {
    if (!msg) return
    const id = window.setTimeout(() => setMsg(''), duration)
    return () => window.clearTimeout(id)
  }, [msg, duration, token])

  if (!msg) return null
  return (
    <div
      key={token}
      role="status"
      aria-live="polite"
      onClick={() => setMsg('')}
      // 长 message（含 supabase 错码 + constraint 名）一行装不下，所以：
      // - rounded-2xl 取代 pill 形状
      // - 去 whitespace-nowrap + truncate，文字自然换行
      // - 用 pointer-events-auto + onClick 让用户能点掉提前关闭
      // - animationDuration 用 inline style 跟 setTimeout 的 duration 对齐，
      //   否则 keyframe 固定 2s 会让长 duration 中间出现"空挂"
      style={{ animationDuration: `${duration}ms`, transform: 'translateX(-50%)' }}
      className="anim-toast fixed bottom-10 left-1/2 bg-black/85 text-white px-4 py-3 rounded-2xl text-sm leading-snug z-50 pointer-events-auto max-w-[85vw] break-words text-center cursor-pointer"
    >
      {msg}
    </div>
  )
}
