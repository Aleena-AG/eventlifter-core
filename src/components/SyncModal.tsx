'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { channelFetch } from '@/lib/channel-fetch'
import { fetchChannelConnectionMap } from '@/lib/channel-connection'
import { buildEbTicketClass, ebTicketQuantity } from '@/lib/eventbrite-ticket'
import { resolveEbTimezone } from '@/lib/eventbrite-timezone'
import { lumaEntryMatchesId, lumaEventToNorm, unwrapLumaEvent } from '@/lib/luma-event-utils'
import { InlineLoader } from '@/components/Loader'
import { HIGHTRIBE_COLOR, LUMA_COLOR, EVENTBRITE_COLOR } from '@/lib/brand'

export type SyncSource = 'hightribe' | 'luma' | 'eventbrite'

const EB_VALID_CURRENCIES = new Set(['USD','CAD','GBP','EUR','AUD','NZD','SGD','HKD','MYR','CHF','INR','BRL','MXN','SEK','NOK','DKK','JPY','ZAR','TWD','TRY','PLN','CZK','HUF','ILS','ARS','CLP','PEN','UYU','PHP','IDR','KRW'])
function toEbCurrency(c?: string): string {
  return (c && EB_VALID_CURRENCIES.has(c.toUpperCase())) ? c.toUpperCase() : 'USD'
}

function toEbHtml(text: string): string {
  const t = text.trim()
  if (!t) return '<p>Untitled Event</p>'
  if (/[<][a-z]/i.test(t)) return t
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<p>${esc}</p>`
}

function ebEventTitle(norm: NormEvent, fallback?: string): string {
  return (norm.title || fallback || 'Untitled Event').trim()
}

type ChannelKey = 'hightribe' | 'luma' | 'eventbrite'
type SyncStatus = 'idle' | 'loading' | 'success' | 'error'

interface ChannelResult {
  status: SyncStatus
  message: string
}

// Normalised event data extracted from any source
interface NormEvent {
  title: string
  description: string
  startUtc: string
  endUtc: string
  timezone: string
  coverImage?: string
  isOnline: boolean
  venueName?: string
  address?: string
  city?: string
  country?: string
  lat?: number
  lng?: number
  currency?: string
  onlineUrl?: string
  capacity?: number
}

interface Props {
  open: boolean
  event: { id: string | number; title: string; source: SyncSource } | null
  onClose: () => void
}

function stripMs(s: string): string {
  return s.replace(/\.\d{3}Z$/, 'Z')
}

function buildDateStr(date?: string, time?: string): string {
  if (!date) return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const raw = time ? `${date}T${time}` : `${date}T00:00:00`
  return new Date(raw).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function ensureFuture(startUtc: string, endUtc: string): { startUtc: string; endUtc: string } {
  const startMs = new Date(startUtc).getTime()
  const endMs = new Date(endUtc).getTime()
  if (startMs >= Date.now()) return { startUtc, endUtc }
  const duration = Math.max(endMs - startMs, 3600_000)
  const newStart = new Date(Date.now() + 30 * 24 * 3600_000)
  newStart.setSeconds(0, 0)
  const newEnd = new Date(newStart.getTime() + duration)
  return {
    startUtc: newStart.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    endUtc: newEnd.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }
}

// ─── Fetch & normalise event from each source ────────────────────────────────

function optStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : ''
  return s || undefined
}

function parseCoord(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function parseCapacity(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.floor(v)
  if (typeof v === 'string' && v.trim()) {
    const n = parseInt(v, 10)
    if (Number.isFinite(n) && n > 0) return n
  }
  return undefined
}

async function fetchHtEvent(id: string | number): Promise<NormEvent> {
  const res = await channelFetch(`/api/hightribe/events/${id}`, {
    headers: { Accept: 'application/json' },
  })
  const raw = await res.json() as { data?: Record<string, unknown> } & Record<string, unknown>
  const e = (raw.data || raw) as Record<string, unknown>
  const d = e.dates as Record<string, string> | undefined
  const loc = e.location as Record<string, unknown> | undefined
  const startUtc = d?.starts_at ? stripMs(d.starts_at) : buildDateStr(d?.start_date, d?.start_time)
  const endUtc   = d?.ends_at   ? stripMs(d.ends_at)   : buildDateStr(d?.end_date,   d?.end_time)
  // HT API stores venue label in location.location (see EventbriteService::importEventToHightribe)
  const venueLabel = optStr(loc?.location)
  return {
    title: String(e.title || ''),
    description: String(e.description || e.overview || ''),
    startUtc, endUtc,
    timezone: String(d?.timezone || e.timezone || 'UTC'),
    coverImage: optStr(e.cover_image),
    isOnline: loc?.type === 'online',
    venueName: venueLabel,
    address: optStr(loc?.address) || venueLabel,
    city: optStr(loc?.city),
    lat: parseCoord(loc?.lat),
    lng: parseCoord(loc?.lng),
    currency: optStr(e.currency),
    capacity: parseCapacity(e.capacity ?? e.seats ?? e.max_attendees),
  }
}

async function fetchLumaEventFromList(id: string | number): Promise<NormEvent | null> {
  const res = await channelFetch('/api/luma/events/hosted?upcoming_only=false&fetch_all=true', {
    headers: { Accept: 'application/json' },
  })
  const raw = await res.json() as { data?: { entries?: unknown[] }; entries?: unknown[]; status?: string }
  if (!res.ok || raw.status === 'error') return null
  const entries = raw.data?.entries || raw.entries || []
  for (const entry of entries) {
    if (!lumaEntryMatchesId(entry, id)) continue
    const e = unwrapLumaEvent(entry)
    const norm = lumaEventToNorm(e)
    return { ...norm, venueName: '', capacity: norm.capacity }
  }
  return null
}

async function fetchLumaEvent(id: string | number, fallbackTitle?: string): Promise<NormEvent> {
  try {
    const res = await channelFetch(`/api/luma/events?api_id=${encodeURIComponent(String(id))}`, {
      headers: { Accept: 'application/json' },
    })
    const raw = await res.json() as { data?: unknown; status?: string; message?: string }
    if (res.ok && raw.status !== 'error') {
      const e = unwrapLumaEvent(raw.data ?? raw)
      const norm = lumaEventToNorm(e)
      if (norm.title || fallbackTitle) {
        return { ...norm, title: norm.title || fallbackTitle || '', venueName: '' }
      }
    }
  } catch {
    // fall through to hosted list
  }

  const fromList = await fetchLumaEventFromList(id)
  if (fromList) {
    return { ...fromList, title: fromList.title || fallbackTitle || '' }
  }

  throw new Error(`Could not load Luma event ${id}`)
}

async function fetchEbEvent(id: string | number): Promise<NormEvent> {
  const res = await channelFetch(`/api/eventbrite/events/${id}?expand=venue`)
  const e = await res.json() as Record<string, unknown>
  const start = e.start as Record<string, string> | undefined
  const end   = e.end   as Record<string, string> | undefined
  const name  = e.name  as { text?: string } | undefined
  const desc  = e.description as { text?: string } | undefined
  const logo  = e.logo  as { original?: { url?: string }; url?: string } | undefined
  const venue = e.venue as Record<string, unknown> | undefined
  const addr  = venue?.address as Record<string, unknown> | undefined
  const startUtc = start?.utc ? stripMs(start.utc) : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const endUtc   = end?.utc   ? stripMs(end.utc)   : new Date(Date.now() + 3600_000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  return {
    title: name?.text || String(e.id || ''),
    description: desc?.text || '',
    startUtc, endUtc,
    timezone: start?.timezone || 'UTC',
    coverImage: logo?.original?.url || logo?.url,
    isOnline: !!(e.online_event),
    venueName: optStr(venue?.name),
    address: optStr(addr?.address_1) || optStr(addr?.localized_address_display),
    city: optStr(addr?.city),
    country: optStr(addr?.country),
    lat: parseCoord(venue?.latitude) ?? parseCoord(addr?.latitude),
    lng: parseCoord(venue?.longitude) ?? parseCoord(addr?.longitude),
    currency: optStr(e.currency),
  }
}

// Mirrors Hightribe-Laravel-Backend EventRequest + EventbriteService::importEventToHightribe
function buildHtLocation(norm: NormEvent): Record<string, unknown> {
  if (norm.isOnline) {
    return {
      type: 'online',
      location: 'Online',
      address: 'Online',
      city: 'Online',
    }
  }

  const venueLabel = norm.venueName || norm.address || 'TBD'
  const street = norm.address || norm.venueName || venueLabel
  const city = norm.city || norm.venueName || 'TBD'

  return {
    type: 'physical',
    location: venueLabel,
    address: street,
    city,
    lat: norm.lat,
    lng: norm.lng,
  }
}

export function SyncModal({ open, event, onClose }: Props) {
  const [selected, setSelected] = useState<Record<ChannelKey, boolean>>({
    hightribe: false, luma: false, eventbrite: false,
  })
  const [results, setResults] = useState<Partial<Record<ChannelKey, ChannelResult>>>({})
  const [publishing, setPublishing] = useState(false)
  const [done, setDone] = useState(false)
  const [connections, setConnections] = useState<Record<ChannelKey, boolean>>({
    hightribe: false, luma: false, eventbrite: false,
  })
  const [connectionsLoading, setConnectionsLoading] = useState(false)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setConnectionsLoading(true)
    fetchChannelConnectionMap()
      .then((map) => { if (!cancelled) setConnections(map) })
      .finally(() => { if (!cancelled) setConnectionsLoading(false) })
    return () => { cancelled = true }
  }, [open, event?.id])

  if (!open || !event) return null

  const source = event.source

  const toggleChannel = (ch: ChannelKey) => {
    if (ch === source || publishing || done) return
    setSelected((s) => ({ ...s, [ch]: !s[ch] }))
  }

  const handleClose = () => {
    setSelected({ hightribe: false, luma: false, eventbrite: false })
    setResults({})
    setPublishing(false)
    setDone(false)
    onClose()
  }

  const handlePublish = async () => {
    const targets = (Object.keys(selected) as ChannelKey[]).filter((k) => selected[k] && k !== source)
    if (targets.length === 0) return

    setPublishing(true)
    setResults({})

    // Fetch full event from source
    let norm: NormEvent
    try {
      if (source === 'hightribe') norm = await fetchHtEvent(event.id)
      else if (source === 'luma') norm = await fetchLumaEvent(event.id, event.title)
      else norm = await fetchEbEvent(event.id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to fetch event details from source'
      const err: ChannelResult = { status: 'error', message: msg }
      setResults(Object.fromEntries(targets.map((t) => [t, err])))
      setPublishing(false)
      setDone(true)
      return
    }

    const publishTitle = ebEventTitle(norm, event.title)
    norm = { ...norm, title: publishTitle }

    if (!publishTitle) {
      const err: ChannelResult = { status: 'error', message: 'Event title missing from source — cannot publish' }
      setResults(Object.fromEntries(targets.map((t) => [t, err])))
      setPublishing(false)
      setDone(true)
      return
    }

    const newResults: Partial<Record<ChannelKey, ChannelResult>> = {}
    const channelRefs: Partial<Record<ChannelKey, { eventId: string; url?: string }>> = {}

    await Promise.all(
      targets.map(async (ch) => {
        try {
          if (ch === 'hightribe') {
            // Parse startUtc → date + time fields HT expects
            const startD = new Date(norm.startUtc)
            const endD   = new Date(norm.endUtc)
            const pad = (n: number) => String(n).padStart(2, '0')
            const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
            const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`
            const tz = norm.timezone || 'UTC'
            // Convert to local timezone date/time
            const startLocal = new Date(startD.toLocaleString('en-US', { timeZone: tz }))
            const endLocal   = new Date(endD.toLocaleString('en-US', { timeZone: tz }))

            const body: Record<string, unknown> = {
              title: norm.title,
              description: norm.description || norm.title,
              status: 'published',
              is_business_profile: 0,
              dates: {
                start_date: toDate(startLocal),
                start_time: toTime(startLocal),
                end_date: toDate(endLocal),
                end_time: toTime(endLocal),
                timezone: tz,
              },
              location: buildHtLocation(norm),
            }
            const res = await channelFetch('/api/hightribe/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            const data = await res.json() as { message?: string; errors?: Record<string, string[]>; data?: { id?: unknown } }
            if (!res.ok) {
              const msg = data.message || (data.errors ? Object.values(data.errors).flat().join(', ') : `HTTP ${res.status}`)
              throw new Error(msg)
            }
            const newId = (data.data as Record<string, unknown>)?.id || '—'
            if (newId !== '—') channelRefs[ch] = { eventId: String(newId) }
            newResults[ch] = { status: 'success', message: `Created on Hightribe (ID: ${newId})` }
          }

          if (ch === 'luma') {
            const { startUtc, endUtc } = norm
            const body: Record<string, unknown> = {
              name: norm.title,
              start_at: startUtc,
              end_at: endUtc,
              timezone: norm.timezone || 'UTC',
              description: norm.description || undefined,
              cover_url: norm.coverImage || undefined,
              require_rsvp_approval: false,
            }
            if (norm.isOnline) {
              body.meeting_url = norm.onlineUrl || undefined
            } else if (norm.city || norm.address || norm.venueName) {
              body.geo_address_json = {
                type: 'manual',
                address: [norm.venueName, norm.address, norm.city, norm.country].filter(Boolean).join(', ')
                  || norm.address || norm.city || '',
                city: norm.city || undefined,
                country: norm.country || undefined,
                latitude: norm.lat,
                longitude: norm.lng,
              }
            }
            const res = await channelFetch('/api/luma/events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            const raw = await res.json() as { status?: string; data?: { api_id?: string }; message?: string; error?: string }
            if (!res.ok || raw.status === 'error') throw new Error(raw.message || raw.error || `HTTP ${res.status}`)
            const id = raw.data?.api_id || '—'
            if (id !== '—') channelRefs[ch] = { eventId: String(id), url: `lu.ma/${id}` }
            newResults[ch] = { status: 'success', message: `Created on Luma (${id})` }
          }

          if (ch === 'eventbrite') {
            const { startUtc, endUtc } = ensureFuture(norm.startUtc, norm.endUtc)
            const tz = await resolveEbTimezone(norm.timezone, startUtc, {
              country: norm.country,
              city: norm.city,
            })
            const ebTitle = ebEventTitle(norm, event.title)
            const ebDesc = (norm.description || ebTitle).trim() || ebTitle

            const orgRes = await channelFetch('/api/eventbrite/users/me/organizations')
            const orgData = await orgRes.json() as {
              organizations?: Array<{ id: string }>
              error?: string
              error_description?: string
            }
            if (!orgRes.ok) {
              throw new Error(orgData.error || orgData.error_description || `HTTP ${orgRes.status}`)
            }
            const orgId = orgData.organizations?.[0]?.id
            if (!orgId) throw new Error('No Eventbrite organization found. Create one on eventbrite.com first.')

            const evtBody = {
              event: {
                name: { html: toEbHtml(ebTitle) },
                description: { html: toEbHtml(ebDesc) },
                start: { utc: startUtc, timezone: tz },
                end: { utc: endUtc, timezone: tz },
                currency: toEbCurrency(norm.currency),
                online_event: norm.isOnline,
                listed: true,
                shareable: true,
              },
            }
            const evtRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/events`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(evtBody),
            })
            const evtData = await evtRes.json() as { id?: string; error?: string; error_description?: string }
            if (!evtRes.ok) throw new Error(evtData.error_description || evtData.error || `HTTP ${evtRes.status}`)
            const eventId2 = evtData.id!

            // Attach venue for in-person events (same flow as EventFormModal / Laravel EB import)
            if (!norm.isOnline && (norm.venueName || norm.address || norm.city)) {
              const vRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/venues`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  venue: {
                    name: norm.venueName || norm.city || 'Venue',
                    address: {
                      address_1: norm.address || undefined,
                      city: norm.city || undefined,
                      country: norm.country || undefined,
                    },
                  },
                }),
              })
              if (vRes.ok) {
                const vData = await vRes.json() as { id?: string }
                if (vData.id) {
                  await channelFetch(`/api/eventbrite/events/${eventId2}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ event: { venue_id: vData.id } }),
                  })
                }
              }
            }

            // Add free ticket so the event is publishable
            const tcRes = await channelFetch(`/api/eventbrite/events/${eventId2}/ticket_classes`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ticket_class: buildEbTicketClass({
                  name: 'General Admission',
                  free: true,
                  capacity: ebTicketQuantity(norm.capacity),
                  currency: norm.currency,
                }),
              }),
            })
            if (!tcRes.ok) {
              const d = await tcRes.json() as { error_description?: string }
              throw new Error(`Tickets: ${d.error_description || `HTTP ${tcRes.status}`}`)
            }
            channelRefs[ch] = { eventId: eventId2, url: `eventbrite.com/e/${eventId2}` }
            newResults[ch] = { status: 'success', message: `Created on Eventbrite (ID: ${eventId2})` }
          }
        } catch (err) {
          newResults[ch] = {
            status: 'error',
            message: err instanceof Error ? err.message : String(err),
          }
        }
      })
    )

    try {
      channelRefs[source] = { eventId: String(event.id) }
      let masterId: string | undefined
      const lookup = await fetch(
        `/api/registry?channel=${source}&eventId=${encodeURIComponent(String(event.id))}`,
      )
      if (lookup.ok) {
        const d = await lookup.json() as { master?: { id: string } }
        masterId = d.master?.id
      }
      if (!masterId) {
        const created = await fetch('/api/registry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'create',
            title: publishTitle,
            capacity: ebTicketQuantity(norm.capacity),
          }),
        })
        masterId = (await created.json() as { id: string }).id
      }
      for (const [ch, ref] of Object.entries(channelRefs) as [ChannelKey, { eventId: string; url?: string }][]) {
        if (!ref?.eventId) continue
        await fetch('/api/registry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'link', masterId, channel: ch, ref }),
        })
      }
    } catch { /* registry link is best-effort */ }

    setResults(newResults)
    setPublishing(false)
    setDone(true)
  }

  const anySelected = Object.entries(selected).some(([k, v]) => v && k !== source)

  const CHANNELS: { key: ChannelKey; label: string; icon: string; color: string; configured: boolean; note: string; settingsHref: string }[] = [
    {
      key: 'hightribe', label: 'Hightribe', icon: '🏔', color: HIGHTRIBE_COLOR,
      configured: connections.hightribe,
      note: connections.hightribe
        ? 'Will create event via Hightribe API'
        : 'Connect Hightribe in Settings first',
      settingsHref: '/settings?channel=hightribe',
    },
    {
      key: 'luma', label: 'Luma', icon: '✨', color: LUMA_COLOR,
      configured: connections.luma,
      note: connections.luma
        ? 'Will create event via Luma API'
        : 'Configure Luma in Settings first',
      settingsHref: '/settings?channel=luma',
    },
    {
      key: 'eventbrite', label: 'Eventbrite', icon: '🎫', color: EVENTBRITE_COLOR,
      configured: connections.eventbrite,
      note: connections.eventbrite
        ? 'Will create event via Eventbrite API'
        : 'Configure Eventbrite in Settings first',
      settingsHref: '/settings?channel=eventbrite',
    },
  ]

  const sourceLabel = source === 'hightribe' ? 'hightribe' : source === 'luma' ? 'Luma' : 'Eventbrite'

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: '24px',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        style={{
          background: '#FFFFFF', border: '1px solid #E8DFD0', borderRadius: '12px',
          width: '100%', maxWidth: '460px', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '18px 24px', borderBottom: '1px solid #E8DFD0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: '#211B16' }}>
              Publish to Channels
            </div>
            <div style={{ fontSize: '12px', color: '#8C7F6D', marginTop: '3px' }}>
              From {sourceLabel} · <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.title}</span>
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: 'none', border: 'none', color: '#8C7F6D',
              fontSize: '20px', cursor: 'pointer', lineHeight: 1, padding: '4px',
            }}
          >
            ×
          </button>
        </div>

        {/* Channel selection */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {connectionsLoading && (
            <p style={{ margin: 0, fontSize: '12px', color: '#8C7F6D' }}>Checking connected channels…</p>
          )}
          {CHANNELS.filter(c => c.key !== source).map(({ key, label, icon, color, configured, note, settingsHref }) => {
            const result = results[key]
            const isSelected = selected[key]

            return (
              <div
                key={key}
                onClick={() => configured && toggleChannel(key)}
                style={{
                  border: `1px solid ${result?.status === 'success' ? 'rgba(63,185,80,0.4)' : result?.status === 'error' ? 'rgba(248,81,73,0.4)' : isSelected ? color + '4d' : '#E8DFD0'}`,
                  borderRadius: '8px',
                  padding: '14px 16px',
                  background: isSelected && !result ? color + '0d' : '#F1EADC',
                  cursor: configured && !publishing && !done ? 'pointer' : 'default',
                  opacity: !configured ? 0.5 : 1,
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {/* Checkbox */}
                  <div style={{
                    width: '18px', height: '18px', borderRadius: '4px',
                    border: `2px solid ${isSelected ? color : '#E8DFD0'}`,
                    background: isSelected ? color : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0, fontSize: '12px', color: '#fff',
                  }}>
                    {isSelected ? '✓' : ''}
                  </div>

                  <span style={{ fontSize: '16px' }}>{icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#211B16' }}>{label}</div>
                    <div style={{ fontSize: '12px', color: result?.status === 'error' ? '#C2502E' : result?.status === 'success' ? '#4E7A4B' : '#8C7F6D', marginTop: '2px' }}>
                      {result ? result.message : (
                        <>
                          {note}
                          {!configured && !connectionsLoading && (
                            <>
                              {' '}
                              <Link href={settingsHref} style={{ color: '#D98A2B', fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>
                                Open Settings →
                              </Link>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {result?.status === 'success' && <span style={{ color: '#4E7A4B', fontSize: '18px' }}>✓</span>}
                  {result?.status === 'error' && <span style={{ color: '#C2502E', fontSize: '18px' }}>✗</span>}
                  {publishing && selected[key] && !result && (
                    <InlineLoader label="Publishing" />
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px', borderTop: '1px solid #E8DFD0',
          display: 'flex', justifyContent: 'flex-end', gap: '10px',
        }}>
          <button
            onClick={handleClose}
            style={{
              background: 'none', border: '1px solid #E8DFD0', borderRadius: '6px',
              color: '#8C7F6D', padding: '8px 16px', fontSize: '13px', cursor: 'pointer',
            }}
          >
            {done ? 'Close' : 'Cancel'}
          </button>
          {!done && (
            <button
              onClick={handlePublish}
              disabled={!anySelected || publishing}
              style={{
                background: anySelected && !publishing ? '#D98A2B' : '#F1EADC',
                border: 'none', borderRadius: '6px',
                color: anySelected && !publishing ? '#fff' : '#8C7F6D',
                padding: '8px 20px', fontSize: '13px', fontWeight: 500,
                cursor: anySelected && !publishing ? 'pointer' : 'default',
                transition: 'all 0.15s',
              }}
            >
              {publishing ? <InlineLoader label="Publishing" /> : 'Publish'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
