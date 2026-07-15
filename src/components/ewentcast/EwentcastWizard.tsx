'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getUser } from '@/lib/auth'
import { connectedChannelsFromMap, fetchChannelConnectionMap } from '@/lib/channel-connection'
import type { AttendeeRecord } from '@/lib/event-registry'
import { publishToAllChannels, updateChannelEventsAll, upsertLocalEventSnapshot, type EventFormData } from '@/lib/publish-event'
import { refreshStoredEventsForChannels, markEventsListStale } from '@/lib/channel-data-sync'
import type { EventCoverFiles } from '@/lib/cover-image'
import { loadEventFormData } from '@/lib/event-form-data'
import { resolveClientApiUrl } from '@/lib/client-api-url'
import type { ChannelKey } from '@/lib/types'
import {
  ALL_CHANNELS, CH_META, DEFAULT_EVENT, SECTIONS, WIZARD_STEPS,
  getTimeZones, detectTimeZone,
} from './config'
import { getFormCompletion } from './form-completion'
import { fetchCountries, fetchStates } from '@/lib/geo'
import { CoverCropper } from './CoverCropper'
import { LocationSection } from './LocationSection'
import { InlineLoader, PageLoader } from '@/components/Loader'

const TIME_ZONES = getTimeZones()

/** Cross-field checks for the When step (end must not be before start). */
function getWhenErrors(ev: EventFormData): Record<string, string> {
  const errors: Record<string, string> = {}
  const date = String(ev.date || '')
  const time = String(ev.time || '')
  const endDate = String(ev.endDate || '')
  const endTime = String(ev.endTime || '')

  if (date && endDate && endDate < date) {
    errors.endDate = 'End date can’t be before the start date.'
  } else if (date && endDate && endDate === date && time && endTime && endTime <= time) {
    errors.endTime = 'End time must be after the start time.'
  }
  return errors
}

function Swatch({ color, size = 10 }: { color: string; size?: number }) {
  return <span className="ew-swatch" style={{ width: size, height: size, background: color }} />
}

function Dots({ on }: { on: ChannelKey[] }) {
  return (
    <span className="ew-dots">
      {ALL_CHANNELS.map(c => (
        <i key={c} style={{ background: on.includes(c) ? CH_META[c].color : 'var(--line)' }} />
      ))}
    </span>
  )
}

type PubStatus = 'queued' | 'publishing' | 'synced' | 'error'
type PubState = Partial<Record<ChannelKey, { status: PubStatus; url?: string; message?: string }>>

interface WizardProps {
  modal?: boolean
  onClose?: () => void
  onDone?: (updatedChannels?: ChannelKey[]) => void
  mode?: 'create' | 'edit'
  editChannel?: ChannelKey
  editEventId?: string | number
  editChannelIds?: Partial<Record<ChannelKey, string | number>>
}

export function EwentcastWizard({
  modal, onClose, onDone, mode = 'create', editChannel, editEventId, editChannelIds,
}: WizardProps = {}) {
  const isEdit = mode === 'edit' && !!editChannel && editEventId != null && editEventId !== ''
  const editTargets: Partial<Record<ChannelKey, string | number>> = isEdit
    ? (editChannelIds && Object.keys(editChannelIds).length > 0
      ? editChannelIds
      : editChannel && editEventId != null
        ? { [editChannel]: editEventId }
        : {})
    : {}
  const editTargetChannels = ALL_CHANNELS.filter(
    (ch) => editTargets[ch] != null && editTargets[ch] !== '',
  )
  const [step, setStep] = useState(0)
  const [section, setSection] = useState(0)
  const [ev, setEv] = useState<EventFormData>({ ...DEFAULT_EVENT })
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [cropState, setCropState] = useState<{ file: File; fieldKey: string } | null>(null)
  const [countries, setCountries] = useState<string[]>([])
  const [regions, setRegions] = useState<string[]>([])
  const [regionsLoading, setRegionsLoading] = useState(false)
  const [targets, setTargets] = useState<ChannelKey[]>(
    isEdit ? editTargetChannels : [],
  )
  const [pub, setPub] = useState<PubState>({})
  const [masterId, setMasterId] = useState<string | null>(null)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadingEvent, setLoadingEvent] = useState(isEdit)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [attendees, setAttendees] = useState<AttendeeRecord[]>([])
  const [sold, setSold] = useState(0)
  const [conns, setConns] = useState<Record<ChannelKey, boolean>>({
    hightribe: false, eventbrite: false, luma: false,
  })
  const [connsLoaded, setConnsLoaded] = useState(false)

  useEffect(() => {
    if (!isEdit || !editChannel || editEventId == null || editEventId === '') return
    setLoadingEvent(true)
    setLoadError(null)
    setTargets(editTargetChannels)
    loadEventFormData(editChannel, editEventId, editTargets)
      .then(data => {
        // Final guard: never leave Luma's ONLY_MD sentinel in the form
        const description = String(data.description || '').trim()
        const summary = String(data.summary || '').trim()
        const scrubbed = {
          ...data,
          description: /^ONLY_MD$/i.test(description) || /^ONLY_HTML$/i.test(description) ? '' : data.description,
          summary: /^ONLY_MD$/i.test(summary) || /^ONLY_HTML$/i.test(summary) ? '' : data.summary,
        }
        setEv(scrubbed)
        setCoverFile(null)
        setLoadingEvent(false)
      })
      .catch(err => {
        setLoadError(err instanceof Error ? err.message : 'Failed to load event')
        setLoadingEvent(false)
      })
  }, [isEdit, editChannel, editEventId, editChannelIds])

  useEffect(() => {
    if (isEdit) return
    setEv(prev => {
      const next = { ...prev }
      if (!next.timezone) next.timezone = detectTimeZone()
      if (!next.hostName) {
        const user = getUser()
        if (user?.name) next.hostName = user.name
      }
      if (!next.status) next.status = 'Draft'
      if (!next.visibility) next.visibility = 'Public'
      return next
    })
  }, [isEdit])

  useEffect(() => {
    let cancelled = false
    fetchCountries().then(list => { if (!cancelled) setCountries(list) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const country = String(ev.country || '')
    if (!country) { setRegions([]); return }
    let cancelled = false
    setRegionsLoading(true)
    fetchStates(country)
      .then(list => { if (!cancelled) { setRegions(list); setRegionsLoading(false) } })
      .catch(() => { if (!cancelled) { setRegions([]); setRegionsLoading(false) } })
    return () => { cancelled = true }
  }, [ev.country])

  // Ticket sales may only run on event days — clamp any out-of-range window.
  useEffect(() => {
    const eventStart = String(ev.date || '')
    if (!eventStart) return
    const eventEnd = String(ev.endDate || '') || eventStart
    const clamp = (val: string) => {
      let v = val
      if (v && v < eventStart) v = eventStart
      if (v && eventEnd && v > eventEnd) v = eventEnd
      return v
    }
    setEv(prev => {
      const start = String(prev.salesStart || '')
      const end = String(prev.salesEnd || '')
      const next: Record<string, string> = {}
      const cs = clamp(start)
      const ce = clamp(end)
      if (start && cs !== start) next.salesStart = cs
      if (end && ce !== end) next.salesEnd = ce
      return Object.keys(next).length ? { ...prev, ...next } : prev
    })
  }, [ev.date, ev.endDate])

  useEffect(() => {
    if (step !== 2) return
    fetch(resolveClientApiUrl('/api/registry')).then(r => r.json()).then((d: { events?: Array<{ attendees: AttendeeRecord[]; sold: number }> }) => {
      const latest = d.events?.[d.events.length - 1]
      if (latest) {
        setAttendees(latest.attendees || [])
        setSold(latest.sold || 0)
      }
    }).catch(() => {})
  }, [step])

  useEffect(() => {
    let cancelled = false
    fetchChannelConnectionMap()
      .then((map) => {
        if (cancelled) return
        setConns(map)
        if (!isEdit) setTargets(connectedChannelsFromMap(map))
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setConnsLoaded(true) })
    return () => { cancelled = true }
  }, [isEdit])

  const liveTargets = targets.filter(t => conns[t])
  const connCount = ALL_CHANNELS.filter(c => conns[c]).length
  const formCompletion = getFormCompletion(ev, liveTargets)
  const { pct: formPct, allComplete: formComplete, sectionStatuses } = formCompletion
  const whenErrors = getWhenErrors(ev)
  const hasErrors = Object.keys(whenErrors).length > 0
  const user = getUser()
  const initials = user?.name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'UH'

  const setField = (k: string, v: string | boolean) => setEv(prev => {
    const next = { ...prev, [k]: v, currency: 'USD' }
    if (k === 'ticketType' && (v === 'Free' || v === 'Donation')) {
      next.price = '0'
    }
    return next
  })
  const toggleTarget = (ch: ChannelKey) => {
    if (isEdit) return
    if (!conns[ch]) return
    setTargets(prev => prev.includes(ch) ? prev.filter(x => x !== ch) : [...prev, ch])
  }

  const coverFiles: EventCoverFiles = { cover: coverFile }

  async function saveEdit() {
    if (!isEdit || editTargetChannels.length === 0) return
    setSaving(true)
    setSaveError(null)
    try {
      const results = await updateChannelEventsAll(ev, editTargets, coverFiles)
      const succeeded = editTargetChannels.filter((ch) => results[ch]?.ok)
      const failed = editTargetChannels
        .map((ch) => ({ ch, ...results[ch] }))
        .filter((r) => !r.ok)

      // If nothing saved, keep the modal open with the error.
      if (succeeded.length === 0) {
        const msg = failed
          .map((r) => `${CH_META[r.ch].name}: ${r.message || 'Update failed'}`)
          .join(' · ')
        throw new Error(msg || 'Save failed')
      }

      // Persist full master fields (category, timezone, location, WHEN, ticket sales).
      try {
        const { findMasterByChannelEvent } = await import('@/lib/event-registry')
        const {
          updateRegistryMaster,
          buildRegistryMasterWriteFromForm,
        } = await import('@/lib/registry-api')
        let mid = masterId
        if (!mid && editChannel && editEventId != null) {
          const master = await findMasterByChannelEvent(editChannel, String(editEventId))
          mid = master?.id || null
          if (mid) setMasterId(mid)
        }
        if (mid) {
          await updateRegistryMaster(mid, buildRegistryMasterWriteFromForm(ev))
        }
      } catch {
        // Channel save already succeeded — registry patch is best-effort.
      }

      // Close immediately — refresh the local store in the background so a slow
      // channel fetch never leaves the edit modal stuck open.
      onDone?.(succeeded)
      const okTargets: Partial<Record<ChannelKey, string | number>> = {}
      for (const ch of succeeded) {
        const id = editTargets[ch]
        if (id != null && id !== '') okTargets[ch] = id
      }
      // Persist the form we just saved first, then refresh from channel APIs.
      // Doing refresh first wiped venue/location when a channel omitted them.
      void (async () => {
        await Promise.all(
          succeeded.map((ch) => {
            const id = editTargets[ch]
            if (id == null || id === '') return Promise.resolve()
            return upsertLocalEventSnapshot(ch, ev, { eventId: String(id) }).catch(() => {})
          }),
        )
        await refreshStoredEventsForChannels(okTargets).catch(() => {})
        // Re-apply our saved form on top of whatever the live APIs returned
        await Promise.all(
          succeeded.map((ch) => {
            const id = editTargets[ch]
            if (id == null || id === '') return Promise.resolve()
            return upsertLocalEventSnapshot(ch, ev, { eventId: String(id) }).catch(() => {})
          }),
        )
        markEventsListStale()
      })()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function startPublish() {
    // First run publishes every connected channel; a retry only re-publishes the
    // ones that aren't already synced (so we never duplicate a synced channel).
    const toPublish = liveTargets.filter(ch => pub[ch]?.status !== 'synced')
    const targets = toPublish.length > 0 ? toPublish : liveTargets
    if (targets.length === 0) return

    setPublishError(null)
    setPublishing(true)
    setPub(p => {
      const next = { ...p }
      targets.forEach(ch => { next[ch] = { status: 'queued' } })
      return next
    })

    for (const ch of targets) {
      setPub(p => ({ ...p, [ch]: { status: 'publishing' } }))
      await new Promise(r => setTimeout(r, 300))
    }

    try {
      const { masterId: mid, results } = await publishToAllChannels(
        ev, targets, coverFiles, masterId ?? undefined,
      )
      setMasterId(mid)
      setPub(p => {
        const next = { ...p }
        for (const ch of targets) {
          const r = results[ch]
          next[ch] = r?.status === 'synced'
            ? { status: 'synced', url: r.url }
            : { status: 'error', message: r?.message || 'Failed' }
        }
        return next
      })

      // Persist each successful publish into the local store without a full
      // channel sync+prune (that can wipe brand-new HT/EB drafts that aren't
      // returned by the remote list API yet).
      const publishedTargets: Partial<Record<ChannelKey, string>> = {}
      for (const ch of targets) {
        const r = results[ch]
        if (r?.status === 'synced' && r.eventId) publishedTargets[ch] = r.eventId
      }
      if (Object.keys(publishedTargets).length > 0) {
        await refreshStoredEventsForChannels(publishedTargets).catch(() => { /* best-effort */ })
      }
      markEventsListStale()
    } catch (e) {
      // Master-event creation failed — nothing was published, so reset lanes.
      setPublishError(e instanceof Error ? e.message : 'Publish failed')
      setPub(p => {
        const next = { ...p }
        for (const ch of targets) next[ch] = { status: 'error', message: 'Not published' }
        return next
      })
    } finally {
      setPublishing(false)
    }
  }

  const sec = SECTIONS[section]

  // Tickets can only be sold on event days (not before start, not after end).
  function salesDateBounds(k: string): { min?: string; max?: string } {
    const eventStart = String(ev.date || '') || undefined
    const eventEnd = String(ev.endDate || '') || eventStart
    if (k === 'salesStart') {
      const salesEnd = String(ev.salesEnd || '') || undefined
      const max = salesEnd && eventEnd && salesEnd < eventEnd ? salesEnd : eventEnd
      return { min: eventStart, max }
    }
    if (k === 'salesEnd') {
      const salesStart = String(ev.salesStart || '') || undefined
      const min = salesStart && eventStart && salesStart > eventStart ? salesStart : eventStart
      return { min, max: eventEnd }
    }
    return {}
  }

  function setSalesDateField(k: string, value: string) {
    const { min, max } = salesDateBounds(k)
    let next = value
    if (next && max && next > max) next = max
    if (next && min && next < min) next = min
    setField(k, next)
  }

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
      ctrl = (
        <textarea
          value={String(v ?? '')}
          placeholder={f.placeholder}
          onChange={e => setField(f.k, e.target.value)}
        />
      )
    } else if (f.type === 'select') {
      ctrl = (
        <select value={String(v ?? '')} onChange={e => setField(f.k, e.target.value)}>
          <option value="">Select…</option>
          {(f.opts || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    } else if (f.type === 'timezone') {
      ctrl = (
        <select value={String(v ?? '')} onChange={e => setField(f.k, e.target.value)}>
          <option value="">Select timezone…</option>
          {TIME_ZONES.map(tz => (
            <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
          ))}
        </select>
      )
    } else if (f.type === 'country') {
      const current = String(v ?? '')
      const opts = current && !countries.includes(current) ? [current, ...countries] : countries
      ctrl = countries.length > 0 ? (
        <select
          value={current}
          onChange={e => setEv(prev => ({ ...prev, country: e.target.value, region: '' }))}
        >
          <option value="">Select country…</option>
          {opts.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : (
        <input
          value={current}
          placeholder={f.placeholder}
          onChange={e => setField(f.k, e.target.value)}
        />
      )
    } else if (f.type === 'region') {
      const hasCountry = !!String(ev.country || '')
      const current = String(v ?? '')
      const opts = current && !regions.includes(current) ? [current, ...regions] : regions
      ctrl = regions.length > 0 ? (
        <select value={current} onChange={e => setField(f.k, e.target.value)}>
          <option value="">{regionsLoading ? 'Loading…' : 'Select region / state…'}</option>
          {opts.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      ) : (
        <input
          value={String(v ?? '')}
          placeholder={
            regionsLoading ? 'Loading…' : hasCountry ? 'Type region / state' : 'Select a country first'
          }
          onChange={e => setField(f.k, e.target.value)}
        />
      )
    } else if (f.type === 'date' || f.type === 'time') {
      const isSalesDate = f.k === 'salesStart' || f.k === 'salesEnd'
      const sales = isSalesDate ? salesDateBounds(f.k) : {}
      const min =
        sales.min ??
        (f.k === 'endDate'
          ? (String(ev.date || '') || undefined)
          : f.k === 'endTime' && ev.date && ev.endDate && String(ev.endDate) === String(ev.date)
            ? (String(ev.time || '') || undefined)
            : undefined)
      ctrl = (
        <input
          type={f.type}
          min={min}
          max={sales.max}
          value={String(v ?? '')}
          onChange={e => (isSalesDate ? setSalesDateField(f.k, e.target.value) : setField(f.k, e.target.value))}
        />
      )
    } else if (f.type === 'toggle') {
      const on = !!v
      ctrl = (
        <button type="button" className="ew-tg" onClick={() => setField(f.k, !on)}>
          <span className={`track${on ? ' on' : ''}`}><span className="knob" /></span>
          <span style={{ fontSize: '13.5px' }}>{on ? 'On' : 'Off'}</span>
        </button>
      )
    } else if (f.type === 'cover') {
      const preview = String(v ?? '')
      ctrl = (
        <div className="ew-cover-field">
          {preview ? (
            <img src={preview} alt="Cover preview" className="ew-cover-preview" />
          ) : (
            <div className="ew-cover-placeholder">No cover selected</div>
          )}
          <div className="ew-cover-actions">
            <label className="ew-btn ghost ew-cover-upload">
              Upload photo
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  setCropState({ file, fieldKey: f.k })
                  e.target.value = ''
                }}
              />
            </label>
            {coverFile && (
              <button
                type="button"
                className="ew-btn ghost"
                onClick={() => setCropState({ file: coverFile, fieldKey: f.k })}
              >
                Adjust crop
              </button>
            )}
            {preview && (
              <button
                type="button"
                className="ew-btn ghost"
                onClick={() => { setCoverFile(null); setField(f.k, '') }}
              >
                Remove
              </button>
            )}
          </div>
          <input
            type="url"
            placeholder="Or paste image URL (https://…)"
            value={preview.startsWith('blob:') ? '' : preview}
            onChange={e => {
              setCoverFile(null)
              setField(f.k, e.target.value)
            }}
          />
        </div>
      )
    } else if (f.k === 'price') {
      ctrl = (
        <div className="ew-price-input">
          <span className="ew-price-prefix" aria-hidden="true">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            value={String(v ?? '')}
            placeholder="0.00"
            onChange={e => setField(f.k, e.target.value)}
          />
        </div>
      )
    } else {
      ctrl = (
        <input
          value={String(v ?? '')}
          placeholder={f.placeholder}
          onChange={e => setField(f.k, e.target.value)}
        />
      )
    }
    const err = whenErrors[f.k]
    return (
      <div key={f.k} className={`ew-field${f.full ? ' full' : ''}${err ? ' ew-field--invalid' : ''}`}>
        {lab}
        {ctrl}
        {err && <span className="ew-field-err" role="alert">{err}</span>}
      </div>
    )
  }

  function viewCreate() {
    if (loadingEvent) {
      return (
        <div className="ew-view">
          <PageLoader label={isEdit ? 'Loading event…' : 'Preparing form…'} />
        </div>
      )
    }
    if (loadError) {
      return (
        <div className="ew-view">
          <div className="ew-head">
            <span className="ew-eyebrow">Edit event</span>
            <h2>Could not load event</h2>
            <p style={{ color: 'var(--error)' }}>{loadError}</p>
          </div>
          <div className="ew-foot">
            <button type="button" className="ew-btn ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      )
    }

    const noneConnected = !isEdit && connsLoaded && connCount === 0
    const someConnected = !isEdit && connsLoaded && connCount > 0 && connCount < ALL_CHANNELS.length

    return (
      <div className="ew-view">
        <div className="ew-view-body">
        <div className="ew-head">
          <span className="ew-eyebrow">
            {isEdit
              ? `Edit · ${editTargetChannels.map(ch => CH_META[ch].name).join(', ')}`
              : 'Step 1 · Master event'}
          </span>
          <h2>{isEdit ? 'Update event' : 'Create it once'}</h2>
          <p>
            {isEdit
              ? editTargetChannels.length > 1
                ? 'Changes save to every linked channel below.'
                : 'Changes save back to the channel this event lives on.'
              : 'Work through each tab below. Colored dots on each field show which platforms need it.'}
          </p>
        </div>

        {!isEdit && (
          <div className="ew-publish-headline">
            Publish your event to <b>Eventbrite</b>, <b>Luma</b> &amp; <b>Hightribe</b>
          </div>
        )}

        {noneConnected && (
          <div className="ew-connect-note ew-connect-note--warn" role="status">
            <span className="ew-connect-note-icon" aria-hidden="true">🔌</span>
            <div className="ew-connect-note-body">
              <strong>No channel connected.</strong> You can build your event, but it won’t publish
              until at least one channel is connected.
            </div>
            <Link href="/channels" className="ew-connect-note-link">Connect channels →</Link>
          </div>
        )}
        {someConnected && (
          <div className="ew-connect-note" role="status">
            <span className="ew-connect-note-icon" aria-hidden="true">✓</span>
            <div className="ew-connect-note-body">
              <strong>{connCount} of {ALL_CHANNELS.length} channels connected.</strong> Connect the
              rest if you want to publish to all {ALL_CHANNELS.length}.
            </div>
            <Link href="/channels" className="ew-connect-note-link">Manage channels →</Link>
          </div>
        )}

        <div className="ew-pubto">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="label">{isEdit ? 'CHANNELS' : 'PUBLISH TO'}</span>
            {(isEdit ? editTargetChannels : ALL_CHANNELS).map(ch => {
              const on = isEdit
                ? editTargetChannels.includes(ch)
                : targets.includes(ch) && conns[ch]
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

        <div className="ew-tabs-panel">
          <div className="ew-tabs-meta">
            <span className="ew-tabs-current">
              {sec.label} · step {section + 1} of {SECTIONS.length}
            </span>
            <span className="ew-tabs-pct">{formPct}% complete</span>
          </div>

          <div className="ew-tabs" role="tablist" aria-label="Event sections">
            {SECTIONS.map((s, i) => {
              const st = sectionStatuses[i]
              const sectionInvalid = s.key === 'when' && hasErrors
              const tabClass = [
                i === section ? 'active' : '',
                sectionInvalid ? 'invalid' : '',
                st.complete && !sectionInvalid ? 'done' : '',
                st.pct > 0 && !st.complete ? 'started' : '',
              ].filter(Boolean).join(' ')
              return (
                <button
                  key={s.key}
                  type="button"
                  role="tab"
                  aria-selected={i === section}
                  aria-label={`${s.label}, ${st.pct}% filled${st.complete ? ', complete' : ''}`}
                  className={tabClass}
                  onClick={() => setSection(i)}
                >
                  <span className="ew-tab-label">
                    <span className="ew-tab-step">{sectionInvalid ? '!' : st.complete ? '✓' : i + 1}</span>
                    {s.label}
                  </span>
                  <span className="ew-tab-track" aria-hidden="true">
                    <span className="ew-tab-fill" style={{ width: `${st.pct}%` }} />
                  </span>
                </button>
              )
            })}
          </div>

          <div className="ew-section-progress-wrap">
            <div
              className="ew-section-progress"
              role="progressbar"
              aria-valuenow={formPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Form completion"
            >
              <div
                className="ew-section-progress-fill"
                style={{ width: `${formPct}%` }}
              />
            </div>
            <span className="ew-section-progress-pct">{formPct}%</span>
          </div>
        </div>

        <div className="ew-card">
          <div className="ew-card-top">
            <span className="ew-eyebrow">{sec.label} · {section + 1} of {SECTIONS.length}</span>
            <div className="ew-legend" title="Platform compatibility">
              {ALL_CHANNELS.map(c => (
                <span key={c}><Swatch color={CH_META[c].color} size={7} />{CH_META[c].name}</span>
              ))}
            </div>
          </div>
          {sec.key === 'where'
            ? <LocationSection ev={ev} setField={setField} />
            : <div className="ew-grid2">{sec.fields.map(renderField)}</div>}
        </div>
        </div>

        <div className="ew-foot">
          {saveError && <span className="note ew-foot-error">{saveError}</span>}
          {hasErrors && <span className="note ew-foot-error">{Object.values(whenErrors)[0]}</span>}
          <div className="ew-foot-actions">
            {section > 0 && (
              <button type="button" className="ew-btn ghost" onClick={() => setSection(section - 1)}>
                ← {SECTIONS[section - 1].label}
              </button>
            )}
            {section < SECTIONS.length - 1 && (
              <button type="button" className="ew-btn ghost" onClick={() => setSection(section + 1)}>
                {SECTIONS[section + 1].label} →
              </button>
            )}
            {isEdit ? (
              <button type="button" className="ew-btn primary" disabled={saving || hasErrors} onClick={saveEdit}>
                {saving ? <InlineLoader label="Saving" /> : 'Save changes'}
              </button>
            ) : (
              <button
                type="button"
                className="ew-btn primary"
                disabled={liveTargets.length === 0 || !formComplete || hasErrors}
                title={
                  hasErrors
                    ? 'Fix the date/time errors to continue'
                    : !formComplete
                      ? `Complete all sections to publish (${formPct}% done)`
                      : undefined
                }
                onClick={() => setStep(1)}
              >
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
    const settled = started && !publishing
    const syncedCount = liveTargets.filter(ch => pub[ch]?.status === 'synced').length
    const failedCount = liveTargets.filter(ch => pub[ch]?.status === 'error').length
    const hasFailed = settled && failedCount > 0

    return (
      <div className="ew-view">
        <div className="ew-view-body">
        <div className="ew-head">
          <span className="ew-eyebrow">Step 2</span>
          <h2>Publish everywhere</h2>
          <p>One master event, fanning out to {liveTargets.length} channels. Each returns its own live link.</p>
        </div>

        <div className="ew-castgrid">
          <div className="ew-master">
            <span className="ew-eyebrow" style={{ color: 'var(--hightribe)' }}>Master event</span>
            {ev.coverUrl && (
              <img
                src={String(ev.coverUrl)}
                alt=""
                className="ew-cover-preview"
                style={{ marginBottom: 12, maxHeight: 140 }}
              />
            )}
            <div className="t">{String(ev.title)}</div>
            <div className="meta">
              <span>📅 {String(ev.date)} · {String(ev.time)}</span>
              <span>📍 {String(ev.venue)}</span>
              <span>👥 {String(ev.capacity)} cap</span>
              <span>🎟 {ev.ticketType === 'Free' ? 'Free' : `$${ev.price}`}</span>
            </div>
          </div>
          <div className="ew-lanes">
            {liveTargets.map(ch => {
              const st = pub[ch]?.status
              const url = pub[ch]?.url
              return (
                <div key={ch} className="ew-lane">
                  <span
                    className={`sig${st === 'publishing' ? ' pub' : ''}${st === 'synced' ? ' ew-sig-synced' : ''}`}
                    style={st === 'publishing' ? { background: CH_META[ch].color } : undefined}
                  />
                  <span className="nm"><Swatch color={CH_META[ch].color} />{CH_META[ch].name}</span>
                  {st === 'synced' && url ? (
                    <a
                      href={/^https?:\/\//i.test(url) ? url : `https://${url}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {url.replace(/^https?:\/\//i, '')} ↗
                    </a>
                  ) : st === 'error' ? (
                    <span className="mid" style={{ color: 'var(--error)' }}>{pub[ch]?.message}</span>
                  ) : (
                    <span className="mid">{CH_META[ch].cap}</span>
                  )}
                  {st === 'synced' && <span className="ew-pill ew-text-success">✓ Synced</span>}
                  {st === 'publishing' && <span className="ew-pill" style={{ color: CH_META[ch].color }}><span className="ew-spin" /> Publishing</span>}
                  {st === 'queued' && <span className="ew-pill" style={{ color: 'var(--muted)' }}>◌ Queued</span>}
                  {!st && <span className="ew-pill" style={{ color: 'var(--muted)' }}>Ready</span>}
                </div>
              )
            })}
          </div>
        </div>
        </div>

        <div className="ew-foot">
          <span className="note">
            {allDone ? 'All channels synced. Attendees now flow back into one dashboard.' :
              publishing ? 'Publishing — links appear as each channel confirms.' :
              hasFailed ? `${syncedCount} synced · ${failedCount} failed. Fix the issue and retry the failed channel${failedCount > 1 ? 's' : ''}.` :
              'Nothing published yet.'}
          </span>
          {publishError && <span className="note ew-foot-error">{publishError}</span>}
          <div className="ew-foot-actions">
            <button type="button" className="ew-btn ghost" onClick={() => setStep(0)}>← Back to form</button>
            {syncedCount > 0 && !allDone && !publishing && (
              <button type="button" className="ew-btn ghost" onClick={() => setStep(2)}>Skip to dashboard →</button>
            )}
            {allDone ? (
              <button type="button" className="ew-btn primary" onClick={() => setStep(2)}>Open dashboard →</button>
            ) : (
              <button type="button" className="ew-btn primary" disabled={publishing} onClick={startPublish}>
                {publishing
                  ? <InlineLoader label="Publishing" />
                  : hasFailed
                    ? `Retry ${failedCount} failed channel${failedCount > 1 ? 's' : ''}`
                    : `Publish to ${liveTargets.length} channels`}
              </button>
            )}
          </div>
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
        <div className="ew-view-body">
        <div className="ew-head">
          <span className="ew-eyebrow">Step 3 · Live</span>
          <h2>{String(ev.title)}</h2>
          <p>One attendee list, one revenue number — pulled back from every channel via webhooks.</p>
        </div>

        <div className="ew-stats">
          <div className="ew-stat"><div className="k">Attendees</div><div className="v">{sold}</div><div className="s">unified via webhooks</div></div>
          <div className="ew-stat"><div className="k">Revenue</div><div className="v">{ev.ticketType === 'Free' ? 'Free' : `$${revenue.toLocaleString()}`}</div><div className="s">{sold} registrations</div></div>
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
              <span className="ew-text-success" style={{ fontSize: 12 }}>✓ Registered</span>
            </div>
          ))}
        </div>
        </div>

        <div className="ew-foot">
          <div className="ew-foot-actions">
            {modal ? (
              <button type="button" className="ew-btn ghost" onClick={() => onDone?.()}>← Back to events</button>
            ) : (
              <Link href="/events" className="ew-btn ghost">← View all events</Link>
            )}
            <button type="button" className="ew-btn primary" onClick={() => { setStep(0); setPub({}) }}>Create another</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`ew-root${modal ? ' ew-in-modal' : ''}`}>
      <div className="ew-wrap">
        {modal && (
          <header className="ew-bar">
            <div className="ew-brand">
              <img
                src="https://res.cloudinary.com/dstnwi5iq/image/upload/v1782741555/image-removebg-preview_5_tpubho.png"
                alt="Ewentcast"
                className="ew-brand-logo"
              />
              <div>
                <div className="tag">
                  {isEdit
                    ? editTargetChannels.length > 1
                      ? `Edit event — updates ${editTargetChannels.map(ch => CH_META[ch].name).join(', ')}`
                      : 'Edit event on channel.'
                    : 'Create once. Publish everywhere.'}
                </div>
              </div>
            </div>
            <div className="ew-bar-tools">
              <div className="ew-stepper" role="navigation" aria-label="Wizard steps">
                {(isEdit ? WIZARD_STEPS.slice(0, 1) : WIZARD_STEPS).map((label, i) => (
                  <span key={label} style={{ display: 'contents' }}>
                    <button type="button" className={i === step ? 'active' : ''} onClick={() => !isEdit && setStep(i)} disabled={isEdit && i > 0}>
                      <span className="n">{i + 1}</span>
                      <span className="ew-stepper-label">{isEdit ? 'Edit' : label}</span>
                    </button>
                    {!isEdit && i < WIZARD_STEPS.length - 1 && <span style={{ color: 'var(--line)' }}>·</span>}
                  </span>
                ))}
              </div>
              <div className="ew-bar-conn">
                <span className="ew-bar-conn-dot" />
                <span className="ew-bar-conn-count">{connCount}/3</span>
                <span className="ew-bar-conn-avatar">{initials}</span>
              </div>
            </div>
          </header>
        )}

        {step === 0 && viewCreate()}
        {step === 1 && viewPublish()}
        {step === 2 && viewDashboard()}
      </div>

      {cropState && (
        <CoverCropper
          file={cropState.file}
          onCancel={() => setCropState(null)}
          onCropped={(cropped, previewUrl) => {
            setCoverFile(cropped)
            setField(cropState.fieldKey, previewUrl)
            setCropState(null)
          }}
        />
      )}
    </div>
  )
}
