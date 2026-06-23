'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import { Toast, useToast } from '@/components/Toast'
import { InlineLoader, PageLoader } from '@/components/Loader'
import { authHeader, getUser } from '@/lib/auth'
import type { HtUser } from '@/lib/auth'
import {
  appSettingsToHtPatch,
  fetchChannelSettingsViaProxy,
  htDataToPublicForm,
  saveChannelSettingsViaProxy,
} from '@/lib/channel-settings-client'
import { ChannelLogo } from '@/components/ChannelLogo'
import { ConnectHightribeSection } from '@/components/ConnectHightribeSection'
import { getEwentcastAccount, isEwentcastSignupUser } from '@/lib/ewentcast-session'
import type { ChannelKey } from '@/lib/types'

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

function SectionCard({ title, icon, channel, color, children }: {
  title: string
  icon?: string
  channel?: ChannelKey
  color: string
  children: React.ReactNode
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
        {channel ? <ChannelLogo channel={channel} size={28} /> : <span style={{ fontSize: '18px' }}>{icon}</span>}
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

const WEBHOOK_CHANNELS = ['luma', 'eventbrite'] as const

function WebhooksPanel() {
  const [loading, setLoading] = useState(false)
  const [endpoints, setEndpoints] = useState<Record<string, string>>({})
  const [result, setResult] = useState('')

  useEffect(() => {
    fetch('/api/webhooks/setup').then(r => r.json()).then((d: {
      endpoints?: Record<string, string>
    }) => {
      if (d.endpoints) {
        const filtered: Record<string, string> = {}
        for (const ch of WEBHOOK_CHANNELS) {
          if (d.endpoints[ch]) filtered[ch] = d.endpoints[ch]
        }
        setEndpoints(filtered)
      }
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
      const lines = WEBHOOK_CHANNELS.map((ch) => {
        const r = data.webhooks?.[ch]
        if (!r) return `${ch}: ✗ no response`
        return `${ch}: ${r.ok ? '✓ registered' : `✗ ${r.error || 'failed'}`}`
      })
      setResult(lines.join('\n'))
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  const stepStyle: React.CSSProperties = {
    fontSize: '13px', color: '#211B16', lineHeight: 1.65, marginBottom: '8px',
  }
  const noteStyle: React.CSSProperties = {
    fontSize: '12px', color: '#8C7F6D', lineHeight: 1.55, margin: '0 0 16px',
    padding: '10px 12px', background: '#FBF7F0', borderRadius: '6px', border: '1px solid #E8DFD0',
  }
  const sectionHead: React.CSSProperties = {
    fontSize: '14px', fontWeight: 600, color: '#211B16', margin: '0 0 8px',
    display: 'flex', alignItems: 'center', gap: '8px',
  }
  const subHead: React.CSSProperties = {
    ...LABEL_STYLE, fontWeight: 600, marginTop: '12px', marginBottom: '6px', color: '#211B16',
  }
  const urlBox: React.CSSProperties = {
    fontSize: '12px', color: '#211B16', background: '#FBF7F0', padding: '8px 10px',
    borderRadius: '6px', border: '1px solid #E8DFD0', wordBreak: 'break-all', margin: '6px 0 10px',
  }

  const lumaUrl = endpoints.luma || 'https://your-domain.com/api/webhooks/luma'
  const ebUrl = endpoints.eventbrite || 'https://your-domain.com/api/webhooks/eventbrite'
  const isLocalhost = lumaUrl.includes('localhost')

  return (
    <div>
      <p style={noteStyle}>
        <strong>Important:</strong> Webhooks sirf <strong>public HTTPS</strong> URL par kaam karte hain (production).
        {isLocalhost && (
          <span style={{ display: 'block', marginTop: '6px', color: '#C2502E' }}>
            ⚠ Abhi localhost URL hai — Luma/Eventbrite yahan register nahi karenge. Pehle Vercel par deploy karo.
          </span>
        )}
        {' '}Event pehle Ewentcast se publish/sync hona chahiye, warna booking skip ho jati hai.
      </p>

      <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #E8DFD0' }}>
        <div style={sectionHead}>
          <ChannelLogo channel="luma" size={22} />
          Luma webhook — register kaise karein
        </div>
        <p style={{ ...stepStyle, marginBottom: '12px', color: '#8C7F6D' }}>
          Pehle credentials save karo (upar <strong>Settings → Luma</strong> section):
        </p>
        <ol style={{ margin: '0 0 14px', paddingLeft: '20px' }}>
          <li style={stepStyle}><a href="https://lu.ma" target="_blank" rel="noreferrer" style={{ color: '#7C5C8A' }}>lu.ma</a> → Settings → Developer → <strong>API Key</strong> (Luma Plus required)</li>
          <li style={stepStyle}><strong>Calendar ID</strong> copy karo (<code>cal-xxxxx</code>)</li>
          <li style={stepStyle}>Ewentcast Settings mein paste karo → <strong>Save</strong> → <strong>Test Connection</strong></li>
        </ol>
        <div style={subHead}>Option A — Auto register (recommended)</div>
        <ol style={{ margin: '0 0 12px', paddingLeft: '20px' }}>
          <li style={stepStyle}>Neeche scroll karo → <strong>Register webhooks on Luma + Eventbrite</strong> button dabao</li>
          <li style={stepStyle}>Result mein <code>luma: ✓ registered</code> aana chahiye</li>
          <li style={stepStyle}>Auto events: <code>guest.registered</code>, <code>guest.updated</code></li>
        </ol>
        <div style={subHead}>Option B — Manual (Luma dashboard / API)</div>
        <ol style={{ margin: 0, paddingLeft: '20px' }}>
          <li style={stepStyle}>Luma Plus account se webhook create karo</li>
          <li style={stepStyle}><strong>Webhook URL</strong> yeh paste karo:</li>
        </ol>
        <div style={urlBox}>{lumaUrl}</div>
        <CopyButton value={lumaUrl} />
        <ol start={3} style={{ margin: '10px 0 0', paddingLeft: '20px' }}>
          <li style={stepStyle}><strong>Events:</strong> Guest registered, Guest updated</li>
          <li style={stepStyle}>Save → linked Luma event par test guest register karo → <strong>Bookings</strong> check karo</li>
        </ol>
      </div>

      <div style={{ marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid #E8DFD0' }}>
        <div style={sectionHead}>
          <ChannelLogo channel="eventbrite" size={22} />
          Eventbrite webhook — register kaise karein
        </div>
        <p style={{ ...stepStyle, marginBottom: '12px', color: '#8C7F6D' }}>
          Pehle credentials save karo (upar <strong>Settings → Eventbrite</strong> section):
        </p>
        <ol style={{ margin: '0 0 14px', paddingLeft: '20px' }}>
          <li style={stepStyle}><a href="https://www.eventbrite.com/platform/api" target="_blank" rel="noreferrer" style={{ color: '#C2502E' }}>Eventbrite Developer</a> → app → <strong>Client ID</strong> + <strong>Client Secret</strong></li>
          <li style={stepStyle}><strong>Private Token</strong> generate karo (webhook ke liye zaroori)</li>
          <li style={stepStyle}><strong>Redirect URI</strong> production URL set karo</li>
          <li style={stepStyle}>Ewentcast Settings mein save karo → <strong>Test Connection</strong></li>
        </ol>
        <div style={subHead}>Option A — Auto register (recommended)</div>
        <ol style={{ margin: '0 0 12px', paddingLeft: '20px' }}>
          <li style={stepStyle}><strong>Register webhooks on Luma + Eventbrite</strong> button dabao (neeche)</li>
          <li style={stepStyle}>Result mein <code>eventbrite: ✓ registered</code> aana chahiye</li>
          <li style={stepStyle}>Auto actions: <code>order.placed</code>, <code>attendee.updated</code></li>
        </ol>
        <div style={subHead}>Option B — Manual (Eventbrite dashboard / API)</div>
        <ol style={{ margin: 0, paddingLeft: '20px' }}>
          <li style={stepStyle}>Eventbrite → Organization → Webhooks create karo</li>
          <li style={stepStyle}><strong>Endpoint URL</strong> yeh paste karo:</li>
        </ol>
        <div style={urlBox}>{ebUrl}</div>
        <CopyButton value={ebUrl} />
        <ol start={3} style={{ margin: '10px 0 0', paddingLeft: '20px' }}>
          <li style={stepStyle}><strong>Actions:</strong> Order placed, Attendee updated</li>
          <li style={stepStyle}>Save → linked event par test ticket buy karo → <strong>Bookings</strong> check karo</li>
        </ol>
      </div>

      <div style={{ ...LABEL_STYLE, marginBottom: '10px', fontSize: '13px', color: '#211B16', fontWeight: 600 }}>
        Auto register (Luma + Eventbrite ek saath)
      </div>
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
        <pre style={{ marginTop: '12px', fontSize: '12px', color: '#8C7F6D', whiteSpace: 'pre-wrap', background: '#FBF7F0', padding: '10px', borderRadius: '6px', border: '1px solid #E8DFD0' }}>{result}</pre>
      )}

      <div style={{ ...noteStyle, marginTop: '16px', marginBottom: 0 }}>
        <strong>Errors?</strong>
        <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
          <li><code>Luma API key not configured</code> → Luma keys save karo</li>
          <li><code>Eventbrite token not configured</code> → Private Token set karo</li>
          <li>Webhook aati hai lekin booking nahi → event Ewentcast se pehle link/sync karo</li>
        </ul>
      </div>
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
  const [htUser, setHtUser] = useState<HtUser | null>(null)
  const [channelLoadError, setChannelLoadError] = useState<string | null>(null)
  const { toasts, toast, removeToast } = useToast()

  useEffect(() => {
    setHtUser(getUser())
  }, [])

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setChannelLoadError(null)
    try {
      const local = await api.getSettings() as SettingsShape
      const merged: SettingsShape = {
        hightribe: local.hightribe || {},
        luma: local.luma || {},
        eventbrite: local.eventbrite || {},
      }

      if (getUser()) {
        try {
          const ht = await fetchChannelSettingsViaProxy(true)
          const fromHt = htDataToPublicForm(ht)
          if (fromHt.luma) {
            merged.luma = {
              apiKey: fromHt.luma.apiKey || merged.luma?.apiKey || '',
              calendarId: fromHt.luma.calendarId || merged.luma?.calendarId || '',
              apiBaseUrl: fromHt.luma.apiBaseUrl || merged.luma?.apiBaseUrl || 'https://public-api.luma.com',
              discoverBaseUrl: fromHt.luma.discoverBaseUrl || merged.luma?.discoverBaseUrl || 'https://api.lu.ma',
            }
          }
          if (fromHt.eventbrite) {
            merged.eventbrite = {
              clientId: fromHt.eventbrite.clientId || merged.eventbrite?.clientId || '',
              clientSecret: fromHt.eventbrite.clientSecret || merged.eventbrite?.clientSecret || '',
              redirectUri: fromHt.eventbrite.redirectUri || merged.eventbrite?.redirectUri || '',
              privateToken: fromHt.eventbrite.privateToken || merged.eventbrite?.privateToken || '',
              publicToken: fromHt.eventbrite.publicToken || merged.eventbrite?.publicToken || '',
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not load channel keys from HighTribe'
          setChannelLoadError(msg)
        }
      }

      setSettings(merged)
    } catch {
      setSettings({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

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
    if ((section === 'luma' || section === 'eventbrite') && !getUser()) {
      toast.error('Sign in to HighTribe first — Luma/Eventbrite keys are saved on your HighTribe account')
      return
    }
    setSaving(section)
    try {
      if (section === 'luma' || section === 'eventbrite') {
        const patch = section === 'luma'
          ? {
              luma: {
                apiKey: settings.luma?.apiKey || '',
                calendarId: settings.luma?.calendarId || '',
                apiBaseUrl: settings.luma?.apiBaseUrl || '',
                discoverBaseUrl: settings.luma?.discoverBaseUrl || '',
              },
            }
          : {
              eventbrite: {
                clientId: settings.eventbrite?.clientId || '',
                clientSecret: settings.eventbrite?.clientSecret || '',
                redirectUri: settings.eventbrite?.redirectUri || '',
                privateToken: settings.eventbrite?.privateToken || '',
                publicToken: settings.eventbrite?.publicToken || '',
              },
            }
        const saved = await saveChannelSettingsViaProxy(appSettingsToHtPatch(patch))
        await fetch('/api/settings?localOnly=1', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
          body: JSON.stringify(htDataToPublicForm(saved)),
        })
      } else {
        await api.updateSettings({ [section]: settings[section] })
      }
      toast.success(`${section} settings saved`)
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

  return (
    <div style={{ maxWidth: '720px' }}>
      <Toast toasts={toasts} onRemove={removeToast} />

      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#211B16' }}>Settings</h1>
        <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#8C7F6D' }}>
          Configure your channel integrations
          {htUser && (
            <span style={{ display: 'block', fontSize: '12px', marginTop: 4 }}>
              Luma & Eventbrite keys sync to your HighTribe account
            </span>
          )}
        </p>
      </div>

      {channelLoadError && (
        <div style={{
          background: 'rgba(194,80,46,0.08)', border: '1px solid rgba(194,80,46,0.3)',
          borderRadius: '8px', padding: '12px 16px', marginBottom: '16px',
          fontSize: '13px', color: '#C2502E', lineHeight: 1.5,
        }}>
          Could not load Luma/Eventbrite keys from HighTribe: {channelLoadError}
        </div>
      )}

      {loading ? (
        <PageLoader label="Loading settings…" />
      ) : (
        <>
          {/* Eventbrite */}
          <SectionCard title="Eventbrite" channel="eventbrite" color="#C2502E">
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
            </div>
          </SectionCard>

          {/* Luma */}
          <SectionCard title="Luma" channel="luma" color="#7C5C8A">
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
                  <input type="url" readOnly style={{ ...INPUT_STYLE, cursor: 'default', color: '#8C7F6D' }}
                    value={lu.apiBaseUrl || 'https://public-api.luma.com'}
                    placeholder="https://public-api.luma.com" />
                </div>
                <div>
                  <label style={LABEL_STYLE}>Discover Base URL</label>
                  <input type="url" readOnly style={{ ...INPUT_STYLE, cursor: 'default', color: '#8C7F6D' }}
                    value={lu.discoverBaseUrl || 'https://api.lu.ma'}
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
          <SectionCard title="HighTribe" channel="hightribe" color="#7C5C8A">
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
                      {isEwentcastSignupUser() ? '✓ Ewentcast account' : '✓ Connected via login'}
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
            {!isEwentcastSignupUser() && (
              <p style={{ fontSize: '12px', color: '#8C7F6D', margin: htUser ? '16px 0 0' : '12px 0 0', lineHeight: 1.5 }}>
                HighTribe bookings load via your login — no webhook setup required.
              </p>
            )}
            {isEwentcastSignupUser() && getEwentcastAccount()?.ht_connected && (
              <p style={{ fontSize: '12px', color: '#8C7F6D', margin: '16px 0 0', lineHeight: 1.5 }}>
                HighTribe events and bookings are available through your linked account.
              </p>
            )}
            <ConnectHightribeSection />
          </SectionCard>

          {/* Webhooks */}
          <SectionCard title="Webhooks" icon="🔔" color="#4E7A4B">
            <p style={{ fontSize: '13px', color: '#8C7F6D', margin: '0 0 14px', lineHeight: 1.5 }}>
              Register Luma and Eventbrite webhooks so new guest registrations appear instantly in Bookings.
            </p>
            <WebhooksPanel />
          </SectionCard>
        </>
      )}
    </div>
  )
}
