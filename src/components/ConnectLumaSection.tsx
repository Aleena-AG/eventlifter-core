'use client'

import { useState } from 'react'
import { InlineLoader } from '@/components/Loader'
import { LUMA_COLOR } from '@/lib/brand'

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '11px', fontWeight: 600, color: '#8C7F6D',
  marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em',
}

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: '#FBF7F0', border: '1px solid #E8DFD0',
  borderRadius: '6px', padding: '7px 10px', fontSize: '13px',
  color: '#211B16', outline: 'none', fontFamily: 'monospace',
}

const BTN_PURPLE: React.CSSProperties = {
  background: LUMA_COLOR, border: 'none', borderRadius: '6px',
  color: '#fff', padding: '7px 16px', fontSize: '13px', fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap',
}

const BTN_SECONDARY: React.CSSProperties = {
  background: '#F1EADC', border: '1px solid #E8DFD0', borderRadius: '6px',
  color: '#211B16', padding: '7px 14px', fontSize: '13px', cursor: 'pointer',
  whiteSpace: 'nowrap',
}

export function ConnectLumaSection({
  apiKey,
  calendarId,
  configured,
  saving,
  onSave,
  onDisconnect,
}: {
  apiKey: string
  calendarId: string
  configured?: boolean
  saving: boolean
  onSave: (apiKey: string, calendarId: string) => Promise<void>
  onDisconnect: () => Promise<void>
}) {
  const [reconnecting, setReconnecting] = useState(false)
  const [inputKey, setInputKey] = useState('')
  const [inputCalId, setInputCalId] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')

  // Connected only after a successful save (configured), not merely from leftover fields.
  const isConnected = !!configured
  const showForm = !isConnected || reconnecting

  const handleConnect = async () => {
    const key = inputKey.trim()
    const calId = inputCalId.trim()
    if (!key || !calId) {
      setError('Enter both API key and Calendar ID')
      return
    }
    setVerifying(true)
    setError('')
    try {
      const { channelFetch } = await import('@/lib/channel-fetch')
      const res = await channelFetch('/api/luma/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      })
      const json = await res.json() as { status: string; message?: string }
      if (!res.ok || json.status === 'error') {
        throw new Error(json.message || 'Invalid Luma API key')
      }
      await onSave(key, calId)
      setInputKey('')
      setInputCalId('')
      setReconnecting(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connection failed')
    } finally {
      setVerifying(false)
    }
  }

  const handleDisconnect = async () => {
    setError('')
    try {
      await onDisconnect()
      setReconnecting(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
    }
  }

  const isWorking = verifying || saving
  const canConnect = !!inputKey.trim() && !!inputCalId.trim() && !isWorking

  return (
    <div>
      {isConnected && !reconnecting && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
              background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)',
              color: '#4E7A4B', whiteSpace: 'nowrap', fontWeight: 600,
            }}>
              ✓ Connected
            </span>
            {calendarId && (
              <code style={{ fontSize: '12px', color: '#8C7F6D' }}>{calendarId}</code>
            )}
            <button
              type="button"
              onClick={() => {
                setReconnecting(true)
                setInputKey('')
                setInputCalId(calendarId || '')
                setError('')
              }}
              style={BTN_SECONDARY}
            >
              Reconnect
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={saving}
              style={{ ...BTN_SECONDARY, opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <InlineLoader label="Saving" /> : 'Disconnect'}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: '#8C7F6D', margin: '10px 0 0', lineHeight: 1.5 }}>
            Your API key is securely stored. Luma events are ready to use.
          </p>
        </div>
      )}

      {showForm && (
        <div>
          {!isConnected && (
            <p style={{ fontSize: '13px', color: '#8C7F6D', margin: '0 0 14px', lineHeight: 1.5 }}>
              Paste your Luma API key and Calendar ID to connect.
            </p>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={LABEL}>API Key</label>
              <input
                type="password"
                style={INPUT_STYLE}
                placeholder="Luma Plus API Key"
                value={inputKey}
                onChange={(e) => setInputKey(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
                autoComplete="off"
              />
            </div>
            <div>
              <label style={LABEL}>Calendar ID</label>
              <input
                type="text"
                style={INPUT_STYLE}
                placeholder="cal-xxxxx"
                value={inputCalId}
                onChange={(e) => setInputCalId(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleConnect() }}
                autoComplete="off"
              />
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handleConnect()}
              disabled={!canConnect}
              style={{ ...BTN_PURPLE, opacity: canConnect ? 1 : 0.6 }}
            >
              {isWorking ? <InlineLoader label="Connecting" /> : 'Connect Luma'}
            </button>
            {reconnecting && (
              <button
                type="button"
                onClick={() => {
                  setReconnecting(false)
                  setInputKey('')
                  setInputCalId('')
                  setError('')
                }}
                disabled={isWorking}
                style={{ ...BTN_SECONDARY, opacity: isWorking ? 0.6 : 1 }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <p style={{ fontSize: '12px', color: '#C2502E', margin: '8px 0 0' }}>{error}</p>
      )}
    </div>
  )
}
