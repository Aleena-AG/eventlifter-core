'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getSettings } from '@/lib/api'
import { disconnectChannelIntegration } from '@/lib/channel-disconnect'
import { isChannelConnected } from '@/lib/channel-connection'
import { isEwentcastSignupUser } from '@/lib/ewentcast-session'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_KEYS, CHANNEL_META } from '@/lib/channels'
import { ChannelCard } from '@/components/ChannelCard'
import { PageLoader } from '@/components/Loader'
import { Toast, useToast } from '@/components/Toast'
import './channels.css'

type SafeSettings = {
  luma?: { configured?: boolean }
  eventbrite?: { hasPrivateToken?: boolean; configured?: boolean }
  hightribe?: { configured?: boolean }
}

export default function ChannelsPage() {
  const router = useRouter()
  const [settings, setSettings] = useState<SafeSettings>({})
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState<ChannelKey | null>(null)
  const { toasts, toast, removeToast } = useToast()

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

  const isConnected = useCallback(
    (ch: ChannelKey): boolean => isChannelConnected(ch, settings),
    [settings],
  )

  const connectedCount = useMemo(
    () => CHANNEL_KEYS.filter(ch => isConnected(ch)).length,
    [isConnected],
  )

  const pct = Math.round((connectedCount / CHANNEL_KEYS.length) * 100)

  const handleDisconnect = async (ch: ChannelKey) => {
    const name = CHANNEL_META[ch].name
    const label = ch === 'hightribe' && !isEwentcastSignupUser()
      ? 'Sign out of your account?'
      : `Disconnect ${name}?`
    if (!window.confirm(label)) return

    setDisconnecting(ch)
    try {
      const result = await disconnectChannelIntegration(ch)
      if (result === 'session') {
        toast.success('Signed out')
        router.replace('/login')
        return
      }
      toast.success(`${name} disconnected`)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setDisconnecting(null)
    }
  }

  return (
    <div className="channels-page">
      <Toast toasts={toasts} onRemove={removeToast} />
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
            <ChannelCard
              key={ch}
              channel={ch}
              connected={isConnected(ch)}
              onDisconnect={() => handleDisconnect(ch)}
              disconnecting={disconnecting === ch}
            />
          ))}
        </div>
      )}
    </div>
  )
}
