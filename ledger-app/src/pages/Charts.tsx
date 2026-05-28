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
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCurrency } from '../contexts/CurrencyContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { CURRENCY_SYMBOLS } from '../types'
import type { Currency, TxDetail } from '../types'
import { getStatsDisplay } from './Settings'

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend)

const RED    = '#e53935'
const GREEN  = '#43a047'
const PIE_COLORS = [
  '#e53935','#e91e63','#9c27b0','#673ab7','#3f51b5',
  '#2196f3','#03a9f4','#00bcd4','#009688','#4caf50',
  '#8bc34a','#cddc39','#ffc107','#ff9800','#ff5722',
  '#795548','#9e9e9e','#607d8b',
]

type Tab = 'overview' | 'daily' | 'category' | 'extra'

const NOW = new Date()

// 恩格尔系数：食品支出占比。识别食品类别用类目名兜底（默认类目）。
const FOOD_CATEGORY_NAMES = new Set(['三餐', '零食', '水果', 'Meals', 'Snacks', 'Fruits'])

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
  const firstVisibleTab = (['overview', 'daily', 'category', 'extra'] as Tab[]).find(k => statsDisplay[k] !== false) ?? 'overview'
  const [tab, setTab] = useState<Tab>(firstVisibleTab)

  // Shared month navigation (daily / category / extra)
  const [year, setYear]   = useState(NOW.getFullYear())
  const [month, setMonth] = useState(NOW.getMonth() + 1)
  const isCurrentMonth = year === NOW.getFullYear() && month === NOW.getMonth() + 1

  function changeMonth(d: number) {
    let m = month + d, y = year
    if (m > 12) { m = 1;  y++ }
    if (m < 1)  { m = 12; y-- }
    setMonth(m); setYear(y)
  }

  const monthYearLabel = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long',
  }).format(new Date(year, month - 1))

  const dailyTitle    = lang === 'zh' ? `${monthYearLabel}${t('tabDaily')}`    : `${t('tabDaily')} · ${monthYearLabel}`
  const categoryTitle = lang === 'zh' ? `${monthYearLabel}${t('tabCategory')}` : `${t('tabCategory')} · ${monthYearLabel}`
  const extraTitle    = lang === 'zh' ? `${monthYearLabel}${t('tabExtra')}`    : `${t('tabExtra')} · ${monthYearLabel}`

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
    const arr = Array.from({ length: days }, (_, i) => ({ day: i + 1, amount: 0 }))
    for (const tx of monthlyTxs) {
      if (tx.type !== catType || tx.category_id !== selectedCatId) continue
      const d = parseInt(tx.date.slice(8, 10))
      arr[d - 1].amount += cvtTx(tx.amount, tx.currency, tx.exchange_rate)
    }
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTxs, selectedCatId, catType])

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

    // 环比上月
    const prevExp = prevMonthTxs.filter(tx => tx.type === 'expense')
      .reduce((s, tx) => s + cvtTx(tx.amount, tx.currency, tx.exchange_rate), 0)
    const prevInc = prevMonthTxs.filter(tx => tx.type === 'income')
      .reduce((s, tx) => s + cvtTx(tx.amount, tx.currency, tx.exchange_rate), 0)
    const expDelta = prevExp > 0 ? ((totalExp - prevExp) / prevExp * 100) : null
    const incDelta = prevInc > 0 ? ((totalInc - prevInc) / prevInc * 100) : null

    return { totalExp, totalInc, avgDailyExp, maxExpTx, maxDow, dowExp, topCat, savingsRate,
             foodExp, engelCoef, prevExp, prevInc, expDelta, incDelta }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthlyTxs, prevMonthTxs, year, month])

  // 恩格尔系数等级（联合国标准）
  function engelTier(coef: number): { label: string; color: string } {
    if (coef < 30) return { label: t('engelTier1'), color: '#43a047' }
    if (coef < 40) return { label: t('engelTier2'), color: '#7cb342' }
    if (coef < 50) return { label: t('engelTier3'), color: '#fdd835' }
    if (coef < 60) return { label: t('engelTier4'), color: '#fb8c00' }
    return { label: t('engelTier5'), color: '#e53935' }
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
    labels: dailyData.map(d => String(d.day)),
    datasets: [{
      label: t('expense'),
      data: dailyData.map(d => d.expense),
      backgroundColor: dailyData.map(d => d.day === selectedDay ? '#b71c1c' : RED),
      borderRadius: 3,
      barPercentage: 0.8,
    }],
  }

  const catDailyChartData = selectedCatEntry ? {
    labels: catDailyData.map(d => String(d.day)),
    datasets: [{
      label: `${selectedCatEntry.icon} ${selectedCatEntry.name}`,
      data: catDailyData.map(d => d.amount),
      backgroundColor: PIE_COLORS[selectedCatIdx % PIE_COLORS.length],
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
                <div className="h-52 mb-2">
                  <Bar
                    key={lang}
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

                {/* Day list — read-only visualization, day selection happens on the bar chart */}
                <div className="space-y-1.5 pt-2 border-t border-gray-50">
                  {(() => {
                    const maxExp = Math.max(...dailyData.map(d => d.expense), 0.001)
                    return dailyData.filter(d => d.expense > 0).map(d => (
                      <div key={d.day}
                        className={`flex items-center gap-2 px-1 py-0.5 rounded-md ${
                          selectedDay === d.day ? 'bg-red-50' : ''
                        }`}>
                        <span className="text-xs text-gray-400 w-7 shrink-0 text-right">
                          {lang === 'zh' ? `${d.day}日` : `${d.day}`}
                        </span>
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-[#e53935] transition-all"
                            style={{ width: `${(d.expense / maxExp) * 100}%` }} />
                        </div>
                        <span className="text-sm font-medium text-gray-700 w-24 text-right shrink-0">
                          {symbol} {fmt(d.expense)}
                        </span>
                      </div>
                    ))
                  })()}
                </div>
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
                  onClick={() => { setCatType(txType); setSelectedCatId(null); setHiddenCatIds(new Set()) }}
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
                <button onClick={() => setSelectedCatId(null)}
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
                    <p className="text-xs text-gray-400">{t('catDailyDetail')}</p>
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
                        options={{ ...barBase, plugins: { ...barBase.plugins, legend: { display: false } } }}
                      />
                    </div>
                    <div className="space-y-1.5 pt-3 border-t border-gray-50">
                      {(() => {
                        const maxAmt = Math.max(...catDailyData.map(d => d.amount), 0.001)
                        return catDailyData.filter(d => d.amount > 0).map(d => (
                          <div key={d.day} className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-7 shrink-0 text-right">
                              {lang === 'zh' ? `${d.day}日` : `${d.day}`}
                            </span>
                            <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(d.amount / maxAmt) * 100}%`,
                                  background: PIE_COLORS[selectedCatIdx % PIE_COLORS.length],
                                }} />
                            </div>
                            <span className="text-sm font-medium text-gray-700 w-24 text-right shrink-0">
                              {symbol} {fmt(d.amount)}
                            </span>
                          </div>
                        ))
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
                          onClick={e => { e.stopPropagation(); setSelectedCatId(d.id) }}
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
                    const tier = engelTier(extraStats.engelCoef)
                    return (
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex items-baseline justify-between mb-1.5">
                          <p className="text-xs text-gray-400">{t('engelCoefLabel')}</p>
                          <p className="text-base font-semibold text-gray-800">
                            {extraStats.engelCoef.toFixed(1)}%
                          </p>
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{ width: `${Math.min(extraStats.engelCoef, 100)}%`, background: tier.color }} />
                          </div>
                          <span className="text-xs font-medium shrink-0" style={{ color: tier.color }}>
                            {tier.label}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{t('engelCoefDesc')}</p>
                      </div>
                    )
                  })()}

                  {/* Month-over-month */}
                  {(extraStats.expDelta !== null || extraStats.incDelta !== null) && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-2">{t('momLabel')}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">{t('momExpense')}</p>
                          {extraStats.expDelta !== null ? (
                            <p className={`text-sm font-semibold ${extraStats.expDelta > 0 ? 'text-[#e53935]' : 'text-green-600'}`}>
                              {extraStats.expDelta > 0 ? '+' : ''}{extraStats.expDelta.toFixed(1)}%
                            </p>
                          ) : (
                            <p className="text-sm text-gray-400">—</p>
                          )}
                        </div>
                        <div>
                          <p className="text-xs text-gray-500 mb-0.5">{t('momIncome')}</p>
                          {extraStats.incDelta !== null ? (
                            <p className={`text-sm font-semibold ${extraStats.incDelta >= 0 ? 'text-green-600' : 'text-[#e53935]'}`}>
                              {extraStats.incDelta > 0 ? '+' : ''}{extraStats.incDelta.toFixed(1)}%
                            </p>
                          ) : (
                            <p className="text-sm text-gray-400">—</p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

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

      </div>
    </div>
  )
}
