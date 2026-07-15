'use client'

import { unwrapApiData } from '@/lib/api-response'
import { loadAllBookings, type BookingListItem } from '@/lib/bookings'
import { isHightribeConnected } from '@/lib/channel-connection'
import { listStoredEvents, type StoredChannelEvent } from '@/lib/channel-events-store'
import { listMasterEvents, type MasterEventRecord } from '@/lib/event-registry'
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
  /** true when KPIs were built from bookings/registry (no /dashboard/stats API). */
  derived?: boolean
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

function buildTrendFromBookings(bookings: BookingListItem[]): DashboardBookingTrendPoint[] {
  const points = emptyTrend(7)
  const byDate = new Map(points.map((p) => [p.date, p]))
  for (const b of bookings) {
    const day = String(b.registeredAt || '').slice(0, 10)
    const point = byDate.get(day)
    if (!point) continue
    point.count += 1
    if (b.channel in point.byChannel) {
      point.byChannel[b.channel] += 1
    }
  }
  return points
}

function ticketCountFor(b: BookingListItem): number {
  if (typeof b.ticketCount === 'number' && Number.isFinite(b.ticketCount) && b.ticketCount > 0) {
    return b.ticketCount
  }
  if (Array.isArray(b.tickets) && b.tickets.length) {
    return b.tickets.reduce((s, t) => s + (t.quantity || 1), 0) || 1
  }
  return 1
}

function mapRowsToRecent(
  htRows: StoredChannelEvent[],
  lumaRows: StoredChannelEvent[],
  ebRows: StoredChannelEvent[],
): DashboardRecentEvent[] {
  return [
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
}

/**
 * Build dashboard KPIs from available v1 APIs:
 * - events counts ← GET /api/events/:channel (stored)
 * - bookings / tickets / attendees / trend ← GET /api/events/bookings
 * - sold (prefer) ← GET /api/registry `.sold`
 * Revenue is only summed when booking rows include totalPrice (API does not guarantee revenue).
 */
export async function deriveDashboardStats(settings: {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean }
  hightribe?: { configured?: boolean }
}): Promise<DashboardStats> {
  const lumaConfigured = settings.luma?.configured === true
  const ebConfigured = settings.eventbrite?.configured === true
  const htConfigured = isHightribeConnected(settings)

  const [htRows, lumaRows, ebRows, bookings, masters] = await Promise.all([
    htConfigured ? listStoredEvents('hightribe') : Promise.resolve([] as StoredChannelEvent[]),
    lumaConfigured ? listStoredEvents('luma') : Promise.resolve([] as StoredChannelEvent[]),
    ebConfigured ? listStoredEvents('eventbrite') : Promise.resolve([] as StoredChannelEvent[]),
    loadAllBookings().catch(() => [] as BookingListItem[]),
    listMasterEvents().catch(() => [] as MasterEventRecord[]),
  ])

  const bookingsByChannel: Record<ChannelKey, BookingListItem[]> = {
    hightribe: [],
    luma: [],
    eventbrite: [],
  }
  for (const b of bookings) {
    if (b.channel in bookingsByChannel) bookingsByChannel[b.channel].push(b)
  }

  const registrySold = masters.reduce((s, m) => s + (Number(m.sold) || 0), 0)
  const ticketsFromBookings = bookings.reduce((s, b) => s + ticketCountFor(b), 0)
  // Prefer registry sold when present; otherwise sum booking ticket counts.
  const totalTickets = registrySold > 0 ? registrySold : ticketsFromBookings

  // API has no dedicated revenue field — only use totalPrice when present on bookings.
  let totalRevenue = 0
  const revenueByChannel: Record<ChannelKey, number> = {
    hightribe: 0,
    luma: 0,
    eventbrite: 0,
  }
  for (const b of bookings) {
    const price = typeof b.totalPrice === 'number' && Number.isFinite(b.totalPrice) ? b.totalPrice : 0
    if (price <= 0) continue
    totalRevenue += price
    if (b.channel in revenueByChannel) revenueByChannel[b.channel] += price
  }

  const uniqueEmails = new Set(
    bookings
      .map((b) => b.email.trim().toLowerCase())
      .filter((e) => e && e !== '—'),
  )

  const channelStats = (ch: ChannelKey, rows: StoredChannelEvent[], configured: boolean): ChannelStats => {
    const chBookings = bookingsByChannel[ch]
    const chTickets = chBookings.reduce((s, b) => s + ticketCountFor(b), 0)
    return {
      events: rows.length,
      bookings: chBookings.length,
      tickets: chTickets,
      revenue: revenueByChannel[ch],
      currency: 'USD',
      configured,
    }
  }

  const channels: Record<ChannelKey, ChannelStats> = {
    hightribe: channelStats('hightribe', htRows, htConfigured),
    luma: channelStats('luma', lumaRows, lumaConfigured),
    eventbrite: channelStats('eventbrite', ebRows, ebConfigured),
  }

  const totalEvents =
    channels.hightribe.events + channels.luma.events + channels.eventbrite.events

  const recentBookings: DashboardBooking[] = bookings.slice(0, 20).map((b) => ({
    name: b.name,
    email: b.email,
    channel: b.channel,
    eventTitle: b.eventTitle,
    registeredAt: b.registeredAt,
  }))

  return {
    channels,
    totalEvents,
    totalTickets,
    totalBookings: bookings.length,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    revenueCurrency: 'USD',
    unifiedAttendees: uniqueEmails.size,
    recent: mapRowsToRecent(htRows, lumaRows, ebRows),
    recentBookings,
    bookingTrend: buildTrendFromBookings(bookings),
    derived: true,
  }
}

type DashboardStatsPayload = {
  derived?: boolean
  channels?: Record<ChannelKey, {
    events: number
    bookings: number
    tickets: number
    revenue?: number
    currency?: string
  }>
  totalEvents?: number
  totalBookings?: number
  totalTickets?: number
  totalRevenue?: number
  revenueCurrency?: string
  unifiedAttendees?: number
  recent?: DashboardRecentEvent[]
  recentBookings?: DashboardBooking[]
  bookingTrend?: DashboardBookingTrendPoint[]
}

function mapDashboardStatsPayload(
  raw: unknown,
  settings: {
    luma?: { configured?: boolean }
    eventbrite?: { configured?: boolean; hasPrivateToken?: boolean; oauthConfigured?: boolean }
    hightribe?: { configured?: boolean }
  },
): DashboardStats {
  const data = unwrapApiData<DashboardStatsPayload>(raw)
  const lumaConfigured = settings.luma?.configured === true
  const ebConfigured = settings.eventbrite?.configured === true
  const htConfigured = isHightribeConnected(settings)

  const withChannelDefaults = (ch: ChannelKey, configured: boolean): ChannelStats => ({
    events: data.channels?.[ch]?.events ?? 0,
    bookings: data.channels?.[ch]?.bookings ?? 0,
    tickets: data.channels?.[ch]?.tickets ?? 0,
    revenue: data.channels?.[ch]?.revenue ?? 0,
    currency: data.channels?.[ch]?.currency ?? data.revenueCurrency ?? 'USD',
    configured,
  })

  return {
    channels: {
      hightribe: withChannelDefaults('hightribe', htConfigured),
      luma: withChannelDefaults('luma', lumaConfigured),
      eventbrite: withChannelDefaults('eventbrite', ebConfigured),
    },
    totalEvents: data.totalEvents ?? 0,
    totalTickets: data.totalTickets ?? 0,
    totalBookings: data.totalBookings ?? 0,
    totalRevenue: data.totalRevenue ?? 0,
    revenueCurrency: data.revenueCurrency ?? 'USD',
    unifiedAttendees: data.unifiedAttendees ?? 0,
    recent: data.recent ?? [],
    recentBookings: data.recentBookings ?? [],
    bookingTrend: normalizeTrend(data.bookingTrend),
    derived: data.derived === true,
  }
}

export async function loadDashboardStats(settings: {
  luma?: { configured?: boolean }
  eventbrite?: { configured?: boolean; hasPrivateToken?: boolean; oauthConfigured?: boolean }
  hightribe?: { configured?: boolean }
}): Promise<DashboardStats> {
  try {
    const { channelFetch } = await import('@/lib/channel-fetch')
    const res = await channelFetch('/api/dashboard/stats')

    if (!res.ok) {
      let message = `Dashboard stats failed (${res.status})`
      try {
        const err = await res.json() as { message?: string }
        if (typeof err.message === 'string' && err.message.trim()) {
          message = err.message.trim()
        }
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message)
    }

    const raw = await res.json()
    return mapDashboardStatsPayload(raw, settings)
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error('Dashboard stats failed')
  }
}
