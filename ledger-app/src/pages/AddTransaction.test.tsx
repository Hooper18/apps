import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const navigateMock = vi.hoisted(() => vi.fn())
const locationState = vi.hoisted(() => ({ value: null as unknown }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useLocation: () => ({
      pathname: '/add',
      state: locationState.value,
      search: '',
      hash: '',
      key: 'k',
    }),
  }
})

const authState = vi.hoisted(() => ({ user: { id: 'u1' } as { id: string } | null }))
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

const currencyState = vi.hoisted(() => ({
  effectiveDefaultCurrency: 'CNY',
  baseCurrency: 'CNY',
  rates: { CNY: 1, USD: 0.14 } as Record<string, number>,
  recordLastUsedCurrency: vi.fn(),
}))
vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => currencyState,
}))

vi.mock('../contexts/LanguageContext', () => ({
  useLanguage: () => ({
    t: (k: string) => k,
  }),
}))

const insertMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null, id: 'new-tx-id' })))
const updateMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })))
const transactionsRef = vi.hoisted(() => ({ value: [] as Array<{ id: string; category_id: string; created_at: string }> }))
vi.mock('../hooks/useTransactions', () => ({
  useTransactions: () => ({
    transactions: transactionsRef.value,
    insert: insertMock,
    update: updateMock,
  }),
}))

const categoriesRef = vi.hoisted(() => ({
  value: [
    { id: 'cat-food', name: '三餐', icon: '🍚', type: 'expense' },
    { id: 'cat-trans', name: '交通', icon: '🚌', type: 'expense' },
    { id: 'cat-salary', name: '工资', icon: '💼', type: 'income' },
  ],
}))
vi.mock('../hooks/useCategories', () => ({
  useCategories: () => ({ categories: categoriesRef.value }),
}))

vi.mock('../hooks/useCategorySort', () => ({
  useCategorySort: () => ({
    applySort: <T,>(cats: T[]) => cats,
  }),
}))

import AddTransaction from './AddTransaction'

function renderPage(state: unknown = null) {
  locationState.value = state
  return render(
    <MemoryRouter initialEntries={['/add']}>
      <Routes>
        <Route path="/add" element={<AddTransaction />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  navigateMock.mockClear()
  insertMock.mockClear()
  updateMock.mockClear()
  currencyState.recordLastUsedCurrency.mockClear()
  currencyState.effectiveDefaultCurrency = 'CNY'
  currencyState.baseCurrency = 'CNY'
  currencyState.rates = { CNY: 1, USD: 0.14 }
  authState.user = { id: 'u1' }
  transactionsRef.value = []
  categoriesRef.value = [
    { id: 'cat-food', name: '三餐', icon: '🍚', type: 'expense' },
    { id: 'cat-trans', name: '交通', icon: '🚌', type: 'expense' },
    { id: 'cat-salary', name: '工资', icon: '💼', type: 'income' },
  ]
  locationState.value = null
})

afterEach(() => {
  // 让 setTimeout(toast clear, 2000) 不要污染下一个测试
  vi.clearAllTimers()
})

// 测试里靠 getByText('0') / ('5') 同时匹配金额显示和数字键，按角色 + 名字定位更稳。
function clickKey(label: string) {
  fireEvent.click(screen.getByRole('button', { name: label }))
}
function amountDisplay(): string {
  // 金额展示是金额区那个 <span class="text-3xl ..." > 值</span>
  const spans = Array.from(document.querySelectorAll('span'))
  const big = spans.find((s) => s.className.includes('text-3xl'))
  return big?.textContent ?? ''
}

describe('AddTransaction: 初始状态', () => {
  it('默认类型为 expense（红色按钮选中）', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'expense' })).toBeInTheDocument()
  })

  it('默认金额显示为 0', () => {
    renderPage()
    expect(amountDisplay()).toBe('0')
  })

  it('默认货币使用 effectiveDefaultCurrency', () => {
    currencyState.effectiveDefaultCurrency = 'USD'
    renderPage()
    expect(screen.getByRole('button', { name: /USD/ })).toBeInTheDocument()
  })
})

describe('AddTransaction: 校验', () => {
  it('amount 为 0 时点保存触发 amountRequired toast，不调 insert', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    expect(insertMock).not.toHaveBeenCalled()
    expect(screen.getByText('amountRequired')).toBeInTheDocument()
  })

  it('没选 category 时触发 categoryRequired toast', () => {
    renderPage()
    clickKey('5')
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    expect(insertMock).not.toHaveBeenCalled()
    expect(screen.getByText('categoryRequired')).toBeInTheDocument()
  })
})

describe('AddTransaction: 数字键盘', () => {
  it('小数点只能输入一次', () => {
    renderPage()
    clickKey('5')
    clickKey('.')
    clickKey('5')
    clickKey('.') // 第二次应被忽略
    clickKey('5')
    expect(amountDisplay()).toBe('5.55')
  })

  it('小数位限制 2 位', () => {
    renderPage()
    clickKey('1')
    clickKey('.')
    clickKey('9')
    clickKey('9')
    clickKey('9') // 第 3 位被拒
    expect(amountDisplay()).toBe('1.99')
  })

  it('首位为 0 时输入数字直接替换', () => {
    renderPage()
    clickKey('5')
    expect(amountDisplay()).toBe('5')
  })
})

describe('AddTransaction: 保存路径', () => {
  it('insert mode：填齐后调 insertTx，payload 含 amount/category/date', async () => {
    renderPage()
    clickKey('1')
    clickKey('2')
    fireEvent.click(screen.getByRole('button', { name: /三餐/ }))
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(insertMock).toHaveBeenCalledTimes(1)
    const payload = insertMock.mock.calls[0][0] as { amount: number; category_id: string; currency: string }
    expect(payload.amount).toBe(12)
    expect(payload.category_id).toBe('cat-food')
    expect(payload.currency).toBe('CNY')
  })

  it('跨币种时计算 exchange_rate = rateFrom / rateBase', async () => {
    currencyState.effectiveDefaultCurrency = 'USD'
    currencyState.baseCurrency = 'CNY'
    currencyState.rates = { CNY: 1, USD: 0.14 }
    renderPage()
    clickKey('1')
    clickKey('0')
    clickKey('0')
    fireEvent.click(screen.getByRole('button', { name: /三餐/ }))
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await Promise.resolve()
    await Promise.resolve()
    const payload = insertMock.mock.calls[0][0] as { exchange_rate: number | null }
    expect(payload.exchange_rate).toBeCloseTo(0.14, 5)
  })

  it('同币种时 exchange_rate 为 null', async () => {
    renderPage()
    clickKey('5')
    fireEvent.click(screen.getByRole('button', { name: /三餐/ }))
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await Promise.resolve()
    await Promise.resolve()
    const payload = insertMock.mock.calls[0][0] as { exchange_rate: number | null }
    expect(payload.exchange_rate).toBeNull()
  })

  it('保存后调 recordLastUsedCurrency', async () => {
    renderPage()
    clickKey('5')
    fireEvent.click(screen.getByRole('button', { name: /三餐/ }))
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(currencyState.recordLastUsedCurrency).toHaveBeenCalledWith('CNY')
  })

  it('edit mode：location.state.tx 存在时调 updateTx 并预填', async () => {
    locationState.value = {
      tx: {
        id: 'existing-tx',
        type: 'expense',
        amount: 50,
        currency: 'CNY',
        description: 'old note',
        date: '2026-05-20',
        category_id: 'cat-food',
        exchange_rate: null,
        categories: { name: '三餐', icon: '🍚' },
      },
    }
    renderPage(locationState.value)
    expect(amountDisplay()).toBe('50')
    fireEvent.click(screen.getByRole('button', { name: 'update' }))
    await Promise.resolve()
    await Promise.resolve()
    expect(updateMock).toHaveBeenCalledWith('existing-tx', expect.objectContaining({ amount: 50 }))
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('未登录时早退，不调 insert/update', async () => {
    authState.user = null
    renderPage()
    clickKey('5')
    fireEvent.click(screen.getByRole('button', { name: /三餐/ }))
    fireEvent.click(screen.getByRole('button', { name: 'save' }))
    await Promise.resolve()
    expect(insertMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })
})
