'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isAuthenticated } from '@/lib/auth'
import { registerEwentcast } from '@/lib/ewentcast-session'
import { InlineLoader } from '@/components/Loader'
import { EwentcastLogo } from '@/components/EwentcastLogo'

export default function SignupPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      const { ewentcast } = await registerEwentcast({ name, email, password })
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
      <div style={{ width: '100%', maxWidth: '420px' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'inline-block' }}>
            <EwentcastLogo height={48} wordmarkOnly style={{ margin: '0 auto' }} />
            <h1 style={{ margin: '14px 0 0', fontSize: '20px', fontWeight: 700, color: '#211B16' }}>Create your account</h1>
            <p style={{ margin: '8px 0 0', fontSize: '14px', color: '#8C7F6D' }}>
              $20/month · Luma & Eventbrite included · 7-day money-back guarantee
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
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '7px' }}>Name</label>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '7px' }}>Email</label>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '7px' }}>Password</label>
              <input type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 8 characters" style={inputStyle} />
            </div>

            <button type="submit" disabled={loading} style={{ width: '100%', background: loading ? '#F1EADC' : '#D98A2B', border: 'none', borderRadius: '11px', color: loading ? '#8C7F6D' : '#fff', padding: '12px', fontSize: '14px', fontWeight: 600, cursor: loading ? 'default' : 'pointer', marginTop: '4px' }}>
              {loading ? <InlineLoader label="Creating account" /> : 'Sign up — $20/mo'}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: '18px', fontSize: '13px', color: '#8C7F6D' }}>
            Already have Hightribe?{' '}
            <Link href="/login" style={{ color: '#D98A2B', textDecoration: 'none' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
