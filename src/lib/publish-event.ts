'use client'

import { channelFetch } from '@/lib/channel-fetch'
import { authHeader } from '@/lib/auth'
import { syncStoredEvents } from '@/lib/channel-events-store'
import type { ChannelKey } from '@/lib/types'
import { buildEbTicketClass, ebTicketQuantity } from '@/lib/eventbrite-ticket'
import { resolveEbTimezone } from '@/lib/eventbrite-timezone'
import { normalizeTimeZone, utcIsoToZonedParts, zonedDateTimeToUtcIso } from '@/lib/event-datetime'
import { parseTagsInput, syncLumaEventTags } from '@/lib/event-tags'
import { unwrapLumaEvent } from '@/lib/luma-event-utils'
import {
  postHtEvent,
  resolveCoverFileForHt,
  resolveCoverUrl,
  resolveLumaCoverUrl,
  type EventCoverFiles,
} from '@/lib/cover-image'

export type EventFormData = Record<string, string | boolean>

function toIso(date: string, time: string, tz: string): string {
  return zonedDateTimeToUtcIso(date, time, tz)
}

/** Keep Eventbrite start/end in the future (EB rejects past start times). */
function ensureFuture(startUtc: string, endUtc: string): { startUtc: string; endUtc: string } {
  const startMs = new Date(startUtc).getTime()
  const endMs = new Date(endUtc).getTime()
  if (Number.isFinite(startMs) && startMs >= Date.now()) return { startUtc, endUtc }
  const duration = Math.max(
    (Number.isFinite(endMs) ? endMs : startMs) - startMs,
    3600_000,
  )
  const newStart = new Date(Date.now() + 30 * 24 * 3600_000)
  newStart.setSeconds(0, 0)
  const newEnd = new Date(newStart.getTime() + (Number.isFinite(duration) ? duration : 3600_000))
  return {
    startUtc: newStart.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    endUtc: newEnd.toISOString().replace(/\.\d{3}Z$/, 'Z'),
  }
}

function toEbHtml(text: string): string {
  const t = text.trim()
  if (!t) return '<p>Untitled Event</p>'
  if (/<[a-z]/i.test(t)) return t
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  // Preserve line breaks as separate paragraphs for structured content.
  return esc
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => `<p>${line}</p>`)
    .join('') || '<p></p>'
}

/**
 * Eventbrite no longer stores the full body on `event.description` (that field
 * is only the short teaser). Full copy must go through structured content.
 */
export async function writeEventbriteStructuredDescription(
  eventId: string | number,
  description: string,
): Promise<void> {
  const html = toEbHtml(description)
  if (!html || html === '<p></p>' || html === '<p>Untitled Event</p>') return

  let nextVersion = 1
  try {
    const curRes = await channelFetch(
      `/api/eventbrite/events/${eventId}/structured_content/?purpose=listing`,
    )
    if (curRes.ok) {
      const cur = await curRes.json() as { page_version_number?: string | number }
      const n = parseInt(String(cur.page_version_number || '0'), 10)
      if (Number.isFinite(n) && n > 0) nextVersion = n + 1
    }
  } catch {
    // First write — version 1
  }

  const res = await channelFetch(
    `/api/eventbrite/events/${eventId}/structured_content/${nextVersion}/`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modules: [
          {
            type: 'text',
            data: {
              body: {
                type: 'text',
                text: html,
                alignment: 'left',
              },
            },
          },
        ],
        publish: true,
        purpose: 'listing',
      }),
    },
  )
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as {
      error_description?: string
      error?: string
      error_detail?: Record<string, unknown>
    }
    throw new Error(formatEbError(data, res.status))
  }
}

/** Short listing teaser for Eventbrite (`summary` / deprecated `description`). */
function eventbriteSummaryText(ev: EventFormData): string {
  const summary = String(ev.summary || '').trim()
  if (summary) return summary.slice(0, 140)
  // Fall back to first line of the full description so listings aren't blank.
  const desc = String(ev.description || '').trim()
  if (!desc) return ''
  const firstLine = desc.split(/\n+/)[0]?.trim() || desc
  return firstLine.slice(0, 140)
}

function formatEbError(
  data: {
    error_description?: string
    error?: string
    error_detail?: Record<string, unknown>
  },
  status: number,
): string {
  const detail = data.error_detail
  let detailMsg = ''
  if (detail && typeof detail === 'object') {
    const parts: string[] = []
    for (const [key, val] of Object.entries(detail)) {
      if (Array.isArray(val)) parts.push(`${key}: ${val.join(', ')}`)
      else if (val != null && val !== '') parts.push(`${key}: ${String(val)}`)
    }
    detailMsg = parts.join('; ')
  }
  return data.error_description || detailMsg || data.error || `HTTP ${status}`
}

/** Convert a UTC ISO timestamp into calendar date/time fields in the event timezone. */
function utcToTzParts(isoUtc: string, tz: string): { date: string; time: string } {
  const parts = utcIsoToZonedParts(isoUtc, tz)
  if (parts.date) return parts
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  }
}

function extractLumaEventId(raw: Record<string, unknown>): string {
  const unwrapped = unwrapLumaEvent(raw.data ?? raw)
  return String(
    unwrapped.api_id
    || unwrapped.id
    || (raw.data as Record<string, unknown> | undefined)?.api_id
    || (raw.data as Record<string, unknown> | undefined)?.id
    || raw.api_id
    || raw.id
    || '',
  ).trim()
}

function isOnline(fmt: string) {
  return fmt === 'Online' || fmt === 'Hybrid'
}

function isInPerson(fmt: string) {
  return fmt === 'In person' || fmt === 'Hybrid'
}

const EB_COUNTRY_ALIASES: Record<string, string> = {
  PAKISTAN: 'PK',
  'UNITED STATES': 'US',
  USA: 'US',
  'UNITED KINGDOM': 'GB',
  UK: 'GB',
  CANADA: 'CA',
  AUSTRALIA: 'AU',
  GERMANY: 'DE',
  FRANCE: 'FR',
}

export function normalizeEbCountry(raw?: string): string | undefined {
  const value = String(raw || '').trim().toUpperCase()
  if (!value) return undefined
  if (/^[A-Z]{2}$/.test(value)) return value
  return EB_COUNTRY_ALIASES[value]
}

function shouldCreateEventbriteVenue(ev: EventFormData, inPerson: boolean): boolean {
  if (!inPerson) return false
  if (!normalizeEbCountry(String(ev.country || ''))) return false
  return !!(ev.venue || ev.address || ev.city)
}

function parseHtResponse(raw: Record<string, unknown>, status: number): never {
  const message = typeof raw.message === 'string' ? raw.message : undefined
  const errors = raw.errors as Record<string, string[]> | undefined
  const detail = errors ? Object.values(errors).flat().join(', ') : undefined
  throw new Error(message || detail || `HTTP ${status}`)
}

function htPublishStatus(ev: EventFormData): 'draft' | 'published' {
  const raw = String(ev.status || '').trim().toLowerCase()
  if (raw === 'draft') return 'draft'
  // Default to draft unless the user explicitly chose Published — never force-publish.
  if (raw === 'published' || raw === 'live' || raw === 'public') return 'published'
  return 'draft'
}

function ebPublishStatus(ev: EventFormData): 'live' | 'draft' {
  const raw = String(ev.status || '').trim().toLowerCase()
  if (raw === 'published' || raw === 'live' || raw === 'public') return 'live'
  return 'draft'
}

function htIsPublic(ev: EventFormData): boolean {
  const vis = String(ev.visibility || '').trim().toLowerCase()
  if (vis === 'private' || vis === 'unlisted' || vis === 'member-only') return false
  return true
}

function buildHightribeEventBody(
  ev: EventFormData,
  online: boolean,
  inPerson: boolean,
  tz: string,
  startUtc: string,
  endUtc: string,
): Record<string, unknown> {
  const start = utcToTzParts(startUtc, tz)
  const end = utcToTzParts(endUtc, tz)
  const status = htPublishStatus(ev)
  const hostName = String(ev.hostName || '').trim()
  const summary = String(ev.summary || '').trim()
  const body: Record<string, unknown> = {
    title: ev.title,
    description: String(ev.description || ev.title),
    status,
    publish_status: status,
    is_public: htIsPublic(ev) ? 1 : 0,
    is_business_profile: 0,
    dates: {
      start_date: start.date,
      start_time: start.time,
      end_date: end.date,
      end_time: end.time,
      timezone: tz,
    },
  }
  if (summary) {
    body.summary = summary
    body.overview = summary
  }
  if (hostName) {
    body.host_name = hostName
    body.organizer_name = hostName
  }
  const tagList = parseTagsInput(ev.tags)
  if (tagList.length) {
    body.highlights = tagList
  }
  const refundPolicy = String(ev.refundPolicy || '').trim()
  const faq = String(ev.faq || '').trim()
  const policies = [refundPolicy, ...(faq ? faq.split(/\n\n+/).map(s => s.trim()).filter(Boolean) : [])]
    .filter(Boolean)
  if (policies.length) {
    body.policies = policies
  }
  if (online) {
    body.location = {
      type: 'online',
      location: 'Online',
      address: 'Online',
      city: 'Online',
      online_url: ev.onlineUrl || undefined,
    }
  } else if (inPerson) {
    body.location = {
      type: 'physical',
      location: String(ev.venue || ev.address || 'TBD'),
      venue_name: String(ev.venue || '') || undefined,
      address: String(ev.address || ev.venue || 'TBD'),
      city: String(ev.city || '') || undefined,
      region: String(ev.region || '') || undefined,
      state: String(ev.region || '') || undefined,
      postal: String(ev.postal || '') || undefined,
      postal_code: String(ev.postal || '') || undefined,
      country: String(ev.country || '') || undefined,
      lat: ev.lat ? parseFloat(String(ev.lat)) : undefined,
      lng: ev.lng ? parseFloat(String(ev.lng)) : undefined,
    }
  }
  return body
}

async function publishHightribeChannel(
  ev: EventFormData,
  online: boolean,
  inPerson: boolean,
  tz: string,
  startUtc: string,
  endUtc: string,
  cap: number,
  htCoverFile?: File,
): Promise<{ eventId: string; ticketId?: string }> {
  const body = buildHightribeEventBody(ev, online, inPerson, tz, startUtc, endUtc)
  const ticketBundle = buildHightribeTicketsFromForm(ev)

  if (cap && ticketBundle.tickets) {
    const bundled = { ...body, ...ticketBundle }
    const res = await postHtEvent('/api/hightribe/events/with-tickets', bundled, 'POST', htCoverFile)
    const data = await res.json() as {
      data?: { id?: unknown; tickets?: Array<{ id?: unknown }> }
      message?: string
      errors?: Record<string, string[]>
    }
    if (res.ok) {
      const id = String((data.data as Record<string, unknown>)?.id || '')
      if (!id) throw new Error('Hightribe did not return an event id')
      const ticketId = String((data.data as { tickets?: Array<{ id?: unknown }> })?.tickets?.[0]?.id || '')
      return { eventId: id, ticketId: ticketId || undefined }
    }

    // Some HT API hosts don't support with-tickets yet — create event then sync tickets.
    const eventRes = await postHtEvent('/api/hightribe/events', body, 'POST', htCoverFile)
    const eventData = await eventRes.json() as {
      data?: { id?: unknown }
      message?: string
      errors?: Record<string, string[]>
    }
    if (!eventRes.ok) parseHtResponse(eventData, eventRes.status)
    const eventId = String((eventData.data as Record<string, unknown>)?.id || '')
    if (!eventId) throw new Error('Hightribe did not return an event id')
    await syncHightribeTickets(eventId, ev)
    const ids = await fetchHightribeTicketIds(eventId)
    return { eventId, ticketId: ids[0] || undefined }
  }

  const res = await postHtEvent('/api/hightribe/events', body, 'POST', htCoverFile)
  const data = await res.json() as { data?: { id?: unknown }; message?: string; errors?: Record<string, string[]> }
  if (!res.ok) parseHtResponse(data, res.status)
  const eventId = String((data.data as Record<string, unknown>)?.id || '')
  if (!eventId) throw new Error('Hightribe did not return an event id')
  return { eventId }
}

function buildHightribeTicketsFromForm(ev: EventFormData): {
  tickets?: Array<Record<string, unknown>>
  ticketSetting?: Record<string, unknown>
} {
  const cap = parseInt(String(ev.capacity || ''), 10)
  if (!Number.isFinite(cap) || cap <= 0) return {}

  const ticketType = String(ev.ticketType || '').trim()
  // Don't invent a $0 ticket on edit when pricing wasn't loaded into the form.
  if (!ticketType) return {}

  const isFree = ticketType === 'Free' || ticketType === 'Donation'
  const price = isFree ? 0 : parseFloat(String(ev.price || '0'))
  if (!isFree && (!Number.isFinite(price) || price <= 0)) return {}

  const currency = 'USD'
  const minQty = parseInt(String(ev.minPerOrder || '1'), 10) || 1
  const maxQty = parseInt(String(ev.maxPerOrder || '8'), 10) || 8
  const ticketName = String(ev.htTicketName || 'General Admission').trim() || 'General Admission'
  const ticketId = String(ev.htTicketId || '').trim()

  const ticket: Record<string, unknown> = {
    name: ticketName,
    currency,
    price: Number.isFinite(price) ? price : 0,
    quantity: cap,
    show_ticket: true,
    booking_type: 'instant',
  }
  if (ticketId) ticket.id = ticketId

  return {
    tickets: [ticket],
    ticketSetting: {
      minQty,
      maxQty,
    },
  }
}

async function fetchHightribeTicketIds(eventId: string | number): Promise<string[]> {
  try {
    const res = await channelFetch(
      `/api/hightribe/tickets?ticketable_type=event&ticketable_id=${encodeURIComponent(String(eventId))}`,
    )
    if (!res.ok) return []
    const raw = await res.json() as { data?: { tickets?: Array<{ id?: unknown }> } }
    const list = raw.data?.tickets
    if (!Array.isArray(list)) return []
    return list.map((t) => String(t.id ?? '')).filter(Boolean)
  } catch {
    return []
  }
}

/** Push ticket pricing to Hightribe via the dedicated tickets endpoint (more reliable than event PUT alone). */
async function syncHightribeTickets(eventId: string | number, ev: EventFormData): Promise<void> {
  const bundle = buildHightribeTicketsFromForm(ev)
  if (!bundle.tickets?.length) return

  let tickets = bundle.tickets.map((t) => ({ ...t }))
  const knownId = String(ev.htTicketId || '').trim()
  if (knownId) {
    tickets[0] = { ...tickets[0], id: knownId }
  } else {
    const ids = await fetchHightribeTicketIds(eventId)
    if (ids.length) tickets[0] = { ...tickets[0], id: ids[0] }
  }

  const body: Record<string, unknown> = {
    ticketable_type: 'event',
    ticketable_id: eventId,
    tickets,
  }
  if (bundle.ticketSetting) body.ticketSetting = bundle.ticketSetting

  const res = await channelFetch('/api/hightribe/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json() as { message?: string; errors?: Record<string, string[]> }
  if (!res.ok) {
    throw new Error(data.message || (data.errors ? Object.values(data.errors).flat().join(', ') : `HTTP ${res.status}`))
  }
}

async function updateEventbriteTickets(eventId: string | number, ev: EventFormData): Promise<void> {
  const ticketType = String(ev.ticketType || '').trim()
  // Skip ticket updates when the form never loaded pricing — avoid wiping a paid ticket to free.
  if (!ticketType) return

  const cap = ebTicketQuantity(ev.capacity as string | number | undefined)
  const listRes = await channelFetch(`/api/eventbrite/events/${eventId}/ticket_classes`)
  const listData = await listRes.json() as {
    ticket_classes?: Array<{ id?: string }>
    error_description?: string
  }
  if (!listRes.ok) {
    throw new Error(listData.error_description || `HTTP ${listRes.status}`)
  }
  const ticketClassId = listData.ticket_classes?.[0]?.id
  if (!ticketClassId) return

  const tz = normalizeTimeZone(String(ev.timezone || 'UTC'))
  const salesStart = String(ev.salesStart || '').trim()
  const salesEnd = String(ev.salesEnd || '').trim()
  const tc = buildEbTicketClass({
    name: String(ev.htTicketName || 'General Admission'),
    free: ticketType === 'Free' || ticketType === 'Donation',
    capacity: cap,
    currency: 'USD',
    price: ticketType === 'Free' || ticketType === 'Donation'
      ? 0
      : parseFloat(String(ev.price || '0')),
    salesStart: salesStart ? toIso(salesStart, '00:00', tz) : undefined,
    salesEnd: salesEnd ? toIso(salesEnd, '23:59', tz) : undefined,
  })

  const tcRes = await channelFetch(
    `/api/eventbrite/events/${eventId}/ticket_classes/${ticketClassId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_class: tc }),
    },
  )
  const tcData = await tcRes.json() as { error_description?: string; error?: string }
  if (!tcRes.ok) {
    throw new Error(tcData.error_description || tcData.error || `HTTP ${tcRes.status}`)
  }
}

/** Push ticket pricing to Luma (create default ticket or update existing). */
async function syncLumaTickets(eventId: string | number, ev: EventFormData): Promise<string | undefined> {
  const ticketType = String(ev.ticketType || '').trim()
  // Skip when pricing wasn't loaded — avoid wiping a paid ticket to free.
  if (!ticketType) return undefined

  const isFree = ticketType === 'Free' || ticketType === 'Donation'
  const price = isFree ? 0 : parseFloat(String(ev.price || '0'))
  if (!isFree && (!Number.isFinite(price) || price <= 0)) return undefined

  const cents = Math.round(price * 100)
  const currency = String(ev.currency || 'USD').toLowerCase() || 'usd'
  const name = String(ev.htTicketName || 'General Admission').trim() || 'General Admission'
  const cap = parseInt(String(ev.capacity || ''), 10)
  const maxCapacity = Number.isFinite(cap) && cap > 0 ? cap : undefined

  const listRes = await channelFetch(
    `/api/luma/ticket-types?event_id=${encodeURIComponent(String(eventId))}`,
  )
  const listRaw = await listRes.json() as {
    ticket_types?: Array<Record<string, unknown>>
    entries?: Array<Record<string, unknown>>
    data?: {
      ticket_types?: Array<Record<string, unknown>>
      entries?: Array<Record<string, unknown>>
      ticket_type?: Record<string, unknown>
    }
    status?: string
    message?: string
  }
  if (!listRes.ok || listRaw.status === 'error') {
    throw new Error(listRaw.message || `Luma ticket list failed (${listRes.status})`)
  }
  const existing =
    listRaw.ticket_types
    || listRaw.entries
    || listRaw.data?.ticket_types
    || listRaw.data?.entries
    || []
  const first = Array.isArray(existing) ? existing[0] : undefined
  const ticketId = first
    ? String(first.id || first.api_id || first.event_ticket_type_id || '')
    : ''

  const payload: Record<string, unknown> = {
    event_id: String(eventId),
    event_api_id: String(eventId),
    name,
    type: isFree ? 'free' : 'paid',
    ...(isFree
      ? {}
      : { cents, currency }),
    ...(maxCapacity != null ? { max_capacity: maxCapacity } : {}),
  }

  const tz = normalizeTimeZone(String(ev.timezone || 'UTC'))
  const salesStart = String(ev.salesStart || '').trim()
  const salesEnd = String(ev.salesEnd || '').trim()
  if (salesStart) {
    payload.valid_start_at = toIso(salesStart, '00:00', tz)
  }
  if (salesEnd) {
    payload.valid_end_at = toIso(salesEnd, '23:59', tz)
  }

  if (ticketId) {
    const res = await channelFetch('/api/luma/ticket-types', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        event_ticket_type_id: ticketId,
        id: ticketId,
        api_id: ticketId,
      }),
    })
    const raw = await res.json() as { status?: string; message?: string; error?: string }
    if (!res.ok || raw.status === 'error') {
      throw new Error(raw.message || raw.error || `Luma ticket update failed (${res.status})`)
    }
    return ticketId
  }

  const res = await channelFetch('/api/luma/ticket-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const raw = await res.json() as {
    status?: string
    message?: string
    error?: string
    data?: { ticket_type?: { id?: string; api_id?: string }; id?: string; api_id?: string }
    ticket_type?: { id?: string; api_id?: string }
  }
  if (!res.ok || raw.status === 'error') {
    throw new Error(raw.message || raw.error || `Luma ticket create failed (${res.status})`)
  }
  const created = raw.data?.ticket_type || raw.ticket_type || raw.data
  return created?.id || created?.api_id || undefined
}

export async function publishToChannel(
  ch: ChannelKey,
  ev: EventFormData,
  files?: EventCoverFiles,
): Promise<{ eventId: string; ticketId?: string; url?: string }> {
  const fmt = String(ev.format || 'In person')
  const online = isOnline(fmt)
  const inPerson = isInPerson(fmt)
  const tz = normalizeTimeZone(String(ev.timezone || 'UTC'))
  const startUtc = toIso(String(ev.date), String(ev.time), tz)
  const endUtc = toIso(String(ev.endDate || ev.date), String(ev.endTime || ev.time), tz)
  const cap = ebTicketQuantity(ev.capacity as string | number | undefined)
  const coverUrl = String(ev.coverUrl || '')
  const htCoverFile = ch === 'hightribe' ? await resolveCoverFileForHt(coverUrl, files?.cover) : undefined
  const publicCoverUrl = ch === 'luma'
    ? await resolveLumaCoverUrl(coverUrl, files?.cover)
    : ch === 'eventbrite'
      ? await resolveCoverUrl(coverUrl, files?.cover)
      : undefined

  if (ch === 'hightribe') {
    const published = await publishHightribeChannel(ev, online, inPerson, tz, startUtc, endUtc, cap, htCoverFile)
    return published
  }

  if (ch === 'luma') {
    const lumaDesc = String(ev.description || '').trim()
    const body: Record<string, unknown> = {
      name: ev.title,
      start_at: startUtc,
      end_at: endUtc,
      timezone: tz,
      // Luma expects markdown in description_md; plain `description` becomes "ONLY_MD"
      ...(lumaDesc ? { description_md: lumaDesc } : {}),
      cover_url: publicCoverUrl || undefined,
      require_rsvp_approval: !!ev.requireApproval,
      capacity: cap,
      visibility: String(ev.visibility || 'Public').toLowerCase() === 'public' ? 'public' : 'private',
    }
    const hostName = String(ev.hostName || '').trim()
    if (hostName) body.host = hostName
    if (online) body.meeting_url = ev.onlineUrl || undefined
    else if (inPerson && (ev.city || ev.address || ev.venue)) {
      const lat = ev.lat ? parseFloat(String(ev.lat)) : undefined
      const lng = ev.lng ? parseFloat(String(ev.lng)) : undefined
      body.geo_address_json = {
        type: 'manual',
        description: String(ev.venue || '') || undefined,
        address: [ev.address, ev.city, ev.region, ev.postal, ev.country].filter(Boolean).join(', ')
          || [ev.venue, ev.address, ev.city].filter(Boolean).join(', '),
        city: ev.city || undefined,
        region: ev.region || undefined,
        postal: ev.postal || undefined,
        country: ev.country || undefined,
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lng) ? lng : undefined,
      }
      if (Number.isFinite(lat)) body.geo_latitude = lat
      if (Number.isFinite(lng)) body.geo_longitude = lng
    }
    const res = await channelFetch('/api/luma/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const raw = await res.json() as Record<string, unknown> & {
      status?: string
      data?: { api_id?: string; id?: string; url?: string }
      message?: string
      error?: string
    }
    if (!res.ok || raw.status === 'error') throw new Error(raw.message || raw.error || `HTTP ${res.status}`)
    const eventId = extractLumaEventId(raw)
    if (!eventId) throw new Error('Luma did not return an event id')
    const ticketId = await syncLumaTickets(eventId, ev)
    await syncLumaEventTags(eventId, parseTagsInput(ev.tags))
    const unwrapped = unwrapLumaEvent(raw.data ?? raw)
    const lumaUrl = String(unwrapped.url || raw.data?.url || '')
    return { eventId, ticketId, url: lumaUrl || `lu.ma/${eventId}` }
  }

  // Eventbrite
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
  if (!orgId) throw new Error('No Eventbrite organization found')

  const { startUtc: ebStart, endUtc: ebEnd } = ensureFuture(startUtc, endUtc)
  const ebTz = await resolveEbTimezone(tz, ebStart, {
    country: String(ev.country || ''),
    city: String(ev.city || ''),
  })
  const ebTitle = String(ev.title || 'Untitled Event').trim() || 'Untitled Event'
  const ebDesc = String(ev.description || '').trim()
  const ebSummary = eventbriteSummaryText(ev)

  const evtRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        name: { html: toEbHtml(ebTitle) },
        // `description` on the event object is only the short teaser (same as summary).
        ...(ebSummary ? {
          summary: ebSummary,
          description: { html: toEbHtml(ebSummary) },
        } : {}),
        start: { utc: ebStart, timezone: ebTz },
        end: { utc: ebEnd, timezone: ebTz },
        currency: 'USD',
        online_event: online && !inPerson,
        listed: ev.visibility === 'Public',
        status: ebPublishStatus(ev),
        shareable: true,
      },
    }),
  })
  const evtData = await evtRes.json() as { id?: string; error?: string; error_description?: string }
  if (!evtRes.ok) throw new Error(evtData.error_description || evtData.error || `HTTP ${evtRes.status}`)
  const eventId = evtData.id!
  if (!eventId) throw new Error('Eventbrite did not return an event id')

  // Full body lives in structured content, not on event.description.
  if (ebDesc) await writeEventbriteStructuredDescription(eventId, ebDesc)

  if (inPerson && shouldCreateEventbriteVenue(ev, inPerson)) {
    const country = normalizeEbCountry(String(ev.country || ''))!
    const vRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/venues`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venue: {
          name: String(ev.venue || ev.city),
          address: {
            address_1: String(ev.address || ev.venue || ev.city),
            city: ev.city || undefined,
            region: ev.region || undefined,
            postal_code: ev.postal || undefined,
            country,
          },
        },
      }),
    })
    if (vRes.ok) {
      const vData = await vRes.json() as { id?: string }
      if (vData.id) {
        await channelFetch(`/api/eventbrite/events/${eventId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event: { venue_id: vData.id } }),
        })
      }
    }
  }

  const salesStart = String(ev.salesStart || '').trim()
  const salesEnd = String(ev.salesEnd || '').trim()
  const tc = buildEbTicketClass({
    name: 'General Admission',
    free: ev.ticketType === 'Free',
    capacity: cap,
    currency: 'USD',
    price: ev.ticketType === 'Free' ? 0 : parseFloat(String(ev.price || '0')),
    salesStart: salesStart ? toIso(salesStart, '00:00', tz) : undefined,
    salesEnd: salesEnd ? toIso(salesEnd, '23:59', tz) : undefined,
  })

  const tcRes = await channelFetch(`/api/eventbrite/events/${eventId}/ticket_classes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket_class: tc }),
  })
  const tcData = await tcRes.json() as { id?: string; error_description?: string }
  if (!tcRes.ok) throw new Error(tcData.error_description || `HTTP ${tcRes.status}`)

  return { eventId, ticketId: tcData.id, url: `eventbrite.com/e/${eventId}` }
}

export async function updateChannelEvent(
  ch: ChannelKey,
  eventId: string | number,
  ev: EventFormData,
  files?: EventCoverFiles,
): Promise<void> {
  const fmt = String(ev.format || 'In person')
  const online = fmt === 'Online' || fmt === 'Hybrid'
  const inPerson = fmt === 'In person' || fmt === 'Hybrid'
  const tz = normalizeTimeZone(String(ev.timezone || 'UTC'))
  const startUtc = toIso(String(ev.date), String(ev.time), tz)
  const endUtc = toIso(String(ev.endDate || ev.date), String(ev.endTime || ev.time), tz)
  const coverUrl = String(ev.coverUrl || '')
  const htCoverFile = ch === 'hightribe' ? (files?.cover ?? undefined) : undefined
  const publicCoverUrl = ch === 'luma'
    ? await resolveLumaCoverUrl(coverUrl, files?.cover)
    : ch === 'eventbrite'
      ? await resolveCoverUrl(coverUrl, files?.cover)
      : undefined

  if (ch === 'hightribe') {
    const body = buildHightribeEventBody(ev, online, inPerson, tz, startUtc, endUtc)
    const ticketBundle = buildHightribeTicketsFromForm(ev)
    if (ticketBundle.tickets) {
      Object.assign(body, ticketBundle)
    }
    const res = await postHtEvent(`/api/hightribe/events/${eventId}`, body, 'PUT', htCoverFile)
    const data = await res.json() as { message?: string; errors?: Record<string, string[]> }
    if (!res.ok) throw new Error(data.message || (data.errors ? Object.values(data.errors).flat().join(', ') : `HTTP ${res.status}`))
    if (ticketBundle.tickets) {
      await syncHightribeTickets(eventId, ev)
    }
    return
  }

  if (ch === 'luma') {
    const id = String(eventId)
    const lumaDesc = String(ev.description || '').trim()
    const body: Record<string, unknown> = {
      event_id: id,
      api_id: id,
      name: ev.title,
      start_at: startUtc,
      end_at: endUtc,
      timezone: tz,
      ...(lumaDesc ? { description_md: lumaDesc } : {}),
      cover_url: publicCoverUrl || undefined,
      require_rsvp_approval: !!ev.requireApproval,
      capacity: ev.capacity ? parseInt(String(ev.capacity)) : undefined,
      visibility: String(ev.visibility || 'Public').toLowerCase() === 'public' ? 'public' : 'private',
    }
    const hostName = String(ev.hostName || '').trim()
    if (hostName) body.host = hostName
    if (online) body.meeting_url = ev.onlineUrl || undefined
    else if (inPerson && (ev.city || ev.address || ev.venue)) {
      const lat = ev.lat ? parseFloat(String(ev.lat)) : undefined
      const lng = ev.lng ? parseFloat(String(ev.lng)) : undefined
      body.geo_address_json = {
        type: 'manual',
        description: String(ev.venue || '') || undefined,
        address: [ev.address, ev.city, ev.region, ev.postal, ev.country].filter(Boolean).join(', ')
          || [ev.venue, ev.address, ev.city].filter(Boolean).join(', '),
        city: ev.city || undefined,
        region: ev.region || undefined,
        postal: ev.postal || undefined,
        country: ev.country || undefined,
        latitude: Number.isFinite(lat) ? lat : undefined,
        longitude: Number.isFinite(lng) ? lng : undefined,
      }
      if (Number.isFinite(lat)) body.geo_latitude = lat
      if (Number.isFinite(lng)) body.geo_longitude = lng
    }
    const res = await channelFetch('/api/luma/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const raw = await res.json() as { status?: string; message?: string; error?: string }
    if (!res.ok || raw.status === 'error') throw new Error(raw.message || raw.error || `HTTP ${res.status}`)
    await syncLumaEventTags(id, parseTagsInput(ev.tags))
    await syncLumaTickets(eventId, ev)
    return
  }

  // Match create-path validation: future dates, HTML name/desc, EB timezone,
  // and summary capped at 140 chars (EB hard limit — longer values 400).
  // Prefer the event's existing EB timezone when possible — flipping zones on
  // update is a common ARGUMENTS_ERROR source.
  let existingTz = ''
  try {
    const existingRes = await channelFetch(`/api/eventbrite/events/${eventId}`)
    if (existingRes.ok) {
      const existing = await existingRes.json() as {
        start?: { timezone?: string; utc?: string }
        end?: { utc?: string }
      }
      existingTz = String(existing.start?.timezone || '').trim()
    }
  } catch {
    // ignore — fall through to resolved timezone
  }

  const { startUtc: ebStart, endUtc: ebEnd } = ensureFuture(startUtc, endUtc)
  const ebTz = existingTz || await resolveEbTimezone(tz, ebStart, {
    country: String(ev.country || ''),
    city: String(ev.city || ''),
  })
  const ebTitle = String(ev.title || 'Untitled Event').trim() || 'Untitled Event'
  const ebDesc = String(ev.description || '').trim()
  const ebSummary = eventbriteSummaryText(ev)

  // `description` is deprecated on Eventbrite event update and often 400s —
  // only patch name / schedule / listing / summary. Full body goes via
  // structured content below.
  const ebStatus = ebPublishStatus(ev)
  const attempts: Record<string, unknown>[] = [
    {
      name: { html: toEbHtml(ebTitle) },
      ...(ebSummary ? { summary: ebSummary } : {}),
      start: { utc: ebStart, timezone: ebTz },
      end: { utc: ebEnd, timezone: ebTz },
      listed: ev.visibility === 'Public',
      status: ebStatus,
    },
    {
      name: { html: toEbHtml(ebTitle) },
      start: { utc: ebStart, timezone: ebTz },
      end: { utc: ebEnd, timezone: ebTz },
      status: ebStatus,
    },
    {
      name: { html: toEbHtml(ebTitle) },
      status: ebStatus,
    },
  ]

  let lastErr = 'HTTP 400'
  let updated = false
  for (const event of attempts) {
    const res = await channelFetch(`/api/eventbrite/events/${eventId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event }),
    })
    const data = await res.json() as {
      error_description?: string
      error?: string
      error_detail?: Record<string, unknown>
    }
    if (res.ok) {
      updated = true
      break
    }
    lastErr = formatEbError(data, res.status)
  }
  if (!updated) throw new Error(lastErr)

  if (ebDesc) await writeEventbriteStructuredDescription(eventId, ebDesc)

  // Venue attach is a separate request — bundling venue_id with start/end often 400s.
  if (inPerson && shouldCreateEventbriteVenue(ev, inPerson)) {
    try {
      const orgRes = await channelFetch('/api/eventbrite/users/me/organizations')
      const orgData = await orgRes.json() as { organizations?: Array<{ id: string }> }
      const orgId = orgData.organizations?.[0]?.id
      const country = normalizeEbCountry(String(ev.country || ''))
      if (orgId && country) {
        const lat = ev.lat ? parseFloat(String(ev.lat)) : undefined
        const lng = ev.lng ? parseFloat(String(ev.lng)) : undefined
        const vRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/venues`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            venue: {
              name: String(ev.venue || ev.address || ev.city || 'Venue'),
              ...(Number.isFinite(lat) ? { latitude: String(lat) } : {}),
              ...(Number.isFinite(lng) ? { longitude: String(lng) } : {}),
              address: {
                address_1: String(ev.address || ev.venue || ev.city),
                city: ev.city || undefined,
                region: ev.region || undefined,
                postal_code: ev.postal || undefined,
                country,
                ...(Number.isFinite(lat) ? { latitude: String(lat) } : {}),
                ...(Number.isFinite(lng) ? { longitude: String(lng) } : {}),
              },
            },
          }),
        })
        if (vRes.ok) {
          const vData = await vRes.json() as { id?: string }
          if (vData.id) {
            await channelFetch(`/api/eventbrite/events/${eventId}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: { venue_id: vData.id } }),
            })
          }
        }
      }
    } catch {
      // venue attach is best-effort on update
    }
  }

  await updateEventbriteTickets(eventId, ev)
}

export async function updateChannelEventsAll(
  ev: EventFormData,
  targets: Partial<Record<ChannelKey, string | number>>,
  files?: EventCoverFiles,
): Promise<Partial<Record<ChannelKey, { ok: boolean; message?: string }>>> {
  const results: Partial<Record<ChannelKey, { ok: boolean; message?: string }>> = {}
  const channels = (['hightribe', 'luma', 'eventbrite'] as ChannelKey[]).filter(
    (ch) => targets[ch] != null && targets[ch] !== '',
  )

  for (const ch of channels) {
    try {
      await updateChannelEvent(ch, targets[ch]!, ev, files)
      results[ch] = { ok: true }
    } catch (err) {
      results[ch] = {
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return results
}

/**
 * Save a just-published event into our local channel store so it shows up on
 * the Events page immediately (without waiting for a manual/live re-sync).
 * Best-effort: failures here never fail the publish.
 */
export async function upsertLocalEventSnapshot(
  ch: ChannelKey,
  ev: EventFormData,
  ref: { eventId: string; url?: string },
): Promise<void> {
  return persistPublishedEvent(ch, ev, ref)
}

async function persistPublishedEvent(
  ch: ChannelKey,
  ev: EventFormData,
  ref: { eventId: string; url?: string },
): Promise<void> {
  if (!ref.eventId) return
  const tz = normalizeTimeZone(String(ev.timezone || 'UTC'))
  const startUtc = toIso(String(ev.date), String(ev.time), tz)
  const endUtc = toIso(String(ev.endDate || ev.date), String(ev.endTime || ev.time), tz)
  const cover = String(ev.coverUrl || '')

  let raw: Record<string, unknown>
  const htStatus = htPublishStatus(ev)
  const hostName = String(ev.hostName || '').trim()
  const fmt = String(ev.format || 'In person')
  const online = fmt === 'Online' || fmt === 'Hybrid'
  const inPerson = fmt === 'In person' || fmt === 'Hybrid'
  const lat = ev.lat ? parseFloat(String(ev.lat)) : undefined
  const lng = ev.lng ? parseFloat(String(ev.lng)) : undefined
  const hasPlace = !!(ev.venue || ev.address || ev.city)
  const refundPolicy = String(ev.refundPolicy || '').trim()
  const faq = String(ev.faq || '').trim()
  const hostExtras = {
    ...(refundPolicy ? { _refund_policy: refundPolicy } : {}),
    ...(faq ? { _faq: faq } : {}),
  }

  if (ch === 'luma') {
    const url = ref.url ? (/^https?:\/\//i.test(ref.url) ? ref.url : `https://${ref.url}`) : ''
    const lumaDesc = String(ev.description || '').trim()
    raw = {
      api_id: ref.eventId,
      name: ev.title,
      start_at: startUtc,
      end_at: endUtc,
      timezone: tz,
      url,
      cover_url: cover,
      // Persist markdown so edit form hydrates from description_md
      ...(lumaDesc ? { description_md: lumaDesc } : {}),
      status: htStatus === 'published' ? 'published' : 'draft',
      visibility: String(ev.visibility || 'Public').toLowerCase() === 'public' ? 'public' : 'private',
      host: hostName || undefined,
      ...hostExtras,
      meeting_url: online ? (ev.onlineUrl || undefined) : undefined,
      ...(inPerson && hasPlace ? {
        geo_address_json: {
          type: 'manual',
          description: String(ev.venue || '') || undefined,
          address: [ev.venue, ev.address, ev.city, ev.region, ev.postal, ev.country].filter(Boolean).join(', '),
          city: ev.city || undefined,
          region: ev.region || undefined,
          postal: ev.postal || undefined,
          country: ev.country || undefined,
          latitude: Number.isFinite(lat) ? lat : undefined,
          longitude: Number.isFinite(lng) ? lng : undefined,
        },
        geo_latitude: Number.isFinite(lat) ? lat : undefined,
        geo_longitude: Number.isFinite(lng) ? lng : undefined,
      } : {}),
    }
  } else if (ch === 'eventbrite') {
    const ebSummary = eventbriteSummaryText(ev)
    const ebDesc = String(ev.description || '').trim()
    raw = {
      id: ref.eventId,
      name: { text: ev.title },
      // Keep teaser + full body so edit form hydrates without another EB round-trip.
      summary: ebSummary || undefined,
      description: ebSummary
        ? { text: ebSummary, html: toEbHtml(ebSummary) }
        : undefined,
      ...(ebDesc ? { _full_description: ebDesc } : {}),
      ...hostExtras,
      start: { utc: startUtc },
      end: { utc: endUtc },
      url: ref.url || '',
      is_free: ev.ticketType === 'Free',
      status: ebPublishStatus(ev),
      listed: String(ev.visibility || '') === 'Public',
      online_event: online && !inPerson,
      ...(inPerson && hasPlace ? {
        venue: {
          name: String(ev.venue || ev.city || ''),
          latitude: Number.isFinite(lat) ? String(lat) : undefined,
          longitude: Number.isFinite(lng) ? String(lng) : undefined,
          address: {
            address_1: String(ev.address || ev.venue || ''),
            city: ev.city || undefined,
            region: ev.region || undefined,
            postal_code: ev.postal || undefined,
            country: normalizeEbCountry(String(ev.country || '')) || ev.country || undefined,
            latitude: Number.isFinite(lat) ? String(lat) : undefined,
            longitude: Number.isFinite(lng) ? String(lng) : undefined,
          },
        },
      } : {}),
    }
  } else {
    const htSummary = String(ev.summary || '').trim()
    const htDesc = String(ev.description || '').trim()
    raw = {
      id: ref.eventId,
      title: ev.title,
      ...(htSummary ? { summary: htSummary, overview: htSummary, short_description: htSummary } : {}),
      ...(htDesc ? { description: htDesc } : {}),
      dates: { starts_at: startUtc, ends_at: endUtc, timezone: tz },
      timezone: tz,
      cover_url: cover,
      status: htStatus,
      publish_status: htStatus,
      is_public: htIsPublic(ev),
      host_name: hostName || undefined,
      organizer_name: hostName || undefined,
      ...(() => {
        const refundPolicy = String(ev.refundPolicy || '').trim()
        const faq = String(ev.faq || '').trim()
        const policies = [refundPolicy, ...(faq ? faq.split(/\n\n+/).map(s => s.trim()).filter(Boolean) : [])]
          .filter(Boolean)
        if (!policies.length && !refundPolicy && !faq) return {}
        return {
          ...(policies.length ? { policies } : {}),
          ...(refundPolicy ? { _refund_policy: refundPolicy } : {}),
          ...(faq ? { _faq: faq } : {}),
        }
      })(),
      location: online && !inPerson
        ? { type: 'online', location: 'Online', address: 'Online', city: 'Online', online_url: ev.onlineUrl || undefined }
        : inPerson && hasPlace
          ? {
              type: 'physical',
              location: String(ev.venue || ev.address || 'TBD'),
              venue_name: String(ev.venue || '') || undefined,
              address: String(ev.address || ev.venue || 'TBD'),
              city: String(ev.city || '') || undefined,
              region: String(ev.region || '') || undefined,
              state: String(ev.region || '') || undefined,
              postal: String(ev.postal || '') || undefined,
              postal_code: String(ev.postal || '') || undefined,
              country: String(ev.country || '') || undefined,
              lat: Number.isFinite(lat) ? lat : undefined,
              lng: Number.isFinite(lng) ? lng : undefined,
            }
          : String(ev.venue || ev.address || ev.city || ''),
    }
  }

  try {
    await syncStoredEvents(ch, [raw], { prune: false })
  } catch {
    // non-fatal — event still exists on the channel; a later sync will pick it up
  }
}

export type PublishResults = Partial<Record<ChannelKey, {
  status: 'synced' | 'error'
  url?: string
  message?: string
  eventId?: string
}>>

export async function publishToAllChannels(
  ev: EventFormData,
  targets: ChannelKey[],
  files?: EventCoverFiles,
  existingMasterId?: string,
): Promise<{ masterId: string; results: PublishResults }> {
  let masterId = existingMasterId || ''
  if (!masterId) {
    const masterRes = await fetch('/api/registry', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader(),
      },
      body: JSON.stringify({
        action: 'create',
        title: String(ev.title),
        capacity: parseInt(String(ev.capacity || '150')) || 150,
      }),
    })
    const master = await masterRes.json() as { id?: string; error?: string }
    if (!masterRes.ok || !master.id) {
      throw new Error(master.error || `Could not create master event (HTTP ${masterRes.status})`)
    }
    masterId = master.id
  }

  const results: PublishResults = {}

  for (const ch of targets) {
    try {
      const ref = await publishToChannel(ch, ev, files)
      if (!ref.eventId) {
        throw new Error(`${ch} did not return an event id`)
      }
      await fetch('/api/registry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader(),
        },
        body: JSON.stringify({
          action: 'link',
          masterId,
          channel: ch,
          ref: { eventId: ref.eventId, ticketId: ref.ticketId, url: ref.url },
        }),
      }).then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({})) as { error?: string }
          throw new Error(d.error || `Registry link failed for ${ch}`)
        }
      })
      await persistPublishedEvent(ch, ev, { eventId: ref.eventId, url: ref.url })
      results[ch] = { status: 'synced', url: ref.url, eventId: ref.eventId }
    } catch (e) {
      results[ch] = { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  }

  try { await fetch('/api/webhooks/setup', { method: 'POST' }) } catch { /* non-fatal */ }

  return { masterId, results }
}
