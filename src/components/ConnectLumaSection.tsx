'use client'

import { useState } from 'react'
import { InlineLoader } from '@/components/Loader'

const INPUT_STYLE: React.CSSProperties = {
  flex: 1, background: '#FBF7F0', border: '1px solid #E8DFD0',
  borderRadius: '6px', padding: '7px 10px', fontSize: '13px',
  color: '#211B16', outline: 'none', fontFamily: 'monospace', minWidth: 0,
}

const BTN_PURPLE: React.CSSProperties = {
  background: '#7C5C8A', border: 'none', borderRadius: '6px',
  color: '#fff', padding: '7px 16px', fontSize: '13px', fontWeight: 500,
  cursor: 'pointer', whiteSpace: 'nowrap',
}

const BTN_SECONDARY: React.CSSProperties = {
  background: '#F1EADC', border: '1px solid #E8DFD0', borderRadius: '6px',
  color: '#211B16', padding: '7px 14px', fontSize: '13px', cursor: 'pointer',
  whiteSpace: 'nowrap',
}

interface LumaVerifyData {
  user?: Record<string, unknown>
  calendar?: Record<string, unknown>
}

function extractCalendarId(data?: LumaVerifyData): string {
  const cal = data?.calendar
  if (!cal) return ''
  const inner = (cal as { calendar?: { api_id?: string } }).calendar
  if (inner?.api_id) return inner.api_id
  return (cal as { api_id?: string }).api_id || ''
}

export function ConnectLumaSection({
  apiKey,
  calendarId,
  saving,
  onSave,
  onDisconnect,
}: {
  apiKey: string
  calendarId: string
  saving: boolean
  onSave: (apiKey: string, calendarId: string) => Promise<void>
  onDisconnect: () => Promise<void>
}) {
  const [reconnecting, setReconnecting] = useState(false)
  const [inputKey, setInputKey] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const isConnected = !!apiKey
  const showForm = !isConnected || reconnecting

  const handleConnect = async () => {
    const key = inputKey.trim()
    if (!key) return
    setVerifying(true)
    setError('')
    try {
      const res = await fetch('/api/luma/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      })
      const json = await res.json() as { status: string; message?: string; data?: LumaVerifyData }
      if (!res.ok || json.status === 'error') throw new Error(json.message || 'Invalid Luma API key')
      const detectedCalId = extractCalendarId(json.data) || calendarId || ''
      await onSave(key, detectedCalId)
      setInputKey('')
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Disconnect failed')
    }
  }

  const isWorking = verifying || saving

  return (
    <div>
      {isConnected && !reconnecting && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
              background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)',
              color: '#4E7A4B', whiteSpace: 'nowrap',
            }}>✓ Connected</span>
            {calendarId && (
              <code style={{ fontSize: '12px', color: '#8C7F6D' }}>{calendarId}</code>
            )}
            <button onClick={() => { setReconnecting(true); setError('') }} style={BTN_SECONDARY}>
              Reconnect
            </button>
            <button onClick={handleDisconnect} disabled={saving} style={{ ...BTN_SECONDARY, opacity: saving ? 0.6 : 1 }}>
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
              Connect your Luma calendar to publish and manage events. Your API key is stored securely on your Hightribe account.
            </p>
          )}

          <div style={{
            background: '#FBF7F0', border: '1px solid #E8DFD0', borderRadius: '8px',
            padding: '14px 16px', marginBottom: '14px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: '#211B16', marginBottom: '8px' }}>
              How to get your Luma API key
            </div>
            <ol style={{ margin: 0, paddingLeft: '18px' }}>
              <li style={{ fontSize: '13px', color: '#211B16', lineHeight: 1.65, marginBottom: '4px' }}>
                Open{' '}
                <a href="https://lu.ma/settings" target="_blank" rel="noreferrer" style={{ color: '#7C5C8A' }}>
                  lu.ma/settings
                </a>{' '}
                <span style={{ fontSize: '11px', color: '#8C7F6D' }}>(Luma Plus required)</span>
              </li>
              <li style={{ fontSize: '13px', color: '#211B16', lineHeight: 1.65, marginBottom: '4px' }}>
                Go to <strong>Developer</strong> → <strong>API Keys</strong>
              </li>
              <li style={{ fontSize: '13px', color: '#211B16', lineHeight: 1.65 }}>
                Click <strong>Generate new key</strong> → copy it → paste below
              </li>
            </ol>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="password"
              style={INPUT_STYLE}
              placeholder="Paste your Luma API key…"
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConnect() }}
            />
            <button
              onClick={handleConnect}
              disabled={!inputKey.trim() || isWorking}
              style={{ ...BTN_PURPLE, opacity: !inputKey.trim() || isWorking ? 0.6 : 1 }}
            >
              {isWorking ? <InlineLoader label="Connecting" /> : 'Connect Luma'}
            </button>
            {reconnecting && (
              <button
                onClick={() => { setReconnecting(false); setInputKey(''); setError('') }}
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
