import type { RowDataPacket } from 'mysql2'
import { query } from '../db/pool'
import type { ChannelName } from './events'

export interface DashboardChannelStats {
  events: number
  bookings: number
  tickets: number
}

export interface DashboardStatsPayload {
  channels: Record<ChannelName, DashboardChannelStats>
  totalEvents: number
  totalBookings: number
  totalTickets: number
  unifiedAttendees: number
  recent: Array<{
    id: string
    title: string
    startUtc: string
    channel: ChannelName
    priceLabel: string
  }>
  recentBookings: Array<{
    name: string
    email: string
    channel: ChannelName
    eventTitle: string
    registeredAt: string
  }>
}

const CHANNELS: ChannelName[] = ['hightribe', 'luma', 'eventbrite']

const EVENT_TABLE: Record<ChannelName, string> = {
  hightribe: 'hightribe_events',
  luma: 'luma_events',
  eventbrite: 'eventbrite_events',
}

export async function getDashboardStatsForUser(userId: number): Promise<DashboardStatsPayload> {
  const channels: Record<ChannelName, DashboardChannelStats> = {
    hightribe: { events: 0, bookings: 0, tickets: 0 },
    luma: { events: 0, bookings: 0, tickets: 0 },
    eventbrite: { events: 0, bookings: 0, tickets: 0 },
  }

  const eventCounts = await Promise.all(
    CHANNELS.map(async (ch) => {
      const table = EVENT_TABLE[ch]
      const rows = await query<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM ${table} WHERE user_id = ?`,
        [userId],
      )
      return { ch, cnt: Number(rows[0]?.cnt || 0) }
    }),
  )
  for (const { ch, cnt } of eventCounts) {
    channels[ch].events = cnt
  }

  const bookingRows = await query<RowDataPacket[]>(
    `SELECT channel,
            COUNT(*) AS bookings,
            COALESCE(SUM(COALESCE(ticket_count, 1)), 0) AS tickets
     FROM channel_bookings
     WHERE user_id = ?
     GROUP BY channel`,
    [userId],
  )
  for (const row of bookingRows) {
    const ch = row.channel as ChannelName
    if (!channels[ch]) continue
    channels[ch].bookings = Number(row.bookings || 0)
    channels[ch].tickets = Number(row.tickets || 0)
  }

  const uniqueRows = await query<RowDataPacket[]>(
    `SELECT COUNT(DISTINCT guest_email) AS cnt FROM channel_bookings WHERE user_id = ?`,
    [userId],
  )
  const unifiedAttendees = Number(uniqueRows[0]?.cnt || 0)

  const recentEventRows = await query<RowDataPacket[]>(
    `(SELECT external_id, title, start_at, 'hightribe' AS channel, NULL AS is_free
      FROM hightribe_events WHERE user_id = ?)
     UNION ALL
     (SELECT external_id, title, start_at, 'luma' AS channel, NULL AS is_free
      FROM luma_events WHERE user_id = ?)
     UNION ALL
     (SELECT external_id, title, start_at, 'eventbrite' AS channel, is_free
      FROM eventbrite_events WHERE user_id = ?)
     ORDER BY start_at DESC
     LIMIT 5`,
    [userId, userId, userId],
  )

  const recent = recentEventRows.map((row) => ({
    id: String(row.external_id),
    title: String(row.title || 'Untitled'),
    startUtc: row.start_at
      ? new Date(row.start_at as Date).toISOString()
      : new Date().toISOString(),
    channel: row.channel as ChannelName,
    priceLabel:
      row.channel === 'hightribe'
        ? 'Hightribe'
        : row.channel === 'luma'
          ? 'Luma'
          : row.is_free ? 'Free' : 'Eventbrite',
  }))

  const recentBookingRows = await query<RowDataPacket[]>(
    `SELECT channel, event_title, guest_name, guest_email, registered_at
     FROM channel_bookings
     WHERE user_id = ?
     ORDER BY registered_at DESC
     LIMIT 8`,
    [userId],
  )

  const recentBookings = recentBookingRows.map((row) => ({
    name: String(row.guest_name || ''),
    email: String(row.guest_email || ''),
    channel: row.channel as ChannelName,
    eventTitle: String(row.event_title || ''),
    registeredAt: row.registered_at
      ? new Date(row.registered_at as Date).toISOString()
      : new Date().toISOString(),
  }))

  const totalEvents = CHANNELS.reduce((sum, ch) => sum + channels[ch].events, 0)
  const totalBookings = CHANNELS.reduce((sum, ch) => sum + channels[ch].bookings, 0)
  const totalTickets = CHANNELS.reduce((sum, ch) => sum + channels[ch].tickets, 0)

  return {
    channels,
    totalEvents,
    totalBookings,
    totalTickets,
    unifiedAttendees,
    recent,
    recentBookings,
  }
}
