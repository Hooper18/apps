import { describe, expect, it } from 'vitest'
import {
  API_COST_MULTIPLIER,
  LOW_BALANCE_THRESHOLD_USD,
  MIN_COST_USD,
  formatUSD,
  estimateCourseParseCostUsd,
} from './balance'

describe('balance constants', () => {
  it('API_COST_MULTIPLIER = 2（卖价是供应商成本的两倍）', () => {
    expect(API_COST_MULTIPLIER).toBe(2)
  })

  it("LOW_BALANCE_THRESHOLD_USD = 0.1", () => {
    expect(LOW_BALANCE_THRESHOLD_USD).toBe(0.1)
  })

  it("MIN_COST_USD = 0.01（兜底最小扣费）", () => {
    expect(MIN_COST_USD).toBe(0.01)
  })
})

describe('formatUSD', () => {
  it('returns $X.XX (2 decimals)', () => {
    expect(formatUSD(1)).toBe('$1.00')
    expect(formatUSD(0.5)).toBe('$0.50')
    expect(formatUSD(99.999)).toBe('$100.00')
  })

  it('handles 0', () => {
    expect(formatUSD(0)).toBe('$0.00')
  })
})

describe('estimateCourseParseCostUsd', () => {
  it('output cost (0.02) is the natural floor for zero-input call', () => {
    // 公式：max(MIN_COST_USD, inputCost + outputCost)。outputCost 固定 0.02 已经
    // 高于 MIN_COST_USD=0.01，所以 (0,0) 输入下结果就是 0.02 而不会再被 floor。
    expect(estimateCourseParseCostUsd(0, 0)).toBe(0.02)
  })

  it('cost rises with text bytes (Haiku $1/M input tokens, tokens≈bytes/4)', () => {
    // 4M bytes → 1M tokens → $1 input + $0.02 output = $1.02
    expect(estimateCourseParseCostUsd(4_000_000, 0)).toBeCloseTo(1.02, 4)
  })

  it('image bytes count for vision (≈ bytes/600 tokens)', () => {
    // 600M image bytes → 1M vision tokens → $1 input + $0.02 = $1.02
    expect(estimateCourseParseCostUsd(0, 600_000_000)).toBeCloseTo(1.02, 4)
  })

  it('combines text + image linearly', () => {
    const text = estimateCourseParseCostUsd(4_000_000, 0)
    const img = estimateCourseParseCostUsd(0, 600_000_000)
    const both = estimateCourseParseCostUsd(4_000_000, 600_000_000)
    // both ≈ inputCost(text)+inputCost(img)+output（双方加和后 output 仍是 0.02）
    expect(both).toBeCloseTo(text + img - 0.02, 4)
  })

  it('imageBytes default to 0 when omitted', () => {
    const a = estimateCourseParseCostUsd(1_000_000)
    const b = estimateCourseParseCostUsd(1_000_000, 0)
    expect(a).toBe(b)
  })

  it('matches server-side formula contract — must stay in sync with claude-proxy', () => {
    // 这条用例的存在意义是把"公式必须跟 claude-proxy 的 estimateRawCostUsd
    // 字节对齐"这个隐性约束变成显式的 lock-in。
    // 公式：(textBytes/4 + imageBytes/600) / 1_000_000 * 1 + 0.02
    const text = 100_000
    const img = 30_000
    const expected = Math.max(MIN_COST_USD, (text / 4 + img / 600) / 1_000_000 + 0.02)
    expect(estimateCourseParseCostUsd(text, img)).toBeCloseTo(expected, 10)
  })
})
