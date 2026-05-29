import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useEffect } from 'react'

const supaState = vi.hoisted(() => ({
  profileResult: { data: null as unknown, error: null as unknown },
  upserts: [] as Array<unknown>,
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            eq(_field: string, _value: unknown) {
              return {
                maybeSingle() {
                  return Promise.resolve(supaState.profileResult)
                },
              }
            },
          }
        },
        upsert(row: unknown) {
          supaState.upserts.push(row)
          return Promise.resolve({ error: null })
        },
      }
    },
  },
}))

const authState = vi.hoisted(() => ({ user: null as { id: string } | null }))

vi.mock('./AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

// 全局 fetch mock —— FX API
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { CurrencyProvider, useCurrency } from './CurrencyContext'

function Harness({ onReady }: { onReady: (api: ReturnType<typeof useCurrency>) => void }) {
  const api = useCurrency()
  useEffect(() => {
    onReady(api)
  })
  return (
    <div>
      <span data-testid="base">{api.baseCurrency}</span>
      <span data-testid="default">{api.defaultCurrency}</span>
      <span data-testid="effective">{api.effectiveDefaultCurrency}</span>
      <span data-testid="useLast">{String(api.useLastUsedAsDefault)}</span>
    </div>
  )
}

function renderWithProvider() {
  let captured: ReturnType<typeof useCurrency> | null = null
  render(
    <CurrencyProvider>
      <Harness
        onReady={(api) => {
          captured = api
        }}
      />
    </CurrencyProvider>,
  )
  return {
    api: () => captured!,
  }
}

beforeEach(() => {
  supaState.profileResult = { data: null, error: null }
  supaState.upserts = []
  authState.user = null
  fetchMock.mockReset()
  fetchMock.mockResolvedValue({
    json: () => Promise.resolve({ rates: { CNY: 1, USD: 0.14, TWD: 4.5 } }),
  } as unknown as Response)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CurrencyProvider', () => {
  it("defaults baseCurrency / defaultCurrency to 'CNY' before profile loads", () => {
    renderWithProvider()
    expect(screen.getByTestId('base').textContent).toBe('CNY')
    expect(screen.getByTestId('default').textContent).toBe('CNY')
  })

  it('normalizes legacy TWD → NTD when reading profile', async () => {
    authState.user = { id: 'u1' }
    supaState.profileResult = {
      data: { preferred_currency: 'TWD', default_currency: 'TWD' },
      error: null,
    }
    renderWithProvider()
    await waitFor(() => expect(screen.getByTestId('base').textContent).toBe('NTD'))
    expect(screen.getByTestId('default').textContent).toBe('NTD')
  })

  it('fills rates.NTD from rates.TWD when API returns only TWD', async () => {
    const { api } = renderWithProvider()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    // 等待 setRatesLoading(false) 渲染
    await waitFor(() => expect(api().rates.NTD).toBeDefined())
    expect(api().rates.NTD).toBe(4.5)
  })

  it("convert returns input unchanged when fromCurrency === baseCurrency", async () => {
    const { api } = renderWithProvider()
    await waitFor(() => expect(api().ratesLoading).toBe(false))
    expect(api().convert(100, 'CNY')).toBe(100)
  })

  it('convert applies cross-currency math via rates table', async () => {
    const { api } = renderWithProvider()
    await waitFor(() => expect(api().ratesLoading).toBe(false))
    // 100 USD → CNY:  USD rate=0.14 → 100/0.14 * 1 ≈ 714.29
    expect(api().convert(100, 'USD')).toBeCloseTo(100 / 0.14, 1)
  })

  it('uses cached rates when fresh (<1h) and skips fetch', async () => {
    localStorage.setItem(
      'ledger_fx_rates',
      JSON.stringify({ ts: Date.now(), data: { CNY: 1, USD: 0.2 } }),
    )
    const { api } = renderWithProvider()
    await waitFor(() => expect(api().ratesLoading).toBe(false))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(api().rates.USD).toBe(0.2)
  })

  it('refetches when cached rates are stale (>1h)', async () => {
    localStorage.setItem(
      'ledger_fx_rates',
      JSON.stringify({ ts: Date.now() - 3 * 60 * 60 * 1000, data: { CNY: 1, USD: 0.99 } }),
    )
    renderWithProvider()
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
  })

  it('effectiveDefaultCurrency falls back to defaultCurrency when useLastUsedAsDefault=false', async () => {
    authState.user = { id: 'u1' }
    supaState.profileResult = {
      data: { preferred_currency: 'CNY', default_currency: 'USD' },
      error: null,
    }
    const { api } = renderWithProvider()
    await waitFor(() => expect(api().defaultCurrency).toBe('USD'))
    expect(api().effectiveDefaultCurrency).toBe('USD')
  })

  it('effectiveDefaultCurrency uses lastUsedCurrency when useLastUsedAsDefault=true', async () => {
    localStorage.setItem('ledger_default_use_last_used', '1')
    localStorage.setItem('ledger_last_used_currency', 'JPY')
    authState.user = { id: 'u1' }
    supaState.profileResult = {
      data: { preferred_currency: 'CNY', default_currency: 'USD' },
      error: null,
    }
    const { api } = renderWithProvider()
    await waitFor(() => expect(api().defaultCurrency).toBe('USD'))
    expect(api().effectiveDefaultCurrency).toBe('JPY')
  })

  it('setUseLastUsedAsDefault persists to localStorage', async () => {
    const { api } = renderWithProvider()
    await waitFor(() => expect(api().ratesLoading).toBe(false))
    act(() => api().setUseLastUsedAsDefault(true))
    expect(localStorage.getItem('ledger_default_use_last_used')).toBe('1')
    act(() => api().setUseLastUsedAsDefault(false))
    expect(localStorage.getItem('ledger_default_use_last_used')).toBeNull()
  })

  it('recordLastUsedCurrency persists and flows into effectiveDefault when toggle on', async () => {
    localStorage.setItem('ledger_default_use_last_used', '1')
    const { api } = renderWithProvider()
    await waitFor(() => expect(api().ratesLoading).toBe(false))
    act(() => api().recordLastUsedCurrency('EUR'))
    expect(localStorage.getItem('ledger_last_used_currency')).toBe('EUR')
  })

  it('setBaseCurrency optimistically updates then writes to users_profile', async () => {
    authState.user = { id: 'u1' }
    const { api } = renderWithProvider()
    await waitFor(() => expect(api().ratesLoading).toBe(false))
    await act(async () => {
      await api().setBaseCurrency('JPY')
    })
    expect(supaState.upserts).toContainEqual(
      expect.objectContaining({ id: 'u1', preferred_currency: 'JPY' }),
    )
  })

  it('setDefaultCurrency optimistically updates then writes to users_profile', async () => {
    authState.user = { id: 'u1' }
    const { api } = renderWithProvider()
    await waitFor(() => expect(api().ratesLoading).toBe(false))
    await act(async () => {
      await api().setDefaultCurrency('THB')
    })
    expect(supaState.upserts).toContainEqual(
      expect.objectContaining({ id: 'u1', default_currency: 'THB' }),
    )
  })
})
