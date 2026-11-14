import { describe, it, expect } from 'vitest'
import { decideAxis, dragOffset, settleOffset, SWIPE_LOCK_PX } from './swipe'

describe('decideAxis', () => {
  it('stays undecided until the finger has moved far enough', () => {
    expect(decideAxis(0, 0)).toBe('undecided')
    expect(decideAxis(-(SWIPE_LOCK_PX - 1), 2)).toBe('undecided')
    expect(decideAxis(3, SWIPE_LOCK_PX - 1)).toBe('undecided')
  })

  it('locks to horizontal when the move is clearly sideways', () => {
    expect(decideAxis(-20, 4)).toBe('x')
    expect(decideAxis(20, -4)).toBe('x')
  })

  it('locks to vertical when scrolling the list', () => {
    expect(decideAxis(-4, 20)).toBe('y')
    expect(decideAxis(3, -30)).toBe('y')
  })

  it('treats a diagonal move as vertical so the list keeps scrolling', () => {
    expect(decideAxis(-12, 12)).toBe('y')
    expect(decideAxis(-13, 12)).toBe('y')
  })
})

describe('dragOffset', () => {
  const max = 148

  it('follows the finger when dragging left from closed', () => {
    expect(dragOffset(0, -50, max)).toBe(50)
    expect(dragOffset(0, -148, max)).toBe(148)
  })

  it('does not move the row to the right of its resting position', () => {
    expect(dragOffset(0, 40, max)).toBe(0)
  })

  it('follows the finger back when dragging right from open', () => {
    expect(dragOffset(max, 60, max)).toBe(88)
    expect(dragOffset(max, 500, max)).toBe(0)
  })

  it('resists being dragged past the buttons', () => {
    const over = dragOffset(0, -248, max) // 比按钮宽度多拖了 100
    expect(over).toBeGreaterThan(max)
    expect(over).toBeLessThan(max + 40)
    // 越拖越多，但始终是递增的
    expect(dragOffset(0, -348, max)).toBeGreaterThan(over)
  })
})

describe('settleOffset', () => {
  const max = 148

  it('opens when released past the halfway point', () => {
    expect(settleOffset(80, 0, max)).toBe(max)
  })

  it('closes when released before the halfway point', () => {
    expect(settleOffset(60, 0, max)).toBe(0)
  })

  it('opens on a quick flick to the left even if it did not travel far', () => {
    expect(settleOffset(30, -0.6, max)).toBe(max)
  })

  it('closes on a quick flick to the right even if it is still mostly open', () => {
    expect(settleOffset(120, 0.6, max)).toBe(0)
  })

  it('ignores a flick that barely moved the row', () => {
    // 几乎没动就松手：不算滑开
    expect(settleOffset(4, -0.6, max)).toBe(0)
  })

  it('snaps back to fully open after an over-drag', () => {
    expect(settleOffset(max + 30, 0, max)).toBe(max)
  })
})
