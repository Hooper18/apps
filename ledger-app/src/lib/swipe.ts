/**
 * 列表行左滑露出操作按钮（iOS 的 swipe actions）用到的纯计算。
 * 手势本身在 components/SwipeRow.tsx 里接指针事件，这里只管数：
 * 方向怎么判、行跟着手指走多远、松手后停在哪。
 *
 * 约定："offset" = 行内容向左移开了多少像素。0 是收起，max（按钮总宽）是完全滑开。
 */

/** 手指至少移动这么多像素才判定方向，免得轻点时的抖动被当成滑动。 */
export const SWIPE_LOCK_PX = 8

/** 横向分量要比纵向大出这个倍数才算横滑；斜着划一律让给列表滚动。 */
const HORIZONTAL_BIAS = 1.2

/** 超过按钮宽度后继续拖的阻尼：多拖 100px 只多走 25px。 */
const OVERDRAG_RESISTANCE = 0.25

/** 松手速度超过这个值（px/ms）算"甩"，按甩的方向决定开合。 */
const FLICK_VELOCITY = 0.3

/** 行至少被拖开这么多，甩的动作才算数（防止几乎没动就被判成滑开）。 */
const FLICK_MIN_OFFSET = 12

export type SwipeAxis = 'undecided' | 'x' | 'y'

/** 按起点到当前位置的位移判断这次手势是横滑还是竖滚。 */
export function decideAxis(dx: number, dy: number): SwipeAxis {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (Math.max(ax, ay) < SWIPE_LOCK_PX) return 'undecided'
  return ax > ay * HORIZONTAL_BIAS ? 'x' : 'y'
}

/**
 * 拖动过程中行应该处在的 offset。
 * @param startOffset 手指按下时行的 offset（0 或 max）
 * @param dx 手指相对按下点的横向位移，向左为负
 * @param max 按钮总宽
 */
export function dragOffset(startOffset: number, dx: number, max: number): number {
  const raw = startOffset - dx
  if (raw <= 0) return 0
  if (raw <= max) return raw
  return max + (raw - max) * OVERDRAG_RESISTANCE
}

/**
 * 松手后行应该停在哪：0（收起）或 max（滑开）。
 * @param offset 松手时的 offset
 * @param velocityX 松手时的横向速度（px/ms），向左为负；量不出来传 0
 */
export function settleOffset(offset: number, velocityX: number, max: number): number {
  if (velocityX <= -FLICK_VELOCITY && offset >= FLICK_MIN_OFFSET) return max
  if (velocityX >= FLICK_VELOCITY) return 0
  return offset > max / 2 ? max : 0
}

/** 计时用的时钟，单独放一个对象是为了测试里能换掉。 */
export const swipeClock = {
  now: (): number => performance.now(),
}
