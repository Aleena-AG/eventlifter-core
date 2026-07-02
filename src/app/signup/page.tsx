'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import { registerLocal } from '@/lib/ewentcast-session'
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
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
  }, [router])

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

              <button type="submit" disabled={loading} className="auth-btn-primary">
                {loading ? <InlineLoader label="Creating account" /> : 'Sign up — $20/mo →'}
              </button>
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
