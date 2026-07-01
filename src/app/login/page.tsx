'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import { fetchAuthMe, loginLocal } from '@/lib/ewentcast-session'
import { InlineLoader } from '@/components/Loader'
import { AuthShowcase } from '@/components/auth/AuthShowcase'
import { EWENTCAST_WORDMARK, HIGHTRIBE_COLOR, LUMA_COLOR, EVENTBRITE_COLOR } from '@/lib/brand'

const REMEMBER_EMAIL_KEY = 'ewentcast_login_email'
const HT_LOGIN_ENABLED = false

const PLATFORMS = [
  { name: 'Eventbrite', color: EVENTBRITE_COLOR },
  { name: 'Luma', color: LUMA_COLOR },
  { name: 'Hightribe', color: HIGHTRIBE_COLOR },
]

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberEmail, setRememberEmail] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
  }, [router])

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY)
    if (saved) {
      setEmail(saved)
      setRememberEmail(true)
    }
  }, [])

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
              Sign in with your Ewentcast account to manage events across every channel.
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

              <button type="submit" disabled={loading} className="auth-btn-primary">
                {loading ? <InlineLoader label="Signing in" /> : 'Sign in →'}
              </button>

              <div className="auth-divider">or</div>

              <button
                type="button"
                disabled
                className="auth-btn-ghost auth-btn-ghost--disabled"
                title="Sign in with HighTribe is temporarily unavailable"
                aria-disabled="true"
              >
                Sign in with HighTribe
              </button>
              {!HT_LOGIN_ENABLED && (
                <p className="auth-footer-note" style={{ marginTop: 8, marginBottom: 0, textAlign: 'center' }}>
                  HighTribe login coming soon — use your Ewentcast email and password above.
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
