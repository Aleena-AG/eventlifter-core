'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { PageLoader } from './Loader'

export function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const isLoginPage = pathname === '/login'
  const isCreatePage = pathname === '/create'
  const barePage = isLoginPage || isCreatePage
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLoginPage) {
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
      // don't setReady — keep screen blank while redirecting
    } else {
      setReady(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoginPage])

  // Loader until auth check completes
  if (!ready) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0d1117',
        }}
      >
        <PageLoader label="Loading…" />
      </div>
    )
  }

  // Login / create pages get a bare layout — no sidebar/topbar
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
          background: '#0d1117',
        }}
      >
        <Topbar />
        <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </>
  )
}
