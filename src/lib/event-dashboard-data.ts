'use client'

import type { AttendeeRecord, MasterEventRecord } from '@/lib/event-registry'
import { normalizeMasterEvent } from '@/lib/event-registry'
import { getStoredEvent, listAllStoredBookings, listStoredEvents, syncStoredBookings } from '@/lib/channel-events-store'
import {
  fetchEbBookingList,
  fetchEbEventsForSync,
  fetchHightribeBookingsList,
  fetchLumaEventsForSync,
  fetchLumaGuestsForEvent,
  mapStoredBookingToListItem,
  type BookingListItem,
} from '@/lib/bookings'
import type { ChannelKey } from '@/lib/types'
import { CHANNEL_KEYS } from '@/lib/channels'
import { hightribeDatesToUtc } from '@/lib/event-datetime'

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
  /** Full booking rows for attendee detail modals. */
  bookings: BookingListItem[]
  channels: ChannelKey[]
  /** Per-channel event ids for every published platform. */
  channelIds: Partial<Record<ChannelKey, string>>
  channelCounts: Partial<Record<ChannelKey, number>>
  /** Estimated revenue per published channel. */
  channelRevenue: Partial<Record<ChannelKey, number>>
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

type EventBookingRow = {
  guest_email: string
  guest_name: string
  channel: ChannelKey
  registered_at: string
  ticket_count?: number | null
  event_external_id?: string | null
  event_title?: string
  /** Provider booking id — used so same email can appear more than once. */
  booking_external_id?: string | null
}

/** Normalize titles for cross-channel matching (dashes, spaces, case). */
function normalizeTitle(raw: string | null | undefined): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, '-') // fancy dashes → -
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function titlesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeTitle(a)
  const nb = normalizeTitle(b)
  return !!na && !!nb && na === nb
}

async function fetchMasterEvent(channel: ChannelKey, eventId: string): Promise<MasterEventRecord | null> {
  try {
    const { channelFetch } = await import('@/lib/channel-fetch')
    const lookupRes = await channelFetch(
      `/api/registry?channel=${encodeURIComponent(channel)}&eventId=${encodeURIComponent(eventId)}`,
    )
    if (!lookupRes.ok) return null

    const { unwrapApiData, extractRegistryMasterId } = await import('@/lib/api-response')
    const lookupRaw = await lookupRes.json()
    const lookup = unwrapApiData<{ master?: { id: string } | null }>(lookupRaw)
    const masterId = lookup.master?.id || extractRegistryMasterId(lookupRaw)
    if (!masterId) return null

    const res = await channelFetch(`/api/registry/${encodeURIComponent(masterId)}`)
    if (!res.ok) return null
    const raw = await res.json()
    return normalizeMasterEvent(unwrapApiData(raw))
  } catch {
    return null
  }
}

function bookingsToAttendees(
  bookings: Array<{
    guest_email: string
    guest_name: string
    channel: ChannelKey
    registered_at: string
    booking_external_id?: string | null
  }>,
): AttendeeRecord[] {
  const seen = new Set<string>()
  const list: AttendeeRecord[] = []
  for (const b of bookings) {
    const email = b.guest_email.toLowerCase().trim()
    if (!email) continue
    // One UI row per booking (not per email) so EB qty / multiple tickets all show
    const key = b.booking_external_id
      ? `${b.channel}|${b.booking_external_id}`
      : `${b.channel}|${email}|${b.registered_at}`
    if (seen.has(key)) continue
    seen.add(key)
    list.push({
      email,
      name: b.guest_name || email.split('@')[0] || 'Guest',
      source: b.channel,
      registeredAt: b.registered_at,
    })
  }
  return list
}

function uniqueEmailCount(attendees: AttendeeRecord[]): number {
  return new Set(attendees.map((a) => a.email.toLowerCase().trim()).filter(Boolean)).size
}

function attendeesToBookingRows(attendees: AttendeeRecord[]): EventBookingRow[] {
  return attendees.map((a) => ({
    guest_email: a.email,
    guest_name: a.name,
    channel: a.source,
    registered_at: a.registeredAt,
    ticket_count: 1,
    booking_external_id: `master:${a.source}:${a.email.toLowerCase().trim()}`,
  }))
}

function dedupeBookingRows(rows: EventBookingRow[]): EventBookingRow[] {
  const seen = new Set<string>()
  return rows.filter((b) => {
    const email = b.guest_email.toLowerCase().trim()
    const key = b.booking_external_id
      ? `${b.channel}|${b.booking_external_id}`
      : `${b.channel}|${email}|${b.registered_at}|${b.event_external_id || ''}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Seed channel event ids from already-synced bookings with a matching title. */
function channelIdsFromBookings(
  allBookings: Awaited<ReturnType<typeof listAllStoredBookings>>,
  title: string,
): Partial<Record<ChannelKey, string>> {
  const out: Partial<Record<ChannelKey, string>> = {}
  for (const b of allBookings) {
    if (!b.event_external_id || !titlesMatch(b.event_title, title)) continue
    if (!out[b.channel]) out[b.channel] = String(b.event_external_id)
  }
  return out
}

/** Stored bookings for linked channel ids OR same event title (any platform). */
function collectPublishedBookings(
  allBookings: Awaited<ReturnType<typeof listAllStoredBookings>>,
  published: { channels: ChannelKey[]; channelIds: Partial<Record<ChannelKey, string>> },
  title: string,
): EventBookingRow[] {
  const publishedIds = new Set(
    Object.entries(published.channelIds).map(([ch, id]) => `${ch}:${id}`),
  )
  return allBookings
    .filter((b) => {
      if (b.event_external_id && publishedIds.has(`${b.channel}:${b.event_external_id}`)) {
        return true
      }
      return titlesMatch(b.event_title, title)
    })
    .map((b) => ({
      guest_email: b.guest_email,
      guest_name: b.guest_name,
      channel: b.channel,
      registered_at: b.registered_at,
      ticket_count: b.ticket_count,
      event_external_id: b.event_external_id,
      event_title: b.event_title,
      booking_external_id: b.external_id,
    }))
}

function isChannelKey(value: string): value is ChannelKey {
  return (CHANNEL_KEYS as string[]).includes(value)
}

/** Coerce registry-sourced attendees so `source` is always a known ChannelKey. */
function normalizeAttendees(
  attendees: AttendeeRecord[],
  fallback: ChannelKey,
): AttendeeRecord[] {
  return attendees.map((a) => {
    const raw = typeof a.source === 'string' ? a.source.trim().toLowerCase() : ''
    const source = isChannelKey(raw) ? raw : fallback
    return { ...a, source }
  })
}

function ticketCountsByChannel(
  bookings: Array<{ channel: ChannelKey; ticket_count?: number | null }>,
): Partial<Record<ChannelKey, number>> {
  const counts: Partial<Record<ChannelKey, number>> = {}
  for (const b of bookings) {
    counts[b.channel] = (counts[b.channel] || 0) + (b.ticket_count || 1)
  }
  return counts
}

function revenueByChannel(
  ticketCounts: Partial<Record<ChannelKey, number>>,
  channels: ChannelKey[],
  pricing: { ticketPrice: number; isFree: boolean },
): Partial<Record<ChannelKey, number>> {
  const out: Partial<Record<ChannelKey, number>> = {}
  for (const ch of channels) {
    const tickets = ticketCounts[ch] || 0
    out[ch] = pricing.isFree
      ? 0
      : Math.round(tickets * pricing.ticketPrice * 100) / 100
  }
  return out
}

/** Prefer registry-linked channels, then synced bookings / stores / live APIs by title. */
async function resolvePublishedChannels(
  channel: ChannelKey,
  eventId: string,
  title: string,
  master: MasterEventRecord | null,
  allBookings: Awaited<ReturnType<typeof listAllStoredBookings>>,
): Promise<{
  channels: ChannelKey[]
  channelIds: Partial<Record<ChannelKey, string>>
}> {
  const channelIds: Partial<Record<ChannelKey, string>> = {
    [channel]: String(eventId),
    ...channelIdsFromBookings(allBookings, title),
  }

  if (master?.channels) {
    for (const ch of CHANNEL_KEYS) {
      const ref = master.channels[ch]
      if (ref?.eventId) channelIds[ch] = String(ref.eventId)
    }
  }

  if (normalizeTitle(title)) {
    const others = CHANNEL_KEYS.filter((ch) => !channelIds[ch])
    if (others.length) {
      const lists = await Promise.all(others.map((ch) => listStoredEvents(ch)))
      others.forEach((ch, i) => {
        const match = lists[i].find((row) => titlesMatch(row.title, title))
        if (match) channelIds[ch] = match.external_id
      })
    }

    if (!channelIds.luma) {
      try {
        const lumaEvents = await fetchLumaEventsForSync()
        const match = lumaEvents.find((e) => titlesMatch(e.name, title))
        if (match?.api_id) channelIds.luma = match.api_id
      } catch { /* optional */ }
    }
    if (!channelIds.eventbrite) {
      try {
        const ebEvents = await fetchEbEventsForSync()
        const match = ebEvents.find((e) => {
          const name = typeof e.name === 'string' ? e.name : (e.name?.text || '')
          return titlesMatch(name, title)
        })
        if (match?.id) channelIds.eventbrite = match.id
      } catch { /* optional */ }
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

/** Prefer a real ISO timestamp; ignore empty / invalid values. */
function pickIso(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (v == null) continue
    const s = String(v).trim()
    if (!s) continue
    const ms = Date.parse(s)
    if (!Number.isNaN(ms)) return new Date(ms).toISOString()
  }
  return null
}

/** Prefer stored start/end; fall back to channel-native fields in the payload. */
function datesFromPayload(
  channel: ChannelKey,
  payload: Record<string, unknown>,
): { startAt: string | null; endAt: string | null } {
  if (channel === 'hightribe') {
    const root = asRecord(payload.data) || payload
    const dates = asRecord(root.dates) || asRecord(payload.dates)
    if (dates) {
      const hasWall =
        typeof dates.start_date === 'string' && String(dates.start_date).trim()
      const hasIso =
        typeof dates.starts_at === 'string' && String(dates.starts_at).trim()
      if (hasWall || hasIso) {
        const { startUtc, endUtc } = hightribeDatesToUtc(
          {
            starts_at: dates.starts_at != null ? String(dates.starts_at) : undefined,
            ends_at: dates.ends_at != null ? String(dates.ends_at) : undefined,
            start_date: dates.start_date != null ? String(dates.start_date) : undefined,
            start_time: dates.start_time != null ? String(dates.start_time) : undefined,
            end_date: dates.end_date != null ? String(dates.end_date) : undefined,
            end_time: dates.end_time != null ? String(dates.end_time) : undefined,
            timezone: dates.timezone != null ? String(dates.timezone) : undefined,
          },
          root.timezone != null ? String(root.timezone) : undefined,
        )
        return {
          startAt: pickIso(startUtc),
          endAt: pickIso(endUtc),
        }
      }
    }
    return {
      startAt: pickIso(root.starts_at, root.start_at, payload.starts_at, payload.start_at),
      endAt: pickIso(root.ends_at, root.end_at, payload.ends_at, payload.end_at),
    }
  }

  if (channel === 'luma') {
    const event = asRecord(payload.event) || payload
    return {
      startAt: pickIso(event.start_at, payload.start_at),
      endAt: pickIso(event.end_at, payload.end_at),
    }
  }

  if (channel === 'eventbrite') {
    const start = asRecord(payload.start)
    const end = asRecord(payload.end)
    return {
      startAt: pickIso(start?.utc, start?.local, payload.start_at),
      endAt: pickIso(end?.utc, end?.local, payload.end_at),
    }
  }

  return { startAt: null, endAt: null }
}

/** Prefer stored cover_url; fall back to channel-native fields in the payload. */
function coverFromPayload(channel: ChannelKey, payload: Record<string, unknown>): string | null {
  const pick = (...vals: unknown[]): string | null => {
    for (const v of vals) {
      if (v == null) continue
      const s = String(v).trim()
      if (s) return s
    }
    return null
  }

  if (channel === 'hightribe') {
    const root = asRecord(payload.data) || payload
    const direct = pick(root.cover_image, root.cover_url, payload.cover_image, payload.cover_url)
    if (direct) return direct
    const ratios = Array.isArray(root.cover_image_aspect_ratio)
      ? root.cover_image_aspect_ratio
      : Array.isArray(payload.cover_image_aspect_ratio)
        ? payload.cover_image_aspect_ratio
        : []
    for (const item of ratios) {
      const rec = asRecord(item)
      const img = pick(rec?.image)
      if (img) return img
    }
    return null
  }

  if (channel === 'luma') {
    const event = asRecord(payload.event) || payload
    return pick(event.cover_url, payload.cover_url)
  }

  if (channel === 'eventbrite') {
    const logo = asRecord(payload.logo)
    const original = asRecord(logo?.original)
    return pick(original?.url, logo?.url, payload.cover_url)
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
  const fromPayload = datesFromPayload(channel, payload)
  return {
    startAt: pickIso(stored?.start_at) || fromPayload.startAt,
    endAt: pickIso(stored?.end_at) || fromPayload.endAt,
    coverUrl: (stored?.cover_url?.trim() || coverFromPayload(channel, payload)) || null,
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

function storedRowToBooking(b: Awaited<ReturnType<typeof listAllStoredBookings>>[number]): BookingListItem {
  return mapStoredBookingToListItem({
    external_id: b.external_id,
    channel: b.channel,
    event_title: b.event_title,
    event_external_id: b.event_external_id,
    guest_name: b.guest_name,
    guest_email: b.guest_email,
    registered_at: b.registered_at,
    status: b.status,
    ticket_count: b.ticket_count,
    payload: b.payload,
  })
}

function bookingsFromEventRows(
  rows: EventBookingRow[],
  allBookings: Awaited<ReturnType<typeof listAllStoredBookings>>,
): BookingListItem[] {
  return rows.map((row) => {
    const email = row.guest_email.toLowerCase().trim()
    const stored = allBookings.find((b) => {
      if (row.booking_external_id && b.external_id === row.booking_external_id) return true
      return (
        b.guest_email.toLowerCase().trim() === email
        && b.channel === row.channel
        && (b.registered_at === row.registered_at || !row.registered_at)
      )
    })
    if (stored) return storedRowToBooking(stored)
    return mapStoredBookingToListItem({
      external_id: row.booking_external_id || `${row.channel}-${email}-${row.registered_at}`,
      channel: row.channel,
      event_title: row.event_title || '',
      event_external_id: row.event_external_id,
      guest_name: row.guest_name,
      guest_email: row.guest_email,
      registered_at: row.registered_at,
      status: null,
      ticket_count: row.ticket_count ?? null,
    })
  })
}

async function pullLumaGuestsLive(
  eventId: string,
  title: string,
  persist: boolean,
): Promise<EventBookingRow[]> {
  let live = await fetchLumaGuestsForEvent(eventId, title)

  if (!live.length) {
    const events = await listStoredEvents('luma')
    for (const ev of events) {
      if (ev.external_id === eventId) continue
      if (!titlesMatch(ev.title, title)) continue
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
    event_external_id: g.eventExternalId || eventId,
    event_title: title,
    booking_external_id: g.id,
  }))
}

async function pullEventbriteGuestsLive(
  eventId: string,
  title: string,
  persist: boolean,
): Promise<EventBookingRow[]> {
  const live = await fetchEbBookingList([{ id: eventId, name: title }])
  if (!live.length) return []

  if (persist) {
    try {
      await syncStoredBookings('eventbrite', live.map((g) => ({
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
    channel: 'eventbrite' as const,
    registered_at: g.registeredAt,
    ticket_count: g.ticketCount ?? 1,
    event_external_id: g.eventExternalId || eventId,
    event_title: title,
    booking_external_id: g.id,
  }))
}

async function pullHightribeGuestsLive(
  eventId: string,
  title: string,
): Promise<EventBookingRow[]> {
  try {
    const all = await fetchHightribeBookingsList()
    const id = String(eventId)
    return all
      .filter((g) => {
        if (g.eventExternalId && String(g.eventExternalId) === id) return true
        return titlesMatch(g.eventTitle, title)
      })
      .map((g) => ({
        guest_email: g.email,
        guest_name: g.name,
        channel: 'hightribe' as const,
        registered_at: g.registeredAt,
        ticket_count: g.ticketCount ?? 1,
        event_external_id: g.eventExternalId || eventId,
        event_title: g.eventTitle || title,
        booking_external_id: g.id,
      }))
  } catch {
    return []
  }
}

/** Always live-pull guests for every discovered channel id (force sync on page load). */
async function pullLiveBookingsForPublished(
  published: { channels: ChannelKey[]; channelIds: Partial<Record<ChannelKey, string>> },
  title: string,
): Promise<EventBookingRow[]> {
  const jobs: Array<Promise<EventBookingRow[]>> = []

  const lumaId = published.channelIds.luma
  if (lumaId) jobs.push(pullLumaGuestsLive(lumaId, title, true))

  const ebId = published.channelIds.eventbrite
  if (ebId) jobs.push(pullEventbriteGuestsLive(ebId, title, true))

  const htId = published.channelIds.hightribe
  if (htId) jobs.push(pullHightribeGuestsLive(htId, title))

  if (!jobs.length) return []
  const chunks = await Promise.all(jobs)
  return chunks.flat()
}

export async function loadEventDashboardData(
  channel: ChannelKey,
  eventId: string,
  opts?: { refresh?: boolean },
): Promise<EventDashboardData> {
  const [stored, master, allBookings] = await Promise.all([
    getStoredEvent(channel, eventId),
    fetchMasterEvent(channel, eventId),
    listAllStoredBookings(),
  ])

  const title = master?.title || stored?.title || 'Untitled event'
  const meta = extractEventMeta(channel, stored)
  const published = await resolvePublishedChannels(channel, eventId, title, master, allBookings)
  const masterAttendees = normalizeAttendees(master?.attendees || [], channel)

  // Synced bookings for this event (by linked id OR title) + registry + live pull.
  let eventBookings = dedupeBookingRows([
    ...collectPublishedBookings(allBookings, published, title),
    ...attendeesToBookingRows(masterAttendees),
  ])

  const live = await pullLiveBookingsForPublished(published, title)
  if (live.length) {
    eventBookings = dedupeBookingRows([...eventBookings, ...live])
  }

  const bookingChannels = new Set(eventBookings.map((b) => b.channel))
  const channels = CHANNEL_KEYS.filter(
    (ch) => published.channelIds[ch] != null || bookingChannels.has(ch),
  )
  const channelIds = { ...published.channelIds }
  for (const b of eventBookings) {
    if (!channelIds[b.channel] && b.event_external_id) {
      channelIds[b.channel] = String(b.event_external_id)
    }
  }

  let coverUrl = meta.coverUrl
  if (!coverUrl) {
    coverUrl = await resolveCoverFromLinkedChannels(channel, channelIds)
  }

  let startAt = meta.startAt || pickIso(master?.startAt) || null
  let endAt = meta.endAt || pickIso(master?.endAt) || null
  if (!startAt || !endAt) {
    const linked = await resolveDatesFromLinkedChannels(channel, channelIds)
    startAt = startAt || linked.startAt
    endAt = endAt || linked.endAt
  }

  const attendees = bookingsToAttendees(eventBookings)
  const registrations = eventBookings.reduce((sum, b) => sum + (b.ticket_count || 1), 0)
  const ticketTypes = extractTicketTypes(channel, stored, registrations)
  const pricing = extractPricing(channel, stored, ticketTypes)
  const capacity = master?.capacity || pricing.capacityHint || DEFAULT_CAPACITY
  const metrics = formatDashboardMetrics(capacity, registrations, pricing)
  const displayChannels = channels.length ? channels : [channel]
  const ticketsByChannel = ticketCountsByChannel(eventBookings)
  const channelCounts = {
    ...emptyChannelCounts(displayChannels),
    ...ticketsByChannel,
  }
  const channelRevenue = revenueByChannel(
    {
      ...emptyChannelCounts(displayChannels),
      ...ticketsByChannel,
    },
    displayChannels,
    pricing,
  )

  return {
    title,
    capacity,
    attendees,
    bookings: bookingsFromEventRows(eventBookings, allBookings),
    channels: displayChannels,
    channelIds,
    channelCounts,
    channelRevenue,
    registrations,
    uniqueAttendees: uniqueEmailCount(attendees),
    masterId: master?.id || null,
    ticketPrice: pricing.ticketPrice,
    currency: pricing.currency,
    isFree: pricing.isFree,
    hasPricing: pricing.hasPricing,
    revenue: metrics.revenue,
    ticketsSoldPct: metrics.ticketsSoldPct,
    ticketTypes,
    startAt,
    endAt,
    coverUrl,
    venue: meta.venue,
    status: meta.status,
    eventUrl: meta.eventUrl,
    primaryChannel: channel,
  }
}

/** When the primary row has no cover, try linked channel copies (HT cover_image, etc.). */
async function resolveCoverFromLinkedChannels(
  primary: ChannelKey,
  channelIds: Partial<Record<ChannelKey, string>>,
): Promise<string | null> {
  // Prefer Hightribe — that's where cover_image usually lives for cast events.
  const order: ChannelKey[] = ['hightribe', 'luma', 'eventbrite'].filter(
    (ch) => ch !== primary && channelIds[ch],
  ) as ChannelKey[]

  for (const ch of order) {
    const id = channelIds[ch]
    if (!id) continue
    try {
      const row = await getStoredEvent(ch, id)
      if (!row) continue
      const url = row.cover_url?.trim() || coverFromPayload(ch, asRecord(row.payload) || {})
      if (url) return url
    } catch {
      // best-effort
    }
  }
  return null
}

/** When the primary row has no start/end, try linked channel copies. */
async function resolveDatesFromLinkedChannels(
  primary: ChannelKey,
  channelIds: Partial<Record<ChannelKey, string>>,
): Promise<{ startAt: string | null; endAt: string | null }> {
  const order: ChannelKey[] = ['hightribe', 'luma', 'eventbrite'].filter(
    (ch) => ch !== primary && channelIds[ch],
  ) as ChannelKey[]

  let startAt: string | null = null
  let endAt: string | null = null

  for (const ch of order) {
    if (startAt && endAt) break
    const id = channelIds[ch]
    if (!id) continue
    try {
      const row = await getStoredEvent(ch, id)
      if (!row) continue
      const fromPayload = datesFromPayload(ch, asRecord(row.payload) || {})
      startAt = startAt || pickIso(row.start_at) || fromPayload.startAt
      endAt = endAt || pickIso(row.end_at) || fromPayload.endAt
    } catch {
      // best-effort
    }
  }

  return { startAt, endAt }
}
