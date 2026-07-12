import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// chart.js 的 canvas 渲染在 jsdom 里跑不了，stub 成占位 div；
// 图表点击交互不在本文件覆盖范围（行点击已覆盖同一 setState 路径）。
vi.mock('react-chartjs-2', () => ({
  Bar: () => <div data-testid="bar-chart" />,
  Pie: () => <div data-testid="pie-chart" />,
}))

// Charts 只 import 了 Settings 的 getStatsDisplay；mock 掉避免拖入整个 Settings 依赖树
vi.mock('./Settings', () => ({
  getStatsDisplay: () => ({ overview: true, daily: true, category: true, extra: true, transfer: true }),
}))

vi.mock('../contexts/CurrencyContext', () => ({
  useCurrency: () => ({ baseCurrency: 'CNY', rates: { CNY: 1 } as Record<string, number> }),
}))

// 用真实 zh 文案断言用户可见文本（含 {n} 插值），而不是断言 key
vi.mock('../contexts/LanguageContext', async () => {
  const { translations } = await vi.importActual<typeof import('../lib/i18n')>('../lib/i18n')
  return {
    useLanguage: () => ({
      lang: 'zh',
      t: (key: string, vars?: Record<string, string | number>) => {
        let s = (translations.zh as Record<string, string>)[key] ?? key
        if (vars) {
          for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v))
        }
        return s
      },
    }),
  }
})

type Tx = {
  id: string
  type: string
  amount: number
  currency: string
  description: string | null
  date: string
  category_id: string
  exchange_rate: number | null
  direction: string | null
  created_at: string
}

const transactionsRef = vi.hoisted(() => ({ value: [] as unknown[] }))
vi.mock('../hooks/useTransactions', () => ({
  useTransactions: () => ({ transactions: transactionsRef.value, loading: false }),
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

import Charts from './Charts'

// Charts 模块级 NOW = new Date()，测试数据必须落在真实的当前月
const now = new Date()
const Y = now.getFullYear()
const M = now.getMonth() + 1
const dstr = (day: number) => `${Y}-${String(M).padStart(2, '0')}-${String(day).padStart(2, '0')}`

function tx(partial: Partial<Tx> & Pick<Tx, 'id' | 'amount' | 'date' | 'category_id'>): Tx {
  return {
    type: 'expense',
    currency: 'CNY',
    description: null,
    exchange_rate: 1,
    direction: null,
    created_at: `${partial.date}T12:00:00Z`,
    ...partial,
  }
}

function seedTransactions() {
  transactionsRef.value = [
    tx({ id: 't1', amount: 12, date: dstr(5), category_id: 'cat-food', description: '早饭' }),
    tx({ id: 't2', amount: 30, date: dstr(5), category_id: 'cat-food', description: '晚饭' }),
    tx({ id: 't3', amount: 20, date: dstr(6), category_id: 'cat-food', description: null }),
    tx({ id: 't4', amount: 8, date: dstr(5), category_id: 'cat-trans', description: '公交' }),
    tx({ id: 't5', amount: 5000, date: dstr(1), category_id: 'cat-salary', type: 'income', description: '工资' }),
  ]
}

/** 进入分类占比 tab 并钻取到"三餐" */
function drillIntoFood() {
  render(<Charts />)
  fireEvent.click(screen.getByText('分类占比'))
  const legendRow = screen.getByText('🍚 三餐').closest('div')!
  fireEvent.click(within(legendRow).getByRole('button', { name: '每日明细' }))
}

beforeEach(() => {
  localStorage.clear()
  seedTransactions()
})

describe('Charts 分类钻取：每日汇总行', () => {
  it('钻取后显示每日汇总行 + 当月总额与总笔数', () => {
    drillIntoFood()

    // 头部卡片：类目名 + "每日明细 · 3笔" + 当月总额 62
    expect(screen.getByText('三餐')).toBeTruthy()
    expect(screen.getByText('每日明细 · 3笔')).toBeTruthy()
    expect(screen.getByText('¥ 62.00')).toBeTruthy()

    // 每日汇总行：5日 42、6日 20，未展开时不显示逐笔
    expect(screen.getByText('5日')).toBeTruthy()
    expect(screen.getByText('6日')).toBeTruthy()
    expect(screen.getByText('¥ 42.00')).toBeTruthy()
    expect(screen.getByText('¥ 20.00')).toBeTruthy()
    expect(screen.queryByText('早饭')).toBeNull()
  })

  it('点某一天展开当天该类目的逐笔明细 + 当日合计', () => {
    drillIntoFood()
    fireEvent.click(screen.getByText('5日'))

    // 逐笔明细（金额降序：晚饭 30 在前）
    expect(screen.getByText('晚饭')).toBeTruthy()
    expect(screen.getByText('早饭')).toBeTruthy()
    expect(screen.getByText('-¥ 30.00')).toBeTruthy()
    expect(screen.getByText('-¥ 12.00')).toBeTruthy()
    // 不混入别的类目（同天交通 8 元不出现）
    expect(screen.queryByText('公交')).toBeNull()
    // 当日合计行：笔数 + 总额（总额与汇总行各出现一次）
    expect(screen.getByText('当日合计 · 2笔')).toBeTruthy()
    expect(screen.getAllByText('¥ 42.00')).toHaveLength(2)
  })

  it('再点同一天收起明细', () => {
    drillIntoFood()
    fireEvent.click(screen.getByText('5日'))
    expect(screen.getByText('当日合计 · 2笔')).toBeTruthy()

    fireEvent.click(screen.getByText('5日'))
    expect(screen.queryByText('当日合计 · 2笔')).toBeNull()
    expect(screen.queryByText('早饭')).toBeNull()
  })

  it('同时只展开一天；空备注回退显示类目名', () => {
    drillIntoFood()
    fireEvent.click(screen.getByText('5日'))
    fireEvent.click(screen.getByText('6日'))

    // 5 日的面板收起，6 日的面板打开
    expect(screen.queryByText('当日合计 · 2笔')).toBeNull()
    expect(screen.getByText('当日合计 · 1笔')).toBeTruthy()
    expect(screen.getByText('-¥ 20.00')).toBeTruthy()
    // t3 没有备注 → 显示类目名"三餐"（头部卡片 1 处 + 面板 1 处）
    expect(screen.getAllByText('三餐')).toHaveLength(2)
  })

  it('外币交易显示原币金额副行，超长备注完整显示不截断', () => {
    transactionsRef.value = [
      ...transactionsRef.value,
      tx({
        id: 't9', amount: 15, date: dstr(9), category_id: 'cat-food',
        description: '晚饭 马来西亚肉骨茶老店 和同事 AA 之后我付的部分',
        currency: 'MYR', exchange_rate: 1.5,
      }),
    ]
    drillIntoFood()
    fireEvent.click(screen.getByText('9日'))

    // 换算金额（15 / 1.5 = 10）+ 原币副行（原始：RM 15.00）
    expect(screen.getByText('-¥ 10.00')).toBeTruthy()
    expect(screen.getByText('原始：RM 15.00')).toBeTruthy()
    // 超长备注完整渲染
    expect(screen.getByText('晚饭 马来西亚肉骨茶老店 和同事 AA 之后我付的部分')).toBeTruthy()
    // CNY 交易不显示原币副行（面板里只有 MYR 这一条有）
    expect(screen.getAllByText(/^原始：/)).toHaveLength(1)
  })

  it('键盘 Enter/空格 也能展开与收起（行可聚焦）', () => {
    drillIntoFood()
    const row = screen.getByText('5日').closest('[role="button"]')!
    expect(row.getAttribute('tabindex')).toBe('0')

    fireEvent.keyDown(row, { key: 'Enter' })
    expect(screen.getByText('当日合计 · 2笔')).toBeTruthy()

    fireEvent.keyDown(row, { key: ' ' })
    expect(screen.queryByText('当日合计 · 2笔')).toBeNull()
  })

  it('返回列表再重新钻取后，展开状态被重置', () => {
    drillIntoFood()
    fireEvent.click(screen.getByText('5日'))
    expect(screen.getByText('当日合计 · 2笔')).toBeTruthy()

    // 返回饼图列表
    fireEvent.click(screen.getByText('分类占比', { selector: 'button span' }))
    // 重新钻取
    const legendRow = screen.getByText('🍚 三餐').closest('div')!
    fireEvent.click(within(legendRow).getByRole('button', { name: '每日明细' }))

    expect(screen.getByText('5日')).toBeTruthy()
    expect(screen.queryByText('当日合计 · 2笔')).toBeNull()
  })
})
