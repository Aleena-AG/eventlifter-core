'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getSettings } from '@/lib/api'
import { getUser } from '@/lib/auth'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_KEYS } from '@/lib/channels'
import { ChannelCard } from '@/components/ChannelCard'
import { PageLoader } from '@/components/Loader'

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

  const isConnected = (ch: ChannelKey): boolean => {
    if (ch === 'hightribe') return !!getUser()
    if (ch === 'luma') return !!settings.luma?.configured
    if (ch === 'eventbrite') return !!settings.eventbrite?.hasPrivateToken
    return false
  }

  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#211B16' }}>
          Channels
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#8C7F6D' }}>
          Connection status for each channel.{' '}
          <Link href="/settings" style={{ color: '#D98A2B', textDecoration: 'none' }}>
            Settings →
          </Link>
        </p>
      </div>

      {loading ? (
        <PageLoader label="Loading channels…" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {CHANNEL_KEYS.map((ch) => (
            <ChannelCard key={ch} channel={ch} connected={isConnected(ch)} />
          ))}
        </div>
      )}
    </div>
  )
}
