import Link from 'next/link'
import { EwentcastLogo } from '@/components/EwentcastLogo'
import '@/app/legal.css'

type LegalPageProps = {
  eyebrow: string
  title: string
  intro: string
  children: React.ReactNode
}

export function LegalPage({ eyebrow, title, intro, children }: LegalPageProps) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-brand" aria-label="Ewentcast home">
          <EwentcastLogo height={34} wordmarkOnly />
        </Link>
        <Link href="/" className="legal-back">← Back to home</Link>
      </header>

      <main className="legal-main">
        <article className="legal-card">
          <div className="legal-hero">
            <span className="legal-eyebrow">{eyebrow}</span>
            <h1>{title}</h1>
            <p>{intro}</p>
            <time dateTime="2026-07-21">Last updated: July 21, 2026</time>
          </div>
          <div className="legal-content">{children}</div>
        </article>
      </main>

      <footer className="legal-footer">
        <span>© 2026 Ewentcast</span>
        <nav aria-label="Legal">
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/terms">Terms &amp; Conditions</Link>
        </nav>
      </footer>
    </div>
  )
}
