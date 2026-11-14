import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../contexts/LanguageContext'

interface Props {
  /**
   * 真正执行删除。由页面传自己那份 useTransactions().remove 进来 ——
   * 每个 useTransactions() 各有一份列表状态，只有用页面自己的那份删，
   * 列表才会立刻少一行；换一份删的话要等联网同步回来才更新，离线时一直不变。
   */
  onConfirm: () => Promise<unknown>
  /** 点了取消 */
  onCancel: () => void
  /** 删除完成 */
  onDone: () => void
}

/**
 * 删除一条流水前的确认框。详情弹层（TransactionSheet）和列表行左滑的「删除」共用。
 * z-[100]：要盖在详情弹层（z-50）上面。
 */
export default function DeleteTxDialog({ onConfirm, onCancel, onDone }: Props) {
  const { t } = useLanguage()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    await onConfirm()
    setDeleting(false)
    onDone()
  }

  return createPortal(
    <>
      <div className="anim-fade-in fixed inset-app bg-black/50 z-[100]" />
      <div className="fixed inset-app z-[100] flex items-center justify-center px-8">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-tx-title"
          aria-describedby="delete-tx-msg"
          className="anim-rise-fade bg-white rounded-3xl p-5 pt-6 w-full max-w-[300px] text-center shadow-glass"
        >
          <h3 id="delete-tx-title" className="text-base font-semibold text-gray-900 mb-1">{t('confirmDelete')}</h3>
          <p id="delete-tx-msg" className="text-sm text-gray-500 mb-5">{t('confirmDeleteMsg')}</p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={deleting}
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
    </>,
    document.body,
  )
}
