'use client'

import { useState, useEffect } from 'react'
import { api } from '@/lib/api'
import { Toast, useToast } from '@/components/Toast'
import { InlineLoader, PageLoader } from '@/components/Loader'
import { getUser } from '@/lib/auth'
import type { HtUser } from '@/lib/auth'

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', background: '#FBF7F0', border: '1px solid #E8DFD0',
  borderRadius: '6px', padding: '7px 10px', fontSize: '13px',
  color: '#211B16', outline: 'none',
}

const LABEL_STYLE: React.CSSProperties = {
  display: 'block', fontSize: '12px', color: '#8C7F6D',
  marginBottom: '5px', fontWeight: 500,
}

const BTN_PRIMARY: React.CSSProperties = {
  background: '#D98A2B', border: 'none', borderRadius: '6px',
  color: '#fff', padding: '7px 16px', fontSize: '13px', fontWeight: 500,
  cursor: 'pointer',
}

const BTN_SECONDARY: React.CSSProperties = {
  background: '#F1EADC', border: '1px solid #E8DFD0', borderRadius: '6px',
  color: '#211B16', padding: '7px 16px', fontSize: '13px',
  cursor: 'pointer',
}

function SectionCard({ title, icon, color, children }: {
  title: string; icon: string; color: string; children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#FFFFFF', border: '1px solid #E8DFD0', borderRadius: '10px',
      overflow: 'hidden', marginBottom: '20px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '16px 20px', borderBottom: '1px solid #E8DFD0',
        background: `${color}0a`,
      }}>
        <span style={{ fontSize: '18px' }}>{icon}</span>
        <span style={{ fontSize: '15px', fontWeight: 600, color: '#211B16' }}>{title}</span>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      style={{
        background: 'none', border: '1px solid #E8DFD0', borderRadius: '4px',
        color: copied ? '#4E7A4B' : '#8C7F6D', padding: '4px 8px', fontSize: '11px',
        cursor: 'pointer', whiteSpace: 'nowrap',
      }}
    >
      {copied ? '✓ Copied' : '⎘ Copy'}
    </button>
  )
}

function WebhookSetup() {
  const [loading, setLoading] = useState(false)
  const [endpoints, setEndpoints] = useState<Record<string, string>>({})
  const [result, setResult] = useState<string>('')

  useEffect(() => {
    fetch('/api/webhooks/setup').then(r => r.json()).then((d: {
      endpoints?: Record<string, string>
    }) => {
      if (d.endpoints) setEndpoints(d.endpoints)
    }).catch(() => {})
  }, [])

  const setup = async () => {
    setLoading(true)
    setResult('')
    try {
      const res = await fetch('/api/webhooks/setup', { method: 'POST' })
      const text = await res.text()
      let data: {
        ok?: boolean
        error?: string
        webhooks?: Record<string, { ok?: boolean; error?: string; note?: string }>
      } = {}
      try {
        data = text ? JSON.parse(text) : {}
      } catch {
        throw new Error(res.ok ? 'Invalid server response' : `HTTP ${res.status}: ${text.slice(0, 120) || 'empty response'}`)
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      const lines = Object.entries(data.webhooks || {}).map(([ch, r]) => {
        if (ch === 'hightribe') {
          return `${ch}: ${r.ok ? '✓ ready' : `✗ ${r.error || 'failed'}`}`
        }
        return `${ch}: ${r.ok ? '✓ registered' : `✗ ${r.error || 'failed'}`}`
      })
      setResult(lines.join('\n'))
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {Object.entries(endpoints).map(([ch, url]) => (
        <div key={ch} style={{ marginBottom: '10px' }}>
          <div style={LABEL_STYLE}>{ch}</div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <code style={{ flex: 1, fontSize: '12px', color: '#211B16', background: '#FBF7F0', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E8DFD0', overflow: 'auto' }}>{url}</code>
            <CopyButton value={url} />
          </div>
        </div>
      ))}

      <button onClick={setup} disabled={loading} style={{ ...BTN_PRIMARY, marginTop: '8px', opacity: loading ? 0.6 : 1 }}>
        {loading ? <InlineLoader label="Registering" /> : 'Register webhooks on Luma + Eventbrite'}
      </button>
      {result && (
        <pre style={{ marginTop: '12px', fontSize: '12px', color: '#8C7F6D', whiteSpace: 'pre-wrap' }}>{result}</pre>
      )}
    </div>
  )
}

type SettingsShape = {
  eventbrite?: Record<string, string>
  luma?: Record<string, string>
  hightribe?: Record<string, string>
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsShape>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [oauthHostId, setOauthHostId] = useState('')
  const [htUser, setHtUser] = useState<HtUser | null>(null)
  const { toasts, toast, removeToast } = useToast()

  useEffect(() => {
    setHtUser(getUser())
  }, [])

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setLoading(true)
    try {
      const s = await api.getSettings()
      setSettings(s as SettingsShape)
    } catch {
      setSettings({})
    } finally {
      setLoading(false)
    }
  }

  const updateSection = (
    section: keyof SettingsShape,
    key: string,
    value: string
  ) => {
    setSettings((prev) => ({
      ...prev,
      [section]: { ...(prev[section] || {}), [key]: value },
    }))
  }

  const saveSection = async (section: keyof SettingsShape) => {
    setSaving(section)
    try {
      await api.updateSettings({ [section]: settings[section] })
      toast.success(`${section} settings saved`)
      // Reload to get masked values from server
      await loadSettings()
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSaving(null)
    }
  }

  const testEventbrite = async () => {
    setTesting('eventbrite')
    try {
      await api.testEventbrite()
      toast.success('Eventbrite connection OK')
    } catch (err) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTesting(null)
    }
  }

  const testLuma = async () => {
    setTesting('luma')
    try {
      await api.testLuma()
      toast.success('Luma connection OK')
    } catch (err) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTesting(null)
    }
  }

  const DEFAULT_REDIRECT = 'http://localhost:3000/api/eventbrite/callback'
  const eb = settings.eventbrite || {}
  const lu = settings.luma || {}
  const ht = settings.hightribe || {}

  return (
    <div style={{ maxWidth: '720px' }}>
      <Toast toasts={toasts} onRemove={removeToast} />

      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#211B16' }}>Settings</h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#8C7F6D' }}>
          Configure your channel integrations
        </p>
      </div>

      {loading ? (
        <PageLoader label="Loading settings…" />
      ) : (
        <>
          {/* Eventbrite */}
          <SectionCard title="Eventbrite" icon="🎫" color="#C2502E">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={LABEL_STYLE}>Client ID</label>
                  <input type="text" style={INPUT_STYLE}
                    value={eb.clientId || ''}
                    onChange={(e) => updateSection('eventbrite', 'clientId', e.target.value)}
                    placeholder="Client ID" />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Client Secret</label>
                  <input type="password" style={INPUT_STYLE}
                    value={eb.clientSecret || ''}
                    onChange={(e) => updateSection('eventbrite', 'clientSecret', e.target.value)}
                    placeholder="Client Secret" />
                </div>
              </div>
              <div>
                <label style={LABEL_STYLE}>Redirect URI</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="text" style={{ ...INPUT_STYLE, flex: 1 }}
                    value={eb.redirectUri || DEFAULT_REDIRECT}
                    onChange={(e) => updateSection('eventbrite', 'redirectUri', e.target.value)}
                    placeholder={DEFAULT_REDIRECT} />
                  <CopyButton value={eb.redirectUri || DEFAULT_REDIRECT} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={LABEL_STYLE}>Private Token</label>
                  <input type="password" style={INPUT_STYLE}
                    value={eb.privateToken || ''}
                    onChange={(e) => updateSection('eventbrite', 'privateToken', e.target.value)}
                    placeholder="Private Token" />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Public Token</label>
                  <input type="text" style={INPUT_STYLE}
                    value={eb.publicToken || ''}
                    onChange={(e) => updateSection('eventbrite', 'publicToken', e.target.value)}
                    placeholder="Public Token" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  onClick={() => saveSection('eventbrite')}
                  disabled={saving === 'eventbrite'}
                  style={{ ...BTN_PRIMARY, opacity: saving === 'eventbrite' ? 0.6 : 1 }}
                >
                  {saving === 'eventbrite' ? <InlineLoader label="Saving" /> : 'Save'}
                </button>
                <button
                  onClick={testEventbrite}
                  disabled={testing === 'eventbrite'}
                  style={{ ...BTN_SECONDARY, opacity: testing === 'eventbrite' ? 0.6 : 1 }}
                >
                  {testing === 'eventbrite' ? 'Testing…' : 'Test Connection'}
                </button>
              </div>

              {/* OAuth flow */}
              {eb.clientId && (
                <div style={{
                  marginTop: '8px', padding: '14px 16px',
                  background: '#F1EADC', borderRadius: '8px', border: '1px solid #E8DFD0',
                }}>
                  <div style={{ fontSize: '13px', color: '#211B16', fontWeight: 500, marginBottom: '10px' }}>
                    OAuth Connect Flow
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      type="text" style={{ ...INPUT_STYLE, flex: 1 }}
                      value={oauthHostId}
                      onChange={(e) => setOauthHostId(e.target.value)}
                      placeholder="Your host ID (optional)"
                    />
                    <button
                      onClick={() => {
                        const url = oauthHostId.trim()
                          ? `/api/eventbrite/connect?hostId=${encodeURIComponent(oauthHostId)}`
                          : '/api/eventbrite/connect'
                        window.open(url, '_blank')
                      }}
                      style={BTN_PRIMARY}
                    >
                      Connect via OAuth →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </SectionCard>

          {/* Luma */}
          <SectionCard title="Luma" icon="✨" color="#7C5C8A">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={LABEL_STYLE}>API Key</label>
                  <input type="password" style={INPUT_STYLE}
                    value={lu.apiKey || ''}
                    onChange={(e) => updateSection('luma', 'apiKey', e.target.value)}
                    placeholder="Luma Plus API Key" />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Calendar ID</label>
                  <input type="text" style={INPUT_STYLE}
                    value={lu.calendarId || ''}
                    onChange={(e) => updateSection('luma', 'calendarId', e.target.value)}
                    placeholder="cal-xxxxx" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={LABEL_STYLE}>API Base URL</label>
                  <input type="url" style={INPUT_STYLE}
                    value={lu.apiBaseUrl || ''}
                    onChange={(e) => updateSection('luma', 'apiBaseUrl', e.target.value)}
                    placeholder="https://public-api.luma.com" />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Discover Base URL</label>
                  <input type="url" style={INPUT_STYLE}
                    value={lu.discoverBaseUrl || ''}
                    onChange={(e) => updateSection('luma', 'discoverBaseUrl', e.target.value)}
                    placeholder="https://api.lu.ma" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => saveSection('luma')}
                  disabled={saving === 'luma'}
                  style={{ ...BTN_PRIMARY, opacity: saving === 'luma' ? 0.6 : 1 }}
                >
                  {saving === 'luma' ? <InlineLoader label="Saving" /> : 'Save'}
                </button>
                <button
                  onClick={testLuma}
                  disabled={testing === 'luma'}
                  style={{ ...BTN_SECONDARY, opacity: testing === 'luma' ? 0.6 : 1 }}
                >
                  {testing === 'luma' ? 'Testing…' : 'Test Connection'}
                </button>
              </div>
            </div>
          </SectionCard>

          {/* HighTribe — auto-configured via login */}
          <SectionCard title="HighTribe" icon="🏔️" color="#7C5C8A">
            {htUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, #7C5C8A, #D98A2B)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '20px', fontWeight: 700, color: '#fff',
                }}>
                  {htUser.name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#211B16', marginBottom: '4px' }}>
                    {htUser.name}
                  </div>
                  <div style={{ fontSize: '13px', color: '#8C7F6D', marginBottom: '8px' }}>
                    {htUser.email}
                    {htUser.username && <span style={{ marginLeft: '8px', color: '#7C5C8A' }}>@{htUser.username}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
                      background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)',
                      color: '#4E7A4B',
                    }}>
                      ✓ Connected via login
                    </span>
                    {htUser.has_business_profile && (
                      <span style={{
                        fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
                        background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.3)',
                        color: '#7C5C8A',
                      }}>
                        Business Profile
                      </span>
                    )}
                    {htUser.type && (
                      <span style={{
                        fontSize: '12px', padding: '3px 10px', borderRadius: '20px',
                        background: '#F1EADC', border: '1px solid #E8DFD0', color: '#8C7F6D',
                      }}>
                        {htUser.type}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                padding: '16px', background: 'rgba(167,139,250,0.06)',
                borderRadius: '8px', border: '1px solid rgba(167,139,250,0.2)',
                fontSize: '13px', color: '#8C7F6D', textAlign: 'center',
              }}>
                HighTribe is configured automatically when you sign in.<br />
                <a href="/login" style={{ color: '#7C5C8A', textDecoration: 'none', marginTop: '6px', display: 'inline-block' }}>
                  Sign in to connect →
                </a>
              </div>
            )}
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #E8DFD0' }}>
              <label style={LABEL_STYLE}>Webhook secret (shared with Laravel backend)</label>
              <input
                type="password"
                style={INPUT_STYLE}
                value={ht.webhookSecret || ''}
                onChange={(e) => updateSection('hightribe', 'webhookSecret', e.target.value)}
                placeholder="Generate a random string — same value goes in Laravel .env"
              />
              <p style={{ fontSize: '12px', color: '#8C7F6D', margin: '8px 0 12px', lineHeight: 1.5 }}>
                HighTribe Laravel sends booking webhooks to EventLifter when a guest registers. Set the same secret in both apps.
              </p>
              <button
                onClick={() => saveSection('hightribe')}
                disabled={saving === 'hightribe'}
                style={{ ...BTN_PRIMARY, opacity: saving === 'hightribe' ? 0.6 : 1 }}
              >
                {saving === 'hightribe' ? <InlineLoader label="Saving" /> : 'Save webhook secret'}
              </button>
            </div>
          </SectionCard>

          {/* Webhooks */}
          <SectionCard title="Webhooks" icon="🔔" color="#4E7A4B">
            <p style={{ fontSize: '13px', color: '#8C7F6D', margin: '0 0 14px', lineHeight: 1.5 }}>
              Luma + Eventbrite register here. HighTribe sends bookings from Laravel backend when env vars are set.
            </p>
            <WebhookSetup />
          </SectionCard>

          {/* settings.json reference */}
          <div style={{
            background: '#FFFFFF', border: '1px solid #E8DFD0',
            borderRadius: '10px', overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 20px', borderBottom: '1px solid #E8DFD0',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <span style={{ fontSize: '13px', color: '#8C7F6D', fontWeight: 500 }}>
                settings.json keys
              </span>
              <CopyButton value={[
                `eventbrite.clientId=${eb.clientId || ''}`,
                `eventbrite.redirectUri=${eb.redirectUri || DEFAULT_REDIRECT}`,
                `luma.calendarId=${lu.calendarId || ''}`,
              ].join('\n')} />
            </div>
            <pre style={{
              margin: 0, padding: '16px 20px', fontSize: '12px',
              color: '#211B16', fontFamily: 'monospace', overflowX: 'auto',
              lineHeight: 1.6,
            }}>
              {`eventbrite.clientId    = ${eb.clientId || '<not set>'}
eventbrite.redirectUri = ${eb.redirectUri || DEFAULT_REDIRECT}

luma.calendarId        = ${lu.calendarId || '<not set>'}
luma.apiBaseUrl        = ${lu.apiBaseUrl || 'https://public-api.luma.com'}

hightribe              = configured via login (token stored in browser)`}
            </pre>
          </div>
        </>
      )}
    </div>
  )
}
