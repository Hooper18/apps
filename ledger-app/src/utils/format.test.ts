import { describe, expect, it } from 'vitest'
import { formatExchangeRate } from './format'

describe('formatExchangeRate', () => {
  it("display mode rounds to 4 decimals", () => {
    expect(formatExchangeRate(1.23456789, 'display')).toBe('1.2346')
  })

  it("export mode rounds to 8 decimals", () => {
    expect(formatExchangeRate(1.23456789, 'export')).toBe('1.23456789')
  })

  it("full mode preserves precision as String(number)", () => {
    expect(formatExchangeRate(1.23456789, 'full')).toBe('1.23456789')
  })

  it("returns '-' for null in display mode (UI placeholder)", () => {
    expect(formatExchangeRate(null, 'display')).toBe('-')
  })

  it("returns '' for null in export mode (CSV empty cell)", () => {
    expect(formatExchangeRate(null, 'export')).toBe('')
  })

  it("returns '-' for null in full mode (UI placeholder)", () => {
    expect(formatExchangeRate(null, 'full')).toBe('-')
  })

  it("treats undefined the same as null", () => {
    expect(formatExchangeRate(undefined, 'display')).toBe('-')
    expect(formatExchangeRate(undefined, 'export')).toBe('')
  })

  it("display mode pads zeros to 4 decimals", () => {
    expect(formatExchangeRate(2, 'display')).toBe('2.0000')
  })

  it("handles very small rates without scientific notation in display", () => {
    // 0.0001234 是无歧义的（不是 round-half 情况），用它验证"不掉到科学记数法"
    expect(formatExchangeRate(0.0001234, 'display')).toBe('0.0001')
  })
})
