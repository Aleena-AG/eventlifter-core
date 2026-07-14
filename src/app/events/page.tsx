'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { channelFetch } from '@/lib/channel-fetch'
import { getEwentcastAccount, isEwentcastSignupUser } from '@/lib/ewentcast-session'
import { fetchChannelConnectionMap } from '@/lib/channel-connection'
import { deleteStoredEvent, listStoredEvents } from '@/lib/channel-events-store'
import { syncChannelDataToDb, formatEventSyncMessage, consumeEventsListRefresh } from '@/lib/channel-data-sync'
import { storedToEbEvent, storedToHtEvent, storedToLumaEvent } from '@/lib/channel-db-mappers'
import type { HtEventListItem } from '@/lib/hightribe-events'
import { Toast, useToast } from '@/components/Toast'
import { InlineLoader, PageLoader } from '@/components/Loader'
import { SyncModal, SyncSource } from '@/components/SyncModal'
import { CreateEventWizardModal } from '@/components/ewentcast/CreateEventWizardModal'
import { ChannelLogo } from '@/components/ChannelLogo'
import { CHANNEL_META } from '@/lib/channels'
import { encodeEventRef } from '@/lib/event-ref'
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

const PER_PAGE_OPTIONS = [12, 24, 48, 100] as const
const PER_PAGE_STORAGE_KEY = 'events_per_page'

function readStoredPerPage(): number {
  if (typeof window === 'undefined') return 12
  try {
    const n = Number(localStorage.getItem(PER_PAGE_STORAGE_KEY))
    return (PER_PAGE_OPTIONS as readonly number[]).includes(n) ? n : 12
  } catch {
    return 12
  }
}

type DeleteLink = { channel: ChannelKey; eventId: string | number }

/** True when remote already gone / never existed — still OK to clear our store. */
function isRemoteAlreadyGone(status: number, message?: string): boolean {
  if (status === 404 || status === 410) return true
  return /not found|does not exist|already (deleted|cancelled|canceled)|no such/i.test(message || '')
}

/**
 * Delete on the live channel API. 404/already-gone is treated as success
 * so stale IDs (synced copies that no longer exist on HT) don't block cleanup.
 */
async function deleteOnChannel(channel: ChannelKey, id: string | number): Promise<void> {
  if (channel === 'hightribe') {
    const res = await channelFetch(`/api/hightribe/events/${id}`, { method: 'DELETE' })
    if (res.ok || res.status === 404 || res.status === 410) return
    const d = await res.json().catch(() => ({})) as { message?: string; error?: string }
    const msg = d.message || d.error || `HTTP ${res.status}`
    if (isRemoteAlreadyGone(res.status, msg)) return
    throw new Error(msg)
  }
  if (channel === 'luma') {
    const res = await channelFetch('/api/luma/events/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: String(id), should_refund: true }),
    })
    const raw = await res.json().catch(() => ({})) as { status?: string; message?: string; error?: string }
    if (res.ok && raw.status !== 'error') return
    if (res.status === 404 || res.status === 410) return
    const msg = raw.message || raw.error || `HTTP ${res.status}`
    if (isRemoteAlreadyGone(res.status, msg)) return
    throw new Error(msg)
  }
  const res = await channelFetch(`/api/eventbrite/events/${id}`, { method: 'DELETE' })
  if (res.ok || res.status === 404 || res.status === 410) return
  const d = await res.json().catch(() => ({})) as { error_description?: string; error?: string }
  const msg = d.error_description || d.error || `HTTP ${res.status}`
  if (isRemoteAlreadyGone(res.status, msg)) return
  throw new Error(msg)
}

/** Always remove from our DB/local store. Remote 404 is OK (already gone). */
async function deleteEventEverywhere(channel: ChannelKey, id: string | number): Promise<void> {
  let remoteError: string | null = null
  try {
    await deleteOnChannel(channel, id)
  } catch (err) {
    remoteError = err instanceof Error ? err.message : 'channel delete failed'
  }

  const removed = await deleteStoredEvent(channel, id)
  // Prefer clearing our store so the Events list stays accurate even if HT is stale.
  if (!removed && remoteError) {
    throw new Error(remoteError)
  }
  if (remoteError) {
    // Store cleared; soft-warn via console only — don't block bulk deletes on HT 404s.
    console.warn(`[delete] ${channel} ${id}: remote ${remoteError} (cleared from store)`)
  }
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

function filterUnifiedEvents<T extends UnifiedEvent & { channels?: ChannelKey[] }>(
  events: T[],
  query: string,
): T[] {
  if (!query.trim()) return events
  const q = query.trim().toLowerCase()
  return events.filter(evt => matchesEventSearch(
    q,
    evt.title,
    evt.location,
    evt.status,
    ...(evt.channels || [evt.channel]).map(ch => CH_LABELS[ch]),
  ))
}

function filterByStatus<T extends UnifiedEvent>(events: T[], selected: Set<EventStatusFilter>): T[] {
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

type GroupedEvent = UnifiedEvent & {
  channels: ChannelKey[]
  channelIds: Partial<Record<ChannelKey, string | number>>
  channelStatuses: Partial<Record<ChannelKey, string | undefined>>
}

type RegistryMaster = {
  id: string
  title: string
  channels: Partial<Record<ChannelKey, { eventId: string; url?: string }>>
}

const CHANNEL_ORDER: ChannelKey[] = ['hightribe', 'luma', 'eventbrite']

function formatChannelStatus(raw?: string): string {
  const s = (raw || '').trim()
  if (!s) return ''
  const lower = s.toLowerCase()
  if (lower === 'published' || lower === 'live') return 'Published'
  if (lower === 'draft' || lower === 'unpublished') return 'Draft'
  if (lower === 'canceled' || lower === 'cancelled') return 'Cancelled'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function dayKey(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`
}

function titleDateKey(evt: UnifiedEvent): string {
  const title = evt.title.trim().toLowerCase().replace(/\s+/g, ' ')
  const day = dayKey(evt.sortMs)
  return day ? `${title}::${day}` : title
}

function mergeMembers(
  members: UnifiedEvent[],
  registryChannels?: Partial<Record<ChannelKey, { eventId: string; url?: string }>>,
): GroupedEvent {
  const sorted = [...members].sort((a, b) => {
    // Prefer the channel with more complete data / earlier start
    if (!a.sortMs && !b.sortMs) return CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel)
    if (!a.sortMs) return 1
    if (!b.sortMs) return -1
    if (a.sortMs !== b.sortMs) return a.sortMs - b.sortMs
    return CHANNEL_ORDER.indexOf(a.channel) - CHANNEL_ORDER.indexOf(b.channel)
  })
  const primary = sorted[0]
  const channelIds: Partial<Record<ChannelKey, string | number>> = {}
  const channelStatuses: Partial<Record<ChannelKey, string | undefined>> = {}
  for (const m of members) {
    channelIds[m.channel] = m.id
    channelStatuses[m.channel] = m.status
  }

  // Include every channel this event was published to per the registry, even
  // when that channel's copy isn't in our local store yet — so the card shows
  // all platform badges (e.g. Hightribe + Luma) instead of just the one synced.
  let registryUrl: string | undefined
  if (registryChannels) {
    for (const ch of CHANNEL_ORDER) {
      const ref = registryChannels[ch]
      if (!ref?.eventId) continue
      if (channelIds[ch] == null) channelIds[ch] = ref.eventId
      if (!registryUrl && ref.url) registryUrl = ref.url
    }
  }

  const channelSet = new Set<ChannelKey>([
    ...members.map(m => m.channel),
    ...(Object.keys(channelIds) as ChannelKey[]),
  ])
  const channels = CHANNEL_ORDER.filter(ch => channelSet.has(ch))
  const bestImage = members.find(m => m.image)?.image
  const bestLocation = members.find(m => m.location)?.location
  const bestUrl = members.find(m => m.url)?.url
  const lifecycleTags = Array.from(new Set(members.flatMap(m => m.lifecycleTags))) as EventStatusFilter[]

  return {
    ...primary,
    key: members.map(m => m.key).join('|'),
    image: bestImage || primary.image,
    location: bestLocation || primary.location,
    url: bestUrl || primary.url || registryUrl,
    channels,
    channelIds,
    channelStatuses,
    lifecycleTags,
  }
}

/**
 * Collapse the same event published on multiple channels into one row.
 * Uses registry links first (authoritative), then title+date fuzzy match.
 */
function groupUnifiedEvents(
  events: UnifiedEvent[],
  registry: RegistryMaster[] = [],
): GroupedEvent[] {
  const byKey = new Map(events.map(e => [e.key, e]))
  const used = new Set<string>()
  const result: GroupedEvent[] = []

  // 1) Registry-linked publishes → one card with all channel tags
  for (const master of registry) {
    const members: UnifiedEvent[] = []
    for (const ch of CHANNEL_ORDER) {
      const ref = master.channels[ch]
      if (!ref?.eventId) continue
      const key = `${ch}-${ref.eventId}`
      const evt = byKey.get(key)
      if (evt && !used.has(evt.key)) {
        members.push(evt)
        used.add(evt.key)
      } else if (!evt) {
        // Channel was published (registry) but isn't in the local store yet —
        // still show the badge so multi-channel publishes aren't hidden.
        members.push({
          key,
          channel: ch,
          id: ref.eventId,
          title: master.title || 'Untitled',
          sortMs: 0,
          endMs: 0,
          dateStr: '',
          url: ref.url,
          lifecycleTags: [],
          syncSource: ch,
        })
      }
    }
    if (members.length === 0) continue
    // Prefer a real stored copy as primary (has dates/image); placeholders sort last.
    const ordered = [...members].sort((a, b) => {
      const aStored = byKey.has(a.key) ? 0 : 1
      const bStored = byKey.has(b.key) ? 0 : 1
      if (aStored !== bStored) return aStored - bStored
      return (b.sortMs || 0) - (a.sortMs || 0)
    })
    result.push(mergeMembers(ordered, master.channels))
  }

  // 2) Remaining events → group by title + start day (cross-channel publish without registry)
  const fuzzy = new Map<string, UnifiedEvent[]>()
  for (const evt of events) {
    if (used.has(evt.key)) continue
    const k = titleDateKey(evt)
    const arr = fuzzy.get(k)
    if (arr) arr.push(evt)
    else fuzzy.set(k, [evt])
  }
  for (const members of fuzzy.values()) {
    // Only merge across channels — never collapse same-channel duplicates here
    const byChannel = new Map<ChannelKey, UnifiedEvent[]>()
    for (const m of members) {
      const arr = byChannel.get(m.channel) || []
      arr.push(m)
      byChannel.set(m.channel, arr)
    }
    if (byChannel.size === 1) {
      // Same channel + same title/day → show once (dedupe sync noise)
      const only = [...byChannel.values()][0]
      const sorted = [...only].sort((a, b) => (a.sortMs || 0) - (b.sortMs || 0))
      result.push(mergeMembers([sorted[0]]))
      continue
    }
    // One member per channel (earliest), then merge
    const cross: UnifiedEvent[] = []
    for (const ch of CHANNEL_ORDER) {
      const list = byChannel.get(ch)
      if (!list?.length) continue
      const sorted = [...list].sort((a, b) => (a.sortMs || 0) - (b.sortMs || 0))
      cross.push(sorted[0])
      for (const extra of sorted.slice(1)) result.push(mergeMembers([extra]))
    }
    result.push(mergeMembers(cross))
  }

  return result
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
  // Prefer publish_status; if HT only returns a generic "active", treat as draft unless is_public.
  const normalizedStatus = (() => {
    const raw = String(status || '').toLowerCase()
    if (raw === 'active' || raw === '') {
      if (evt.is_public === false) return 'draft'
      if (evt.is_public === true) return 'published'
      return 'draft'
    }
    return status
  })()
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
    status: normalizedStatus,
    lifecycleTags: getLifecycleTags(sortMs, endMs, normalizedStatus),
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
            ? 'Try Expired, Draft, or Cancelled above.'
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

function BulkDeleteDialog({
  count, titles, deleting, onConfirm, onCancel,
}: {
  count: number
  titles: string[]
  deleting: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  const preview = titles.slice(0, 5)
  const extra = count - preview.length
  return (
    <div className="events-delete-overlay">
      <div className="events-delete-panel">
        <div className="events-delete-title">Delete {count} events?</div>
        <div className="events-delete-text">
          Selected events will be removed from <b style={{ color: 'var(--ink)' }}>every channel</b> they are published on.
        </div>
        <ul className="events-bulk-preview">
          {preview.map((t) => (
            <li key={t}>{t}</li>
          ))}
          {extra > 0 && <li>+{extra} more…</li>}
        </ul>
        <div className="events-delete-actions">
          <button type="button" className="events-delete-cancel" onClick={onCancel} disabled={deleting}>
            Cancel
          </button>
          <button type="button" className="events-delete-confirm" onClick={onConfirm} disabled={deleting}>
            {deleting ? 'Deleting…' : `Delete ${count} events`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EventCard ────────────────────────────────────────────────────────────────
function EventCard({
  image, title, dateStr, channels, channelStatuses, location, url,
  detailHref, selected, onToggleSelect, onEdit, onDelete, onSync,
}: {
  image?: string; title: string; dateStr: string; channels: ChannelKey[]
  channelStatuses: Partial<Record<ChannelKey, string | undefined>>
  location?: string; url?: string; detailHref?: string
  selected?: boolean
  onToggleSelect?: () => void
  onEdit?: () => void; onDelete?: () => void; onSync?: () => void
}) {
  const primaryChannel = channels[0] || 'eventbrite'
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
          {channels.map((ch) => {
            const rawStatus = channelStatuses[ch]
            const st = (rawStatus || '').toLowerCase()
            const isLive = st === 'published' || st === 'live'
            const label = formatChannelStatus(rawStatus)
            const showStatus = !!label && st !== 'active'
            return (
              <span
                key={ch}
                className="event-card__channel-badge"
                style={{
                  ['--ch-badge' as string]: CHANNEL_META[ch].color,
                }}
              >
                <ChannelLogo channel={ch} size={16} />
                {CHANNEL_META[ch].name}
                {showStatus && (
                  <span className={`event-card__status-badge ${isLive ? 'event-card__status-badge--live' : 'event-card__status-badge--muted'}`}>
                    {label}
                  </span>
                )}
              </span>
            )
          })}
        </div>
      </div>
    </>
  )

  return (
    <article
      className={`event-card${selected ? ' event-card--selected' : ''}`}
      style={{ '--card-accent': CHANNEL_META[primaryChannel].color } as React.CSSProperties}
    >
      <label className="event-card__select" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={!!selected}
          onChange={() => onToggleSelect?.()}
          aria-label={`Select ${title}`}
        />
      </label>

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
        {onSync && channels.length < 3 && (
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
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilters, setStatusFilters] = useState<Set<EventStatusFilter>>(
    () => new Set(DEFAULT_STATUS_FILTERS),
  )
  const [page, setPage] = useState(1)
  const [perPage, setPerPage] = useState(12) // hydrated from localStorage on mount
  const [editModal, setEditModal] = useState<{
    open: boolean
    channel: ChannelKey
    eventId: string | number
    channelIds: Partial<Record<ChannelKey, string | number>>
  }>({ open: false, channel: 'hightribe', eventId: '', channelIds: {} })
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
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

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

  // Registry links — used to merge publish copies into one card
  const [registryMasters, setRegistryMasters] = useState<RegistryMaster[]>([])
  const [htAvailable, setHtAvailable] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const map = await fetchChannelConnectionMap()
        setHtAvailable(map.hightribe)
      } catch {
        setHtAvailable(!isEwentcastSignupUser() || !!getEwentcastAccount()?.ht_connected)
      }
    })()
  }, [])

  const loadRegistry = useCallback(async () => {
    try {
      const res = await fetch('/api/registry', { headers: { Accept: 'application/json' } })
      if (!res.ok) {
        setRegistryMasters([])
        return
      }
      const data = await res.json() as { events?: RegistryMaster[] }
      setRegistryMasters(data.events || [])
    } catch {
      setRegistryMasters([])
    }
  }, [])

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
      const result = await syncChannelDataToDb('hightribe')
      toastRef.current.success(formatEventSyncMessage(result))
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
      const result = await syncChannelDataToDb('luma')
      toastRef.current.success(formatEventSyncMessage(result))
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
      const result = await syncChannelDataToDb('eventbrite')
      toastRef.current.success(formatEventSyncMessage(result))
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
      loadRegistry(),
    ])
  }, [loadHtEventsFromDb, loadLumaEventsFromDb, loadEbEventsFromDb, loadRegistry])

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

  const groupedEvents = useMemo(
    () => groupUnifiedEvents(mergedEvents, registryMasters),
    [mergedEvents, registryMasters],
  )

  const allEvents = useMemo(() => {
    const searched = filterUnifiedEvents(groupedEvents, searchQuery)
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
  }, [groupedEvents, searchQuery, statusFilters])

  const filtersDifferFromDefault = useMemo(() => {
    if (statusFilters.size !== DEFAULT_STATUS_FILTERS.size) return true
    for (const key of DEFAULT_STATUS_FILTERS) {
      if (!statusFilters.has(key)) return true
    }
    return false
  }, [statusFilters])

  function toggleStatusFilter(key: EventStatusFilter) {
    setStatusFilters(prev => {
      if (prev.size === 1 && prev.has(key)) return prev
      return new Set([key])
    })
  }

  const lastPage = Math.max(1, Math.ceil(allEvents.length / perPage))
  const safePage = Math.min(Math.max(1, page), lastPage)
  const pagedEvents = allEvents.slice((safePage - 1) * perPage, safePage * perPage)

  const selectedOnPage = pagedEvents.filter(e => selectedKeys.has(e.key))
  const allPageSelected = pagedEvents.length > 0 && selectedOnPage.length === pagedEvents.length
  const somePageSelected = selectedOnPage.length > 0 && !allPageSelected
  const selectedEvents = useMemo(
    () => allEvents.filter(e => selectedKeys.has(e.key)),
    [allEvents, selectedKeys],
  )

  function toggleSelect(key: string) {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function toggleSelectPage() {
    setSelectedKeys(prev => {
      const next = new Set(prev)
      if (allPageSelected) {
        for (const e of pagedEvents) next.delete(e.key)
      } else {
        for (const e of pagedEvents) next.add(e.key)
      }
      return next
    })
  }

  function clearSelection() {
    setSelectedKeys(new Set())
  }

  const totalCount = groupedEvents.length
  const loading = htLoading || lumaLoading || ebLoading
  const syncing = htSyncing || lumaSyncing || ebSyncing

  useEffect(() => {
    setSelectedKeys(prev => {
      const valid = new Set(allEvents.map(e => e.key))
      let changed = false
      const next = new Set<string>()
      for (const k of prev) {
        if (valid.has(k)) next.add(k)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [allEvents])

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
        await deleteEventEverywhere(t.channel, t.eventId)
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

  async function resolveDeleteTargets(evt: GroupedEvent): Promise<DeleteLink[]> {
    const links: DeleteLink[] = []
    const seen = new Set<string>()

    for (const ch of evt.channels) {
      const id = evt.channelIds[ch] ?? (ch === evt.channel ? evt.id : undefined)
      if (id == null) continue
      const k = `${ch}:${id}`
      if (seen.has(k)) continue
      seen.add(k)
      links.push({ channel: ch, eventId: id })
    }

    try {
      const res = await fetch(
        `/api/registry?channel=${evt.channel}&eventId=${encodeURIComponent(String(evt.id))}`,
      )
      if (res.ok) {
        const data = await res.json() as {
          master?: { id: string }
          links?: Partial<Record<ChannelKey, { eventId: string }>>
        }
        for (const ch of CHANNEL_ORDER) {
          const ref = data.links?.[ch]
          if (!ref?.eventId) continue
          const k = `${ch}:${ref.eventId}`
          if (seen.has(k)) continue
          seen.add(k)
          links.push({ channel: ch, eventId: ref.eventId })
        }
      }
    } catch { /* ignore */ }

    return links
  }

  async function handleBulkDelete() {
    if (selectedEvents.length === 0) return
    setDeleting(true)
    const errors: string[] = []
    let deletedCount = 0

    for (const evt of selectedEvents) {
      const targets = await resolveDeleteTargets(evt)
      for (const t of targets) {
        try {
          await deleteEventEverywhere(t.channel, t.eventId)
          if (t.channel === 'hightribe') {
            setHtAllEvents(ev => ev.filter(e => String(e.id) !== String(t.eventId)))
          } else if (t.channel === 'luma') {
            setLumaEvents(ev => ev.filter(e => e.api_id !== String(t.eventId)))
          } else {
            setEbEvents(ev => ev.filter(e => e.id !== String(t.eventId)))
          }
        } catch (err) {
          errors.push(`${evt.title} · ${CH_LABELS[t.channel]}: ${err instanceof Error ? err.message : 'failed'}`)
        }
      }

      try {
        const res = await fetch(
          `/api/registry?channel=${evt.channel}&eventId=${encodeURIComponent(String(evt.id))}`,
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

      deletedCount++
    }

    if (errors.length) toastRef.current.error(errors.slice(0, 3).join(' · '))
    else toastRef.current.success(`Deleted ${deletedCount} event${deletedCount === 1 ? '' : 's'}`)

    setDeleting(false)
    setBulkDeleteOpen(false)
    setSelectedKeys(new Set())
    void loadRegistry()
  }

  useEffect(() => {
    setPerPage(readStoredPerPage())
  }, [])

  useEffect(() => {
    void loadAllEvents()
    // Mount-only initial load — callbacks are stable; avoid re-fetch loops on re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const reloadIfStale = () => {
      if (consumeEventsListRefresh()) void loadAllEvents()
    }
    reloadIfStale()
    const onVisible = () => {
      if (document.visibilityState === 'visible') reloadIfStale()
    }
    window.addEventListener('focus', reloadIfStale)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', reloadIfStale)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [loadAllEvents])

  useEffect(() => {
    setPage(1)
  }, [searchQuery, statusFilters, perPage])

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  function changePerPage(value: number) {
    setPerPage(value)
    try { localStorage.setItem(PER_PAGE_STORAGE_KEY, String(value)) } catch { /* ignore */ }
  }

  function openEdit(
    channel: ChannelKey,
    id: string | number,
    channelIds?: Partial<Record<ChannelKey, string | number>>,
  ) {
    setEditModal({
      open: true,
      channel,
      eventId: id,
      channelIds: channelIds && Object.keys(channelIds).length > 0
        ? channelIds
        : { [channel]: id },
    })
  }

  async function onSaved(updatedChannels?: ChannelKey[]) {
    const channels = updatedChannels?.length ? updatedChannels : [editModal.channel]
    const labels = channels.map((ch) => CH_LABELS[ch]).join(', ')
    toastRef.current.success(`Event updated on ${labels}!`)
    setEditModal((f) => ({ ...f, open: false }))
    await loadAllEvents()
  }

  return (
    <div className="events-page">
      <Toast toasts={toasts} onRemove={removeToast} />

      <SyncModal open={!!syncEvent} event={syncEvent} onClose={() => setSyncEvent(null)} />

      <CreateEventWizardModal
        open={editModal.open}
        mode="edit"
        editChannel={editModal.channel}
        editEventId={editModal.eventId}
        editChannelIds={editModal.channelIds}
        onClose={() => setEditModal(f => ({ ...f, open: false }))}
        onPublished={onSaved}
      />

      {deleteTarget && !deleting && !bulkDeleteOpen && (
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
      {bulkDeleteOpen && (
        <BulkDeleteDialog
          count={selectedEvents.length}
          titles={selectedEvents.map(e => e.title)}
          deleting={deleting}
          onConfirm={() => void handleBulkDelete()}
          onCancel={() => { if (!deleting) setBulkDeleteOpen(false) }}
        />
      )}
      {deleting && !bulkDeleteOpen && (
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
        <button type="button" className="events-create-btn" onClick={() => router.push('/create')}>
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

      {isEwentcastSignupUser() && !htAvailable && (
        <div className="events-connect-banner" style={{ marginBottom: 12 }}>
          <h3>Connect Hightribe to include your hosted events</h3>
          <p>Add your Hightribe API key in Settings (same connect flow as Luma / Eventbrite).</p>
          <a href="/settings?channel=hightribe">Go to Settings → Connect Hightribe</a>
        </div>
      )}

      <div className="events-toolbar">
        <div className="events-toolbar-left">
          {allEvents.length > 0 && (
            <label className="events-select-all">
              <input
                type="checkbox"
                checked={allPageSelected}
                ref={(el) => {
                  if (el) el.indeterminate = somePageSelected
                }}
                onChange={toggleSelectPage}
                aria-label="Select all events on this page"
              />
              <span>{allPageSelected ? 'Clear page' : 'Select page'}</span>
            </label>
          )}
          <span className="events-toolbar-count">
            {searchQuery.trim() || filtersDifferFromDefault ? (
              <><strong>{allEvents.length}</strong> shown · <strong>{totalCount}</strong> total</>
            ) : (
              <><strong>{allEvents.length}</strong> active {allEvents.length === 1 ? 'event' : 'events'}</>
            )}
          </span>
        </div>
        <div className="events-toolbar-actions">
          {selectedKeys.size > 0 && (
            <>
              <button
                type="button"
                className="events-refresh-btn events-refresh-btn--danger"
                onClick={() => setBulkDeleteOpen(true)}
                disabled={loading || syncing || deleting}
              >
                Delete ({selectedKeys.size})
              </button>
              <button
                type="button"
                className="events-refresh-btn"
                onClick={clearSelection}
                disabled={deleting}
              >
                Clear
              </button>
            </>
          )}
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
                channels={evt.channels}
                channelStatuses={evt.channelStatuses}
                location={evt.location}
                url={evt.url}
                selected={selectedKeys.has(evt.key)}
                onToggleSelect={() => toggleSelect(evt.key)}
                detailHref={`/events/e/${encodeEventRef(evt.channel, evt.id)}`}
                onEdit={() => openEdit(evt.channel, evt.channelIds[evt.channel] ?? evt.id, evt.channelIds)}
                onDelete={() => setDeleteTarget({ channel: evt.channel, id: evt.id, title: evt.title })}
                onSync={() => setSyncEvent({ id: evt.id, title: evt.title, source: evt.syncSource })}
              />
            ))}
          </div>
          <div className="events-pagination">
            <label className="events-per-page">
              <span>Show</span>
              <select
                value={perPage}
                onChange={e => changePerPage(Number(e.target.value))}
                aria-label="Events per page"
              >
                {PER_PAGE_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
              <span>per page</span>
            </label>

            {lastPage > 1 ? (
              <>
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
              </>
            ) : (
              <span className="events-page-info">
                {allEvents.length} {allEvents.length === 1 ? 'event' : 'events'}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  )
}
