'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { getUser, clearAuth, authHeader, type HtUser } from '@/lib/auth'

const NAV_LINKS = [
  { href: '/', label: 'Dashboard', icon: '⊞' },
  { href: '/events?create=1', label: 'Create Event', icon: '✦' },
  { href: '/channels', label: 'Channels', icon: '⛓' },
  { href: '/events', label: 'Events', icon: '📅' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
]

export function Sidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<HtUser | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    setUser(getUser())
  }, [])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/hightribe/logout', {
        method: 'POST',
        headers: { Authorization: authHeader(), Accept: 'application/json' },
      })
    } catch {
      // ignore errors — clear locally regardless
    }
    clearAuth()
    router.replace('/login')
  }

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : '?'

  return (
    <aside
      style={{
        width: '228px',
        flexShrink: 0,
        background: '#161b22',
        borderRight: '1px solid #30363d',
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 100,
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '20px 16px',
          borderBottom: '1px solid #30363d',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #388bfd, #a78bfa)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '16px',
            flexShrink: 0,
          }}
        >
          ⚡
        </div>
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: '#e6edf3', lineHeight: 1 }}>
            EventLifter
          </div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>
            Channel Manager
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {NAV_LINKS.map(({ href, label, icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '9px 12px',
                borderRadius: '6px',
                marginBottom: '2px',
                textDecoration: 'none',
                color: active ? '#e6edf3' : '#8b949e',
                background: active ? '#1c2128' : 'transparent',
                fontSize: '14px',
                fontWeight: active ? 500 : 400,
                transition: 'all 0.15s',
              }}
            >
              <span style={{ fontSize: '15px', opacity: active ? 1 : 0.7 }}>{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User info + logout */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #30363d' }}>
        {user ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #a78bfa, #388bfd)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#fff',
                  flexShrink: 0,
                }}
              >
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#e6edf3',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.name}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#8b949e',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {user.email}
                </div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              style={{
                width: '100%',
                background: 'none',
                border: '1px solid #30363d',
                borderRadius: '6px',
                color: '#8b949e',
                padding: '6px',
                fontSize: '12px',
                cursor: loggingOut ? 'default' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                opacity: loggingOut ? 0.5 : 1,
              }}
            >
              ⎋ {loggingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </>
        ) : (
          <Link
            href="/login"
            style={{
              display: 'block',
              textAlign: 'center',
              background: '#388bfd',
              borderRadius: '6px',
              color: '#fff',
              padding: '7px',
              fontSize: '13px',
              fontWeight: 500,
              textDecoration: 'none',
            }}
          >
            Sign in
          </Link>
        )}
      </div>
    </aside>
  )
}
