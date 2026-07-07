'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { fetchAuthMe, isEwentcastSignupUser, isHightribeNativeUser, needsSubscription } from '@/lib/ewentcast-session'
import { Sidebar } from './Sidebar'
import { TrialWarningBanner } from './TrialWarningBanner'
import { PageLoader } from './Loader'
import { EwentcastLogo } from './EwentcastLogo'
import '@/app/app-shell.css'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/channels': 'Channels',
  '/events': 'Events',
  '/bookings': 'Bookings',
  '/billing': 'Billing',
  '/settings': 'Settings',
  '/create': 'Create Event',
}

const BARE_PATHS = new Set([
  '/',
  '/login',
  '/signup',
  '/subscribe',
  '/create',
  '/forgot-password',
  '/reset-password',
])

function isBarePath(pathname: string): boolean {
  return BARE_PATHS.has(pathname.split('?')[0])
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const pathBase = pathname.split('?')[0]
  const isSubscribePage = pathBase === '/subscribe'
  const barePage = isBarePath(pathname)
  const [ready, setReady] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const authChecked = useRef(false)

  const mobileTitle = (() => {
    if (pathname.includes('create=1')) return 'Create Event'
    if (/^\/events\/[^/]+\/[^/]+$/.test(pathname)) return 'Event Dashboard'
    return PAGE_TITLES[pathBase] ?? 'Ewentcast'
  })()

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!sidebarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [sidebarOpen])

  useEffect(() => {
    if (barePage) {
      setReady(true)
      authChecked.current = false
      return
    }

    let cancelled = false

    const checkAuth = async () => {
      if (!getToken()) {
        router.replace('/login')
        return
      }

      if (!authChecked.current) {
        setReady(false)
        await fetchAuthMe()
        authChecked.current = true
        if (cancelled) return

        if (!getToken()) {
          router.replace('/login?reason=session')
          return
        }
      }

      if (!isSubscribePage && isEwentcastSignupUser() && needsSubscription()) {
        router.replace('/subscribe')
        return
      }

      if (pathBase === '/billing' && isHightribeNativeUser()) {
        router.replace('/dashboard')
        return
      }

      setReady(true)
    }

    void checkAuth()

    return () => {
      cancelled = true
    }
  }, [pathname, barePage, isSubscribePage, router])

  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--canvas)',
        }}
      >
        <PageLoader label="Loading…" />
      </div>
    )
  }

  if (barePage) return <>{children}</>

  return (
    <>
      <header className="app-mobile-topbar">
        <button
          type="button"
          className="app-mobile-menu-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          aria-expanded={sidebarOpen}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
        <Link href="/dashboard" className="app-mobile-topbar-brand" aria-label="Ewentcast home">
          <EwentcastLogo height={26} wordmarkOnly />
        </Link>
        <span className="app-mobile-topbar-title">{mobileTitle}</span>
      </header>

      {sidebarOpen && (
        <button
          type="button"
          className="app-sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close menu"
        />
      )}

      <Sidebar
        mobileOpen={sidebarOpen}
        onNavigate={() => setSidebarOpen(false)}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="app-main-wrap">
        <TrialWarningBanner />
        <main className="app-main">{children}</main>
      </div>
    </>
  )
}
