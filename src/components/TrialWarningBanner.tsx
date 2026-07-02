'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getTrialDaysRemaining, isOnFreeTrial } from '@/lib/ewentcast-session'

export function TrialWarningBanner() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [days, setDays] = useState<number | null>(null)

  useEffect(() => {
    setVisible(isOnFreeTrial())
    setDays(getTrialDaysRemaining())
  }, [pathname])

  if (!visible || days == null) return null

  const urgent = days <= 3
  const ended = days <= 0

  const message = ended
    ? 'Your free trial has ended. Subscribe to keep using Ewentcast.'
    : days === 1
      ? '1 day left in your free trial.'
      : `${days} days left in your free trial.`

  return (
    <div
      className={`app-trial-banner${urgent ? ' app-trial-banner--urgent' : ''}`}
      role="status"
    >
      <div className="app-trial-banner__inner">
        <span className="app-trial-banner__icon" aria-hidden="true">
          {urgent ? '⚠' : '◷'}
        </span>
        <div className="app-trial-banner__text">
          <strong>{ended ? 'Trial ended' : 'Free trial'}</strong>
          <span>{message}</span>
        </div>
        <Link href="/subscribe" className="app-trial-banner__cta">
          {ended ? 'Subscribe now' : 'Upgrade'}
        </Link>
      </div>
    </div>
  )
}
