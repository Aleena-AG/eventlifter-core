'use client'

import { useState } from 'react'
import Link from 'next/link'
import { requestPasswordReset } from '@/lib/ewentcast-session'
import { InlineLoader } from '@/components/Loader'
import { EwentcastLogo } from '@/components/EwentcastLogo'
import { AuthShowcase } from '@/components/auth/AuthShowcase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetUrl, setResetUrl] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email) {
      setError('Email is required')
      return
    }
    setLoading(true)
    setError('')
    setResetUrl('')
    try {
      const result = await requestPasswordReset(email)
      setSent(true)
      if (result.resetUrl) setResetUrl(result.resetUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
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
            <Link href="/login" className="auth-logo-link">
              <EwentcastLogo height={52} onLight style={{ margin: '0 auto' }} />
            </Link>
            <h1 className="auth-title">Reset your password</h1>
            <p className="auth-subtitle">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </header>

          <div className="auth-card">
            {sent ? (
              <div>
                <p style={{ fontSize: 14, color: '#4E7A4B', marginBottom: 12 }}>
                  If an account exists for that email, a reset link has been created.
                </p>
                {resetUrl && (
                  <div style={{ background: '#F1EADC', border: '1px solid #E8DFD0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                    <p style={{ fontSize: 12, color: '#8C7F6D', margin: '0 0 8px' }}>Local dev — use this link:</p>
                    <Link href={resetUrl.replace(/^https?:\/\/[^/]+/, '')} className="auth-link" style={{ wordBreak: 'break-all' }}>
                      {resetUrl.replace(/^https?:\/\/[^/]+/, '')}
                    </Link>
                  </div>
                )}
                <Link href="/login" className="auth-link">← Back to sign in</Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
                {error && <div className="auth-error" role="alert">{error}</div>}
                <div className="auth-field">
                  <label className="auth-label" htmlFor="forgot-email">Email</label>
                  <input
                    id="forgot-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="auth-input"
                    placeholder="you@example.com"
                  />
                </div>
                <button type="submit" disabled={loading} className="auth-btn-primary">
                  {loading ? <InlineLoader label="Sending" /> : 'Send reset link'}
                </button>
                <p className="auth-footer-note">
                  <Link href="/login" className="auth-link">← Back to sign in</Link>
                </p>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
