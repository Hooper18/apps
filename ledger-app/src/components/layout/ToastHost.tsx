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
      className="anim-toast fixed bottom-10 left-1/2 bg-black/75 text-white px-5 py-2.5 rounded-full text-sm whitespace-nowrap z-50 pointer-events-none max-w-[80vw] truncate"
    >
      {msg}
    </div>
  )
}
