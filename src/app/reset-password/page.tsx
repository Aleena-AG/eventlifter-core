'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { resetPassword } from '@/lib/ewentcast-session'
import { InlineLoader } from '@/components/Loader'
import { EwentcastLogo } from '@/components/EwentcastLogo'
import { AuthShowcase } from '@/components/auth/AuthShowcase'

function ResetForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      setError('Missing reset token')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    setError('')
    try {
      await resetPassword(token, password)
      setDone(true)
      setTimeout(() => router.replace('/login'), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-card">
      {done ? (
        <p style={{ fontSize: 14, color: '#4E7A4B' }}>
          Password updated. Redirecting to sign in…
        </p>
      ) : !token ? (
        <div>
          <p className="auth-error">Invalid reset link.</p>
          <Link href="/forgot-password" className="auth-link">Request a new link</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="auth-error" role="alert">{error}</div>}
          <div className="auth-field">
            <label className="auth-label" htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input"
            />
          </div>
          <div className="auth-field">
            <label className="auth-label" htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="auth-input"
            />
          </div>
          <button type="submit" disabled={loading} className="auth-btn-primary">
            {loading ? <InlineLoader label="Updating" /> : 'Update password'}
          </button>
        </form>
      )}
    </div>
  )
}

export default function ResetPasswordPage() {
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
            <h1 className="auth-title">Choose a new password</h1>
          </header>

          <Suspense fallback={<div className="auth-card"><InlineLoader label="Loading" /></div>}>
            <ResetForm />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
