import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { collectViewportDiag, type DiagRow } from '../lib/viewport'
import { useLanguage } from '../contexts/LanguageContext'
import type { Lang } from '../lib/i18n'
import { PageShell } from '../components/layout/StatusBand'

export default function About() {
  const navigate = useNavigate()
  const { lang, setLang, t } = useLanguage()

  return (
    <PageShell>
    <div className="anim-page h-full flex flex-col overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-2 pt-safe-2">
        <button
          onClick={() => navigate(-1)}
          aria-label={t('backAriaLabel')}
          className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-200 transition-colors"
        >
          <ChevronLeft size={26} className="text-gray-900" />
        </button>
        <button
          onClick={() => setLang((lang === 'zh' ? 'en' : 'zh') as Lang)}
          className="h-11 px-3 text-base font-medium text-primary active:opacity-60"
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </div>
      <h1 className="shrink-0 px-5 pt-1 pb-3 text-[28px] leading-[34px] font-bold text-gray-900">{t('aboutPageTitle')}</h1>

      <div className="flex-1 min-h-0 px-4 pb-safe-4">
        <div className="bg-white rounded-2xl h-full overflow-y-auto no-scrollbar p-5">
          {lang === 'zh' ? <ZhContent /> : <EnContent />}
          <ViewportDiag />
        </div>
      </div>
    </div>
    </PageShell>
  )
}

/**
 * 真机排查用的诊断信息：视口 / 屏幕 / 安全区 / 外壳高度。
 * 手机上没有开发者工具，布局出问题时让用户展开这一段截图，就能看出是哪个值不对
 * （2026-11-14 标签栏掉出屏幕那次，就是因为看不到这些数只能靠量截图推）。
 */
function ViewportDiag() {
  const { t } = useLanguage()
  const [rows, setRows] = useState<DiagRow[] | null>(null)

  return (
    <div className="mt-6 pt-4 border-t border-gray-100">
      <button
        onClick={() => setRows(rows ? null : collectViewportDiag())}
        className="h-11 -ml-1 px-1 text-[13px] leading-[18px] text-gray-400 active:text-gray-600 transition-colors"
      >
        {rows ? t('diagHide') : t('diagShow')}
      </button>
      {rows && (
        <div className="mt-1">
          <p className="text-[13px] leading-[18px] text-gray-400 mb-2">{t('diagHint')}</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-xs text-gray-500">
            {rows.map((r) => (
              <div key={r.label} className="flex justify-between gap-2 min-w-0">
                <dt className="shrink-0 text-gray-400">{r.label}</dt>
                <dd className="truncate text-gray-700">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}

function ZhContent() {
  return (
    <div className="space-y-4 text-sm leading-[1.75] text-gray-700">
      <p>口袋记账是一个个人开发的记账工具，最初是我作为留学生为自己做的——在马来西亚生活、偶尔回国、计划去其他国家，多种货币混在一起记账很麻烦，市面上的记账 app 对跨币种支持都不够好，所以自己动手写了一个。</p>

      <div>
        <h2 className="font-semibold text-gray-900 mt-5 mb-2">主要功能</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>多币种记账，支持实时汇率转换与历史汇率快照</li>
          <li>支出/收入分类，月度统计与图表分析</li>
          <li>预算设定与进度追踪</li>
          <li>日历视图查看每日账目</li>
          <li>数据 CSV 导出，随时可带走</li>
        </ul>
      </div>

      <p>我还在持续打磨，会不定期更新。未来遇到的跨境生活里的麻烦，也会陆续做进来。</p>

      <div>
        <h2 className="font-semibold text-gray-900 mt-5 mb-2">免责声明</h2>
        <div className="space-y-3">
          <p>本应用是个人开发的非商业项目，没有公司实体，也未经过法律审核。我尽力保障数据安全（账号密码加密存储，交易数据仅你自己可见），但<span className="font-semibold">不对任何数据丢失、服务中断或其他问题承担责任</span>，使用即视为接受这一点。</p>
          <p>你的交易数据保存在 Supabase 云服务上，邮件通过 Resend 发送，这两个是我用的第三方服务。除此之外，我不会把你的数据提供给任何人，也不会用于任何商业目的。</p>
          <p>如果你不能接受上述条款，请不要使用本应用。</p>
        </div>
      </div>

      <p>感谢使用。</p>
    </div>
  )
}

function EnContent() {
  return (
    <div className="space-y-4 text-sm leading-[1.75] text-gray-700">
      <p>Pocket Ledger is a personal project I built for myself as an international student. Living in Malaysia, occasionally going home, and planning trips elsewhere meant dealing with several currencies at once — and I couldn't find an existing app that handled cross-currency tracking well. So I wrote my own.</p>

      <div>
        <h2 className="font-semibold text-gray-900 mt-5 mb-2">Features</h2>
        <ul className="list-disc pl-5 space-y-1">
          <li>Multi-currency transactions with live rates and historical rate snapshots</li>
          <li>Income and expense categories, monthly stats, and charts</li>
          <li>Budget tracking with progress indicators</li>
          <li>Calendar view of daily entries</li>
          <li>CSV export — your data is always yours</li>
        </ul>
      </div>

      <p>I still work on it, so expect occasional updates. Other pain points of life abroad will find their way in over time.</p>

      <div>
        <h2 className="font-semibold text-gray-900 mt-5 mb-2">Disclaimer</h2>
        <div className="space-y-3">
          <p>This is a personal, non-commercial project. There is no company behind it, and it has not been legally reviewed. I do my best to keep your data safe (passwords are securely hashed, your transactions are only visible to you), but <span className="font-semibold">I accept no liability for data loss, service interruption, or any other issue</span>. By using the app, you agree to this.</p>
          <p>Your transaction data is stored on Supabase, and emails are sent through Resend — these are the two third-party services I rely on. Beyond that, I will never share your data with anyone or use it for commercial purposes.</p>
          <p>If you can't accept these terms, please don't use the app.</p>
        </div>
      </div>

      <p>Thanks for trying it.</p>
    </div>
  )
}
