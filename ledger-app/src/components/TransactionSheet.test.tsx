import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.hoisted(() => vi.fn())
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => navigateMock }
})

const currencyState = vi.hoisted(() => ({
  rates: { CNY: 1, USD: 0.14 } as Record<string, number>,
}))
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => currencyState,
}))

vi.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (k: string) => k }),
}))

const removeMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })))
vi.mock('../hooks/useTransactions', () => ({
  useTransactions: () => ({ remove: removeMock }),
}))

import TransactionSheet from './TransactionSheet'
import type { TxDetail } from '../types'

const baseTx: TxDetail = {
  id: 'tx-1',
  type: 'expense',
  amount: 100,
  currency: 'USD',
  description: 'coffee',
  date: '2026-05-29',
  category_id: 'cat-food',
  exchange_rate: 0.14,
  categories: { name: '三餐', icon: '🍚' },
}

function renderSheet(tx: Partial<TxDetail> = {}, displayCurrency = 'CNY' as const) {
  const merged = { ...baseTx, ...tx }
  return render(
    <MemoryRouter>
      <TransactionSheet
        tx={merged}
        displayCurrency={displayCurrency}
        onClose={() => {}}
        onDeleted={() => {}}
      />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  navigateMock.mockClear()
  removeMock.mockClear()
})

describe('TransactionSheet', () => {
  it('displays category, description, and date rows', () => {
    renderSheet()
    expect(screen.getByText('三餐')).toBeInTheDocument()
    expect(screen.getByText('coffee')).toBeInTheDocument()
    expect(screen.getByText('2026-05-29')).toBeInTheDocument()
  })

  it("expense shows '-' prefix and red amount", () => {
    renderSheet({ type: 'expense', currency: 'CNY', amount: 50 }, 'CNY')
    expect(screen.getByText(/-¥ 50/)).toBeInTheDocument()
  })

  it("income shows '+' prefix", () => {
    renderSheet({ type: 'income', currency: 'CNY', amount: 100 }, 'CNY')
    expect(screen.getByText(/\+¥ 100/)).toBeInTheDocument()
  })

  it("transfer with direction='in' (default for legacy null) shows '+' prefix", () => {
    renderSheet({ type: 'transfer', currency: 'CNY', amount: 100, direction: null }, 'CNY')
    expect(screen.getByText(/\+¥ 100/)).toBeInTheDocument()
  })

  it("transfer with direction='out' shows '−' prefix", () => {
    renderSheet({ type: 'transfer', currency: 'CNY', amount: 100, direction: 'out' }, 'CNY')
    expect(screen.getByText(/-¥ 100/)).toBeInTheDocument()
  })

  it("transfer with direction='in' shows '+' prefix", () => {
    renderSheet({ type: 'transfer', currency: 'CNY', amount: 100, direction: 'in' }, 'CNY')
    expect(screen.getByText(/\+¥ 100/)).toBeInTheDocument()
  })

  it('converts to display currency when different from source', () => {
    renderSheet({ currency: 'USD', amount: 100 }, 'CNY')
    // 100 USD → CNY: (100 / 0.14) * 1 ≈ 714.29
    expect(screen.getByText(/¥ 714\.29/)).toBeInTheDocument()
    // 原值仍然显示
    expect(screen.getByText(/originalLabel/)).toBeInTheDocument()
  })

  it('navigates to /add with state.tx on edit click', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /edit/ }))
    expect(navigateMock).toHaveBeenCalledWith('/add', expect.objectContaining({ state: { tx: expect.any(Object) } }))
  })

  it('delete shows confirm dialog before removing', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/ }))
    // 标题 + 操作按钮都用 confirmDelete key，两处都应存在
    expect(screen.getAllByText('confirmDelete').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('confirmDeleteMsg')).toBeInTheDocument()
    expect(removeMock).not.toHaveBeenCalled()
  })

  it('confirm delete calls removeTx and onDeleted then onClose', async () => {
    const onClose = vi.fn()
    const onDeleted = vi.fn()
    render(
      <MemoryRouter>
        <TransactionSheet
          tx={baseTx}
          displayCurrency="CNY"
          onClose={onClose}
          onDeleted={onDeleted}
        />
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByRole('button', { name: /^delete$/ }))
    const confirmBtns = screen.getAllByRole('button', { name: /confirmDelete/ })
    fireEvent.click(confirmBtns[confirmBtns.length - 1]) // last is the action button
    await waitFor(() => expect(removeMock).toHaveBeenCalledWith('tx-1'))
    expect(onDeleted).toHaveBeenCalledWith('tx-1')
    expect(onClose).toHaveBeenCalled()
  })

  it('cancel button in confirm dialog dismisses without delete', () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: /^delete$/ }))
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/ }))
    expect(removeMock).not.toHaveBeenCalled()
  })

  it("uncategorized fallback shows 'uncategorized' label", () => {
    renderSheet({ categories: null })
    expect(screen.getByText('uncategorized')).toBeInTheDocument()
  })

  it("empty description shows '—' placeholder", () => {
    renderSheet({ description: null })
    expect(screen.getByText('—')).toBeInTheDocument()
  })
})
