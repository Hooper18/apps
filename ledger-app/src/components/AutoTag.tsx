import { useLanguage } from '../contexts/LanguageContext'

interface Props {
  tx: { source?: string | null; needs_review?: boolean | null }
}

/**
 * 流水行上类目名旁边的小标记：
 *   · 自动入账的（电脑同步 / 快捷指令写进来的）显示「自动」
 *   · 自动入账但没能确定类目的显示「待分类」（点开改一次，同一商户以后就记住了）
 * 手记的流水不显示。
 */
export default function AutoTag({ tx }: Props) {
  const { t } = useLanguage()
  if (!tx.source) return null
  // 11px 的小字要 4.5:1：浅灰底上用 gray-500（5.4:1），浅红底上用 primary-dark（6.6:1）
  const base = 'shrink-0 px-1.5 rounded-md text-[11px] leading-[18px] font-medium'
  return tx.needs_review ? (
    <span className={`${base} bg-primary/10 text-primary-dark`}>{t('autoNeedsReview')}</span>
  ) : (
    <span className={`${base} bg-gray-50 text-gray-500`}>{t('autoTag')}</span>
  )
}
