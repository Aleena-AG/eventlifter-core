import type { ChannelKey } from '@/lib/types'
import { getDb } from '@/lib/db/index'

export interface StoredBooking {
  id: string
  name: string
  email: string
  channel: ChannelKey
  eventTitle: string
  eventExternalId?: string
  registeredAt: string
  status?: string
  ticketCount?: number
  source: 'webhook' | 'api'
}

export function upsertBooking(booking: StoredBooking) {
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO bookings (id, channel, name, email, event_title, event_external_id, registered_at, status, ticket_count, source, updated_at)
    VALUES (@id, @channel, @name, @email, @event_title, @event_external_id, @registered_at, @status, @ticket_count, @source, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      event_title = excluded.event_title,
      registered_at = excluded.registered_at,
      status = excluded.status,
      ticket_count = excluded.ticket_count,
      source = CASE WHEN bookings.source = 'webhook' THEN 'webhook' ELSE excluded.source END,
      updated_at = excluded.updated_at
  `).run({
    id: booking.id,
    channel: booking.channel,
    name: booking.name,
    email: booking.email,
    event_title: booking.eventTitle,
    event_external_id: booking.eventExternalId || null,
    registered_at: booking.registeredAt,
    status: booking.status || null,
    ticket_count: booking.ticketCount ?? null,
    source: booking.source,
    updated_at: now,
  })
}

export function upsertWebhookBooking(input: {
  channel: ChannelKey
  email: string
  name: string
  eventTitle: string
  eventExternalId?: string
  registeredAt?: string
}) {
  const email = input.email.toLowerCase().trim()
  const registeredAt = input.registeredAt || new Date().toISOString()
  upsertBooking({
    id: `webhook-${input.channel}-${email}-${input.eventExternalId || input.eventTitle}`,
    name: input.name,
    email,
    channel: input.channel,
    eventTitle: input.eventTitle,
    eventExternalId: input.eventExternalId,
    registeredAt,
    source: 'webhook',
  })
}

export function replaceApiBookings(channel: ChannelKey, bookings: StoredBooking[]) {
  const db = getDb()
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM bookings WHERE channel = ? AND source = 'api'`).run(channel)
    for (const b of bookings) {
      upsertBooking({ ...b, source: 'api' })
    }
  })
  tx()
}

export function listBookings(limit = 500): StoredBooking[] {
  const rows = getDb().prepare(`
    SELECT id, channel, name, email, event_title, event_external_id, registered_at, status, ticket_count, source
    FROM bookings
    ORDER BY registered_at DESC
    LIMIT ?
  `).all(limit) as Array<{
    id: string; channel: ChannelKey; name: string; email: string
    event_title: string; event_external_id: string | null; registered_at: string
    status: string | null; ticket_count: number | null; source: 'webhook' | 'api'
  }>

  return rows.map(r => ({
    id: r.id,
    name: r.name,
    email: r.email,
    channel: r.channel,
    eventTitle: r.event_title,
    eventExternalId: r.event_external_id || undefined,
    registeredAt: r.registered_at,
    status: r.status || undefined,
    ticketCount: r.ticket_count ?? undefined,
    source: r.source,
  }))
}

export function syncRegistryAttendeesToBookings() {
  const masters = getDb().prepare('SELECT id, title FROM master_events').all() as Array<{ id: string; title: string }>
  for (const m of masters) {
    const attendees = getDb().prepare(`
      SELECT email, name, source, registered_at FROM attendees WHERE master_id = ?
    `).all(m.id) as Array<{ email: string; name: string; source: ChannelKey; registered_at: string }>

    for (const a of attendees) {
      upsertWebhookBooking({
        channel: a.source,
        email: a.email,
        name: a.name,
        eventTitle: m.title,
        registeredAt: a.registered_at,
      })
    }
  }
}

export function countBookingsByChannel(): Record<ChannelKey, number> {
  const rows = getDb().prepare(`
    SELECT channel, COUNT(*) AS c FROM bookings GROUP BY channel
  `).all() as Array<{ channel: ChannelKey; c: number }>
  const out: Record<ChannelKey, number> = { hightribe: 0, luma: 0, eventbrite: 0 }
  for (const r of rows) out[r.channel] = r.c
  return out
}

export function countUniqueEmails(): number {
  const row = getDb().prepare('SELECT COUNT(DISTINCT lower(email)) AS c FROM bookings').get() as { c: number }
  return row.c
}
