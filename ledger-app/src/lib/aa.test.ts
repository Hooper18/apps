import { describe, expect, it } from 'vitest'
import { amountText, splitShare, withAaNote } from './aa'

describe('splitShare', () => {
  it('均摊到分，四舍五入', () => {
    expect(splitShare(400, 4)).toBe(100)
    expect(splitShare(100, 3)).toBe(33.33)
    expect(splitShare(200, 3)).toBe(66.67)
    expect(splitShare(0.01, 2)).toBe(0.01)
    expect(splitShare(46.35, 2)).toBe(23.18)
  })

  it('人数不合法时原样返回', () => {
    expect(splitShare(400, 1)).toBe(400)
    expect(splitShare(400, 0)).toBe(400)
    expect(splitShare(400, 2.5)).toBe(400)
  })
})

describe('amountText', () => {
  it('转成记账页金额框用的字符串：最多两位小数，不带多余的 0', () => {
    expect(amountText(100)).toBe('100')
    expect(amountText(33.33)).toBe('33.33')
    expect(amountText(23.5)).toBe('23.5')
    expect(amountText(0.1 + 0.2)).toBe('0.3')
  })
})

describe('withAaNote', () => {
  it('在备注后面记下人数和总额', () => {
    expect(withAaNote('DEMO CAFE · RM18.90', 400, 4, '¥')).toBe('DEMO CAFE · RM18.90 · AA 4人 总额 ¥400.00')
    expect(withAaNote('', 400, 4, '¥')).toBe('AA 4人 总额 ¥400.00')
    expect(withAaNote('  ', 99.5, 2, 'RM')).toBe('AA 2人 总额 RM99.50')
  })

  it('重复 AA 时替换掉上一次的记录，不叠加', () => {
    const once = withAaNote('晚饭', 400, 4, '¥')
    expect(withAaNote(once, 400, 5, '¥')).toBe('晚饭 · AA 5人 总额 ¥400.00')
    expect(withAaNote('AA 4人 总额 ¥400.00', 300, 3, '¥')).toBe('AA 3人 总额 ¥300.00')
  })
})
