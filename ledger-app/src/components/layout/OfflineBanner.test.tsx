import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OfflineBanner from './OfflineBanner'

function setOnline(val: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => val })
}

beforeEach(() => {
  setOnline(true)
})

afterEach(() => {
  setOnline(true)
})

describe('OfflineBanner: visibility gating', () => {
  it('renders nothing when online + nothing pending', () => {
    setOnline(true)
    const { container } = render(<OfflineBanner pendingCount={0} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders when offline (regardless of pending)', () => {
    setOnline(false)
    render(<OfflineBanner pendingCount={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('离线')
  })

  it('renders when online but has pending items', () => {
    setOnline(true)
    render(<OfflineBanner pendingCount={2} />)
    expect(screen.getByRole('status')).toHaveTextContent('2 条待同步')
  })
})

describe('OfflineBanner: 立即同步 button', () => {
  it('appears only when online + pending > 0 + onSync provided', () => {
    setOnline(true)
    const onSync = vi.fn()
    render(<OfflineBanner pendingCount={3} onSync={onSync} />)
    const btn = screen.getByRole('button', { name: /立即同步/ })
    expect(btn).toBeInTheDocument()
  })

  it('is hidden when offline', () => {
    setOnline(false)
    const onSync = vi.fn()
    render(<OfflineBanner pendingCount={3} onSync={onSync} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('triggers onSync on click', () => {
    setOnline(true)
    const onSync = vi.fn()
    render(<OfflineBanner pendingCount={3} onSync={onSync} />)
    fireEvent.click(screen.getByRole('button', { name: /立即同步/ }))
    expect(onSync).toHaveBeenCalled()
  })

  it('shows 同步中 + disabled when syncing=true', () => {
    setOnline(true)
    render(<OfflineBanner pendingCount={3} onSync={() => {}} syncing />)
    const btn = screen.getByRole('button', { name: /同步中/ })
    expect(btn).toBeDisabled()
  })
})

describe('OfflineBanner: 相对时间格式（formatRelative）', () => {
  beforeEach(() => {
    setOnline(false)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-29T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("'刚刚' for <30s", () => {
    render(<OfflineBanner lastSyncedAt="2026-05-29T11:59:50Z" pendingCount={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('刚刚')
  })

  it("'X 秒前' for 30s..60s", () => {
    render(<OfflineBanner lastSyncedAt="2026-05-29T11:59:15Z" pendingCount={0} />)
    expect(screen.getByRole('status')).toHaveTextContent(/4[0-9] 秒前/)
  })

  it("'X 分钟前' for <1h", () => {
    render(<OfflineBanner lastSyncedAt="2026-05-29T11:30:00Z" pendingCount={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('30 分钟前')
  })

  it("'X 小时前' for <24h", () => {
    render(<OfflineBanner lastSyncedAt="2026-05-29T05:00:00Z" pendingCount={0} />)
    expect(screen.getByRole('status')).toHaveTextContent('7 小时前')
  })

  it('absolute date format same-year for >24h', () => {
    render(<OfflineBanner lastSyncedAt="2026-05-27T08:00:00Z" pendingCount={0} />)
    // 注意：toString 会用本机时区，断言不含具体时分以免本地时区影响
    expect(screen.getByRole('status').textContent).toMatch(/05-2[67]/)
  })

  it('absolute date format with year for >cross-year', () => {
    render(<OfflineBanner lastSyncedAt="2025-05-27T08:00:00Z" pendingCount={0} />)
    expect(screen.getByRole('status').textContent).toMatch(/2025-05-2[67]/)
  })

  it('invalid date string yields no relative text crash', () => {
    render(<OfflineBanner lastSyncedAt="not-a-date" pendingCount={0} />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
