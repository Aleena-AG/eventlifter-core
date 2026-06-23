'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { setToken, setUser, isAuthenticated } from '@/lib/auth'
import { fetchEwentcastMe } from '@/lib/ewentcast-session'
import { InlineLoader } from '@/components/Loader'
import { EwentcastLogo } from '@/components/EwentcastLogo'

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

  useEffect(() => {
    if (isAuthenticated()) router.replace('/dashboard')
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
      await fetchEwentcastMe()
      router.replace('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#FFFFFF',
    border: '1px solid #E8DFD0',
    borderRadius: '10px',
    padding: '10px 14px',
    fontSize: '14px',
    color: '#211B16',
    outline: 'none',
    boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#FBF7F0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 9999 }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'inline-block' }}>
            <EwentcastLogo height={48} style={{ margin: '0 auto' }} />
            <p style={{ margin: '14px 0 0', fontSize: '14px', color: '#8C7F6D' }}>
              Sign in with your HighTribe account
            </p>
          </Link>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E8DFD0', borderRadius: '16px', padding: '28px', boxShadow: '0 14px 40px rgba(33, 27, 22, 0.06)' }}>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {error && (
              <div style={{ background: 'rgba(194, 80, 46, 0.08)', border: '1px solid rgba(194, 80, 46, 0.35)', borderRadius: '10px', padding: '10px 14px', color: '#C2502E', fontSize: '13px' }}>
                {error}
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '7px' }}>Email</label>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '7px' }}>Password</label>
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" style={inputStyle} />
            </div>

            <button type="submit" disabled={loading} style={{ width: '100%', background: loading ? '#F1EADC' : '#D98A2B', border: 'none', borderRadius: '11px', color: loading ? '#8C7F6D' : '#fff', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'default' : 'pointer' }}>
              {loading ? <InlineLoader label="Signing in" /> : 'Sign in'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '18px', fontSize: '13px', color: '#8C7F6D' }}>
            New to Ewentcast?{' '}
            <Link href="/signup" style={{ color: '#D98A2B', textDecoration: 'none' }}>Sign up — $20/mo</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
