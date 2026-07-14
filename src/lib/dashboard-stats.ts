'use client'

import { authHeader } from '@/lib/auth'
import { isHightribeConnected } from '@/lib/channel-connection'
import { listStoredEvents } from '@/lib/channel-events-store'
import type { ChannelKey } from '@/lib/types'

export interface ChannelStats {
  events: number
  tickets: number
  bookings: number
  revenue: number
  currency: string
  configured: boolean
}

export interface DashboardBooking {
  name: string
  email: string
  channel: ChannelKey
  eventTitle: string
  registeredAt: string
}

export interface DashboardRecentEvent {
  id: string
  title: string
  startUtc: string
  endUtc?: string | null
  coverUrl?: string | null
  status?: string | null
  channel: ChannelKey
  priceLabel: string
}

export interface DashboardBookingTrendPoint {
  date: string
  count: number
  byChannel: Record<ChannelKey, number>
}

export interface DashboardStats {
  channels: Record<ChannelKey, ChannelStats>
  totalEvents: number
  totalTickets: number
  totalBookings: number
  totalRevenue: number
  revenueCurrency: string
  unifiedAttendees: number
  recent: DashboardRecentEvent[]
  recentBookings: DashboardBooking[]
  bookingTrend: DashboardBookingTrendPoint[]
}

function emptyChannelDayCounts(): Record<ChannelKey, number> {
  return { hightribe: 0, luma: 0, eventbrite: 0 }
}

function emptyTrend(days = 7): DashboardBookingTrendPoint[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const points: DashboardBookingTrendPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    points.push({
      date: d.toISOString().slice(0, 10),
      count: 0,
      byChannel: emptyChannelDayCounts(),
    })
  }
  return points
}

function normalizeTrend(
  points?: Array<{
    date: string
    count: number
    byChannel?: Partial<Record<ChannelKey, number>>
  }>,
): DashboardBookingTrendPoint[] {
  if (!points?.length) return emptyTrend()
  return points.map((p) => {
    const byChannel = {
      ...emptyChannelDayCounts(),
      ...(p.byChannel || {}),
    }
    const count =
      typeof p.count === 'number'
        ? p.count
        : byChannel.hightribe + byChannel.luma + byChannel.eventbrite
    return { date: p.date, count, byChannel }
  })
}

export async function loadDashboardStats(settings: {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean; oauthConfigured?: boolean }
  hightribe?: { configured?: boolean }
}): Promise<DashboardStats> {
  const lumaConfigured = settings.luma?.configured === true
  const ebConfigured = settings.eventbrite?.configured === true
  const htConfigured = isHightribeConnected(settings)

  const res = await fetch('/api/dashboard/stats', {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  })
  if (res.ok) {
    const data = await res.json() as {
      channels: Record<ChannelKey, {
        events: number
        bookings: number
        tickets: number
        revenue?: number
        currency?: string
      }>
      totalEvents: number
      totalBookings: number
      totalTickets: number
      totalRevenue?: number
      revenueCurrency?: string
      unifiedAttendees: number
      recent: DashboardRecentEvent[]
      recentBookings: DashboardBooking[]
      bookingTrend?: DashboardBookingTrendPoint[]
    }

    const withChannelDefaults = (ch: ChannelKey, configured: boolean): ChannelStats => ({
      events: data.channels[ch]?.events ?? 0,
      bookings: data.channels[ch]?.bookings ?? 0,
      tickets: data.channels[ch]?.tickets ?? 0,
      revenue: data.channels[ch]?.revenue ?? 0,
      currency: 'USD',
      configured,
    })

    return {
      channels: {
        hightribe: withChannelDefaults('hightribe', htConfigured),
        luma: withChannelDefaults('luma', lumaConfigured),
        eventbrite: withChannelDefaults('eventbrite', ebConfigured),
      },
      totalEvents: data.totalEvents,
      totalTickets: data.totalTickets,
      totalBookings: data.totalBookings,
      totalRevenue: data.totalRevenue ?? 0,
      revenueCurrency: 'USD',
      unifiedAttendees: data.unifiedAttendees,
      recent: data.recent,
      recentBookings: data.recentBookings,
      bookingTrend: normalizeTrend(data.bookingTrend),
    }
  }

  // Fallback: same event sources as the Events page so counts stay in sync.
  const [htRows, lumaRows, ebRows] = await Promise.all([
    htConfigured ? listStoredEvents('hightribe') : Promise.resolve([]),
    listStoredEvents('luma'),
    listStoredEvents('eventbrite'),
  ])

  const channels: Record<ChannelKey, ChannelStats> = {
    hightribe: {
      events: htRows.length,
      tickets: 0,
      bookings: 0,
      revenue: 0,
      currency: 'USD',
      configured: htConfigured,
    },
    luma: {
      events: lumaRows.length,
      tickets: 0,
      bookings: 0,
      revenue: 0,
      currency: 'USD',
      configured: lumaConfigured,
    },
    eventbrite: {
      events: ebRows.length,
      tickets: 0,
      bookings: 0,
      revenue: 0,
      currency: 'USD',
      configured: ebConfigured,
    },
  }

  const recent = [
    ...htRows.map((row) => ({ row, channel: 'hightribe' as const })),
    ...lumaRows.map((row) => ({ row, channel: 'luma' as const })),
    ...ebRows.map((row) => ({ row, channel: 'eventbrite' as const })),
  ]
    .sort((a, b) => {
      const aMs = a.row.start_at ? new Date(a.row.start_at).getTime() : 0
      const bMs = b.row.start_at ? new Date(b.row.start_at).getTime() : 0
      return bMs - aMs
    })
    .slice(0, 60)
    .map(({ row, channel }) => ({
      id: row.external_id,
      title: row.title || 'Untitled',
      startUtc: row.start_at || new Date().toISOString(),
      endUtc: row.end_at,
      coverUrl: row.cover_url,
      status: row.status,
      channel,
      priceLabel: '',
    }))

  const totalEvents = channels.hightribe.events + channels.luma.events + channels.eventbrite.events

  return {
    channels,
    totalEvents,
    totalTickets: 0,
    totalBookings: 0,
    totalRevenue: 0,
    revenueCurrency: 'USD',
    unifiedAttendees: 0,
    recent,
    recentBookings: [],
    bookingTrend: emptyTrend(),
  }
}
