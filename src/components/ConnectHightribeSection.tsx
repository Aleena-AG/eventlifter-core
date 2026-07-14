'use client'

import { useEffect, useState } from 'react'
import {
  connectHightribeWithPassword,
  disconnectChannelSettings,
  syncChannelFromApi,
} from '@/lib/channel-connect'
import { getSettings } from '@/lib/api'
import {
  getEwentcastAccount,
  setEwentcastAccount,
  setHtLinkToken,
} from '@/lib/ewentcast-session'
import { InlineLoader } from '@/components/Loader'
import { purgeChannelDataFromDb } from '@/lib/channel-data-sync'

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

type HtSettingsView = {
  configured?: boolean
}

export function ConnectHightribeSection({ onChange }: { onChange?: () => void }) {
  const [htConnected, setHtConnected] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    void (async () => {
      try {
        const s = await getSettings() as { hightribe?: HtSettingsView }
        setHtConnected(!!s.hightribe?.configured || !!getEwentcastAccount()?.ht_connected)
      } catch {
        setHtConnected(!!getEwentcastAccount()?.ht_connected)
      }
    })()
  }, [])

  const handleConnect = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      // 1) Login to Hightribe with email/password
      // 2) PUT /api/v1/settings { hightribe: { serviceUrl, apiKey: <token> } }
      const { htToken } = await connectHightribeWithPassword({ email, password })
      setHtLinkToken(htToken)
      const account = getEwentcastAccount()
      if (account) {
        setEwentcastAccount({
          ...account,
          ht_connected: true,
          ht_connected_at: new Date().toISOString(),
        })
      }
      try {
        await syncChannelFromApi('hightribe')
      } catch {
        // connect succeeded; sync is best-effort
      }
      setSuccess('Hightribe connected. Events will sync when available.')
      setPassword('')
      setHtConnected(true)
      onChange?.()
    } catch (e) {
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
      await disconnectChannelSettings('hightribe')
      setHtLinkToken(null)
      const account = getEwentcastAccount()
      if (account) {
        setEwentcastAccount({
          ...account,
          ht_connected: false,
          linked_ht_user_id: null,
          ht_connected_at: null,
        })
      }
      void purgeChannelDataFromDb('hightribe')
      setHtConnected(false)
      setSuccess('Hightribe disconnected.')
      onChange?.()
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


      {htConnected ? (
        <div>
          <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#4E7A4B' }}>
            ✓ Hightribe connected
          </span>
          <button onClick={handleDisconnect} disabled={loading} style={{ ...BTN_SECONDARY, marginLeft: '10px', opacity: loading ? 0.6 : 1 }}>
            {loading ? <InlineLoader label="…" /> : 'Disconnect'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input
            type="email"
            style={INPUT_STYLE}
            placeholder="Hightribe email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          <input
            type="password"
            style={INPUT_STYLE}
            placeholder="Hightribe password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
          />
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
