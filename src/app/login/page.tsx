'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { isEwentcastAuthenticated } from '@/lib/auth'
import {
  fetchAuthMe,
  loginLocal,
  loginWithHightribe,
  loginWithHightribeToken,
} from '@/lib/ewentcast-session'
import {
  clearHightribeSsoParams,
  readHightribeBrowserToken,
  resolveHightribeTokenWithBridge,
  startHightribePopupBridge,
} from '@/lib/hightribe-sso'
import { InlineLoader } from '@/components/Loader'
import { AuthShowcase } from '@/components/auth/AuthShowcase'
import { EWENTCAST_WORDMARK, HIGHTRIBE_COLOR, LUMA_COLOR, EVENTBRITE_COLOR } from '@/lib/brand'

const REMEMBER_EMAIL_KEY = 'ewentcast_login_email'

const PLATFORMS = [
  { name: 'Eventbrite', color: EVENTBRITE_COLOR },
  { name: 'Luma', color: LUMA_COLOR },
  { name: 'Hightribe', color: HIGHTRIBE_COLOR },
]

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionReason = searchParams.get('reason')
  const htSso = searchParams.get('ht_sso') === '1'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [htLoading, setHtLoading] = useState(false)
  const [showHtForm, setShowHtForm] = useState(false)
  const [htEmail, setHtEmail] = useState('')
  const [htPassword, setHtPassword] = useState('')
  const [showHtPassword, setShowHtPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (sessionReason === 'session') {
      setError('Your session expired. Please sign in again.')
    }
  }, [sessionReason])

  useEffect(() => {
    if (isEwentcastAuthenticated()) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY)
    if (saved) {
      setEmail(saved)
      setRememberEmail(true)
    }
  }, [])

  const completeHightribeSignIn = useCallback(async (token?: string) => {
    setHtLoading(true)
    setError('')
    try {
      await loginWithHightribeToken(token)
      await fetchAuthMe()
      router.replace('/dashboard')
    } catch (err) {
      clearHightribeSsoParams()
      setError(err instanceof Error ? err.message : 'HighTribe sign-in failed')
    } finally {
      setHtLoading(false)
    }
  }, [router])

  useEffect(() => {
    if (!htSso && !searchParams.get('ht_token')) return
    if (isEwentcastAuthenticated()) return
    if (!readHightribeBrowserToken()) return
    void completeHightribeSignIn()
  }, [htSso, searchParams, completeHightribeSignIn])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      setError('Email and password are required')
      return
    }
    setLoading(true)
    setError('')
    try {
      await loginLocal(email, password)

      if (rememberEmail) {
        localStorage.setItem(REMEMBER_EMAIL_KEY, email)
      } else {
        localStorage.removeItem(REMEMBER_EMAIL_KEY)
      }

      await fetchAuthMe()
      router.replace('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleHightribeSignIn = () => {
    setError('')

    const localToken = readHightribeBrowserToken()
    if (localToken) {
      void completeHightribeSignIn(localToken)
      return
    }

    // Must open popup synchronously on click — browsers block it after await.
    const popupBridge = startHightribePopupBridge()

    void (async () => {
      setHtLoading(true)
      try {
        const { token, popupBlocked } = await resolveHightribeTokenWithBridge(popupBridge)
        if (token) {
          await completeHightribeSignIn(token)
          return
        }

        if (popupBlocked) {
          setError('Popups are blocked. Allow popups for this site, then try again.')
        } else {
          setError(
            'Could not read your HighTribe session. The HighTribe SSO bridge must redirect back with your token, or sign in with your HighTribe email below.',
          )
        }
        setShowHtForm(true)
      } finally {
        popupBridge?.close()
        setHtLoading(false)
      }
    })()
  }

  const handleHightribeCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!htEmail || !htPassword) {
      setError('HighTribe email and password are required')
      return
    }
    setHtLoading(true)
    setError('')
    try {
      await loginWithHightribe(htEmail, htPassword)
      await fetchAuthMe()
      router.replace('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'HighTribe sign-in failed')
    } finally {
      setHtLoading(false)
    }
  }

  const busy = loading || htLoading

  return (
    <div className="auth-page">
      <div className="auth-page-bg" aria-hidden="true" />
      <AuthShowcase />

      <div className="auth-panel">
        <div className="auth-panel-inner">
          <header className="auth-header">
            <Link href="/" className="auth-logo-link">
              <img src={EWENTCAST_WORDMARK} alt="Ewentcast" />
            </Link>
            <span className="auth-badge">Welcome back</span>
            <h1 className="auth-title">Sign in to your studio</h1>
            <p className="auth-subtitle">
              Manage events across HighTribe, Luma, and Eventbrite.
            </p>
          </header>

          <div className="auth-card">
            <form onSubmit={handleSubmit} className="auth-form">
              {error && (
                <div className="auth-error" role="alert" aria-live="polite">
                  {error}
                </div>
              )}

              <div className="auth-field">
                <label className="auth-label" htmlFor="login-email">
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  aria-invalid={!!error}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="auth-input"
                />
              </div>

              <div className="auth-field">
                <div className="auth-row">
                  <label className="auth-label" htmlFor="login-password">
                    Password
                  </label>
                  <Link href="/forgot-password" className="auth-link auth-link--sm">
                    Forgot password?
                  </Link>
                </div>
                <div className="auth-input-wrap">
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    aria-invalid={!!error}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    className="auth-input"
                  />
                  <button
                    type="button"
                    className="auth-toggle-pw"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              <label className="auth-checkbox">
                <input
                  type="checkbox"
                  checked={rememberEmail}
                  onChange={(e) => setRememberEmail(e.target.checked)}
                />
                Remember my email
              </label>

              <button type="submit" disabled={busy} className="auth-btn-primary">
                {loading ? <InlineLoader label="Signing in" /> : 'Sign in →'}
              </button>

              <div className="auth-divider">or</div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleHightribeSignIn()}
                className="auth-btn-ghost"
                style={{ borderColor: `${HIGHTRIBE_COLOR}44`, color: HIGHTRIBE_COLOR }}
              >
                {htLoading && !showHtForm ? (
                  <InlineLoader label="Connecting HighTribe" />
                ) : (
                  'Sign in with HighTribe'
                )}
              </button>

              {showHtForm && !readHightribeBrowserToken() && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '14px',
                    borderRadius: '10px',
                    border: `1px solid ${HIGHTRIBE_COLOR}33`,
                    background: 'rgba(209,71,157,0.06)',
                  }}
                >
                  <p style={{ margin: '0 0 12px', fontSize: '12px', color: '#8C7F6D', lineHeight: 1.5 }}>
                    Enter your HighTribe email and password — you stay on Ewentcast.
                  </p>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="login-ht-email">
                      HighTribe email
                    </label>
                    <input
                      id="login-ht-email"
                      type="email"
                      autoComplete="email"
                      value={htEmail}
                      onChange={(e) => setHtEmail(e.target.value)}
                      placeholder="you@hightribe.com"
                      className="auth-input"
                    />
                  </div>
                  <div className="auth-field" style={{ marginTop: '10px' }}>
                    <label className="auth-label" htmlFor="login-ht-password">
                      HighTribe password
                    </label>
                    <div className="auth-input-wrap">
                      <input
                        id="login-ht-password"
                        type={showHtPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={htPassword}
                        onChange={(e) => setHtPassword(e.target.value)}
                        placeholder="Your HighTribe password"
                        className="auth-input"
                      />
                      <button
                        type="button"
                        className="auth-toggle-pw"
                        onClick={() => setShowHtPassword((v) => !v)}
                        aria-label={showHtPassword ? 'Hide password' : 'Show password'}
                        aria-pressed={showHtPassword}
                      >
                        {showHtPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={htLoading || !htEmail || !htPassword}
                    onClick={(e) => void handleHightribeCredentials(e)}
                    className="auth-btn-primary"
                    style={{ marginTop: '12px', width: '100%' }}
                  >
                    {htLoading ? <InlineLoader label="Signing in" /> : 'Continue with HighTribe →'}
                  </button>
                </div>
              )}

              {!showHtForm && (
                <p className="auth-footer-note" style={{ marginTop: 4, marginBottom: 0, textAlign: 'center' }}>
                  Uses your HighTribe browser session when available.
                </p>
              )}
            </form>

            <div className="auth-divider">Works with</div>
            <div className="auth-platforms">
              {PLATFORMS.map((p) => (
                <span key={p.name} className="auth-platform-pill">
                  <span style={{ background: p.color }} />
                  {p.name}
                </span>
              ))}
            </div>

            <p className="auth-footer-note">
              New to Ewentcast?{' '}
              <Link href="/signup" className="auth-link">
                Start your free trial
              </Link>
              {' — '}
              <strong>$20/mo</strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
