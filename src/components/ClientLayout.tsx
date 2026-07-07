'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getToken } from '@/lib/auth'
import {
  fetchAuthMe,
  isEwentcastSignupUser,
  isHightribeNativeUser,
  needsSubscription,
} from '@/lib/ewentcast-session'
import { PageLoader } from './Loader'
import { AppShell } from './AppShell'

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
  '/sso/return',
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
  }, [pathname, barePage, isSubscribePage, pathBase, router])

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
    <AppShell
      mobileTitle={mobileTitle}
      sidebarOpen={sidebarOpen}
      onOpenSidebar={() => setSidebarOpen(true)}
      onCloseSidebar={() => setSidebarOpen(false)}
      onNavigate={() => setSidebarOpen(false)}
    >
      {children}
    </AppShell>
  )
}
