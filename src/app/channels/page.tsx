'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { getSettings } from '@/lib/api'
import { getUser } from '@/lib/auth'
import { getEwentcastAccount, isEwentcastSignupUser } from '@/lib/ewentcast-session'
import { disconnectChannelIntegration } from '@/lib/channel-disconnect'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_KEYS, CHANNEL_META } from '@/lib/channels'
import { ChannelCard } from '@/components/ChannelCard'
import { PageLoader } from '@/components/Loader'
import { Toast, useToast } from '@/components/Toast'

type SafeSettings = {
  luma?: { configured?: boolean }
  eventbrite?: { hasPrivateToken?: boolean }
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

  const isConnected = (ch: ChannelKey): boolean => {
    if (ch === 'hightribe') {
      if (isEwentcastSignupUser()) return !!getEwentcastAccount()?.ht_connected
      return !!getUser()
    }
    if (ch === 'luma') return !!settings.luma?.configured
    if (ch === 'eventbrite') return !!settings.eventbrite?.hasPrivateToken
    return false
  }

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
    <div style={{ maxWidth: '720px' }}>
      <Toast toasts={toasts} onRemove={removeToast} />
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
