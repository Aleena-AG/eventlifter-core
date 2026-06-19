'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { authHeader } from '@/lib/auth'
import { fetchHtEventsPage, type HtEventListItem } from '@/lib/hightribe-events'
import { Toast, useToast } from '@/components/Toast'
import { SyncModal, SyncSource } from '@/components/SyncModal'
import { CreateEventWizardModal } from '@/components/ewentcast/CreateEventWizardModal'
import type { ChannelKey } from '@/lib/types'

type Tab = 'hightribe' | 'luma' | 'eventbrite'

const CH_LABELS: Record<ChannelKey, string> = {
  hightribe: '🏔 HighTribe',
  luma: '✨ Luma',
  eventbrite: '🎫 Eventbrite',
}

type DeleteLink = { channel: ChannelKey; eventId: string | number }

async function deleteOnChannel(channel: ChannelKey, id: string | number): Promise<void> {
  if (channel === 'hightribe') {
    const res = await fetch(`/api/hightribe/events/${id}`, { method: 'DELETE', headers: { Authorization: authHeader() } })
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

// ─── HighTribe ───────────────────────────────────────────────────────────────
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
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000 }}>
      <div style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:'10px', padding:'24px 28px', maxWidth:'420px', width:'100%', margin:'20px' }}>
        <div style={{ fontSize:'15px', fontWeight:700, color:'#e6edf3', marginBottom:'10px' }}>Delete Event?</div>
        <div style={{ fontSize:'13px', color:'#8b949e', marginBottom:'16px', lineHeight:'1.5' }}>
          Delete <b style={{ color:'#e6edf3' }}>{title}</b> from {CH_LABELS[sourceChannel]}?
          {others.length > 0 && ' You can also remove copies on other channels.'}
        </div>

        {others.length > 0 && (
          <div style={{ marginBottom:'20px', display:'flex', flexDirection:'column', gap:'8px' }}>
            <div style={{ fontSize:'12px', fontWeight:600, color:'#8b949e', textTransform:'uppercase', letterSpacing:'0.04em' }}>
              Also delete from
            </div>
            {others.map(({ channel }) => (
              <label
                key={channel}
                style={{
                  display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px',
                  background:'#1c2128', border:'1px solid #30363d', borderRadius:'8px', cursor:'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={!!alsoDelete[channel]}
                  onChange={() => onToggle(channel)}
                  style={{ width:16, height:16, accentColor:'#f85149' }}
                />
                <span style={{ fontSize:'13px', color:'#e6edf3' }}>{CH_LABELS[channel]}</span>
              </label>
            ))}
          </div>
        )}

        <div style={{ display:'flex', gap:'8px', justifyContent:'flex-end' }}>
          <button onClick={onCancel} style={{ background:'none', border:'1px solid #30363d', borderRadius:'6px', color:'#8b949e', padding:'7px 16px', fontSize:'13px', cursor:'pointer' }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ background:'#b91c1c', border:'none', borderRadius:'6px', color:'#fff', padding:'7px 16px', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
            {alsoCount > 0 ? `Delete from ${1 + alsoCount} channels` : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── EventCard ────────────────────────────────────────────────────────────────
function EventCard({
  image, title, dateStr, badge, badgeColor, location, url, status,
  onEdit, onDelete,
}: {
  image?: string; title: string; dateStr: string; badge: string; badgeColor: string
  location?: string; url?: string; status?: string
  onEdit?: () => void; onDelete?: () => void
}) {
  return (
    <div style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:'10px', overflow:'hidden', display:'flex', gap:0 }}>
      {/* Cover */}
      {image ? (
        <div style={{ width:'120px', flexShrink:0, background:'#1c2128', overflow:'hidden' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={title} style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }} />
        </div>
      ) : (
        <div style={{ width:'120px', flexShrink:0, background:'#1c2128', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'32px' }}>📅</div>
      )}

      {/* Info */}
      <div style={{ flex:1, padding:'14px 16px', minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'12px' }}>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:'15px', fontWeight:600, color:'#e6edf3', marginBottom:'5px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
              {title}
            </div>
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', fontSize:'12px', color:'#8b949e', marginBottom:'8px' }}>
              <span>📅 {dateStr}</span>
              {location && <><span>·</span><span>📍 {location}</span></>}
            </div>
            <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center' }}>
              <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'4px', background:badgeColor+'1a', border:`1px solid ${badgeColor}4d`, color:badgeColor }}>{badge}</span>
              {status && (
                <span style={{ fontSize:'11px', padding:'2px 8px', borderRadius:'4px', background: status==='published'||status==='live' ? 'rgba(63,185,80,0.1)' : 'rgba(139,148,158,0.15)', border:`1px solid ${status==='published'||status==='live' ? 'rgba(63,185,80,0.3)' : '#30363d'}`, color: status==='published'||status==='live' ? '#3fb950' : '#8b949e' }}>
                  {status}
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display:'flex', gap:'6px', flexShrink:0, alignItems:'center', flexWrap:'wrap', justifyContent:'flex-end' }}>
            {onEdit && (
              <button onClick={onEdit} style={{ background:'rgba(56,139,253,0.1)', border:'1px solid rgba(56,139,253,0.35)', borderRadius:'6px', color:'#388bfd', padding:'5px 10px', fontSize:'12px', fontWeight:500, cursor:'pointer' }}>
                ✎ Edit
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} style={{ background:'rgba(248,81,73,0.08)', border:'1px solid rgba(248,81,73,0.3)', borderRadius:'6px', color:'#f85149', padding:'5px 10px', fontSize:'12px', fontWeight:500, cursor:'pointer' }}>
                🗑 Delete
              </button>
            )}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" style={{ display:'flex', alignItems:'center', gap:'4px', background:'rgba(56,139,253,0.12)', border:'1px solid rgba(56,139,253,0.35)', borderRadius:'6px', color:'#388bfd', padding:'5px 10px', fontSize:'12px', fontWeight:500, textDecoration:'none', whiteSpace:'nowrap' }}>
                View ↗
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState({ channel }: { channel: string }) {
  return (
    <div style={{ background:'#161b22', border:'2px dashed #30363d', borderRadius:'10px', padding:'60px 24px', textAlign:'center' }}>
      <div style={{ fontSize:'40px', marginBottom:'12px' }}>📭</div>
      <div style={{ fontSize:'15px', color:'#e6edf3', fontWeight:500, marginBottom:'8px' }}>No {channel} events found</div>
      <p style={{ color:'#8b949e', fontSize:'13px', margin:0 }}>Make sure your {channel} credentials are configured in Settings</p>
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

  // HighTribe state
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
    } catch { toast.error('Failed to load HighTribe events') }
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
      setLumaEvents(entries.map((e): LumaEvent | null => {
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
      }).filter((e): e is LumaEvent => !!e))
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
      setEbEvents(evtData.events || [])
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
          `/api/registry/lookup?channel=${deleteTarget.channel}&eventId=${encodeURIComponent(String(deleteTarget.id))}`,
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
        `/api/registry/lookup?channel=${channel}&eventId=${encodeURIComponent(String(id))}`,
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
    if (tab === 'hightribe' && htEvents.length === 0 && !htLoading) loadHtEvents(1)
    if (tab === 'luma' && lumaEvents.length === 0 && !lumaLoading) loadLumaEvents()
    if (tab === 'eventbrite' && ebEvents.length === 0 && !ebLoading) loadEbEvents()
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const TABS: { key: Tab; label: string; color: string }[] = [
    { key:'hightribe', label:'🏔 HighTribe', color:'#a78bfa' },
    { key:'luma',      label:'✨ Luma',      color:'#22d3ee' },
    { key:'eventbrite',label:'🎫 Eventbrite',color:'#fbbf24' },
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
    const label = channel === 'hightribe' ? 'HighTribe' : channel === 'luma' ? 'Luma' : 'Eventbrite'
    toast.success(`Event updated on ${label}!`)
    setEditModal(f => ({ ...f, open: false }))
    if (channel === 'hightribe') { setHtEvents([]); loadHtEvents(1) }
    else if (channel === 'luma') { setLumaEvents([]); loadLumaEvents() }
    else { setEbEvents([]); loadEbEvents() }
  }

  return (
    <div style={{ maxWidth:'960px' }}>
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
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:2000, color:'#e6edf3', fontSize:'15px' }}>
          Deleting…
        </div>
      )}

      {/* Header */}
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:'24px', gap:'16px' }}>
        <div>
          <h1 style={{ margin:0, fontSize:'22px', fontWeight:700, color:'#e6edf3' }}>Events</h1>
          <p style={{ margin:'4px 0 0', fontSize:'14px', color:'#8b949e' }}>Browse events from all your connected channels</p>
        </div>
        <button onClick={openCreate} style={{ background:'#238636', border:'1px solid #2ea043', borderRadius:'8px', color:'#fff', padding:'10px 18px', fontSize:'13px', fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:'6px', whiteSpace:'nowrap', flexShrink:0 }}>
          + Create Event
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:'4px', marginBottom:'24px', background:'#161b22', border:'1px solid #30363d', borderRadius:'8px', padding:'4px' }}>
        {TABS.map(({ key, label, color }) => (
          <button key={key} onClick={() => setTab(key)} style={{ flex:1, padding:'8px 16px', borderRadius:'6px', border:'none', cursor:'pointer', fontSize:'13px', fontWeight:500, background: tab===key ? '#1c2128' : 'transparent', color: tab===key ? color : '#8b949e', boxShadow: tab===key ? `0 0 0 1px ${color}4d` : 'none' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── HighTribe tab ───────────────────────────────────────────────────── */}
      {tab === 'hightribe' && (
        <div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'16px', gap:'8px' }}>
            <span style={{ fontSize:'13px', color:'#8b949e' }}>
              {htTotal !== null ? `${htTotal} events hosted by you` : 'Your hosted events'}
            </span>
            <button onClick={() => loadHtEvents(1)} disabled={htLoading} style={{ background:'#1c2128', border:'1px solid #30363d', borderRadius:'6px', color:'#8b949e', padding:'6px 14px', fontSize:'13px', cursor:'pointer' }}>
              {htLoading ? '…' : '↻ Refresh'}
            </button>
          </div>
          {htLoading ? (
            <div style={{ color:'#8b949e', fontSize:'14px', padding:'40px 0', textAlign:'center' }}>Loading HighTribe events…</div>
          ) : htEvents.length === 0 ? (
            <EmptyState channel="HighTribe" />
          ) : (
            <>
              <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
                {htEvents.map((evt) => {
                  const d = evt.dates
                  const dateStr = d?.starts_at ? fmtUtc(d.starts_at) : fmt(d?.start_date, d?.start_time)
                  const loc = evt.location ? [evt.location.venue_name, evt.location.city, evt.location.country].filter(Boolean).join(', ') : undefined
                  const image = evt.cover_image || evt.cover_image_aspect_ratio?.[0]?.image || undefined
                  const url = evt.share_url || (evt.slug ? `https://hightribe.com/events/${evt.slug}` : undefined)
                  const displayStatus = evt.publish_status || evt.status
                  return (
                    <div key={String(evt.id)} style={{ position:'relative' }}>
                      <EventCard
                        image={image} title={evt.title} dateStr={dateStr}
                        badge="🏔 HighTribe" badgeColor="#a78bfa"
                        location={loc} url={url} status={displayStatus}
                        onEdit={() => openEdit('hightribe', evt.id)}
                        onDelete={() => setDeleteTarget({ channel:'hightribe', id:evt.id, title:evt.title })}
                      />
                      <button
                        onClick={() => setSyncEvent({ id:evt.id, title:evt.title, source:'hightribe' })}
                        title="Publish to other channels"
                        style={{ position:'absolute', bottom:'14px', right: url ? '88px' : '14px', background:'rgba(167,139,250,0.15)', border:'1px solid rgba(167,139,250,0.4)', borderRadius:'6px', color:'#a78bfa', padding:'5px 10px', fontSize:'12px', fontWeight:500, cursor:'pointer' }}
                      >
                        ↗ Publish to…
                      </button>
                    </div>
                  )
                })}
              </div>
              {htLastPage > 1 && (
                <div style={{ display:'flex', justifyContent:'center', gap:'8px', marginTop:'24px' }}>
                  <button onClick={() => loadHtEvents(htPage - 1)} disabled={htPage <= 1 || htLoading} style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:'6px', color: htPage<=1 ? '#8b949e' : '#e6edf3', padding:'6px 14px', fontSize:'13px', cursor: htPage<=1 ? 'default' : 'pointer', opacity: htPage<=1 ? 0.5 : 1 }}>← Prev</button>
                  <span style={{ fontSize:'13px', color:'#8b949e', padding:'6px 8px' }}>Page {htPage} / {htLastPage}{htTotal !== null && <span style={{ marginLeft:'6px' }}>· {htTotal} events</span>}</span>
                  <button onClick={() => loadHtEvents(htPage + 1)} disabled={htPage >= htLastPage || htLoading} style={{ background:'#161b22', border:'1px solid #30363d', borderRadius:'6px', color: htPage>=htLastPage ? '#8b949e' : '#e6edf3', padding:'6px 14px', fontSize:'13px', cursor: htPage>=htLastPage ? 'default' : 'pointer', opacity: htPage>=htLastPage ? 0.5 : 1 }}>Next →</button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Luma tab ──────────────────────────────────────────────────────── */}
      {tab === 'luma' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'8px', marginBottom:'16px' }}>
            <button onClick={loadLumaEvents} disabled={lumaLoading} style={{ background:'#1c2128', border:'1px solid #30363d', borderRadius:'6px', color:'#8b949e', padding:'6px 14px', fontSize:'13px', cursor:'pointer' }}>
              {lumaLoading ? '…' : '↻ Refresh'}
            </button>
          </div>
          {lumaLoading ? (
            <div style={{ color:'#8b949e', fontSize:'14px', padding:'40px 0', textAlign:'center' }}>Loading Luma events…</div>
          ) : lumaEvents.length === 0 ? (
            <EmptyState channel="Luma" />
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {lumaEvents.map((evt) => {
                const url = evt.url
                return (
                  <div key={evt.api_id} style={{ position:'relative' }}>
                    <EventCard
                      image={evt.cover_url} title={evt.name} dateStr={fmtUtc(evt.start_at)}
                      badge="✨ Luma" badgeColor="#22d3ee"
                      location={evt.geo_address_json?.full_address || evt.geo_address_json?.city}
                      url={url}
                      onEdit={() => openEdit('luma', evt.api_id)}
                      onDelete={() => setDeleteTarget({ channel:'luma', id:evt.api_id, title:evt.name })}
                    />
                    <button
                      onClick={() => setSyncEvent({ id:evt.api_id, title:evt.name, source:'luma' })}
                      title="Publish to other channels"
                      style={{ position:'absolute', bottom:'14px', right: url ? '88px' : '14px', background:'rgba(34,211,238,0.15)', border:'1px solid rgba(34,211,238,0.4)', borderRadius:'6px', color:'#22d3ee', padding:'5px 10px', fontSize:'12px', fontWeight:500, cursor:'pointer' }}
                    >
                      ↗ Publish to…
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Eventbrite tab ────────────────────────────────────────────────── */}
      {tab === 'eventbrite' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:'8px', marginBottom:'16px' }}>
            <button onClick={loadEbEvents} disabled={ebLoading} style={{ background:'#1c2128', border:'1px solid #30363d', borderRadius:'6px', color:'#8b949e', padding:'6px 14px', fontSize:'13px', cursor:'pointer' }}>
              {ebLoading ? '…' : '↻ Refresh'}
            </button>
          </div>
          {ebLoading ? (
            <div style={{ color:'#8b949e', fontSize:'14px', padding:'40px 0', textAlign:'center' }}>Loading Eventbrite events…</div>
          ) : ebEvents.length === 0 ? (
            <EmptyState channel="Eventbrite" />
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              {ebEvents.map((evt) => {
                const title = evt.name?.text || 'Untitled'
                const url = evt.url
                return (
                  <div key={evt.id} style={{ position:'relative' }}>
                    <EventCard
                      image={evt.logo?.original?.url}
                      title={title}
                      dateStr={fmtUtc(evt.start?.utc)}
                      badge="🎫 Eventbrite" badgeColor="#fbbf24"
                      url={url} status={evt.status}
                      onEdit={() => openEdit('eventbrite', evt.id)}
                      onDelete={() => setDeleteTarget({ channel:'eventbrite', id:evt.id, title })}
                    />
                    <button
                      onClick={() => setSyncEvent({ id:evt.id, title, source:'eventbrite' })}
                      title="Publish to other channels"
                      style={{ position:'absolute', bottom:'14px', right: url ? '88px' : '14px', background:'rgba(251,191,36,0.15)', border:'1px solid rgba(251,191,36,0.4)', borderRadius:'6px', color:'#fbbf24', padding:'5px 10px', fontSize:'12px', fontWeight:500, cursor:'pointer' }}
                    >
                      ↗ Publish to…
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
