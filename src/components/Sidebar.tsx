'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { getUser, clearAuth, authHeader, type HtUser } from '@/lib/auth'
import { logoutLocal, shouldShowBilling } from '@/lib/ewentcast-session'
import { InlineLoader } from '@/components/Loader'
import { EwentcastLogo } from '@/components/EwentcastLogo'
import { SidebarNavIcon } from '@/components/SidebarNavIcon'

const NAV_LINKS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' as const },
  { href: '/events?create=1', label: 'Create Event', icon: 'create' as const },
  { href: '/channels', label: 'Channels', icon: 'channels' as const },
  { href: '/events', label: 'Events', icon: 'events' as const },
  { href: '/billing', label: 'Billing', icon: 'billing' as const, ewentcastOnly: true as const },
  { href: '/settings', label: 'Settings', icon: 'settings' as const },
]

function isNavActive(pathname: string, href: string): boolean {
  const base = href.split('?')[0]
  if (base === '/dashboard') return pathname === '/dashboard'
  if (href.includes('create=1')) return pathname === '/create'
  return pathname === base || pathname.startsWith(`${base}/`)
}

type SidebarProps = {
  mobileOpen?: boolean
  onNavigate?: () => void
  onClose?: () => void
}

export function Sidebar({ mobileOpen = false, onNavigate, onClose }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [user, setUser] = useState<HtUser | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)
  const showBilling = shouldShowBilling()

  useEffect(() => {
    setUser(getUser())
  }, [pathname])

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logoutLocal()
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
    <aside className={`app-sidebar${mobileOpen ? ' app-sidebar--open' : ''}`}>
      <div className="app-sidebar-head">
        <Link href="/dashboard" className="app-sidebar-logo" onClick={onNavigate}>
          <EwentcastLogo responsive />
        </Link>
        <button
          type="button"
          className="app-sidebar-close"
          onClick={onClose}
          aria-label="Close menu"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <nav className="app-sidebar-nav">
        {NAV_LINKS.filter((link) => !('ewentcastOnly' in link) || showBilling).map(({ href, label, icon }) => {
          const active = isNavActive(pathname, href)
          return (
            <Link
              key={href}
              href={href}
              className={`app-sidebar-link${active ? ' app-sidebar-link--active' : ''}`}
              onClick={onNavigate}
            >
              <span className="app-sidebar-icon">
                <SidebarNavIcon name={icon} />
              </span>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="app-sidebar-foot">
        {user ? (
          <>
            <div className="app-sidebar-user">
              <div className="app-sidebar-avatar">{initials}</div>
              <div style={{ minWidth: 0 }}>
                <div className="app-sidebar-name">{user.name}</div>
                <div className="app-sidebar-email">{user.email}</div>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="app-sidebar-logout"
              type="button"
              style={{ opacity: loggingOut ? 0.5 : 1 }}
            >
              {loggingOut ? <InlineLoader label="Signing out" /> : 'Sign out'}
            </button>
          </>
        ) : (
          <Link href="/login" className="app-sidebar-signin">
            Sign in
          </Link>
        )}
      </div>
    </aside>
  )
}
