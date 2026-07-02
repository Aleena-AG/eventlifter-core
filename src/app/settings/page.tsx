'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { api } from '@/lib/api'
import { Toast, useToast } from '@/components/Toast'
import { InlineLoader, PageLoader } from '@/components/Loader'
import { getUser } from '@/lib/auth'
import type { HtUser } from '@/lib/auth'
import { ChannelLogo } from '@/components/ChannelLogo'
import { HIGHTRIBE_COLOR, LUMA_COLOR, EVENTBRITE_COLOR } from '@/lib/brand'
import { ConnectHightribeSection } from '@/components/ConnectHightribeSection'
import { getEwentcastAccount, isEwentcastSignupUser, fetchAuthMe } from '@/lib/ewentcast-session'
import { disconnectChannelIntegration } from '@/lib/channel-disconnect'
import { effectiveEventbriteRedirectUri } from '@/lib/app-url'
import { useAppUrl, useEventbriteRedirectUri } from '@/lib/use-app-url'
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
    <button type="button" onClick={copy} style={{
      ...BTN_GHOST, padding: '4px 10px', fontSize: '11px', flexShrink: 0,
      color: copied ? '#4E7A4B' : '#8C7F6D',
      borderColor: copied ? 'rgba(63,185,80,0.35)' : '#E8DFD0',
    }}>
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

function PortalUrlRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="settings-portal-url-row">
      <label style={LABEL}>{label}</label>
      {hint ? <p className="settings-portal-url-hint">{hint}</p> : null}
      <div className="settings-portal-url-row__inner">
        <code className="settings-portal-url-value">{value}</code>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

function EventbritePortalUrls() {
  const appUrl = useAppUrl()
  const redirectUri = useEventbriteRedirectUri()
  return (
    <div className="settings-portal-urls">
      <p className="settings-portal-urls__title">
        Copy into Eventbrite → Account → Developer Links → API Keys → your app (Key Info)
      </p>
      <PortalUrlRow
        label="Application URL"
        value={appUrl}
        hint="Replace api.hightribe.com with this URL in Eventbrite app settings."
      />
      <PortalUrlRow
        label="OAuth Redirect URI"
        value={redirectUri}
        hint="Must match exactly in Eventbrite and in the Redirect URI field below."
      />
    </div>
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

function StepGuide({ steps, color, title }: {
  steps: GuideStep[]
  color: string
  title: string
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [active, setActive] = useState(0)

  const toggleStep = (i: number) => setActive((prev) => (prev === i ? prev : i))

  if (collapsed) {
    return (
      <div className="step-guide step-guide--collapsed" style={{ '--guide-color': color } as React.CSSProperties}>
        <div className="step-guide__collapsed-bar">
          <div className="step-guide__collapsed-left">
            <span className="step-guide__icon step-guide__icon--sm" aria-hidden="true">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                <line x1="8" y1="7" x2="16" y2="7" />
                <line x1="8" y1="11" x2="14" y2="11" />
              </svg>
            </span>
            <div>
              <span className="step-guide__collapsed-label">Setup guide</span>
              <span className="step-guide__collapsed-meta">{steps.length} steps · currently on step {active + 1}</span>
            </div>
          </div>
          <div className="step-guide__collapsed-track" aria-hidden="true">
            {steps.map((s, i) => (
              <span
                key={s.num}
                className={`step-guide__collapsed-dot${i <= active ? ' step-guide__collapsed-dot--done' : ''}`}
              />
            ))}
          </div>
          <button type="button" className="step-guide__expand-btn" onClick={() => setCollapsed(false)}>
            Open guide
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="step-guide" style={{ '--guide-color': color } as React.CSSProperties}>
      <div className="step-guide__hero">
        <div className="step-guide__hero-text">
          <span className="step-guide__eyebrow">Step-by-step guide</span>
          <h3 className="step-guide__hero-title">{title}</h3>
          <p className="step-guide__hero-desc">
            Complete these {steps.length} steps on the provider&apos;s site, then paste the values into the form below.
          </p>
        </div>
        <button type="button" className="step-guide__collapse-btn" onClick={() => setCollapsed(true)}>
          Minimize
        </button>
      </div>

      <ol className="step-guide__timeline">
        {steps.map((s, i) => {
          const isActive = i === active
          const isDone = i < active
          return (
            <li
              key={s.num}
              className={`step-guide__item${isActive ? ' step-guide__item--active' : ''}${isDone ? ' step-guide__item--done' : ''}`}
            >
              <button
                type="button"
                className="step-guide__item-trigger"
                onClick={() => toggleStep(i)}
                aria-expanded={isActive}
              >
                <span className="step-guide__item-marker" aria-hidden="true">
                  {isDone ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : s.num}
                </span>
                <span className="step-guide__item-summary">
                  <span className="step-guide__item-title">{s.title}</span>
                  {!isActive && <span className="step-guide__item-hint">{s.path}</span>}
                </span>
                <span className="step-guide__item-chevron" aria-hidden="true">{isActive ? '−' : '+'}</span>
              </button>

              {isActive && (
                <div className="step-guide__item-panel">
                  <div className="step-guide__screenshot">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.img}
                      alt={`Step ${s.num}: ${s.title}`}
                      onError={(e) => {
                        const img = e.currentTarget as HTMLImageElement
                        const p = img.parentElement
                        img.style.display = 'none'
                        if (p) p.innerHTML = '<span class="step-guide__img-fallback">Screenshot not found</span>'
                      }}
                    />
                  </div>
                  <p className="step-guide__step-desc">{s.desc}</p>
                  <div className="step-guide__meta">
                    <code className="step-guide__path">{s.path}</code>
                    {s.note && <span className="step-guide__note">{s.note}</span>}
                  </div>
                  <div className="step-guide__item-footer">
                    {i > 0 && (
                      <button type="button" className="step-guide__footer-btn" onClick={() => setActive(i - 1)}>
                        ← Previous step
                      </button>
                    )}
                    {i < steps.length - 1 ? (
                      <button type="button" className="step-guide__footer-btn step-guide__footer-btn--primary" onClick={() => setActive(i + 1)}>
                        Next step →
                      </button>
                    ) : (
                      <span className="step-guide__done-msg">You&apos;re done — paste your credentials below.</span>
                    )}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
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
    desc: 'Copy Application URL and OAuth Redirect URI from the box above (with Copy buttons). Paste them into Eventbrite Key Info, then create or save your API key.',
    path: 'Key Info → Application URL + OAuth Redirect URI', img: '/eventbrite-guide/step_2_eventbrite.png',
  },
  {
    num: 3, title: 'Copy Credentials',
    desc: 'Copy your Private Token, API Key, and Client Secret. Paste them into the fields below.',
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
  const appUrl = useAppUrl()
  const eventbriteRedirect = useEventbriteRedirectUri()
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

  useEffect(() => {
    fetchAuthMe().catch(() => {})
  }, [])

  const loadSettings = useCallback(async () => {
    setLoading(true)
    setChannelLoadError(null)
    try {
      const data = await api.getSettings() as SettingsShape
      setSettings({
        hightribe: data.hightribe || {},
        luma: data.luma || {},
        eventbrite: data.eventbrite || {},
      })
    } catch (e) {
      setSettings({})
      setChannelLoadError(e instanceof Error ? e.message : 'Could not load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadSettings() }, [loadSettings])

  const updateSection = (section: keyof SettingsShape, key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [section]: { ...(prev[section] || {}), [key]: value } }))
  }

  const saveSection = async (section: keyof SettingsShape) => {
    if (!getUser()) {
      toast.error('Sign in first')
      return
    }
    setSaving(section)
    try {
      const patch =
        section === 'luma'
          ? {
              luma: {
                apiKey: settings.luma?.apiKey || '',
                calendarId: settings.luma?.calendarId || '',
                apiBaseUrl: settings.luma?.apiBaseUrl || 'https://public-api.luma.com',
                discoverBaseUrl: settings.luma?.discoverBaseUrl || 'https://api.lu.ma',
              },
            }
          : section === 'eventbrite'
            ? {
                eventbrite: {
                  clientId: settings.eventbrite?.clientId || '',
                  clientSecret: settings.eventbrite?.clientSecret || '',
                  redirectUri: effectiveEventbriteRedirectUri(
                    settings.eventbrite?.redirectUri,
                    eventbriteRedirect,
                  ),
                  privateToken: settings.eventbrite?.privateToken || '',
                  publicToken: settings.eventbrite?.publicToken || '',
                },
              }
            : { hightribe: settings.hightribe || {} }

      await api.updateSettings(patch)
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

  const DEFAULT_REDIRECT = eventbriteRedirect
  const eb = settings.eventbrite || {}
  const ebRedirectDisplay = effectiveEventbriteRedirectUri(eb.redirectUri, eventbriteRedirect)
  const lu = settings.luma || {}
  const ebConnected = !!eb.privateToken
  const luConnected = !!lu.apiKey

  const showEventbrite = !focusChannel || focusChannel === 'eventbrite'
  const showLuma = !focusChannel || focusChannel === 'luma'
  const showHightribe = !focusChannel || focusChannel === 'hightribe'
  const showWebhooks = !focusChannel || focusChannel === 'luma' || focusChannel === 'eventbrite'
  const webhookOnly = focusChannel === 'luma' || focusChannel === 'eventbrite' ? focusChannel : undefined

  return (
    <div className="settings-page">
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
          Could not load settings: {channelLoadError}
        </div>
      )}

      {loading ? <PageLoader label="Loading settings…" /> : (
        <>
          {showEventbrite && (
          <SectionCard title="Eventbrite" channel="eventbrite">
            <div className="settings-channel-layout">
              <div className="settings-channel-layout__guide">
                <StepGuide steps={EVENTBRITE_STEPS} color={EVENTBRITE_COLOR} title="How to connect Eventbrite" />
              </div>
              <div className="settings-channel-layout__form">
                <EventbritePortalUrls />
                <p className="settings-form-heading">Paste your credentials here</p>
                <div className="settings-form-fields">
              <div className="settings-grid-2">
                <div>
                  <label style={LABEL}>API Key</label>
                  <input style={INPUT} type="text" placeholder="API Key"
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
                <label style={LABEL}>OAuth Redirect URI (saved in app)</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input style={{ ...INPUT, flex: 1 }} type="text" placeholder={DEFAULT_REDIRECT}
                    value={ebRedirectDisplay}
                    onChange={(e) => updateSection('eventbrite', 'redirectUri', e.target.value)} />
                  <CopyButton value={ebRedirectDisplay} />
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
              </div>
            </div>
          </SectionCard>
          )}

          {showLuma && (
          <SectionCard title="Luma" channel="luma">
            <div className="settings-channel-layout">
              <div className="settings-channel-layout__guide">
                <StepGuide steps={LUMA_STEPS} color={LUMA_COLOR} title="How to connect Luma" />
              </div>
              <div className="settings-channel-layout__form">
                <p className="settings-form-heading">Paste your credentials here</p>
                <div className="settings-form-fields">
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
