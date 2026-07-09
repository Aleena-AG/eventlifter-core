'use client'

import { channelFetch } from '@/lib/channel-fetch'
import { authHeader } from '@/lib/auth'
import { syncStoredEvents } from '@/lib/channel-events-store'
import type { ChannelKey } from '@/lib/types'
import { buildEbTicketClass, ebTicketQuantity } from '@/lib/eventbrite-ticket'
import { resolveEbTimezone } from '@/lib/eventbrite-timezone'
import {
  postHtEvent,
  resolveCoverFileForHt,
  resolveCoverUrl,
  type EventCoverFiles,
} from '@/lib/cover-image'

export type EventFormData = Record<string, string | boolean>

function toIso(date: string, time: string, tz: string): string {
  const raw = `${date}T${time.length === 5 ? time : time.slice(0, 5)}:00`
  try {
    return new Date(raw).toISOString().replace(/\.\d{3}Z$/, 'Z')
  } catch {
    return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  }
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

function normalizeEbCountry(raw?: string): string | undefined {
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
  const startD = new Date(startUtc)
  const endD = new Date(endUtc)
  const pad = (n: number) => String(n).padStart(2, '0')
  const status = htPublishStatus(ev)
  const hostName = String(ev.hostName || '').trim()
  const body: Record<string, unknown> = {
    title: ev.title,
    description: String(ev.description || ev.title),
    status,
    publish_status: status,
    is_public: htIsPublic(ev) ? 1 : 0,
    is_business_profile: 0,
    dates: {
      start_date: `${startD.getFullYear()}-${pad(startD.getMonth() + 1)}-${pad(startD.getDate())}`,
      start_time: `${pad(startD.getHours())}:${pad(startD.getMinutes())}`,
      end_date: `${endD.getFullYear()}-${pad(endD.getMonth() + 1)}-${pad(endD.getDate())}`,
      end_time: `${pad(endD.getHours())}:${pad(endD.getMinutes())}`,
      timezone: tz,
    },
  }
  if (hostName) {
    body.host_name = hostName
    body.organizer_name = hostName
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
      address: String(ev.address || ev.venue || 'TBD'),
      city: String(ev.city || ev.venue || 'TBD'),
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
  return { eventId: String((data.data as Record<string, unknown>)?.id || '') }
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

  const tc = buildEbTicketClass({
    name: String(ev.htTicketName || 'General Admission'),
    free: ticketType === 'Free' || ticketType === 'Donation',
    capacity: cap,
    currency: 'USD',
    price: ticketType === 'Free' || ticketType === 'Donation'
      ? 0
      : parseFloat(String(ev.price || '0')),
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

export async function publishToChannel(
  ch: ChannelKey,
  ev: EventFormData,
  files?: EventCoverFiles,
): Promise<{ eventId: string; ticketId?: string; url?: string }> {
  const fmt = String(ev.format || 'In person')
  const online = isOnline(fmt)
  const inPerson = isInPerson(fmt)
  const tz = String(ev.timezone || 'UTC')
  const startUtc = toIso(String(ev.date), String(ev.time), tz)
  const endUtc = toIso(String(ev.endDate || ev.date), String(ev.endTime || ev.time), tz)
  const cap = ebTicketQuantity(ev.capacity as string | number | undefined)
  const coverUrl = String(ev.coverUrl || '')
  const htCoverFile = ch === 'hightribe' ? await resolveCoverFileForHt(coverUrl, files?.cover) : undefined
  const publicCoverUrl = ch !== 'hightribe'
    ? await resolveCoverUrl(coverUrl, files?.cover)
    : undefined

  if (ch === 'hightribe') {
    const published = await publishHightribeChannel(ev, online, inPerson, tz, startUtc, endUtc, cap, htCoverFile)
    return published
  }

  if (ch === 'luma') {
    const body: Record<string, unknown> = {
      name: ev.title,
      start_at: startUtc,
      end_at: endUtc,
      timezone: tz,
      description: ev.description || undefined,
      cover_url: publicCoverUrl || undefined,
      require_rsvp_approval: !!ev.requireApproval,
      capacity: cap,
      visibility: String(ev.visibility || 'Public').toLowerCase() === 'public' ? 'public' : 'private',
    }
    const hostName = String(ev.hostName || '').trim()
    if (hostName) body.host = hostName
    if (online) body.meeting_url = ev.onlineUrl || undefined
    else if (inPerson && (ev.city || ev.address || ev.venue)) {
      body.geo_address_json = {
        type: 'manual',
        address: [ev.venue, ev.address, ev.city, ev.country].filter(Boolean).join(', '),
        city: ev.city || undefined,
        country: ev.country || undefined,
        latitude: ev.lat ? parseFloat(String(ev.lat)) : undefined,
        longitude: ev.lng ? parseFloat(String(ev.lng)) : undefined,
      }
    }
    const res = await channelFetch('/api/luma/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const raw = await res.json() as { status?: string; data?: { api_id?: string }; message?: string; error?: string }
    if (!res.ok || raw.status === 'error') throw new Error(raw.message || raw.error || `HTTP ${res.status}`)
    const eventId = String(raw.data?.api_id || '')
    return { eventId, url: `lu.ma/${eventId}` }
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

  const ebTz = await resolveEbTimezone(tz, startUtc, {
    country: String(ev.country || ''),
    city: String(ev.city || ''),
  })

  const evtRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        name: { html: ev.title },
        description: { html: String(ev.description || ev.title) },
        start: { utc: startUtc, timezone: ebTz },
        end: { utc: endUtc, timezone: ebTz },
        currency: 'USD',
        online_event: online && !inPerson,
        listed: ev.visibility === 'Public',
        shareable: true,
      },
    }),
  })
  const evtData = await evtRes.json() as { id?: string; error_description?: string }
  if (!evtRes.ok) throw new Error(evtData.error_description || `HTTP ${evtRes.status}`)
  const eventId = evtData.id!

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

  const tc = buildEbTicketClass({
    name: 'General Admission',
    free: ev.ticketType === 'Free',
    capacity: cap,
    currency: 'USD',
    price: ev.ticketType === 'Free' ? 0 : parseFloat(String(ev.price || '0')),
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
  const tz = String(ev.timezone || 'UTC')
  const startUtc = toIso(String(ev.date), String(ev.time), tz)
  const endUtc = toIso(String(ev.endDate || ev.date), String(ev.endTime || ev.time), tz)
  const coverUrl = String(ev.coverUrl || '')
  const htCoverFile = ch === 'hightribe' ? await resolveCoverFileForHt(coverUrl, files?.cover) : undefined
  const publicCoverUrl = ch !== 'hightribe'
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
    const body: Record<string, unknown> = {
      event_id: id,
      api_id: id,
      name: ev.title,
      start_at: startUtc,
      end_at: endUtc,
      timezone: tz,
      description: ev.description || undefined,
      cover_url: publicCoverUrl || undefined,
      require_rsvp_approval: !!ev.requireApproval,
      capacity: ev.capacity ? parseInt(String(ev.capacity)) : undefined,
      visibility: String(ev.visibility || 'Public').toLowerCase() === 'public' ? 'public' : 'private',
    }
    const hostName = String(ev.hostName || '').trim()
    if (hostName) body.host = hostName
    if (online) body.meeting_url = ev.onlineUrl || undefined
    else if (inPerson && (ev.city || ev.address || ev.venue)) {
      body.geo_address_json = {
        type: 'manual',
        address: [ev.venue, ev.address, ev.city, ev.country].filter(Boolean).join(', '),
        city: ev.city || undefined,
        country: ev.country || undefined,
        latitude: ev.lat ? parseFloat(String(ev.lat)) : undefined,
        longitude: ev.lng ? parseFloat(String(ev.lng)) : undefined,
      }
    }
    const res = await channelFetch('/api/luma/events', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const raw = await res.json() as { status?: string; message?: string; error?: string }
    if (!res.ok || raw.status === 'error') throw new Error(raw.message || raw.error || `HTTP ${res.status}`)
    return
  }

  const res = await channelFetch(`/api/eventbrite/events/${eventId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: {
        name: { html: ev.title },
        description: { html: String(ev.description || '') },
        start: { utc: startUtc, timezone: tz },
        end: { utc: endUtc, timezone: tz },
        currency: 'USD',
        online_event: online && !inPerson,
        listed: ev.visibility === 'Public',
      },
    }),
  })
  const data = await res.json() as { error_description?: string; error?: string }
  if (!res.ok) throw new Error(data.error_description || data.error || `HTTP ${res.status}`)
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
async function persistPublishedEvent(
  ch: ChannelKey,
  ev: EventFormData,
  ref: { eventId: string; url?: string },
): Promise<void> {
  if (!ref.eventId) return
  const tz = String(ev.timezone || 'UTC')
  const startUtc = toIso(String(ev.date), String(ev.time), tz)
  const endUtc = toIso(String(ev.endDate || ev.date), String(ev.endTime || ev.time), tz)
  const cover = String(ev.coverUrl || '')

  let raw: Record<string, unknown>
  const htStatus = htPublishStatus(ev)
  const hostName = String(ev.hostName || '').trim()
  if (ch === 'luma') {
    const url = ref.url ? (/^https?:\/\//i.test(ref.url) ? ref.url : `https://${ref.url}`) : ''
    raw = {
      api_id: ref.eventId,
      name: ev.title,
      start_at: startUtc,
      end_at: endUtc,
      timezone: tz,
      url,
      cover_url: cover,
      status: htStatus === 'published' ? 'published' : 'draft',
      visibility: String(ev.visibility || 'Public').toLowerCase() === 'public' ? 'public' : 'private',
      host: hostName || undefined,
    }
  } else if (ch === 'eventbrite') {
    raw = {
      id: ref.eventId,
      name: { text: ev.title },
      start: { utc: startUtc },
      end: { utc: endUtc },
      url: ref.url || '',
      is_free: ev.ticketType === 'Free',
      // Eventbrite stays draft until published on their side
      status: 'draft',
      listed: String(ev.visibility || '') === 'Public',
    }
  } else {
    raw = {
      id: ref.eventId,
      title: ev.title,
      dates: { starts_at: startUtc, ends_at: endUtc, timezone: tz },
      timezone: tz,
      cover_url: cover,
      location: String(ev.venue || ev.address || ev.city || ''),
      status: htStatus,
      publish_status: htStatus,
      is_public: htIsPublic(ev),
      host_name: hostName || undefined,
      organizer_name: hostName || undefined,
    }
  }

  try {
    await syncStoredEvents(ch, [raw], { prune: false })
  } catch {
    // non-fatal — event still exists on the channel; a later sync will pick it up
  }
}

export type PublishResults = Partial<Record<ChannelKey, { status: 'synced' | 'error'; url?: string; message?: string }>>

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
      })
      await persistPublishedEvent(ch, ev, { eventId: ref.eventId, url: ref.url })
      results[ch] = { status: 'synced', url: ref.url }
    } catch (e) {
      results[ch] = { status: 'error', message: e instanceof Error ? e.message : String(e) }
    }
  }

  try { await fetch('/api/webhooks/setup', { method: 'POST' }) } catch { /* non-fatal */ }

  return { masterId, results }
}
