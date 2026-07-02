'use client'

import { authHeader } from '@/lib/auth'
import { isHightribeChannelConnected } from '@/lib/channel-connection'
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
  const res = await fetch('/api/dashboard/stats', {
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  })
  if (!res.ok) {
    throw new Error('Failed to load dashboard stats')
  }

  const data = await res.json() as {
    channels: Record<ChannelKey, { events: number; bookings: number; tickets: number }>
    totalEvents: number
    totalBookings: number
    totalTickets: number
    unifiedAttendees: number
    recent: DashboardRecentEvent[]
    recentBookings: DashboardBooking[]
  }

  const lumaConfigured = !!(settings.luma?.configured)
  const ebConfigured = !!(
    settings.eventbrite?.configured
    || settings.eventbrite?.hasPrivateToken
    || settings.eventbrite?.oauthConfigured
  )

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
