import type { ChannelKey } from '@/lib/types'
import type { StoredBooking } from '@/lib/db/bookings-store'

function optStr(v: unknown): string | undefined {
  const s = v != null ? String(v).trim() : ''
  return s || undefined
}

export function normalizeHtBooking(raw: Record<string, unknown>): StoredBooking {
  const user = raw.user as Record<string, unknown> | undefined
  const email = String(user?.email || raw.email || raw.phone || '—')
  const registeredAt = String(raw.booking_date || raw.created_at || new Date().toISOString())
  return {
    id: `ht-${raw.id ?? registeredAt}`,
    name: String(raw.guest_name || user?.name || 'Guest'),
    email,
    channel: 'hightribe',
    eventTitle: String(raw.title || 'Event'),
    eventExternalId: raw.event_id != null ? String(raw.event_id) : undefined,
    registeredAt,
    status: raw.status ? String(raw.status) : undefined,
    ticketCount: typeof raw.ticket_count === 'number' ? raw.ticket_count : undefined,
    source: 'api',
  }
}

export function normalizeEbAttendee(
  raw: Record<string, unknown>,
  eventTitle: string,
  eventId: string,
): StoredBooking | null {
  const profile = raw.profile as Record<string, unknown> | undefined
  const email = optStr(profile?.email) || optStr(raw.email)
  if (!email) return null
  const first = optStr(profile?.first_name)
  const last = optStr(profile?.last_name)
  const name = optStr(profile?.name) || [first, last].filter(Boolean).join(' ') || email.split('@')[0] || 'Guest'
  const registeredAt = String(raw.created || raw.changed || new Date().toISOString())
  return {
    id: `eb-${raw.id ?? email}-${registeredAt}`,
    name,
    email,
    channel: 'eventbrite',
    eventTitle,
    eventExternalId: eventId,
    registeredAt,
    status: optStr(raw.status),
    source: 'api',
  }
}

export function normalizeLumaGuest(
  raw: Record<string, unknown>,
  eventTitle: string,
  eventId: string,
): StoredBooking | null {
  const guest = (raw.guest || raw.user) as Record<string, unknown> | undefined
  const email = optStr(guest?.email) || optStr(raw.email) || optStr(raw.user_email)
  if (!email) return null
  const name = optStr(guest?.name) || optStr(raw.name) || optStr(raw.user_name) || email.split('@')[0] || 'Guest'
  const registeredAt = String(
    raw.registered_at || raw.created_at || raw.approval_status_at || new Date().toISOString(),
  )
  return {
    id: `luma-${raw.api_id || raw.id || email}-${registeredAt}`,
    name,
    email,
    channel: 'luma',
    eventTitle,
    eventExternalId: eventId,
    registeredAt,
    status: optStr(raw.approval_status) || optStr(raw.registration_status),
    source: 'api',
  }
}

export function ticketSoldFromRecord(t: Record<string, unknown>): number {
  for (const k of ['sold', 'sold_quantity', 'quantity_sold', 'booked']) {
    const n = Number(t[k])
    if (Number.isFinite(n) && n >= 0) return n
  }
  const qty = Number(t.quantity)
  const avail = Number(t.available ?? t.remaining ?? t.quantity_available)
  if (Number.isFinite(qty) && Number.isFinite(avail) && qty >= avail) return qty - avail
  return 0
}

export type { ChannelKey }
