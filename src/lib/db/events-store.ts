import type { ChannelKey } from '@/lib/types'
import { getDb } from '@/lib/db/index'

export interface CachedChannelEvent {
  channel: ChannelKey
  externalId: string
  title: string
  startUtc?: string
  priceLabel?: string
  payload?: unknown
}

export function replaceChannelEvents(channel: ChannelKey, events: CachedChannelEvent[]) {
  const db = getDb()
  const now = new Date().toISOString()
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM channel_events WHERE channel = ?').run(channel)
    const insert = db.prepare(`
      INSERT INTO channel_events (channel, external_id, title, start_utc, price_label, payload, synced_at)
      VALUES (@channel, @external_id, @title, @start_utc, @price_label, @payload, @synced_at)
    `)
    for (const e of events) {
      insert.run({
        channel,
        external_id: e.externalId,
        title: e.title,
        start_utc: e.startUtc || null,
        price_label: e.priceLabel || null,
        payload: e.payload ? JSON.stringify(e.payload) : null,
        synced_at: now,
      })
    }
  })
  tx()
}

export function listChannelEvents(channel: ChannelKey, limit = 100): CachedChannelEvent[] {
  const rows = getDb().prepare(`
    SELECT external_id, title, start_utc, price_label, payload
    FROM channel_events WHERE channel = ?
    ORDER BY start_utc DESC
    LIMIT ?
  `).all(channel, limit) as Array<{
    external_id: string; title: string; start_utc: string | null
    price_label: string | null; payload: string | null
  }>

  return rows.map(r => ({
    channel,
    externalId: r.external_id,
    title: r.title,
    startUtc: r.start_utc || undefined,
    priceLabel: r.price_label || undefined,
    payload: r.payload ? JSON.parse(r.payload) : undefined,
  }))
}

export function setChannelStats(
  channel: ChannelKey,
  stats: { events: number; tickets: number; bookings: number },
) {
  const now = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO channel_stats (channel, events_count, tickets_sold, bookings_count, synced_at)
    VALUES (@channel, @events, @tickets, @bookings, @synced_at)
    ON CONFLICT(channel) DO UPDATE SET
      events_count = excluded.events_count,
      tickets_sold = excluded.tickets_sold,
      bookings_count = excluded.bookings_count,
      synced_at = excluded.synced_at
  `).run({
    channel,
    events: stats.events,
    tickets: stats.tickets,
    bookings: stats.bookings,
    synced_at: now,
  })
}

export function getChannelStats(channel: ChannelKey) {
  return getDb().prepare('SELECT * FROM channel_stats WHERE channel = ?').get(channel) as {
    events_count: number; tickets_sold: number; bookings_count: number; synced_at: string
  } | undefined
}

export function getAllChannelStats(): Partial<Record<ChannelKey, { events: number; tickets: number; bookings: number; syncedAt: string }>> {
  const rows = getDb().prepare('SELECT * FROM channel_stats').all() as Array<{
    channel: ChannelKey; events_count: number; tickets_sold: number; bookings_count: number; synced_at: string
  }>
  const out: Partial<Record<ChannelKey, { events: number; tickets: number; bookings: number; syncedAt: string }>> = {}
  for (const r of rows) {
    out[r.channel] = {
      events: r.events_count,
      tickets: r.tickets_sold,
      bookings: r.bookings_count,
      syncedAt: r.synced_at,
    }
  }
  return out
}
