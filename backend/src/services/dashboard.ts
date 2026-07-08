import type { RowDataPacket } from 'mysql2'
import { useDatabase } from '../config'
import { query } from '../db/pool'
import { localListBookings, localListEvents } from '../db/local-store'
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

  if (!useDatabase()) {
    for (const ch of CHANNELS) {
      channels[ch].events = localListEvents(ch, userId).length
    }
    const bookingRows = localListBookings(userId)
    for (const row of bookingRows) {
      channels[row.channel].bookings += 1
      channels[row.channel].tickets += row.ticket_count ?? 1
    }
    const unifiedAttendees = new Set(bookingRows.map((b) => b.guest_email.toLowerCase())).size
    const recent = CHANNELS.flatMap((ch) =>
      localListEvents(ch, userId).slice(0, 5).map((row) => ({
        id: row.external_id,
        title: row.title || 'Untitled',
        startUtc: row.start_at || new Date().toISOString(),
        channel: ch,
        priceLabel: ch === 'eventbrite' ? (row.is_free ? 'Free' : 'Eventbrite') : ch === 'luma' ? 'Luma' : 'Hightribe',
      })),
    )
      .sort((a, b) => new Date(b.startUtc).getTime() - new Date(a.startUtc).getTime())
      .slice(0, 5)

    const recentBookings = bookingRows.slice(0, 8).map((row) => ({
      name: row.guest_name,
      email: row.guest_email,
      channel: row.channel,
      eventTitle: row.event_title,
      registeredAt: row.registered_at,
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

  let unifiedAttendees = 0
  try {
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
    unifiedAttendees = Number(uniqueRows[0]?.cnt || 0)
  } catch (err) {
    console.warn(
      '[getDashboardStatsForUser] channel_bookings unavailable:',
      err instanceof Error ? err.message : err,
    )
  }

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

  let recentBookings: DashboardStatsPayload['recentBookings'] = []
  try {
    const recentBookingRows = await query<RowDataPacket[]>(
      `SELECT channel, event_title, guest_name, guest_email, registered_at
       FROM channel_bookings
       WHERE user_id = ?
       ORDER BY registered_at DESC
       LIMIT 8`,
      [userId],
    )

    recentBookings = recentBookingRows.map((row) => ({
      name: String(row.guest_name || ''),
      email: String(row.guest_email || ''),
      channel: row.channel as ChannelName,
      eventTitle: String(row.event_title || ''),
      registeredAt: row.registered_at
        ? new Date(row.registered_at as Date).toISOString()
        : new Date().toISOString(),
    }))
  } catch (err) {
    console.warn(
      '[getDashboardStatsForUser] recent bookings unavailable:',
      err instanceof Error ? err.message : err,
    )
  }

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
