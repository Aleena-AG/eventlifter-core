'use client'

import { authHeader, getUser } from '@/lib/auth'
import { channelFetch } from '@/lib/channel-fetch'
import { fetchHtBookingsPage } from '@/lib/hightribe-events'
import { lumaHostedEventRef } from '@/lib/luma-event-utils'
import type { ChannelKey } from '@/lib/types'

export interface BookingTicket {
  name: string
  quantity: number
  unitPrice?: string
  color?: string
}

export interface BookingListItem {
  id: string
  bookingId?: number
  name: string
  email: string
  phone?: string
  channel: ChannelKey
  eventTitle: string
  eventExternalId?: string
  registeredAt: string
  eventStart?: string
  eventEnd?: string
  status?: string
  paymentStatus?: string
  bookingType?: string
  ticketCount?: number
  tickets?: BookingTicket[]
  totalPrice?: number
  currency?: string
  notes?: string
  source: 'webhook' | 'api'
  raw?: Record<string, unknown>
}

function optStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : ''
  return s || undefined
}

function bookingsFromRegistry(events: Array<{
  title?: string
  attendees?: Array<{ source: ChannelKey; email: string; name?: string; registeredAt?: string }>
}>): BookingListItem[] {
  const list: BookingListItem[] = []
  for (const m of events) {
    for (const a of m.attendees || []) {
      list.push({
        id: `webhook-${a.email}-${a.registeredAt || m.title}`,
        name: a.name || a.email.split('@')[0] || 'Guest',
        email: a.email,
        channel: a.source,
        eventTitle: m.title || 'Untitled',
        registeredAt: a.registeredAt || new Date().toISOString(),
        source: 'webhook',
      })
    }
  }
  return list
}

function parseHtTickets(raw: unknown): BookingTicket[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const tickets: BookingTicket[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const row = t as Record<string, unknown>
    const name = optStr(row.ticket_name)
    if (!name) continue
    tickets.push({
      name,
      quantity: typeof row.quantity === 'number' ? row.quantity : 1,
      unitPrice: optStr(row.unit_price),
      color: optStr(row.color),
    })
  }
  return tickets.length ? tickets : undefined
}

function eventDateFromHt(raw: Record<string, unknown>): { start?: string; end?: string } {
  const bed = raw.booked_event_date as Record<string, unknown> | undefined
  if (!bed) return {}
  const startDate = optStr(bed.start_date) || optStr(raw.start)
  const endDate = optStr(bed.end_date) || optStr(raw.end)
  const startTime = optStr(bed.start_time)
  const endTime = optStr(bed.end_time)
  return {
    start: startDate ? (startTime ? `${startDate}T${startTime}` : startDate) : undefined,
    end: endDate ? (endTime ? `${endDate}T${endTime}` : endDate) : undefined,
  }
}

function normalizeHtBooking(raw: Record<string, unknown>): BookingListItem {
  const user = raw.user as Record<string, unknown> | undefined
  const phone = optStr(raw.phone)
  const email = optStr(user?.email) || optStr(raw.email) || phone || '—'
  const registeredAt = String(raw.booking_date || raw.created_at || new Date().toISOString())
  const { start, end } = eventDateFromHt(raw)
  return {
    id: `ht-${raw.id ?? registeredAt}`,
    bookingId: typeof raw.booking_id === 'number' ? raw.booking_id : undefined,
    name: String(raw.guest_name || user?.name || 'Guest'),
    email,
    phone,
    channel: 'hightribe',
    eventTitle: String(raw.title || 'Event'),
    eventExternalId: optStr(raw.event_id),
    registeredAt,
    eventStart: start,
    eventEnd: end,
    status: raw.status ? String(raw.status) : undefined,
    paymentStatus: raw.payment_status ? String(raw.payment_status) : undefined,
    bookingType: raw.booking_type ? String(raw.booking_type) : undefined,
    ticketCount: typeof raw.ticket_count === 'number' ? raw.ticket_count : undefined,
    tickets: parseHtTickets(raw.tickets),
    totalPrice: typeof raw.total_price === 'number' ? raw.total_price : undefined,
    currency: optStr(raw.currency),
    notes: optStr(raw.notes),
    source: 'api',
    raw,
  }
}

function normalizeEbAttendee(
  raw: Record<string, unknown>,
  eventTitle: string,
): BookingListItem | null {
  const profile = raw.profile as Record<string, unknown> | undefined
  const email = optStr(profile?.email) || optStr(raw.email)
  if (!email) return null
  const first = optStr(profile?.first_name)
  const last = optStr(profile?.last_name)
  const name = optStr(profile?.name) || [first, last].filter(Boolean).join(' ') || email.split('@')[0] || 'Guest'
  const registeredAt = String(raw.created || raw.changed || new Date().toISOString())
  const costs = raw.costs as Record<string, unknown> | undefined
  const gross = costs?.gross as Record<string, unknown> | undefined
  const totalPrice = gross?.major_value != null ? parseFloat(String(gross.major_value)) : undefined
  const currency = optStr(gross?.currency)
  const ticketCount = typeof raw.quantity === 'number' ? raw.quantity : undefined
  return {
    id: `eb-${raw.id ?? email}-${registeredAt}`,
    name,
    email,
    phone: optStr(profile?.cell_phone) || optStr(profile?.phone),
    channel: 'eventbrite',
    eventTitle,
    eventExternalId: optStr(raw.event_id),
    registeredAt,
    status: optStr(raw.status),
    ticketCount,
    totalPrice: Number.isFinite(totalPrice) ? totalPrice : undefined,
    currency,
    source: 'api',
    raw,
  }
}

function normalizeLumaGuest(
  raw: Record<string, unknown>,
  eventTitle: string,
  eventExternalId: string,
): BookingListItem | null {
  const guest = (raw.guest || raw.user) as Record<string, unknown> | undefined
  const email = optStr(guest?.email) || optStr(raw.email) || optStr(raw.user_email)
  if (!email) return null
  const name = optStr(guest?.name) || optStr(raw.name) || optStr(raw.user_name) || email.split('@')[0] || 'Guest'
  const registeredAt = String(
    raw.registered_at || raw.created_at || raw.approval_status_at || new Date().toISOString(),
  )
  const ticketType = raw.ticket_type as Record<string, unknown> | undefined
  const payment = raw.payment as Record<string, unknown> | undefined
  const ticketName = optStr(ticketType?.name) || optStr(ticketType?.label)
  return {
    id: `luma-${raw.api_id || raw.id || email}-${registeredAt}`,
    name,
    email,
    phone: optStr(guest?.phone_number) || optStr(raw.phone),
    channel: 'luma',
    eventTitle,
    eventExternalId,
    registeredAt,
    status: optStr(raw.approval_status) || optStr(raw.registration_status),
    paymentStatus: optStr(payment?.status),
    ticketCount: 1,
    tickets: ticketName ? [{ name: ticketName, quantity: 1 }] : undefined,
    source: 'api',
    raw,
  }
}

function dedupeBookings(items: BookingListItem[]): BookingListItem[] {
  const seen = new Set<string>()
  const out: BookingListItem[] = []
  for (const b of items) {
    const key = `${b.email.toLowerCase()}|${b.eventTitle.toLowerCase()}|${b.channel}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(b)
  }
  return out
}

export async function fetchHightribeBookingsList(): Promise<BookingListItem[]> {
  const list: BookingListItem[] = []
  let page = 1
  let lastPage = 1

  while (page <= lastPage && page <= 20) {
    const res = await fetchHtBookingsPage(page, 50)
    for (const raw of res.bookings) {
      if (raw && typeof raw === 'object') {
        list.push(normalizeHtBooking(raw as Record<string, unknown>))
      }
    }
    lastPage = res.lastPage
    page++
  }

  return list
}

export async function fetchEbBookingList(
  events: Array<{ id: string; name?: { text?: string } | string }>,
): Promise<BookingListItem[]> {
  const list: BookingListItem[] = []
  const concurrency = 2

  for (let i = 0; i < events.length; i += concurrency) {
    const chunk = events.slice(i, i + concurrency)
    await Promise.all(chunk.map(async (e) => {
      const eventTitle = typeof e.name === 'string' ? e.name : (e.name?.text || 'Untitled')
      try {
        let page = 1
        let hasMore = true
        while (hasMore && page <= 5) {
          const res = await channelFetch(
            `/api/eventbrite/events/${e.id}/attendees?status=attending&page=${page}&page_size=50`,
          )
          if (!res.ok) break
          const data = await res.json() as {
            attendees?: Array<Record<string, unknown>>
            pagination?: { has_more_items?: boolean }
          }
          for (const raw of data.attendees || []) {
            const item = normalizeEbAttendee(raw, eventTitle)
            if (item) list.push(item)
          }
          hasMore = !!data.pagination?.has_more_items
          page++
        }
      } catch {
        // skip event
      }
    }))
    if (i + concurrency < events.length) {
      await new Promise((resolve) => setTimeout(resolve, 120))
    }
  }

  return list
}

export async function fetchLumaGuestsForEvent(
  eventId: string,
  eventTitle: string,
): Promise<BookingListItem[]> {
  try {
    const res = await channelFetch(`/api/luma/guests?event_id=${encodeURIComponent(eventId)}`)
    if (!res.ok) return []
    const raw = await res.json() as {
      data?: { entries?: Array<Record<string, unknown>> }
      entries?: Array<Record<string, unknown>>
      status?: string
    }
    if (raw.status === 'error') return []
    const d = raw.data || raw
    const entries = d.entries || raw.entries || []
    const list: BookingListItem[] = []
    for (const entry of entries) {
      const item = normalizeLumaGuest(entry, eventTitle, eventId)
      if (item) list.push(item)
    }
    return list
  } catch {
    return []
  }
}

export async function fetchLumaBookingList(
  events: Array<{ api_id: string; name: string }>,
): Promise<BookingListItem[]> {
  const list: BookingListItem[] = []
  const concurrency = 3

  for (let i = 0; i < events.length; i += concurrency) {
    const chunk = events.slice(i, i + concurrency)
    await Promise.all(chunk.map(async (e) => {
      try {
        const res = await channelFetch(`/api/luma/guests?event_id=${encodeURIComponent(e.api_id)}`)
        if (!res.ok) return
        const raw = await res.json() as {
          data?: { entries?: Array<Record<string, unknown>> }
          entries?: Array<Record<string, unknown>>
        }
        const d = raw.data || raw
        const entries = d.entries || raw.entries || []
        for (const entry of entries) {
          const item = normalizeLumaGuest(entry, e.name, e.api_id)
          if (item) list.push(item)
        }
      } catch {
        // skip event
      }
    }))
  }

  return list
}

export async function fetchEbEventsForSync(): Promise<Array<{ id: string; name?: { text?: string } }>> {
  const orgRes = await channelFetch('/api/eventbrite/users/me/organizations')
  if (!orgRes.ok) return []
  const orgData = await orgRes.json() as { organizations?: Array<{ id: string }> }
  const orgId = orgData.organizations?.[0]?.id
  if (!orgId) return []
  const evtRes = await channelFetch(`/api/eventbrite/organizations/${orgId}/events?page_size=50`)
  if (!evtRes.ok) return []
  const evtData = await evtRes.json() as { events?: Array<{ id: string; name?: { text?: string } }> }
  return evtData.events || []
}

export async function fetchLumaEventsForSync(): Promise<Array<{ api_id: string; name: string }>> {
  const res = await channelFetch('/api/luma/events/hosted?upcoming_only=false&fetch_all=true')
  if (!res.ok) return []
  const raw = await res.json() as { data?: { entries?: unknown[] }; entries?: unknown[] }
  const entries = raw.data?.entries || raw.entries || []
  return entries.map((entry: unknown) => {
    const ref = lumaHostedEventRef(entry)
    return { api_id: ref.id, name: ref.name }
  }).filter(ev => ev.api_id)
}

export interface StoredBookingRow {
  external_id: string
  channel: ChannelKey
  event_title: string
  event_external_id?: string | null
  guest_name: string
  guest_email: string
  registered_at: string
  status: string | null
  ticket_count: number | null
  payload?: Record<string, unknown>
}

export function mapStoredBookingToListItem(b: StoredBookingRow): BookingListItem {
  const payload = b.payload || {}
  const channel = b.channel

  if (channel === 'hightribe' && Object.keys(payload).length > 0) {
    const item = normalizeHtBooking({ ...payload, title: payload.title || b.event_title })
    return { ...item, id: b.external_id || item.id }
  }
  if (channel === 'eventbrite' && (payload.profile || payload.id)) {
    const item = normalizeEbAttendee(payload, b.event_title)
    if (item) {
      return {
        ...item,
        id: b.external_id || item.id,
        eventExternalId: b.event_external_id || item.eventExternalId,
      }
    }
  }
  if (channel === 'luma' && Object.keys(payload).length > 0) {
    const item = normalizeLumaGuest(payload, b.event_title, b.event_external_id || '')
    if (item) return { ...item, id: b.external_id || item.id }
  }

  return {
    id: b.external_id,
    name: b.guest_name,
    email: b.guest_email,
    channel,
    eventTitle: b.event_title,
    eventExternalId: b.event_external_id || undefined,
    registeredAt: b.registered_at,
    status: b.status || undefined,
    ticketCount: b.ticket_count ?? undefined,
    source: b.external_id.startsWith('wh:') ? 'webhook' : 'api',
    raw: Object.keys(payload).length ? payload : undefined,
  }
}

export function bookingToStoredPayload(b: BookingListItem): Record<string, unknown> {
  if (b.raw && Object.keys(b.raw).length > 0) return b.raw
  return {
    id: b.id,
    email: b.email,
    name: b.name,
    guest_name: b.name,
    guest_email: b.email,
    phone: b.phone,
    event_title: b.eventTitle,
    event_external_id: b.eventExternalId,
    registered_at: b.registeredAt,
    event_start: b.eventStart,
    event_end: b.eventEnd,
    status: b.status,
    payment_status: b.paymentStatus,
    booking_type: b.bookingType,
    ticket_count: b.ticketCount,
    tickets: b.tickets,
    total_price: b.totalPrice,
    currency: b.currency,
    notes: b.notes,
    booking_id: b.bookingId,
  }
}

export async function loadAllBookings(): Promise<BookingListItem[]> {
  const res = await fetch('/api/events/bookings', {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  })
  if (!res.ok) return []
  const data = await res.json() as {
    bookings?: Array<StoredBookingRow & { payload?: Record<string, unknown> }>
  }

  const list = (data.bookings || []).map((b) => mapStoredBookingToListItem({
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
  }))

  list.sort((a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime())
  return list
}
