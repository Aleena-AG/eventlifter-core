'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { getSettings } from '@/lib/api'
import { getUser } from '@/lib/auth'
import { getEwentcastAccount, isEwentcastSignupUser } from '@/lib/ewentcast-session'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_KEYS } from '@/lib/channels'
import { ChannelCard } from '@/components/ChannelCard'
import { PageLoader } from '@/components/Loader'
import './channels.css'

type SafeSettings = {
  luma?: { configured?: boolean }
  eventbrite?: { hasPrivateToken?: boolean }
}

export default function ChannelsPage() {
  const [settings, setSettings] = useState<SafeSettings>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const s = await getSettings()
      setSettings(s as SafeSettings)
    } catch {
      setSettings({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const isConnected = useCallback((ch: ChannelKey): boolean => {
    if (ch === 'hightribe') {
      if (isEwentcastSignupUser()) return !!getEwentcastAccount()?.ht_connected
      return !!getUser()
    }
    if (ch === 'luma') return !!settings.luma?.configured
    if (ch === 'eventbrite') return !!settings.eventbrite?.hasPrivateToken
    return false
  }, [settings])

  const connectedCount = useMemo(
    () => CHANNEL_KEYS.filter(ch => isConnected(ch)).length,
    [isConnected],
  )

  const pct = Math.round((connectedCount / CHANNEL_KEYS.length) * 100)

  return (
    <div className="channels-page">
      <div className="channels-header">
        <div>
          <h1>Channels</h1>
          <p>
            Connect platforms to publish everywhere and keep capacity in sync.{' '}
            <Link href="/settings">Open Settings →</Link>
          </p>
        </div>
      </div>

      {!loading && (
        <div className="channels-summary">
          <div className="channels-summary-stat">
            <strong>{connectedCount}/{CHANNEL_KEYS.length}</strong>
            <span>channels connected</span>
          </div>
          <div className="channels-summary-bar" aria-hidden="true">
            <div className="channels-summary-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="channels-summary-stat">
            <strong>{pct}%</strong>
            <span>ready to publish</span>
          </div>
        </div>
      )}

      {loading ? (
        <PageLoader label="Loading channels…" />
      ) : (
        <div className="channels-grid">
          {CHANNEL_KEYS.map((ch) => (
            <ChannelCard key={ch} channel={ch} connected={isConnected(ch)} />
          ))}
        </div>
      )}
    </div>
  )
}
