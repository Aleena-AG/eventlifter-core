'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { isEwentcastAuthenticated } from '@/lib/auth'
import {
  fetchAuthMe,
  getEwentcastAccount,
  loginWithHightribe,
  loginWithHightribeToken,
  registerLocal,
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

const PLATFORMS = [
  { name: 'Eventbrite', color: EVENTBRITE_COLOR },
  { name: 'Luma', color: LUMA_COLOR },
  { name: 'Hightribe', color: HIGHTRIBE_COLOR },
]

export default function SignupPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const htSso = searchParams.get('ht_sso') === '1'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [htLoading, setHtLoading] = useState(false)
  const [showHtForm, setShowHtForm] = useState(false)
  const [htEmail, setHtEmail] = useState('')
  const [htPassword, setHtPassword] = useState('')
  const [showHtPassword, setShowHtPassword] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isEwentcastAuthenticated()) router.replace('/dashboard')
  }, [router])

  const routeAfterHightribeAuth = useCallback(() => {
    const account = getEwentcastAccount()
    if (account?.auth_source === 'hightribe_native' || account?.subscription_active) {
      router.replace('/dashboard')
    } else {
      router.replace('/subscribe')
    }
  }, [router])

  const completeHightribeSignup = useCallback(async (token?: string) => {
    setHtLoading(true)
    setError('')
    try {
      await loginWithHightribeToken(token)
      await fetchAuthMe()
      routeAfterHightribeAuth()
    } catch (err) {
      clearHightribeSsoParams()
      setError(err instanceof Error ? err.message : 'HighTribe sign-up failed')
    } finally {
      setHtLoading(false)
    }
  }, [routeAfterHightribeAuth])

  useEffect(() => {
    if (!htSso && !searchParams.get('ht_token')) return
    if (isEwentcastAuthenticated()) return
    if (!readHightribeBrowserToken()) return
    void completeHightribeSignup()
  }, [htSso, searchParams, completeHightribeSignup])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name || !email || !password) {
      setError('All fields are required')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { ewentcast } = await registerLocal({ name, email, password })
      if (ewentcast.subscription_active) {
        router.replace('/dashboard')
      } else {
        router.replace('/subscribe')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  const handleHightribeSignupClick = () => {
    setError('')

    const localToken = readHightribeBrowserToken()
    if (localToken) {
      void completeHightribeSignup(localToken)
      return
    }

    const popupBridge = startHightribePopupBridge()

    void (async () => {
      setHtLoading(true)
      try {
        const { token, popupBlocked } = await resolveHightribeTokenWithBridge(popupBridge)
        if (token) {
          await completeHightribeSignup(token)
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
      routeAfterHightribeAuth()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'HighTribe sign-up failed')
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
            <span className="auth-badge">Get started</span>
            <h1 className="auth-title">Create your studio</h1>
            <p className="auth-subtitle">
              <span className="auth-subtitle-branded">
                <span className="auth-subtitle-row">
                  $20/month · Luma &amp; Eventbrite included
                </span>
                <span className="auth-subtitle-row">14-day money-back guarantee.</span>
              </span>
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
                <label className="auth-label" htmlFor="signup-name">
                  Name
                </label>
                <input
                  id="signup-name"
                  type="text"
                  required
                  autoComplete="name"
                  aria-invalid={!!error}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your name"
                  className="auth-input"
                />
              </div>

              <div className="auth-field">
                <label className="auth-label" htmlFor="signup-email">
                  Email
                </label>
                <input
                  id="signup-email"
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
                <label className="auth-label" htmlFor="signup-password">
                  Password
                </label>
                <div className="auth-input-wrap">
                  <input
                    id="signup-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    aria-invalid={!!error}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Min. 8 characters"
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

              <button type="submit" disabled={busy} className="auth-btn-primary">
                {loading ? <InlineLoader label="Creating account" /> : 'Sign up — $20/mo →'}
              </button>

              <div className="auth-divider">or</div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleHightribeSignupClick()}
                className="auth-btn-ghost"
                style={{ borderColor: `${HIGHTRIBE_COLOR}44`, color: HIGHTRIBE_COLOR }}
              >
                {htLoading && !showHtForm ? (
                  <InlineLoader label="Connecting HighTribe" />
                ) : (
                  'Sign up with HighTribe'
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
                    Sign in with your HighTribe account to continue.
                  </p>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="signup-ht-email">
                      HighTribe email
                    </label>
                    <input
                      id="signup-ht-email"
                      type="email"
                      autoComplete="email"
                      value={htEmail}
                      onChange={(e) => setHtEmail(e.target.value)}
                      placeholder="you@hightribe.com"
                      className="auth-input"
                    />
                  </div>
                  <div className="auth-field" style={{ marginTop: '10px' }}>
                    <label className="auth-label" htmlFor="signup-ht-password">
                      HighTribe password
                    </label>
                    <div className="auth-input-wrap">
                      <input
                        id="signup-ht-password"
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
                <p className="auth-footer-note" style={{ marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                  Uses your existing HighTribe login from this browser when available.
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
              Already have an account?{' '}
              <Link href="/login" className="auth-link">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
