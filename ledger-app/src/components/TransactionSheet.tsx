import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { X, Edit2, Trash2 } from 'lucide-react'
import { useCurrency } from '../contexts/CurrencyContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useTransactions } from '../hooks/useTransactions'
import { CURRENCY_SYMBOLS } from '../types'
import type { TxDetail, Currency } from '../types'

interface Props {
  tx: TxDetail
  displayCurrency: Currency
  onClose: () => void
  onDeleted: (id: string) => void
}

export default function TransactionSheet({ tx, displayCurrency, onClose, onDeleted }: Props) {
  const navigate = useNavigate()
  const { rates } = useCurrency()
  const { t } = useLanguage()
  const { remove: removeTx } = useTransactions()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  function convertTo(amount: number, from: string): number {
    if (from === displayCurrency) return amount
    return (amount / (rates[from] ?? 1)) * (rates[displayCurrency] ?? 1)
  }

  function fmt(n: number) {
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }

  const dispSymbol = CURRENCY_SYMBOLS[displayCurrency] ?? displayCurrency
  const origSymbol = CURRENCY_SYMBOLS[tx.currency as Currency] ?? tx.currency
  const converted  = convertTo(tx.amount, tx.currency)
  const isExpense  = tx.type === 'expense'
  const isIncome   = tx.type === 'income'
  const isTransfer = tx.type === 'transfer'
  const isTransferOut = isTransfer && tx.direction === 'out'
  // 转账原本无前缀，加入 in/out 之后：'in' 显示 +、'out' 显示 −
  const transferPrefix = isTransferOut ? '-' : '+'

  const typeLabel = tx.type === 'expense' ? t('expense') : tx.type === 'income' ? t('income') : t('transfer')

  async function handleDelete() {
    setDeleting(true)
    await removeTx(tx.id)
    setDeleting(false)
    onDeleted(tx.id)
    onClose()
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="anim-fade-in fixed inset-0 bg-black/40 z-40" onClick={onClose} />

      {/* Sheet — flex column with max height so buttons never go off-screen */}
      <div className="anim-slide-up fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl z-50 flex flex-col max-h-[85vh]">
        {/* ── Sticky top: handle + header ── */}
        <div className="shrink-0 bg-white rounded-t-3xl">
          {/* Handle */}
          <div className="flex justify-center pt-2">
            <div className="w-9 h-[5px] bg-gray-300 rounded-full" />
          </div>
          {/* Header */}
          <div className="flex items-center justify-between pl-5 pr-3 py-2">
            <span className="text-base font-semibold text-gray-900">{t('txDetail')}</span>
            <button onClick={onClose} aria-label={t('close')}
              className="w-11 h-11 flex items-center justify-center group">
              <span className="w-[30px] h-[30px] rounded-full bg-gray-50 group-active:bg-gray-200 flex items-center justify-center transition-colors">
                <X size={16} strokeWidth={2.4} className="text-gray-500" />
              </span>
            </button>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          {/* Amount card */}
          <div className="flex flex-col items-center pt-2 pb-6 mx-4">
            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-3xl mb-3">
              {tx.categories?.icon ?? '📦'}
            </div>
            <p className="text-sm text-gray-500 mb-1">{tx.categories?.name ?? t('uncategorized')}</p>
            <p className={`font-num text-[34px] leading-[41px] font-bold ${isExpense ? 'text-gray-900' : isIncome ? 'text-green-600' : 'text-blue-600'}`}>
              {isExpense ? '-' : isIncome ? '+' : transferPrefix}{dispSymbol} {fmt(converted)}
            </p>
            {tx.currency !== displayCurrency && (
              <p className="font-num text-[13px] leading-[18px] text-gray-400 mt-1">{t('originalLabel')}{origSymbol} {fmt(tx.amount)}</p>
            )}
          </div>

          {/* Detail rows */}
          <div className="mx-4 mb-4 bg-gray-50 rounded-2xl overflow-hidden">
            {[
              { label: t('typeLabel'),     value: typeLabel },
              { label: t('currencyLabel'), value: `${origSymbol} ${tx.currency}` },
              { label: t('dateLabel'),     value: tx.date },
              { label: t('noteLabel'),     value: tx.description || '—' },
            ].map((row, i) => (
              <div key={row.label}
                className={`flex justify-between items-center gap-4 px-4 py-3 min-h-[44px] ${i > 0 ? 'border-t border-gray-200' : ''}`}>
                <span className="text-base text-gray-900 shrink-0">{row.label}</span>
                <span className="text-base text-gray-500 max-w-[65%] text-right break-words">{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Sticky bottom: action buttons ── */}
        <div className="shrink-0 bg-white px-4 pt-2 pb-safe-4">
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/add', { state: { tx } })}
              className="flex-1 flex items-center justify-center gap-2 h-[50px] bg-gray-50 text-gray-900 rounded-xl font-semibold text-base active:bg-gray-200 transition-colors"
            >
              <Edit2 size={17} /> {t('edit')}
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex-1 flex items-center justify-center gap-2 h-[50px] bg-red-50 text-red-600 rounded-xl font-semibold text-base active:bg-red-100 transition-colors"
            >
              <Trash2 size={17} /> {t('delete')}
            </button>
          </div>
        </div>
      </div>

      {/* Delete confirm — z-[100] ensures it renders above the sheet (z-50) */}
      {confirmDelete && (
        <>
          <div className="anim-fade-in fixed inset-0 bg-black/50 z-[100]" />
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-8">
            <div className="anim-rise-fade bg-white rounded-3xl p-5 pt-6 w-full max-w-[300px] text-center shadow-glass">
              <h3 className="text-base font-semibold text-gray-900 mb-1">{t('confirmDelete')}</h3>
              <p className="text-sm text-gray-500 mb-5">{t('confirmDeleteMsg')}</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="flex-1 h-11 bg-gray-50 text-gray-900 rounded-full text-base font-semibold active:bg-gray-200 transition-colors"
                >
                  {t('cancel')}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 h-11 bg-red-600 text-white rounded-full text-base font-semibold active:opacity-90 disabled:opacity-50"
                >
                  {deleting ? t('deleting') : t('confirmDelete')}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>,
    document.body,
  )
}
