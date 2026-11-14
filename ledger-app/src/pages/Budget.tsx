import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Pencil, Plus, X } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { useBudgets } from '../hooks/useBudgets'
import { CURRENCY_SYMBOLS } from '../types'
import type { Currency } from '../types'

interface CategoryRow {
  id: string
  name: string
  icon: string
}

interface BudgetRow {
  id: string
  category_id: string | null
  amount: number
  currency: string
}

export default function Budget() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { baseCurrency, rates } = useCurrency()
  const { t, lang } = useLanguage()
  const { transactions, loading: txLoading } = useTransactions()
  const { categories: allCategories, loading: catLoading } = useCategories()
  const {
    budgets: allBudgets,
    loading: budgetLoading,
    upsert: upsertBudget,
    remove: removeBudget,
  } = useBudgets()

  const now   = new Date()
  const year  = now.getFullYear()
  const month = now.getMonth() + 1
  const period = 'monthly'

  // 只看 expense 类型的分类，按 name 排序，把外键查询的过滤逻辑搬到客户端
  const categories: CategoryRow[] = useMemo(
    () =>
      allCategories
        .filter((c) => c.type === 'expense')
        .map((c) => ({ id: c.id, name: c.name, icon: c.icon }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [allCategories],
  )

  // 只看当前 period 的 budgets
  const budgets: BudgetRow[] = useMemo(
    () =>
      allBudgets
        .filter((b) => b.period === period)
        .map((b) => ({
          id: b.id,
          category_id: b.category_id,
          amount: b.amount,
          currency: b.currency,
        })),
    [allBudgets],
  )

  // 当月支出按 category 聚合 + 总支出
  const { catSpending, totalSpent } = useMemo(() => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`
    const nm = month === 12 ? 1 : month + 1
    const ny = month === 12 ? year + 1 : year
    const end = `${ny}-${String(nm).padStart(2, '0')}-01`
    let total = 0
    const map = new Map<string, number>()
    for (const tx of transactions) {
      if (tx.type !== 'expense') continue
      if (tx.date < start || tx.date >= end) continue
      const v = tx.exchange_rate != null
        ? tx.amount / tx.exchange_rate
        : convertTo(tx.amount, tx.currency)
      total += v
      map.set(tx.category_id, (map.get(tx.category_id) ?? 0) + v)
    }
    return { catSpending: map, totalSpent: total }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, year, month, baseCurrency, rates])

  const loading = txLoading || catLoading || budgetLoading

  // Edit sheet: null = closed, '' = total budget, UUID = category budget
  const [editing, setEditing]     = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving]       = useState(false)

  const symbol = CURRENCY_SYMBOLS[baseCurrency as Currency] ?? baseCurrency

  // Locale-aware month-year label: "2026年4月" (zh) / "April 2026" (en)
  const monthYearLabel = new Intl.DateTimeFormat(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
  }).format(new Date(year, month - 1))

  function convertTo(amount: number, from: string): number {
    if (from === baseCurrency) return amount
    return (amount / (rates[from] ?? 1)) * (rates[baseCurrency] ?? 1)
  }

  function fmt(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  // category_id: null = total budget, UUID = category budget
  function getBudget(categoryId: string | null): BudgetRow | null {
    return budgets.find(b => b.category_id === categoryId) ?? null
  }

  function openEdit(categoryId: string | null) {
    const b = getBudget(categoryId)
    setEditValue(b ? String(b.amount) : '')
    setEditing(categoryId ?? '') // null → '' (total), UUID → UUID
  }

  async function saveEdit() {
    if (!user || editing === null) return
    const amount = parseFloat(editValue)
    if (isNaN(amount) || amount <= 0) return

    setSaving(true)
    const category_id = editing === '' ? null : editing
    await upsertBudget({
      category_id,
      amount,
      currency: baseCurrency as string,
      period,
    })
    setSaving(false)
    setEditing(null)
  }

  async function deleteBudget() {
    if (editing === null) return
    const category_id = editing === '' ? null : editing
    const b = getBudget(category_id)
    if (!b) return
    await removeBudget(b.id)
    setEditing(null)
  }

  // ── Derived data ──
  const totalBudgetRow = getBudget(null)
  const totalBudgetAmt = totalBudgetRow ? convertTo(totalBudgetRow.amount, totalBudgetRow.currency) : null
  const totalIsOver    = totalBudgetAmt !== null && totalSpent > totalBudgetAmt
  const totalPct       = totalBudgetAmt ? Math.min((totalSpent / totalBudgetAmt) * 100, 100) : 0

  const catRows = categories.map(cat => {
    const b         = getBudget(cat.id)
    const spent     = catSpending.get(cat.id) ?? 0
    const budgetAmt = b ? convertTo(b.amount, b.currency) : null
    const isOver    = budgetAmt !== null && spent > budgetAmt
    const pct       = budgetAmt ? Math.min((spent / budgetAmt) * 100, 100) : 0
    return { id: cat.id, name: cat.name, icon: cat.icon, spent, budgetAmt, isOver, pct }
  })

  const withBudgetOrSpending = catRows.filter(c => c.budgetAmt !== null || c.spent > 0)
  const noBudgetNoSpending   = catRows.filter(c => c.budgetAmt === null  && c.spent === 0)

  // For delete button visibility and sheet title
  const editingCategoryId: string | null = editing === '' ? null : editing
  const editingCatName = editing === ''
    ? t('monthlyTotalBudget')
    : categories.find(c => c.id === editing)?.name ?? t('categoryBudget')

  return (
    <div className="anim-page flex flex-col h-full bg-gray-50">

      {/* Header */}
      <div className="shrink-0 px-2 pt-safe-2 pb-2">
        <button onClick={() => navigate(-1)} aria-label={t('backAriaLabel')}
          className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-200 transition-colors">
          <ChevronLeft size={26} className="text-gray-900" />
        </button>
        <div className="px-3 pt-1">
          <h1 className="text-[28px] leading-[34px] font-bold text-gray-900">{t('budgetTitle')}</h1>
          <p className="text-[13px] leading-[18px] text-gray-500 mt-0.5">{monthYearLabel} · {baseCurrency}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-safe-6">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary" />
          </div>
        ) : (
          <>
            {/* ── Total budget ── */}
            <div className="mx-4 mt-2">
              <p className="text-[13px] leading-[18px] text-gray-500 mb-2 px-4">{t('monthlyTotalBudget')}</p>
              <div className="bg-white rounded-2xl p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className={`font-num text-[28px] leading-[34px] font-bold ${totalIsOver ? 'text-red-600' : 'text-gray-900'}`}>
                      {symbol} {fmt(totalSpent)}
                    </p>
                    <p className="font-num text-[13px] leading-[18px] text-gray-500 mt-0.5">
                      {totalBudgetAmt !== null
                        ? <>{t('budgetLimit')} {symbol} {fmt(totalBudgetAmt)}{totalIsOver && <span className="text-primary font-semibold ml-1.5">{t('overLimit')}</span>}</>
                        : t('noBudgetSet')
                      }
                    </p>
                  </div>
                  <button
                    onClick={() => openEdit(null)}
                    className="hit-44 flex items-center gap-1.5 h-9 px-3.5 bg-gray-50 rounded-full active:bg-gray-200 transition-colors shrink-0"
                  >
                    <Pencil size={13} className="text-gray-600" />
                    <span className="text-[13px] text-gray-900 font-medium">
                      {totalBudgetAmt !== null ? t('edit') : t('set')}
                    </span>
                  </button>
                </div>

                {totalBudgetAmt !== null && (
                  <>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${totalIsOver ? 'bg-red-500' : 'bg-green-500'}`}
                        style={{ width: `${totalPct}%` }}
                      />
                    </div>
                    <div className="font-num flex justify-between text-xs text-gray-500 mt-2">
                      <span>{t('pctUsed', { pct: Math.round(totalPct) })}</span>
                      {totalIsOver
                        ? <span className="text-primary font-medium">{t('over')} {symbol} {fmt(totalSpent - totalBudgetAmt)}</span>
                        : <span>{t('remaining')} {symbol} {fmt(totalBudgetAmt - totalSpent)}</span>
                      }
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Category budgets ── */}
            <div className="mx-4 mt-5">
              <p className="text-[13px] leading-[18px] text-gray-500 mb-2 px-4">{t('categoryBudget')}</p>

              {withBudgetOrSpending.length > 0 ? (
                <div className="bg-white rounded-2xl overflow-hidden mb-4">
                  {withBudgetOrSpending.map((cat, i) => (
                    <div key={cat.id} className={i > 0 ? 'border-t border-gray-100' : ''}>
                      <div className="px-4 py-3.5">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center shrink-0 text-lg">
                            {cat.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-base text-gray-900">{cat.name}</span>
                              <button onClick={() => openEdit(cat.id)} aria-label={t('edit')}
                                className="w-11 h-11 -my-2.5 -mr-3 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors">
                                <Pencil size={15} className="text-gray-400" />
                              </button>
                            </div>
                            <div className="font-num flex items-baseline gap-1 mt-0.5">
                              <span className={`text-sm font-semibold ${cat.isOver ? 'text-red-600' : 'text-gray-900'}`}>
                                {symbol} {fmt(cat.spent)}
                              </span>
                              {cat.budgetAmt !== null && (
                                <span className="text-xs text-gray-400">/ {symbol} {fmt(cat.budgetAmt)}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {cat.budgetAmt !== null && (
                          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${cat.isOver ? 'bg-red-500' : 'bg-green-500'}`}
                              style={{ width: `${cat.pct}%` }}
                            />
                          </div>
                        )}

                        {cat.isOver && (
                          <p className="font-num text-xs text-red-600 mt-1.5 font-medium">
                            ⚠ {t('over')} {symbol} {fmt(cat.spent - cat.budgetAmt!)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-6 text-center mb-4">
                  <p className="text-3xl mb-2">🎯</p>
                  <p className="text-sm text-gray-500">{t('noCategoryBudget')}</p>
                  <p className="text-xs text-gray-400 mt-1">{t('addCategoryBudgetHint')}</p>
                </div>
              )}

              {/* Add budget for unconfigured categories */}
              {noBudgetNoSpending.length > 0 && (
                <>
                  <p className="text-[13px] leading-[18px] text-gray-500 mb-2 px-4">{t('addCategoryBudgetSection')}</p>
                  <div className="bg-white rounded-2xl overflow-hidden">
                    <div className="grid grid-cols-4">
                      {noBudgetNoSpending.map((cat, i) => (
                        <button
                          key={cat.id}
                          onClick={() => openEdit(cat.id)}
                          className={`flex flex-col items-center py-3.5 px-2 active:bg-gray-50 ${
                            i % 4 !== 0 ? 'border-l border-gray-100' : ''
                          } ${i >= 4 ? 'border-t border-gray-100' : ''}`}
                        >
                          <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-lg mb-1 relative">
                            {cat.icon}
                            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-primary flex items-center justify-center ring-2 ring-white">
                              <Plus size={10} strokeWidth={3} className="text-white" />
                            </div>
                          </div>
                          <span className="text-[11px] text-gray-500 text-center leading-tight">{cat.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Edit budget sheet ── */}
      {editing !== null && createPortal(
        <>
          <div className="fixed inset-app bg-black/40 z-40" onClick={() => !saving && setEditing(null)} />
          <div
            className="fixed bottom-app left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl z-50"
            style={{ animation: 'slideUp .22s ease' }}
          >
            <div className="flex justify-center pt-2">
              <div className="w-9 h-[5px] bg-gray-300 rounded-full" />
            </div>

            <div className="flex items-center justify-between pl-5 pr-3 py-2">
              <h2 className="text-base font-semibold text-gray-900">{editingCatName}</h2>
              <button onClick={() => setEditing(null)} aria-label={t('close')}
                className="w-11 h-11 flex items-center justify-center group">
                <span className="w-[30px] h-[30px] rounded-full bg-gray-50 group-active:bg-gray-200 flex items-center justify-center transition-colors">
                  <X size={16} strokeWidth={2.4} className="text-gray-500" />
                </span>
              </button>
            </div>

            <div className="px-4 pt-2 pb-1 space-y-4">
              <div>
                <label className="text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1 block">
                  {t('monthlyLimitLabel', { currency: baseCurrency })}
                </label>
                <div className="flex items-center gap-2 bg-gray-50 rounded-xl px-4 h-14 border border-transparent focus-within:border-primary/40 transition-colors">
                  <span className="font-num text-gray-400 font-medium text-lg">{symbol}</span>
                  <input
                    type="number"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    placeholder="0.00"
                    min="0"
                    step="0.01"
                    className="font-num flex-1 min-w-0 bg-transparent outline-none text-xl font-semibold text-gray-900"
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-3">
                {getBudget(editingCategoryId) && (
                  <button
                    onClick={deleteBudget}
                    disabled={saving}
                    className="px-5 h-[50px] bg-red-50 text-red-600 rounded-xl text-base font-semibold disabled:opacity-50 active:bg-red-100 transition-colors"
                  >
                    {t('delete')}
                  </button>
                )}
                <button
                  onClick={saveEdit}
                  disabled={saving || !editValue || parseFloat(editValue) <= 0}
                  className="flex-1 h-[50px] bg-primary text-white rounded-xl text-base font-semibold disabled:opacity-50 active:bg-primary-dark transition-colors"
                >
                  {saving ? t('saving') : t('save')}
                </button>
              </div>
            </div>

            <div className="pb-safe-4" />
          </div>
          <style>{`@keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
        </>,
        document.body,
      )}
    </div>
  )
}
