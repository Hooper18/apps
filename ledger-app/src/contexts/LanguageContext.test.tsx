import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useEffect } from 'react'
import { LanguageProvider, useLanguage } from './LanguageContext'

function Probe({ onReady }: { onReady: (api: ReturnType<typeof useLanguage>) => void }) {
  const api = useLanguage()
  useEffect(() => {
    onReady(api)
  })
  return <span data-testid="lang">{api.lang}</span>
}

function renderWithProvider() {
  let captured: ReturnType<typeof useLanguage> | null = null
  render(
    <LanguageProvider>
      <Probe
        onReady={(api) => {
          captured = api
        }}
      />
    </LanguageProvider>,
  )
  return { api: () => captured! }
}

describe('LanguageProvider', () => {
  it("defaults to 'zh' when nothing persisted", () => {
    renderWithProvider()
    expect(screen.getByTestId('lang').textContent).toBe('zh')
  })

  it('reads persisted lang from localStorage on mount', () => {
    localStorage.setItem('ledger_lang', 'en')
    renderWithProvider()
    expect(screen.getByTestId('lang').textContent).toBe('en')
  })

  it('setLang updates state and persists', () => {
    const { api } = renderWithProvider()
    act(() => api().setLang('en'))
    expect(screen.getByTestId('lang').textContent).toBe('en')
    expect(localStorage.getItem('ledger_lang')).toBe('en')
  })

  it('t returns string for known key in current lang', () => {
    const { api } = renderWithProvider()
    expect(api().t('save')).toBe('保存')
    act(() => api().setLang('en'))
    expect(api().t('save')).toBe('Save')
  })

  it('t interpolates {var} placeholders', () => {
    const { api } = renderWithProvider()
    const result = api().t('yearMonthFmt', { year: 2026, month: 5 })
    expect(result).toBe('2026年5月')
  })
})
