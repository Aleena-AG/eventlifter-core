'use client'

import { isEventbriteConnected, isHightribeChannelConnected, isLumaConnected } from '@/lib/channel-connection'
import { listAllStoredBookings, listStoredEvents } from '@/lib/channel-events-store'
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

function priceLabel(channel: ChannelKey, payload: Record<string, unknown>): string {
  if (channel === 'hightribe') return 'Hightribe'
  if (channel === 'luma') return 'Luma'
  return payload.is_free ? 'Free' : 'Eventbrite'
}

export async function loadDashboardStats(settings: {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean; oauthConfigured?: boolean }
}): Promise<DashboardStats> {
  const htConfigured = isHightribeChannelConnected()
  const lumaConfigured = isLumaConnected(settings)
  const ebConfigured = isEventbriteConnected(settings)

  const channels: Record<ChannelKey, ChannelStats> = {
    hightribe: { events: 0, tickets: 0, bookings: 0, configured: htConfigured },
    luma: { events: 0, tickets: 0, bookings: 0, configured: lumaConfigured },
    eventbrite: { events: 0, tickets: 0, bookings: 0, configured: ebConfigured },
  }

  const [htRows, lumaRows, ebRows, dbBookings] = await Promise.all([
    htConfigured ? listStoredEvents('hightribe') : Promise.resolve([]),
    lumaConfigured ? listStoredEvents('luma') : Promise.resolve([]),
    ebConfigured ? listStoredEvents('eventbrite') : Promise.resolve([]),
    listAllStoredBookings().catch(() => []),
  ])

  channels.hightribe.events = htRows.length
  channels.luma.events = lumaRows.length
  channels.eventbrite.events = ebRows.length

  const seenEmails = new Set<string>()
  for (const b of dbBookings) {
    channels[b.channel].bookings += 1
    const tickets = b.ticket_count ?? 1
    channels[b.channel].tickets += tickets
    seenEmails.add(b.guest_email.toLowerCase())
  }

  const recent: DashboardRecentEvent[] = []

  for (const row of htRows) {
    recent.push({
      id: row.external_id,
      title: row.title,
      startUtc: row.start_at || new Date().toISOString(),
      channel: 'hightribe',
      priceLabel: 'Hightribe',
    })
  }
  for (const row of lumaRows) {
    recent.push({
      id: row.external_id,
      title: row.title,
      startUtc: row.start_at || new Date().toISOString(),
      channel: 'luma',
      priceLabel: 'Luma',
    })
  }
  for (const row of ebRows) {
    recent.push({
      id: row.external_id,
      title: row.title,
      startUtc: row.start_at || new Date().toISOString(),
      channel: 'eventbrite',
      priceLabel: priceLabel('eventbrite', row.payload),
    })
  }

  recent.sort((a, b) => new Date(b.startUtc).getTime() - new Date(a.startUtc).getTime())

  const recentBookings: DashboardBooking[] = dbBookings.slice(0, 8).map((b) => ({
    name: b.guest_name,
    email: b.guest_email,
    channel: b.channel,
    eventTitle: b.event_title,
    registeredAt: b.registered_at,
  }))

  const totalEvents = channels.hightribe.events + channels.luma.events + channels.eventbrite.events
  const totalTickets = channels.hightribe.tickets + channels.luma.tickets + channels.eventbrite.tickets
  const totalBookings = channels.hightribe.bookings + channels.luma.bookings + channels.eventbrite.bookings

  return {
    channels,
    totalEvents,
    totalTickets,
    totalBookings,
    unifiedAttendees: seenEmails.size,
    recent: recent.slice(0, 5),
    recentBookings,
  }
}
