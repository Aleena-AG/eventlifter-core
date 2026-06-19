'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getUser } from '@/lib/auth'
import type { AttendeeRecord } from '@/lib/event-registry'
import { publishToAllChannels, updateChannelEvent, type EventFormData } from '@/lib/publish-event'
import { loadEventFormData } from '@/lib/event-form-data'
import type { ChannelKey } from '@/lib/types'
import {
  ALL_CHANNELS, CH_META, SAMPLE_EVENT, SECTIONS, WIZARD_STEPS,
} from './config'

function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="ew-swatch" style={{ width: size, height: size, background: color }} />
}

function Dots({ on }: { on: ChannelKey[] }) {
  return (
    <span className="ew-dots">
      {ALL_CHANNELS.map(c => (
        <i key={c} style={{ background: on.includes(c) ? CH_META[c].color : '#30363d' }} />
      ))}
    </span>
  )
}

type PubStatus = 'queued' | 'publishing' | 'synced' | 'error'
type PubState = Partial<Record<ChannelKey, { status: PubStatus; url?: string; message?: string }>>

interface WizardProps {
  modal?: boolean
  onClose?: () => void
  onDone?: () => void
  mode?: 'create' | 'edit'
  editChannel?: ChannelKey
  editEventId?: string | number
}

export function EwentcastWizard({
  modal, onClose, onDone, mode = 'create', editChannel, editEventId,
}: WizardProps = {}) {
  const isEdit = mode === 'edit' && !!editChannel && editEventId != null && editEventId !== ''
  const [step, setStep] = useState(0)
  const [section, setSection] = useState(0)
  const [ev, setEv] = useState<EventFormData>({ ...SAMPLE_EVENT })
  const [targets, setTargets] = useState<ChannelKey[]>(
    isEdit && editChannel ? [editChannel] : [...ALL_CHANNELS],
  )
  const [pub, setPub] = useState<PubState>({})
  const [publishing, setPublishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingEvent, setLoadingEvent] = useState(isEdit)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [attendees, setAttendees] = useState<AttendeeRecord[]>([])
  const [sold, setSold] = useState(0)
  const [conns, setConns] = useState<Record<ChannelKey, boolean>>({
    hightribe: true, eventbrite: false, luma: false,
  })

  useEffect(() => {
    if (!isEdit || !editChannel || editEventId == null || editEventId === '') return
    setLoadingEvent(true)
    setLoadError(null)
    setTargets([editChannel])
    loadEventFormData(editChannel, editEventId)
      .then(data => { setEv(data); setLoadingEvent(false) })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load event')
        setLoadingEvent(false)
      })
  }, [isEdit, editChannel, editEventId])

  useEffect(() => {
    if (step !== 2) return
    fetch('/api/registry').then(r => r.json()).then((d: { events?: Array<{ attendees: AttendeeRecord[]; sold: number }> }) => {
      const latest = d.events?.[d.events.length - 1]
      if (latest) {
        setAttendees(latest.attendees || [])
        setSold(latest.sold || 0)
      }
    }).catch(() => {})
  }, [step])

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then((s: {
      eventbrite?: { hasPrivateToken?: boolean; clientId?: string }
      luma?: { configured?: boolean }
    }) => {
      setConns({
        hightribe: true,
        eventbrite: !!(s.eventbrite?.hasPrivateToken || s.eventbrite?.clientId),
        luma: !!s.luma?.configured,
      })
    }).catch(() => {})
  }, [])

  const liveTargets = targets.filter(t => conns[t])
  const connCount = ALL_CHANNELS.filter(c => conns[c]).length
  const user = getUser()
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'UH'

  const setField = (k: string, v: string | boolean) => setEv(prev => ({ ...prev, [k]: v }))
  const toggleTarget = (ch: ChannelKey) => {
    if (isEdit) return
    if (!conns[ch]) return
    setTargets(prev => prev.includes(ch) ? prev.filter(x => x !== ch) : [...prev, ch])
  }

  async function saveEdit() {
    if (!editChannel || editEventId == null) return
    setSaving(true)
    setSaveError(null)
    try {
      await updateChannelEvent(editChannel, editEventId, ev)
      onDone?.()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function startPublish() {
    setPublishing(true)
    const queued: PubState = {}
    liveTargets.forEach(ch => { queued[ch] = { status: 'queued' } })
    setPub(queued)

    for (const ch of liveTargets) {
      setPub(p => ({ ...p, [ch]: { status: 'publishing' } }))
      await new Promise(r => setTimeout(r, 300))
    }

    const results = await publishToAllChannels(ev, liveTargets)
    const next: PubState = {}
    for (const ch of liveTargets) {
      const r = results[ch]
      next[ch] = r?.status === 'synced'
        ? { status: 'synced', url: r.url }
        : { status: 'error', message: r?.message || 'Failed' }
    }
    setPub(next)
    setPublishing(false)
  }

  const sec = SECTIONS[section]

  function renderField(f: typeof SECTIONS[0]['fields'][0]) {
    const v = ev[f.k]
    const lab = (
      <label>
        <span className="lab">
          {f.label}
          {f.hint && <span className="hint"> · {f.hint}</span>}
        </span>
        <Dots on={f.on} />
      </label>
    )
    let ctrl: React.ReactNode
    if (f.type === 'textarea') {
      ctrl = <textarea value={String(v ?? '')} onChange={e => setField(f.k, e.target.value)} />
    } else if (f.type === 'select') {
      ctrl = (
        <select value={String(v ?? '')} onChange={e => setField(f.k, e.target.value)}>
          {(f.opts || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    } else if (f.type === 'toggle') {
      const on = !!v
      ctrl = (
        <button type="button" className="ew-tg" onClick={() => setField(f.k, !on)}>
          <span className={`track${on ? ' on' : ''}`}><span className="knob" /></span>
          <span style={{ fontSize: '13.5px' }}>{on ? 'On' : 'Off'}</span>
        </button>
      )
    } else {
      ctrl = <input value={String(v ?? '')} onChange={e => setField(f.k, e.target.value)} />
    }
    return <div key={f.k} className={`ew-field${f.full ? ' full' : ''}`}>{lab}{ctrl}</div>
  }

  function viewCreate() {
    if (loadingEvent) {
      return (
        <div className="ew-view">
          <div className="ew-head">
            <span className="ew-eyebrow">{isEdit ? 'Edit event' : 'Step 1 · Master event'}</span>
            <h2>{isEdit ? 'Loading event…' : 'Create it once'}</h2>
          </div>
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Fetching event details…</p>
        </div>
      )
    }
    if (loadError) {
      return (
        <div className="ew-view">
          <div className="ew-head">
            <span className="ew-eyebrow">Edit event</span>
            <h2>Could not load event</h2>
            <p style={{ color: '#f85149' }}>{loadError}</p>
          </div>
          <div className="ew-foot">
            <button type="button" className="ew-btn ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      )
    }

    return (
      <div className="ew-view">
        <div className="ew-head">
          <span className="ew-eyebrow">{isEdit ? `Edit · ${editChannel ? CH_META[editChannel].name : ''}` : 'Step 1 · Master event'}</span>
          <h2>{isEdit ? 'Update event' : 'Create it once'}</h2>
          <p>{isEdit ? 'Changes save back to the channel this event lives on.' : 'Fill it in full here. The dots on each field show which platforms accept it.'}</p>
        </div>

        <div className="ew-pubto">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="label">{isEdit ? 'CHANNEL' : 'PUBLISH TO'}</span>
            {(isEdit && editChannel ? [editChannel] : ALL_CHANNELS).map(ch => {
              const on = targets.includes(ch) && conns[ch]
              return (
                <button
                  key={ch}
                  type="button"
                  className={`ew-ch-chip${conns[ch] ? '' : ' off'}${isEdit ? ' locked' : ''}`}
                  style={on ? { borderColor: CH_META[ch].color, background: CH_META[ch].color + '14' } : undefined}
                  onClick={() => toggleTarget(ch)}
                  disabled={isEdit}
                >
                  <Swatch color={CH_META[ch].color} size={9} />
                  {CH_META[ch].name}{on ? ' ✓' : ''}
                </button>
              )
            })}
          </div>
          {!isEdit && <Link href="/channels" className="ew-link">⚙ Manage channels</Link>}
        </div>

        <div className="ew-tabs">
          {SECTIONS.map((s, i) => (
            <button key={s.key} type="button" className={i === section ? 'active' : ''} onClick={() => setSection(i)}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="ew-card">
          <div className="ew-card-top">
            <span className="ew-eyebrow">{sec.label}</span>
            <div className="ew-legend">
              {ALL_CHANNELS.map(c => (
                <span key={c}><Swatch color={CH_META[c].color} size={7} />{CH_META[c].name}</span>
              ))}
            </div>
          </div>
          <div className="ew-grid2">{sec.fields.map(renderField)}</div>
        </div>

        <div className="ew-foot">
          {saveError && <span className="note" style={{ color: '#f85149' }}>{saveError}</span>}
          {!saveError && (
            <span className="note">
              Section {section + 1} of {SECTIONS.length}
              {isEdit ? ' · edit fields then save.' : ' · prefilled — edit or publish as is.'}
            </span>
          )}
          <div style={{ display: 'flex', gap: 10 }}>
            {section < SECTIONS.length - 1 && (
              <button type="button" className="ew-btn ghost" onClick={() => setSection(section + 1)}>
                Next: {SECTIONS[section + 1].label} →
              </button>
            )}
            {isEdit ? (
              <button type="button" className="ew-btn primary" disabled={saving} onClick={saveEdit}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            ) : (
              <button type="button" className="ew-btn primary" disabled={liveTargets.length === 0} onClick={() => setStep(1)}>
                Review &amp; publish →
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  function viewPublish() {
    const allDone = liveTargets.length > 0 && liveTargets.every(ch => pub[ch]?.status === 'synced')
    const started = Object.keys(pub).length > 0

    return (
      <div className="ew-view">
        <div className="ew-head">
          <span className="ew-eyebrow">Step 2</span>
          <h2>Publish everywhere</h2>
          <p>One master event, fanning out to {liveTargets.length} channels. Each returns its own live link.</p>
        </div>

        <div className="ew-castgrid">
          <div className="ew-master">
            <span className="ew-eyebrow" style={{ color: '#a78bfa' }}>Master event</span>
            <div className="t">{String(ev.title)}</div>
            <div className="meta">
              <span>📅 {String(ev.date)} · {String(ev.time)}</span>
              <span>📍 {String(ev.venue)}</span>
              <span>👥 {String(ev.capacity)} cap</span>
              <span>🎟 {ev.ticketType === 'Free' ? 'Free' : `${ev.currency} ${ev.price}`}</span>
            </div>
          </div>
          <div className="ew-lanes">
            {liveTargets.map(ch => {
              const st = pub[ch]?.status
              const url = pub[ch]?.url
              return (
                <div key={ch} className="ew-lane">
                  <span
                    className={`sig${st === 'publishing' ? ' pub' : ''}`}
                    style={{ background: st === 'synced' ? '#3fb950' : st === 'publishing' ? CH_META[ch].color : '#30363d' }}
                  />
                  <span className="nm"><Swatch color={CH_META[ch].color} />{CH_META[ch].name}</span>
                  {st === 'synced' && url ? (
                    <a href={`https://${url}`} target="_blank" rel="noreferrer">{url} ↗</a>
                  ) : st === 'error' ? (
                    <span className="mid" style={{ color: '#f85149' }}>{pub[ch]?.message}</span>
                  ) : (
                    <span className="mid">{CH_META[ch].cap}</span>
                  )}
                  {st === 'synced' && <span className="ew-pill" style={{ color: '#3fb950' }}>✓ Synced</span>}
                  {st === 'publishing' && <span className="ew-pill" style={{ color: CH_META[ch].color }}><span className="ew-spin" /> Publishing</span>}
                  {st === 'queued' && <span className="ew-pill" style={{ color: 'var(--muted)' }}>◌ Queued</span>}
                  {!st && <span className="ew-pill" style={{ color: '#6e7681' }}>Ready</span>}
                </div>
              )
            })}
          </div>
        </div>

        <div className="ew-foot">
          <span className="note">
            {allDone ? 'All channels synced. Attendees now flow back into one dashboard.' :
              started ? 'Publishing — links appear as each channel confirms.' : 'Nothing published yet.'}
          </span>
          {allDone ? (
            <button type="button" className="ew-btn primary" onClick={() => setStep(2)}>Open dashboard →</button>
          ) : (
            <button type="button" className="ew-btn primary" disabled={publishing || started} onClick={startPublish}>
              {publishing || started ? 'Working…' : `Publish to ${liveTargets.length} channels`}
            </button>
          )}
        </div>
      </div>
    )
  }

  function viewDashboard() {
    const cap = parseInt(String(ev.capacity)) || 150
    const price = parseInt(String(ev.price)) || 0
    const revenue = ev.ticketType === 'Free' ? 0 : sold * price
    const filled = cap > 0 ? Math.round(sold / cap * 100) : 0

    return (
      <div className="ew-view">
        <div className="ew-head">
          <span className="ew-eyebrow">Step 3 · Live</span>
          <h2>{String(ev.title)}</h2>
          <p>One attendee list, one revenue number — pulled back from every channel via webhooks.</p>
        </div>

        <div className="ew-stats">
          <div className="ew-stat"><div className="k">Attendees</div><div className="v">{sold}</div><div className="s">unified via webhooks</div></div>
          <div className="ew-stat"><div className="k">Revenue</div><div className="v">{ev.ticketType === 'Free' ? 'Free' : `${ev.currency} ${revenue.toLocaleString()}`}</div><div className="s">{sold} registrations</div></div>
          <div className="ew-stat"><div className="k">Capacity</div><div className="v">{filled}%</div><div className="s">{sold} of {cap}</div></div>
          <div className="ew-stat"><div className="k">Channels</div><div className="v">{liveTargets.length}</div><div className="s">synced</div></div>
        </div>

        <div className="ew-card">
          <span className="ew-eyebrow">Unified attendee list</span>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>↻ deduped by email · capacity syncs across channels</div>
          {attendees.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 14, margin: '12px 0' }}>No registrations yet. Bookings on any channel will appear here automatically.</p>
          ) : attendees.map(a => (
            <div key={a.email} className="ew-att">
              <div className="who">
                <span className="ava">{a.name.split(' ').map(n => n[0]).join('').slice(0, 2)}</span>
                <div>
                  <div className="nm">{a.name}</div>
                  <div className="ew-srcs"><span><Swatch color={CH_META[a.source].color} size={7} />{CH_META[a.source].name}</span></div>
                </div>
              </div>
              <span style={{ fontSize: 12, color: '#3fb950' }}>✓ Registered</span>
            </div>
          ))}
        </div>

        <div className="ew-foot">
          {modal ? (
            <button type="button" className="ew-link" onClick={onDone}>← Back to events</button>
          ) : (
            <Link href="/events" className="ew-link">← View all events</Link>
          )}
          <button type="button" className="ew-btn ghost" onClick={() => { setStep(0); setPub({}) }}>Create another</button>
        </div>
      </div>
    )
  }

  return (
    <div className={`ew-root${modal ? ' ew-in-modal' : ''}`}>
      <div className="ew-wrap">
        <header className="ew-bar">
          <div className="ew-brand">
            <svg width="34" height="34" viewBox="0 0 100 100" aria-label="EventLifter">
              <defs>
                <linearGradient id="ew-logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#388bfd" />
                  <stop offset="100%" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
              <rect width="100" height="100" rx="20" fill="url(#ew-logo-grad)" />
              <text x="50" y="62" textAnchor="middle" fill="#fff" fontSize="36" fontWeight="700" fontFamily="system-ui,sans-serif">E</text>
            </svg>
            <div>
              <div className="name">EventLifter</div>
              <div className="tag">{isEdit ? 'Edit event on channel.' : 'Create once. Publish everywhere.'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div className="ew-stepper">
              {(isEdit ? WIZARD_STEPS.slice(0, 1) : WIZARD_STEPS).map((label, i) => (
                <span key={label} style={{ display: 'contents' }}>
                  <button type="button" className={i === step ? 'active' : ''} onClick={() => !isEdit && setStep(i)} disabled={isEdit && i > 0}>
                    <span className="n">{i + 1}</span>{isEdit ? 'Edit' : label}
                  </button>
                  {!isEdit && i < WIZARD_STEPS.length - 1 && <span style={{ color: '#30363d' }}>·</span>}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--paper)', border: '1px solid var(--line)', borderRadius: 999, padding: '5px 6px 5px 12px' }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: '#3fb950', display: 'inline-block' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{connCount}/3</span>
              <span style={{ width: 28, height: 28, borderRadius: 999, background: 'linear-gradient(135deg, #388bfd, #a78bfa)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700 }}>{initials}</span>
            </div>
          </div>
        </header>

        {step === 0 && viewCreate()}
        {step === 1 && viewPublish()}
        {step === 2 && viewDashboard()}
      </div>
    </div>
  )
}
