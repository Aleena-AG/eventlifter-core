'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
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

const CH_LABELS: Record<ChannelKey, string> = {
  hightribe: 'Hightribe',
  luma: 'Luma',
  eventbrite: 'Eventbrite',
}

type EventStatusFilter = 'active' | 'expired' | 'draft' | 'cancelled'

const STATUS_FILTER_OPTIONS: { key: EventStatusFilter; label: string; defaultOn: boolean }[] = [
  { key: 'active', label: 'Active', defaultOn: true },
  { key: 'expired', label: 'Expired', defaultOn: false },
  { key: 'draft', label: 'Draft', defaultOn: false },
  { key: 'cancelled', label: 'Cancelled', defaultOn: false },
]

const DEFAULT_STATUS_FILTERS = new Set<EventStatusFilter>(
  STATUS_FILTER_OPTIONS.filter(o => o.defaultOn).map(o => o.key),
)

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

function parseMs(value?: string): number {
  if (!value) return 0
  const ms = new Date(value).getTime()
  return Number.isFinite(ms) ? ms : 0
}

function getLifecycleTags(startMs: number, endMs: number, status?: string): EventStatusFilter[] {
  const tags = new Set<EventStatusFilter>()
  const st = (status || '').toLowerCase()
  const now = Date.now()

  if (/cancel|canceled|cancelled/.test(st)) tags.add('cancelled')
  if (/draft/.test(st)) tags.add('draft')

  if (tags.size === 0) {
    const effectiveEnd = endMs > 0 ? endMs : startMs
    if (effectiveEnd > 0 && effectiveEnd < now) {
      tags.add('expired')
    } else if (/completed|ended|past|closed/.test(st)) {
      tags.add('expired')
    } else {
      tags.add('active')
    }
  }

  if (tags.size === 0) tags.add('active')
  return [...tags]
}

function matchesStatusFilters(tags: EventStatusFilter[], selected: Set<EventStatusFilter>): boolean {
  return tags.some(tag => selected.has(tag))
}

function filterUnifiedEvents(events: UnifiedEvent[], query: string): UnifiedEvent[] {
  if (!query.trim()) return events
  const q = query.trim().toLowerCase()
  return events.filter(evt => matchesEventSearch(
    q,
    evt.title,
    evt.location,
    evt.status,
    CH_LABELS[evt.channel],
  ))
}

function filterByStatus(events: UnifiedEvent[], selected: Set<EventStatusFilter>): UnifiedEvent[] {
  return events.filter(evt => matchesStatusFilters(evt.lifecycleTags, selected))
}

function isPrimarilyExpired(evt: UnifiedEvent): boolean {
  return evt.lifecycleTags.includes('expired') && !evt.lifecycleTags.includes('active')
}

type UnifiedEvent = {
  key: string
  channel: ChannelKey
  id: string | number
  title: string
  sortMs: number
  endMs: number
  dateStr: string
  image?: string
  location?: string
  url?: string
  status?: string
  lifecycleTags: EventStatusFilter[]
  syncSource: SyncSource
}

function htToUnified(evt: HtEvent): UnifiedEvent {
  const d = evt.dates as {
    starts_at?: string
    start_date?: string
    start_time?: string
    ends_at?: string
    end_date?: string
    end_time?: string
  } | undefined
  const startUtc = d?.starts_at || (d?.start_date ? `${d.start_date}T${d.start_time || '00:00'}` : '')
  const endUtc = d?.ends_at || (d?.end_date ? `${d.end_date}T${d.end_time || '23:59:00'}` : '')
  const dateStr = d?.starts_at ? fmtUtc(d.starts_at) : fmt(d?.start_date, d?.start_time)
  const loc = evt.location
    ? [evt.location.venue_name, evt.location.city, evt.location.country].filter(Boolean).join(', ')
    : undefined
  const sortMs = parseMs(startUtc)
  const endMs = parseMs(endUtc)
  const status = evt.publish_status || evt.status
  return {
    key: `hightribe-${evt.id}`,
    channel: 'hightribe',
    id: evt.id,
    title: evt.title,
    sortMs,
    endMs,
    dateStr,
    image: evt.cover_image || evt.cover_image_aspect_ratio?.[0]?.image || undefined,
    location: loc,
    url: evt.share_url || (evt.slug ? `https://Hightribe.com/events/${evt.slug}` : undefined),
    status,
    lifecycleTags: getLifecycleTags(sortMs, endMs, status),
    syncSource: 'hightribe',
  }
}

function lumaToUnified(evt: LumaEvent): UnifiedEvent {
  const sortMs = parseMs(evt.start_at)
  const endMs = parseMs(evt.end_at)
  return {
    key: `luma-${evt.api_id}`,
    channel: 'luma',
    id: evt.api_id,
    title: evt.name,
    sortMs,
    endMs,
    dateStr: fmtUtc(evt.start_at),
    image: evt.cover_url,
    location: evt.geo_address_json?.full_address || evt.geo_address_json?.city,
    url: evt.url,
    lifecycleTags: getLifecycleTags(sortMs, endMs),
    syncSource: 'luma',
  }
}

function ebToUnified(evt: EbEvent): UnifiedEvent {
  const sortMs = parseMs(evt.start?.utc)
  const endMs = parseMs(evt.end?.utc)
  const title = evt.name?.text || 'Untitled'
  const status = evt.status
  return {
    key: `eventbrite-${evt.id}`,
    channel: 'eventbrite',
    id: evt.id,
    title,
    sortMs,
    endMs,
    dateStr: fmtUtc(evt.start?.utc),
    image: evt.logo?.original?.url,
    url: evt.url,
    status,
    lifecycleTags: getLifecycleTags(sortMs, endMs, status),
    syncSource: 'eventbrite',
  }
}

function EmptyState({ searchQuery, filtersActive }: { searchQuery?: string; filtersActive?: boolean }) {
  return (
    <div className="events-empty">
      <div className="events-empty-icon" aria-hidden="true">📭</div>
      <h3>
        {searchQuery?.trim()
          ? 'No matching events'
          : filtersActive
            ? 'No events match these filters'
            : 'No events found'}
      </h3>
      <p>
        {searchQuery?.trim()
          ? `Nothing matches "${searchQuery.trim()}". Try a different title or location.`
          : filtersActive
            ? 'Try adding Expired, Draft, or Cancelled filters above.'
            : 'Create an event or sync from your connected channels in Settings.'}
      </p>
    </div>
  )
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

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EventsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilters, setStatusFilters] = useState<Set<EventStatusFilter>>(
    () => new Set(DEFAULT_STATUS_FILTERS),
  )
  const [page, setPage] = useState(1)
  const perPage = 12
  const [createOpen, setCreateOpen] = useState(false)
  const [editModal, setEditModal] = useState<{
    open: boolean; channel: ChannelKey; eventId: string | number
  }>({ open: false, channel: 'hightribe', eventId: '' })
  const { toasts, toast, removeToast } = useToast()
  const toastRef = useRef(toast)
  toastRef.current = toast

  // Sync modal
  const [syncEvent, setSyncEvent] = useState<{ id: string | number; title: string; source: SyncSource } | null>(null)
  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ channel: ChannelKey; id: string|number; title: string } | null>(null)
  const [deleteLinks, setDeleteLinks] = useState<DeleteLink[]>([])
  const [deleteAlso, setDeleteAlso] = useState<Partial<Record<ChannelKey, boolean>>>({})
  const [deleting, setDeleting] = useState(false)

  // Hightribe state
  const [htAllEvents, setHtAllEvents] = useState<HtEvent[]>([])
  const [htLoading, setHtLoading] = useState(false)
  const [htSyncing, setHtSyncing] = useState(false)

  // Luma state
  const [lumaEvents, setLumaEvents] = useState<LumaEvent[]>([])
  const [lumaLoading, setLumaLoading] = useState(false)
  const [lumaSyncing, setLumaSyncing] = useState(false)

  // Eventbrite state
  const [ebEvents, setEbEvents] = useState<EbEvent[]>([])
  const [ebLoading, setEbLoading] = useState(false)
  const [ebSyncing, setEbSyncing] = useState(false)

  const htAvailable = !isEwentcastSignupUser() || !!getEwentcastAccount()?.ht_connected

  const loadHtEventsFromDb = useCallback(async () => {
    if (!htAvailable) {
      setHtAllEvents([])
      return
    }
    setHtLoading(true)
    try {
      const rows = await listStoredEvents('hightribe')
      setHtAllEvents(rows.map(storedToHtEvent))
    } catch {
      toastRef.current.error('Failed to load Hightribe events from database')
    } finally {
      setHtLoading(false)
    }
  }, [htAvailable])

  const syncHtEvents = useCallback(async () => {
    if (!htAvailable) return
    setHtSyncing(true)
    try {
      const { events } = await syncChannelDataToDb('hightribe')
      toastRef.current.success(events > 0 ? `Synced ${events} events from Hightribe` : 'Hightribe sync complete')
      await loadHtEventsFromDb()
    } catch (err) {
      toastRef.current.error(err instanceof Error ? err.message : 'Hightribe sync failed')
    } finally {
      setHtSyncing(false)
    }
  }, [htAvailable, loadHtEventsFromDb])

  const loadLumaEventsFromDb = useCallback(async () => {
    setLumaLoading(true)
    try {
      const rows = await listStoredEvents('luma')
      setLumaEvents(rows.map(storedToLumaEvent))
    } catch {
      toastRef.current.error('Failed to load Luma events from database')
    } finally {
      setLumaLoading(false)
    }
  }, [])

  const syncLumaEvents = useCallback(async () => {
    setLumaSyncing(true)
    try {
      const { events, bookings } = await syncChannelDataToDb('luma')
      toastRef.current.success(`Synced ${events} events, ${bookings} bookings`)
      await loadLumaEventsFromDb()
    } catch (err) {
      toastRef.current.error(err instanceof Error ? err.message : 'Luma sync failed')
    } finally {
      setLumaSyncing(false)
    }
  }, [loadLumaEventsFromDb])

  const loadEbEventsFromDb = useCallback(async () => {
    setEbLoading(true)
    try {
      const rows = await listStoredEvents('eventbrite')
      setEbEvents(rows.map(storedToEbEvent))
    } catch {
      toastRef.current.error('Failed to load Eventbrite events from database')
    } finally {
      setEbLoading(false)
    }
  }, [])

  const syncEbEvents = useCallback(async () => {
    setEbSyncing(true)
    try {
      const { events, bookings } = await syncChannelDataToDb('eventbrite')
      toastRef.current.success(`Synced ${events} events, ${bookings} bookings`)
      await loadEbEventsFromDb()
    } catch (err) {
      toastRef.current.error(err instanceof Error ? err.message : 'Eventbrite sync failed')
    } finally {
      setEbSyncing(false)
    }
  }, [loadEbEventsFromDb])

  const loadAllEvents = useCallback(async () => {
    await Promise.all([
      loadHtEventsFromDb(),
      loadLumaEventsFromDb(),
      loadEbEventsFromDb(),
    ])
  }, [loadHtEventsFromDb, loadLumaEventsFromDb, loadEbEventsFromDb])

  const syncAllEvents = useCallback(async () => {
    const tasks: Promise<void>[] = [syncLumaEvents(), syncEbEvents()]
    if (htAvailable) tasks.unshift(syncHtEvents())
    await Promise.all(tasks)
  }, [htAvailable, syncHtEvents, syncLumaEvents, syncEbEvents])

  const mergedEvents = useMemo(() => {
    const items: UnifiedEvent[] = []
    if (htAvailable) items.push(...htAllEvents.map(htToUnified))
    items.push(...lumaEvents.map(lumaToUnified))
    items.push(...ebEvents.map(ebToUnified))
    return items
  }, [htAvailable, htAllEvents, lumaEvents, ebEvents])

  const allEvents = useMemo(() => {
    const searched = filterUnifiedEvents(mergedEvents, searchQuery)
    const filtered = filterByStatus(searched, statusFilters)
    return filtered.sort((a, b) => {
      const aExpired = isPrimarilyExpired(a)
      const bExpired = isPrimarilyExpired(b)
      if (aExpired !== bExpired) return aExpired ? 1 : -1
      if (!a.sortMs && !b.sortMs) return a.title.localeCompare(b.title)
      if (!a.sortMs) return 1
      if (!b.sortMs) return -1
      return a.sortMs - b.sortMs
    })
  }, [mergedEvents, searchQuery, statusFilters])

  const filtersDifferFromDefault = useMemo(() => {
    if (statusFilters.size !== DEFAULT_STATUS_FILTERS.size) return true
    for (const key of DEFAULT_STATUS_FILTERS) {
      if (!statusFilters.has(key)) return true
    }
    return false
  }, [statusFilters])

  function toggleStatusFilter(key: EventStatusFilter) {
    setStatusFilters(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size === 1) return prev
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const lastPage = Math.max(1, Math.ceil(allEvents.length / perPage))
  const safePage = Math.min(Math.max(1, page), lastPage)
  const pagedEvents = allEvents.slice((safePage - 1) * perPage, safePage * perPage)

  const totalCount = mergedEvents.length
  const loading = htLoading || lumaLoading || ebLoading
  const syncing = htSyncing || lumaSyncing || ebSyncing

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
        const match = htAllEvents.find(e => e.title.trim().toLowerCase() === norm)
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
  }, [deleteTarget, htAllEvents, lumaEvents, ebEvents])

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

    if (errors.length) toastRef.current.error(errors.join(' · '))
    else toastRef.current.success(targets.length > 1 ? `Deleted from ${targets.length} channels` : 'Event deleted successfully')

    setDeleting(false)
    setDeleteTarget(null)
  }

  useEffect(() => {
    void loadAllEvents()
    // Mount-only initial load — callbacks are stable; avoid re-fetch loops on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, statusFilters])

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  function openCreate() { setCreateOpen(true) }
  function closeCreate() {
    setCreateOpen(false)
    router.replace('/events', { scroll: false })
  }

  useEffect(() => {
    if (searchParams.get('create') === '1') setCreateOpen(true)
  }, [searchParams])

  function onPublished() {
    void loadAllEvents()
  }
  function openEdit(channel: ChannelKey, id: string|number) {
    setEditModal({ open: true, channel, eventId: id })
  }

  function onSaved(channel: ChannelKey) {
    const label = CH_LABELS[channel]
    toastRef.current.success(`Event updated on ${label}!`)
    setEditModal(f => ({ ...f, open: false }))
    void loadAllEvents()
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
          <p>All your events from Hightribe, Luma, and Eventbrite in one place.</p>
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

      <div className="events-filters" role="group" aria-label="Event status filters">
        <span className="events-filters-label">Status</span>
        <div className="events-filters-chips">
          {STATUS_FILTER_OPTIONS.map(({ key, label }) => {
            const on = statusFilters.has(key)
            return (
              <button
                key={key}
                type="button"
                data-filter={key}
                className={`events-filter-chip${on ? ' events-filter-chip--on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleStatusFilter(key)}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="events-search-row">
        <div className="events-search-wrap">
          <span className="events-search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            className="events-search"
            placeholder="Search events by title, location, channel, or status…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search events"
          />
        </div>
      </div>

      {isEwentcastSignupUser() && !getEwentcastAccount()?.ht_connected && (
        <div className="events-connect-banner" style={{ marginBottom: 12 }}>
          <h3>Connect Hightribe to include your hosted events</h3>
          <p>Luma and Eventbrite events still appear below.</p>
          <a href="/settings">Go to Settings → Connect Hightribe</a>
        </div>
      )}

      <div className="events-toolbar">
        <span className="events-toolbar-count">
          {searchQuery.trim() || filtersDifferFromDefault ? (
            <><strong>{allEvents.length}</strong> shown · <strong>{totalCount}</strong> total</>
          ) : (
            <><strong>{allEvents.length}</strong> active {allEvents.length === 1 ? 'event' : 'events'}</>
          )}
        </span>
        <div className="events-toolbar-actions">
          <button
            type="button"
            className="events-refresh-btn"
            onClick={() => void loadAllEvents()}
            disabled={loading || syncing}
          >
            {loading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
          </button>
          <button
            type="button"
            className="events-refresh-btn events-refresh-btn--sync"
            onClick={() => void syncAllEvents()}
            disabled={loading || syncing}
          >
            {syncing ? <InlineLoader label="Syncing" /> : '⇅ Sync all'}
          </button>
        </div>
      </div>

      {loading && totalCount === 0 ? (
        <PageLoader label="Loading events…" />
      ) : totalCount === 0 ? (
        <EmptyState />
      ) : allEvents.length === 0 ? (
        <EmptyState searchQuery={searchQuery} filtersActive={filtersDifferFromDefault || !!searchQuery.trim()} />
      ) : (
        <>
          <div className="events-list">
            {pagedEvents.map((evt) => (
              <EventCard
                key={evt.key}
                image={evt.image}
                title={evt.title}
                dateStr={evt.dateStr}
                channel={evt.channel}
                badgeColor={CHANNEL_META[evt.channel].color}
                location={evt.location}
                url={evt.url}
                status={evt.status}
                detailHref={`/events/${evt.channel}/${encodeURIComponent(String(evt.id))}`}
                onEdit={() => openEdit(evt.channel, evt.id)}
                onDelete={() => setDeleteTarget({ channel: evt.channel, id: evt.id, title: evt.title })}
                onSync={() => setSyncEvent({ id: evt.id, title: evt.title, source: evt.syncSource })}
              />
            ))}
          </div>
          {lastPage > 1 && (
            <div className="events-pagination">
              <button
                type="button"
                className="events-page-btn"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1 || loading}
              >
                ← Prev
              </button>
              <span className="events-page-info">
                Page {safePage} / {lastPage}
                {allEvents.length > 0 && <span style={{ marginLeft: '6px' }}>· {allEvents.length} events</span>}
              </span>
              <button
                type="button"
                className="events-page-btn"
                onClick={() => setPage(p => Math.min(lastPage, p + 1))}
                disabled={safePage >= lastPage || loading}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
