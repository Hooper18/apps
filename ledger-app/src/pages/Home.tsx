import { useEffect, useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { useBudgets } from '../hooks/useBudgets'
import { CURRENCY_SYMBOLS, SUPPORTED_CURRENCIES } from '../types'
import type { Currency, TxDetail, TransactionType } from '../types'
import type { TranslationKey } from '../lib/i18n'
import TransactionSheet from '../components/TransactionSheet'
import SwipeRow from '../components/SwipeRow'
import AutoTag from '../components/AutoTag'
import DeleteTxDialog from '../components/DeleteTxDialog'

const DISPLAY_CURRENCIES = SUPPORTED_CURRENCIES
const LS_KEY = 'ledger_display_currency'

interface FilterState {
  keyword: string
  dateFrom: string
  dateTo: string
  types: Set<TransactionType>
  categoryIds: Set<string>
}

const EMPTY_FILTER: FilterState = {
  keyword: '', dateFrom: '', dateTo: '',
  types: new Set(), categoryIds: new Set(),
}

function isFilterActive(f: FilterState) {
  return f.keyword.trim() !== '' || f.dateFrom !== '' || f.dateTo !== '' ||
    f.types.size > 0 || f.categoryIds.size > 0
}

export default function Home() {
const { user } = useAuth()
  const { baseCurrency, rates, ratesLoading } = useCurrency()
  const { t, lang } = useLanguage()
  const navigate = useNavigate()

  const TX_TYPES: { value: TransactionType; label: string }[] = [
    { value: 'expense',  label: t('expense') },
    { value: 'income',   label: t('income') },
    { value: 'transfer', label: t('transfer') },
  ]

  function formatDateLabel(dateStr: string): string {
    const now = new Date()
    const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
    const yest = new Date(now); yest.setDate(now.getDate() - 1)
    const yestStr = `${yest.getFullYear()}-${String(yest.getMonth()+1).padStart(2,'0')}-${String(yest.getDate()).padStart(2,'0')}`
    if (dateStr === todayStr) return t('today')
    if (dateStr === yestStr)  return t('yesterday')
    const d = new Date(dateStr + 'T00:00:00')
    const wd = t(`weekday${d.getDay()}` as TranslationKey)
    if (lang === 'zh') return `${d.getMonth() + 1}月${d.getDate()}日 ${wd}`
    return `${d.getMonth() + 1}/${d.getDate()} ${wd}`
  }

  // ── display currency ──
  const [displayCurrency, setDisplayCurrency] = useState<Currency>(() =>
    (localStorage.getItem(LS_KEY) as Currency) ?? 'CNY'
  )
  const [showPicker, setShowPicker] = useState(false)
  const [pickerPos, setPickerPos] = useState({ top: 0, left: 0 })
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => { localStorage.setItem(LS_KEY, displayCurrency) }, [displayCurrency])

  // Sync to baseCurrency whenever the user updates their preferred currency in Settings
  useEffect(() => { setDisplayCurrency(baseCurrency) }, [baseCurrency])

  function convertTo(amount: number, from: string): number {
    if (from === displayCurrency) return amount
    return (amount / (rates[from] ?? 1)) * (rates[displayCurrency] ?? 1)
  }

  function convertTx(tx: { amount: number; currency: string; exchange_rate?: number | null }): number {
    if (tx.exchange_rate != null) {
      const toBase = tx.amount / tx.exchange_rate
      if (displayCurrency === baseCurrency) return toBase
      return (toBase / (rates[baseCurrency] ?? 1)) * (rates[displayCurrency] ?? 1)
    }
    return convertTo(tx.amount, tx.currency)
  }

  // ── month navigation ──
  const now = new Date()
  const [year, setYear]   = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)

  function changeMonth(delta: number) {
    let m = month + delta, y = year
    if (m > 12) { m = 1;  y++ }
    if (m < 1)  { m = 12; y-- }
    setMonth(m); setYear(y)
    setSwipedId(null)
  }

  // ── 数据来自 hooks（全量缓存，月份切换在客户端过滤） ──
  const { transactions: allTxs, loading: txLoading, remove: removeTx } = useTransactions()
  const { categories } = useCategories()

  // 付款提醒点进来的地址是 /?confirm=<流水 id>：找到那一笔，直接进确认页。
  // 刚入账的那一笔本地可能还没拉到，回到前台时 useSync 会重新同步，拉到后这里再跳。
  const [searchParams, setSearchParams] = useSearchParams()
  const confirmId = searchParams.get('confirm')
  useEffect(() => {
    if (!confirmId) return
    const t = allTxs.find((x) => x.id === confirmId)
    if (!t) return
    const c = categories.find((x) => x.id === t.category_id)
    const tx = {
      id: t.id,
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      description: t.description,
      date: t.date,
      category_id: t.category_id,
      exchange_rate: t.exchange_rate,
      direction: t.direction,
      source: t.source,
      merchant: t.merchant,
      needs_review: t.needs_review,
      categories: c ? { name: c.name, icon: c.icon } : null,
    } as TxDetail
    setSearchParams({}, { replace: true })
    navigate('/add', { state: { tx } })
  }, [confirmId, allTxs, categories, navigate, setSearchParams])

  const transactions: TxDetail[] = useMemo(() => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const nm = month === 12 ? 1 : month + 1
    const ny = month === 12 ? year + 1 : year
    const end = `${ny}-${String(nm).padStart(2, '0')}-01`
    const catMap = new Map(categories.map((c) => [c.id, c]))
    return allTxs
      .filter((t) => t.date >= start && t.date < end)
      .map((t) => {
        const c = catMap.get(t.category_id)
        return {
          id: t.id,
          type: t.type,
          amount: t.amount,
          currency: t.currency,
          description: t.description,
          date: t.date,
          category_id: t.category_id,
          exchange_rate: t.exchange_rate,
          direction: t.direction,
          source: t.source,
          merchant: t.merchant,
          needs_review: t.needs_review,
          categories: c ? { name: c.name, icon: c.icon } : null,
        } as TxDetail
      })
  }, [allTxs, categories, year, month])

  const loading = txLoading

  // ── selected transaction sheet ──
  const [selectedTx, setSelectedTx] = useState<TxDetail | null>(null)

  // ── 左滑操作 ──
  // 同一时间只滑开一行；滚动列表、切月份时收回。
  const [swipedId, setSwipedId] = useState<string | null>(null)
  // 左滑点了「删除」、正在等确认的那一条
  const [deletingTx, setDeletingTx] = useState<TxDetail | null>(null)

  // hook 删除已经更新了全局 state，这里保留 noop 让 TransactionSheet 接口不变。
  function handleDeleted(_id: string) {
    /* useTransactions().remove 已经更新本地状态，无需再处理 */
  }

  // ── totals (always full month, unaffected by filter) ──
  const { expenseTotal, incomeTotal, transferTotal } = transactions.reduce(
    (acc, tx) => {
      const v = convertTx(tx)
      if (tx.type === 'expense')  acc.expenseTotal  += v
      if (tx.type === 'income')   acc.incomeTotal   += v
      if (tx.type === 'transfer') acc.transferTotal += v
      return acc
    },
    { expenseTotal: 0, incomeTotal: 0, transferTotal: 0 },
  )
  const balance = incomeTotal - expenseTotal
  const symbol  = CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency

  function fmt(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // ── total budget (for home bar) ──
  // period 跟 Budget.tsx 对齐：写入和查询都用 'monthly'。
  const { budgets: allBudgets } = useBudgets()
  const totalBudget = useMemo(() => {
    const b = allBudgets.find(
      (x) => x.period === 'monthly' && x.category_id === null,
    )
    return b ? { amount: b.amount, currency: b.currency } : null
  }, [allBudgets])

  // ── search & filter state ──
  const [keyword, setKeyword]       = useState('')
  const [showFilter, setShowFilter] = useState(false)

  // draft filter (edited inside panel, applied on confirm)
  const [draft, setDraft] = useState<FilterState>({ ...EMPTY_FILTER })
  // applied filter (drives the list)
  const [applied, setApplied] = useState<FilterState>({ ...EMPTY_FILTER })

  const active = isFilterActive(applied) || keyword.trim() !== ''

  function openFilter() {
    setDraft({ ...applied })
    setShowFilter(true)
  }

  function confirmFilter() {
    setApplied({ ...draft })
    setShowFilter(false)
  }

  function resetFilter() {
    const empty = { ...EMPTY_FILTER, types: new Set<TransactionType>(), categoryIds: new Set<string>() }
    setDraft(empty)
    setApplied(empty)
    setKeyword('')
    setShowFilter(false)
  }

  function toggleDraftType(type: TransactionType) {
    setDraft(prev => {
      const s = new Set(prev.types)
      s.has(type) ? s.delete(type) : s.add(type)
      return { ...prev, types: s }
    })
  }

  function toggleDraftCat(id: string) {
    setDraft(prev => {
      const s = new Set(prev.categoryIds)
      s.has(id) ? s.delete(id) : s.add(id)
      return { ...prev, categoryIds: s }
    })
  }

  // unique categories from current month's transactions (for filter panel)
  const uniqueCats = useMemo(() => {
    const map = new Map<string, { id: string; name: string; icon: string }>()
    for (const tx of transactions) {
      if (!map.has(tx.category_id) && tx.categories) {
        map.set(tx.category_id, { id: tx.category_id, name: tx.categories.name, icon: tx.categories.icon })
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [transactions])

  // ── filtered transactions ──
  const filtered = useMemo(() => {
    const kw = keyword.trim().toLowerCase()
    return transactions.filter(tx => {
      if (kw && !(tx.description ?? '').toLowerCase().includes(kw)) return false
      if (applied.dateFrom && tx.date < applied.dateFrom) return false
      if (applied.dateTo   && tx.date > applied.dateTo)   return false
      if (applied.types.size > 0 && !applied.types.has(tx.type as TransactionType)) return false
      if (applied.categoryIds.size > 0 && !applied.categoryIds.has(tx.category_id)) return false
      return true
    })
  }, [transactions, keyword, applied])

  // ── group by date ──
  const grouped: Record<string, TxDetail[]> = {}
  for (const tx of filtered) {
    if (!grouped[tx.date]) grouped[tx.date] = []
    grouped[tx.date].push(tx)
  }
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  const txCountLabel = t('txCountSuffix') ? `${filtered.length} ${t('txCountSuffix')}` : String(filtered.length)

  return (
    <div className="anim-page flex flex-col h-full bg-white">

      {/* ── Header ──
          照片铺到状态栏 / 灵动岛后面（HIG：全屏背景要延伸到边缘），
          文字和按钮用 pt-safe 让到安全区以内。 */}
      <div className="shrink-0 text-white px-5 pt-safe pb-10 relative overflow-hidden"
        style={{
          backgroundImage: "linear-gradient(rgba(0,0,0,0.25), rgba(0,0,0,0.35)), url('/images/header-bg.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
        }}>

        <div className="flex items-center justify-between mb-1.5 -mx-1.5">
          <button onClick={() => changeMonth(-1)} aria-label={t('prevMonth')}
            className="w-11 h-11 flex items-center justify-center group">
            <span className="glass-clear w-9 h-9 rounded-full flex items-center justify-center group-active:bg-white/35 transition-colors">
              <ChevronLeft size={20} />
            </span>
          </button>
          <span className="text-base font-semibold">{t('yearMonthFmt', { year, month })}</span>
          <button onClick={() => changeMonth(1)} disabled={isCurrentMonth} aria-label={t('nextMonth')}
            className="w-11 h-11 flex items-center justify-center group disabled:opacity-30">
            <span className="glass-clear w-9 h-9 rounded-full flex items-center justify-center group-active:bg-white/35 transition-colors">
              <ChevronRight size={20} />
            </span>
          </button>
        </div>

        <p className="text-[13px] leading-[18px] text-white/80 mb-1">{t('monthlyExpense')}</p>

        <div className="flex items-center gap-2.5 mb-4">
          <div className="relative" ref={pickerRef}>
            <button
              onClick={() => {
                if (!showPicker && pickerRef.current) {
                  const r = pickerRef.current.getBoundingClientRect()
                  setPickerPos({ top: r.bottom + 6, left: r.left })
                }
                setShowPicker(v => !v)
              }}
              className="hit-44 glass-clear flex items-center gap-0.5 h-8 rounded-full pl-3 pr-2 active:bg-white/35 transition-colors">
              <span className="text-sm font-semibold">{displayCurrency}</span>
              <ChevronDown size={14} className={`transition-transform ${showPicker ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <span className="font-num text-[40px] leading-[44px] font-bold tracking-tight min-w-0 truncate">
            {ratesLoading ? '…' : fmt(expenseTotal)}
          </span>
        </div>

        <div className="flex gap-6">
          <div className="min-w-0">
            <p className="text-[13px] leading-[18px] text-white/80 mb-0.5">{t('income')}</p>
            <p className="font-num text-base font-semibold truncate">{symbol} {fmt(incomeTotal)}</p>
          </div>
          <div className="w-px bg-white/25" />
          <div className="min-w-0">
            <p className="text-[13px] leading-[18px] text-white/80 mb-0.5">{t('balance')}</p>
            <p className={`font-num text-base font-semibold truncate ${balance < 0 ? 'text-white/70' : ''}`}>
              {symbol} {fmt(balance)}
            </p>
          </div>
        </div>

        {/* Transfer summary — only when present, kept subtle and outside the main 3-column layout */}
        {transferTotal > 0 && (
          <div className="mt-2.5 flex items-baseline gap-2 text-[13px] leading-[18px] text-white/80">
            <span>{t('transfer')}</span>
            <span className="font-num font-medium text-white">{symbol} {fmt(transferTotal)}</span>
          </div>
        )}

        {/* Budget bar */}
        {totalBudget && !ratesLoading && (() => {
          const budgetAmt = convertTo(totalBudget.amount, totalBudget.currency)
          const pct = Math.min((expenseTotal / budgetAmt) * 100, 100)
          const isOver = expenseTotal > budgetAmt
          return (
            <div className="mt-3 pt-3 border-t border-white/25">
              <div className="flex justify-between text-[13px] leading-[18px] text-white/80 mb-2">
                <span>{t('monthlyBudget')}</span>
                <span className={isOver ? 'text-white font-semibold' : ''}>
                  {isOver ? t('overBudget') : t('budgetPctUsed', { pct: Math.round(pct) })}
                </span>
              </div>
              <div className="h-1.5 bg-white/25 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${isOver ? 'bg-white' : 'bg-white/90'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── Transaction list ──
          白色面板盖在照片上、一直铺到屏幕底；标签栏浮在它上面，
          列表用 pb-page 让出位置，最后一行能滚到标签栏上方。 */}
      <div className="relative z-10 flex-1 min-h-0 -mt-6 bg-white rounded-t-3xl overflow-hidden flex flex-col">

        {/* List header */}
        <div className="flex items-baseline justify-between px-5 pt-4 pb-2 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{t('billDetail')}</h2>
          <span className="text-[13px] leading-[18px] text-gray-400">{txCountLabel}</span>
        </div>

        {/* ── Search bar ── */}
        <div className="flex items-center gap-2 px-4 pb-2 shrink-0">
          <div className="flex-1 min-w-0 flex items-center gap-2 bg-gray-50 rounded-full h-10 px-3.5">
            <Search size={16} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              placeholder={t('searchPlaceholder')}
              className="flex-1 min-w-0 text-base bg-transparent outline-none text-gray-900 placeholder:text-gray-400"
            />
            {keyword && (
              <button onClick={() => setKeyword('')} aria-label={t('clearFilter')}
                className="shrink-0 w-7 h-7 -mr-1.5 flex items-center justify-center">
                <span className="w-[18px] h-[18px] rounded-full bg-gray-300 flex items-center justify-center">
                  <X size={11} strokeWidth={3} className="text-white" />
                </span>
              </button>
            )}
          </div>
          {/* Filter button */}
          <button
            onClick={openFilter}
            aria-label={t('filterTitle')}
            className={`hit-44 w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              active ? 'bg-primary text-white' : 'bg-gray-50 text-gray-600 active:bg-gray-100'
            }`}
          >
            <SlidersHorizontal size={17} />
            {isFilterActive(applied) && (
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-primary rounded-full border-2 border-white" />
            )}
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pb-page"
          onScroll={() => { if (swipedId !== null) setSwipedId(null) }}>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <span className="text-4xl mb-3">{transactions.length === 0 ? '📋' : '🔍'}</span>
              <p className="text-sm">{transactions.length === 0 ? t('noRecords') : t('noFilterResults')}</p>
              {transactions.length === 0
                ? <p className="text-xs mt-1">{t('noRecordsHint')}</p>
                : <button onClick={resetFilter} className="text-sm mt-3 px-3 py-2 text-primary font-medium">{t('clearFilter')}</button>
              }
            </div>
          ) : (
            sortedDates.map(date => {
              const dayTxs = grouped[date]
              const dayExpense = dayTxs
                .filter(tx => tx.type === 'expense')
                .reduce((s, tx) => s + convertTo(tx.amount, tx.currency), 0)

              return (
                <div key={date}>
                  <div className="sticky top-0 z-[1] flex justify-between items-baseline px-5 pt-3 pb-1.5 bg-white/95">
                    <span className="text-[13px] leading-[18px] font-medium text-gray-500">{formatDateLabel(date)}</span>
                    {dayExpense > 0 && (
                      <span className="font-num text-[13px] leading-[18px] text-gray-400">{symbol} {fmt(dayExpense)}</span>
                    )}
                  </div>

                  {dayTxs.map((tx, idx) => {
                    const converted = convertTo(tx.amount, tx.currency)
                    const isExpense = tx.type === 'expense'
                    const isIncome  = tx.type === 'income'
                    const isTransferOut = tx.type === 'transfer' && tx.direction === 'out'
                    const origSymbol = CURRENCY_SYMBOLS[tx.currency as Currency] ?? tx.currency
                    // 减号：支出 / 转账"转出"；加号：收入 / 转账"转入"（含老数据 direction=null）
                    const showMinus = isExpense || isTransferOut
                    const isLast = idx === dayTxs.length - 1

                    return (
                      // 左滑露出「编辑 / 删除」（iOS 列表的 swipe actions）；轻点仍然打开详情
                      <SwipeRow key={tx.id}
                        open={swipedId === tx.id}
                        onOpenChange={(o) => setSwipedId((cur) => (o ? tx.id : cur === tx.id ? null : cur))}
                        actions={[
                          { key: 'edit', label: t('edit'), tone: 'neutral', onClick: () => navigate('/add', { state: { tx } }) },
                          { key: 'delete', label: t('delete'), tone: 'danger', onClick: () => setDeletingTx(tx) },
                        ]}>
                      <button
                        onClick={() => setSelectedTx(tx)}
                        className="w-full flex items-center pl-5 active:bg-gray-50 text-left transition-colors">
                        <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-xl shrink-0 mr-3">
                          {tx.categories?.icon ?? '📦'}
                        </div>
                        {/* 分隔线从文字开始（iOS 列表的 inset separator），每组最后一行不画 */}
                        <div className={`flex-1 min-w-0 flex items-center py-3 pr-5 min-h-[60px] ${isLast ? '' : 'border-b border-gray-100'}`}>
                          <div className="flex-1 min-w-0">
                            <p className="flex items-center gap-1.5 min-w-0">
                              <span className="text-base text-gray-900 truncate">{tx.categories?.name ?? t('uncategorized')}</span>
                              <AutoTag tx={tx} />
                            </p>
                            {tx.description && (
                              <p className="text-[13px] leading-[18px] text-gray-400 truncate">{tx.description}</p>
                            )}
                          </div>
                          <div className="text-right ml-3 shrink-0">
                            {/* 支出用正文色，只有收入（绿）和转账（蓝）上色 ——
                                红色留给强调色和"超支"这类警示，不再同时表示"支出"。 */}
                            <p className={`font-num text-base font-semibold ${
                              isExpense ? 'text-gray-900' : isIncome ? 'text-green-600' : 'text-blue-600'
                            }`}>
                              {showMinus ? '-' : '+'}{symbol} {fmt(converted)}
                            </p>
                            {tx.currency !== displayCurrency && (
                              <p className="font-num text-xs text-gray-400">{origSymbol} {fmt(tx.amount)}</p>
                            )}
                          </div>
                        </div>
                      </button>
                      </SwipeRow>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>

      </div>

      {/* Transaction detail sheet */}
      {selectedTx && (
        <TransactionSheet
          tx={selectedTx}
          displayCurrency={displayCurrency}
          onClose={() => setSelectedTx(null)}
          onDeleted={handleDeleted}
          onRemove={removeTx}
        />
      )}

      {/* 左滑「删除」的确认框 */}
      {deletingTx && (
        <DeleteTxDialog
          onConfirm={() => removeTx(deletingTx.id)}
          onCancel={() => setDeletingTx(null)}
          onDone={() => setDeletingTx(null)}
        />
      )}

      {/* ── Currency picker portal ── */}
      {showPicker && createPortal(
        <>
          <div className="fixed inset-app z-40" onClick={() => setShowPicker(false)} />
          <div className="anim-rise-fade fixed z-50 bg-white rounded-xl shadow-glass min-w-[128px] py-1"
            style={{ top: pickerPos.top, left: pickerPos.left, maxHeight: '60vh', overflowY: 'auto' }}>
            {DISPLAY_CURRENCIES.map(c => (
              <button key={c} onClick={() => { setDisplayCurrency(c); setShowPicker(false) }}
                className={`w-full flex items-center gap-2 px-4 h-11 text-left text-base active:bg-gray-50 transition-colors ${
                  c === displayCurrency ? 'text-primary font-semibold' : 'text-gray-900'
                }`}>
                <span className="w-7 text-gray-400">{CURRENCY_SYMBOLS[c]}</span>
                <span>{c}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}

      {/* ── Filter panel (bottom sheet via portal) ── */}
      {showFilter && createPortal(
        <>
          <div className="anim-fade-in fixed inset-app bg-black/40 z-40" onClick={() => setShowFilter(false)} />
          <div className="anim-slide-up fixed bottom-app left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl z-50 flex flex-col max-h-[85vh]">
            {/* Handle */}
            <div className="flex justify-center pt-2 shrink-0">
              <div className="w-9 h-[5px] bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between pl-5 pr-3 py-2 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">{t('filterTitle')}</h2>
              <button onClick={() => setShowFilter(false)} aria-label={t('close')}
                className="w-11 h-11 flex items-center justify-center group">
                <span className="w-[30px] h-[30px] rounded-full bg-gray-50 group-active:bg-gray-200 flex items-center justify-center transition-colors">
                  <X size={16} strokeWidth={2.4} className="text-gray-500" />
                </span>
              </button>
            </div>

            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-5 pt-2 pb-4 space-y-6">

              {/* Date range */}
              <div>
                <p className="text-[13px] leading-[18px] font-medium text-gray-500 mb-2">{t('filterDateRange')}</p>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={draft.dateFrom}
                    max={draft.dateTo || undefined}
                    onChange={e => setDraft(p => ({ ...p, dateFrom: e.target.value }))}
                    className="flex-1 min-w-0 px-3 h-11 bg-gray-50 border border-transparent rounded-xl text-base outline-none focus:border-primary/40 transition-colors"
                  />
                  <span className="text-gray-400 text-sm shrink-0">{t('filterTo')}</span>
                  <input
                    type="date"
                    value={draft.dateTo}
                    min={draft.dateFrom || undefined}
                    onChange={e => setDraft(p => ({ ...p, dateTo: e.target.value }))}
                    className="flex-1 min-w-0 px-3 h-11 bg-gray-50 border border-transparent rounded-xl text-base outline-none focus:border-primary/40 transition-colors"
                  />
                </div>
              </div>

              {/* Type */}
              <div>
                <p className="text-[13px] leading-[18px] font-medium text-gray-500 mb-2">{t('filterType')}</p>
                <div className="flex gap-2">
                  {TX_TYPES.map(({ value, label }) => {
                    const on = draft.types.has(value)
                    return (
                      <button key={value} onClick={() => toggleDraftType(value)}
                        className={`flex-1 h-11 rounded-xl text-sm font-medium transition-colors ${
                          on ? 'bg-primary text-white' : 'bg-gray-50 text-gray-700 active:bg-gray-100'
                        }`}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Category */}
              {uniqueCats.length > 0 && (
                <div>
                  <p className="text-[13px] leading-[18px] font-medium text-gray-500 mb-2">{t('filterCategory')}</p>
                  <div className="grid grid-cols-5 gap-1">
                    {uniqueCats.map(cat => {
                      const on = draft.categoryIds.has(cat.id)
                      return (
                        <button key={cat.id} onClick={() => toggleDraftCat(cat.id)}
                          className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl">
                          <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg transition-colors ${
                            on ? 'bg-primary/10 ring-2 ring-primary' : 'bg-gray-50'
                          }`}>
                            {cat.icon}
                          </div>
                          <span className={`text-[11px] leading-tight text-center break-all ${
                            on ? 'text-primary font-semibold' : 'text-gray-500'
                          }`}>
                            {cat.name}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="shrink-0 px-5 pt-3 pb-safe-4 flex gap-3">
              <button onClick={resetFilter}
                className="flex-1 h-[50px] bg-gray-50 text-gray-900 rounded-xl text-base font-semibold active:bg-gray-200 transition-colors">
                {t('filterReset')}
              </button>
              <button onClick={confirmFilter}
                className="flex-1 h-[50px] bg-primary text-white rounded-xl text-base font-semibold active:bg-primary-dark transition-colors">
                {t('filterConfirm')}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}
