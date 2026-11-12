import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLanguage } from '../contexts/LanguageContext'
import type { Lang } from '../lib/i18n'
import PasswordInput from '../components/PasswordInput'
import Segmented from '../components/Segmented'

type Mode = 'login' | 'register' | 'forgot'

export default function Auth() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signUp, resetPassword } = useAuth()
  const { t, lang, setLang } = useLanguage()
  const navigate = useNavigate()

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
    setMessage('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (password.length < 6) {
      setError(t('passwordTooShort'))
      return
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    setLoading(true)

    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) {
        setError(
          error.message.includes('Invalid login credentials')
            ? t('loginError')
            : error.message
        )
      } else {
        navigate('/')
      }
    } else {
      const { error } = await signUp(email, password)
      if (error) {
        setError(
          error.message.includes('already registered')
            ? t('emailExistsError')
            : error.message
        )
      } else {
        setMessage(t('registerSuccess'))
        setPassword('')
        setConfirmPassword('')
      }
    }

    setLoading(false)
  }

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)
    const { error } = await resetPassword(email)
    if (error) {
      const msg = error.message.toLowerCase()
      if (msg.includes('rate limit') || msg.includes('too many')) {
        setError(t('forgotRateLimit'))
      } else {
        setError(t('forgotSendFailed'))
      }
    } else {
      setMessage(t('forgotEmailSent'))
    }
    setLoading(false)
  }

  const inputClass = 'w-full px-4 h-12 rounded-xl border border-transparent bg-gray-50 focus:outline-none focus:border-primary/40 text-base text-gray-900 placeholder:text-gray-400 transition-colors'

  const agreement = t('loginAgreement')
  const linkText = t('loginAgreementLinkText')
  const agreementParts = agreement.split(linkText)

  return (
    // h-app + overflow-y-auto：html/body 是 overflow:hidden，页面自己得能滚（小屏 + 键盘弹出时）
    <div className="anim-page h-app max-w-md mx-auto overflow-y-auto bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="shrink-0 px-2 pt-safe-2 flex justify-end">
        <button
          onClick={() => setLang((lang === 'zh' ? 'en' : 'zh') as Lang)}
          className="h-11 px-3 text-base font-medium text-primary active:opacity-60"
        >
          {lang === 'zh' ? 'EN' : '中'}
        </button>
      </div>
      <div className="shrink-0 px-6 pt-6 pb-8 text-center">
        <img src="/icons/pwa-192.png" alt="" className="w-[76px] h-[76px] rounded-[18px] mx-auto mb-4" />
        <h1 className="text-[28px] leading-[34px] font-bold text-gray-900">{t('appName')}</h1>
      </div>

      {/* Card */}
      <div className="flex-1 px-4 pb-safe-6">
        <div className="bg-white rounded-2xl p-5">

          {mode === 'forgot' ? (
            /* ── Forgot password view ── */
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="mb-2">
                <h2 className="text-lg font-semibold text-gray-900">{t('forgotPasswordTitle')}</h2>
                <p className="text-sm text-gray-500 mt-1">{t('forgotPasswordDesc')}</p>
              </div>

              <div>
                <label className="block text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1">{t('emailLabel')}</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t('emailPlaceholder')}
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  <span>{error}</span>
                </div>
              )}

              {message ? (
                <div className="flex items-start gap-2 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl">
                  <span className="shrink-0 mt-0.5">✅</span>
                  <span>{message}</span>
                </div>
              ) : (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white h-[50px] rounded-xl font-semibold text-base active:bg-primary-dark disabled:opacity-60 transition-colors mt-1"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {t('forgotSending')}
                    </span>
                  ) : t('forgotSendBtn')}
                </button>
              )}

              <p className="text-center text-sm text-gray-500 mt-2">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="text-primary font-medium py-2 px-2 active:opacity-60"
                >
                  {t('forgotBackToLogin')}
                </button>
              </p>
            </form>
          ) : (
            /* ── Login / Register view ── */
            <>
              <Segmented
                className="mb-5"
                options={[
                  { value: 'login' as const, label: t('loginTab') },
                  { value: 'register' as const, label: t('registerTab') },
                ]}
                value={mode}
                onChange={switchMode}
              />

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1">{t('emailLabel')}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('emailPlaceholder')}
                    required
                    autoComplete="email"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="block text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1">{t('passwordLabel')}</label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder={t('passwordPlaceholder')}
                    required
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  {mode === 'login' && (
                    <div className="flex justify-end mt-1.5">
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-[13px] leading-[18px] py-1.5 text-primary active:opacity-60"
                      >
                        {t('forgotPasswordLink')}
                      </button>
                    </div>
                  )}
                </div>

                {mode === 'register' && (
                  <div>
                    <label className="block text-[13px] leading-[18px] text-gray-500 mb-1.5 px-1">{t('confirmPasswordLabel')}</label>
                    <PasswordInput
                      value={confirmPassword}
                      onChange={setConfirmPassword}
                      placeholder={t('confirmPasswordPlaceholder')}
                      required
                      autoComplete="new-password"
                    />
                  </div>
                )}

                {error && (
                  <div className="flex items-start gap-2 bg-red-50 text-red-600 text-sm px-4 py-3 rounded-xl">
                    <span className="shrink-0 mt-0.5">⚠️</span>
                    <span>{error}</span>
                  </div>
                )}

                {message && (
                  <div className="flex items-start gap-2 bg-green-50 text-green-700 text-sm px-4 py-3 rounded-xl">
                    <span className="shrink-0 mt-0.5">✅</span>
                    <span>{message}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-primary text-white h-[50px] rounded-xl font-semibold text-base active:bg-primary-dark disabled:opacity-60 transition-colors mt-1"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      {t('loadingBtn')}
                    </span>
                  ) : mode === 'login' ? t('loginBtn') : t('registerBtn')}
                </button>
              </form>

              {mode === 'login' && (
                <p className="text-center text-sm text-gray-500 mt-3">
                  {t('noAccount')}
                  <button onClick={() => switchMode('register')} className="text-primary font-medium ml-1 py-2 active:opacity-60">
                    {t('registerNow')}
                  </button>
                </p>
              )}
            </>
          )}
        </div>

        <p className="text-center text-xs leading-[18px] text-gray-400 mt-5 px-6">
          {agreementParts.length === 2 ? (
            <>
              {agreementParts[0]}
              <Link to="/about" className="text-primary hover:underline">
                {linkText}
              </Link>
              {agreementParts[1]}
            </>
          ) : agreement}
        </p>
      </div>
    </div>
  )
}
