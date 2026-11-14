import { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useLocation } from 'react-router-dom'
import { X, ChevronDown } from 'lucide-react'
import Segmented from '../components/Segmented'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useTransactions } from '../hooks/useTransactions'
import { useCategories } from '../hooks/useCategories'
import { useCategorySort } from '../hooks/useCategorySort'
import type { TransactionType, Currency, TxDetail } from '../types'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TRANSFER_CATEGORIES,
  CATEGORY_ICONS,
  SUPPORTED_CURRENCIES,
  CURRENCY_SYMBOLS,
} from '../types'

interface Category { id: string; name: string; type: string; icon: string }

function localDateStr(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}


function buildFallback(type: TransactionType): Category[] {
  const names =
    type === 'expense' ? EXPENSE_CATEGORIES :
    type === 'income'  ? INCOME_CATEGORIES  : TRANSFER_CATEGORIES
  return names.map((name, i) => ({ id: String(i), name, type, icon: CATEGORY_ICONS[name] ?? '📦' }))
}

export default function AddTransaction() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { effectiveDefaultCurrency, baseCurrency, rates, recordLastUsedCurrency } = useCurrency()
  const { t } = useLanguage()
  const { transactions, insert: insertTx, update: updateTx } = useTransactions()
  const { categories: allCats, seedDefaults: seedCategories } = useCategories()
  const { applySort } = useCategorySort()

  // Edit mode: location.state.tx is set when navigating from TransactionSheet
  const editTx = (location.state as { tx?: TxDetail } | null)?.tx

  const [type, setType]         = useState<TransactionType>((editTx?.type as TransactionType) ?? 'expense')
  const [amount, setAmount]     = useState(editTx ? String(editTx.amount) : '0')
  const [selectedCategory, setSelected] = useState(editTx?.category_id ?? '')
  const [date, setDate]         = useState(editTx?.date ?? localDateStr())
  const [note, setNote]         = useState(editTx?.description ?? '')
  const [currency, setCurrency] = useState<Currency>((editTx?.currency as Currency) ?? effectiveDefaultCurrency)
  // 转账方向：'in'=转入加钱(+), 'out'=转出扣钱(-)。仅 type='transfer' 时有意义。
  // 编辑模式：从 editTx.direction 拿，旧数据 null 视为 'in'（兼容 + 行为）。
  const [transferDir, setTransferDir] = useState<'in' | 'out'>(
    (editTx?.direction as 'in' | 'out') ?? 'in',
  )
  const [submitting, setSubmitting] = useState(false)
  const [showCurrencyPicker, setShowCPicker] = useState(false)
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({})
  const currencyBtnRef = useRef<HTMLButtonElement>(null)
  const [toast, setToast] = useState('')

  function openCurrencyPicker() {
    const rect = currencyBtnRef.current?.getBoundingClientRect()
    if (rect) {
      // 锁死宽度（88px），避免某些 WebView 下 shrink-to-fit 异常拉宽。
      // 用 right/bottom 让下拉框右对齐按钮、向上弹出。
      // 向上弹出用 top + translateY(-100%) 定位，不用 window.innerHeight 算 bottom：
      // iPhone 主屏幕模式下 innerHeight 会比屏幕矮一截（见 lib/viewport.ts），算出来会偏。
      setPickerStyle({
        position: 'fixed',
        right: Math.max(window.innerWidth - rect.right, 8),
        top: rect.top - 6,
        transform: 'translateY(-100%)',
        width: 96,
      })
    }
    setShowCPicker(true)
  }

  // Date quick-select
  function dateOffset(offset: number) {
    const d = new Date(); d.setDate(d.getDate() + offset)
    return localDateStr(d)
  }
  const today = dateOffset(0)
  const yesterday = dateOffset(-1)
  const dayBefore = dateOffset(-2)

  type DateMode = 'today' | 'yesterday' | 'dayBefore' | 'other'
  function initDateMode(): DateMode {
    if (!editTx) return 'today'
    if (editTx.date === today)     return 'today'
    if (editTx.date === yesterday) return 'yesterday'
    if (editTx.date === dayBefore) return 'dayBefore'
    return 'other'
  }
  const [dateMode, setDateMode] = useState<DateMode>(initDateMode)

  const TYPE_CONFIG = {
    expense:  { label: t('expense')  },
    income:   { label: t('income')   },
    transfer: { label: t('transfer') },
  }

  // "最近使用优先"模式的 lastUsedAt 直接从 transactions 派生：每个
  // category_id 取它出现过的所有 tx 里最大的 created_at。这样老用户的
  // 历史交易也算数，不依赖任何手动 record 调用 —— transactions 已经是
  // 事实来源，不重复维护一份。tx insert 会立刻把行加进 transactions
  // 数组（乐观更新），所以保存完一笔后下次进来即生效。
  const lastUsedAt = useMemo<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    for (const tx of transactions) {
      if (!tx.category_id) continue
      const ts = tx.created_at ?? tx.date
      if (!ts) continue
      if (!m[tx.category_id] || m[tx.category_id] < ts) {
        m[tx.category_id] = ts
      }
    }
    return m
  }, [transactions])

  // 分类直接从 useCategories 拿到的 localStorage 快照过滤而来，免去
  // 进页时的 supabase 网络往返。useCategories 已在后台自己拉远端数据，
  // 更新后这里 useMemo 自动重算。
  // 顺序由 useCategorySort 决定：自定义模式按用户在 /category-order 里
  // 调好的顺序；最近使用模式按上面派生的 lastUsedAt 倒序。
  const categories = useMemo<Category[]>(() => {
    const filtered = allCats.filter((c) => c.type === type)
    const base: Category[] =
      filtered.length === 0
        ? buildFallback(type)
        : filtered.map((c) => ({ id: c.id, name: c.name, type: c.type, icon: c.icon }))
    return applySort(base, type, lastUsedAt)
  }, [allCats, type, applySort, lastUsedAt])

  // ─── Numpad ──────────────────────────────────────────────────────────────

  function numPress(key: string) {
    setAmount(prev => {
      if (key === '.') return prev.includes('.') ? prev : prev + '.'
      const dotIdx = prev.indexOf('.')
      if (dotIdx !== -1 && prev.length - dotIdx > 2) return prev
      if (prev === '0') return key === '00' ? '0' : key
      return prev + key
    })
  }

  function numDel() {
    setAmount(prev => (prev.length <= 1 ? '0' : prev.slice(0, -1)))
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }

  async function handleSave(continueAdding: boolean) {
    if (!user) return
    if (!amount || parseFloat(amount) === 0) { showToast(t('amountRequired')); return }
    if (!selectedCategory)                    { showToast(t('categoryRequired')); return }

    setSubmitting(true)

    // 兜底分类 id 是 buildFallback 给的 '0'/'1'/'2'... 数字串，DB 里 category_id
    // 是 UUID 列，直推会被 PG 拒（22P02）。这里检测：如果选中的不是真实
    // UUID（即 allCats 里找不到），先把默认分类一次性 seed 到 DB（前端 UUID
    // + outbox FIFO，离线也能记），再按 name + type 匹配到真实 id 替换。
    let categoryId = selectedCategory
    const selectedIsReal = allCats.some((c) => c.id === selectedCategory)
    if (!selectedIsReal) {
      const selectedCat = categories.find((c) => c.id === selectedCategory)
      if (selectedCat) {
        const seeded = await seedCategories()
        const real = seeded.find((c) => c.name === selectedCat.name && c.type === type)
        if (real) categoryId = real.id
      }
    }

    const exchange_rate = currency !== baseCurrency
      ? (rates[currency] ?? 1) / (rates[baseCurrency] ?? 1)
      : null

    const payload = {
      type, amount: parseFloat(amount), currency,
      category_id: categoryId,
      description: note.trim() || null, date,
      exchange_rate,
      // 仅 transfer 写 direction，其它类型一律 null（useTransactions 也会再兜底一次）
      direction: type === 'transfer' ? transferDir : null,
    }

    // 写操作走本地 outbox：UI 立刻更新，背景同步到 Supabase。离线时
    // 同样能记账，恢复网络后队列自动 push。所以这里没有真正的"网络
    // 错误"路径 —— insert/update 总是 resolve。
    if (editTx) {
      await updateTx(editTx.id, payload)
    } else {
      await insertTx(payload)
    }

    recordLastUsedCurrency(currency)
    // 类目"最近使用"由 useTransactions 的 transactions 数组派生，无需单独记录。

    setSubmitting(false)

    if (editTx) {
      navigate(-1)   // return to wherever edit was triggered from
    } else if (continueAdding) {
      setAmount('0'); setNote(''); setSelected('')
      showToast(t('savedContinue'))
    } else {
      navigate('/')
    }
  }

  const symbol = CURRENCY_SYMBOLS[currency] ?? currency

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="anim-page flex flex-col h-full bg-white">

      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-2 pt-safe-2 pb-1">
        <button onClick={() => navigate(-1)} aria-label={t('close')}
          className="w-11 h-11 flex items-center justify-center group">
          <span className="w-[30px] h-[30px] rounded-full bg-gray-50 group-active:bg-gray-200 flex items-center justify-center transition-colors">
            <X size={16} strokeWidth={2.4} className="text-gray-500" />
          </span>
        </button>
        <h1 className="text-base font-semibold text-gray-900">{editTx ? t('editTx') : t('addTx')}</h1>
        <div className="w-11" />
      </div>

      {/* Type tabs */}
      <div className="shrink-0 px-4 pt-1 pb-2">
        <Segmented
          options={(Object.keys(TYPE_CONFIG) as TransactionType[]).map(tp => ({ value: tp, label: TYPE_CONFIG[tp].label }))}
          value={type}
          onChange={tp => { setType(tp); setSelected('') }}
        />
      </div>

      {/* Transfer direction sub-row — only when type=transfer */}
      {type === 'transfer' && (
        <div className="shrink-0 flex items-center justify-center gap-2 px-4 pb-2">
          {([
            { v: 'in'  as const, label: t('transferIn'),  prefix: '+' },
            { v: 'out' as const, label: t('transferOut'), prefix: '−' },
          ]).map(({ v, label, prefix }) => (
            <button key={v}
              type="button"
              onClick={() => setTransferDir(v)}
              className={`hit-44 flex-1 max-w-[160px] h-8 rounded-full text-[13px] font-medium transition-colors ${
                transferDir === v
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-50 text-gray-600 active:bg-gray-100'
              }`}
            >
              {prefix} {label}
            </button>
          ))}
        </div>
      )}

      {/* Content area — no outer scroll */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">

        {/* Category grid — 吃掉头部和键盘之间所有剩余高度、内部滚动。
            以前是写死的 max-h：矮屏上会把下面的日期行挤出去，高屏（iPhone Pro Max
            956pt）上又在中间空出一大块。现在类目区自适应，备注 / 日期 / 金额 / 键盘
            始终贴在屏幕下半部，拇指够得着。 */}
        <div className="relative flex-1 min-h-[84px]">
          <div className="grid grid-cols-5 content-start gap-1 px-3 pt-1 pb-3 h-full overflow-y-auto no-scrollbar">
          {categories.map(cat => (
            <button key={cat.id} onClick={() => setSelected(cat.id)}
              aria-pressed={selectedCategory === cat.id}
              className="flex flex-col items-center gap-1 py-1.5 px-1 rounded-xl transition-transform active:scale-[0.96]"
            >
              {/* 选中态用强调色描边 + 淡底，不再用蓝色：全 App 只有一个"选中 / 可点"的颜色 */}
              <div className={`w-11 h-11 rounded-full flex items-center justify-center text-xl transition-colors duration-150 ${
                selectedCategory === cat.id ? 'bg-primary/10 ring-2 ring-primary' : 'bg-gray-50'
              }`}>
                {cat.icon}
              </div>
              <span className={`text-[11px] leading-tight text-center break-all ${
                selectedCategory === cat.id ? 'text-primary font-semibold' : 'text-gray-500'
              }`}>
                {cat.name}
              </span>
            </button>
          ))}
          </div>
          {/* Bottom fade — hints more rows below */}
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-white to-transparent pointer-events-none" />
        </div>

        {/* Note */}
        <div className="shrink-0 px-4 mb-2">
          <input type="text" value={note} onChange={e => setNote(e.target.value)}
            placeholder={t('notePlaceholder')} maxLength={50}
            className="w-full px-4 h-11 bg-gray-50 border border-transparent rounded-xl text-base text-gray-900 placeholder:text-gray-400 outline-none focus:border-primary/40 transition-colors"
          />
        </div>

        {/* Date + Currency */}
        <div className="px-4 pb-3 shrink-0">
          {/* Quick date buttons + currency on same row */}
          <div className="flex gap-1.5 items-center">
            {([
              { mode: 'today',     label: t('today'),           d: today     },
              { mode: 'yesterday', label: t('yesterday'),       d: yesterday },
              { mode: 'dayBefore', label: t('dayBeforeYesterday'), d: dayBefore },
              { mode: 'other',     label: t('other'),           d: null      },
            ] as { mode: DateMode; label: string; d: string | null }[]).map(({ mode, label, d }) => (
              <button key={mode}
                onClick={() => {
                  setDateMode(mode)
                  if (d) setDate(d)
                }}
                className={`hit-44 flex-1 min-w-0 h-8 rounded-full text-[13px] font-medium whitespace-nowrap transition-colors ${
                  dateMode === mode
                    ? 'bg-primary text-white'
                    : 'bg-gray-50 text-gray-600 active:bg-gray-100'
                }`}
              >
                {label}
              </button>
            ))}
            {/* Currency picker — small dropdown that opens upward via portal */}
            <div className="shrink-0">
              <button ref={currencyBtnRef} onClick={openCurrencyPicker}
                className="hit-44 flex items-center gap-0.5 h-8 pl-3 pr-2 bg-gray-50 rounded-full text-[13px] font-semibold text-gray-900 whitespace-nowrap active:bg-gray-100 transition-colors">
                {currency}<ChevronDown size={12} className="text-gray-400" />
              </button>
            </div>
          </div>
          {/* Custom date input — only shown when "其他/Other" is active */}
          {dateMode === 'other' && (
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full mt-2 px-3 h-11 bg-gray-50 border border-transparent rounded-xl text-base outline-none focus:border-primary/40 transition-colors"
            />
          )}
        </div>
      </div>

      {/* Fixed bottom: amount + numpad */}
      <div className="shrink-0 bg-white px-3 pt-2 pb-safe-2">

        {/* Amount display */}
        <div className="flex items-baseline gap-1.5 px-2 pb-2">
          <span className="font-num text-lg tall:text-xl text-gray-400">{symbol}</span>
          {/* text-3xl 这个类名测试在用，别删；高屏上再放大一档 */}
          <span className="font-num text-3xl tall:text-[40px] tall:leading-[44px] font-bold text-gray-900 tracking-tight flex-1 truncate">{amount}</span>
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-4 gap-1.5">
          {['7','8','9'].map(k => (
            <button key={k} onClick={() => numPress(k)}
              className="font-num h-[42px] tall:h-[52px] bg-gray-50 rounded-xl text-xl font-medium text-gray-900 active:bg-gray-200 transition-colors">
              {k}
            </button>
          ))}
          <button onClick={numDel}
            className="h-[42px] tall:h-[52px] bg-gray-100 rounded-xl text-lg text-gray-600 active:bg-gray-200 transition-colors">
            ⌫
          </button>

          {['4','5','6'].map(k => (
            <button key={k} onClick={() => numPress(k)}
              className="font-num h-[42px] tall:h-[52px] bg-gray-50 rounded-xl text-xl font-medium text-gray-900 active:bg-gray-200 transition-colors">
              {k}
            </button>
          ))}
          {/* "再记/More" only shown in add mode */}
          {editTx ? (
            <div className="h-[42px] tall:h-[52px] bg-gray-50 rounded-xl" />
          ) : (
            <button onClick={() => handleSave(true)} disabled={submitting}
              className="h-[42px] tall:h-[52px] bg-primary/10 text-primary rounded-xl text-sm font-semibold active:bg-primary/20 transition-colors disabled:opacity-50">
              {t('addAgain')}
            </button>
          )}

          {['1','2','3'].map(k => (
            <button key={k} onClick={() => numPress(k)}
              className="font-num h-[42px] tall:h-[52px] bg-gray-50 rounded-xl text-xl font-medium text-gray-900 active:bg-gray-200 transition-colors">
              {k}
            </button>
          ))}
          {/* Save/update spans 2 rows */}
          <button onClick={() => handleSave(false)} disabled={submitting}
            className="row-span-2 bg-primary text-white rounded-xl text-base font-semibold active:bg-primary-dark transition-colors disabled:opacity-50">
            {submitting ? '…' : editTx ? t('update') : t('save')}
          </button>

          <button onClick={() => numPress('0')}
            className="font-num h-[42px] tall:h-[52px] bg-gray-50 rounded-xl text-xl font-medium text-gray-900 active:bg-gray-200 transition-colors">
            0
          </button>
          <button onClick={() => numPress('00')}
            className="font-num h-[42px] tall:h-[52px] bg-gray-50 rounded-xl text-xl font-medium text-gray-900 active:bg-gray-200 transition-colors">
            00
          </button>
          <button onClick={() => numPress('.')}
            className="font-num h-[42px] tall:h-[52px] bg-gray-100 rounded-xl text-xl font-medium text-gray-900 active:bg-gray-200 transition-colors">
            .
          </button>
        </div>
      </div>

      {/* Currency picker dropdown — rendered via portal so it isn't clipped by parent overflow-hidden */}
      {showCurrencyPicker && createPortal(
        <>
          <div className="fixed inset-app z-40" onClick={() => setShowCPicker(false)} />
          {/* 外层只负责定位（transform 向上翻），内层才做入场动画 —— 动画也用 transform，放同一层会互相覆盖 */}
          <div className="z-50" style={pickerStyle}>
            <div className="anim-rise-fade bg-white rounded-xl shadow-glass overflow-y-auto py-1 max-h-[224px]">
              {SUPPORTED_CURRENCIES.map(c => (
                <button key={c} onClick={() => { setCurrency(c); setShowCPicker(false) }}
                  className={`w-full px-4 h-10 text-left text-sm active:bg-gray-50 ${
                    currency === c ? 'text-primary font-semibold' : 'text-gray-900'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
          </div>
        </>,
        document.body,
      )}

      {toast && (
        <div className="anim-toast fixed left-1/2 bg-black/80 text-white px-5 py-2.5 rounded-full text-sm whitespace-nowrap z-50 pointer-events-none"
          style={{ bottom: 'calc(var(--fixed-bottom) + var(--sab) + 40px)' }}>
          {toast}
        </div>
      )}
    </div>
  )
}
