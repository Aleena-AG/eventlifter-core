'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { authHeader } from '@/lib/auth'
import { getEwentcastAccount, htApiAuthHeader, isEwentcastSignupUser } from '@/lib/ewentcast-session'
import { syncStoredEvents } from '@/lib/channel-events-store'
import { fetchHtEventsPage, type HtEventListItem } from '@/lib/hightribe-events'
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
    const res = await fetch(`/api/hightribe/events/${id}`, { method: 'DELETE', headers: { Authorization: htApiAuthHeader() } })
    if (!res.ok) { const d = await res.json() as { message?: string }; throw new Error(d.message || `HTTP ${res.status}`) }
    return
  }
  if (channel === 'luma') {
    const res = await fetch('/api/luma/events/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: authHeader() },
      body: JSON.stringify({ event_id: String(id), should_refund: true }),
    })
    const raw = await res.json() as { status?: string; message?: string; error?: string }
    if (!res.ok || raw.status === 'error') {
      throw new Error(raw.message || raw.error || `HTTP ${res.status}`)
    }
    return
  }
  const res = await fetch(`/api/eventbrite/events/${id}`, { method: 'DELETE' })
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
  onEdit, onDelete, onSync,
}: {
  image?: string; title: string; dateStr: string; channel: ChannelKey; badgeColor: string
  location?: string; url?: string; status?: string
  onEdit?: () => void; onDelete?: () => void; onSync?: () => void
}) {
  const channelName = CHANNEL_META[channel].name
  const isLive = status === 'published' || status === 'live'

  return (
    <article className="event-card" style={{ '--card-accent': badgeColor } as React.CSSProperties}>
      <div className="event-card__accent" aria-hidden="true" />

      <div className="event-card__inner">
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
      </div>

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

function EmptyState({ channel }: { channel: string }) {
  return (
    <div className="events-empty">
      <div className="events-empty-icon" aria-hidden="true">📭</div>
      <h3>No {channel} events found</h3>
      <p>Make sure your {channel} credentials are configured in Settings.</p>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function EventsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('hightribe')
  const [createOpen, setCreateOpen] = useState(false)
  const [editModal, setEditModal] = useState<{
    open: boolean; channel: ChannelKey; eventId: string | number
  }>({ open: false, channel: 'hightribe', eventId: '' })
  const { toasts, toast, removeToast } = useToast()

  // Sync modal
  const [syncEvent, setSyncEvent] = useState<{ id: string | number; title: string; source: SyncSource } | null>(null)
  const [htConfigured, setHtConfigured] = useState(false)
  const [lumaConfigured, setLumaConfigured] = useState(false)
  const [ebConfigured, setEbConfigured] = useState(false)

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<{ channel: ChannelKey; id: string|number; title: string } | null>(null)
  const [deleteLinks, setDeleteLinks] = useState<DeleteLink[]>([])
  const [deleteAlso, setDeleteAlso] = useState<Partial<Record<ChannelKey, boolean>>>({})
  const [deleting, setDeleting] = useState(false)

  // Hightribe state
  const [htEvents, setHtEvents] = useState<HtEvent[]>([])
  const [htLoading, setHtLoading] = useState(false)
  const [htPage, setHtPage] = useState(1)
  const [htLastPage, setHtLastPage] = useState(1)
  const [htTotal, setHtTotal] = useState<number | null>(null)

  // Luma state
  const [lumaEvents, setLumaEvents] = useState<LumaEvent[]>([])
  const [lumaLoading, setLumaLoading] = useState(false)

  // Eventbrite state
  const [ebEvents, setEbEvents] = useState<EbEvent[]>([])
  const [ebLoading, setEbLoading] = useState(false)

  // ── Fetchers ──────────────────────────────────────────────────────────────
  const loadHtEvents = useCallback(async (page = 1) => {
    setHtLoading(true)
    try {
      const { events, currentPage, lastPage, total } = await fetchHtEventsPage(page, 12)
      setHtEvents(events)
      setHtPage(currentPage)
      setHtLastPage(lastPage)
      setHtTotal(total)
      try {
        await syncStoredEvents('hightribe', events as unknown as Array<Record<string, unknown>>)
      } catch { /* save is best-effort */ }
    } catch { toast.error('Failed to load Hightribe events') }
    finally { setHtLoading(false) }
  }, [toast])

  const loadLumaEvents = useCallback(async () => {
    setLumaLoading(true)
    try {
      const res = await fetch('/api/luma/events/hosted?upcoming_only=false&fetch_all=true', { headers: { Authorization: authHeader() } })
      const raw = await res.json() as { data?: { entries?: LumaEntry[] }; entries?: LumaEntry[]; status?: string; message?: string; error?: string }
      if (!res.ok || raw.status === 'error') {
        toast.error(`Luma: ${raw.message || raw.error || `HTTP ${res.status}`}`)
        return
      }
      const entries = raw.data?.entries || raw.entries || []
      const mapped = entries.map((e): LumaEvent | null => {
        if (e.event) return e.event
        if (e.id && e.name) {
          return {
            api_id: e.id,
            name: e.name,
            start_at: e.start_at || '',
            end_at: e.end_at || '',
            timezone: e.timezone || 'UTC',
            url: e.url,
            cover_url: e.cover_url,
            geo_address_json: e.geo_address_json,
            meeting_url: e.meeting_url,
          }
        }
        return null
      }).filter((e): e is LumaEvent => !!e)
      setLumaEvents(mapped)
      try {
        await syncStoredEvents('luma', entries as unknown as Array<Record<string, unknown>>)
      } catch { /* save is best-effort */ }
    } catch { toast.error('Failed to load Luma events') }
    finally { setLumaLoading(false) }
  }, [toast])

  const loadEbEvents = useCallback(async () => {
    setEbLoading(true)
    try {
      const orgRes = await fetch('/api/eventbrite/users/me/organizations')
      const orgData = await orgRes.json() as { organizations?: Array<{ id: string }> }
      const orgs = orgData.organizations || []
      if (orgs.length === 0) { setEbEvents([]); return }
      const evtRes = await fetch(`/api/eventbrite/organizations/${orgs[0].id}/events?page_size=50`)
      const evtData = await evtRes.json() as { events?: EbEvent[] }
      const events = evtData.events || []
      setEbEvents(events)
      try {
        await syncStoredEvents('eventbrite', events as unknown as Array<Record<string, unknown>>)
      } catch { /* save is best-effort */ }
    } catch { toast.error('Failed to load Eventbrite events') }
    finally { setEbLoading(false) }
  }, [toast])

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
        if (t.channel === 'hightribe') setHtEvents(ev => ev.filter(e => String(e.id) !== String(t.eventId)))
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
    fetch('/api/settings').then(r => r.json()).then((s: {
      luma?: { apiKey?: string; configured?: boolean }
      eventbrite?: { privateToken?: string; clientId?: string }
    }) => {
      setHtConfigured(true)
      setLumaConfigured(!!(s.luma?.configured || s.luma?.apiKey))
      setEbConfigured(!!(s.eventbrite?.privateToken || s.eventbrite?.clientId))
    }).catch(() => {})
  }, [])

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
    setHtEvents([])
    setLumaEvents([])
    setEbEvents([])
    loadHtEvents(1)
    loadLumaEvents()
    loadEbEvents()
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

      <SyncModal open={!!syncEvent} event={syncEvent} htConfigured={htConfigured} lumaConfigured={lumaConfigured} ebConfigured={ebConfigured} onClose={() => setSyncEvent(null)} />

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
            <ChannelLogo channel={key} size={20} />
            <span className="events-tab-label">{name}</span>
          </button>
        ))}
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
              {htTotal !== null ? (
                <><strong>{htTotal}</strong> events hosted by you</>
              ) : (
                'Your hosted events'
              )}
            </span>
            <button type="button" className="events-refresh-btn" onClick={() => loadHtEvents(1)} disabled={htLoading}>
              {htLoading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
            </button>
          </div>
          {htLoading ? (
            <PageLoader label="Loading Hightribe events…" />
          ) : htEvents.length === 0 ? (
            <EmptyState channel="Hightribe" />
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
                      onEdit={() => openEdit('hightribe', evt.id)}
                      onDelete={() => setDeleteTarget({ channel:'hightribe', id:evt.id, title:evt.title })}
                      onSync={() => setSyncEvent({ id:evt.id, title:evt.title, source:'hightribe' })}
                    />
                  )
                })}
              </div>
              {htLastPage > 1 && (
                <div className="events-pagination">
                  <button type="button" className="events-page-btn" onClick={() => loadHtEvents(htPage - 1)} disabled={htPage <= 1 || htLoading}>← Prev</button>
                  <span className="events-page-info">
                    Page {htPage} / {htLastPage}
                    {htTotal !== null && <span style={{ marginLeft:'6px' }}>· {htTotal} events</span>}
                  </span>
                  <button type="button" className="events-page-btn" onClick={() => loadHtEvents(htPage + 1)} disabled={htPage >= htLastPage || htLoading}>Next →</button>
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
              <strong>{lumaEvents.length}</strong> {lumaEvents.length === 1 ? 'event' : 'events'}
            </span>
            <button type="button" className="events-refresh-btn" onClick={loadLumaEvents} disabled={lumaLoading}>
              {lumaLoading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
            </button>
          </div>
          {lumaLoading ? (
            <PageLoader label="Loading Luma events…" />
          ) : lumaEvents.length === 0 ? (
            <EmptyState channel="Luma" />
          ) : (
            <div className="events-list">
              {lumaEvents.map((evt) => (
                <EventCard
                  key={evt.api_id}
                  image={evt.cover_url} title={evt.name} dateStr={fmtUtc(evt.start_at)}
                  channel="luma" badgeColor={CHANNEL_META.luma.color}
                  location={evt.geo_address_json?.full_address || evt.geo_address_json?.city}
                  url={evt.url}
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
              <strong>{ebEvents.length}</strong> {ebEvents.length === 1 ? 'event' : 'events'}
            </span>
            <button type="button" className="events-refresh-btn" onClick={loadEbEvents} disabled={ebLoading}>
              {ebLoading ? <InlineLoader label="Refreshing" /> : '↻ Refresh'}
            </button>
          </div>
          {ebLoading ? (
            <PageLoader label="Loading Eventbrite events…" />
          ) : ebEvents.length === 0 ? (
            <EmptyState channel="Eventbrite" />
          ) : (
            <div className="events-list">
              {ebEvents.map((evt) => {
                const title = evt.name?.text || 'Untitled'
                return (
                  <EventCard
                    key={evt.id}
                    image={evt.logo?.original?.url}
                    title={title}
                    dateStr={fmtUtc(evt.start?.utc)}
                    channel="eventbrite" badgeColor={CHANNEL_META.eventbrite.color}
                    url={evt.url} status={evt.status}
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
