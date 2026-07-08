'use client'

import { authHeader } from '@/lib/auth'
import { isHightribeChannelConnected } from '@/lib/channel-connection'
import { listStoredEvents } from '@/lib/channel-events-store'
import type { ChannelKey } from '@/lib/types'

export interface ChannelStats {
  events: number
  tickets: number
  bookings: number
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
  channel: ChannelKey
  priceLabel: string
}

export interface DashboardStats {
  channels: Record<ChannelKey, ChannelStats>
  totalEvents: number
  totalTickets: number
  totalBookings: number
  unifiedAttendees: number
  recent: DashboardRecentEvent[]
  recentBookings: DashboardBooking[]
}

export async function loadDashboardStats(settings: {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean; oauthConfigured?: boolean }
}): Promise<DashboardStats> {
  const lumaConfigured = !!(settings.luma?.configured)
  const ebConfigured = !!(
    settings.eventbrite?.configured
    || settings.eventbrite?.hasPrivateToken
    || settings.eventbrite?.oauthConfigured
  )

  const res = await fetch('/api/dashboard/stats', {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  })
  if (res.ok) {
    const data = await res.json() as {
      channels: Record<ChannelKey, { events: number; bookings: number; tickets: number }>
      totalEvents: number
      totalBookings: number
      totalTickets: number
      unifiedAttendees: number
      recent: DashboardRecentEvent[]
      recentBookings: DashboardBooking[]
    }

    return {
      channels: {
        hightribe: {
          ...data.channels.hightribe,
          configured: isHightribeChannelConnected(),
        },
        luma: {
          ...data.channels.luma,
          configured: lumaConfigured,
        },
        eventbrite: {
          ...data.channels.eventbrite,
          configured: ebConfigured,
        },
      },
      totalEvents: data.totalEvents,
      totalTickets: data.totalTickets,
      totalBookings: data.totalBookings,
      unifiedAttendees: data.unifiedAttendees,
      recent: data.recent,
      recentBookings: data.recentBookings,
    }
  }

  // Fallback: same event sources as the Events page so counts stay in sync.
  const [htRows, lumaRows, ebRows] = await Promise.all([
    isHightribeChannelConnected() ? listStoredEvents('hightribe') : Promise.resolve([]),
    listStoredEvents('luma'),
    listStoredEvents('eventbrite'),
  ])

  const channels: Record<ChannelKey, ChannelStats> = {
    hightribe: { events: htRows.length, tickets: 0, bookings: 0, configured: isHightribeChannelConnected() },
    luma: { events: lumaRows.length, tickets: 0, bookings: 0, configured: lumaConfigured },
    eventbrite: { events: ebRows.length, tickets: 0, bookings: 0, configured: ebConfigured },
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
    .slice(0, 5)
    .map(({ row, channel }) => ({
      id: row.external_id,
      title: row.title || 'Untitled',
      startUtc: row.start_at || new Date().toISOString(),
      channel,
      priceLabel: '',
    }))

  const totalEvents = channels.hightribe.events + channels.luma.events + channels.eventbrite.events

  return {
    channels,
    totalEvents,
    totalTickets: 0,
    totalBookings: 0,
    unifiedAttendees: 0,
    recent,
    recentBookings: [],
  }
}
