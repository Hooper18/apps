import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, Copy, Check } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import { generateToken, hashToken, ingestEndpoint } from '../lib/ingestToken'
import { disablePush, enablePush, isPushEnabled, pushSupported } from '../lib/push'

interface TokenRow {
  id: string
  label: string
  created_at: string
  last_used_at: string | null
}

/** 复制按钮：点一下把文字放进剪贴板，短暂显示「已复制」。 */
function CopyButton({ text }: { text: string }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板不可用（权限 / 非安全上下文）时不提示成功，用户可以长按文字手动复制
    }
  }

  return (
    <button
      onClick={copy}
      className="hit-44 shrink-0 flex items-center gap-1 px-3 h-8 rounded-full bg-gray-50 text-[13px] leading-[18px] text-gray-900 active:bg-gray-100 transition-colors"
    >
      {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} className="text-gray-500" />}
      {copied ? t('copied') : t('copy')}
    </button>
  )
}

/**
 * 设置 → 自动记账：管理个人令牌。
 * 电脑同步工具和 iPhone 快捷指令拿「入口地址 + 令牌」把付款写进账本。
 * 令牌明文只在生成时显示一次，库里只存 SHA-256。这一页需要联网（不走离线队列）。
 */
export default function AutoIngest() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t, lang } = useLanguage()

  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [label, setLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [createFailed, setCreateFailed] = useState(false)
  const [newToken, setNewToken] = useState('')
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  // 付款提醒（这台设备的系统通知）
  const canPush = pushSupported()
  const [pushOn, setPushOn] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushProblem, setPushProblem] = useState<'pushDenied' | 'pushFailed' | null>(null)

  useEffect(() => {
    let alive = true
    void isPushEnabled().then((on) => { if (alive) setPushOn(on) })
    return () => { alive = false }
  }, [])

  async function togglePush() {
    if (!user || pushBusy) return
    setPushBusy(true)
    setPushProblem(null)
    if (pushOn) {
      await disablePush()
      setPushOn(false)
    } else {
      const result = await enablePush(user.id, navigator.userAgent.includes('iPhone') ? 'iPhone' : '')
      if (result === 'ok') setPushOn(true)
      else if (result === 'denied') setPushProblem('pushDenied')
      else if (result === 'failed') setPushProblem('pushFailed')
    }
    setPushBusy(false)
  }

  const endpoint = ingestEndpoint()

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('ingest_tokens')
      .select('id, label, created_at, last_used_at')
      .order('created_at', { ascending: false })
    setLoadFailed(!!error)
    setTokens(error || !data ? [] : (data as TokenRow[]))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function fmtTime(iso: string): string {
    return new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  async function create() {
    if (!user || creating) return
    setCreating(true)
    setCreateFailed(false)
    setNewToken('')
    const token = generateToken()
    const { data, error } = await supabase
      .from('ingest_tokens')
      .insert({ user_id: user.id, label: label.trim(), token_hash: await hashToken(token) })
      .select('id, label, created_at, last_used_at')
      .single()
    setCreating(false)
    if (error || !data) {
      setCreateFailed(true)
      return
    }
    setNewToken(token)
    setTokens((prev) => [data as TokenRow, ...prev])
    setLabel('')
  }

  async function revoke(id: string) {
    setConfirmingId(null)
    const { error } = await supabase.from('ingest_tokens').delete().eq('id', id)
    if (!error) setTokens((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="anim-page flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div className="shrink-0 px-2 pt-safe-2 pb-2">
        <button
          onClick={() => navigate(-1)}
          aria-label={t('backAriaLabel')}
          className="w-11 h-11 flex items-center justify-center rounded-full active:bg-gray-200 transition-colors"
        >
          <ChevronLeft size={26} className="text-gray-900" />
        </button>
        <div className="px-3 pt-1">
          <h1 className="text-[28px] leading-[34px] font-bold text-gray-900">{t('autoIngestTitle')}</h1>
          <p className="text-[13px] leading-[18px] text-gray-500 mt-0.5">{t('autoIngestSubtitle')}</p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pb-safe-6" onClick={() => setConfirmingId(null)}>
        <p className="px-8 pt-2 text-[13px] leading-[20px] text-gray-500">{t('autoIngestIntro')}</p>

        {/* 付款提醒 */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('pushSection')}</p>
        <div className="mx-4 bg-white rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-base text-gray-900">{pushOn ? t('pushOn') : t('pushOff')}</p>
              <p className="text-[13px] leading-[18px] text-gray-400 mt-0.5">{t('pushDesc')}</p>
            </div>
            <button
              onClick={togglePush}
              disabled={!canPush || pushBusy || !user}
              className={`shrink-0 h-11 px-5 rounded-xl text-base font-semibold disabled:opacity-50 transition-colors ${
                pushOn ? 'bg-gray-50 text-gray-900 active:bg-gray-100' : 'bg-primary text-white active:bg-primary-dark'
              }`}
            >
              {pushOn ? t('pushDisable') : t('pushEnable')}
            </button>
          </div>
          {!canPush && <p className="mt-3 text-[13px] leading-[18px] text-gray-500">{t('pushUnsupported')}</p>}
          {pushProblem && <p className="mt-3 text-[13px] leading-[18px] text-red-600">{t(pushProblem)}</p>}
        </div>

        {/* 生成令牌 */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('autoIngestNewSection')}</p>
        <div className="mx-4 bg-white rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('autoIngestLabelPlaceholder')}
              maxLength={30}
              className="flex-1 min-w-0 h-11 px-4 rounded-xl bg-gray-50 text-base text-gray-900 placeholder:text-gray-400 outline-none border border-transparent focus:border-primary/40 transition-colors"
            />
            <button
              onClick={create}
              disabled={creating || !user}
              className="shrink-0 h-11 px-5 rounded-xl bg-primary text-white text-base font-semibold active:bg-primary-dark disabled:opacity-50 transition-colors"
            >
              {creating ? t('autoIngestGenerating') : t('autoIngestGenerate')}
            </button>
          </div>
          {createFailed && <p className="mt-3 text-[13px] leading-[18px] text-red-600">{t('autoIngestCreateFailed')}</p>}
          {newToken && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] leading-[18px] text-gray-500">{t('autoIngestNewTokenTitle')}</p>
                <CopyButton text={newToken} />
              </div>
              <p data-testid="new-token" className="mt-2 font-mono text-[13px] leading-[20px] text-gray-900 break-all select-all">
                {newToken}
              </p>
              <p className="mt-2 text-[13px] leading-[18px] text-gray-500">{t('autoIngestNewTokenHint')}</p>
            </div>
          )}
        </div>

        {/* 已有令牌 */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('autoIngestTokensSection')}</p>
        <div className="mx-4 bg-white rounded-2xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-[60px]">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary" />
            </div>
          ) : loadFailed ? (
            <p className="px-4 py-4 text-[13px] leading-[20px] text-red-600">{t('autoIngestLoadFailed')}</p>
          ) : tokens.length === 0 ? (
            <p className="px-4 py-4 text-base text-gray-400">{t('autoIngestNoTokens')}</p>
          ) : (
            tokens.map((row, idx) => (
              <div key={row.id} className={`flex items-center gap-3 pl-4 pr-3 py-3 min-h-[60px] ${idx === 0 ? '' : 'border-t border-gray-100'}`}>
                <div className="flex-1 min-w-0">
                  <p className={`text-base truncate ${row.label ? 'text-gray-900' : 'text-gray-400'}`}>
                    {row.label || t('autoIngestUnnamed')}
                  </p>
                  <p className="text-[13px] leading-[18px] text-gray-400 truncate">
                    {row.last_used_at
                      ? t('autoIngestLastUsed', { time: fmtTime(row.last_used_at) })
                      : t('autoIngestNeverUsed')}
                  </p>
                </div>
                {confirmingId === row.id ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); void revoke(row.id) }}
                    className="hit-44 shrink-0 h-8 px-3 rounded-full bg-red-600 text-white text-[13px] leading-[18px] font-medium active:bg-red-700 transition-colors"
                  >
                    {t('autoIngestRevokeConfirm')}
                  </button>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmingId(row.id) }}
                    className="hit-44 shrink-0 h-8 px-3 rounded-full text-[13px] leading-[18px] text-red-600 active:bg-red-50 transition-colors"
                  >
                    {t('autoIngestRevoke')}
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* 入口地址 */}
        <p className="px-8 pt-6 pb-2 text-[13px] leading-[18px] text-gray-500">{t('autoIngestEndpointSection')}</p>
        <div className="mx-4 bg-white rounded-2xl p-4 flex items-center gap-3">
          <p className="flex-1 min-w-0 font-mono text-[13px] leading-[20px] text-gray-900 break-all select-all">{endpoint}</p>
          <CopyButton text={endpoint} />
        </div>
        <p className="px-8 pt-3 text-[13px] leading-[20px] text-gray-500">{t('autoIngestFootnote')}</p>
      </div>
    </div>
  )
}
