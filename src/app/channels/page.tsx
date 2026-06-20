'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSettings, updateSettings } from '@/lib/api'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_KEYS } from '@/lib/channels'
import { ChannelCard } from '@/components/ChannelCard'
import { InlineLoader, PageLoader } from '@/components/Loader'
import { Toast, useToast } from '@/components/Toast'

const BTN_BASE: React.CSSProperties = {
  padding: '7px 16px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  border: '1px solid transparent',
  transition: 'opacity 0.15s',
}

type SafeSettings = {
  luma?: { configured?: boolean; apiKey?: string }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean; clientId?: string }
  hightribe?: { configured?: boolean; serviceUrl?: string }
}

export default function ChannelsPage() {
  const [settings, setSettings] = useState<SafeSettings>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [lumaKey, setLumaKey] = useState('')
  const [htUrl, setHtUrl] = useState('')
  const { toasts, toast, removeToast } = useToast()

  const loadSettings = useCallback(async () => {
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
    loadSettings()
  }, [loadSettings])

  const isConnected = (ch: ChannelKey): boolean => {
    if (ch === 'luma') return !!(settings.luma?.configured)
    if (ch === 'eventbrite') return !!(settings.eventbrite?.configured || settings.eventbrite?.hasPrivateToken)
    if (ch === 'hightribe') return !!(settings.hightribe?.configured)
    return false
  }

  const handleConnect = async (ch: ChannelKey) => {
    setBusy(ch)
    try {
      if (ch === 'luma') {
        if (!lumaKey.trim()) {
          toast.error('Enter a Luma API key first')
          return
        }
        await updateSettings({ luma: { apiKey: lumaKey } } as Parameters<typeof updateSettings>[0])
        setLumaKey('')
        toast.success('Luma API key saved')
        await loadSettings()
      } else if (ch === 'eventbrite') {
        const clientId = settings.eventbrite?.clientId
        if (!clientId) {
          toast.error('Add your Eventbrite Client ID in Settings → Eventbrite first')
          return
        }
        window.location.href = `/api/eventbrite/connect`
      } else if (ch === 'hightribe') {
        const url = htUrl.trim() || 'http://localhost:4000'
        await updateSettings({ hightribe: { serviceUrl: url } } as Parameters<typeof updateSettings>[0])
        setHtUrl('')
        toast.success('HighTribe service URL saved')
        await loadSettings()
      }
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  const handleDisconnect = async (ch: ChannelKey) => {
    setBusy(ch)
    try {
      if (ch === 'luma') {
        await updateSettings({ luma: { apiKey: '' } } as Parameters<typeof updateSettings>[0])
      } else if (ch === 'eventbrite') {
        await updateSettings({ eventbrite: { privateToken: '', clientId: '', clientSecret: '' } } as Parameters<typeof updateSettings>[0])
      } else if (ch === 'hightribe') {
        await updateSettings({ hightribe: { serviceUrl: '' } } as Parameters<typeof updateSettings>[0])
      }
      toast.success(`${ch} disconnected`)
      await loadSettings()
    } catch (err) {
      toast.error(`Failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div style={{ maxWidth: '960px' }}>
      <Toast toasts={toasts} onRemove={removeToast} />

      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#211B16' }}>
          Channels
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#8C7F6D' }}>
          Connect your event publishing channels
        </p>
      </div>

      {loading ? (
        <PageLoader label="Loading channels…" />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '16px',
          }}
        >
          {CHANNEL_KEYS.map((ch) => (
            <ChannelCard key={ch} channel={ch} connected={isConnected(ch)}>
              {/* HighTribe */}
              {ch === 'hightribe' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {!isConnected(ch) && (
                    <input
                      type="url"
                      value={htUrl}
                      onChange={(e) => setHtUrl(e.target.value)}
                      placeholder="Service URL (e.g. http://localhost:4000)"
                      style={{
                        width: '100%',
                        background: '#FBF7F0',
                        border: '1px solid #E8DFD0',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '13px',
                        color: '#211B16',
                        outline: 'none',
                      }}
                    />
                  )}
                  {isConnected(ch) ? (
                    <button
                      onClick={() => handleDisconnect(ch)}
                      disabled={busy === ch}
                      style={{
                        ...BTN_BASE,
                        background: 'rgba(248,81,73,0.1)',
                        border: '1px solid rgba(248,81,73,0.4)',
                        color: '#C2502E',
                        opacity: busy === ch ? 0.6 : 1,
                      }}
                    >
                      {busy === ch ? <InlineLoader label="Disconnecting" /> : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(ch)}
                      disabled={busy === ch}
                      style={{
                        ...BTN_BASE,
                        background: 'rgba(63,185,80,0.15)',
                        border: '1px solid rgba(63,185,80,0.4)',
                        color: '#4E7A4B',
                        opacity: busy === ch ? 0.6 : 1,
                      }}
                    >
                      {busy === ch ? <InlineLoader label="Connecting" /> : 'Connect'}
                    </button>
                  )}
                </div>
              )}

              {/* Eventbrite */}
              {ch === 'eventbrite' && (
                <div>
                  {isConnected(ch) ? (
                    <button
                      onClick={() => handleDisconnect(ch)}
                      disabled={busy === ch}
                      style={{
                        ...BTN_BASE,
                        background: 'rgba(248,81,73,0.1)',
                        border: '1px solid rgba(248,81,73,0.4)',
                        color: '#C2502E',
                        opacity: busy === ch ? 0.6 : 1,
                      }}
                    >
                      {busy === ch ? <InlineLoader label="Disconnecting" /> : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(ch)}
                      disabled={busy === ch}
                      style={{
                        ...BTN_BASE,
                        background: 'rgba(251,191,36,0.15)',
                        border: '1px solid rgba(251,191,36,0.4)',
                        color: '#C2502E',
                        opacity: busy === ch ? 0.6 : 1,
                      }}
                    >
                      Connect via OAuth →
                    </button>
                  )}
                </div>
              )}

              {/* Luma */}
              {ch === 'luma' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {!isConnected(ch) && (
                    <input
                      type="text"
                      value={lumaKey}
                      onChange={(e) => setLumaKey(e.target.value)}
                      placeholder="Luma Plus API Key"
                      style={{
                        width: '100%',
                        background: '#FBF7F0',
                        border: '1px solid #E8DFD0',
                        borderRadius: '6px',
                        padding: '7px 10px',
                        fontSize: '13px',
                        color: '#211B16',
                        outline: 'none',
                      }}
                    />
                  )}
                  {isConnected(ch) ? (
                    <button
                      onClick={() => handleDisconnect(ch)}
                      disabled={busy === ch}
                      style={{
                        ...BTN_BASE,
                        background: 'rgba(248,81,73,0.1)',
                        border: '1px solid rgba(248,81,73,0.4)',
                        color: '#C2502E',
                        opacity: busy === ch ? 0.6 : 1,
                      }}
                    >
                      {busy === ch ? <InlineLoader label="Disconnecting" /> : 'Disconnect'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(ch)}
                      disabled={busy === ch}
                      style={{
                        ...BTN_BASE,
                        background: 'rgba(34,211,238,0.15)',
                        border: '1px solid rgba(34,211,238,0.4)',
                        color: '#7C5C8A',
                        opacity: busy === ch ? 0.6 : 1,
                      }}
                    >
                      {busy === ch ? <InlineLoader label="Connecting" /> : 'Connect with API Key'}
                    </button>
                  )}
                </div>
              )}
            </ChannelCard>
          ))}
        </div>
      )}
    </div>
  )
}
