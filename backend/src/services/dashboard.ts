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

export interface DashboardEventItem {
  id: string
  title: string
  startUtc: string
  endUtc: string | null
  coverUrl: string | null
  status: string | null
  channel: ChannelName
  priceLabel: string
}

export interface DashboardBookingTrendPoint {
  date: string
  count: number
}

export interface DashboardStatsPayload {
  channels: Record<ChannelName, DashboardChannelStats>
  totalEvents: number
  totalBookings: number
  totalTickets: number
  unifiedAttendees: number
  recent: DashboardEventItem[]
  recentBookings: Array<{
    name: string
    email: string
    channel: ChannelName
    eventTitle: string
    registeredAt: string
  }>
  bookingTrend: DashboardBookingTrendPoint[]
}

const CHANNELS: ChannelName[] = ['hightribe', 'luma', 'eventbrite']

const EVENT_TABLE: Record<ChannelName, string> = {
  hightribe: 'hightribe_events',
  luma: 'luma_events',
  eventbrite: 'eventbrite_events',
}

function priceLabelFor(channel: ChannelName, isFree: unknown): string {
  if (channel === 'hightribe') return 'Hightribe'
  if (channel === 'luma') return 'Luma'
  return isFree ? 'Free' : 'Eventbrite'
}

function mapEventRow(row: {
  external_id: string
  title: string | null
  start_at: string | Date | null
  end_at?: string | Date | null
  cover_url?: string | null
  status?: string | null
  channel: ChannelName
  is_free?: unknown
}): DashboardEventItem {
  return {
    id: String(row.external_id),
    title: String(row.title || 'Untitled'),
    startUtc: row.start_at
      ? new Date(row.start_at as Date).toISOString()
      : new Date().toISOString(),
    endUtc: row.end_at ? new Date(row.end_at as Date).toISOString() : null,
    coverUrl: row.cover_url ? String(row.cover_url) : null,
    status: row.status ? String(row.status) : null,
    channel: row.channel,
    priceLabel: priceLabelFor(row.channel, row.is_free),
  }
}

function buildBookingTrend(
  bookings: Array<{ registered_at: string }>,
  days = 7,
): DashboardBookingTrendPoint[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const points: DashboardBookingTrendPoint[] = []
  const counts = new Map<string, number>()

  for (const b of bookings) {
    const d = new Date(b.registered_at)
    if (Number.isNaN(d.getTime())) continue
    d.setHours(0, 0, 0, 0)
    const key = d.toISOString().slice(0, 10)
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    points.push({ date: key, count: counts.get(key) || 0 })
  }
  return points
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
      localListEvents(ch, userId).map((row) =>
        mapEventRow({
          external_id: row.external_id,
          title: row.title,
          start_at: row.start_at,
          end_at: row.end_at,
          cover_url: row.cover_url,
          status: row.status,
          channel: ch,
          is_free: row.is_free,
        }),
      ),
    ).sort((a, b) => new Date(b.startUtc).getTime() - new Date(a.startUtc).getTime())

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
      bookingTrend: buildBookingTrend(bookingRows),
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
    `(SELECT external_id, title, start_at, end_at, cover_url, status, 'hightribe' AS channel, NULL AS is_free
      FROM hightribe_events WHERE user_id = ?)
     UNION ALL
     (SELECT external_id, title, start_at, end_at, cover_url, status, 'luma' AS channel, NULL AS is_free
      FROM luma_events WHERE user_id = ?)
     UNION ALL
     (SELECT external_id, title, start_at, end_at, cover_url, status, 'eventbrite' AS channel, is_free
      FROM eventbrite_events WHERE user_id = ?)
     ORDER BY start_at DESC
     LIMIT 60`,
    [userId, userId, userId],
  )

  const recent = recentEventRows.map((row) =>
    mapEventRow({
      external_id: String(row.external_id),
      title: row.title as string | null,
      start_at: row.start_at as Date | null,
      end_at: row.end_at as Date | null,
      cover_url: row.cover_url as string | null,
      status: row.status as string | null,
      channel: row.channel as ChannelName,
      is_free: row.is_free,
    }),
  )

  let recentBookings: DashboardStatsPayload['recentBookings'] = []
  let bookingTrend: DashboardBookingTrendPoint[] = buildBookingTrend([])
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

    const trendRows = await query<RowDataPacket[]>(
      `SELECT DATE(registered_at) AS day, COUNT(*) AS cnt
       FROM channel_bookings
       WHERE user_id = ?
         AND registered_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(registered_at)
       ORDER BY day ASC`,
      [userId],
    )

    const countByDay = new Map<string, number>()
    for (const row of trendRows) {
      const day = row.day
        ? new Date(row.day as Date).toISOString().slice(0, 10)
        : ''
      if (day) countByDay.set(day, Number(row.cnt || 0))
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    bookingTrend = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const key = d.toISOString().slice(0, 10)
      bookingTrend.push({ date: key, count: countByDay.get(key) || 0 })
    }
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
    bookingTrend,
  }
}
