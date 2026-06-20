import { countBookingsByChannel, countUniqueEmails, listBookings } from '@/lib/db/bookings-store'
import { getAllChannelStats, listChannelEvents } from '@/lib/db/events-store'
import { getSyncMeta } from '@/lib/db/index'
import type { DashboardStats } from '@/lib/dashboard-stats'
import type { ChannelKey } from '@/lib/types'

export function buildDashboardFromDb(opts: {
  htConfigured: boolean
  lumaConfigured: boolean
  ebConfigured: boolean
}): DashboardStats & { lastSyncedAt: string | null } {
  const dbStats = getAllChannelStats()
  const bookingCounts = countBookingsByChannel()

  const channels: DashboardStats['channels'] = {
    hightribe: {
      events: dbStats.hightribe?.events ?? 0,
      tickets: dbStats.hightribe?.tickets ?? 0,
      bookings: Math.max(dbStats.hightribe?.bookings ?? 0, bookingCounts.hightribe),
      configured: opts.htConfigured,
    },
    luma: {
      events: dbStats.luma?.events ?? 0,
      tickets: dbStats.luma?.tickets ?? 0,
      bookings: Math.max(dbStats.luma?.bookings ?? 0, bookingCounts.luma),
      configured: opts.lumaConfigured,
    },
    eventbrite: {
      events: dbStats.eventbrite?.events ?? 0,
      tickets: dbStats.eventbrite?.tickets ?? 0,
      bookings: Math.max(dbStats.eventbrite?.bookings ?? 0, bookingCounts.eventbrite),
      configured: opts.ebConfigured,
    },
  }

  const recent: DashboardStats['recent'] = []
  for (const ch of ['hightribe', 'luma', 'eventbrite'] as ChannelKey[]) {
    for (const e of listChannelEvents(ch, 20)) {
      recent.push({
        id: e.externalId,
        title: e.title,
        startUtc: e.startUtc || new Date().toISOString(),
        channel: ch,
        priceLabel: e.priceLabel || ch,
      })
    }
  }
  recent.sort((a, b) => new Date(b.startUtc).getTime() - new Date(a.startUtc).getTime())

  const recentBookings = listBookings(8).map(b => ({
    name: b.name,
    email: b.email,
    channel: b.channel,
    eventTitle: b.eventTitle,
    registeredAt: b.registeredAt,
  }))

  const totalTickets = channels.hightribe.tickets + channels.luma.tickets + channels.eventbrite.tickets
  const totalBookings = channels.hightribe.bookings + channels.luma.bookings + channels.eventbrite.bookings

  return {
    channels,
    totalEvents: channels.hightribe.events + channels.luma.events + channels.eventbrite.events,
    totalTickets,
    totalBookings,
    unifiedAttendees: countUniqueEmails() || totalBookings,
    recent: recent.slice(0, 5),
    recentBookings,
    lastSyncedAt: getSyncMeta('last_sync_at'),
  }
}
