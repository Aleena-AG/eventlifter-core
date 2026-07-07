'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import { channelFetch } from '@/lib/channel-fetch'
import { getEwentcastAccount, isEwentcastSignupUser } from '@/lib/ewentcast-session'
import { listStoredEvents } from '@/lib/channel-events-store'
import { syncChannelDataToDb } from '@/lib/channel-data-sync'
import { storedToEbEvent, storedToHtEvent, storedToLumaEvent } from '@/lib/channel-db-mappers'
import type { HtEventListItem } from '@/lib/hightribe-events'
import { Toast, useToast } from '@/components/Toast'
import { InlineLoader, PageLoader } from '@/components/Loader'
import { SyncModal, SyncSource } from '@/components/SyncModal'
import { CreateEventWizardModal } from '@/components/ewentcast/CreateEventWizardModal'
import { ChannelLogo } from '@/components/ChannelLogo'
import { CHANNEL_META } from '@/lib/channels'
import type { ChannelKey } from '@/lib/types'
import './events.css'

type Tab = 'hightribe' | 'luma' | 'eventbrite'

const CH_LABELS: Record<ChannelKey, string> = {
  hightribe: 'Hightribe',
  luma: 'Luma',
  eventbrite: 'Eventbrite',
}

type DeleteLink = { channel: ChannelKey; eventId: string | number }

async function deleteOnChannel(channel: ChannelKey, id: string | number): Promise<void> {
  if (channel === 'hightribe') {
    const res = await channelFetch(`/api/hightribe/events/${id}`, { method: 'DELETE' })
    if (!res.ok) { const d = await res.json() as { message?: string }; throw new Error(d.message || `HTTP ${res.status}`) }
    return
  }
  if (channel === 'luma') {
    const res = await channelFetch('/api/luma/events/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: String(id), should_refund: true }),
    })
    const raw = await res.json() as { status?: string; message?: string; error?: string }
    if (!res.ok || raw.status === 'error') {
      throw new Error(raw.message || raw.error || `HTTP ${res.status}`)
    }
    return
  }
  const res = await channelFetch(`/api/eventbrite/events/${id}`, { method: 'DELETE' })
  if (!res.ok) { const d = await res.json() as { error_description?: string }; throw new Error(d.error_description || `HTTP ${res.status}`) }
}

// ─── Hightribe ───────────────────────────────────────────────────────────────
type HtEvent = HtEventListItem

// ─── Luma ────────────────────────────────────────────────────────────────────
interface LumaEvent {
  api_id: string; name: string; start_at: string; end_at: string; timezone: string
  url?: string; cover_url?: string
  geo_address_json?: { full_address?: string; city?: string }
  meeting_url?: string
}
interface LumaEntry {
  event?: LumaEvent
  id?: string
  name?: string
  start_at?: string
  end_at?: string
  timezone?: string
  url?: string
  cover_url?: string
  geo_address_json?: { full_address?: string; city?: string }
  meeting_url?: string
}

// ─── Eventbrite ──────────────────────────────────────────────────────────────
interface EbEvent {
  id: string; name?: { text?: string }
  start?: { utc?: string }; end?: { utc?: string }
  url?: string; logo?: { original?: { url?: string } }
  is_free?: boolean; status?: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(date?: string, time?: string): string {
  if (!date) return '—'
  try {
    const dt = time ? new Date(`${date}T${time}`) : new Date(date)
    return dt.toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })
  } catch { return date }
}
function fmtUtc(utc?: string): string {
  if (!utc) return '—'
  try {
    return new Date(utc).toLocaleString(undefined, { month:'short', day:'numeric', year:'numeric', hour:'2-digit', minute:'2-digit' })
  } catch { return utc }
}

function matchesEventSearch(query: string, ...fields: (string | undefined | null)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return fields.some(f => f && String(f).toLowerCase().includes(q))
}

function filterHtEvents(events: HtEvent[], query: string): HtEvent[] {
  if (!query.trim()) return events
  return events.filter(evt => {
    const loc = evt.location
      ? [evt.location.venue_name, evt.location.city, evt.location.country].filter(Boolean).join(' ')
      : ''
    return matchesEventSearch(
      query,
      evt.title,
      loc,
      evt.publish_status,
      evt.status,
      evt.slug,
    )
  })
}

function filterLumaEvents(events: LumaEvent[], query: string): LumaEvent[] {
  if (!query.trim()) return events
  return events.filter(evt => matchesEventSearch(
    query,
    evt.name,
    evt.geo_address_json?.full_address,
    evt.geo_address_json?.city,
  ))
}

function filterEbEvents(events: EbEvent[], query: string): EbEvent[] {
  if (!query.trim()) return events
  return events.filter(evt => matchesEventSearch(query, evt.name?.text, evt.status))
}

// ─── Delete confirm dialog ────────────────────────────────────────────────────
function DeleteDialog({
  title, sourceChannel, linked, alsoDelete, onToggle, onConfirm, onCancel,
}: {
  title: string
  sourceChannel: ChannelKey
  linked: DeleteLink[]
  alsoDelete: Partial<Record<ChannelKey, boolean>>
  onToggle: (ch: ChannelKey) => void
  onConfirm: () => void
  onCancel: () => void
}) {
  const others = linked.filter(l => l.channel !== sourceChannel)
  const alsoCount = others.filter(l => alsoDelete[l.channel]).length

  return (
    <div className="events-delete-overlay">
      <div className="events-delete-panel">
        <div className="events-delete-title">Delete event?</div>
        <div className="events-delete-text">
          Delete <b style={{ color:'var(--ink)' }}>{title}</b> from {CH_LABELS[sourceChannel]}?
          {others.length > 0 && ' You can also remove copies on other channels.'}
        </div>

        {others.length > 0 && (
          <div style={{ marginBottom:'20px', display:'flex', flexDirection:'column', gap:'8px' }}>
            <div style={{ fontSize:'11px', fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:'0.06em' }}>
              Also delete from
            </div>
            {others.map(({ channel }) => (
              <label key={channel} className="events-delete-check">
                <input
                  type="checkbox"
                  checked={!!alsoDelete[channel]}
                  onChange={() => onToggle(channel)}
                  style={{ width:16, height:16, accentColor:'#c2502e' }}
                />
                <span style={{ fontSize:'13px', color:'var(--ink)' }}>{CH_LABELS[channel]}</span>
              </label>
            ))}
          </div>
        )}

        <div className="events-delete-actions">
          <button type="button" className="events-delete-cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="events-delete-confirm" onClick={onConfirm}>
            {alsoCount > 0 ? `Delete from ${1 + alsoCount} channels` : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EventCard ────────────────────────────────────────────────────────────────
function EventCard({
  image, title, dateStr, channel, badgeColor, location, url, status,
  detailHref, onEdit, onDelete, onSync,
}: {
  image?: string; title: string; dateStr: string; channel: ChannelKey; badgeColor: string
  location?: string; url?: string; status?: string; detailHref?: string
  onEdit?: () => void; onDelete?: () => void; onSync?: () => void
}) {
  const channelName = CHANNEL_META[channel].name
  const isLive = status === 'published' || status === 'live'

  const cardBody = (
    <>
      <div className="event-card__media">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" />
        ) : (
          <span className="event-card__media-placeholder" aria-hidden="true">📅</span>
        )}
      </div>

      <div className="event-card__body">
        <h3 className="event-card__title">{title}</h3>
        <div className="event-card__meta">
          <span className="event-card__meta-item">📅 {dateStr}</span>
          {location && <span className="event-card__meta-item">📍 {location}</span>}
        </div>
        <div className="event-card__badges">
          <span className="event-card__channel-badge">
            <ChannelLogo channel={channel} size={16} />
            {channelName}
          </span>
          {status && (
            <span className={`event-card__status-badge ${isLive ? 'event-card__status-badge--live' : 'event-card__status-badge--muted'}`}>
              {status}
            </span>
          )}
        </div>
      </div>
    </>
  )

  return (
    <article className="event-card" style={{ '--card-accent': badgeColor } as React.CSSProperties}>
      <div className="event-card__accent" aria-hidden="true" />

      {detailHref ? (
        <Link href={detailHref} className="event-card__inner event-card__inner--clickable">
          {cardBody}
        </Link>
      ) : (
        <div className="event-card__inner">{cardBody}</div>
      )}

      <div className="event-card__actions">
        <div className="event-card__action-row">
          {onEdit && (
            <button type="button" className="event-card__btn event-card__btn--edit" onClick={onEdit}>
              ✎ Edit
            </button>
          )}
          {onDelete && (
            <button type="button" className="event-card__btn event-card__btn--delete" onClick={onDelete}>
              Delete
            </button>
          )}
        </div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="event-card__btn event-card__btn--view">
            View ↗
          </a>
        )}
        {onSync && (
          <button
            type="button"
            className="event-card__btn event-card__btn--sync"
            title="Publish to other channels"
            onClick={onSync}
          >
            ↗ Publish to…
          </button>
        )}
      </div>
    </article>
  )
}

function EmptyState({ channel, searchQuery }: { channel: string; searchQuery?: string }) {
  return (
    <div className="events-empty">
      <div className="events-empty-icon" aria-hidden="true">📭</div>
      <h3>{searchQuery?.trim() ? 'No matching events' : `No ${channel} events found`}</h3>
      <p>
        {searchQuery?.trim()
          ? `Nothing matches "${searchQuery.trim()}". Try a different title or location.`
          : `Make sure your ${channel} credentials are configured in Settings.`}
      </p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EventsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('hightribe')
  const [searchQuery, setSearchQuery] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editModal, setEditModal] = useState<{
    open: boolean; channel: ChannelKey; eventId: string | number
  }>({ open: false, channel: 'hightribe', eventId: '' })
  const { toasts, toast, removeToast } = useToast()

  // Sync modal
  const [syncEvent, setSyncEvent] = useState<{ id: string | number; title: string; source: SyncSource } | null>(null)
  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ channel: ChannelKey; id: string|number; title: string } | null>(null)
  const [deleteLinks, setDeleteLinks] = useState<DeleteLink[]>([])
  const [deleteAlso, setDeleteAlso] = useState<Partial<Record<ChannelKey, boolean>>>({})
  const [deleting, setDeleting] = useState(false)

  // Hightribe state
  const [htEvents, setHtEvents] = useState<HtEvent[]>([])
  const [htAllEvents, setHtAllEvents] = useState<HtEvent[]>([])
  const [htLoading, setHtLoading] = useState(false)
  const [htSyncing, setHtSyncing] = useState(false)
  const [htPage, setHtPage] = useState(1)
  const [htLastPage, setHtLastPage] = useState(1)
  const [htTotal, setHtTotal] = useState<number | null>(null)

  // Luma state
  const [lumaEvents, setLumaEvents] = useState<LumaEvent[]>([])
  const [lumaLoading, setLumaLoading] = useState(false)
  const [lumaSyncing, setLumaSyncing] = useState(false)

  // Eventbrite state
  const [ebEvents, setEbEvents] = useState<EbEvent[]>([])
  const [ebLoading, setEbLoading] = useState(false)
  const [ebSyncing, setEbSyncing] = useState(false)

  // ── Fetchers ──────────────────────────────────────────────────────────────
  const applyHtPage = useCallback((all: HtEvent[], page: number) => {
    const perPage = 12
    const lastPage = Math.max(1, Math.ceil(all.length / perPage))
    const safePage = Math.min(Math.max(1, page), lastPage)
    setHtAllEvents(all)
    setHtEvents(all.slice((safePage - 1) * perPage, safePage * perPage))
    setHtPage(safePage)
    setHtLastPage(lastPage)
    setHtTotal(all.length)
  }, [])

  const loadHtEventsFromDb = useCallback(async (page = 1) => {
    setHtLoading(true)
    try {
      const rows = await listStoredEvents('hightribe')
      const events = rows.map(storedToHtEvent)
      applyHtPage(events, page)
    } catch {
      toast.error('Failed to load Hightribe events from database')
    } finally {
      setHtLoading(false)
    }
  }, [applyHtPage, toast])

  const syncHtEvents = useCallback(async (page = 1) => {
    setHtSyncing(true)
    try {
      const { events } = await syncChannelDataToDb('hightribe')
      toast.success(events > 0 ? `Synced ${events} events from Hightribe` : 'Hightribe sync complete')
      await loadHtEventsFromDb(page)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Hightribe sync failed')
    } finally {
      setHtSyncing(false)
    }
  }, [loadHtEventsFromDb, toast])

  const loadHtEvents = useCallback(async (page = 1) => {
    await loadHtEventsFromDb(page)
  }, [loadHtEventsFromDb])

  const loadLumaEventsFromDb = useCallback(async () => {
    setLumaLoading(true)
    try {
      const rows = await listStoredEvents('luma')
      setLumaEvents(rows.map(storedToLumaEvent))
    } catch {
      toast.error('Failed to load Luma events from database')
    } finally {
      setLumaLoading(false)
    }
  }, [toast])

  const syncLumaEvents = useCallback(async () => {
    setLumaSyncing(true)
    try {
      const { events, bookings } = await syncChannelDataToDb('luma')
      toast.success(`Synced ${events} events, ${bookings} bookings`)
      await loadLumaEventsFromDb()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Luma sync failed')
    } finally {
      setLumaSyncing(false)
    }
  }, [loadLumaEventsFromDb, toast])

  const loadLumaEvents = useCallback(async () => {
    await loadLumaEventsFromDb()
  }, [loadLumaEventsFromDb])

  const loadEbEventsFromDb = useCallback(async () => {
    setEbLoading(true)
    try {
      const rows = await listStoredEvents('eventbrite')
      setEbEvents(rows.map(storedToEbEvent))
    } catch {
      toast.error('Failed to load Eventbrite events from database')
    } finally {
      setEbLoading(false)
    }
  }, [toast])

  const syncEbEvents = useCallback(async () => {
    setEbSyncing(true)
    try {
      const { events, bookings } = await syncChannelDataToDb('eventbrite')
      toast.success(`Synced ${events} events, ${bookings} bookings`)
      await loadEbEventsFromDb()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Eventbrite sync failed')
    } finally {
      setEbSyncing(false)
    }
  }, [loadEbEventsFromDb, toast])

  const loadEbEvents = useCallback(async () => {
    await loadEbEventsFromDb()
  }, [loadEbEventsFromDb])

  const htFiltered = useMemo(() => filterHtEvents(htAllEvents, searchQuery), [htAllEvents, searchQuery])
  const lumaFiltered = useMemo(() => filterLumaEvents(lumaEvents, searchQuery), [lumaEvents, searchQuery])
  const ebFiltered = useMemo(() => filterEbEvents(ebEvents, searchQuery), [ebEvents, searchQuery])

  useEffect(() => {
    setSearchQuery('')
    setHtPage(1)
  }, [tab])

  useEffect(() => {
    const perPage = 12
    const lastPage = Math.max(1, Math.ceil(htFiltered.length / perPage))
    const safePage = Math.min(Math.max(1, htPage), lastPage)
    setHtEvents(htFiltered.slice((safePage - 1) * perPage, safePage * perPage))
    setHtLastPage(lastPage)
    if (safePage !== htPage) setHtPage(safePage)
  }, [htFiltered, htPage])

  useEffect(() => {
    setHtPage(1)
  }, [searchQuery])

  // Load linked copies when delete dialog opens
  useEffect(() => {
    if (!deleteTarget) {
      setDeleteLinks([])
      setDeleteAlso({})
      return
    }
    let cancelled = false
    ;(async () => {
      const links: DeleteLink[] = [{ channel: deleteTarget.channel, eventId: deleteTarget.id }]
      const also: Partial<Record<ChannelKey, boolean>> = {}

      try {
        const res = await fetch(
          `/api/registry?channel=${deleteTarget.channel}&eventId=${encodeURIComponent(String(deleteTarget.id))}`,
        )
        if (res.ok) {
          const data = await res.json() as { links?: Partial<Record<ChannelKey, { eventId: string }>> }
          for (const ch of ['hightribe', 'luma', 'eventbrite'] as ChannelKey[]) {
            if (ch === deleteTarget.channel) continue
            const ref = data.links?.[ch]
            if (ref?.eventId) {
              links.push({ channel: ch, eventId: ref.eventId })
              also[ch] = true
            }
          }
        }
      } catch { /* ignore */ }

      const norm = deleteTarget.title.trim().toLowerCase()
      const has = (ch: ChannelKey) => links.some(l => l.channel === ch)

      if (deleteTarget.channel !== 'hightribe' && !has('hightribe')) {
        const match = htEvents.find(e => e.title.trim().toLowerCase() === norm)
        if (match) { links.push({ channel: 'hightribe', eventId: match.id }); also.hightribe = true }
      }
      if (deleteTarget.channel !== 'luma' && !has('luma')) {
        const match = lumaEvents.find(e => e.name.trim().toLowerCase() === norm)
        if (match) { links.push({ channel: 'luma', eventId: match.api_id }); also.luma = true }
      }
      if (deleteTarget.channel !== 'eventbrite' && !has('eventbrite')) {
        const match = ebEvents.find(e => (e.name?.text || '').trim().toLowerCase() === norm)
        if (match) { links.push({ channel: 'eventbrite', eventId: match.id }); also.eventbrite = true }
      }

      if (!cancelled) {
        setDeleteLinks(links)
        setDeleteAlso(also)
      }
    })()
    return () => { cancelled = true }
  }, [deleteTarget, htEvents, lumaEvents, ebEvents])

  // ── Delete handler ────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const { channel, id } = deleteTarget

    const targets: DeleteLink[] = [{ channel, eventId: id }]
    for (const link of deleteLinks) {
      if (link.channel !== channel && deleteAlso[link.channel]) {
        targets.push(link)
      }
    }

    const errors: string[] = []
    for (const t of targets) {
      try {
        await deleteOnChannel(t.channel, t.eventId)
        if (t.channel === 'hightribe') {
          setHtEvents(ev => ev.filter(e => String(e.id) !== String(t.eventId)))
          setHtAllEvents(ev => ev.filter(e => String(e.id) !== String(t.eventId)))
        }
        else if (t.channel === 'luma') setLumaEvents(ev => ev.filter(e => e.api_id !== String(t.eventId)))
        else setEbEvents(ev => ev.filter(e => e.id !== String(t.eventId)))
      } catch (err) {
        errors.push(`${CH_LABELS[t.channel]}: ${err instanceof Error ? err.message : 'failed'}`)
      }
    }

    try {
      const res = await fetch(
        `/api/registry?channel=${channel}&eventId=${encodeURIComponent(String(id))}`,
      )
      if (res.ok) {
        const data = await res.json() as { master?: { id: string } }
        if (data.master?.id) {
          await fetch('/api/registry', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', masterId: data.master.id }),
          })
        }
      }
    } catch { /* non-fatal */ }

    if (errors.length) toast.error(errors.join(' · '))
    else toast.success(targets.length > 1 ? `Deleted from ${targets.length} channels` : 'Event deleted successfully')

    setDeleting(false)
    setDeleteTarget(null)
  }

  useEffect(() => {
    const htAvailable = !isEwentcastSignupUser() || !!getEwentcastAccount()?.ht_connected
    if (tab === 'hightribe' && htAvailable && htEvents.length === 0 && !htLoading) loadHtEvents(1)
    if (tab === 'luma' && lumaEvents.length === 0 && !lumaLoading) loadLumaEvents()
    if (tab === 'eventbrite' && ebEvents.length === 0 && !ebLoading) loadEbEvents()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const TABS: { key: Tab; name: string; color: string }[] = [
    { key: 'hightribe', name: CHANNEL_META.hightribe.name, color: CHANNEL_META.hightribe.color },
    { key: 'luma', name: CHANNEL_META.luma.name, color: CHANNEL_META.luma.color },
    { key: 'eventbrite', name: CHANNEL_META.eventbrite.name, color: CHANNEL_META.eventbrite.color },
  ]

  function openCreate() { setCreateOpen(true) }
  function closeCreate() {
    setCreateOpen(false)
    router.replace('/events', { scroll: false })
  }

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true)
  }, [searchParams])

  function onPublished() {
    void loadHtEvents(1)
    void loadLumaEvents()
    void loadEbEvents()
  }
  function openEdit(channel: ChannelKey, id: string|number) {
    setEditModal({ open: true, channel, eventId: id })
  }

  function onSaved(channel: ChannelKey) {
    const label = CH_LABELS[channel]
    toast.success(`Event updated on ${label}!`)
    setEditModal(f => ({ ...f, open: false }))
    if (channel === 'hightribe') { setHtEvents([]); loadHtEvents(1) }
    else if (channel === 'luma') { setLumaEvents([]); loadLumaEvents() }
    else { setEbEvents([]); loadEbEvents() }
  }

  return (
    <div className="events-page">
      <Toast toasts={toasts} onRemove={removeToast} />

      <SyncModal open={!!syncEvent} event={syncEvent} onClose={() => setSyncEvent(null)} />

      <CreateEventWizardModal
        open={createOpen}
        onClose={closeCreate}
        onPublished={onPublished}
      />

      <CreateEventWizardModal
        open={editModal.open}
        mode="edit"
        editChannel={editModal.channel}
        editEventId={editModal.eventId}
        onClose={() => setEditModal(f => ({ ...f, open: false }))}
        onPublished={() => onSaved(editModal.channel)}
      />

      {deleteTarget && !deleting && (
        <DeleteDialog
          title={deleteTarget.title}
          sourceChannel={deleteTarget.channel}
          linked={deleteLinks}
          alsoDelete={deleteAlso}
          onToggle={(ch) => setDeleteAlso(prev => ({ ...prev, [ch]: !prev[ch] }))}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {deleting && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, color:'#211B16', fontSize:'15px' }}>
          Deleting…
        </div>
      )}

      {/* Header */}
      <div className="events-header">
        <div>
          <h1>Events</h1>
          <p>Manage events across Hightribe, Luma, and Eventbrite.</p>
        </div>
        <button type="button" className="events-create-btn" onClick={openCreate}>
          <span className="events-create-btn__icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </span>
          Create Event
        </button>
      </div>

      {/* Tabs */}
      <div className="events-tabs" role="tablist" aria-label="Event platforms">
        {TABS.map(({ key, name, color }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            className={`events-tab${tab === key ? ' active' : ''}`}
            style={tab === key ? { color } : undefined}
            onClick={() => setTab(key)}
          >
            <span className="events-tab-dot" style={{ background: tab === key ? color : 'var(--line)' }} />
            <ChannelLogo channel={key} size={18} />
            <span className="events-tab-label">{name}</span>
          </button>
        ))}
      </div>

      <div className="events-search-row">
        <div className="events-search-wrap">
          <span className="events-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            className="events-search"
            placeholder="Search events by title, location, or status…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search events"
          />
        </div>
      </div>

      {/* ── Hightribe tab ───────────────────────────────────────────────────── */}
      {tab === 'hightribe' && (
        <div>
          {isEwentcastSignupUser() && !getEwentcastAccount()?.ht_connected ? (
            <div className="events-connect-banner">
              <h3>Connect Hightribe to load your events</h3>
              <p>Luma and Eventbrite work without this step.</p>
              <a href="/settings">Go to Settings → Connect Hightribe</a>
            </div>
          ) : (
          <>
          <div className="events-toolbar">
            <span className="events-toolbar-count">
              {searchQuery.trim() ? (
                <><strong>{htFiltered.length}</strong> of <strong>{htAllEvents.length}</strong> events</>
              ) : htTotal !== null ? (
                <><strong>{htTotal}</strong> events hosted by you</>
              ) : (
                'Your hosted events'
              )}
            </span>
            <div className="events-toolbar-actions">
              <button
                type="button"
                className="events-refresh-btn"
                onClick={() => loadHtEvents(htPage)}
                disabled={htLoading || htSyncing}
              >
                {htLoading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
              </button>
              <button
                type="button"
                className="events-refresh-btn events-refresh-btn--sync"
                onClick={() => syncHtEvents(htPage)}
                disabled={htLoading || htSyncing}
              >
                {htSyncing ? <InlineLoader label="Syncing" /> : '⇅ Sync'}
              </button>
            </div>
          </div>
          {htLoading ? (
            <PageLoader label="Loading Hightribe events…" />
          ) : htAllEvents.length === 0 ? (
            <EmptyState channel="Hightribe" />
          ) : htFiltered.length === 0 ? (
            <EmptyState channel="Hightribe" searchQuery={searchQuery} />
          ) : (
            <>
              <div className="events-list">
                {htEvents.map((evt) => {
                  const d = evt.dates
                  const dateStr = d?.starts_at ? fmtUtc(d.starts_at) : fmt(d?.start_date, d?.start_time)
                  const loc = evt.location ? [evt.location.venue_name, evt.location.city, evt.location.country].filter(Boolean).join(', ') : undefined
                  const image = evt.cover_image || evt.cover_image_aspect_ratio?.[0]?.image || undefined
                  const url = evt.share_url || (evt.slug ? `https://Hightribe.com/events/${evt.slug}` : undefined)
                  const displayStatus = evt.publish_status || evt.status
                  return (
                    <EventCard
                      key={String(evt.id)}
                      image={image} title={evt.title} dateStr={dateStr}
                      channel="hightribe" badgeColor={CHANNEL_META.hightribe.color}
                      location={loc} url={url} status={displayStatus}
                      detailHref={`/events/hightribe/${encodeURIComponent(String(evt.id))}`}
                      onEdit={() => openEdit('hightribe', evt.id)}
                      onDelete={() => setDeleteTarget({ channel:'hightribe', id:evt.id, title:evt.title })}
                      onSync={() => setSyncEvent({ id:evt.id, title:evt.title, source:'hightribe' })}
                    />
                  )
                })}
              </div>
              {htLastPage > 1 && (
                <div className="events-pagination">
                  <button type="button" className="events-page-btn" onClick={() => setHtPage(p => Math.max(1, p - 1))} disabled={htPage <= 1 || htLoading}>← Prev</button>
                  <span className="events-page-info">
                    Page {htPage} / {htLastPage}
                    {htFiltered.length > 0 && <span style={{ marginLeft:'6px' }}>· {htFiltered.length} events</span>}
                  </span>
                  <button type="button" className="events-page-btn" onClick={() => setHtPage(p => Math.min(htLastPage, p + 1))} disabled={htPage >= htLastPage || htLoading}>Next →</button>
                </div>
              )}
            </>
          )}
          </>
          )}
        </div>
      )}

      {/* ── Luma tab ──────────────────────────────────────────────────────── */}
      {tab === 'luma' && (
        <div>
          <div className="events-toolbar">
            <span className="events-toolbar-count">
              {searchQuery.trim() ? (
                <><strong>{lumaFiltered.length}</strong> of <strong>{lumaEvents.length}</strong> events</>
              ) : (
                <><strong>{lumaEvents.length}</strong> {lumaEvents.length === 1 ? 'event' : 'events'}</>
              )}
            </span>
            <div className="events-toolbar-actions">
              <button
                type="button"
                className="events-refresh-btn"
                onClick={loadLumaEvents}
                disabled={lumaLoading || lumaSyncing}
              >
                {lumaLoading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
              </button>
              <button
                type="button"
                className="events-refresh-btn events-refresh-btn--sync"
                onClick={syncLumaEvents}
                disabled={lumaLoading || lumaSyncing}
              >
                {lumaSyncing ? <InlineLoader label="Syncing" /> : '⇅ Sync'}
              </button>
            </div>
          </div>
          {lumaLoading ? (
            <PageLoader label="Loading Luma events…" />
          ) : lumaEvents.length === 0 ? (
            <EmptyState channel="Luma" />
          ) : lumaFiltered.length === 0 ? (
            <EmptyState channel="Luma" searchQuery={searchQuery} />
          ) : (
            <div className="events-list">
              {lumaFiltered.map((evt) => (
                <EventCard
                  key={evt.api_id}
                  image={evt.cover_url} title={evt.name} dateStr={fmtUtc(evt.start_at)}
                  channel="luma" badgeColor={CHANNEL_META.luma.color}
                  location={evt.geo_address_json?.full_address || evt.geo_address_json?.city}
                  url={evt.url}
                  detailHref={`/events/luma/${encodeURIComponent(evt.api_id)}`}
                  onEdit={() => openEdit('luma', evt.api_id)}
                  onDelete={() => setDeleteTarget({ channel:'luma', id:evt.api_id, title:evt.name })}
                  onSync={() => setSyncEvent({ id:evt.api_id, title:evt.name, source:'luma' })}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Eventbrite tab ────────────────────────────────────────────────── */}
      {tab === 'eventbrite' && (
        <div>
          <div className="events-toolbar">
            <span className="events-toolbar-count">
              {searchQuery.trim() ? (
                <><strong>{ebFiltered.length}</strong> of <strong>{ebEvents.length}</strong> events</>
              ) : (
                <><strong>{ebEvents.length}</strong> {ebEvents.length === 1 ? 'event' : 'events'}</>
              )}
            </span>
            <div className="events-toolbar-actions">
              <button
                type="button"
                className="events-refresh-btn"
                onClick={loadEbEvents}
                disabled={ebLoading || ebSyncing}
              >
                {ebLoading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
              </button>
              <button
                type="button"
                className="events-refresh-btn events-refresh-btn--sync"
                onClick={syncEbEvents}
                disabled={ebLoading || ebSyncing}
              >
                {ebSyncing ? <InlineLoader label="Syncing" /> : '⇅ Sync'}
              </button>
            </div>
          </div>
          {ebLoading ? (
            <PageLoader label="Loading Eventbrite events…" />
          ) : ebEvents.length === 0 ? (
            <EmptyState channel="Eventbrite" />
          ) : ebFiltered.length === 0 ? (
            <EmptyState channel="Eventbrite" searchQuery={searchQuery} />
          ) : (
            <div className="events-list">
              {ebFiltered.map((evt) => {
                const title = evt.name?.text || 'Untitled'
                return (
                  <EventCard
                    key={evt.id}
                    image={evt.logo?.original?.url}
                    title={title}
                    dateStr={fmtUtc(evt.start?.utc)}
                    channel="eventbrite" badgeColor={CHANNEL_META.eventbrite.color}
                    url={evt.url} status={evt.status}
                    detailHref={`/events/eventbrite/${encodeURIComponent(evt.id)}`}
                    onEdit={() => openEdit('eventbrite', evt.id)}
                    onDelete={() => setDeleteTarget({ channel:'eventbrite', id:evt.id, title })}
                    onSync={() => setSyncEvent({ id:evt.id, title, source:'eventbrite' })}
                  />
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
