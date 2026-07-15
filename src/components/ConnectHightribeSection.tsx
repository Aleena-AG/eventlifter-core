'use client'

import { useEffect, useState } from 'react'
import {
  connectHightribeWithPassword,
  syncChannelFromApi,
} from '@/lib/channel-connect'
import { getSettings } from '@/lib/api'
import {
  getEwentcastAccount,
  setEwentcastAccount,
  setHtLinkToken,
} from '@/lib/ewentcast-session'
import { InlineLoader } from '@/components/Loader'
import { disconnectChannelIntegration } from '@/lib/channel-disconnect'

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: '#8C7F6D',
  marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em',
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: '#FBF7F0', border: '1px solid #E8DFD0',
  borderRadius: '6px', padding: '7px 10px', fontSize: '13px',
  color: '#211B16', outline: 'none',
}

const BTN_PRIMARY: React.CSSProperties = {
  background: '#D98A2B', border: 'none', borderRadius: '6px',
  color: '#fff', padding: '7px 16px', fontSize: '13px', fontWeight: 500,
  cursor: 'pointer',
}

const BTN_SECONDARY: React.CSSProperties = {
  background: '#F1EADC', border: '1px solid #E8DFD0', borderRadius: '6px',
  color: '#211B16', padding: '7px 16px', fontSize: '13px', cursor: 'pointer',
}

const VALUE: React.CSSProperties = {
  fontSize: '13px', color: '#211B16', wordBreak: 'break-all',
}

export function ConnectHightribeSection({
  connected,
  connectEmail,
  serviceUrl,
  onConnected,
  onDisconnected,
}: {
  /** Parent owns this — GET /settings → hightribe.configured === true. */
  connected: boolean
  /** Hightribe account email used to connect (not Ewentcast login). */
  connectEmail?: string
  serviceUrl?: string
  onConnected?: (info?: { email?: string }) => void | Promise<void>
  onDisconnected?: () => void | Promise<void>
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [localEmail, setLocalEmail] = useState(connectEmail || '')

  useEffect(() => {
    if (connectEmail) setLocalEmail(connectEmail)
    if (!connected) setLocalEmail('')
  }, [connectEmail, connected])

  const displayEmail = localEmail || connectEmail || getEwentcastAccount()?.ht_connect_email || ''
  const displayServiceUrl = (serviceUrl || 'https://api.hightribe.com').replace(/\/$/, '')

  const finishConnected = async (connectedEmail?: string) => {
    if (connectedEmail) setLocalEmail(connectedEmail)
    setSuccess('Hightribe connected.')
    setPassword('')
    setError('')
    await onConnected?.({ email: connectedEmail || email.trim() || undefined })
    void syncChannelFromApi('hightribe').catch(() => {})
  }

  const handleConnect = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    const connectAs = email.trim()
    try {
      const { htToken } = await connectHightribeWithPassword({ email: connectAs, password })
      setHtLinkToken(htToken)
      const account = getEwentcastAccount()
      if (account) {
        setEwentcastAccount({
          ...account,
          ht_connected: true,
          ht_connected_at: new Date().toISOString(),
          ht_connect_email: connectAs,
        })
      }
      await finishConnected(connectAs)
    } catch (e) {
      try {
        const s = await getSettings() as { hightribe?: { configured?: boolean } }
        if (s.hightribe?.configured === true) {
          const account = getEwentcastAccount()
          if (account && connectAs) {
            setEwentcastAccount({ ...account, ht_connect_email: connectAs, ht_connected: true })
          }
          await finishConnected(connectAs)
          return
        }
      } catch {
        // ignore
      }
      setError(e instanceof Error ? e.message : 'Connect failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    if (!window.confirm('Disconnect HighTribe? Cached events and bookings will be removed.')) return
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      const result = await disconnectChannelIntegration('hightribe')
      setLocalEmail('')
      setSuccess('Hightribe disconnected.')
      await onDisconnected?.()
      if (result === 'session') {
        window.location.href = '/login'
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E8DFD0' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#211B16', marginBottom: '6px' }}>
        Connect Hightribe
      </div>

      {connected ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#4E7A4B' }}>
              ✓ Hightribe connected
            </span>
            <button onClick={handleDisconnect} disabled={loading} style={{ ...BTN_SECONDARY, opacity: loading ? 0.6 : 1 }}>
              {loading ? <InlineLoader label="…" /> : 'Disconnect'}
            </button>
          </div>

          <div style={{
            background: '#FDFAF6', border: '1px solid #F0E8DC', borderRadius: '8px',
            padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '10px',
          }}>
            <div>
              <span style={LABEL}>Connected with</span>
              <div style={VALUE}>{displayEmail || '—'}</div>
            </div>
            <div>
              <span style={LABEL}>Service URL</span>
              <div style={{ ...VALUE, fontFamily: 'monospace', fontSize: '12px' }}>{displayServiceUrl}</div>
            </div>
            <div>
              <span style={LABEL}>API key</span>
              <div style={{ ...VALUE, fontFamily: 'monospace', fontSize: '12px', color: '#8C7F6D' }}>
                •••••••• (saved on server)
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div>
            <label style={LABEL}>Hightribe email</label>
            <input
              type="email"
              style={INPUT_STYLE}
              placeholder="Hightribe email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label style={LABEL}>Password</label>
            <input
              type="password"
              style={INPUT_STYLE}
              placeholder="Hightribe password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
            />
          </div>
          <button
            onClick={handleConnect}
            disabled={loading || !email.trim() || !password}
            style={{ ...BTN_PRIMARY, alignSelf: 'flex-start', opacity: loading || !email.trim() || !password ? 0.6 : 1 }}
          >
            {loading ? <InlineLoader label="Connecting" /> : 'Connect Hightribe'}
          </button>
        </div>
      )}

      {error && <p style={{ fontSize: '12px', color: '#C2502E', marginTop: '10px' }}>{error}</p>}
      {success && <p style={{ fontSize: '12px', color: '#4E7A4B', marginTop: '10px' }}>{success}</p>}
    </div>
  )
}
