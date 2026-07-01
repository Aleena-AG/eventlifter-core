'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
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
import { HIGHTRIBE_COLOR, LUMA_COLOR, EVENTBRITE_COLOR } from '@/lib/brand'
import { ConnectHightribeSection } from '@/components/ConnectHightribeSection'
import { getEwentcastAccount, isEwentcastSignupUser } from '@/lib/ewentcast-session'
import { disconnectChannelIntegration } from '@/lib/channel-disconnect'
import { eventbriteRedirectUri } from '@/lib/app-url'
import { useRouter } from 'next/navigation'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_META } from '@/lib/channels'
import './settings.css'

const FOCUS_CHANNELS: ChannelKey[] = ['hightribe', 'luma', 'eventbrite']

// ─── shared styles ────────────────────────────────────────────────────────────

const INPUT: React.CSSProperties = {
  width: '100%', background: '#FBF7F0', border: '1px solid #E8DFD0',
  borderRadius: '6px', padding: '8px 10px', fontSize: '13px',
  color: '#211B16', outline: 'none',
}

const LABEL: React.CSSProperties = {
  display: 'block', fontSize: '12px', color: '#8C7F6D',
  marginBottom: '4px', fontWeight: 500,
}

const BTN_PRIMARY: React.CSSProperties = {
  background: '#D98A2B', border: 'none', borderRadius: '6px',
  color: '#fff', padding: '7px 18px', fontSize: '13px', fontWeight: 500,
  cursor: 'pointer',
}

const BTN_GHOST: React.CSSProperties = {
  background: 'transparent', border: '1px solid #E8DFD0', borderRadius: '6px',
  color: '#5A4F45', padding: '7px 14px', fontSize: '13px', cursor: 'pointer',
}

const BTN_DISCONNECT: React.CSSProperties = {
  background: '#FFFFFF', border: '1px solid #E8DFD0', borderRadius: '6px',
  color: '#C2502E', padding: '7px 14px', fontSize: '13px', fontWeight: 500,
  cursor: 'pointer',
}

// ─── SectionCard ──────────────────────────────────────────────────────────────

function SectionCard({ title, icon, channel, children }: {
  title: string
  icon?: string
  channel?: ChannelKey
  children: React.ReactNode
}) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #E8DFD0', borderRadius: '10px',
      overflow: 'hidden', marginBottom: '16px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '14px 20px', borderBottom: '1px solid #F0E8DC',
        background: '#FDFAF6',
      }}>
        {channel
          ? <ChannelLogo channel={channel} size={26} />
          : <span style={{ fontSize: '17px' }}>{icon}</span>}
        <span style={{ fontSize: '14px', fontWeight: 600, color: '#211B16' }}>{title}</span>
      </div>
      <div style={{ padding: '20px' }}>{children}</div>
    </div>
  )
}

// ─── CopyButton ───────────────────────────────────────────────────────────────

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button onClick={copy} style={{
      ...BTN_GHOST, padding: '4px 10px', fontSize: '11px',
      color: copied ? '#4E7A4B' : '#8C7F6D',
      borderColor: copied ? 'rgba(63,185,80,0.35)' : '#E8DFD0',
    }}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

// ─── StepGuide (shared for Luma + Eventbrite) ─────────────────────────────────

type GuideStep = {
  num: number
  title: string
  desc: string
  path: string
  img: string
  note?: string
}

function StepGuide({ steps, color, title, defaultOpen = false }: {
  steps: GuideStep[]
  color: string
  title: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const [step, setStep] = useState(0)
  const current = steps[step]

  return (
    <div style={{
      border: `1px solid ${color}30`, borderRadius: '8px',
      marginBottom: '16px', overflow: 'hidden',
      background: `${color}08`,
    }}>
      {/* header */}
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', padding: '10px 14px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: '13px', fontWeight: 600, color }}>
          {title}
        </span>
        <span style={{ fontSize: '12px', color: `${color}99` }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{ padding: '0 14px 14px', background: '#fff', borderTop: `1px solid ${color}20` }}>
          {/* progress dots */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '12px 0 14px' }}>
            {steps.map((s, i) => (
              <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={() => setStep(i)}
                  style={{
                    width: '8px', height: '8px', borderRadius: '50%', border: 'none',
                    padding: 0, cursor: 'pointer', flexShrink: 0,
                    background: i < step ? color : i === step ? '#D98A2B' : '#E8DFD0',
                    transition: 'background 0.2s',
                  }}
                />
                {i < steps.length - 1 && (
                  <div style={{ height: '1px', width: '20px', background: i < step ? color : '#E8DFD0' }} />
                )}
              </div>
            ))}
          </div>

          {/* slide */}
          <div style={{ border: '1px solid #E8DFD0', borderRadius: '8px', overflow: 'hidden' }}>
            <div style={{
              background: '#F8F4FB', borderBottom: '1px solid #E8DFD0',
              minHeight: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              overflow: 'hidden',
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.img}
                alt={current.title}
                style={{ width: '100%', height: 'auto', display: 'block', maxHeight: '240px', objectFit: 'cover' }}
                onError={(e) => {
                  const img = e.currentTarget as HTMLImageElement
                  const p = img.parentElement
                  img.style.display = 'none'
                  if (p) p.innerHTML = '<span style="font-size:12px;color:#8C7F6D;padding:16px">Screenshot not found</span>'
                }}
              />
            </div>
            <div style={{ padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <div style={{
                  width: '26px', height: '26px', borderRadius: '50%', flexShrink: 0,
                  background: color, color: '#fff', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
                }}>
                  {current.num}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#211B16', marginBottom: '3px' }}>
                    {current.title}
                  </div>
                  <div style={{ fontSize: '12px', color: '#5A4F45', lineHeight: 1.6, marginBottom: '6px' }}>
                    {current.desc}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <code style={{
                      fontSize: '11px', background: '#FBF7F0', border: '1px solid #E8DFD0',
                      borderRadius: '4px', padding: '2px 7px', color,
                    }}>
                      {current.path}
                    </code>
                    {current.note && (
                      <span style={{
                        fontSize: '11px', background: 'rgba(217,138,43,0.1)',
                        border: '1px solid rgba(217,138,43,0.3)', borderRadius: '4px',
                        padding: '2px 7px', color: '#D98A2B',
                      }}>
                        {current.note}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* nav */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              style={{ ...BTN_GHOST, fontSize: '12px', padding: '4px 12px', opacity: step === 0 ? 0.35 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: '12px', color: '#8C7F6D' }}>{step + 1} / {steps.length}</span>
            <button
              onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
              disabled={step === steps.length - 1}
              style={{ ...BTN_GHOST, fontSize: '12px', padding: '4px 12px', opacity: step === steps.length - 1 ? 0.35 : 1 }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Step data ────────────────────────────────────────────────────────────────

const LUMA_STEPS: GuideStep[] = [
  {
    num: 1, title: 'Open Calendars',
    desc: 'Go to lu.ma → click Calendars in the top nav → select your calendar.',
    path: 'lu.ma → Calendars', img: '/luma-guide/step_1_luma.png',
  },
  {
    num: 2, title: 'Open Settings',
    desc: 'Inside your calendar, click the Settings tab in the top navigation bar.',
    path: 'Calendar → Settings', img: '/luma-guide/step_2_luma.png',
  },
  {
    num: 3, title: 'Go to Developer',
    desc: 'In the left sidebar click Developer. You will see API Keys and Webhooks sections.',
    path: 'Settings → Developer', img: '/luma-guide/step_3_luma.png',
  },
  {
    num: 4, title: 'Register Webhook',
    desc: 'Scroll to Webhooks → click + Create → paste the Webhook URL → set Actions to All Actions → Save.',
    path: 'Developer → Webhooks → + Create',
    note: 'Luma Plus required', img: '/luma-guide/step_4_luma.png',
  },
]

const EVENTBRITE_STEPS: GuideStep[] = [
  {
    num: 1, title: 'Open Eventbrite Developer',
    desc: 'Go to eventbrite.com → Account → Developer Links → API Keys. Click Create API Key.',
    path: 'Account → Developer Links → API Keys', img: '/eventbrite-guide/step_1_eventbrite.png',
  },
  {
    num: 2, title: 'Fill App Details',
    desc: 'Enter your app name and set the OAuth Redirect URI to your production URL. Click Create Key.',
    path: 'Create API Key → Fill form', img: '/eventbrite-guide/step_2_eventbrite.png',
  },
  {
    num: 3, title: 'Copy Credentials',
    desc: 'Copy your Private Token, Client ID, and Client Secret. Paste them into the fields below.',
    path: 'API Key Details → Copy credentials', img: '/eventbrite-guide/step_3_eventbrite.png',
  },
  {
    num: 4, title: 'Register Webhook',
    desc: 'Go to Organization → Webhooks → Add Webhook. Paste the Webhook URL and select Order Placed + Attendee Updated.',
    path: 'Organization → Webhooks → Add Webhook', img: '/eventbrite-guide/step_4_eventbrite.png',
  },
]

// ─── WebhooksPanel ────────────────────────────────────────────────────────────

const WEBHOOK_CHANNELS = ['luma', 'eventbrite'] as const

function WebhooksPanel({ only }: { only?: 'luma' | 'eventbrite' }) {
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
        webhooks?: Record<string, { ok?: boolean; error?: string }>
      } = {}
      try { data = text ? JSON.parse(text) : {} } catch {
        throw new Error(res.ok ? 'Invalid response' : `HTTP ${res.status}`)
      }
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      const lines = channels.map((ch) => {
        const r = data.webhooks?.[ch]
        return `${ch}: ${r?.ok ? '✓ registered' : `✗ ${r?.error || 'failed'}`}`
      })
      setResult(lines.join('\n'))
    } catch (e) {
      setResult(e instanceof Error ? e.message : 'Setup failed')
    } finally {
      setLoading(false)
    }
  }

  const lumaUrl = endpoints.luma || 'https://your-domain.com/api/webhooks/luma'
  const ebUrl = endpoints.eventbrite || 'https://your-domain.com/api/webhooks/eventbrite'
  const isLocalhost = lumaUrl.includes('localhost')

  const urlRowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '8px',
    background: '#FBF7F0', border: '1px solid #E8DFD0',
    borderRadius: '6px', padding: '8px 10px', marginBottom: '10px',
  }

  const channels = only ? [only] as const : WEBHOOK_CHANNELS

  return (
    <div>
      {isLocalhost && (
        <div style={{
          fontSize: '12px', color: '#C2502E', lineHeight: 1.5,
          background: 'rgba(194,80,46,0.06)', border: '1px solid rgba(194,80,46,0.2)',
          borderRadius: '6px', padding: '10px 12px', marginBottom: '14px',
        }}>
          ⚠ You are on localhost — webhooks only work on a public HTTPS URL. Deploy to production first.
        </div>
      )}

      {channels.includes('luma') && (
      <div style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <ChannelLogo channel="luma" size={18} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#211B16' }}>Luma</span>
        </div>
        <div style={urlRowStyle}>
          <code style={{ flex: 1, fontSize: '12px', color: '#211B16', wordBreak: 'break-all' }}>{lumaUrl}</code>
          <CopyButton value={lumaUrl} />
        </div>
      </div>
      )}

      {channels.includes('eventbrite') && (
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <ChannelLogo channel="eventbrite" size={18} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: '#211B16' }}>Eventbrite</span>
        </div>
        <div style={urlRowStyle}>
          <code style={{ flex: 1, fontSize: '12px', color: '#211B16', wordBreak: 'break-all' }}>{ebUrl}</code>
          <CopyButton value={ebUrl} />
        </div>
      </div>
      )}

      <button
        onClick={setup}
        disabled={loading}
        style={{ ...BTN_PRIMARY, opacity: loading ? 0.6 : 1 }}
      >
        {loading ? <InlineLoader label="Registering" /> : 'Register webhooks'}
      </button>

      {result && (
        <pre style={{
          marginTop: '12px', fontSize: '12px', color: '#5A4F45',
          whiteSpace: 'pre-wrap', background: '#FBF7F0', padding: '10px 12px',
          borderRadius: '6px', border: '1px solid #E8DFD0', lineHeight: 1.6,
        }}>{result}</pre>
      )}
    </div>
  )
}

// ─── Main settings shape ──────────────────────────────────────────────────────

type SettingsShape = {
  eventbrite?: Record<string, string>
  luma?: Record<string, string>
  hightribe?: Record<string, string>
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const channelParam = searchParams.get('channel')
  const focusChannel = FOCUS_CHANNELS.includes(channelParam as ChannelKey)
    ? (channelParam as ChannelKey)
    : null

  const [settings, setSettings] = useState<SettingsShape>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [htUser, setHtUser] = useState<HtUser | null>(null)
  const [channelLoadError, setChannelLoadError] = useState<string | null>(null)
  const { toasts, toast, removeToast } = useToast()

  useEffect(() => { setHtUser(getUser()) }, [])

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
          setChannelLoadError(e instanceof Error ? e.message : 'Could not load keys from Hightribe')
        }
      }
      setSettings(merged)
    } catch {
      setSettings({})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  const updateSection = (section: keyof SettingsShape, key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [section]: { ...(prev[section] || {}), [key]: value } }))
  }

  const saveSection = async (section: keyof SettingsShape) => {
    if ((section === 'luma' || section === 'eventbrite') && !getUser()) {
      toast.error('Sign in to Hightribe first')
      return
    }
    setSaving(section)
    try {
      if (section === 'luma' || section === 'eventbrite') {
        const patch = section === 'luma'
          ? { luma: { apiKey: settings.luma?.apiKey || '', calendarId: settings.luma?.calendarId || '', apiBaseUrl: settings.luma?.apiBaseUrl || '', discoverBaseUrl: settings.luma?.discoverBaseUrl || '' } }
          : { eventbrite: { clientId: settings.eventbrite?.clientId || '', clientSecret: settings.eventbrite?.clientSecret || '', redirectUri: settings.eventbrite?.redirectUri || '', privateToken: settings.eventbrite?.privateToken || '', publicToken: settings.eventbrite?.publicToken || '' } }
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

  const disconnectSection = async (section: 'eventbrite' | 'luma' | 'hightribe') => {
    const names = { eventbrite: 'Eventbrite', luma: 'Luma', hightribe: 'HighTribe' }
    if (!window.confirm(`Disconnect ${names[section]}?`)) return
    setDisconnecting(section)
    try {
      const result = await disconnectChannelIntegration(section)
      if (result === 'session') {
        toast.success('Signed out')
        router.replace('/login')
        return
      }
      toast.success(`${names[section]} disconnected`)
      await loadSettings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setDisconnecting(null)
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
    const key = settings.luma?.apiKey
    if (!key) { toast.error('Enter your Luma API key first'); return }
    setTesting('luma')
    try {
      const res = await fetch('/api/luma/verify-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: key }),
      })
      const json = await res.json() as { status: string; message?: string }
      if (!res.ok || json.status === 'error') throw new Error(json.message || 'Invalid API key')
      toast.success('Luma connection OK')
    } catch (err) {
      toast.error(`Test failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setTesting(null)
    }
  }

  const DEFAULT_REDIRECT = eventbriteRedirectUri()
  const eb = settings.eventbrite || {}
  const lu = settings.luma || {}
  const ebConnected = !!(eb.privateToken || eb.clientId)
  const luConnected = !!lu.apiKey

  const showEventbrite = !focusChannel || focusChannel === 'eventbrite'
  const showLuma = !focusChannel || focusChannel === 'luma'
  const showHightribe = !focusChannel || focusChannel === 'hightribe'
  const showWebhooks = !focusChannel || focusChannel === 'luma' || focusChannel === 'eventbrite'
  const webhookOnly = focusChannel === 'luma' || focusChannel === 'eventbrite' ? focusChannel : undefined

  return (
    <div className={`settings-page${focusChannel ? ' settings-page--narrow' : ''}`}>
      <Toast toasts={toasts} onRemove={removeToast} />

      {focusChannel && (
        <Link
          href="/channels"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            fontSize: '13px', fontWeight: 600, color: '#8C7F6D',
            textDecoration: 'none', marginBottom: '16px',
          }}
        >
          ← Back to Channels
        </Link>
      )}

      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#211B16' }}>
          {focusChannel ? `${CHANNEL_META[focusChannel].name} settings` : 'Settings'}
        </h1>
        <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#8C7F6D' }}>
          {focusChannel
            ? `Configure your ${CHANNEL_META[focusChannel].name} connection.`
            : 'Manage your channel integrations'}
          {!focusChannel && (
            <>
              {' '}
              <Link href="/channels" style={{ color: '#D98A2B', textDecoration: 'none' }}>
                View channels →
              </Link>
            </>
          )}
        </p>
      </div>

      {channelLoadError && (
        <div style={{
          background: 'rgba(194,80,46,0.06)', border: '1px solid rgba(194,80,46,0.25)',
          borderRadius: '8px', padding: '10px 14px', marginBottom: '14px',
          fontSize: '12px', color: '#C2502E',
        }}>
          Could not load keys from Hightribe: {channelLoadError}
        </div>
      )}

      {loading ? <PageLoader label="Loading settings…" /> : (
        <>
          {showEventbrite && (
          <SectionCard title="Eventbrite" channel="eventbrite">
            <StepGuide steps={EVENTBRITE_STEPS} color={EVENTBRITE_COLOR} title="Setup guide (4 steps)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="settings-grid-2">
                <div>
                  <label style={LABEL}>Client ID</label>
                  <input style={INPUT} type="text" placeholder="Client ID"
                    value={eb.clientId || ''}
                    onChange={(e) => updateSection('eventbrite', 'clientId', e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Client Secret</label>
                  <input style={INPUT} type="password" placeholder="Client Secret"
                    value={eb.clientSecret || ''}
                    onChange={(e) => updateSection('eventbrite', 'clientSecret', e.target.value)} />
                </div>
              </div>
              <div>
                <label style={LABEL}>Redirect URI</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ ...INPUT, flex: 1 }} type="text" placeholder={DEFAULT_REDIRECT}
                    value={eb.redirectUri || DEFAULT_REDIRECT}
                    onChange={(e) => updateSection('eventbrite', 'redirectUri', e.target.value)} />
                  <CopyButton value={eb.redirectUri || DEFAULT_REDIRECT} />
                </div>
              </div>
              <div className="settings-grid-2">
                <div>
                  <label style={LABEL}>Private Token</label>
                  <input style={INPUT} type="password" placeholder="Private Token"
                    value={eb.privateToken || ''}
                    onChange={(e) => updateSection('eventbrite', 'privateToken', e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Public Token</label>
                  <input style={INPUT} type="text" placeholder="Public Token"
                    value={eb.publicToken || ''}
                    onChange={(e) => updateSection('eventbrite', 'publicToken', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => saveSection('eventbrite')} disabled={saving === 'eventbrite'}
                  style={{ ...BTN_PRIMARY, opacity: saving === 'eventbrite' ? 0.6 : 1 }}>
                  {saving === 'eventbrite' ? <InlineLoader label="Saving" /> : 'Save'}
                </button>
                <button onClick={testEventbrite} disabled={testing === 'eventbrite'}
                  style={{ ...BTN_GHOST, opacity: testing === 'eventbrite' ? 0.6 : 1 }}>
                  {testing === 'eventbrite' ? 'Testing…' : 'Test Connection'}
                </button>
                {ebConnected && (
                  <button
                    onClick={() => disconnectSection('eventbrite')}
                    disabled={disconnecting === 'eventbrite'}
                    style={{ ...BTN_DISCONNECT, opacity: disconnecting === 'eventbrite' ? 0.6 : 1 }}
                  >
                    {disconnecting === 'eventbrite' ? <InlineLoader label="…" /> : 'Disconnect'}
                  </button>
                )}
              </div>
            </div>
          </SectionCard>
          )}

          {showLuma && (
          <SectionCard title="Luma" channel="luma">
            <StepGuide steps={LUMA_STEPS} color={LUMA_COLOR} title="Setup guide (4 steps)" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="settings-grid-2">
                <div>
                  <label style={LABEL}>API Key</label>
                  <input style={INPUT} type="password" placeholder="Luma Plus API Key"
                    value={lu.apiKey || ''}
                    onChange={(e) => updateSection('luma', 'apiKey', e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Calendar ID</label>
                  <input style={INPUT} type="text" placeholder="cal-xxxxx"
                    value={lu.calendarId || ''}
                    onChange={(e) => updateSection('luma', 'calendarId', e.target.value)} />
                </div>
              </div>
              <div className="settings-grid-2">
                <div>
                  <label style={LABEL}>API Base URL</label>
                  <input style={INPUT} type="text" placeholder="https://public-api.luma.com"
                    value={lu.apiBaseUrl || 'https://public-api.luma.com'}
                    onChange={(e) => updateSection('luma', 'apiBaseUrl', e.target.value)} />
                </div>
                <div>
                  <label style={LABEL}>Discover Base URL</label>
                  <input style={INPUT} type="text" placeholder="https://api.lu.ma"
                    value={lu.discoverBaseUrl || 'https://api.lu.ma'}
                    onChange={(e) => updateSection('luma', 'discoverBaseUrl', e.target.value)} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button onClick={() => saveSection('luma')} disabled={saving === 'luma'}
                  style={{ ...BTN_PRIMARY, opacity: saving === 'luma' ? 0.6 : 1 }}>
                  {saving === 'luma' ? <InlineLoader label="Saving" /> : 'Save'}
                </button>
                <button onClick={testLuma} disabled={testing === 'luma'}
                  style={{ ...BTN_GHOST, opacity: testing === 'luma' ? 0.6 : 1 }}>
                  {testing === 'luma' ? 'Testing…' : 'Test Connection'}
                </button>
                {luConnected && (
                  <button
                    onClick={() => disconnectSection('luma')}
                    disabled={disconnecting === 'luma'}
                    style={{ ...BTN_DISCONNECT, opacity: disconnecting === 'luma' ? 0.6 : 1 }}
                  >
                    {disconnecting === 'luma' ? <InlineLoader label="…" /> : 'Disconnect'}
                  </button>
                )}
              </div>
            </div>
          </SectionCard>
          )}

          {showHightribe && (
          <SectionCard title="Hightribe" channel="hightribe">
            {htUser ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                  background: `linear-gradient(135deg, ${HIGHTRIBE_COLOR}, #D98A2B)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', fontWeight: 700, color: '#fff',
                }}>
                  {htUser.name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: '#211B16' }}>{htUser.name}</div>
                  <div style={{ fontSize: '12px', color: '#8C7F6D', marginBottom: '6px' }}>
                    {htUser.email}
                    {htUser.username && <span style={{ marginLeft: '6px', color: HIGHTRIBE_COLOR }}>@{htUser.username}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                      background: 'rgba(63,185,80,0.1)', border: '1px solid rgba(63,185,80,0.3)', color: '#4E7A4B',
                    }}>
                      ✓ {isEwentcastSignupUser() ? 'Ewentcast account' : 'Connected'}
                    </span>
                    {htUser.has_business_profile && (
                      <span style={{
                        fontSize: '11px', padding: '2px 8px', borderRadius: '20px',
                        background: 'rgba(209,71,157,0.1)', border: '1px solid rgba(209,71,157,0.3)', color: HIGHTRIBE_COLOR,
                      }}>Business Profile</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: '#8C7F6D' }}>
                Hightribe connects automatically when you sign in.{' '}
                <a href="/login" style={{ color: HIGHTRIBE_COLOR, textDecoration: 'none', fontWeight: 500 }}>Sign in →</a>
              </div>
            )}
            {isEwentcastSignupUser() && getEwentcastAccount()?.ht_connected && (
              <p style={{ fontSize: '12px', color: '#8C7F6D', margin: '12px 0 0' }}>
                Hightribe events and bookings are available through your linked account.
              </p>
            )}
            <ConnectHightribeSection />
          </SectionCard>
          )}

          {showWebhooks && (
          <SectionCard title="Webhooks" icon="🔔">
            <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#8C7F6D', lineHeight: 1.5 }}>
              Register webhooks so new registrations appear instantly in Bookings. Save your credentials above first.
            </p>
            <WebhooksPanel only={webhookOnly} />
          </SectionCard>
          )}
        </>
      )}
    </div>
  )
}
