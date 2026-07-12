import { useState, useMemo } from 'react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js'
import type { TooltipItem } from 'chart.js'
import { Bar, Pie } from 'react-chartjs-2'
import { ChevronDown, ChevronLeft, ChevronRight, Info } from 'lucide-react'
import { useCurrency } from '../contexts/CurrencyContext'
import { useLanguage } from '../contexts/LanguageContext'
import type { TranslationKey } from '../lib/i18n'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { CATEGORY_ICONS, CURRENCY_SYMBOLS } from '../types'
import type { Currency, TxDetail } from '../types'
import { getStatsDisplay } from './Settings'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const RED    = '#e53935'
const GREEN  = '#43a047'
const BLUE   = '#1e88e5'  // 转账主题色，跟 TransactionSheet 的 transfer 蓝一致
const PIE_COLORS = [
  '#e53935','#e91e63','#9c27b0','#673ab7','#3f51b5',
  '#2196f3','#03a9f4','#00bcd4','#009688','#4caf50',
  '#8bc34a','#cddc39','#ffc107','#ff9800','#ff5722',
  '#795548','#9e9e9e','#607d8b',
]
// 转账独立的配色（3 类：转账 / 还款 / 存款 + 兜底未分类），蓝色家族
const TRANSFER_COLORS = ['#1e88e5', '#5e35b1', '#00897b', '#90a4ae']

// 选中柱加深一档（对任意 PIE_COLORS 生效）——对应 daily tab 里 RED→#b71c1c 的既有反馈模式
function darkenHex(hex: string, factor = 0.3): string {
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 0xff) * (1 - factor))
  const g = Math.round(((n >> 8) & 0xff) * (1 - factor))
  const b = Math.round((n & 0xff) * (1 - factor))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
}

type Tab = 'overview' | 'daily' | 'category' | 'extra' | 'transfer'

const NOW = new Date()

// 恩格尔系数：食品支出占比。识别食品类别用类目名兜底（默认类目）。
const FOOD_CATEGORY_NAMES = new Set(['三餐', '零食', '水果', 'Meals', 'Snacks', 'Fruits'])

// 恩格尔系数档位（联合国标准）：max 为该档上界（不含），最后一档为 Infinity。
// engelTier() 与 ⓘ 展开里的档位对照表共用这份定义，保证阈值/配色/文案单一来源。
const ENGEL_TIERS: { key: TranslationKey; color: string; range: string; max: number }[] = [
  { key: 'engelTier1', color: '#43a047', range: '< 30%',  max: 30 },
  { key: 'engelTier2', color: '#7cb342', range: '30–40%', max: 40 },
  { key: 'engelTier3', color: '#fdd835', range: '40–50%', max: 50 },
  { key: 'engelTier4', color: '#fb8c00', range: '50–60%', max: 60 },
  { key: 'engelTier5', color: '#e53935', range: '≥ 60%',  max: Infinity },
]

function monthStart(y: number, m: number) {
  return `${y}-${String(m).padStart(2, '0')}-01`
}
function monthEnd(y: number, m: number) {
  const nm = m === 12 ? 1 : m + 1
  const ny = m === 12 ? y + 1 : y
  return `${ny}-${String(nm).padStart(2, '0')}-01`
}

export default function Charts() {
  const { baseCurrency, rates } = useCurrency()
  const { t, lang } = useLanguage()
  const { transactions: allTxs, loading: txLoading } = useTransactions()
  const { categories } = useCategories()

  const dispCurrency = baseCurrency
  const symbol = CURRENCY_SYMBOLS[dispCurrency as Currency] ?? dispCurrency

  function cvt(amount: number, from: string): number {
    if (from === dispCurrency) return amount
    return (amount / (rates[from] ?? 1)) * (rates[dispCurrency] ?? 1)
  }

  function cvtTx(amount: number, currency: string, exchange_rate?: number | null): number {
    if (exchange_rate != null) return amount / exchange_rate
    return cvt(amount, currency)
  }

  function fmt(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const statsDisplay = useMemo(() => getStatsDisplay(), [])
  const firstVisibleTab = (['overview', 'daily', 'category', 'extra', 'transfer'] as Tab[]).find(k => statsDisplay[k] !== false) ?? 'overview'
  const [tab, setTab] = useState<Tab>(firstVisibleTab)

  // 恩格尔系数的"i"展开：点击 label 旁的 info icon，把"食品"是怎么算出来的展开给用户
  const [engelInfoOpen, setEngelInfoOpen] = useState(false)

  // 环比口径：'same'=同期(本月1–N日 vs 上月1–N日，N=今天)，'full'=整月。
  // 月中直接拿半个月比整月会一直偏低且无意义，所以默认同期；持久化到 localStorage。
  const [momMode, setMomMode] = useState<'same' | 'full'>(() =>
    localStorage.getItem('ledger_mom_mode') === 'full' ? 'full' : 'same'
  )
  function changeMomMode(m: 'same' | 'full') {
    setMomMode(m)
    try { localStorage.setItem('ledger_mom_mode', m) } catch { /* 隐私模式 setItem 可能抛错，忽略 */ }
  }
  const [momInfoOpen, setMomInfoOpen] = useState(false)

  // Shared month navigation (daily / category / extra)
  const [year, setYear]   = useState(NOW.getFullYear())
  const [month, setMonth] = useState(NOW.getMonth() + 1)
  const isCurrentMonth = year === NOW.getFullYear() && month === NOW.getMonth() + 1

  function changeMonth(d: number) {
    let m = month + d, y = year
    if (m > 12) { m = 1;  y++ }
    if (m < 1)  { m = 12; y-- }
    setMonth(m); setYear(y)
    setExpandedCatDay(null)
  }

  const monthYearLabel = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long',
  }).format(new Date(year, month - 1))

  const dailyTitle    = lang === 'zh' ? `${monthYearLabel}${t('tabDaily')}`    : `${t('tabDaily')} · ${monthYearLabel}`
  const categoryTitle = lang === 'zh' ? `${monthYearLabel}${t('tabCategory')}` : `${t('tabCategory')} · ${monthYearLabel}`
  const extraTitle    = lang === 'zh' ? `${monthYearLabel}${t('tabExtra')}`    : `${t('tabExtra')} · ${monthYearLabel}`
  const transferTitle = lang === 'zh' ? `${monthYearLabel}${t('tabTransfer')}` : `${t('tabTransfer')} · ${monthYearLabel}`

  // ── Tab 1: Overview ────────────────────────────────────────────────────
  const [overviewRange, setOverviewRange] = useState<6 | 12>(6)

  type MonthBucket = { month: string; income: number; expense: number }
  const overview: MonthBucket[] = useMemo(() => {
    const buckets: Record<string, { income: number; expense: number }> = {}
    for (let i = overviewRange - 1; i >= 0; i--) {
      const d = new Date(NOW.getFullYear(), NOW.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      buckets[key] = { income: 0, expense: 0 }
    }
    for (const tx of allTxs) {
      if (tx.type !== 'expense' && tx.type !== 'income') continue
      const key = tx.date.slice(0, 7)
      if (!buckets[key]) continue
      const v = cvtTx(tx.amount, tx.currency, tx.exchange_rate)
      if (tx.type === 'income')  buckets[key].income  += v
      if (tx.type === 'expense') buckets[key].expense += v
    }
    return Object.entries(buckets).map(([m, v]) => ({ month: m, ...v }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allTxs, rates, baseCurrency, overviewRange])

  const overviewLoading = txLoading
  const totalIncome  = overview.reduce((s, d) => s + d.income,  0)
  const totalExpense = overview.reduce((s, d) => s + d.expense, 0)
  const totalBalance = totalIncome - totalExpense

  // ── Tabs 2/3/4: Monthly txs ───────────────────────────────────────────
  const monthlyTxs: TxDetail[] = useMemo(() => {
    const start = monthStart(year, month)
    const end   = monthEnd(year, month)
    const catMap = new Map(categories.map(c => [c.id, c]))
    return allTxs
      .filter(tx => tx.date >= start && tx.date < end && (tx.type === 'expense' || tx.type === 'income'))
      .map(tx => {
        const c = catMap.get(tx.category_id)
        return {
          id: tx.id, type: tx.type, amount: tx.amount, currency: tx.currency,
          description: tx.description, date: tx.date, category_id: tx.category_id,
          exchange_rate: tx.exchange_rate,
          categories: c ? { name: c.name, icon: c.icon } : null,
        } as TxDetail
      })
  }, [allTxs, categories, year, month])
  const monthlyLoading = txLoading

  // ── Tab 2: Daily ──────────────────────────────────────────────────────
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [excludeOutliers, setExcludeOutliers] = useState(false)

  const dailyData = useMemo(() => {
    const days = new Date(year, month, 0).getDate()
    const arr = Array.from({ length: days }, (_, i) => ({ day: i + 1, expense: 0 }))
    for (const tx of monthlyTxs) {
      if (tx.type !== 'expense') continue
      const d = parseInt(tx.date.slice(8, 10))
      arr[d - 1].expense += cvtTx(tx.amount, tx.currency, tx.exchange_rate)
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTxs])

  // IQR-based outlier threshold for the daily chart. Only days with expense > 0
  // contribute to the quartile calculation. With fewer than 4 active days we
  // can't compute a meaningful IQR — return Infinity so nothing is filtered.
  const outlierThreshold = useMemo(() => {
    const positives = dailyData.filter(d => d.expense > 0).map(d => d.expense).sort((a, b) => a - b)
    if (positives.length < 4) return Infinity
    const q1 = positives[Math.floor(positives.length * 0.25)]
    const q3 = positives[Math.floor(positives.length * 0.75)]
    const iqr = q3 - q1
    return iqr > 0 ? q3 + 1.5 * iqr : Infinity
  }, [dailyData])

  const outlierDays = useMemo(
    () => dailyData.filter(d => d.expense > outlierThreshold).map(d => d.day),
    [dailyData, outlierThreshold],
  )
  const hasOutliers = outlierDays.length > 0

  // Bar chart uses filtered data when the toggle is on (outlier days get expense=0
  // → bar disappears, but the slot is preserved so other days stay readable).
  const dailyChartDisplayData = useMemo(() => {
    if (!excludeOutliers || !hasOutliers) return dailyData
    return dailyData.map(d => d.expense > outlierThreshold ? { ...d, expense: 0 } : d)
  }, [dailyData, excludeOutliers, outlierThreshold, hasOutliers])

  const dayTxs = useMemo(() => {
    if (selectedDay === null) return []
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(selectedDay).padStart(2,'0')}`
    return monthlyTxs.filter(tx => tx.date === dateStr).sort((a, b) => {
      const va = cvtTx(a.amount, a.currency, a.exchange_rate)
      const vb = cvtTx(b.amount, b.currency, b.exchange_rate)
      return vb - va
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTxs, selectedDay, year, month])

  // ── Tab 3: Category ───────────────────────────────────────────────────
  const [catType, setCatType]           = useState<'expense' | 'income'>('expense')
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null)
  const [hiddenCatIds, setHiddenCatIds] = useState<Set<string>>(new Set())
  // 钻取页里展开的"某一天"（该类目当天逐笔明细）；同时只展开一天
  const [expandedCatDay, setExpandedCatDay] = useState<number | null>(null)

  const catData = useMemo(() => {
    const map: Record<string, { id: string; name: string; icon: string; total: number }> = {}
    for (const tx of monthlyTxs) {
      if (tx.type !== catType) continue
      const key = tx.category_id
      if (!map[key]) map[key] = { id: key, name: tx.categories?.name ?? t('uncategorized'), icon: tx.categories?.icon ?? '📦', total: 0 }
      map[key].total += cvtTx(tx.amount, tx.currency, tx.exchange_rate)
    }
    return Object.values(map).sort((a, b) => b.total - a.total)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTxs, catType, lang])

  const visibleCatData = catData.filter(d => !hiddenCatIds.has(d.id))
  const visibleTotal   = visibleCatData.reduce((s, d) => s + d.total, 0)
  const selectedCatEntry = selectedCatId ? (catData.find(d => d.id === selectedCatId) ?? null) : null
  const selectedCatIdx   = selectedCatId ? catData.findIndex(d => d.id === selectedCatId) : -1

  const catDailyData = useMemo(() => {
    if (!selectedCatId) return []
    const days = new Date(year, month, 0).getDate()
    const arr = Array.from({ length: days }, (_, i) => ({ day: i + 1, amount: 0, count: 0 }))
    for (const tx of monthlyTxs) {
      if (tx.type !== catType || tx.category_id !== selectedCatId) continue
      const d = parseInt(tx.date.slice(8, 10))
      arr[d - 1].amount += cvtTx(tx.amount, tx.currency, tx.exchange_rate)
      arr[d - 1].count += 1
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTxs, selectedCatId, catType])

  // 钻取页当月总笔数（头部卡片"每日明细 · N笔"）
  const selectedCatTxCount = useMemo(() => {
    if (!selectedCatId) return 0
    return monthlyTxs.filter(tx => tx.type === catType && tx.category_id === selectedCatId).length
  }, [monthlyTxs, selectedCatId, catType])

  // 展开的那一天的逐笔明细（金额降序，与每日支出 tab 的单日面板一致）
  const catDayTxs = useMemo(() => {
    if (!selectedCatId || expandedCatDay === null) return []
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(expandedCatDay).padStart(2, '0')}`
    return monthlyTxs
      .filter(tx => tx.type === catType && tx.category_id === selectedCatId && tx.date === dateStr)
      .sort((a, b) => {
        const va = cvtTx(a.amount, a.currency, a.exchange_rate)
        const vb = cvtTx(b.amount, b.currency, b.exchange_rate)
        return vb - va
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTxs, selectedCatId, expandedCatDay, catType, year, month])

  // ── Tab 4: Extra ──────────────────────────────────────────────────────
  // 上月（用来环比）：从 allTxs 现取
  const prevMonthTxs = useMemo(() => {
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear  = month === 1 ? year - 1 : year
    const start = monthStart(prevYear, prevMonth)
    const end   = monthEnd(prevYear, prevMonth)
    return allTxs.filter(tx => tx.date >= start && tx.date < end && (tx.type === 'expense' || tx.type === 'income'))
  }, [allTxs, year, month])

  const extraStats = useMemo(() => {
    const expenses = monthlyTxs.filter(tx => tx.type === 'expense')
    const incomes  = monthlyTxs.filter(tx => tx.type === 'income')
    const totalExp = expenses.reduce((s, tx) => s + cvtTx(tx.amount, tx.currency, tx.exchange_rate), 0)
    const totalInc = incomes.reduce((s, tx)  => s + cvtTx(tx.amount, tx.currency, tx.exchange_rate), 0)
    const days = new Date(year, month, 0).getDate()
    const avgDailyExp = totalExp / days

    const maxExpTx = expenses.reduce<TxDetail | null>((max, tx) => {
      if (!max) return tx
      return cvtTx(tx.amount, tx.currency, tx.exchange_rate) > cvtTx(max.amount, max.currency, max.exchange_rate) ? tx : max
    }, null)

    const dowExp: number[] = Array(7).fill(0)
    for (const tx of expenses) {
      const dow = new Date(tx.date + 'T12:00:00').getDay()
      dowExp[dow] += cvtTx(tx.amount, tx.currency, tx.exchange_rate)
    }
    const maxDow = dowExp.indexOf(Math.max(...dowExp))

    const catMap: Record<string, { name: string; icon: string; total: number }> = {}
    for (const tx of expenses) {
      const key = tx.category_id
      if (!catMap[key]) catMap[key] = { name: tx.categories?.name ?? '?', icon: tx.categories?.icon ?? '📦', total: 0 }
      catMap[key].total += cvtTx(tx.amount, tx.currency, tx.exchange_rate)
    }
    const topCat = Object.values(catMap).sort((a, b) => b.total - a.total)[0] ?? null
    const savingsRate = totalInc > 0 ? ((totalInc - totalExp) / totalInc * 100) : null

    // 恩格尔系数（食品支出 / 总支出）。仅按默认食品类目兜底识别。
    const foodExp = expenses.reduce((s, tx) => {
      const name = tx.categories?.name ?? ''
      return FOOD_CATEGORY_NAMES.has(name) ? s + cvtTx(tx.amount, tx.currency, tx.exchange_rate) : s
    }, 0)
    const engelCoef = totalExp > 0 && foodExp > 0 ? (foodExp / totalExp * 100) : null

    // 环比上月——同时算两种口径：
    //   整月(full)：本月合计 vs 上月合计（月份完整时才有意义）
    //   同期(same/MTD)：本月 1–cutoff 日 vs 上月 1–cutoff 日（cutoff=本月时取今天，过去月取整月最后一天）
    const dayOf = (d: string) => parseInt(d.slice(8, 10), 10)
    const daysInMonth     = new Date(year, month, 0).getDate()
    const prevMonth       = month === 1 ? 12 : month - 1
    const prevYear        = month === 1 ? year - 1 : year
    const daysInPrevMonth = new Date(prevYear, prevMonth, 0).getDate()
    const isCur     = year === NOW.getFullYear() && month === NOW.getMonth() + 1
    const cutoffDay = isCur ? NOW.getDate() : daysInMonth
    const prevCutoff = Math.min(cutoffDay, daysInPrevMonth) // 上月若天数更少，截到上月最后一天
    // cutoff 真正落在月份中间（本月未过完）才有"同期≠整月"的区别，也才需要露出切换/提示
    const isPartialMonth = cutoffDay < daysInMonth

    const prevExpTxs = prevMonthTxs.filter(tx => tx.type === 'expense')
    const prevIncTxs = prevMonthTxs.filter(tx => tx.type === 'income')
    const sum = (txs: typeof prevExpTxs) =>
      txs.reduce((s, tx) => s + cvtTx(tx.amount, tx.currency, tx.exchange_rate), 0)
    const sumExpenses = (txs: TxDetail[]) =>
      txs.reduce((s, tx) => s + cvtTx(tx.amount, tx.currency, tx.exchange_rate), 0)

    // 整月口径
    const prevExp = sum(prevExpTxs)
    const prevInc = sum(prevIncTxs)
    const expDelta = prevExp > 0 ? ((totalExp - prevExp) / prevExp * 100) : null
    const incDelta = prevInc > 0 ? ((totalInc - prevInc) / prevInc * 100) : null

    // 同期(MTD)口径
    const mtdExp = sumExpenses(expenses.filter(tx => dayOf(tx.date) <= cutoffDay))
    const mtdInc = sumExpenses(incomes.filter(tx => dayOf(tx.date) <= cutoffDay))
    const prevMtdExp = sum(prevExpTxs.filter(tx => dayOf(tx.date) <= prevCutoff))
    const prevMtdInc = sum(prevIncTxs.filter(tx => dayOf(tx.date) <= prevCutoff))
    const mtdExpDelta = prevMtdExp > 0 ? ((mtdExp - prevMtdExp) / prevMtdExp * 100) : null
    const mtdIncDelta = prevMtdInc > 0 ? ((mtdInc - prevMtdInc) / prevMtdInc * 100) : null

    return { totalExp, totalInc, avgDailyExp, maxExpTx, maxDow, dowExp, topCat, savingsRate,
             foodExp, engelCoef, prevExp, prevInc, expDelta, incDelta,
             cutoffDay, isPartialMonth, mtdExp, mtdInc, prevMtdExp, prevMtdInc, mtdExpDelta, mtdIncDelta }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTxs, prevMonthTxs, year, month])

  // ── Tab 5: Transfer ───────────────────────────────────────────────────
  // 完全独立于上面 4 个 tab 的数据流：另起一个 monthlyTransferTxs 派生，
  // 不混进 monthlyTxs 也不入 overview——保证现有支出/收入统计字节不变。
  const monthlyTransferTxs: TxDetail[] = useMemo(() => {
    const start = monthStart(year, month)
    const end   = monthEnd(year, month)
    const catMap = new Map(categories.map(c => [c.id, c]))
    return allTxs
      .filter(tx => tx.date >= start && tx.date < end && tx.type === 'transfer')
      .map(tx => {
        const c = catMap.get(tx.category_id)
        return {
          id: tx.id, type: tx.type, amount: tx.amount, currency: tx.currency,
          description: tx.description, date: tx.date, category_id: tx.category_id,
          exchange_rate: tx.exchange_rate,
          direction: tx.direction,
          categories: c ? { name: c.name, icon: c.icon } : null,
        } as TxDetail
      })
  }, [allTxs, categories, year, month])

  const prevMonthTransferTxs = useMemo(() => {
    const prevMonth = month === 1 ? 12 : month - 1
    const prevYear  = month === 1 ? year - 1 : year
    const start = monthStart(prevYear, prevMonth)
    const end   = monthEnd(prevYear, prevMonth)
    return allTxs.filter(tx => tx.date >= start && tx.date < end && tx.type === 'transfer')
  }, [allTxs, year, month])

  const transferStats = useMemo(() => {
    // 拆分 in/out 维度——老数据 direction=null 视为 'in'（与 Home/Calendar 一致）
    const isOut = (tx: TxDetail) => tx.direction === 'out'
    let totalIn = 0
    let totalOut = 0
    for (const tx of monthlyTransferTxs) {
      const v = cvtTx(tx.amount, tx.currency, tx.exchange_rate)
      if (isOut(tx)) totalOut += v
      else totalIn += v
    }
    const total = totalIn + totalOut  // 流水"总规模"
    const net   = totalIn - totalOut  // 实际净流入
    const count = monthlyTransferTxs.length
    const days = new Date(year, month, 0).getDate()
    const avgDaily = total / days

    // 类目分布（按类目维度，不区分 in/out；类目本身就承载语义如"还款"=多半 out）
    const catMap: Record<string, { name: string; icon: string; total: number; count: number }> = {}
    for (const tx of monthlyTransferTxs) {
      const key = tx.category_id
      if (!catMap[key]) {
        catMap[key] = {
          name: tx.categories?.name ?? t('uncategorized'),
          icon: tx.categories?.icon ?? '📦',
          total: 0,
          count: 0,
        }
      }
      catMap[key].total += cvtTx(tx.amount, tx.currency, tx.exchange_rate)
      catMap[key].count += 1
    }
    const byCategory = Object.values(catMap).sort((a, b) => b.total - a.total)

    // 每日柱状：in 蓝、out 红，分两个 dataset 同 day 并排
    const dailyIn  = Array.from({ length: days }, (_, i) => ({ day: i + 1, amount: 0 }))
    const dailyOut = Array.from({ length: days }, (_, i) => ({ day: i + 1, amount: 0 }))
    for (const tx of monthlyTransferTxs) {
      const d = parseInt(tx.date.slice(8, 10))
      const v = cvtTx(tx.amount, tx.currency, tx.exchange_rate)
      if (isOut(tx)) dailyOut[d - 1].amount += v
      else dailyIn[d - 1].amount += v
    }

    // 环比上月（按总规模比较，跟既有"环比"语义一致；老数据无 direction 时整月按 in 统计）
    const prevTotal = prevMonthTransferTxs.reduce(
      (s, tx) => s + cvtTx(tx.amount, tx.currency, tx.exchange_rate),
      0,
    )
    const delta = prevTotal > 0 ? ((total - prevTotal) / prevTotal * 100) : null

    return { total, totalIn, totalOut, net, count, avgDaily, byCategory, dailyIn, dailyOut, prevTotal, delta }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTransferTxs, prevMonthTransferTxs, year, month, t])

  // 转账 tab 的图表配置
  const transferPieData = {
    labels: transferStats.byCategory.map(c => `${c.icon} ${c.name}`),
    datasets: [{
      data: transferStats.byCategory.map(c => c.total),
      backgroundColor: transferStats.byCategory.map((_, i) => TRANSFER_COLORS[i % TRANSFER_COLORS.length]),
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }

  const transferDailyChartData = {
    labels: transferStats.dailyIn.map(d => String(d.day)),
    datasets: [
      {
        label: t('transferIn'),
        data: transferStats.dailyIn.map(d => d.amount),
        backgroundColor: BLUE,
        borderRadius: 3,
        barPercentage: 0.8,
      },
      {
        label: t('transferOut'),
        data: transferStats.dailyOut.map(d => d.amount),
        backgroundColor: RED,
        borderRadius: 3,
        barPercentage: 0.8,
      },
    ],
  }

  const transferPieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'pie'>) => {
            const v = ctx.parsed as number
            const pct = transferStats.total > 0 ? ((v / transferStats.total) * 100).toFixed(1) : '0'
            return ` ${symbol} ${fmt(v)} (${pct}%)`
          },
        },
      },
    },
  }

  // 恩格尔系数等级（联合国标准）——阈值/配色取自 ENGEL_TIERS 单一来源
  function engelTier(coef: number): { label: string; color: string } {
    const tier = ENGEL_TIERS.find(tt => coef < tt.max) ?? ENGEL_TIERS[ENGEL_TIERS.length - 1]
    return { label: t(tier.key), color: tier.color }
  }

  // ── Chart configs ─────────────────────────────────────────────────────

  const overviewChartData = {
    labels: overview.map(d => {
      const m = parseInt(d.month.slice(5))
      const y = parseInt(d.month.slice(0, 4))
      if (lang === 'zh') return `${m}月`
      return new Intl.DateTimeFormat('en-US', { month: 'short' }).format(new Date(y, m - 1))
    }),
    datasets: [
      { label: t('income'),  data: overview.map(d => d.income),  backgroundColor: GREEN, borderRadius: 4, barPercentage: 0.7 },
      { label: t('expense'), data: overview.map(d => d.expense), backgroundColor: RED,   borderRadius: 4, barPercentage: 0.7 },
    ],
  }

  const dailyChartData = {
    labels: dailyChartDisplayData.map(d => String(d.day)),
    datasets: [{
      label: t('expense'),
      data: dailyChartDisplayData.map(d => d.expense),
      backgroundColor: dailyChartDisplayData.map(d => d.day === selectedDay ? '#b71c1c' : RED),
      borderRadius: 3,
      barPercentage: 0.8,
    }],
  }

  const catDailyChartData = selectedCatEntry ? {
    labels: catDailyData.map(d => String(d.day)),
    datasets: [{
      label: `${selectedCatEntry.icon} ${selectedCatEntry.name}`,
      data: catDailyData.map(d => d.amount),
      // 展开中的那天加深一档，与 daily tab 选中柱的反馈模式一致
      backgroundColor: catDailyData.map(d => d.day === expandedCatDay
        ? darkenHex(PIE_COLORS[selectedCatIdx % PIE_COLORS.length])
        : PIE_COLORS[selectedCatIdx % PIE_COLORS.length]),
      borderRadius: 3,
      barPercentage: 0.8,
    }],
  } : null

  const pieChartData = {
    labels: visibleCatData.map(d => `${d.icon} ${d.name}`),
    datasets: [{
      data: visibleCatData.map(d => d.total),
      backgroundColor: visibleCatData.map(d => PIE_COLORS[catData.indexOf(d) % PIE_COLORS.length]),
      borderWidth: 2,
      borderColor: '#fff',
    }],
  }

  const barBase = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom' as const, labels: { font: { size: 11 }, boxWidth: 12, padding: 12 } },
      tooltip: { callbacks: { label: (ctx: TooltipItem<'bar'>) => ` ${symbol} ${fmt((ctx.parsed as { y: number }).y ?? 0)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: {
        grid: { color: '#f3f4f6' },
        ticks: { font: { size: 10 }, callback: (v: string | number) => `${symbol}${Math.round(Number(v))}` },
      },
    },
  }

  const pieOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: TooltipItem<'pie'>) => {
            const v = ctx.parsed as number
            const pct = visibleTotal > 0 ? ((v / visibleTotal) * 100).toFixed(1) : '0'
            return ` ${symbol} ${fmt(v)} (${pct}%)`
          },
        },
      },
    },
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  const Spinner = () => (
    <div className="h-48 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-[#e53935] border-t-transparent rounded-full animate-spin" />
    </div>
  )

  const MonthNav = ({ title }: { title: string }) => (
    <div className="flex items-center justify-between mb-4">
      <button onClick={() => changeMonth(-1)}
        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200">
        <ChevronLeft size={16} />
      </button>
      <p className="text-sm font-semibold text-gray-700">{title}</p>
      <button onClick={() => changeMonth(1)} disabled={isCurrentMonth}
        className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center active:bg-gray-200 disabled:opacity-30">
        <ChevronRight size={16} />
      </button>
    </div>
  )

  const TABS: { key: Tab; label: string }[] = ([
    { key: 'overview' as Tab, label: t('tabOverview') },
    { key: 'daily'    as Tab, label: t('tabDaily') },
    { key: 'category' as Tab, label: t('tabCategory') },
    { key: 'extra'    as Tab, label: t('tabExtra') },
    { key: 'transfer' as Tab, label: t('tabTransfer') },
  ] as const).filter(item => statsDisplay[item.key] !== false)

  const weekdayKeys = ['weekday0','weekday1','weekday2','weekday3','weekday4','weekday5','weekday6'] as const

  return (
    <div className="anim-page flex flex-col h-full bg-gray-50">

      {/* Header + Tabs */}
      <div className="bg-white px-4 pt-4 pb-0 border-b border-gray-100 shrink-0">
        <h1 className="text-lg font-bold text-gray-800 mb-3">{t('statsTitle')}</h1>
        <div className="flex">
          {TABS.map(tabItem => (
            <button key={tabItem.key} onClick={() => setTab(tabItem.key)}
              className={`flex-1 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                tab === tabItem.key ? 'border-[#e53935] text-[#e53935]' : 'border-transparent text-gray-400'
              }`}>
              {tabItem.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white rounded-xl p-3 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">{t('income')}</p>
                <p className="text-sm font-semibold text-green-600 truncate">{symbol} {fmt(totalIncome)}</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">{t('expense')}</p>
                <p className="text-sm font-semibold text-[#e53935] truncate">{symbol} {fmt(totalExpense)}</p>
              </div>
              <div className="bg-white rounded-xl p-3 shadow-sm">
                <p className="text-xs text-gray-400 mb-1">{t('balance')}</p>
                <p className={`text-sm font-semibold truncate ${totalBalance >= 0 ? 'text-gray-800' : 'text-red-500'}`}>
                  {symbol} {fmt(totalBalance)}
                </p>
              </div>
            </div>

            {/* Bar chart with range toggle */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-gray-700">
                  {t('last6Months').replace('{n}', String(overviewRange))}
                </p>
                <div className="flex bg-gray-100 rounded-lg p-0.5">
                  {([6, 12] as const).map(r => (
                    <button key={r} onClick={() => setOverviewRange(r)}
                      className={`px-2.5 py-0.5 text-xs font-medium rounded-md transition-colors ${
                        overviewRange === r ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'
                      }`}>
                      {r}{lang === 'zh' ? '个月' : 'M'}
                    </button>
                  ))}
                </div>
              </div>
              {overviewLoading ? <Spinner /> : (
                <div className="h-52">
                  <Bar key={`${lang}-${overviewRange}`} data={overviewChartData} options={barBase} />
                </div>
              )}
            </div>

            {/* Month-by-month breakdown list */}
            {!overviewLoading && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-sm font-semibold text-gray-700 mb-3">{t('monthlyBreakdown')}</p>
                <div className="space-y-3">
                  {[...overview].reverse().map(d => {
                    const net = d.income - d.expense
                    const m = parseInt(d.month.slice(5))
                    const y = parseInt(d.month.slice(0, 4))
                    const label = lang === 'zh'
                      ? `${y}年${m}月`
                      : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short' }).format(new Date(y, m - 1))
                    const maxExp = Math.max(...overview.map(o => o.expense), 0.001)
                    const maxInc = Math.max(...overview.map(o => o.income), 0.001)
                    return (
                      <div key={d.month} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-16 shrink-0">{label}</span>
                        <div className="flex-1 flex flex-col gap-1">
                          {d.income > 0 && (
                            <div className="h-1.5 rounded-full bg-green-100 overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full transition-all"
                                style={{ width: `${(d.income / maxInc) * 100}%` }} />
                            </div>
                          )}
                          {d.expense > 0 && (
                            <div className="h-1.5 rounded-full bg-red-100 overflow-hidden">
                              <div className="h-full bg-[#e53935] rounded-full transition-all"
                                style={{ width: `${(d.expense / maxExp) * 100}%` }} />
                            </div>
                          )}
                        </div>
                        <span className={`text-xs font-medium w-20 text-right shrink-0 ${net >= 0 ? 'text-green-600' : 'text-[#e53935]'}`}>
                          {net >= 0 ? '+' : ''}{symbol} {Math.round(Math.abs(net))}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Daily ── */}
        {tab === 'daily' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <MonthNav title={dailyTitle} />
            {monthlyLoading ? <Spinner /> : dailyData.every(d => d.expense === 0) ? (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 gap-2">
                <span className="text-3xl">📊</span>
                <p className="text-sm">{t('noExpenseData')}</p>
              </div>
            ) : (
              <>
                {/* Outlier toggle (only visible when outliers exist) */}
                {hasOutliers && (
                  <div className="flex items-center justify-between -mt-1 mb-2">
                    <p className="text-xs text-gray-400">
                      {excludeOutliers
                        ? t('excludedDaysHint', {
                            n: outlierDays.length,
                            threshold: `${symbol} ${fmt(outlierThreshold)}`,
                          })
                        : ' '}
                    </p>
                    <button onClick={() => setExcludeOutliers(v => !v)}
                      className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
                        excludeOutliers
                          ? 'bg-[#e53935] text-white'
                          : 'bg-gray-100 text-gray-500 active:bg-gray-200'
                      }`}>
                      {t('excludeOutliersBtn')}
                    </button>
                  </div>
                )}

                <div className="h-52 mb-2">
                  <Bar
                    key={`${lang}-${excludeOutliers}`}
                    data={dailyChartData}
                    options={{
                      ...barBase,
                      plugins: { ...barBase.plugins, legend: { display: false } },
                      onClick: (_evt, elements) => {
                        if (elements.length > 0) {
                          const day = dailyData[elements[0].index].day
                          setSelectedDay(prev => prev === day ? null : day)
                        }
                      },
                    }}
                  />
                </div>

                {/* Day detail panel */}
                {selectedDay !== null && (
                  <div className="border border-gray-100 rounded-xl p-3 mb-3 bg-gray-50">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-semibold text-gray-700">
                        {lang === 'zh' ? `${selectedDay}日明细` : `Day ${selectedDay} Details`}
                      </p>
                      <button onClick={() => setSelectedDay(null)}
                        className="text-xs text-gray-400 active:text-gray-600">
                        {lang === 'zh' ? '收起' : 'Close'}
                      </button>
                    </div>
                    {dayTxs.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-3">{t('noExpenseData')}</p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          {dayTxs.map(tx => (
                            <div key={tx.id} className="flex items-center gap-2">
                              <span className="text-lg shrink-0">{tx.categories?.icon ?? '📦'}</span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-700 truncate">{tx.categories?.name ?? t('uncategorized')}</p>
                                {tx.description && <p className="text-xs text-gray-400 truncate">{tx.description}</p>}
                              </div>
                              <span className={`text-sm font-semibold shrink-0 ${tx.type === 'expense' ? 'text-[#e53935]' : 'text-green-600'}`}>
                                {tx.type === 'expense' ? '-' : '+'}{symbol} {fmt(cvtTx(tx.amount, tx.currency, tx.exchange_rate))}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between pt-2 mt-1 border-t border-gray-200">
                          <span className="text-xs text-gray-400">{lang === 'zh' ? '当日支出' : 'Day total'}</span>
                          <span className="text-sm font-semibold text-[#e53935]">
                            {symbol} {fmt(dayTxs.filter(tx => tx.type === 'expense').reduce((s, tx) => s + cvtTx(tx.amount, tx.currency, tx.exchange_rate), 0))}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}

              </>
            )}
          </div>
        )}

        {/* ── Category ── */}
        {tab === 'category' && (
          <div className="bg-white rounded-2xl p-4 shadow-sm">
            <MonthNav title={categoryTitle} />

            {/* expense / income toggle */}
            <div className="flex bg-gray-100 rounded-xl p-1 mb-4">
              {(['expense', 'income'] as const).map(txType => (
                <button key={txType}
                  onClick={() => { setCatType(txType); setSelectedCatId(null); setHiddenCatIds(new Set()); setExpandedCatDay(null) }}
                  className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                    catType === txType
                      ? txType === 'expense' ? 'bg-[#e53935] text-white shadow-sm' : 'bg-green-500 text-white shadow-sm'
                      : 'text-gray-500'
                  }`}>
                  {txType === 'expense' ? t('expense') : t('income')}
                </button>
              ))}
            </div>

            {monthlyLoading ? <Spinner /> : catData.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-gray-400 gap-2">
                <span className="text-3xl">🍩</span>
                <p className="text-sm">{catType === 'expense' ? t('noExpenseData') : t('noIncomeData')}</p>
              </div>
            ) : selectedCatEntry ? (
              /* ── Category daily breakdown ── */
              <>
                <button onClick={() => { setSelectedCatId(null); setExpandedCatDay(null) }}
                  className="flex items-center gap-1 text-sm text-gray-400 mb-3 -mt-1 active:text-gray-600">
                  <ChevronLeft size={15} />
                  <span>{t('tabCategory')}</span>
                </button>

                <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-lg shrink-0"
                    style={{ background: PIE_COLORS[selectedCatIdx % PIE_COLORS.length] + '22' }}>
                    {selectedCatEntry.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{selectedCatEntry.name}</p>
                    <p className="text-xs text-gray-400">{`${t('catDailyDetail')} · ${t('catTxCount', { n: selectedCatTxCount })}`}</p>
                  </div>
                  <p className="text-sm font-semibold shrink-0"
                    style={{ color: PIE_COLORS[selectedCatIdx % PIE_COLORS.length] }}>
                    {symbol} {fmt(selectedCatEntry.total)}
                  </p>
                </div>

                {catDailyData.every(d => d.amount === 0) ? (
                  <div className="h-36 flex flex-col items-center justify-center text-gray-400 gap-2">
                    <span className="text-3xl">📊</span>
                    <p className="text-sm">{catType === 'expense' ? t('noExpenseData') : t('noIncomeData')}</p>
                  </div>
                ) : (
                  <>
                    <div className="h-44 mb-3">
                      <Bar
                        key={`${lang}-${selectedCatEntry.id}`}
                        data={catDailyChartData!}
                        options={{
                          ...barBase,
                          plugins: { ...barBase.plugins, legend: { display: false } },
                          onClick: (_evt, elements) => {
                            if (elements.length > 0) {
                              const day = catDailyData[elements[0].index].day
                              setExpandedCatDay(prev => prev === day ? null : day)
                              // 图表和展开行之间可能隔着长列表，滚过去让反馈可见
                              requestAnimationFrame(() => {
                                document.getElementById(`cat-day-row-${day}`)
                                  ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                              })
                            }
                          },
                        }}
                      />
                    </div>
                    {/* 每日汇总行：点行展开当天该类目的逐笔明细 */}
                    <div className="space-y-1.5 pt-3 border-t border-gray-50">
                      {(() => {
                        const maxAmt = Math.max(...catDailyData.map(d => d.amount), 0.001)
                        const catColor = PIE_COLORS[selectedCatIdx % PIE_COLORS.length]
                        return catDailyData.filter(d => d.amount > 0).map(d => {
                          const isExpanded = expandedCatDay === d.day
                          return (
                            <div key={d.day} id={`cat-day-row-${d.day}`}>
                              <div
                                role="button"
                                tabIndex={0}
                                aria-expanded={isExpanded}
                                onClick={() => setExpandedCatDay(prev => prev === d.day ? null : d.day)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault()
                                    setExpandedCatDay(prev => prev === d.day ? null : d.day)
                                  }
                                }}
                                className="flex items-center gap-2 py-0.5 cursor-pointer select-none active:opacity-70"
                              >
                                <span className="text-xs text-gray-400 w-7 shrink-0 text-right">
                                  {lang === 'zh' ? `${d.day}日` : `${d.day}`}
                                </span>
                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${(d.amount / maxAmt) * 100}%`,
                                      background: catColor,
                                    }} />
                                </div>
                                <span className="text-sm font-medium text-gray-700 w-24 text-right shrink-0">
                                  {symbol} {fmt(d.amount)}
                                </span>
                                <ChevronDown size={14}
                                  className={`shrink-0 text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                              </div>

                              {isExpanded && catDayTxs.length > 0 && (
                                <div className="border border-gray-100 rounded-xl p-3 my-1.5 bg-gray-50">
                                  <div className="space-y-2">
                                    {catDayTxs.map(tx => (
                                      <div key={tx.id} className="flex items-center gap-2">
                                        <span className="text-lg shrink-0">{tx.categories?.icon ?? '📦'}</span>
                                        <p className="flex-1 min-w-0 text-sm text-gray-700 truncate">
                                          {tx.description || (tx.categories?.name ?? t('uncategorized'))}
                                        </p>
                                        <span className={`text-sm font-semibold shrink-0 ${catType === 'expense' ? 'text-[#e53935]' : 'text-green-600'}`}>
                                          {catType === 'expense' ? '-' : '+'}{symbol} {fmt(cvtTx(tx.amount, tx.currency, tx.exchange_rate))}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex justify-between pt-2 mt-1 border-t border-gray-200">
                                    <span className="text-xs text-gray-400">
                                      {`${lang === 'zh' ? '当日合计' : 'Day total'} · ${t('catTxCount', { n: catDayTxs.length })}`}
                                    </span>
                                    <span className={`text-sm font-semibold ${catType === 'expense' ? 'text-[#e53935]' : 'text-green-600'}`}>
                                      {symbol} {fmt(d.amount)}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </>
                )}
              </>
            ) : (
              /* ── Pie + legend ── */
              <>
                {visibleCatData.length === 0 ? (
                  <div className="h-32 flex items-center justify-center">
                    <p className="text-sm text-gray-400">
                      {lang === 'zh' ? '所有分类已隐藏' : 'All categories hidden'}
                    </p>
                  </div>
                ) : (
                  <div className="h-52 mb-4">
                    <Pie key={`${lang}-${hiddenCatIds.size}`} data={pieChartData} options={pieOptions} />
                  </div>
                )}

                {/* Custom legend — row tap = toggle hide, arrow tap = drill into daily */}
                <div className="space-y-2 pt-2 border-t border-gray-50">
                  {catData.map((d, i) => {
                    const isHidden = hiddenCatIds.has(d.id)
                    const pct = visibleTotal > 0 && !isHidden ? (d.total / visibleTotal * 100).toFixed(1) : '—'
                    const color = PIE_COLORS[i % PIE_COLORS.length]
                    return (
                      <div
                        key={d.id}
                        onClick={() => setHiddenCatIds(prev => {
                          const next = new Set(prev)
                          if (next.has(d.id)) next.delete(d.id); else next.add(d.id)
                          return next
                        })}
                        className={`flex items-center gap-2 cursor-pointer select-none transition-opacity ${isHidden ? 'opacity-35' : 'active:opacity-70'}`}
                      >
                        <div className="w-3 h-3 rounded-sm shrink-0"
                          style={{ background: isHidden ? '#d1d5db' : color }} />
                        <span className={`text-sm flex-1 truncate ${isHidden ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                          {d.icon} {d.name}
                        </span>
                        <span className="text-xs text-gray-400 shrink-0 w-10 text-right">{pct}%</span>
                        <span className={`text-sm font-medium shrink-0 w-24 text-right ${isHidden ? 'text-gray-400' : 'text-gray-800'}`}>
                          {symbol} {fmt(d.total)}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); setSelectedCatId(d.id); setExpandedCatDay(null) }}
                          className="shrink-0 -mr-1 text-gray-300 active:text-gray-500 transition-colors"
                          aria-label={t('catDailyDetail')}>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Extra ── */}
        {tab === 'extra' && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <MonthNav title={extraTitle} />

              {monthlyLoading ? <Spinner /> : (
                <div className="space-y-3">

                  {/* Key metrics */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">
                        {lang === 'zh' ? '日均支出' : 'Avg Daily Expense'}
                      </p>
                      <p className="text-sm font-semibold text-[#e53935]">{symbol} {fmt(extraStats.avgDailyExp)}</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">
                        {lang === 'zh' ? '结余率' : 'Savings Rate'}
                      </p>
                      <p className={`text-sm font-semibold ${
                        extraStats.savingsRate === null ? 'text-gray-400'
                        : extraStats.savingsRate >= 0 ? 'text-green-600' : 'text-[#e53935]'
                      }`}>
                        {extraStats.savingsRate !== null ? `${extraStats.savingsRate.toFixed(1)}%` : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Largest expense */}
                  {extraStats.maxExpTx && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-2">
                        {lang === 'zh' ? '最高单笔支出' : 'Largest Single Expense'}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-xl shrink-0">{extraStats.maxExpTx.categories?.icon ?? '📦'}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-700 truncate">
                            {extraStats.maxExpTx.categories?.name ?? t('uncategorized')}
                          </p>
                          <p className="text-xs text-gray-400">{extraStats.maxExpTx.date}</p>
                        </div>
                        <p className="text-sm font-semibold text-[#e53935] shrink-0">
                          {symbol} {fmt(cvtTx(extraStats.maxExpTx.amount, extraStats.maxExpTx.currency, extraStats.maxExpTx.exchange_rate))}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Top category */}
                  {extraStats.topCat && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-2">
                        {lang === 'zh' ? '支出最多分类' : 'Top Spending Category'}
                      </p>
                      <div className="flex items-center gap-3">
                        <span className="text-xl shrink-0">{extraStats.topCat.icon}</span>
                        <p className="text-sm text-gray-700 flex-1 truncate">{extraStats.topCat.name}</p>
                        <p className="text-sm font-semibold text-[#e53935] shrink-0">
                          {symbol} {fmt(extraStats.topCat.total)}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Engel coefficient */}
                  {extraStats.engelCoef !== null && (() => {
                    const coef = extraStats.engelCoef
                    const tier = engelTier(coef)
                    // 当前系数落在哪个档位（用于 ⓘ 展开里高亮对应行）
                    const activeTierIndex = ENGEL_TIERS.findIndex(tt => coef < tt.max)
                    // 把 set 里的中文名挑出来给用户看（FOOD_CATEGORY_NAMES 同时含中英文，
                    // 这里按当前语言过滤；英文模式就显示 Meals / Snacks / Fruits）
                    const foodNames = lang === 'zh'
                      ? ['三餐', '零食', '水果']
                      : ['Meals', 'Snacks', 'Fruits']
                    return (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-baseline justify-between mb-1.5">
                          <div className="flex items-center gap-1">
                            <p className="text-xs text-gray-400">{t('engelCoefLabel')}</p>
                            <button
                              type="button"
                              onClick={() => setEngelInfoOpen(v => !v)}
                              aria-label={t('engelInfoAria')}
                              aria-expanded={engelInfoOpen}
                              className="p-0.5 -m-0.5 text-gray-400 hover:text-gray-600 active:text-gray-700 transition-colors"
                            >
                              <Info size={12} />
                            </button>
                          </div>
                          <p className="text-base font-semibold text-gray-800">
                            {coef.toFixed(1)}%
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(coef, 100)}%`, background: tier.color }} />
                          </div>
                          <span className="text-xs font-medium shrink-0" style={{ color: tier.color }}>
                            {tier.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{t('engelCoefDesc')}</p>

                        {/* 展开后：先给档位对照（系数区间→档位，高亮当前档），再说明"食品"是怎么聚合的 */}
                        {engelInfoOpen && (
                          <div className="mt-2.5 pt-2.5 border-t border-gray-200 space-y-2.5">
                            {/* 档位对照表 */}
                            <div className="space-y-1">
                              <p className="text-xs text-gray-500">{t('engelTierLegendTitle')}</p>
                              <div className="space-y-0.5">
                                {ENGEL_TIERS.map((tt, i) => {
                                  const active = i === activeTierIndex
                                  return (
                                    <div key={tt.key}
                                      className={`flex items-center gap-2 rounded-md px-1.5 py-1 ${active ? 'bg-white border border-gray-200' : ''}`}>
                                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tt.color }} />
                                      <span className={`w-16 shrink-0 text-xs tabular-nums ${active ? 'font-medium text-gray-700' : 'text-gray-500'}`}>
                                        {tt.range}
                                      </span>
                                      <span className={`text-xs ${active ? 'font-semibold' : 'text-gray-500'}`}
                                        style={active ? { color: tt.color } : undefined}>
                                        {t(tt.key)}
                                      </span>
                                      {active && (
                                        <span className="ml-auto shrink-0 text-[10px] text-gray-400">{t('engelTierCurrent')}</span>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            {/* "食品"是怎么聚合的（按类目名匹配 FOOD_CATEGORY_NAMES）*/}
                            <div className="space-y-1.5 pt-2.5 border-t border-gray-200">
                              <p className="text-xs text-gray-500">{t('engelInfoCountedAs')}</p>
                              <div className="flex flex-wrap gap-1">
                                {foodNames.map(name => (
                                  <span key={name}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-white rounded-full text-xs text-gray-600 border border-gray-200">
                                    {CATEGORY_ICONS[name] ?? '🍽️'} {name}
                                  </span>
                                ))}
                              </div>
                              <p className="text-xs text-gray-400 leading-relaxed">{t('engelInfoNote')}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  {/* Month-over-month（环比上月）：默认同期口径，月中可切整月 */}
                  {(() => {
                    // 过去的完整月份同期==整月，强制走整月口径；只有本月未过完时才尊重用户选择
                    const useSame = extraStats.isPartialMonth && momMode === 'same'
                    const expDelta = useSame ? extraStats.mtdExpDelta : extraStats.expDelta
                    const incDelta = useSame ? extraStats.mtdIncDelta : extraStats.incDelta
                    if (expDelta === null && incDelta === null) return null
                    return (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <div className="flex items-center gap-1">
                            <p className="text-xs text-gray-400">{t('momLabel')}</p>
                            <button
                              type="button"
                              onClick={() => setMomInfoOpen(v => !v)}
                              aria-label={t('momInfoAria')}
                              aria-expanded={momInfoOpen}
                              className="p-0.5 -m-0.5 text-gray-400 hover:text-gray-600 active:text-gray-700 transition-colors"
                            >
                              <Info size={12} />
                            </button>
                          </div>
                          {/* 只有本月未过完（同期≠整月）才需要切换 */}
                          {extraStats.isPartialMonth && (
                            <div className="flex items-center rounded-lg bg-gray-200/70 p-0.5 text-xs shrink-0">
                              {(['same', 'full'] as const).map(m => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => changeMomMode(m)}
                                  aria-pressed={momMode === m}
                                  className={`px-2 py-0.5 rounded-md transition-colors ${
                                    momMode === m ? 'bg-white text-gray-800 font-medium' : 'text-gray-500'
                                  }`}
                                >
                                  {m === 'same' ? t('momModeSame') : t('momModeFull')}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">{t('momExpense')}</p>
                            {expDelta !== null ? (
                              <p className={`text-sm font-semibold ${expDelta > 0 ? 'text-[#e53935]' : 'text-green-600'}`}>
                                {expDelta > 0 ? '+' : ''}{expDelta.toFixed(1)}%
                              </p>
                            ) : (
                              <p className="text-sm text-gray-400">—</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-0.5">{t('momIncome')}</p>
                            {incDelta !== null ? (
                              <p className={`text-sm font-semibold ${incDelta >= 0 ? 'text-green-600' : 'text-[#e53935]'}`}>
                                {incDelta > 0 ? '+' : ''}{incDelta.toFixed(1)}%
                              </p>
                            ) : (
                              <p className="text-sm text-gray-400">—</p>
                            )}
                          </div>
                        </div>
                        {/* 展开后说明当前口径的算法 */}
                        {momInfoOpen && (
                          <p className="mt-2.5 pt-2.5 border-t border-gray-200 text-xs text-gray-400 leading-relaxed">
                            {useSame
                              ? t('momInfoSame', { day: extraStats.cutoffDay })
                              : t('momInfoFull')}
                          </p>
                        )}
                      </div>
                    )
                  })()}

                  {/* Day-of-week spending pattern */}
                  <div className="bg-gray-50 rounded-xl p-3">
                    <p className="text-xs text-gray-400 mb-3">
                      {lang === 'zh' ? '各星期支出分布' : 'Spending by Day of Week'}
                    </p>
                    <div className="flex gap-1 items-end" style={{ height: 56 }}>
                      {extraStats.dowExp.map((v, i) => {
                        const maxV = Math.max(...extraStats.dowExp, 0.001)
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div className="w-full rounded-t-sm relative overflow-hidden bg-gray-200"
                              style={{ height: 44 }}>
                              <div
                                className={`absolute bottom-0 w-full rounded-t-sm transition-all ${i === extraStats.maxDow ? 'bg-[#e53935]' : 'bg-gray-300'}`}
                                style={{ height: `${(v / maxV) * 100}%` }}
                              />
                            </div>
                            <span className="text-[9px] text-gray-400 leading-none">
                              {t(weekdayKeys[i]).replace('周', '')}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                    {extraStats.dowExp.some(v => v > 0) && (
                      <p className="text-xs text-gray-500 mt-2 text-center">
                        {lang === 'zh'
                          ? `${t(weekdayKeys[extraStats.maxDow])}支出最多`
                          : `${t(weekdayKeys[extraStats.maxDow])} has the most spending`}
                      </p>
                    )}
                  </div>

                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Transfer ── */}
        {tab === 'transfer' && (
          <div className="space-y-3">
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <MonthNav title={transferTitle} />

              {monthlyLoading ? <Spinner /> : monthlyTransferTxs.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-gray-400 gap-2">
                  <span className="text-3xl">🔄</span>
                  <p className="text-sm">{t('noTransferData')}</p>
                </div>
              ) : (
                <div className="space-y-3">

                  {/* Summary cards — 4 列：转入 / 转出 / 净额 / 笔数 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">{t('transferIn')}</p>
                      <p className="text-sm font-semibold truncate" style={{ color: BLUE }}>
                        +{symbol} {fmt(transferStats.totalIn)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">{t('transferOut')}</p>
                      <p className="text-sm font-semibold truncate text-[#e53935]">
                        -{symbol} {fmt(transferStats.totalOut)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">{t('transferNet')}</p>
                      <p className={`text-sm font-semibold truncate ${transferStats.net >= 0 ? 'text-gray-800' : 'text-[#e53935]'}`}>
                        {transferStats.net >= 0 ? '+' : '-'}{symbol} {fmt(Math.abs(transferStats.net))}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-1">{t('transferCount')}</p>
                      <p className="text-sm font-semibold text-gray-800">
                        {transferStats.count}
                      </p>
                    </div>
                  </div>

                  {/* Month-over-month delta */}
                  {transferStats.delta !== null && (
                    <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                      <span className="text-xs text-gray-400">{t('momLabel')}</span>
                      <span className={`text-sm font-semibold ${transferStats.delta > 0 ? 'text-[#e53935]' : 'text-green-600'}`}>
                        {transferStats.delta > 0 ? '+' : ''}{transferStats.delta.toFixed(1)}%
                      </span>
                    </div>
                  )}

                  {/* Category breakdown — pie + legend */}
                  <div className="pt-2">
                    <p className="text-sm font-semibold text-gray-700 mb-3">{t('transferByCategory')}</p>
                    <div className="h-44 mb-3">
                      <Pie key={`transfer-${lang}-${year}-${month}`} data={transferPieData} options={transferPieOptions} />
                    </div>
                    <div className="space-y-2 pt-2 border-t border-gray-50">
                      {transferStats.byCategory.map((c, i) => {
                        const pct = transferStats.total > 0 ? (c.total / transferStats.total * 100).toFixed(1) : '0'
                        const color = TRANSFER_COLORS[i % TRANSFER_COLORS.length]
                        return (
                          <div key={c.name} className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-sm shrink-0" style={{ background: color }} />
                            <span className="text-sm flex-1 truncate text-gray-700">
                              {c.icon} {c.name}
                            </span>
                            <span className="text-xs text-gray-400 shrink-0 w-10 text-right">{pct}%</span>
                            <span className="text-sm font-medium text-gray-800 shrink-0 w-24 text-right">
                              {symbol} {fmt(c.total)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Daily bar chart */}
                  <div className="pt-2">
                    <p className="text-sm font-semibold text-gray-700 mb-3">{t('transferDaily')}</p>
                    <div className="h-44">
                      <Bar
                        key={`transfer-daily-${lang}-${year}-${month}`}
                        data={transferDailyChartData}
                        options={{ ...barBase, plugins: { ...barBase.plugins, legend: { display: false } } }}
                      />
                    </div>
                  </div>

                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
