'use client'

import { authHeader } from '@/lib/auth'
import type { AttendeeRecord, MasterEventRecord } from '@/lib/event-registry'
import { getStoredEvent, listAllStoredBookings, listStoredEvents, syncStoredBookings } from '@/lib/channel-events-store'
import { fetchLumaGuestsForEvent } from '@/lib/bookings'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_KEYS } from '@/lib/channels'

export interface EventTicketType {
  id: string
  name: string
  price: number
  currency: string
  isFree: boolean
  /** Total seats for this ticket type; null when unlimited/unknown. */
  quantity: number | null
  /** Sold count when the channel reports it; otherwise estimated. */
  sold: number
  soldKnown: boolean
}

export interface EventDashboardData {
  title: string
  capacity: number
  attendees: AttendeeRecord[]
  channels: ChannelKey[]
  /** Per-channel event ids for every published platform. */
  channelIds: Partial<Record<ChannelKey, string>>
  channelCounts: Partial<Record<ChannelKey, number>>
  registrations: number
  uniqueAttendees: number
  masterId: string | null
  /** Ticket unit price; 0 when free or unknown. */
  ticketPrice: number
  currency: string
  isFree: boolean
  /** True when price/free was found on the event (not guessed). */
  hasPricing: boolean
  /** Estimated revenue = registrations × ticketPrice (0 when free). */
  revenue: number
  /** Percent of capacity sold (registrations / capacity). */
  ticketsSoldPct: number
  /** Ticket types configured on the event (name, price, qty, sold). */
  ticketTypes: EventTicketType[]
  startAt: string | null
  endAt: string | null
  coverUrl: string | null
  venue: string | null
  status: string | null
  eventUrl: string | null
  primaryChannel: ChannelKey
}

const DEFAULT_CAPACITY = 150

async function fetchMasterEvent(channel: ChannelKey, eventId: string): Promise<MasterEventRecord | null> {
  const lookupRes = await fetch(
    `/api/registry?channel=${encodeURIComponent(channel)}&eventId=${encodeURIComponent(eventId)}`,
    { headers: { Authorization: authHeader(), Accept: 'application/json' } },
  )
  if (!lookupRes.ok) return null

  const lookup = await lookupRes.json() as { master?: { id: string } | null }
  if (!lookup.master?.id) return null

  const res = await fetch('/api/registry', {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ masterId: lookup.master.id }),
  })
  if (!res.ok) return null
  return res.json() as Promise<MasterEventRecord>
}

function bookingsToAttendees(
  bookings: Array<{ guest_email: string; guest_name: string; channel: ChannelKey; registered_at: string }>,
): AttendeeRecord[] {
  const seen = new Set<string>()
  const list: AttendeeRecord[] = []
  for (const b of bookings) {
    const email = b.guest_email.toLowerCase().trim()
    if (!email || seen.has(email)) continue
    seen.add(email)
    list.push({
      email,
      name: b.guest_name || email.split('@')[0] || 'Guest',
      source: b.channel,
      registeredAt: b.registered_at,
    })
  }
  return list
}

function countByChannel(attendees: AttendeeRecord[]): Partial<Record<ChannelKey, number>> {
  const counts: Partial<Record<ChannelKey, number>> = {}
  for (const a of attendees) {
    counts[a.source] = (counts[a.source] || 0) + 1
  }
  return counts
}

/** Prefer registry-linked channels, then title matches across stores. */
async function resolvePublishedChannels(
  channel: ChannelKey,
  eventId: string,
  title: string,
  master: MasterEventRecord | null,
): Promise<{
  channels: ChannelKey[]
  channelIds: Partial<Record<ChannelKey, string>>
}> {
  const channelIds: Partial<Record<ChannelKey, string>> = { [channel]: String(eventId) }

  if (master?.channels) {
    for (const ch of CHANNEL_KEYS) {
      const ref = master.channels[ch]
      if (ref?.eventId) channelIds[ch] = String(ref.eventId)
    }
  }

  // Best-effort: same title on other channel stores = also published there
  const normTitle = title.trim().toLowerCase()
  if (normTitle) {
    const others = CHANNEL_KEYS.filter((ch) => !channelIds[ch])
    if (others.length) {
      const lists = await Promise.all(others.map((ch) => listStoredEvents(ch)))
      others.forEach((ch, i) => {
        const match = lists[i].find((row) => row.title.trim().toLowerCase() === normTitle)
        if (match) channelIds[ch] = match.external_id
      })
    }
  }

  const channels = CHANNEL_KEYS.filter((ch) => channelIds[ch] != null)
  return {
    channels: channels.length ? channels : [channel],
    channelIds,
  }
}

function emptyChannelCounts(channels: ChannelKey[]): Partial<Record<ChannelKey, number>> {
  const counts: Partial<Record<ChannelKey, number>> = {}
  for (const ch of channels) counts[ch] = 0
  return counts
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function parseMoney(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim()) {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function parseEbCost(raw: unknown): number {
  if (raw == null) return 0
  const str = String(raw)
  const minorMatch = str.match(/(\d+)\s*$/)
  if (minorMatch && /[A-Z]{3}/i.test(str)) {
    return parseInt(minorMatch[1], 10) / 100
  }
  const major = parseMoney(raw)
  if (major == null) return 0
  return major > 1000 ? major / 100 : major
}

function parseQty(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v)
  if (v != null && String(v).trim()) {
    const n = parseInt(String(v), 10)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return null
}

function venueFromPayload(channel: ChannelKey, payload: Record<string, unknown>): string | null {
  if (channel === 'hightribe') {
    const root = asRecord(payload.data) || payload
    const loc = asRecord(root.location) || asRecord(payload.location)
    if (!loc) return null
    const parts = [loc.venue_name || loc.location, loc.address, loc.city, loc.country]
      .map((p) => (p != null ? String(p).trim() : ''))
      .filter(Boolean)
    return parts.length ? parts.join(', ') : null
  }
  if (channel === 'eventbrite') {
    const venue = asRecord(payload.venue)
    const addr = asRecord(venue?.address)
    const name = venue?.name != null ? String(venue.name).trim() : ''
    const line =
      (addr?.localized_address_display != null && String(addr.localized_address_display)) ||
      (addr?.address_1 != null && String(addr.address_1)) ||
      ''
    if (name && line) return `${name} · ${line}`
    return name || line || null
  }
  if (channel === 'luma') {
    const event = asRecord(payload.event) || payload
    const geo = asRecord(event.geo_address_info) || asRecord(event.location)
    const parts = [
      event.meeting_url ? 'Online' : null,
      geo?.full_address || geo?.address || event.location_address || event.city,
    ]
      .map((p) => (p != null ? String(p).trim() : ''))
      .filter(Boolean)
    return parts.length ? parts.join(' · ') : null
  }
  return null
}

function extractTicketTypes(
  channel: ChannelKey,
  stored: Awaited<ReturnType<typeof getStoredEvent>>,
  registrations: number,
): EventTicketType[] {
  const payload = asRecord(stored?.payload) || {}
  const types: EventTicketType[] = []

  if (channel === 'hightribe') {
    const root = asRecord(payload.data) || payload
    const tickets = Array.isArray(root.tickets)
      ? root.tickets
      : Array.isArray(payload.tickets)
        ? payload.tickets
        : []
    tickets.forEach((raw, i) => {
      const t = asRecord(raw)
      if (!t) return
      const price = Math.max(0, parseMoney(t.price) ?? 0)
      const qty = parseQty(t.quantity)
      const soldRaw = parseQty(t.sold ?? t.tickets_sold ?? t.booked ?? t.quantity_sold)
      types.push({
        id: String(t.id ?? `ht-${i}`),
        name: String(t.name || t.title || `Ticket ${i + 1}`).trim() || `Ticket ${i + 1}`,
        price,
        currency: String(t.currency || root.currency || 'USD'),
        isFree: price <= 0,
        quantity: qty,
        sold: soldRaw ?? 0,
        soldKnown: soldRaw != null,
      })
    })
  } else if (channel === 'eventbrite') {
    const currency = String(payload.currency || 'USD').toUpperCase()
    const ticketClasses = Array.isArray(payload.ticket_classes)
      ? payload.ticket_classes
      : Array.isArray(payload.ticket_class)
        ? payload.ticket_class
        : []
    ticketClasses.forEach((raw, i) => {
      const t = asRecord(raw)
      if (!t) return
      const price = parseEbCost(t.cost ?? t.actual_cost)
      const isFree = !!t.free || price <= 0
      const qty = parseQty(t.quantity_total ?? t.quantity)
      const soldRaw = parseQty(t.quantity_sold ?? t.sales ?? t.sold)
      types.push({
        id: String(t.id ?? `eb-${i}`),
        name: String(t.name || t.display_name || `Ticket ${i + 1}`).trim() || `Ticket ${i + 1}`,
        price: isFree ? 0 : price,
        currency,
        isFree,
        quantity: qty,
        sold: soldRaw ?? 0,
        soldKnown: soldRaw != null,
      })
    })
  } else if (channel === 'luma') {
    const event = asRecord(payload.event) || payload
    const ticketTypes = Array.isArray(event.ticket_types)
      ? event.ticket_types
      : Array.isArray(payload.ticket_types)
        ? payload.ticket_types
        : []
    ticketTypes.forEach((raw, i) => {
      const t = asRecord(raw)
      if (!t) return
      const cents = parseMoney(t.cents ?? t.price_cents ?? t.amount_cents)
      const major = parseMoney(t.price ?? t.amount)
      let price = 0
      if (cents != null) price = cents / 100
      else if (major != null) price = major
      const isFree = price <= 0 || !!t.is_free || String(t.type || '').toLowerCase() === 'free'
      const qty = parseQty(t.capacity ?? t.quantity ?? t.max_capacity)
      const soldRaw = parseQty(t.sold ?? t.num_sold ?? t.guests_count ?? t.registered_count)
      types.push({
        id: String(t.id ?? t.api_id ?? `luma-${i}`),
        name: String(t.name || t.label || `Ticket ${i + 1}`).trim() || `Ticket ${i + 1}`,
        price: isFree ? 0 : Math.max(0, price),
        currency: String(t.currency || event.currency || 'USD'),
        isFree,
        quantity: qty,
        sold: soldRaw ?? 0,
        soldKnown: soldRaw != null,
      })
    })
  }

  if (types.length === 0) return types

  // When channels don't report per-type sold, attribute total registrations
  // to the first type (or split evenly if multiple unknown).
  const unknown = types.filter((t) => !t.soldKnown)
  if (unknown.length === types.length && registrations > 0) {
    if (types.length === 1) {
      types[0].sold = registrations
    } else {
      let remaining = registrations
      types.forEach((t, i) => {
        if (i === types.length - 1) {
          t.sold = remaining
          return
        }
        const share = Math.floor(registrations / types.length)
        t.sold = share
        remaining -= share
      })
    }
  }

  return types
}

/** Pull ticket price / free flag from a stored channel event payload. */
function extractPricing(
  channel: ChannelKey,
  stored: Awaited<ReturnType<typeof getStoredEvent>>,
  ticketTypes: EventTicketType[],
): { ticketPrice: number; currency: string; isFree: boolean; hasPricing: boolean; capacityHint: number | null } {
  const payload = asRecord(stored?.payload) || {}
  let ticketPrice = 0
  let currency = 'USD'
  let isFree = false
  let hasPricing = false
  let capacityHint: number | null = null

  if (ticketTypes.length > 0) {
    hasPricing = true
    isFree = ticketTypes.every((t) => t.isFree)
    const paid = ticketTypes.find((t) => !t.isFree)
    ticketPrice = paid?.price ?? 0
    currency = paid?.currency || ticketTypes[0].currency || 'USD'
    const qtySum = ticketTypes.reduce((s, t) => s + (t.quantity ?? 0), 0)
    if (qtySum > 0) capacityHint = qtySum
  } else if (channel === 'eventbrite' && typeof payload.is_free === 'boolean') {
    isFree = payload.is_free
    hasPricing = true
    currency = String(payload.currency || 'USD').toUpperCase()
  } else if (channel === 'luma') {
    const event = asRecord(payload.event) || payload
    if (typeof event.capacity === 'number' && event.capacity > 0) capacityHint = event.capacity
    currency = String(event.currency || 'USD')
  }

  if (isFree) ticketPrice = 0

  return {
    ticketPrice: Math.max(0, ticketPrice),
    currency: currency || 'USD',
    isFree,
    hasPricing,
    capacityHint,
  }
}

function extractEventMeta(
  channel: ChannelKey,
  stored: Awaited<ReturnType<typeof getStoredEvent>>,
) {
  const payload = asRecord(stored?.payload) || {}
  return {
    startAt: stored?.start_at || null,
    endAt: stored?.end_at || null,
    coverUrl: stored?.cover_url || null,
    venue: venueFromPayload(channel, payload),
    status: stored?.status || null,
    eventUrl: stored?.url || null,
  }
}

function formatDashboardMetrics(
  capacity: number,
  registrations: number,
  pricing: { ticketPrice: number; isFree: boolean },
) {
  const ticketsSoldPct = capacity > 0 ? Math.min(100, Math.round((registrations / capacity) * 100)) : 0
  const revenue = pricing.isFree ? 0 : Math.round(registrations * pricing.ticketPrice * 100) / 100
  return { ticketsSoldPct, revenue }
}

type EventBookingRow = {
  guest_email: string
  guest_name: string
  channel: ChannelKey
  registered_at: string
  ticket_count?: number | null
  event_external_id?: string | null
  event_title?: string
}

function filterStoredBookings(
  allBookings: Awaited<ReturnType<typeof listAllStoredBookings>>,
  channel: ChannelKey,
  eventId: string,
  title: string,
): EventBookingRow[] {
  const normTitle = title.trim().toLowerCase()
  return allBookings.filter((b) => {
    if (b.channel !== channel) return false
    if (b.event_external_id && String(b.event_external_id) === String(eventId)) return true
    return b.event_title.trim().toLowerCase() === normTitle
  })
}

async function pullLumaGuestsLive(
  eventId: string,
  title: string,
  persist: boolean,
): Promise<EventBookingRow[]> {
  let live = await fetchLumaGuestsForEvent(eventId, title)

  if (!live.length) {
    const normTitle = title.trim().toLowerCase()
    const events = await listStoredEvents('luma')
    for (const ev of events) {
      if (ev.external_id === eventId) continue
      if (ev.title.trim().toLowerCase() !== normTitle) continue
      live = await fetchLumaGuestsForEvent(ev.external_id, title)
      if (live.length) break
    }
  }

  if (!live.length) return []

  if (persist) {
    try {
      await syncStoredBookings('luma', live.map((g) => ({
        id: g.id,
        email: g.email,
        name: g.name,
        event_title: g.eventTitle,
        event_external_id: g.eventExternalId || eventId,
        registered_at: g.registeredAt,
        status: g.status,
        ticket_count: g.ticketCount,
      })))
    } catch {
      /* display live data even if cache write fails */
    }
  }

  return live.map((g) => ({
    guest_email: g.email,
    guest_name: g.name,
    channel: 'luma' as const,
    registered_at: g.registeredAt,
    ticket_count: g.ticketCount ?? 1,
  }))
}

export async function loadEventDashboardData(
  channel: ChannelKey,
  eventId: string,
  opts?: { refresh?: boolean },
): Promise<EventDashboardData> {
  const refresh = !!opts?.refresh
  const [stored, master, allBookings] = await Promise.all([
    getStoredEvent(channel, eventId),
    fetchMasterEvent(channel, eventId),
    listAllStoredBookings(),
  ])

  const title = master?.title || stored?.title || 'Untitled event'
  const meta = extractEventMeta(channel, stored)
  const published = await resolvePublishedChannels(channel, eventId, title, master)

  const masterAttendees = master?.attendees || []
  if (master && masterAttendees.length > 0) {
    const registrations = master.sold || masterAttendees.length
    const ticketTypes = extractTicketTypes(channel, stored, registrations)
    const pricing = extractPricing(channel, stored, ticketTypes)
    const capacity = master?.capacity || pricing.capacityHint || DEFAULT_CAPACITY
    const metrics = formatDashboardMetrics(capacity, registrations, pricing)
    const channelCounts = {
      ...emptyChannelCounts(published.channels),
      ...countByChannel(masterAttendees),
    }
    return {
      title,
      capacity,
      attendees: masterAttendees,
      channels: published.channels,
      channelIds: published.channelIds,
      channelCounts,
      registrations,
      uniqueAttendees: masterAttendees.length,
      masterId: master.id,
      ticketPrice: pricing.ticketPrice,
      currency: pricing.currency,
      isFree: pricing.isFree,
      hasPricing: pricing.hasPricing,
      revenue: metrics.revenue,
      ticketsSoldPct: metrics.ticketsSoldPct,
      ticketTypes,
      startAt: meta.startAt,
      endAt: meta.endAt,
      coverUrl: meta.coverUrl,
      venue: meta.venue,
      status: meta.status,
      eventUrl: meta.eventUrl,
      primaryChannel: channel,
    }
  }

  let eventBookings: EventBookingRow[] = filterStoredBookings(allBookings, channel, eventId, title)

  if (channel === 'luma' && (refresh || eventBookings.length === 0)) {
    const live = await pullLumaGuestsLive(eventId, title, refresh)
    if (live.length) {
      eventBookings = live
    }
  }

  // Pull bookings for every published channel id (registry + title match),
  // not only the channel we opened from.
  const normTitle = title.trim().toLowerCase()
  const publishedIds = new Set(
    Object.entries(published.channelIds).map(([ch, id]) => `${ch}:${id}`),
  )
  const linkedBookings: EventBookingRow[] = allBookings.filter((b) => {
    if (b.event_external_id && publishedIds.has(`${b.channel}:${b.event_external_id}`)) {
      return true
    }
    if (b.channel === channel) return false
    return !!normTitle && b.event_title.trim().toLowerCase() === normTitle
  })
  // Keep primary-channel bookings + linked ones (dedupe by email+channel+time later via attendees)
  const seenBooking = new Set<string>()
  eventBookings = [...eventBookings, ...linkedBookings].filter((b) => {
    const key = `${b.channel}|${b.guest_email}|${b.registered_at}|${b.event_external_id || ''}`
    if (seenBooking.has(key)) return false
    seenBooking.add(key)
    return true
  })

  const attendees = bookingsToAttendees(eventBookings)
  const registrations = eventBookings.reduce((sum, b) => sum + (b.ticket_count || 1), 0)
  const ticketTypes = extractTicketTypes(channel, stored, registrations)
  const pricing = extractPricing(channel, stored, ticketTypes)
  const capacity = master?.capacity || pricing.capacityHint || DEFAULT_CAPACITY
  const metrics = formatDashboardMetrics(capacity, registrations, pricing)
  const channelCounts = {
    ...emptyChannelCounts(published.channels),
    ...countByChannel(attendees),
  }

  return {
    title,
    capacity,
    attendees,
    channels: published.channels,
    channelIds: published.channelIds,
    channelCounts,
    registrations,
    uniqueAttendees: attendees.length,
    masterId: master?.id || null,
    ticketPrice: pricing.ticketPrice,
    currency: pricing.currency,
    isFree: pricing.isFree,
    hasPricing: pricing.hasPricing,
    revenue: metrics.revenue,
    ticketsSoldPct: metrics.ticketsSoldPct,
    ticketTypes,
    startAt: meta.startAt,
    endAt: meta.endAt,
    coverUrl: meta.coverUrl,
    venue: meta.venue,
    status: meta.status,
    eventUrl: meta.eventUrl,
    primaryChannel: channel,
  }
}
