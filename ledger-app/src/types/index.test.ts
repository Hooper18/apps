import { describe, expect, it } from 'vitest'
import {
  normalizeCurrencyCode,
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
  CURRENCY_LABELS,
  CATEGORY_ICONS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TRANSFER_CATEGORIES,
} from './index'

describe('normalizeCurrencyCode', () => {
  it("maps legacy 'TWD' → 'NTD'", () => {
    expect(normalizeCurrencyCode('TWD')).toBe('NTD')
  })

  it('passes other currencies through unchanged', () => {
    expect(normalizeCurrencyCode('USD')).toBe('USD')
    expect(normalizeCurrencyCode('CNY')).toBe('CNY')
    expect(normalizeCurrencyCode('MOP')).toBe('MOP')
  })

  it('passes null/undefined through (caller deals with it)', () => {
    expect(normalizeCurrencyCode(null)).toBeNull()
    expect(normalizeCurrencyCode(undefined)).toBeUndefined()
  })
})

describe('currency lookup tables', () => {
  it('SUPPORTED_CURRENCIES has 13 entries (CNY/MYR/SGD/USD/HKD/JPY/EUR/GBP/THB/KHR/NTD/AUD/MOP)', () => {
    expect(SUPPORTED_CURRENCIES).toHaveLength(13)
    expect(new Set(SUPPORTED_CURRENCIES).size).toBe(13)
  })

  it('every supported currency has a symbol and label', () => {
    for (const c of SUPPORTED_CURRENCIES) {
      expect(CURRENCY_SYMBOLS[c], `symbol for ${c}`).toBeTruthy()
      expect(CURRENCY_LABELS[c], `label for ${c}`).toBeTruthy()
    }
  })

  it("does not include 'TWD' as a supported currency (legacy only)", () => {
    expect(SUPPORTED_CURRENCIES).not.toContain('TWD' as never)
  })
})

describe('category constants', () => {
  it('每个 expense 类目都在 CATEGORY_ICONS 有图标', () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(CATEGORY_ICONS[c], `icon for ${c}`).toBeTruthy()
    }
  })

  it('每个 income 类目都在 CATEGORY_ICONS 有图标', () => {
    for (const c of INCOME_CATEGORIES) {
      expect(CATEGORY_ICONS[c], `icon for ${c}`).toBeTruthy()
    }
  })

  it('每个 transfer 类目都在 CATEGORY_ICONS 有图标', () => {
    for (const c of TRANSFER_CATEGORIES) {
      expect(CATEGORY_ICONS[c], `icon for ${c}`).toBeTruthy()
    }
  })

  it('过期类目 "宠物" 已不在默认 EXPENSE_CATEGORIES 列表（已迁移到 "水果"）', () => {
    expect(EXPENSE_CATEGORIES).not.toContain('宠物')
    expect(EXPENSE_CATEGORIES).toContain('水果')
  })
})
