'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { Sidebar } from './Sidebar'
import { PageLoader } from './Loader'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const isLandingPage = pathname === '/'
  const isLoginPage = pathname === '/login'
  const isCreatePage = pathname === '/create'
  const barePage = isLandingPage || isLoginPage || isCreatePage
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLandingPage || isLoginPage) {
      setReady(true)
      return
    }
    if (isCreatePage) {
      if (!getToken()) {
        router.replace('/login')
      } else {
        setReady(true)
      }
      return
    }
    if (!getToken()) {
      router.replace('/login')
    } else {
      setReady(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLandingPage, isLoginPage, isCreatePage])

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
      <div
        style={{
          flex: 1,
          marginLeft: '228px',
          display: 'flex',
          flexDirection: 'column',
          minHeight: '100vh',
          background: 'var(--canvas)',
        }}
      >
        <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </>
  )
}
