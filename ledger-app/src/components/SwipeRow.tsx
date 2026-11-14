import { useEffect, useRef, useState } from 'react'
import { decideAxis, dragOffset, settleOffset, swipeClock, type SwipeAxis } from '../lib/swipe'

/**
 * 可以左滑露出操作按钮的列表行（iOS 的 swipe actions：通知、邮件、微信会话都是这个交互）。
 *
 *  · 往左滑：行内容跟着手指移开，右边露出 actions（按数组顺序从左到右排）。
 *  · 滑过一半或者快速一甩 → 停在滑开；否则弹回去。
 *  · 滑开后：点按钮执行操作并收回；点行本身、点别处、往右滑都只是收回。
 *  · 竖着划仍然是列表滚动（`touch-action: pan-y`，方向判定见 lib/swipe.ts）。
 *
 * 开合状态放在父组件（open / onOpenChange），这样一个列表里同一时间只滑开一行，
 * 列表滚动时父组件也能统一收回。
 *
 * children 是行本身（通常是一个 button）。滑动结束时浏览器补发的那次 click 会被吃掉，
 * 不会误触发行的点击。
 */

export interface SwipeAction {
  key: string
  label: string
  /** neutral = 灰底（编辑这类普通操作），danger = 红底（删除） */
  tone: 'neutral' | 'danger'
  onClick: () => void
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: SwipeAction[]
  children: React.ReactNode
  className?: string
}

/** 每个按钮的宽度。HIG 要求点击区域至少 44pt，这里按系统列表的观感给到 74。 */
export const SWIPE_ACTION_WIDTH = 74

/** 滑动 / 收回之后这么久以内的 click 一律吃掉（浏览器在 pointerup 后补发的那一次）。 */
const CLICK_SUPPRESS_MS = 400

/** 速度采样的最短间隔。两次事件挨得太近算出来的速度没有意义。 */
const MIN_SAMPLE_MS = 4

/**
 * 最近一次"点别处把某一行收回去"的时间。所有行共用：
 * 滑开 A 之后点 B，应该只是把 A 收回，B 不该被当成点击（和系统列表一致）。
 */
let dismissedAt = -Infinity

interface Gesture {
  pointerId: number
  startX: number
  startY: number
  startOffset: number
  axis: SwipeAxis
  lastX: number
  lastT: number
  velocity: number
}

const TONE_CLASS: Record<SwipeAction['tone'], string> = {
  neutral: 'bg-gray-400',
  danger: 'bg-red-600',
}

export default function SwipeRow({ open, onOpenChange, actions, children, className = '' }: Props) {
  const max = actions.length * SWIPE_ACTION_WIDTH
  const rootRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const suppressClickUntil = useRef(-Infinity)
  // 拖动中的 offset；null 表示没在拖，位置由 open 决定（带过渡动画）。
  const [dragging, setDragging] = useState<number | null>(null)

  const offset = dragging ?? (open ? max : 0)
  const revealed = open || dragging !== null

  // 滑开时，按在这一行以外的任何地方都收回。
  useEffect(() => {
    if (!open) return
    const onDown = (e: Event) => {
      const root = rootRef.current
      if (root && e.target instanceof Node && root.contains(e.target)) return
      dismissedAt = swipeClock.now()
      onOpenChange(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open, onOpenChange])

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: open ? max : 0,
      axis: 'undecided',
      lastX: e.clientX,
      lastT: swipeClock.now(),
      velocity: 0,
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    const dx = e.clientX - g.startX
    const dy = e.clientY - g.startY

    if (g.axis === 'undecided') {
      g.axis = decideAxis(dx, dy)
      if (g.axis === 'x') {
        // 之后的移动都归这一行，手指滑出行外也继续跟
        e.currentTarget.setPointerCapture?.(e.pointerId)
      }
    }
    if (g.axis !== 'x') return

    const now = swipeClock.now()
    const dt = now - g.lastT
    if (dt >= MIN_SAMPLE_MS) {
      g.velocity = (e.clientX - g.lastX) / dt
      g.lastX = e.clientX
      g.lastT = now
    }
    setDragging(dragOffset(g.startOffset, dx, max))
  }

  function endGesture(e: React.PointerEvent<HTMLDivElement>, cancelled: boolean) {
    const g = gesture.current
    if (!g || g.pointerId !== e.pointerId) return
    gesture.current = null

    if (g.axis === 'x') {
      // 一次横滑结束：决定停在哪，并吃掉随后补发的 click
      const current = dragOffset(g.startOffset, e.clientX - g.startX, max)
      const target = cancelled ? g.startOffset : settleOffset(current, g.velocity, max)
      suppressClickUntil.current = swipeClock.now() + CLICK_SUPPRESS_MS
      setDragging(null)
      onOpenChange(target > 0)
      return
    }

    // 没有横滑。行是滑开的话，这一下轻点只用来收回。
    if (!cancelled && g.axis === 'undecided' && g.startOffset > 0) {
      suppressClickUntil.current = swipeClock.now() + CLICK_SUPPRESS_MS
      onOpenChange(false)
    }
  }

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    const now = swipeClock.now()
    if (now < suppressClickUntil.current || now - dismissedAt < CLICK_SUPPRESS_MS) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  return (
    <div
      ref={rootRef}
      data-swipe-row
      data-open={open}
      className={`relative overflow-hidden ${className}`}
    >
      {/* 按钮层：垫在行内容后面，靠右。拖过头时跟着拉宽（和系统的橡皮筋效果一致）。 */}
      <div
        aria-hidden={!open}
        className="absolute inset-y-0 right-0 flex"
        style={{
          width: Math.max(max, offset),
          visibility: revealed ? 'visible' : 'hidden',
          // 收回时等行内容滑回去再隐藏，否则会先露出一块空白
          transition: revealed ? 'none' : 'visibility 0s linear 0.25s',
        }}
      >
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => {
              onOpenChange(false)
              a.onClick()
            }}
            className={`flex-1 min-w-0 flex items-center justify-center text-sm font-medium text-white active:brightness-90 transition-[filter] ${TONE_CLASS[a.tone]}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* 行内容：不透明底色盖住按钮层，跟着手指平移 */}
      <div
        data-swipe-content
        className="relative bg-white"
        style={{
          transform: `translate3d(${-offset}px, 0, 0)`,
          transition: dragging === null ? 'transform 0.25s cubic-bezier(.2,.8,.2,1)' : 'none',
          touchAction: 'pan-y',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endGesture(e, false)}
        onPointerCancel={(e) => endGesture(e, true)}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  )
}
