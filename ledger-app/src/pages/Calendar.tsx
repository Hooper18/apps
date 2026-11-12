import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useCurrency } from '../contexts/CurrencyContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { CURRENCY_SYMBOLS } from '../types'
import type { Currency, TxDetail } from '../types'
import type { TranslationKey } from '../lib/i18n'
import TransactionSheet from '../components/TransactionSheet'

function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const LS_KEY = 'ledger_display_currency'

/** Returns a flat array of day numbers (null = padding cell) for the month grid */
function buildCalendarDays(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month - 1, 1).getDay()  // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

function pad2(n: number) { return String(n).padStart(2, '0') }

export default function Calendar() {
  const { baseCurrency, rates } = useCurrency()
  const { t } = useLanguage()
  const { transactions: allTxs, loading: txLoading } = useTransactions()
  const { categories } = useCategories()

  const displayCurrency = (localStorage.getItem(LS_KEY) as Currency) ?? 'CNY'

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

  function fmt(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
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
  }

  // ── 数据来自 hooks（全量缓存，月份切换在客户端过滤） ──
  const transactions: TxDetail[] = useMemo(() => {
    const start = `${year}-${pad2(month)}-01`
    const nm = month === 12 ? 1 : month + 1
    const ny = month === 12 ? year + 1 : year
    const end = `${ny}-${pad2(nm)}-01`
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
          categories: c ? { name: c.name, icon: c.icon } : null,
        } as TxDetail
      })
  }, [allTxs, categories, year, month])
  const loading = txLoading

  // ── aggregate by date ──
  type DaySummary = { expense: number; income: number; transfer: number; txList: TxDetail[] }
  const byDate: Record<string, DaySummary> = {}
  for (const tx of transactions) {
    if (!byDate[tx.date]) byDate[tx.date] = { expense: 0, income: 0, transfer: 0, txList: [] }
    const v = convertTx(tx)
    if (tx.type === 'expense')  byDate[tx.date].expense  += v
    if (tx.type === 'income')   byDate[tx.date].income   += v
    if (tx.type === 'transfer') byDate[tx.date].transfer += v
    byDate[tx.date].txList.push(tx)
  }

  const symbol = CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency
  const monthTransferTotal = Object.values(byDate).reduce((s, d) => s + d.transfer, 0)

  // ── selected day sheet ──
  const [selectedDate, setSelectedDate] = useState<string | null>(localDateStr(now))
  const selectedSummary = selectedDate ? byDate[selectedDate] : null

  // ── transaction detail (edit/delete) ──
  const [selectedTx, setSelectedTx] = useState<TxDetail | null>(null)
  function handleDeleted(_id: string) {
    /* useTransactions().remove 已经更新本地状态，TransactionSheet 自己会关 */
  }

  const todayStr = localDateStr(now)
  const calDays  = buildCalendarDays(year, month)
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1

  const calHeaders = [0, 1, 2, 3, 4, 5, 6].map(i => t(`calDay${i}` as TranslationKey))

  return (
    <div className="anim-page flex flex-col h-full bg-gray-50">

      {/* ── Header ── */}
      <div className="shrink-0 px-2.5 pt-safe-2 pb-1">
        <div className="flex items-center justify-between">
          <button onClick={() => changeMonth(-1)} aria-label={t('prevMonth')}
            className="w-11 h-11 flex items-center justify-center group">
            <span className="w-9 h-9 rounded-full bg-white group-active:bg-gray-200 flex items-center justify-center transition-colors">
              <ChevronLeft size={20} className="text-gray-700" />
            </span>
          </button>
          <span className="text-base font-semibold text-gray-900">{t('yearMonthFmt', { year, month })}</span>
          <button onClick={() => changeMonth(1)} disabled={isCurrentMonth} aria-label={t('nextMonth')}
            className="w-11 h-11 flex items-center justify-center group disabled:opacity-30">
            <span className="w-9 h-9 rounded-full bg-white group-active:bg-gray-200 flex items-center justify-center transition-colors">
              <ChevronRight size={20} className="text-gray-700" />
            </span>
          </button>
        </div>
      </div>

      {/* ── Calendar (always visible) ── */}
      <div className="shrink-0 px-4 pt-1 pb-2">
        <div className="bg-white rounded-2xl overflow-hidden px-1.5 pb-1.5">
          {/* Weekday headers */}
          <div className="grid grid-cols-7">
            {calHeaders.map((d, i) => (
              <div key={i} className="pt-3 pb-1.5 text-center text-xs font-medium text-gray-400">
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="grid grid-cols-7">
              {calDays.map((day, idx) => {
                if (!day) return <div key={`empty-${idx}`} className="aspect-square" />

                const dateStr = `${year}-${pad2(month)}-${pad2(day)}`
                const summary = byDate[dateStr]
                const isToday = dateStr === todayStr
                const isSelected = dateStr === selectedDate

                return (
                  <button key={dateStr}
                    onClick={() => setSelectedDate(dateStr)}
                    aria-pressed={isSelected}
                    className={`aspect-square flex flex-col items-center justify-start pt-1 px-0.5 rounded-xl transition-colors ${
                      isSelected ? 'bg-primary/10' : 'active:bg-gray-50'
                    }`}
                  >
                    <span className={`font-num text-sm w-7 h-7 flex items-center justify-center rounded-full ${
                      isToday ? 'bg-primary text-white font-semibold' : 'text-gray-900'
                    }`}>
                      {day}
                    </span>
                    {summary && summary.expense > 0 && (
                      <span className="font-num text-[11px] text-gray-500 leading-tight w-full text-center truncate">
                        {fmt(summary.expense)}
                      </span>
                    )}
                    {summary && summary.income > 0 && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-0.5 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Month summary */}
        {!loading && (
          <div className="mt-3 bg-white rounded-2xl overflow-hidden">
            <div className="grid grid-cols-3 divide-x divide-gray-100">
              {[
                { labelKey: 'expense' as TranslationKey, value: Object.values(byDate).reduce((s, d) => s + d.expense, 0), color: 'text-gray-900' },
                { labelKey: 'income'  as TranslationKey, value: Object.values(byDate).reduce((s, d) => s + d.income,   0), color: 'text-green-600' },
                { labelKey: 'balance' as TranslationKey, value: Object.values(byDate).reduce((s, d) => s + d.income - d.expense, 0), color: 'text-gray-900' },
              ].map(item => (
                <div key={item.labelKey} className="flex flex-col items-center py-3 px-1 min-w-0">
                  <span className="text-xs text-gray-400 mb-0.5">{t(item.labelKey)}</span>
                  <span className={`font-num text-sm font-semibold max-w-full truncate ${item.color}`}>{symbol} {fmt(Math.abs(item.value))}</span>
                </div>
              ))}
            </div>
            {/* Transfer row (only shown if there are transfers; doesn't disturb the 3-col grid above) */}
            {monthTransferTotal > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-400">{t('transfer')}</span>
                <span className="font-num text-xs font-medium text-blue-600">{symbol} {fmt(monthTransferTotal)}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Day detail (scrollable, takes remaining height) ── */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-1 pb-page">
        {selectedDate && (
          <div className="bg-white rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="font-num text-base font-semibold text-gray-900">
                  {new Date(selectedDate + 'T00:00:00').getMonth() + 1}/{new Date(selectedDate + 'T00:00:00').getDate()}
                </span>
                <span className="text-xs text-gray-400">
                  {t(`weekday${new Date(selectedDate + 'T00:00:00').getDay()}` as TranslationKey)}
                </span>
              </div>
              <div className="flex gap-3 flex-wrap justify-end">
                {selectedSummary && selectedSummary.expense > 0 && (
                  <span className="font-num text-xs text-gray-500">{t('expense')} {symbol} {fmt(selectedSummary.expense)}</span>
                )}
                {selectedSummary && selectedSummary.income > 0 && (
                  <span className="font-num text-xs text-green-600">{t('income')} {symbol} {fmt(selectedSummary.income)}</span>
                )}
                {selectedSummary && selectedSummary.transfer > 0 && (
                  <span className="font-num text-xs text-blue-600">{t('transfer')} {symbol} {fmt(selectedSummary.transfer)}</span>
                )}
              </div>
            </div>

            {/* Transaction list */}
            {!selectedSummary || selectedSummary.txList.length === 0 ? (
              <div className="py-8 flex flex-col items-center text-gray-400 gap-1">
                <span className="text-2xl">🗒️</span>
                <p className="text-sm">{t('noRecordsForDay')}</p>
              </div>
            ) : (
              selectedSummary.txList.map(tx => {
                const converted = convertTx(tx)
                const isExpense = tx.type === 'expense'
                const isIncome  = tx.type === 'income'
                const isTransferOut = tx.type === 'transfer' && tx.direction === 'out'
                const showMinus = isExpense || isTransferOut
                const origSymbol = CURRENCY_SYMBOLS[tx.currency as Currency] ?? tx.currency
                return (
                  <button key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="w-full flex items-center px-4 py-3 min-h-[60px] border-b border-gray-100 last:border-0 active:bg-gray-50 text-left transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-xl shrink-0 mr-3">
                      {tx.categories?.icon ?? '📦'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-base text-gray-900 truncate">
                        {tx.categories?.name ?? t('uncategorized')}
                      </p>
                      {tx.description && (
                        <p className="text-[13px] leading-[18px] text-gray-400 truncate">{tx.description}</p>
                      )}
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <p className={`font-num text-base font-semibold ${
                        isExpense ? 'text-gray-900' : isIncome ? 'text-green-600' : 'text-blue-600'
                      }`}>
                        {showMinus ? '-' : '+'}{symbol} {fmt(converted)}
                      </p>
                      {tx.currency !== displayCurrency && (
                        <p className="font-num text-xs text-gray-400">{origSymbol} {fmt(tx.amount)}</p>
                      )}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Transaction detail sheet — edit / delete */}
      {selectedTx && (
        <TransactionSheet
          tx={selectedTx}
          displayCurrency={displayCurrency}
          onClose={() => setSelectedTx(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
