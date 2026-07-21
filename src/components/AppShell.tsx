'use client'

import Link from 'next/link'
import { Sidebar } from './Sidebar'
import { TrialWarningBanner } from './TrialWarningBanner'
import { EwentcastLogo } from './EwentcastLogo'
import '@/app/app-shell.css'

type AppShellProps = {
  children: React.ReactNode
  mobileTitle: string
  sidebarOpen: boolean
  onOpenSidebar: () => void
  onCloseSidebar: () => void
  onNavigate: () => void
}

/** Authenticated app chrome — CSS loaded only when this shell renders. */
export function AppShell({
  children,
  mobileTitle,
  sidebarOpen,
  onOpenSidebar,
  onCloseSidebar,
  onNavigate,
}: AppShellProps) {
  return (
    <>
      <header className="app-mobile-topbar">
        <button
          type="button"
          className="app-mobile-menu-btn"
          onClick={onOpenSidebar}
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
          onClick={onCloseSidebar}
          aria-label="Close menu"
        />
      )}

      <Sidebar
        mobileOpen={sidebarOpen}
        onNavigate={onNavigate}
        onClose={onCloseSidebar}
      />

      <div className="app-main-wrap">
        <TrialWarningBanner />
        <main className="app-main">{children}</main>
        <footer className="app-footer">
          <span>© 2026 Ewentcast</span>
          <nav aria-label="Legal">
            <Link href="/privacy">Privacy Policy</Link>
            <Link href="/terms">Terms &amp; Conditions</Link>
          </nav>
        </footer>
      </div>
    </>
  )
}
