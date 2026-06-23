'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { getUser, clearAuth, authHeader, type HtUser } from '@/lib/auth'
import { InlineLoader } from '@/components/Loader'
import { EwentcastLogo } from '@/components/EwentcastLogo'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: '⊞' },
  { href: '/events?create=1', label: 'Create Event', icon: '✦' },
  { href: '/channels', label: 'Channels', icon: '⛓' },
  { href: '/events', label: 'Events', icon: '📅' },
  { href: '/bookings', label: 'Bookings', icon: '📋' },
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
        background: '#FFFFFF',
        borderRight: '1px solid #E8DFD0',
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
      <Link
        href="/dashboard"
        style={{
          padding: '16px 14px',
          borderBottom: '1px solid #E8DFD0',
          display: 'block',
          textDecoration: 'none',
        }}
      >
        <EwentcastLogo height={34} wordmarkOnly style={{ margin: '0 auto' }} />
      </Link>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 8px' }}>
        {NAV_LINKS.map(({ href, label, icon }) => {
          const active = pathname === href || (href === '/dashboard' && pathname === '/dashboard')
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
                color: active ? '#211B16' : '#8C7F6D',
                background: active ? '#F1EADC' : 'transparent',
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
      <div style={{ padding: '12px 16px', borderTop: '1px solid #E8DFD0' }}>
        {user ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #D98A2B, #7C5C8A)',
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
                    color: '#211B16',
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
                    color: '#8C7F6D',
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
                border: '1px solid #E8DFD0',
                borderRadius: '6px',
                color: '#8C7F6D',
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
              {loggingOut ? <InlineLoader label="Signing out" /> : '⎋ Sign out'}
            </button>
          </>
        ) : (
          <Link
            href="/login"
            style={{
              display: 'block',
              textAlign: 'center',
              background: '#D98A2B',
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
