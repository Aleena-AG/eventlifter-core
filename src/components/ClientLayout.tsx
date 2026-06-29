'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { fetchEwentcastMe, needsSubscription } from '@/lib/ewentcast-session'
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
  const barePage = isLandingPage || isLoginPage || isSignupPage || isSubscribePage || isCreatePage
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLandingPage || isLoginPage || isSignupPage) {
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

      await fetchEwentcastMe()

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
  }, [isLandingPage, isLoginPage, isSignupPage, isSubscribePage, isCreatePage])

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
