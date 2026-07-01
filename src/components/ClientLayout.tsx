'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { fetchAuthMe, needsSubscription } from '@/lib/ewentcast-session'
import { Sidebar } from './Sidebar'
import { PageLoader } from './Loader'
import { EwentcastLogo } from './EwentcastLogo'
import '@/app/app-shell.css'

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/channels': 'Channels',
  '/events': 'Events',
  '/bookings': 'Bookings',
  '/settings': 'Settings',
  '/create': 'Create Event',
}

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const isLandingPage = pathname === '/'
  const isLoginPage = pathname === '/login'
  const isSignupPage = pathname === '/signup'
  const isSubscribePage = pathname === '/subscribe'
  const isCreatePage = pathname === '/create'
  const isForgotPage = pathname === '/forgot-password'
  const isResetPage = pathname === '/reset-password'
  const barePage = isLandingPage || isLoginPage || isSignupPage || isSubscribePage || isCreatePage || isForgotPage || isResetPage
  const [ready, setReady] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const mobileTitle = (() => {
    if (pathname.includes('create=1')) return 'Create Event'
    const base = pathname.split('?')[0]
    return PAGE_TITLES[base] ?? 'Ewentcast'
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
    if (isLandingPage || isLoginPage || isSignupPage || isForgotPage || isResetPage) {
      setReady(true)
      return
    }

    const checkAuth = async () => {
      if (!getToken()) {
        router.replace('/login')
        return
      }

      if (isSubscribePage) {
        setReady(true)
        return
      }

      await fetchAuthMe()

      if (needsSubscription() && !isSubscribePage) {
        router.replace('/subscribe')
        return
      }

      setReady(true)
    }

    if (isCreatePage) {
      checkAuth()
      return
    }

    checkAuth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLandingPage, isLoginPage, isSignupPage, isSubscribePage, isCreatePage, isForgotPage, isResetPage])

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
        <main className="app-main">{children}</main>
      </div>
    </>
  )
}
