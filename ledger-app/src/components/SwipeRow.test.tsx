import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SwipeRow, { SWIPE_ACTION_WIDTH } from './SwipeRow'
import { swipeClock } from '../lib/swipe'

const onRowClick = vi.fn()
const onEdit = vi.fn()
const onDelete = vi.fn()

function Harness({ ids = ['a'] }: { ids?: string[] }) {
  const [openId, setOpenId] = useState<string | null>(null)
  return (
    <div>
      {ids.map((id) => (
        <SwipeRow
          key={id}
          open={openId === id}
          onOpenChange={(o) => setOpenId((cur) => (o ? id : cur === id ? null : cur))}
          actions={[
            { key: 'edit', label: 'edit', tone: 'neutral', onClick: () => onEdit(id) },
            { key: 'delete', label: 'delete', tone: 'danger', onClick: () => onDelete(id) },
          ]}
        >
          <button onClick={() => onRowClick(id)}>row {id}</button>
        </SwipeRow>
      ))}
      <button>outside</button>
    </div>
  )
}

/** 行内容外面那层可拖动的容器 */
function slider(id = 'a') {
  return screen.getByText(`row ${id}`).closest('[data-swipe-content]') as HTMLElement
}

// 假时钟：每个用例往后跳一大段，用例之间互不影响；默认手势期间时间不走（速度按 0 算）。
let clock = 0

function swipe(el: HTMLElement, dx: number, dy = 0, stepMs = 0) {
  fireEvent.pointerDown(el, { pointerId: 1, clientX: 300, clientY: 100, button: 0 })
  // 分两步走，和真实手势一样先过方向判定再继续
  clock += stepMs
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 300 + dx / 2, clientY: 100 + dy / 2 })
  clock += stepMs
  fireEvent.pointerMove(el, { pointerId: 1, clientX: 300 + dx, clientY: 100 + dy })
  fireEvent.pointerUp(el, { pointerId: 1, clientX: 300 + dx, clientY: 100 + dy })
}

function isOpen(id = 'a') {
  return slider(id).closest('[data-swipe-row]')!.getAttribute('data-open') === 'true'
}

beforeEach(() => {
  clock += 100_000
  vi.spyOn(swipeClock, 'now').mockImplementation(() => clock)
  onRowClick.mockClear()
  onEdit.mockClear()
  onDelete.mockClear()
})

describe('SwipeRow', () => {
  it('renders the row and keeps the actions out of reach while closed', () => {
    render(<Harness />)
    expect(screen.getByText('row a')).toBeInTheDocument()
    expect(isOpen()).toBe(false)
    // 收起时按钮不该被读屏 / 键盘碰到
    expect(screen.queryByRole('button', { name: 'edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'delete' })).toBeNull()
  })

  it('a plain tap still triggers the row itself', () => {
    render(<Harness />)
    fireEvent.click(screen.getByText('row a'))
    expect(onRowClick).toHaveBeenCalledWith('a')
  })

  it('swiping left reveals edit (left) and delete (right)', () => {
    render(<Harness />)
    swipe(slider(), -SWIPE_ACTION_WIDTH * 2)
    expect(isOpen()).toBe(true)
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons.indexOf('edit')).toBeGreaterThanOrEqual(0)
    expect(buttons.indexOf('edit')).toBeLessThan(buttons.indexOf('delete'))
  })

  it('a short swipe snaps back closed', () => {
    render(<Harness />)
    swipe(slider(), -30)
    expect(isOpen()).toBe(false)
  })

  it('a quick flick opens the row even though it travelled less than halfway', () => {
    render(<Harness />)
    // 20ms 里向左划了 40px（2px/ms），距离不到按钮宽度的一半
    swipe(slider(), -40, 0, 10)
    expect(isOpen()).toBe(true)
  })

  it('a vertical drag does not open the row', () => {
    render(<Harness />)
    swipe(slider(), -20, 160)
    expect(isOpen()).toBe(false)
  })

  it('the click that ends a swipe does not trigger the row', () => {
    render(<Harness />)
    const el = slider()
    swipe(el, -SWIPE_ACTION_WIDTH * 2)
    // 浏览器在 pointerup 之后会补发一次 click
    fireEvent.click(screen.getByText('row a'))
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('tapping edit runs the action and closes the row', () => {
    render(<Harness />)
    swipe(slider(), -SWIPE_ACTION_WIDTH * 2)
    fireEvent.click(screen.getByRole('button', { name: 'edit' }))
    expect(onEdit).toHaveBeenCalledWith('a')
    expect(onDelete).not.toHaveBeenCalled()
    expect(isOpen()).toBe(false)
  })

  it('tapping delete runs the action and closes the row', () => {
    render(<Harness />)
    swipe(slider(), -SWIPE_ACTION_WIDTH * 2)
    fireEvent.click(screen.getByRole('button', { name: 'delete' }))
    expect(onDelete).toHaveBeenCalledWith('a')
    expect(isOpen()).toBe(false)
  })

  it('tapping the open row closes it instead of triggering the row', () => {
    render(<Harness />)
    swipe(slider(), -SWIPE_ACTION_WIDTH * 2)
    onRowClick.mockClear()
    fireEvent.pointerDown(slider(), { pointerId: 2, clientX: 100, clientY: 100, button: 0 })
    fireEvent.pointerUp(slider(), { pointerId: 2, clientX: 100, clientY: 100 })
    fireEvent.click(screen.getByText('row a'))
    expect(isOpen()).toBe(false)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('swiping right closes an open row', () => {
    render(<Harness />)
    swipe(slider(), -SWIPE_ACTION_WIDTH * 2)
    expect(isOpen()).toBe(true)
    swipe(slider(), SWIPE_ACTION_WIDTH * 2)
    expect(isOpen()).toBe(false)
  })

  it('pressing anywhere else closes the open row', () => {
    render(<Harness />)
    swipe(slider(), -SWIPE_ACTION_WIDTH * 2)
    fireEvent.pointerDown(screen.getByText('outside'), { pointerId: 3, clientX: 10, clientY: 500 })
    expect(isOpen()).toBe(false)
  })

  it('pressing another row only closes the open one, without triggering that row', () => {
    render(<Harness ids={['a', 'b']} />)
    swipe(slider('a'), -SWIPE_ACTION_WIDTH * 2)
    expect(isOpen('a')).toBe(true)

    fireEvent.pointerDown(slider('b'), { pointerId: 4, clientX: 100, clientY: 200, button: 0 })
    fireEvent.pointerUp(slider('b'), { pointerId: 4, clientX: 100, clientY: 200 })
    fireEvent.click(screen.getByText('row b'))

    expect(isOpen('a')).toBe(false)
    expect(isOpen('b')).toBe(false)
    expect(onRowClick).not.toHaveBeenCalled()
  })

  it('only one row is open at a time', () => {
    render(<Harness ids={['a', 'b']} />)
    swipe(slider('a'), -SWIPE_ACTION_WIDTH * 2)
    swipe(slider('b'), -SWIPE_ACTION_WIDTH * 2)
    expect(isOpen('a')).toBe(false)
    expect(isOpen('b')).toBe(true)
  })
})
