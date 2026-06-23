'use client'

import { useState } from 'react'
import { connectHightribe, disconnectHightribe, getEwentcastAccount, isEwentcastSignupUser } from '@/lib/ewentcast-session'
import { InlineLoader } from '@/components/Loader'

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

export function ConnectHightribeSection({ onChange }: { onChange?: () => void }) {
  const account = getEwentcastAccount()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isEwentcastSignupUser()) return null

  const connected = account?.ht_connected

  const handleConnect = async () => {
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await connectHightribe(email, password)
      setSuccess('HighTribe connected — you can now load HT events.')
      setPassword('')
      onChange?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connect failed')
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    setLoading(true)
    setError('')
    try {
      await disconnectHightribe()
      setSuccess('HighTribe disconnected.')
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
        Connect HighTribe (optional)
      </div>
      <p style={{ fontSize: '12px', color: '#8C7F6D', margin: '0 0 12px', lineHeight: 1.5 }}>
        Link your existing HighTribe account to pull HT events into Ewentcast. Luma & Eventbrite work without this.
      </p>

      {connected ? (
        <div>
          <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '20px', background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#4E7A4B' }}>
            ✓ HighTribe connected
          </span>
          <button onClick={handleDisconnect} disabled={loading} style={{ ...BTN_SECONDARY, marginLeft: '10px', opacity: loading ? 0.6 : 1 }}>
            Disconnect
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <input type="email" style={INPUT_STYLE} placeholder="HighTribe email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" style={INPUT_STYLE} placeholder="HighTribe password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button onClick={handleConnect} disabled={loading || !email || !password} style={{ ...BTN_PRIMARY, alignSelf: 'flex-start', opacity: loading ? 0.6 : 1 }}>
            {loading ? <InlineLoader label="Connecting" /> : 'Connect HighTribe'}
          </button>
        </div>
      )}

      {error && <p style={{ fontSize: '12px', color: '#C2502E', marginTop: '10px' }}>{error}</p>}
      {success && <p style={{ fontSize: '12px', color: '#4E7A4B', marginTop: '10px' }}>{success}</p>}
    </div>
  )
}
