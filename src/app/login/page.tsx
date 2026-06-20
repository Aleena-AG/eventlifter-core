'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { setToken, setUser, isAuthenticated } from '@/lib/auth'
import { InlineLoader } from '@/components/Loader'

interface LoginResponse {
  status: boolean
  message?: string
  token?: string
  user?: {
    id: string | number
    name: string
    email: string
    username?: string
    type?: string
    location?: string
    has_business_profile?: boolean
    profile?: { avatar?: string; bio?: string }
  }
  error?: string
}

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated()) router.replace('/')
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) { setError('Email and password are required'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/hightribe/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data: LoginResponse = await res.json()

      if (!res.ok || !data.status || !data.token) {
        setError(data.message || data.error || 'Login failed. Check your credentials.')
        return
      }

      setToken(data.token)
      if (data.user) setUser(data.user)
      router.replace('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: '8px',
    padding: '10px 14px',
    fontSize: '14px',
    color: '#e6edf3',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0d1117',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        zIndex: 9999,
      }}
    >
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div
            style={{
              width: '52px',
              height: '52px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #388bfd, #a78bfa)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '26px',
              margin: '0 auto 16px',
            }}
          >
            ⚡
          </div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#e6edf3' }}>
            EventLifter
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#8b949e' }}>
            Sign in with your HighTribe account
          </p>
        </div>

        {/* Card */}
        <div
          style={{
            background: '#161b22',
            border: '1px solid #30363d',
            borderRadius: '12px',
            padding: '28px',
          }}
        >
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Error */}
            {error && (
              <div
                style={{
                  background: 'rgba(248,81,73,0.1)',
                  border: '1px solid rgba(248,81,73,0.4)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  color: '#f85149',
                  fontSize: '13px',
                }}
              >
                {error}
              </div>
            )}

            {/* Email */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#e6edf3',
                  marginBottom: '7px',
                }}
              >
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
              />
            </div>

            {/* Password */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#e6edf3',
                  marginBottom: '7px',
                }}
              >
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#1c2128' : '#388bfd',
                border: 'none',
                borderRadius: '8px',
                color: loading ? '#8b949e' : '#fff',
                padding: '11px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: loading ? 'default' : 'pointer',
                transition: 'background 0.15s',
                marginTop: '4px',
              }}
            >
              {loading ? <InlineLoader label="Signing in" /> : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: '#8b949e' }}>
          EventLifter Channel Manager · Powered by HighTribe
        </p>
      </div>
    </div>
  )
}
