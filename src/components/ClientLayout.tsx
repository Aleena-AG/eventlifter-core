'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { fetchAuthMe, needsSubscription } from '@/lib/ewentcast-session'
import { Sidebar } from './Sidebar'
import { PageLoader } from './Loader'
import '@/app/app-shell.css'

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
      <Sidebar />
      <div className="app-main-wrap">
        <main className="app-main">{children}</main>
      </div>
    </>
  )
}
