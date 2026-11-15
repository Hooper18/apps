import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, ChevronRight, X, Check, Lock, Bell, ListOrdered, Coins, PenLine, Globe, Target, Upload, Zap } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useCurrency } from '../contexts/CurrencyContext'
import { useLanguage } from '../contexts/LanguageContext'
import { useCategorySort, type CategorySortMode } from '../hooks/useCategorySort'
import { SUPPORTED_CURRENCIES, CURRENCY_LABELS, CURRENCY_SYMBOLS } from '../types'
import type { Currency } from '../types'
import type { Lang } from '../lib/i18n'
import { exportTransactionsCsv } from '../utils/exportCsv'
import type { ExportRange } from '../utils/exportCsv'
import PasswordInput from '../components/PasswordInput'
import {
  type ReminderSettings,
  checkPermission,
  getReminderSettings,
  isNativeAvailable,
  requestPermission,
  saveReminderSettings,
  syncReminder,
} from '../lib/notifications'

type ModalType = 'preferred' | 'default' | 'language' | 'changePwd' | 'export' | 'reminder' | 'categorySort' | null

function pad(n: number) { return n.toString().padStart(2, '0') }

// ── Stats display settings ─────────────────────────────────────────────
export type StatsTabKey = 'overview' | 'daily' | 'category' | 'extra' | 'transfer'
const STATS_TABS_KEY = 'ledger:stats_tabs'

export function getStatsDisplay(): Record<StatsTabKey, boolean> {
  // 历史用户的 localStorage 里不会有 transfer 字段，spread defaults 在前
  // 保证旧值（其它 4 项）尊重用户选择，transfer 默认 true 加入显示。
  const defaults: Record<StatsTabKey, boolean> = {
    overview: true, daily: true, category: true, extra: true, transfer: true,
  }
  try {
    const raw = localStorage.getItem(STATS_TABS_KEY)
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<Record<StatsTabKey, boolean>>) }
  } catch { /* ignore */ }
  return defaults
}

function saveStatsDisplay(v: Record<StatsTabKey, boolean>) {
  localStorage.setItem(STATS_TABS_KEY, JSON.stringify(v))
}

export default function Settings() {
  const navigate = useNavigate()
  const { user, signIn, signOut, updatePassword } = useAuth()
  const {
    baseCurrency,
    defaultCurrency,
    useLastUsedAsDefault,
    setBaseCurrency,
    setDefaultCurrency,
    setUseLastUsedAsDefault,
  } = useCurrency()
  const { t, lang, setLang } = useLanguage()
  const { mode: categorySortMode, setMode: setCategorySortMode } = useCategorySort()

  const [modal, setModal] = useState<ModalType>(null)
  const [saving, setSaving] = useState(false)
  const [statsDisplay, setStatsDisplay] = useState<Record<StatsTabKey, boolean>>(getStatsDisplay)

  function toggleStatsTab(key: StatsTabKey) {
    setStatsDisplay(prev => {
      const enabled = (Object.keys(prev) as StatsTabKey[]).filter(k => prev[k]).length
      if (prev[key] && enabled <= 1) return prev
      const next = { ...prev, [key]: !prev[key] }
      saveStatsDisplay(next)
      return next
    })
  }

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState('')
  const [pwdLoading, setPwdLoading] = useState(false)

  const [exportRange, setExportRange] = useState<ExportRange>('all')
  const [exportFrom, setExportFrom] = useState('')
  const [exportTo, setExportTo] = useState('')
  const [exportLoading, setExportLoading] = useState(false)
  const [exportMsg, setExportMsg] = useState<{ type: 'success' | 'nodata' | 'error'; text: string } | null>(null)

  // Daily reminder
  const [reminder, setReminder] = useState<ReminderSettings>(() => getReminderSettings())
  const [reminderPermDenied, setReminderPermDenied] = useState(false)
  const [reminderBusy, setReminderBusy] = useState(false)

  useEffect(() => {
    if (modal !== 'reminder') return
    setReminder(getReminderSettings())
    setReminderPermDenied(false)
  }, [modal])

  async function updateReminder(next: ReminderSettings) {
    setReminderBusy(true)
    setReminder(next)
    saveReminderSettings(next)
    setReminderPermDenied(false)

    if (next.enabled && isNativeAvailable()) {
      const granted = (await checkPermission()) || (await requestPermission())
      if (!granted) {
        setReminderPermDenied(true)
        const fallback = { ...next, enabled: false }
        setReminder(fallback)
        saveReminderSettings(fallback)
        setReminderBusy(false)
        return
      }
    }

    await syncReminder({
      title: t('reminderNotifyTitle'),
      body: t('reminderNotifyBody'),
    }).catch(() => {})
    setReminderBusy(false)
  }

  async function handleSelect(c: Currency) {
    setSaving(true)
    try {
      if (modal === 'preferred') await setBaseCurrency(c)
      if (modal === 'default') {
        // 选了具体币种就关掉"跟随上次"模式
        setUseLastUsedAsDefault(false)
        await setDefaultCurrency(c)
      }
      setModal(null)
    } catch {
      // error already logged in CurrencyContext; UI reverted by setBase/setDefault(prev)
    } finally {
      setSaving(false)
    }
  }

  function handleSelectLastUsed() {
    setUseLastUsedAsDefault(true)
    setModal(null)
  }

  function handleSelectLang(l: Lang) {
    setLang(l)
    setModal(null)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/auth', { replace: true })
  }

  function openExport() {
    setExportRange('all')
    setExportFrom('')
    setExportTo('')
    setExportLoading(false)
    setExportMsg(null)
    setModal('export')
  }

  async function handleExport() {
    if (!user) return
    if (exportRange === 'custom' && (!exportFrom || !exportTo)) return
    setExportLoading(true)
    setExportMsg(null)
    const result = await exportTransactionsCsv({
      userId: user.id,
      baseCurrency,
      range: exportRange,
      customFrom: exportFrom || undefined,
      customTo: exportTo || undefined,
    })
    setExportLoading(false)
    if (!result.success) {
      setExportMsg({ type: 'error', text: t('exportFailed') + (result.error ? ': ' + result.error : '') })
    } else if (result.rowCount === 0) {
      setExportMsg({ type: 'nodata', text: t('exportNoData') })
    } else {
      setExportMsg({ type: 'success', text: t('exportSuccess', { count: result.rowCount! }) })
    }
  }

  function openChangePwd() {
    setOldPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setPwdError('')
    setPwdSuccess('')
    setPwdLoading(false)
    setModal('changePwd')
  }

  async function handleChangePwd(e: React.FormEvent) {
    e.preventDefault()
    setPwdError('')
    setPwdSuccess('')

    if (newPassword.length < 6) { setPwdError(t('passwordTooShort')); return }
    if (newPassword !== confirmPassword) { setPwdError(t('passwordMismatch')); return }
    if (newPassword === oldPassword) { setPwdError(t('changePwdSameAsOld')); return }

    setPwdLoading(true)

    const email = user?.email
    if (!email) { setPwdError(t('changePwdUpdateFailed')); setPwdLoading(false); return }

    const { error: verifyError } = await signIn(email, oldPassword)
    if (verifyError) {
      setPwdLoading(false)
      setPwdError(t('changePwdWrongCurrent'))
      return
    }

    const { error: updateError } = await updatePassword(newPassword)
    if (updateError) {
      setPwdLoading(false)
      setPwdError(t('changePwdUpdateFailed'))
      return
    }

    setPwdSuccess(t('changePwdSuccess'))
    setTimeout(async () => {
      await signOut()
      navigate('/auth', { replace: true })
    }, 1500)
  }

  const inputClass = 'w-full px-4 h-12 rounded-xl border border-transparent bg-gray-50 focus:outline-none focus:border-primary/40 text-base text-gray-900 placeholder:text-gray-400 transition-colors'

  const currentValue = modal === 'preferred' ? baseCurrency : defaultCurrency

  return (
    <div className="anim-page flex flex-col h-full bg-gray-50">

      {/* Header */}
      <div className="shrink-0 px-5 pt-safe-3 pb-2">
        <h1 className="text-[28px] leading-[34px] font-bold text-gray-900">{t('settingsTitle')}</h1>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-page">

        {/* Account card */}
        <div className="mx-4 mt-2 bg-white rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <span className="text-primary font-semibold text-lg">
                {user?.email?.[0]?.toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-medium text-gray-900 truncate">{user?.email}</p>
              <p className="text-[13px] leading-[18px] text-gray-400 mt-0.5">{t('personalAccount')}</p>
            </div>
          </div>
        </div>

        {/* Currency settings */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('currencySection')}</p>
        <div className="mx-4 bg-white rounded-2xl overflow-hidden">
          <button
            onClick={() => setModal('preferred')}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors"
          >
            <Coins size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-base text-gray-900">{t('preferredCurrency')}</p>
              <p className="text-[13px] leading-[18px] text-gray-400 mt-0.5">{t('preferredCurrencyDesc')}</p>
            </div>
            <span className="text-base text-gray-500 mr-0.5 shrink-0 max-w-[45%] truncate">
              {CURRENCY_SYMBOLS[baseCurrency]} {baseCurrency}
            </span>
            <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
          </button>

          <div className="border-t border-gray-100 ml-[52px]" />

          <button
            onClick={() => setModal('default')}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors"
          >
            <PenLine size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-base text-gray-900">{t('defaultCurrency')}</p>
              <p className="text-[13px] leading-[18px] text-gray-400 mt-0.5">{t('defaultCurrencyDesc')}</p>
            </div>
            <span className="text-base text-gray-500 mr-0.5 shrink-0 max-w-[45%] truncate">
              {useLastUsedAsDefault
                ? t('useLastUsedCurrency')
                : `${CURRENCY_SYMBOLS[defaultCurrency]} ${defaultCurrency}`}
            </span>
            <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
          </button>

          <div className="border-t border-gray-100 ml-[52px]" />

          <button
            onClick={() => setModal('categorySort')}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors"
          >
            <ListOrdered size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-base text-gray-900">{t('categorySortLabel')}</p>
              <p className="text-[13px] leading-[18px] text-gray-400 mt-0.5">{t('categorySortDesc')}</p>
            </div>
            <span className="text-base text-gray-500 mr-0.5 shrink-0 max-w-[45%] truncate">
              {categorySortMode === 'recent' ? t('categorySortModeRecent') : t('categorySortModeCustom')}
            </span>
            <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
          </button>
        </div>

        {/* Language settings */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('languageSection')}</p>
        <div className="mx-4 bg-white rounded-2xl overflow-hidden">
          <button
            onClick={() => setModal('language')}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors"
          >
            <Globe size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-base text-gray-900">{t('languageLabel')}</p>
              <p className="text-[13px] leading-[18px] text-gray-400 mt-0.5">{t('languageDesc')}</p>
            </div>
            <span className="text-base text-gray-500 mr-0.5 shrink-0 max-w-[45%] truncate">
              {lang === 'zh' ? t('langZh') : t('langEn')}
            </span>
            <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
          </button>
        </div>

        {/* Daily reminder */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('reminderSection')}</p>
        <div className="mx-4 bg-white rounded-2xl overflow-hidden">
          <button
            onClick={() => setModal('reminder')}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors"
          >
            <Bell size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-base text-gray-900">{t('reminderLabel')}</p>
              <p className="text-[13px] leading-[18px] text-gray-400 mt-0.5">{t('reminderDesc')}</p>
            </div>
            <span className="text-base text-gray-500 mr-0.5 shrink-0 max-w-[45%] truncate">
              {reminder.enabled ? `${pad(reminder.hour)}:${pad(reminder.minute)}` : t('reminderOff')}
            </span>
            <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
          </button>
        </div>

        {/* Stats Display */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('statsDisplaySection')}</p>
        <div className="mx-4 bg-white rounded-2xl overflow-hidden">
          {([
            { key: 'overview' as StatsTabKey, label: t('statsDisplayOverview') },
            { key: 'daily'    as StatsTabKey, label: t('statsDisplayDaily') },
            { key: 'category' as StatsTabKey, label: t('statsDisplayCategory') },
            { key: 'extra'    as StatsTabKey, label: t('statsDisplayExtra') },
            { key: 'transfer' as StatsTabKey, label: t('statsDisplayTransfer') },
          ]).map(({ key, label }, i, arr) => (
            <div key={key}>
              <button
                onClick={() => toggleStatsTab(key)}
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors"
              >
                <span className="flex-1 text-base text-gray-900">{label}</span>
                {/* iOS 开关：51×31，开 = 系统绿 */}
                <div role="switch" aria-checked={statsDisplay[key] !== false}
                  className={`w-[51px] h-[31px] rounded-full relative transition-colors duration-200 shrink-0 ${statsDisplay[key] ? 'bg-green-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-0.5 h-[27px] w-[27px] bg-white rounded-full shadow-[0_2px_4px_rgba(0,0,0,0.15)] transition-[left] duration-200 ${statsDisplay[key] ? 'left-[22px]' : 'left-0.5'}`} />
                </div>
              </button>
              {i < arr.length - 1 && <div className="border-t border-gray-100 ml-4" />}
            </div>
          ))}
        </div>

        {/* Account Security */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('changePwdSection')}</p>
        <div className="mx-4 bg-white rounded-2xl overflow-hidden">
          <button
            onClick={openChangePwd}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors"
          >
            <Lock size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
            <span className="flex-1 text-base text-gray-900">{t('changePwdLabel')}</span>
            <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
          </button>
        </div>

        {/* Other settings */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('otherSection')}</p>
        <div className="mx-4 bg-white rounded-2xl overflow-hidden">
          <button
            onClick={() => navigate('/auto-ingest')}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors"
          >
            <Zap size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
            <span className="flex-1 text-base text-gray-900">{t('autoIngestEntry')}</span>
            <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
          </button>
          <div className="border-t border-gray-100 ml-[52px]" />
          <button
            onClick={() => navigate('/budget')}
            className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors"
          >
            <Target size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
            <span className="flex-1 text-base text-gray-900">{t('budgetManagement')}</span>
            <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
          </button>
          <div className="border-t border-gray-100 ml-[52px]" />
          <button onClick={openExport} className="w-full flex items-center gap-3 px-4 py-3 min-h-[52px] active:bg-gray-50 text-left transition-colors">
            <Upload size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
            <span className="flex-1 text-base text-gray-900">{t('dataExport')}</span>
            <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
          </button>
        </div>

        {/* Sign out */}
        <div className="mx-4 mt-8 bg-white rounded-2xl overflow-hidden">
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 min-h-[52px] active:bg-gray-50 transition-colors"
          >
            <LogOut size={18} className="text-red-600 shrink-0" />
            <span className="text-base text-red-600">{t('signOut')}</span>
          </button>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6 mb-2">{t('appVersion')}</p>
      </div>

      {/* Bottom sheet (currency picker + language picker) */}
      {modal && (
        <>
          <div className="anim-fade-in fixed inset-app bg-black/40 z-40" onClick={() => !(saving || pwdLoading || exportLoading) && setModal(null)} />
          <div className="anim-slide-up fixed bottom-app left-0 right-0 max-w-md mx-auto bg-white rounded-t-3xl z-50 flex flex-col max-h-[75vh]">

            {/* Handle */}
            <div className="flex justify-center pt-2 shrink-0">
              <div className="w-9 h-[5px] bg-gray-300 rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between pl-5 pr-3 py-2 shrink-0">
              <h2 className="text-base font-semibold text-gray-900">
                {modal === 'preferred'  ? t('selectPreferredCurrency')
                : modal === 'default'   ? t('selectDefaultCurrency')
                : modal === 'language'  ? t('selectLanguage')
                : modal === 'export'    ? t('dataExport')
                : modal === 'reminder'  ? t('reminderTitle')
                : modal === 'categorySort' ? t('categorySortModeTitle')
                : t('changePwdTitle')}
              </h2>
              <button onClick={() => !(saving || pwdLoading || exportLoading) && setModal(null)} aria-label={t('close')}
                className="w-11 h-11 flex items-center justify-center group">
                <span className="w-[30px] h-[30px] rounded-full bg-gray-50 group-active:bg-gray-200 flex items-center justify-center transition-colors">
                  <X size={16} strokeWidth={2.4} className="text-gray-500" />
                </span>
              </button>
            </div>

            {/* Content */}
            {modal === 'reminder' ? (
              <div className="overflow-y-auto flex-1 px-4 pt-2 pb-safe-6">
                <div className="space-y-3">
                  {!isNativeAvailable() && (
                    <div className="flex items-start gap-2 bg-amber-50 text-amber-700 text-xs px-4 py-3 rounded-xl">
                      <span className="shrink-0 mt-0.5">⚠️</span>
                      <span>
                        {t('reminderWebHint')}{' '}
                        <a href="/apps" target="_blank" rel="noopener" className="underline">/apps</a>
                      </span>
                    </div>
                  )}
                  {reminderPermDenied && (
                    <div className="flex items-start gap-2 bg-red-50 text-red-600 text-xs px-4 py-3 rounded-xl">
                      <span className="shrink-0 mt-0.5">⚠️</span>
                      <span>{t('reminderPermissionDenied')}</span>
                    </div>
                  )}

                  <label className="flex items-center justify-between bg-gray-50 rounded-xl px-4 min-h-[52px] cursor-pointer">
                    <span className="text-base text-gray-900">{t('reminderEnable')}</span>
                    <input
                      type="checkbox"
                      checked={reminder.enabled}
                      disabled={reminderBusy || !isNativeAvailable()}
                      onChange={(e) =>
                        updateReminder({ ...reminder, enabled: e.target.checked })
                      }
                      className="w-5 h-5 accent-primary"
                    />
                  </label>

                  <div className="flex items-center justify-between bg-gray-50 rounded-xl px-4 min-h-[52px]">
                    <span className="text-base text-gray-900">{t('reminderTime')}</span>
                    <input
                      type="time"
                      value={`${pad(reminder.hour)}:${pad(reminder.minute)}`}
                      disabled={reminderBusy || !reminder.enabled || !isNativeAvailable()}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':').map(Number)
                        if (Number.isFinite(h) && Number.isFinite(m)) {
                          updateReminder({ ...reminder, hour: h, minute: m })
                        }
                      }}
                      className="bg-transparent text-base font-medium text-primary focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : modal === 'export' ? (
              <div className="overflow-y-auto flex-1 px-4 pt-2 pb-safe-6">
                <div className="space-y-3">
                  {/* Range options */}
                  {(['all', 'thisMonth', 'custom'] as ExportRange[]).map(value => {
                    const label = value === 'all' ? t('exportRangeAll')
                      : value === 'thisMonth' ? t('exportRangeThisMonth')
                      : t('exportRangeCustom')
                    const selected = exportRange === value
                    return (
                      <button
                        key={value}
                        onClick={() => { setExportRange(value); setExportMsg(null) }}
                        className={`w-full flex items-center gap-3 px-4 min-h-[52px] rounded-xl border transition-colors text-base ${
                          selected ? 'bg-primary/5 border-primary text-gray-900 font-medium' : 'bg-gray-50 border-transparent text-gray-900'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? 'border-primary' : 'border-gray-300'
                        }`}>
                          {selected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </div>
                        {label}
                      </button>
                    )
                  })}

                  {/* Custom date inputs */}
                  {exportRange === 'custom' && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="block text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1">{t('exportFromLabel')}</label>
                        <input
                          type="date"
                          value={exportFrom}
                          max={exportTo || undefined}
                          onChange={e => setExportFrom(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1">{t('exportToLabel')}</label>
                        <input
                          type="date"
                          value={exportTo}
                          min={exportFrom || undefined}
                          onChange={e => setExportTo(e.target.value)}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  )}

                  {/* Result message */}
                  {exportMsg && (
                    <div className={`flex items-start gap-2 text-sm px-4 py-3 rounded-xl ${
                      exportMsg.type === 'success' ? 'bg-green-50 text-green-700'
                      : exportMsg.type === 'nodata' ? 'bg-gray-50 text-gray-600'
                      : 'bg-red-50 text-red-600'
                    }`}>
                      <span className="shrink-0 mt-0.5">
                        {exportMsg.type === 'success' ? '✅' : exportMsg.type === 'nodata' ? '📭' : '⚠️'}
                      </span>
                      <span>{exportMsg.text}</span>
                    </div>
                  )}

                  {/* Export button */}
                  <button
                    onClick={handleExport}
                    disabled={exportLoading || (exportRange === 'custom' && (!exportFrom || !exportTo))}
                    className="w-full bg-primary text-white h-[50px] rounded-xl font-semibold text-base active:bg-primary-dark disabled:opacity-60 transition-colors mt-1"
                  >
                    {exportLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        {t('exporting')}
                      </span>
                    ) : t('exportBtn')}
                  </button>
                </div>
              </div>
            ) : modal === 'changePwd' ? (
              <form onSubmit={handleChangePwd} className="overflow-y-auto flex-1 px-4 pt-2 pb-safe-6">
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1">{t('changePwdCurrentLabel')}</label>
                    <PasswordInput
                      value={oldPassword}
                      onChange={setOldPassword}
                      placeholder={t('changePwdCurrentPlaceholder')}
                      required
                      autoComplete="current-password"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1">{t('changePwdNewLabel')}</label>
                    <PasswordInput
                      value={newPassword}
                      onChange={setNewPassword}
                      placeholder={t('changePwdNewPlaceholder')}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  <div>
                    <label className="block text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1">{t('changePwdConfirmLabel')}</label>
                    <PasswordInput
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      placeholder={t('changePwdConfirmPlaceholder')}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                  {pwdError && (
                    <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
                      <span className="shrink-0 mt-0.5">⚠️</span>
                      <span>{pwdError}</span>
                    </div>
                  )}
                  {pwdSuccess && (
                    <div className="flex items-start gap-2 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl">
                      <span className="shrink-0 mt-0.5">✅</span>
                      <span>{pwdSuccess}</span>
                    </div>
                  )}
                  {!pwdSuccess && (
                    <button
                      type="submit"
                      disabled={pwdLoading}
                      className="w-full bg-primary text-white h-[50px] rounded-xl font-semibold text-base active:bg-primary-dark disabled:opacity-60 transition-colors mt-1"
                    >
                      {pwdLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                          {t('changePwdSaving')}
                        </span>
                      ) : t('changePwdSaveBtn')}
                    </button>
                  )}
                </div>
              </form>
            ) : modal === 'categorySort' ? (
              <div className="overflow-y-auto flex-1 px-4 pt-2 pb-safe-6">
                <div className="space-y-2">
                  {([
                    { value: 'custom' as CategorySortMode, label: t('categorySortModeCustom'), desc: t('categorySortModeCustomDesc') },
                    { value: 'recent' as CategorySortMode, label: t('categorySortModeRecent'), desc: t('categorySortModeRecentDesc') },
                  ]).map(({ value, label, desc }) => {
                    const selected = categorySortMode === value
                    return (
                      <button
                        key={value}
                        onClick={() => setCategorySortMode(value)}
                        className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-colors ${
                          selected ? 'bg-primary/5 border-primary' : 'bg-gray-50 border-transparent'
                        }`}
                      >
                        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                          selected ? 'border-primary' : 'border-gray-300'
                        }`}>
                          {selected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-base font-medium text-gray-900">{label}</p>
                          <p className="text-[13px] leading-[18px] text-gray-500 mt-0.5">{desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {categorySortMode === 'custom' && (
                  <button
                    onClick={() => { setModal(null); navigate('/category-order') }}
                    className="mt-4 w-full flex items-center gap-3 px-4 min-h-[52px] rounded-xl bg-gray-50 active:bg-gray-200 text-left transition-colors"
                  >
                    <ListOrdered size={20} strokeWidth={1.8} className="text-gray-500 shrink-0" />
                    <span className="flex-1 text-base text-gray-900">{t('categorySortManageOrder')}</span>
                    <ChevronRight size={18} className="text-gray-300 shrink-0 -mr-1" />
                  </button>
                )}
              </div>
            ) : modal === 'language' ? (
              <div className="overflow-y-auto flex-1">
                {(['zh', 'en'] as Lang[]).map((l, i) => (
                  <button
                    key={l}
                    onClick={() => handleSelectLang(l)}
                    className={`w-full flex items-center gap-3 px-5 min-h-[52px] active:bg-gray-50 transition-colors ${
                      i > 0 ? 'border-t border-gray-100' : ''
                    }`}
                  >
                    <span className={`flex-1 text-base text-left ${l === lang ? 'text-gray-900 font-medium' : 'text-gray-900'}`}>
                      {l === 'zh' ? t('langZh') : t('langEn')}
                    </span>
                    {l === lang && <Check size={20} strokeWidth={2.4} className="text-primary shrink-0" />}
                  </button>
                ))}
                <div className="pb-safe-4" />
              </div>
            ) : (
              <div className="overflow-y-auto flex-1">
                {modal === 'default' && (
                  <button
                    onClick={handleSelectLastUsed}
                    disabled={saving}
                    className="w-full flex items-center gap-3 px-5 py-3 min-h-[52px] active:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    <span className="w-10 text-base shrink-0 text-center">🕘</span>
                    <div className="flex-1 min-w-0 text-left">
                      <p className="text-base text-gray-900">{t('useLastUsedCurrency')}</p>
                      <p className="text-[13px] leading-[18px] text-gray-400 mt-0.5">{t('useLastUsedCurrencyDesc')}</p>
                    </div>
                    {useLastUsedAsDefault && (
                      <Check size={20} strokeWidth={2.4} className="text-primary shrink-0" />
                    )}
                  </button>
                )}
                {SUPPORTED_CURRENCIES.map((c, i) => {
                  const selected =
                    modal === 'default'
                      ? !useLastUsedAsDefault && c === currentValue
                      : c === currentValue
                  const showBorder = i > 0 || modal === 'default'
                  return (
                    <button
                      key={c}
                      onClick={() => handleSelect(c)}
                      disabled={saving}
                      className={`w-full flex items-center gap-3 px-5 min-h-[52px] active:bg-gray-50 disabled:opacity-50 transition-colors ${
                        showBorder ? 'border-t border-gray-100' : ''
                      }`}
                    >
                      <span className="font-num w-10 text-base font-semibold text-gray-500 shrink-0 text-left">
                        {CURRENCY_SYMBOLS[c]}
                      </span>
                      <span className="flex-1 text-base text-gray-900 text-left">{CURRENCY_LABELS[c]}</span>
                      {selected && (
                        <Check size={20} strokeWidth={2.4} className="text-primary shrink-0" />
                      )}
                    </button>
                  )
                })}
                <div className="pb-safe-4" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
